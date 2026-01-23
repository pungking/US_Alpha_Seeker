
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
    discoveryTotal: 11000, // US Market CS+SP 예상 총량
    vaultProcessed: 0,
    startTime: '-',
    elapsedSeconds: 0,
    remainingSeconds: 0,
    isDiscoveryComplete: false
  });

  const [nodeStats, setNodeStats] = useState<NodeContribution[]>([
    { provider: 'Polygon_CS_Node', count: 0, status: 'Idle' },
    { provider: 'Polygon_SP_Node', count: 0, status: 'Idle' },
    { provider: 'Cloud_Vault_Sync', count: 0, status: 'Idle' },
  ]);

  const [consoleLogs, setConsoleLogs] = useState<string[]>(['> Matrix Infrastructure Ready. Target: CS(Common) & SP(Specialized).']);
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
    if (!targetId) { addLog("Cloud Vault Access Denied", "error"); return; }

    setIsEngineRunning(true);
    stopRequested.current = false;
    const startTimestamp = Date.now();
    const masterRegistry = new Map<string, any>();

    setExtendedStats({
      discoveryFound: 0,
      discoveryTotal: 11000,
      vaultProcessed: 0,
      startTime: new Date().toLocaleTimeString(),
      elapsedSeconds: 0,
      remainingSeconds: 0,
      isDiscoveryComplete: false
    });
    
    timerRef.current = window.setInterval(() => {
      setExtendedStats(prev => {
        const elapsed = Math.floor((Date.now() - startTimestamp) / 1000);
        let remaining = 0;
        if (prev.vaultProcessed > 0 && elapsed > 2) {
            const speed = prev.vaultProcessed / elapsed; // items per second
            const totalToProcess = prev.isDiscoveryComplete ? prev.discoveryFound : prev.discoveryTotal;
            remaining = Math.max(0, Math.round((totalToProcess - prev.vaultProcessed) / speed));
        }
        return { ...prev, elapsedSeconds: elapsed, remainingSeconds: remaining };
      });
    }, 1000);

    addLog("ENGAGING DISCOVERY: Targeting CS(Common) & SP(Specialized)", "info");

    const fetchByType = async (type: string, nodeName: string) => {
      updateNodeStatus(nodeName, 0, 'Active');
      let nextUrl = `https://api.polygon.io/v3/reference/tickers?type=${type}&market=stocks&active=true&limit=1000&apiKey=${keys.polygon}`;
      let localCount = 0;

      while (nextUrl && !stopRequested.current) {
        try {
          const res = await fetch(nextUrl).then(r => r.json());
          if (res.results) {
            res.results.forEach((t: any) => {
              if (!masterRegistry.has(t.ticker)) {
                masterRegistry.set(t.ticker, { ...t, source_node: nodeName });
                localCount++;
              }
            });
            const currentTotal = masterRegistry.size;
            setExtendedStats(prev => ({ ...prev, discoveryFound: currentTotal }));
            updateNodeStatus(nodeName, localCount, 'Active');
            addLog(`Node [${nodeName}] found ${localCount} symbols...`, "info");
          }
          nextUrl = res.next_url ? `${res.next_url}&apiKey=${keys.polygon}` : null;
          await new Promise(r => setTimeout(r, 100)); // Rate-limit safety
        } catch (e) {
          addLog(`Node [${nodeName}] Error: ${e}`, "error");
          break;
        }
      }
      updateNodeStatus(nodeName, localCount, 'Complete');
    };

    // Parallel Discovery for CS and SP
    await Promise.all([
      fetchByType('CS', 'Polygon_CS_Node'),
      fetchByType('SP', 'Polygon_SP_Node')
    ]);

    setExtendedStats(prev => ({ ...prev, isDiscoveryComplete: true }));
    addLog(`Discovery Phase Concluded. Total Unique Tickers: ${masterRegistry.size}`, "success");

    // Phase 2: Sync to Google Drive
    addLog("COMMITTING TO VAULT: Parallel Chunk Upload Enabled", "info");
    const finalData = Array.from(masterRegistry.values());
    const chunkSize = 1000;
    const dateStr = new Date().toISOString().split('T')[0];
    updateNodeStatus('Cloud_Vault_Sync', 0, 'Active');

    for (let i = 0; i < finalData.length; i += chunkSize) {
      if (stopRequested.current) break;
      const chunk = finalData.slice(i, i + chunkSize);
      const batchNum = Math.floor(i/chunkSize) + 1;
      const fileName = `STAGE0_UNIVERSE_${dateStr}_B${batchNum}.json`;
      
      const payload = {
        meta: {
          origin: "Omni_Nexus_v1.4",
          type: "CS_SP_UNIVERSE",
          timestamp: new Date().toISOString(),
          batch: batchNum,
          total_items: finalData.length
        },
        data: chunk
      };

      const success = await uploadToDrive(token, targetId, fileName, payload);
      if (success) {
        setExtendedStats(prev => ({ ...prev, vaultProcessed: i + chunk.length }));
        updateNodeStatus('Cloud_Vault_Sync', i + chunk.length, 'Active');
        addLog(`Vault Synchronized: ${fileName}`, "success");
      }
      await new Promise(r => setTimeout(r, 200));
    }

    if (timerRef.current) clearInterval(timerRef.current);
    setIsEngineRunning(false);
    updateNodeStatus('Cloud_Vault_Sync', finalData.length, 'Complete');
    addLog("Pipeline Extraction Complete. Readiness for Stage 1: 100%", "success");
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
        <div className="glass-panel p-8 md:p-10 rounded-[40px] border-t-2 border-t-blue-500 shadow-2xl relative overflow-hidden bg-slate-900/40">
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-10 gap-6">
            <div>
              <h2 className="text-3xl font-black text-white italic tracking-tighter uppercase flex items-center">
                <span className="bg-blue-600 w-2 h-8 mr-4 rounded-full animate-pulse"></span>
                Omni_Nexus Matrix v1.4
              </h2>
              <div className="flex items-center space-x-3 mt-2 ml-6">
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-[0.4em]">Node Protocol: CS/SP Core Extraction</p>
                <span className="text-[8px] px-2 py-0.5 bg-blue-500/10 text-blue-400 rounded-md font-black border border-blue-500/20 uppercase">Stage_0_Stable</span>
              </div>
            </div>
            <button onClick={startGathering} className={`px-12 py-5 rounded-2xl text-xs font-black uppercase tracking-widest shadow-2xl transition-all ${isEngineRunning ? 'bg-red-600 shadow-red-900/40' : 'bg-blue-600 shadow-blue-900/40 hover:scale-105'}`}>
              {isEngineRunning ? 'Abort Protocol' : 'Engage Discovery'}
            </button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
            {[
              { l: 'Discovered (CS/SP)', v: extendedStats.discoveryFound.toLocaleString(), c: 'text-white' },
              { l: 'Vault Committed', v: extendedStats.vaultProcessed.toLocaleString(), c: 'text-blue-400' },
              { l: 'Elapsed Cycle', v: formatTime(extendedStats.elapsedSeconds), c: 'text-slate-400' },
              { l: 'Est. Remaining', v: formatTime(extendedStats.remainingSeconds), c: 'text-emerald-400' }
            ].map((s, i) => (
              <div key={i} className="bg-black/40 p-6 rounded-3xl border border-white/5">
                <p className="text-[8px] font-black text-slate-600 uppercase mb-2 tracking-widest">{s.l}</p>
                <p className={`text-xl font-mono font-black italic ${s.c}`}>{s.v}</p>
              </div>
            ))}
          </div>

          <div className="space-y-8 mb-10">
             <div className="space-y-2">
                <div className="flex justify-between items-end px-1">
                   <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Track_01: Market Discovery (Target ~11k)</p>
                   <p className="text-[10px] font-mono font-bold text-white">{Math.min(100, (extendedStats.discoveryFound / extendedStats.discoveryTotal) * 100).toFixed(1)}%</p>
                </div>
                <div className="h-2.5 bg-black/50 rounded-full overflow-hidden border border-white/5">
                   <div 
                      className="h-full bg-gradient-to-r from-blue-700 to-indigo-500 transition-all duration-700 shadow-[0_0_15px_rgba(59,130,246,0.5)]" 
                      style={{ width: `${Math.min(100, (extendedStats.discoveryFound / extendedStats.discoveryTotal) * 100)}%` }}
                   ></div>
                </div>
             </div>

             <div className="space-y-2">
                <div className="flex justify-between items-end px-1">
                   <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Track_02: Cloud Vault Synchronization</p>
                   <p className="text-[10px] font-mono font-bold text-blue-400">{extendedStats.discoveryFound > 0 ? ((extendedStats.vaultProcessed / extendedStats.discoveryFound) * 100).toFixed(1) : '0.0'}%</p>
                </div>
                <div className="h-2.5 bg-black/50 rounded-full overflow-hidden border border-white/5">
                   <div 
                      className="h-full bg-gradient-to-r from-blue-600 to-emerald-500 transition-all duration-700 shadow-[0_0_15px_rgba(16,185,129,0.5)]" 
                      style={{ width: `${extendedStats.discoveryFound > 0 ? (extendedStats.vaultProcessed / extendedStats.discoveryFound) * 100 : 0}%` }}
                   ></div>
                </div>
             </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            {nodeStats.map((node, i) => (
              <div key={i} className="bg-slate-900/60 p-4 rounded-2xl border border-white/5 flex flex-col items-center">
                 <p className="text-[7px] font-black text-slate-500 uppercase mb-1">{node.provider}</p>
                 <p className="text-xs font-mono font-bold text-blue-400">{node.count.toLocaleString()}</p>
                 <div className={`mt-2 px-2 py-0.5 rounded text-[6px] font-black uppercase ${node.status === 'Active' ? 'bg-blue-500/20 text-blue-400 animate-pulse' : node.status === 'Complete' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-600'}`}>
                    {node.status}
                 </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-6">
         <div className="glass-panel p-6 rounded-[40px] bg-slate-950 border-l-4 border-l-blue-600 h-[600px] flex flex-col shadow-2xl">
            <h3 className="font-black text-white text-xs uppercase tracking-[0.3em] mb-6 italic flex items-center">
              <span className="w-1.5 h-1.5 bg-blue-500 rounded-full mr-3 animate-ping"></span>
              Matrix Terminal
            </h3>
            <div ref={logContainerRef} className="flex-1 bg-black/50 p-6 rounded-3xl font-mono text-[9px] text-blue-400/70 overflow-y-auto no-scrollbar space-y-2.5 border border-white/5 leading-relaxed">
               {consoleLogs.map((log, i) => (
                 <div key={i} className={`pl-3 border-l ${log.includes('[ERR]') ? 'border-red-500 text-red-400' : log.includes('[SCAN]') ? 'border-amber-500 text-amber-400' : log.includes('[OK]') ? 'border-emerald-500 text-emerald-400' : 'border-blue-900'}`}>
                    {log}
                 </div>
               ))}
            </div>
            <div className="mt-6 flex flex-col gap-3">
               <button onClick={() => window.open(`https://drive.google.com/drive/folders/${GOOGLE_DRIVE_TARGET.rootFolderId}`, '_blank')} className="w-full py-4 bg-white text-black rounded-2xl text-[9px] font-black uppercase tracking-widest hover:bg-blue-600 hover:text-white transition-all shadow-xl">Audit Cloud Vault</button>
               <div className="p-4 bg-blue-500/10 rounded-2xl border border-blue-500/20">
                  <p className="text-[7px] text-blue-400 font-black uppercase mb-1">Node Integrity</p>
                  <p className="text-[9px] text-white font-bold italic">CS/SP Universe Synchronized</p>
               </div>
            </div>
         </div>
      </div>
    </div>
  );
};

export default UniverseGathering;
