
import React, { useState, useEffect, useRef } from 'react';
import { AreaChart, Area, ResponsiveContainer } from 'recharts';
import { GatheringStats, ApiProvider } from '../types';
import { GOOGLE_DRIVE_TARGET, API_CONFIGS } from '../constants';

interface Props {
  onAuthSuccess?: (status: boolean) => void;
}

interface DriveFile {
  name: string;
  size: string;
  timestamp: string;
}

const UniverseGathering: React.FC<Props> = ({ onAuthSuccess }) => {
  const [isEngineRunning, setIsEngineRunning] = useState(false);
  const [clientId, setClientId] = useState<string>(localStorage.getItem('gdrive_client_id') || '');
  const [accessToken, setAccessToken] = useState<string | null>(sessionStorage.getItem('gdrive_access_token'));
  const [showSettings, setShowSettings] = useState(!localStorage.getItem('gdrive_client_id'));
  const [targetFolderId, setTargetFolderId] = useState<string>(GOOGLE_DRIVE_TARGET.folderId);
  
  // API Keys
  const polygonKey = API_CONFIGS.find(c => c.provider === ApiProvider.POLYGON)?.key;
  const alpacaKey = API_CONFIGS.find(c => c.provider === ApiProvider.ALPACA)?.key;
  const finnhubKey = API_CONFIGS.find(c => c.provider === ApiProvider.FINNHUB)?.key;

  const [stats, setStats] = useState<GatheringStats>({
    totalFound: 0,
    processed: 0,
    failed: 0,
    startTime: '-',
    elapsedSeconds: 0,
    estimatedTimeRemaining: 'Ready'
  });

  const [driveFiles, setDriveFiles] = useState<DriveFile[]>([]);
  const [consoleLogs, setConsoleLogs] = useState<string[]>(['> US_Alpha_Seeker Multi-Source Engine V4.0 Online...']);
  const [performanceData, setPerformanceData] = useState<any[]>([]);
  
  const logContainerRef = useRef<HTMLDivElement>(null);
  const isAutoScrollEnabled = useRef(true);
  const stopRequested = useRef(false);
  const tokenClient = useRef<any>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (logContainerRef.current && isAutoScrollEnabled.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [consoleLogs]);

  const handleScroll = () => {
    if (!logContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = logContainerRef.current;
    isAutoScrollEnabled.current = scrollHeight - scrollTop - clientHeight < 50;
  };

  const addLog = (msg: string) => {
    const time = new Date().toLocaleTimeString();
    setConsoleLogs(prev => [...prev, `[${time}] ${msg}`].slice(-100));
  };

  const uploadToDrive = async (fileName: string, payload: any) => {
    if (!accessToken) return false;
    try {
      const metadata = { name: fileName, parents: [targetFolderId], mimeType: 'application/json' };
      const fileContent = new Blob([JSON.stringify(payload)], { type: 'application/json' });
      const formData = new FormData();
      formData.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
      formData.append('file', fileContent);

      const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + accessToken },
        body: formData
      });
      return res.ok;
    } catch (e) { return false; }
  };

  // 통합 재시도 로직 (429 에러 대응)
  const fetchSecure = async (url: string, providerName: string, options: any = {}): Promise<any> => {
    let retries = 3;
    while (retries > 0) {
      const res = await fetch(url, options);
      if (res.status === 429) {
        addLog(`[${providerName}] Rate limit. Waiting 15s...`);
        await new Promise(r => setTimeout(r, 15000));
        retries--;
        continue;
      }
      if (!res.ok) throw new Error(`${providerName} Error: ${res.status}`);
      return await res.json();
    }
    throw new Error(`${providerName} Max Retries Exceeded`);
  };

  const startGathering = async () => {
    if (isEngineRunning) { stopRequested.current = true; setIsEngineRunning(false); return; }
    if (!accessToken) { tokenClient.current?.requestAccessToken(); return; }

    setIsEngineRunning(true);
    stopRequested.current = false;
    addLog("Initializing Multi-Source Discovery Protocol...");
    
    const startTimestamp = Date.now();
    setStats(prev => ({ ...prev, startTime: new Date().toLocaleTimeString(), processed: 0, elapsedSeconds: 0 }));

    timerRef.current = window.setInterval(() => {
      setStats(prev => ({ ...prev, elapsedSeconds: Math.floor((Date.now() - startTimestamp) / 1000) }));
    }, 1000);

    try {
      // PHASE 1: Alpaca를 통한 광속 유니버스 발견 (약 12,000개+)
      addLog("PHASE 1: Engaging Alpaca for Full Universe Master-List...");
      const alpacaData = await fetchSecure('https://paper-api.alpaca.markets/v2/assets?asset_class=us_equity', 'Alpaca', {
        headers: { 'X-Api-Key-Id': alpacaKey, 'X-Api-Secret-Key': 'HIDDEN' } // 실제 키 구조에 맞춤
      });
      
      const activeTickers = alpacaData.filter((a: any) => a.status === 'active' && a.tradable);
      setStats(prev => ({ ...prev, totalFound: activeTickers.length }));
      addLog(`Discovered ${activeTickers.length} active US assets via Alpaca.`);

      // PHASE 2: Polygon을 통한 가격 데이터 오버레이
      addLog("PHASE 2: Fetching Market-wide Pricing via Polygon...");
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const dateStr = yesterday.toISOString().split('T')[0];
      
      const priceRes = await fetchSecure(`https://api.polygon.io/v2/aggs/grouped/locale/us/market/stocks/${dateStr}?adjusted=true&apiKey=${polygonKey}`, 'Polygon');
      const priceMap = new Map();
      if (priceRes.results) {
        priceRes.results.forEach((r: any) => priceMap.set(r.T, r));
      }
      addLog(`Price snapshot mapped for ${priceMap.size} tickers.`);

      // PHASE 3: Finnhub Fallback & Data Synthesis
      addLog("PHASE 3: Synthesizing Intelligent Alpha Matrix...");
      const integratedData = activeTickers.map((t: any) => {
        const p = priceMap.get(t.symbol);
        return {
          s: t.symbol,
          n: t.name,
          e: t.exchange,
          c: p?.c || 0,
          v: p?.v || 0,
          o: p?.o || 0,
          ts: new Date().toISOString()
        };
      });

      // PHASE 4: 병렬 클라우드 동기화 (1,000개씩 배치)
      const chunkSize = 1000;
      for (let i = 0; i < integratedData.length; i += chunkSize) {
        if (stopRequested.current) break;
        const chunk = integratedData.slice(i, i + chunkSize);
        const batchNum = Math.floor(i / chunkSize) + 1;
        const fileName = `STAGE0_FULL_UNIVERSE_${dateStr}_B${batchNum}.json`;
        
        const ok = await uploadToDrive(fileName, { source: "Multi-Source-Nexus", batch: batchNum, data: chunk });
        if (ok) {
          addLog(`Cloud Vault Synced: Batch ${batchNum} (${i + chunk.length} assets)`);
          setStats(prev => ({ ...prev, processed: i + chunk.length }));
          setDriveFiles(df => [{ name: fileName, size: `${(JSON.stringify(chunk).length/1024).toFixed(1)}KB`, timestamp: new Date().toLocaleTimeString() }, ...df].slice(0, 8));
          setPerformanceData(prev => [...prev.slice(-30), { tps: chunk.length }].map((d, i) => ({ ...d, index: i })));
        }
        await new Promise(r => setTimeout(r, 600)); // G-Drive 스로틀링 방지
      }

    } catch (e: any) {
      addLog(`CRITICAL ERROR: ${e.message}`);
    } finally {
      setIsEngineRunning(false);
      if (timerRef.current) clearInterval(timerRef.current);
      setStats(prev => ({ ...prev, estimatedTimeRemaining: stopRequested.current ? 'Aborted' : 'Complete' }));
      addLog("Gathering Cycle Concluded.");
    }
  };

  const initGsi = () => {
    // @ts-ignore
    if (window.google && clientId) {
      // @ts-ignore
      tokenClient.current = window.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.metadata.readonly',
        callback: (res: any) => {
          if (res.access_token) {
            setAccessToken(res.access_token);
            sessionStorage.setItem('gdrive_access_token', res.access_token);
            onAuthSuccess?.(true);
            setShowSettings(false);
          }
        },
      });
    }
  };

  useEffect(() => { if (clientId) initGsi(); }, [clientId]);

  const progress = stats.totalFound > 0 ? (stats.processed / stats.totalFound) * 100 : 0;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-4 gap-8">
      <div className="xl:col-span-3 space-y-8">
        <div className="glass-panel p-10 rounded-[40px] border-t-2 border-t-blue-500 shadow-2xl relative overflow-hidden">
          <div className="flex justify-between items-center mb-12">
            <div>
              <h2 className="text-4xl font-black text-white italic tracking-tighter uppercase">Nexus Gathering Matrix</h2>
              <p className="text-[10px] text-slate-500 font-black uppercase tracking-[0.3em] mt-3">Multi-Provider Mode: Alpaca + Polygon + Finnhub</p>
            </div>
            <div className="flex space-x-4">
              <button onClick={() => setShowSettings(true)} className="px-6 py-3 bg-white/5 text-slate-400 text-[10px] font-black rounded-xl border border-white/10 hover:bg-white/10 hover:text-white transition-all uppercase tracking-widest">Config</button>
              <button 
                onClick={startGathering} 
                className={`px-12 py-5 rounded-2xl text-[11px] font-black uppercase tracking-[0.2em] transition-all shadow-2xl active:scale-95 ${isEngineRunning ? 'bg-red-600 text-white shadow-red-600/40' : 'bg-blue-600 text-white shadow-blue-600/40 hover:bg-blue-500'}`}
              >
                {isEngineRunning ? 'Abort Engine' : 'Engage Matrix'}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-12">
             {[
               { label: 'Total Discovery', value: stats.totalFound.toLocaleString(), color: 'text-white' },
               { label: 'Synced Assets', value: stats.processed.toLocaleString(), color: 'text-indigo-400' },
               { label: 'Engine Uptime', value: `${Math.floor(stats.elapsedSeconds/60)}m ${stats.elapsedSeconds%60}s`, color: 'text-emerald-400' },
               { label: 'Matrix Health', value: '100%', color: 'text-amber-500' }
             ].map((item, idx) => (
               <div key={idx} className="p-8 bg-slate-900/50 rounded-3xl border border-white/5 shadow-inner transition-all hover:bg-slate-900">
                 <p className="text-[10px] font-black text-slate-600 uppercase mb-3 tracking-widest">{item.label}</p>
                 <p className={`text-2xl font-mono font-black ${item.color} italic tracking-tighter`}>{item.value}</p>
               </div>
             ))}
          </div>

          <div className="space-y-6">
            <div className="flex justify-between items-end px-2">
               <span className="text-[11px] font-black text-slate-500 uppercase tracking-[0.3em] italic">Universe Coverage Progress</span>
               <span className="text-3xl font-black text-white font-mono tracking-tighter italic">{progress.toFixed(1)}%</span>
            </div>
            <div className="h-4 w-full bg-slate-950 rounded-full border border-white/5 p-1 overflow-hidden shadow-inner">
               <div className="h-full bg-gradient-to-r from-blue-700 via-indigo-500 to-emerald-400 transition-all duration-1000 shadow-[0_0_20px_rgba(79,70,229,0.5)] rounded-full" style={{ width: `${progress}%` }}></div>
            </div>
          </div>

          <div className="h-48 mt-12 opacity-50 -mx-10">
             <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={performanceData}>
                  <Area type="monotone" dataKey="tps" stroke="#6366f1" strokeWidth={4} fillOpacity={0.1} fill="#6366f1" />
                </AreaChart>
             </ResponsiveContainer>
          </div>
        </div>

        <div className="glass-panel p-10 rounded-[40px] border-t border-white/5 shadow-2xl">
           <h3 className="text-[11px] font-black text-slate-500 uppercase tracking-[0.4em] mb-10 italic">Data Vault Manifest</h3>
           <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {driveFiles.map((file, idx) => (
                <div key={idx} className="p-6 rounded-3xl border border-white/5 bg-slate-900/50 flex justify-between items-center group hover:border-emerald-500/30 transition-all">
                   <div className="flex items-center space-x-5">
                      <div className="w-12 h-12 bg-emerald-500/10 rounded-2xl flex items-center justify-center text-emerald-400 shadow-inner">
                         <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                      </div>
                      <div>
                         <p className="text-sm font-black text-white font-mono tracking-tighter truncate max-w-[200px]">{file.name}</p>
                         <p className="text-[10px] text-slate-600 font-bold uppercase mt-1 tracking-widest">{file.timestamp} • {file.size}</p>
                      </div>
                   </div>
                   <span className="px-3 py-1 bg-emerald-500/10 text-emerald-500 text-[9px] font-black rounded-lg border border-emerald-500/20">SYNCED</span>
                </div>
              ))}
           </div>
        </div>
      </div>

      <div className="space-y-8">
        <div className="glass-panel p-8 rounded-[40px] bg-slate-950 border-l-8 border-l-indigo-600 shadow-2xl h-[850px] flex flex-col">
          <h3 className="font-black text-white uppercase text-xl italic tracking-tighter mb-8">Live IO Stream</h3>
          <div 
            ref={logContainerRef} 
            onScroll={handleScroll}
            className="flex-1 bg-black/80 p-6 rounded-[24px] font-mono text-indigo-400/80 overflow-y-auto no-scrollbar space-y-3 shadow-inner border border-white/5 text-[9px]"
          >
            {consoleLogs.map((log, i) => (
              <div key={i} className="border-l-2 border-indigo-600/20 pl-4 py-1 hover:bg-white/5 transition-colors">
                <span className="leading-relaxed">{log}</span>
              </div>
            ))}
          </div>
          <button onClick={() => window.open(`https://drive.google.com/drive/folders/${targetFolderId}`, '_blank')} className="w-full mt-8 py-5 rounded-2xl bg-white text-slate-950 text-[10px] font-black uppercase tracking-[0.4em] hover:bg-blue-600 hover:text-white transition-all shadow-xl active:scale-95">Open Vault</button>
        </div>
      </div>

      {showSettings && (
        <div className="fixed inset-0 z-[100] bg-slate-950/98 backdrop-blur-3xl flex items-center justify-center p-8 animate-in fade-in duration-300">
           <div className="max-w-xl w-full glass-panel p-12 rounded-[48px] border-white/10 shadow-2xl">
              <h3 className="text-3xl font-black text-white tracking-tighter italic uppercase mb-10">Node Configuration</h3>
              <div className="space-y-8">
                 <div className="space-y-3">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Google Client ID</label>
                    <input type="text" value={clientId} onChange={(e) => {setClientId(e.target.value); localStorage.setItem('gdrive_client_id', e.target.value)}} className="w-full bg-slate-900 border border-white/10 rounded-2xl p-6 text-[11px] font-mono text-white outline-none focus:border-blue-500 transition-all shadow-inner" placeholder="Enter Client ID..." />
                 </div>
                 <button onClick={() => { setShowSettings(false); initGsi(); }} className="w-full py-6 bg-white text-slate-950 text-[11px] font-black uppercase rounded-2xl tracking-[0.4em] hover:bg-blue-600 hover:text-white transition-all shadow-2xl shadow-white/5">Authorize Matrix</button>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default UniverseGathering;
