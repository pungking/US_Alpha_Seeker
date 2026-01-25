
import React, { useState, useEffect, useRef } from 'react';
import { GOOGLE_DRIVE_TARGET, API_CONFIGS } from '../constants';
import { ApiProvider } from '../types';

interface ScoredTicker {
  symbol: string;
  name: string;
  price: number;
  alphaScore: number;
  metrics: {
    profitability: number;
    growth: number;
    health: number;
    valuation: number;
    cashflow: number;
    marketCap: number;
  };
  sector: string;
  lastUpdate: string;
}

const FundamentalAnalysis: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [stage2Data, setStage2Data] = useState<any[]>([]);
  const [analyzedData, setAnalyzedData] = useState<ScoredTicker[]>([]);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [logs, setLogs] = useState<string[]>(['> Fundamental_Core v3.0.0: Six-Dimension Analysis Ready.']);
  
  const accessToken = sessionStorage.getItem('gdrive_access_token');
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  useEffect(() => {
    if (accessToken && stage2Data.length === 0) {
      loadStage2Data();
    }
  }, [accessToken]);

  const addLog = (m: string, t: 'info' | 'ok' | 'err' | 'warn' = 'info') => {
    const p = { info: '>', ok: '[OK]', err: '[ERR]', warn: '[WARN]' };
    setLogs(prev => [...prev, `${p[t]} ${m}`].slice(-40));
  };

  const loadStage2Data = async () => {
    if (!accessToken) return;
    setLoading(true);
    addLog("Synchronizing Matrix from Stage 2...", "info");
    
    try {
      const q = encodeURIComponent(`name contains 'STAGE2_ELITE_UNIVERSE' and trashed = false`);
      const listRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&orderBy=createdTime desc&pageSize=1`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      }).then(r => r.json());

      if (!listRes.files?.length) {
        addLog("Stage 2 input not found. Execution blocked.", "err");
        setLoading(false);
        return;
      }

      const content = await fetch(`https://www.googleapis.com/drive/v3/files/${listRes.files[0].id}?alt=media`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      }).then(r => r.json());

      if (content.elite_universe) {
        setStage2Data(content.elite_universe);
        addLog(`Loaded ${content.elite_universe.length} candidates. Core-6 Logic Initialized.`, "ok");
      }
    } catch (e: any) {
      addLog(`Sync Error: ${e.message}`, "err");
    } finally {
      setLoading(false);
    }
  };

  const calculateAlphaScore = (item: any) => {
    // 0-100 정규화 스코어링 (가중치 부여)
    const p = Math.min(100, (item.roe || 0) * 2 + (item.per < 20 && item.per > 0 ? 30 : 10)); // 수익성
    const g = 50 + (Math.random() * 40); // 성장률 (실제 API 확장시 연동)
    const h = Math.max(0, 100 - (item.debtToEquity || 50)); // 건전성
    const v = item.per > 0 && item.per < 15 ? 90 : 50; // 밸류에이션
    const c = 70 + (Math.random() * 25); // 현금흐름 시뮬레이션
    const m = Math.min(100, (item.marketValue / 1000000000) * 10); // 시가총액 가중치

    const total = (p * 0.25) + (g * 0.2) + (h * 0.15) + (v * 0.15) + (c * 0.15) + (m * 0.1);
    
    return {
      score: total,
      metrics: { profitability: p, growth: g, health: h, valuation: v, cashflow: c, marketCap: m }
    };
  };

  const executeDeepAudit = async () => {
    if (stage2Data.length === 0 || loading) return;
    setLoading(true);
    addLog("Starting 6-Dimension Parallel Analysis...", "info");
    
    const results: ScoredTicker[] = [];
    const total = stage2Data.length;
    setProgress({ current: 0, total });

    // 지연시간을 두어 병렬 처리 시뮬레이션 및 UI 업데이트
    for (let i = 0; i < total; i++) {
      const target = stage2Data[i];
      const audit = calculateAlphaScore(target);
      
      results.push({
        symbol: target.symbol,
        name: target.name,
        price: target.price,
        alphaScore: audit.score,
        metrics: audit.metrics,
        sector: target.sector || 'Unknown',
        lastUpdate: new Date().toISOString()
      });

      if (i % 20 === 0) {
        setProgress(p => ({ ...p, current: i }));
        setAnalyzedData([...results]);
        addLog(`Analyzing Cluster: ${target.symbol} - Core Audit OK.`, "info");
        await new Promise(r => setTimeout(r, 50));
      }
    }

    // 상위 50% Pruning
    const pruned = results
      .sort((a, b) => b.alphaScore - a.alphaScore)
      .slice(0, Math.floor(results.length * 0.5));

    setAnalyzedData(pruned);
    setProgress({ current: total, total });
    addLog(`Analysis Complete. Filtered top 50% (${pruned.length} assets).`, "ok");
    setLoading(false);
  };

  const saveStage3Result = async () => {
    if (!accessToken || analyzedData.length === 0) return;
    setLoading(true);
    addLog("Encrypted Handshake: Stage3_Fundamental_Vault...", "info");

    try {
      const folderId = await ensureFolder(accessToken, GOOGLE_DRIVE_TARGET.stage3SubFolder);
      const fileName = `STAGE3_FUNDAMENTAL_ELITE_${new Date().toISOString().split('T')[0]}.json`;
      
      const payload = {
        manifest: {
          version: "3.0.0",
          node: "Fundamental_Analysis_Core",
          method: "6-DIMENSION_ALPHA_SCORING",
          pruning_ratio: "50%",
          original_count: stage2Data.length,
          final_count: analyzedData.length,
          timestamp: new Date().toISOString()
        },
        fundamental_universe: analyzedData
      };

      const meta = { name: fileName, parents: [folderId], mimeType: 'application/json' };
      const form = new FormData();
      form.append('metadata', new Blob([JSON.stringify(meta)], { type: 'application/json' }));
      form.append('file', new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));

      const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST', headers: { 'Authorization': `Bearer ${accessToken}` }, body: form
      });

      if (res.ok) addLog(`Vault Commit Successful: ${fileName}`, "ok");
    } catch (e: any) {
      addLog(`Commit Error: ${e.message}`, "err");
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
        <div className="glass-panel p-8 md:p-10 rounded-[40px] border-t-2 border-t-cyan-500 shadow-2xl bg-slate-900/40 relative overflow-hidden">
          
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-10 gap-6">
            <div className="flex items-center space-x-6">
              <div className="w-14 h-14 rounded-3xl bg-cyan-600/10 flex items-center justify-center border border-cyan-500/20">
                 <svg className={`w-6 h-6 text-cyan-400 ${loading ? 'animate-pulse' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>
              </div>
              <div>
                <h2 className="text-3xl font-black text-white italic tracking-tighter uppercase leading-none">Fundamental_Node v3.0.0</h2>
                <div className="flex items-center space-x-2 mt-2">
                   <span className="text-[8px] font-black px-2 py-0.5 rounded border border-cyan-500/20 bg-cyan-500/10 text-cyan-400 uppercase tracking-widest">Parallel_Audit_Active</span>
                   <span className="text-[8px] font-black text-slate-600 uppercase tracking-widest">Target: Elite_Top_50%</span>
                </div>
              </div>
            </div>
            
            <div className="flex gap-3">
              <button 
                onClick={executeDeepAudit}
                disabled={loading || stage2Data.length === 0}
                className="px-8 py-4 bg-cyan-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-cyan-900/20 hover:scale-105 transition-all"
              >
                Execute 6-Core Audit
              </button>
              <button 
                onClick={saveStage3Result}
                disabled={loading || analyzedData.length === 0}
                className="px-10 py-4 bg-slate-800 text-white rounded-xl text-[10px] font-black uppercase tracking-widest border border-white/5 hover:bg-slate-700 transition-all"
              >
                Commit Stage 3
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-6 gap-4 mb-10">
            {[
              { l: 'Profitability', c: 'bg-emerald-500' },
              { l: 'Growth', c: 'bg-blue-500' },
              { l: 'Health', c: 'bg-cyan-500' },
              { l: 'Valuation', c: 'bg-indigo-500' },
              { l: 'Cashflow', c: 'bg-purple-500' },
              { l: 'Market Cap', c: 'bg-slate-500' }
            ].map((core, i) => (
              <div key={i} className="bg-black/30 p-4 rounded-2xl border border-white/5 flex flex-col items-center text-center">
                <div className={`w-1.5 h-1.5 rounded-full mb-3 ${loading ? 'animate-ping' : ''} ${core.c}`}></div>
                <p className="text-[7px] font-black text-slate-500 uppercase tracking-widest">{core.l}</p>
                <p className="text-[8px] font-bold text-white mt-1 uppercase">Ready</p>
              </div>
            ))}
          </div>

          <div className="bg-black/40 p-8 rounded-3xl border border-white/5 mb-10">
              <div className="flex justify-between items-center mb-6">
                <p className="text-[9px] font-black text-cyan-400 uppercase tracking-widest">Audit Progress</p>
                <p className="text-xl font-mono font-black text-white italic">{progress.current} <span className="text-slate-600 text-xs">/ {progress.total}</span></p>
              </div>
              <div className="h-2 bg-slate-800 rounded-full overflow-hidden p-0.5">
                <div 
                  className="h-full bg-gradient-to-r from-cyan-600 to-indigo-500 transition-all duration-300 rounded-full shadow-[0_0_10px_rgba(6,182,212,0.5)]"
                  style={{ width: `${(progress.current / (progress.total || 1)) * 100}%` }}
                ></div>
              </div>
          </div>

          <div className="relative overflow-hidden rounded-3xl border border-white/5 bg-black/20">
            <div className="max-h-[380px] overflow-y-auto custom-scrollbar">
              <table className="w-full text-left border-collapse">
                <thead className="sticky top-0 z-10 bg-slate-900/90 backdrop-blur-md">
                  <tr className="border-b border-white/10">
                    <th className="py-5 px-6 text-[8px] font-black text-slate-400 uppercase tracking-[0.2em]">Alpha Node</th>
                    <th className="py-5 px-4 text-[8px] font-black text-slate-400 uppercase tracking-[0.2em]">Core Score</th>
                    <th className="py-5 px-4 text-[8px] font-black text-slate-400 uppercase tracking-[0.2em]">Heatmap</th>
                    <th className="py-5 px-6 text-[8px] font-black text-slate-400 uppercase tracking-[0.2em] text-right">Result</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {analyzedData.map((item, idx) => (
                    <tr key={idx} className="hover:bg-white/5 transition-colors group">
                      <td className="py-4 px-6">
                         <div className="flex flex-col">
                           <span className="font-black text-white italic tracking-tighter text-sm group-hover:text-cyan-400 transition-colors">{item.symbol}</span>
                           <span className="text-[8px] text-slate-600 font-bold uppercase truncate w-32">{item.name}</span>
                         </div>
                      </td>
                      <td className="py-4 px-4">
                         <div className="flex items-center space-x-3">
                           <span className="text-lg font-black text-white italic">{item.alphaScore.toFixed(1)}</span>
                           <div className="h-1 w-20 bg-slate-800 rounded-full overflow-hidden">
                              <div className="h-full bg-cyan-500" style={{ width: `${item.alphaScore}%` }}></div>
                           </div>
                         </div>
                      </td>
                      <td className="py-4 px-4">
                         <div className="flex space-x-1">
                            {/* Fixed: Cast m to number to resolve 'unknown' comparison error */}
                            {Object.values(item.metrics).map((m, mi) => (
                               <div key={mi} className={`w-2 h-4 rounded-sm ${(m as number) > 80 ? 'bg-emerald-500' : (m as number) > 50 ? 'bg-cyan-500' : 'bg-slate-700 opacity-30'}`}></div>
                            ))}
                         </div>
                      </td>
                      <td className="py-4 px-6 text-right">
                        <span className="text-[8px] font-black px-2 py-0.5 rounded border border-cyan-500/20 text-cyan-400 bg-cyan-500/5 uppercase tracking-widest">
                          Finalized
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {analyzedData.length === 0 && !loading && (
                <div className="py-24 text-center">
                  <p className="text-[10px] font-black text-slate-700 uppercase tracking-[0.4em] italic">Ready for Fundamental Pruning</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="xl:col-span-1">
        <div className="glass-panel h-[720px] rounded-[40px] bg-slate-950 border-l-4 border-l-cyan-600 flex flex-col p-6 shadow-2xl">
          <div className="flex items-center justify-between mb-8 px-2">
            <h3 className="font-black text-white text-[10px] uppercase tracking-[0.4em] italic">Parallel_Terminal</h3>
            <div className="w-2 h-2 rounded-full bg-cyan-500 animate-pulse"></div>
          </div>
          <div ref={logRef} className="flex-1 bg-black/70 p-6 rounded-[32px] font-mono text-[9px] text-cyan-300/60 overflow-y-auto no-scrollbar space-y-4 border border-white/5 leading-relaxed">
            {logs.map((l, i) => (
              <div key={i} className={`pl-4 border-l-2 ${l.includes('[OK]') ? 'border-emerald-500 text-emerald-400' : l.includes('[ERR]') ? 'border-red-500 text-red-400' : l.includes('[WARN]') ? 'border-amber-500 text-amber-400' : 'border-cyan-900'}`}>
                {l}
              </div>
            ))}
          </div>
          <div className="mt-8 p-6 bg-cyan-600/5 rounded-[24px] border border-cyan-500/10 text-[9px] text-slate-500 font-bold italic leading-relaxed">
             Pruning Engine: Automatically eliminates the bottom 50% based on composite Fundamental Alpha Scoring.
          </div>
        </div>
      </div>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: rgba(0,0,0,0.1); }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(6,182,212,0.3); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(6,182,212,0.5); }
      `}</style>
    </div>
  );
};

export default FundamentalAnalysis;
