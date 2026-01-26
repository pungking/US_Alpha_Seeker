import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI } from "@google/genai";
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
  sector?: string;
  industry?: string;
  lastUpdate: string;
  source?: string; // Data source for audit
}

const DeepQualityFilter: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [processedData, setProcessedData] = useState<QualityTicker[]>([]);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [activeBrain, setActiveBrain] = useState<string>('Standby');
  const [networkStatus, setNetworkStatus] = useState<string>('Ready: Triple-Core Engine');
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  
  // Circuit Breaker State
  const [finnhubCooldownUntil, setFinnhubCooldownUntil] = useState<number>(0);
  const [cooldownRemaining, setCooldownRemaining] = useState<number>(0);

  const [logs, setLogs] = useState<string[]>(['> Quality_Node v3.0.0: Circuit Breaker Visualizer Active.']);
  
  const accessToken = sessionStorage.getItem('gdrive_access_token');
  const finnhubKey = API_CONFIGS.find(c => c.provider === ApiProvider.FINNHUB)?.key;
  const polygonKey = API_CONFIGS.find(c => c.provider === ApiProvider.POLYGON)?.key;
  const fmpKey = API_CONFIGS.find(c => c.provider === ApiProvider.FMP)?.key;
  
  const logRef = useRef<HTMLDivElement>(null);

  // 병렬 처리 설정
  const BATCH_SIZE = 5; 
  const TARGET_COUNT = 500; 
  
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  // Circuit Breaker Timer & Status Updater
  useEffect(() => {
    let interval: any;
    if (finnhubCooldownUntil > 0) {
        interval = setInterval(() => {
            const left = Math.ceil((finnhubCooldownUntil - Date.now()) / 1000);
            if (left <= 0) {
                setFinnhubCooldownUntil(0);
                setCooldownRemaining(0);
                setNetworkStatus("Restored: Poly + Finn + FMP");
            } else {
                setCooldownRemaining(left);
                setNetworkStatus("Traffic Rerouted: FMP Priority");
            }
        }, 1000);
    } else {
        setCooldownRemaining(0);
    }
    return () => clearInterval(interval);
  }, [finnhubCooldownUntil]);

  const addLog = (m: string, t: 'info' | 'ok' | 'err' | 'warn' = 'info') => {
    const p = { info: '>', ok: '[OK]', err: '[ERR]', warn: '[WARN]' };
    setLogs(prev => [...prev, `${p[t]} ${m}`].slice(-40));
  };

  const sanitizeJson = (text: string) => {
    try {
      let clean = text.replace(/```json/g, "").replace(/```/g, "").trim();
      const first = clean.indexOf('{');
      const last = clean.lastIndexOf('}');
      if (first !== -1 && last !== -1) return JSON.parse(clean.substring(first, last + 1));
      return JSON.parse(clean);
    } catch (e) { return null; }
  };

  const fetchTickerData = async (target: any): Promise<QualityTicker | null> => {
    try {
      let metrics: any = {};
      let metricsSource = "";
      
      // Circuit Breaker Logic
      const isFinnhubAvailable = Date.now() > finnhubCooldownUntil;

      // --- Step 1: Metrics Acquisition ---
      // Primary: Finnhub (if available)
      if (isFinnhubAvailable) {
        try {
            const fhRes = await fetch(`https://finnhub.io/api/v1/stock/metric?symbol=${target.symbol}&metric=all&token=${finnhubKey}`);
            if (fhRes.status === 429) {
                // Trigger Circuit Breaker: Block Finnhub for 60 seconds
                const cooldownEnd = Date.now() + 60000;
                setFinnhubCooldownUntil(cooldownEnd); 
                throw new Error("FINNHUB_LIMIT_TRIGGER");
            }
            if (fhRes.ok) {
                const data = await fhRes.json();
                metrics = {
                    per: data.metric?.peNormalized || 0,
                    pbr: data.metric?.pbAnnual || 0,
                    debt: data.metric?.totalDebtEquityRatioQuarterly || 0,
                    roe: data.metric?.roeTTM || 0
                };
                metricsSource = "Finnhub";
            }
        } catch (e: any) {
            if (e.message !== "FINNHUB_LIMIT_TRIGGER") {
               // Silent fail for other network errors, try FMP
            }
        }
      }

      // Failover / Circuit Breaker Active: Use FMP
      if (!metrics.per) {
         try {
            const fmpRes = await fetch(`https://financialmodelingprep.com/api/v3/ratios-ttm/${target.symbol}?apikey=${fmpKey}`);
            if (fmpRes.ok) {
                const data = await fmpRes.json();
                if (data && data.length > 0) {
                    const m = data[0];
                    metrics = {
                        per: m.peRatioTTM || 0,
                        pbr: m.priceToBookRatioTTM || 0,
                        debt: m.debtEquityRatioTTM || 0,
                        roe: (m.returnOnEquityTTM || 0) * 100
                    };
                    metricsSource = isFinnhubAvailable ? "FMP(Failover)" : "FMP(CircuitBreaker)";
                }
            }
         } catch (fmpErr) {
            // Both failed
         }
      }

      // --- Step 2: Profile Acquisition ---
      let profileData: any = {};
      let profileSource = "";

      // 1. Polygon (Fastest)
      try {
          const polyRes = await fetch(`https://api.polygon.io/v3/reference/tickers/${target.symbol}?apiKey=${polygonKey}`);
          if (polyRes.ok) {
              const p = await polyRes.json();
              if (p.results) {
                  profileData = {
                      name: p.results.name,
                      sector: p.results.sic_description || p.results.type || "Unknown",
                  };
                  profileSource = "Polygon";
              }
          }
      } catch (err) {}

      // 2. FMP (Backup)
      if (!profileData.name) {
          try {
             const fmpPRes = await fetch(`https://financialmodelingprep.com/api/v3/profile/${target.symbol}?apikey=${fmpKey}`);
             if (fmpPRes.ok) {
                 const d = await fmpPRes.json();
                 if (d && d.length > 0) {
                     profileData = {
                         name: d[0].companyName,
                         sector: d[0].sector,
                     };
                     profileSource = "FMP";
                 }
             }
          } catch (err) {}
      }

      // 3. Finnhub (Last Resort - check CB)
      if (!profileData.name && isFinnhubAvailable) {
         try {
             const fhPRes = await fetch(`https://finnhub.io/api/v1/stock/profile2?symbol=${target.symbol}&token=${finnhubKey}`);
             if (fhPRes.status === 429) {
                 setFinnhubCooldownUntil(Date.now() + 60000); // Extend cooldown
             } else if (fhPRes.ok) {
                 const d = await fhPRes.json();
                 profileData = { name: d.name, sector: d.finnhubIndustry };
                 profileSource = "Finnhub";
             }
         } catch(err) {}
      }

      // Final Validation
      if ((!metrics.per && !metrics.roe) || !profileData.name) return null;

      return {
        symbol: target.symbol,
        name: profileData.name || target.name || "N/A",
        price: target.price, 
        volume: target.volume, 
        marketValue: target.marketValue || (target.price * target.volume),
        type: "Equity", 
        per: metrics.per,
        pbr: metrics.pbr, 
        debtToEquity: metrics.debt,
        roe: metrics.roe, 
        sector: profileData.sector || "N/A",
        industry: profileData.sector || "N/A", 
        lastUpdate: new Date().toISOString(),
        source: `M:${metricsSource}/P:${profileSource}`
      };

    } catch (e: any) {
      return null;
    }
  };

  const analyzeSectorDistribution = async (tickers: QualityTicker[]) => {
    const prompt = `
    [Role: Senior Market Analyst]
    Action: Analyze the Sector/Industry distribution of these top ${TARGET_COUNT} filtered stocks.
    Data Sample (Top 5): ${JSON.stringify(tickers.slice(0, 5).map(t => ({s: t.symbol, sec: t.sector, roe: t.roe})))}
    Total Count: ${tickers.length}
    
    Task:
    1. Identify the dominant sector in this quality list.
    2. Provide a brief 1-sentence insight on where the "Smart Money" is flowing based on this list.
    
    Return JSON: { "dominantSector": "string", "insight": "string (Korean)" }
    `;
    
    try {
        setActiveBrain("Gemini 3 Flash");
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: prompt,
            config: { responseMimeType: "application/json" }
        });
        const result = sanitizeJson(response.text);
        if (result) {
            setAiAnalysis(result.insight);
            addLog(`AI Insight: ${result.insight}`, "ok");
        }
    } catch (e) {
        addLog("AI Analysis Skipped (Speed Mode)", "warn");
    }
  };

  const executeDeepQualityScan = async () => {
    if (!accessToken || loading) return;
    setLoading(true);
    setProcessedData([]);
    setAiAnalysis(null);
    setActiveBrain('Processing');
    setFinnhubCooldownUntil(0); // Reset cooldown on new run
    addLog("Phase 1: Loading Stage 1 Purified Universe...", "info");

    try {
      const q = encodeURIComponent(`name contains 'STAGE1_PURIFIED_UNIVERSE' and trashed = false`);
      const listRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&orderBy=createdTime desc&pageSize=1`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      }).then(r => r.json());

      if (!listRes.files?.length) {
        addLog("Stage 1 source missing. Run Stage 1 first.", "err");
        setLoading(false);
        return;
      }

      const content = await fetch(`https://www.googleapis.com/drive/v3/files/${listRes.files[0].id}?alt=media`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      }).then(r => r.json());

      let targets = content.investable_universe || [];
      
      // Optimization: Sort by Volume * Price (Liquidity) and take TOP 500
      targets = targets
        .map((t: any) => ({ ...t, marketValue: t.price * t.volume }))
        .sort((a: any, b: any) => b.marketValue - a.marketValue)
        .slice(0, TARGET_COUNT);

      addLog(`Target Locked: Top ${targets.length} Liquid Assets. Engine Active.`, "ok");
      setProgress({ current: 0, total: targets.length });
      setNetworkStatus("Hybrid: Poly + Finn + FMP");

      const validResults: QualityTicker[] = [];
      let currentIndex = 0;
      let circuitBreakerLogged = false;

      while (currentIndex < targets.length) {
          const batch = targets.slice(currentIndex, currentIndex + BATCH_SIZE);
          
          try {
              // Parallel Execution
              const promises = batch.map((t: any) => fetchTickerData(t));
              const results = await Promise.all(promises);
              
              results.forEach(r => {
                  if (r && r.symbol) validResults.push(r);
              });
              
              if (Date.now() < finnhubCooldownUntil && !circuitBreakerLogged) {
                  addLog("Finnhub 429 Detected. Circuit Breaker Active. Routing to FMP.", "warn");
                  circuitBreakerLogged = true;
              }

              currentIndex += BATCH_SIZE;
              setProgress({ current: Math.min(currentIndex, targets.length), total: targets.length });
              
              await new Promise(r => setTimeout(r, 200));

          } catch (e: any) {
              addLog(`Batch Failed (${e.message}). Skipping...`, "err");
              currentIndex += BATCH_SIZE;
          }
      }

      setProcessedData(validResults);
      addLog(`Scan Complete. ${validResults.length} Assets Validated.`, "ok");
      setNetworkStatus("Status: Scan Complete");

      // AI Analysis on Result
      await analyzeSectorDistribution(validResults);

      // Upload
      const folderId = await ensureFolder(accessToken, GOOGLE_DRIVE_TARGET.stage2SubFolder);
      const fileName = `STAGE2_ELITE_UNIVERSE_${new Date().toISOString().split('T')[0]}.json`;
      const payload = {
        manifest: { version: "3.0.0", strategy: "Smart_Circuit_Breaker", count: validResults.length, timestamp: new Date().toISOString() },
        elite_universe: validResults
      };

      const meta = { name: fileName, parents: [folderId], mimeType: 'application/json' };
      const form = new FormData();
      form.append('metadata', new Blob([JSON.stringify(meta)], { type: 'application/json' }));
      form.append('file', new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));

      await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST', headers: { 'Authorization': `Bearer ${accessToken}` }, body: form
      });

      addLog(`Vault Finalized: ${fileName}`, "ok");

    } catch (e: any) {
      addLog(`Critical Error: ${e.message}`, "err");
    } finally {
      setLoading(false);
      setActiveBrain('Standby');
      setNetworkStatus('Standby');
      setFinnhubCooldownUntil(0);
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
        <div className="glass-panel p-8 md:p-10 rounded-[40px] border-t-2 border-t-blue-500 shadow-2xl bg-slate-900/40 relative overflow-hidden">
          
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-10 gap-6">
            <div className="flex items-center space-x-6">
              <div className={`w-14 h-14 rounded-3xl bg-blue-600/10 flex items-center justify-center border border-blue-500/20 ${loading ? 'animate-pulse' : ''}`}>
                 <svg className={`w-6 h-6 text-blue-400 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
              </div>
              <div>
                <h2 className="text-3xl font-black text-white italic tracking-tighter uppercase leading-none">Deep_Quality v3.0.0</h2>
                <div className="flex flex-col mt-2 gap-1">
                   <div className="flex items-center space-x-2">
                        <span className={`text-[8px] font-black px-2 py-0.5 rounded border uppercase tracking-widest ${loading ? 'border-blue-400 text-blue-400 animate-pulse' : 'border-blue-500/20 bg-blue-500/10 text-blue-400'}`}>
                            {loading ? `Scanning: ${progress.current}/${progress.total}` : 'Smart Circuit Breaker Ready'}
                        </span>
                        <span className={`text-[8px] font-black px-2 py-0.5 rounded border uppercase tracking-widest transition-all duration-300 ${
                            cooldownRemaining > 0 
                            ? 'border-amber-500/20 bg-amber-500/10 text-amber-400 animate-pulse' 
                            : 'border-purple-500/20 bg-purple-500/10 text-purple-400'
                        }`}>
                            {networkStatus}
                        </span>
                   </div>
                   
                   {/* Circuit Breaker Visualizer Bar */}
                   {cooldownRemaining > 0 && (
                       <div className="flex items-center space-x-2 animate-in fade-in slide-in-from-top-1">
                           <div className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping"></div>
                           <span className="text-[8px] font-black text-amber-500 uppercase tracking-widest bg-amber-950/40 px-2 py-0.5 rounded border border-amber-500/20">
                               CIRCUIT BREAKER: FINNHUB PAUSED ({cooldownRemaining}s)
                           </span>
                       </div>
                   )}
                </div>
              </div>
            </div>
            <button onClick={executeDeepQualityScan} disabled={loading} className="px-12 py-5 bg-blue-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-blue-900/20 hover:scale-105 active:scale-95 transition-all">
              {loading ? 'Processing Batch...' : 'Execute Smart Scan'}
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-10">
              <div className="bg-black/40 p-8 rounded-3xl border border-white/5">
                <div className="flex justify-between items-center mb-6">
                  <p className="text-[9px] font-black text-blue-400 uppercase tracking-widest">Processing Speed</p>
                  <p className="text-xl font-mono font-black text-white italic">{loading ? `${(progress.current / (progress.total || 1) * 100).toFixed(1)}%` : 'Idle'}</p>
                </div>
                <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                  <div className={`h-full transition-all duration-300 ${cooldownRemaining > 0 ? 'bg-amber-500' : 'bg-blue-500'}`} style={{ width: `${(progress.current / (progress.total || 1)) * 100}%` }}></div>
                </div>
                <p className="text-[8px] text-slate-500 mt-3 font-bold uppercase tracking-widest">
                   {cooldownRemaining > 0 ? 'Mode: FAILOVER PROTECTION (FMP Only)' : 'Mode: TRIPLE LOAD BALANCING'} • Target: Top {TARGET_COUNT} Assets
                </p>
              </div>

              <div className="bg-blue-900/10 p-8 rounded-3xl border border-blue-500/10 relative overflow-hidden">
                 <p className="text-[9px] font-black text-blue-400 uppercase tracking-widest mb-2">AI Sector Insight</p>
                 <p className="text-xs font-bold text-slate-300 leading-relaxed italic">
                    {aiAnalysis || "Awaiting Post-Scan Analysis..."}
                 </p>
                 {loading && <div className="absolute bottom-0 left-0 h-1 bg-blue-500 animate-pulse w-full"></div>}
              </div>
          </div>
        </div>
      </div>

      <div className="xl:col-span-1">
        <div className="glass-panel h-[600px] rounded-[40px] bg-slate-950 border-l-4 border-l-blue-600 flex flex-col p-6 shadow-2xl overflow-hidden">
          <div className="flex items-center justify-between mb-8 px-2">
            <h3 className="font-black text-white text-[10px] uppercase tracking-[0.4em] italic">Triple_Log</h3>
          </div>
          <div ref={logRef} className="flex-1 bg-black/70 p-6 rounded-[32px] font-mono text-[9px] text-blue-300/60 overflow-y-auto no-scrollbar space-y-4 border border-white/5">
            {logs.map((l, i) => (
              <div key={i} className={`pl-4 border-l-2 ${l.includes('[OK]') ? 'border-emerald-500 text-emerald-400' : l.includes('[WARN]') ? 'border-amber-500 text-amber-400' : l.includes('[ERR]') ? 'border-red-500 text-red-400' : 'border-blue-900'}`}>
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