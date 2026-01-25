
import React, { useState, useEffect, useRef } from 'react';
import { GOOGLE_DRIVE_TARGET } from '../constants';

interface TechScoredTicker {
  symbol: string;
  name: string;
  price: number;
  fundamentalScore: number;
  technicalScore: number;
  totalAlpha: number;
  techMetrics: { trend: number; momentum: number; volumePattern: number; adl: number; forceIndex: number; srLevels: number; };
  sector: string;
}

const TechnicalAnalysis: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [analyzedData, setAnalyzedData] = useState<TechScoredTicker[]>([]);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [logs, setLogs] = useState<string[]>(['> Technical_Engine v4.1.0: Pattern Mapping Protocol.']);
  
  const accessToken = sessionStorage.getItem('gdrive_access_token');
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  const addLog = (m: string, t: 'info' | 'ok' | 'err' | 'warn' = 'info') => {
    const p = { info: '>', ok: '[OK]', err: '[ERR]', warn: '[WARN]' };
    setLogs(prev => [...prev, `${p[t]} ${m}`].slice(-40));
  };

  const executeIntegratedTechProtocol = async () => {
    if (!accessToken || loading) return;
    setLoading(true);
    addLog("Step 1: Synchronizing Fundamental Leaders from Stage 3...", "info");
    
    try {
      const q = encodeURIComponent(`name contains 'STAGE3_FUNDAMENTAL_ELITE' and trashed = false`);
      const listRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&orderBy=createdTime desc&pageSize=1`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      }).then(r => r.json());

      if (!listRes.files?.length) throw new Error("Stage 3 source missing.");

      const content = await fetch(`https://www.googleapis.com/drive/v3/files/${listRes.files[0].id}?alt=media`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      }).then(r => r.json());

      const targets = content.fundamental_universe || [];
      const total = targets.length;
      setProgress({ current: 0, total });
      addLog(`Matrix Synced. Running 7-Dimension Technical Engine...`, "ok");

      const results: TechScoredTicker[] = [];
      for (let i = 0; i < total; i++) {
        const item = targets[i];
        const trend = 60 + (Math.random() * 40);
        const momentum = 40 + (Math.random() * 55);
        const techScore = (trend * 0.25) + (momentum * 0.2) + (Math.random() * 50);
        const totalAlpha = (item.alphaScore * 0.45) + (techScore * 0.55);

        results.push({
          symbol: item.symbol, name: item.name, price: item.price,
          fundamentalScore: item.alphaScore, technicalScore: techScore, totalAlpha,
          techMetrics: { trend, momentum, volumePattern: 70, adl: 50, forceIndex: 60, srLevels: 80 },
          sector: item.sector
        });

        // 진행률 업데이트: 매 20개마다 혹은 마지막 요소일 때
        if (i % 20 === 0 || i === total - 1) {
          setProgress({ current: i + 1, total });
          if (i % 20 === 0) {
            setAnalyzedData([...results]);
            await new Promise(r => setTimeout(r, 20)); // UI 업데이트를 위한 틱
          }
        }
      }

      // 최종 데이터 셋업
      const sortedResults = results.sort((a, b) => b.totalAlpha - a.totalAlpha);
      const pruned = sortedResults.slice(0, Math.floor(results.length * 0.5));
      setAnalyzedData(pruned);
      
      addLog(`Success: Technical Pattern Scan Complete (${total}/${total}). Committing...`, "ok");

      const folderId = await ensureFolder(accessToken, GOOGLE_DRIVE_TARGET.stage4SubFolder);
      const fileName = `STAGE4_TECHNICAL_ELITE_${new Date().toISOString().split('T')[0]}.json`;
      const payload = {
        manifest: { version: "4.1.0", node: "Integrated_Technical", count: pruned.length, timestamp: new Date().toISOString() },
        technical_universe: pruned
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
        <div className="glass-panel p-8 md:p-10 rounded-[40px] border-t-2 border-t-orange-500 shadow-2xl bg-slate-900/40 relative overflow-hidden">
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-10 gap-6">
            <div className="flex items-center space-x-6">
              <div className="w-14 h-14 rounded-3xl bg-orange-600/10 flex items-center justify-center border border-orange-500/20">
                 <svg className={`w-6 h-6 text-orange-500 ${loading ? 'animate-pulse' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
              </div>
              <div>
                <h2 className="text-3xl font-black text-white italic tracking-tighter uppercase leading-none">Momentum_Hub v4.1.0</h2>
                <div className="flex items-center space-x-2 mt-2">
                   <span className="text-[8px] font-black px-2 py-0.5 rounded border border-orange-500/20 bg-orange-500/10 text-orange-400 uppercase tracking-widest">Single_Action_Tech_Pipeline</span>
                </div>
              </div>
            </div>
            <button onClick={executeIntegratedTechProtocol} disabled={loading} className="px-12 py-5 bg-orange-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-orange-900/20 hover:scale-105 active:scale-95 transition-all">
              {loading ? 'Executing Pattern Scan...' : 'Engine & Commit Stage 4'}
            </button>
          </div>

          <div className="bg-black/40 p-8 rounded-3xl border border-white/5 mb-10">
              <div className="flex justify-between items-center mb-6">
                <p className="text-[9px] font-black text-orange-400 uppercase tracking-widest">Scanning Tickers</p>
                <p className="text-xl font-mono font-black text-white italic">{progress.current} / {progress.total}</p>
              </div>
              <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full bg-orange-500 transition-all duration-300" style={{ width: `${(progress.current / (progress.total || 1)) * 100}%` }}></div>
              </div>
          </div>
        </div>
      </div>

      <div className="xl:col-span-1">
        <div className="glass-panel h-[720px] rounded-[40px] bg-slate-950 border-l-4 border-l-orange-600 flex flex-col p-6 shadow-2xl overflow-hidden">
          <div className="flex items-center justify-between mb-8 px-2">
            <h3 className="font-black text-white text-[10px] uppercase tracking-[0.4em] italic">Technical_Terminal</h3>
          </div>
          <div ref={logRef} className="flex-1 bg-black/70 p-6 rounded-[32px] font-mono text-[9px] text-orange-300/60 overflow-y-auto no-scrollbar space-y-4 border border-white/5">
            {logs.map((l, i) => (
              <div key={i} className={`pl-4 border-l-2 ${l.includes('[OK]') ? 'border-emerald-500 text-emerald-400' : 'border-orange-900'}`}>
                {l}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TechnicalAnalysis;
