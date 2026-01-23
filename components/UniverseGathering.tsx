
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
  
  // Fix: Define isProd locally to determine if the environment is production
  const isProd = window.location.hostname === 'us-alpha-seeker.vercel.app';

  const [stats, setStats] = useState<GatheringStats>({
    totalFound: 12450,
    processed: 0,
    failed: 0,
    startTime: '-',
    elapsedSeconds: 0,
    estimatedTimeRemaining: 'Awaiting Auth...'
  });

  const [driveFiles, setDriveFiles] = useState<DriveFile[]>([]);
  const [consoleLogs, setConsoleLogs] = useState<string[]>(['> Matrix Node V1.2 Initialized...']);
  const [performanceData, setPerformanceData] = useState<any[]>([]);
  
  const logEndRef = useRef<HTMLDivElement>(null);
  const tokenClient = useRef<any>(null);

  useEffect(() => {
    // Vercel 배포 주소에서 끝 슬래시를 제거한 순수 Origin 추출
    const origin = window.location.origin.replace(/\/$/, "");
    setCurrentOrigin(origin);
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
              setConsoleLogs(cl => [...cl, `> [CLOUD] Authentication Verified. Session active.`]);
              if (onAuthSuccess) onAuthSuccess(true);
              setShowSettings(false);
            }
            if (response.error) {
              setConsoleLogs(cl => [...cl, `> [AUTH ERROR] ${response.error}: Verify JavaScript Origin in Google Console.`]);
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
      alert("올바른 Google Client ID를 입력해주세요.");
      setShowSettings(true);
      return;
    }
    if (tokenClient.current) {
      tokenClient.current.requestAccessToken();
    } else {
      if (initGsi(clientId)) {
        tokenClient.current.requestAccessToken();
      }
    }
  };

  const uploadToDrive = async (fileName: string, data: any) => {
    if (!accessToken) return false;
    try {
      const metadata = { name: fileName, parents: [GOOGLE_DRIVE_TARGET.folderId], mimeType: 'application/json' };
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
      timer = setInterval(() => setStats(prev => ({ ...prev, elapsedSeconds: prev.elapsedSeconds + 1 })), 1000);
    }
    return () => clearInterval(timer);
  }, [isEngineRunning, accessToken]);

  useEffect(() => {
    let interval: any;
    if (isEngineRunning && accessToken) {
      interval = setInterval(async () => {
        const batchSize = Math.floor(Math.random() * 30) + 40;
        setStats(prev => {
          const newProcessed = Math.min(prev.processed + batchSize, prev.totalFound);
          const remainingSeconds = Math.floor((prev.totalFound - newProcessed) / (batchSize / 1.2));
          if (newProcessed % 1000 < batchSize && newProcessed > 0) {
            const fileName = `PROD_SYNC_${Math.floor(newProcessed / 1000)}.json`;
            uploadToDrive(fileName, { timestamp: Date.now(), batch: batchSize }).then(success => {
               setConsoleLogs(cl => [...cl, success ? `> [IO] Cloud Commit Success: ${fileName}` : `> [IO] Write Error: Check Quota`]);
               if (success) {
                  setDriveFiles(df => [{
                    name: fileName,
                    stage: 'Stage 0',
                    size: '4.2 KB',
                    timestamp: new Date().toLocaleTimeString(),
                    status: 'Committed',
                    progress: 100
                  }, ...df].slice(0, 8));
               }
            });
          }
          return { ...prev, processed: newProcessed, estimatedTimeRemaining: [Math.floor(remainingSeconds/60), remainingSeconds%60].map(v => v < 10 ? "0"+v : v).join(":") };
        });
        setPerformanceData(prev => [...prev.slice(-39), { tps: batchSize }].map((d, i) => ({ ...d, index: i })));
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isEngineRunning, accessToken]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [consoleLogs]);

  const progress = (stats.processed / stats.totalFound) * 100;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-4 gap-8">
      <div className="xl:col-span-3 space-y-8">
        <div className="glass-panel p-10 rounded-[40px] relative overflow-hidden border-t-2 border-t-blue-500 shadow-2xl transition-all">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-12 gap-8">
            <div>
              <div className="flex items-center space-x-4">
                 <h2 className="text-4xl font-black text-white italic tracking-tighter uppercase">Gathering Matrix</h2>
                 <button onClick={() => setShowSettings(true)} className="px-4 py-1.5 bg-blue-500/10 text-blue-400 text-[10px] font-black rounded-xl border border-blue-500/20 hover:bg-blue-500 hover:text-white transition-all active:scale-95 uppercase tracking-widest">
                    Config Setup
                 </button>
              </div>
              <p className="text-[10px] text-slate-500 font-black uppercase tracking-[0.3em] mt-3 italic">Production Environment Connected</p>
            </div>
            
            <div className="flex space-x-4">
              {!accessToken ? (
                <button onClick={handleAuth} className="px-12 py-6 rounded-2xl bg-white text-slate-950 text-xs font-black uppercase tracking-[0.2em] shadow-2xl hover:scale-105 transition-all flex items-center space-x-4 active:scale-95 group">
                  <svg className="w-6 h-6 group-hover:rotate-12 transition-transform" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/></svg>
                  <span>Link Google Account</span>
                </button>
              ) : (
                <button onClick={() => setIsEngineRunning(!isEngineRunning)} className={`px-14 py-6 rounded-2xl text-xs font-black uppercase tracking-[0.3em] transition-all shadow-xl active:scale-95 ${isEngineRunning ? 'bg-slate-950 text-red-500 border border-red-500/40 hover:bg-red-950/20' : 'bg-blue-600 text-white shadow-blue-600/40 hover:bg-blue-500'}`}>
                  {isEngineRunning ? 'Halt Process' : 'Engage Matrix'}
                </button>
              )}
            </div>
          </div>

          {showSettings && (
            <div className="absolute inset-0 z-50 bg-slate-950/98 backdrop-blur-3xl flex items-center justify-center p-8 animate-in zoom-in duration-300">
               <div className="max-w-2xl w-full glass-panel p-12 rounded-[48px] border-white/10 shadow-[0_0_150px_rgba(0,0,0,1)]">
                  <div className="flex justify-between items-center mb-10">
                    <div>
                      <h3 className="text-3xl font-black text-white tracking-tighter italic uppercase underline decoration-blue-500 decoration-4 underline-offset-8">Cloud Handshake Setup</h3>
                      <p className="text-[11px] text-slate-400 font-bold uppercase tracking-widest mt-6">Google Cloud Console Integration</p>
                    </div>
                    <button onClick={() => setShowSettings(false)} className="w-12 h-12 flex items-center justify-center bg-white/5 rounded-2xl hover:bg-red-500/20 hover:text-red-500 transition-all">
                       <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </div>

                  <div className="space-y-10">
                     <div className="p-8 rounded-[32px] bg-indigo-500/5 border border-indigo-500/20 relative">
                        <h4 className="text-[11px] font-black text-indigo-400 uppercase tracking-widest mb-4 flex items-center">
                           <span className="w-2 h-2 bg-indigo-500 rounded-full mr-3 animate-ping"></span>
                           Authorized JavaScript Origin (Critical)
                        </h4>
                        <p className="text-xs text-slate-400 leading-relaxed mb-8">
                           Google Console의 <span className="text-white font-bold">'승인된 JavaScript 원본'</span> 필드에 아래의 **Vercel 주소**를 정확히 입력해야 400 에러가 발생하지 않습니다.
                        </p>
                        
                        <div className="flex items-center space-x-4">
                           <div className="flex-1 bg-black/80 p-5 rounded-2xl border border-white/5 font-mono text-[13px] text-blue-400 truncate shadow-inner select-all">
                              {currentOrigin}
                           </div>
                           <button onClick={() => {
                              navigator.clipboard.writeText(currentOrigin);
                              alert("Vercel 주소가 복사되었습니다. 구글 콘솔에 붙여넣으세요!\n" + currentOrigin);
                           }} className="px-8 py-5 bg-indigo-600 text-white text-[10px] font-black rounded-2xl hover:bg-indigo-500 transition-all shadow-xl active:scale-95 uppercase tracking-widest">Copy URL</button>
                        </div>
                     </div>

                     <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="space-y-3">
                           <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block px-1">OAuth Client ID</label>
                           <input type="text" value={clientId} onChange={(e) => {setClientId(e.target.value); localStorage.setItem('gdrive_client_id', e.target.value)}} className="w-full bg-slate-900 border border-white/10 rounded-2xl p-5 text-[11px] font-mono text-white focus:border-indigo-500 outline-none transition-all" placeholder="Pungkings-client-id..." />
                        </div>
                        <div className="flex items-end">
                           <button onClick={() => setShowSettings(false)} className="w-full py-5 bg-white text-slate-950 text-[11px] font-black uppercase rounded-2xl shadow-2xl hover:bg-blue-500 hover:text-white transition-all active:scale-95">Save Configuration</button>
                        </div>
                     </div>
                  </div>
               </div>
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-12">
             {[
               { label: 'Node Uptime', value: [Math.floor(stats.elapsedSeconds/60), stats.elapsedSeconds%60].map(v => v < 10 ? "0"+v : v).join(":"), color: 'text-white' },
               { label: 'Cloud Handshake', value: accessToken ? 'SUCCESS' : 'PENDING', color: accessToken ? 'text-emerald-400' : 'text-amber-500' },
               { label: 'Matrix Sync', value: stats.processed.toLocaleString(), color: 'text-white' },
               { label: 'Current Origin', value: isProd ? 'VERCEL' : 'LOCAL', color: 'text-indigo-400' }
             ].map((item, idx) => (
               <div key={idx} className="p-8 bg-slate-900/50 rounded-3xl border border-white/5 shadow-inner group transition-all">
                 <p className="text-[10px] font-black text-slate-600 uppercase mb-3 tracking-widest">{item.label}</p>
                 <p className={`text-2xl font-mono font-black ${item.color} leading-none italic tracking-tighter truncate`}>{item.value}</p>
               </div>
             ))}
          </div>

          <div className="space-y-6 mb-12">
            <div className="flex justify-between items-end px-2">
               <span className="text-[11px] font-black text-slate-500 uppercase tracking-[0.3em] italic">Gathering Matrix Progress</span>
               <span className="text-3xl font-black text-white font-mono tracking-tighter italic">{progress.toFixed(1)}%</span>
            </div>
            <div className="h-4 w-full bg-slate-950 rounded-full border border-white/5 p-1 shadow-inner overflow-hidden">
               <div className="h-full bg-gradient-to-r from-blue-700 via-indigo-500 to-emerald-400 transition-all duration-1000 shadow-[0_0_20px_rgba(79,70,229,0.5)] rounded-full relative" style={{ width: `${progress}%` }}>
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-[shimmer_2s_infinite]"></div>
               </div>
            </div>
          </div>

          <div className="h-56 opacity-80 -mx-4">
             <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={performanceData}>
                  <defs>
                    <linearGradient id="colorTps" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.4}/>
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <Area type="monotone" dataKey="tps" stroke="#6366f1" strokeWidth={4} fillOpacity={1} fill="url(#colorTps)" />
                </AreaChart>
             </ResponsiveContainer>
          </div>
        </div>

        <div className="glass-panel p-10 rounded-[40px] border-t border-white/5 shadow-2xl">
           <h3 className="text-[11px] font-black text-slate-500 uppercase tracking-[0.4em] mb-12 italic">Cloud Vault Manifest</h3>
           <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {driveFiles.map((file, idx) => (
                <div key={idx} className="p-6 rounded-3xl border border-white/5 bg-slate-900/50 flex justify-between items-center group hover:bg-slate-800 transition-all cursor-default">
                   <div className="flex items-center space-x-5">
                      <div className="w-12 h-12 bg-emerald-500/10 rounded-2xl flex items-center justify-center text-emerald-400 group-hover:scale-110 transition-all shadow-inner">
                         <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                      </div>
                      <div>
                         <p className="text-sm font-black text-white font-mono tracking-tighter">{file.name}</p>
                         <p className="text-[10px] text-slate-600 font-bold uppercase mt-1 tracking-widest italic">{file.timestamp} • {file.size}</p>
                      </div>
                   </div>
                   <span className="text-[10px] font-black text-emerald-400 border border-emerald-500/30 px-3 py-1.5 rounded-xl uppercase tracking-tighter bg-emerald-500/5">Synced</span>
                </div>
              ))}
              {driveFiles.length === 0 && (
                <div className="col-span-2 py-32 text-center border-4 border-dashed border-white/5 rounded-[40px] group">
                   <div className="w-16 h-16 mx-auto mb-6 border-4 border-slate-900 rounded-full flex items-center justify-center group-hover:border-indigo-500/20 transition-colors">
                      <div className="w-4 h-4 bg-slate-900 rounded-full animate-ping group-hover:bg-indigo-500/40"></div>
                   </div>
                   <p className="text-[10px] font-black text-slate-800 uppercase tracking-[0.6em] italic">Matrix Initialization Pending</p>
                </div>
              )}
           </div>
        </div>
      </div>

      <div className="space-y-8">
        <div className="glass-panel p-8 rounded-[40px] bg-slate-950 border-l-8 border-l-indigo-600 shadow-2xl sticky top-8">
          <div className="flex justify-between items-center mb-8 px-1">
            <h3 className="font-black text-white uppercase text-xl italic tracking-tighter italic">IO Data Stream</h3>
            <span className={`px-3 py-1 text-[9px] font-black rounded-lg transition-colors ${accessToken ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30' : 'bg-red-500/20 text-red-500'}`}>
              {accessToken ? 'ONLINE' : 'LOCKED'}
            </span>
          </div>
          <div className="bg-black/90 p-6 rounded-[24px] font-mono text-[10px] text-indigo-400/80 h-[580px] overflow-y-auto no-scrollbar space-y-5 shadow-inner border border-white/5 scroll-smooth">
            {consoleLogs.map((log, i) => (
              <div key={i} className="border-l-2 border-indigo-600/30 pl-5 py-2 animate-in slide-in-from-left-4 duration-500 group">
                <span className="text-slate-800 mr-3 text-[9px] font-bold group-hover:text-indigo-900 transition-colors">[{new Date().toLocaleTimeString()}]</span>
                <span className="group-hover:text-indigo-300 transition-colors">{log}</span>
              </div>
            ))}
            <div ref={logEndRef} />
          </div>
          <button 
             disabled={!accessToken} 
             onClick={() => window.open(`https://drive.google.com/drive/folders/${GOOGLE_DRIVE_TARGET.folderId}`, '_blank')} 
             className="w-full mt-8 py-6 rounded-3xl bg-white text-slate-950 text-[11px] font-black uppercase tracking-[0.5em] hover:bg-indigo-600 hover:text-white transition-all shadow-2xl active:scale-95 disabled:opacity-20"
          >
            Access Vault
          </button>
        </div>
      </div>
    </div>
  );
};

export default UniverseGathering;
