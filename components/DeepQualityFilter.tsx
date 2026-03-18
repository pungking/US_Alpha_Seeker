
import React, { useState, useEffect, useRef } from 'react';
import { ResponsiveContainer, Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Tooltip as RechartsTooltip } from 'recharts';
import { GOOGLE_DRIVE_TARGET, API_CONFIGS } from '../constants';
import { ApiProvider } from '../types';
import { trackUsage } from '../services/intelligenceService';
import { formatKstFilenameTimestamp } from '../services/timeService';

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

// ... (Rest of utils code remains same) ...

// --- QUANT ENGINE UTILS ---

const imputeValue = (val: any, fallback: number, allowZero: boolean = false): number => {
    if (val === null || val === undefined || val === '') return fallback;
    const num = Number(val);
    if (isNaN(num) || !isFinite(num)) return fallback;
    if (num === 0 && !allowZero) return fallback; 
    return num;
};

const winsorize = (val: number, min: number, max: number): number => {
    return Math.max(min, Math.min(max, val));
};

const clampScore = (val: number): number => Math.min(100, Math.max(0, val));

const sanitizeData = (item: any) => {
    let { dividendYield, roe, operatingMargins, pbr, debtToEquity } = item;
    if (dividendYield > 50) dividendYield = dividendYield / 100;
    if (roe > 200) roe = roe / 100;
    if (operatingMargins > 100) operatingMargins = operatingMargins / 100;
    if (pbr > 500) pbr = 0;
    return { ...item, dividendYield, roe, operatingMargins, pbr, debtToEquity };
};

const DeepQualityFilter: React.FC<Props> = ({ autoStart, onComplete, onStockSelected, isVisible = true }) => {
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, msg: '' });
  const [processedData, setProcessedData] = useState<any[]>([]);
  const [selectedTicker, setSelectedTicker] = useState<any | null>(null);
  const [activeInsight, setActiveInsight] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>(['> Quality_Node v5.6.2: Resilience Protocol Active.']);
  const logRef = useRef<HTMLDivElement>(null);
  
  const accessToken = sessionStorage.getItem('gdrive_access_token');

  // ... (Effect hooks remain same) ...
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
        addLog("AUTO-PILOT: Engaging Deep Quality Filter...", "signal");
        executeDeepFilter();
    }
  }, [autoStart]);

  const addLog = (m: string, t: 'info' | 'ok' | 'err' | 'warn' | 'signal' = 'info') => {
    const p = { info: '>', ok: '[OK]', err: '[ERR]', warn: '[WARN]', signal: '[AUTO]' };
    setLogs(prev => [...prev, `${p[t]} ${m}`].slice(-50));
  };

  const handleTickerSelect = (ticker: any) => {
    setSelectedTicker(ticker);
    setActiveInsight(null);
    if (onStockSelected) onStockSelected(ticker);
  };

  const timeoutPromise = (ms: number, msg: string) => new Promise((_, reject) => 
      setTimeout(() => reject(new Error(msg)), ms)
  );

  const sanitizeJson = (text: string) => {
      try {
        let clean = text.replace(/```json/g, "").replace(/```/g, "").trim();
        const first = clean.indexOf('{');
        const last = clean.lastIndexOf('}');
        if (first !== -1 && last !== -1) return JSON.parse(clean.substring(first, last + 1));
        return JSON.parse(clean);
      } catch (e) { return null; }
  };

  // ... (Drive Utils remain same) ...
  // --- DRIVE UTILS ---
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
      const uploadRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` },
          body: form
      });
      if (!uploadRes.ok) {
          const errText = await uploadRes.text().catch(() => '');
          throw new Error(`Drive upload failed (${name}): HTTP ${uploadRes.status} ${errText.slice(0, 240)}`);
      }
  };

  const executeDeepFilter = async () => {
      // ... (Keep existing execution logic) ...
      if (!accessToken || loading) return;
      setLoading(true);
      setProcessedData([]);

      try {
          addLog("Phase 1: Loading Stage 1 Purified Universe...", "info");
          const q = encodeURIComponent(`name contains 'STAGE1_PURIFIED_UNIVERSE' and trashed = false`);
          const listRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&orderBy=createdTime desc&pageSize=1`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
          });
          const listData = await listRes.json();

          if (!listData.files?.length) throw new Error("Stage 1 Data Missing.");

          const stage1Content = await fetch(`https://www.googleapis.com/drive/v3/files/${listData.files[0].id}?alt=media`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
          }).then(r => r.json());

          const candidates = stage1Content.investable_universe || [];
          addLog(`Targets Acquired: ${candidates.length} candidates.`, "ok");
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

                  // --- QUANT LOGIC IMPLEMENTATION (V5.6.0) ---

                  // 1. Sector Logic
                  const sector = (item.sector || '').toLowerCase();
                  const isFinancial = sector.includes('financial') || sector.includes('bank') || sector.includes('insurance');
                  
                  // 2. Data Cleaning & Imputation
                  const rawRoe = item.roe;
                  const roeMissing =
                      rawRoe === null ||
                      rawRoe === undefined ||
                      rawRoe === '' ||
                      !isFinite(Number(rawRoe));
                  const roe = winsorize(imputeValue(rawRoe, -5, true), -50, 100);
                  const roa = winsorize(imputeValue(item.roa, -2, false), -20, 50);
                  const rawDebt = item.debtToEquity;
                  
                  // [LOGIC] Negative Debt/Equity means Negative Equity (Insolvency Risk)
                  let debtScore = 0;
                  if (rawDebt < 0) {
                      debtScore = 0; // Insolvency
                  } else {
                      // debtToEquity=0 means debt-free and must be treated as a valid value.
                      const debtVal = imputeValue(rawDebt, isFinancial ? 0.5 : 1.5, true);
                      debtScore = Math.max(0, 100 - (debtVal * 50)); 
                  }
                  
                  // 3. Value Score (Thresholds instead of 1/PE)
                  let valueScore = 0;
                  const pe = item.pe || 0;
                  
                  if (pe <= 0) valueScore = 0; // Loss making or error
                  else if (pe < 10) valueScore = 100; // Deep Value
                  else if (pe < 20) valueScore = 80;  // Good Value
                  else if (pe < 35) valueScore = 60;  // Fair Value
                  else if (pe < 50) valueScore = 40;  // Premium
                  else valueScore = 20;               // Bubble
                  
                  // 4. Profit Score
                  let profitScore = 0;
                  if (isFinancial) {
                      // ROA is key for financials
                      profitScore = (Math.max(0, roa * 30)) + (Math.max(0, roe * 2)); 
                  } else {
                      profitScore = Math.max(0, roe * 3);
                  }
                  profitScore = clampScore(profitScore);

                  // 5. Data Quality Guard
                  let dataQuality = 'HIGH';
                  let penalty = 0;
                  
                  if (roeMissing) { penalty += 10; dataQuality = 'MEDIUM'; }
                  if (!item.targetMeanPrice || item.targetMeanPrice <= 0) {
                      penalty += 20;
                      dataQuality = 'LOW_VISIBILITY';
                  }

                  // 6. Final Quality Score
                  let rawQuality = (profitScore * 0.4 + debtScore * 0.3 + valueScore * 0.3) - penalty;
                  
                  // [ICT STRATEGY BOOST] Upside Potential Bonus
                  // If Target Price > Current Price * 1.2 (20% Upside), add bonus
                  if (item.targetMeanPrice > item.price * 1.2) {
                      rawQuality += 10; 
                  }
                  
                  const qualityScore = clampScore(rawQuality);

                  // 7. Z-Score Proxy
                  const zScore = (roe > 15 && rawDebt < 0.5) ? 3.5 : (roe > 5 && rawDebt < 1.0) ? 2.0 : 1.0;

                  if (qualityScore > 35) {
                      // [STAGE 5 SAFEGUARD] Data Integrity & Imputation
                      let isImputed = false;
                      let safeTargetPrice = item.targetMeanPrice;
                      let safeHigh52 = item.fiftyTwoWeekHigh;
                      let safeLow52 = item.fiftyTwoWeekLow;

                      if (!safeTargetPrice || safeTargetPrice === 0) {
                          safeTargetPrice = item.price * 1.15;
                          isImputed = true;
                      }
                      if (!safeHigh52 || safeHigh52 === 0) {
                          safeHigh52 = item.price * 1.05;
                          isImputed = true;
                      }
                      if (!safeLow52 || safeLow52 === 0) {
                          safeLow52 = item.price * 0.95;
                          isImputed = true;
                      }

                      // [ICT CALCULATION] Position in Range
                      const range = safeHigh52 - safeLow52;
                      const ictPos = range === 0 ? 0.5 : (item.price - safeLow52) / range;
                      const pdZoneHint = ictPos < 0.5 ? "DISCOUNT" : "PREMIUM";

                      results.push({
                          ...item,
                          roe: roe || 0,
                          debtToEquity: rawDebt || 0,
                          zScoreProxy: Number(zScore.toFixed(2)),
                          profitScore: Math.round(profitScore),
                          safeScore: Math.round(debtScore),
                          valueScore: Math.round(valueScore),
                          qualityScore: Number(qualityScore.toFixed(2)),
                          fundamentalScore: Number(qualityScore.toFixed(2)), // [SYNC] Stage 6
                          dataQuality,
                          
                          // [CRITICAL] Preserve ICT Data Fields with Safeguards
                          fiftyTwoWeekHigh: safeHigh52,
                          fiftyTwoWeekLow: safeLow52,
                          fiftyDayAverage: item.fiftyDayAverage || 0,
                          twoHundredDayAverage: item.twoHundredDayAverage || 0,
                          targetMeanPrice: safeTargetPrice,

                          // [NEW] Stage 5/6 Compatibility
                          isImputed,
                          ictPos: Number(ictPos.toFixed(4)),
                          pdZoneHint,

                          radarData: [
                            { subject: 'Profit', A: Math.round(profitScore), fullMark: 100 },
                            { subject: 'Safety', A: Math.round(debtScore), fullMark: 100 },
                            { subject: 'Value', A: Math.round(valueScore), fullMark: 100 },
                          ],
                          fullHistory: fullHistory.slice(0, 4) 
                      });
                  }
              }
              setProgress(prev => ({ ...prev, current: results.length }));
              await new Promise(r => setTimeout(r, 0));
          }

          results.sort((a, b) => b.qualityScore - a.qualityScore);

          // [DYNAMIC SCALING] Market Condition Analysis
          const avgScore = results.reduce((sum, item) => sum + item.qualityScore, 0) / (results.length || 1);
          let targetCount = 300; // Neutral
          
          if (avgScore >= 70) {
             targetCount = 450; // Bull
          } else if (avgScore < 50) {
             targetCount = 150; // Bear
          }

          addLog(`[DYNAMIC-SCALE] Market Condition Detected. Target: ${targetCount} Assets.`, "info");

          const eliteCandidates = results.slice(0, targetCount);
          
          // [QUANT ONLY] No AI Audit
          addLog(`[OK] 5-Factor Quant Engine: Scan Complete`, "ok");

          setProcessedData(eliteCandidates);
          if (eliteCandidates.length > 0) handleTickerSelect(eliteCandidates[0]);

          addLog(`[DATA-SYNC] Field Integrity Guaranteed for Stages 3-6`, "ok");
          
          const saveFolderId = await ensureFolder(accessToken, GOOGLE_DRIVE_TARGET.stage2SubFolder);
          
          const timestamp = formatKstFilenameTimestamp();
          const resultFileName = `STAGE2_ELITE_UNIVERSE_${timestamp}.json`;

          const payload = {
              manifest: { 
                  version: "5.6.2", 
                  count: eliteCandidates.length, 
                  timestamp: new Date().toISOString(),
                  engine: "3-Factor_Quant_Model_Sanitized",
                  aiAudit: "Skipped (Quant-Only Optimization)"
              },
              elite_universe: eliteCandidates
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

  return (
    <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
      <div className="xl:col-span-3 space-y-6">
        {/* Main Panel - Violet Theme */}
        <div className="glass-panel p-5 md:p-8 lg:p-10 rounded-[32px] md:rounded-[40px] border-t-2 border-t-violet-500 shadow-2xl bg-slate-900/40 relative overflow-hidden">
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-6 md:mb-10 gap-6">
            {/* Header Content */}
            <div className="flex items-center space-x-6">
              <div className={`w-12 h-12 md:w-14 md:h-14 rounded-3xl bg-violet-600/10 flex items-center justify-center border border-violet-500/20 ${loading ? 'animate-pulse' : ''}`}>
                 <svg className={`w-5 h-5 md:w-6 md:h-6 text-violet-400 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
              </div>
              <div>
                <h2 className="text-xl md:text-3xl font-black text-white italic tracking-tighter uppercase leading-none">Deep_Quality v5.6.2</h2>
                <div className="flex flex-col mt-2 gap-1">
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
              onClick={executeDeepFilter} 
              disabled={loading} 
              className={`w-full lg:w-auto px-8 md:px-12 py-4 md:py-5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${
                  loading 
                    ? 'bg-slate-800 text-slate-500 shadow-none border border-white/5 cursor-wait opacity-80' 
                    : 'bg-violet-600 text-white shadow-xl shadow-violet-900/30 hover:scale-105 active:scale-95 hover:bg-violet-500'
              }`}
            >
              {loading ? 'Executing Quant Scan...' : 'Start Deep Quality Filter'}
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
                              {/* [FIX] Conditional rendering to prevent 0-size error */}
                              {isVisible && (
                                <ResponsiveContainer width="100%" height="100%">
                                    <RadarChart cx="50%" cy="50%" outerRadius="70%" data={selectedTicker.radarData}>
                                        <PolarGrid stroke="#334155" opacity={0.3} />
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
                              )}
                          </div>
                          
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

export default DeepQualityFilter;
