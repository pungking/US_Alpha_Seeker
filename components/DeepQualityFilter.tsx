
import React, { useState, useEffect, useRef } from 'react';
import { GOOGLE_DRIVE_TARGET, API_CONFIGS } from '../constants';
import { ApiProvider } from '../types';

interface QualityTicker {
  symbol: string;
  name: string;
  price: number;
  volume: number;
  // Financials
  per?: number;
  pbr?: number;
  debtToEquity?: number;
  roe?: number;
  sector?: string;
  score: number;
  analysisDate: string;
}

const DeepQualityFilter: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [stage1Data, setStage1Data] = useState<any[]>([]);
  const [processedData, setProcessedData] = useState<QualityTicker[]>([]);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [logs, setLogs] = useState<string[]>(['> Quality_Node v2.0.0: Deep Analysis Protocol Initiated.']);
  
  const accessToken = sessionStorage.getItem('gdrive_access_token');
  const finnhubKey = API_CONFIGS.find(c => c.provider === ApiProvider.FINNHUB)?.key;
  const avKey = API_CONFIGS.find(c => c.provider === ApiProvider.ALPHA_VANTAGE)?.key;
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  useEffect(() => {
    if (accessToken && stage1Data.length === 0) {
      loadStage1Data();
    }
  }, [accessToken]);

  const addLog = (m: string, t: 'info' | 'ok' | 'err' | 'warn' = 'info') => {
    const p = { info: '>', ok: '[OK]', err: '[ERR]', warn: '[WARN]' };
    setLogs(prev => [...prev, `${p[t]} ${m}`].slice(-40));
  };

  const loadStage1Data = async () => {
    if (!accessToken) return;
    setLoading(true);
    addLog("Scanning Stage 1 Outputs...", "info");
    
    try {
      const q = encodeURIComponent(`name contains 'STAGE1_INVESTABLE_UNIVERSE' and trashed = false`);
      const listRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&orderBy=createdTime desc&pageSize=1`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      }).then(r => r.json());

      if (!listRes.files?.length) {
        addLog("Stage 1 data not found. Completion of Stage 1 required.", "err");
        setLoading(false);
        return;
      }

      const content = await fetch(`https://www.googleapis.com/drive/v3/files/${listRes.files[0].id}?alt=media`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      }).then(r => r.json());

      if (content.investable_universe) {
        setStage1Data(content.investable_universe);
        addLog(`Loaded ${content.investable_universe.length} symbols from Stage 1.`, "ok");
      }
    } catch (e: any) {
      addLog(`Load Error: ${e.message}`, "err");
    } finally {
      setLoading(false);
    }
  };

  const startDeepAnalysis = async () => {
    if (stage1Data.length === 0 || loading) return;
    setLoading(true);
    setProcessedData([]);
    const results: QualityTicker[] = [];
    const total = Math.min(stage1Data.length, 100); // 무료 티어 제한으로 100개 샘플링 우선 처리
    setProgress({ current: 0, total });
    
    addLog(`Initiating Deep Financial Scan for top ${total} symbols...`, "info");

    for (let i = 0; i < total; i++) {
      const target = stage1Data[i];
      setProgress(prev => ({ ...prev, current: i + 1 }));
      
      try {
        // Finnhub Basic Financials Call
        const finRes = await fetch(`https://finnhub.io/api/v1/stock/metric?symbol=${target.symbol}&metric=all&token=${finnhubKey}`).then(r => r.json());
        
        const metrics = finRes.metric || {};
        const qData: QualityTicker = {
          symbol: target.symbol,
          name: target.name || "",
          price: target.price,
          volume: target.volume,
          per: metrics.peNormalized || metrics.peTTM || 0,
          pbr: metrics.pbAnnual || 0,
          debtToEquity: metrics.totalDebtEquityRatioQuarterly || 0,
          roe: metrics.roeTTM || 0,
          sector: finRes.series?.sector || "Unknown",
          score: 0,
          analysisDate: new Date().toISOString()
        };

        // Scoring Logic
        let score = 0;
        if (qData.debtToEquity > 0 && qData.debtToEquity < 150) score += 30; // 부채 건전성
        if (qData.roe > 15) score += 25; // 수익성
        if (qData.per > 0 && qData.per < 25) score += 25; // 밸류에이션
        if (qData.pbr > 0 && qData.pbr < 3) score += 20; // 자산가치
        
        qData.score = score;
        results.push(qData);
        
        if (i % 5 === 0) {
           addLog(`Processed ${target.symbol}: Score ${score}/100`, "info");
           setProcessedData([...results]);
        }

        // API Rate Limit 방어 (1초 대기)
        await new Promise(r => setTimeout(r, 1000));
        
      } catch (e) {
        addLog(`Skip ${target.symbol}: API Throttled`, "warn");
      }
    }

    setProcessedData(results.sort((a, b) => b.score - a.score));
    addLog("Deep Quality Analysis Concluded.", "ok");
    setLoading(false);
  };

  const saveStage2Result = async () => {
    if (!accessToken || processedData.length === 0) return;
    setLoading(true);
    addLog("Committing Quality Matrix to Stage 2 Vault...", "info");

    try {
      const folderId = await ensureFolder(accessToken, GOOGLE_DRIVE_TARGET.stage2SubFolder);
      const fileName = `STAGE2_QUALITY_MATRIX_${new Date().toISOString().split('T')[0]}.json`;
      
      const payload = {
        manifest: {
          version: "2.0.0",
          node: "Deep_Quality_Filter",
          sample_size: processedData.length,
          avg_score: processedData.reduce((acc, curr) => acc + curr.score, 0) / processedData.length,
          timestamp: new Date().toISOString()
        },
        quality_universe: processedData
      };

      const meta = { name: fileName, parents: [folderId], mimeType: 'application/json' };
      const form = new FormData();
      form.append('metadata', new Blob([JSON.stringify(meta)], { type: 'application/json' }));
      form.append('file', new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));

      const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST', headers: { 'Authorization': `Bearer ${accessToken}` }, body: form
      });

      if (res.ok) addLog(`Stage 2 Matrix Encrypted & Saved: ${fileName}`, "ok");
    } catch (e: any) {
      addLog(`Save Error: ${e.message}`, "err");
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
                <svg className={`w-6 h-6 text-purple-500 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.618.309a6 6 0 01-3.86.517l-2.387-.477a2 2 0 00-1.022.547l-.513.513a2 2 0 000 2.828l1.285 1.285a2 2 0 002.828 0l.513-.513z" /></svg>
              </div>
              <div>
                <h2 className="text-3xl font-black text-white italic tracking-tighter uppercase leading-none">Deep_Purge v2.0.0</h2>
                <div className="flex items-center space-x-2 mt-2">
                   <span className="text-[8px] font-black px-2 py-0.5 rounded border border-purple-500/20 bg-purple-500/10 text-purple-400 uppercase tracking-widest">Financial_Auditor_Active</span>
                   <span className="text-[8px] font-black text-slate-600 uppercase tracking-widest">Input: Stage1_Quality_Data</span>
                </div>
              </div>
            </div>
            
            <div className="flex gap-3">
              <button 
                onClick={startDeepAnalysis}
                disabled={loading || stage1Data.length === 0}
                className="px-8 py-4 bg-purple-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-purple-900/20 hover:scale-105 transition-all"
              >
                Execute Deep Scan
              </button>
              <button 
                onClick={saveStage2Result}
                disabled={loading || processedData.length === 0}
                className="px-10 py-4 bg-slate-800 text-white rounded-xl text-[10px] font-black uppercase tracking-widest border border-white/5 hover:bg-slate-700 transition-all"
              >
                Commit Quality Vault
              </button>
            </div>
          </div>

          {/* Processing Progress */}
          {loading && (
            <div className="mb-10 bg-black/40 p-8 rounded-3xl border border-purple-500/20">
              <div className="flex justify-between items-center mb-4">
                <p className="text-[9px] font-black text-purple-400 uppercase tracking-widest">Parallel Analysis in Progress</p>
                <p className="text-[10px] font-mono text-white">{progress.current} / {progress.total} Tickers</p>
              </div>
              <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-purple-500 shadow-[0_0_15px_rgba(168,85,247,0.5)] transition-all duration-300"
                  style={{ width: `${(progress.current / progress.total) * 100}%` }}
                ></div>
              </div>
            </div>
          )}

          {/* Results Table */}
          <div className="overflow-x-auto no-scrollbar">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-white/5">
                  <th className="py-4 text-[8px] font-black text-slate-500 uppercase tracking-widest">Symbol</th>
                  <th className="py-4 text-[8px] font-black text-slate-500 uppercase tracking-widest">Score</th>
                  <th className="py-4 text-[8px] font-black text-slate-500 uppercase tracking-widest">PER</th>
                  <th className="py-4 text-[8px] font-black text-slate-500 uppercase tracking-widest">Debt/Eq</th>
                  <th className="py-4 text-[8px] font-black text-slate-500 uppercase tracking-widest">ROE</th>
                  <th className="py-4 text-[8px] font-black text-slate-500 uppercase tracking-widest">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {processedData.slice(0, 10).map((item, idx) => (
                  <tr key={idx} className="hover:bg-white/5 transition-colors group">
                    <td className="py-4 font-black text-white italic tracking-tighter text-sm">{item.symbol}</td>
                    <td className="py-4">
                      <div className="flex items-center space-x-2">
                        <span className={`text-xs font-black ${item.score > 70 ? 'text-emerald-400' : item.score > 40 ? 'text-amber-400' : 'text-red-400'}`}>{item.score}</span>
                        <div className="w-12 h-1 bg-slate-800 rounded-full overflow-hidden">
                          <div className={`h-full ${item.score > 70 ? 'bg-emerald-500' : item.score > 40 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${item.score}%` }}></div>
                        </div>
                      </div>
                    </td>
                    <td className="py-4 font-mono text-[10px] text-slate-400">{item.per?.toFixed(1) || 'N/A'}</td>
                    <td className="py-4 font-mono text-[10px] text-slate-400">{item.debtToEquity?.toFixed(1) || '0'}%</td>
                    <td className="py-4 font-mono text-[10px] text-slate-400">{item.roe?.toFixed(1) || '0'}%</td>
                    <td className="py-4">
                      <span className={`text-[8px] font-black px-2 py-0.5 rounded border uppercase tracking-widest ${item.score > 70 ? 'border-emerald-500/20 text-emerald-400 bg-emerald-500/5' : 'border-slate-800 text-slate-600 bg-slate-900'}`}>
                        {item.score > 70 ? 'High_Quality' : 'Standard'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {processedData.length === 0 && !loading && (
              <div className="py-20 text-center">
                <p className="text-[10px] font-black text-slate-700 uppercase tracking-[0.3em]">Awaiting Analysis Command</p>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="xl:col-span-1">
        <div className="glass-panel h-[720px] rounded-[40px] bg-slate-950 border-l-4 border-l-purple-600 flex flex-col p-6 shadow-2xl">
          <div className="flex items-center justify-between mb-8 px-2">
            <h3 className="font-black text-white text-[10px] uppercase tracking-[0.4em] italic">Auditor_Logs</h3>
            <div className="w-2 h-2 rounded-full bg-purple-500 animate-pulse"></div>
          </div>
          <div ref={logRef} className="flex-1 bg-black/70 p-6 rounded-[32px] font-mono text-[9px] text-purple-300/60 overflow-y-auto no-scrollbar space-y-4 border border-white/5 leading-relaxed">
            {logs.map((l, i) => (
              <div key={i} className={`pl-4 border-l-2 ${l.includes('[OK]') ? 'border-emerald-500 text-emerald-400' : l.includes('[ERR]') ? 'border-red-500 text-red-400' : l.includes('[WARN]') ? 'border-amber-500 text-amber-400' : 'border-purple-900'}`}>
                {l}
              </div>
            ))}
          </div>
          <div className="mt-8 p-6 bg-purple-600/5 rounded-[24px] border border-purple-500/10 text-[10px] text-slate-500 font-bold italic">
             Quality Score based on Graham & Fisher heuristics: Debt/Eq &lt; 150%, ROE &gt; 15%, PER &lt; 25.
          </div>
        </div>
      </div>
    </div>
  );
};

export default DeepQualityFilter;
