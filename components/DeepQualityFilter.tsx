
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { GoogleGenAI } from "@google/genai";
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Treemap, ResponsiveContainer, Tooltip as RechartsTooltip } from 'recharts';
import { GOOGLE_DRIVE_TARGET, API_CONFIGS } from '../constants';
import { ApiProvider } from '../types';
import { trackUsage, removeCitations } from '../services/intelligenceService';

// [Advanced Institutional Data Structure]
interface QualityTicker {
  symbol: string;
  name: string;
  price: number;
  volume: number;
  marketValue: number;
  
  // Advanced Metrics
  zScore: number;       // Bankruptcy Risk (<1.8 Distress, >3.0 Safe)
  fScore: number;       // Financial Health (0-9)
  relativePeScore: number; // Sector Neutral Valuation
  
  // 3-Factor Scores (0-100)
  profitabilityScore: number; 
  stabilityScore: number;     
  growthScore: number;        
  qualityScore: number;       // Final Weighted Alpha Score

  // Raw Data
  per: number;
  roe: number;
  debtToEquity: number;
  pbr: number;
  
  // Meta
  sector: string;
  industry: string;
  theme: string; // New: Market Theme
  lastUpdate: string;
  source: string;

  // [DATA ACCUMULATION] Allow arbitrary fields from previous stages
  [key: string]: any;
}

interface Props {
  autoStart?: boolean;
  onComplete?: () => void;
  onStockSelected?: (stock: any) => void;
}

const CACHE_PREFIX = 'QUANT_CACHE_INSTITUTIONAL_v8_';
const THEME_COLORS = ['#10B981', '#3B82F6', '#6366F1', '#8B5CF6', '#EC4899', '#F59E0B', '#EF4444', '#06B6D4'];

const getDailyCacheKey = (symbol: string) => {
    const today = new Date().toISOString().split('T')[0];
    return `${CACHE_PREFIX}${symbol}_${today}`;
};

// [Sector Benchmarks for Relative Valuation] - derived from S&P 500 averages
const SECTOR_BENCHMARKS: Record<string, number> = {
    'Technology': 35.0, 'Health Services': 25.0, 'Consumer Services': 28.0, // Adjusted for Tech Premium
    'Finance': 15.0, 'Energy Minerals': 14.0, 'Consumer Non-Durables': 22.0,
    'Producer Manufacturing': 20.0, 'Utilities': 18.0, 'Transportation': 22.0,
    'Non-Energy Minerals': 18.0, 'Commercial Services': 26.0, 'Communications': 20.0
};

const DeepQualityFilter: React.FC<Props> = ({ autoStart, onComplete, onStockSelected }) => {
  const [loading, setLoading] = useState(false);
  const [processedData, setProcessedData] = useState<QualityTicker[]>([]);
  const [progress, setProgress] = useState({ current: 0, total: 0, cacheHits: 0, filteredOut: 0 });
  
  // [NEW] Drill-down State
  const [selectedTheme, setSelectedTheme] = useState<string | null>(null);

  // [NEW] Granular Analysis Phase State
  const [analysisPhase, setAnalysisPhase] = useState<'INIT' | 'PROFITABILITY' | 'STABILITY' | 'VALUATION' | 'COMPLETE'>('INIT');
  
  const [timeStats, setTimeStats] = useState({ elapsed: 0, eta: 0 });
  const startTimeRef = useRef<number>(0);

  const [networkStatus, setNetworkStatus] = useState<string>('Ready: Institutional Quant Engine');
  const [aiStatus, setAiStatus] = useState<'IDLE' | 'ANALYZING' | 'SUCCESS' | 'FAILED'>('IDLE');
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [fmpDepleted, setFmpDepleted] = useState(false);
  
  const [logs, setLogs] = useState<string[]>(['> Quant_Node v6.1: Mega-Cap Safety Protocol Active.']);
  
  const accessToken = sessionStorage.getItem('gdrive_access_token');
  const fmpKey = API_CONFIGS.find(c => c.provider === ApiProvider.FMP)?.key;
  const logRef = useRef<HTMLDivElement>(null);

  // [OPTIMIZATION] Increased Batch Size & Reduced Delay for Speed
  const BATCH_SIZE = 12; 
  const DELAY_TURBO = 50;   
  const DELAY_SAFE = 1000;   
  const TARGET_SELECTION_COUNT = 500; 
  
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
        addLog("AUTO-PILOT: Engaging Institutional Quality Filter...", "signal");
        executeDeepQualityScan();
    }
  }, [autoStart]);

  const addLog = (m: string, t: 'info' | 'ok' | 'err' | 'warn' | 'signal' = 'info') => {
    const p = { info: '>', ok: '[OK]', err: '[ERR]', warn: '[WARN]', signal: '[AUTO]' };
    setLogs(prev => [...prev, `${p[t]} ${m}`].slice(-50));
  };

  const clearStageCache = () => {
      try {
          const keysToRemove: string[] = [];
          for (let i = 0; i < sessionStorage.length; i++) {
              const key = sessionStorage.key(i);
              if (key && key.startsWith(CACHE_PREFIX)) keysToRemove.push(key);
          }
          if (keysToRemove.length === 0) return;
          keysToRemove.forEach(k => sessionStorage.removeItem(k));
          setProcessedData([]); 
          addLog(`[CACHE] System flushed. Clean slate ready.`, "warn");
      } catch (e) { console.error(e); }
  };

  const mapIndustryToTheme = (industry: string, sector: string) => {
      if (!industry) return sector;
      const ind = industry.toLowerCase();
      if (ind.includes('semi')) return 'Semiconductors';
      if (ind.includes('software') || ind.includes('data') || ind.includes('tech')) return 'SaaS & AI';
      if (ind.includes('biotech') || ind.includes('pharma')) return 'Bio/Pharma';
      if (ind.includes('bank') || ind.includes('invest') || ind.includes('insur')) return 'Financials';
      if (ind.includes('oil') || ind.includes('gas') || ind.includes('energy')) return 'Energy';
      if (ind.includes('aerospace') || ind.includes('defense')) return 'Defense';
      if (ind.includes('reit') || ind.includes('real estate')) return 'Real Estate';
      if (ind.includes('auto') || ind.includes('vehicle')) return 'Automotive';
      return sector; // Default to sector if no specific theme match
  };

  // [CORE LOGIC] Institutional Scoring Model (Enhanced for Mega Caps)
  const calculateInstitutionalScores = (metrics: any, sector: string, marketCap: number = 0) => {
      // 1. Profitability (Piotroski F-Score Proxy)
      const roe = metrics.roe || 0;
      let profitScore = 0;
      if (roe > 25) profitScore = 100;
      else if (roe > 15) profitScore = 90;
      else if (roe > 10) profitScore = 80;
      else if (roe > 0) profitScore = 60;
      else profitScore = 20;

      // 2. Stability (Altman Z-Score Logic)
      // [LOGIC PATCH] If Debt is missing (API limit), infer from Market Cap
      // Mega Caps (>20B) rarely go bankrupt overnight. Assume neutral debt (1.0).
      let de = metrics.debt;
      if (de === undefined || de === null) {
          de = (marketCap > 20_000_000_000) ? 1.0 : 2.0; // Mega-Cap Safety Net
      }

      let stabilityScore = 0;
      let zScoreProxy = 0;
      
      if (de < 0.5) { stabilityScore = 100; zScoreProxy = 4.5; }
      else if (de < 1.0) { stabilityScore = 90; zScoreProxy = 3.5; }
      else if (de < 1.5) { stabilityScore = 70; zScoreProxy = 2.5; }
      else if (de < 2.0) { stabilityScore = 50; zScoreProxy = 1.9; }
      else { stabilityScore = 20; zScoreProxy = 1.2; }

      // 3. Growth/Value (Sector Neutral Valuation)
      const sectorAvgPE = SECTOR_BENCHMARKS[sector] || 20;
      const pe = metrics.per || 25;
      let valScore = 0;
      
      const relativePe = pe / sectorAvgPE;
      if (relativePe < 0.6) valScore = 95; // Deep Value
      else if (relativePe < 0.9) valScore = 85; // Value
      else if (relativePe < 1.1) valScore = 70; // Fair
      else if (relativePe < 1.5) valScore = 50; // Growth Premium
      else valScore = 30; // Expensive

      // [GROWTH PATCH] If ROE is elite (>25%), forgive high PE (Quality Growth)
      if (roe > 25 && valScore < 60) valScore = 60; 

      // F-Score Simulation (0-9)
      let fScore = 0;
      if (roe > 0) fScore++;
      if (metrics.operatingCashFlow > 0) fScore++;
      if (de < 1.0) fScore++;
      if (metrics.currentRatio > 1.0) fScore++;
      fScore += 3; 

      // Final Quality Score with Market Cap Bias (Too big to fail factor)
      // Mega Caps get a slight nudge to ensure they survive the "Data Missing" penalty
      const sizeBonus = marketCap > 50_000_000_000 ? 10 : 0;
      const rawScore = ((profitScore * 0.4) + (stabilityScore * 0.35) + (valScore * 0.25)) + sizeBonus;
      const qualityScore = Number(Math.min(100, rawScore).toFixed(2));

      return { profitScore, stabilityScore, valScore, qualityScore, zScoreProxy, fScore };
  };

  const fetchTickerData = async (target: any): Promise<QualityTicker | null> => {
    if (!target || !target.symbol) return null;
    
    const cacheKey = getDailyCacheKey(target.symbol);
    const cachedRaw = sessionStorage.getItem(cacheKey);
    if (cachedRaw) {
        try {
            const cachedData = JSON.parse(cachedRaw);
            if (cachedData.qualityScore) { 
                setProgress(prev => ({ ...prev, cacheHits: prev.cacheHits + 1 }));
                return cachedData;
            }
        } catch(e) { sessionStorage.removeItem(cacheKey); }
    }

    try {
      let metrics: any = { roe: target.roe, per: target.pe };
      let profileData: any = {};
      let sector = target.sector;
      
      let foundData = false;
      
      try {
          const yRes = await fetch(`/api/yahoo?symbols=${target.symbol}`);
          if (yRes.ok) {
              const yData = await yRes.json();
              if (yData && yData.length > 0) {
                  const y = yData[0];
                  metrics = {
                      per: y.trailingPE || y.forwardPE || metrics.per,
                      pbr: y.priceToBook,
                      roe: y.returnOnEquity ? y.returnOnEquity * 100 : metrics.roe,
                      debt: y.debtToEquity ? y.debtToEquity / 100 : undefined
                  };
                  if (y.sector) sector = y.sector;
                  profileData = { name: y.name || target.name };
                  foundData = true;
              }
          }
      } catch (e) { }

      if ((!foundData || !metrics.roe) && !fmpDepleted && fmpKey) {
          try {
            const ratioRes = await fetch(`https://financialmodelingprep.com/api/v3/ratios-ttm/${target.symbol}?apikey=${fmpKey}`);
            if (ratioRes.status === 429) { setFmpDepleted(true); throw new Error("FMP_LIMIT"); }
            if (ratioRes.ok) {
                const data = await ratioRes.json();
                if (data && data.length > 0) {
                    const m = data[0];
                    metrics = {
                        ...metrics,
                        per: metrics.per || m.peRatioTTM,
                        debt: metrics.debt || m.debtEquityRatioTTM,
                        roe: metrics.roe || (m.returnOnEquityTTM ? m.returnOnEquityTTM * 100 : undefined)
                    };
                    foundData = true;
                }
            }
          } catch (e: any) { if (e.message === "FMP_LIMIT") throw e; }
      }

      if (sector === 'Unknown' || !sector) sector = "Unclassified";

      // [CRITICAL] Apply Institutional Scoring
      const scores = calculateInstitutionalScores(metrics, sector, target.marketCap);
      
      // Relaxed Z-Score for Mega Caps (Allow them even if Z-Score is slightly lower due to aggressive leverage)
      const zCutoff = (target.marketCap > 50_000_000_000) ? 1.0 : 1.2;
      if (scores.zScoreProxy < zCutoff) {
          return null; 
      }

      const resultTicker: QualityTicker = {
        ...target, // [ACCUMULATION] Spread original Stage 0/1 data first
        
        symbol: target.symbol,
        name: profileData.name || target.name || target.symbol,
        price: Number(target.price) || 0,
        volume: Number(target.volume) || 0,
        marketValue: Number(target.marketValue) || 0,
        
        zScore: Number(scores.zScoreProxy.toFixed(2)),
        fScore: scores.fScore,
        relativePeScore: scores.valScore,
        
        profitabilityScore: scores.profitScore,
        stabilityScore: scores.stabilityScore,
        growthScore: scores.valScore,
        qualityScore: scores.qualityScore, 

        per: metrics.per || 0,
        roe: metrics.roe || 0,
        debtToEquity: metrics.debt || 0,
        pbr: metrics.pbr || 0,
        
        sector: sector,
        industry: target.industry || "Unknown", 
        theme: mapIndustryToTheme(target.industry, sector),
        lastUpdate: new Date().toISOString(),
        source: foundData ? "Validated" : "Estimate"
      };
      
      sessionStorage.setItem(cacheKey, JSON.stringify(resultTicker));
      return resultTicker;

    } catch (e: any) {
      if (e.message === "FMP_LIMIT") throw e;
      return null;
    }
  };

  const analyzeUniverseHealth = async (tickers: QualityTicker[]) => {
    setAiStatus('ANALYZING');
    setAiAnalysis("📡 Gemini 3.0: Institutional Portfolio Audit in progress...");
    
    if (!tickers || tickers.length === 0) {
        setAiStatus('FAILED');
        setAiAnalysis("No assets available for audit.");
        return;
    }

    const totalCount = tickers.length;
    const avgScore = (tickers.reduce((sum, t) => sum + t.qualityScore, 0) / totalCount).toFixed(1);
    const avgZ = (tickers.reduce((sum, t) => sum + t.zScore, 0) / totalCount).toFixed(2);
    
    // Dominant Themes
    const themeCounts: Record<string, number> = {};
    tickers.forEach(t => themeCounts[t.theme] = (themeCounts[t.theme] || 0) + 1);
    const topThemes = Object.entries(themeCounts).sort((a,b) => b[1]-a[1]).slice(0, 3).map(x => x[0]).join(", ");

    const prompt = `
    [SYSTEM: You are a Wall Street Chief Risk Officer]
    Analyze this filtered stock universe (${totalCount} assets):
    - Avg Quality Score: ${avgScore}/100
    - Avg Altman Z-Score: ${avgZ} (Safety Metric)
    - Dominant Themes: ${topThemes}
    
    OUTPUT FORMAT (Markdown Only, Korean):
    1. **포트폴리오 성격**: [공격형/방어형/밸런스형] 정의 및 한 줄 평.
    2. **리스크 진단**: Z-Score ${avgZ} 기반 안정성 평가.
    3. **테마 집중도**: ${topThemes} 위주 구성의 장단점.
    4. **최종 등급**: [AAA/AA/A/BBB] 중 하나 부여.
    
    Do not use emojis. Keep it professional and concise.
    `;
    
    try {
        let resultText = "";
        let usedEngine = "Gemini 3 Pro";

        // 1. Attempt Gemini First (Default)
        try {
            const geminiKey = process.env.API_KEY || API_CONFIGS.find(c => c.provider === ApiProvider.GEMINI)?.key || "";
            const ai = new GoogleGenAI({ apiKey: geminiKey });
            const response = await ai.models.generateContent({
                model: 'gemini-3-flash-preview',
                contents: prompt
            });
            trackUsage(ApiProvider.GEMINI, response.usageMetadata?.totalTokenCount || 0);
            resultText = response.text || "";
        } catch (geminiError: any) {
             // 2. Fallback to Perplexity (Sonar)
             console.warn("Gemini Audit Failed. Switching to Sonar.", geminiError);
             setAiAnalysis("⚠️ Gemini unresponsive. Rerouting to Perplexity Sonar...");

             const perplexityKey = API_CONFIGS.find(c => c.provider === ApiProvider.PERPLEXITY)?.key || "";
             const pRes = await fetch('https://api.perplexity.ai/chat/completions', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json', 
                    'Authorization': `Bearer ${perplexityKey}`,
                    'Accept': 'application/json' 
                },
                body: JSON.stringify({
                    model: 'sonar-pro', 
                    messages: [{ role: "user", content: prompt }]
                })
             });
             
             const pJson = await pRes.json();
             if (pJson.usage) trackUsage(ApiProvider.PERPLEXITY, pJson.usage.total_tokens || 0);

             if (!pRes.ok) throw new Error(pJson.error?.message || "Perplexity Fallback Failed");

             resultText = pJson.choices?.[0]?.message?.content || "";
             usedEngine = "Sonar Pro";
        }
        
        setAiAnalysis(removeCitations(resultText));
        setAiStatus('SUCCESS');
        addLog(`AI Risk Audit Complete via ${usedEngine}.`, "ok");
    } catch (e: any) {
        console.error("AI Audit Error", e);
        setAiAnalysis(`AI Audit Failed: ${e.message}`);
        setAiStatus('FAILED');
    }
  };

  const executeDeepQualityScan = async () => {
    if (!accessToken) return;
    if (loading) return;

    setLoading(true);
    setAnalysisPhase('INIT');
    setProcessedData([]);
    startTimeRef.current = Date.now();
    
    const activeEngine = "Institutional_Quant_Algorithm";
    
    try {
      // 1. Load Stage 1
      const q = encodeURIComponent(`name contains 'STAGE1_PURIFIED_UNIVERSE' and trashed = false`);
      const listRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&orderBy=createdTime desc&pageSize=1`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      }).then(r => r.json());

      if (!listRes.files?.length) throw new Error("Stage 1 Missing");
      
      const content = await fetch(`https://www.googleapis.com/drive/v3/files/${listRes.files[0].id}?alt=media`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      }).then(r => r.json());

      let targets = content.investable_universe || [];
      // Filter for Common Stock ONLY for reliable theme analysis
      targets = targets.filter((t: any) => t.type === 'Common Stock' || !t.type); 
      
      setProgress({ current: 0, total: targets.length, cacheHits: 0, filteredOut: 0 });
      
      const validResults: QualityTicker[] = [];
      let currentIndex = 0;
      let dropped = 0;

      while (currentIndex < targets.length) {
          // Visual Phase Switching
          const progressPercent = currentIndex / targets.length;
          if (progressPercent < 0.3) setAnalysisPhase('PROFITABILITY');
          else if (progressPercent < 0.6) setAnalysisPhase('STABILITY');
          else setAnalysisPhase('VALUATION');

          const batch = targets.slice(currentIndex, currentIndex + BATCH_SIZE);
          const promises = batch.map((t: any) => fetchTickerData(t));
          const results = await Promise.all(promises);
          
          results.forEach(r => {
              if (r) validResults.push(r);
              else dropped++;
          });

          // [REAL-TIME UPDATE] Update state after each batch for visual feedback
          const currentSorted = [...validResults].sort((a,b) => b.qualityScore - a.qualityScore);
          setProcessedData(currentSorted);

          currentIndex += BATCH_SIZE;
          setProgress(prev => ({ ...prev, current: currentIndex, filteredOut: dropped }));
          
          const delay = fmpDepleted ? DELAY_SAFE : DELAY_TURBO;
          await new Promise(r => setTimeout(r, delay));
      }

      setAnalysisPhase('COMPLETE');
      
      // Select Top Candidates based on Institutional Score
      const eliteSurvivors = validResults.sort((a, b) => b.qualityScore - a.qualityScore).slice(0, TARGET_SELECTION_COUNT);
      setProcessedData(eliteSurvivors);
      
      if (eliteSurvivors.length === 0) {
          addLog("Warning: No assets survived the quality filter. Check criteria.", "warn");
      }

      // Trigger AI Audit
      await analyzeUniverseHealth(eliteSurvivors);

      // Save to Drive
      const folderId = await ensureFolder(accessToken, GOOGLE_DRIVE_TARGET.stage2SubFolder);
      const fileName = `STAGE2_ELITE_UNIVERSE_${new Date().toISOString().split('T')[0]}.json`;
      const payload = {
        manifest: { version: "6.1.0", strategy: "Institutional_Quant_Model", timestamp: new Date().toISOString(), engine: activeEngine },
        elite_universe: eliteSurvivors
      };

      const meta = { name: fileName, parents: [folderId], mimeType: 'application/json' };
      const form = new FormData();
      form.append('metadata', new Blob([JSON.stringify(meta)], { type: 'application/json' }));
      form.append('file', new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));

      await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST', headers: { 'Authorization': `Bearer ${accessToken}` }, body: form
      });

      addLog(`Analysis Complete. ${eliteSurvivors.length} Elite Assets Identified.`, "ok");
      if (onComplete) onComplete();

    } catch (e: any) {
      addLog(`Error: ${e.message}`, "err");
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
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Theme Aggregation for Treemap
  const themeData = useMemo(() => {
      if (processedData.length === 0) return [];
      const map = new Map<string, number>();
      
      processedData.forEach(item => {
          const theme = item.theme || "Other";
          map.set(theme, (map.get(theme) || 0) + 1);
      });

      return Array.from(map)
        .sort((a, b) => b[1] - a[1])
        .map(([name, size], index) => ({ 
            name, 
            size,
            fill: THEME_COLORS[index % THEME_COLORS.length]
        }));
  }, [processedData]);

  // Drill Down Logic
  const themeDetails = useMemo(() => {
      if (!selectedTheme) return [];
      const stocks = processedData.filter(t => t.theme === selectedTheme);
      return stocks.sort((a, b) => b.qualityScore - a.qualityScore);
  }, [selectedTheme, processedData]);

  const CustomizedContent = (props: any) => {
    const { x, y, width, height, name, value, fill } = props;
    const isSmall = width < 60 || height < 40;
    
    return (
      <g onClick={() => !isSmall && setSelectedTheme(name)} style={{ cursor: isSmall ? 'default' : 'pointer' }}>
        <rect
          x={x} y={y} width={width} height={height}
          style={{ 
              fill: fill || '#3b82f6', 
              stroke: '#0f172a', 
              strokeWidth: 2, 
              fillOpacity: 0.9,
              transition: 'all 0.3s ease'
          }}
          rx={6} ry={6}
          className="hover:opacity-80"
        />
        {!isSmall && (
          <>
            <text x={x + width / 2} y={y + height / 2 - 6} textAnchor="middle" fill="#fff" fontSize={11} fontWeight="900" style={{ textTransform: 'uppercase', textShadow: '0px 2px 4px rgba(0,0,0,0.9)' }}>
              {name.length > 10 ? name.substring(0, 8) + '..' : name}
            </text>
            <text x={x + width / 2} y={y + height / 2 + 8} textAnchor="middle" fill="rgba(255,255,255,0.9)" fontSize={9} fontWeight="bold" style={{ textShadow: '0px 1px 2px rgba(0,0,0,0.8)' }}>
              {value} Assets
            </text>
          </>
        )}
      </g>
    );
  };

  // Phase Indicator Helper
  const getPhaseStyle = (phase: string) => {
      const phases = ['PROFITABILITY', 'STABILITY', 'VALUATION'];
      const currentIdx = phases.indexOf(analysisPhase);
      const targetIdx = phases.indexOf(phase);
      
      if (analysisPhase === 'COMPLETE') return 'text-emerald-400 font-bold';
      if (analysisPhase === 'INIT') return 'text-slate-600';
      if (currentIdx === targetIdx) return 'text-blue-400 animate-pulse font-black scale-105';
      if (currentIdx > targetIdx) return 'text-slate-400';
      return 'text-slate-700';
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
                <h2 className="text-xl md:text-3xl font-black text-white italic tracking-tighter uppercase leading-none">Deep_Quality v6.1</h2>
                <div className="flex flex-col mt-2 gap-1">
                   <div className="flex flex-wrap items-center gap-2">
                        <span className={`text-[8px] font-black px-2 py-0.5 rounded border uppercase tracking-widest ${loading ? 'border-blue-400 text-blue-400 animate-pulse' : 'border-blue-500/20 bg-blue-500/10 text-blue-400'}`}>
                            {loading ? `Analyzing: ${progress.current}/${progress.total}` : 'Institutional Quant Engine Ready'}
                        </span>
                        <span className={`text-[8px] font-black px-2 py-0.5 rounded border uppercase tracking-widest ${fmpDepleted ? 'border-amber-500/20 text-amber-400' : 'border-purple-500/20 text-purple-400'}`}>
                            {fmpDepleted ? 'Backup Data Mode' : 'Primary Data Mode'}
                        </span>
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
                onClick={executeDeepQualityScan} 
                disabled={loading} 
                className="w-full lg:w-auto px-8 md:px-12 py-4 md:py-5 bg-blue-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-[0_0_20px_rgba(37,99,235,0.3)] hover:shadow-[0_0_30px_rgba(37,99,235,0.5)] hover:scale-105 active:scale-95 transition-all"
            >
              {loading ? 'Executing Quant Model...' : 'Start Institutional Filter'}
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-8 mb-6 md:mb-10">
              <div className="flex flex-col gap-6">
                  <div className="bg-black/40 p-6 md:p-8 rounded-3xl border border-white/5">
                    <div className="flex justify-between items-center mb-6">
                      <p className="text-[9px] font-black text-blue-400 uppercase tracking-widest">Global Scan Progress</p>
                      <p className="text-xl font-mono font-black text-white italic">{loading ? `${(progress.current / (progress.total || 1) * 100).toFixed(1)}%` : 'Idle'}</p>
                    </div>
                    <div className="h-2 bg-slate-800 rounded-full overflow-hidden mb-4">
                      <div className={`h-full transition-all duration-300 bg-blue-500`} style={{ width: `${(progress.current / (progress.total || 1)) * 100}%` }}></div>
                    </div>
                    <div className="flex justify-between text-[8px] uppercase font-bold tracking-widest">
                        <span className={getPhaseStyle('PROFITABILITY')}>1. Profitability (F-Score)</span>
                        <span className={getPhaseStyle('STABILITY')}>2. Stability (Z-Score)</span>
                        <span className={getPhaseStyle('VALUATION')}>3. Sector Neutral Value</span>
                    </div>
                  </div>

                  <div className={`bg-blue-900/10 p-6 md:p-8 rounded-3xl border relative overflow-hidden group transition-colors flex-1 ${aiStatus === 'ANALYZING' ? 'border-blue-500/50' : aiStatus === 'SUCCESS' ? 'border-emerald-500/50' : 'border-blue-500/10'}`}>
                     <div className="flex justify-between items-center mb-4">
                        <p className={`text-[9px] font-black uppercase tracking-widest ${aiStatus === 'SUCCESS' ? 'text-emerald-400' : 'text-blue-400'}`}>Portfolio Risk Auditor (AI)</p>
                     </div>
                     <div className="prose-report text-xs text-slate-300 leading-relaxed font-medium">
                        {aiAnalysis ? <ReactMarkdown remarkPlugins={[remarkGfm]}>{aiAnalysis}</ReactMarkdown> : <span className="italic opacity-50">Awaiting portfolio aggregation...</span>}
                     </div>
                     {aiStatus === 'ANALYZING' && <div className="absolute bottom-0 left-0 h-1 bg-blue-500 animate-pulse w-full"></div>}
                  </div>
              </div>

              <div className="bg-black/40 p-4 rounded-3xl border border-white/5 min-h-[300px] flex flex-col relative overflow-hidden">
                 <div className="absolute top-6 left-6 z-10 w-full pr-12">
                    <p className="text-[9px] font-black text-slate-300 uppercase tracking-widest mb-1 shadow-black drop-shadow-md">Market Theme Dominance</p>
                    <p className="text-[8px] text-slate-500 uppercase font-mono">Based on Elite 500 Selection</p>
                 </div>
                 <div className="flex-1 w-full h-full mt-14"> {/* Increased margin-top for title visibility */}
                     {processedData.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                            <Treemap
                                data={themeData}
                                dataKey="size"
                                aspectRatio={4 / 3}
                                stroke="#0f172a"
                                content={<CustomizedContent />}
                            >
                                <RechartsTooltip 
                                    content={({ active, payload }) => {
                                        if (active && payload && payload.length) {
                                            return (
                                                <div className="bg-slate-900 border border-slate-700 p-2 rounded shadow-lg">
                                                    <p className="text-xs font-bold text-white">{payload[0].payload.name}</p>
                                                    <p className="text-[10px] text-blue-400">Assets: {payload[0].value}</p>
                                                    <p className="text-[8px] text-slate-500 mt-1">Click to inspect sector</p>
                                                </div>
                                            );
                                        }
                                        return null;
                                    }}
                                />
                            </Treemap>
                        </ResponsiveContainer>
                     ) : (
                         <div className="flex flex-col items-center justify-center h-full opacity-20 text-center">
                             <div className="w-10 h-10 border-2 border-slate-600 rounded-full flex items-center justify-center mb-3">
                                <svg className="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6a2 2 0 012-2h2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>
                             </div>
                             <p className="text-[9px] font-black uppercase tracking-[0.2em]">Ready to Visualize Themes</p>
                         </div>
                     )}
                 </div>
                 
                 {/* Sector Detail Overlay */}
                 {selectedTheme && (
                     <div className="absolute inset-0 z-20 bg-slate-900/95 backdrop-blur-md flex flex-col p-6 animate-in fade-in zoom-in-95 duration-200">
                         <div className="flex justify-between items-center mb-4 border-b border-white/10 pb-4">
                             <div>
                                 <h4 className="text-lg font-black text-white italic tracking-tighter uppercase">{selectedTheme}</h4>
                                 <p className="text-[10px] text-slate-400">Elite Assets Ranked by Quality</p>
                             </div>
                             <button onClick={() => setSelectedTheme(null)} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                                 <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                             </button>
                         </div>
                         <div className="flex-1 overflow-y-auto no-scrollbar space-y-2">
                             {themeDetails.length > 0 ? themeDetails.map((item, idx) => {
                                 const globalRank = processedData.findIndex(p => p.symbol === item.symbol) + 1;
                                 return (
                                     <div 
                                        key={item.symbol} 
                                        onClick={() => {
                                            onStockSelected?.(item);
                                        }}
                                        className="flex justify-between items-center p-3 bg-white/5 rounded-xl border border-white/5 hover:border-blue-500/50 transition-colors cursor-pointer active:scale-95"
                                     >
                                         <div className="flex items-center gap-3">
                                             <div className="flex flex-col items-center justify-center w-8 h-8 bg-black/40 rounded-lg border border-white/5">
                                                 <span className="text-[8px] text-slate-500 uppercase">Rank</span>
                                                 <span className="text-[10px] font-black text-blue-400">#{globalRank}</span>
                                             </div>
                                             <div>
                                                 <p className="text-xs font-black text-white">{item.symbol}</p>
                                                 <p className="text-[9px] text-slate-400 truncate w-24">{item.name}</p>
                                             </div>
                                         </div>
                                         <div className="text-right">
                                             <div className="flex items-center justify-end gap-2">
                                                 <span className="text-[10px] font-mono text-emerald-400 font-bold">${item.price?.toFixed(2)}</span>
                                             </div>
                                             <div className="flex items-center gap-2 mt-1">
                                                 <span className="text-[8px] bg-slate-800 px-1.5 py-0.5 rounded text-slate-300">Z: {item.zScore}</span>
                                                 <span className="text-[8px] bg-blue-900/40 px-1.5 py-0.5 rounded text-blue-300 border border-blue-500/20">Score: {item.qualityScore}</span>
                                             </div>
                                         </div>
                                     </div>
                                 );
                             }) : <div className="text-center text-xs text-slate-500 mt-10">No data available</div>}
                         </div>
                     </div>
                 )}
              </div>
          </div>
        </div>
      </div>

      <div className="xl:col-span-1">
        <div className="glass-panel h-[400px] lg:h-[600px] rounded-[32px] md:rounded-[40px] bg-slate-950 border-l-4 border-l-blue-600 flex flex-col p-6 shadow-2xl overflow-hidden">
          <div className="flex items-center justify-between mb-8 px-2">
            <h3 className="font-black text-white text-[10px] uppercase tracking-[0.4em] italic">Quant_Logs</h3>
            <button onClick={clearStageCache} className="text-[8px] text-slate-600 hover:text-white uppercase transition-colors">Clear Cache</button>
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
