
import React, { useState, useEffect, useRef } from 'react';
import { GatheringStats, ApiProvider } from '../types';
import { GOOGLE_DRIVE_TARGET, API_CONFIGS } from '../constants';

declare global {
  interface Window {
    google: any;
  }
}

interface Props {
  onAuthSuccess?: (status: boolean) => void;
}

interface NodeContribution {
  provider: string;
  count: number;
  status: 'Active' | 'Complete' | 'Failed' | 'Idle';
}

const UniverseGathering: React.FC<Props> = ({ onAuthSuccess }) => {
  const [isEngineRunning, setIsEngineRunning] = useState(false);
  const [clientId, setClientId] = useState<string>(() => localStorage.getItem('gdrive_client_id') || '');
  const [accessToken, setAccessToken] = useState<string | null>(sessionStorage.getItem('gdrive_access_token'));
  
  const keys = {
    polygon: API_CONFIGS.find(c => c.provider === ApiProvider.POLYGON)?.key,
    alpaca: API_CONFIGS.find(c => c.provider === ApiProvider.ALPACA)?.key,
  };

  // 상세 통계를 위한 확장 상태
  const [extendedStats, setExtendedStats] = useState({
    discoveryFound: 0,
    discoveryTotal: 12000, // 추정 총량 (진행률 표시용)
    vaultProcessed: 0,
    startTime: '-',
    elapsedSeconds: 0,
    remainingSeconds: 0,
    isDiscoveryComplete: false
  });

  const [nodeStats, setNodeStats] = useState<NodeContribution[]>([
    { provider: 'Polygon_Discovery', count: 0, status: 'Idle' },
    { provider: 'Alpaca_Validator', count: 0, status: 'Idle' },
    { provider: 'Cloud_Vault_Sync', count: 0, status: 'Idle' },
  ]);

  const [consoleLogs, setConsoleLogs] = useState<string[]>(['> Matrix Infrastructure Ready for Stage 1 Transition.']);
  const logContainerRef = useRef<HTMLDivElement>(null);
  const stopRequested = useRef(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (logContainerRef.current) logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
  }, [consoleLogs]);

  const addLog = (msg: string, type: 'info' | 'warn' | 'error' | 'success' = 'info') => {
    const prefixes = { info: '>', warn: '[SCAN]', error: '[ERR]', success: '[OK]' };
    setConsoleLogs(prev => [...prev, `${prefixes[type]} ${msg}`].slice(-50));
  };

  const updateNodeStatus = (provider: string, count: number, status: 'Active' | 'Complete' | 'Failed') => {
    setNodeStats(prev => prev.map(n => n.provider === provider ? { ...n, count, status } : n));
  };

  const formatTime = (seconds: number) => {
    if (seconds <= 0) return '00:00:00';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return [h, m, s].map(v => v.toString().padStart(2, '0')).join(':');
  };

  const ensureStage0Folder = async (token: string) => {
    const query = encodeURIComponent(`name = '${GOOGLE_DRIVE_TARGET.targetSubFolder}' and '${GOOGLE_DRIVE_TARGET.rootFolderId}' in parents and trashed = false`);
    try {
      const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id, name)`, {
        headers: { 'Authorization': `Bearer ${token}` }
      }).then(r => r.json());
      if (res.files && res.files.length > 0) return res.files[0].id;
      const createRes = await fetch(`https://www.googleapis.com/drive/v3/files`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: GOOGLE_DRIVE_TARGET.targetSubFolder,
          parents: [GOOGLE_DRIVE_TARGET.rootFolderId],
          mimeType: 'application/folder'
        })
      }).then(r => r.json());
      return createRes.id;
    } catch (e) { return null; }
  };

  const startGathering = async () => {
    if (isEngineRunning) { stopRequested.current = true; return; }
    let token = accessToken;
    if (!token) {
        const client = window.google.accounts.oauth2.initTokenClient({
          client_id: clientId.trim(),
          scope: 'https://www.googleapis.com/auth/drive.file',
          callback: async (res: any) => {
            if (res.access_token) {
              setAccessToken(res.access_token);
              sessionStorage.setItem('gdrive_access_token', res.access_token);
              executeEngine(res.access_token);
            }
          },
        });
        client.requestAccessToken({ prompt: 'consent' });
        return;
    }
    executeEngine(token);
  };

  const executeEngine = async (token: string) => {
    const targetId = await ensureStage0Folder(token);
    if (!targetId) { addLog("Cloud Vault Sync Failed", "error"); return; }

    setIsEngineRunning(true);
    stopRequested.current = false;
    const startTimestamp = Date.now();
    const masterRegistry = new Map<string, any>();
    const priceRegistry = new Map<string, any>();

    setExtendedStats({
      discoveryFound: 0,
      discoveryTotal: 12000,
      vaultProcessed: 0,
      startTime: new Date().toLocaleTimeString(),
      elapsedSeconds: 0,
      remainingSeconds: 0,
      isDiscoveryComplete: false
    });
    
    timerRef.current = window.setInterval(() => {
      setExtendedStats(prev => {
        const elapsed = Math.floor((Date.now() - startTimestamp) / 1000);
        // 업로드 진행률 기반 남은 시간 계산
        let remaining = 0;
        if (prev.vaultProcessed > 0 && prev.discoveryFound > 0) {
            const speed = prev.vaultProcessed / elapsed; // items per second
            remaining = Math.round((prev.discoveryFound - prev.vaultProcessed) / speed);
        }
        return { ...prev, elapsedSeconds: elapsed, remainingSeconds: remaining };
      });
    }, 1000);

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - (yesterday.getDay() === 1 ? 3 : yesterday.getDay() === 0 ? 2 : 1));
    const dateStr = yesterday.toISOString().split('T')[0];

    addLog("PHASE 1: Global Market Discovery Initiated", "info");

    // Filter Logic
    const filterTicker = (ticker: any) => {
      const n = (ticker.name || "").toUpperCase();
      const t = (ticker.ticker || "").toUpperCase();
      // ETF, INDEX, TRUST, FUND 등을 제거하되, 보통 전종목 수집시는 최대한 가져온 후 스테이지1에서 정교하게 거릅니다.
      return !n.includes("ETF") && !n.includes("INDEX") && !n.includes("TRUST") && !n.includes("FUND");
    };

    // 1. Polygon Node (Full Market Loop) - 5000개 제한 돌파를 위해 type 제거
    const runPolygon = async () => {
      updateNodeStatus('Polygon_Discovery', 0, 'Active');
      // type 파라미터를 제거하여 모든 종목(CS, ADR, ETF 등)을 일단 다 가져옵니다.
      let nextUrl = `https://api.polygon.io/v3/reference/tickers?market=stocks&active=true&limit=1000&apiKey=${keys.polygon}`;
      
      while (nextUrl && !stopRequested.current) {
        try {
          const res = await fetch(nextUrl).then(r => r.json());
          if (res.results) {
            res.results.forEach((t: any) => {
              if (filterTicker(t)) masterRegistry.set(t.ticker, { ...t, source_origin: 'Polygon' });
            });
            const currentSize = masterRegistry.size;
            setExtendedStats(prev => ({ ...prev, discoveryFound: currentSize }));
            updateNodeStatus('Polygon_Discovery', currentSize, 'Active');
          }
          nextUrl = res.next_url ? `${res.next_url}&apiKey=${keys.polygon}` : null;
          // Rate limit 우회
          await new Promise(r => setTimeout(r, 150));
        } catch (e) { 
          addLog(`Polygon Node Error: ${e}`, "error");
          break; 
        }
      }
      updateNodeStatus('Polygon_Discovery', masterRegistry.size, 'Complete');
    };

    // 2. Alpaca Node (Verification Sync)
    const runAlpaca = async () => {
      updateNodeStatus('Alpaca_Validator', 0, 'Active');
      try {
        const res = await fetch(`https://paper-api.alpaca.markets/v2/assets?asset_class=us_equity`, {
          headers: { 'APCA-API-KEY-ID': keys.alpaca || '' }
        }).then(r => r.json());
        
        let newCount = 0;
        res.forEach((t: any) => {
          if (t.status === 'active' && t.tradable && filterTicker(t)) {
            if (!masterRegistry.has(t.symbol)) {
              masterRegistry.set(t.symbol, {
                ticker: t.symbol,
                name: t.name,
                primary_exchange: t.exchange,
                active: true,
                type: 'CS',
                source_origin: 'Alpaca_Validator'
              });
              newCount++;
            }
          }
        });
        setExtendedStats(prev => ({ ...prev, discoveryFound: masterRegistry.size }));
        updateNodeStatus('Alpaca_Validator', newCount, 'Complete');
        addLog(`Alpaca Validator: Discovered ${newCount} additional tickers.`, "success");
      } catch (e) { updateNodeStatus('Alpaca_Validator', 0, 'Failed'); }
    };

    // Discover & Map Prices
    await runPolygon();
    await runAlpaca();
    setExtendedStats(prev => ({ ...prev, isDiscoveryComplete: true }));
    addLog(`Discovery Phase Complete. Total Registry: ${masterRegistry.size}`, "success");

    // PHASE 2: Cloud Vault Synchronization
    addLog("PHASE 2: Vault Commit Cycle Started", "info");
    const finalData = Array.from(masterRegistry.values());
    const chunkSize = 1500;
    updateNodeStatus('Cloud_Vault_Sync', 0, 'Active');

    for (let i = 0; i < finalData.length; i += chunkSize) {
      if (stopRequested.current) break;
      const chunk = finalData.slice(i, i + chunkSize);
      const batchNum = Math.floor(i/chunkSize) + 1;
      const fileName = `STAGE0_FULL_UNIVERSE_${dateStr}_B${batchNum}.json`;
      
      const payload = {
        meta: {
          node: "Omni_Nexus_Alpha",
          timestamp: new Date().toISOString(),
          batch: batchNum,
          total_batches: Math.ceil(finalData.length / chunkSize)
        },
        data: chunk
      };

      const success = await uploadToDrive(token, targetId, fileName, payload);
      if (success) {
        setExtendedStats(prev => ({ ...prev, vaultProcessed: i + chunk.length }));
        updateNodeStatus('Cloud_Vault_Sync', i + chunk.length, 'Active');
        addLog(`Vault Committed: ${fileName} (${chunk.length} items)`, "info");
      }
      await new Promise(r => setTimeout(r, 300));
    }

    if (timerRef.current) clearInterval(timerRef.current);
    setIsEngineRunning(false);
    updateNodeStatus('Cloud_Vault_Sync', finalData.length, 'Complete');
    addLog("All Nodes Synchronized. Ready for Stage 1 Filter.", "success");
  };

  const uploadToDrive = async (token: string, folderId: string, name: string, content: any) => {
    const metadata = { name, parents: [folderId], mimeType: 'application/json' };
    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', new Blob([JSON.stringify(content, null, 2)], { type: 'application/json' }));
    try {
      const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: form
      });
      return res.ok;
    } catch (e) { return false; }
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
      <div className="xl:col-span-3 space-y-6">
        <div className="glass-panel p-8 md:p-10 rounded-[40px] border-t-2 border-t-indigo-500 shadow-2xl relative overflow-hidden bg-slate-900/40">
          {/* Header */}
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-10 gap-6">
            <div>
              <h2 className="text-3xl font-black text-white italic tracking-tighter uppercase flex items-center">
                <span className="bg-indigo-600 w-2 h-8 mr-4 rounded-full animate-pulse"></span>
                Omni_Nexus Matrix v1.3
              </h2>
              <div className="flex items-center space-x-3 mt-2 ml-6">
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-[0.4em]">Node Cluster: Full Universe Capture</p>
                <span className="text-[8px] px-2 py-0.5 bg-emerald-500/10 text-emerald-400 rounded-md font-black border border-emerald-500/20 uppercase">Pretty_JSON_v2</span>
              </div>
            </div>
            <button onClick={startGathering} className={`px-12 py-5 rounded-2xl text-xs font-black uppercase tracking-widest shadow-2xl transition-all ${isEngineRunning ? 'bg-red-600 shadow-red-900/40 animate-pulse' : 'bg-indigo-600 shadow-indigo-900/40 hover:scale-105 active:scale-95'}`}>
              {isEngineRunning ? 'Abort Protocol' : 'Engage Discovery'}
            </button>
          </div>

          {/* Detailed Stats Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
            {[
              { l: 'Discovered Tickers', v: extendedStats.discoveryFound.toLocaleString(), c: 'text-white' },
              { l: 'Vault Synchronized', v: extendedStats.vaultProcessed.toLocaleString(), c: 'text-indigo-400' },
              { l: 'Elapsed Time', v: formatTime(extendedStats.elapsedSeconds), c: 'text-slate-400' },
              { l: 'Remaining Time', v: formatTime(extendedStats.remainingSeconds), c: 'text-emerald-400' }
            ].map((s, i) => (
              <div key={i} className="bg-black/40 p-6 rounded-3xl border border-white/5">
                <p className="text-[8px] font-black text-slate-600 uppercase mb-2 tracking-widest">{s.l}</p>
                <p className={`text-xl font-mono font-black italic ${s.c}`}>{s.v}</p>
              </div>
            ))}
          </div>

          {/* Dual Progress Bars */}
          <div className="space-y-8 mb-10">
             {/* Track 1: Discovery */}
             <div className="space-y-2">
                <div className="flex justify-between items-end px-1">
                   <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Track_01: Market Discovery</p>
                   <p className="text-[10px] font-mono font-bold text-white">{Math.min(100, (extendedStats.discoveryFound / extendedStats.discoveryTotal) * 100).toFixed(1)}%</p>
                </div>
                <div className="h-2.5 bg-black/50 rounded-full overflow-hidden border border-white/5 relative">
                   <div 
                      className="h-full bg-gradient-to-r from-blue-700 to-indigo-500 transition-all duration-700 shadow-[0_0_15px_rgba(79,70,229,0.4)]" 
                      style={{ width: `${Math.min(100, (extendedStats.discoveryFound / extendedStats.discoveryTotal) * 100)}%` }}
                   ></div>
                </div>
             </div>

             {/* Track 2: Vault Sync */}
             <div className="space-y-2">
                <div className="flex justify-between items-end px-1">
                   <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Track_02: Cloud Vault Commit</p>
                   <p className="text-[10px] font-mono font-bold text-indigo-400">{extendedStats.discoveryFound > 0 ? ((extendedStats.vaultProcessed / extendedStats.discoveryFound) * 100).toFixed(1) : '0.0'}%</p>
                </div>
                <div className="h-2.5 bg-black/50 rounded-full overflow-hidden border border-white/5 relative">
                   <div 
                      className="h-full bg-gradient-to-r from-indigo-700 to-emerald-500 transition-all duration-700 shadow-[0_0_15px_rgba(16,185,129,0.4)]" 
                      style={{ width: `${extendedStats.discoveryFound > 0 ? (extendedStats.vaultProcessed / extendedStats.discoveryFound) * 100 : 0}%` }}
                   ></div>
                </div>
             </div>
          </div>

          {/* Node Cluster Detailed View */}
          <div className="grid grid-cols-3 gap-3">
            {nodeStats.map((node, i) => (
              <div key={i} className="bg-slate-900/60 p-4 rounded-2xl border border-white/5 flex flex-col items-center">
                 <p className="text-[7px] font-black text-slate-500 uppercase mb-1">{node.provider}</p>
                 <p className="text-xs font-mono font-bold text-indigo-400">{node.count.toLocaleString()}</p>
                 <div className={`mt-2 px-2 py-0.5 rounded text-[6px] font-black uppercase ${node.status === 'Active' ? 'bg-indigo-500/20 text-indigo-400 animate-pulse' : node.status === 'Complete' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-600'}`}>
                    {node.status}
                 </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Terminal View */}
      <div className="space-y-6">
         <div className="glass-panel p-6 rounded-[40px] bg-slate-950 border-l-4 border-l-indigo-600 h-[600px] flex flex-col shadow-2xl">
            <h3 className="font-black text-white text-xs uppercase tracking-[0.3em] mb-6 italic flex items-center">
              <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full mr-3 animate-ping"></span>
              Matrix Terminal
            </h3>
            <div ref={logContainerRef} className="flex-1 bg-black/50 p-6 rounded-3xl font-mono text-[9px] text-indigo-400/70 overflow-y-auto no-scrollbar space-y-2.5 border border-white/5 leading-relaxed">
               {consoleLogs.map((log, i) => (
                 <div key={i} className={`pl-3 border-l ${log.includes('[ERR]') ? 'border-red-500 text-red-400' : log.includes('[SCAN]') ? 'border-amber-500 text-amber-400' : log.includes('[OK]') ? 'border-emerald-500 text-emerald-400' : 'border-indigo-900'}`}>
                    {log}
                 </div>
               ))}
            </div>
            <div className="mt-6 flex flex-col gap-3">
               <button onClick={() => window.open(`https://drive.google.com/drive/folders/${GOOGLE_DRIVE_TARGET.rootFolderId}`, '_blank')} className="w-full py-4 bg-white text-black rounded-2xl text-[9px] font-black uppercase tracking-widest hover:bg-indigo-600 hover:text-white transition-all shadow-xl">Verify Cloud Vault</button>
               <div className="p-4 bg-indigo-500/10 rounded-2xl border border-indigo-500/20">
                  <p className="text-[7px] text-indigo-400 font-black uppercase mb-1">Infrastructure Readiness</p>
                  <p className="text-[9px] text-white font-bold italic">Stable for Stage 1 Transition</p>
               </div>
            </div>
         </div>
      </div>
    </div>
  );
};

export default UniverseGathering;
