
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
  const [processedData, setProcessedData] = useState<QualityTicker[]>([]);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [logs, setLogs] = useState<string[]>(['> Quality_Node v2.3.0: Automated Elite Scan Protocol.']);
  
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

  const executeIntegratedScan = async () => {
    if (!accessToken || loading) return;
    setLoading(true);
    addLog("Step 1: Synchronizing Investable Universe from Stage 1...", "info");
    
    try {
      const q = encodeURIComponent(`name contains 'STAGE1_INVESTABLE_UNIVERSE' and trashed = false`);
      const listRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&orderBy=createdTime desc&pageSize=1`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      }).then(r => r.json());

      if (!listRes.files?.length) throw new Error("Stage 1 input missing.");

      const content = await fetch(`https://www.googleapis.com/drive/v3/files/${listRes.files[0].id}?alt=media`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      }).then(r => r.json());

      const equities = (content.investable_universe || [])
        .map((s: any) => ({ ...s, marketValue: (s.price || 0) * (s.volume || 0) }))
        .sort((a: any, b: any) => b.marketValue - a.marketValue);
      
      const limit = Math.min(equities.length, 500);
      setProgress({ current: 0, total: limit });
      addLog(`Matrix Synced. Scanning Top ${limit} Elite assets...`, "ok");

      const results: QualityTicker[] = [];
      for (let i = 0; i < limit; i++) {
        const target = equities[i];
        setProgress(prev => ({ ...prev, current: i + 1 }));
        
        try {
          const finRes = await fetch(`https://finnhub.io/api/v1/stock/metric?symbol=${target.symbol}&metric=all&token=${finnhubKey}`).then(r => r.json());
          const profRes = await fetch(`https://finnhub.io/api/v1/stock/profile2?symbol=${target.symbol}&token=${finnhubKey}`).then(r => r.json());
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

          if (i % 10 === 0) setProcessedData([...results]);
          await new Promise(r => setTimeout(r, 600));
        } catch (e) {
          addLog(`Retry: ${target.symbol} link throttled.`, "warn");
          await new Promise(r => setTimeout(r, 1500));
        }
      }

      setProcessedData(results);
      addLog(`Scan Complete. Committing ${results.length} nodes to Vault...`, "ok");

      // 커밋
      const folderId = await ensureFolder(accessToken, GOOGLE_DRIVE_TARGET.stage2SubFolder);
      const fileName = `STAGE2_ELITE_UNIVERSE_${new Date().toISOString().split('T')[0]}.json`;
      const payload = {
        manifest: { version: "2.3.0", node: "Integrated_Extraction", count: results.length, timestamp: new Date().toISOString() },
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
              <div className="w-14 h-14 rounded-3xl bg-purple-600/10 flex items-center justify-center border border-purple-500/20">
                 <svg className={`w-6 h-6 text-purple-500 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
              </div>
              <div>
                <h2 className="text-3xl font-black text-white italic tracking-tighter uppercase leading-none">Elite_Scanner v2.3.0</h2>
                <div className="flex items-center space-x-2 mt-2">
                   <span className="text-[8px] font-black px-2 py-0.5 rounded border border-purple-500/20 bg-purple-500/10 text-purple-400 uppercase tracking-widest">Single_Action_Vault_Commit</span>
                </div>
              </div>
            </div>
            <button onClick={executeIntegratedScan} disabled={loading} className="px-12 py-5 bg-purple-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:scale-105 active:scale-95 transition-all disabled:opacity-50 shadow-xl">
              {loading ? 'Analyzing & Uploading...' : 'Scan & Commit Vault'}
            </button>
          </div>

          <div className="bg-black/40 p-8 rounded-3xl border border-white/5 mb-10">
              <div className="flex justify-between items-center mb-6">
                <p className="text-[9px] font-black text-purple-400 uppercase tracking-widest">Extraction Progress</p>
                <p className="text-xl font-mono font-black text-white italic">{progress.current} / {progress.total}</p>
              </div>
              <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full bg-purple-600 transition-all duration-300" style={{ width: `${(progress.current / (progress.total || 1)) * 100}%` }}></div>
              </div>
          </div>
        </div>
      </div>

      <div className="xl:col-span-1">
        <div className="glass-panel h-[720px] rounded-[40px] bg-slate-950 border-l-4 border-l-purple-600 flex flex-col p-6 shadow-2xl overflow-hidden">
          <div className="flex items-center justify-between mb-8 px-2">
            <h3 className="font-black text-white text-[10px] uppercase tracking-[0.4em] italic">Elite_Terminal</h3>
          </div>
          <div ref={logRef} className="flex-1 bg-black/70 p-6 rounded-[32px] font-mono text-[9px] text-purple-300/60 overflow-y-auto no-scrollbar space-y-4 border border-white/5">
            {logs.map((l, i) => (
              <div key={i} className={`pl-4 border-l-2 ${l.includes('[OK]') ? 'border-emerald-500 text-emerald-400' : 'border-purple-900'}`}>
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
