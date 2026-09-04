
import React, { useState, useEffect, useRef } from 'react';
import { ResponsiveContainer, Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Tooltip as RechartsTooltip } from 'recharts';
import { GOOGLE_DRIVE_TARGET } from '../constants';
import { formatKstFilenameTimestamp } from '../services/timeService';
import { assertDriveOk, parseDriveJsonText } from '../services/driveJsonUtils';
import { validateStage1ArtifactForStage2 } from '../services/stage1PointInTimeFilterContract.mjs';
import { hashTextSha256 } from '../services/stage0SourceEvidenceContract.mjs';
import { buildStage2Artifact } from '../services/stage2QualityTruthContract.mjs';

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
        title: "Distress Risk Score (부도위험 스코어)",
        desc: "비금융주는 Altman Z-Score(원데이터 기반), 금융주는 섹터 적합 안정성 모델로 산출합니다. 동일 라벨이지만 계산식은 섹터별로 다릅니다.",
        strategy: "Altman 모델은 2.99↑ 안전 / 1.8↓ 위험으로 해석합니다. 금융주 모델은 '상대 안정성 점수'이므로 섹터 내 순위와 Safety/현금흐름을 함께 보십시오."
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

const DeepQualityFilter: React.FC<Props> = ({ autoStart, onComplete, onStockSelected, isVisible = true }) => {
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, msg: '' });
  const [processedData, setProcessedData] = useState<any[]>([]);
  const [selectedTicker, setSelectedTicker] = useState<any | null>(null);
  const [activeInsight, setActiveInsight] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>(['> Quality_Node v5.6.2: Resilience Protocol Active.']);
  const logRef = useRef<HTMLDivElement>(null);
  const autoStartTriggeredRef = useRef(false);
  
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
    if (!autoStart) {
        autoStartTriggeredRef.current = false;
        return;
    }
    if (!loading && !autoStartTriggeredRef.current) {
        autoStartTriggeredRef.current = true;
        addLog("AUTO-PILOT: Engaging Deep Quality Filter...", "signal");
        executeDeepFilter();
    }
  }, [autoStart, loading]);

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

  const fetchWithTimeout = async (url: string, init: RequestInit, timeoutMs: number, label: string) => {
      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(), timeoutMs);
      try {
          return await fetch(url, { ...init, signal: controller.signal });
      } catch (error: any) {
          if (error?.name === 'AbortError') {
              throw new Error(`${label} timed out after ${timeoutMs}ms`);
          }
          throw error;
      } finally {
          window.clearTimeout(timer);
      }
  };

  const sleep = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

  const isRetriableDriveStatus = (status: number): boolean => (
      status === 408 ||
      status === 429 ||
      status === 500 ||
      status === 502 ||
      status === 503 ||
      status === 504
  );

  const isRetriableDriveError = (error: any): boolean => {
      const message = String(error?.message || error || '').toLowerCase();
      return message.includes('timed out') || error?.name === 'TypeError';
  };

  const fetchDriveWithRetry = async (
      url: string,
      init: RequestInit,
      timeoutsMs: number[],
      label: string
  ): Promise<Response> => {
      const attempts = timeoutsMs.length > 0 ? timeoutsMs : [30000];
      let lastError: any = null;

      for (let attempt = 0; attempt < attempts.length; attempt += 1) {
          const attemptNo = attempt + 1;
          const timeoutMs = attempts[attempt];
          try {
              const response = await fetchWithTimeout(url, init, timeoutMs, `${label}.attempt${attemptNo}`);
              if (response.ok || !isRetriableDriveStatus(response.status) || attemptNo === attempts.length) {
                  return response;
              }

              const body = await response.clone().text().catch(() => '');
              lastError = new Error(
                  `${label} retryable HTTP ${response.status} attempt=${attemptNo}/${attempts.length} body=${body.slice(0, 180)}`
              );
          } catch (error: any) {
              lastError = error;
              if (!isRetriableDriveError(error) || attemptNo === attempts.length) {
                  throw error;
              }
          }

          const backoffMs = Math.min(2000 * attemptNo, 6000);
          addLog(
              `[WARN] ${label} retry ${attemptNo}/${attempts.length} after ${lastError?.message || 'unknown'}; backoff=${backoffMs}ms`,
              "warn"
          );
          await sleep(backoffMs);
      }

      throw lastError || new Error(`${label} failed after ${attempts.length} attempts`);
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

  // ... (Drive Utils remain same) ...
  // --- DRIVE UTILS ---
  const findFolder = async (token: string, name: string, parentId = 'root') => {
      const q = encodeURIComponent(`name = '${name}' and mimeType = 'application/vnd.google-apps.folder' and '${parentId}' in parents and trashed = false`);
      const res = await fetchWithTimeout(`https://www.googleapis.com/drive/v3/files?q=${q}`, { headers: { 'Authorization': `Bearer ${token}` } }, 15000, `findFolder(${name})`);
      await assertDriveOk(res, `findFolder(${name})`);
      const data = await res.json();
      return data.files?.[0]?.id || null;
  };

  const findFileId = async (token: string, name: string, parentId: string) => {
      const q = encodeURIComponent(`name = '${name}' and '${parentId}' in parents and trashed = false`);
      const res = await fetchWithTimeout(`https://www.googleapis.com/drive/v3/files?q=${q}`, { headers: { 'Authorization': `Bearer ${token}` } }, 15000, `findFileId(${name})`);
      await assertDriveOk(res, `findFileId(${name})`);
      const data = await res.json();
      return data.files?.[0]?.id || null;
  };

  const downloadJsonWithEvidence = async (token: string, fileId: string, label: string) => {
      const res = await fetchDriveWithRetry(
          `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
          { headers: { 'Authorization': `Bearer ${token}` } },
          [30000, 60000, 90000],
          label
      );
      await assertDriveOk(res, label);
      const text = await res.text();
      return {
          data: parseDriveJsonText(text),
          contentSha256: await hashTextSha256(text),
          retrievedAt: new Date().toISOString()
      };
  };

  const ensureFolder = async (token: string, name: string) => {
      const q = encodeURIComponent(`name = '${name}' and '${GOOGLE_DRIVE_TARGET.rootFolderId}' in parents and trashed = false`);
      const res = await fetchWithTimeout(`https://www.googleapis.com/drive/v3/files?q=${q}`, { headers: { 'Authorization': `Bearer ${token}` } }, 15000, `ensureFolder.list(${name})`);
      await assertDriveOk(res, `ensureFolder.list(${name})`);
      const data = await res.json();
      if (data.files?.length > 0) return data.files[0].id;
      const create = await fetchWithTimeout(`https://www.googleapis.com/drive/v3/files`, {
          method: 'POST', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, parents: [GOOGLE_DRIVE_TARGET.rootFolderId], mimeType: 'application/vnd.google-apps.folder' })
      }, 15000, `ensureFolder.create(${name})`);
      await assertDriveOk(create, `ensureFolder.create(${name})`);
      const json = await create.json();
      if (!json?.id) throw new Error(`Drive ensureFolder.create(${name}) succeeded but missing folder id`);
      return json.id;
  };

  const uploadFile = async (token: string, folderId: string, name: string, content: any) => {
      const meta = { name, parents: [folderId], mimeType: 'application/json' };
      const form = new FormData();
      form.append('metadata', new Blob([JSON.stringify(meta)], { type: 'application/json' }));
      form.append('file', new Blob([JSON.stringify(content, null, 2)], { type: 'application/json' }));
      const uploadRes = await fetchWithTimeout('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` },
          body: form
      }, 30000, `uploadFile(${name})`);
      if (!uploadRes.ok) {
          const errText = await uploadRes.text().catch(() => '');
          throw new Error(`Drive upload failed (${name}): HTTP ${uploadRes.status} ${errText.slice(0, 240)}`);
      }
      const uploaded = await uploadRes.json().catch(() => null);
      if (!uploaded?.id) {
          addLog(`[WARN] Drive upload 응답에 fileId 누락 (${name})`, "warn");
          return;
      }
      addLog(`[OK] Drive upload verified: ${name}`, "ok");
  };

  const executeDeepFilter = async () => {
      // ... (Keep existing execution logic) ...
      if (!accessToken || loading) return;
      setLoading(true);
      setProcessedData([]);

      try {
          addLog("Phase 1: Loading Stage 1 Purified Universe...", "info");
          const stage1FolderId = await findFolder(accessToken, GOOGLE_DRIVE_TARGET.stage1SubFolder, GOOGLE_DRIVE_TARGET.rootFolderId);
          if (!stage1FolderId) {
              addLog("[WARN] Stage 1 folder not found under root. Falling back to global search.", "warn");
          }
          const stage1Query = stage1FolderId
              ? `name contains 'STAGE1_PURIFIED_UNIVERSE' and '${stage1FolderId}' in parents and trashed = false`
              : `name contains 'STAGE1_PURIFIED_UNIVERSE' and trashed = false`;
          const q = encodeURIComponent(stage1Query);
          const listRes = await fetchWithTimeout(`https://www.googleapis.com/drive/v3/files?q=${q}&orderBy=createdTime desc&pageSize=1&fields=files(id%2Cname%2CcreatedTime%2CmodifiedTime%2Csize%2CmimeType)`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
          }, 15000, 'executeDeepFilter.listStage1');
          await assertDriveOk(listRes, "executeDeepFilter.listStage1");
          const listData = await listRes.json();

          if (!listData.files?.length) throw new Error("Stage 1 Data Missing.");
          const stage1File = listData.files[0];
          addLog(
              `[STAGE2_SOURCE] Stage1=${stage1File.name || 'unnamed'} size=${stage1File.size || 'unknown'} created=${stage1File.createdTime || 'unknown'} modified=${stage1File.modifiedTime || 'unknown'}`,
              "info"
          );

          const stage1Res = await fetchDriveWithRetry(
              `https://www.googleapis.com/drive/v3/files/${stage1File.id}?alt=media`,
              { headers: { 'Authorization': `Bearer ${accessToken}` } },
              [45000, 90000, 120000],
              'executeDeepFilter.downloadStage1'
          );
          await assertDriveOk(stage1Res, "executeDeepFilter.downloadStage1");
          const stage1Text = await stage1Res.text();
          const stage1Content = parseDriveJsonText(stage1Text);
          const stage1Validation = await validateStage1ArtifactForStage2(stage1Content);
          if (!stage1Validation.valid) {
              throw new Error(`Stage 1 source contract invalid: ${stage1Validation.reasons.join(',')}`);
          }
          const stage1RawCandidates = stage1Validation.investableUniverse;
          if (stage1RawCandidates.length === 0) {
              const primaryBlocker = Object.entries(stage1Validation.manifest?.statusCounts || {})
                  .sort(([leftKey, leftCount]: any, [rightKey, rightCount]: any) =>
                      Number(rightCount) - Number(leftCount) || String(leftKey).localeCompare(String(rightKey))
                  )[0];
              const blocker = primaryBlocker ? `${primaryBlocker[0]}=${primaryBlocker[1]}` : 'UNCLASSIFIED=0';
              throw new Error(`Stage 1 point-in-time evidence gate produced zero rows (${blocker}).`);
          }
          const candidates = stage1RawCandidates;
          const stage1ContentSha256 = await hashTextSha256(stage1Text);
          addLog(`Targets Acquired: ${candidates.length} candidates.`, "ok");
          setProgress({ current: 0, total: candidates.length, msg: 'Initializing History Vault...' });

          let systemMapId = await findFolder(accessToken, GOOGLE_DRIVE_TARGET.systemMapSubFolder, GOOGLE_DRIVE_TARGET.rootFolderId);
          if (!systemMapId) systemMapId = await findFolder(accessToken, GOOGLE_DRIVE_TARGET.systemMapSubFolder, 'root');
          const historyFolderId = systemMapId ? await findFolder(accessToken, GOOGLE_DRIVE_TARGET.financialHistoryFolder, systemMapId) : null;
          const marketRegimeFileId = systemMapId ? await findFileId(accessToken, 'MARKET_REGIME_SNAPSHOT.json', systemMapId) : null;

          let regimeEvidence: Record<string, any> = {};
          if (marketRegimeFileId) {
              try {
                  const evidence = await downloadJsonWithEvidence(accessToken, marketRegimeFileId, 'stage2.marketRegime');
                  const state = String(evidence.data?.regime?.state || '').toUpperCase();
                  if (!['RISK_ON', 'NEUTRAL', 'RISK_OFF'].includes(state)) {
                      throw new Error('unsupported regime state');
                  }
                  const vixCandidate = Number(evidence.data?.benchmarks?.vix?.close);
                  regimeEvidence = {
                      state,
                      vixRef: Number.isFinite(vixCandidate) ? vixCandidate : null,
                      fileName: 'MARKET_REGIME_SNAPSHOT.json',
                      contentSha256: evidence.contentSha256,
                      retrievedAt: evidence.retrievedAt,
                      status: 'REGIME_EVIDENCE_VERIFIED'
                  };
                  addLog(`[REGIME] ${state} | vix=${regimeEvidence.vixRef ?? 'N/A'}`, "ok");
              } catch (error: any) {
                  addLog(`[WARN] Market regime evidence unavailable: ${error?.message || 'unknown'}`, "warn");
              }
          } else {
              addLog("Market regime snapshot not found. Regime factor disabled.", "warn");
          }

          if (!historyFolderId) addLog("History folder not found. Proceeding with explicitly partial evidence.", "warn");
          const historyByIdentity: Record<string, any[]> = {};
          const historySourceEvidenceByIdentity: Record<string, string> = {};
          const historySourceFiles: any[] = [];
          const letters = [...new Set(candidates.map((candidate: any) => String(candidate.symbol || '').charAt(0).toUpperCase()))]
              .filter(Boolean)
              .sort();

          for (const [index, letter] of letters.entries()) {
              setProgress({ current: index, total: letters.length, msg: `Loading History ${letter}...` });
              if (!historyFolderId) continue;
              const fileName = `${letter}_stocks_history.json`;
              try {
                  const fileId = await findFileId(accessToken, fileName, historyFolderId);
                  if (!fileId) continue;
                  const evidence = await downloadJsonWithEvidence(accessToken, fileId, `stage2.history.${letter}`);
                  const entries = Array.isArray(evidence.data)
                      ? evidence.data.map((record: any) => [record?.symbol, record])
                      : Object.entries(evidence.data || {});
                  const fileIdentities = new Set<string>();
                  const fileHistory: Array<{ identity: string; rows: any[] }> = [];
                  for (const [key, record] of entries as Array<[any, any]>) {
                      const identity = String(record?.symbol || key || '').trim();
                      if (!identity || fileIdentities.has(identity)) {
                          throw new Error('duplicate or missing history identity');
                      }
                      fileIdentities.add(identity);
                      fileHistory.push({
                          identity,
                          rows: Array.isArray(record)
                          ? record
                          : Array.isArray(record?.financials) ? record.financials : []
                      });
                  }
                  if (fileHistory.some(({ identity }) => Object.prototype.hasOwnProperty.call(historyByIdentity, identity))) {
                      throw new Error('duplicate history identity across source files');
                  }
                  for (const { identity, rows } of fileHistory) {
                      historyByIdentity[identity] = rows;
                      historySourceEvidenceByIdentity[identity] = evidence.contentSha256;
                  }
                  historySourceFiles.push({
                      fileName,
                      contentSha256: evidence.contentSha256,
                      retrievedAt: evidence.retrievedAt,
                      inputRows: entries.length,
                      parseStatus: 'PARSED'
                  });
              } catch (error: any) {
                  addLog(`[WARN] History evidence unavailable for ${letter}: ${error?.message || 'unknown'}`, "warn");
              }
          }

          const decisionAt = new Date().toISOString();
          const payload = await buildStage2Artifact({
              decisionAt,
              sourceStage1File: stage1File.name,
              sourceStage1ContentSha256: stage1ContentSha256,
              sourceStage1Artifact: stage1Content,
              historyByIdentity,
              historySourceEvidenceByIdentity,
              historySourceFiles,
              regimeEvidence
          });
          const eliteCandidates = payload.elite_universe;
          const distressModelCounts = eliteCandidates.reduce<Record<string, number>>((counts, row) => {
              const model = String(row?.zScoreModel || 'UNCLASSIFIED');
              counts[model] = (counts[model] || 0) + 1;
              return counts;
          }, {});
          const avgDistressCoverage = eliteCandidates.length
              ? eliteCandidates.reduce((sum, row) => sum + Number(row?.zScoreCoveragePct || 0), 0) / eliteCandidates.length
              : 0;
          addLog(
              `[DISTRESS] ALTMAN_Z=${distressModelCounts.ALTMAN_Z || 0} | FIN_STABILITY=${distressModelCounts.FINANCIAL_STABILITY || 0} | SAFETY_PROXY=${distressModelCounts.SAFETY_PROXY || 0} | avgCoverage=${avgDistressCoverage.toFixed(1)}%`,
              "ok"
          );
          addLog(`[DYNAMIC-SCALE] Deterministic target: ${payload.manifest.dynamicTargetCount} assets.`, "info");
          addLog(`[POINT-IN-TIME] future history rejected=${payload.manifest.futureHistoryRowsRejected} | target score influence=0`, "ok");
          addLog(`[OK] Stage 2 deterministic quality scan complete`, "ok");

          setProcessedData(eliteCandidates);
          if (eliteCandidates.length > 0) handleTickerSelect(eliteCandidates[0]);
          setProgress({ current: candidates.length, total: candidates.length, msg: 'Complete' });

          const saveFolderId = await ensureFolder(accessToken, GOOGLE_DRIVE_TARGET.stage2SubFolder);
          const timestamp = formatKstFilenameTimestamp();
          const resultFileName = `STAGE2_ELITE_UNIVERSE_${timestamp}.json`;
          await uploadFile(accessToken, saveFolderId, resultFileName, payload);
          addLog(`Vault Saved: ${resultFileName}`, "ok");
          
          if (onComplete) onComplete();

      } catch (e: any) {
          addLog(`Engine Failure: ${e.message}`, "err");
          if (autoStart) {
              (window as any).__AUTO_DONE = `AUTO ABORTED: STAGE2 FAILED. ${e?.message || 'unknown'}`;
          }
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
                                   <p className="text-[7px] text-slate-400 uppercase font-bold">{selectedTicker.zScoreModel === 'ALTMAN_Z' ? 'Altman Z' : 'Distress'}</p>
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
