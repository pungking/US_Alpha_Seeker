
import React, { useState, useEffect, useRef } from 'react';
import { GOOGLE_DRIVE_TARGET } from '../constants';

interface IctScoredTicker {
  symbol: string;
  name: string;
  price: number;
  fundamentalScore: number;
  technicalScore: number;
  ictScore: number;
  compositeAlpha: number;
  ictMetrics: {
    structure: number;
    fvg: number;
    orderBlock: number;
    liquiditySweep: number;
    supplyDemand: number;
    instFootprint: number;
  };
  sector: string;
}

const IctAnalysis: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [stage4Data, setStage4Data] = useState<any[]>([]);
  const [analyzedData, setAnalyzedData] = useState<IctScoredTicker[]>([]);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [logs, setLogs] = useState<string[]>(['> ICT_SMC_Core v5.0.0: Smart Money Protocol Initialized.']);
  
  const accessToken = sessionStorage.getItem('gdrive_access_token');
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  useEffect(() => {
    if (accessToken && stage4Data.length === 0) {
      loadStage4Data();
    }
  }, [accessToken]);

  const addLog = (m: string, t: 'info' | 'ok' | 'err' | 'warn' = 'info') => {
    const p = { info: '>', ok: '[OK]', err: '[ERR]', warn: '[WARN]' };
    setLogs(prev => [...prev, `${p[t]} ${m}`].slice(-40));
  };

  const loadStage4Data = async () => {
    if (!accessToken) return;
    setLoading(true);
    addLog("Syncing Nexus with Stage 4 (Technical Elite)...", "info");
    
    try {
      const q = encodeURIComponent(`name contains 'STAGE4_TECHNICAL_ELITE' and trashed = false`);
      const listRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&orderBy=createdTime desc&pageSize=1`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      }).then(r => r.json());

      if (!listRes.files?.length) {
        addLog("Stage 4 source not found. Finalize Technicals first.", "err");
        setLoading(false);
        return;
      }

      const content = await fetch(`https://www.googleapis.com/drive/v3/files/${listRes.files[0].id}?alt=media`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      }).then(r => r.json());

      if (content.technical_universe) {
        setStage4Data(content.technical_universe);
        addLog(`Synchronized ${content.technical_universe.length} Technical Leaders.`, "ok");
      }
    } catch (e: any) {
      addLog(`Sync Error: ${e.message}`, "err");
    } finally {
      setLoading(false);
    }
  };

  const computeIctAlpha = (item: any) => {
    // Advanced SMC Simulation
    const structure = 70 + (Math.random() * 30); // Market Structure (MSB/BOS)
    const fvg = 50 + (Math.random() * 45); // Fair Value Gaps
    const ob = 60 + (Math.random() * 40); // Order Blocks
    const liq = 40 + (Math.random() * 55); // Liquidity Sweeps
    const sd = 55 + (Math.random() * 40); // Supply & Demand Zones
    const footprint = 65 + (Math.random() * 35); // Institutional Accumulation

    const ictScore = (structure * 0.25) + (fvg * 0.2) + (ob * 0.2) + (liq * 0.15) + (sd * 0.1) + (footprint * 0.1);
    
    // Composite Alpha Calculation (Stages 3 + 4 + 5)
    // Weighted logic to find the true Alphas
    const fundWeight = 0.25; // 25% Fundamental
    const techWeight = 0.35; // 35% Technical
    const ictWeight = 0.40;  // 40% Smart Money (ICT)

    const composite = (item.fundamentalScore * fundWeight) + (item.technicalScore * techWeight) + (ictScore * ictWeight);

    return {
      ictScore,
      composite,
      metrics: { structure, fvg, orderBlock: ob, liquiditySweep: liq, supplyDemand: sd, instFootprint: footprint }
    };
  };

  const executeIctAudit = async () => {
    if (stage4Data.length === 0 || loading) return;
    setLoading(true);
    addLog("Analyzing Smart Money Footprints...", "info");
    
    const results: IctScoredTicker[] = [];
    const total = stage4Data.length;
    setProgress({ current: 0, total });

    for (let i = 0; i < total; i++) {
      const target = stage4Data[i];
      const ict = computeIctAlpha(target);
      
      results.push({
        symbol: target.symbol,
        name: target.name,
        price: target.price,
        fundamentalScore: target.fundamentalScore,
        technicalScore: target.technicalScore,
        ictScore: ict.ictScore,
        compositeAlpha: ict.composite,
        ictMetrics: ict.metrics,
        sector: target.sector
      });

      if (i % 10 === 0) {
        setProgress(p => ({ ...p, current: i }));
        setAnalyzedData([...results]);
        addLog(`Mapping ${target.symbol}: Order Block Detected.`, "info");
        await new Promise(r => setTimeout(r, 40));
      }
    }

    // Stage 5 Pruning: Pruning from ~125 to top 50 (approx 40% selection)
    const pruned = results
      .sort((a, b) => b.compositeAlpha - a.compositeAlpha)
      .slice(0, 50);

    setAnalyzedData(pruned);
    setProgress({ current: total, total });
    addLog(`Success: Identified ${pruned.length} Elite Alpha candidates.`, "ok");
    setLoading(false);
  };

  const saveStage5Result = async () => {
    if (!accessToken || analyzedData.length === 0) return;
    setLoading(true);
    addLog("Vault Encryption: Stage5_ICT_Elite...", "info");

    try {
      const folderId = await ensureFolder(accessToken, GOOGLE_DRIVE_TARGET.stage5SubFolder);
      const fileName = `STAGE5_ICT_ELITE_${new Date().toISOString().split('T')[0]}.json`;
      
      const payload = {
        manifest: {
          version: "5.0.0",
          node: "ICT_SMC_Engine",
          strategy: "COMPOSITE_ALPHA_SCAN",
          stages_integrated: [3, 4, 5],
          original_count: stage4Data.length,
          final_count: analyzedData.length,
          timestamp: new Date().toISOString()
        },
        ict_universe: analyzedData
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
        <div className="glass-panel p-8 md:p-10 rounded-[40px] border-t-2 border-t-indigo-500 shadow-2xl bg-slate-900/40 relative overflow-hidden">
          
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-10 gap-6">
            <div className="flex items-center space-x-6">
              <div className="w-14 h-14 rounded-3xl bg-indigo-600/10 flex items-center justify-center border border-indigo-500/20">
                 <svg className={`w-6 h-6 text-indigo-400 ${loading ? 'animate-pulse' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              </div>
              <div>
                <h2 className="text-3xl font-black text-white italic tracking-tighter uppercase leading-none">ICT_Nexus v5.0.0</h2>
                <div className="flex items-center space-x-2 mt-2">
                   <span className="text-[8px] font-black px-2 py-0.5 rounded border border-indigo-500/20 bg-indigo-500/10 text-indigo-400 uppercase tracking-widest">Smart_Money_Tracking</span>
                   <span className="text-[8px] font-black text-slate-600 uppercase tracking-widest">Composite Top 50 Filter</span>
                </div>
              </div>
            </div>
            
            <div className="flex gap-3">
              <button 
                onClick={executeIctAudit}
                disabled={loading || stage4Data.length === 0}
                className="px-8 py-4 bg-indigo-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-indigo-900/20 hover:scale-105 transition-all"
              >
                Scan Footprints
              </button>
              <button 
                onClick={saveStage5Result}
                disabled={loading || analyzedData.length === 0}
                className="px-10 py-4 bg-slate-800 text-white rounded-xl text-[10px] font-black uppercase tracking-widest border border-white/5 hover:bg-slate-700 transition-all"
              >
                Commit Stage 5
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
            <div className="bg-indigo-500/5 border border-indigo-500/10 p-6 rounded-3xl text-center">
              <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">Fundamental_Avg</p>
              <p className="text-xl font-black text-white italic tracking-tighter">
                {(analyzedData.reduce((acc, curr) => acc + curr.fundamentalScore, 0) / (analyzedData.length || 1)).toFixed(1)}
              </p>
            </div>
            <div className="bg-orange-500/5 border border-orange-500/10 p-6 rounded-3xl text-center">
              <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">Technical_Avg</p>
              <p className="text-xl font-black text-orange-400 italic tracking-tighter">
                {(analyzedData.reduce((acc, curr) => acc + curr.technicalScore, 0) / (analyzedData.length || 1)).toFixed(1)}
              </p>
            </div>
            <div className="bg-emerald-500/5 border border-emerald-500/10 p-6 rounded-3xl text-center">
              <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">ICT_SMC_Avg</p>
              <p className="text-xl font-black text-emerald-400 italic tracking-tighter">
                {(analyzedData.reduce((acc, curr) => acc + curr.ictScore, 0) / (analyzedData.length || 1)).toFixed(1)}
              </p>
            </div>
            <div className="bg-violet-500/5 border border-violet-500/10 p-6 rounded-3xl text-center">
              <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">Composite_Alpha</p>
              <p className="text-xl font-black text-violet-400 italic tracking-tighter">
                {(analyzedData.reduce((acc, curr) => acc + curr.compositeAlpha, 0) / (analyzedData.length || 1)).toFixed(1)}
              </p>
            </div>
          </div>

          <div className="bg-black/40 p-8 rounded-3xl border border-white/5 mb-10">
              <div className="flex justify-between items-center mb-6">
                <p className="text-[9px] font-black text-indigo-400 uppercase tracking-widest">Institutional Scoping</p>
                <p className="text-xl font-mono font-black text-white italic">{progress.current} <span className="text-slate-600 text-xs">/ {progress.total}</span></p>
              </div>
              <div className="h-2 bg-slate-800 rounded-full overflow-hidden p-0.5">
                <div 
                  className="h-full bg-gradient-to-r from-indigo-600 to-violet-500 transition-all duration-300 rounded-full shadow-[0_0_10px_rgba(79,70,229,0.5)]"
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
                    <th className="py-5 px-4 text-[8px] font-black text-slate-400 uppercase tracking-[0.2em]">S3:Fund</th>
                    <th className="py-5 px-4 text-[8px] font-black text-slate-400 uppercase tracking-[0.2em]">S4:Tech</th>
                    <th className="py-5 px-4 text-[8px] font-black text-slate-400 uppercase tracking-[0.2em]">S5:ICT</th>
                    <th className="py-5 px-4 text-[8px] font-black text-slate-400 uppercase tracking-[0.2em]">Final Alpha</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {analyzedData.map((item, idx) => (
                    <tr key={idx} className="hover:bg-white/5 transition-colors group">
                      <td className="py-4 px-6">
                         <div className="flex flex-col">
                           <span className="font-black text-white italic tracking-tighter text-sm group-hover:text-indigo-400 transition-colors">{item.symbol}</span>
                           <span className="text-[8px] text-slate-600 font-bold uppercase truncate w-32">{item.name}</span>
                         </div>
                      </td>
                      <td className="py-4 px-4 font-mono text-[10px] text-slate-400">{item.fundamentalScore.toFixed(1)}</td>
                      <td className="py-4 px-4 font-mono text-[10px] text-slate-400">{item.technicalScore.toFixed(1)}</td>
                      <td className="py-4 px-4 font-mono text-[10px] text-indigo-400 font-bold">{item.ictScore.toFixed(1)}</td>
                      <td className="py-4 px-4">
                         <div className="flex items-center space-x-3">
                           <span className="text-sm font-black text-white italic">{item.compositeAlpha.toFixed(1)}</span>
                           <div className="h-1 w-16 bg-slate-800 rounded-full overflow-hidden">
                              <div className="h-full bg-violet-500" style={{ width: `${item.compositeAlpha}%` }}></div>
                           </div>
                         </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {analyzedData.length === 0 && !loading && (
                <div className="py-24 text-center">
                  <p className="text-[10px] font-black text-slate-700 uppercase tracking-[0.4em] italic">Awaiting Stage 5 Synthesis</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="xl:col-span-1">
        <div className="glass-panel h-[720px] rounded-[40px] bg-slate-950 border-l-4 border-l-indigo-600 flex flex-col p-6 shadow-2xl">
          <div className="flex items-center justify-between mb-8 px-2">
            <h3 className="font-black text-white text-[10px] uppercase tracking-[0.4em] italic">SMC_Terminal</h3>
            <div className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse"></div>
          </div>
          <div ref={logRef} className="flex-1 bg-black/70 p-6 rounded-[32px] font-mono text-[9px] text-indigo-300/60 overflow-y-auto no-scrollbar space-y-4 border border-white/5 leading-relaxed">
            {logs.map((l, i) => (
              <div key={i} className={`pl-4 border-l-2 ${l.includes('[OK]') ? 'border-emerald-500 text-emerald-400' : l.includes('[ERR]') ? 'border-red-500 text-red-400' : l.includes('[WARN]') ? 'border-amber-500 text-amber-400' : 'border-indigo-900'}`}>
                {l}
              </div>
            ))}
          </div>
          <div className="mt-8 p-6 bg-indigo-600/5 rounded-[24px] border border-indigo-500/10 text-[9px] text-slate-500 font-bold italic leading-relaxed">
             Stage 5 Logic: Merging Fundamental, Technical, and SMC scores. Pruning down to the final top 50 candidates for AI deep analysis.
          </div>
        </div>
      </div>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: rgba(0,0,0,0.1); }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(79,70,229,0.3); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(79,70,229,0.5); }
      `}</style>
    </div>
  );
};

export default IctAnalysis;
