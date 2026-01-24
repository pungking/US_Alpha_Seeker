
import React, { useState, useEffect, useRef } from 'react';
import { GOOGLE_DRIVE_TARGET, API_CONFIGS } from '../constants';
import { ApiProvider } from '../types';

interface QualityTicker {
  symbol: string;
  name: string;
  price: number;
  volume: number;
  marketValue: number;
  sector?: string;
  lastUpdate: string;
}

const DeepQualityFilter: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [stage1Data, setStage1Data] = useState<any[]>([]);
  const [processedData, setProcessedData] = useState<QualityTicker[]>([]);
  const [progress, setProgress] = useState({ current: 0, total: 0, currentSymbol: 'Idle' });
  const [logs, setLogs] = useState<string[]>(['> Quality_Node v2.2.1: Liquidity-Priority Protocol Active.']);
  
  const accessToken = sessionStorage.getItem('gdrive_access_token');
  const finnhubKey = API_CONFIGS.find(c => c.provider === ApiProvider.FINNHUB)?.key;
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  useEffect(() => {
    if (accessToken && stage1Data.length === 0) loadStage1Data();
  }, [accessToken]);

  const addLog = (m: string, t: 'info' | 'ok' | 'err' | 'warn' = 'info') => {
    const p = { info: '>', ok: '[OK]', err: '[ERR]', warn: '[WARN]' };
    setLogs(prev => [...prev, `${p[t]} ${m}`].slice(-40));
  };

  const loadStage1Data = async () => {
    setLoading(true);
    addLog("Pulling investable universe from Stage 1...", "info");
    try {
      const q = encodeURIComponent(`name contains 'STAGE1_INVESTABLE_UNIVERSE' and trashed = false`);
      const listRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&orderBy=createdTime desc&pageSize=1`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      }).then(r => r.json());

      if (listRes.files?.length) {
        const content = await fetch(`https://www.googleapis.com/drive/v3/files/${listRes.files[0].id}?alt=media`, {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        }).then(r => r.json());
        if (content.investable_universe) setStage1Data(content.investable_universe);
        addLog(`Loaded ${content.investable_universe.length} assets for deep audit.`, "ok");
      }
    } catch (e: any) { addLog(e.message, "err"); }
    finally { setLoading(false); }
  };

  const startDeepAnalysis = async () => {
    if (stage1Data.length === 0 || loading) return;
    setLoading(true);
    const limit = Math.min(stage1Data.length, 500);
    const results: QualityTicker[] = [];
    setProgress({ current: 0, total: limit, currentSymbol: 'Init' });

    for (let i = 0; i < limit; i++) {
      const target = stage1Data[i];
      setProgress({ current: i + 1, total: limit, currentSymbol: target.symbol });
      if (i % 10 === 0) addLog(`Auditing ${target.symbol}...`, "info");
      
      results.push({
        symbol: target.symbol,
        name: target.name || "N/A",
        price: target.price,
        volume: target.volume,
        marketValue: target.price * target.volume,
        lastUpdate: new Date().toISOString()
      });

      if (i % 50 === 0) setProcessedData([...results]);
      await new Promise(r => setTimeout(r, 100));
    }
    setProcessedData(results);
    setLoading(false);
    setProgress(p => ({ ...p, currentSymbol: 'Complete' }));
    addLog("Deep Quality Extraction Finalized.", "ok");
  };

  const currentPercent = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;

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
                  SCANNING: {loading ? `${progress.currentSymbol} (${currentPercent}%)` : 'Ready'}
                </p>
              </div>
            </div>
            <button onClick={startDeepAnalysis} disabled={loading || stage1Data.length === 0} className="px-12 py-5 bg-purple-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl hover:scale-105 transition-all">
              {loading ? `${currentPercent}% ANALYZING...` : 'Execute Deep Extraction'}
            </button>
          </div>
          <div className="h-4 bg-slate-800 rounded-full overflow-hidden p-0.5 border border-white/5 mb-10">
            <div className="h-full bg-purple-600 transition-all duration-300 rounded-full" style={{ width: `${currentPercent}%` }}></div>
          </div>
        </div>
      </div>
      <div className="xl:col-span-1">
        <div className="glass-panel h-[600px] rounded-[40px] bg-slate-950 border-l-4 border-l-purple-600 flex flex-col p-6 shadow-2xl">
          <h3 className="font-black text-white text-[10px] uppercase tracking-[0.4em] italic mb-6">Quality_Terminal</h3>
          <div ref={logRef} className="flex-1 bg-black/70 p-6 rounded-[32px] font-mono text-[9px] text-purple-300/60 overflow-y-auto no-scrollbar space-y-4 border border-white/5">
            {logs.map((l, i) => <div key={i} className="pl-4 border-l-2 border-purple-900">{l}</div>)}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DeepQualityFilter;
