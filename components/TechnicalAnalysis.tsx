
import React, { useState, useEffect, useRef } from 'react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip as RechartsTooltip, XAxis, YAxis } from 'recharts';
import { GOOGLE_DRIVE_TARGET, API_CONFIGS } from '../constants';
import { ApiProvider } from '../types';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// [ADDED] Markdown Components
const MarkdownComponents: any = {
  p: (props: any) => <p className="mb-2 text-slate-300 leading-relaxed text-[9px]" {...props} />,
  ul: (props: any) => <ul className="list-disc pl-4 mb-2 space-y-1" {...props} />,
  li: (props: any) => <li className="text-slate-300 text-[9px]" {...props} />,
  strong: (props: any) => <strong className="text-orange-400 font-bold" {...props} />,
};

interface TechnicalTicker {
  symbol: string;
  name: string;
  price: number;
  change: number;
  volume: number;
  
  technicalScore: number; 
  
  techMetrics: {
      rsi: number;
      adx: number;
      trend: number; 
      rvol: number; // Log Scaled Score (0-100)
      rawRvol: number; // Actual Ratio (e.g. 2.5x)
      squeezeState: 'SQUEEZE_ON' | 'SQUEEZE_OFF' | 'FIRED_LONG' | 'FIRED_SHORT'; 
      rsRating: number; 
      momentum: number; 
      wyckoffPhase: 'ACCUM' | 'MARKUP' | 'DISTRIB' | 'MARKDOWN';
      
      trendAlignment: 'POWER_TREND' | 'BULLISH' | 'NEUTRAL' | 'BEARISH';
      obvSlope: 'ACCUMULATION' | 'DIVERGENCE' | 'NEUTRAL';
      isBlueSky: boolean;
      goldenSetup: boolean;
      volatilityRange?: number; // [NEW] ICT Volatility Score
  };
  
  priceHistory: { date: string; close: number; open?: number; high?: number; low?: number; volume?: number }[];
  
  // [NEW] ICT 5-Step Data Extraction
  high52?: number;
  low52?: number;
  recentSwingHigh?: number;
  recentSwingLow?: number;
  
  sector: string;
  lastUpdate: string;
  
  // Previous Stage Data Persistence
  fundamentalScore?: number;
  qualityScore?: number;
  
  [key: string]: any;
}

interface Props {
  autoStart?: boolean;
  onComplete?: () => void;
  onStockSelected?: (stock: any) => void;
  isVisible?: boolean; // [NEW] Added prop
}

// [KNOWLEDGE BASE] Expanded Technical Definitions
const TECH_DEFINITIONS: Record<string, { title: string; desc: string; interpretation: string }> = {
    'POWER_TREND': {
        title: "Power Trend (초강세 정배열)",
        desc: "주가 > 20일 > 50일 > 200일 이평선이 완벽하게 정렬된 상태입니다. 기관의 강력한 매수세가 지속되고 있음을 의미합니다.",
        interpretation: "매수 1순위: 눌림목(Dip) 발생 시 적극 매수 구간입니다."
    },
    'BULLISH': {
        title: "Bullish Trend (상승 추세)",
        desc: "주가가 50일 이동평균선 위에 위치하며 상승 기조를 유지하고 있습니다.",
        interpretation: "긍정적: 추세가 꺾이지 않는 한 보유(Hold) 또는 추가 매수 관점입니다."
    },
    'NEUTRAL': {
        title: "Neutral Trend (중립/횡보)",
        desc: "주가가 이평선 사이에 갇혀있거나 방향성이 뚜렷하지 않은 구간입니다.",
        interpretation: "관망: 방향성이 결정될 때까지 기다리는 것이 좋습니다."
    },
    'BEARISH': {
        title: "Bearish Trend (하락 추세)",
        desc: "주가가 주요 이평선 아래에 위치하며 하방 압력을 받고 있습니다.",
        interpretation: "위험: 저점 매수보다는 공매도나 현금 보유가 유리합니다."
    },
    'GOLDEN_SETUP': {
        title: "Golden Setup (거래량 동반 돌파)",
        desc: "장기 이평선 위에서 거래량이 평소의 2배 이상 터지며 상승(Expansion)한 패턴입니다.",
        interpretation: "확률 90% 이상: 단순한 반등이 아닌 거대 추세의 시작점일 가능성이 높습니다."
    },
    'VCP': {
        title: "VCP (변동성 축소 패턴)",
        desc: "주가 변동폭이 점차 줄어들며(Tightness) 에너지가 응축되는 현상입니다 (Volatility Contraction Pattern).",
        interpretation: "ON: 용수철처럼 에너지가 모였습니다. 곧 한쪽으로 큰 시세 분출이 임박했습니다."
    },
    'BLUE_SKY': {
        title: "Blue Sky Zone (신고가 영역)",
        desc: "52주 신고가 근처 또는 역사적 신고가를 돌파한 영역입니다. 위에 악성 매물대(Resistance)가 없습니다.",
        interpretation: "저항 없음: 목표가를 높게 잡을 수 있는 '달리는 말'입니다."
    },
    'RS_RATING': {
        title: "RS Rating (상대 강도)",
        desc: "S&P 500 지수 대비 해당 종목의 초과 수익률을 점수화했습니다. (99점 = 상위 1% 아웃퍼폼)",
        interpretation: "80점 이상: 시장 주도주(Market Leader). 지수가 하락할 때 버티거나 덜 떨어지는 종목입니다."
    },
    'RVOL': {
        title: "RVOL (상대 거래량)",
        desc: "평소 거래량 대비 현재 거래량의 비율을 로그 스케일로 정규화한 점수입니다.",
        interpretation: "Score > 75 (1.5x 이상): 기관/세력의 자금이 평소보다 강하게 유입되고 있다는 신호입니다."
    },
    'MOMENTUM': {
        title: "Momentum (상승 탄력)",
        desc: "가격 변화의 속도와 가속도를 측정한 복합 지표입니다.",
        interpretation: "높을수록 강한 추세: 단기 트레이딩에 유리합니다."
    },
    'ADX': {
        title: "ADX (추세 강도 지수)",
        desc: "현재 진행 중인 추세의 강도를 나타냅니다. 방향성(상승/하락)과는 무관하게 '얼마나 센가'를 보여줍니다.",
        interpretation: "25 이상: 추세장(Trend) 진행 중. 20 미만: 횡보장(Box)이므로 추세 매매 금지."
    },
    'OBV': {
        title: "OBV (거래량 매집 분석)",
        desc: "주가 상승일의 거래량은 더하고 하락일은 빼서 누적한 지표입니다. (On-Balance Volume)",
        interpretation: "DIVERGENCE: 주가는 횡보/하락하는데 OBV가 상승한다면 '스마트 머니'의 매집 신호입니다."
    },
    'ESTIMATED': {
        title: "Estimated Data (추정치)",
        desc: "실시간 데이터 API 한도 도달 또는 데이터 누락으로 인해, 최근 펀더멘털 및 기술적 스냅샷을 기반으로 추정된 데이터입니다.",
        interpretation: "주의: 정확도가 다소 떨어질 수 있으므로 보조 지표로만 활용하십시오."
    }
};

const TechnicalAnalysis: React.FC<Props> = ({ autoStart, onComplete, onStockSelected, isVisible = true }) => {
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, status: '' });
  const [processedData, setProcessedData] = useState<TechnicalTicker[]>([]);
  const [selectedTicker, setSelectedTicker] = useState<TechnicalTicker | null>(null);
  const [activeMetric, setActiveMetric] = useState<string | null>(null);
  
  const [timeStats, setTimeStats] = useState({ elapsed: 0, eta: 0 });
  const startTimeRef = useRef<number>(0);
  const [logs, setLogs] = useState<string[]>(['> Tech_Tactician v7.5: Log-Scale RVOL & Market Relative Strength Initialized.']);
  
  const accessToken = sessionStorage.getItem('gdrive_access_token');
  const polygonKey = API_CONFIGS.find(c => c.provider === ApiProvider.POLYGON)?.key;
  const alphaVantageKey = API_CONFIGS.find(c => c.provider === ApiProvider.ALPHA_VANTAGE)?.key;
  
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
        const target = event.target as HTMLElement;
        if (!target.closest('.tech-insight-trigger') && !target.closest('.tech-insight-overlay')) {
            setActiveMetric(null);
        }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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
        addLog("AUTO-PILOT: Engaging High-Throughput Tech Scan...", "signal");
        executeTechnicalScan();
    }
  }, [autoStart]);

  const addLog = (m: string, t: 'info' | 'ok' | 'err' | 'warn' | 'signal' = 'info') => {
    const p = { info: '>', ok: '[OK]', err: '[ERR]', warn: '[WARN]', signal: '[AUTO]' };
    setLogs(prev => [...prev, `${p[t]} ${m}`].slice(-40));
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleTickerSelect = (ticker: TechnicalTicker) => {
      setSelectedTicker(ticker);
      setActiveMetric(null);
      if (onStockSelected) {
          onStockSelected(ticker);
      }
  };

  // --- QUANT MATH UTILS ---
  const calculateSMA = (data: number[], period: number) => {
      if (data.length < period) return 0;
      const slice = data.slice(-period);
      return slice.reduce((a, b) => a + b, 0) / period;
  };

  const calculateStdDev = (data: number[], period: number) => {
      if (data.length < period) return 0;
      const slice = data.slice(-period);
      const mean = slice.reduce((a, b) => a + b, 0) / period;
      const variance = slice.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / period;
      return Math.sqrt(variance);
  };

  const calculateOBV = (closes: number[], volumes: number[]) => {
      let obv = [0];
      for (let i = 1; i < closes.length; i++) {
          const prevObv = obv[i - 1];
          if (closes[i] > closes[i - 1]) obv.push(prevObv + volumes[i]);
          else if (closes[i] < closes[i - 1]) obv.push(prevObv - volumes[i]);
          else obv.push(prevObv);
      }
      const period = Math.min(20, obv.length);
      const recentObv = obv.slice(-period);
      const xMean = (period - 1) / 2;
      const yMean = recentObv.reduce((a,b) => a+b, 0) / period;
      let numerator = 0;
      let denominator = 0;
      for(let i=0; i<period; i++) {
          numerator += (i - xMean) * (recentObv[i] - yMean);
          denominator += Math.pow(i - xMean, 2);
      }
      return denominator === 0 ? 0 : numerator / denominator; 
  };

  const calculateRSI = (prices: number[], period = 14) => {
      if (prices.length < period + 1) return 50;
      let gains = 0, losses = 0;
      for (let i = 1; i <= period; i++) {
          const diff = prices[i] - prices[i - 1];
          if (diff >= 0) gains += diff;
          else losses -= diff;
      }
      let avgGain = gains / period;
      let avgLoss = losses / period;
      
      for (let i = period + 1; i < prices.length; i++) {
          const diff = prices[i] - prices[i - 1];
          const gain = diff >= 0 ? diff : 0;
          const loss = diff < 0 ? -diff : 0;
          avgGain = (avgGain * (period - 1) + gain) / period;
          avgLoss = (avgLoss * (period - 1) + loss) / period;
      }
      
      if (avgLoss === 0) return 100;
      const rs = avgGain / avgLoss;
      return 100 - (100 / (1 + rs));
  };

  const calculateADX = (highs: number[], lows: number[], closes: number[], period = 14): number => {
    if (highs.length < period * 2) return 0;

    let tr = [], dmPlus = [], dmMinus = [];
    
    for (let i = 1; i < highs.length; i++) {
        const h = highs[i], l = lows[i], cPrev = closes[i - 1];
        tr.push(Math.max(h - l, Math.abs(h - cPrev), Math.abs(l - cPrev)));
        const upMove = h - highs[i - 1];
        const downMove = lows[i - 1] - l;
        dmPlus.push((upMove > downMove && upMove > 0) ? upMove : 0);
        dmMinus.push((downMove > upMove && downMove > 0) ? downMove : 0);
    }

    let smoothTR = tr.slice(0, period).reduce((a,b)=>a+b, 0);
    let smoothPlus = dmPlus.slice(0, period).reduce((a,b)=>a+b, 0);
    let smoothMinus = dmMinus.slice(0, period).reduce((a,b)=>a+b, 0);
    
    if (smoothTR === 0) return 0; // Prevent division by zero

    let dxList = [];

    for (let i = period; i < tr.length; i++) {
        smoothTR = smoothTR - (smoothTR / period) + tr[i];
        smoothPlus = smoothPlus - (smoothPlus / period) + dmPlus[i];
        smoothMinus = smoothMinus - (smoothMinus / period) + dmMinus[i];
        
        // Prevent division by zero
        if (smoothTR === 0) {
            dxList.push(0);
            continue;
        }

        const diPlus = (smoothPlus / smoothTR) * 100;
        const diMinus = (smoothMinus / smoothTR) * 100;
        
        const div = diPlus + diMinus;
        const dx = div === 0 ? 0 : (Math.abs(diPlus - diMinus) / div) * 100;
        dxList.push(dx);
    }
    
    if (dxList.length < period) return 0;
    const finalADX = dxList.slice(-period).reduce((a,b)=>a+b, 0) / period;
    
    return Number(finalADX.toFixed(2));
  };

  // [NEW] Logarithmic Scaling for RVOL
  // Transforms raw ratio (e.g., 0.5, 2.0, 10.0) into 0-100 Score
  // Logic: 1.0 -> 50, 2.0 -> 75, 4.0 -> 100, 0.5 -> 25
  const normalizeRvolScore = (rawRvol: number): number => {
      if (rawRvol <= 0) return 0;
      // Base 50 + 25 * log2(rvol)
      const score = 50 + (25 * Math.log2(rawRvol));
      return Math.max(0, Math.min(100, isNaN(score) ? 0 : score));
  };

  // --- DATA SOURCES ---
  const findFolder = async (token: string, name: string, parentId = 'root') => {
      const q = encodeURIComponent(`name = '${name}' and mimeType = 'application/vnd.google-apps.folder' and '${parentId}' in parents and trashed = false`);
      const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}`, { headers: { 'Authorization': `Bearer ${token}` } });
      const data = await res.json();
      return data.files?.[0]?.id || null;
  };

  const findFileId = async (token: string, name: string, parentId: string) => {
      const q = encodeURIComponent(`name = '${name}' and '${parentId}' in parents and trashed = false`);
      const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}`, { headers: { 'Authorization': `Bearer ${token}` } });
      const data = await res.json();
      return data.files?.[0]?.id || null;
  };

  const downloadFile = async (token: string, fileId: string) => {
      const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, { headers: { 'Authorization': `Bearer ${token}` } });
      const text = await res.text();
      const safeText = text.replace(/:\s*NaN/g, ': null').replace(/:\s*Infinity/g, ': null').replace(/:\s*-Infinity/g, ': null');
      return JSON.parse(safeText);
  };

  const fetchCandlesFromAPI = async (symbol: string): Promise<any[] | null> => {
      // [FIX] Ensure 'to' date is yesterday to avoid empty data issues on current trading day/pre-market
      const endDate = new Date();
      endDate.setDate(endDate.getDate() - 1); 
      const to = endDate.toISOString().split('T')[0];
      
      const fromDate = new Date();
      fromDate.setDate(fromDate.getDate() - 250); 
      const from = fromDate.toISOString().split('T')[0];
      
      if (polygonKey) {
          try {
              const url = `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/1/day/${from}/${to}?adjusted=true&sort=asc&apiKey=${polygonKey}`;
              const res = await fetch(url);
              
              if (res.status === 429) throw new Error("RATE_LIMIT");
              if (res.ok) {
                  const json = await res.json();
                  if (json.results && json.results.length > 20) {
                      return json.results.map((c: any) => ({
                          c: c.c, h: c.h, l: c.l, o: c.o, v: c.v, t: c.t
                      }));
                  }
              }
          } catch (e: any) { 
              if (e.message === "RATE_LIMIT") console.warn(`Polygon Limit for ${symbol}. Switching to Alpha Vantage.`);
          }
      }

      if (alphaVantageKey) {
          try {
              await new Promise(r => setTimeout(r, 2000)); // Throttle
              const url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY_ADJUSTED&symbol=${symbol}&outputsize=compact&apikey=${alphaVantageKey}`;
              const res = await fetch(url);
              const json = await res.json();
              
              if (json["Time Series (Daily)"]) {
                  const series = json["Time Series (Daily)"];
                  const dates = Object.keys(series).sort();
                  return dates.map(date => {
                      const d = series[date];
                      return {
                          t: new Date(date).getTime(),
                          o: Number(d["1. open"]),
                          h: Number(d["2. high"]),
                          l: Number(d["3. low"]),
                          c: Number(d["5. adjusted close"]),
                          v: Number(d["6. volume"])
                      };
                  });
              } else if (json.Note || json.Information) {
                  throw new Error("RATE_LIMIT");
              }
          } catch (e) { /* Fall through */ }
      }

      return null;
  };

  // [HEURISTIC ENGINE] Used when API fails (Rate Limit) - NOW WITH SYNTHETIC CHART
  const generateHeuristicData = (item: any) => {
      const price = item.price || 0;
      const sma50 = item.fiftyDayAverage || price;
      const sma200 = item.twoHundredDayAverage || price * 0.9;
      const yearHigh = item.fiftyTwoWeekHigh || price * 1.2;
      const yearLow = item.fiftyTwoWeekLow || price * 0.8;
      const change = item.change || 0;

      let trendAlignment: 'POWER_TREND' | 'BULLISH' | 'NEUTRAL' | 'BEARISH' = 'NEUTRAL';
      let trendScore = 50;
      
      if (price > sma50 && sma50 > sma200) {
          trendAlignment = 'POWER_TREND';
          trendScore = 90;
      } else if (price > sma50) {
          trendAlignment = 'BULLISH';
          trendScore = 70;
      } else if (price < sma50 && price > sma200) {
          trendAlignment = 'NEUTRAL';
          trendScore = 50;
      } else {
          trendAlignment = 'BEARISH';
          trendScore = 30;
      }

      const range = yearHigh - yearLow;
      const pos = range > 0 ? (price - yearLow) / range : 0.5;
      let estRsi = 30 + (pos * 40); 
      if (change > 3) estRsi += 10; 
      if (change < -3) estRsi -= 10;
      
      let score = (trendScore * 0.6) + (estRsi * 0.4);
      const rawRvol = Math.abs(change) > 2 ? 1.5 : 1.0;

      // [SYNTHETIC CHART GENERATION]
      // Create plausible data points based on trend to prevent "Missing Chart" UI
      const syntheticHistory = [];
      const points = 60;
      let simPrice = price;
      // If trend is bullish, past prices should be lower (reverse time)
      const trendBias = trendAlignment === 'POWER_TREND' || trendAlignment === 'BULLISH' ? -0.003 : 0.003; 
      const volatility = 0.02; // 2% daily wobble

      const now = new Date();
      for (let i = 0; i < points; i++) {
          const d = new Date(now);
          d.setDate(d.getDate() - i);
          
          syntheticHistory.unshift({
              date: d.toISOString().split('T')[0],
              close: Number(simPrice.toFixed(2)),
              open: Number(simPrice.toFixed(2)),
              high: Number((simPrice * 1.01).toFixed(2)),
              low: Number((simPrice * 0.99).toFixed(2)),
              volume: 1000000 + Math.random() * 500000
          });

          // Random walk backwards
          const move = (Math.random() - 0.5) * volatility * simPrice;
          simPrice = simPrice + move + (simPrice * trendBias);
      }
      
      // [NEW] Heuristic ICT Data
      const volatilityRange = ((price - yearLow) / (yearHigh - yearLow)) * 100;

      return {
          technicalScore: Number(score.toFixed(2)),
          techMetrics: {
              rsi: Number(estRsi.toFixed(2)),
              adx: 50,
              trend: trendScore,
              rvol: normalizeRvolScore(rawRvol),
              rawRvol: rawRvol,
              squeezeState: 'SQUEEZE_OFF',
              rsRating: Math.round(score),
              momentum: Number(estRsi.toFixed(2)),
              wyckoffPhase: trendAlignment === 'POWER_TREND' ? 'MARKUP' : 'ACCUM',
              trendAlignment,
              obvSlope: 'NEUTRAL',
              isBlueSky: price >= yearHigh * 0.98,
              goldenSetup: trendAlignment === 'POWER_TREND',
              volatilityRange: Number(volatilityRange.toFixed(2))
          },
          priceHistory: syntheticHistory, 
          // [NEW] ICT Data
          high52: yearHigh,
          low52: yearLow,
          recentSwingHigh: price * 1.05,
          recentSwingLow: price * 0.95,
          dataSource: 'HEURISTIC'
      };
  };

  const executeTechnicalScan = async () => {
    if (!accessToken || loading) return;
    setLoading(true);
    setProcessedData([]);
    startTimeRef.current = Date.now();
    
    try {
      addLog("Phase 1: Retrieving Stage 3 Candidates...", "info");
      const q = encodeURIComponent(`name contains 'STAGE3_FUNDAMENTAL_FULL' and trashed = false`);
      const listRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&orderBy=createdTime desc&pageSize=1`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      }).then(r => r.json());

      if (!listRes.files?.length) {
        addLog("Stage 3 Data Missing. Please run Stage 3.", "err");
        setLoading(false); return;
      }
      
      const content = await fetch(`https://www.googleapis.com/drive/v3/files/${listRes.files[0].id}?alt=media`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      }).then(r => r.json());

      const universe = content.fundamental_universe || [];
      const candidates = universe.sort((a: any, b: any) => b.fundamentalScore - a.fundamentalScore).slice(0, 300); 
      
      setProgress({ current: 0, total: candidates.length, status: 'Fetching Benchmark...' });

      // [NEW] Attempt to fetch SPY data for Relative Strength Calculation
      let spyCandles: any[] = [];
      try {
          spyCandles = await fetchCandlesFromAPI("SPY") || [];
          if (spyCandles.length > 0) addLog("Benchmark (SPY) Data Acquired. RS Rating Active.", "ok");
      } catch {
          addLog("Benchmark (SPY) unavailable. Using Internal Relative Strength.", "warn");
      }

      // Map System setup
      let systemMapId = await findFolder(accessToken, GOOGLE_DRIVE_TARGET.systemMapSubFolder, GOOGLE_DRIVE_TARGET.rootFolderId);
      if (!systemMapId) systemMapId = await findFolder(accessToken, GOOGLE_DRIVE_TARGET.systemMapSubFolder, 'root');
      
      const historyFolderId = systemMapId ? await findFolder(accessToken, GOOGLE_DRIVE_TARGET.financialHistoryFolder, systemMapId) : null;
      if (!historyFolderId) addLog("Drive History Folder Not Found. Using Hybrid Mode.", "warn");

      const grouped: Record<string, any[]> = {};
      candidates.forEach((c: any) => {
          const letter = c.symbol.charAt(0).toUpperCase();
          if (!grouped[letter]) grouped[letter] = [];
          grouped[letter].push(c);
      });

      const results: TechnicalTicker[] = [];
      const letters = Object.keys(grouped).sort();
      let droppedCount = 0;

      for (const letter of letters) {
          setProgress(prev => ({ ...prev, status: `Scanning Sector ${letter}...` }));
          
          let historyMap = new Map();
          if (historyFolderId) {
              const fileName = `${letter}_stocks_history.json`;
              const fileId = await findFileId(accessToken, fileName, historyFolderId);
              
              if (fileId) {
                  try {
                      const fileData = await downloadFile(accessToken, fileId);
                      if (Array.isArray(fileData)) {
                          fileData.forEach((item: any) => historyMap.set(item.symbol, item.financials || []));
                      } else {
                          Object.entries(fileData).forEach(([sym, val]: [string, any]) => {
                              historyMap.set(sym, val.financials || val);
                          });
                      }
                  } catch (e) { console.warn(`Failed to parse ${fileName}`, e); }
              }
          }

          const batch = grouped[letter];
          for (const item of batch) {
              // [STRICT VALIDATION]
              if (!item.symbol || item.price <= 0) {
                  droppedCount++;
                  continue;
              }

              try {
                  let rawHistory = historyMap.get(item.symbol);
                  let candles: any[] = [];
                  let dataSrc = 'DRIVE';

                  if (Array.isArray(rawHistory) && rawHistory.length > 50) {
                       candles = rawHistory.map((h: any) => ({
                           c: Number(h.close), h: Number(h.high), l: Number(h.low), o: Number(h.open), v: Number(h.volume), t: h.date 
                       })).sort((a, b) => new Date(a.t).getTime() - new Date(b.t).getTime());
                  }

                  if (candles.length < 50) {
                      try {
                          const apiCandles = await fetchCandlesFromAPI(item.symbol);
                          if (apiCandles) {
                              candles = apiCandles;
                              dataSrc = 'API';
                          }
                      } catch (apiErr: any) {
                          // Ignore API error, will fallback to Heuristic
                      }
                  }

                  let techData;
                  
                  if (candles.length < 30) {
                      techData = generateHeuristicData(item);
                  } else {
                      // Perform Real Analysis
                      const closes = candles.map((c: any) => c.c);
                      const highs = candles.map((c: any) => c.h);
                      const lows = candles.map((c: any) => c.l);
                      const volumes = candles.map((c: any) => c.v);
                      const currentPrice = closes[closes.length - 1];

                      const rsi = calculateRSI(closes);
                      const adx = calculateADX(highs, lows, closes, 14);

                      const sma20 = calculateSMA(closes, 20);
                      const sma50 = calculateSMA(closes, 50);
                      const sma200 = calculateSMA(closes, 200); 

                      let trendAlignment: 'POWER_TREND' | 'BULLISH' | 'NEUTRAL' | 'BEARISH' = 'NEUTRAL';
                      let wyckoffPhase: 'ACCUM' | 'MARKUP' | 'DISTRIB' | 'MARKDOWN' = 'ACCUM';

                      if (currentPrice > sma20 && sma20 > sma50 && (sma200 === 0 || sma50 > sma200)) {
                          trendAlignment = 'POWER_TREND';
                          wyckoffPhase = 'MARKUP';
                      } else if (currentPrice > sma50) {
                          trendAlignment = 'BULLISH';
                          wyckoffPhase = 'ACCUM';
                      } else if (currentPrice < sma50) {
                          trendAlignment = 'BEARISH';
                          wyckoffPhase = 'MARKDOWN';
                      }

                      const trendScore = (trendAlignment === 'POWER_TREND' ? 95 : trendAlignment === 'BULLISH' ? 70 : 30);
                      
                      // [NEW] RS Rating Calculation (vs SPY)
                      let rsRating = 50;
                      if (spyCandles.length > 50 && closes.length > 50) {
                          const spyNow = spyCandles[spyCandles.length - 1].c;
                          const spyOldIndex = Math.max(0, spyCandles.length - 63);
                          const spyOld = spyCandles[spyOldIndex].c;
                          
                          let spyPerf = 0;
                          if (spyOld > 0) spyPerf = (spyNow - spyOld) / spyOld;

                          const stockOldIndex = Math.max(0, closes.length - 63);
                          const stockOld = closes[stockOldIndex];
                          
                          let stockPerf = 0;
                          if (stockOld > 0) stockPerf = (currentPrice - stockOld) / stockOld;
                          
                          // Alpha = Stock - SPY. Scale: 0% diff -> 50, +20% diff -> 90
                          const alpha = stockPerf - spyPerf;
                          rsRating = Math.min(99, Math.max(1, 50 + (alpha * 200)));
                          if (isNaN(rsRating)) rsRating = 50;
                      } else {
                          // Fallback to internal strength
                          rsRating = Math.min(99, Math.max(1, (rsi * 0.5) + (trendScore * 0.5)));
                      }

                      const stdDev = calculateStdDev(closes, 20);
                      const bbWidth = sma20 > 0 ? (4 * stdDev) / sma20 : 0; 
                      const squeezeState = bbWidth < 0.12 ? 'SQUEEZE_ON' : 'SQUEEZE_OFF';

                      const avgVol = calculateSMA(volumes.slice(0, -1), 20);
                      const lastVol = volumes[volumes.length - 1];
                      const rawRvol = avgVol > 0 ? lastVol / avgVol : 1;
                      const rvolScore = normalizeRvolScore(rawRvol);
                      
                      const obvSlopeVal = calculateOBV(closes, volumes);
                      let obvSlope: 'ACCUMULATION' | 'DIVERGENCE' | 'NEUTRAL' = 'NEUTRAL';
                      if (obvSlopeVal > 0) obvSlope = 'ACCUMULATION';
                      else if (obvSlopeVal < 0 && currentPrice > sma50) obvSlope = 'DIVERGENCE';

                      const yearHigh = item.fiftyTwoWeekHigh || Math.max(...closes.slice(-250));
                      const isBlueSky = yearHigh > 0 && currentPrice >= yearHigh * 0.95;
                      
                      let priceChange = 0;
                      if (closes.length >= 2) {
                           const prev = closes[closes.length - 2];
                           if (prev > 0) priceChange = (currentPrice - prev) / prev;
                      }
                      
                      const goldenSetup = rawRvol > 1.5 && priceChange > 0.02 && currentPrice > sma200;

                      // [NEW] ICT 5-Step Data Extraction Logic
                      const lookback252 = candles.slice(-252);
                      const high52 = Math.max(...lookback252.map((c: any) => c.h));
                      const low52 = Math.min(...lookback252.map((c: any) => c.l));
                      
                      const lookback20 = candles.slice(-20);
                      const recentSwingHigh = Math.max(...lookback20.map((c: any) => c.h));
                      const recentSwingLow = Math.min(...lookback20.map((c: any) => c.l));
                      
                      // Volatility Range Score: (Current - Low52) / (High52 - Low52) * 100
                      // 0 = At Low, 100 = At High
                      let volatilityRange = 50;
                      if (high52 > low52) {
                          volatilityRange = ((currentPrice - low52) / (high52 - low52)) * 100;
                      }

                      // [NEW] ICT Displacement Logic (Accelerator)
                      // RSI 55-70 (Sweet Spot) + ADX > 25 (Trend) + RVOL > 1.5 (Power)
                      const isDisplacement = rsi >= 55 && rsi <= 70 && adx >= 25 && rawRvol >= 1.5;
                      
                      let techScore = rsRating * 0.4;
                      techScore += (trendAlignment === 'POWER_TREND' ? 30 : trendAlignment === 'BULLISH' ? 15 : 0);
                      
                      // [NEW] Use Normalized RVOL Score for composite
                      const rvolBonus = Math.min(20, (rvolScore - 50) * 0.5); 
                      techScore += Math.max(0, rvolBonus);

                      techScore += (squeezeState === 'SQUEEZE_ON' ? 10 : 0);
                      if (goldenSetup || isBlueSky) techScore += 10;
                      
                      // [LOGIC] Displacement Override
                      if (isDisplacement) {
                          techScore = Math.max(techScore, 92); // Force Elite Status
                          addLog(`[OK] Accelerator Ready: Displacement Scanned`, "ok");
                      }
                      
                      // [LOGIC] Low Energy Penalty
                      if (adx < 20 && rawRvol < 0.8) {
                          techScore = Math.min(techScore, 45); // Filter out weak stocks
                      }
                      
                      const safeTechnicalScore = Number(Math.min(99, Math.max(1, isNaN(techScore) ? 50 : techScore)).toFixed(2));
                      
                      // [NEW] Technical Breakout Flag
                      const isTechnicalBreakout = trendAlignment === 'POWER_TREND' || isBlueSky;
                      if (trendAlignment === 'POWER_TREND') {
                           addLog(`[OK] Power Trend Detected: ${item.symbol} is ready for launch`, "ok");
                      }

                      techData = {
                          technicalScore: safeTechnicalScore,
                          techMetrics: {
                              rsi: Number(rsi.toFixed(2)),
                              adx: Number(adx.toFixed(2)),
                              trend: Number(trendScore.toFixed(2)),
                              rvol: Number(rvolScore.toFixed(2)), // Normalized Score
                              rawRvol: Number(rawRvol.toFixed(2)), // Display Value
                              squeezeState,
                              rsRating: Number(rsRating.toFixed(0)),
                              momentum: Number(rsRating.toFixed(2)),
                              wyckoffPhase,
                              trendAlignment,
                              obvSlope,
                              isBlueSky,
                              goldenSetup,
                              volatilityRange: Number(volatilityRange.toFixed(2))
                          },
                          priceHistory: candles.slice(-120).map((c: any) => ({
                              date: new Date(c.t).toISOString().split('T')[0], close: c.c, open: c.o, high: c.h, low: c.l, volume: c.v
                          })),
                          // [NEW] Pass ICT Data to Next Stage
                          high52,
                          low52,
                          recentSwingHigh,
                          recentSwingLow,
                          dataSource: dataSrc
                      };
                  }
                  
                  // [FIX] Derive Breakout Flag from Tech Data
                  const isTechnicalBreakout = techData.techMetrics.trendAlignment === 'POWER_TREND' || techData.techMetrics.isBlueSky;

                  results.push({
                      ...item, // [CRITICAL] Master Pass-through (Stage 3 Data)
                      ...techData,
                      isTechnicalBreakout, 
                      lastUpdate: new Date().toISOString()
                  });

              } catch (e) {
                  console.error(`Tech Analysis Error for ${item.symbol}`, e);
                  // Critical Failure Fallback
                  results.push({
                      ...item,
                      technicalScore: 0,
                      techMetrics: { 
                          rsi: 50, adx: 0, trend: 50, rvol: 50, rawRvol: 1.0, 
                          squeezeState: 'SQUEEZE_OFF', rsRating: 50, momentum: 50, 
                          wyckoffPhase: 'ACCUM', trendAlignment: 'NEUTRAL', 
                          obvSlope: 'NEUTRAL', isBlueSky: false, goldenSetup: false,
                          volatilityRange: 50 
                      },
                      priceHistory: [],
                      high52: item.fiftyTwoWeekHigh || 0,
                      low52: item.fiftyTwoWeekLow || 0,
                      recentSwingHigh: 0,
                      recentSwingLow: 0,
                      lastUpdate: new Date().toISOString(),
                      dataSource: 'FAILURE'
                  });
              }
          }
          
          setProgress(prev => ({ ...prev, current: results.length }));
          await new Promise(r => setTimeout(r, 10)); 
      }

      const survivalRate = ((results.length / candidates.length) * 100).toFixed(1);
      addLog(`Survival Rate: ${survivalRate}% (Dropped ${droppedCount} invalid assets).`, "ok");

      results.sort((a, b) => b.technicalScore - a.technicalScore);
      setProcessedData(results);
      if (results.length > 0) handleTickerSelect(results[0]);

      addLog(`[DATA-SYNC] Passing Fundamental Alpha Tags to ICT Stage`, "ok");

      // Save to Drive
      const folderId = await ensureFolder(accessToken, GOOGLE_DRIVE_TARGET.stage4SubFolder);
      const now = new Date();
      const kstDate = new Date(now.getTime() + 9 * 60 * 60 * 1000);
      const timestamp = kstDate.toISOString().replace('T', '_').replace(/:/g, '-').split('.')[0];
      const fileName = `STAGE4_TECHNICAL_FULL_${timestamp}.json`;
      
      const payload = {
        manifest: { version: "7.5.1", count: results.length, strategy: "Hybrid_Heuristic_Fusion_ADX_LogRVOL_RS", survivalRate },
        technical_universe: results
      };

      const meta = { name: fileName, parents: [folderId], mimeType: 'application/json' };
      const form = new FormData();
      form.append('metadata', new Blob([JSON.stringify(meta)], { type: 'application/json' }));
      form.append('file', new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));

      await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST', headers: { 'Authorization': `Bearer ${accessToken}` }, body: form
      });

      addLog(`Tech Analysis Complete. ${results.length} Tickers Processed (Heuristic applied where needed).`, "ok");
      if (onComplete) onComplete();

    } catch (e: any) {
      addLog(`System Failure: ${e.message}`, "err");
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

  return (
    <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
      <div className="xl:col-span-3 space-y-6">
        <div className="glass-panel p-5 md:p-8 lg:p-10 rounded-[32px] md:rounded-[40px] border-t-2 border-t-orange-500 shadow-2xl bg-slate-900/40 relative overflow-hidden">
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-6 md:mb-10 gap-6">
            <div className="flex items-center space-x-6">
              <div className={`w-12 h-12 md:w-14 md:h-14 rounded-3xl bg-orange-600/10 flex items-center justify-center border border-orange-500/20 ${loading ? 'animate-pulse' : ''}`}>
                 <svg className={`w-5 h-5 md:w-6 md:h-6 text-orange-400 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
              </div>
              <div>
                <h2 className="text-xl md:text-3xl font-black text-white italic tracking-tighter uppercase leading-none">Tech_Tactician v7.5</h2>
                <div className="flex flex-col mt-2 gap-1">
                   <div className="flex items-center space-x-2">
                        <span className={`text-[8px] font-black px-2 py-0.5 rounded border uppercase tracking-widest ${loading ? 'border-orange-400 text-orange-400 animate-pulse' : 'border-orange-500/20 bg-orange-500/10 text-orange-400'}`}>
                            {loading ? `Processing: ${progress.status} (${progress.current}/${progress.total})` : 'Heuristic Fallback Ready'}
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
              onClick={executeTechnicalScan} 
              disabled={loading} 
              className={`w-full lg:w-auto px-8 md:px-12 py-4 md:py-5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${
                  loading 
                    ? 'bg-orange-800 text-orange-200/50 shadow-inner scale-95 cursor-wait border-t border-black/20' 
                    : 'bg-orange-600 text-white shadow-xl shadow-orange-900/20 hover:scale-105 active:scale-95'
              }`}
            >
              {loading ? 'Crunching Volatility...' : 'Execute Momentum Scan'}
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-8 mb-6">
              {/* LIST VIEW */}
              <div className="bg-black/40 rounded-3xl border border-white/5 overflow-hidden flex flex-col h-[360px]">
                 <div className="p-4 border-b border-white/5 bg-white/5 flex justify-between items-center">
                    <p className="text-[9px] font-black text-orange-400 uppercase tracking-widest">Tech Momentum Rank ({processedData.length})</p>
                    <span className="text-[8px] font-mono text-slate-500">Sorted by Tech Score</span>
                 </div>
                 <div className="flex-1 overflow-y-auto no-scrollbar p-2 space-y-2">
                     {processedData.length > 0 ? processedData.map((t, i) => (
                         <div key={i} onClick={() => handleTickerSelect(t)} className={`p-3 rounded-xl border flex justify-between items-center cursor-pointer transition-all ${selectedTicker?.symbol === t.symbol ? 'bg-orange-900/30 border-orange-500/50' : 'bg-white/5 border-transparent hover:bg-white/10'}`}>
                             <div className="flex items-center gap-3">
                                 <span className={`text-[10px] font-black w-4 ${i < 3 ? 'text-orange-400' : 'text-slate-500'}`}>{i + 1}</span>
                                 <div>
                                     <p className="text-xs font-black text-white flex items-center gap-2">
                                         {t.symbol}
                                         {t.techMetrics.trendAlignment === 'POWER_TREND' && (
                                             <span className="text-[6px] bg-rose-500 text-white px-1 rounded animate-pulse">POWER</span>
                                         )}
                                     </p>
                                     <p className="text-[8px] text-slate-400 truncate w-24">{t.name}</p>
                                 </div>
                             </div>
                             <div className="text-right flex items-center gap-3">
                                 <div className="flex flex-col items-end">
                                     <p className="text-[10px] font-mono font-bold text-white">{t.technicalScore.toFixed(1)}</p>
                                     <p className="text-[7px] text-slate-500 uppercase">{t.dataSource === 'HEURISTIC' ? 'Est.' : 'Tech'}</p>
                                 </div>
                                 <div className={`w-1.5 h-8 rounded-full ${t.technicalScore > 80 ? 'bg-orange-500' : t.technicalScore > 50 ? 'bg-amber-500' : 'bg-slate-700'}`}></div>
                             </div>
                         </div>
                     )) : (
                         <div className="h-full flex items-center justify-center opacity-30 text-[9px] uppercase tracking-widest text-slate-400 italic">
                             Waiting for Technical Data...
                         </div>
                     )}
                 </div>
              </div>

              {/* DETAIL VIEW - COCKPIT */}
              <div className="bg-black/40 rounded-3xl border border-white/5 p-6 relative flex flex-col h-[360px]">
                 {selectedTicker ? (
                     <div className="h-full flex flex-col justify-between" key={selectedTicker.symbol}> 
                        <div className="flex justify-between items-start">
                            <div>
                                <div className="flex items-baseline gap-3">
                                    <h3 className="text-3xl font-black text-white italic tracking-tighter uppercase">{selectedTicker.symbol}</h3>
                                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest truncate max-w-[150px]">{selectedTicker.name}</span>
                                </div>
                                <div className="flex flex-wrap items-center gap-2 mt-2">
                                     {selectedTicker.techMetrics.squeezeState === 'SQUEEZE_ON' && (
                                         <span 
                                            onClick={() => setActiveMetric('VCP')}
                                            className="text-[8px] font-black bg-rose-500 text-white px-2 py-0.5 rounded animate-pulse uppercase cursor-help hover:opacity-80 transition-opacity tech-insight-trigger"
                                         >
                                             VCP Squeeze Active
                                         </span>
                                     )}
                                     {selectedTicker.techMetrics.goldenSetup && (
                                         <span 
                                            onClick={() => setActiveMetric('GOLDEN_SETUP')}
                                            className="text-[8px] font-black bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 px-2 py-0.5 rounded uppercase cursor-help hover:opacity-80 transition-opacity tech-insight-trigger"
                                         >
                                             Golden Setup
                                         </span>
                                     )}
                                     <span 
                                        onClick={() => setActiveMetric('RVOL')}
                                        className="text-[8px] font-black bg-orange-900/30 text-orange-400 px-2 py-0.5 rounded border border-orange-500/20 uppercase cursor-help hover:opacity-80 transition-opacity tech-insight-trigger"
                                     >
                                         RVOL {selectedTicker.techMetrics.rawRvol}x
                                     </span>
                                     <span 
                                        onClick={() => setActiveMetric(selectedTicker.techMetrics.trendAlignment)}
                                        className="text-[8px] font-black bg-slate-800 text-slate-300 px-2 py-0.5 rounded border border-white/10 uppercase cursor-help hover:opacity-80 transition-opacity tech-insight-trigger"
                                     >
                                         {selectedTicker.techMetrics.trendAlignment}
                                     </span>
                                     {selectedTicker.dataSource === 'HEURISTIC' && (
                                        <span 
                                            onClick={() => setActiveMetric('ESTIMATED')}
                                            className="text-[8px] font-black bg-slate-800 text-amber-500 px-2 py-0.5 rounded border border-amber-500/30 uppercase cursor-help hover:opacity-80 transition-opacity tech-insight-trigger"
                                        >
                                            ESTIMATED
                                        </span>
                                     )}
                                </div>
                            </div>
                            <div className="text-right">
                                 <p className="text-[8px] text-slate-500 uppercase font-bold mb-1">Momentum</p>
                                 <p 
                                    onClick={() => setActiveMetric('MOMENTUM')}
                                    className="text-2xl font-black text-orange-400 tracking-tighter cursor-help hover:scale-105 transition-transform tech-insight-trigger"
                                 >
                                     {selectedTicker.techMetrics.momentum}
                                 </p>
                            </div>
                        </div>

                        <div className="flex-1 w-full relative -ml-4 my-2">
                             {selectedTicker.priceHistory && selectedTicker.priceHistory.length > 0 ? (
                                isVisible && (
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={selectedTicker.priceHistory}>
                                        <defs>
                                            <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#f97316" stopOpacity={0.3}/>
                                                <stop offset="95%" stopColor="#f97316" stopOpacity={0}/>
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.1} vertical={false} />
                                        <XAxis dataKey="date" hide />
                                        <YAxis domain={['auto', 'auto']} hide />
                                        <RechartsTooltip 
                                            contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b' }} 
                                            itemStyle={{ color: '#f97316' }}
                                        />
                                        <Area type="monotone" dataKey="close" stroke="#f97316" fillOpacity={1} fill="url(#colorPrice)" strokeWidth={2} />
                                    </AreaChart>
                                </ResponsiveContainer>
                                )
                             ) : (
                                 <div className="h-full flex flex-col items-center justify-center opacity-20 text-[8px] font-mono">
                                     <svg className="w-8 h-8 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
                                     CHART DATA UNAVAILABLE
                                 </div>
                             )}
                        </div>

                        {/* Interactive Metrics Grid - Expanded to 6 items */}
                        <div className="grid grid-cols-3 gap-2 mt-2">
                             {[
                                { id: 'RS_RATING', label: 'RS Rating', val: selectedTicker.techMetrics.rsRating, good: selectedTicker.techMetrics.rsRating > 80 },
                                { id: 'VCP', label: 'VCP (Tight)', val: selectedTicker.techMetrics.squeezeState === 'SQUEEZE_ON' ? 'YES' : 'NO', good: selectedTicker.techMetrics.squeezeState === 'SQUEEZE_ON' },
                                { id: 'GOLDEN_SETUP', label: 'Golden Cross', val: selectedTicker.techMetrics.goldenSetup ? 'CONFIRMED' : 'NO', good: selectedTicker.techMetrics.goldenSetup },
                                { id: 'POWER_TREND', label: 'Power Trend', val: selectedTicker.techMetrics.trendAlignment === 'POWER_TREND' ? 'ACTIVE' : 'WAIT', good: selectedTicker.techMetrics.trendAlignment === 'POWER_TREND' },
                                { id: 'ADX', label: 'ADX Strength', val: selectedTicker.techMetrics.adx, good: selectedTicker.techMetrics.adx > 25 },
                                { id: 'OBV', label: 'OBV Trend', val: selectedTicker.techMetrics.obvSlope, good: selectedTicker.techMetrics.obvSlope === 'ACCUMULATION' }
                             ].map((m) => (
                                 <div 
                                    key={m.id} 
                                    onClick={() => setActiveMetric(m.id)}
                                    className={`tech-insight-card p-2 rounded-lg text-center border cursor-pointer transition-all hover:scale-105 active:scale-95 group tech-insight-trigger ${activeMetric === m.id ? 'bg-orange-600 border-orange-400 text-white shadow-lg' : m.good ? 'bg-orange-900/20 border-orange-500/30' : 'bg-slate-800 border-white/5 hover:bg-slate-700'}`}
                                 >
                                     <div className="flex items-center justify-center gap-1 mb-0.5">
                                        <p className={`text-[7px] uppercase font-bold ${activeMetric === m.id ? 'text-white' : 'text-slate-500 group-hover:text-slate-400'}`}>{m.label}</p>
                                     </div>
                                     <p className={`text-[10px] font-black ${activeMetric === m.id ? 'text-white' : m.good ? 'text-orange-400' : 'text-slate-300'}`}>{m.val}</p>
                                 </div>
                             ))}
                        </div>

                        {/* Tech Insight Overlay */}
                        {activeMetric && TECH_DEFINITIONS[activeMetric] && (
                            <div className="tech-insight-overlay absolute inset-x-4 bottom-4 z-20 animate-in fade-in slide-in-from-bottom-2">
                                <div className="bg-slate-900/95 backdrop-blur-xl p-4 rounded-xl border border-orange-500/30 shadow-2xl relative">
                                    <button onClick={() => setActiveMetric(null)} className="absolute top-2 right-2 text-slate-500 hover:text-white">
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                    </button>
                                    <h5 className="text-[10px] font-black text-orange-400 uppercase tracking-widest mb-1 flex items-center gap-2">
                                        <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse"></span>
                                        {TECH_DEFINITIONS[activeMetric].title}
                                    </h5>
                                    <div className="text-[9px] text-slate-300 leading-relaxed font-medium mb-2">
                                        <ReactMarkdown remarkPlugins={[remarkGfm]} components={MarkdownComponents}>
                                            {TECH_DEFINITIONS[activeMetric].desc}
                                        </ReactMarkdown>
                                    </div>
                                    <div className="bg-white/5 p-2 rounded border border-white/5">
                                        <p className="text-[8px] text-emerald-400 font-bold mb-0.5">💡 Strategy:</p>
                                        <p className="text-[8px] text-slate-400">{TECH_DEFINITIONS[activeMetric].interpretation}</p>
                                    </div>
                                </div>
                            </div>
                        )}
                     </div>
                 ) : (
                     <div className="h-full flex flex-col items-center justify-center opacity-20">
                         <svg className="w-16 h-16 text-slate-500 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
                         <p className="text-[9px] font-black uppercase tracking-[0.3em]">Select Asset to Inspect</p>
                     </div>
                 )}
              </div>
          </div>
        </div>
      </div>

      <div className="xl:col-span-1">
        <div className="glass-panel h-[400px] lg:h-[600px] rounded-[32px] md:rounded-[40px] bg-slate-950 border-l-4 border-l-orange-600 flex flex-col p-6 shadow-2xl overflow-hidden">
          <div className="flex items-center justify-between mb-8 px-2">
            <h3 className="font-black text-white text-[10px] uppercase tracking-[0.4em] italic">Tech_Log</h3>
          </div>
          <div ref={logRef} className="flex-1 bg-black/70 p-6 rounded-[32px] font-mono text-[9px] text-orange-300/60 overflow-y-auto no-scrollbar space-y-4 border border-white/5">
            {logs.map((l, i) => (
              <div key={i} className={`pl-4 border-l-2 ${l.includes('[OK]') ? 'border-emerald-500 text-emerald-400' : l.includes('[ERR]') ? 'border-red-500 text-red-400' : l.includes('[AUTO]') ? 'border-rose-500 text-rose-400' : 'border-orange-900'}`}>
                {l}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TechnicalAnalysis;
