import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI } from "@google/genai";
import { GOOGLE_DRIVE_TARGET, API_CONFIGS } from '../constants';
import { ApiProvider } from '../types';
import { trackUsage } from '../services/intelligenceService';

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
  qualityScore?: number;
  sector?: string;
  industry?: string;
  lastUpdate: string;
  source?: string;
}

interface Props {
  autoStart?: boolean;
  onComplete?: () => void;
}

const DeepQualityFilter: React.FC<Props> = ({ autoStart, onComplete }) => {
  const [loading, setLoading] = useState(false);
  const [processedData, setProcessedData] = useState<QualityTicker[]>([]);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  
  const [timeStats, setTimeStats] = useState({ elapsed: 0, eta: 0 });
  const startTimeRef = useRef<number>(0);
  const hasStartedRef = useRef<boolean>(false);

  const [activeBrain, setActiveBrain] = useState<string>('Standby');
  const [networkStatus, setNetworkStatus] = useState<string>('Ready: Adaptive Engine');
  
  const [aiStatus, setAiStatus] = useState<'IDLE' | 'ANALYZING' | 'SUCCESS' | 'FAILED'>('IDLE');
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [sourceStats, setSourceStats] = useState({ fmp: 0, finnhub: 0, polygon: 0 });
  
  const [fmpDepleted, setFmpDepleted] = useState(false);
  const [logs, setLogs] = useState<string[]>(['> Quality_Node v5.0.4: Neural Fallback Engaged.']);
  
  const accessToken = sessionStorage.getItem('gdrive_access_token');
  const finnhubKey = API_CONFIGS.find(c => c.provider === ApiProvider.FINNHUB)?.key;
  const polygonKey = API_CONFIGS.find(c => c.provider === ApiProvider.POLYGON)?.key;
  const fmpKey = API_CONFIGS.find(c => c.provider === ApiProvider.FMP)?.key;
  const geminiConfig = API_CONFIGS.find(c => c.provider === ApiProvider.GEMINI);
  const perplexityConfig = API_CONFIGS.find(c => c.provider === ApiProvider.PERPLEXITY);
  
  const logRef = useRef<HTMLDivElement>(null);

  const BATCH_SIZE = 5; 
  const DELAY_TURBO = 300;   
  const DELAY_SAFE = 2200;   
  const TARGET_SELECTION_COUNT = 250; // [FIXED] 250종목으로 제한하여 3단계로 전달
  
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
    if (autoStart && !loading && !hasStartedRef.current) {
        addLog("AUTO-PILOT: Engaging Quality Sieve Sequence...", "signal");
        executeDeepQualityScan();
    }
  }, [autoStart]);

  const addLog = (m: string, t: 'info' | 'ok' | 'err' | 'warn' | 'signal' = 'info') => {
    const p = { info: '>', ok: '[OK]', err: '[ERR]', warn: '[WARN]', signal: '[AUTO]' };
    setLogs(prev => [...prev, `${p[t]} ${m}`].slice(-60));
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

  const fetchTickerData = async (target: any): Promise<QualityTicker | null> => {
    if (!target || !target.symbol) return null;
    
    try {
      let metrics: any = {};
      let profileData: any = {};
      let metricsSource = "";
      let profileSource = "";

      if (!fmpDepleted) {
          try {
            const [ratioRes, profileRes] = await Promise.all([
                fetch(`https://financialmodelingprep.com/api/v3/ratios-ttm/${target.symbol}?apikey=${fmpKey}`),
                fetch(`https://financialmodelingprep.com/api/v3/profile/${target.symbol}?apikey=${fmpKey}`)
            ]);
            if (ratioRes.status === 429) { setFmpDepleted(true); throw new Error("FMP_LIMIT"); }
            if (ratioRes.ok) {
                const data = await ratioRes.json();
                if (data && Array.isArray(data) && data.length > 0) {
                    const m = data[0];
                    metrics = { per: Number(m.peRatioTTM || 0), pbr: Number(m.priceToBookRatioTTM || 0), debt: Number(m.debtEquityRatioTTM || 0), roe: Number(m.returnOnEquityTTM || 0) * 100 };
                    metricsSource = "FMP";
                }
            }
            if (profileRes.ok) {
                const data = await profileRes.json();
                if (data && Array.isArray(data) && data.length > 0) {
                    profileData = { name: data[0].companyName, sector: data[0].sector, industry: data[0].industry };
                    profileSource = "FMP";
                }
            }
          } catch (e: any) { if (e.message === "FMP_LIMIT") throw e; }
      }

      if (!metrics.per && !metrics.roe) {
          try {
            const fhRes = await fetch(`https://finnhub.io/api/v1/stock/metric?symbol=${target.symbol}&metric=all&token=${finnhubKey}`);
            if (fhRes.status === 429) throw new Error("FINNHUB_LIMIT");
            if (fhRes.ok) {
                const data = await fhRes.json();
                metrics = { per: Number(data.metric?.peNormalized || 0), pbr: Number(data.metric?.pbAnnual || 0), debt: Number(data.metric?.totalDebtEquityRatioQuarterly || 0), roe: Number(data.metric?.roeTTM || 0) };
                metricsSource = "Finnhub";
            }
          } catch(e: any) { if (e.message === "FINNHUB_LIMIT") throw e; }
      }

      if (!profileData.name) {
          try {
            const polyRes = await fetch(`https://api.polygon.io/v3/reference/tickers/${target.symbol}?apiKey=${polygonKey}`);
            if (polyRes.ok) {
                const p = await polyRes.json();
                if (p.results) { profileData = { name: p.results.name, sector: p.results.sic_description || "Unknown" }; profileSource = "Polygon"; }
            }
          } catch(e) {}
      }

      if (!metrics.per && !metrics.roe) return null;
      const qScore = Number(((metrics.roe || 0) * 2.0 - (metrics.debt || 0) * 0.5 + Math.min(20, Math.log10(target.marketValue || 1000000) * 2)).toFixed(2));

      return {
        symbol: target.symbol, name: profileData.name || target.name || "N/A", price: target.price, volume: target.volume, marketValue: target.marketValue || 0, type: "Equity", 
        per: metrics.per, pbr: metrics.pbr, debtToEquity: metrics.debt, roe: metrics.roe, qualityScore: qScore, sector: profileData.sector || "N/A", industry: profileData.industry || "N/A", lastUpdate: new Date().toISOString(), source: `M:${metricsSource}/P:${profileSource}`
      };
    } catch (e: any) { throw e; }
  };

  const executeDeepQualityScan = async () => {
    if (!accessToken || loading) return;
    setLoading(true);
    hasStartedRef.current = true;
    startTimeRef.current = Date.now();
    setProcessedData([]);
    setSourceStats({ fmp: 0, finnhub: 0, polygon: 0 });
    addLog("Phase 1: Loading Purified Matrix...", "info");

    try {
      const q = encodeURIComponent(`name contains 'STAGE1_PURIFIED_UNIVERSE' and trashed = false`);
      const listRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&orderBy=modifiedTime desc&pageSize=1`, { headers: { 'Authorization': `Bearer ${accessToken}` } }).then(r => r.json());
      
      if (!listRes.files?.length) throw new Error("Stage 1 missing.");

      const content = await fetch(`https://www.googleapis.com/drive/v3/files/${listRes.files[0].id}?alt=media`, { headers: { 'Authorization': `Bearer ${accessToken}` } }).then(r => r.json());
      let targets = (content.investable_universe || []).sort((a: any, b: any) => (Number(b.price)*Number(b.volume)) - (Number(a.price)*Number(a.volume)));
      
      const total = targets.length;
      addLog(`Universe Loaded: ${total} assets. Entering Resilient Scan.`, "ok");
      setProgress({ current: 0, total });
      
      const validResults: QualityTicker[] = [];
      let currentIndex = 0;
      let consecutiveErrors = 0;

      while (currentIndex < total) {
          const isTurbo = !fmpDepleted;
          setNetworkStatus(isTurbo ? `Turbo (FMP) - Batch 5` : `Resilient (Serial) - Single`);
          
          const currentBatchSize = isTurbo ? BATCH_SIZE : 1;
          const batch = targets.slice(currentIndex, currentIndex + currentBatchSize);
          
          try {
              let results = [];
              if (isTurbo) {
                results = await Promise.all(batch.map((t: any) => fetchTickerData(t)));
              } else {
                for (const t of batch) {
                  results.push(await fetchTickerData(t));
                  await new Promise(r => setTimeout(r, 150)); 
                }
              }
              
              results.forEach(r => {
                  if (r && r.symbol) {
                      validResults.push(r);
                      if (validResults.length % 10 === 0) addLog(`Validated ${r.symbol}... (Captured: ${validResults.length})`, "ok");
                      setSourceStats(prev => ({
                        fmp: r.source?.includes("FMP") ? prev.fmp + 1 : prev.fmp,
                        finnhub: r.source?.includes("Finnhub") ? prev.finnhub + 1 : prev.finnhub,
                        polygon: r.source?.includes("Polygon") ? prev.polygon + 1 : prev.polygon
                      }));
                  }
              });

              currentIndex += currentBatchSize;
              consecutiveErrors = 0;
              setProgress({ current: Math.min(currentIndex, total), total });
              await new Promise(r => setTimeout(r, isTurbo ? DELAY_TURBO : DELAY_SAFE));

          } catch (e: any) {
              const waitTime = Math.min(60000, (consecutiveErrors + 1) * 15000);
              addLog(`API Limitation (${e.message}). Cooling down ${waitTime/1000}s...`, "warn");
              await new Promise(r => setTimeout(r, waitTime));
              consecutiveErrors++;
              if (consecutiveErrors > 5) { addLog("Critical Node Failure. Skipping Batch.", "err"); currentIndex += currentBatchSize; consecutiveErrors = 0; }
          }
      }

      setProgress({ current: total, total });
      addLog(`Scan Finalized. ${validResults.length} Assets Verified.`, "ok");
      
      const eliteSurvivors = validResults.sort((a, b) => (b.qualityScore || 0) - (a.qualityScore || 0)).slice(0, TARGET_SELECTION_COUNT);
      setProcessedData(eliteSurvivors);
      
      if (eliteSurvivors.length > 0) {
        setAiStatus('ANALYZING');
        let aiSuccess = false;
        const geminiKey = process.env.API_KEY || "";
        const perplexityKey = perplexityConfig?.key || "";
        const prompt = `Audit Sector for ${eliteSurvivors.length} stocks. Top 3: ${eliteSurvivors.slice(0, 3).map(s => s.symbol).join(',')}. Return JSON: {"dominantSector":"string","insight":"10words_korean"}`;

        if (geminiKey) {
            try {
                const ai = new GoogleGenAI({ apiKey: geminiKey });
                const aiRes = await ai.models.generateContent({ 
                    model: 'gemini-3-flash-preview', 
                    contents: prompt, 
                    config: { responseMimeType: "application/json" } 
                });
                const res = sanitizeJson(aiRes.text || "");
                if (res) {
                    setAiAnalysis(`[${res.dominantSector}] ${res.insight}`);
                    setAiStatus('SUCCESS');
                    trackUsage(ApiProvider.GEMINI, aiRes.usageMetadata?.totalTokenCount || 0);
                    aiSuccess = true;
                }
            } catch (err: any) {
                addLog(`Gemini Offline (${err.message}). Trying Sonar...`, "warn");
            }
        }

        if (!aiSuccess && perplexityKey) {
            try {
                const pRes = await fetch('https://api.perplexity.ai/chat/completions', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${perplexityKey}` },
                    body: JSON.stringify({
                        model: 'sonar', 
                        messages: [{ role: "user", content: prompt }]
                    })
                });
                const pData = await pRes.json();
                const res = sanitizeJson(pData.choices?.[0]?.message?.content || "");
                if (res) {
                    setAiAnalysis(`[${res.dominantSector}] ${res.insight}`);
                    setAiStatus('SUCCESS');
                    if (pData.usage) trackUsage(ApiProvider.PERPLEXITY, pData.usage.total_tokens || 0);
                    aiSuccess = true;
                }
            } catch (err: any) {
                addLog(`Sonar Offline (${err.message}). Skipping AI Analysis.`, "err");
            }
        }

        if (!aiSuccess) {
            setAiStatus('FAILED');
            setAiAnalysis("AI Nodes Offline: Analysis Skipped.");
        }
      }

      const folderId = await ensureFolder(accessToken, GOOGLE_DRIVE_TARGET.stage2SubFolder);
      const fileName = `STAGE2_ELITE_UNIVERSE_${new Date().toISOString().split('T')[0]}.json`;
      const payload = { manifest: { version: "5.0.4", count: eliteSurvivors.length, timestamp: new Date().toISOString() }, elite_universe: eliteSurvivors };

      const meta = { name: fileName, parents: [folderId], mimeType: 'application/json' };
      const form = new FormData();
      form.append('metadata', new Blob([JSON.stringify(meta)], { type: 'application/json' }));
      form.append('file', new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));

      const uploadRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', { 
        method: 'POST', 
        headers: { 'Authorization': `Bearer ${accessToken}` }, 
        body: form 
      });

      if (uploadRes.ok) {
        addLog(`Success: Vault Updated with ${eliteSurvivors.length} Elite assets.`, "ok");
      }
      
      if (onComplete) onComplete();

    } catch (e: any) { 
      addLog(`Fatal: ${e.message}`, "err"); 
    } finally { 
      setLoading(false); 
      setTimeout(() => { hasStartedRef.current = false; }, 5000);
    }
  };

  const ensureFolder = async (token: string, name: string) => {
    let rootId = GOOGLE_DRIVE_TARGET.rootFolderId;
    const rootName = GOOGLE_DRIVE_TARGET.rootFolderName;
    
    try {
        const qRoot = encodeURIComponent(`name = '${rootName}' and 'root' in parents and trashed = false`);
        const resRoot = await fetch(`https://www.googleapis.com/drive/v3/files?q=${qRoot}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        }).then(r => r.json());
        
        if (resRoot.files && resRoot.files.length > 0) {
            rootId = resRoot.files[0].id;
        } else {
            const createRoot = await fetch(`https://www.googleapis.com/drive/v3/files`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: rootName, parents: ['root'], mimeType: 'application/vnd.google-apps.folder' })
            }).then(r => r.json());
            if (createRoot.id) rootId = createRoot.id;
        }
    } catch (e) {
        console.warn("Root folder recovery failed.");
    }

    const q = encodeURIComponent(`name = '${name}' and '${rootId}' in parents and trashed = false`);
    const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}`, { headers: { 'Authorization': `Bearer ${token}` } }).then(r => r.json());
    if (res.files?.length > 0) return res.files[0].id;
    return await fetch(`https://www.googleapis.com/drive/v3/files`, {
      method: 'POST', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, parents: [rootId], mimeType: 'application/vnd.google-apps.folder' })
    }).then(r => r.json()).then(r => r.id);
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
      <div className="xl:col-span-3 space-y-6">
        <div className="glass-panel p-5 md:p-8 lg:p-10 rounded-[32px] md:rounded-[40px] border-t-2 border-t-blue-500 shadow-2xl bg-slate-900/40 relative overflow-hidden">
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-6 md:mb-10 gap-6">
            <div className="flex items-center space-x-6">
              <div className={`w-12 h-12 rounded-3xl bg-blue-600/10 flex items-center justify-center border border-blue-500/20 ${loading ? 'animate-pulse' : ''}`}>
                 <svg className={`w-5 h-5 text-blue-400 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
              </div>
              <div>
                <h2 className="text-xl md:text-3xl font-black text-white italic tracking-tighter uppercase leading-none">Deep_Quality v5.0.4</h2>
                <div className="flex flex-col mt-2 gap-1">
                   <div className="flex flex-wrap items-center gap-2">
                        <span className={`text-[8px] font-black px-2 py-0.5 rounded border uppercase tracking-widest ${loading ? 'border-blue-400 text-blue-400 animate-pulse' : 'border-blue-500/20 text-blue-400'}`}>
                            {loading ? `Scanning: ${progress.current}/${progress.total}` : 'Engine Ready'}
                        </span>
                        <span className="text-[8px] font-black px-2 py-0.5 rounded border border-purple-500/20 bg-purple-500/10 text-purple-400 uppercase tracking-widest">
                            {networkStatus}
                        </span>
                         {autoStart && <span className="text-[8px] px-2 py-0.5 bg-rose-600 text-white rounded font-black uppercase animate-pulse">AUTO PILOT</span>}
                   </div>
                   {loading && <p className="text-[8px] font-mono text-slate-400 uppercase">Elapsed: {Math.floor(timeStats.elapsed/60)}m {timeStats.elapsed%60}s | ETA: {Math.floor(timeStats.eta/60)}m {timeStats.eta%60}s</p>}
                </div>
              </div>
            </div>
            <button onClick={executeDeepQualityScan} disabled={loading} className="w-full lg:w-auto px-8 py-4 bg-blue-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl active:scale-95 transition-all">
              {loading ? 'Resilient Scan Active...' : 'Execute Deep Quality Scan'}
            </button>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-8 mb-6 md:mb-10">
              <div className="bg-black/40 p-6 md:p-8 rounded-3xl border border-white/5">
                <div className="flex justify-between items-center mb-6">
                  <p className="text-[9px] font-black text-blue-400 uppercase tracking-widest">Integrity Progress</p>
                  <p className="text-xl font-mono font-black text-white italic">{loading ? `${(progress.current / (progress.total || 1) * 100).toFixed(1)}%` : '0%'}</p>
                </div>
                <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                  <div className={`h-full transition-all duration-300 ${fmpDepleted ? 'bg-amber-500' : 'bg-blue-500'}`} style={{ width: `${(progress.current / (progress.total || 1)) * 100}%` }}></div>
                </div>
                <p className="text-[8px] text-slate-500 mt-3 font-bold uppercase tracking-widest">Captured: {processedData.length} Valid Elite Assets</p>
              </div>
              <div className={`bg-blue-900/10 p-6 md:p-8 rounded-3xl border border-blue-500/10 relative overflow-hidden`}>
                 <p className="text-[9px] font-black uppercase tracking-widest text-blue-400 mb-2">AI Sector Insight</p>
                 <p className="text-xs font-bold text-white italic">{aiAnalysis || "Awaiting scan completion..."}</p>
              </div>
          </div>
        </div>
      </div>
      <div className="xl:col-span-1">
        <div className="glass-panel h-[400px] lg:h-[600px] rounded-[32px] bg-slate-950 border-l-4 border-l-blue-600 flex flex-col p-6 shadow-2xl overflow-hidden">
          <h3 className="font-black text-white text-[10px] uppercase tracking-[0.4em] mb-4 italic">Quality_Log</h3>
          <div ref={logRef} className="flex-1 bg-black/70 p-6 rounded-[32px] font-mono text-[9px] text-blue-300/60 overflow-y-auto no-scrollbar space-y-4 border border-white/5">
            {logs.map((l, i) => (
              <div key={i} className={`pl-4 border-l-2 ${l.includes('[OK]') ? 'border-emerald-500 text-emerald-400' : l.includes('[WARN]') ? 'border-amber-500 text-amber-400' : 'border-blue-900'}`}>{l}</div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DeepQualityFilter;
