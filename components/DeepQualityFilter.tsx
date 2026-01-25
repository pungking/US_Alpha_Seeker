
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

interface Props {
  onComplete?: () => void;
  autoStart?: boolean;
}

const DeepQualityFilter: React.FC<Props> = ({ onComplete, autoStart }) => {
  const [loading, setLoading] = useState(false);
  const [processedData, setProcessedData] = useState<QualityTicker[]>([]);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [logs, setLogs] = useState<string[]>(['> Quality_Node v2.3.1: Protocol Handshake Initiated.']);
  
  const accessToken = sessionStorage.getItem('gdrive_access_token');
  const finnhubKey = API_CONFIGS.find(c => c.provider === ApiProvider.FINNHUB)?.key;
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  // 컴포넌트 마운트 시 자동 시작 로직 (Stage 1 결과물을 찾을 때까지 대기)
  useEffect(() => {
    if (autoStart && !loading) {
      addLog("Auto-Pilot Engaged: Preparing Stage 2 Initialization...", "info");
      executeIntegratedScan();
    }
  }, [autoStart]);

  const addLog = (m: string, t: 'info' | 'ok' | 'err' | 'warn' = 'info') => {
    const p = { info: '>', ok: '[OK]', err: '[ERR]', warn: '[WARN]' };
    setLogs(prev => [...prev, `${p[t]} ${m}`].slice(-40));
  };

  const findStage1FileWithRetry = async (retries = 5, delay = 4000): Promise<any> => {
    const q = encodeURIComponent(`name contains 'STAGE1_PURIFIED_UNIVERSE' and trashed = false`);
    for (let i = 0; i < retries; i++) {
      try {
        const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&orderBy=createdTime desc&pageSize=1`, {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        }).then(r => r.json());
        
        if (res.files && res.files.length > 0) {
          return res.files[0];
        }
        addLog(`Waiting for Stage 1 Vault Indexing... (Attempt ${i + 1}/${retries})`, "warn");
        await new Promise(r => setTimeout(r, delay));
      } catch (e) {
        console.error("Drive Search Error:", e);
      }
    }
    return null;
  };

  const executeIntegratedScan = async () => {
    if (!accessToken || loading) {
      if (!accessToken) addLog("Access Token Missing. Please Re-Auth.", "err");
      return;
    }
    
    setLoading(true);
    addLog("Step 1: Synchronizing with Stage 1 Purified Matrix...", "info");
    
    try {
      const file = await findStage1FileWithRetry();

      if (!file) {
        addLog("CRITICAL: Stage 1 data not found after multiple retries. Flow Stalled.", "err");
        setLoading(false);
        return;
      }

      addLog(`Matrix Detected: ${file.name}. Commencing Data Extraction...`, "ok");

      const response = await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });
      
      if (!response.ok) throw new Error("Failed to fetch Stage 1 file content.");
      const content = await response.json();

      const equities = (content.investable_universe || [])
        .map((s: any) => ({ ...s, marketValue: (s.price || 0) * (s.volume || 0) }))
        .sort((a: any, b: any) => b.marketValue - a.marketValue);
      
      const limit = Math.min(equities.length, 300); // 속도를 위해 한도 조절
      setProgress({ current: 0, total: limit });
      addLog(`Scanning Top ${limit} High-Value Nodes for Fundamentals...`, "info");

      const results: QualityTicker[] = [];
      for (let i = 0; i < limit; i++) {
        const target = equities[i];
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
          // API 레이트 제한 준수
          await new Promise(r => setTimeout(r, 600));
        } catch (e) {
          addLog(`Node Latency: Skipping ${target.symbol}.`, "warn");
          await new Promise(r => setTimeout(r, 1000));
        }
      }

      setProcessedData(results);
      addLog(`Scan Protocol Complete. Syncing to Stage 2 Vault...`, "info");

      const folderId = await ensureFolder(accessToken, GOOGLE_DRIVE_TARGET.stage2SubFolder);
      const fileName = `STAGE2_ELITE_UNIVERSE_${new Date().toISOString().split('T')[0]}.json`;
      const payload = {
        manifest: { version: "2.3.1", node: "Deep_Quality_Scan", count: results.length, timestamp: new Date().toISOString() },
        elite_universe: results
      };

      const meta = { name: fileName, parents: [folderId], mimeType: 'application/json' };
      const form = new FormData();
      form.append('metadata', new Blob([JSON.stringify(meta)], { type: 'application/json' }));
      form.append('file', new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));

      const uploadRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST', headers: { 'Authorization': `Bearer ${accessToken}` }, body: form
      });

      if (!uploadRes.ok) throw new Error("Stage 2 Vault Commit Failed.");

      addLog(`Vault Finalized: ${fileName}`, "ok");
      
      // 다음 단계로 전환 신호 발송
      if (onComplete) onComplete();

    } catch (e: any) {
      addLog(`Integrated Protocol Error: ${e.message}`, "err");
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
                <h2 className="text-3xl font-black text-white italic tracking-tighter uppercase leading-none">Elite_Scanner v2.3.1</h2>
                <div className="flex items-center space-x-2 mt-2">
                   <span className="text-[8px] font-black px-2 py-0.5 rounded border border-purple-500/20 bg-purple-500/10 text-purple-400 uppercase tracking-widest italic animate-pulse">
                     {loading ? 'Synthesizing Universal Data...' : 'Cross-Stage Synchronization Active'}
                   </span>
                </div>
              </div>
            </div>
            <button onClick={executeIntegratedScan} disabled={loading} className="px-12 py-5 bg-purple-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:scale-105 active:scale-95 transition-all disabled:opacity-50 shadow-xl shadow-purple-900/20">
              {loading ? 'Analyzing & Uploading...' : 'Scan & Commit Vault'}
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
        </div>
      </div>

      <div className="xl:col-span-1">
        <div className="glass-panel h-[720px] rounded-[40px] bg-slate-950 border-l-4 border-l-purple-600 flex flex-col p-6 shadow-2xl overflow-hidden">
          <div className="flex items-center justify-between mb-8 px-2">
            <h3 className="font-black text-white text-[10px] uppercase tracking-[0.4em] italic">Elite_Terminal</h3>
          </div>
          <div ref={logRef} className="flex-1 bg-black/70 p-6 rounded-[32px] font-mono text-[9px] text-purple-300/60 overflow-y-auto no-scrollbar space-y-4 border border-white/5">
            {logs.map((l, i) => (
              <div key={i} className={`pl-4 border-l-2 ${l.includes('[OK]') ? 'border-emerald-500 text-emerald-400 bg-emerald-500/5' : l.includes('[ERR]') ? 'border-red-500 text-red-400 bg-red-500/5' : 'border-purple-900'}`}>
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
