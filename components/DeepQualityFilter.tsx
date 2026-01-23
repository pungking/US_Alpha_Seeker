import React, { useState, useEffect, useRef } from 'react';
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
  const [stage1Data, setStage1Data] = useState<any[]>([]);
  const [processedData, setProcessedData] = useState<QualityTicker[]>([]);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [logs, setLogs] = useState<string[]>(['> Quality_Node v2.2.0: Pure Equity Protocol Active.']);
  
  const accessToken = sessionStorage.getItem('gdrive_access_token');
  const finnhubKey = API_CONFIGS.find(c => c.provider === ApiProvider.FINNHUB)?.key;
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
    addLog("Pulling Matrix from Stage 1...", "info");
    
    try {
      const q = encodeURIComponent(`name contains 'STAGE1_INVESTABLE_UNIVERSE' and trashed = false`);
      const listRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&orderBy=createdTime desc&pageSize=1`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      }).then(r => r.json());

      if (!listRes.files?.length) {
        addLog("Stage 1 data not found. Execution blocked.", "err");
        setLoading(false);
        return;
      }

      const content = await fetch(`https://www.googleapis.com/drive/v3/files/${listRes.files[0].id}?alt=media`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      }).then(r => r.json());

      if (content.investable_universe) {
        // 1차 필터링: 보통주/ADR만 허용 (Stage 1에서 이미 걸러졌으나 유동성 기반 재정렬 및 재검증)
        const allowedTypes = ['Common Stock', 'ADR', 'REIT', 'MLP'];
        const equities = content.investable_universe
          .filter((s: any) => !s.type || allowedTypes.includes(s.type))
          .map((s: any) => ({ ...s, marketValue: (s.price || 0) * (s.volume || 0) }))
          .sort((a: any, b: any) => b.marketValue - a.marketValue);
        
        setStage1Data(equities);
        addLog(`Synchronized ${equities.length} equities. Prioritized by Liquidity.`, "ok");
      }
    } catch (e: any) {
      addLog(`Sync Error: ${e.message}`, "err");
    } finally {
      setLoading(false);
    }
  };

  const startDeepAnalysis = async () => {
    if (stage1Data.length === 0 || loading) return;
    setLoading(true);
    setProcessedData([]);
    const results: QualityTicker[] = [];
    const targetCount = 500;
    const limit = Math.min(stage1Data.length, targetCount);
    setProgress({ current: 0, total: limit });
    
    addLog(`Initiating High-Quality Scan for Top ${limit} Liquid Assets...`, "info");

    for (let i = 0; i < limit; i++) {
      const target = stage1Data[i];
      setProgress(prev => ({ ...prev, current: i + 1 }));
      
      try {
        const finRes = await fetch(`https://finnhub.io/api/v1/stock/metric?symbol=${target.symbol}&metric=all&token=${finnhubKey}`).then(r => r.json());
        const profileRes = await fetch(`https://finnhub.io/api/v1/stock/profile2?symbol=${target.symbol}&token=${finnhubKey}`).then(r => r.json());
        
        const metrics = finRes.metric || {};
        const qData: QualityTicker = {
          symbol: target.symbol,
          name: profileRes.name || target.name || "Unknown",
          price: target.price,
          volume: target.volume,
          marketValue: target.marketValue,
          type: target.type || profileRes.type || "Common Stock",
          per: metrics.peNormalized || metrics.peTTM || 0,
          pbr: metrics.pbAnnual || 0,
          debtToEquity: metrics.totalDebtEquityRatioQuarterly || metrics.totalDebtEquityRatioAnnual || 0,
          roe: metrics.roeTTM || 0,
          sector: profileRes.finnhubIndustry || "Unknown",
          industry: profileRes.finnhubIndustry || "Unknown",
          lastUpdate: new Date().toISOString()
        };

        results.push(qData);
        
        if (i % 5 === 0 || i === limit - 1) {
           addLog(`Cached ${target.symbol}: Metrics Locked.`, "ok");
           setProcessedData([...results]);
        }

        await new Promise(r => setTimeout(r, 800));
        
      } catch (e) {
        addLog(`Skip ${target.symbol}: Pipeline Throttled`, "warn");
        await new Promise(r => setTimeout(r, 2000));
      }
    }

    setProcessedData(results);
    addLog(`Success: Elite Data Points Cached for Stage 3-6.`, "ok");
    setLoading(false);
  };

  const saveStage2Result = async () => {
    if (!accessToken || processedData.length === 0) return;
    setLoading(true);
    addLog("Vault Encryption: Stage2_Deep_Quality...", "info");

    try {
      const folderId = await ensureFolder(accessToken, GOOGLE_DRIVE_TARGET.stage2SubFolder);
      const fileName = `STAGE2_ELITE_UNIVERSE_${new Date().toISOString().split('T')[0]}.json`;
      
      const payload = {
        manifest: {
          version: "2.2.0",
          node: "Elite_Quality_Vault",
          count: processedData.length,
          selection_strategy: "LIQUIDITY_TOP_500",
          timestamp: new Date().toISOString()
        },
        elite_universe: processedData
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
        <div className="glass-panel p-8 md:p-10 rounded-[40px] border-t-2 border-t-purple-500 shadow-2xl bg-slate-900/40 relative overflow-hidden">
          
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-10 gap-6">
            <div className="flex items-center space-x-6">
              <div className={`w-14 h-14 rounded-3xl bg-purple-600/10 flex items-center justify-center border border-purple-500/20 ${loading ? 'animate-pulse' : ''}`}>
                 <svg className={`w-6 h-6 text-purple-500 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
              </div>
              <div>
                <h2 className="text-3xl font-black text-white italic tracking-tighter uppercase leading-none">Elite_Caching v2.2.0</h2>
                <div className="flex items-center space-x-2 mt-2">
                   <span className="text-[8px] font-black px-2 py-0.5 rounded border border-purple-500/20 bg-purple-500/10 text-purple-400 uppercase tracking-widest">Equity_Focus_Node</span>
                   <span className="text-[8px] font-black text-slate-600 uppercase tracking-widest">Target: Liquidity_Top_500</span>
                </div>
              </div>
            </div>
            
            <div className="flex gap-3">
              <button 
                onClick={startDeepAnalysis}
                disabled={loading || stage1Data.length === 0}
                className="px-8 py-4 bg-purple-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-purple-900/20 hover:scale-105 transition-all"
              >
                Start Pre-fetch
              </button>
              <button 
                onClick={saveStage2Result}
                disabled={loading || processedData.length === 0}
                className="px-10 py-4 bg-slate-800 text-white rounded-xl text-[10px] font-black uppercase tracking-widest border border-white/5 hover:bg-slate-700 transition-all"
              >
                Commit Vault
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-10">
            <div className="col-span-3 bg-black/40 p-8 rounded-3xl border border-white/5">
              <div className="flex justify-between items-center mb-6">
                <p className="text-[9px] font-black text-purple-400 uppercase tracking-widest">Caching Progress</p>
                <p className="text-xl font-mono font-black text-white italic">{progress.current} <span className="text-slate-600 text-xs">/ {progress.total}</span></p>
              </div>
              <div className="h-4 bg-slate-800 rounded-full overflow-hidden p-1 border border-white/5">
                <div 
                  className="h-full bg-gradient-to-r from-purple-600 to-indigo-500 transition-all duration-500 rounded-full"
                  style={{ width: `${(progress.current / (progress.total || 1)) * 100}%` }}
                ></div>
              </div>
            </div>
            <div className="bg-purple-600/10 p-8 rounded-3xl border border-purple-500/20 flex flex-col justify-center text-center">
               <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-2">Universe</p>
               <p className="text-2xl font-black text-white italic">Pure</p>
            </div>
          </div>

          {/* Results Container with fixed height and scroll */}
          <div className="relative overflow-hidden rounded-3xl border border-white/5 bg-black/20">
            <div className="max-h-[480px] overflow-y-auto custom-scrollbar">
              <table className="w-full text-left border-collapse">
                <thead className="sticky top-0 z-10 bg-slate-900/90 backdrop-blur-md">
                  <tr className="border-b border-white/10">
                    <th className="py-5 px-6 text-[8px] font-black text-slate-400 uppercase tracking-[0.2em]">Ticker</th>
                    <th className="py-5 px-4 text-[8px] font-black text-slate-400 uppercase tracking-[0.2em]">Industry</th>
                    <th className="py-5 px-4 text-[8px] font-black text-slate-400 uppercase tracking-[0.2em]">PER</th>
                    <th className="py-5 px-4 text-[8px] font-black text-slate-400 uppercase tracking-[0.2em]">Debt/Eq</th>
                    <th className="py-5 px-4 text-[8px] font-black text-slate-400 uppercase tracking-[0.2em]">ROE</th>
                    <th className="py-5 px-6 text-[8px] font-black text-slate-400 uppercase tracking-[0.2em] text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {[...processedData].reverse().map((item, idx) => (
                    <tr key={idx} className="hover:bg-white/5 transition-colors group">
                      <td className="py-4 px-6">
                         <div className="flex flex-col">
                           <span className="font-black text-white italic tracking-tighter text-sm group-hover:text-purple-400 transition-colors">{item.symbol}</span>
                           <span className="text-[8px] text-slate-600 font-bold uppercase truncate w-32">{item.name}</span>
                         </div>
                      </td>
                      <td className="py-4 px-4">
                         <span className="text-[9px] font-black text-purple-300 bg-purple-500/5 px-2 py-1 rounded border border-purple-500/10 uppercase tracking-widest">
                           {item.sector}
                         </span>
                      </td>
                      <td className="py-4 px-4 font-mono text-[10px] text-slate-400">{item.per > 0 ? item.per.toFixed(1) : '--'}</td>
                      <td className="py-4 px-4 font-mono text-[10px] text-slate-400">{item.debtToEquity > 0 ? `${item.debtToEquity.toFixed(1)}%` : '--'}</td>
                      <td className="py-4 px-4 font-mono text-[10px] text-slate-400">{item.roe > 0 ? `${item.roe.toFixed(1)}%` : '--'}</td>
                      <td className="py-4 px-6 text-right">
                        <span className="text-[8px] font-black px-2 py-0.5 rounded border border-emerald-500/20 text-emerald-400 bg-emerald-500/5 uppercase tracking-widest">
                          Locked
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {processedData.length === 0 && !loading && (
                <div className="py-24 text-center">
                  <p className="text-[10px] font-black text-slate-700 uppercase tracking-[0.4em] italic">Ready for Elite Extraction</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="xl:col-span-1">
        <div className="glass-panel h-[720px] rounded-[40px] bg-slate-950 border-l-4 border-l-purple-600 flex flex-col p-6 shadow-2xl">
          <div className="flex items-center justify-between mb-8 px-2">
            <h3 className="font-black text-white text-[10px] uppercase tracking-[0.4em] italic">Prefetch_Node</h3>
            <div className="w-2 h-2 rounded-full bg-purple-500 animate-pulse"></div>
          </div>
          <div ref={logRef} className="flex-1 bg-black/70 p-6 rounded-[32px] font-mono text-[9px] text-purple-300/60 overflow-y-auto no-scrollbar space-y-4 border border-white/5 leading-relaxed">
            {logs.map((l, i) => (
              <div key={i} className={`pl-4 border-l-2 ${l.includes('[OK]') ? 'border-emerald-500 text-emerald-400' : l.includes('[ERR]') ? 'border-red-500 text-red-400' : l.includes('[WARN]') ? 'border-amber-500 text-amber-400' : 'border-purple-900'}`}>
                {l}
              </div>
            ))}
          </div>
          <div className="mt-8 p-6 bg-purple-600/5 rounded-[24px] border border-purple-500/10 text-[9px] text-slate-500 font-bold italic">
             Equity-Only filtering enabled. All ETFs and Non-Common assets purged before caching.
          </div>
        </div>
      </div>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: rgba(0,0,0,0.1); }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(168,85,247,0.2); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(168,85,247,0.4); }
      `}</style>
    </div>
  );
};

export default DeepQualityFilter;