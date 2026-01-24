
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
  type?: string; 
}

const UniverseGathering: React.FC<Props> = ({ onAuthSuccess }) => {
  const [isEngineRunning, setIsEngineRunning] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [cooldown, setCooldown] = useState(0);
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
    phase: 'Idle' as 'Idle' | 'Discovery' | 'Mapping' | 'Commit' | 'Finalized' | 'Cooldown',
    currentStep: ''
  });

  const [logs, setLogs] = useState<string[]>(['> Engine v1.9.6: High-Frequency Equity Protocol Active.']);
  const logRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  useEffect(() => {
    if (cooldown > 0) {
      const timer = setTimeout(() => setCooldown(cooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [cooldown]);

  const addLog = (m: string, t: 'info' | 'ok' | 'err' | 'warn' = 'info') => {
    const p = { info: '>', ok: '[OK]', err: '[ERR]', warn: '[WARN]' };
    setLogs(prev => [...prev, `${p[t]} ${m}`].slice(-50));
  };

  const getLatestTradingDate = () => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    if (d.getDay() === 0) d.setDate(d.getDate() - 2);
    else if (d.getDay() === 6) d.setDate(d.getDate() - 1);
    return d.toISOString().split('T')[0];
  };

  const startEngine = async () => {
    if (isEngineRunning || cooldown > 0) return;
    
    if (!clientId) {
      addLog("Missing Client ID. Open ⚙ Config.", "err");
      setShowConfig(true);
      return;
    }

    document.body.setAttribute('data-engine-running', 'true');
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
        });
        client.requestAccessToken({ prompt: 'consent' });
      } catch (e: any) {
        addLog(`Auth Error: ${e.message}`, "err");
        document.body.removeAttribute('data-engine-running');
      }
      return;
    }
    runAggregatedPipeline(token);
  };

  const runAggregatedPipeline = async (token: string) => {
    setIsEngineRunning(true);
    const startTime = Date.now();
    const newRegistry = new Map<string, MasterTicker>();
    
    setStats(prev => ({ ...prev, found: 0, synced: 0, phase: 'Discovery', elapsed: 0, currentStep: 'Initial Discovery' }));
    
    timerRef.current = window.setInterval(() => {
      setStats(prev => ({ ...prev, elapsed: Math.floor((Date.now() - startTime) / 1000) }));
    }, 1000);

    try {
      addLog("Step 1: Identifying Global Equities (Finnhub)...", "info");
      setStats(prev => ({ ...prev, currentStep: 'Step 1: Discovering Tickers' }));
      const fhRes = await fetch(`https://finnhub.io/api/v1/stock/symbol?exchange=US&token=${finnhubKey}`).then(r => r.json());
      
      if (Array.isArray(fhRes)) {
        let filteredCount = 0;
        fhRes.forEach((s: any) => {
          const allowedTypes = ['Common Stock', 'ADR', 'REIT', 'MLP'];
          if (allowedTypes.includes(s.type) || !s.type) {
            newRegistry.set(s.symbol, {
              symbol: s.symbol,
              name: s.description,
              price: 0,
              volume: 0,
              change: 0,
              updated: new Date().toISOString(),
              type: s.type || 'Common Stock'
            });
          } else {
            filteredCount++;
          }
        });
        addLog(`Refined ${newRegistry.size} primary tickers.`, "ok");
      }

      setStats(prev => ({ ...prev, found: newRegistry.size, phase: 'Mapping', currentStep: 'Step 2: Pricing Logic' }));

      await new Promise(r => setTimeout(r, 1000));

      const targetDate = getLatestTradingDate();
      addLog(`Step 2: Merging Price Aggregates...`, "info");
      
      const polyRes = await fetch(`https://api.polygon.io/v2/aggs/grouped/locale/us/market/stocks/${targetDate}?adjusted=true&apiKey=${polygonKey}`);
      
      if (polyRes.status === 429) {
        addLog("API Throttled. 60s cooldown.", "err");
        setCooldown(60);
        throw new Error("Rate limit hit");
      }

      const polyData = await polyRes.json();

      if (polyData.results) {
        polyData.results.forEach((r: any) => {
          if (newRegistry.has(r.T)) {
            const current = newRegistry.get(r.T)!;
            newRegistry.set(r.T, {
              ...current,
              price: r.c,
              volume: r.v,
              change: r.o ? ((r.c - r.o) / r.o) * 100 : 0,
              updated: targetDate
            });
          }
        });
      }

      setRegistry(new Map(newRegistry));
      setStats(prev => ({ ...prev, phase: 'Commit', currentStep: 'Step 3: Drive Vault Sync' }));

      const masterData = Array.from(newRegistry.values());
      const payload = { universe: masterData };

      const folderId = await ensureFolder(token);
      if (folderId) {
        await uploadFile(token, folderId, `STAGE0_MASTER_UNIVERSE_${targetDate}.json`, payload);
        setStats(prev => ({ ...prev, synced: masterData.length, phase: 'Finalized', currentStep: 'Success: Finalized' }));
        addLog("System: Cloud Vault Sync Complete.", "ok");
      }

    } catch (e: any) {
      setStats(prev => ({ ...prev, currentStep: 'Error Occurred' }));
    } finally {
      if (timerRef.current) clearInterval(timerRef.current);
      setIsEngineRunning(false);
      document.body.removeAttribute('data-engine-running');
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
      body: JSON.stringify({ name: GOOGLE_DRIVE_TARGET.targetSubFolder, parents: [GOOGLE_DRIVE_TARGET.rootFolderId], mimeType: 'application/vnd.google-apps.folder' })
    }).then(r => r.json());
    return create.id;
  };

  const uploadFile = async (token: string, folderId: string, name: string, content: any) => {
    const meta = { name, parents: [folderId], mimeType: 'application/json' };
    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(meta)], { type: 'application/json' }));
    form.append('file', new Blob([JSON.stringify(content)], { type: 'application/json' }));
    return fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
      method: 'POST', headers: { 'Authorization': `Bearer ${token}` }, body: form
    });
  };

  const searchResult = useMemo(() => {
    if (!searchTerm) return null;
    return registry.get(searchTerm.toUpperCase());
  }, [searchTerm, registry]);

  return (
    <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
      <div className="xl:col-span-3 space-y-6">
        <div className="glass-panel p-8 md:p-10 rounded-[40px] border-t-2 border-t-blue-500 shadow-2xl bg-slate-900/40 relative overflow-hidden">
          
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-10 gap-6">
            <div className="flex items-center space-x-6">
              <div className={`w-14 h-14 rounded-3xl bg-blue-600/10 flex items-center justify-center border border-blue-500/20 ${isEngineRunning ? 'animate-pulse' : ''}`}>
                <div className={`w-5 h-5 bg-blue-500 rounded-lg ${isEngineRunning ? 'animate-spin' : ''}`}></div>
              </div>
              <div>
                <h2 className="text-3xl font-black text-white italic tracking-tighter uppercase leading-none">Omni_Nexus v1.9.6</h2>
                <div className="flex items-center mt-2 space-x-2">
                  <span className={`text-[8px] px-2 py-0.5 rounded-md font-black border uppercase tracking-widest ${cooldown > 0 ? 'bg-red-500/20 text-red-400 border-red-500/20' : 'bg-indigo-500/20 text-indigo-400 border-indigo-500/20'}`}>
                    {cooldown > 0 ? `Quota_Lock: ${cooldown}s` : stats.currentStep || 'Equity_Protocol_Active'}
                  </span>
                </div>
              </div>
            </div>
            <button 
              onClick={startEngine} 
              disabled={isEngineRunning || cooldown > 0}
              className={`px-12 py-5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${isEngineRunning || cooldown > 0 ? 'bg-slate-800 text-slate-500 cursor-not-allowed' : 'bg-blue-600 text-white shadow-xl hover:scale-105'}`}
            >
              {isEngineRunning ? stats.currentStep : cooldown > 0 ? `Wait ${cooldown}s` : 'Execute Data Fusion'}
            </button>
          </div>

          <div className="bg-black/40 p-6 rounded-3xl border border-white/5 mb-8">
            <div className="flex items-center justify-between mb-4">
              <p className="text-[9px] font-black text-blue-400 uppercase tracking-widest">Global Integrity Validator</p>
            </div>
            <div className="flex gap-4">
              <input 
                type="text" 
                placeholder="Verify Ticker (e.g. AAPL)"
                className="flex-1 bg-slate-950 border border-white/10 rounded-xl px-6 py-4 text-white font-mono text-sm focus:border-blue-500 outline-none uppercase"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              <div className={`flex-1 flex items-center px-6 rounded-xl border transition-all ${searchResult ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-400' : 'bg-slate-900 border-white/5 text-slate-600'}`}>
                {searchResult ? (
                  <div className="flex justify-between items-center w-full font-mono text-[10px] font-bold">
                    <span>{searchResult.symbol} PRICE:</span>
                    <span className="text-emerald-300 ml-4">${searchResult.price.toFixed(2)}</span>
                  </div>
                ) : (
                  <span className="text-[10px] font-black italic uppercase tracking-widest">Ready for verification</span>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
            {[
              { label: 'Equities Found', val: stats.found.toLocaleString(), color: 'text-white' },
              { label: 'Step Status', val: stats.currentStep || 'Idle', color: 'text-indigo-400' },
              { label: 'Cycle Time', val: `${stats.elapsed}s`, color: 'text-slate-400' },
              { label: 'Engine Mode', val: 'V1.9.6_CORE', color: 'text-blue-400' }
            ].map((s, i) => (
              <div key={i} className="bg-black/40 p-6 rounded-3xl border border-white/5">
                <p className="text-[7px] font-black text-slate-600 uppercase mb-2 tracking-[0.2em]">{s.label}</p>
                <p className={`text-xl font-mono font-black italic truncate ${s.color}`}>{s.val}</p>
              </div>
            ))}
          </div>

          <div className="h-4 bg-black/60 rounded-2xl overflow-hidden border border-white/5 p-1">
            <div 
              className={`h-full rounded-xl transition-all duration-700 ${cooldown > 0 ? 'bg-red-600 animate-pulse' : 'bg-gradient-to-r from-blue-700 to-indigo-500'}`}
              style={{ width: stats.phase === 'Finalized' ? '100%' : cooldown > 0 ? `${(cooldown/60)*100}%` : `${Math.min(100, (stats.found / 10000) * 100)}%` }}
            ></div>
          </div>
        </div>
      </div>

      <div className="xl:col-span-1">
        <div className="glass-panel h-[680px] rounded-[40px] bg-slate-950 border-l-4 border-l-blue-600 flex flex-col p-6 shadow-2xl">
          <div className="flex items-center justify-between mb-8">
            <h3 className="font-black text-white text-[10px] uppercase tracking-[0.4em] italic">Synthesis_Terminal</h3>
          </div>
          <div ref={logRef} className="flex-1 bg-black/70 p-6 rounded-[32px] font-mono text-[9px] text-blue-300/60 overflow-y-auto no-scrollbar space-y-4 border border-white/5 leading-relaxed">
            {logs.map((l, i) => (
              <div key={i} className={`pl-4 border-l-2 ${l.includes('[OK]') ? 'border-emerald-500 text-emerald-400' : l.includes('[ERR]') ? 'border-red-500 text-red-400' : l.includes('[WARN]') ? 'border-amber-500 text-amber-400' : 'border-blue-900'}`}>
                {l}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default UniverseGathering;
