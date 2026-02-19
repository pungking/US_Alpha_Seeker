
import React, { useState, useEffect, useRef } from 'react';
import { ResponsiveContainer, Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Tooltip as RechartsTooltip } from 'recharts';
import { GOOGLE_DRIVE_TARGET, API_CONFIGS } from '../constants';
import { ApiProvider } from '../types';

interface Props {
  autoStart?: boolean;
  onComplete?: () => void;
  onStockSelected?: (stock: any) => void;
  isVisible?: boolean; // [NEW] Added prop
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

// ... (Utils remain same) ...
// --- QUANT ENGINE UTILS ---

const safeNum = (val: any) => {
    const n = Number(val);
    return isNaN(n) || !isFinite(n) ? 0 : n;
};

const normalizeScore = (val: number, min: number, max: number) => {
    if (val <= min) return 0;
    if (val >= max) return 100;
    return ((val - min) / (max - min)) * 100;
};

const sanitizeData = (item: any) => {
    let { dividendYield, roe, operatingMargins, pbr, debtToEquity } = item;
    // Basic data sanity checks
    if (dividendYield > 50) dividendYield = dividendYield / 100;
    if (roe > 200) roe = roe / 100;
    if (operatingMargins > 100) operatingMargins = operatingMargins / 100;
    if (pbr > 500) pbr = 0; 
    return { ...item, dividendYield, roe, operatingMargins, pbr, debtToEquity };
};

const computeUniverseBaselines = (universe: any[]) => {
    const sectorMap: Record<string, { roe: number[], pe: number[], debt: number[], pbr: number[], growth: number[] }> = {};
    
    universe.forEach(u => {
        const s = u.sector || 'Unknown';
        if (!sectorMap[s]) sectorMap[s] = { roe: [], pe: [], debt: [], pbr: [], growth: [] };
        
        const pushValid = (arr: number[], val: any) => {
            const v = Number(val);
            if (!isNaN(v) && v !== 0) arr.push(v);
        };

        pushValid(sectorMap[s].roe, u.roe);
        pushValid(sectorMap[s].pe, u.pe || u.per);
        pushValid(sectorMap[s].debt, u.debtToEquity);
        pushValid(sectorMap[s].pbr, u.pbr);
        pushValid(sectorMap[s].growth, u.revenueGrowth);
    });

    const baselines: Record<string, any> = {};
    const median = (arr: number[]) => {
        if (!arr.length) return 0;
        const sorted = [...arr].sort((a,b) => a-b);
        return sorted[Math.floor(sorted.length/2)];
    };

    Object.keys(sectorMap).forEach(s => {
        baselines[s] = {
            roe: median(sectorMap[s].roe) || 10,
            pe: median(sectorMap[s].pe) || 20,
            debtToEquity: median(sectorMap[s].debt) || 1.0,
            pbr: median(sectorMap[s].pbr) || 3.0,
            revenueGrowth: median(sectorMap[s].growth) || 5
        };
    });

    baselines['GLOBAL'] = { roe: 12, pe: 20, debtToEquity: 1.0, pbr: 2.5, revenueGrowth: 8 };
    return baselines;
};

// [ENGINE v5.3] Pure Quant Logic (No AI)
const performFinancialEngineering = (data: any) => {
    // ... (Existing logic remains exactly same) ...
    const price = safeNum(data.price);
    const eps = safeNum(data.eps || data.earningsPerShare);
    const marketCap = safeNum(data.marketCap || data.marketValue);
    const netIncome = safeNum(data.netIncome || data.netIncomeCommonStockholders);
    
    let totalDebtRatio = safeNum(data.debtToEquity);
    if (data.debtToEquity === 0 || data.debtToEquity === "0") totalDebtRatio = 0;
    
    const totalEquity = safeNum(data.totalEquity || data.totalStockholdersEquity);
    const pe = safeNum(data.pe || data.per);
    const pbr = safeNum(data.pbr || data.priceToBook);
    
    let sales = safeNum(data.revenue || data.totalRevenue);
    if (sales === 0 && marketCap > 0 && safeNum(data.psr) > 0) {
        sales = marketCap / safeNum(data.psr); 
    }
    
    const isFinancial = (data.sector || '').toLowerCase().includes('financial') || (data.industry || '').toLowerCase().includes('bank');
    
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

    const revenueGrowth = safeNum(data.revenueGrowth || 5); 
    const profitMargin = sales > 0 ? (netIncome / sales) * 100 : 5;
    const rawGrossMargin = safeNum(data.grossMargin || data.grossProfitMargin || (sales > 0 ? (data.grossProfit / sales) : 0));
    const grossMargin = rawGrossMargin > 1 ? rawGrossMargin : rawGrossMargin * 100;
    
    let divYield = safeNum(data.dividendYield);
    if (divYield > 100) divYield = divYield / 100;

    const roe = safeNum(data.roe || data.returnOnEquity || 0);

    // [INTRINSIC VALUE V2]
    let intrinsicValue = 0;
    const g = Math.min(revenueGrowth, 15); 
    
    if (eps > 0) {
        const multiplier = isFinancial ? 1.0 : 1.5; 
        intrinsicValue = eps * (8.5 + multiplier * g); 
    } else {
        const bookValue = safeNum(data.bookValuePerShare) || (price / (pbr || 1));
        const roeFactor = Math.max(0.5, Math.min(3.0, roe / 8));
        intrinsicValue = bookValue * roeFactor;
    }

    if (intrinsicValue > price * 3) intrinsicValue = price * 3;
    if (intrinsicValue <= 0) intrinsicValue = price * 0.8; 

    const fairValueGap = price > 0 ? ((intrinsicValue - price) / price) * 100 : 0;
    
    const investedCapital = totalEquity + (totalDebtRatio * totalEquity); 
    let roic = 0;
    if (investedCapital > 0) {
        roic = (netIncome / investedCapital) * 100;
    } else {
        roic = roe * 0.7; 
    }
    
    const cfMargin = sales > 0 ? (opCashflow / sales) * 100 : profitMargin;
    const ruleOf40 = revenueGrowth + cfMargin;
    
    // [SCORES]
    let fScore = 4; // Baseline
    if (netIncome > 0) fScore++;
    if (opCashflow > 0) fScore++;
    if (opCashflow > netIncome) fScore++;
    if (roic > 5) fScore++;
    if (grossMargin > 20) fScore++;
    if (divYield > 0) fScore++;
    
    // Default Z-Score (Mathematical Proxy)
    const zScore = safeNum(data.zScoreProxy) || ((totalDebtRatio < 0.5 && roe > 0) ? 3.0 : 1.5);

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
    if (totalDebtRatio <= 0.1) {
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

    // [STAGE 3 WEIGHTS] Focus on Value (40%) and Safety (30%)
    const fundamentalScore = (valScore * 0.40) + (safetyScore * 0.30) + (qualScore * 0.20) + (growthScore * 0.10);

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
        qualityScore: safeNum(qualScore), 
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
        radarData: [
            { subject: 'Valuation', A: Number(Math.max(5, safeNum(valScore) || 50).toFixed(2)), fullMark: 100 },
            { subject: 'Moat', A: Number(Math.max(5, safeNum(qualScore) || 50).toFixed(2)), fullMark: 100 },
            { subject: 'Growth', A: Number(Math.max(5, safeNum(growthScore) || 50).toFixed(2)), fullMark: 100 },
            { subject: 'Safety', A: Number(Math.max(5, safeNum(safetyScore) || 50).toFixed(2)), fullMark: 100 },
            { subject: 'Quality', A: Number(Math.max(5, safeNum(earningsQualityScore) || 50).toFixed(2)), fullMark: 100 },
        ],
        profitScore: Math.round(qualScore),
        safeScore: Math.round(safetyScore),
        valueScore: Math.round(valScore)
    };
};

const FundamentalAnalysis: React.FC<Props> = ({ autoStart, onComplete, onStockSelected, isVisible = true }) => {
    const [loading, setLoading] = useState(false);
    const [progress, setProgress] = useState({ current: 0, total: 0, msg: '' });
    const [processedData, setProcessedData] = useState<any[]>([]);
    const [selectedTicker, setSelectedTicker] = useState<any | null>(null);
    const [activeInsight, setActiveInsight] = useState<string | null>(null);
    const [logs, setLogs] = useState<string[]>(['> Fundamental_Node v5.8.0: Pure Quant Mode Active.']);
    
    const logRef = useRef<HTMLDivElement>(null);
    const accessToken = sessionStorage.getItem('gdrive_access_token');

    // ... (UseEffects remain same) ...
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

    const addLog = (m: string, t: 'info' | 'ok' | 'err' | 'warn' | 'signal' = 'info') => {
        const p = { info: '>', ok: '[OK]', err: '[ERR]', warn: '[WARN]', signal: '[AUTO]' };
        setLogs(prev => [...prev, `${p[t]} ${m}`].slice(-40));
    };

    const handleTickerSelect = (ticker: any) => {
        setSelectedTicker(ticker);
        setActiveInsight(null);
        if (onStockSelected) onStockSelected(ticker);
    };

    // ... (Drive functions remain same) ...
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

    const ensureFolder = async (token: string, name: string) => {
      const q = encodeURIComponent(`name = '${name}' and '${GOOGLE_DRIVE_TARGET.rootFolderId}' in parents and trashed = false`);
      const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}`, { headers: { 'Authorization': `Bearer ${token}` } });
      const data = await res.json();
      if (data.files?.length > 0) return data.files[0].id;
      const create = await fetch(`https://www.googleapis.com/drive/v3/files`, {
          method: 'POST', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, parents: [GOOGLE_DRIVE_TARGET.rootFolderId], mimeType: 'application/vnd.google-apps.folder' })
      });
      const json = await create.json();
      return json.id;
    };

    const uploadFile = async (token: string, folderId: string, name: string, content: any) => {
      const meta = { name, parents: [folderId], mimeType: 'application/json' };
      const form = new FormData();
      form.append('metadata', new Blob([JSON.stringify(meta)], { type: 'application/json' }));
      form.append('file', new Blob([JSON.stringify(content, null, 2)], { type: 'application/json' }));
      await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', { method: 'POST', headers: { 'Authorization': `Bearer ${token}` }, body: form });
    };

    const executeDeepAudit = async () => {
        // ... (Execute logic remains same) ...
        if (!accessToken || loading) return;
        setLoading(true);
        setProcessedData([]);

        try {
            addLog("Phase 2: Loading Stage 2 Elite Universe...", "info");
            const q = encodeURIComponent(`name contains 'STAGE2_ELITE_UNIVERSE' and trashed = false`);
            const listRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&orderBy=createdTime desc&pageSize=1`, {
                headers: { 'Authorization': `Bearer ${accessToken}` }
            });
            const listData = await listRes.json();

            if (!listData.files?.length) throw new Error("Stage 2 Data Missing. Please run Stage 2.");

            const stage2Content = await fetch(`https://www.googleapis.com/drive/v3/files/${listData.files[0].id}?alt=media`, {
                headers: { 'Authorization': `Bearer ${accessToken}` }
            }).then(r => r.json());

            const candidates = stage2Content.elite_universe || [];
            addLog(`Targets Acquired: ${candidates.length} elite assets.`, "ok");
            setProgress({ current: 0, total: candidates.length, msg: 'Initializing History Vault...' });

            const universeBaselines = computeUniverseBaselines(candidates);

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

                    let itemToAnalyze = { ...rawItem };
                    let isImputed = false;
                    
                    const sector = itemToAnalyze.sector || 'Unknown';
                    const baseline = universeBaselines[sector] || universeBaselines['GLOBAL'];

                    // Smart Imputation for missing values
                    if (!itemToAnalyze.roe && itemToAnalyze.roe !== 0) { 
                        itemToAnalyze.roe = baseline.roe; 
                        isImputed = true; 
                    }
                    if (itemToAnalyze.debtToEquity === undefined || itemToAnalyze.debtToEquity === null) {
                         itemToAnalyze.debtToEquity = baseline.debtToEquity;
                         isImputed = true;
                    }
                    if (!itemToAnalyze.pe && !itemToAnalyze.per) {
                         itemToAnalyze.pe = baseline.pe;
                         isImputed = true;
                    }
                    if (!itemToAnalyze.pbr) {
                         itemToAnalyze.pbr = baseline.pbr;
                         isImputed = true;
                    }
                    if (!itemToAnalyze.revenueGrowth) {
                         itemToAnalyze.revenueGrowth = baseline.revenueGrowth;
                         isImputed = true;
                    }

                    const item = sanitizeData(itemToAnalyze);
                    const analysis = performFinancialEngineering(item);
                    
                    const qualityScore = safeNum(analysis.qualityScore);
                    
                    if (isImputed) {
                        analysis.dataConfidence = Math.min(analysis.dataConfidence, 60);
                    }

                    const compositeAlpha = (qualityScore * 0.3) + (analysis.fundamentalScore * 0.7);

                    results.push({
                        ...item, 
                        ...analysis,
                        qualityScore,
                        fundamentalScore: safeNum(analysis.fundamentalScore),
                        compositeAlpha: safeNum(compositeAlpha),
                        fullHistory: fullHistory.slice(0, 4),
                        lastUpdate: new Date().toISOString(),
                        isDerived: true,
                        isImputed: isImputed,
                        auditSource: 'ALGO'
                    });
                }
                setProgress(prev => ({ ...prev, current: results.length }));
                await new Promise(r => setTimeout(r, 0));
            }

            results.sort((a, b) => b.compositeAlpha - a.compositeAlpha);
            const eliteCandidates = results; 
            
            setProcessedData(eliteCandidates);
            if (eliteCandidates.length > 0) handleTickerSelect(eliteCandidates[0]);
            
            addLog(`Deep Scan Complete. ${eliteCandidates.length} Assets Preserved.`, "ok");
            
            const saveFolderId = await ensureFolder(accessToken, GOOGLE_DRIVE_TARGET.stage3SubFolder);
            const now = new Date();
            const kstDate = new Date(now.getTime() + 9 * 60 * 60 * 1000);
            const timestamp = kstDate.toISOString().replace('T', '_').replace(/:/g, '-').split('.')[0];
            const fileName = `STAGE3_FUNDAMENTAL_FULL_${timestamp}.json`;

            const payload = {
                manifest: { version: "5.8.0", count: eliteCandidates.length, timestamp: new Date().toISOString(), engine: "Pure_Quant_Algorithm" },
                fundamental_universe: eliteCandidates
            };

            await uploadFile(accessToken, saveFolderId, fileName, payload);
            addLog(`Vault Saved: ${fileName}`, "ok");

            if (onComplete) onComplete();

        } catch (e: any) {
            addLog(`Audit Error: ${e.message}`, "err");
        } finally {
            setLoading(false);
            setProgress({ current: 0, total: 0, msg: '' });
        }
    };

    useEffect(() => {
        if (autoStart && !loading) {
            addLog("AUTO-PILOT: Engaging Advanced Fundamental Audit...", "signal");
            executeDeepAudit();
        }
    }, [autoStart]);

    return (
        <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
            <div className="xl:col-span-3 space-y-6">
                <div className="glass-panel p-5 md:p-8 lg:p-10 rounded-[32px] md:rounded-[40px] border-t-2 border-t-cyan-500 shadow-2xl bg-slate-900/40 relative overflow-hidden">
                     <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-6 md:mb-10 gap-6">
                         <div className="flex items-center space-x-6">
                             <div className={`w-12 h-12 md:w-14 md:h-14 rounded-3xl bg-cyan-600/10 flex items-center justify-center border border-cyan-500/20 ${loading ? 'animate-pulse' : ''}`}>
                                <svg className={`w-5 h-5 md:w-6 md:h-6 text-cyan-400 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>
                             </div>
                             <div>
                                <h2 className="text-xl md:text-3xl font-black text-white italic tracking-tighter uppercase leading-none">Audit_Nexus v4.1.0</h2>
                                <div className="flex flex-col mt-2 gap-1">
                                    <span className={`text-[8px] font-black px-2 py-0.5 rounded border uppercase tracking-widest transition-all ${loading ? 'border-cyan-400 text-cyan-400 animate-pulse' : 'border-cyan-500/20 bg-cyan-500/10 text-cyan-400'}`}>
                                        {loading ? `Auditing: ${progress.msg}` : 'Resilient Deep-Audit Active'}
                                    </span>
                                    {autoStart && <span className="text-[8px] px-2 py-0.5 bg-rose-600 text-white rounded font-black uppercase animate-pulse w-fit">AUTO PILOT</span>}
                                </div>
                             </div>
                         </div>
                         <button 
                            onClick={executeDeepAudit} 
                            disabled={loading}
                            className={`w-full lg:w-auto px-8 md:px-12 py-4 md:py-5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${loading ? 'bg-slate-800 text-slate-500 cursor-wait' : 'bg-cyan-600 text-white shadow-xl shadow-cyan-900/20 hover:scale-105 active:scale-95'}`}
                        >
                            {loading ? 'Performing Multi-Model Audit...' : 'Start Global Fundamental Audit'}
                        </button>
                     </div>

                     <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-8 mb-6 md:mb-10">
                         {/* List View */}
                         <div className="bg-black/40 rounded-3xl border border-white/5 overflow-hidden flex flex-col h-[400px]">
                            <div className="p-4 border-b border-white/5 bg-white/5 flex justify-between items-center">
                                <p className="text-[9px] font-black text-cyan-400 uppercase tracking-widest">Audit Rank ({processedData.length})</p>
                                <span className="text-[8px] font-mono text-slate-500">Sorted by Fundamental Score</span>
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
                                            <p className="text-[10px] font-mono font-bold text-white">{t.fundamentalScore.toFixed(1)}</p>
                                            <div className="flex gap-1 justify-end mt-0.5">
                                                <span className={`w-1 h-1 rounded-full ${t.fScore > 6 ? 'bg-emerald-500' : 'bg-slate-700'}`}></span>
                                                <span className={`w-1 h-1 rounded-full ${t.zScore > 2.9 ? 'bg-blue-500' : 'bg-slate-700'}`}></span>
                                                {t.isImputed && <span className="text-[7px] text-amber-500 font-bold ml-1">IMP</span>}
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

                         {/* Detail View */}
                         <div className="bg-black/40 rounded-3xl border border-white/5 p-6 relative flex flex-col h-[400px]">
                            {selectedTicker ? (
                                <div className="h-full flex flex-col justify-between" key={selectedTicker.symbol}> 
                                   {/* ... (Header) ... */}
                                   <div className="flex justify-between items-start">
                                       <div>
                                           <div className="flex items-baseline gap-3">
                                               <h3 className="text-3xl font-black text-white italic tracking-tighter uppercase">{selectedTicker.symbol}</h3>
                                               <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest truncate max-w-[150px]">{selectedTicker.name}</span>
                                           </div>
                                           <div className="flex items-center gap-2 mt-2">
                                                <span 
                                                     onClick={() => setActiveInsight('PROFIT_SCORE')}
                                                     className="text-[8px] font-black bg-cyan-900/30 text-cyan-400 px-2 py-0.5 rounded border border-cyan-500/20 uppercase cursor-help hover:bg-cyan-900/50 transition-colors insight-trigger"
                                                >
                                                    P.Score {selectedTicker.profitScore}
                                                </span>
                                                <span 
                                                     onClick={() => setActiveInsight('Z_SCORE')}
                                                     className={`text-[8px] font-black px-2 py-0.5 rounded border border-cyan-500/20 uppercase cursor-help hover:opacity-80 transition-opacity insight-trigger ${selectedTicker.zScore < 1.8 ? 'bg-rose-900/30 text-rose-400' : 'bg-emerald-900/30 text-emerald-400'}`}
                                                >
                                                    Z-Score {selectedTicker.zScore}
                                                </span>
                                                {selectedTicker.isImputed && <span className="text-[8px] font-black text-amber-500 border border-amber-500/30 px-2 py-0.5 rounded uppercase">IMPUTED</span>}
                                           </div>
                                       </div>
                                       <div className="text-right">
                                            <p className="text-[8px] text-slate-500 uppercase font-bold mb-1">Fundamental</p>
                                            <p className="text-2xl font-black text-cyan-400 tracking-tighter">{selectedTicker.fundamentalScore.toFixed(1)}</p>
                                       </div>
                                   </div>

                                   <div className="flex-1 w-full relative -ml-4 my-2">
                                       {/* [FIX] Use isVisible to prevent 0-size error */}
                                       {isVisible && (
                                           <ResponsiveContainer width="100%" height="100%">
                                               <RadarChart cx="50%" cy="50%" outerRadius="70%" data={selectedTicker.radarData}>
                                                   <PolarGrid stroke="#334155" opacity={0.3} />
                                                   <PolarAngleAxis 
                                                       dataKey="subject" 
                                                       tick={{ fill: '#94a3b8', fontSize: 9, fontWeight: 'bold' }} 
                                                   />
                                                   <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                                                   <Radar name={selectedTicker.symbol} dataKey="A" stroke="#06b6d4" strokeWidth={2} fill="#06b6d4" fillOpacity={0.4} />
                                                   <RechartsTooltip contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px' }} itemStyle={{ color: '#06b6d4', fontSize: '10px' }} />
                                               </RadarChart>
                                           </ResponsiveContainer>
                                       )}
                                   </div>
                                   
                                   {/* Metric Cards */}
                                   <div className="grid grid-cols-3 gap-2 mt-2">
                                        <div 
                                             onClick={() => setActiveInsight('ROE')}
                                             className="bg-slate-800/50 p-2 rounded-lg text-center border border-white/5 hover:bg-slate-700/50 cursor-help transition-all insight-trigger"
                                        >
                                            <p className="text-[7px] text-slate-400 uppercase font-bold">ROE</p>
                                            <p className={`text-xs font-black ${selectedTicker.roe > 15 ? 'text-emerald-400' : 'text-slate-300'}`}>{selectedTicker.roe}%</p>
                                        </div>
                                        <div 
                                             onClick={() => setActiveInsight('DEBT')}
                                             className="bg-slate-800/50 p-2 rounded-lg text-center border border-white/5 hover:bg-slate-700/50 cursor-help transition-all insight-trigger"
                                        >
                                            <p className="text-[7px] text-slate-400 uppercase font-bold">Debt</p>
                                            <p className={`text-xs font-black ${selectedTicker.debtToEquity < 1.0 ? 'text-emerald-400' : 'text-rose-400'}`}>{selectedTicker.debtToEquity}x</p>
                                        </div>
                                        <div 
                                             onClick={() => setActiveInsight('VALUE_SCORE')}
                                             className="bg-slate-800/50 p-2 rounded-lg text-center border border-white/5 hover:bg-slate-700/50 cursor-help transition-all insight-trigger"
                                        >
                                            <p className="text-[7px] text-slate-400 uppercase font-bold">Value</p>
                                            <p className={`text-xs font-black ${selectedTicker.valueScore > 70 ? 'text-emerald-400' : 'text-slate-300'}`}>{selectedTicker.valueScore}</p>
                                        </div>
                                   </div>
                                   
                                    {/* Insight Overlay */}
                                     {activeInsight && QUANT_INSIGHTS[activeInsight] && (
                                         <div className="absolute inset-x-4 bottom-4 z-20 animate-in fade-in slide-in-from-bottom-2 insight-overlay">
                                             <div className="bg-slate-900/95 backdrop-blur-xl p-4 rounded-xl border border-cyan-500/30 shadow-2xl relative">
                                                 <button onClick={() => setActiveInsight(null)} className="absolute top-2 right-2 text-slate-500 hover:text-white">
                                                     <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                                 </button>
                                                 <h5 className="text-[10px] font-black text-cyan-400 uppercase tracking-widest mb-1 flex items-center gap-2">
                                                     <span className="w-1.5 h-1.5 rounded-full bg-cyan-500 animate-pulse"></span>
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
                <div className="glass-panel h-[400px] lg:h-[600px] rounded-[32px] md:rounded-[40px] bg-slate-950 border-l-4 border-l-cyan-600 flex flex-col p-6 shadow-2xl overflow-hidden">
                    <div className="flex items-center justify-between mb-8 px-2">
                        <h3 className="font-black text-white text-[10px] uppercase tracking-[0.4em] italic">Audit_Log</h3>
                    </div>
                    <div ref={logRef} className="flex-1 bg-black/70 p-6 rounded-[32px] font-mono text-[9px] text-cyan-300/60 overflow-y-auto no-scrollbar space-y-4 border border-white/5">
                        {logs.map((log, i) => (
                            <div key={i} className={`pl-4 border-l-2 ${log.includes('[OK]') ? 'border-emerald-500 text-emerald-400' : log.includes('[ERR]') ? 'border-red-500 text-red-400' : 'border-cyan-900'}`}>
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
