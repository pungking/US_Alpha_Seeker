
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

// [KNOWLEDGE BASE] Quant Metric Definitions
const QUANT_INSIGHTS: Record<string, { title: string; desc: string; strategy: string }> = {
    'ROE': {
        title: "ROE (자기자본이익률)",
        desc: "주주가 맡긴 자본을 사용하여 회사가 얼마나 효율적으로 이익을 냈는지 나타냅니다. 기업의 '돈 버는 실력'을 보여주는 가장 핵심적인 지표입니다.",
        strategy: "15% 이상이면 우량, 20% 이상이면 초우량 기업입니다. 지속적으로 상승하는 종목에 주목하십시오."
    },
    'DEBT': {
        title: "Debt/Equity (부채비율)",
        desc: "자기자본 대비 부채의 비율입니다. 수치가 높을수록 금리 인상기나 불황기에 파산 위험이 높아집니다.",
        strategy: "1.0(100%) 미만을 건전한 것으로 봅니다. 2.0을 초과하면 재무 리스크가 큽니다."
    },
    'PROFIT_SCORE': {
        title: "Profitability Score (수익성)",
        desc: "영업이익률, ROE, ROA 등을 종합하여 산출한 기업의 기초 체력 점수입니다.",
        strategy: "70점 이상: 강력한 현금 창출 능력. 하락장에서도 주가 방어력이 높습니다."
    },
    'Z_SCORE': {
        title: "Altman Z-Score (파산위험)",
        desc: "기업의 파산 가능성을 통계적으로 예측하는 모델입니다. (2.99 이상: 안전 / 1.8 미만: 위험)",
        strategy: "1.8 미만인 기업은 기술적 반등이 있어도 '가치 함정(Value Trap)'일 확률이 높으므로 피하십시오."
    },
    'SAFETY_SCORE': {
        title: "Safety Score (재무안정성)",
        desc: "부채비율, 유동비율, 이자보상배율을 종합한 안전마진 점수입니다.",
        strategy: "80점 이상: '망하지 않을 기업'. 장기 투자의 필수 조건입니다."
    },
    'VALUE_SCORE': {
        title: "Value Score (저평가 매력)",
        desc: "PER, PBR 등을 과거 평균 및 섹터와 비교한 가격 매력도입니다.",
        strategy: "높을수록 싸다는 의미이나, Profit Score가 낮은데 Value만 높다면 '싼 게 비지떡'일 수 있습니다."
    }
};

// --- QUANT ENGINE UTILS ---

// 1. Zero/Null Imputation
const imputeValue = (val: any, fallback: number, allowZero: boolean = false): number => {
    if (val === null || val === undefined || val === '') return fallback;
    const num = Number(val);
    if (isNaN(num) || !isFinite(num)) return fallback;
    if (num === 0 && !allowZero) return fallback; 
    return num;
};

// 2. Outlier Control & Scaling
const winsorize = (val: number, min: number, max: number): number => {
    return Math.max(min, Math.min(max, val));
};

// 3. Score Normalizer (0-100)
const clampScore = (val: number): number => Math.min(100, Math.max(0, val));

// [NEW] Data Sanitizer (Unit Correction)
const sanitizeData = (item: any) => {
    let { dividendYield, roe, operatingMargins, pbr, debtToEquity } = item;
    
    // Fix Dividend Yield (e.g. 458 -> 4.58)
    // Rule: Yield > 50% is extremely suspicious for non-distressed assets. Likely raw bps or scaled x100.
    if (dividendYield > 50) {
        dividendYield = dividendYield / 100;
    }
    
    // Fix ROE (e.g. 2500 -> 25.00)
    // Rule: ROE > 200% is rare (unless extremely high leverage).
    if (roe > 200) {
        roe = roe / 100;
    }
    
    // Fix Margins (e.g. 480 -> 48.0)
    if (operatingMargins > 100) {
        operatingMargins = operatingMargins / 100;
    }
    
    // Fix PBR Outliers (e.g. > 1000 is likely data error or near-bankruptcy equity)
    if (pbr > 500) {
        pbr = 0; // Treat as invalid/high-risk
    }

    return { ...item, dividendYield, roe, operatingMargins, pbr, debtToEquity };
};

// [ENGINE v5.0] Robust Valuation & Radar Logic
const performFinancialEngineering = (data: any) => {
    // 1. Extract & Sanitize Metrics
    const price = safeNum(data.price);
    const eps = safeNum(data.eps || data.earningsPerShare);
    const marketCap = safeNum(data.marketCap || data.marketValue);
    const netIncome = safeNum(data.netIncome || data.netIncomeCommonStockholders);
    
    // [FIX] Priority: Use direct debtToEquity if available and valid
    let totalDebtRatio = safeNum(data.debtToEquity);
    // Explicit Zero-Debt Handling
    if (data.debtToEquity === 0 || data.debtToEquity === "0") totalDebtRatio = 0;
    
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
    // If debt is 0, Invested Capital is just Equity.
    const investedCapital = totalEquity + (totalDebtRatio * totalEquity); 
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
    // [LOGIC PATCH] Explicit Zero-Debt Bonus
    if (totalDebtRatio === 0) {
        safetyScore = 100; 
    } else {
        if (isFinancial) {
             safetyScore = normalizeScore(6 - totalDebtRatio, 0, 5);
        } else {
             safetyScore = normalizeScore(2.5 - totalDebtRatio, 0, 2);
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
        qualityScore: safeNum(qualScore), // Ensure qualityScore is available for downstream usage
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
        // [LOGIC PATCH] Radar Data Interpolation (Safe Fallback to 50)
        radarData: [
            { subject: 'Valuation', A: Number(Math.max(5, safeNum(valScore) || 50).toFixed(2)), fullMark: 100 },
            { subject: 'Moat', A: Number(Math.max(5, safeNum(qualScore) || 50).toFixed(2)), fullMark: 100 },
            { subject: 'Growth', A: Number(Math.max(5, safeNum(growthScore) || 50).toFixed(2)), fullMark: 100 },
            { subject: 'Safety', A: Number(Math.max(5, safeNum(safetyScore) || 50).toFixed(2)), fullMark: 100 },
            { subject: 'Quality', A: Number(Math.max(5, safeNum(earningsQualityScore) || 50).toFixed(2)), fullMark: 100 },
        ]
    };
};

const safeNum = (val: any) => {
    if (val === null || val === undefined || val === '') return 0;
    if (typeof val === 'number') return isFinite(val) ? val : 0;
    const n = parseFloat(String(val).replace(/,/g, '').replace(/%/g, ''));
    return Number.isFinite(n) ? n : 0;
};

const toPercent = (val: number) => {
    if (val !== 0 && Math.abs(val) <= 5.0) {
        return Number((val * 100).toFixed(2));
    }
    return Number(val.toFixed(2));
};

const normalizeScore = (val: number, min: number, max: number) => {
    const safeVal = safeNum(val);
    if (safeVal <= min) return 0;
    if (safeVal >= max) return 100;
    return ((safeVal - min) / (max - min)) * 100;
};

const FundamentalAnalysis: React.FC<Props> = ({ autoStart, onComplete, onStockSelected }) => {
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, msg: '' });
  const [processedData, setProcessedData] = useState<FundamentalTicker[]>([]);
  const [selectedTicker, setSelectedTicker] = useState<FundamentalTicker | null>(null);
  const [activeInsight, setActiveInsight] = useState<string | null>(null);
  
  const [logs, setLogs] = useState<string[]>(['> Fundamental_Node v5.0.0: Robust Quant Engine Ready.']);
  const logRef = useRef<HTMLDivElement>(null);
  const startTimeRef = useRef<number>(0);
  
  const accessToken = sessionStorage.getItem('gdrive_access_token');

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
        const target = event.target as HTMLElement;
        if (!target.closest('.insight-trigger') && !target.closest('.insight-overlay')) {
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
        setActiveInsight(null); 
        if (onStockSelected) onStockSelected(ticker);
    }
  };

  const getFormattedTimestamp = () => {
    const now = new Date();
    const kstDate = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    return kstDate.toISOString().replace('T', '_').replace(/:/g, '-').split('.')[0];
  };

  // --- DRIVE UTILS ---
  const findFolder = async (token: string, name: string, parentId = 'root') => {
      const q = encodeURIComponent(`name = '${name}' and mimeType = 'application/vnd.google-apps.folder' and '${parentId}' in parents and trashed = false`);
      const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}`, { headers: { 'Authorization': `Bearer ${token}` } });
      const data = await res.json();
      return data.files && data.files.length > 0 ? data.files[0].id : null;
  };

  const findFileId = async (token: string, name: string, parentId: string) => {
      const q = encodeURIComponent(`name = '${name}' and '${parentId}' in parents and trashed = false`);
      const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}`, { headers: { 'Authorization': `Bearer ${token}` } });
      const data = await res.json();
      return data.files && data.files.length > 0 ? data.files[0].id : null;
  };

  const downloadFile = async (token: string, fileId: string) => {
      const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, { headers: { 'Authorization': `Bearer ${token}` } });
      const text = await res.text();
      const safeText = text.replace(/:\s*NaN/g, ': null').replace(/:\s*Infinity/g, ': null').replace(/:\s*-Infinity/g, ': null');
      return JSON.parse(safeText);
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

      try {
          addLog("Phase 1: Loading Stage 2 Elite Universe...", "info");
          const q = encodeURIComponent(`name contains 'STAGE2_ELITE_UNIVERSE' and trashed = false`);
          const listRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&orderBy=createdTime desc&pageSize=1`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
          });
          const listData = await listRes.json();

          if (!listData.files?.length) throw new Error("Stage 2 Data Missing. Please run Stage 2 first.");

          const stage2Content = await fetch(`https://www.googleapis.com/drive/v3/files/${listData.files[0].id}?alt=media`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
          }).then(r => r.json());

          const candidates = stage2Content.elite_universe || [];
          addLog(`Targets Acquired: ${candidates.length} elite assets.`, "ok");
          setProgress({ current: 0, total: candidates.length, msg: 'Initializing History Vault...' });

          // Map System setup
          let systemMapId = await findFolder(accessToken, GOOGLE_DRIVE_TARGET.systemMapSubFolder, GOOGLE_DRIVE_TARGET.rootFolderId);
          if (!systemMapId) systemMapId = await findFolder(accessToken, GOOGLE_DRIVE_TARGET.systemMapSubFolder, 'root');
          const historyFolderId = systemMapId ? await findFolder(accessToken, GOOGLE_DRIVE_TARGET.financialHistoryFolder, systemMapId) : null;
          
          if (!historyFolderId) addLog("History folder not found. Proceeding with Snapshot data only.", "warn");

          const groupedByLetter: Record<string, any[]> = {};
          candidates.forEach((c: any) => {
              const letter = c.symbol.charAt(0).toUpperCase();
              if (!groupedByLetter[letter]) groupedByLetter[letter] = [];
              groupedByLetter[letter].push(c);
          });

          const results: any[] = [];
          const sortedLetters = Object.keys(groupedByLetter).sort();

          for (const letter of sortedLetters) {
              setProgress(prev => ({ ...prev, msg: `Scanning Cylinder ${letter}...` }));
              
              let historyDataMap = new Map();
              if (historyFolderId) {
                  const histFileName = `${letter}_stocks_history.json`;
                  const histFileId = await findFileId(accessToken, histFileName, historyFolderId);
                  if (histFileId) {
                      const content = await downloadFile(accessToken, histFileId);
                      if (Array.isArray(content)) {
                          content.forEach((d: any) => d.symbol && historyDataMap.set(d.symbol, Array.isArray(d.financials) ? d.financials : []));
                      } else {
                          Object.keys(content).forEach(sym => historyDataMap.set(sym, Array.isArray(content[sym].financials) ? content[sym].financials : []));
                      }
                  }
              }

              const batch = groupedByLetter[letter];
              for (const rawItem of batch) {
                  let fullHistory = historyDataMap.get(rawItem.symbol) || [];
                  if (!Array.isArray(fullHistory)) fullHistory = [];

                  // [V5.6.1] Apply Data Sanitizer First
                  const item = sanitizeData(rawItem);

                  // Run Analysis
                  const analysis = performFinancialEngineering(item);
                  
                  const qualityScore = safeNum(analysis.qualityScore);
                  const fundamentalScore = analysis.fundamentalScore;
                  
                  // Score Filter
                  if (fundamentalScore < 30 && qualityScore < 30) {
                      // Low score assets dropped silently or log if needed
                      continue;
                  }

                  const compositeAlpha = (qualityScore * 0.3) + (fundamentalScore * 0.7);

                  results.push({
                      ...item, 
                      ...analysis,
                      qualityScore,
                      fundamentalScore,
                      compositeAlpha: safeNum(compositeAlpha),
                      fullHistory: fullHistory.slice(0, 4),
                      lastUpdate: new Date().toISOString(),
                      isDerived: true
                  });
              }
              setProgress(prev => ({ ...prev, current: results.length }));
              await new Promise(r => setTimeout(r, 0));
          }

          results.sort((a, b) => b.compositeAlpha - a.compositeAlpha);
          const eliteCandidates = results.slice(0, 300);
          setProcessedData(eliteCandidates);
          if (eliteCandidates.length > 0) handleTickerSelect(eliteCandidates[0]);

          addLog(`Deep Scan Complete. ${eliteCandidates.length} Fundamental Leaders Selected.`, "ok");
          
          const saveFolderId = await ensureFolder(accessToken, GOOGLE_DRIVE_TARGET.stage3SubFolder);
          
          const now = new Date();
          const kstDate = new Date(now.getTime() + 9 * 60 * 60 * 1000);
          const timestamp = kstDate.toISOString().replace('T', '_').replace(/:/g, '-').split('.')[0];
          const resultFileName = `STAGE3_FUNDAMENTAL_FULL_${timestamp}.json`;

          const payload = {
              manifest: { 
                  version: "5.0.0", 
                  count: eliteCandidates.length, 
                  timestamp: new Date().toISOString(),
                  engine: "3-Factor_Quant_Model_Robust" 
              },
              fundamental_universe: eliteCandidates
          };

          await uploadFile(accessToken, saveFolderId, resultFileName, payload);
          addLog(`Vault Saved: ${resultFileName}`, "ok");
          
          if (onComplete) onComplete();

      } catch (e: any) {
          addLog(`Engine Failure: ${e.message}`, "err");
      } finally {
          setLoading(false);
          setProgress({ current: 0, total: 0, msg: '' });
      }
  };

  const getSectorStyle = (sector: string) => {
    const s = (sector || '').toLowerCase();
    if (s.includes('tech') || s.includes('software')) return 'bg-violet-500/20 text-violet-400 border-violet-500/30';
    if (s.includes('finance')) return 'bg-fuchsia-500/20 text-fuchsia-400 border-fuchsia-500/30';
    if (s.includes('health')) return 'bg-rose-500/20 text-rose-400 border-rose-500/30';
    return 'bg-slate-500/20 text-slate-400 border-slate-500/30';
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
      <div className="xl:col-span-3 space-y-6">
        {/* Main Panel - Violet Theme */}
        <div className="glass-panel p-5 md:p-8 lg:p-10 rounded-[32px] md:rounded-[40px] border-t-2 border-t-violet-500 shadow-2xl bg-slate-900/40 relative overflow-hidden">
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-6 md:mb-10 gap-6">
            <div className="flex items-center space-x-6">
              <div className={`w-12 h-12 rounded-3xl bg-violet-600/10 flex items-center justify-center border border-violet-500/20 ${loading ? 'animate-pulse' : ''}`}>
                 <svg className={`w-5 h-5 text-violet-400 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
              </div>
              <div>
                <h2 className="text-xl md:text-3xl font-black text-white italic tracking-tighter uppercase leading-none">Fundamental_Node v5.0.0</h2>
                <div className="flex flex-col mt-2 gap-1">
                    {/* Restored Original Glass Style Badge */}
                    <span className={`text-[8px] font-black px-2 py-0.5 rounded border uppercase tracking-widest transition-all ${
                        loading 
                        ? 'bg-violet-500/20 text-violet-300 border-violet-500/40 animate-pulse' 
                        : 'bg-violet-500/10 text-violet-400 border-violet-500/20'
                    }`}>
                        {loading ? `Scanning: ${progress.msg}` : 'Quant Sanitizer Active'}
                    </span>
                    {autoStart && <span className="text-[8px] px-2 py-0.5 bg-rose-600 text-white rounded font-black uppercase animate-pulse w-fit">AUTO PILOT</span>}
                </div>
              </div>
            </div>
            
            <button 
              onClick={executeFundamentalEngine} 
              disabled={loading} 
              className={`w-full lg:w-auto px-8 md:px-12 py-4 md:py-5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${
                  loading 
                    ? 'bg-slate-800 text-slate-500 shadow-none border border-white/5 cursor-wait opacity-80' 
                    : 'bg-violet-600 text-white shadow-xl shadow-violet-900/30 hover:scale-105 active:scale-95 hover:bg-violet-500'
              }`}
            >
              {loading ? 'Executing Quant Scan...' : 'Start Global Fundamental Audit'}
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-8 mb-6 md:mb-10">
              {/* List View */}
              <div className="bg-black/40 rounded-3xl border border-white/5 overflow-hidden flex flex-col h-[400px]">
                  <div className="p-4 border-b border-white/5 bg-white/5 flex justify-between items-center">
                      <p className="text-[9px] font-black text-violet-400 uppercase tracking-widest">Quality Rank ({processedData.length})</p>
                      <span className="text-[8px] font-mono text-slate-500">Sorted by Quality Score</span>
                  </div>
                  <div className="flex-1 overflow-y-auto no-scrollbar p-2 space-y-2">
                      {processedData.length > 0 ? processedData.map((t, i) => (
                          <div key={i} onClick={() => handleTickerSelect(t)} className={`p-3 rounded-xl border flex justify-between items-center cursor-pointer transition-all ${selectedTicker?.symbol === t.symbol ? 'bg-violet-900/30 border-violet-500/50' : 'bg-white/5 border-transparent hover:bg-white/10'}`}>
                              <div className="flex items-center gap-3">
                                  <span className={`text-[10px] font-black w-4 ${i < 10 ? 'text-violet-400' : 'text-slate-500'}`}>{i + 1}</span>
                                  <div>
                                      <p className="text-xs font-black text-white">{t.symbol}</p>
                                      <p className="text-[8px] text-slate-400 truncate w-24">{t.name}</p>
                                  </div>
                              </div>
                              <div className="text-right">
                                  <p className="text-[10px] font-mono font-bold text-white">{t.qualityScore.toFixed(1)}</p>
                                  <div className="flex gap-1 justify-end mt-0.5">
                                      <span className={`w-1 h-1 rounded-full ${t.profitScore > 70 ? 'bg-emerald-500' : 'bg-slate-700'}`}></span>
                                      <span className={`w-1 h-1 rounded-full ${t.safeScore > 70 ? 'bg-blue-500' : 'bg-slate-700'}`}></span>
                                      <span className={`w-1 h-1 rounded-full ${t.valueScore > 70 ? 'bg-amber-500' : 'bg-slate-700'}`}></span>
                                  </div>
                              </div>
                          </div>
                      )) : (
                          <div className="h-full flex items-center justify-center opacity-30 text-[9px] uppercase tracking-widest text-slate-400 italic">
                              Waiting for Quant Data...
                          </div>
                      )}
                  </div>
              </div>

              {/* Detail View */}
              <div className="bg-black/40 rounded-3xl border border-white/5 p-6 relative flex flex-col h-[400px]">
                   {selectedTicker ? (
                       <div className="h-full flex flex-col justify-between" key={selectedTicker.symbol}> 
                          <div className="flex justify-between items-start">
                              <div>
                                  <div className="flex items-baseline gap-3">
                                      <h3 className="text-3xl font-black text-white italic tracking-tighter uppercase">{selectedTicker.symbol}</h3>
                                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest truncate max-w-[150px]">{selectedTicker.name}</span>
                                  </div>
                                  <div className="flex items-center gap-2 mt-2">
                                       {/* Interactive Badges */}
                                       <span 
                                            onClick={() => setActiveInsight('ROE')}
                                            className="text-[8px] font-black bg-blue-900/30 text-blue-400 px-2 py-0.5 rounded border border-blue-500/20 uppercase cursor-help hover:bg-blue-900/50 transition-colors insight-trigger"
                                       >
                                           ROE {selectedTicker.roe.toFixed(2)}%
                                       </span>
                                       <span 
                                            onClick={() => setActiveInsight('DEBT')}
                                            className={`text-[8px] font-black px-2 py-0.5 rounded border border-emerald-500/20 uppercase cursor-help hover:opacity-80 transition-opacity insight-trigger ${selectedTicker.debtToEquity < 0 ? 'bg-rose-900/30 text-rose-400' : 'bg-emerald-900/30 text-emerald-400'}`}
                                       >
                                           Debt {selectedTicker.debtToEquity.toFixed(2)}
                                       </span>
                                  </div>
                              </div>
                              <div className="text-right">
                                   <p className="text-[8px] text-slate-500 uppercase font-bold mb-1">Quality</p>
                                   <p className="text-2xl font-black text-violet-400 tracking-tighter">{selectedTicker.qualityScore.toFixed(1)}</p>
                              </div>
                          </div>

                          <div className="flex-1 w-full relative -ml-4 my-2">
                              <ResponsiveContainer width="100%" height="100%">
                                  <RadarChart cx="50%" cy="50%" outerRadius="70%" data={selectedTicker.radarData}>
                                      <PolarGrid stroke="#334155" opacity={0.3} />
                                      {/* Interactive Radar Axis Labels */}
                                      <PolarAngleAxis 
                                        dataKey="subject" 
                                        tick={{ fill: '#94a3b8', fontSize: 9, fontWeight: 'bold', cursor: 'pointer' }}
                                        onClick={({ payload }) => {
                                            if (payload.value === 'Profit') setActiveInsight('PROFIT_SCORE');
                                            if (payload.value === 'Safety') setActiveInsight('SAFETY_SCORE');
                                            if (payload.value === 'Value') setActiveInsight('VALUE_SCORE');
                                        }}
                                      />
                                      <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                                      <Radar name={selectedTicker.symbol} dataKey="A" stroke="#8b5cf6" strokeWidth={2} fill="#8b5cf6" fillOpacity={0.4} />
                                      <RechartsTooltip contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px' }} itemStyle={{ color: '#8b5cf6', fontSize: '10px' }} />
                                  </RadarChart>
                              </ResponsiveContainer>
                          </div>
                          
                          {/* Interactive Score Cards */}
                          <div className="grid grid-cols-3 gap-2 mt-2">
                               <div 
                                    onClick={() => setActiveInsight('PROFIT_SCORE')}
                                    className="bg-slate-800/50 p-2 rounded-lg text-center border border-white/5 hover:bg-slate-700/50 cursor-help transition-all insight-trigger"
                               >
                                   <p className="text-[7px] text-slate-400 uppercase font-bold">Profit</p>
                                   <p className={`text-xs font-black ${selectedTicker.profitScore > 70 ? 'text-emerald-400' : 'text-slate-300'}`}>{selectedTicker.profitScore}</p>
                               </div>
                               <div 
                                    onClick={() => setActiveInsight('Z_SCORE')}
                                    className="bg-slate-800/50 p-2 rounded-lg text-center border border-white/5 hover:bg-slate-700/50 cursor-help transition-all insight-trigger"
                               >
                                   <p className="text-[7px] text-slate-400 uppercase font-bold">Z-Score</p>
                                   <p className={`text-xs font-black ${selectedTicker.zScoreProxy > 2.9 ? 'text-emerald-400' : selectedTicker.zScoreProxy < 1.8 ? 'text-rose-400' : 'text-amber-400'}`}>{selectedTicker.zScoreProxy}</p>
                               </div>
                               <div 
                                    onClick={() => setActiveInsight('SAFETY_SCORE')}
                                    className="bg-slate-800/50 p-2 rounded-lg text-center border border-white/5 hover:bg-slate-700/50 cursor-help transition-all insight-trigger"
                               >
                                   <p className="text-[7px] text-slate-400 uppercase font-bold">Safety</p>
                                   <p className={`text-xs font-black ${selectedTicker.safeScore > 70 ? 'text-emerald-400' : 'text-slate-300'}`}>{selectedTicker.safeScore}</p>
                               </div>
                          </div>
                          
                           {/* Insight Overlay */}\
                            {activeInsight && QUANT_INSIGHTS[activeInsight] && (
                                <div className="absolute inset-x-4 bottom-4 z-20 animate-in fade-in slide-in-from-bottom-2 insight-overlay">
                                    <div className="bg-slate-900/95 backdrop-blur-xl p-4 rounded-xl border border-violet-500/30 shadow-2xl relative">
                                        <button onClick={() => setActiveInsight(null)} className="absolute top-2 right-2 text-slate-500 hover:text-white">
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                        </button>
                                        <h5 className="text-[10px] font-black text-violet-400 uppercase tracking-widest mb-1 flex items-center gap-2">
                                            <span className="w-1.5 h-1.5 rounded-full bg-violet-500 animate-pulse"></span>
                                            {QUANT_INSIGHTS[activeInsight].title}
                                        </h5>
                                        <p className="text-[9px] text-slate-300 leading-relaxed font-medium mb-2">{QUANT_INSIGHTS[activeInsight].desc}</p>
                                        <div className="bg-white/5 p-2 rounded border border-white/5">
                                            <p className="text-[8px] text-emerald-400 font-bold mb-0.5">💡 Strategy:</p>
                                            <p className="text-[8px] text-slate-400">{QUANT_INSIGHTS[activeInsight].strategy}</p>
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
        <div className="glass-panel h-[400px] lg:h-[600px] rounded-[32px] md:rounded-[40px] bg-slate-950 border-l-4 border-l-violet-600 flex flex-col p-6 shadow-2xl overflow-hidden">
          <div className="flex items-center justify-between mb-8 px-2">
            <h3 className="font-black text-white text-[10px] uppercase tracking-[0.4em] italic">Quant_Log</h3>
          </div>
          <div ref={logRef} className="flex-1 bg-black/70 p-6 rounded-[32px] font-mono text-[9px] text-violet-300/60 overflow-y-auto no-scrollbar space-y-4 border border-white/5">
            {logs.map((log, i) => (
              <div key={i} className={`pl-4 border-l-2 ${log.includes('[OK]') ? 'border-emerald-500 text-emerald-400' : log.includes('[ERR]') ? 'border-red-500 text-red-400' : 'border-violet-900'}`}>
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
