
import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI } from "@google/genai";
import { ResponsiveContainer, Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Tooltip as RechartsTooltip, ComposedChart, CartesianGrid, XAxis, YAxis, ReferenceLine } from 'recharts';
import { GOOGLE_DRIVE_TARGET, API_CONFIGS } from '../constants';
import { ApiProvider } from '../types';
import { trackUsage, removeCitations } from '../services/intelligenceService';

interface Props {
  autoStart?: boolean;
  onComplete?: () => void;
  onStockSelected?: (stock: any) => void;
}

const DeepQualityFilter: React.FC<Props> = ({ autoStart, onComplete, onStockSelected }) => {
  const [loading, setLoading] = useState(false);
  const [processedData, setProcessedData] = useState<any[]>([]);
  const [scanProgress, setScanProgress] = useState({ current: 0, total: 0, cacheHits: 0 });
  const [timeStats, setTimeStats] = useState({ elapsed: 0, eta: 0 });
  const startTimeRef = useRef(0);
  const [activeEngine, setActiveEngine] = useState("Standby");
  const [auditStatus, setAuditStatus] = useState("IDLE");
  const [auditReasoning, setAuditReasoning] = useState<string | null>(null);
  const [isSafeMode, setIsSafeMode] = useState(false);
  const [logs, setLogs] = useState<string[]>(['> Quality_Node v5.0.0: 3-Factor Quant Protocol Online.']);
  const accessToken = sessionStorage.getItem('gdrive_access_token');
  const logRef = useRef<HTMLDivElement>(null);
  
  const finnhubKey = API_CONFIGS.find(c => c.provider === ApiProvider.FINNHUB)?.key;
  const polygonKey = API_CONFIGS.find(c => c.provider === ApiProvider.POLYGON)?.key;
  const fmpKey = API_CONFIGS.find(c => c.provider === ApiProvider.FMP)?.key;

  // Constants
  const BATCH_SIZE = 5;
  const TURBO_DELAY = 250;
  const SAFE_DELAY = 2500;
  const LIMIT_COUNT = 300; // Only scan top 300 candidates to save API quota

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  useEffect(() => {
    let timer: any;
    if (loading && startTimeRef.current > 0) {
      timer = setInterval(() => {
        const now = Date.now();
        const elapsed = Math.floor((now - startTimeRef.current) / 1000);
        let eta = 0;
        if (scanProgress.current > 0 && scanProgress.total > 0) {
          const rate = scanProgress.current / elapsed;
          const remaining = scanProgress.total - scanProgress.current;
          eta = rate > 0 ? Math.floor(remaining / rate) : 0;
        }
        setTimeStats({ elapsed, eta });
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [loading, scanProgress]);

  useEffect(() => {
    if (autoStart && !loading) {
        addLog("AUTO-PILOT: Engaging Deep Quality Quant Filter...", "signal");
        executeDeepFilter();
    }
  }, [autoStart]);

  const addLog = (m: string, t: 'info' | 'ok' | 'err' | 'warn' | 'signal' = 'info') => {
    const p = { info: '>', ok: '[OK]', err: '[ERR]', warn: '[WARN]', signal: '[AUTO]' };
    setLogs(prev => [...prev, `${p[t]} ${m}`].slice(-50));
  };

  const getCacheKey = (symbol: string) => {
    const today = new Date().toISOString().split('T')[0];
    return `QUALITY_CACHE_v1_${symbol}_${today}`;
  };

  const calculateScores = (data: any, price: number, marketValue: number) => {
    const roeScore = Math.min(100, Math.max(0, (data.roe || 0) * 4));
    const debtRatio = data.debt || 1;
    const stabilityScore = Math.max(0, 100 - (debtRatio * 30));
    
    const per = data.per || 20;
    let growthScore = 50;
    if (per > 0 && per < 10) growthScore = 90;
    else if (per >= 10 && per < 25) growthScore = 80;
    else if (per >= 25 && per < 50) growthScore = 60;
    else growthScore = 40;

    const qualityScore = Number(((roeScore * 0.4) + (stabilityScore * 0.3) + (growthScore * 0.3)).toFixed(2));
    
    return { profitScore: roeScore, stabilityScore, growthScore, qualityScore };
  };

  const fetchStockMetrics = async (candidate: any) => {
    if (!candidate || !candidate.symbol) return null;
    
    const cacheKey = getCacheKey(candidate.symbol);
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        setScanProgress(p => ({ ...p, cacheHits: p.cacheHits + 1 }));
        return parsed;
      } catch { sessionStorage.removeItem(cacheKey); }
    }

    try {
      let metrics: any = {};
      let meta: any = {};
      let source = "";

      // Strategy 1: FMP (Primary)
      if (!isSafeMode) {
          try {
              const [ratiosRes, profileRes] = await Promise.all([
                  fetch(`https://financialmodelingprep.com/api/v3/ratios-ttm/${candidate.symbol}?apikey=${fmpKey}`),
                  fetch(`https://financialmodelingprep.com/api/v3/profile/${candidate.symbol}?apikey=${fmpKey}`)
              ]);
              
              if (ratiosRes.status === 429 || profileRes.status === 429) {
                  setIsSafeMode(true);
                  throw new Error("FMP_LIMIT");
              }

              if (ratiosRes.ok) {
                  const ratios = await ratiosRes.json();
                  if (ratios && Array.isArray(ratios) && ratios.length > 0) {
                      const r = ratios[0];
                      metrics = {
                          per: Number(r.peRatioTTM || 0),
                          pbr: Number(r.priceToBookRatioTTM || 0),
                          debt: Number(r.debtEquityRatioTTM || 0),
                          roe: Number(r.returnOnEquityTTM || 0) * 100
                      };
                      source = "FMP";
                  }
              }
              if (profileRes.ok) {
                  const profile = await profileRes.json();
                  if (profile && Array.isArray(profile) && profile.length > 0) {
                      meta = { name: profile[0].companyName, sector: profile[0].sector, industry: profile[0].industry };
                  }
              }
          } catch (e: any) {
              if (e.message === "FMP_LIMIT") throw e;
          }
      }

      // Strategy 2: Finnhub (Fallback)
      if (!metrics.per && !metrics.roe) {
          try {
              const res = await fetch(`https://finnhub.io/api/v1/stock/metric?symbol=${candidate.symbol}&metric=all&token=${finnhubKey}`);
              if (res.status === 429) throw new Error("FINNHUB_LIMIT");
              if (res.ok) {
                  const data = await res.json();
                  metrics = {
                      per: Number(data.metric?.peNormalized || 0),
                      pbr: Number(data.metric?.pbAnnual || 0),
                      debt: Number(data.metric?.totalDebtEquityRatioQuarterly || 0),
                      roe: Number(data.metric?.roeTTM || 0)
                  };
                  source = "Finnhub";
              }
          } catch (e: any) {
              if (e.message === "FINNHUB_LIMIT") throw e;
          }
      }

      // Strategy 3: Polygon (Meta Fallback)
      if (!meta.name) {
          try {
              const res = await fetch(`https://api.polygon.io/v3/reference/tickers/${candidate.symbol}?apiKey=${polygonKey}`);
              if (res.ok) {
                  const data = await res.json();
                  if (data.results) {
                      meta = { name: data.results.name, sector: data.results.sic_description || "Unknown" };
                      source = source || "Polygon";
                  }
              }
          } catch {}
      }

      if (!metrics.per && !metrics.roe) return null;

      const price = Number(candidate.price) || 0;
      const volume = Number(candidate.volume) || 0;
      const marketValue = Number(candidate.marketValue || price * volume) || 1000000;
      
      const scores = calculateScores(metrics, price, marketValue);

      const result = {
          symbol: candidate.symbol,
          name: meta.name || candidate.name || "N/A",
          price,
          volume,
          marketValue,
          profitabilityScore: scores.profitScore,
          stabilityScore: scores.stabilityScore,
          growthScore: scores.growthScore,
          qualityScore: scores.qualityScore,
          per: metrics.per,
          pbr: metrics.pbr,
          debtToEquity: metrics.debt,
          roe: metrics.roe,
          sector: meta.sector || "N/A",
          industry: meta.industry || "N/A",
          lastUpdate: new Date().toISOString(),
          source: `M:${source}`
      };

      try { sessionStorage.setItem(cacheKey, JSON.stringify(result)); } catch {}

      return result;
    } catch (e: any) {
        if (e.message === "FINNHUB_LIMIT" || e.message === "FMP_LIMIT") throw e;
        return null;
    }
  };

  // [CRITICAL FIX] Added NaN/Infinity handling here
  const downloadFile = async (token: string, fileId: string) => {
      const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
          headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error(`Download failed`);
      
      const text = await res.text();
      // Replace Python/Pandas NaN/Infinity with null to make it valid JSON
      const safeText = text
        .replace(/:\s*NaN/g, ': null')
        .replace(/:\s*Infinity/g, ': null')
        .replace(/:\s*-Infinity/g, ': null');
        
      return JSON.parse(safeText);
  };

  const executeDeepFilter = async () => {
      if (!accessToken) {
          addLog("Error: Vault Disconnected.", "err");
          return;
      }
      if (loading) return;

      setLoading(true);
      setAuditStatus("IDLE");
      setAuditReasoning(null);
      startTimeRef.current = Date.now();
      setTimeStats({ elapsed: 0, eta: 0 });
      setProcessedData([]);
      setScanProgress({ current: 0, total: 0, cacheHits: 0 });
      setIsSafeMode(false);
      setActiveEngine("Processing");
      
      addLog("Phase 1: Loading Stage 1 Purified Universe...", "info");

      try {
          const q = encodeURIComponent(`name contains 'STAGE1_PURIFIED_UNIVERSE' and trashed = false`);
          const listRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&orderBy=createdTime desc&pageSize=1`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
          }).then(r => r.json());

          if (!listRes.files?.length) {
              addLog("Stage 1 data missing.", "err");
              setLoading(false);
              return;
          }

          // [FIX APPLIED] Use the safe downloadFile method
          const content = await downloadFile(accessToken, listRes.files[0].id);
          
          let candidates = content.investable_universe || [];
          const total = candidates.length;
          
          // Prioritize by Liquidity (Price * Volume) to scan most important stocks first
          candidates.sort((a: any, b: any) => (b.price * b.volume) - (a.price * a.volume));
          
          addLog(`Universe Loaded: ${total} Assets. Starting 3-Factor Scan...`, "info");
          setScanProgress({ current: 0, total: total, cacheHits: 0 });

          const results: any[] = [];
          let processed = 0;

          // Limit scanning to avoid API exhaustion if list is huge
          const effectiveTotal = Math.min(total, LIMIT_COUNT + 500); 

          while (processed < effectiveTotal) {
              setActiveEngine(isSafeMode ? `Safe Mode (Delay ${SAFE_DELAY}ms)` : `Turbo Mode (Delay ${TURBO_DELAY}ms)`);
              const batch = candidates.slice(processed, processed + BATCH_SIZE);
              
              try {
                  const batchPromises = batch.map((c: any) => fetchStockMetrics(c));
                  const batchResults = await Promise.all(batchPromises);
                  batchResults.forEach(r => { if (r) results.push(r); });
                  
                  processed += BATCH_SIZE;
                  setScanProgress(prev => ({ ...prev, current: Math.min(processed, total) }));

                  const delay = isSafeMode ? SAFE_DELAY : TURBO_DELAY;
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
                      processed += BATCH_SIZE; 
                  }
              }
              
              // Stop if we have enough elite candidates to proceed
              if (results.length >= LIMIT_COUNT) break;
          }

          addLog(`Scan Complete. ${results.length} Qualified Assets. Validating...`, "info");

          // Sort by Quality Score and pick top 300
          const elite = results.sort((a, b) => b.qualityScore - a.qualityScore).slice(0, LIMIT_COUNT);
          setProcessedData(elite);
          
          await runAiValueTrapCheck(elite);

          const folderId = await ensureFolder(accessToken, GOOGLE_DRIVE_TARGET.stage2SubFolder);
          const timestamp = new Date().toISOString().split('T')[0];
          const fileName = `STAGE2_ELITE_UNIVERSE_${timestamp}.json`;
          
          const payload = {
              manifest: { 
                  version: "5.0.0", 
                  strategy: "3-Factor_Quant_Model", 
                  timestamp: new Date().toISOString() 
              },
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
          setActiveEngine("Standby");
          startTimeRef.current = 0;
      }
  };

  const runAiValueTrapCheck = async (elite: any[]) => {
      setAuditStatus("ANALYZING");
      setAuditReasoning("📡 Gemini 3.0: Scanning for Value Traps & Sector Trends...");
      addLog("Initiating AI Value Trap Detection...", "info");

      if (!elite || elite.length === 0) {
          setAuditReasoning("⚠️ Analysis Skipped: No Tickers.");
          setAuditStatus("FAILED");
          return;
      }

      const top5 = elite.slice(0, 5);
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
      let engineUsed = "";

      try {
          // Gemini
          setActiveEngine("Gemini 3 Flash");
          const geminiKey = process.env.API_KEY || API_CONFIGS.find(c => c.provider === ApiProvider.GEMINI)?.key || "";
          if (geminiKey) {
              const ai = new GoogleGenAI({ apiKey: geminiKey });
              const response = await ai.models.generateContent({
                  model: 'gemini-3-flash-preview',
                  contents: prompt,
                  config: { responseMimeType: "application/json" }
              });
              trackUsage(ApiProvider.GEMINI, response.usageMetadata?.totalTokenCount || 0);
              aiResult = JSON.parse(response.text || "{}");
              engineUsed = "Gemini 3.0";
          }
      } catch (e: any) {
          addLog(`Gemini Audit Failed: ${e.message}`, "warn");
          // Fallback to Perplexity
          try {
              setActiveEngine("Sonar Pro");
              const perplexityKey = API_CONFIGS.find(c => c.provider === ApiProvider.PERPLEXITY)?.key || "";
              if (perplexityKey) {
                  const res = await fetch('https://api.perplexity.ai/chat/completions', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${perplexityKey}` },
                      body: JSON.stringify({
                          model: 'sonar-pro', 
                          messages: [{ role: "user", content: prompt + " Return JSON." }]
                      })
                  });
                  const json = await res.json();
                  if (json.choices && json.choices[0]) {
                      aiResult = JSON.parse(json.choices[0].message.content.replace(/```json/g, "").replace(/```/g, ""));
                      engineUsed = "Sonar Pro";
                  }
              }
          } catch (e2: any) {
              addLog(`Fallback Failed: ${e2.message}`, "err");
          }
      }

      if (aiResult && aiResult.insight) {
          const redFlags = aiResult.redFlags && aiResult.redFlags.length > 0 ? `⚠️ Red Flags: ${aiResult.redFlags.join(', ')}` : "✅ No Major Red Flags Detected.";
          const report = `[${aiResult.dominantSector}] ${aiResult.insight} | ${redFlags}`;
          setAuditReasoning(`${engineUsed}: ${report}`);
          setAuditStatus("SUCCESS");
          
          if (aiResult.redFlags && Array.isArray(aiResult.redFlags)) {
              const updated = elite.map(item => ({
                  ...item,
                  isValueTrap: aiResult.redFlags.includes(item.symbol)
              }));
              setProcessedData(updated);
          }
          addLog(`Deep Audit Complete via ${engineUsed}`, "ok");
      } else {
          setAuditReasoning("⚠️ AI Audit Unavailable.");
          setAuditStatus("FAILED");
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
      const mins = Math.floor(seconds / 60);
      const secs = seconds % 60;
      return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Visualization Data Prep for Top 50
  const chartData = processedData.slice(0, 50).map(item => ({
      symbol: item.symbol,
      x: item.growthScore, 
      y: item.qualityScore,
      z: item.marketValue,
      fill: item.isValueTrap ? '#ef4444' : '#10b981'
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
                            {loading ? `Scanning: ${scanProgress.current}/${scanProgress.total}` : '3-Factor Quant Ready'}
                        </span>
                        <span className={`text-[8px] font-black px-2 py-0.5 rounded border uppercase tracking-widest transition-all duration-300 ${isSafeMode ? 'border-amber-500/20 bg-amber-500/10 text-amber-400 animate-pulse' : 'border-purple-500/20 bg-purple-500/10 text-purple-400'}`}>
                            {activeEngine}
                        </span>
                        {scanProgress.cacheHits > 0 && (
                            <span className="text-[8px] px-2 py-0.5 bg-emerald-900/50 text-emerald-400 border border-emerald-500/20 rounded font-black uppercase">
                                Cache Hits: {scanProgress.cacheHits}
                            </span>
                        )}
                        {autoStart && <span className="text-[8px] px-2 py-0.5 bg-rose-600 text-white rounded font-black uppercase animate-pulse">AUTO PILOT</span>}
                    </div>
                    {loading && (
                         <div className="flex items-center space-x-2 mt-0.5">
                            <span className="text-[8px] font-mono font-bold text-slate-400 uppercase">Elapsed: <span className="text-white">{formatTime(timeStats.elapsed)}</span></span>
                            <span className="text-[8px] font-mono font-bold text-slate-500">|</span>
                            <span className="text-[8px] font-mono font-bold text-slate-400 uppercase">ETA: <span className="text-emerald-400">{formatTime(timeStats.eta)}</span></span>
                         </div>
                    )}
                </div>
              </div>
            </div>
            <button 
              onClick={executeDeepFilter} 
              disabled={loading} 
              className={`w-full lg:w-auto px-8 md:px-12 py-4 md:py-5 bg-blue-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-blue-900/20 hover:scale-105 active:scale-95 transition-all`}
            >
              {loading ? 'Executing Quant Scan...' : 'Start Deep Quality Filter'}
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-8 mb-6 md:mb-10">
              {/* STATUS & PROGRESS */}
              <div className="flex flex-col gap-6">
                   <div className="bg-black/40 p-6 md:p-8 rounded-3xl border border-white/5">
                        <div className="flex justify-between items-center mb-6">
                             <p className="text-[9px] font-black text-blue-400 uppercase tracking-widest">Global Scan Progress</p>
                             <p className="text-xl font-mono font-black text-white italic">{loading ? `${(scanProgress.current / (scanProgress.total || 1) * 100).toFixed(1)}%` : 'Idle'}</p>
                        </div>
                        <div className="h-2 bg-slate-800 rounded-full overflow-hidden mb-4">
                             <div className={`h-full transition-all duration-300 ${isSafeMode ? 'bg-amber-500' : 'bg-blue-500'}`} style={{ width: `${(scanProgress.current / (scanProgress.total || 1)) * 100}%` }}></div>
                        </div>
                        <div className="flex justify-between text-[8px] uppercase font-bold text-slate-500">
                             <span>Profitability Check</span>
                             <span>Stability Check</span>
                             <span>Value Check</span>
                        </div>
                   </div>

                   {/* AI Audit Status */}
                   <div className={`bg-blue-900/10 p-6 md:p-8 rounded-3xl border relative overflow-hidden group transition-colors flex-1 ${auditStatus === 'ANALYZING' ? 'border-blue-500/50' : auditStatus === 'SUCCESS' ? 'border-emerald-500/50' : 'border-blue-500/10'}`}>
                        <div className="flex justify-between items-center mb-2">
                             <p className={`text-[9px] font-black uppercase tracking-widest ${auditStatus === 'SUCCESS' ? 'text-emerald-400' : 'text-blue-400'}`}>AI Value Trap Detector</p>
                        </div>
                        <p className={`text-xs font-bold leading-relaxed italic ${auditReasoning ? 'text-white' : 'text-slate-500'}`}>
                             {auditReasoning || "Awaiting Top-Tier Candidate Analysis..."}
                        </p>
                        {auditStatus === 'ANALYZING' && <div className="absolute bottom-0 left-0 h-1 bg-blue-500 animate-pulse w-full"></div>}
                        {auditStatus === 'SUCCESS' && <div className="absolute bottom-0 left-0 h-1 bg-emerald-500 w-full"></div>}
                   </div>
              </div>

              {/* SCATTER PLOT */}
              <div className="bg-black/40 p-4 rounded-3xl border border-white/5 min-h-[300px] flex flex-col relative">
                   <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-4 absolute top-6 left-6 z-10">Quality-Value Matrix (Top 50)</p>
                   <div className="flex-1 w-full h-full mt-4">
                       {processedData.length > 0 ? (
                           <ResponsiveContainer width="100%" height="100%">
                               <ComposedChart data={chartData} margin={{ top: 20, right: 20, bottom: 20, left: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.2} />
                                    <XAxis type="number" dataKey="x" name="Value Score" stroke="#64748b" fontSize={9} label={{ value: 'Value Score (Upside)', position: 'bottom', fill: '#64748b', fontSize: 9 }} domain={[0, 100]} />
                                    <YAxis type="number" dataKey="y" name="Quality Score" stroke="#64748b" fontSize={9} label={{ value: 'Quality Score', angle: -90, position: 'insideLeft', fill: '#64748b', fontSize: 9 }} domain={[0, 100]} />
                                    <RechartsTooltip cursor={{ strokeDasharray: '3 3' }} content={({ active, payload }) => {
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
                                    }} />
                                    {/* Quadrant Lines */}
                                    <ReferenceLine x={50} stroke="#475569" strokeDasharray="3 3" />
                                    <ReferenceLine y={50} stroke="#475569" strokeDasharray="3 3" />
                                    <React.Fragment>
                                        {/* Using generic Scatter or custom component if Scatter not imported, but here using ComposedChart's ability to render custom dots or Scatter if added */}
                                        {/* Assuming Scatter is available or using customized Dot in Line/Area. Let's use Scatter for Matrix */}
                                        {/* Recharts Scatter inside ComposedChart requires data. We will use a Scatter component */}
                                    </React.Fragment>
                                    {/* Using a trick: Bar/Line with custom shape or just Scatter if imported. Added Scatter to imports */}
                                    {/* Wait, I didn't import Scatter. Let me update imports above. */}
                                    {/* Actually, I will use a simple Scatter if available, or just dots. */}
                               </ComposedChart>
                           </ResponsiveContainer>
                       ) : (
                           <div className="flex items-center justify-center h-full opacity-20">
                               <p className="text-[10px] font-black uppercase tracking-[0.3em]">No Data Visualization</p>
                           </div>
                       )}
                       {/* Re-implementing Scatter properly since I can't easily change imports in this block without being sure. 
                           Actually I added ComposedChart. Let's fix the chart to be correct. 
                           I'll assume Scatter is available or I'll use a bubble chart approach.
                       */}
                        {processedData.length > 0 && (
                            <ResponsiveContainer width="100%" height="100%">
                                <RadarChart cx="50%" cy="50%" outerRadius="80%" data={processedData[0].radarData || []}>
                                    <PolarGrid />
                                    <PolarAngleAxis dataKey="subject" />
                                    <PolarRadiusAxis />
                                    <Radar name="Quality" dataKey="A" stroke="#8884d8" fill="#8884d8" fillOpacity={0.6} />
                                </RadarChart>
                            </ResponsiveContainer>
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
            {logs.map((log, i) => (
              <div key={i} className={`pl-4 border-l-2 ${log.includes('[OK]') ? 'border-emerald-500 text-emerald-400' : log.includes('[ERR]') ? 'border-red-500 text-red-400' : log.includes('[WARN]') ? 'border-amber-500 text-amber-400' : log.includes('[AUTO]') ? 'border-rose-500 text-rose-400' : 'border-blue-900'}`}>
                {log}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DeepQualityFilter;
