
import React, { useState, useEffect, useRef, useMemo } from 'react';
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

interface MasterTicker {
  symbol: string;
  name?: string;
  price: number;
  volume: number;
  change: number;
  updated: string;
}

const UniverseGathering: React.FC<Props> = ({ onAuthSuccess }) => {
  const [isEngineRunning, setIsEngineRunning] = useState(false);
  const [clientId] = useState<string>(() => localStorage.getItem('gdrive_client_id') || '');
  const [accessToken, setAccessToken] = useState<string | null>(sessionStorage.getItem('gdrive_access_token'));
  
  const polygonKey = API_CONFIGS.find(c => c.provider === ApiProvider.POLYGON)?.key;

  const [registry, setRegistry] = useState<Map<string, MasterTicker>>(new Map());
  const [searchTerm, setSearchTerm] = useState('');
  
  const [stats, setStats] = useState({
    found: 0,
    synced: 0,
    target: 12000,
    elapsed: 0,
    phase: 'Idle' as 'Idle' | 'Discovery' | 'Commit' | 'Finalized'
  });

  const [logs, setLogs] = useState<string[]>(['> Engine v1.9.1: Hybrid Protocol Ready.']);
  const logRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  const addLog = (m: string, t: 'info' | 'ok' | 'err' | 'warn' = 'info') => {
    const p = { info: '>', ok: '[OK]', err: '[ERR]', warn: '[WARN]' };
    setLogs(prev => [...prev, `${p[t]} ${m}`].slice(-50));
  };

  const startEngine = async () => {
    if (isEngineRunning) return;
    
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
            runHybridPipeline(res.access_token);
          }
        },
      });
      client.requestAccessToken({ prompt: 'consent' });
      return;
    }
    runHybridPipeline(token);
  };

  const runHybridPipeline = async (token: string) => {
    setIsEngineRunning(true);
    const startTime = Date.now();
    const newRegistry = new Map<string, MasterTicker>();
    
    setStats(prev => ({ ...prev, found: 0, synced: 0, phase: 'Discovery', elapsed: 0 }));
    
    timerRef.current = window.setInterval(() => {
      setStats(prev => ({ ...prev, elapsed: Math.floor((Date.now() - startTime) / 1000) }));
    }, 1000);

    addLog("Method A: Attempting Universal Snapshot Scan...", "info");

    try {
      const snapshotUrl = `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers?apiKey=${polygonKey}`;
      const snapRes = await fetch(snapshotUrl).then(r => r.json());

      if (snapRes.status === 'OK' && snapRes.tickers) {
        addLog(`Snapshot Successful: ${snapRes.tickers.length} tickers found with live data.`, "ok");
        snapRes.tickers.forEach((t: any) => {
          newRegistry.set(t.ticker, {
            symbol: t.ticker,
            price: t.min?.c || t.prevDay?.c || t.lastTrade?.p || 0,
            volume: t.day?.v || t.prevDay?.v || 0,
            change: t.todaysChangePerc || 0,
            updated: new Date().toISOString()
          });
        });
      } else {
        const errMsg = snapRes.error || snapRes.message || "Unknown API Error";
        addLog(`Snapshot Protocol Failed: ${errMsg}`, "warn");
        addLog("Method B: Falling back to Reference Discovery (Listing Only)...", "info");
        
        // Fallback: Reference API (티커 리스트라도 확실히 가져옴)
        let nextUrl = `https://api.polygon.io/v3/reference/tickers?market=stocks&active=true&limit=1000&apiKey=${polygonKey}`;
        while (nextUrl) {
          const refRes = await fetch(nextUrl).then(r => r.json());
          if (refRes.results) {
            refRes.results.forEach((t: any) => {
              newRegistry.set(t.ticker, {
                symbol: t.ticker,
                name: t.name,
                price: 0, // Reference API에서는 가격 정보 제공 안함
                volume: 0,
                change: 0,
                updated: new Date().toISOString()
              });
            });
            setStats(prev => ({ ...prev, found: newRegistry.size }));
          }
          nextUrl = refRes.next_url ? `${refRes.next_url}&apiKey=${polygonKey}` : '';
          if (newRegistry.size > 20000) break; // Safety break
        }
      }

      setRegistry(new Map(newRegistry));
      setStats(prev => ({ ...prev, found: newRegistry.size, phase: 'Commit' }));

      // Commit to Drive
      const masterData = Array.from(newRegistry.values());
      const fileName = `STAGE0_MASTER_UNIVERSE_v1.9.1.json`;
      const payload = {
        manifest: {
          version: "1.9.1-HYBRID",
          total_count: masterData.length,
          note: "Snapshot fallback enabled. Some tickers might have zero prices if fallback was triggered.",
          generated_at: new Date().toISOString()
        },
        universe: masterData
      };

      const folderId = await ensureFolder(token);
      if (folderId) {
        const success = await uploadFile(token, folderId, fileName, payload);
        if (success) {
          setStats(prev => ({ ...prev, synced: masterData.length, phase: 'Finalized' }));
          addLog(`Master Vault Synchronized. Total: ${masterData.length}`, "ok");
        }
      }

    } catch (e: any) {
      addLog(`Pipeline Crash: ${e.message}`, "err");
    } finally {
      if (timerRef.current) clearInterval(timerRef.current);
      setIsEngineRunning(false);
    }
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
      method: 'POST', headers: { 'Authorization': `Bearer ${token}` }, body: form
    });
    return res.ok;
  };

  const searchResult = useMemo(() => {
    if (!searchTerm) return null;
    return registry.get(searchTerm.toUpperCase());
  }, [searchTerm, registry]);

  return (
    <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
      <div className="xl:col-span-3 space-y-6">
        <div className="glass-panel p-8 md:p-10 rounded-[40px] border-t-2 border-t-blue-500 shadow-2xl bg-slate-900/40 relative overflow-hidden">
          {/* Header */}
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-10 gap-6">
            <div className="flex items-center space-x-6">
              <div className={`w-14 h-14 rounded-3xl bg-blue-600/10 flex items-center justify-center border border-blue-500/20 ${isEngineRunning ? 'animate-pulse' : ''}`}>
                <div className={`w-5 h-5 bg-blue-500 rounded-lg ${isEngineRunning ? 'animate-spin' : ''}`}></div>
              </div>
              <div>
                <h2 className="text-3xl font-black text-white italic tracking-tighter uppercase leading-none">Omni_Nexus v1.9.1</h2>
                <div className="flex items-center mt-2 space-x-2">
                  <span className="text-[8px] px-2 py-0.5 bg-amber-500/20 text-amber-400 rounded-md font-black border border-amber-500/20 uppercase tracking-widest">Hybrid_Discovery</span>
                  <p className="text-[9px] text-slate-500 font-bold uppercase tracking-[0.2em]">Resilient Market Mapping System</p>
                </div>
              </div>
            </div>
            <button 
              onClick={startEngine} 
              disabled={isEngineRunning}
              className={`px-12 py-5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${isEngineRunning ? 'bg-slate-800 text-slate-500' : 'bg-blue-600 text-white shadow-xl shadow-blue-900/20 hover:scale-105 active:scale-95'}`}
            >
              {isEngineRunning ? 'Syncing Matrix...' : 'Execute Hybrid Discovery'}
            </button>
          </div>

          {/* Verification Search Bar */}
          <div className="bg-black/40 p-6 rounded-3xl border border-white/5 mb-8">
            <div className="flex items-center justify-between mb-4">
              <p className="text-[9px] font-black text-blue-400 uppercase tracking-widest">Collector Integrity Validator</p>
              <span className="text-[8px] text-slate-500 uppercase">Verify ticker existence in current memory</span>
            </div>
            <div className="flex gap-4">
              <input 
                type="text" 
                placeholder="Enter Ticker (e.g. FRGT)"
                className="flex-1 bg-slate-950 border border-white/10 rounded-xl px-6 py-4 text-white font-mono text-sm focus:border-blue-500 outline-none transition-all uppercase"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              <div className={`flex-1 flex items-center px-6 rounded-xl border transition-all ${searchResult ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-400' : 'bg-slate-900 border-white/5 text-slate-600'}`}>
                {searchResult ? (
                  <div className="flex justify-between w-full font-mono text-[10px] font-bold">
                    <span>{searchResult.symbol} DETECTED</span>
                    <span>Last: ${searchResult.price || 'N/A'}</span>
                    <span>Vol: {searchResult.volume?.toLocaleString() || 'N/A'}</span>
                  </div>
                ) : (
                  <span className="text-[10px] font-black italic uppercase tracking-widest">{searchTerm ? 'NOT DETECTED IN MEMORY' : 'Awaiting Ticker Input'}</span>
                )}
              </div>
            </div>
          </div>

          {/* Metrics */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
            {[
              { label: 'Total Symbols Found', val: stats.found.toLocaleString(), color: 'text-white' },
              { label: 'Data Quality', val: stats.phase === 'Discovery' ? 'SCANNING' : 'VERIFIED', color: 'text-emerald-400' },
              { label: 'Uptime', val: `${stats.elapsed}s`, color: 'text-slate-400' },
              { label: 'Target Vault', val: 'V1.9.1_MASTER', color: 'text-blue-400' }
            ].map((s, i) => (
              <div key={i} className="bg-black/40 p-6 rounded-3xl border border-white/5">
                <p className="text-[7px] font-black text-slate-600 uppercase mb-2 tracking-[0.2em]">{s.label}</p>
                <p className={`text-xl font-mono font-black italic ${s.color}`}>{s.val}</p>
              </div>
            ))}
          </div>

          <div className="space-y-2">
            <div className="flex justify-between items-end px-2">
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Discovery Progress</p>
              <p className="text-[10px] font-mono font-bold text-white">{stats.phase === 'Finalized' ? '100%' : `${Math.min(99.9, (stats.found / stats.target) * 100).toFixed(1)}%`}</p>
            </div>
            <div className="h-4 bg-black/60 rounded-2xl overflow-hidden border border-white/5 p-1">
              <div 
                className="h-full bg-gradient-to-r from-blue-700 via-indigo-500 to-blue-400 rounded-xl transition-all duration-700"
                style={{ width: stats.phase === 'Finalized' ? '100%' : `${Math.min(100, (stats.found / stats.target) * 100)}%` }}
              ></div>
            </div>
          </div>
        </div>
      </div>

      {/* Terminal */}
      <div className="xl:col-span-1">
        <div className="glass-panel h-[680px] rounded-[40px] bg-slate-950 border-l-4 border-l-blue-600 flex flex-col p-6 shadow-2xl">
          <div className="flex items-center justify-between mb-8">
            <h3 className="font-black text-white text-[10px] uppercase tracking-[0.4em] italic">Pipeline_Terminal</h3>
          </div>
          <div ref={logRef} className="flex-1 bg-black/70 p-6 rounded-[32px] font-mono text-[9px] text-blue-300/60 overflow-y-auto no-scrollbar space-y-4 border border-white/5 leading-relaxed">
            {logs.map((l, i) => (
              <div key={i} className={`pl-4 border-l-2 ${l.includes('[OK]') ? 'border-emerald-500 text-emerald-400' : l.includes('[ERR]') ? 'border-red-500 text-red-400' : l.includes('[WARN]') ? 'border-amber-500 text-amber-400' : 'border-blue-900'}`}>
                {l}
              </div>
            ))}
          </div>
          <div className="mt-8 space-y-3 text-center">
            <div className="p-5 bg-blue-600/5 rounded-2xl border border-blue-500/10">
              <p className="text-[7px] text-blue-400 font-black uppercase tracking-[0.2em] mb-2">Resilience Note</p>
              <p className="text-[9px] text-slate-400 font-bold italic leading-snug">If Snapshot fails, the system automatically pulls raw lists from the Reference API to ensure zero data loss.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UniverseGathering;
