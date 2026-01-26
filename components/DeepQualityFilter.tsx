
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
  const [logs, setLogs] = useState<string[]>(['> Quality_Node v2.4.0: Market Liquidity Protocol Ready.']);
  
  const accessToken = sessionStorage.getItem('gdrive_access_token');
  const finnhubKey = API_CONFIGS.find(c => c.provider === ApiProvider.FINNHUB)?.key;
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  const addLog = (m: string, t: 'info' | 'ok' | 'err' | 'warn' = 'info') => {
    const p = { info: '>', ok: '[OK]', err: '[ERR]', warn: '[WARN]' };
    setLogs(prev => [...prev, `${p[t]} ${m}`].slice(-40));
  };

  // AI에게 선별된 유니버스에 대한 브리핑 요청 (선별 로직 X, 분석 로직 O)
  const analyzeSectorDistribution = async (tickers: QualityTicker[]) => {
    const prompt = `
    [Role: Senior Market Analyst]
    Action: Analyze the Sector/Industry distribution of these top ${tickers.length} filtered stocks.
    Input Data (Top 20 Samples): ${JSON.stringify(tickers.slice(0, 20).map(t => ({ s: t.symbol, sec: t.sector, ind: t.industry })))}
    Task: Provide a 1-sentence summary of which sectors are currently dominating the liquidity in the market. (e.g., "Tech and Healthcare are leading the liquidity flow.")
    Language: Korean.
    `;

    try {
      setActiveBrain('Gemini 3 Pro');
      addLog("Requesting Sector Briefing from Gemini...", "info");
      const geminiKey = API_CONFIGS.find(c => c.provider === ApiProvider.GEMINI)?.key || process.env.API_KEY || "";
      const ai = new GoogleGenAI({ apiKey: geminiKey });
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
      });
      setAiAnalysis(response.text);
      addLog("AI Sector Analysis Complete.", "ok");
    } catch (e: any) {
        // Fallback to Perplexity
        try {
            setActiveBrain('Sonar Pro (Fallback)');
            const perplexityKey = API_CONFIGS.find(c => c.provider === ApiProvider.PERPLEXITY)?.key || "";
            const pRes = await fetch('https://api.perplexity.ai/chat/completions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${perplexityKey}` },
                body: JSON.stringify({
                    model: 'sonar-pro', 
                    messages: [{ role: "user", content: prompt }]
                })
            });
            const data = await pRes.json();
            setAiAnalysis(data.choices?.[0]?.message?.content);
            addLog("AI Sector Analysis Complete (Sonar).", "ok");
        } catch (err) {
            setAiAnalysis("AI Analysis Failed. Proceeding with raw data.");
        }
    }
  };

  const executeIntegratedScan = async () => {
    if (!accessToken || loading) return;
    setLoading(true);
    setAiAnalysis(null);
    setActiveBrain('Algo: Market Value');
    addLog("Step 1: Retrieving Purified Universe from Stage 1...", "info");
    
    try {
      const q = encodeURIComponent(`name contains 'STAGE1_PURIFIED_UNIVERSE' and trashed = false`);
      const listRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&orderBy=createdTime desc&pageSize=1`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      }).then(r => r.json());

      if (!listRes.files?.length) {
        addLog("Stage 1 input missing. Verify Stage 1 'Commit' is complete.", "err");
        setLoading(false);
        return;
      }

      const content = await fetch(`https://www.googleapis.com/drive/v3/files/${listRes.files[0].id}?alt=media`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      }).then(r => r.json());

      // 1. 알고리즘 선별: 거래대금(Price * Volume) 기준 상위 500개 (가장 확실한 방법)
      const rawEquities = (content.investable_universe || [])
        .map((s: any) => ({ ...s, marketValue: (s.price || 0) * (s.volume || 0) }))
        .sort((a: any, b: any) => b.marketValue - a.marketValue); // 내림차순 정렬

      const targetCount = 500;
      const finalTargets = rawEquities.slice(0, targetCount);
      
      addLog(`Algorithm Selected Top ${targetCount} by Liquidity (Highest Reliability).`, "ok");
      setProgress({ current: 0, total: finalTargets.length });
      
      const results: QualityTicker[] = [];
      
      // 2. Finnhub 정밀 스캔
      addLog(`Step 2: Deep Fundamental Scan (Finnhub) for ${finalTargets.length} assets...`, "info");

      for (let i = 0; i < finalTargets.length; i++) {
        const target = finalTargets[i];
        setProgress(prev => ({ ...prev, current: i + 1 }));
        
        try {
          const [finRes, profRes] = await Promise.all([
            fetch(`https://finnhub.io/api/v1/stock/metric?symbol=${target.symbol}&metric=all&token=${finnhubKey}`).then(r => r.json()),
            fetch(`https://finnhub.io/api/v1/stock/profile2?symbol=${target.symbol}&token=${finnhubKey}`).then(r => r.json())
          ]);

          const metrics = finRes.metric || {};
          
          results.push({
            symbol: target.symbol,
            name: profRes.name || target.name || "N/A",
            price: target.price, volume: target.volume, marketValue: target.marketValue,
            type: profRes.type || "Equity", per: metrics.peNormalized || 0,
            pbr: metrics.pbAnnual || 0, debtToEquity: metrics.totalDebtEquityRatioQuarterly || 0,
            roe: metrics.roeTTM || 0, sector: profRes.finnhubIndustry || "N/A",
            industry: profRes.finnhubIndustry || "N/A", lastUpdate: new Date().toISOString()
          });

          if (i % 5 === 0) setProcessedData([...results]);
          await new Promise(r => setTimeout(r, 800)); // Rate Limit 준수
        } catch (e) {
          addLog(`Node Skip: ${target.symbol} latency issues.`, "warn");
          await new Promise(r => setTimeout(r, 2000));
        }
      }

      setProcessedData(results);
      
      // 3. AI에게 결과 요약 요청 (병렬 처리)
      analyzeSectorDistribution(results);

      addLog(`Scan Complete. Committing ${results.length} nodes to Quality Vault...`, "ok");

      const folderId = await ensureFolder(accessToken, GOOGLE_DRIVE_TARGET.stage2SubFolder);
      const fileName = `STAGE2_ELITE_UNIVERSE_${new Date().toISOString().split('T')[0]}.json`;
      const payload = {
        manifest: { 
            version: "2.4.0", 
            node: "Deep_Quality_Scan", 
            mode: "ALGO_LIQUIDITY_SORT",
            count: results.length, 
            timestamp: new Date().toISOString() 
        },
        elite_universe: results
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
      addLog(`Integrated Error: ${e.message}`, "err");
    } finally {
      setLoading(false);
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
        <div className="glass-panel p-8 md:p-10 rounded-[40px] border-t-2 border-t-purple-500 shadow-2xl bg-slate-900/40 relative overflow-hidden">
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-10 gap-6">
            <div className="flex items-center space-x-6">
              <div className={`w-14 h-14 rounded-3xl bg-purple-600/10 flex items-center justify-center border border-purple-500/20 ${loading ? 'animate-pulse' : ''}`}>
                 <svg className={`w-6 h-6 text-purple-500 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
              </div>
              <div>
                <h2 className="text-3xl font-black text-white italic tracking-tighter uppercase leading-none">Elite_Scanner v2.4.0</h2>
                <div className="flex items-center space-x-2 mt-2">
                   <span className="text-[8px] font-black px-2 py-0.5 rounded border border-purple-500/20 bg-purple-500/10 text-purple-400 uppercase tracking-widest">
                     Mode: Algo-Liquidity Sort (High Accuracy)
                   </span>
                </div>
              </div>
            </div>
            <button onClick={executeIntegratedScan} disabled={loading} className="px-12 py-5 bg-purple-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:scale-105 active:scale-95 transition-all disabled:opacity-50 shadow-xl shadow-purple-900/20">
              {loading ? 'Scanning Liquidity & Fundamentals...' : 'Execute Elite Scan'}
            </button>
          </div>

          <div className="bg-black/40 p-8 rounded-3xl border border-white/5 mb-10">
              <div className="flex justify-between items-center mb-6">
                <p className="text-[9px] font-black text-purple-400 uppercase tracking-widest">Extraction Progress</p>
                <p className="text-xl font-mono font-black text-white italic">{progress.current} / {progress.total}</p>
              </div>
              <div className="h-2 bg-slate-800 rounded-full overflow-hidden p-0.5">
                <div className="h-full bg-gradient-to-r from-purple-700 to-purple-400 transition-all duration-300 rounded-full" style={{ width: `${(progress.current / (progress.total || 1)) * 100}%` }}></div>
              </div>
          </div>

          {aiAnalysis && (
             <div className="p-6 rounded-[24px] bg-indigo-500/10 border border-indigo-500/20 animate-in fade-in slide-in-from-top-2">
                <div className="flex items-center gap-2 mb-2">
                   <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse"></span>
                   <p className="text-[8px] font-black text-indigo-400 uppercase tracking-widest">AI Sector Briefing ({activeBrain})</p>
                </div>
                <p className="text-xs text-indigo-100 font-medium leading-relaxed italic">"{aiAnalysis}"</p>
             </div>
          )}
        </div>
      </div>

      <div className="xl:col-span-1">
        <div className="glass-panel h-[720px] rounded-[40px] bg-slate-950 border-l-4 border-l-purple-600 flex flex-col p-6 shadow-2xl overflow-hidden">
          <div className="flex items-center justify-between mb-8 px-2">
            <h3 className="font-black text-white text-[10px] uppercase tracking-[0.4em] italic">Elite_Terminal</h3>
          </div>
          <div ref={logRef} className="flex-1 bg-black/70 p-6 rounded-[32px] font-mono text-[9px] text-purple-300/60 overflow-y-auto no-scrollbar space-y-4 border border-white/5">
            {logs.map((l, i) => (
              <div key={i} className={`pl-4 border-l-2 ${l.includes('[OK]') ? 'border-emerald-500 text-emerald-400 bg-emerald-500/5' : l.includes('[ERR]') ? 'border-red-500 text-red-400 bg-red-500/5' : l.includes('[WARN]') ? 'border-amber-500 text-amber-400 bg-amber-500/5' : 'border-purple-900'}`}>
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
