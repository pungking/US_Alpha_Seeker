
import React, { useState, useEffect, useRef } from 'react';
import { AreaChart, Area, ResponsiveContainer } from 'recharts';
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

  const [stats, setStats] = useState<GatheringStats>({
    totalFound: 0,
    processed: 0,
    failed: 0,
    startTime: '-',
    elapsedSeconds: 0,
    estimatedTimeRemaining: 'Ready'
  });

  const [nodeStats, setNodeStats] = useState<NodeContribution[]>([
    { provider: 'Polygon_Node', count: 0, status: 'Idle' },
    { provider: 'Alpaca_Backup', count: 0, status: 'Idle' },
    { provider: 'Merge_Vault', count: 0, status: 'Idle' },
  ]);

  const [performanceData, setPerformanceData] = useState<any[]>([]);
  const [consoleLogs, setConsoleLogs] = useState<string[]>(['> Nexus Omni-Channel Engine Ready.']);
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

    setStats(prev => ({ ...prev, startTime: new Date().toLocaleTimeString(), processed: 0, totalFound: 0, elapsedSeconds: 0 }));
    
    timerRef.current = window.setInterval(() => {
      setStats(prev => ({ ...prev, elapsedSeconds: Math.floor((Date.now() - startTimestamp) / 1000) }));
    }, 1000);

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - (yesterday.getDay() === 1 ? 3 : yesterday.getDay() === 0 ? 2 : 1));
    const dateStr = yesterday.toISOString().split('T')[0];

    // Node 0: Aggregates Sync (Price Mapping)
    try {
      addLog("Harvesting Global OHLCV Data...", "info");
      const res = await fetch(`https://api.polygon.io/v2/aggs/grouped/locale/us/market/stocks/${dateStr}?adjusted=true&apiKey=${keys.polygon}`).then(r => r.json());
      if (res.results) res.results.forEach((r: any) => priceRegistry.set(r.T, r));
    } catch (e) {}

    // Multi-Source Discovery 로직
    const filterTicker = (name: string) => {
      const n = name.toUpperCase();
      return !n.includes("ETF") && !n.includes("INDEX") && !n.includes("TRUST") && !n.includes("FUND");
    };

    // 1. Polygon Node (CS & SP)
    const runPolygon = async () => {
      updateNodeStatus('Polygon_Node', 0, 'Active');
      const types = ['CS', 'SP'];
      for (const type of types) {
        let nextUrl = `https://api.polygon.io/v3/reference/tickers?market=stocks&type=${type}&active=true&limit=1000&apiKey=${keys.polygon}`;
        while (nextUrl && !stopRequested.current) {
          try {
            const res = await fetch(nextUrl).then(r => r.json());
            if (res.results) {
              res.results.forEach((t: any) => {
                if (filterTicker(t.name)) masterRegistry.set(t.ticker, { ...t, source_origin: 'Polygon' });
              });
              updateNodeStatus('Polygon_Node', masterRegistry.size, 'Active');
            }
            nextUrl = res.next_url ? `${res.next_url}&apiKey=${keys.polygon}` : null;
            await new Promise(r => setTimeout(r, 100));
          } catch (e) { break; }
        }
      }
      updateNodeStatus('Polygon_Node', masterRegistry.size, 'Complete');
    };

    // 2. Alpaca Node (Full Market Discovery) - 5000개 제한 우회의 핵심
    const runAlpaca = async () => {
      updateNodeStatus('Alpaca_Backup', 0, 'Active');
      try {
        addLog("Engaging Alpaca Node for Market-Wide Discovery...", "info");
        const res = await fetch(`https://paper-api.alpaca.markets/v2/assets?asset_class=us_equity`, {
          headers: { 'APCA-API-KEY-ID': keys.alpaca || '' }
        }).then(r => r.json());
        
        let alpacaNewCount = 0;
        res.forEach((t: any) => {
          if (t.status === 'active' && t.tradable && filterTicker(t.name)) {
            if (!masterRegistry.has(t.symbol)) {
              masterRegistry.set(t.symbol, {
                ticker: t.symbol,
                name: t.name,
                primary_exchange: t.exchange,
                active: true,
                type: 'CS', // Alpaca assets are primarily equities
                source_origin: 'Alpaca_Sync'
              });
              alpacaNewCount++;
            }
          }
        });
        addLog(`Alpaca Coverage: Added ${alpacaNewCount} Unique Entities.`, "success");
        updateNodeStatus('Alpaca_Backup', alpacaNewCount, 'Complete');
      } catch (e) { updateNodeStatus('Alpaca_Backup', 0, 'Failed'); }
    };

    await runPolygon();
    await runAlpaca();

    const totalFound = masterRegistry.size;
    setStats(prev => ({ ...prev, totalFound }));
    addLog(`Omni-Discovery Final: ${totalFound} Corporate Entities.`, 'success');

    // Merge & Pretty Print Upload
    const finalData = Array.from(masterRegistry.values()).map(item => ({
      ...item,
      last_ohlcv: priceRegistry.get(item.ticker) || null
    }));

    const chunkSize = 1500;
    updateNodeStatus('Merge_Vault', 0, 'Active');

    for (let i = 0; i < finalData.length; i += chunkSize) {
      if (stopRequested.current) break;
      const chunk = finalData.slice(i, i + chunkSize);
      const batchNum = Math.floor(i/chunkSize) + 1;
      const fileName = `STAGE0_UNIVERSE_FINAL_${dateStr}_B${batchNum}.json`;
      
      const payload = {
        source: "Nexus_Aggregated_Node",
        batch_timestamp: new Date().toISOString(),
        target_stage: "Stage0_Universe_Full",
        count: chunk.length,
        total_registry_count: totalFound,
        data: chunk
      };

      const success = await uploadToDrive(token, targetId, fileName, payload);
      if (success) {
        setStats(prev => ({ ...prev, processed: i + chunk.length }));
        updateNodeStatus('Merge_Vault', i + chunk.length, 'Active');
        addLog(`Vault_Commit: ${fileName} (Formatted)`, 'info');
      }
      await new Promise(r => setTimeout(r, 200));
    }

    if (timerRef.current) clearInterval(timerRef.current);
    setIsEngineRunning(false);
    updateNodeStatus('Merge_Vault', totalFound, 'Complete');
    addLog("Matrix Cycle Complete. Pretty JSON Saved.", 'success');
  };

  const uploadToDrive = async (token: string, folderId: string, name: string, content: any) => {
    const metadata = { name, parents: [folderId], mimeType: 'application/json' };
    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    // 줄바꿈(space=2)을 적용하여 시인성 확보
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
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-10 gap-6">
            <div>
              <h2 className="text-3xl font-black text-white italic tracking-tighter uppercase flex items-center">
                <span className="bg-indigo-600 w-2 h-8 mr-4 rounded-full animate-pulse"></span>
                Omni_Nexus Matrix v1.2
              </h2>
              <div className="flex items-center space-x-3 mt-2 ml-6">
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-[0.4em]">Node Cluster: Polygon + Alpaca</p>
                <span className="text-[8px] px-2 py-0.5 bg-indigo-500/10 text-indigo-400 rounded-md font-black border border-indigo-500/20 uppercase">Pretty_JSON_Sync</span>
              </div>
            </div>
            <button onClick={startGathering} className={`px-12 py-5 rounded-2xl text-xs font-black uppercase tracking-widest shadow-2xl transition-all ${isEngineRunning ? 'bg-red-600 shadow-red-900/40 animate-pulse' : 'bg-indigo-600 shadow-indigo-900/40 hover:scale-105 active:scale-95'}`}>
              {isEngineRunning ? 'Abort Matrix' : 'Engage Omni-Drive'}
            </button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
            {[
              { l: 'Full Corporate Universe', v: stats.totalFound.toLocaleString(), c: 'text-white' },
              { l: 'Vault Sync (Pretty)', v: stats.processed.toLocaleString(), c: 'text-indigo-400' },
              { l: 'Process Time', v: `${Math.floor(stats.elapsedSeconds/60)}m ${stats.elapsedSeconds%60}s`, c: 'text-slate-400' },
              { l: 'Integrity', v: stats.totalFound > 0 ? `${((stats.processed/stats.totalFound)*100).toFixed(1)}%` : '0%', c: 'text-emerald-400' }
            ].map((s, i) => (
              <div key={i} className="bg-black/40 p-6 rounded-3xl border border-white/5">
                <p className="text-[8px] font-black text-slate-600 uppercase mb-2 tracking-widest">{s.l}</p>
                <p className={`text-xl font-mono font-black italic ${s.c}`}>{s.v}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-3 gap-3 mb-10">
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

          <div className="h-2 bg-black rounded-full overflow-hidden border border-white/5">
             <div className="h-full bg-gradient-to-r from-indigo-700 via-purple-500 to-emerald-400 transition-all duration-1000 shadow-[0_0_15px_rgba(99,102,241,0.5)]" style={{ width: `${stats.totalFound > 0 ? (stats.processed / stats.totalFound) * 100 : 0}%` }}></div>
          </div>
        </div>
      </div>

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
            <div className="mt-6">
               <button onClick={() => window.open(`https://drive.google.com/drive/folders/${GOOGLE_DRIVE_TARGET.rootFolderId}`, '_blank')} className="w-full py-4 bg-white text-black rounded-2xl text-[9px] font-black uppercase tracking-widest hover:bg-indigo-600 hover:text-white transition-all shadow-xl">Verify Vault</button>
            </div>
         </div>
      </div>
    </div>
  );
};

export default UniverseGathering;
