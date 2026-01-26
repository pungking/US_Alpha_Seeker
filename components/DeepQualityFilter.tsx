import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI } from "@google/genai";
import { GOOGLE_DRIVE_TARGET, API_CONFIGS } from '../constants';
import { ApiProvider } from '../types';

interface QualityTicker {
  symbol: string;
  name: string;
  price: number;
  volume: number;
  marketValue: number;
  type?: string;
  per?: number;
  pbr?: number;
  debtToEquity?: number;
  roe?: number;
  sector?: string;
  industry?: string;
  lastUpdate: string;
}

const DeepQualityFilter: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [processedData, setProcessedData] = useState<QualityTicker[]>([]);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [activeBrain, setActiveBrain] = useState<string>('Standby');
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>(['> Quality_Node v2.5.0: High-Velocity Parallel Protocol Ready.']);
  
  const accessToken = sessionStorage.getItem('gdrive_access_token');
  const finnhubKey = API_CONFIGS.find(c => c.provider === ApiProvider.FINNHUB)?.key;
  const logRef = useRef<HTMLDivElement>(null);

  // 병렬 처리 설정
  const BATCH_SIZE = 5; // 한 번에 동시에 처리할 종목 수 (병렬성)
  
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  const addLog = (m: string, t: 'info' | 'ok' | 'err' | 'warn' = 'info') => {
    const p = { info: '>', ok: '[OK]', err: '[ERR]', warn: '[WARN]' };
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

  // 개별 종목 데이터 페치 함수 (Promise.all용)
  const fetchTickerData = async (target: any): Promise<QualityTicker | null> => {
    try {
      // Metric과 Profile을 병렬로 요청하여 시간 단축
      const [finRes, profRes] = await Promise.all([
        fetch(`https://finnhub.io/api/v1/stock/metric?symbol=${target.symbol}&metric=all&token=${finnhubKey}`).then(r => {
            if (r.status === 429) throw new Error("RATE_LIMIT");
            return r;
        }),
        fetch(`https://finnhub.io/api/v1/stock/profile2?symbol=${target.symbol}&token=${finnhubKey}`).then(r => {
            if (r.status === 429) throw new Error("RATE_LIMIT");
            return r;
        })
      ]);

      if (!finRes.ok || !profRes.ok) return null;

      const metricsData = await finRes.json();
      const profileData = await profRes.json();
      const metrics = metricsData.metric || {};
      
      // 필수 데이터가 없으면 스킵
      if (!profileData.name && !metrics.peNormalized) return null;

      return {
        symbol: target.symbol,
        name: profileData.name || target.name || "N/A",
        price: target.price, 
        volume: target.volume, 
        marketValue: target.marketValue || (target.price * target.volume),
        type: profileData.type || "Equity", 
        per: metrics.peNormalized || 0,
        pbr: metrics.pbAnnual || 0, 
        debtToEquity: metrics.totalDebtEquityRatioQuarterly || 0,
        roe: metrics.roeTTM || 0, 
        sector: profileData.finnhubIndustry || "N/A",
        industry: profileData.finnhubIndustry || "N/A", 
        lastUpdate: new Date().toISOString()
      };
    } catch (e: any) {
      if (e.message === "RATE_LIMIT") throw e; // 상위 배치 루프에서 처리
      return null; // 데이터 없음 등 일반 에러는 무시
    }
  };

  const analyzeSectorDistribution = async (tickers: QualityTicker[]) => {
    const prompt = `
    [Role: Senior Market Analyst]
    Action: Analyze the Sector/Industry distribution of these top 300 filtered stocks.
    Data Sample (Top 5): ${JSON.stringify(tickers.slice(0, 5).map(t => ({s: t.symbol, sec: t.sector, roe: t.roe})))}
    Total Count: ${tickers.length}
    
    Task:
    1. Identify the dominant sector in this quality list.
    2. Provide a brief 1-sentence insight on where the "Smart Money" is flowing based on this list.
    
    Return JSON: { "dominantSector": "string", "insight": "string (Korean)" }
    `;
    
    try {
        setActiveBrain("Gemini 3 Flash");
        const geminiKey = API_CONFIGS.find(c => c.provider === ApiProvider.GEMINI)?.key || process.env.API_KEY || "";
        const ai = new GoogleGenAI({ apiKey: geminiKey });
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: prompt,
            config: { responseMimeType: "application/json" }
        });
        const result = sanitizeJson(response.text);
        if (result) {
            setAiAnalysis(result.insight);
            addLog(`AI Insight: ${result.insight}`, "ok");
        }
    } catch (e) {
        addLog("AI Analysis Skipped (Speed Mode)", "warn");
    }
  };

  const executeDeepQualityScan = async () => {
    if (!accessToken || loading) return;
    setLoading(true);
    setProcessedData([]);
    setAiAnalysis(null);
    setActiveBrain('Processing');
    addLog("Phase 1: Loading Stage 1 Purified Universe...", "info");

    try {
      const q = encodeURIComponent(`name contains 'STAGE1_PURIFIED_UNIVERSE' and trashed = false`);
      const listRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&orderBy=createdTime desc&pageSize=1`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      }).then(r => r.json());

      if (!listRes.files?.length) {
        addLog("Stage 1 source missing. Run Stage 1 first.", "err");
        setLoading(false);
        return;
      }

      const content = await fetch(`https://www.googleapis.com/drive/v3/files/${listRes.files[0].id}?alt=media`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      }).then(r => r.json());

      let targets = content.investable_universe || [];
      
      // Optimization: Sort by Volume * Price (Liquidity) and take TOP 300
      targets = targets
        .map((t: any) => ({ ...t, marketValue: t.price * t.volume }))
        .sort((a: any, b: any) => b.marketValue - a.marketValue)
        .slice(0, 300);

      addLog(`Target Locked: Top ${targets.length} Liquid Assets. Parallel Batching Initiated...`, "ok");
      setProgress({ current: 0, total: targets.length });

      const validResults: QualityTicker[] = [];
      let currentIndex = 0;

      while (currentIndex < targets.length) {
          const batch = targets.slice(currentIndex, currentIndex + BATCH_SIZE);
          
          try {
              // Parallel Execution
              const promises = batch.map((t: any) => fetchTickerData(t));
              const results = await Promise.all(promises);
              
              results.forEach(r => {
                  if (r && r.symbol) validResults.push(r);
              });

              currentIndex += BATCH_SIZE;
              setProgress({ current: Math.min(currentIndex, targets.length), total: targets.length });
              
              // Rate Limit 방지를 위한 최소한의 딜레이 (병렬 처리 후 0.25초 휴식 - 매우 빠름)
              await new Promise(r => setTimeout(r, 250));

          } catch (e: any) {
              if (e.message === "RATE_LIMIT") {
                  addLog("API Heat Warning (429). Cooling down for 5s...", "warn");
                  // 5초 대기 후 재시도 (인덱스 증가시키지 않음)
                  await new Promise(r => setTimeout(r, 5000));
                  addLog("Resuming Batch Process...", "info");
              } else {
                  // 알 수 없는 에러면 스킵하고 진행
                  addLog(`Batch Failed (${e.message}). Skipping...`, "err");
                  currentIndex += BATCH_SIZE;
              }
          }
      }

      setProcessedData(validResults);
      addLog(`Parallel Scan Complete. ${validResults.length} Quality Assets Found.`, "ok");

      // AI Analysis on Result
      await analyzeSectorDistribution(validResults);

      // Upload
      const folderId = await ensureFolder(accessToken, GOOGLE_DRIVE_TARGET.stage2SubFolder);
      const fileName = `STAGE2_ELITE_UNIVERSE_${new Date().toISOString().split('T')[0]}.json`;
      const payload = {
        manifest: { version: "2.5.0", strategy: "Parallel_Batch_Processing", count: validResults.length, timestamp: new Date().toISOString() },
        elite_universe: validResults
      };

      const meta = { name: fileName, parents: [folderId], mimeType: 'application/json' };
      const form = new FormData();
      form.append('metadata', new Blob([JSON.stringify(meta)], { type: 'application/json' }));
      form.append('file', new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));

      await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST', headers: { 'Authorization': `Bearer ${accessToken}` }, body: form
      });

      addLog(`Vault Finalized: ${fileName}`, "ok");

    } catch (e: any) {
      addLog(`Critical Error: ${e.message}`, "err");
    } finally {
      setLoading(false);
      setActiveBrain('Standby');
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

  return (
    <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
      <div className="xl:col-span-3 space-y-6">
        <div className="glass-panel p-8 md:p-10 rounded-[40px] border-t-2 border-t-blue-500 shadow-2xl bg-slate-900/40 relative overflow-hidden">
          
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-10 gap-6">
            <div className="flex items-center space-x-6">
              <div className={`w-14 h-14 rounded-3xl bg-blue-600/10 flex items-center justify-center border border-blue-500/20 ${loading ? 'animate-pulse' : ''}`}>
                 <svg className={`w-6 h-6 text-blue-400 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
              </div>
              <div>
                <h2 className="text-3xl font-black text-white italic tracking-tighter uppercase leading-none">Deep_Quality v2.5.0</h2>
                <div className="flex items-center space-x-2 mt-2">
                   <span className={`text-[8px] font-black px-2 py-0.5 rounded border uppercase tracking-widest ${loading ? 'border-blue-400 text-blue-400 animate-pulse' : 'border-blue-500/20 bg-blue-500/10 text-blue-400'}`}>
                     {loading ? `Scanning: ${progress.current}/${progress.total}` : 'Parallel Quality Scan Ready'}
                   </span>
                </div>
              </div>
            </div>
            <button onClick={executeDeepQualityScan} disabled={loading} className="px-12 py-5 bg-blue-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-blue-900/20 hover:scale-105 active:scale-95 transition-all">
              {loading ? 'Processing Batch...' : 'Execute Parallel Scan'}
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-10">
              <div className="bg-black/40 p-8 rounded-3xl border border-white/5">
                <div className="flex justify-between items-center mb-6">
                  <p className="text-[9px] font-black text-blue-400 uppercase tracking-widest">Processing Speed</p>
                  <p className="text-xl font-mono font-black text-white italic">{loading ? `${(progress.current / (progress.total || 1) * 100).toFixed(1)}%` : 'Idle'}</p>
                </div>
                <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-500 transition-all duration-300" style={{ width: `${(progress.current / (progress.total || 1)) * 100}%` }}></div>
                </div>
                <p className="text-[8px] text-slate-500 mt-3 font-bold uppercase tracking-widest">
                   Mode: Parallel Batching (x{BATCH_SIZE}) • Target: Top 300 Liquid Assets
                </p>
              </div>

              <div className="bg-blue-900/10 p-8 rounded-3xl border border-blue-500/10 relative overflow-hidden">
                 <p className="text-[9px] font-black text-blue-400 uppercase tracking-widest mb-2">AI Sector Insight</p>
                 <p className="text-xs font-bold text-slate-300 leading-relaxed italic">
                    {aiAnalysis || "Awaiting Post-Scan Analysis..."}
                 </p>
                 {loading && <div className="absolute bottom-0 left-0 h-1 bg-blue-500 animate-pulse w-full"></div>}
              </div>
          </div>
        </div>
      </div>

      <div className="xl:col-span-1">
        <div className="glass-panel h-[600px] rounded-[40px] bg-slate-950 border-l-4 border-l-blue-600 flex flex-col p-6 shadow-2xl overflow-hidden">
          <div className="flex items-center justify-between mb-8 px-2">
            <h3 className="font-black text-white text-[10px] uppercase tracking-[0.4em] italic">Parallel_Log</h3>
          </div>
          <div ref={logRef} className="flex-1 bg-black/70 p-6 rounded-[32px] font-mono text-[9px] text-blue-300/60 overflow-y-auto no-scrollbar space-y-4 border border-white/5">
            {logs.map((l, i) => (
              <div key={i} className={`pl-4 border-l-2 ${l.includes('[OK]') ? 'border-emerald-500 text-emerald-400' : l.includes('[WARN]') ? 'border-amber-500 text-amber-400' : l.includes('[ERR]') ? 'border-red-500 text-red-400' : 'border-blue-900'}`}>
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