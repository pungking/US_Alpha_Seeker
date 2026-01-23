
import React, { useState, useEffect, useRef } from 'react';
import { AreaChart, Area, ResponsiveContainer, XAxis, YAxis, Tooltip } from 'recharts';
import { GatheringStats, ApiProvider } from '../types';
import { GOOGLE_DRIVE_TARGET, API_CONFIGS } from '../constants';

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
  const [activeNode, setActiveNode] = useState<string>('Standby');
  const [clientId, setClientId] = useState<string>(() => localStorage.getItem('gdrive_client_id') || '');
  const [accessToken, setAccessToken] = useState<string | null>(sessionStorage.getItem('gdrive_access_token'));
  const [showSettings, setShowSettings] = useState(!localStorage.getItem('gdrive_client_id'));
  
  const keys = {
    polygon: API_CONFIGS.find(c => c.provider === ApiProvider.POLYGON)?.key,
    alpaca: API_CONFIGS.find(c => c.provider === ApiProvider.ALPACA)?.key,
    finnhub: API_CONFIGS.find(c => c.provider === ApiProvider.FINNHUB)?.key,
    twelve: API_CONFIGS.find(c => c.provider === ApiProvider.TWELVE_DATA)?.key,
    alpha: API_CONFIGS.find(c => c.provider === ApiProvider.ALPHA_VANTAGE)?.key,
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
    { provider: 'AlphaVantage', count: 0, status: 'Idle' },
  ]);

  const [performanceData, setPerformanceData] = useState<any[]>([]);
  const [consoleLogs, setConsoleLogs] = useState<string[]>(['> Nexus Hyper-Parallel Engine V6.0 Ready.']);
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

  const connectGoogleDrive = () => {
    return new Promise<string | null>((resolve) => {
      if (!clientId.trim()) { setShowSettings(true); resolve(null); return; }
      // @ts-ignore
      const client = window.google.accounts.oauth2.initTokenClient({
        client_id: clientId.trim(),
        scope: 'https://www.googleapis.com/auth/drive.file',
        callback: (res: any) => {
          if (res.access_token) {
            setAccessToken(res.access_token);
            sessionStorage.setItem('gdrive_access_token', res.access_token);
            onAuthSuccess?.(true);
            addLog("Cloud Node Linked Successfully", 'success');
            resolve(res.access_token);
          } else resolve(null);
        },
      });
      client.requestAccessToken({ prompt: 'consent' });
    });
  };

  const startGathering = async () => {
    if (isEngineRunning) { stopRequested.current = true; return; }
    
    let token = accessToken;
    if (!token) {
      token = await connectGoogleDrive();
      if (!token) return;
    }

    setIsEngineRunning(true);
    stopRequested.current = false;
    const startTimestamp = Date.now();
    const masterRegistry = new Map<string, any>();

    setStats(prev => ({ ...prev, startTime: new Date().toLocaleTimeString(), processed: 0, totalFound: 0, elapsedSeconds: 0 }));
    
    timerRef.current = window.setInterval(() => {
      setStats(prev => {
        const elapsed = Math.floor((Date.now() - startTimestamp) / 1000);
        let est = 'Calculating...';
        if (prev.processed > 0 && prev.totalFound > prev.processed) {
          const tps = prev.processed / elapsed;
          const remaining = Math.round((prev.totalFound - prev.processed) / tps);
          est = `${Math.floor(remaining / 60)}m ${remaining % 60}s`;
        }
        return { ...prev, elapsedSeconds: elapsed, estimatedTimeRemaining: est };
      });
    }, 1000);

    addLog("Engaging Nexus Discovery Matrix (5-Node Parallel)...", 'info');

    // DISCOVERY TASKS
    const discoveryTasks = [
      // 1. Polygon Node
      (async () => {
        updateNodeStatus('Polygon', 0, 'Active');
        try {
          let nextUrl = `https://api.polygon.io/v3/reference/tickers?market=stocks&active=true&limit=1000&apiKey=${keys.polygon}`;
          let pCount = 0;
          while (nextUrl && pCount < 15) { // Max 15000 tickers
            const res = await fetch(nextUrl).then(r => r.json());
            if (res.results) {
              res.results.forEach((t: any) => masterRegistry.set(t.ticker, { t: t.ticker, n: t.name }));
              pCount++;
              updateNodeStatus('Polygon', masterRegistry.size, 'Active');
              setStats(prev => ({ ...prev, totalFound: masterRegistry.size }));
            }
            nextUrl = res.next_url ? `${res.next_url}&apiKey=${keys.polygon}` : null;
          }
          updateNodeStatus('Polygon', masterRegistry.size, 'Complete');
        } catch (e) { updateNodeStatus('Polygon', 0, 'Failed'); }
      })(),

      // 2. Alpaca Node
      (async () => {
        updateNodeStatus('Alpaca', 0, 'Active');
        try {
          const res = await fetch(`https://paper-api.alpaca.markets/v2/assets?asset_class=us_equity`, {
            headers: { 'APCA-API-KEY-ID': keys.alpaca || '' }
          }).then(r => r.json());
          res.forEach((t: any) => { if(t.status === 'active') masterRegistry.set(t.symbol, { t: t.symbol, n: t.name }); });
          updateNodeStatus('Alpaca', res.length, 'Complete');
          setStats(prev => ({ ...prev, totalFound: masterRegistry.size }));
        } catch (e) { updateNodeStatus('Alpaca', 0, 'Failed'); }
      })(),

      // 3. Finnhub Node
      (async () => {
        updateNodeStatus('Finnhub', 0, 'Active');
        try {
          const res = await fetch(`https://finnhub.io/api/v1/stock/symbol?exchange=US&token=${keys.finnhub}`).then(r => r.json());
          res.forEach((t: any) => masterRegistry.set(t.symbol, { t: t.symbol, n: t.displaySymbol }));
          updateNodeStatus('Finnhub', res.length, 'Complete');
          setStats(prev => ({ ...prev, totalFound: masterRegistry.size }));
        } catch (e) { updateNodeStatus('Finnhub', 0, 'Failed'); }
      })(),

      // 4. TwelveData Node
      (async () => {
        updateNodeStatus('TwelveData', 0, 'Active');
        try {
          const res = await fetch(`https://api.twelvedata.com/stocks?exchange=NASDAQ,NYSE&country=United States&apikey=${keys.twelve}`).then(r => r.json());
          if (res.data) {
            res.data.forEach((t: any) => masterRegistry.set(t.symbol, { t: t.symbol, n: t.name }));
            updateNodeStatus('TwelveData', res.data.length, 'Complete');
            setStats(prev => ({ ...prev, totalFound: masterRegistry.size }));
          }
        } catch (e) { updateNodeStatus('TwelveData', 0, 'Failed'); }
      })()
    ];

    await Promise.allSettled(discoveryTasks);
    addLog(`Discovery Complete: ${masterRegistry.size} Unique Entities found.`, 'success');

    // CLOUD SYNC
    const masterList = Array.from(masterRegistry.values());
    const chunkSize = 2500;
    for (let i = 0; i < masterList.length; i += chunkSize) {
      if (stopRequested.current) break;
      const chunk = masterList.slice(i, i + chunkSize);
      const success = await uploadToDrive(token, `NEXUS_UNIVERSE_B${Math.floor(i/chunkSize)+1}.json`, { data: chunk, timestamp: new Date().toISOString() });
      if (success) {
        setStats(prev => ({ ...prev, processed: i + chunk.length }));
        setPerformanceData(prev => [...prev.slice(-20), { tps: chunk.length, time: i }].map((d, idx) => ({ ...d, idx })));
      }
      await new Promise(r => setTimeout(r, 150));
    }

    clearInterval(timerRef.current!);
    setIsEngineRunning(false);
    addLog("Matrix Cycle Terminated. All Nodes Idle.", 'info');
  };

  const uploadToDrive = async (token: string, name: string, content: any) => {
    const metadata = { name, parents: [GOOGLE_DRIVE_TARGET.folderId], mimeType: 'application/json' };
    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', new Blob([JSON.stringify(content)], { type: 'application/json' }));
    const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: form
    });
    return res.ok;
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
      <div className="xl:col-span-3 space-y-6">
        <div className="glass-panel p-8 rounded-[40px] border-t-2 border-t-blue-500 shadow-2xl relative overflow-hidden bg-slate-900/40">
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-10 gap-6">
            <div>
              <h2 className="text-3xl font-black text-white italic tracking-tighter uppercase flex items-center">
                <span className="bg-blue-600 w-2 h-8 mr-4 rounded-full animate-pulse"></span>
                Nexus Multi-Node Engine
              </h2>
              <p className="text-[10px] text-slate-500 font-bold uppercase tracking-[0.4em] mt-2 ml-6">Stage_0: Parallel Universe Discovery</p>
            </div>
            <button onClick={startGathering} className={`px-12 py-5 rounded-2xl text-xs font-black uppercase tracking-widest shadow-2xl transition-all ${isEngineRunning ? 'bg-red-600 shadow-red-900/40 animate-pulse' : 'bg-blue-600 shadow-blue-900/40 hover:scale-105 active:scale-95'}`}>
              {isEngineRunning ? 'Terminate Matrix' : 'Engage Hyper-Drive'}
            </button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
            {[
              { l: 'Total Found', v: stats.totalFound.toLocaleString(), c: 'text-white' },
              { l: 'Processed', v: stats.processed.toLocaleString(), c: 'text-blue-400' },
              { l: 'Elapsed', v: `${Math.floor(stats.elapsedSeconds/60)}m ${stats.elapsedSeconds%60}s`, c: 'text-slate-400' },
              { l: 'Est. Remaining', v: stats.estimatedTimeRemaining, c: 'text-emerald-400' }
            ].map((s, i) => (
              <div key={i} className="bg-black/40 p-6 rounded-3xl border border-white/5">
                <p className="text-[8px] font-black text-slate-600 uppercase mb-2 tracking-widest">{s.l}</p>
                <p className={`text-xl font-mono font-black italic ${s.c}`}>{s.v}</p>
              </div>
            ))}
          </div>

          {/* Node Contribution Grid */}
          <div className="grid grid-cols-5 gap-3 mb-10">
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
                <span className="text-[9px] font-black text-slate-500 uppercase italic tracking-widest">Discovery_Sync_Integrity</span>
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
         <div className="glass-panel p-6 rounded-[40px] bg-slate-950 border-l-4 border-l-blue-600 h-[700px] flex flex-col">
            <h3 className="font-black text-white text-xs uppercase tracking-[0.3em] mb-6 italic flex items-center">
              <span className="w-1.5 h-1.5 bg-blue-500 rounded-full mr-3 animate-ping"></span>
              Matrix Terminal
            </h3>
            <div ref={logContainerRef} className="flex-1 bg-black/50 p-6 rounded-3xl font-mono text-[9px] text-blue-400/70 overflow-y-auto no-scrollbar space-y-2.5 border border-white/5 leading-relaxed">
               {consoleLogs.map((log, i) => (
                 <div key={i} className={`pl-3 border-l ${log.includes('[ERR]') ? 'border-red-500 text-red-400' : log.includes('[OK]') ? 'border-emerald-500 text-emerald-400' : 'border-blue-900'}`}>
                    {log}
                 </div>
               ))}
            </div>
            <button onClick={() => setShowSettings(true)} className="mt-6 py-4 bg-white/5 border border-white/10 rounded-2xl text-[9px] font-black uppercase text-slate-500 hover:text-white transition-all">Node Configuration</button>
         </div>
      </div>

      {showSettings && (
        <div className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-xl flex items-center justify-center p-6">
           <div className="max-w-md w-full glass-panel p-12 rounded-[48px] border-white/10">
              <h3 className="text-2xl font-black text-white uppercase italic tracking-tighter mb-8">Node_Auth_Registry</h3>
              <div className="space-y-6">
                 <div>
                    <label className="text-[9px] font-black text-slate-600 uppercase mb-2 block ml-1">OAuth Client Identifier</label>
                    <input type="text" value={clientId} onChange={(e) => setClientId(e.target.value)} className="w-full bg-black/50 border border-white/10 rounded-2xl p-5 text-xs text-white outline-none focus:border-blue-500" placeholder="Paste Client ID..." />
                 </div>
                 <div className="flex gap-4">
                    <button onClick={() => setShowSettings(false)} className="flex-1 py-5 bg-slate-900 text-slate-500 text-[10px] font-black uppercase rounded-2xl">Cancel</button>
                    <button onClick={() => { localStorage.setItem('gdrive_client_id', clientId); setShowSettings(false); }} className="flex-[2] py-5 bg-white text-black text-[10px] font-black uppercase rounded-2xl">Confirm Config</button>
                 </div>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default UniverseGathering;
