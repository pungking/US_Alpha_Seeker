
import React, { useState, useEffect, useRef } from 'react';
import { ApiProvider } from '../types';
import { GOOGLE_DRIVE_TARGET, API_CONFIGS } from '../constants';

declare global {
  interface Window {
    google: any;
  }
}

interface Props {
  onAuthSuccess?: (status: boolean) => void;
}

interface NodeStatus {
  id: string;
  label: string;
  count: number;
  state: 'Idle' | 'Scanning' | 'Syncing' | 'Success' | 'Error';
}

const UniverseGathering: React.FC<Props> = ({ onAuthSuccess }) => {
  const [isEngineRunning, setIsEngineRunning] = useState(false);
  const [clientId] = useState<string>(() => localStorage.getItem('gdrive_client_id') || '');
  const [accessToken, setAccessToken] = useState<string | null>(sessionStorage.getItem('gdrive_access_token'));
  
  const polygonKey = API_CONFIGS.find(c => c.provider === ApiProvider.POLYGON)?.key;

  const [stats, setStats] = useState({
    found: 0,
    synced: 0,
    target: 10000, // 확장된 거래소(NASDAQ+NYSE+AMEX+ARCA) 전 종목 예상치
    elapsed: 0,
    remaining: 0,
    phase: 'Idle' as 'Idle' | 'Discovery' | 'Commit' | 'Finalized'
  });

  const [nodes, setNodes] = useState<NodeStatus[]>([
    { id: 'nodes_nasdaq', label: 'NASDAQ (XNAS)', count: 0, state: 'Idle' },
    { id: 'nodes_nyse', label: 'NYSE (XNYS)', count: 0, state: 'Idle' },
    { id: 'nodes_amex', label: 'AMEX (XASE)', count: 0, state: 'Idle' },
    { id: 'nodes_arca', label: 'ARCA (ARCX)', count: 0, state: 'Idle' }
  ]);

  const [logs, setLogs] = useState<string[]>(['> Matrix Standby. Full Equity Discovery Mode Engaged.']);
  const logRef = useRef<HTMLDivElement>(null);
  const stopReq = useRef(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  const addLog = (m: string, t: 'info' | 'ok' | 'err' | 'special' = 'info') => {
    const p = { info: '>', ok: '[OK]', err: '[ERR]', special: '[TARGET_FOUND]' };
    setLogs(prev => [...prev, `${p[t]} ${m}`].slice(-60));
  };

  const updateNode = (id: string, count: number, state: NodeStatus['state']) => {
    setNodes(prev => prev.map(n => n.id === id ? { ...n, count, state } : n));
  };

  const formatTime = (s: number) => {
    if (s <= 0) return '00:00:00';
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sc = s % 60;
    return [h, m, sc].map(v => v.toString().padStart(2, '0')).join(':');
  };

  const startEngine = async () => {
    if (isEngineRunning) { stopReq.current = true; return; }
    
    let token = accessToken;
    if (!token) {
      const client = window.google.accounts.oauth2.initTokenClient({
        client_id: clientId.trim(),
        scope: 'https://www.googleapis.com/auth/drive.file',
        callback: (res: any) => {
          if (res.access_token) {
            setAccessToken(res.access_token);
            sessionStorage.setItem('gdrive_access_token', res.access_token);
            onAuthSuccess?.(true);
            runPipeline(res.access_token);
          }
        },
      });
      client.requestAccessToken({ prompt: 'consent' });
      return;
    }
    runPipeline(token);
  };

  const runPipeline = async (token: string) => {
    setIsEngineRunning(true);
    stopReq.current = false;
    const startTime = Date.now();
    const registry = new Map<string, any>();
    
    setStats(prev => ({ ...prev, found: 0, synced: 0, phase: 'Discovery', elapsed: 0 }));
    
    timerRef.current = window.setInterval(() => {
      setStats(prev => ({ ...prev, elapsed: Math.floor((Date.now() - startTime) / 1000) }));
    }, 1000);

    addLog("Phase 1: Deep Discovery Started. Broadening Exchange Coverage...", "info");

    const capture = async (exchange: string, nodeId: string) => {
      updateNode(nodeId, 0, 'Scanning');
      // type=CS 필터를 제거하여 모든 Equity 유형을 수집 (FRGT 등 누락 방지)
      let url = `https://api.polygon.io/v3/reference/tickers?exchange=${exchange}&market=stocks&active=true&limit=1000&apiKey=${polygonKey}`;
      let localCount = 0;

      while (url && !stopReq.current) {
        try {
          const res = await fetch(url).then(r => r.json());
          if (res.results) {
            res.results.forEach((t: any) => {
              if (!registry.has(t.ticker)) {
                // 특정 종목(FRGT) 수집 확인 로그
                if (t.ticker === 'FRGT') {
                  addLog("SPECIAL_TARGET [FRGT] DETECTED AND CAPTURED!", "special");
                }
                registry.set(t.ticker, { 
                  symbol: t.ticker, 
                  name: t.name, 
                  exchange: exchange,
                  type: t.type || 'UNKNOWN',
                  captured_at: new Date().toISOString() 
                });
                localCount++;
              }
            });
            setStats(prev => ({ ...prev, found: registry.size }));
            updateNode(nodeId, localCount, 'Scanning');
          }
          url = res.next_url ? `${res.next_url}&apiKey=${polygonKey}` : null;
          await new Promise(r => setTimeout(r, 200)); // Rate limit safety
        } catch (e) { 
          addLog(`Node [${exchange}] Failure: Connection error.`, "err");
          break; 
        }
      }
      updateNode(nodeId, localCount, 'Success');
      addLog(`Node [${exchange}] Finished: ${localCount} tickers found.`, "ok");
    };

    // Parallel scanning for 4 major exchanges
    await Promise.all([
      capture('XNAS', 'nodes_nasdaq'),
      capture('XNYS', 'nodes_nyse'),
      capture('XASE', 'nodes_amex'),
      capture('ARCX', 'nodes_arca')
    ]);

    if (stopReq.current) {
      setIsEngineRunning(false);
      if (timerRef.current) clearInterval(timerRef.current);
      addLog("Gathering Aborted by Command.", "err");
      return;
    }

    addLog(`Phase 1 Complete. Total Unique Symbols Indexed: ${registry.size}`, "ok");
    setStats(prev => ({ ...prev, phase: 'Commit' }));

    // Phase 2: Consolidated Master File
    addLog("Phase 2: Finalizing Master Universe Data Vault...", "info");
    const masterData = Array.from(registry.values());
    const fileName = `STAGE0_MASTER_UNIVERSE_${new Date().toISOString().split('T')[0]}.json`;
    
    const payload = {
      manifest: {
        version: "1.8-FULL-EQUITY",
        total_count: masterData.length,
        covered_exchanges: ["XNAS", "XNYS", "XASE", "ARCX"],
        note: "Filter-free capture ensuring all tradeable equities including FRGT.",
        generated_at: new Date().toISOString()
      },
      universe: masterData
    };

    const folderId = await ensureFolder(token);
    if (folderId) {
      const success = await uploadFile(token, folderId, fileName, payload);
      if (success) {
        setStats(prev => ({ ...prev, synced: masterData.length, phase: 'Finalized' }));
        addLog(`Vault Storage Successful: ${fileName}`, "ok");
      } else {
        addLog("Vault Write Error. Check Storage Permissions.", "err");
      }
    }

    if (timerRef.current) clearInterval(timerRef.current);
    setIsEngineRunning(false);
    addLog("Matrix Cycle Complete. Stage 0 Finalized.", "ok");
  };

  const ensureFolder = async (token: string) => {
    const q = encodeURIComponent(`name = '${GOOGLE_DRIVE_TARGET.targetSubFolder}' and '${GOOGLE_DRIVE_TARGET.rootFolderId}' in parents and trashed = false`);
    const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    }).then(r => r.json());
    if (res.files?.length > 0) return res.files[0].id;
    
    const create = await fetch(`https://www.googleapis.com/drive/v3/files`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: GOOGLE_DRIVE_TARGET.targetSubFolder, parents: [GOOGLE_DRIVE_TARGET.rootFolderId], mimeType: 'application/folder' })
    }).then(r => r.json());
    return create.id;
  };

  const uploadFile = async (token: string, folderId: string, name: string, content: any) => {
    const meta = { name, parents: [folderId], mimeType: 'application/json' };
    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(meta)], { type: 'application/json' }));
    form.append('file', new Blob([JSON.stringify(content, null, 2)], { type: 'application/json' }));
    const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: form
    });
    return res.ok;
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
      <div className="xl:col-span-3">
        <div className="glass-panel p-8 md:p-10 rounded-[40px] border-t-2 border-t-blue-500 shadow-2xl bg-slate-900/40 relative overflow-hidden">
          {/* Header */}
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-10 gap-6">
            <div className="flex items-center space-x-6">
              <div className={`w-14 h-14 rounded-3xl bg-blue-600/10 flex items-center justify-center border border-blue-500/20 ${isEngineRunning ? 'animate-pulse' : ''}`}>
                <div className={`w-5 h-5 bg-blue-500 rounded-lg ${isEngineRunning ? 'animate-spin' : ''}`}></div>
              </div>
              <div>
                <h2 className="text-3xl font-black text-white italic tracking-tighter uppercase leading-none">Omni_Nexus v1.8</h2>
                <div className="flex items-center mt-2 space-x-2">
                  <span className="text-[8px] px-2 py-0.5 bg-emerald-500/10 text-emerald-400 rounded-md font-black border border-emerald-500/20 uppercase tracking-widest">Full_Equity_Scan</span>
                  <p className="text-[9px] text-slate-500 font-bold uppercase tracking-[0.2em]">FRGT & All Tickers Included</p>
                </div>
              </div>
            </div>
            <button 
              onClick={startEngine} 
              className={`px-12 py-5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${isEngineRunning ? 'bg-red-600 shadow-xl shadow-red-900/20' : 'bg-blue-600 shadow-xl shadow-blue-900/20 hover:scale-105 active:scale-95'}`}
            >
              {isEngineRunning ? 'Stop Engine' : 'Start Full Discovery'}
            </button>
          </div>

          {/* Metrics Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
            {[
              { label: 'Total Symbols Indexed', val: stats.found.toLocaleString(), color: 'text-white' },
              { label: 'Vault Sync Status', val: stats.phase === 'Finalized' ? 'OPTIMIZED' : stats.phase, color: 'text-blue-400' },
              { label: 'Discovery Uptime', val: formatTime(stats.elapsed), color: 'text-slate-400' },
              { label: 'Architecture', val: 'SINGLE_MASTER', color: 'text-emerald-400' }
            ].map((s, i) => (
              <div key={i} className="bg-black/40 p-6 rounded-3xl border border-white/5 group hover:border-blue-500/30 transition-all">
                <p className="text-[7px] font-black text-slate-600 uppercase mb-2 tracking-[0.2em]">{s.label}</p>
                <p className={`text-xl font-mono font-black italic ${s.color}`}>{s.val}</p>
              </div>
            ))}
          </div>

          {/* Progress Indicators */}
          <div className="space-y-6 mb-10">
            <div className="space-y-2">
              <div className="flex justify-between items-end px-2">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Universe Matrix Filling</p>
                <p className="text-[10px] font-mono font-bold text-white">
                  {stats.phase === 'Finalized' ? '100%' : `${Math.min(99.9, (stats.found / stats.target) * 100).toFixed(1)}%`}
                </p>
              </div>
              <div className="h-4 bg-black/60 rounded-2xl overflow-hidden border border-white/5 p-1">
                <div 
                  className="h-full bg-gradient-to-r from-blue-700 via-indigo-500 to-blue-400 rounded-xl transition-all duration-700 shadow-[0_0_20px_rgba(59,130,246,0.3)]"
                  style={{ width: stats.phase === 'Finalized' ? '100%' : `${Math.min(100, (stats.found / stats.target) * 100)}%` }}
                ></div>
              </div>
            </div>
          </div>

          {/* Node Matrix */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {nodes.map(n => (
              <div key={n.id} className="bg-slate-900/60 p-5 rounded-3xl border border-white/5 flex flex-col items-center group hover:bg-slate-800/40 transition-all">
                <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-2">{n.label}</p>
                <p className="text-lg font-mono font-black text-white">{n.count.toLocaleString()}</p>
                <div className={`mt-3 px-3 py-1 rounded-xl text-[7px] font-black uppercase ${n.state === 'Scanning' ? 'bg-blue-500/10 text-blue-400 animate-pulse' : n.state === 'Success' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-slate-800 text-slate-600'}`}>
                  {n.state}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Terminal Section */}
      <div className="xl:col-span-1">
        <div className="glass-panel h-[620px] rounded-[40px] bg-slate-950 border-l-4 border-l-blue-600 flex flex-col p-6 shadow-2xl">
          <div className="flex items-center justify-between mb-8">
            <h3 className="font-black text-white text-[10px] uppercase tracking-[0.4em] italic">Full_Scope_Terminal</h3>
          </div>
          <div ref={logRef} className="flex-1 bg-black/70 p-6 rounded-[32px] font-mono text-[9px] text-blue-300/60 overflow-y-auto no-scrollbar space-y-4 border border-white/5 leading-relaxed">
            {logs.map((l, i) => (
              <div key={i} className={`pl-4 border-l-2 ${l.includes('[OK]') ? 'border-emerald-500 text-emerald-400' : l.includes('[ERR]') ? 'border-red-500 text-red-400' : l.includes('[TARGET_FOUND]') ? 'border-indigo-500 text-indigo-400 font-black' : 'border-blue-900'}`}>
                {l}
              </div>
            ))}
          </div>
          <div className="mt-8 space-y-3">
            <button onClick={() => window.open(`https://drive.google.com/drive/folders/${GOOGLE_DRIVE_TARGET.rootFolderId}`, '_blank')} className="w-full py-4 bg-white text-black rounded-2xl text-[9px] font-black uppercase tracking-widest hover:bg-blue-600 hover:text-white transition-all">Audit Mastery Vault</button>
            <div className="p-5 bg-indigo-600/5 rounded-2xl border border-indigo-500/10 text-center">
              <p className="text-[7px] text-indigo-400 font-black uppercase tracking-[0.2em] mb-1">Deduplication Logic</p>
              <p className="text-[9px] text-slate-400 font-bold italic">4-Exchange cross-reference ensures unique symbol integrity across the universe.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UniverseGathering;
