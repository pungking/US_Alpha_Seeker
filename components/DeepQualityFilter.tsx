
import React, { useState, useEffect, useRef } from 'react';
import { ResponsiveContainer, ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Cell, ReferenceLine } from 'recharts';
import { GoogleGenAI } from "@google/genai";
import { GOOGLE_DRIVE_TARGET, API_CONFIGS } from '../constants';
import { ApiProvider } from '../types';
import { trackUsage } from '../services/intelligenceService';

interface DeepQualityTicker {
  symbol: string;
  name: string;
  price: number;
  volume: number;
  marketValue: number;
  
  // Quant Scores
  qualityScore: number;
  profitabilityScore: number;
  stabilityScore: number;
  growthScore: number;
  
  // Metrics
  roe: number;
  debtToEquity: number;
  per: number;
  pbr: number;
  
  isValueTrap: boolean;
  auditReason?: string;
  
  sector: string;
  lastUpdate: string;
  source?: string;
  [key: string]: any;
}

interface Props {
  autoStart?: boolean;
  onComplete?: () => void;
  onStockSelected?: (stock: any) => void;
}

// 3-Factor Quant Model Logic
const calculateQualityScore = (metrics: { roe: number, debt: number, per: number }) => {
    // 1. Profitability (ROE) - Max 40pts
    const roeScore = Math.min(100, Math.max(0, (metrics.roe || 0) * 4));
    
    // 2. Stability (Debt) - Max 30pts
    // Debt ratio: Lower is better. 0 = 100pts, 2.0 = 40pts, 3.3+ = 0pts
    const debt = metrics.debt || 0;
    const stabilityScore = Math.max(0, 100 - (debt * 30));
    
    // 3. Value/Growth (PER) - Max 30pts
    // Sweet spot 5-25. Too low (<5) might be value trap. Too high (>50) is risky.
    const per = metrics.per || 20;
    let growthScore = 50;
    if (per > 0 && per < 10) growthScore = 90;      // Deep Value
    else if (per >= 10 && per < 25) growthScore = 80; // Reasonable Growth
    else if (per >= 25 && per < 50) growthScore = 60; // Momentum
    else growthScore = 40;                            // Overvalued or Unprofitable
    
    const qualityScore = Number(((roeScore * 0.4) + (stabilityScore * 0.3) + (growthScore * 0.3)).toFixed(2));
    
    return {
        qualityScore,
        profitabilityScore: roeScore,
        stabilityScore,
        growthScore
    };
};

const DeepQualityFilter: React.FC<Props> = ({ autoStart, onComplete, onStockSelected }) => {
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, msg: 'Initializing', cacheHits: 0 });
  const [processedData, setProcessedData] = useState<DeepQualityTicker[]>([]);
  const [selectedTicker, setSelectedTicker] = useState<DeepQualityTicker | null>(null);
  const [logs, setLogs] = useState<string[]>(['> Quality_Node v5.6.1: 3-Factor Quant Protocol Online.']);
  
  const [aiAuditStatus, setAiAuditStatus] = useState<'IDLE' | 'ANALYZING' | 'SUCCESS' | 'FAILED'>('IDLE');
  const [aiAuditResult, setAiAuditResult] = useState<string | null>(null);
  const [activeBrain, setActiveBrain] = useState<string>('GEMINI');
  const [useSafeMode, setUseSafeMode] = useState(false);

  const logRef = useRef<HTMLDivElement>(null);
  const startTimeRef = useRef<number>(0);
  const [timeStats, setTimeStats] = useState({ elapsed: 0, eta: 0 });

  const accessToken = sessionStorage.getItem('gdrive_access_token');
  const fmpKey = API_CONFIGS.find(c => c.provider === ApiProvider.FMP)?.key;
  const finnhubKey = API_CONFIGS.find(c => c.provider === ApiProvider.FINNHUB)?.key;
  const polygonKey = API_CONFIGS.find(c => c.provider === ApiProvider.POLYGON)?.key;

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  // Timer Effect
  useEffect(() => {
    let interval: any;
    if (loading && startTimeRef.current > 0) {
      interval = setInterval(() => {
        const now = Date.now();
        const elapsed = Math.floor((now - startTimeRef.current) / 1000);
        let eta = 0;
        if (progress.current > 0 && progress.total > 0) {
            const rate = progress.current / elapsed;
            const remaining = progress.total - progress.current;
            eta = rate > 0 ? Math.floor(remaining / rate) : 0;
        }
        setTimeStats({ elapsed, eta });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [loading, progress.current, progress.total]);

  // Auto Start
  useEffect(() => {
    if (autoStart && !loading) {
        addLog("AUTO-PILOT: Engaging Deep Quality Quant Filter...", "signal");
        executeDeepQualityScan();
    }
  }, [autoStart]);

  const addLog = (m: string, t: 'info' | 'ok' | 'err' | 'warn' | 'signal' = 'info') => {
    const p = { info: '>', ok: '[OK]', err: '[ERR]', warn: '[WARN]', signal: '[AUTO]' };
    setLogs(prev => [...prev, `${p[t]} ${m}`].slice(-60));
  };

  const getFormatTime = (seconds: number) => {
    if (seconds <= 0) return "--:--";
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
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

  const fetchTickerFinancials = async (ticker: any): Promise<DeepQualityTicker | null> => {
    const cacheKey = `QUALITY_CACHE_v1_${ticker.symbol}_${new Date().toISOString().split('T')[0]}`;
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) {
        setProgress(p => ({ ...p, cacheHits: p.cacheHits + 1 }));
        return JSON.parse(cached);
    }

    try {
        let metrics = { per: 0, pbr: 0, debt: 0, roe: 0 };
        let meta = { name: ticker.name, sector: ticker.sector || 'Unknown', industry: ticker.industry || 'Unknown' };
        let source = '';

        // Strategy A: FMP (Primary)
        if (!useSafeMode && fmpKey) {
             try {
                 const [ratiosRes, profileRes] = await Promise.all([
                     fetch(`https://financialmodelingprep.com/api/v3/ratios-ttm/${ticker.symbol}?apikey=${fmpKey}`),
                     fetch(`https://financialmodelingprep.com/api/v3/profile/${ticker.symbol}?apikey=${fmpKey}`)
                 ]);

                 if (ratiosRes.status === 429 || profileRes.status === 429) {
                     setUseSafeMode(true);
                     throw new Error("FMP_LIMIT");
                 }

                 if (ratiosRes.ok) {
                     const rData = await ratiosRes.json();
                     if (rData && rData[0]) {
                         metrics.per = Number(rData[0].peRatioTTM || 0);
                         metrics.pbr = Number(rData[0].priceToBookRatioTTM || 0);
                         metrics.debt = Number(rData[0].debtEquityRatioTTM || 0);
                         metrics.roe = Number(rData[0].returnOnEquityTTM || 0) * 100;
                         source = 'FMP';
                     }
                 }
                 if (profileRes.ok) {
                     const pData = await profileRes.json();
                     if (pData && pData[0]) {
                         meta.name = pData[0].companyName;
                         meta.sector = pData[0].sector;
                         meta.industry = pData[0].industry;
                     }
                 }
             } catch (e: any) {
                 if (e.message === "FMP_LIMIT") {
                     addLog("FMP Limit Hit. Switching to Backup...", "warn");
                 }
             }
        }

        // Strategy B: Finnhub (Fallback)
        if ((!metrics.per && !metrics.roe) && finnhubKey) {
             try {
                 const res = await fetch(`https://finnhub.io/api/v1/stock/metric?symbol=${ticker.symbol}&metric=all&token=${finnhubKey}`);
                 if (res.ok) {
                     const data = await res.json();
                     if (data.metric) {
                         metrics.per = Number(data.metric.peNormalized || 0);
                         metrics.pbr = Number(data.metric.pbAnnual || 0);
                         metrics.debt = Number(data.metric.totalDebtEquityRatioQuarterly || 0);
                         metrics.roe = Number(data.metric.roeTTM || 0);
                         source = 'Finnhub';
                     }
                 }
             } catch (e) {}
        }

        if (!metrics.per && !metrics.roe) return null; // Not enough data

        const price = Number(ticker.price) || 0;
        const vol = Number(ticker.volume) || 0;
        const marketVal = Number(ticker.marketValue || price * vol) || 1000000;

        const scores = calculateQualityScore(metrics);

        const result: DeepQualityTicker = {
            symbol: ticker.symbol,
            name: meta.name,
            price,
            volume: vol,
            marketValue: marketVal,
            profitabilityScore: scores.profitabilityScore,
            stabilityScore: scores.stabilityScore,
            growthScore: scores.growthScore,
            qualityScore: scores.qualityScore,
            per: metrics.per,
            pbr: metrics.pbr,
            debtToEquity: metrics.debt,
            roe: metrics.roe,
            sector: meta.sector,
            industry: meta.industry,
            lastUpdate: new Date().toISOString(),
            source: source,
            isValueTrap: false
        };

        try { sessionStorage.setItem(cacheKey, JSON.stringify(result)); } catch {}
        return result;

    } catch (e) {
        return null;
    }
  };

  const performAiAudit = async (candidates: DeepQualityTicker[]) => {
      if (candidates.length === 0) return;
      setAiAuditStatus('ANALYZING');
      setAiAuditResult("📡 Analyzing top candidates for Value Traps & Sector Trends...");
      
      const topCandidates = candidates.slice(0, 5);
      const prompt = `
      [Role: Senior Hedge Fund Risk Manager]
      Task: Analyze these top 5 high-quality stocks for "Value Traps" (Red Flags) and identify the dominant sector trend.
      
      Candidates: ${JSON.stringify(topCandidates.map(c => ({ s: c.symbol, n: c.name, qScore: c.qualityScore, roe: c.roe, debt: c.debtToEquity, per: c.per })))}
      
      Requirements:
      1. **Sector**: Identify the dominant sector.
      2. **Value Trap Check**: Are any of these companies historically known for accounting irregularities, massive lawsuits, or dying industries?
      3. **Insight**: Provide a brief 1-sentence strategic insight in Korean.
      
      Return JSON: { "dominantSector": "string", "insight": "string (Korean)", "redFlags": ["symbol1 if bad", "symbol2 if bad"] }
      `;

      let aiResult: any = null;
      let usedProvider = 'GEMINI';

      try {
          setActiveBrain(usedProvider);
          const geminiKey = process.env.API_KEY || API_CONFIGS.find(c => c.provider === ApiProvider.GEMINI)?.key || "";
          if (geminiKey) {
              const ai = new GoogleGenAI({ apiKey: geminiKey });
              const res = await ai.models.generateContent({
                  model: 'gemini-3-flash-preview',
                  contents: prompt,
                  config: { responseMimeType: "application/json" }
              });
              trackUsage(ApiProvider.GEMINI, res.usageMetadata?.totalTokenCount || 0);
              aiResult = sanitizeJson(res.text);
          }
      } catch (e: any) {
          addLog(`Gemini Audit Failed: ${e.message}`, "warn");
          try {
              usedProvider = 'PERPLEXITY';
              setActiveBrain(usedProvider);
              const pKey = API_CONFIGS.find(c => c.provider === ApiProvider.PERPLEXITY)?.key || "";
              const res = await fetch('https://api.perplexity.ai/chat/completions', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${pKey}` },
                  body: JSON.stringify({ model: 'sonar-pro', messages: [{ role: "user", content: prompt + " Return JSON." }] })
              });
              const json = await res.json();
              if (json.usage) trackUsage(ApiProvider.PERPLEXITY, json.usage.total_tokens || 0);
              aiResult = sanitizeJson(json.choices?.[0]?.message?.content);
          } catch (e2: any) {
              addLog(`Fallback Failed: ${e2.message}`, "err");
          }
      }

      if (aiResult && aiResult.insight) {
          const flags = aiResult.redFlags?.length > 0 ? `⚠️ Red Flags: ${aiResult.redFlags.join(', ')}` : "✅ No Major Red Flags Detected.";
          const summary = `[${aiResult.dominantSector}] ${aiResult.insight} | ${flags}`;
          setAiAuditResult(summary);
          setAiAuditStatus('SUCCESS');
          addLog(`Deep Audit Complete via ${usedProvider === 'GEMINI' ? 'Gemini 3.0' : 'Sonar Pro'}`, "ok");
          
          // Mark flags in data
          if (aiResult.redFlags && Array.isArray(aiResult.redFlags)) {
              return candidates.map(c => ({
                  ...c,
                  isValueTrap: aiResult.redFlags.includes(c.symbol)
              }));
          }
      } else {
          setAiAuditResult("⚠️ AI Audit Unavailable.");
          setAiAuditStatus('FAILED');
      }
      return candidates;
  };

  const executeDeepQualityScan = async () => {
    if (!accessToken) {
        addLog("Error: Vault Disconnected.", "err");
        return;
    }
    if (loading) return;

    setLoading(true);
    setAiAuditStatus('IDLE');
    setAiAuditResult(null);
    startTimeRef.current = Date.now();
    setTimeStats({ elapsed: 0, eta: 0 });
    setProcessedData([]);
    setProgress({ current: 0, total: 0, msg: 'Loading Stage 1...', cacheHits: 0 });
    setUseSafeMode(false);

    try {
        addLog("Phase 1: Loading Stage 1 Purified Universe...", "info");
        const q = encodeURIComponent("name contains 'STAGE1_PURIFIED_UNIVERSE' and trashed = false");
        const listRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&orderBy=createdTime desc&pageSize=1`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        }).then(r => r.json());

        if (!listRes.files?.length) {
            addLog("Stage 1 data missing.", "err");
            setLoading(false);
            return;
        }

        const fileContent = await fetch(`https://www.googleapis.com/drive/v3/files/${listRes.files[0].id}?alt=media`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        }).then(r => r.json());

        let universe = fileContent.investable_universe || [];
        // Sort by liquidity to prioritize good stocks first
        universe.sort((a: any, b: any) => (b.price * b.volume) - (a.price * a.volume));

        const total = universe.length;
        setProgress(prev => ({ ...prev, total, msg: 'Scanning...' }));
        addLog(`Universe Loaded: ${total} Assets. Starting 3-Factor Scan...`, "info");

        const results: DeepQualityTicker[] = [];
        const batchSize = 5;
        let processedCount = 0;

        while (processedCount < total) {
            const batch = universe.slice(processedCount, processedCount + batchSize);
            
            try {
                const batchPromises = batch.map((item: any) => fetchTickerFinancials(item));
                const batchResults = await Promise.all(batchPromises);
                
                batchResults.forEach(res => {
                    if (res) results.push(res);
                });

                processedCount += batch.length;
                setProgress(prev => ({ ...prev, current: Math.min(processedCount, total) }));

                // Dynamic Delay for Rate Limits
                const delay = useSafeMode ? 2500 : 250;
                await new Promise(r => setTimeout(r, delay));

            } catch (e: any) {
                 addLog(`Batch Error: ${e.message}`, "err");
                 processedCount += batchSize;
            }
        }

        addLog(`Scan Complete. ${results.length} Qualified Assets. Validating...`, "info");
        
        // Sort by Quality Score
        const topResults = results.sort((a, b) => b.qualityScore - a.qualityScore).slice(0, 300);
        
        // AI Audit on Top 5
        const auditedResults = await performAiAudit(topResults) || topResults;
        setProcessedData(auditedResults);
        
        if (auditedResults.length > 0) {
            handleTickerSelect(auditedResults[0]);
        }

        // Save to Drive
        const folderId = await ensureFolder(accessToken, GOOGLE_DRIVE_TARGET.stage2SubFolder);
        const now = new Date();
        const kstDate = new Date(now.getTime() + 9 * 60 * 60 * 1000);
        const timestamp = kstDate.toISOString().replace('T', '_').replace(/:/g, '-').split('.')[0];
        const fileName = `STAGE2_ELITE_UNIVERSE_${timestamp}.json`;

        const payload = {
            manifest: { version: "5.6.1", strategy: "3-Factor_Quant_Model", timestamp: new Date().toISOString() },
            elite_universe: auditedResults
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
        startTimeRef.current = 0;
    }
  };

  const ensureFolder = async (token: string, name: string) => {
      const q = encodeURIComponent(`name = '${name}' and '${GOOGLE_DRIVE_TARGET.rootFolderId}' in parents and trashed = false`);
      const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}`, { headers: { 'Authorization': `Bearer ${token}` } }).then(r => r.json());
      if (res.files?.length > 0) return res.files[0].id;
      const create = await fetch(`https://www.googleapis.com/drive/v3/files`, {
          method: 'POST', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, parents: [GOOGLE_DRIVE_TARGET.rootFolderId], mimeType: 'application/vnd.google-apps.folder' })
      }).then(r => r.json());
      return create.id;
  };

  const handleTickerSelect = (item: DeepQualityTicker) => {
      setSelectedTicker(item);
      if (onStockSelected) onStockSelected(item);
  };

  // Chart Data Preparation (Top 50)
  const chartData = processedData.slice(0, 50).map(t => ({
      symbol: t.symbol,
      x: t.growthScore, // Value
      y: t.qualityScore, // Quality
      z: t.marketValue, // Size
      fill: t.isValueTrap ? '#ef4444' : '#10b981' // Red if trap, Green if good
  }));

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
                <h2 className="text-xl md:text-3xl font-black text-white italic tracking-tighter uppercase leading-none">Deep_Quality v5.6.1</h2>
                <div className="flex flex-col mt-2 gap-1">
                   <div className="flex flex-wrap items-center gap-2">
                       <span className={`text-[8px] font-black px-2 py-0.5 rounded border uppercase tracking-widest ${loading ? 'border-blue-400 text-blue-400 animate-pulse' : 'border-blue-500/20 bg-blue-500/10 text-blue-400'}`}>
                           {loading ? `Scanning: ${progress.current}/${progress.total}` : '3-Factor Quant Ready'}
                       </span>
                       <span className={`text-[8px] font-black px-2 py-0.5 rounded border uppercase tracking-widest transition-all duration-300 ${useSafeMode ? 'border-amber-500/20 bg-amber-500/10 text-amber-400 animate-pulse' : 'border-purple-500/20 bg-purple-500/10 text-purple-400'}`}>
                           {useSafeMode ? 'Safe Mode Active' : 'Ready: Adaptive Quant Engine'}
                       </span>
                       {progress.cacheHits > 0 && <span className="text-[8px] px-2 py-0.5 bg-emerald-900/50 text-emerald-400 border border-emerald-500/20 rounded font-black uppercase">Cache Hits: {progress.cacheHits}</span>}
                       {autoStart && <span className="text-[8px] px-2 py-0.5 bg-rose-600 text-white rounded font-black uppercase animate-pulse">AUTO PILOT</span>}
                   </div>
                   {loading && (
                     <div className="flex items-center space-x-2 mt-0.5">
                       <span className="text-[8px] font-mono font-bold text-slate-400 uppercase">Elapsed: <span className="text-white">{getFormatTime(timeStats.elapsed)}</span></span>
                       <span className="text-[8px] font-mono font-bold text-slate-500">|</span>
                       <span className="text-[8px] font-mono font-bold text-slate-400 uppercase">ETA: <span className="text-emerald-400">{getFormatTime(timeStats.eta)}</span></span>
                     </div>
                   )}
                </div>
              </div>
            </div>
            <button 
              onClick={executeDeepQualityScan} 
              disabled={loading} 
              className={`w-full lg:w-auto px-8 md:px-12 py-4 md:py-5 bg-blue-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-blue-900/20 hover:scale-105 active:scale-95 transition-all`}
            >
              {loading ? 'Executing Quant Scan...' : 'Start Deep Quality Filter'}
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-8 mb-6 md:mb-10">
              <div className="flex flex-col gap-6">
                   <div className="bg-black/40 p-6 md:p-8 rounded-3xl border border-white/5">
                        <div className="flex justify-between items-center mb-6">
                            <p className="text-[9px] font-black text-blue-400 uppercase tracking-widest">Global Scan Progress</p>
                            <p className="text-xl font-mono font-black text-white italic">{loading ? `${((progress.current / (progress.total || 1)) * 100).toFixed(1)}%` : 'Idle'}</p>
                        </div>
                        <div className="h-2 bg-slate-800 rounded-full overflow-hidden mb-4">
                            <div className={`h-full transition-all duration-300 ${useSafeMode ? 'bg-amber-500' : 'bg-blue-500'}`} style={{ width: `${(progress.current / (progress.total || 1)) * 100}%` }}></div>
                        </div>
                        <div className="flex justify-between text-[8px] uppercase font-bold text-slate-500">
                             <span>Profitability Check</span>
                             <span>Stability Check</span>
                             <span>Value Check</span>
                        </div>
                   </div>
                   
                   {/* AI Value Trap Detector Box */}
                   <div className={`bg-blue-900/10 p-6 md:p-8 rounded-3xl border relative overflow-hidden group transition-colors flex-1 ${aiAuditStatus === 'ANALYZING' ? 'border-blue-500/50' : aiAuditStatus === 'SUCCESS' ? 'border-emerald-500/50' : 'border-blue-500/10'}`}>
                        <div className="flex justify-between items-center mb-2">
                             <p className={`text-[9px] font-black uppercase tracking-widest ${aiAuditStatus === 'SUCCESS' ? 'text-emerald-400' : 'text-blue-400'}`}>AI Value Trap Detector</p>
                        </div>
                        <p className={`text-xs font-bold leading-relaxed italic ${aiAuditResult ? 'text-white' : 'text-slate-500'}`}>
                            {aiAuditResult || "Awaiting Top-Tier Candidate Analysis..."}
                        </p>
                        {aiAuditStatus === 'ANALYZING' && <div className="absolute bottom-0 left-0 h-1 bg-blue-500 animate-pulse w-full"></div>}
                        {aiAuditStatus === 'SUCCESS' && <div className="absolute bottom-0 left-0 h-1 bg-emerald-500 w-full"></div>}
                   </div>
              </div>

              {/* Chart */}
              <div className="bg-black/40 p-4 rounded-3xl border border-white/5 min-h-[300px] flex flex-col relative">
                   <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-4 absolute top-6 left-6 z-10">Quality-Value Matrix (Top 50)</p>
                   <div className="flex-1 w-full h-full mt-4">
                       {processedData.length > 0 ? (
                           <ResponsiveContainer width="100%" height="100%">
                               <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.2} />
                                    <XAxis type="number" dataKey="x" name="Value Score" stroke="#64748b" fontSize={9} label={{ value: "Value Score (Upside)", position: "bottom", fill: "#64748b", fontSize: 9 }} domain={[0, 100]} />
                                    <YAxis type="number" dataKey="y" name="Quality Score" stroke="#64748b" fontSize={9} label={{ value: "Quality Score", angle: -90, position: "insideLeft", fill: "#64748b", fontSize: 9 }} domain={[0, 100]} />
                                    <RechartsTooltip cursor={{ strokeDasharray: '3 3' }} content={({ active, payload }) => {
                                        if (active && payload && payload.length) {
                                            const data = payload[0].payload;
                                            return (
                                                <div className="bg-slate-900 border border-slate-700 p-2 rounded-lg shadow-xl">
                                                    <p className="text-xs font-black text-white">{data.symbol}</p>
                                                    <p className="text-[9px] text-emerald-400">Q: {data.y} | V: {data.x}</p>
                                                </div>
                                            );
                                        }
                                        return null;
                                    }} />
                                    <ReferenceLine x={50} stroke="#475569" strokeDasharray="3 3" />
                                    <ReferenceLine y={50} stroke="#475569" strokeDasharray="3 3" />
                                    <Scatter name="Elite Stocks" data={chartData} fill="#3b82f6">
                                        {chartData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.fill} />
                                        ))}
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
              <div key={i} className={`pl-4 border-l-2 ${l.includes('[OK]') ? 'border-emerald-500 text-emerald-400 bg-emerald-500/5' : l.includes('[WARN]') ? 'border-amber-500 text-amber-400 bg-amber-500/5' : l.includes('[ERR]') ? 'border-red-500 text-red-400' : l.includes('[AUTO]') ? 'border-rose-500 text-rose-400' : 'border-blue-900'}`}>
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
