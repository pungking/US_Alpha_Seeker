
import React, { useState, useEffect, useRef } from 'react';
import { AreaChart, Area, ResponsiveContainer } from 'recharts';
import { GatheringStats } from '../types';
import { GOOGLE_DRIVE_TARGET, API_CONFIGS } from '../constants';
import { ApiProvider } from '../types';

interface Props {
  onAuthSuccess?: (status: boolean) => void;
}

interface DriveFile {
  name: string;
  size: string;
  timestamp: string;
  status: string;
}

const UniverseGathering: React.FC<Props> = ({ onAuthSuccess }) => {
  const [isEngineRunning, setIsEngineRunning] = useState(false);
  const [clientId, setClientId] = useState<string>(localStorage.getItem('gdrive_client_id') || '');
  const [accessToken, setAccessToken] = useState<string | null>(sessionStorage.getItem('gdrive_access_token'));
  const [showSettings, setShowSettings] = useState(!localStorage.getItem('gdrive_client_id'));
  const [currentOrigin, setCurrentOrigin] = useState<string>('');
  const [targetFolderId, setTargetFolderId] = useState<string>(GOOGLE_DRIVE_TARGET.folderId);
  
  const polygonKey = API_CONFIGS.find(c => c.provider === ApiProvider.POLYGON)?.key;

  const [stats, setStats] = useState<GatheringStats>({
    totalFound: 0,
    processed: 0,
    failed: 0,
    startTime: '-',
    elapsedSeconds: 0,
    estimatedTimeRemaining: 'Ready'
  });

  const [driveFiles, setDriveFiles] = useState<DriveFile[]>([]);
  const [consoleLogs, setConsoleLogs] = useState<string[]>(['> Matrix Node V2.0 Initialized...']);
  const [performanceData, setPerformanceData] = useState<any[]>([]);
  
  const logContainerRef = useRef<HTMLDivElement>(null);
  const tokenClient = useRef<any>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    const origin = window.location.origin.replace(/\/$/, "");
    setCurrentOrigin(origin);
    if (accessToken && onAuthSuccess) onAuthSuccess(true);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  // 페이지 전체 스크롤을 방지하기 위해 컨테이너 내부 스크롤만 조절
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [consoleLogs]);

  const findTargetSubFolder = async (token: string) => {
    try {
      const response = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=name='Stage0_Universe_Data' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const data = await response.json();
      if (data.files && data.files.length > 0) {
        setTargetFolderId(data.files[0].id);
        setConsoleLogs(cl => [...cl, `> [SUCCESS] Cloud Path: ${data.files[0].name}`]);
      }
    } catch (e) {
      setConsoleLogs(cl => [...cl, `> [ERROR] Folder discovery failed.`]);
    }
  };

  const initGsi = (id: string) => {
    // @ts-ignore
    if (window.google && id && id.includes('.apps.googleusercontent.com')) {
      try {
        // @ts-ignore
        tokenClient.current = window.google.accounts.oauth2.initTokenClient({
          client_id: id,
          scope: 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.metadata.readonly',
          callback: (response: any) => {
            if (response.access_token) {
              setAccessToken(response.access_token);
              sessionStorage.setItem('gdrive_access_token', response.access_token);
              findTargetSubFolder(response.access_token);
              if (onAuthSuccess) onAuthSuccess(true);
              setShowSettings(false);
            }
          },
        });
        return true;
      } catch (e) { return false; }
    }
    return false;
  };

  useEffect(() => { if (clientId) initGsi(clientId); }, [clientId]);

  const handleAuth = () => {
    if (!clientId) { setShowSettings(true); return; }
    tokenClient.current ? tokenClient.current.requestAccessToken() : (initGsi(clientId) && tokenClient.current.requestAccessToken());
  };

  const uploadToDrive = async (fileName: string, tickers: any[]) => {
    if (!accessToken) return false;
    try {
      const metadata = { name: fileName, parents: [targetFolderId], mimeType: 'application/json' };
      const fileContent = new Blob([JSON.stringify({
        source: "Polygon.io",
        batch_timestamp: new Date().toISOString(),
        target_stage: "Stage0_Universe",
        count: tickers.length,
        data: tickers
      }, null, 2)], { type: 'application/json' });

      const formData = new FormData();
      formData.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
      formData.append('file', fileContent);

      const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST',
        headers: new Headers({ 'Authorization': 'Bearer ' + accessToken }),
        body: formData
      });
      return response.ok;
    } catch (error) { return false; }
  };

  const startGathering = async () => {
    if (!accessToken) { handleAuth(); return; }
    if (!polygonKey) {
      setConsoleLogs(cl => [...cl, `> [BLOCK] Polygon API Key missing.`]);
      return;
    }

    setIsEngineRunning(true);
    setConsoleLogs(cl => [...cl, `> [ENGINE] Initiating Full Market Sweep...`]);
    
    const startTimestamp = Date.now();
    let processedCount = 0;
    let batchIndex = 1;

    setStats(prev => ({ ...prev, startTime: new Date().toLocaleTimeString(), processed: 0, elapsedSeconds: 0 }));

    timerRef.current = window.setInterval(() => {
      setStats(prev => ({ ...prev, elapsedSeconds: Math.floor((Date.now() - startTimestamp) / 1000) }));
    }, 1000);

    try {
      // 1. 초기 URL 설정
      let nextUrl = `https://api.polygon.io/v3/reference/tickers?active=true&market=stocks&limit=1000&apiKey=${polygonKey}`;
      
      while (nextUrl) {
        setConsoleLogs(cl => [...cl, `> [API] Fetching Ticker Batch...`]);
        const response = await fetch(nextUrl);
        const data = await response.json();
        
        if (data.results && data.results.length > 0) {
          const tickers = data.results;
          processedCount += tickers.length;
          
          // 실시간 통계 업데이트 (TotalFound는 첫 호출에서 count가 있으면 좋으나 Polygon은 전체 count를 주지 않으므로 추정치 사용)
          // Polygon API V3는 전체 count를 제공하지 않으므로, 수집하면서 계속 늘어남
          setStats(prev => {
            const elapsed = (Date.now() - startTimestamp) / 1000;
            const rate = processedCount / elapsed;
            // 미국 전체 종목은 대략 12,000개 전후
            const estimatedTotal = 12000; 
            const remaining = estimatedTotal - processedCount;
            const etaSec = rate > 0 ? Math.ceil(remaining / rate) : 0;
            const etaFormatted = etaSec > 0 ? (etaSec > 60 ? `${Math.floor(etaSec/60)}m ${etaSec%60}s` : `${etaSec}s`) : 'Calibrating...';

            return { 
              ...prev, 
              totalFound: Math.max(estimatedTotal, processedCount),
              processed: processedCount,
              estimatedTimeRemaining: etaFormatted
            };
          });

          const fileName = `STG0_ALL_B${batchIndex}_${Date.now()}.json`;
          const success = await uploadToDrive(fileName, tickers);
          
          if (success) {
            setConsoleLogs(cl => [...cl, `> [CLOUD] Batch ${batchIndex} synced (${tickers.length} tickers).`]);
            setDriveFiles(df => [{
              name: fileName,
              size: `${(JSON.stringify(tickers).length / 1024).toFixed(1)} KB`,
              timestamp: new Date().toLocaleTimeString(),
              status: 'Synced'
            }, ...df].slice(0, 10));
            setPerformanceData(prev => [...prev.slice(-39), { tps: tickers.length }].map((d, idx) => ({ ...d, index: idx })));
          }

          batchIndex++;
          // Polygon API Pagination: next_url이 있으면 다음 페이지로
          nextUrl = data.next_url ? `${data.next_url}&apiKey=${polygonKey}` : '';
          
          // API 레이트 리밋 방지 (Free tier 고려)
          await new Promise(r => setTimeout(r, 1200)); 
        } else {
          nextUrl = '';
        }
      }
    } catch (e) {
      setConsoleLogs(cl => [...cl, `> [FATAL] Data Pipeline Severed.`]);
    } finally {
      setIsEngineRunning(false);
      if (timerRef.current) clearInterval(timerRef.current);
      setStats(prev => ({ ...prev, totalFound: processedCount, estimatedTimeRemaining: 'Complete' }));
      setConsoleLogs(cl => [...cl, `> [ENGINE] Full Market Sync Completed.`]);
    }
  };

  const progress = stats.totalFound > 0 ? (stats.processed / stats.totalFound) * 100 : 0;
  const formatSeconds = (sec: number) => `${Math.floor(sec/60).toString().padStart(2,'0')}:${(sec%60).toString().padStart(2,'0')}`;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-4 gap-8">
      <div className="xl:col-span-3 space-y-8">
        <div className="glass-panel p-10 rounded-[40px] relative overflow-hidden border-t-2 border-t-blue-500 shadow-2xl transition-all">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-12 gap-8">
            <div>
              <div className="flex items-center space-x-4">
                 <h2 className="text-4xl font-black text-white italic tracking-tighter uppercase">Gathering Matrix</h2>
                 <button onClick={() => setShowSettings(true)} className="px-4 py-1.5 bg-blue-500/10 text-blue-400 text-[10px] font-black rounded-xl border border-blue-500/20 hover:bg-blue-500 hover:text-white transition-all active:scale-95 uppercase tracking-widest">Config</button>
              </div>
              <p className="text-[10px] text-slate-500 font-black uppercase tracking-[0.3em] mt-3 italic">Active Path: /US_Alpha_Seeker/Stage0_Universe_Data</p>
            </div>
            
            <div className="flex space-x-4">
              <button 
                onClick={startGathering} 
                disabled={isEngineRunning} 
                className={`px-14 py-6 rounded-2xl text-xs font-black uppercase tracking-[0.3em] transition-all shadow-xl active:scale-95 ${isEngineRunning ? 'bg-slate-900 text-blue-500 border border-blue-500/40 animate-pulse cursor-not-allowed' : 'bg-blue-600 text-white shadow-blue-600/40 hover:bg-blue-500'}`}
              >
                {isEngineRunning ? 'System Syncing...' : 'Engage Matrix'}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-12">
             {[
               { label: 'Synced Assets', value: stats.processed.toLocaleString(), color: 'text-white' },
               { label: 'Elapsed', value: formatSeconds(stats.elapsedSeconds), color: 'text-emerald-400' },
               { label: 'Estimated ETA', value: stats.estimatedTimeRemaining, color: 'text-amber-500' },
               { label: 'Matrix Health', value: '100%', color: 'text-indigo-400' }
             ].map((item, idx) => (
               <div key={idx} className="p-8 bg-slate-900/50 rounded-3xl border border-white/5 shadow-inner transition-all hover:bg-slate-900">
                 <p className="text-[10px] font-black text-slate-600 uppercase mb-3 tracking-widest">{item.label}</p>
                 <p className={`text-2xl font-mono font-black ${item.color} italic tracking-tighter`}>{item.value}</p>
               </div>
             ))}
          </div>

          <div className="space-y-6 mb-12">
            <div className="flex justify-between items-end px-2">
               <span className="text-[11px] font-black text-slate-500 uppercase tracking-[0.3em] italic">Full Market Sync Progress</span>
               <span className="text-3xl font-black text-white font-mono tracking-tighter italic">{progress.toFixed(1)}%</span>
            </div>
            <div className="h-4 w-full bg-slate-950 rounded-full border border-white/5 p-1 overflow-hidden">
               <div className="h-full bg-gradient-to-r from-blue-700 via-indigo-500 to-emerald-400 transition-all duration-1000 shadow-[0_0_20px_rgba(79,70,229,0.5)] rounded-full" style={{ width: `${progress}%` }}></div>
            </div>
          </div>

          <div className="h-56 opacity-80 -mx-4">
             <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={performanceData}>
                  <Area type="monotone" dataKey="tps" stroke="#6366f1" strokeWidth={4} fillOpacity={0.2} fill="#6366f1" />
                </AreaChart>
             </ResponsiveContainer>
          </div>
        </div>

        <div className="glass-panel p-10 rounded-[40px] border-t border-white/5 shadow-2xl">
           <h3 className="text-[11px] font-black text-slate-500 uppercase tracking-[0.4em] mb-12 italic">Cloud Vault Manifest (Stage 0)</h3>
           <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {driveFiles.map((file, idx) => (
                <div key={idx} className="p-6 rounded-3xl border border-white/5 bg-slate-900/50 flex justify-between items-center group transition-all">
                   <div className="flex items-center space-x-5">
                      <div className="w-12 h-12 bg-emerald-500/10 rounded-2xl flex items-center justify-center text-emerald-400 shadow-inner">
                         <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                      </div>
                      <div>
                         <p className="text-sm font-black text-white font-mono tracking-tighter truncate max-w-[150px]">{file.name}</p>
                         <p className="text-[10px] text-slate-600 font-bold uppercase mt-1 tracking-widest italic">{file.timestamp} • {file.size}</p>
                      </div>
                   </div>
                   <span className="text-[10px] font-black text-emerald-400 border border-emerald-500/30 px-3 py-1.5 rounded-xl uppercase tracking-tighter bg-emerald-500/5">Synced</span>
                </div>
              ))}
              {driveFiles.length === 0 && (
                <div className="col-span-2 py-32 text-center border-4 border-dashed border-white/5 rounded-[40px]">
                   <p className="text-[10px] font-black text-slate-800 uppercase tracking-[0.6em] italic">Matrix Initialization Pending</p>
                </div>
              )}
           </div>
        </div>
      </div>

      <div className="space-y-8">
        <div className="glass-panel p-8 rounded-[40px] bg-slate-950 border-l-8 border-l-indigo-600 shadow-2xl sticky top-8">
          <h3 className="font-black text-white uppercase text-xl italic tracking-tighter mb-8">IO Data Stream</h3>
          <div ref={logContainerRef} className="bg-black/90 p-6 rounded-[24px] font-mono text-indigo-400/80 h-[580px] overflow-y-auto no-scrollbar space-y-5 shadow-inner border border-white/5 scroll-smooth text-[9px]">
            {consoleLogs.map((log, i) => (
              <div key={i} className="border-l-2 border-indigo-600/30 pl-5 py-2">
                <span className="text-slate-800 mr-3 text-[9px] font-bold">[{new Date().toLocaleTimeString()}]</span>
                <span>{log}</span>
              </div>
            ))}
          </div>
          <button onClick={() => window.open(`https://drive.google.com/drive/folders/${targetFolderId}`, '_blank')} className="w-full mt-8 py-6 rounded-3xl bg-white text-slate-950 text-[11px] font-black uppercase tracking-[0.5em] hover:bg-indigo-600 hover:text-white transition-all">Access Vault</button>
        </div>
      </div>

      {showSettings && (
        <div className="fixed inset-0 z-[100] bg-slate-950/98 backdrop-blur-3xl flex items-center justify-center p-8 animate-in zoom-in duration-300">
           <div className="max-w-2xl w-full glass-panel p-12 rounded-[48px] border-white/10 shadow-[0_0_150px_rgba(0,0,0,1)]">
              <div className="flex justify-between items-center mb-8">
                <h3 className="text-3xl font-black text-white tracking-tighter italic uppercase">Cloud Setup</h3>
                <button onClick={() => setShowSettings(false)} className="w-12 h-12 flex items-center justify-center bg-white/5 rounded-2xl hover:bg-red-500/20 transition-all">
                   <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
              <div className="space-y-6">
                 <div className="p-6 rounded-[32px] bg-amber-500/5 border border-amber-500/20">
                    <p className="text-[11px] text-slate-400 leading-relaxed mb-2 uppercase font-black">JavaScript Origins</p>
                    <div className="bg-black/60 p-3 rounded-xl border border-white/5 font-mono text-[11px] text-blue-400 truncate select-all">{currentOrigin}</div>
                 </div>
                 <div className="space-y-2">
                    <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Client ID</label>
                    <input type="text" value={clientId} onChange={(e) => {setClientId(e.target.value); localStorage.setItem('gdrive_client_id', e.target.value)}} className="w-full bg-slate-900 border border-white/10 rounded-xl p-4 text-[10px] font-mono text-white outline-none focus:border-blue-500 transition-colors" placeholder="your-client-id.apps.googleusercontent.com" />
                 </div>
                 <button onClick={() => setShowSettings(false)} className="w-full py-5 bg-white text-slate-950 text-[10px] font-black uppercase rounded-xl tracking-[0.3em] hover:bg-blue-500 hover:text-white transition-all">Apply Configuration</button>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default UniverseGathering;
