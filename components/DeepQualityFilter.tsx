
import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI } from "@google/genai";
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, ReferenceLine, LabelList } from 'recharts';
import { GOOGLE_DRIVE_TARGET, API_CONFIGS } from '../constants';
import { ApiProvider } from '../types';
import { trackUsage } from '../services/intelligenceService';

// [Advanced Data Structure]
interface QualityTicker {
  symbol: string;
  name: string;
  price: number;
  volume: number;
  marketValue: number;
  
  // 3-Factor Scores
  profitabilityScore: number; // ROE, OPM
  stabilityScore: number;     // Debt/Eq, Current Ratio
  growthScore: number;        // P/E expansion potential, PEG
  qualityScore: number;       // Weighted Average

  // Raw Metrics
  per: number;
  pbr: number;
  debtToEquity: number;
  roe: number;
  
  // Meta
  sector: string;
  industry: string;
  lastUpdate: string;
  source: string;
  
  // AI Value Trap Flag
  isValueTrap?: boolean;
  aiNote?: string;
}

interface Props {
  autoStart?: boolean;
  onComplete?: () => void;
}

// [CACHE SYSTEM] Daily Session Cache Key
const getDailyCacheKey = (symbol: string) => {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    return `QUALITY_CACHE_REAL_v2_${symbol}_${today}`;
};

const DeepQualityFilter: React.FC<Props> = ({ autoStart, onComplete }) => {
  const [loading, setLoading] = useState(false);
  const [processedData, setProcessedData] = useState<QualityTicker[]>([]);
  const [progress, setProgress] = useState({ current: 0, total: 0, cacheHits: 0, filteredOut: 0 });
  
  // Time Tracking
  const [timeStats, setTimeStats] = useState({ elapsed: 0, eta: 0 });
  const startTimeRef = useRef<number>(0);

  const [activeBrain, setActiveBrain] = useState<string>('Standby');
  const [networkStatus, setNetworkStatus] = useState<string>('Ready: Real-Data Quant Engine');
  
  // AI Status
  const [aiStatus, setAiStatus] = useState<'IDLE' | 'ANALYZING' | 'SUCCESS' | 'FAILED'>('IDLE');
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  
  // Free Plan Logic
  const [fmpDepleted, setFmpDepleted] = useState(false);
  
  const [logs, setLogs] = useState<string[]>(['> Quality_Node v5.2.0: Strict Real-Data Protocol Online.']);
  
  const accessToken = sessionStorage.getItem('gdrive_access_token');
  const finnhubKey = API_CONFIGS.find(c => c.provider === ApiProvider.FINNHUB)?.key;
  const polygonKey = API_CONFIGS.find(c => c.provider === ApiProvider.POLYGON)?.key;
  const fmpKey = API_CONFIGS.find(c => c.provider === ApiProvider.FMP)?.key;
  
  const logRef = useRef<HTMLDivElement>(null);

  // [ADAPTIVE STRATEGY]
  const BATCH_SIZE = 8; // Increased batch for Yahoo efficiency
  const DELAY_TURBO = 300;   
  const DELAY_SAFE = 2000;   
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
        
        let etaSec = 0;
        if (progress.current > 0 && progress.total > 0) {
           const rate = progress.current / elapsedSec; 
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
        addLog("AUTO-PILOT: Engaging Strict Deep Quality Filter...", "signal");
        executeDeepQualityScan();
    }
  }, [autoStart]);

  const addLog = (m: string, t: 'info' | 'ok' | 'err' | 'warn' | 'signal' = 'info') => {
    const p = { info: '>', ok: '[OK]', err: '[ERR]', warn: '[WARN]', signal: '[AUTO]' };
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

  // [NEW] Advanced Scoring Logic (Strict Real Data)
  const calculateQuantScores = (metrics: any, price: number, marketCap: number) => {
      // 1. Profitability (Earnings Power)
      // ROE: Higher is better. >15% is good.
      const roeScore = Math.min(100, Math.max(0, (metrics.roe || 0) * 4)); 
      const profitScore = roeScore;

      // 2. Stability (Safety)
      // Debt/Eq: Lower is better. <1.0 is safe.
      const debt = metrics.debt || 1.0;
      const debtScore = Math.max(0, 100 - (debt * 30)); // 1.0 debt -> 70 score. 3.0 debt -> 10 score.
      const stabilityScore = debtScore;

      // 3. Growth/Value (Upside)
      // PER: 10~25 is ideal. <10 is cheap but risky. >50 is expensive.
      const per = metrics.per || 25;
      let valScore = 50;
      if (per > 0 && per < 10) valScore = 90; // Deep Value
      else if (per >= 10 && per < 25) valScore = 80; // Reasonable
      else if (per >= 25 && per < 50) valScore = 60; // Growth priced
      else if (per >= 50) valScore = 40; // Expensive
      else valScore = 30; // Negative PE (Loss)
      
      const growthScore = valScore;

      // Weighted Quality Score
      const qualityScore = Number(((profitScore * 0.4) + (stabilityScore * 0.3) + (growthScore * 0.3)).toFixed(2));

      return { profitScore, stabilityScore, growthScore, qualityScore };
  };

  const fetchTickerData = async (target: any): Promise<QualityTicker | null> => {
    if (!target || !target.symbol) return null;
    
    // [CACHE CHECK]
    const cacheKey = getDailyCacheKey(target.symbol);
    const cachedRaw = sessionStorage.getItem(cacheKey);
    if (cachedRaw) {
        try {
            const cachedData = JSON.parse(cachedRaw);
            setProgress(prev => ({ ...prev, cacheHits: prev.cacheHits + 1 }));
            return cachedData;
        } catch(e) { sessionStorage.removeItem(cacheKey); }
    }

    try {
      let metrics: any = {};
      let profileData: any = {};
      let metricsSource = "";
      
      // 1. Try Yahoo Finance Proxy (PRIMARY - FREE & ROBUST)
      try {
          const yRes = await fetch(`/api/yahoo?symbols=${target.symbol}`);
          if (yRes.ok) {
              const yData = await yRes.json();
              if (yData && yData.length > 0) {
                  const y = yData[0];
                  // Strict Check: Must have fundamental data
                  if (y.trailingPE || y.returnOnEquity || y.priceToBook) {
                      metrics = {
                          per: y.trailingPE || y.forwardPE,
                          pbr: y.priceToBook,
                          roe: (y.returnOnEquity || 0) * 100, // Convert decimal to %
                          debt: (y.debtToEquity || 0) / 100   // Yahoo sends % (e.g. 150), we need ratio (1.5)
                      };
                      profileData = { name: y.name };
                      metricsSource = "Yahoo";
                  }
              }
          }
      } catch (e) { /* Yahoo Fail */ }

      // 2. Try FMP (If Yahoo missing or FMP preferred)
      if ((!metrics.per || !metrics.roe) && !fmpDepleted) {
          try {
            const ratioRes = await fetch(`https://financialmodelingprep.com/api/v3/ratios-ttm/${target.symbol}?apikey=${fmpKey}`);
            
            if (ratioRes.status === 429) {
                setFmpDepleted(true);
                throw new Error("FMP_LIMIT");
            }

            if (ratioRes.ok) {
                const data = await ratioRes.json();
                if (data && Array.isArray(data) && data.length > 0) {
                    const m = data[0];
                    metrics = {
                        per: Number(m.peRatioTTM),
                        pbr: Number(m.priceToBookRatioTTM),
                        debt: Number(m.debtEquityRatioTTM),
                        roe: Number(m.returnOnEquityTTM) * 100
                    };
                    metricsSource = "FMP";
                }
            }
          } catch (e: any) {
             if (e.message === "FMP_LIMIT") throw e; 
          }
      }

      // 3. Fallback to Finnhub
      if (!metrics.per && !metrics.roe) {
          try {
            const fhRes = await fetch(`https://finnhub.io/api/v1/stock/metric?symbol=${target.symbol}&metric=all&token=${finnhubKey}`);
            if (fhRes.status === 429) {
                throw new Error("FINNHUB_LIMIT");
            } else if (fhRes.ok) {
                const data = await fhRes.json();
                metrics = {
                    per: Number(data.metric?.peNormalized),
                    pbr: Number(data.metric?.pbAnnual),
                    debt: Number(data.metric?.totalDebtEquityRatioQuarterly),
                    roe: Number(data.metric?.roeTTM)
                };
                metricsSource = "Finnhub";
            }
          } catch(e: any) {
              if (e.message === "FINNHUB_LIMIT") throw e;
          }
      }

      // [CRITICAL STRICT FILTER]
      // If we STILL don't have valid PE or ROE, we MUST skip this stock.
      // Do NOT insert fake default values.
      if (!metrics.per || !metrics.roe || isNaN(metrics.per)) {
          return null;
      }

      const price = Number(target.price) || 0;
      const volume = Number(target.volume) || 0;
      const safeMarketValue = Number(target.marketValue || (price * volume)) || 1000000; 

      // Calculate Advanced 3-Factor Scores
      const scores = calculateQuantScores(metrics, price, safeMarketValue);

      const resultTicker: QualityTicker = {
        symbol: target.symbol,
        name: profileData.name || target.name || target.symbol,
        price: price, 
        volume: volume, 
        marketValue: safeMarketValue,
        
        profitabilityScore: scores.profitScore,
        stabilityScore: scores.stabilityScore,
        growthScore: scores.growthScore,
        qualityScore: scores.qualityScore,

        per: metrics.per,
        pbr: metrics.pbr, 
        debtToEquity: metrics.debt,
        roe: metrics.roe,
        
        sector: target.sector || "Unknown",
        industry: target.industry || "Unknown", 
        lastUpdate: new Date().toISOString(),
        source: metricsSource
      };
      
      // [CACHE SAVE]
      try {
          sessionStorage.setItem(cacheKey, JSON.stringify(resultTicker));
      } catch(e) { /* Quota exceeded, ignore */ }

      return resultTicker;

    } catch (e: any) {
      if (e.message === "FINNHUB_LIMIT" || e.message === "FMP_LIMIT") throw e;
      return null;
    }
  };

  const analyzeValueTrapsAndSectors = async (tickers: QualityTicker[]) => {
    setAiStatus('ANALYZING');
    setAiAnalysis("📡 Gemini 3.0: Scanning for Value Traps & Sector Trends...");
    addLog("Initiating AI Value Trap Detection...", "info");
    
    if (!tickers || tickers.length === 0) {
        setAiAnalysis("⚠️ Analysis Skipped: No Tickers.");
        setAiStatus('FAILED');
        return;
    }

    const top5 = tickers.slice(0, 5);
    const prompt = `
    [Role: Senior Hedge Fund Risk Manager]
    Task: Analyze these top 5 high-quality stocks for "Value Traps" (Red Flags) and identify the dominant sector trend.
    
    Candidates: ${JSON.stringify(top5.map(t => ({
        s: t.symbol, n: t.name, 
        qScore: t.qualityScore, 
        roe: t.roe, 
        debt: t.debtToEquity,
        per: t.per
    })))}
    
    Requirements:
    1. **Sector**: Identify the dominant sector.
    2. **Value Trap Check**: Are any of these companies historically known for accounting irregularities, massive lawsuits, or dying industries?
    3. **Insight**: Provide a brief 1-sentence strategic insight in Korean.
    
    Return JSON: { "dominantSector": "string", "insight": "string (Korean)", "redFlags": ["symbol1 if bad", "symbol2 if bad"] }
    `;
    
    let result = null;
    let usedProvider = '';

    try {
        setActiveBrain("Gemini 3 Flash");
        const geminiConfig = API_CONFIGS.find(c => c.provider === ApiProvider.GEMINI);
        const apiKey = process.env.API_KEY || geminiConfig?.key || "";
        
        if (!apiKey) throw new Error("Gemini API Key Missing");

        const ai = new GoogleGenAI({ apiKey });
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: prompt,
            config: { responseMimeType: "application/json" }
        });
        
        trackUsage(ApiProvider.GEMINI, response.usageMetadata?.totalTokenCount || 0);
        result = sanitizeJson(response.text);
        usedProvider = "Gemini 3.0";
    } catch (e: any) {
        addLog(`Gemini Audit Failed: ${e.message}`, "warn");
        try {
            setActiveBrain("Sonar Pro");
            const perplexityKey = API_CONFIGS.find(c => c.provider === ApiProvider.PERPLEXITY)?.key || "";
            const res = await fetch('https://api.perplexity.ai/chat/completions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${perplexityKey}` },
                body: JSON.stringify({
                    model: 'sonar-pro', 
                    messages: [{ role: "user", content: prompt + " Return JSON." }]
                })
            });
            const data = await res.json();
            if(data.usage) trackUsage(ApiProvider.PERPLEXITY, data.usage.total_tokens || 0);
            result = sanitizeJson(data.choices?.[0]?.message?.content);
            usedProvider = "Sonar Pro";
        } catch(err: any) { addLog(`Fallback Failed: ${err.message}`, "err"); }
    }

    if (result && result.insight) {
        const flags = result.redFlags?.length > 0 ? `⚠️ Red Flags: ${result.redFlags.join(', ')}` : "✅ No Major Red Flags Detected.";
        const msg = `[${result.dominantSector}] ${result.insight} | ${flags}`;
        setAiAnalysis(`${usedProvider}: ${msg}`);
        setAiStatus('SUCCESS');
        
        if (result.redFlags && Array.isArray(result.redFlags)) {
            const updated = tickers.map(t => ({
                ...t,
                isValueTrap: result.redFlags.includes(t.symbol)
            }));
            setProcessedData(updated);
        }
        
        addLog(`Deep Audit Complete via ${usedProvider}`, "ok");
    } else {
        setAiAnalysis("⚠️ AI Audit Unavailable.");
        setAiStatus('FAILED');
    }
  };

  const executeDeepQualityScan = async () => {
    if (!accessToken) { addLog("Error: Vault Disconnected.", "err"); return; }
    if (loading) return;

    setLoading(true);
    setAiStatus('IDLE');
    setAiAnalysis(null);
    startTimeRef.current = Date.now();
    setTimeStats({ elapsed: 0, eta: 0 });
    
    setProcessedData([]);
    setProgress({ current: 0, total: 0, cacheHits: 0, filteredOut: 0 });
    setFmpDepleted(false);
    setActiveBrain('Processing');
    addLog("Phase 1: Loading Stage 1 Purified Universe...", "info");

    try {
      const q = encodeURIComponent(`name contains 'STAGE1_PURIFIED_UNIVERSE' and trashed = false`);
      const listRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&orderBy=createdTime desc&pageSize=1`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      }).then(r => r.json());

      if (!listRes.files?.length) {
        addLog("Stage 1 data missing.", "err");
        setLoading(false); return;
      }

      const content = await fetch(`https://www.googleapis.com/drive/v3/files/${listRes.files[0].id}?alt=media`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      }).then(r => r.json());

      let targets = content.investable_universe || [];
      const totalCandidates = targets.length;
      
      // Prioritize Liquid Large Caps to maximize data availability
      targets.sort((a: any, b: any) => (b.price * b.volume) - (a.price * a.volume));

      addLog(`Universe Loaded: ${totalCandidates} Assets. Starting Strict Real-Data Scan...`, "info");
      setProgress({ current: 0, total: totalCandidates, cacheHits: 0, filteredOut: 0 });
      
      const validResults: QualityTicker[] = [];
      let currentIndex = 0;
      let skippedCount = 0;

      while (currentIndex < totalCandidates && validResults.length < TARGET_SELECTION_COUNT) {
          setNetworkStatus(fmpDepleted ? `Safe Mode (Delay ${DELAY_SAFE}ms)` : `Turbo Mode (Delay ${DELAY_TURBO}ms)`);
          
          // Adaptive Batch: If we need more, grab more. 
          const currentBatchSize = BATCH_SIZE;
          const batch = targets.slice(currentIndex, currentIndex + currentBatchSize);
          
          try {
              const promises = batch.map((t: any) => fetchTickerData(t));
              const results = await Promise.all(promises);
              
              results.forEach(r => {
                  if (r) validResults.push(r);
                  else skippedCount++;
              });

              currentIndex += currentBatchSize;
              setProgress(prev => ({ 
                  ...prev, 
                  current: Math.min(currentIndex, totalCandidates),
                  filteredOut: skippedCount
              }));
              
              const currentDelay = fmpDepleted ? DELAY_SAFE : DELAY_TURBO;
              await new Promise(r => setTimeout(r, currentDelay));

          } catch (e: any) {
              if (e.message === "FMP_LIMIT") {
                  addLog(`FMP Limit. Switching to Backup Providers...`, "warn");
                  setFmpDepleted(true); 
                  await new Promise(r => setTimeout(r, 1000));
              } else if (e.message === "FINNHUB_LIMIT") {
                  addLog(`Finnhub Rate Limit. Pausing...`, "warn");
                  await new Promise(r => setTimeout(r, 10000));
              } else {
                  addLog(`Batch Error: ${e.message}`, "err");
                  currentIndex += currentBatchSize;
              }
          }
      }

      addLog(`Scan Complete. ${validResults.length} Real-Data Assets Secured. (Skipped ${skippedCount} incomplete)`, "info");
      
      const eliteSurvivors = validResults
          .sort((a, b) => b.qualityScore - a.qualityScore) 
          .slice(0, TARGET_SELECTION_COUNT);

      setProcessedData(eliteSurvivors);
      
      await analyzeValueTrapsAndSectors(eliteSurvivors);

      const folderId = await ensureFolder(accessToken, GOOGLE_DRIVE_TARGET.stage2SubFolder);
      const fileName = `STAGE2_ELITE_UNIVERSE_${new Date().toISOString().split('T')[0]}.json`;
      const payload = {
        manifest: { version: "5.2.0", strategy: "Strict_Real_Data_Quant", timestamp: new Date().toISOString() },
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
      if (onComplete) onComplete();

    } catch (e: any) {
      addLog(`Critical Error: ${e.message}`, "err");
    } finally {
      setLoading(false);
      setActiveBrain('Standby');
      setNetworkStatus('Standby');
      setFmpDepleted(false);
      startTimeRef.current = 0; 
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
    if (seconds <= 0) return "--:--";
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Prepare Chart Data
  const chartData = processedData.slice(0, 50).map(t => ({
      symbol: t.symbol,
      x: t.growthScore, 
      y: t.qualityScore, 
      z: t.marketValue, 
      fill: t.isValueTrap ? '#ef4444' : '#10b981'
  }));

  return (
    <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
      <div className="xl:col-span-3 space-y-6">
        <div className="glass-panel p-5 md:p-8 lg:p-10 rounded-[32px] md:rounded-[40px] border-t-2 border-t-blue-500 shadow-2xl bg-slate-900/40 relative overflow-hidden">
          
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-6 md:mb-10 gap-6">
            <div className="flex items-center space-x-6">
              <div className={`w-12 h-12 md:w-14 md:h-14 rounded-3xl bg-blue-600/10 flex items-center justify-center border border-blue-500/20 ${loading ? 'animate-pulse' : ''}`}>
                 <svg className={`w-5 h-5 md:w-6 md:h-6 text-blue-400 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
              </div>
              <div>
                <h2 className="text-xl md:text-3xl font-black text-white italic tracking-tighter uppercase leading-none">Deep_Quality v5.2.0</h2>
                <div className="flex flex-col mt-2 gap-1">
                   <div className="flex flex-wrap items-center gap-2">
                        <span className={`text-[8px] font-black px-2 py-0.5 rounded border uppercase tracking-widest ${loading ? 'border-blue-400 text-blue-400 animate-pulse' : 'border-blue-500/20 bg-blue-500/10 text-blue-400'}`}>
                            {loading ? `Scanning: ${progress.current}/${progress.total}` : 'Strict Quant Protocol Ready'}
                        </span>
                        <span className={`text-[8px] font-black px-2 py-0.5 rounded border uppercase tracking-widest transition-all duration-300 ${
                            fmpDepleted
                            ? 'border-amber-500/20 bg-amber-500/10 text-amber-400 animate-pulse' 
                            : 'border-purple-500/20 bg-purple-500/10 text-purple-400'
                        }`}>
                            {networkStatus}
                        </span>
                        {progress.cacheHits > 0 && (
                            <span className="text-[8px] px-2 py-0.5 bg-emerald-900/50 text-emerald-400 border border-emerald-500/20 rounded font-black uppercase">
                                Hits: {progress.cacheHits}
                            </span>
                        )}
                        {progress.filteredOut > 0 && (
                            <span className="text-[8px] px-2 py-0.5 bg-red-900/50 text-red-400 border border-red-500/20 rounded font-black uppercase">
                                Dropped: {progress.filteredOut}
                            </span>
                        )}
                        {autoStart && <span className="text-[8px] px-2 py-0.5 bg-rose-600 text-white rounded font-black uppercase animate-pulse">AUTO PILOT</span>}
                   </div>
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
                </div>
              </div>
            </div>
            <button onClick={executeDeepQualityScan} disabled={loading} className="w-full lg:w-auto px-8 md:px-12 py-4 md:py-5 bg-blue-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-blue-900/20 hover:scale-105 active:scale-95 transition-all">
              {loading ? 'Sieving Real Data...' : 'Start Strict Quality Filter'}
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-8 mb-6 md:mb-10">
              {/* Progress & Analysis Column */}
              <div className="flex flex-col gap-6">
                  <div className="bg-black/40 p-6 md:p-8 rounded-3xl border border-white/5">
                    <div className="flex justify-between items-center mb-6">
                      <p className="text-[9px] font-black text-blue-400 uppercase tracking-widest">Global Scan Progress</p>
                      <p className="text-xl font-mono font-black text-white italic">{loading ? `${(progress.current / (progress.total || 1) * 100).toFixed(1)}%` : 'Idle'}</p>
                    </div>
                    <div className="h-2 bg-slate-800 rounded-full overflow-hidden mb-4">
                      <div className={`h-full transition-all duration-300 ${fmpDepleted ? 'bg-amber-500' : 'bg-blue-500'}`} style={{ width: `${(progress.current / (progress.total || 1)) * 100}%` }}></div>
                    </div>
                    <div className="flex justify-between text-[8px] uppercase font-bold text-slate-500">
                        <span>Profitability Check</span>
                        <span>Stability Check</span>
                        <span>Value Check</span>
                    </div>
                  </div>

                  <div className={`bg-blue-900/10 p-6 md:p-8 rounded-3xl border relative overflow-hidden group transition-colors flex-1 ${aiStatus === 'ANALYZING' ? 'border-blue-500/50' : aiStatus === 'SUCCESS' ? 'border-emerald-500/50' : 'border-blue-500/10'}`}>
                     <div className="flex justify-between items-center mb-2">
                        <p className={`text-[9px] font-black uppercase tracking-widest ${aiStatus === 'SUCCESS' ? 'text-emerald-400' : 'text-blue-400'}`}>AI Value Trap Detector</p>
                     </div>
                     <p className={`text-xs font-bold leading-relaxed italic ${aiAnalysis ? 'text-white' : 'text-slate-500'}`}>
                        {aiAnalysis || "Awaiting Top-Tier Candidate Analysis..."}
                     </p>
                     {aiStatus === 'ANALYZING' && <div className="absolute bottom-0 left-0 h-1 bg-blue-500 animate-pulse w-full"></div>}
                     {aiStatus === 'SUCCESS' && <div className="absolute bottom-0 left-0 h-1 bg-emerald-500 w-full"></div>}
                  </div>
              </div>

              {/* Quality Matrix Chart Column */}
              <div className="bg-black/40 p-4 rounded-3xl border border-white/5 min-h-[300px] flex flex-col relative">
                 <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-4 absolute top-6 left-6 z-10">Quality-Value Matrix (Top 50 Elite)</p>
                 <div className="flex-1 w-full h-full mt-4">
                     {processedData.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                            <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.2} />
                                <XAxis type="number" dataKey="x" name="Value Score" stroke="#64748b" fontSize={9} label={{ value: 'Value Score (Upside)', position: 'bottom', fill: '#64748b', fontSize: 9 }} domain={[0, 100]} />
                                <YAxis type="number" dataKey="y" name="Quality Score" stroke="#64748b" fontSize={9} label={{ value: 'Quality Score', angle: -90, position: 'insideLeft', fill: '#64748b', fontSize: 9 }} domain={[0, 100]} />
                                <Tooltip 
                                    cursor={{ strokeDasharray: '3 3' }}
                                    content={({ active, payload }) => {
                                        if (active && payload && payload.length) {
                                            const d = payload[0].payload;
                                            return (
                                                <div className="bg-slate-900 border border-slate-700 p-2 rounded-lg shadow-xl">
                                                    <p className="text-xs font-black text-white">{d.symbol}</p>
                                                    <p className="text-[9px] text-emerald-400">Q: {d.y} | V: {d.x}</p>
                                                </div>
                                            );
                                        }
                                        return null;
                                    }}
                                />
                                <ReferenceLine x={50} stroke="#475569" strokeDasharray="3 3" />
                                <ReferenceLine y={50} stroke="#475569" strokeDasharray="3 3" />
                                <Scatter name="Elite Stocks" data={chartData} fill="#3b82f6">
                                    {chartData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.fill} />
                                    ))}
                                    <LabelList dataKey="symbol" position="top" style={{ fill: '#94a3b8', fontSize: '8px', fontWeight: 'bold' }} />
                                </Scatter>
                            </ScatterChart>
                        </ResponsiveContainer>
                     ) : (
                         <div className="flex items-center justify-center h-full opacity-20">
                             <p className="text-[10px] font-black uppercase tracking-[0.3em]">No Data Visualization</p>
                         </div>
                     )}
                 </div>
              </div>
          </div>
        </div>
      </div>

      <div className="xl:col-span-1">
        <div className="glass-panel h-[400px] lg:h-[600px] rounded-[32px] md:rounded-[40px] bg-slate-950 border-l-4 border-l-blue-600 flex flex-col p-6 shadow-2xl overflow-hidden">
          <div className="flex items-center justify-between mb-8 px-2">
            <h3 className="font-black text-white text-[10px] uppercase tracking-[0.4em] italic">Quant_Logs</h3>
            <button onClick={() => { sessionStorage.clear(); addLog("Cache Cleared. Rescan needed.", "warn"); }} className="text-[8px] text-slate-600 hover:text-white uppercase transition-colors">Clear Cache</button>
          </div>
          <div ref={logRef} className="flex-1 bg-black/70 p-6 rounded-[32px] font-mono text-[9px] text-blue-300/60 overflow-y-auto no-scrollbar space-y-4 border border-white/5">
            {logs.map((l, i) => (
              <div key={i} className={`pl-4 border-l-2 ${l.includes('[OK]') ? 'border-emerald-500 text-emerald-400' : l.includes('[WARN]') ? 'border-amber-500 text-amber-400' : l.includes('[ERR]') ? 'border-red-500 text-red-400' : l.includes('[AUTO]') ? 'border-rose-500 text-rose-400' : 'border-blue-900'}`}>
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
