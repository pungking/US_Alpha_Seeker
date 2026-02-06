
import React, { useState, useEffect, useRef } from 'react';
import { 
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, 
  ResponsiveContainer, ReferenceLine, Cell 
} from 'recharts';
import { GoogleGenAI } from "@google/genai";
import { GOOGLE_DRIVE_TARGET, API_CONFIGS } from '../constants';
import { ApiProvider } from '../types';
import { trackUsage } from '../services/intelligenceService';

interface QualityTicker {
  symbol: string;
  name: string;
  price: number;
  volume: number;
  marketValue: number;
  
  // Quant Metrics
  qualityScore: number;
  profitabilityScore: number; // ROE
  stabilityScore: number;    // Debt/Eq
  growthScore: number;       // PER (Value/Growth proxy)
  
  // Fundamental Data
  per: number;
  pbr: number;
  debtToEquity: number;
  roe: number;
  
  sector: string;
  industry: string;
  
  // AI Audit
  isValueTrap?: boolean;
  
  lastUpdate: string;
  source: string;
  
  // Data Preservation
  [key: string]: any;
}

interface Props {
  autoStart?: boolean;
  onComplete?: () => void;
}

const CACHE_PREFIX = 'QUALITY_CACHE_v1_';

const DeepQualityFilter: React.FC<Props> = ({ autoStart, onComplete }) => {
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, cacheHits: 0 });
  const [processedData, setProcessedData] = useState<QualityTicker[]>([]);
  const [timeStats, setTimeStats] = useState({ elapsed: 0, eta: 0 });
  const [logs, setLogs] = useState<string[]>(['> Quality_Node v5.0.0: 3-Factor Quant Protocol Online.']);
  
  // AI Audit State
  const [auditStatus, setAuditStatus] = useState<'IDLE' | 'ANALYZING' | 'SUCCESS' | 'FAILED'>('IDLE');
  const [auditResult, setAuditResult] = useState<string | null>(null);
  
  // Automation State
  const [isSafeMode, setIsSafeMode] = useState(false);

  const startTimeRef = useRef<number>(0);
  const logRef = useRef<HTMLDivElement>(null);
  
  const accessToken = sessionStorage.getItem('gdrive_access_token');
  const fmpKey = API_CONFIGS.find(c => c.provider === ApiProvider.FMP)?.key;
  const finnhubKey = API_CONFIGS.find(c => c.provider === ApiProvider.FINNHUB)?.key;
  const polygonKey = API_CONFIGS.find(c => c.provider === ApiProvider.POLYGON)?.key;

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

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

  useEffect(() => {
    if (autoStart && !loading) {
        addLog("AUTO-PILOT: Engaging Deep Quality Quant Filter...", "signal");
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

  const calculateScores = (ratios: any, price: number, marketValue: number) => {
      // 1. Profitability (ROE) - Max 100
      const roe = Math.min(100, Math.max(0, (ratios.roe || 0) * 4)); 
      
      // 2. Stability (Debt/Equity) - Penalty for high debt
      const debt = ratios.debt || 1.0;
      const stability = Math.max(0, 100 - (debt * 30));
      
      // 3. Growth/Value (PER) - Sweet spot 10-25
      const per = ratios.per || 20;
      let growth = 50;
      if (per > 0 && per < 10) growth = 90; // Deep Value
      else if (per >= 10 && per < 25) growth = 80; // Reasonable
      else if (per >= 25 && per < 50) growth = 60; // Growth priced
      else growth = 40; // Overvalued or Distressed
      
      // Weighted Quality Score
      const quality = Number((roe * 0.4 + stability * 0.3 + growth * 0.3).toFixed(2));
      
      return { 
          profitScore: roe, 
          stabilityScore: stability, 
          growthScore: growth, 
          qualityScore: quality 
      };
  };

  const fetchFinancials = async (stock: any): Promise<QualityTicker | null> => {
      if (!stock || !stock.symbol) return null;
      
      const cacheKey = `${CACHE_PREFIX}${stock.symbol}`;
      const cached = sessionStorage.getItem(cacheKey);
      if (cached) {
          try {
              const parsed = JSON.parse(cached);
              setProgress(prev => ({ ...prev, cacheHits: prev.cacheHits + 1 }));
              return parsed;
          } catch(e) { sessionStorage.removeItem(cacheKey); }
      }

      try {
          let ratios: any = {};
          let meta: any = {};
          let source = "";
          let apiUsed = "";

          // ATTEMPT 1: FMP (Primary)
          if (!isSafeMode) {
              try {
                  const [ratioRes, profileRes] = await Promise.all([
                      fetch(`https://financialmodelingprep.com/api/v3/ratios-ttm/${stock.symbol}?apikey=${fmpKey}`),
                      fetch(`https://financialmodelingprep.com/api/v3/profile/${stock.symbol}?apikey=${fmpKey}`)
                  ]);
                  
                  if (ratioRes.status === 429 || profileRes.status === 429) {
                      setIsSafeMode(true);
                      throw new Error("FMP_LIMIT");
                  }
                  
                  if (ratioRes.ok) {
                      const data = await ratioRes.json();
                      if (data && data["Error Message"]) throw new Error("FMP_LIMIT"); // Sometimes returns 200 with error msg
                      
                      if (Array.isArray(data) && data.length > 0) {
                          const r = data[0];
                          ratios = {
                              per: Number(r.peRatioTTM || 0),
                              pbr: Number(r.priceToBookRatioTTM || 0),
                              debt: Number(r.debtEquityRatioTTM || 0),
                              roe: Number(r.returnOnEquityTTM || 0) * 100
                          };
                          apiUsed = "FMP";
                      }
                  }
                  
                  if (profileRes.ok) {
                      const data = await profileRes.json();
                      if (Array.isArray(data) && data.length > 0) {
                          const p = data[0];
                          meta = { name: p.companyName, sector: p.sector, industry: p.industry };
                      }
                  }
              } catch (e: any) {
                  if (e.message === "FMP_LIMIT") throw e;
              }
          }

          // ATTEMPT 2: Finnhub (Secondary)
          if ((!ratios.per && !ratios.roe)) {
              try {
                  const res = await fetch(`https://finnhub.io/api/v1/stock/metric?symbol=${stock.symbol}&metric=all&token=${finnhubKey}`);
                  if (res.status === 429) throw new Error("FINNHUB_LIMIT");
                  
                  if (res.ok) {
                      const data = await res.json();
                      const m = data.metric;
                      if (m) {
                          ratios = {
                              per: Number(m.peNormalized || 0),
                              pbr: Number(m.pbAnnual || 0),
                              debt: Number(m.totalDebtEquityRatioQuarterly || 0),
                              roe: Number(m.roeTTM || 0)
                          };
                          apiUsed = "Finnhub";
                      }
                  }
              } catch (e: any) {
                  if (e.message === "FINNHUB_LIMIT") throw e;
              }
          }

          // ATTEMPT 3: Polygon (Meta Fallback)
          if (!meta.name) {
             try {
                 const res = await fetch(`https://api.polygon.io/v3/reference/tickers/${stock.symbol}?apiKey=${polygonKey}`);
                 if (res.ok) {
                     const data = await res.json();
                     if (data.results) {
                         meta = { name: data.results.name, sector: data.results.sic_description || 'Unknown' };
                         source += "/Poly";
                     }
                 }
             } catch(e) {}
          }

          if (!ratios.per && !ratios.roe) return null; // Data insufficient

          const price = Number(stock.price) || 0;
          const volume = Number(stock.volume) || 0;
          const marketValue = Number(stock.marketValue || (price * volume)) || 1000000;

          const scores = calculateScores(ratios, price, marketValue);
          
          const result: QualityTicker = {
              symbol: stock.symbol,
              name: meta.name || stock.name || "N/A",
              price,
              volume,
              marketValue,
              
              profitabilityScore: scores.profitScore,
              stabilityScore: scores.stabilityScore,
              growthScore: scores.growthScore,
              qualityScore: scores.qualityScore,
              
              per: ratios.per,
              pbr: ratios.pbr,
              debtToEquity: ratios.debt,
              roe: ratios.roe,
              
              sector: meta.sector || "N/A",
              industry: meta.industry || "N/A",
              
              lastUpdate: new Date().toISOString(),
              source: `M:${apiUsed}${source}`
          };

          try { sessionStorage.setItem(cacheKey, JSON.stringify(result)); } catch (e) {}
          
          return result;

      } catch (e: any) {
          if (e.message === "FINNHUB_LIMIT" || e.message === "FMP_LIMIT") throw e; // Propagate limits
          return null;
      }
  };

  const runAiValueTrapCheck = async (candidates: QualityTicker[]) => {
      setAuditStatus('ANALYZING');
      setAuditResult("📡 Gemini 3.0: Scanning for Value Traps & Sector Trends...");
      addLog("Initiating AI Value Trap Detection...", "info");

      if (!candidates || candidates.length === 0) {
          setAuditResult("⚠️ Analysis Skipped: No Tickers.");
          setAuditStatus('FAILED');
          return;
      }

      const top5 = candidates.slice(0, 5);
      const prompt = `
    [Role: Senior Hedge Fund Risk Manager]
    Task: Analyze these top 5 high-quality stocks for "Value Traps" (Red Flags) and identify the dominant sector trend.
    
    Candidates: ${JSON.stringify(top5.map(c => ({ s: c.symbol, n: c.name, qScore: c.qualityScore, roe: c.roe, debt: c.debtToEquity, per: c.per })))}
    
    Requirements:
    1. **Sector**: Identify the dominant sector.
    2. **Value Trap Check**: Are any of these companies historically known for accounting irregularities, massive lawsuits, or dying industries?
    3. **Insight**: Provide a brief 1-sentence strategic insight in Korean.
    
    Return JSON: { "dominantSector": "string", "insight": "string (Korean)", "redFlags": ["symbol1 if bad", "symbol2 if bad"] }
    `;

      let aiResult = null;
      let modelName = "";

      try {
          // Gemini
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
          aiResult = sanitizeJson(response.text);
          modelName = "Gemini 3.0";

      } catch (geminiError: any) {
          addLog(`Gemini Audit Failed: ${geminiError.message}`, "warn");
          // Fallback to Perplexity
          try {
             const pConfig = API_CONFIGS.find(c => c.provider === ApiProvider.PERPLEXITY);
             const pKey = pConfig?.key || "";
             
             const res = await fetch('https://api.perplexity.ai/chat/completions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${pKey}` },
                body: JSON.stringify({ model: 'sonar-pro', messages: [{ role: "user", content: prompt + " Return JSON." }] })
             });
             const json = await res.json();
             if (json.usage) trackUsage(ApiProvider.PERPLEXITY, json.usage.total_tokens || 0);
             aiResult = sanitizeJson(json.choices?.[0]?.message?.content);
             modelName = "Sonar Pro";
          } catch (pError: any) {
             addLog(`Fallback Failed: ${pError.message}`, "err");
          }
      }

      if (aiResult && aiResult.insight) {
          const redFlags = aiResult.redFlags?.length > 0 ? `⚠️ Red Flags: ${aiResult.redFlags.join(', ')}` : "✅ No Major Red Flags Detected.";
          const finalMsg = `[${aiResult.dominantSector}] ${aiResult.insight} | ${redFlags}`;
          
          setAuditResult(`${modelName}: ${finalMsg}`);
          setAuditStatus('SUCCESS');
          
          // Mark value traps in dataset
          if (aiResult.redFlags && Array.isArray(aiResult.redFlags)) {
              const updated = candidates.map(c => ({
                  ...c,
                  isValueTrap: aiResult.redFlags.includes(c.symbol)
              }));
              setProcessedData(updated);
          }
          addLog(`Deep Audit Complete via ${modelName}`, "ok");
      } else {
          setAuditResult("⚠️ AI Audit Unavailable.");
          setAuditStatus('FAILED');
      }
  };

  const executeDeepQualityScan = async () => {
    if (!accessToken) {
        addLog("Error: Vault Disconnected.", "err");
        return;
    }
    if (loading) return;

    setLoading(true);
    setAuditStatus('IDLE');
    setAuditResult(null);
    startTimeRef.current = Date.now();
    setTimeStats({ elapsed: 0, eta: 0 });
    setProcessedData([]);
    setProgress({ current: 0, total: 0, cacheHits: 0 });
    setIsSafeMode(false);

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

      let universe = content.investable_universe || [];
      const total = universe.length;

      // Sort by liquidity (Price * Volume) to prioritize important stocks
      universe.sort((a: any, b: any) => (b.price * b.volume) - (a.price * a.volume));

      addLog(`Universe Loaded: ${total} Assets. Starting 3-Factor Scan...`, "info");
      setProgress({ current: 0, total, cacheHits: 0 });

      const results: QualityTicker[] = [];
      const BATCH_SIZE = 5;
      const DELAY_MS = 250;
      const SAFE_DELAY_MS = 2500;

      let processedCount = 0;
      
      while (processedCount < total) {
          const batch = universe.slice(processedCount, processedCount + BATCH_SIZE);
          
          try {
              const promises = batch.map((item: any) => fetchFinancials(item));
              const batchResults = await Promise.all(promises);
              
              batchResults.forEach(res => {
                  if (res) results.push(res);
              });
              
              processedCount += BATCH_SIZE;
              setProgress(prev => ({ ...prev, current: Math.min(processedCount, total) }));
              
              // Rate Limiting
              const delay = isSafeMode ? SAFE_DELAY_MS : DELAY_MS;
              await new Promise(r => setTimeout(r, delay));

          } catch (e: any) {
              if (e.message === "FMP_LIMIT") {
                  addLog("FMP Limit. Switching to Backup Providers...", "warn");
                  setIsSafeMode(true);
                  await new Promise(r => setTimeout(r, 1000));
              } else if (e.message === "FINNHUB_LIMIT") {
                  addLog("Finnhub Rate Limit. Pausing...", "warn");
                  await new Promise(r => setTimeout(r, 10000));
              } else {
                  addLog(`Batch Error: ${e.message}`, "err");
                  processedCount += BATCH_SIZE;
              }
          }
      }

      addLog(`Scan Complete. ${results.length} Qualified Assets. Validating...`, "info");
      
      // Sort by Quality Score
      const elite = results.sort((a, b) => b.qualityScore - a.qualityScore).slice(0, 300);
      setProcessedData(elite);

      // Perform AI Audit on Top 5
      await runAiValueTrapCheck(elite);
      
      // Save to Drive
      const folderId = await ensureFolder(accessToken, GOOGLE_DRIVE_TARGET.stage2SubFolder);
      
      // [KST TIMESTAMP LOGIC]
      const now = new Date();
      const kstDate = new Date(now.getTime() + 9 * 60 * 60 * 1000);
      const timestamp = kstDate.toISOString().replace('T', '_').replace(/:/g, '-').split('.')[0];
        
      const fileName = `STAGE2_ELITE_UNIVERSE_${timestamp}.json`;
      
      const payload = {
        manifest: { version: "5.0.0", strategy: "3-Factor_Quant_Model", timestamp: new Date().toISOString() },
        elite_universe: elite
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

  const formatTime = (seconds: number) => {
    if (seconds <= 0) return "--:--";
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Scatter Data for Visualization
  const scatterData = processedData.slice(0, 50).map(t => ({
      symbol: t.symbol,
      x: t.growthScore, // Valuation/Growth
      y: t.qualityScore, // Quality
      z: t.marketValue, // Size
      fill: t.isValueTrap ? '#ef4444' : '#10b981'
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
                <h2 className="text-xl md:text-3xl font-black text-white italic tracking-tighter uppercase leading-none">Deep_Quality v5.0.0</h2>
                <div className="flex flex-col mt-2 gap-1">
                   <div className="flex flex-wrap items-center gap-2">
                        <span className={`text-[8px] font-black px-2 py-0.5 rounded border uppercase tracking-widest ${loading ? 'border-blue-400 text-blue-400 animate-pulse' : 'border-blue-500/20 bg-blue-500/10 text-blue-400'}`}>
                            {loading ? `Scanning: ${progress.current}/${progress.total}` : '3-Factor Quant Ready'}
                        </span>
                        <span className={`text-[8px] font-black px-2 py-0.5 rounded border uppercase tracking-widest transition-all duration-300 ${isSafeMode ? 'border-amber-500/20 bg-amber-500/10 text-amber-400 animate-pulse' : 'border-purple-500/20 bg-purple-500/10 text-purple-400'}`}>
                            {isSafeMode ? "Safe Mode (Delay 2500ms)" : "Ready: Adaptive Quant Engine"}
                        </span>
                        {progress.cacheHits > 0 && (
                            <span className="text-[8px] px-2 py-0.5 bg-emerald-900/50 text-emerald-400 border border-emerald-500/20 rounded font-black uppercase">
                                Cache Hits: {progress.cacheHits}
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
            <button 
              onClick={executeDeepQualityScan} 
              disabled={loading} 
              className={`w-full lg:w-auto px-8 md:px-12 py-4 md:py-5 bg-blue-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-blue-900/20 hover:scale-105 active:scale-95 transition-all`}
            >
              {loading ? 'Executing Quant Scan...' : 'Start Deep Quality Filter'}
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-8 mb-6 md:mb-10">
            {/* Progress Card */}
            <div className="flex flex-col gap-6">
                <div className="bg-black/40 p-6 md:p-8 rounded-3xl border border-white/5">
                    <div className="flex justify-between items-center mb-6">
                        <p className="text-[9px] font-black text-blue-400 uppercase tracking-widest">Global Scan Progress</p>
                        <p className="text-xl font-mono font-black text-white italic">{loading ? `${((progress.current / (progress.total || 1)) * 100).toFixed(1)}%` : 'Idle'}</p>
                    </div>
                    <div className="h-2 bg-slate-800 rounded-full overflow-hidden mb-4">
                        <div 
                            className={`h-full transition-all duration-300 ${isSafeMode ? 'bg-amber-500' : 'bg-blue-500'}`} 
                            style={{ width: `${(progress.current / (progress.total || 1)) * 100}%` }}
                        ></div>
                    </div>
                    <div className="flex justify-between text-[8px] uppercase font-bold text-slate-500">
                        <span>Profitability Check</span>
                        <span>Stability Check</span>
                        <span>Value Check</span>
                    </div>
                </div>

                {/* AI Audit Widget */}
                <div className={`bg-blue-900/10 p-6 md:p-8 rounded-3xl border relative overflow-hidden group transition-colors flex-1 ${auditStatus === 'ANALYZING' ? 'border-blue-500/50' : auditStatus === 'SUCCESS' ? 'border-emerald-500/50' : 'border-blue-500/10'}`}>
                    <div className="flex justify-between items-center mb-2">
                        <p className={`text-[9px] font-black uppercase tracking-widest ${auditStatus === 'SUCCESS' ? 'text-emerald-400' : 'text-blue-400'}`}>AI Value Trap Detector</p>
                    </div>
                    <p className={`text-xs font-bold leading-relaxed italic ${auditResult ? 'text-white' : 'text-slate-500'}`}>
                        {auditResult || "Awaiting Top-Tier Candidate Analysis..."}
                    </p>
                    {auditStatus === 'ANALYZING' && <div className="absolute bottom-0 left-0 h-1 bg-blue-500 animate-pulse w-full"></div>}
                    {auditStatus === 'SUCCESS' && <div className="absolute bottom-0 left-0 h-1 bg-emerald-500 w-full"></div>}
                </div>
            </div>

            {/* Scatter Chart - Quality vs Value */}
            <div className="bg-black/40 p-4 rounded-3xl border border-white/5 min-h-[300px] flex flex-col relative">
                <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-4 absolute top-6 left-6 z-10">Quality-Value Matrix (Top 50)</p>
                <div className="flex-1 w-full h-full mt-4">
                    {processedData.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                            <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.2} />
                                <XAxis type="number" dataKey="x" name="Value Score" stroke="#64748b" fontSize={9} label={{ value: 'Value Score (Upside)', position: 'bottom', fill: '#64748b', fontSize: 9 }} domain={[0, 100]} />
                                <YAxis type="number" dataKey="y" name="Quality Score" stroke="#64748b" fontSize={9} label={{ value: 'Quality Score', angle: -90, position: 'insideLeft', fill: '#64748b', fontSize: 9 }} domain={[0, 100]} />
                                <RechartsTooltip 
                                    cursor={{ strokeDasharray: '3 3' }}
                                    content={({ active, payload }) => {
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
                                    }}
                                />
                                <ReferenceLine x={50} stroke="#475569" strokeDasharray="3 3" />
                                <ReferenceLine y={50} stroke="#475569" strokeDasharray="3 3" />
                                <Scatter name="Elite Stocks" data={scatterData} fill="#3b82f6">
                                    {scatterData.map((entry, index) => (
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
