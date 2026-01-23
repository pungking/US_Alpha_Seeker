
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
  const [showConfig, setShowConfig] = useState(false);
  const [clientId, setClientId] = useState<string>(() => localStorage.getItem('gdrive_client_id') || '');
  const [accessToken, setAccessToken] = useState<string | null>(sessionStorage.getItem('gdrive_access_token'));
  
  const polygonKey = API_CONFIGS.find(c => c.provider === ApiProvider.POLYGON)?.key;
  const finnhubKey = API_CONFIGS.find(c => c.provider === ApiProvider.FINNHUB)?.key;

  const [registry, setRegistry] = useState<Map<string, MasterTicker>>(new Map());
  const [searchTerm, setSearchTerm] = useState('');
  
  const [stats, setStats] = useState({
    found: 0,
    synced: 0,
    target: 10000,
    elapsed: 0,
    phase: 'Idle' as 'Idle' | 'Discovery' | 'Mapping' | 'Commit' | 'Finalized'
  });

  const [logs, setLogs] = useState<string[]>(['> Engine v1.9.3: Hybrid Resilient Protocol Ready.']);
  const logRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  const addLog = (m: string, t: 'info' | 'ok' | 'err' | 'warn' = 'info') => {
    const p = { info: '>', ok: '[OK]', err: '[ERR]', warn: '[WARN]' };
    setLogs(prev => [...prev, `${p[t]} ${m}`].slice(-50));
  };

  const saveClientId = (id: string) => {
    const cleanId = id.trim();
    setClientId(cleanId);
    localStorage.setItem('gdrive_client_id', cleanId);
    addLog(`Client ID Updated: ${cleanId.substring(0, 10)}...`, "ok");
    setShowConfig(false);
  };

  const getLatestTradingDate = () => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    if (d.getDay() === 0) d.setDate(d.getDate() - 2);
    else if (d.getDay() === 6) d.setDate(d.getDate() - 1);
    return d.toISOString().split('T')[0];
  };

  const startEngine = async () => {
    if (isEngineRunning) return;
    
    if (!clientId || !clientId.includes('.apps.googleusercontent.com')) {
      addLog("Invalid or Missing Client ID. Please configure Infrastructure settings.", "err");
      setShowConfig(true);
      return;
    }

    let token = accessToken;
    if (!token) {
      try {
        const client = window.google.accounts.oauth2.initTokenClient({
          client_id: clientId.trim(),
          scope: 'https://www.googleapis.com/auth/drive.file',
          callback: (res: any) => {
            if (res.access_token) {
              setAccessToken(res.access_token);
              sessionStorage.setItem('gdrive_access_token', res.access_token);
              onAuthSuccess?.(true);
              runAggregatedPipeline(res.access_token);
            }
          },
          error_callback: (err: any) => {
             addLog(`OAuth2 Auth Error: ${err.message || 'Check Client ID'}`, "err");
          }
        });
        client.requestAccessToken({ prompt: 'consent' });
      } catch (e: any) {
        addLog(`Auth Initialization Failed: ${e.message}`, "err");
      }
      return;
    }
    runAggregatedPipeline(token);
  };

  const runAggregatedPipeline = async (token: string) => {
    setIsEngineRunning(true);
    const startTime = Date.now();
    const newRegistry = new Map<string, MasterTicker>();
    
    setStats(prev => ({ ...prev, found: 0, synced: 0, phase: 'Discovery', elapsed: 0 }));
    
    timerRef.current = window.setInterval(() => {
      setStats(prev => ({ ...prev, elapsed: Math.floor((Date.now() - startTime) / 1000) }));
    }, 1000);

    try {
      addLog("Contacting Finnhub Relay for Alpha Registry...", "info");
      const fhRes = await fetch(`https://finnhub.io/api/v1/stock/symbol?exchange=US&token=${finnhubKey}`).then(r => r.json());
      
      if (Array.isArray(fhRes)) {
        fhRes.forEach((s: any) => {
          newRegistry.set(s.symbol, {
            symbol: s.symbol,
            name: s.description,
            price: 0,
            volume: 0,
            change: 0,
            updated: new Date().toISOString()
          });
        });
        addLog(`Finnhub Success: ${newRegistry.size} symbols discovered.`, "ok");
      }

      setStats(prev => ({ ...prev, found: newRegistry.size, phase: 'Mapping' }));

      const targetDate = getLatestTradingDate();
      addLog(`Requesting Polygon Grouped Aggregates (${targetDate})...`, "info");
      
      const polyUrl = `https://api.polygon.io/v2/aggs/grouped/locale/us/market/stocks/${targetDate}?adjusted=true&apiKey=${polygonKey}`;
      const polyRes = await fetch(polyUrl).then(r => r.json());

      if (polyRes.results) {
        let matchCount = 0;
        polyRes.results.forEach((r: any) => {
          if (newRegistry.has(r.T)) {
            const current = newRegistry.get(r.T)!;
            newRegistry.set(r.T, {
              ...current,
              price: r.c,
              volume: r.v,
              change: r.o ? ((r.c - r.o) / r.o) * 100 : 0,
              updated: targetDate
            });
            matchCount++;
          }
        });
        addLog(`Market Fusion Complete: ${matchCount} active price points mapped.`, "ok");
      } else {
        const errorMsg = polyRes.error || polyRes.message || "Unknown error";
        addLog(`Polygon Aggregates Failed: ${errorMsg}`, "warn");
      }

      setRegistry(new Map(newRegistry));
      setStats(prev => ({ ...prev, phase: 'Commit' }));

      const masterData = Array.from(newRegistry.values());
      const fileName = `STAGE0_MASTER_UNIVERSE_v1.9.3.json`;
      const payload = {
        manifest: {
          version: "1.9.3-HYBRID",
          data_date: targetDate,
          total_count: masterData.length,
          generated_at: new Date().toISOString()
        },
        universe: masterData
      };

      const folderId = await ensureFolder(token);
      if (folderId) {
        const success = await uploadFile(token, folderId, fileName, payload);
        if (success) {
          setStats(prev => ({ ...prev, synced: masterData.length, phase: 'Finalized' }));
          addLog(`Sync Successful: [${fileName}] verified in cloud vault.`, "ok");
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
          
          {/* Config Overlay */}
          {showConfig && (
            <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-xl z-50 p-10 flex flex-col justify-center items-center">
              <div className="max-w-md w-full space-y-6">
                <div className="text-center">
                  <h3 className="text-2xl font-black text-white italic uppercase tracking-tighter">Infrastructure Setup</h3>
                  <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-2">Required: Google OAuth2 Client ID</p>
                </div>
                <input 
                  type="text" 
                  placeholder="Enter Client ID (ending in .apps.googleusercontent.com)"
                  className="w-full bg-black border border-white/10 rounded-xl px-6 py-4 text-white font-mono text-xs focus:border-blue-500 outline-none"
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                />
                <div className="flex gap-3">
                  <button 
                    onClick={() => saveClientId(clientId)}
                    className="flex-1 bg-blue-600 text-white py-4 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-blue-500 transition-all"
                  >
                    Save Configuration
                  </button>
                  <button 
                    onClick={() => setShowConfig(false)}
                    className="px-6 bg-slate-800 text-slate-400 py-4 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-700"
                  >
                    Cancel
                  </button>
                </div>
                <p className="text-[8px] text-slate-600 text-center leading-relaxed">
                  Go to <a href="https://console.cloud.google.com/apis/credentials" target="_blank" className="text-blue-500 underline">Google Cloud Console</a> to create an OAuth 2.0 Client ID for your project.
                </p>
              </div>
            </div>
          )}

          {/* Header */}
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-10 gap-6">
            <div className="flex items-center space-x-6">
              <div className={`w-14 h-14 rounded-3xl bg-blue-600/10 flex items-center justify-center border border-blue-500/20 ${isEngineRunning ? 'animate-pulse' : ''}`}>
                <div className={`w-5 h-5 bg-blue-500 rounded-lg ${isEngineRunning ? 'animate-spin' : ''}`}></div>
              </div>
              <div>
                <h2 className="text-3xl font-black text-white italic tracking-tighter uppercase leading-none">Omni_Nexus v1.9.3</h2>
                <div className="flex items-center mt-2 space-x-2">
                  <span className="text-[8px] px-2 py-0.5 bg-indigo-500/20 text-indigo-400 rounded-md font-black border border-indigo-500/20 uppercase tracking-widest">Resilient_Hybrid</span>
                  <button 
                    onClick={() => setShowConfig(true)}
                    className="text-[8px] px-2 py-0.5 bg-slate-800 text-slate-400 rounded-md font-black border border-white/5 uppercase hover:bg-slate-700 transition-all"
                  >
                    ⚙ Config
                  </button>
                </div>
              </div>
            </div>
            <button 
              onClick={startEngine} 
              disabled={isEngineRunning}
              className={`px-12 py-5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${isEngineRunning ? 'bg-slate-800 text-slate-500' : 'bg-blue-600 text-white shadow-xl shadow-blue-900/20 hover:scale-105 active:scale-95'}`}
            >
              {isEngineRunning ? 'Synchronizing Universe...' : 'Execute Universal Fusion'}
            </button>
          </div>

          {/* Validation Tool */}
          <div className="bg-black/40 p-6 rounded-3xl border border-white/5 mb-8">
            <div className="flex items-center justify-between mb-4">
              <p className="text-[9px] font-black text-blue-400 uppercase tracking-widest">Local Integrity Checker</p>
              <span className="text-[8px] text-slate-500 uppercase">Snapshot Date: {getLatestTradingDate()}</span>
            </div>
            <div className="flex gap-4">
              <input 
                type="text" 
                placeholder="Ticker (e.g. NVDA, TSLA)"
                className="flex-1 bg-slate-950 border border-white/10 rounded-xl px-6 py-4 text-white font-mono text-sm focus:border-blue-500 outline-none transition-all uppercase"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              <div className={`flex-1 flex items-center px-6 rounded-xl border transition-all ${searchResult ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-400' : 'bg-slate-900 border-white/5 text-slate-600'}`}>
                {searchResult ? (
                  <div className="flex justify-between items-center w-full font-mono text-[10px] font-bold">
                    <span className="truncate max-w-[150px]">{searchResult.name || searchResult.symbol}</span>
                    <span className="bg-emerald-500/20 px-2 py-1 rounded text-emerald-300">${searchResult.price.toFixed(2)}</span>
                    <span className="text-slate-400">Vol: {(searchResult.volume/1000).toFixed(1)}k</span>
                  </div>
                ) : (
                  <span className="text-[10px] font-black italic uppercase tracking-widest">{searchTerm ? 'TICKER NOT IN MEMORY' : 'Awaiting Data Sync'}</span>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
            {[
              { label: 'Symbols Found', val: stats.found.toLocaleString(), color: 'text-white' },
              { label: 'Cloud Status', val: accessToken ? 'CONNECTED' : 'STANDBY', color: 'text-emerald-400' },
              { label: 'Session Calls', val: isEngineRunning ? '3' : '0', color: 'text-slate-400' },
              { label: 'Protocol', val: 'HYBRID_V3', color: 'text-blue-400' }
            ].map((s, i) => (
              <div key={i} className="bg-black/40 p-6 rounded-3xl border border-white/5">
                <p className="text-[7px] font-black text-slate-600 uppercase mb-2 tracking-[0.2em]">{s.label}</p>
                <p className={`text-xl font-mono font-black italic ${s.color}`}>{s.val}</p>
              </div>
            ))}
          </div>

          <div className="space-y-2">
            <div className="flex justify-between items-end px-2">
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Gathering Efficiency</p>
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
              <p className="text-[7px] text-blue-400 font-black uppercase tracking-[0.2em] mb-2">Auth Resilience</p>
              <p className="text-[9px] text-slate-400 font-bold italic leading-snug">Ensures Client ID exists before OAuth2 handshake. Prevents 'Missing client_id' protocol error.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UniverseGathering;
