
import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI } from "@google/genai";
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Cell, LabelList, ReferenceLine } from 'recharts';
import { GOOGLE_DRIVE_TARGET, API_CONFIGS } from '../constants';
import { ApiProvider } from '../types';
import { trackUsage } from '../services/intelligenceService';

interface QualityTicker {
  symbol: string;
  name: string;
  price: number;
  volume: number;
  marketValue: number;
  
  // 3-Factor Scores
  profitabilityScore: number; // ROE, Margins
  stabilityScore: number;     // Debt/Eq, Volatility
  growthScore: number;        // Sales/EPS Growth
  qualityScore: number;       // Composite
  
  // Raw Metrics
  per: number;
  pbr: number;
  debtToEquity: number;
  roe: number;
  
  isValueTrap?: boolean;
  sector: string;
  industry: string;
  lastUpdate: string;
  source: string;
  
  // [DATA PRESERVATION]
  [key: string]: any;
}

interface Props {
  autoStart?: boolean;
  onComplete?: () => void;
  onStockSelected?: (stock: any) => void;
}

const DeepQualityFilter: React.FC<Props> = ({ autoStart, onComplete, onStockSelected }) => {
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, cacheHits: 0 });
  const [timeStats, setTimeStats] = useState({ elapsed: 0, eta: 0 });
  const startTimeRef = useRef<number>(0);
  
  const [processedData, setProcessedData] = useState<QualityTicker[]>([]);
  const [selectedTicker, setSelectedTicker] = useState<QualityTicker | null>(null);
  const [logs, setLogs] = useState<string[]>(['> Quality_Node v5.0.0: 3-Factor Quant Protocol Online.']);
  
  // Analysis State
  const [activeEngine, setActiveEngine] = useState<string>('Standby');
  const [aiStatus, setAiStatus] = useState<'IDLE' | 'ANALYZING' | 'SUCCESS' | 'FAILED'>('IDLE');
  const [aiMessage, setAiMessage] = useState<string | null>(null);
  const [isSafeMode, setIsSafeMode] = useState(false);

  const accessToken = sessionStorage.getItem('gdrive_access_token');
  const logRef = useRef<HTMLDivElement>(null);
  
  // API Keys
  const finnhubKey = API_CONFIGS.find(c => c.provider === ApiProvider.FINNHUB)?.key;
  const polygonKey = API_CONFIGS.find(c => c.provider === ApiProvider.POLYGON)?.key;
  const fmpKey = API_CONFIGS.find(c => c.provider === ApiProvider.FMP)?.key;

  const BATCH_SIZE = 5;
  const DELAY_MS = 250; 
  const SAFE_DELAY_MS = 2500;

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

  const handleTickerSelect = (ticker: QualityTicker) => {
      setSelectedTicker(ticker);
      if (onStockSelected) {
          onStockSelected(ticker);
      }
  };

  // 3-Factor Scoring Logic
  const calculateQuantScores = (ratios: any, price: number, marketCap: number) => {
      // 1. Profitability (ROE is king)
      const roe = Math.min(100, Math.max(0, (ratios.roe || 0) * 4)); // 25% ROE = 100pts
      
      // 2. Stability (Low Debt)
      const debt = ratios.debt || 1.0;
      const stability = Math.max(0, 100 - (debt * 30)); // >3.3 Debt = 0pts
      
      // 3. Growth/Value (PER)
      const per = ratios.per || 20;
      let growthVal = 50;
      if (per > 0 && per < 10) growthVal = 90; // Deep Value
      else if (per >= 10 && per < 25) growthVal = 80; // GARP
      else if (per >= 25 && per < 50) growthVal = 60; // High Growth
      else growthVal = 40; // Overvalued?
      
      // Composite
      const qualityScore = Number(((roe * 0.4) + (stability * 0.3) + (growthVal * 0.3)).toFixed(2));
      
      return { profitScore: roe, stabilityScore: stability, growthScore: growthVal, qualityScore };
  };

  const fetchFinancials = async (item: any): Promise<QualityTicker | null> => {
      if (!item || !item.symbol) return null;
      
      // Check Session Cache
      const cacheKey = `QUALITY_CACHE_v1_${item.symbol}_${new Date().toISOString().split('T')[0]}`;
      const cached = sessionStorage.getItem(cacheKey);
      if (cached) {
          try {
              const parsed = JSON.parse(cached);
              setProgress(p => ({ ...p, cacheHits: p.cacheHits + 1 }));
              return parsed;
          } catch(e) { sessionStorage.removeItem(cacheKey); }
      }

      try {
          let ratios: any = {};
          let profile: any = {};
          let source = "";
          let metaSource = "";

          // Priority 1: FMP (Rich Data)
          if (!isSafeMode) {
              try {
                  const [ratioRes, profileRes] = await Promise.all([
                      fetch(`https://financialmodelingprep.com/api/v3/ratios-ttm/${item.symbol}?apikey=${fmpKey}`),
                      fetch(`https://financialmodelingprep.com/api/v3/profile/${item.symbol}?apikey=${fmpKey}`)
                  ]);
                  
                  if (ratioRes.status === 429 || profileRes.status === 429) {
                      throw new Error("FMP_LIMIT");
                  }

                  if (ratioRes.ok) {
                      const data = await ratioRes.json();
                      if (data && data["Error Message"]) throw new Error("FMP_LIMIT");
                      if (data && Array.isArray(data) && data.length > 0) {
                          const r = data[0];
                          ratios = {
                              per: Number(r.peRatioTTM || 0),
                              pbr: Number(r.priceToBookRatioTTM || 0),
                              debt: Number(r.debtEquityRatioTTM || 0),
                              roe: Number(r.returnOnEquityTTM || 0) * 100 // Convert to %
                          };
                          source = "FMP";
                      }
                  }
                  if (profileRes.ok) {
                      const data = await profileRes.json();
                      if (data && Array.isArray(data) && data.length > 0) {
                          const p = data[0];
                          profile = { name: p.companyName, sector: p.sector, industry: p.industry };
                          metaSource = "FMP";
                      }
                  }
              } catch (e: any) {
                  if (e.message === "FMP_LIMIT") {
                      setIsSafeMode(true); 
                      throw e; // Rethrow to handle in batch loop
                  }
              }
          }

          // Priority 2: Finnhub (Fallback for Ratios)
          if ((!ratios.per && !ratios.roe)) {
              try {
                  const res = await fetch(`https://finnhub.io/api/v1/stock/metric?symbol=${item.symbol}&metric=all&token=${finnhubKey}`);
                  if (res.status === 429) throw new Error("FINNHUB_LIMIT");
                  
                  if (res.ok) {
                      const data = await res.json();
                      ratios = {
                          per: Number(data.metric?.peNormalized || 0),
                          pbr: Number(data.metric?.pbAnnual || 0),
                          debt: Number(data.metric?.totalDebtEquityRatioQuarterly || 0),
                          roe: Number(data.metric?.roeTTM || 0)
                      };
                      source = "Finnhub";
                  }
              } catch(e: any) {
                  if (e.message === "FINNHUB_LIMIT") throw e;
              }
          }

          // Priority 3: Polygon (Fallback for Meta)
          if (!profile.name) {
              try {
                  const res = await fetch(`https://api.polygon.io/v3/reference/tickers/${item.symbol}?apiKey=${polygonKey}`);
                  if (res.ok) {
                      const data = await res.json();
                      if (data.results) {
                          profile = {
                              name: data.results.name,
                              sector: data.results.sic_description || "Unknown"
                          };
                          metaSource = "Polygon";
                      }
                  }
              } catch {}
          }

          // If still no valid financial data, skip (Quality Filter)
          if (!ratios.per && !ratios.roe) return null;

          const price = Number(item.price) || 0;
          const vol = Number(item.volume) || 0;
          const mktCap = Number(item.marketValue || (price * vol)) || 1000000;

          const scores = calculateQuantScores(ratios, price, mktCap);

          const result: QualityTicker = {
              ...item, // Preserve previous stage data
              symbol: item.symbol,
              name: profile.name || item.name || "N/A",
              price: price,
              volume: vol,
              marketValue: mktCap,
              
              profitabilityScore: scores.profitScore,
              stabilityScore: scores.stabilityScore,
              growthScore: scores.growthScore,
              qualityScore: scores.qualityScore,
              
              per: ratios.per,
              pbr: ratios.pbr,
              debtToEquity: ratios.debt,
              roe: ratios.roe,
              
              sector: profile.sector || "N/A",
              industry: profile.industry || "N/A",
              
              lastUpdate: new Date().toISOString(),
              source: `M:${source}/P:${metaSource}`
          };
          
          try { sessionStorage.setItem(cacheKey, JSON.stringify(result)); } catch {}

          return result;

      } catch (e: any) {
          if (e.message === "FINNHUB_LIMIT" || e.message === "FMP_LIMIT") throw e;
          return null;
      }
  };

  const detectValueTraps = async (candidates: QualityTicker[]) => {
      setAiStatus('ANALYZING');
      setAiMessage("📡 Gemini 3.0: Scanning for Value Traps & Sector Trends...");
      addLog("Initiating AI Value Trap Detection...", "info");

      if (!candidates || candidates.length === 0) {
          setAiMessage("⚠️ Analysis Skipped: No Tickers.");
          setAiStatus('FAILED');
          return;
      }

      // Analyze top 5 quality leaders
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
      let usedProvider = "";

      try {
          setActiveEngine('Gemini 3 Flash');
          const geminiKey = process.env.API_KEY || API_CONFIGS.find(c => c.provider === ApiProvider.GEMINI)?.key || "";
          if (!geminiKey) throw new Error("Gemini API Key Missing");
          
          const ai = new GoogleGenAI({ apiKey: geminiKey });
          const response = await ai.models.generateContent({
              model: 'gemini-3-flash-preview',
              contents: prompt,
              config: { responseMimeType: "application/json" }
          });
          trackUsage(ApiProvider.GEMINI, response.usageMetadata?.totalTokenCount || 0);
          aiResult = sanitizeJson(response.text);
          usedProvider = "Gemini 3.0";
      } catch (e: any) {
          addLog(`Gemini Audit Failed: ${e.message}`, "warn");
          try {
              setActiveEngine('Sonar Pro');
              const perplexityKey = API_CONFIGS.find(c => c.provider === ApiProvider.PERPLEXITY)?.key || "";
              const pRes = await fetch('https://api.perplexity.ai/chat/completions', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${perplexityKey}` },
                  body: JSON.stringify({
                      model: 'sonar-pro', 
                      messages: [{ role: "user", content: prompt + " Return JSON." }]
                  })
              });
              const pJson = await pRes.json();
              if (pJson.usage) trackUsage(ApiProvider.PERPLEXITY, pJson.usage.total_tokens || 0);
              aiResult = sanitizeJson(pJson.choices?.[0]?.message?.content);
              usedProvider = "Sonar Pro";
          } catch (e2: any) {
              addLog(`Fallback Failed: ${e2.message}`, "err");
          }
      }

      if (aiResult && aiResult.insight) {
          const redFlagNote = aiResult.redFlags?.length > 0 ? `⚠️ Red Flags: ${aiResult.redFlags.join(', ')}` : "✅ No Major Red Flags Detected.";
          const finalMsg = `[${aiResult.dominantSector}] ${aiResult.insight} | ${redFlagNote}`;
          
          setAiMessage(`${usedProvider}: ${finalMsg}`);
          setAiStatus('SUCCESS');

          // Apply tags to processed data
          if (aiResult.redFlags && Array.isArray(aiResult.redFlags)) {
              const updatedData = candidates.map(t => ({
                  ...t,
                  isValueTrap: aiResult.redFlags.includes(t.symbol)
              }));
              setProcessedData(updatedData);
          }
          addLog(`Deep Audit Complete via ${usedProvider}`, "ok");
      } else {
          setAiMessage("⚠️ AI Audit Unavailable.");
          setAiStatus('FAILED');
      }
  };

  const executeDeepQualityScan = async () => {
    if (!accessToken) {
        addLog("Error: Vault Disconnected.", "err");
        return;
    }
    if (loading) return;
    
    setLoading(true);
    setAiStatus('IDLE');
    setAiMessage(null);
    startTimeRef.current = Date.now();
    setTimeStats({ elapsed: 0, eta: 0 });
    setProcessedData([]);
    setProgress({ current: 0, total: 0, cacheHits: 0 });
    setIsSafeMode(false);
    
    setActiveEngine('Processing');
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
      
      let candidates = content.investable_universe || [];
      const total = candidates.length;
      
      // Pre-sort by liquidity to prioritize good stocks
      candidates.sort((a: any, b: any) => (b.price * b.volume) - (a.price * a.volume));

      addLog(`Universe Loaded: ${total} Assets. Starting 3-Factor Scan...`, "info");
      setProgress({ current: 0, total, cacheHits: 0 });

      const qualifiedAssets: QualityTicker[] = [];
      let processedCount = 0;
      
      // Batch Processing
      while (processedCount < total) {
          setActiveEngine(isSafeMode ? `Safe Mode (Delay ${SAFE_DELAY_MS}ms)` : `Turbo Mode (Delay ${DELAY_MS}ms)`);
          
          const batch = candidates.slice(processedCount, processedCount + BATCH_SIZE);
          
          try {
              const promises = batch.map((c: any) => fetchFinancials(c));
              const results = await Promise.all(promises);
              
              results.forEach(r => {
                  if (r) qualifiedAssets.push(r);
              });
              
              processedCount += BATCH_SIZE;
              setProgress(prev => ({ ...prev, current: Math.min(processedCount, total) }));
              
              const delay = isSafeMode ? SAFE_DELAY_MS : DELAY_MS;
              await new Promise(r => setTimeout(r, delay));

          } catch (e: any) {
              if (e.message === "FMP_LIMIT") {
                  addLog("FMP Limit. Switching to Backup Providers...", "warn");
                  setIsSafeMode(true);
                  // Retry this batch with safe mode is implied by loop continuation with changed state
                  // Just slight pause
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

      addLog(`Scan Complete. ${qualifiedAssets.length} Qualified Assets. Validating...`, "info");
      
      // Keep Top 500 (Updated from 300)
      const elite = qualifiedAssets.sort((a, b) => b.qualityScore - a.qualityScore).slice(0, 500);
      setProcessedData(elite);
      
      // AI Audit on Leaders
      await detectValueTraps(elite);

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
      setActiveEngine('Standby');
      startTimeRef.current = 0;
      setIsSafeMode(false);
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

  // Use full data for scatter plot, mapped with payload for interactivity
  const chartData = processedData.map(d => ({
      symbol: d.symbol,
      x: d.growthScore,
      y: d.qualityScore,
      z: d.marketValue,
      fill: d.isValueTrap ? '#ef4444' : '#10b981',
      payload: d // Pass full data object for selection
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
                            {activeEngine}
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
              className={`w-full lg:w-auto px-8 md:px-12 py-4 md:py-5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${
                  loading 
                    ? 'bg-blue-800 text-blue-200/50 shadow-inner scale-95 cursor-wait border-t border-black/20' 
                    : 'bg-blue-600 text-white shadow-xl shadow-blue-900/20 hover:scale-105 active:scale-95'
              }`}
            >
              {loading ? 'Executing Quant Scan...' : 'Start Deep Quality Filter'}
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-8 mb-6 md:mb-10">
              {/* Progress Panel */}
              <div className="flex flex-col gap-6">
                  <div className="bg-black/40 p-6 md:p-8 rounded-3xl border border-white/5">
                     <div className="flex justify-between items-center mb-6">
                        <p className="text-[9px] font-black text-blue-400 uppercase tracking-widest">Global Scan Progress</p>
                        <p className="text-xl font-mono font-black text-white italic">{loading ? `${((progress.current / (progress.total || 1)) * 100).toFixed(1)}%` : 'Idle'}</p>
                     </div>
                     <div className="h-2 bg-slate-800 rounded-full overflow-hidden mb-4">
                        <div className={`h-full transition-all duration-300 ${isSafeMode ? 'bg-amber-500' : 'bg-blue-500'}`} style={{ width: `${(progress.current / (progress.total || 1)) * 100}%` }}></div>
                     </div>
                     <div className="flex justify-between text-[8px] uppercase font-bold text-slate-500">
                        <span>Profitability Check</span>
                        <span>Stability Check</span>
                        <span>Value Check</span>
                     </div>
                  </div>

                  {/* Value Trap Panel */}
                  <div className={`bg-blue-900/10 p-6 md:p-8 rounded-3xl border relative overflow-hidden group transition-colors flex-1 ${aiStatus === 'ANALYZING' ? 'border-blue-500/50' : aiStatus === 'SUCCESS' ? 'border-emerald-500/50' : 'border-blue-500/10'}`}>
                      <div className="flex justify-between items-center mb-2">
                          <p className={`text-[9px] font-black uppercase tracking-widest ${aiStatus === 'SUCCESS' ? 'text-emerald-400' : 'text-blue-400'}`}>AI Value Trap Detector</p>
                      </div>
                      <p className={`text-xs font-bold leading-relaxed italic ${aiMessage ? 'text-white' : 'text-slate-500'}`}>
                          {aiMessage || "Awaiting Top-Tier Candidate Analysis..."}
                      </p>
                      {aiStatus === 'ANALYZING' && <div className="absolute bottom-0 left-0 h-1 bg-blue-500 animate-pulse w-full"></div>}
                      {aiStatus === 'SUCCESS' && <div className="absolute bottom-0 left-0 h-1 bg-emerald-500 w-full"></div>}
                  </div>
              </div>

              {/* Chart Panel */}
              <div className="bg-black/40 p-4 rounded-3xl border border-white/5 min-h-[300px] flex flex-col relative">
                 <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-4 absolute top-6 left-6 z-10">Quality-Value Matrix (Top {processedData.length})</p>
                 <div className="flex-1 w-full h-full mt-4">
                     {processedData.length > 0 ? (
                         <ResponsiveContainer width="100%" height="100%">
                            <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.2} />
                                <XAxis type="number" dataKey="x" name="Value Score" stroke="#64748b" fontSize={9} label={{ value: "Value Score (Upside)", position: "bottom", fill: "#64748b", fontSize: 9 }} domain={[0, 100]} />
                                <YAxis type="number" dataKey="y" name="Quality Score" stroke="#64748b" fontSize={9} label={{ value: "Quality Score", angle: -90, position: "insideLeft", fill: "#64748b", fontSize: 9 }} domain={[0, 100]} />
                                <RechartsTooltip 
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
                                <Scatter 
                                    name="Elite Stocks" 
                                    data={chartData} 
                                    fill="#3b82f6"
                                    onClick={(p) => handleTickerSelect(p.payload)}
                                    style={{ cursor: 'pointer' }}
                                >
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
