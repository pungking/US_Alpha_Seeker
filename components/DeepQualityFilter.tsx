import React, { useState, useEffect, useRef } from 'react';
import { GOOGLE_DRIVE_TARGET, API_CONFIGS } from '../constants';
import { ApiProvider } from '../types';

interface QualityTicker {
  symbol: string;
  name: string;
  price: number;
  volume: number;
  marketValue: number;
  type?: string;
  per?: number;
  pbr?: number;
  debtToEquity?: number;
  roe?: number;
  qualityScore?: number; // New Quality Metric
  sector?: string;
  industry?: string;
  lastUpdate: string;
  source?: string; // Data source for audit
}

interface Props {
  autoStart?: boolean;
  onComplete?: () => void;
}

const DeepQualityFilter: React.FC<Props> = ({ autoStart, onComplete }) => {
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  
  // Time Tracking
  const [timeStats, setTimeStats] = useState({ elapsed: 0, eta: 0 });
  const startTimeRef = useRef<number>(0);

  const [activeBrain, setActiveBrain] = useState<string>('Standby');
  
  // 무료 플랜 상태 관리
  const [fmpDepleted, setFmpDepleted] = useState(false);
  
  const [logs, setLogs] = useState<string[]>(['> Quality_Node v4.9.9: Resilience Protocol Upgrade.']);
  
  const accessToken = sessionStorage.getItem('gdrive_access_token');
  const finnhubKey = API_CONFIGS.find(c => c.provider === ApiProvider.FINNHUB)?.key;
  const fmpKey = API_CONFIGS.find(c => c.provider === ApiProvider.FMP)?.key;
  
  const logRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  // Timer Effect
  useEffect(() => {
    let interval: any;
    if (loading && startTimeRef.current > 0) {
      interval = setInterval(() => {
        const now = Date.now();
        const elapsedSec = Math.floor((now - startTimeRef.current) / 1000);
        
        // Calculate ETA
        let etaSec = 0;
        if (progress.current > 0 && progress.total > 0) {
           const rate = progress.current / elapsedSec; // items per second
           const remaining = progress.total - progress.current;
           etaSec = rate > 0 ? Math.floor(remaining / rate) : 0;
        }
        
        setTimeStats({ elapsed: elapsedSec, eta: etaSec });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [loading, progress]);

  // AUTO START LOGIC
  useEffect(() => {
    if (autoStart && !loading) {
        addLog("AUTO-PILOT: Initiating Deep Quality Scan...", "signal");
        executeDeepQualityScan();
    }
  }, [autoStart]);

  const addLog = (m: string, t: 'info' | 'ok' | 'err' | 'warn' | 'signal' = 'info') => {
    const p = { info: '>', ok: '[OK]', err: '[ERR]', warn: '[WARN]', signal: '[AUTO]' };
    setLogs(prev => [...prev, `${p[t]} ${m}`].slice(-40));
  };

  const fetchTickerData = async (target: any): Promise<QualityTicker | null> => {
    try {
      let metrics: any = {};
      let profileData: any = {};
      let source = "FMP";

      // 1. Try FMP (Primary)
      if (!fmpDepleted && fmpKey) {
          try {
            const [ratioRes, profileRes] = await Promise.all([
                fetch(`https://financialmodelingprep.com/api/v3/ratios-ttm/${target.symbol}?apikey=${fmpKey}`),
                fetch(`https://financialmodelingprep.com/api/v3/profile/${target.symbol}?apikey=${fmpKey}`)
            ]);

            if (ratioRes.status === 429 || profileRes.status === 429) {
                setFmpDepleted(true);
                throw new Error("FMP_LIMIT");
            }

            if (ratioRes.ok && profileRes.ok) {
                const rData = await ratioRes.json();
                const pData = await profileRes.json();
                
                if (Array.isArray(rData) && rData.length > 0) metrics = rData[0];
                if (Array.isArray(pData) && pData.length > 0) profileData = pData[0];
            }
          } catch (e: any) {
             if (e.message === "FMP_LIMIT") source = "Fallback";
          }
      } else {
        source = "Fallback (Limit Hit)";
      }

      // If FMP failed or depleted, try Finnhub as fallback for basic metrics
      if (!metrics.returnOnEquityTTM && finnhubKey) {
          try {
             const fhRes = await fetch(`https://finnhub.io/api/v1/stock/metric?symbol=${target.symbol}&metric=all&token=${finnhubKey}`);
             if (fhRes.ok) {
                 const fhData = await fhRes.json();
                 if (fhData.metric) {
                     metrics = {
                         returnOnEquityTTM: fhData.metric.roeTTM,
                         peRatioTTM: fhData.metric.peTTM,
                         debtEquityRatioTTM: fhData.metric.totalDebtToEquityTTM,
                         priceToBookRatioTTM: fhData.metric.pbTTM
                     };
                     profileData = {
                         sector: target.sector || 'Unknown',
                         industry: 'Unknown',
                         mktCap: fhData.metric.marketCapitalization * 1000000
                     };
                     source = "Finnhub";
                 }
             }
          } catch (e) {}
      }

      // Calculate Quality Score
      let score = 0;
      const roe = metrics.returnOnEquityTTM || 0;
      const de = metrics.debtEquityRatioTTM || 1; // Default to 1 to penalize if unknown
      const per = metrics.peRatioTTM || 50; 
      
      // Basic Quality Factors
      if (roe > 0.15) score += 30;
      else if (roe > 0.08) score += 15;
      
      if (de < 0.5) score += 30;
      else if (de < 1.0) score += 15;
      
      if (per > 0 && per < 25) score += 20;
      
      const mktCap = profileData.mktCap || target.marketCap || 0;
      if (mktCap > 10000000000) score += 20; // Large Cap bias for quality
      else if (mktCap > 2000000000) score += 10;

      // Filter threshold (soft) - Only return if it has some merit
      if (score < 30) return null; 

      return {
        symbol: target.symbol,
        name: profileData.companyName || target.name || target.symbol,
        price: target.price,
        volume: target.volume,
        marketValue: mktCap,
        type: 'Equity',
        per: per,
        pbr: metrics.priceToBookRatioTTM || 0,
        debtToEquity: de,
        roe: roe * 100, // Convert to %
        qualityScore: score,
        sector: profileData.sector || target.sector || 'Unknown',
        industry: profileData.industry || 'Unknown',
        lastUpdate: new Date().toISOString(),
        source
      };

    } catch (e) {
      return null;
    }
  };

  const executeDeepQualityScan = async () => {
    if (!accessToken) {
        addLog("Cloud Vault Not Connected.", "err");
        return;
    }
    
    setLoading(true);
    startTimeRef.current = Date.now();
    addLog("Phase 1: Retrieving Purified Stage 1 Data...", "info");
    setActiveBrain("Fundamental-Engine");

    try {
        // 1. Load Stage 1 Data
        const q = encodeURIComponent(`name contains 'STAGE1_PURIFIED_UNIVERSE' and trashed = false`);
        const listRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&orderBy=createdTime desc&pageSize=1`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        }).then(r => r.json());

        if (!listRes.files?.length) throw new Error("Stage 1 Data Missing. Run Preliminary Filter first.");

        const content = await fetch(`https://www.googleapis.com/drive/v3/files/${listRes.files[0].id}?alt=media`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        }).then(r => r.json());

        const candidates = content.investable_universe || [];
        // Limit to reasonable batch for stability if needed, or take all
        const batchSize = 1000; 
        const processingQueue = candidates.slice(0, batchSize); 
        
        addLog(`Ingested ${processingQueue.length} Candidates. Beginning Deep Quality Audit...`, "ok");
        setProgress({ current: 0, total: processingQueue.length });

        const elites: QualityTicker[] = [];
        const concurrency = 5; // Parallel requests
        
        for (let i = 0; i < processingQueue.length; i += concurrency) {
            const chunk = processingQueue.slice(i, i + concurrency);
            const promises = chunk.map((c: any) => fetchTickerData(c));
            const results = await Promise.all(promises);
            
            results.forEach(r => {
                if (r) elites.push(r);
            });
            
            setProgress(prev => ({ ...prev, current: Math.min(prev.total, i + concurrency) }));
            // Small delay to prevent complete API flooding
            await new Promise(r => setTimeout(r, 200));
        }

        // Sort by Quality Score
        elites.sort((a, b) => (b.qualityScore || 0) - (a.qualityScore || 0));

        addLog(`Audit Complete. ${elites.length} Elite Assets Identified.`, "ok");
        
        // Save to Stage 2
        addLog("Phase 2: Archiving Elite Universe to Vault...", "info");
        const folderId = await ensureFolder(accessToken, GOOGLE_DRIVE_TARGET.stage2SubFolder);
        const fileName = `STAGE2_ELITE_UNIVERSE_${new Date().toISOString().split('T')[0]}.json`;
        
        const payload = {
            manifest: { 
                version: "4.9.9", 
                source: listRes.files[0].name, 
                count: elites.length, 
                filterCriteria: "ROE/Debt/PER/Cap",
                timestamp: new Date().toISOString() 
            },
            elite_universe: elites
        };

        const meta = { name: fileName, parents: [folderId], mimeType: 'application/json' };
        const form = new FormData();
        form.append('metadata', new Blob([JSON.stringify(meta)], { type: 'application/json' }));
        form.append('file', new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));

        await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
            method: 'POST', headers: { 'Authorization': `Bearer ${accessToken}` }, body: form
        });

        addLog(`Success: Stage 2 Data Secure.`, "ok");
        
        if (autoStart && onComplete) {
            onComplete();
        }

    } catch (e: any) {
        addLog(`Critical Error: ${e.message}`, "err");
    } finally {
        setLoading(false);
        setActiveBrain("Standby");
    }
  };

  const ensureFolder = async (token: string, name: string) => {
    const q = encodeURIComponent(`name = '${name}' and '${GOOGLE_DRIVE_TARGET.rootFolderId}' in parents and trashed = false`);
    const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    }).then(r => r.json());
    if (res.files?.length > 0) return res.files[0].id;
    const create = await fetch(`https://www.googleapis.com/drive/v3/files`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, parents: [GOOGLE_DRIVE_TARGET.rootFolderId], mimeType: 'application/vnd.google-apps.folder' })
    }).then(r => r.json());
    return create.id;
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
      <div className="xl:col-span-3 space-y-6">
        <div className="glass-panel p-5 md:p-8 lg:p-10 rounded-[32px] md:rounded-[40px] border-t-2 border-t-purple-500 shadow-2xl bg-slate-900/40 relative overflow-hidden">
          
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-6 md:mb-10 gap-6">
            <div className="flex items-center space-x-6">
              <div className={`w-12 h-12 md:w-14 md:h-14 rounded-3xl bg-purple-600/10 flex items-center justify-center border border-purple-500/20 ${loading ? 'animate-pulse' : ''}`}>
                <svg className={`w-5 h-5 md:w-6 md:h-6 text-purple-500 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              </div>
              <div>
                <h2 className="text-xl md:text-3xl font-black text-white italic tracking-tighter uppercase leading-none">Deep_Quality_Node v4.9.9</h2>
                <div className="flex items-center space-x-3 mt-2">
                   <span className={`text-[8px] font-black px-2 py-0.5 rounded border uppercase tracking-widest ${loading ? 'border-purple-500/20 bg-purple-500/10 text-purple-400' : 'border-slate-500/20 bg-slate-500/10 text-slate-400'}`}>
                     {loading ? `Audit Engine: ${activeBrain}` : 'Fundamental Audit System Ready'}
                   </span>
                   {autoStart && <span className="text-[8px] px-2 py-0.5 bg-rose-600 text-white rounded font-black uppercase animate-pulse">AUTO PILOT</span>}
                </div>
              </div>
            </div>
            <button 
              onClick={executeDeepQualityScan} 
              disabled={loading}
              className={`w-full lg:w-auto px-8 py-4 md:px-12 md:py-5 bg-purple-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-purple-900/20 hover:scale-105 active:scale-95 transition-all disabled:opacity-50`}
            >
              {loading ? 'Running Deep Audit...' : 'Execute Quality Scan'}
            </button>
          </div>

          <div className="bg-black/40 p-6 md:p-8 rounded-3xl border border-white/5 mb-6 md:mb-10">
              <div className="flex justify-between items-center mb-6">
                <div>
                    <p className="text-[9px] font-black text-purple-400 uppercase tracking-widest">Audit Progress</p>
                    <p className="text-xl font-mono font-black text-white italic">{progress.current} / {progress.total} Assets</p>
                </div>
                <div className="text-right">
                    <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Estimated Time</p>
                    <p className="text-xl font-mono font-black text-white italic">{timeStats.eta}s</p>
                </div>
              </div>
              <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full bg-purple-500 transition-all duration-300" style={{ width: `${(progress.current / (progress.total || 1)) * 100}%` }}></div>
              </div>
          </div>
        </div>
      </div>

      <div className="xl:col-span-1">
        <div className="glass-panel h-[400px] lg:h-[720px] rounded-[32px] md:rounded-[40px] bg-slate-950 border-l-4 border-l-purple-600 flex flex-col p-6 shadow-2xl overflow-hidden">
          <div className="flex items-center justify-between mb-8 px-2">
            <h3 className="font-black text-white text-[10px] uppercase tracking-[0.4em] italic">Audit_Terminal</h3>
          </div>
          <div ref={logRef} className="flex-1 bg-black/70 p-6 rounded-[32px] font-mono text-[9px] text-purple-300/60 overflow-y-auto no-scrollbar space-y-4 border border-white/5">
            {logs.map((l, i) => (
              <div key={i} className={`pl-4 border-l-2 transition-all duration-300 ${l.includes('[OK]') ? 'border-emerald-500 text-emerald-400 bg-emerald-500/5' : l.includes('[WARN]') ? 'border-amber-500 text-amber-400 bg-amber-500/5' : l.includes('[AUTO]') ? 'border-rose-500 text-rose-400' : 'border-purple-900'}`}>
                {l}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DeepQualityFilter;