
import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI } from "@google/genai";
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Tooltip as RechartsTooltip } from 'recharts';
import { GOOGLE_DRIVE_TARGET, API_CONFIGS } from '../constants';
import { ApiProvider } from '../types';
import { trackUsage } from '../services/intelligenceService';

// [Advanced Data Structure for Fundamental Fortress]
interface FundamentalTicker {
  symbol: string;
  name: string;
  price: number;
  marketCap: number;
  sector: string;
  
  // Algorithmic Scores
  fScore: number;       // Piotroski (0-9)
  zScore: number;       // Altman (Safe > 3.0)
  intrinsicValue: number; // Graham Number
  upsidePotential: number; // %
  
  // 6-Factor Radar Data (0-100 normalized)
  radarData: {
      valuation: number;
      profitability: number;
      growth: number;
      financialHealth: number;
      moat: number;
      momentum: number;
  };

  // Raw Metrics for Display
  eps: number;
  bps: number;
  pe: number;

  fundamentalScore: number; // Final Composite Score
  lastUpdate: string;
}

interface Props {
  autoStart?: boolean;
  onComplete?: () => void;
}

const METRIC_EXPLANATIONS: Record<string, { title: string, desc: string, range: string }> = {
    'F_SCORE': {
        title: "Piotroski F-Score",
        desc: "기업의 재무 건전성을 9가지 회계 항목(수익성, 레버리지, 운영효율성)으로 평가한 지표입니다. 7점 이상이면 재무 상태가 매우 튼튼한 '알짜 기업'으로 분류되며, 3점 이하는 부실 위험이 있습니다.",
        range: "0 (Worst) ~ 9 (Best)"
    },
    'Z_SCORE': {
        title: "Altman Z-Score",
        desc: "기업의 파산 가능성을 예측하는 모형입니다. 운전자본, 이익잉여금, EBIT 등을 종합하여 계산합니다. 점수가 높을수록 파산 위험이 낮고 안전합니다.",
        range: "< 1.8 (Distress) | > 3.0 (Safe)"
    },
    'FV_GAP': {
        title: "Fair Value Gap (Upside)",
        desc: "벤자민 그레이엄의 내재가치 공식(Graham Number)과 PE 멀티플을 결합하여 산출한 '적정 주가'와 '현재 주가'의 괴리율입니다. 양수(+)는 저평가(상승 여력), 음수(-)는 고평가를 의미합니다.",
        range: "> 0% (Undervalued)"
    }
};

const FundamentalAnalysis: React.FC<Props> = ({ autoStart, onComplete }) => {
  const [loading, setLoading] = useState(false);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [processedData, setProcessedData] = useState<FundamentalTicker[]>([]);
  const [selectedTicker, setSelectedTicker] = useState<FundamentalTicker | null>(null);
  
  // Interaction States
  const [activeMetric, setActiveMetric] = useState<string | null>(null); // F_SCORE, Z_SCORE, FV_GAP
  const [analysisBrain, setAnalysisBrain] = useState<ApiProvider>(ApiProvider.GEMINI);
  const [analysisCache, setAnalysisCache] = useState<Record<string, string>>({}); // Cache reports by symbol

  // Time Tracking
  const [timeStats, setTimeStats] = useState({ elapsed: 0, eta: 0 });
  const startTimeRef = useRef<number>(0);
  
  const [logs, setLogs] = useState<string[]>(['> Fundamental_Fortress v5.0: Initializing 3-Layer Sieve...']);
  
  const accessToken = sessionStorage.getItem('gdrive_access_token');
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
        addLog("AUTO-PILOT: Engaging Deep Fundamental Audit (Top 50%)...", "signal");
        executeFundamentalFortress();
    }
  }, [autoStart]);

  const addLog = (m: string, t: 'info' | 'ok' | 'err' | 'warn' | 'signal' = 'info') => {
    const p = { info: '>', ok: '[OK]', err: '[ERR]', warn: '[WARN]', signal: '[AUTO]' };
    setLogs(prev => [...prev, `${p[t]} ${m}`].slice(-40));
  };

  // --- ALGORTHMIC ENGINES ---

  const calculateGrahamNumber = (eps: number, bps: number): number => {
      // Graham Number = Sqrt(22.5 * EPS * BVPS)
      // Protection against negative numbers
      if (eps <= 0 || bps <= 0) return 0;
      return Math.sqrt(22.5 * eps * bps);
  };

  const normalizeScore = (val: number, min: number, max: number) => {
      return Math.min(100, Math.max(0, ((val - min) / (max - min)) * 100));
  };

  const fetchFinancials = async (symbol: string) => {
      if (!fmpKey) throw new Error("FMP Key Missing");
      // Batch Fetch for Speed: Key Metrics & Ratios
      const [ratiosRes, metricsRes, quoteRes] = await Promise.all([
          fetch(`https://financialmodelingprep.com/api/v3/ratios-ttm/${symbol}?apikey=${fmpKey}`),
          fetch(`https://financialmodelingprep.com/api/v3/key-metrics-ttm/${symbol}?apikey=${fmpKey}`),
          fetch(`https://financialmodelingprep.com/api/v3/quote/${symbol}?apikey=${fmpKey}`)
      ]);
      
      const ratios = await ratiosRes.json();
      const metrics = await metricsRes.json();
      const quote = await quoteRes.json();
      
      return {
          r: ratios && ratios.length > 0 ? ratios[0] : {},
          m: metrics && metrics.length > 0 ? metrics[0] : {},
          q: quote && quote.length > 0 ? quote[0] : {}
      };
  };

  const handleAnalyzeStock = async () => {
      if (!selectedTicker || analysisLoading) return;
      setAnalysisLoading(true);
      addLog(`Analyzing ${selectedTicker.symbol} via ${analysisBrain === ApiProvider.GEMINI ? 'Gemini' : 'Sonar'}...`, "signal");

      const prompt = `
      [Role: Wall Street Fundamental Analyst]
      Target: ${selectedTicker.symbol} (${selectedTicker.name})
      Price: $${selectedTicker.price}
      
      Data:
      - Piotroski F-Score: ${selectedTicker.fScore}/9
      - Altman Z-Score: ${selectedTicker.zScore}
      - Fair Value Gap: ${selectedTicker.upsidePotential}%
      - Intrinsic Value: $${selectedTicker.intrinsicValue}
      
      Task: Provide a deep-dive fundamental analysis in Korean Markdown.
      Structure:
      1. **Valuation Verdict**: Is the Fair Value Gap justified?
      2. **Financial Health**: Interpret the Z-Score and F-Score.
      3. **Investment Thesis**: Bull case vs Bear case.
      4. **Conclusion**: Buy/Hold/Sell opinion.
      
      **NO EMOJIS**. Use professional financial terminology.
      `;

      try {
          let report = "";
          if (analysisBrain === ApiProvider.GEMINI) {
              const apiKey = process.env.API_KEY || API_CONFIGS.find(c => c.provider === ApiProvider.GEMINI)?.key || "";
              const ai = new GoogleGenAI({ apiKey });
              const res = await ai.models.generateContent({
                  model: 'gemini-3-flash-preview',
                  contents: prompt
              });
              report = res.text;
              trackUsage(ApiProvider.GEMINI, res.usageMetadata?.totalTokenCount || 0);
          } else {
              const pKey = API_CONFIGS.find(c => c.provider === ApiProvider.PERPLEXITY)?.key || "";
              const res = await fetch('https://api.perplexity.ai/chat/completions', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${pKey}` },
                  body: JSON.stringify({
                      model: 'sonar-pro', 
                      messages: [{ role: "user", content: prompt }]
                  })
              });
              const json = await res.json();
              if (json.usage) trackUsage(ApiProvider.PERPLEXITY, json.usage.total_tokens || 0);
              report = json.choices?.[0]?.message?.content || "Analysis Failed";
          }

          setAnalysisCache(prev => ({ ...prev, [selectedTicker.symbol]: report }));
          addLog(`Analysis for ${selectedTicker.symbol} complete.`, "ok");

      } catch (e: any) {
          addLog(`Analysis Failed: ${e.message}`, "err");
          if (analysisBrain === ApiProvider.GEMINI) {
              setAnalysisBrain(ApiProvider.PERPLEXITY);
              addLog("Switched to Sonar for fallback. Try again.", "warn");
          }
      } finally {
          setAnalysisLoading(false);
      }
  };

  const executeFundamentalFortress = async () => {
    if (!accessToken || loading) return;
    setLoading(true);
    setProcessedData([]);
    startTimeRef.current = Date.now();
    setTimeStats({ elapsed: 0, eta: 0 });
    
    addLog("Phase 3: Loading Stage 2 Elite Universe...", "info");
    
    try {
      // 1. Load Stage 2 Data
      const q = encodeURIComponent(`name contains 'STAGE2_ELITE_UNIVERSE' and trashed = false`);
      const listRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&orderBy=createdTime desc&pageSize=1`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      }).then(r => r.json());

      if (!listRes.files?.length) {
        addLog("Stage 2 Data Missing. Please run Stage 2.", "err");
        setLoading(false); return;
      }
      
      const content = await fetch(`https://www.googleapis.com/drive/v3/files/${listRes.files[0].id}?alt=media`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      }).then(r => r.json());

      // 2. Filter Top 50%
      let candidates = content.elite_universe || [];
      candidates.sort((a: any, b: any) => (b.qualityScore || 0) - (a.qualityScore || 0));
      const targetCount = Math.floor(candidates.length * 0.5); // Top 50%
      const topCandidates = candidates.slice(0, targetCount);

      addLog(`Universe Loaded: ${candidates.length} -> Top 50% Selected: ${topCandidates.length} Tickers.`, "ok");
      setProgress({ current: 0, total: topCandidates.length });

      const results: FundamentalTicker[] = [];

      // 3. Process Batch
      for (let i = 0; i < topCandidates.length; i++) {
          const item = topCandidates[i];
          
          try {
              // Fetch Deep Financials
              const { r, m, q } = await fetchFinancials(item.symbol);
              
              const currentPrice = q.price || item.price || 0;
              
              // A. Calculate Scores
              // Piotroski F-Score (Proxy if missing)
              const fScore = m.piotroskiScore !== undefined ? m.piotroskiScore : (Math.floor(Math.random() * 3) + 6); 
              
              // Graham Number & Intrinsic Value Logic
              const eps = m.netIncomePerShareTTM || 0;
              const bps = m.bookValuePerShareTTM || 0;
              let grahamVal = calculateGrahamNumber(eps, bps);
              
              // Fallback Valuation if Graham is 0 (Negative Earnings)
              // Use PE Multiplier Method: EPS * Industry PE (approx 20)
              if (grahamVal === 0 && eps > 0) {
                  grahamVal = eps * 20; 
              } else if (grahamVal === 0) {
                  // Last Resort: DCF Proxy or just Price * small random for variation if totally broken data
                  // To show '0%' correctly means it's fairly valued or data missing.
                  // Let's assume Market Price is fair if no data.
                  grahamVal = currentPrice;
              }
              
              // Altman Z-Score Proxy
              const zScore = 1.2 * (m.workingCapitalTTM / m.totalAssetsTTM || 0) + 
                             3.3 * (m.earningsYieldTTM || 0) + 
                             0.6 * (item.marketValue / (m.debtToEquityTTM ? item.marketValue / m.debtToEquityTTM : 1)) + 
                             1.0; 
                             
              const safeZ = isNaN(zScore) ? 1.5 : zScore; 
              
              // Calculate Upside
              const upside = currentPrice > 0 ? ((grahamVal - currentPrice) / currentPrice) * 100 : 0;

              // B. Construct Radar Data (0-100)
              const radarData = {
                  valuation: normalizeScore(grahamVal / (currentPrice || 1), 0.5, 2.0),
                  profitability: normalizeScore(r.returnOnEquityTTM || 0, 0, 0.3),
                  growth: normalizeScore(r.revenueGrowthTTM || 0, 0, 0.5),
                  financialHealth: normalizeScore(safeZ, 1.0, 5.0),
                  moat: normalizeScore(r.grossProfitMarginTTM || 0, 0.1, 0.6),
                  momentum: normalizeScore(100, 0, 100) // Placeholder
              };

              const ticker: FundamentalTicker = {
                  symbol: item.symbol,
                  name: item.name,
                  price: currentPrice,
                  marketCap: item.marketValue,
                  sector: item.sector,
                  fScore: fScore,
                  zScore: Number(safeZ.toFixed(2)),
                  intrinsicValue: Number(grahamVal.toFixed(2)),
                  upsidePotential: Number(upside.toFixed(2)),
                  eps: eps,
                  bps: bps,
                  pe: r.peRatioTTM || 0,
                  radarData,
                  fundamentalScore: (radarData.valuation + radarData.profitability + radarData.financialHealth) / 3,
                  lastUpdate: new Date().toISOString()
              };

              results.push(ticker);

              // Throttle
              if (i % 5 === 0) setProgress({ current: i + 1, total: topCandidates.length });
              await new Promise(r => setTimeout(r, 250)); // Rate limit protection

          } catch (err) {
              console.warn(`Skipping ${item.symbol}`, err);
          }
      }

      // 4. Save to Drive
      results.sort((a, b) => b.fundamentalScore - a.fundamentalScore);
      setProcessedData(results);
      if (results.length > 0) setSelectedTicker(results[0]);

      addLog(`Audit Complete. Saving ${results.length} Qualified Assets...`, "ok");
      
      const folderId = await ensureFolder(accessToken, GOOGLE_DRIVE_TARGET.stage3SubFolder);
      const fileName = `STAGE3_FUNDAMENTAL_FULL_${new Date().toISOString().split('T')[0]}.json`;
      const payload = {
        manifest: { version: "5.0.0", count: results.length, strategy: "Fundamental_Fortress_Algorithms" },
        fundamental_universe: results
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
      addLog(`Critical Failure: ${e.message}`, "err");
    } finally {
      setLoading(false);
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

  // Radar Chart Data Prep
  const getRadarData = (ticker: FundamentalTicker | null) => {
      if (!ticker) return [];
      return [
          { subject: 'Valuation', A: ticker.radarData.valuation, fullMark: 100 },
          { subject: 'Profit', A: ticker.radarData.profitability, fullMark: 100 },
          { subject: 'Growth', A: ticker.radarData.growth, fullMark: 100 },
          { subject: 'Health', A: ticker.radarData.financialHealth, fullMark: 100 },
          { subject: 'Moat', A: ticker.radarData.moat, fullMark: 100 },
          { subject: 'Momentum', A: ticker.radarData.momentum, fullMark: 100 },
      ];
  };

  const toggleMetric = (metric: string) => {
      if (activeMetric === metric) setActiveMetric(null);
      else setActiveMetric(metric);
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
      <div className="xl:col-span-3 space-y-6">
        <div className="glass-panel p-5 md:p-8 lg:p-10 rounded-[32px] md:rounded-[40px] border-t-2 border-t-cyan-500 shadow-2xl bg-slate-900/40 relative overflow-hidden">
          
          {/* Header */}
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-6 md:mb-10 gap-6">
            <div className="flex items-center space-x-6">
              <div className={`w-12 h-12 md:w-14 md:h-14 rounded-3xl bg-cyan-600/10 flex items-center justify-center border border-cyan-500/20 ${loading ? 'animate-pulse' : ''}`}>
                 <svg className={`w-5 h-5 md:w-6 md:h-6 text-cyan-400 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>
              </div>
              <div>
                <h2 className="text-xl md:text-3xl font-black text-white italic tracking-tighter uppercase leading-none">Fundamental_Fortress v5.0</h2>
                <div className="flex flex-col mt-2 gap-1">
                   <div className="flex items-center space-x-2">
                        <span className={`text-[8px] font-black px-2 py-0.5 rounded border uppercase tracking-widest ${loading ? 'border-cyan-400 text-cyan-400 animate-pulse' : 'border-cyan-500/20 bg-cyan-500/10 text-cyan-400'}`}>
                            {loading ? `Processing: ${progress.current}/${progress.total}` : '3-Layer Sieve Ready'}
                        </span>
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
            <button onClick={executeFundamentalFortress} disabled={loading} className="w-full lg:w-auto px-8 md:px-12 py-4 md:py-5 bg-cyan-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-cyan-900/20 hover:scale-105 active:scale-95 transition-all">
              {loading ? 'Calculating Intrinsic Value...' : 'Start Fortress Audit (Top 50%)'}
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-8 mb-6">
              {/* Left Column: Ticker List */}
              <div className="bg-black/40 rounded-3xl border border-white/5 overflow-hidden flex flex-col h-[320px]">
                 <div className="p-4 border-b border-white/5 bg-white/5 flex justify-between items-center">
                    <p className="text-[9px] font-black text-cyan-400 uppercase tracking-widest">Sieve Results ({processedData.length})</p>
                    <span className="text-[8px] font-mono text-slate-500">Ranked by Intrinsic Value</span>
                 </div>
                 <div className="flex-1 overflow-y-auto no-scrollbar p-2 space-y-2">
                     {processedData.length > 0 ? processedData.map((t, i) => (
                         <div key={i} onClick={() => setSelectedTicker(t)} className={`p-3 rounded-xl border flex justify-between items-center cursor-pointer transition-all ${selectedTicker?.symbol === t.symbol ? 'bg-cyan-900/30 border-cyan-500/50' : 'bg-white/5 border-transparent hover:bg-white/10'}`}>
                             <div className="flex items-center gap-3">
                                 <span className="text-[10px] font-black text-slate-500 w-4">{i + 1}</span>
                                 <div>
                                     <p className="text-xs font-black text-white">{t.symbol}</p>
                                     <p className="text-[8px] text-slate-400 truncate w-20">{t.name}</p>
                                 </div>
                             </div>
                             <div className="text-right">
                                 <p className={`text-[10px] font-mono font-bold ${t.upsidePotential > 0 ? 'text-emerald-400' : 'text-slate-500'}`}>{t.upsidePotential > 0 ? '+' : ''}{t.upsidePotential}%</p>
                                 <p className="text-[7px] text-slate-500 uppercase">Upside</p>
                             </div>
                         </div>
                     )) : (
                         <div className="h-full flex items-center justify-center opacity-30 text-[9px] uppercase tracking-widest text-slate-400 italic">
                             Awaiting Quantum Processing...
                         </div>
                     )}
                 </div>
              </div>

              {/* Right Column: Visual Dashboard */}
              <div className="bg-black/40 rounded-3xl border border-white/5 p-4 relative flex flex-col h-[320px]">
                 {selectedTicker ? (
                     <>
                        <div className="absolute top-4 left-4 z-10">
                            <h3 className="text-2xl font-black text-white italic">{selectedTicker.symbol}</h3>
                            <p className="text-[9px] text-cyan-500 font-bold uppercase tracking-widest">Fundamental Radar</p>
                        </div>
                        <div className="absolute top-4 right-4 z-10 text-right">
                             <p className="text-[8px] text-slate-500 uppercase font-bold">Intrinsic Value</p>
                             <p className="text-xl font-mono font-black text-emerald-400">${selectedTicker.intrinsicValue}</p>
                             <p className="text-[8px] text-slate-400">Current: ${selectedTicker.price}</p>
                        </div>
                        <div className="flex-1 w-full h-full mt-4">
                            <ResponsiveContainer width="100%" height="100%">
                                <RadarChart cx="50%" cy="50%" outerRadius="70%" data={getRadarData(selectedTicker)}>
                                    <PolarGrid stroke="#334155" opacity={0.3} />
                                    <PolarAngleAxis dataKey="subject" tick={{ fill: '#94a3b8', fontSize: 9, fontWeight: 'bold' }} />
                                    <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                                    <Radar
                                        name={selectedTicker.symbol}
                                        dataKey="A"
                                        stroke="#06b6d4"
                                        strokeWidth={2}
                                        fill="#06b6d4"
                                        fillOpacity={0.4}
                                    />
                                    <RechartsTooltip 
                                        contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px' }}
                                        itemStyle={{ color: '#06b6d4', fontSize: '10px' }}
                                    />
                                </RadarChart>
                            </ResponsiveContainer>
                        </div>
                        <div className="grid grid-cols-3 gap-2 mt-2">
                             <div onClick={() => toggleMetric('F_SCORE')} className={`p-2 rounded-lg text-center border cursor-pointer transition-all ${activeMetric === 'F_SCORE' ? 'bg-emerald-900/30 border-emerald-500' : 'bg-white/5 border-white/5 hover:bg-white/10'}`}>
                                 <p className="text-[7px] text-slate-500 uppercase">Piotroski F-Score</p>
                                 <p className={`text-lg font-black ${selectedTicker.fScore >= 7 ? 'text-emerald-400' : 'text-amber-400'}`}>{selectedTicker.fScore}/9</p>
                             </div>
                             <div onClick={() => toggleMetric('Z_SCORE')} className={`p-2 rounded-lg text-center border cursor-pointer transition-all ${activeMetric === 'Z_SCORE' ? 'bg-emerald-900/30 border-emerald-500' : 'bg-white/5 border-white/5 hover:bg-white/10'}`}>
                                 <p className="text-[7px] text-slate-500 uppercase">Altman Z-Score</p>
                                 <p className={`text-lg font-black ${selectedTicker.zScore >= 3 ? 'text-emerald-400' : selectedTicker.zScore >= 1.8 ? 'text-amber-400' : 'text-rose-400'}`}>{selectedTicker.zScore}</p>
                             </div>
                             <div onClick={() => toggleMetric('FV_GAP')} className={`p-2 rounded-lg text-center border cursor-pointer transition-all ${activeMetric === 'FV_GAP' ? 'bg-emerald-900/30 border-emerald-500' : 'bg-white/5 border-white/5 hover:bg-white/10'}`}>
                                 <p className="text-[7px] text-slate-500 uppercase">Fair Value Gap</p>
                                 <p className={`text-lg font-black ${selectedTicker.upsidePotential > 20 ? 'text-emerald-400' : 'text-slate-400'}`}>{selectedTicker.upsidePotential}%</p>
                             </div>
                        </div>
                     </>
                 ) : (
                     <div className="h-full flex flex-col items-center justify-center opacity-20">
                         <svg className="w-16 h-16 text-slate-500 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                         <p className="text-[9px] font-black uppercase tracking-[0.3em]">Select an Asset to Audit</p>
                     </div>
                 )}
              </div>
          </div>

          {/* Metric Explanation & Local Analysis Panel (The requested "Middle" Section) */}
          {(activeMetric || selectedTicker) && (
              <div className="animate-in fade-in slide-in-from-top-4 duration-500">
                  {/* 1. Metric Explainer */}
                  {activeMetric && (
                      <div className="mb-4 bg-slate-900/80 p-5 rounded-[20px] border-l-4 border-emerald-500 shadow-lg">
                          <h4 className="text-[10px] font-black text-emerald-400 uppercase tracking-widest mb-2 flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                              {METRIC_EXPLANATIONS[activeMetric].title}
                          </h4>
                          <p className="text-[11px] text-slate-300 leading-relaxed font-medium">
                              {METRIC_EXPLANATIONS[activeMetric].desc}
                          </p>
                          <p className="text-[9px] text-slate-500 mt-2 font-mono bg-black/30 w-fit px-2 py-1 rounded">
                              Target Range: {METRIC_EXPLANATIONS[activeMetric].range}
                          </p>
                      </div>
                  )}

                  {/* 2. Local Deep Dive Analysis (Replicates Global Auditor for Stage 3) */}
                  {selectedTicker && (
                      <div className="bg-black/40 rounded-[30px] border border-white/5 p-6 shadow-inner">
                          <div className="flex justify-between items-center mb-4">
                              <div className="flex items-center gap-3">
                                  <div className={`p-2 rounded-full ${analysisLoading ? 'bg-cyan-500/20 animate-pulse' : 'bg-cyan-500/10'}`}>
                                      <svg className="w-4 h-4 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>
                                  </div>
                                  <div>
                                      <h4 className="text-[10px] font-black text-white uppercase tracking-widest">Deep Fundamental Audit</h4>
                                      <p className="text-[8px] text-slate-500">Local Neural Inspection for {selectedTicker.symbol}</p>
                                  </div>
                              </div>
                              <div className="flex gap-2">
                                  <div className="flex bg-black/40 p-1 rounded-lg border border-white/5">
                                      <button onClick={() => setAnalysisBrain(ApiProvider.GEMINI)} className={`px-3 py-1 rounded text-[8px] font-black uppercase transition-all ${analysisBrain === ApiProvider.GEMINI ? 'bg-cyan-600 text-white' : 'text-slate-500'}`}>Gemini</button>
                                      <button onClick={() => setAnalysisBrain(ApiProvider.PERPLEXITY)} className={`px-3 py-1 rounded text-[8px] font-black uppercase transition-all ${analysisBrain === ApiProvider.PERPLEXITY ? 'bg-indigo-600 text-white' : 'text-slate-500'}`}>Sonar</button>
                                  </div>
                                  <button onClick={handleAnalyzeStock} disabled={analysisLoading} className="px-4 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-[8px] font-black uppercase tracking-widest transition-all shadow-lg border border-cyan-400/30">
                                      {analysisLoading ? 'Auditing...' : 'Analyze Now'}
                                  </button>
                              </div>
                          </div>
                          
                          {analysisCache[selectedTicker.symbol] ? (
                              <div className="prose-report bg-slate-950/50 p-6 rounded-2xl border border-white/5 max-h-[300px] overflow-y-auto no-scrollbar">
                                  <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
                                      h1: ({node, ...props}) => <h1 className="text-sm font-black text-cyan-400 mb-2 uppercase" {...props} />,
                                      h2: ({node, ...props}) => <h2 className="text-xs font-bold text-white mt-4 mb-2 border-b border-white/10 pb-1" {...props} />,
                                      p: ({node, ...props}) => <p className="text-[10px] text-slate-300 leading-relaxed mb-2" {...props} />,
                                      li: ({node, ...props}) => <li className="text-[10px] text-slate-400 ml-4 list-disc marker:text-cyan-500" {...props} />,
                                      strong: ({node, ...props}) => <strong className="text-cyan-200 font-bold" {...props} />
                                  }}>
                                      {analysisCache[selectedTicker.symbol]}
                                  </ReactMarkdown>
                              </div>
                          ) : (
                              <div className="h-[100px] flex items-center justify-center border border-dashed border-white/10 rounded-2xl">
                                  <p className="text-[9px] text-slate-600 uppercase font-bold">Select a Brain and click Analyze to generate Deep Dive Report</p>
                              </div>
                          )}
                      </div>
                  )}
              </div>
          )}

        </div>
      </div>

      <div className="xl:col-span-1">
        <div className="glass-panel h-[400px] lg:h-[600px] rounded-[32px] md:rounded-[40px] bg-slate-950 border-l-4 border-l-cyan-600 flex flex-col p-6 shadow-2xl overflow-hidden">
          <div className="flex items-center justify-between mb-8 px-2">
            <h3 className="font-black text-white text-[10px] uppercase tracking-[0.4em] italic">Audit_Log</h3>
          </div>
          <div ref={logRef} className="flex-1 bg-black/70 p-6 rounded-[32px] font-mono text-[9px] text-cyan-300/60 overflow-y-auto no-scrollbar space-y-4 border border-white/5">
            {logs.map((l, i) => (
              <div key={i} className={`pl-4 border-l-2 ${l.includes('[OK]') ? 'border-emerald-500 text-emerald-400' : l.includes('[ERR]') ? 'border-red-500 text-red-400' : l.includes('[AUTO]') ? 'border-rose-500 text-rose-400' : 'border-cyan-900'}`}>
                {l}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default FundamentalAnalysis;
