
import React, { useState, useEffect, useRef } from 'react';
import { ResponsiveContainer, Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Tooltip as RechartsTooltip } from 'recharts';
import { GOOGLE_DRIVE_TARGET } from '../constants';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// [ADDED] Markdown Components
const MarkdownComponents: any = {
  p: (props: any) => <p className="mb-2 text-slate-300 leading-relaxed text-[9px]" {...props} />,
  ul: (props: any) => <ul className="list-disc pl-4 mb-2 space-y-1" {...props} />,
  li: (props: any) => <li className="text-slate-300 text-[9px]" {...props} />,
  strong: (props: any) => <strong className="text-cyan-400 font-bold" {...props} />,
  h1: (props: any) => <h1 className="text-xs font-bold text-white mb-2" {...props} />,
  h2: (props: any) => <h2 className="text-[10px] font-bold text-white mb-1" {...props} />,
  h3: (props: any) => <h3 className="text-[9px] font-bold text-cyan-400 mb-1" {...props} />,
  code: ({inline, ...props}: any) => inline 
    ? <code className="bg-slate-800 text-cyan-300 px-1 py-0.5 rounded font-mono text-[9px] border border-white/10" {...props} />
    : <div className="overflow-x-auto my-2"><pre className="bg-slate-950 p-2 rounded-lg border border-white/10 text-[9px] text-slate-300 font-mono" {...props} /></div>,
};

interface FundamentalTicker {
  symbol: string;
  name: string;
  price: number;
  marketCap: number;
  
  qualityScore: number;
  fundamentalScore: number;
  compositeAlpha: number;
  
  intrinsicValue: number;
  fairValueGap: number;
  upsidePotential: number;
  
  roic: number;
  ruleOf40: number;
  grossMargin: number;
  fScore: number;
  zScore: number;
  earningsQuality: number;
  
  economicMoat: 'Wide' | 'Narrow' | 'None';
  dataConfidence: number;
  
  radarData: { subject: string; A: number; fullMark: number }[];
  
  sector: string;
  lastUpdate: string;
  isDerived: boolean;
  
  [key: string]: any;
}

interface Props {
  autoStart?: boolean;
  onComplete?: () => void;
  onStockSelected?: (stock: any) => void;
}

// [KNOWLEDGE BASE] Fundamental Metric Definitions
const FUNDAMENTAL_INSIGHTS: Record<string, { title: string; desc: string; strategy: string }> = {
    'ROIC': {
        title: "ROIC (투하자본이익률)",
        desc: "기업이 영업활동에 투입한 자본 대비 얼마나 효율적으로 이익을 냈는지 나타내는 핵심 지표입니다. (Return on Invested Capital)",
        strategy: "15% 이상: 강력한 해자(Moat)를 가진 우량 기업. 지속적인 복리 성장이 기대됩니다."
    },
    'Z_SCORE': {
        title: "Altman Z-Score (파산위험)",
        desc: "기업의 파산 가능성을 통계적으로 예측하는 모델입니다. 재무 건전성을 진단하는 가장 신뢰도 높은 지표 중 하나입니다.",
        strategy: "2.99 이상: 재무적으로 매우 안전 (Safe Zone). 1.8 미만은 파산 위험이 있으므로 주의가 필요합니다."
    },
    'F_SCORE': {
        title: "Piotroski F-Score (재무개선)",
        desc: "기업의 수익성, 레버리지, 유동성, 효율성 등이 전년 대비 개선되었는지를 0~9점으로 평가합니다.",
        strategy: "7점 이상: 펀더멘털이 턴어라운드하거나 강화되고 있는 기업. 매수 적기일 가능성이 높습니다."
    },
    'RULE_40': {
        title: "Rule of 40 (성장+수익)",
        desc: "매출성장률(%)과 이익률(%)의 합입니다. 주로 SaaS 및 고성장 기술주의 건전성을 평가할 때 사용합니다.",
        strategy: "40% 이상: 초고속 성장과 수익성을 겸비한 엘리트 기술주. 프리미엄을 줄 가치가 있습니다."
    },
    'SAFETY': {
        title: "Safety Score (재무안정성)",
        desc: "부채비율, 유동비율, 이자보상배율을 종합하여 산출한 기업의 파산 저항력 점수입니다.",
        strategy: "80점 이상: 경기 침체나 금리 인상기에도 버틸 수 있는 '망하지 않을 기업'입니다."
    },
    'EARNINGS_QUALITY': {
        title: "Earnings Quality (이익의 질)",
        desc: "회계상 순이익(Net Income)과 실제 현금흐름(Operating Cashflow)의 괴리를 분석합니다. 분식회계 가능성을 탐지합니다.",
        strategy: "1.0 이상: 순이익보다 더 많은 현금이 들어오고 있음. 매우 건전한 흑자 구조입니다."
    },
    'GAP': {
        title: "Fair Value Gap (내재가치 괴리)",
        desc: "AI가 산출한 적정 주가(Intrinsic Value)와 현재 주가의 차이입니다. 양수(+)면 저평가, 음수(-)면 고평가 상태입니다.",
        strategy: "20% 이상: 안전마진(Margin of Safety)이 충분히 확보된 구간. 적극 매수 고려."
    },
    'MOAT': {
        title: "Economic Moat (경제적 해자)",
        desc: "경쟁사가 넘볼 수 없는 독점적 지위나 브랜드 파워를 의미합니다. ROIC와 마진율로 판별합니다.",
        strategy: "Wide: 10년 이상 초과 수익을 유지할 가능성이 높음. 장기 투자의 필수 조건."
    },
    'CONFIDENCE': {
        title: "Data Confidence (데이터 신뢰도)",
        desc: "일부 재무 데이터(매출, EPS, 현금흐름 등)가 누락되어 업종 평균이나 대체 지표(Proxy)를 사용하여 분석된 상태입니다.",
        strategy: "이 상태에서는 펀더멘털 점수가 실제보다 낮거나 높게 왜곡될 수 있습니다. 기술적 분석(Stage 4) 및 수급(Stage 5) 신호를 반드시 교차 검증하십시오."
    }
};

// --- HELPER FUNCTIONS ---

const safeNum = (val: any) => {
    if (val === null || val === undefined || val === '') return 0;
    if (typeof val === 'number') return isFinite(val) ? val : 0;
    const n = parseFloat(String(val).replace(/,/g, '').replace(/%/g, ''));
    return Number.isFinite(n) ? n : 0;
};

// Auto-scaler for ratios (e.g. 0.15 -> 15.0)
const toPercent = (val: number) => {
    if (val !== 0 && Math.abs(val) <= 5.0) {
        return Number((val * 100).toFixed(2));
    }
    return Number(val.toFixed(2));
};

// Normalize score to 0-100 scale
const normalizeScore = (val: number, min: number, max: number) => {
    const safeVal = safeNum(val);
    if (safeVal <= min) return 0;
    if (safeVal >= max) return 100;
    return ((safeVal - min) / (max - min)) * 100;
};

// [ENGINE v4.5] Sector-Adaptive Valuation & Radar Fix
const performFinancialEngineering = (data: any) => {
    // 1. Extract & Sanitize Metrics
    const price = safeNum(data.price);
    const eps = safeNum(data.eps || data.earningsPerShare);
    const marketCap = safeNum(data.marketCap || data.marketValue);
    const netIncome = safeNum(data.netIncome || data.netIncomeCommonStockholders);
    const totalDebt = safeNum(data.totalDebt || data.debtToEquity || 0); 
    const totalEquity = safeNum(data.totalEquity || data.totalStockholdersEquity);
    const pe = safeNum(data.pe || data.per);
    const pbr = safeNum(data.pbr || data.priceToBook);
    
    // Revenue Logic
    let sales = safeNum(data.revenue || data.totalRevenue);
    if (sales === 0 && marketCap > 0 && safeNum(data.psr) > 0) {
        sales = marketCap / safeNum(data.psr); 
    }
    
    // Sector Detection
    const isFinancial = (data.sector || '').toLowerCase().includes('financial') || (data.industry || '').toLowerCase().includes('bank');
    
    // [PROXY LOGIC] Cash Flow
    let opCashflow = safeNum(data.operatingCashflow || data.operatingCashFlow);
    let isCashflowProxy = false;
    
    if (opCashflow === 0) {
        if (netIncome > 0) {
            opCashflow = netIncome * (isFinancial ? 1.0 : 1.2); 
            isCashflowProxy = true;
        } else if (marketCap > 0 && pe > 0) {
            const impliedEarnings = marketCap / pe;
            opCashflow = impliedEarnings * (isFinancial ? 1.0 : 1.2);
            isCashflowProxy = true;
        }
    }

    // Growth & Margins
    const revenueGrowth = toPercent(safeNum(data.revenueGrowth || 5)); 
    const profitMargin = sales > 0 ? (netIncome / sales) * 100 : 5;
    const rawGrossMargin = safeNum(data.grossMargin || data.grossProfitMargin || (sales > 0 ? (data.grossProfit / sales) : 0));
    const grossMargin = toPercent(rawGrossMargin);
    
    let divYield = safeNum(data.dividendYield);
    if (divYield > 100) divYield = divYield / 100;

    const roe = toPercent(safeNum(data.roe || data.returnOnEquity || 0));

    // 2. Intrinsic Value (Enhanced Benjamin Graham)
    const g = Math.min(revenueGrowth, 15); 
    let intrinsicValue = 0;
    
    if (eps > 0) {
        const multiplier = isFinancial ? 1.0 : 1.5; 
        intrinsicValue = eps * (8.5 + multiplier * g); 
    } else {
        const bookValue = safeNum(data.bookValuePerShare) || (price / (pbr || 1));
        const roeFactor = Math.max(0.5, Math.min(3.0, roe / 10));
        intrinsicValue = bookValue * roeFactor;
    }

    if (intrinsicValue > price * 3) intrinsicValue = price * 3;
    if (intrinsicValue <= 0) intrinsicValue = price * 0.9; 

    const fairValueGap = price > 0 ? ((intrinsicValue - price) / price) * 100 : 0;
    
    // 3. Efficiency Metrics
    const investedCapital = totalEquity + totalDebt;
    let roic = 0;
    if (investedCapital > 0) {
        roic = (netIncome / investedCapital) * 100;
    } else {
        roic = roe * 0.7; 
    }
    
    const cfMargin = sales > 0 ? (opCashflow / sales) * 100 : profitMargin;
    const ruleOf40 = revenueGrowth + cfMargin;
    
    // 4. Financial Health (Piotroski F-Score)
    const zScore = safeNum(data.zScoreProxy) || 1.5;
    let fScore = 4;
    if (netIncome > 0) fScore++;
    if (opCashflow > 0) fScore++;
    if (opCashflow > netIncome) fScore++;
    if (roic > 5) fScore++;
    if (grossMargin > 20) fScore++;
    if (divYield > 0) fScore++;
    
    // 5. SCORING ENGINE [CORE UPDATE]
    let valScore = 0;
    if (isFinancial) {
        const peScore = normalizeScore(20 - pe, 0, 15); 
        const pbrScore = normalizeScore(2.0 - pbr, 0, 1.5);
        valScore = (peScore * 0.4) + (pbrScore * 0.6);
    } else {
        valScore = normalizeScore(fairValueGap, -20, 80);
    }
    
    const qualScore = (normalizeScore(grossMargin, 10, 60) * 0.4) + (normalizeScore(roic, 5, 20) * 0.6);
    const growthScore = normalizeScore(ruleOf40, 10, 60);

    let safetyScore = 0;
    if (totalDebt === 0) {
        safetyScore = 100; 
    } else {
        const d2e = totalDebt; 
        if (isFinancial) {
             safetyScore = normalizeScore(6 - d2e, 0, 5);
        } else {
             safetyScore = normalizeScore(2.5 - d2e, 0, 2);
        }
    }
    if (zScore > 2.99) safetyScore = Math.max(safetyScore, 90);

    let earningsQualityScore = normalizeScore(opCashflow / (netIncome || 1), 0.5, 2.0);
    if (isCashflowProxy) earningsQualityScore = Math.min(earningsQualityScore, 70);

    const fundamentalScore = (valScore * 0.35) + (qualScore * 0.30) + (growthScore * 0.20) + (safetyScore * 0.15);

    let economicMoat: 'Wide' | 'Narrow' | 'None' = 'None';
    if (roic > 15 && ruleOf40 > 40 && fScore >= 7) economicMoat = 'Wide';
    else if (roic > 8 && ruleOf40 > 25 && fScore >= 5) economicMoat = 'Narrow';

    let missingDataPoints = 0;
    if (!eps && !netIncome) missingDataPoints++;
    if (!sales) missingDataPoints++;
    let dataConfidence = Math.max(10, 100 - (missingDataPoints * 20));
    if (isCashflowProxy) dataConfidence -= 20;

    return {
        fundamentalScore: safeNum(fundamentalScore),
        zScore: safeNum(zScore),
        fScore: safeNum(fScore),
        roic: safeNum(roic),
        ruleOf40: safeNum(ruleOf40),
        grossMargin: safeNum(grossMargin),
        intrinsicValue: safeNum(intrinsicValue),
        upsidePotential: safeNum(fairValueGap),
        fairValueGap: safeNum(fairValueGap),
        earningsQuality: safeNum(earningsQualityScore),
        economicMoat,
        dataConfidence,
        // [FIX] Radar Data Visualization Floor & Precision (Decimal Fix)
        // [UPDATE] Reverted labels to English as requested
        radarData: [
            { subject: 'Valuation', A: Number(Math.max(5, safeNum(valScore)).toFixed(2)), fullMark: 100 },
            { subject: 'Moat', A: Number(Math.max(5, safeNum(qualScore)).toFixed(2)), fullMark: 100 },
            { subject: 'Growth', A: Number(Math.max(5, safeNum(growthScore)).toFixed(2)), fullMark: 100 },
            { subject: 'Safety', A: Number(Math.max(5, safeNum(safetyScore)).toFixed(2)), fullMark: 100 },
            { subject: 'Quality', A: Number(Math.max(5, safeNum(earningsQualityScore)).toFixed(2)), fullMark: 100 },
        ]
    };
};

const FundamentalAnalysis: React.FC<Props> = ({ autoStart, onComplete, onStockSelected }) => {
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, file: '' });
  const [processedData, setProcessedData] = useState<FundamentalTicker[]>([]);
  const [selectedTicker, setSelectedTicker] = useState<FundamentalTicker | null>(null);
  const [activeInsight, setActiveInsight] = useState<string | null>(null);
  
  const [logs, setLogs] = useState<string[]>(['> Fundamental_Node v4.5: Visual-Safe Engine Ready.']);
  const logRef = useRef<HTMLDivElement>(null);
  const startTimeRef = useRef<number>(0);
  
  const accessToken = sessionStorage.getItem('gdrive_access_token');

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  // Handle outside click to close overlay
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
        const target = event.target as HTMLElement;
        if (!target.closest('.fund-insight-trigger') && !target.closest('.fund-insight-overlay')) {
            setActiveInsight(null);
        }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (autoStart && !loading) {
        addLog("AUTO-PILOT: Engaging Fundamental Analysis...", "signal");
        executeFundamentalEngine();
    }
  }, [autoStart]);

  const addLog = (m: string, t: 'info' | 'ok' | 'err' | 'warn' | 'signal' = 'info') => {
    const p = { info: '>', ok: '[OK]', err: '[ERR]', warn: '[WARN]', signal: '[AUTO]' };
    setLogs(prev => [...prev, `${p[t]} ${m}`].slice(-50));
  };

  const handleTickerSelect = (ticker: any) => {
    if (ticker) {
        setSelectedTicker(ticker);
        setActiveInsight(null); // Reset insight on ticker change
        if (onStockSelected) onStockSelected(ticker);
    }
  };

  const getFormattedTimestamp = () => {
    const now = new Date();
    const kstDate = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    return kstDate.toISOString().replace('T', '_').replace(/:/g, '-').split('.')[0];
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

  const uploadFile = async (token: string, folderId: string, name: string, content: any) => {
      const meta = { name, parents: [folderId], mimeType: 'application/json' };
      const form = new FormData();
      form.append('metadata', new Blob([JSON.stringify(meta)], { type: 'application/json' }));
      form.append('file', new Blob([JSON.stringify(content, null, 2)], { type: 'application/json' }));
      
      await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST', headers: { 'Authorization': `Bearer ${token}` }, body: form
      });
  };

  const executeFundamentalEngine = async () => {
      if (!accessToken || loading) return;
      setLoading(true);
      setProcessedData([]);
      startTimeRef.current = Date.now();

      try {
          addLog("Phase 1: Loading Stage 1 Purified Universe...", "info");
          const q = encodeURIComponent(`name contains 'STAGE1_PURIFIED_UNIVERSE' and trashed = false`);
          const listRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&orderBy=createdTime desc&pageSize=1`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
          }).then(r => r.json());

          if (!listRes.files?.length) throw new Error("Stage 1 Data Missing.");

          const stage1Content = await fetch(`https://www.googleapis.com/drive/v3/files/${listRes.files[0].id}?alt=media`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
          }).then(r => r.json());

          const candidates = stage1Content.investable_universe || [];
          addLog(`Target Acquired: ${candidates.length} Elite Assets.`, "ok");
          setProgress({ current: 0, total: candidates.length, file: 'Processing...' });

          const results: FundamentalTicker[] = [];
          
          let count = 0;
          for (const stage2Item of candidates) {
              count++;
              const analysis = performFinancialEngineering(stage2Item);
              
              const qualityScore = safeNum(stage2Item.qualityScore || 50);
              const fundamentalScore = analysis.fundamentalScore;
              
              const compositeAlpha = (qualityScore * 0.3) + (fundamentalScore * 0.7);

              results.push({
                  ...stage2Item, 
                  ...analysis,
                  qualityScore,
                  fundamentalScore,
                  compositeAlpha: safeNum(compositeAlpha),
                  lastUpdate: new Date().toISOString(),
                  isDerived: true
              });

              if (count % 20 === 0) {
                  setProgress({ current: count, total: candidates.length, file: 'Analysing...' });
                  await new Promise(r => setTimeout(r, 0));
              }
          }

          results.sort((a, b) => b.compositeAlpha - a.compositeAlpha);
          setProcessedData(results);
          if (results.length > 0) handleTickerSelect(results[0]);

          addLog("Valuation Audit Complete. Saving to Vault...", "info");
          
          const saveFolderId = await ensureFolder(accessToken, GOOGLE_DRIVE_TARGET.stage3SubFolder);
          const resultFileName = `STAGE3_FUNDAMENTAL_FULL_${getFormattedTimestamp()}.json`;

          const payload = {
              manifest: { 
                  version: "13.5.2", 
                  count: results.length, 
                  timestamp: new Date().toISOString(),
                  engine: "Sector_Adaptive_Valuation_v4.5" 
              },
              fundamental_universe: results
          };

          await uploadFile(accessToken, saveFolderId, resultFileName, payload);
          addLog(`Vault Saved: ${resultFileName}`, "ok");
          if (onComplete) onComplete();

      } catch (e: any) {
          addLog(`Engine Failure: ${e.message}`, "err");
      } finally {
          setLoading(false);
          setProgress({ current: 0, total: 0, file: '' });
      }
  };

  const getSectorStyle = (sector: string) => {
    const s = (sector || '').toLowerCase();
    if (s.includes('tech') || s.includes('software')) return 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30';
    if (s.includes('finance')) return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
    if (s.includes('health')) return 'bg-rose-500/20 text-rose-400 border-rose-500/30';
    return 'bg-slate-500/20 text-slate-400 border-slate-500/30';
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
      <div className="xl:col-span-3 space-y-6">
        <div className="glass-panel p-5 md:p-8 lg:p-10 rounded-[32px] md:rounded-[40px] border-t-2 border-t-cyan-500 shadow-2xl bg-slate-900/40 relative overflow-hidden">
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-6 md:mb-10 gap-6">
            <div className="flex items-center space-x-6">
              <div className={`w-12 h-12 rounded-3xl bg-cyan-600/10 flex items-center justify-center border border-cyan-500/20 ${loading ? 'animate-pulse' : ''}`}>
                 <svg className={`w-5 h-5 md:w-6 md:h-6 text-cyan-400 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>
              </div>
              <div>
                <h2 className="text-xl md:text-3xl font-black text-white italic tracking-tighter uppercase leading-none">Fundamental_Node v4.5</h2>
                <div className="flex flex-col mt-2 gap-1">
                    <span className={`text-[8px] font-black px-2 py-0.5 rounded border uppercase tracking-widest ${loading ? 'border-cyan-400 text-cyan-400 animate-pulse' : 'border-cyan-500/20 bg-cyan-500/10 text-cyan-400'}`}>
                        {loading ? `Auditing: ${progress.file}` : 'Deep Fundamental Audit Ready'}
                    </span>
                    {autoStart && <span className="text-[8px] px-2 py-0.5 bg-rose-600 text-white rounded font-black uppercase animate-pulse w-fit">AUTO PILOT</span>}
                </div>
              </div>
            </div>
            <button 
              onClick={executeFundamentalEngine} 
              disabled={loading} 
              className={`w-full lg:w-auto px-8 md:px-12 py-4 md:py-5 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl transition-all ${
                  loading 
                    ? 'bg-slate-800 text-slate-500 shadow-none border border-white/5 cursor-wait opacity-50' 
                    : 'bg-cyan-600 text-white shadow-xl shadow-cyan-900/20 hover:scale-105 active:scale-95'
              }`}
            >
              {loading ? 'Crunching Numbers...' : 'Start Global Fundamental Audit'}
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-8 mb-6 md:mb-10">
              {/* LIST VIEW */}
              <div className="bg-black/40 rounded-3xl border border-white/5 overflow-hidden flex flex-col h-[400px]">
                  <div className="p-4 border-b border-white/5 bg-white/5 flex justify-between items-center">
                      <p className="text-[9px] font-black text-cyan-400 uppercase tracking-widest">Fundamental Rank ({processedData.length})</p>
                      <span className="text-[8px] font-mono text-slate-500">Sorted by Composite Alpha</span>
                  </div>
                  <div className="flex-1 overflow-y-auto no-scrollbar p-2 space-y-2">
                      {processedData.length > 0 ? processedData.map((t, i) => (
                          <div key={i} onClick={() => handleTickerSelect(t)} className={`p-3 rounded-xl border flex justify-between items-center cursor-pointer transition-all ${selectedTicker?.symbol === t.symbol ? 'bg-cyan-900/30 border-cyan-500/50' : 'bg-white/5 border-transparent hover:bg-white/10'}`}>
                              <div className="flex items-center gap-3">
                                  <span className={`text-[10px] font-black w-4 ${i < 10 ? 'text-cyan-400' : 'text-slate-500'}`}>{i + 1}</span>
                                  <div>
                                      <p className="text-xs font-black text-white">{t.symbol}</p>
                                      <p className="text-[8px] text-slate-400 truncate w-24">{t.name}</p>
                                  </div>
                              </div>
                              <div className="text-right">
                                  <p className="text-[10px] font-mono font-bold text-white">{t.fundamentalScore.toFixed(0)} <span className="text-[7px] text-slate-500">SCORE</span></p>
                                  <div className="flex gap-1 justify-end mt-0.5">
                                      {t.fairValueGap > 0 && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>}
                                      {t.economicMoat !== 'None' && <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>}
                                      {t.ruleOf40 > 40 && <span className="w-1.5 h-1.5 rounded-full bg-purple-500"></span>}
                                  </div>
                              </div>
                          </div>
                      )) : (
                          <div className="h-full flex items-center justify-center opacity-30 text-[9px] uppercase tracking-widest text-slate-400 italic">
                              Waiting for Audit Data...
                          </div>
                      )}
                  </div>
              </div>

              {/* DETAIL VIEW */}
              <div className="bg-black/40 rounded-3xl border border-white/5 p-6 relative flex flex-col h-[400px]">
                   {selectedTicker ? (
                       <div className="h-full flex flex-col justify-between" key={selectedTicker.symbol}> 
                          <div className="flex justify-between items-start">
                              <div>
                                  <div className="flex items-baseline gap-3">
                                      <h3 className="text-3xl font-black text-white italic tracking-tighter uppercase">{selectedTicker.symbol}</h3>
                                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest truncate max-w-[150px]">{selectedTicker.name}</span>
                                  </div>
                                  <div className="flex flex-wrap items-center gap-2 mt-2">
                                       <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded border ${getSectorStyle(selectedTicker.sector)}`}>
                                           {selectedTicker.sector}
                                       </span>
                                       <span 
                                            onClick={() => setActiveInsight('GAP')}
                                            className="text-[8px] font-black bg-cyan-900/30 text-cyan-400 px-2 py-0.5 rounded border border-cyan-500/20 uppercase cursor-help hover:opacity-80 transition-opacity fund-insight-trigger"
                                       >
                                            Gap {selectedTicker.fairValueGap > 0 ? '+' : ''}{selectedTicker.fairValueGap.toFixed(2)}%
                                       </span>
                                       {selectedTicker.economicMoat !== 'None' && (
                                           <span 
                                                onClick={() => setActiveInsight('MOAT')}
                                                className="text-[8px] font-black bg-purple-900/30 text-purple-400 px-2 py-0.5 rounded border border-purple-500/20 uppercase cursor-help hover:opacity-80 transition-opacity fund-insight-trigger"
                                           >
                                               Moat {selectedTicker.economicMoat}
                                           </span>
                                       )}
                                       {selectedTicker.dataConfidence < 100 && (
                                           <span 
                                                onClick={() => setActiveInsight('CONFIDENCE')}
                                                className="text-[8px] font-black bg-rose-900/30 text-rose-400 px-2 py-0.5 rounded border border-rose-500/20 uppercase animate-pulse cursor-help hover:opacity-80 transition-opacity fund-insight-trigger"
                                           >
                                               Low Confidence
                                           </span>
                                       )}
                                  </div>
                              </div>
                              <div className="text-right">
                                   <p className="text-[8px] text-slate-500 uppercase font-bold mb-1">Fund. Score</p>
                                   <p className="text-2xl font-black text-cyan-400 tracking-tighter">{selectedTicker.fundamentalScore.toFixed(1)}</p>
                              </div>
                          </div>

                          <div className="flex-1 w-full relative -ml-4 my-2">
                              {selectedTicker.radarData && selectedTicker.radarData.length > 0 ? (
                                  <ResponsiveContainer width="100%" height="100%">
                                      <RadarChart cx="50%" cy="50%" outerRadius="70%" data={selectedTicker.radarData}>
                                          <PolarGrid stroke="#334155" opacity={0.3} />
                                          <PolarAngleAxis dataKey="subject" tick={{ fill: '#94a3b8', fontSize: 9, fontWeight: 'bold' }} />
                                          <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                                          <Radar name={selectedTicker.symbol} dataKey="A" stroke="#06b6d4" strokeWidth={2} fill="#06b6d4" fillOpacity={0.4} />
                                          <RechartsTooltip contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px' }} itemStyle={{ color: '#06b6d4', fontSize: '10px' }} />
                                      </RadarChart>
                                  </ResponsiveContainer>
                              ) : (
                                  <div className="h-full flex items-center justify-center opacity-20 text-[9px] uppercase tracking-widest text-slate-400 italic">No Radar Data Available</div>
                              )}
                          </div>
                          
                          {/* Interactive Score Cards (6 Metrics) */}
                          <div className="grid grid-cols-3 gap-2 mt-2">
                               <div 
                                    onClick={() => setActiveInsight('ROIC')}
                                    className={`p-2 rounded-lg text-center border cursor-pointer transition-all fund-insight-trigger ${activeInsight === 'ROIC' ? 'bg-cyan-600 border-cyan-400 text-white shadow-lg' : 'bg-slate-800/50 border-white/5 hover:bg-slate-700/50'}`}
                               >
                                   <p className={`text-[7px] uppercase font-bold ${activeInsight === 'ROIC' ? 'text-white' : 'text-slate-400'}`}>ROIC</p>
                                   <p className={`text-xs font-black ${activeInsight === 'ROIC' ? 'text-white' : selectedTicker.roic > 15 ? 'text-emerald-400' : 'text-slate-300'}`}>{selectedTicker.roic.toFixed(2)}%</p>
                               </div>
                               <div 
                                    onClick={() => setActiveInsight('Z_SCORE')}
                                    className={`p-2 rounded-lg text-center border cursor-pointer transition-all fund-insight-trigger ${activeInsight === 'Z_SCORE' ? 'bg-cyan-600 border-cyan-400 text-white shadow-lg' : 'bg-slate-800/50 border-white/5 hover:bg-slate-700/50'}`}
                               >
                                   <p className={`text-[7px] uppercase font-bold ${activeInsight === 'Z_SCORE' ? 'text-white' : 'text-slate-400'}`}>Z-Score</p>
                                   <p className={`text-xs font-black ${activeInsight === 'Z_SCORE' ? 'text-white' : selectedTicker.zScore > 2.9 ? 'text-emerald-400' : selectedTicker.zScore < 1.8 ? 'text-rose-400' : 'text-amber-400'}`}>{selectedTicker.zScore.toFixed(2)}</p>
                               </div>
                               <div 
                                    onClick={() => setActiveInsight('SAFETY')}
                                    className={`p-2 rounded-lg text-center border cursor-pointer transition-all fund-insight-trigger ${activeInsight === 'SAFETY' ? 'bg-cyan-600 border-cyan-400 text-white shadow-lg' : 'bg-slate-800/50 border-white/5 hover:bg-slate-700/50'}`}
                               >
                                   <p className={`text-[7px] uppercase font-bold ${activeInsight === 'SAFETY' ? 'text-white' : 'text-slate-400'}`}>Safety</p>
                                   <p className={`text-xs font-black ${activeInsight === 'SAFETY' ? 'text-white' : selectedTicker.radarData[3].A > 80 ? 'text-emerald-400' : 'text-slate-300'}`}>{selectedTicker.radarData[3].A.toFixed(2)}</p>
                               </div>
                               <div 
                                    onClick={() => setActiveInsight('F_SCORE')}
                                    className={`p-2 rounded-lg text-center border cursor-pointer transition-all fund-insight-trigger ${activeInsight === 'F_SCORE' ? 'bg-cyan-600 border-cyan-400 text-white shadow-lg' : 'bg-slate-800/50 border-white/5 hover:bg-slate-700/50'}`}
                               >
                                   <p className={`text-[7px] uppercase font-bold ${activeInsight === 'F_SCORE' ? 'text-white' : 'text-slate-400'}`}>F-Score</p>
                                   <p className={`text-xs font-black ${activeInsight === 'F_SCORE' ? 'text-white' : selectedTicker.fScore >= 7 ? 'text-emerald-400' : 'text-slate-300'}`}>{selectedTicker.fScore}</p>
                               </div>
                               <div 
                                    onClick={() => setActiveInsight('RULE_40')}
                                    className={`p-2 rounded-lg text-center border cursor-pointer transition-all fund-insight-trigger ${activeInsight === 'RULE_40' ? 'bg-cyan-600 border-cyan-400 text-white shadow-lg' : 'bg-slate-800/50 border-white/5 hover:bg-slate-700/50'}`}
                               >
                                   <p className={`text-[7px] uppercase font-bold ${activeInsight === 'RULE_40' ? 'text-white' : 'text-slate-400'}`}>Rule of 40</p>
                                   <p className={`text-xs font-black ${activeInsight === 'RULE_40' ? 'text-white' : selectedTicker.ruleOf40 >= 40 ? 'text-emerald-400' : 'text-slate-300'}`}>{selectedTicker.ruleOf40.toFixed(2)}</p>
                               </div>
                               <div 
                                    onClick={() => setActiveInsight('EARNINGS_QUALITY')}
                                    className={`p-2 rounded-lg text-center border cursor-pointer transition-all fund-insight-trigger ${activeInsight === 'EARNINGS_QUALITY' ? 'bg-cyan-600 border-cyan-400 text-white shadow-lg' : 'bg-slate-800/50 border-white/5 hover:bg-slate-700/50'}`}
                               >
                                   <p className={`text-[7px] uppercase font-bold ${activeInsight === 'EARNINGS_QUALITY' ? 'text-white' : 'text-slate-400'}`}>Earn. Qual</p>
                                   <p className={`text-xs font-black ${activeInsight === 'EARNINGS_QUALITY' ? 'text-white' : selectedTicker.earningsQuality >= 1.0 ? 'text-emerald-400' : 'text-slate-300'}`}>{selectedTicker.earningsQuality.toFixed(2)}</p>
                               </div>
                          </div>
                          
                           {/* Insight Overlay */}
                            {activeInsight && FUNDAMENTAL_INSIGHTS[activeInsight] && (
                                <div className="absolute inset-x-4 bottom-4 z-20 animate-in fade-in slide-in-from-bottom-2 fund-insight-overlay">
                                    <div className="bg-slate-900/95 backdrop-blur-xl p-4 rounded-xl border border-cyan-500/30 shadow-2xl relative">
                                        <button onClick={() => setActiveInsight(null)} className="absolute top-2 right-2 text-slate-500 hover:text-white">
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                        </button>
                                        <h5 className="text-[10px] font-black text-cyan-400 uppercase tracking-widest mb-1 flex items-center gap-2">
                                            <span className="w-1.5 h-1.5 rounded-full bg-cyan-500 animate-pulse"></span>
                                            {FUNDAMENTAL_INSIGHTS[activeInsight].title}
                                        </h5>
                                        <div className="text-[9px] text-slate-300 leading-relaxed font-medium mb-2">
                                            <ReactMarkdown remarkPlugins={[remarkGfm]} components={MarkdownComponents}>
                                                {FUNDAMENTAL_INSIGHTS[activeInsight].desc}
                                            </ReactMarkdown>
                                        </div>
                                        <div className="bg-white/5 p-2 rounded border border-white/5">
                                            <p className="text-[8px] text-emerald-400 font-bold mb-0.5">💡 Strategy:</p>
                                            <p className="text-[8px] text-slate-400">{FUNDAMENTAL_INSIGHTS[activeInsight].strategy}</p>
                                        </div>
                                    </div>
                                </div>
                            )}
                       </div>
                   ) : (
                       <div className="h-full flex flex-col items-center justify-center opacity-20">
                           <svg className="w-16 h-16 text-slate-500 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                           <p className="text-[9px] font-black uppercase tracking-[0.3em]">Select Asset to Inspect</p>
                       </div>
                   )}
              </div>
          </div>
        </div>
      </div>

      <div className="xl:col-span-1">
        <div className="glass-panel h-[400px] lg:h-[600px] rounded-[32px] md:rounded-[40px] bg-slate-950 border-l-4 border-l-cyan-600 flex flex-col p-6 shadow-2xl overflow-hidden">
          <div className="flex items-center justify-between mb-8 px-2">
            <h3 className="font-black text-white text-[10px] uppercase tracking-[0.4em] italic">Quant_Log</h3>
          </div>
          <div ref={logRef} className="flex-1 bg-black/70 p-6 rounded-[32px] font-mono text-[9px] text-cyan-300/60 overflow-y-auto no-scrollbar space-y-4 border border-white/5">
            {logs.map((log, i) => (
              <div key={i} className={`pl-4 border-l-2 ${log.includes('[OK]') ? 'border-emerald-500 text-emerald-400' : log.includes('[ERR]') ? 'border-red-500 text-red-400' : 'border-blue-900'}`}>
                {log}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default FundamentalAnalysis;
