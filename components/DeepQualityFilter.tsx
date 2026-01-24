
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
  const [progress, setProgress] = useState({ current: 0, total: 0, currentSymbol: '' });
  const [logs, setLogs] = useState<string[]>(['> Quality_Node v2.2.1: Liquidity-Priority Protocol Active.']);
  
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
    setLoading(true);
    try {
      const q = encodeURIComponent(`name contains 'STAGE1_INVESTABLE_UNIVERSE' and trashed = false`);
      const listRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&orderBy=createdTime desc&pageSize=1`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      }).then(r => r.json());

      if (listRes.files?.length) {
        const content = await fetch(`https://www.googleapis.com/drive/v3/files/${listRes.files[0].id}?alt=media`, {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        }).then(r => r.json());
        if (content.investable_universe) {
          const sorted = content.investable_universe
            .map((s: any) => ({ ...s, marketValue: (s.price || 0) * (s.volume || 0) }))
            .sort((a: any, b: any) => b.marketValue - a.marketValue);
          setStage1Data(sorted);
        }
      }
    } catch (e: any) {} finally { setLoading(false); }
  };

  const startDeepAnalysis = async () => {
    if (stage1Data.length === 0 || loading) return;
    setLoading(true);
    const targetCount = 500;
    const limit = Math.min(stage1Data.length, targetCount);
    const results: QualityTicker[] = [];
    setProgress({ current: 0, total: limit, currentSymbol: 'Initializing' });

    for (let i = 0; i < limit; i++) {
      const target = stage1Data[i];
      setProgress({ current: i + 1, total: limit, currentSymbol: target.symbol });
      
      try {
        const metrics = await fetch(`https://finnhub.io/api/v1/stock/metric?symbol=${target.symbol}&token=${finnhubKey}`).then(r => r.json());
        const profile = await fetch(`https://finnhub.io/api/v1/stock/profile2?symbol=${target.symbol}&token=${finnhubKey}`).then(r => r.json());
        
        results.push({
          symbol: target.symbol,
          name: profile.name || target.name || "N/A",
          price: target.price,
          volume: target.volume,
          marketValue: target.marketValue,
          per: metrics.metric?.peNormalized || 0,
          roe: metrics.metric?.roeTTM || 0,
          sector: profile.finnhubIndustry || "N/A",
          lastUpdate: new Date().toISOString()
        });

        if (i % 5 === 0) setProcessedData([...results]);
        await new Promise(r => setTimeout(r, 600));
      } catch (e) {}
    }
    setProcessedData(results);
    setLoading(false);
    setProgress(p => ({ ...p, currentSymbol: 'Scan Complete' }));
  };

  const saveStage2Result = async () => {
    if (!accessToken || processedData.length === 0) return;
    setLoading(true);
    try {
      const folderId = await ensureFolder(accessToken, GOOGLE_DRIVE_TARGET.stage2SubFolder);
      const payload = { elite_universe: processedData };
      const meta = { name: `STAGE2_ELITE_UNIVERSE_${new Date().toISOString().split('T')[0]}.json`, parents: [folderId] };
      const form = new FormData();
      form.append('metadata', new Blob([JSON.stringify(meta)], { type: 'application/json' }));
      form.append('file', new Blob([JSON.stringify(payload)], { type: 'application/json' }));
      await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST', headers: { 'Authorization': `Bearer ${accessToken}` }, body: form
      });
      addLog("Vault Commit Successful", "ok");
    } finally { setLoading(false); }
  };

  const ensureFolder = async (token: string, name: string) => {
    const q = encodeURIComponent(`name = '${name}' and trashed = false`);
    const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}`, { headers: { 'Authorization': `Bearer ${token}` } }).then(r => r.json());
    if (res.files?.length > 0) return res.files[0].id;
    const create = await fetch(`https://www.googleapis.com/drive/v3/files`, {
      method: 'POST', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
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
                <h2 className="text-3xl font-black text-white italic tracking-tighter uppercase leading-none">Elite_Caching v2.2.1</h2>
                <p className="text-[8px] font-black text-purple-400 uppercase tracking-widest mt-2">
                  {loading ? `Scanning: ${progress.currentSymbol} (${Math.round((progress.current/progress.total)*100)}%)` : 'Ready for extraction'}
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={startDeepAnalysis} disabled={loading || stage1Data.length === 0} className="px-8 py-4 bg-purple-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:scale-105 transition-all">
                {loading ? `${progress.currentSymbol}...` : 'Execute Deep Extraction'}
              </button>
              <button onClick={saveStage2Result} disabled={loading || processedData.length === 0} className="px-10 py-4 bg-slate-800 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-700 transition-all border border-white/5">
                Commit Vault
              </button>
            </div>
          </div>
          
          <div className="h-4 bg-slate-800 rounded-full overflow-hidden p-0.5 border border-white/5 mb-10">
            <div className="h-full bg-purple-600 transition-all duration-300 rounded-full" style={{ width: `${(progress.current/progress.total)*100}%` }}></div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DeepQualityFilter;
