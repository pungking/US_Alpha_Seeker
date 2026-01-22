
import React, { useState, useEffect, useRef } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { GatheringStats } from '../types';
import { GOOGLE_DRIVE_TARGET } from '../constants';

interface Props {
  onAuthSuccess?: (status: boolean) => void;
}

interface DriveFile {
  name: string;
  stage: string;
  size: string;
  timestamp: string;
  status: 'Committed' | 'Uploading' | 'Error';
  progress: number;
}

const UniverseGathering: React.FC<Props> = ({ onAuthSuccess }) => {
  const [isEngineRunning, setIsEngineRunning] = useState(false);
  const [clientId, setClientId] = useState<string>(localStorage.getItem('gdrive_client_id') || '');
  const [accessToken, setAccessToken] = useState<string | null>(sessionStorage.getItem('gdrive_access_token'));
  const [showSettings, setShowSettings] = useState(!localStorage.getItem('gdrive_client_id'));
  const [currentOrigin, setCurrentOrigin] = useState<string>('');
  
  const [stats, setStats] = useState<GatheringStats>({
    totalFound: 12450,
    processed: 0,
    failed: 0,
    startTime: '-',
    elapsedSeconds: 0,
    estimatedTimeRemaining: 'Awaiting Auth...'
  });

  const [driveFiles, setDriveFiles] = useState<DriveFile[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [consoleLogs, setConsoleLogs] = useState<string[]>(['> Engine ready. Awaiting cloud handshake.']);
  const [performanceData, setPerformanceData] = useState<any[]>([]);
  
  const logEndRef = useRef<HTMLDivElement>(null);
  const tokenClient = useRef<any>(null);

  useEffect(() => {
    // 400 에러 해결을 위한 핵심: 현재 브라우저가 인식하는 정확한 원본 URL
    setCurrentOrigin(window.location.origin);
    if (accessToken && onAuthSuccess) onAuthSuccess(true);
  }, []);

  const initGsi = (id: string) => {
    // @ts-ignore
    if (window.google && id && id.includes('.apps.googleusercontent.com')) {
      try {
        // @ts-ignore
        tokenClient.current = window.google.accounts.oauth2.initTokenClient({
          client_id: id,
          scope: 'https://www.googleapis.com/auth/drive.file',
          callback: (response: any) => {
            if (response.access_token) {
              setAccessToken(response.access_token);
              sessionStorage.setItem('gdrive_access_token', response.access_token);
              setConsoleLogs(cl => [...cl, `> [AUTH] Success. IO Tunnel Stable.`]);
              if (onAuthSuccess) onAuthSuccess(true);
              setShowSettings(false);
            }
            if (response.error) {
              setConsoleLogs(cl => [...cl, `> [AUTH ERROR] ${response.error}: ${response.error_description || 'Check Policy Compliance'}`]);
              // 400 에러 발생 시 사용자 알림
              if (response.error === 'invalid_request') {
                alert("구글 정책 위반 에러(400)가 감지되었습니다. 설정창의 '원본 URL'이 구글 콘솔과 일치하는지 확인하세요.");
              }
            }
          },
        });
        return true;
      } catch (e) {
        return false;
      }
    }
    return false;
  };

  useEffect(() => {
    if (clientId) initGsi(clientId);
  }, [clientId]);

  const handleAuth = () => {
    if (!clientId.includes('.apps.googleusercontent.com')) {
      alert("올바른 Google Client ID 형식이 아닙니다.");
      setShowSettings(true);
      return;
    }

    if (tokenClient.current) {
      tokenClient.current.requestAccessToken();
    } else {
      if (initGsi(clientId)) {
        tokenClient.current.requestAccessToken();
      } else {
        alert("구글 라이브러리 로드 실패. 페이지를 새로고침 하세요.");
      }
    }
  };

  const saveClientId = (id: string) => {
    const trimmed = id.trim();
    setClientId(trimmed);
    localStorage.setItem('gdrive_client_id', trimmed);
  };

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return [h, m, s].map(v => v < 10 ? "0" + v : v).join(":");
  };

  const uploadToDrive = async (fileName: string, data: any) => {
    if (!accessToken) return false;

    try {
      const metadata = {
        name: fileName,
        parents: [GOOGLE_DRIVE_TARGET.folderId],
        mimeType: 'application/json'
      };

      const fileContent = new Blob([JSON.stringify(data)], { type: 'application/json' });
      const formData = new FormData();
      formData.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
      formData.append('file', fileContent);

      const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST',
        headers: new Headers({ 'Authorization': 'Bearer ' + accessToken }),
        body: formData
      });

      if (response.status === 401) {
        setAccessToken(null);
        sessionStorage.removeItem('gdrive_access_token');
        if (onAuthSuccess) onAuthSuccess(false);
        return false;
      }

      return response.ok;
    } catch (error) {
      return false;
    }
  };

  useEffect(() => {
    let timer: any;
    if (isEngineRunning && accessToken) {
      timer = setInterval(() => {
        setStats(prev => ({ ...prev, elapsedSeconds: prev.elapsedSeconds + 1 }));
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [isEngineRunning, accessToken]);

  useEffect(() => {
    let interval: any;
    if (isEngineRunning && accessToken) {
      interval = setInterval(async () => {
        const batchSize = Math.floor(Math.random() * 20) + 30;
        
        setStats(prev => {
          const newProcessed = Math.min(prev.processed + batchSize, prev.totalFound);
          const remainingSeconds = Math.floor((prev.totalFound - newProcessed) / (batchSize / 1.5));

          if (newProcessed % 600 < batchSize && newProcessed > 0) {
            const fileName = `STAGE0_REALSYNC_${Math.floor(newProcessed / 600)}.json`;
            const payload = { timestamp: new Date().toISOString(), tickers: batchSize, status: "UniverseSync" };
            
            setDriveFiles(df => [{
              name: fileName,
              stage: 'Stage 0',
              size: '2.1 KB',
              timestamp: new Date().toLocaleTimeString(),
              status: 'Uploading',
              progress: 50
            }, ...df].slice(0, 8));

            uploadToDrive(fileName, payload).then(success => {
              setDriveFiles(current => 
                current.map(f => f.name === fileName ? { ...f, status: success ? 'Committed' : 'Error', progress: 100 } : f)
              );
              setConsoleLogs(cl => [...cl, success ? `> [IO] COMMIT: ${fileName} verified on Cloud.` : `> [IO] ERROR: Sync failed for ${fileName}.`]);
            });
          }

          return {
            ...prev,
            processed: newProcessed,
            estimatedTimeRemaining: formatTime(remainingSeconds)
          };
        });

        setIsSyncing(true);
        setTimeout(() => setIsSyncing(false), 200);
        setPerformanceData(prev => [...prev.slice(-29), { time: Date.now(), tps: batchSize }].map((d, i) => ({ ...d, index: i })));
      }, 1500);
    }
    return () => clearInterval(interval);
  }, [isEngineRunning, accessToken]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [consoleLogs]);

  const progress = (stats.processed / stats.totalFound) * 100;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
      <div className="xl:col-span-3 space-y-6">
        <div className="glass-panel p-8 rounded-3xl relative overflow-hidden border-t-2 border-t-indigo-500 shadow-2xl">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 gap-6">
            <div>
              <div className="flex items-center space-x-3">
                 <h2 className="text-3xl font-black text-white italic tracking-tight">Gathering Matrix</h2>
                 <button onClick={() => setShowSettings(true)} className="p-2 bg-white/5 text-slate-400 rounded-lg hover:text-white transition-all">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" /></svg>
                 </button>
              </div>
              <div className="flex items-center space-x-2 mt-2">
                 <div className={`w-2 h-2 rounded-full ${accessToken ? 'bg-emerald-500 shadow-[0_0_12px_#10b981]' : 'bg-red-500 animate-pulse'}`}></div>
                 <p className="text-[9px] text-slate-400 font-black uppercase tracking-[0.2em] font-mono">
                    {accessToken ? 'CLOUD_HANDSHAKE_OK' : 'CLOUD_HANDSHAKE_FAILED'}
                 </p>
              </div>
            </div>
            
            <div className="flex space-x-4">
              {!accessToken ? (
                <button 
                  onClick={handleAuth}
                  className="px-10 py-5 rounded-2xl bg-white text-indigo-900 text-xs font-black uppercase tracking-widest shadow-xl hover:bg-indigo-50 transition-all flex items-center space-x-3 active:scale-95"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
                  <span>Connect Google Cloud</span>
                </button>
              ) : (
                <button 
                  onClick={() => setIsEngineRunning(!isEngineRunning)}
                  className={`px-12 py-5 rounded-2xl text-xs font-black uppercase tracking-widest transition-all active:scale-95 ${
                    isEngineRunning ? 'bg-slate-900 text-red-500 border border-red-500/40' : 'bg-indigo-600 text-white shadow-indigo-600/40'
                  }`}
                >
                  {isEngineRunning ? 'Halt Process' : 'Engage Matrix'}
                </button>
              )}
            </div>
          </div>

          {showSettings && (
            <div className="absolute inset-0 z-50 bg-slate-950/95 backdrop-blur-xl flex items-center justify-center p-6 animate-in zoom-in duration-200">
               <div className="max-w-xl w-full glass-panel p-10 rounded-3xl border-indigo-500/30">
                  <div className="flex justify-between items-center mb-8">
                    <h3 className="text-2xl font-black text-white italic">Protocol Config</h3>
                    <button onClick={() => setShowSettings(false)} className="text-slate-500 hover:text-white transition-colors">
                       <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </div>

                  <div className="space-y-6">
                     <div>
                        <label className="text-[10px] font-black text-indigo-400 uppercase tracking-widest block mb-2">Google Client ID</label>
                        <input 
                           type="text" 
                           value={clientId}
                           onChange={(e) => saveClientId(e.target.value)}
                           className="w-full bg-slate-900 border border-slate-700 rounded-xl p-4 text-xs font-mono text-white focus:border-indigo-500 outline-none transition-all"
                        />
                     </div>
                     
                     <div className="p-5 bg-red-500/10 rounded-xl border border-red-500/20">
                        <p className="text-[10px] font-black text-red-400 uppercase mb-3 underline">Essential: 400 Error Fix</p>
                        <p className="text-[11px] text-slate-400 leading-relaxed mb-4">구글 콘솔의 '승인된 JavaScript 원본'에 아래 주소를 <span className="text-white font-bold italic">정확히</span> 입력했는지 확인하세요.</p>
                        <div className="flex items-center justify-between bg-black/50 p-3 rounded-lg border border-white/5 font-mono text-[11px] text-indigo-300">
                           <span className="truncate mr-2">{currentOrigin}</span>
                           <button onClick={() => navigator.clipboard.writeText(currentOrigin)} className="px-3 py-1 bg-indigo-600 text-[10px] text-white rounded font-black hover:bg-indigo-500">COPY</button>
                        </div>
                        {!currentOrigin.startsWith('https') && !currentOrigin.includes('localhost') && (
                          <p className="mt-4 text-[10px] text-amber-400 font-bold bg-amber-400/10 p-2 rounded">Warning: Google OAuth requires HTTPS. (Non-local HTTP detected)</p>
                        )}
                     </div>

                     <button onClick={() => setShowSettings(false)} className="w-full py-5 bg-indigo-600 rounded-2xl text-xs font-black uppercase text-white hover:bg-indigo-500 transition-all">Apply & Return</button>
                  </div>
               </div>
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-10">
             {[
               { label: 'Runtime', value: formatTime(stats.elapsedSeconds), color: 'text-white' },
               { label: 'Time Remaining', value: stats.estimatedTimeRemaining, color: 'text-indigo-400' },
               { label: 'Data Synced', value: stats.processed.toLocaleString(), color: 'text-white' },
               { label: 'Total Universe', value: '12,450', color: 'text-slate-700' }
             ].map((item, idx) => (
               <div key={idx} className="p-6 bg-slate-900/40 rounded-2xl border border-slate-800/40">
                 <p className="text-[10px] font-black text-slate-500 uppercase mb-2 tracking-[0.2em]">{item.label}</p>
                 <p className={`text-3xl font-mono font-black ${item.color} leading-none`}>{item.value}</p>
               </div>
             ))}
          </div>

          <div className="space-y-4 mb-10">
            <div className="flex justify-between items-end px-1">
               <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest italic">Physical Layer Synchronization</span>
               <span className="text-xl font-black text-white">{progress.toFixed(2)}%</span>
            </div>
            <div className="h-4 w-full bg-slate-950 rounded-full border border-slate-800 p-1">
               <div className="h-full bg-indigo-500 transition-all duration-1000 shadow-[0_0_15px_rgba(99,102,241,0.5)] rounded-full relative" style={{ width: `${progress}%` }}>
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-[shimmer_2s_infinite]"></div>
               </div>
            </div>
          </div>

          <div className="h-44 opacity-80">
             <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={performanceData}>
                  <Area type="monotone" dataKey="tps" stroke="#6366f1" strokeWidth={3} fillOpacity={0.05} fill="#6366f1" />
                </AreaChart>
             </ResponsiveContainer>
          </div>
        </div>

        <div className="glass-panel p-8 rounded-3xl shadow-xl border-t border-white/5">
           <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] mb-8">Cloud Write Manifest (Last 8)</h3>
           <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {driveFiles.map((file, idx) => (
                <div key={idx} className={`p-5 rounded-2xl border transition-all ${file.status === 'Committed' ? 'bg-slate-800/20 border-slate-800 hover:border-emerald-500/30' : 'bg-indigo-500/5 border-indigo-500/20 animate-pulse'}`}>
                  <div className="flex justify-between items-center">
                    <div className="flex items-center space-x-4">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${file.status === 'Committed' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-indigo-500/10 text-indigo-400'}`}>
                         <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z"></path></svg>
                      </div>
                      <div>
                         <p className="text-[11px] font-black text-white font-mono">{file.name}</p>
                         <p className="text-[8px] text-slate-600 font-bold uppercase mt-1 tracking-wider">{file.timestamp} • {file.size} • STAGE 0</p>
                      </div>
                    </div>
                    <span className={`px-3 py-1 text-[8px] font-black rounded-lg uppercase border ${file.status === 'Committed' ? 'bg-emerald-500/5 text-emerald-400 border-emerald-500/20' : 'bg-indigo-500/5 text-indigo-400 border-indigo-500/20'}`}>
                      {file.status}
                    </span>
                  </div>
                </div>
              ))}
              {driveFiles.length === 0 && (
                <div className="col-span-2 py-20 text-center border-2 border-dashed border-slate-900 rounded-3xl">
                   <p className="text-sm font-black text-slate-800 uppercase tracking-[0.3em] italic opacity-30">Waiting for Cloud Tunnel Initialization...</p>
                </div>
              )}
           </div>
        </div>
      </div>

      <div className="space-y-6">
        <div className="glass-panel p-6 rounded-3xl bg-slate-900 border-l-4 border-l-indigo-500 shadow-2xl">
          <div className="flex justify-between items-center mb-6 px-1">
            <h3 className="font-black text-white uppercase text-lg italic tracking-tighter">Sync Log</h3>
            <span className={`px-2 py-1 text-[8px] font-black rounded ${accessToken ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
              {accessToken ? 'ONLINE' : 'OFFLINE'}
            </span>
          </div>
          <div className="bg-black/60 p-5 rounded-2xl font-mono text-[10px] text-indigo-300/60 h-[520px] overflow-y-auto scrollbar-hide space-y-4 shadow-inner border border-white/5">
            {consoleLogs.map((log, i) => (
              <div key={i} className="border-l border-indigo-500/20 pl-4 py-1 animate-in fade-in slide-in-from-left-2">
                <span className="text-slate-800 mr-2 text-[8px]">{new Date().toLocaleTimeString()}</span>
                {log}
              </div>
            ))}
            <div ref={logEndRef} />
          </div>
          <button 
            disabled={!accessToken}
            onClick={() => window.open(`https://drive.google.com/drive/folders/${GOOGLE_DRIVE_TARGET.folderId}`, '_blank')}
            className={`w-full mt-6 py-5 rounded-2xl text-[10px] font-black uppercase tracking-[0.3em] transition-all border ${accessToken ? 'bg-slate-800 text-indigo-400 border-indigo-500/20 hover:bg-slate-700' : 'bg-slate-950 text-slate-800 border-slate-900 cursor-not-allowed opacity-50'}`}
          >
            Access Data Vault
          </button>
        </div>
      </div>
    </div>
  );
};

export default UniverseGathering;
