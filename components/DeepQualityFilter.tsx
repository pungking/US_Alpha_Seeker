
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
  qualityScore?: number; // New Quality Metric
  sector?: string;
  industry?: string;
  lastUpdate: string;
  source?: string; // Data source for audit
}

const DeepQualityFilter: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [processedData, setProcessedData] = useState<QualityTicker[]>([]);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  
  // Time Tracking
  const [timeStats, setTimeStats] = useState({ elapsed: 0, eta: 0 });
  const startTimeRef = useRef<number>(0);

  const [activeBrain, setActiveBrain] = useState<string>('Standby');
  const [networkStatus, setNetworkStatus] = useState<string>('Ready: Adaptive Engine');
  
  // AI Status separate from main loading
  const [aiStatus, setAiStatus] = useState<'IDLE' | 'ANALYZING' | 'SUCCESS' | 'FAILED'>('IDLE');
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [sourceStats, setSourceStats] = useState({ fmp: 0, finnhub: 0, polygon: 0 });
  
  // 무료 플랜 상태 관리
  const [fmpDepleted, setFmpDepleted] = useState(false);
  
  const [logs, setLogs] = useState<string[]>(['> Quality_Node v4.9.9: Resilience Protocol Upgrade.']);
  
  const accessToken = sessionStorage.getItem('gdrive_access_token');
  const finnhubKey = API_CONFIGS.find(c => c.provider === ApiProvider.FINNHUB)?.key;
  const polygonKey = API_CONFIGS.find(c => c.provider === ApiProvider.POLYGON)?.key;
  const fmpKey = API_CONFIGS.find(c => c.provider === ApiProvider.FMP)?.key;
  
  const logRef = useRef<HTMLDivElement>(null);

  // [ADAPTIVE STRATEGY]
  const BATCH_SIZE = 5; 
  const DELAY_TURBO = 300;   
  const DELAY_SAFE = 4500;   
  const TARGET_SELECTION_COUNT = 500; 
  
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
      let profileData: any = {};
      let metricsSource = "";
      let profileSource = "";

      // 1. Try FMP (If not depleted)
      if (!fmpDepleted) {
          try {
            const [ratioRes, profileRes] = await Promise.all([
                fetch(`https://financialmodelingprep.com/api/v3/ratios-ttm/${target.symbol}?apikey=${fmpKey}`),
                fetch(`https://financialmodelingprep.com/api/v3/profile/${target.symbol}?apikey=${fmpKey}`)
            ]);

            if (ratioRes.status === 429 || profileRes.status === 429) {
                setFmpDepleted(true);
                throw new Error("FMP_LIMIT");
            }

            if (ratioRes.ok) {
                const data = await ratioRes.json();
                if (data && data['Error Message']) {
                    setFmpDepleted(true);
                    throw new Error("FMP_LIMIT");
                }
                if (data && Array.isArray(data) && data.length > 0) {
                    const m = data[0];
                    metrics = {
                        per: m.peRatioTTM || 0,
                        pbr: m.priceToBookRatioTTM || 0,
                        debt: m.debtEquityRatioTTM || 0,
                        roe: (m.returnOnEquityTTM || 0) * 100
                    };
                    metricsSource = "FMP";
                }
            }
            if (profileRes.ok) {
                const data = await profileRes.json();
                if (data && Array.isArray(data) && data.length > 0) {
                    const p = data[0];
                    profileData = { name: p.companyName, sector: p.sector, industry: p.industry };
                    profileSource = "FMP";
                }
            }
          } catch (e: any) {
             if (e.message === "FMP_LIMIT") throw e; 
          }
      }

      // 2. Fallback to Finnhub
      if (!metrics.per && !metrics.roe) {
          try {
            const fhRes = await fetch(`https://finnhub.io/api/v1/stock/metric?symbol=${target.symbol}&metric=all&token=${finnhubKey}`);
            if (fhRes.status === 429) {
                throw new Error("FINNHUB_LIMIT");
            } else if (fhRes.ok) {
                const data = await fhRes.json();
                metrics = {
                    per: data.metric?.peNormalized || 0,
                    pbr: data.metric?.pbAnnual || 0,
                    debt: data.metric?.totalDebtEquityRatioQuarterly || 0,
                    roe: data.metric?.roeTTM || 0
                };
                metricsSource = "Finnhub";
            }
          } catch(e: any) {
              if (e.message === "FINNHUB_LIMIT") throw e;
          }
      }

      // Profile Backup (Polygon)
      if (!profileData.name) {
          try {
            const polyRes = await fetch(`https://api.polygon.io/v3/reference/tickers/${target.symbol}?apiKey=${polygonKey}`);
            if (polyRes.ok) {
                const p = await polyRes.json();
                if (p.results) {
                    profileData = {
                        name: p.results.name,
                        sector: p.results.sic_description || "Unknown"
                    };
                    profileSource = "Polygon";
                }
            }
          } catch(e) {}
      }

      if ((!metrics.per && !metrics.roe)) return null;

      const roeScore = (metrics.roe || 0) * 2.0; 
      const debtPenalty = (metrics.debt || 0) * 0.5;
      const mktCapBonus = Math.min(20, Math.log10(target.marketValue || 1000000) * 2); 
      
      const qScore = roeScore - debtPenalty + mktCapBonus;

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
        qualityScore: qScore,
        sector: profileData.sector || "N/A",
        industry: profileData.industry || "N/A", 
        lastUpdate: new Date().toISOString(),
        source: `M:${metricsSource}/P:${profileSource}`
      };

    } catch (e: any) {
      if (e.message === "FINNHUB_LIMIT" || e.message === "FMP_LIMIT") throw e;
      return null;
    }
  };

  const analyzeSectorDistribution = async (tickers: QualityTicker[]) => {
    // 1. Initial State Set
    setAiStatus('ANALYZING');
    setAiAnalysis("📡 Gemini 3.0: Initializing Sector Analysis...");
    addLog("Initiating AI Sector Analysis...", "info");
    
    if (!tickers || tickers.length === 0) {
        setAiAnalysis("⚠️ Analysis Skipped: No Tickers Available.");
        setAiStatus('FAILED');
        return;
    }

    const prompt = `
    [Role: Senior Market Analyst]
    Action: Analyze the Sector/Industry distribution of these top filtered stocks.
    Data Sample (Top 5 by QualityScore): ${JSON.stringify(tickers.slice(0, 5).map(t => ({s: t.symbol, sec: t.sector, roe: t.roe, qScore: t.qualityScore})))}
    Total Count: ${tickers.length}
    
    Task:
    1. Identify the dominant sector in this quality list.
    2. Provide a brief 1-sentence insight on where the "Smart Money" is flowing based on this list.
    
    Return JSON: { "dominantSector": "string", "insight": "string (Korean)" }
    `;
    
    let result = null;
    let usedProvider = '';

    // Step A: Attempt Gemini with Smart Retry
    try {
        setActiveBrain("Gemini 3 Flash");
        const geminiConfig = API_CONFIGS.find(c => c.provider === ApiProvider.GEMINI);
        const apiKey = process.env.API_KEY || geminiConfig?.key || "";
        
        if (!apiKey) throw new Error("Gemini API Key Missing");

        const ai = new GoogleGenAI({ apiKey });
        
        const callGemini = async (retries = 1): Promise<any> => {
            try {
                return await ai.models.generateContent({
                    model: 'gemini-3-flash-preview',
                    contents: prompt,
                    config: { responseMimeType: "application/json" }
                });
            } catch (e: any) {
                // Retry only on Quota (429) or Overloaded (503) errors
                if (retries > 0 && (e.message.includes('429') || e.message.includes('Quota') || e.message.includes('503'))) {
                     const waitTime = 40000; // Increased to 40s to satisfy 36s requirement
                     addLog(`Gemini Quota Hit. Retrying in ${waitTime/1000}s...`, "warn");
                     await new Promise(r => setTimeout(r, waitTime));
                     return callGemini(retries - 1);
                }
                throw e;
            }
        };

        const response = await callGemini();
        result = sanitizeJson(response.text);
        usedProvider = "Gemini 3.0";
    } catch (e: any) {
        addLog(`Gemini Failed: ${e.message.slice(0,40)}... Switching to Fallback.`, "warn");
    }

    // Step B: Fallback to Perplexity (if Gemini failed)
    if (!result) {
        try {
            setActiveBrain("Perplexity Sonar");
            setAiAnalysis("📡 Switching to Perplexity Sonar (Standard)...");
            const perplexityKey = API_CONFIGS.find(c => c.provider === ApiProvider.PERPLEXITY)?.key || "";
            
            if (!perplexityKey) throw new Error("Perplexity Key Missing");

            const callPerplexity = async (url: string) => {
                  const res = await fetch(url, {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json', 
                        'Authorization': `Bearer ${perplexityKey}`,
                        'Accept': 'application/json' 
                    },
                    body: JSON.stringify({
                        model: 'sonar', // Use standard 'sonar' for better availability/cost
                        messages: [
                            { role: "system", content: "You are a financial data analyst. Return ONLY JSON." },
                            { role: "user", content: prompt }
                        ],
                        temperature: 0.1
                    })
                  });
                  if (!res.ok) throw new Error(`Status ${res.status}`);
                  return res.json();
            };

            let pData;
            try {
                // Attempt 1: Direct Call
                pData = await callPerplexity('https://api.perplexity.ai/chat/completions');
            } catch (err: any) {
                // Attempt 2: Proxy Call (fixes CORS)
                if (err.message.includes('Failed to fetch') || err.message.includes('Load failed')) {
                     addLog("CORS Blocked. Using Internal Proxy...", "warn");
                     pData = await callPerplexity('/api/perplexity');
                } else {
                    throw err;
                }
            }
            
            result = sanitizeJson(pData.choices?.[0]?.message?.content);
            usedProvider = "Perplexity Sonar";

        } catch (e: any) {
            addLog(`Perplexity Failed: ${e.message}`, "err");
        }
    }

    // Step C: Finalize
    if (result && result.insight) {
        const msg = `[${result.dominantSector}] ${result.insight}`;
        setAiAnalysis(`${usedProvider}: ${msg}`);
        setAiStatus('SUCCESS');
        addLog(`Analysis Complete via ${usedProvider}`, "ok");
    } else {
        // Ultimate Fallback
        const rawMsg = "Analysis unavailable due to network/quota limits.";
        setAiAnalysis("⚠️ " + rawMsg);
        setAiStatus('FAILED');
        addLog("All AI Providers Exhausted.", "err");
    }
  };

  // Manual Trigger Wrapper
  const handleManualAnalysis = () => {
      if (processedData.length > 0) {
          analyzeSectorDistribution(processedData);
      } else {
          addLog("Cannot run analysis: No data processed yet.", "warn");
      }
  };

  const executeDeepQualityScan = async () => {
    if (!accessToken) {
        addLog("Error: Google Drive Not Connected.", "err");
        return;
    }
    if (loading) return;

    setLoading(true);
    setAiStatus('IDLE');
    setAiAnalysis(null);
    startTimeRef.current = Date.now();
    setTimeStats({ elapsed: 0, eta: 0 });
    
    setProcessedData([]);
    setSourceStats({ fmp: 0, finnhub: 0, polygon: 0 });
    setFmpDepleted(false);
    setActiveBrain('Processing');
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
      const totalCandidates = targets.length;
      
      addLog(`Universe Loaded: ${totalCandidates} Candidates. Sorting by Liquidity...`, "info");
      targets.sort((a: any, b: any) => {
          const valA = (a.price || 0) * (a.volume || 0);
          const valB = (b.price || 0) * (b.volume || 0);
          return valB - valA;
      });

      addLog(`Starting Full Scan on ${totalCandidates} Assets. Mode: Adaptive Turbo.`, "ok");
      
      setProgress({ current: 0, total: totalCandidates });
      
      const validResults: QualityTicker[] = [];
      let currentIndex = 0;

      while (currentIndex < totalCandidates) {
          setNetworkStatus(fmpDepleted 
              ? `Safe Mode (Finnhub) - Delay ${DELAY_SAFE}ms` 
              : `Turbo Mode (FMP) - Delay ${DELAY_TURBO}ms`
          );

          const batch = targets.slice(currentIndex, currentIndex + BATCH_SIZE);
          
          try {
              const promises = batch.map((t: any) => fetchTickerData(t));
              const results = await Promise.all(promises);
              
              results.forEach(r => {
                  if (r && r.symbol) {
                      validResults.push(r);
                      setSourceStats(prev => {
                          const src = r.source || "";
                          return {
                              fmp: src.includes("M:FMP") ? prev.fmp + 1 : prev.fmp,
                              finnhub: src.includes("M:Finnhub") ? prev.finnhub + 1 : prev.finnhub,
                              polygon: src.includes("P:Polygon") ? prev.polygon + 1 : prev.polygon
                          };
                      });
                  }
              });

              currentIndex += BATCH_SIZE;
              setProgress({ current: Math.min(currentIndex, totalCandidates), total: totalCandidates });
              
              const currentDelay = fmpDepleted ? DELAY_SAFE : DELAY_TURBO;
              await new Promise(r => setTimeout(r, currentDelay));

          } catch (e: any) {
              if (e.message === "FMP_LIMIT") {
                  addLog(`FMP Limit Hit! Engaging Safe Mode (Finnhub)...`, "warn");
                  setFmpDepleted(true); 
                  await new Promise(r => setTimeout(r, 1000));
              } else if (e.message === "FINNHUB_LIMIT") {
                  addLog(`Finnhub Limit. Cooling down (10s)...`, "warn");
                  await new Promise(r => setTimeout(r, 10000));
              } else {
                  addLog(`Batch Error: ${e.message}`, "err");
                  currentIndex += BATCH_SIZE;
              }
          }
      }

      addLog(`Full Scan Complete. ${validResults.length} Assets Validated. Ranking by Quality Score...`, "info");
      
      const eliteSurvivors = validResults
          .sort((a, b) => (b.qualityScore || 0) - (a.qualityScore || 0)) 
          .slice(0, TARGET_SELECTION_COUNT);

      setProcessedData(eliteSurvivors);
      addLog(`Selection Finalized. Top ${eliteSurvivors.length} Alpha Candidates Ready.`, "ok");
      setNetworkStatus("Status: Scan Complete");

      // AI Analysis Trigger - Await to ensure it runs
      // Set initial status to show activity in UI
      setAiStatus('ANALYZING');
      setAiAnalysis("📡 Gemini 3.0: Initializing Sector Analysis...");
      addLog("Triggering AI Sector Analysis...", "info");
      
      // Do not await to allow main thread to finish loading state
      analyzeSectorDistribution(eliteSurvivors);

      // Upload
      const folderId = await ensureFolder(accessToken, GOOGLE_DRIVE_TARGET.stage2SubFolder);
      const fileName = `STAGE2_ELITE_UNIVERSE_${new Date().toISOString().split('T')[0]}.json`;
      const payload = {
        manifest: { version: "4.9.9", strategy: "Quality_First_Adaptive_Scan", source_count: totalCandidates, final_count: eliteSurvivors.length, timestamp: new Date().toISOString() },
        elite_universe: eliteSurvivors
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
      setFmpDepleted(false);
      startTimeRef.current = 0; // Reset timer
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

  const formatTime = (seconds: number) => {
    if (seconds === 0) return "--:--";
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
      <div className="xl:col-span-3 space-y-6">
        <div className="glass-panel p-5 md:p-8 lg:p-10 rounded-[32px] md:rounded-[40px] border-t-2 border-t-blue-500 shadow-2xl bg-slate-900/40 relative overflow-hidden">
          
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-6 md:mb-10 gap-6">
            <div className="flex items-center space-x-6">
              <div className={`w-12 h-12 md:w-14 md:h-14 rounded-3xl bg-blue-600/10 flex items-center justify-center border border-blue-500/20 ${loading ? 'animate-pulse' : ''}`}>
                 <svg className={`w-5 h-5 md:w-6 md:h-6 text-blue-400 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
              </div>
              <div>
                <h2 className="text-xl md:text-3xl font-black text-white italic tracking-tighter uppercase leading-none">Deep_Quality v4.9.9</h2>
                <div className="flex flex-col mt-2 gap-1">
                   <div className="flex flex-wrap items-center gap-2">
                        <span className={`text-[8px] font-black px-2 py-0.5 rounded border uppercase tracking-widest ${loading ? 'border-blue-400 text-blue-400 animate-pulse' : 'border-blue-500/20 bg-blue-500/10 text-blue-400'}`}>
                            {loading ? `Scanning: ${progress.current}/${progress.total}` : 'Adaptive Engine Ready'}
                        </span>
                        <span className={`text-[8px] font-black px-2 py-0.5 rounded border uppercase tracking-widest transition-all duration-300 ${
                            fmpDepleted
                            ? 'border-amber-500/20 bg-amber-500/10 text-amber-400 animate-pulse' 
                            : 'border-purple-500/20 bg-purple-500/10 text-purple-400'
                        }`}>
                            {networkStatus}
                        </span>
                   </div>
                   
                   {/* Time Stats */}
                   {loading && (
                     <div className="flex items-center space-x-2 mt-0.5">
                       <span className="text-[8px] font-mono font-bold text-slate-400 uppercase">
                         Elapsed: <span className="text-white">{formatTime(timeStats.elapsed)}</span>
                       </span>
                       <span className="text-[8px] font-mono font-bold text-slate-500">|</span>
                       <span className="text-[8px] font-mono font-bold text-slate-400 uppercase">
                         ETA: <span className="text-emerald-400">{formatTime(timeStats.eta)}</span>
                       </span>
                     </div>
                   )}
                   
                   {fmpDepleted && (
                       <div className="flex items-center space-x-2 animate-in fade-in slide-in-from-top-1 mt-1">
                           <div className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping"></div>
                           <span className="text-[8px] font-black text-amber-500 uppercase tracking-widest bg-amber-950/40 px-2 py-0.5 rounded border border-amber-500/20">
                               FMP LIMIT - SAFE MODE ACTIVE
                           </span>
                       </div>
                   )}
                </div>
              </div>
            </div>
            <button onClick={executeDeepQualityScan} disabled={loading} className="w-full lg:w-auto px-8 md:px-12 py-4 md:py-5 bg-blue-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-blue-900/20 hover:scale-105 active:scale-95 transition-all">
              {loading ? 'Scanning & Scoring...' : 'Start Full Quality Scan'}
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-8 mb-6 md:mb-10">
              <div className="bg-black/40 p-6 md:p-8 rounded-3xl border border-white/5">
                <div className="flex justify-between items-center mb-6">
                  <p className="text-[9px] font-black text-blue-400 uppercase tracking-widest">Global Scan Progress</p>
                  <p className="text-xl font-mono font-black text-white italic">{loading ? `${(progress.current / (progress.total || 1) * 100).toFixed(1)}%` : 'Idle'}</p>
                </div>
                <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                  <div className={`h-full transition-all duration-300 ${fmpDepleted ? 'bg-amber-500' : 'bg-blue-500'}`} style={{ width: `${(progress.current / (progress.total || 1)) * 100}%` }}></div>
                </div>
                <p className="text-[8px] text-slate-500 mt-3 font-bold uppercase tracking-widest">
                   {fmpDepleted ? 'Status: Safe Mode (Slower for Accuracy)' : 'Status: Turbo Mode (Maximum Speed)'} • Target: Top {TARGET_SELECTION_COUNT} Quality
                </p>
              </div>

              <div className={`bg-blue-900/10 p-6 md:p-8 rounded-3xl border relative overflow-hidden group transition-colors ${aiStatus === 'ANALYZING' ? 'border-blue-500/50' : aiStatus === 'SUCCESS' ? 'border-emerald-500/50' : 'border-blue-500/10'}`}>
                 <div className="flex justify-between items-center mb-2">
                    <p className={`text-[9px] font-black uppercase tracking-widest ${aiStatus === 'SUCCESS' ? 'text-emerald-400' : 'text-blue-400'}`}>AI Sector Insight</p>
                    {/* Retry Button visible if processedData exists but no analysis */}
                    {!loading && processedData.length > 0 && (
                        <button 
                            onClick={handleManualAnalysis}
                            className="text-[8px] px-2 py-1 bg-blue-600/20 hover:bg-blue-600 text-blue-300 hover:text-white rounded transition-colors uppercase font-bold border border-blue-500/20"
                        >
                            Retry Analysis
                        </button>
                    )}
                 </div>
                 <p className={`text-xs font-bold leading-relaxed italic ${aiAnalysis ? 'text-white' : 'text-slate-500'}`}>
                    {aiAnalysis || "Awaiting Post-Scan Analysis (Runs after scan completes)..."}
                 </p>
                 {aiStatus === 'ANALYZING' && <div className="absolute bottom-0 left-0 h-1 bg-blue-500 animate-pulse w-full"></div>}
                 {aiStatus === 'SUCCESS' && <div className="absolute bottom-0 left-0 h-1 bg-emerald-500 w-full"></div>}
              </div>
          </div>
        </div>
      </div>

      <div className="xl:col-span-1">
        <div className="glass-panel h-[400px] lg:h-[600px] rounded-[32px] md:rounded-[40px] bg-slate-950 border-l-4 border-l-blue-600 flex flex-col p-6 shadow-2xl overflow-hidden">
          <div className="flex items-center justify-between mb-8 px-2">
            <h3 className="font-black text-white text-[10px] uppercase tracking-[0.4em] italic">Ticker_Log</h3>
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
