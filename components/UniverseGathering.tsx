
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
    target: 8500, // 한국 거래 가능 예상 종목 수
    elapsed: 0,
    remaining: 0,
    phase: 'Idle' as 'Idle' | 'Discovery' | 'Commit' | 'Finalized'
  });

  const [nodes, setNodes] = useState<NodeStatus[]>([
    { id: 'nodes_cs', label: 'Common_Stock_Node', count: 0, state: 'Idle' },
    { id: 'nodes_adr', label: 'ADR_Global_Node', count: 0, state: 'Idle' },
    { id: 'nodes_sp', label: 'Specialized_Node', count: 0, state: 'Idle' }
  ]);

  const [logs, setLogs] = useState<string[]>(['> Engine Standby. Ready for Full Universe Capture.']);
  const logRef = useRef<HTMLDivElement>(null);
  const stopReq = useRef(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  const addLog = (m: string, t: 'info' | 'ok' | 'err' = 'info') => {
    const p = { info: '>', ok: '[OK]', err: '[ERR]' };
    setLogs(prev => [...prev, `${p[t]} ${m}`].slice(-40));
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

    addLog("Phase 1: Deep Discovery Started (CS, ADR, SP Target)", "info");

    const capture = async (type: string, nodeId: string) => {
      updateNode(nodeId, 0, 'Scanning');
      let url = `https://api.polygon.io/v3/reference/tickers?type=${type}&market=stocks&active=true&limit=1000&apiKey=${polygonKey}`;
      let localCount = 0;

      while (url && !stopReq.current) {
        try {
          const res = await fetch(url).then(r => r.json());
          if (res.results) {
            res.results.forEach((t: any) => {
              if (!registry.has(t.ticker)) {
                registry.set(t.ticker, { ...t, type_captured: type, ts: new Date().toISOString() });
                localCount++;
              }
            });
            setStats(prev => ({ ...prev, found: registry.size }));
            updateNode(nodeId, localCount, 'Scanning');
          }
          url = res.next_url ? `${res.next_url}&apiKey=${polygonKey}` : null;
          await new Promise(r => setTimeout(r, 200));
        } catch (e) { break; }
      }
      updateNode(nodeId, localCount, 'Success');
    };

    // Parallel Discovery for all tradeable equity types
    await Promise.all([
      capture('CS', 'nodes_cs'),
      capture('ADR', 'nodes_adr'),
      capture('SP', 'nodes_sp')
    ]);

    if (stopReq.current) {
      setIsEngineRunning(false);
      if (timerRef.current) clearInterval(timerRef.current);
      addLog("Protocol Terminated by User", "err");
      return;
    }

    addLog(`Phase 1 Complete. Captured ${registry.size} Core Equities.`, "ok");
    setStats(prev => ({ ...prev, phase: 'Commit' }));

    // Phase 2: Master File Sync (Single File Strategy)
    addLog("Phase 2: Single-Source Master File Synchronization...", "info");
    const masterData = Array.from(registry.values());
    const fileName = `STAGE0_MASTER_UNIVERSE_${new Date().toISOString().split('T')[0]}.json`;
    
    const payload = {
      manifest: {
        version: "1.6",
        total_count: masterData.length,
        types: ["CS", "ADR", "SP"],
        generated_at: new Date().toISOString()
      },
      universe: masterData
    };

    const folderId = await ensureFolder(token);
    if (folderId) {
      const success = await uploadFile(token, folderId, fileName, payload);
      if (success) {
        setStats(prev => ({ ...prev, synced: masterData.length, phase: 'Finalized' }));
        addLog(`Master Vault Updated: ${fileName}`, "ok");
      } else {
        addLog("Master Vault Write Error", "err");
      }
    }

    if (timerRef.current) clearInterval(timerRef.current);
    setIsEngineRunning(false);
    addLog("Universe Gathering Stage Concluded.", "ok");
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
          {/* Engine Header */}
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-10 gap-6">
            <div className="flex items-center space-x-5">
              <div className={`w-12 h-12 rounded-2xl bg-blue-600/20 flex items-center justify-center border border-blue-500/30 ${isEngineRunning ? 'animate-spin' : ''}`}>
                <div className="w-4 h-4 bg-blue-500 rounded-sm"></div>
              </div>
              <div>
                <h2 className="text-3xl font-black text-white italic tracking-tighter uppercase leading-none">Omni_Nexus v1.6</h2>
                <p className="text-[9px] text-slate-500 font-bold uppercase tracking-[0.4em] mt-2 ml-1">Master Universe Consolidation</p>
              </div>
            </div>
            <button 
              onClick={startEngine} 
              className={`px-10 py-5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${isEngineRunning ? 'bg-red-600 shadow-xl shadow-red-900/20' : 'bg-blue-600 shadow-xl shadow-blue-900/20 hover:scale-105 hover:bg-blue-500'}`}
            >
              {isEngineRunning ? 'Abort Capture' : 'Engage Discovery'}
            </button>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
            {[
              { label: 'Capture Count', val: stats.found.toLocaleString(), color: 'text-white' },
              { label: 'Vault Status', val: stats.phase === 'Finalized' ? 'SYNCED' : stats.phase, color: 'text-blue-400' },
              { label: 'Cycle Time', val: formatTime(stats.elapsed), color: 'text-slate-400' },
              { label: 'Data Integrity', val: 'SINGLE_SRC', color: 'text-emerald-400' }
            ].map((s, i) => (
              <div key={i} className="bg-black/40 p-6 rounded-3xl border border-white/5">
                <p className="text-[7px] font-black text-slate-600 uppercase mb-2 tracking-[0.2em]">{s.label}</p>
                <p className={`text-xl font-mono font-black italic ${s.color}`}>{s.val}</p>
              </div>
            ))}
          </div>

          {/* Master Progress Track */}
          <div className="space-y-6 mb-10">
            <div className="space-y-2">
              <div className="flex justify-between items-end px-1">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Discovery Progress (Core Equities)</p>
                <p className="text-[10px] font-mono font-bold text-white">{Math.min(100, (stats.found / stats.target) * 100).toFixed(1)}%</p>
              </div>
              <div className="h-3 bg-black/60 rounded-full overflow-hidden border border-white/5">
                <div 
                  className="h-full bg-gradient-to-r from-blue-700 via-indigo-500 to-blue-400 transition-all duration-500 shadow-[0_0_20px_rgba(59,130,246,0.3)]"
                  style={{ width: `${Math.min(100, (stats.found / stats.target) * 100)}%` }}
                ></div>
              </div>
            </div>
            
            <div className="space-y-2">
              <div className="flex justify-between items-end px-1">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Master Vault Sync (Single-File Strategy)</p>
                <p className="text-[10px] font-mono font-bold text-emerald-400">{stats.phase === 'Finalized' ? '100.0%' : stats.phase === 'Commit' ? 'Working...' : 'Pending'}</p>
              </div>
              <div className="h-3 bg-black/60 rounded-full overflow-hidden border border-white/5">
                <div 
                  className={`h-full bg-gradient-to-r from-emerald-700 to-emerald-400 transition-all duration-1000 shadow-[0_0_20px_rgba(16,185,129,0.3)] ${stats.phase === 'Commit' ? 'animate-pulse' : ''}`}
                  style={{ width: stats.phase === 'Finalized' ? '100%' : stats.phase === 'Commit' ? '50%' : '0%' }}
                ></div>
              </div>
            </div>
          </div>

          {/* Active Node Matrix */}
          <div className="grid grid-cols-3 gap-3">
            {nodes.map(n => (
              <div key={n.id} className="bg-slate-900/60 p-5 rounded-3xl border border-white/5 flex flex-col items-center">
                <p className="text-[7px] font-black text-slate-500 uppercase mb-1 tracking-widest">{n.label}</p>
                <p className="text-base font-mono font-black text-white">{n.count.toLocaleString()}</p>
                <div className={`mt-3 px-3 py-1 rounded-full text-[6px] font-black uppercase ${n.state === 'Scanning' ? 'bg-blue-500/20 text-blue-400 animate-pulse' : n.state === 'Success' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-600'}`}>
                  {n.state}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Side Console */}
      <div className="xl:col-span-1">
        <div className="glass-panel h-[620px] rounded-[40px] bg-slate-950 border-l-4 border-l-blue-600 flex flex-col p-6 shadow-2xl">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-black text-white text-[10px] uppercase tracking-[0.3em] italic">Nexus_Terminal</h3>
            <div className="w-2 h-2 rounded-full bg-blue-500 animate-ping"></div>
          </div>
          <div ref={logRef} className="flex-1 bg-black/60 p-6 rounded-[32px] font-mono text-[9px] text-blue-300/60 overflow-y-auto no-scrollbar space-y-3 leading-relaxed border border-white/5">
            {logs.map((l, i) => (
              <div key={i} className={`pl-3 border-l-2 ${l.includes('[OK]') ? 'border-emerald-500 text-emerald-400' : l.includes('[ERR]') ? 'border-red-500 text-red-400' : 'border-blue-900'}`}>
                {l}
              </div>
            ))}
          </div>
          <div className="mt-6 space-y-3">
            <button onClick={() => window.open(`https://drive.google.com/drive/folders/${GOOGLE_DRIVE_TARGET.rootFolderId}`, '_blank')} className="w-full py-4 bg-white text-black rounded-2xl text-[9px] font-black uppercase tracking-widest hover:bg-blue-600 hover:text-white transition-all">Audit Master Vault</button>
            <div className="p-4 bg-blue-500/10 rounded-2xl border border-blue-500/10 text-center">
              <p className="text-[7px] text-blue-400 font-black uppercase tracking-widest mb-1">Architecture Note</p>
              <p className="text-[9px] text-slate-400 font-bold italic leading-tight">Single Master JSON ensures O(1) load performance in Stage 1 Filter.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UniverseGathering;
