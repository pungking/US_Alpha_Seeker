
import React, { useState, useEffect, useRef } from 'react';
import { AreaChart, Area, ResponsiveContainer } from 'recharts';
import { GatheringStats, ApiProvider } from '../types';
import { GOOGLE_DRIVE_TARGET, API_CONFIGS } from '../constants';

// Declare google property on window for Google Identity Services (GIS)
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
  const [showSettings, setShowSettings] = useState(!localStorage.getItem('gdrive_client_id'));
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
  
  const keys = {
    polygon: API_CONFIGS.find(c => c.provider === ApiProvider.POLYGON)?.key,
    alpaca: API_CONFIGS.find(c => c.provider === ApiProvider.ALPACA)?.key,
    finnhub: API_CONFIGS.find(c => c.provider === ApiProvider.FINNHUB)?.key,
    twelve: API_CONFIGS.find(c => c.provider === ApiProvider.TWELVE_DATA)?.key,
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
    { provider: 'Polygon', count: 0, status: 'Idle' },
    { provider: 'Alpaca', count: 0, status: 'Idle' },
    { provider: 'Finnhub', count: 0, status: 'Idle' },
    { provider: 'TwelveData', count: 0, status: 'Idle' },
  ]);

  const [performanceData, setPerformanceData] = useState<any[]>([]);
  const [consoleLogs, setConsoleLogs] = useState<string[]>(['> Nexus Pipeline Stabilized.']);
  const logContainerRef = useRef<HTMLDivElement>(null);
  const stopRequested = useRef(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (logContainerRef.current) logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
  }, [consoleLogs]);

  const addLog = (msg: string, type: 'info' | 'warn' | 'error' | 'success' = 'info') => {
    const prefixes = { info: '>', warn: '[BYPASS]', error: '[ERR]', success: '[OK]' };
    setConsoleLogs(prev => [...prev, `${prefixes[type]} ${msg}`].slice(-50));
  };

  const updateNodeStatus = (provider: string, count: number, status: 'Active' | 'Complete' | 'Failed') => {
    setNodeStats(prev => prev.map(n => n.provider === provider ? { ...n, count, status } : n));
  };

  // Stage0_Universe_Data 폴더를 찾거나 생성하는 함수
  const ensureStage0Folder = async (token: string) => {
    addLog(`Searching for Vault: ${GOOGLE_DRIVE_TARGET.targetSubFolder}...`, 'info');
    const query = encodeURIComponent(`name = '${GOOGLE_DRIVE_TARGET.targetSubFolder}' and '${GOOGLE_DRIVE_TARGET.rootFolderId}' in parents and trashed = false`);
    try {
      const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id, name)`, {
        headers: { 'Authorization': `Bearer ${token}` }
      }).then(r => r.json());

      if (res.files && res.files.length > 0) {
        addLog(`Vault Located: ${res.files[0].id}`, 'success');
        return res.files[0].id;
      } else {
        addLog(`Vault Not Found. Initializing Creation...`, 'warn');
        const createRes = await fetch(`https://www.googleapis.com/drive/v3/files`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: GOOGLE_DRIVE_TARGET.targetSubFolder,
            parents: [GOOGLE_DRIVE_TARGET.rootFolderId],
            mimeType: 'application/folder'
          })
        }).then(r => r.json());
        addLog(`Vault Created: ${createRes.id}`, 'success');
        return createRes.id;
      }
    } catch (e) {
      addLog("Failed to sync with cloud folder structure.", 'error');
      return null;
    }
  };

  const startGathering = async () => {
    if (isEngineRunning) { stopRequested.current = true; return; }
    
    let token = accessToken;
    if (!token) {
        addLog("Authenticating Node...", 'info');
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
    if (!targetId) return;
    setActiveFolderId(targetId);

    setIsEngineRunning(true);
    stopRequested.current = false;
    const startTimestamp = Date.now();
    const masterRegistry = new Map<string, any>();
    const priceRegistry = new Map<string, any>();

    setStats(prev => ({ ...prev, startTime: new Date().toLocaleTimeString(), processed: 0, totalFound: 0, elapsedSeconds: 0 }));
    
    timerRef.current = window.setInterval(() => {
      setStats(prev => {
        const elapsed = Math.floor((Date.now() - startTimestamp) / 1000);
        let est = 'Syncing...';
        if (prev.processed > 0 && prev.totalFound > prev.processed) {
          const tps = prev.processed / elapsed;
          const remaining = Math.round((prev.totalFound - prev.processed) / (tps || 1));
          est = `${Math.floor(remaining / 60)}m ${remaining % 60}s`;
        }
        return { ...prev, elapsedSeconds: elapsed, estimatedTimeRemaining: est };
      });
    }, 1000);

    // Filter Logic: Only pure corporate equities
    const isCorpEquity = (ticker: string, name: string) => {
      const n = name.toUpperCase();
      const s = ticker.toUpperCase();
      if (s.includes('.') || s.includes('-')) return false; // Exclude secondary classes/warrants
      const excludeKeywords = ["ETF", "INDEX", "FUND", "TRUST", "UNIT", "WARRANT", "ACQUISITION CORP", "PREFERRED", "BOND", "ETN", "SERIES", "DEPOSITARY"];
      return !excludeKeywords.some(k => n.includes(k));
    };

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - (yesterday.getDay() === 1 ? 3 : yesterday.getDay() === 0 ? 2 : 1));
    const dateStr = yesterday.toISOString().split('T')[0];

    // Node 0: Aggregates Sync
    try {
      addLog(`Harvesting OHLCV from ${dateStr}...`, 'info');
      const res = await fetch(`https://api.polygon.io/v2/aggs/grouped/locale/us/market/stocks/${dateStr}?adjusted=true&apiKey=${keys.polygon}`).then(r => r.json());
      if (res.results) {
        res.results.forEach((r: any) => priceRegistry.set(r.T, { o: r.o, h: r.h, l: r.l, c: r.c, v: r.v, vw: r.vw }));
      }
    } catch (e) {}

    // Discovery Tasks (Unlimited Pages)
    const tasks = [
      (async () => {
        updateNodeStatus('Polygon', 0, 'Active');
        try {
          let nextUrl = `https://api.polygon.io/v3/reference/tickers?market=stocks&type=CS&active=true&limit=1000&apiKey=${keys.polygon}`;
          while (nextUrl && !stopRequested.current) {
            const res = await fetch(nextUrl).then(r => r.json());
            if (res.results) {
              res.results.forEach((t: any) => {
                if (isCorpEquity(t.ticker, t.name)) {
                  masterRegistry.set(t.ticker, { 
                    t: t.ticker, n: t.name, ex: t.primary_exchange,
                    ...priceRegistry.get(t.ticker)
                  });
                }
              });
              updateNodeStatus('Polygon', masterRegistry.size, 'Active');
              setStats(prev => ({ ...prev, totalFound: masterRegistry.size }));
            }
            nextUrl = res.next_url ? `${res.next_url}&apiKey=${keys.polygon}` : null;
          }
          updateNodeStatus('Polygon', masterRegistry.size, 'Complete');
        } catch (e) { updateNodeStatus('Polygon', 0, 'Failed'); }
      })(),
      (async () => {
        updateNodeStatus('Alpaca', 0, 'Active');
        try {
          const res = await fetch(`https://paper-api.alpaca.markets/v2/assets?asset_class=us_equity`, {
            headers: { 'APCA-API-KEY-ID': keys.alpaca || '' }
          }).then(r => r.json());
          res.forEach((t: any) => {
            if (t.status === 'active' && t.tradable && isCorpEquity(t.symbol, t.name)) {
              if (!masterRegistry.has(t.symbol)) {
                masterRegistry.set(t.symbol, { t: t.symbol, n: t.name, ex: t.exchange, ...priceRegistry.get(t.symbol) });
              }
            }
          });
          updateNodeStatus('Alpaca', masterRegistry.size, 'Complete');
          setStats(prev => ({ ...prev, totalFound: masterRegistry.size }));
        } catch (e) { updateNodeStatus('Alpaca', 0, 'Failed'); }
      })()
    ];

    await Promise.allSettled(tasks);
    addLog(`Discovery Finalized: ${masterRegistry.size} Corporate Entities.`, 'success');

    // Batch Upload to Correct Subfolder
    const list = Array.from(masterRegistry.values());
    const chunkSize = 2000;
    for (let i = 0; i < list.length; i += chunkSize) {
      if (stopRequested.current) break;
      const chunk = list.slice(i, i + chunkSize);
      const fileName = `STAGE0_CORE_UNIVERSE_${dateStr}_B${Math.floor(i/chunkSize)+1}.json`;
      
      const success = await uploadToVault(token, targetId, fileName, { 
        data: chunk, count: chunk.length, date: dateStr, type: 'EQUITY_ONLY' 
      });

      if (success) {
        setStats(prev => ({ ...prev, processed: i + chunk.length }));
        setPerformanceData(prev => [...prev.slice(-20), { tps: chunk.length, time: i }].map((d, idx) => ({ ...d, idx })));
        addLog(`Vault_Commit: ${fileName} stored in Stage0.`, 'info');
      }
      await new Promise(r => setTimeout(r, 150));
    }

    if (timerRef.current) clearInterval(timerRef.current);
    setIsEngineRunning(false);
    addLog("Matrix Cycle Complete. Stage 0 Ready.", 'success');
  };

  const uploadToVault = async (token: string, folderId: string, name: string, content: any) => {
    const metadata = { name, parents: [folderId], mimeType: 'application/json' };
    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', new Blob([JSON.stringify(content)], { type: 'application/json' }));
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
                Alpha_Nexus Matrix
              </h2>
              <div className="flex items-center space-x-3 mt-2 ml-6">
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-[0.4em]">Subfolder: {GOOGLE_DRIVE_TARGET.targetSubFolder}</p>
                <span className="text-[8px] px-2 py-0.5 bg-emerald-500/10 text-emerald-400 rounded-md font-black border border-emerald-500/20 tracking-widest uppercase">Unlimited_Discovery</span>
              </div>
            </div>
            <button onClick={startGathering} className={`px-12 py-5 rounded-2xl text-xs font-black uppercase tracking-widest shadow-2xl transition-all ${isEngineRunning ? 'bg-red-600 shadow-red-900/40 animate-pulse' : 'bg-blue-600 shadow-blue-900/40 hover:scale-105 active:scale-95'}`}>
              {isEngineRunning ? 'Terminate Matrix' : 'Engage Hyper-Drive'}
            </button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
            {[
              { l: 'Entities Filtered', v: stats.totalFound.toLocaleString(), c: 'text-white' },
              { l: 'Vault Sync', v: stats.processed.toLocaleString(), c: 'text-blue-400' },
              { l: 'Elapsed', v: `${Math.floor(stats.elapsedSeconds/60)}m ${stats.elapsedSeconds%60}s`, c: 'text-slate-400' },
              { l: 'Est. Remaining', v: stats.estimatedTimeRemaining, c: 'text-emerald-400' }
            ].map((s, i) => (
              <div key={i} className="bg-black/40 p-6 rounded-3xl border border-white/5">
                <p className="text-[8px] font-black text-slate-600 uppercase mb-2 tracking-widest">{s.l}</p>
                <p className={`text-xl font-mono font-black italic ${s.c}`}>{s.v}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-4 gap-3 mb-10">
            {nodeStats.map((node, i) => (
              <div key={i} className="bg-slate-900/60 p-4 rounded-2xl border border-white/5 flex flex-col items-center">
                 <p className="text-[7px] font-black text-slate-500 uppercase mb-2">{node.provider}</p>
                 <p className="text-xs font-mono font-bold text-blue-400">{node.count.toLocaleString()}</p>
                 <div className={`mt-2 px-2 py-0.5 rounded text-[6px] font-black uppercase ${node.status === 'Active' ? 'bg-blue-500/20 text-blue-400 animate-pulse' : node.status === 'Complete' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-600'}`}>
                    {node.status}
                 </div>
              </div>
            ))}
          </div>

          <div className="space-y-4">
             <div className="flex justify-between items-end px-2">
                <span className="text-[9px] font-black text-slate-500 uppercase italic tracking-widest">Pipeline_Integrity_Check</span>
                <span className="text-4xl font-black text-white italic font-mono tracking-tighter">
                  {stats.totalFound > 0 ? ((stats.processed / stats.totalFound) * 100).toFixed(1) : '0.0'}%
                </span>
             </div>
             <div className="h-4 bg-black rounded-full p-1 border border-white/5 overflow-hidden">
                <div className="h-full bg-gradient-to-r from-blue-700 via-blue-400 to-emerald-400 rounded-full transition-all duration-700 shadow-[0_0_15px_rgba(59,130,246,0.5)]" style={{ width: `${stats.totalFound > 0 ? (stats.processed / stats.totalFound) * 100 : 0}%` }}></div>
             </div>
          </div>

          <div className="h-32 mt-12 opacity-40">
             <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={performanceData}>
                  <Area type="monotone" dataKey="tps" stroke="#3b82f6" strokeWidth={3} fill="url(#pColor)" fillOpacity={0.1} />
                  <defs><linearGradient id="pColor" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8}/><stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/></linearGradient></defs>
                </AreaChart>
             </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="space-y-6">
         <div className="glass-panel p-6 rounded-[40px] bg-slate-950 border-l-4 border-l-blue-600 h-[700px] flex flex-col shadow-2xl">
            <h3 className="font-black text-white text-xs uppercase tracking-[0.3em] mb-6 italic flex items-center">
              <span className="w-1.5 h-1.5 bg-blue-500 rounded-full mr-3 animate-ping"></span>
              Matrix Terminal_v1.0
            </h3>
            <div ref={logContainerRef} className="flex-1 bg-black/50 p-6 rounded-3xl font-mono text-[9px] text-blue-400/70 overflow-y-auto no-scrollbar space-y-2.5 border border-white/5 leading-relaxed">
               {consoleLogs.map((log, i) => (
                 <div key={i} className={`pl-3 border-l ${log.includes('[ERR]') ? 'border-red-500 text-red-400' : log.includes('[FILTER]') ? 'border-amber-500 text-amber-400' : log.includes('[OK]') ? 'border-emerald-500 text-emerald-400' : 'border-blue-900'}`}>
                    {log}
                 </div>
               ))}
            </div>
            <div className="mt-6 flex flex-col gap-3">
               <button onClick={() => window.open(`https://drive.google.com/drive/folders/${GOOGLE_DRIVE_TARGET.rootFolderId}`, '_blank')} className="py-4 bg-white text-black rounded-2xl text-[9px] font-black uppercase tracking-widest hover:bg-blue-600 hover:text-white transition-all">Verify Vault Root</button>
               <button onClick={() => setShowSettings(true)} className="py-4 bg-white/5 border border-white/10 rounded-2xl text-[9px] font-black uppercase text-slate-500 hover:text-white transition-all">Engine Setup</button>
            </div>
         </div>
      </div>

      {showSettings && (
        <div className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-xl flex items-center justify-center p-6">
           <div className="max-w-md w-full glass-panel p-12 rounded-[48px] border-white/10">
              <h3 className="text-2xl font-black text-white uppercase italic tracking-tighter mb-8">Node_Configuration</h3>
              <div className="space-y-6">
                 <div>
                    <label className="text-[9px] font-black text-slate-600 uppercase mb-2 block ml-1">Google Client Identifier</label>
                    <input type="text" value={clientId} onChange={(e) => setClientId(e.target.value)} className="w-full bg-black/50 border border-white/10 rounded-2xl p-5 text-xs text-white outline-none focus:border-blue-500" placeholder="Paste Client ID..." />
                 </div>
                 <div className="flex gap-4">
                    <button onClick={() => setShowSettings(false)} className="flex-1 py-5 bg-slate-900 text-slate-500 text-[10px] font-black uppercase rounded-2xl">Cancel</button>
                    <button onClick={() => { localStorage.setItem('gdrive_client_id', clientId); setShowSettings(false); }} className="flex-[2] py-5 bg-white text-black text-[10px] font-black uppercase rounded-2xl shadow-2xl">Confirm & Apply</button>
                 </div>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default UniverseGathering;
