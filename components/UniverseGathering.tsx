
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
  const [isVercel, setIsVercel] = useState(false);
  
  const [stats, setStats] = useState<GatheringStats>({
    totalFound: 12450,
    processed: 0,
    failed: 0,
    startTime: '-',
    elapsedSeconds: 0,
    estimatedTimeRemaining: 'Awaiting Auth...'
  });

  const [driveFiles, setDriveFiles] = useState<DriveFile[]>([]);
  const [consoleLogs, setConsoleLogs] = useState<string[]>(['> Initializing production-ready engine V1.1...']);
  const [performanceData, setPerformanceData] = useState<any[]>([]);
  
  const logEndRef = useRef<HTMLDivElement>(null);
  const tokenClient = useRef<any>(null);

  useEffect(() => {
    // Vercel 배포 주소에서 끝 슬래시를 제거한 순수 Origin 추출
    const origin = window.location.origin.replace(/\/$/, "");
    setCurrentOrigin(origin);
    setIsVercel(origin.includes('vercel.app'));
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
                 <button onClick={() => setShowSettings(true)} className="px-4 py-1.5 bg-blue-500 text-white text-[10px] font-black rounded-xl hover:bg-blue-400 transition-all shadow-lg shadow-blue-500/20 active:scale-95 uppercase tracking-widest">
                    Setup
                 </button>
              </div>
              <div className="flex items-center space-x-2 mt-3 bg-white/5 px-3 py-1 rounded-full w-fit">
                 <div className={`w-2 h-2 rounded-full ${isVercel ? 'bg-emerald-500 shadow-[0_0_8px_#10b981]' : 'bg-amber-500'}`}></div>
                 <p className="text-[10px] text-slate-400 font-black uppercase tracking-[0.2em]">
                    {isVercel ? 'Vercel Deployment: Active' : 'Local Environment: Passive'}
                 </p>
              </div>
            </div>
            
            <div className="flex space-x-4">
              {!accessToken ? (
                <button onClick={handleAuth} className="px-12 py-6 rounded-2xl bg-white text-slate-950 text-xs font-black uppercase tracking-[0.2em] shadow-[0_20px_40px_rgba(255,255,255,0.1)] hover:scale-105 transition-all flex items-center space-x-4 active:scale-95 group">
                  <svg className="w-6 h-6 group-hover:rotate-12 transition-transform" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/></svg>
                  <span>Authorize Cloud Vault</span>
                </button>
              ) : (
                <button onClick={() => setIsEngineRunning(!isEngineRunning)} className={`px-14 py-6 rounded-2xl text-xs font-black uppercase tracking-[0.3em] transition-all shadow-xl active:scale-95 ${isEngineRunning ? 'bg-slate-950 text-red-500 border border-red-500/40 hover:bg-red-950/20' : 'bg-blue-600 text-white shadow-blue-600/40 hover:bg-blue-500'}`}>
                  {isEngineRunning ? 'Halt Operations' : 'Engage Matrix'}
                </button>
              )}
            </div>
          </div>

          {showSettings && (
            <div className="absolute inset-0 z-50 bg-slate-950/98 backdrop-blur-3xl flex items-center justify-center p-8 animate-in zoom-in duration-300">
               <div className="max-w-2xl w-full glass-panel p-12 rounded-[48px] border-white/10 shadow-[0_0_100px_rgba(0,0,0,1)]">
                  <div className="flex justify-between items-center mb-12">
                    <div>
                      <h3 className="text-3xl font-black text-white tracking-tighter italic uppercase">Core Protocol Setup</h3>
                      <p className="text-[11px] text-blue-400 font-black uppercase tracking-widest mt-2 bg-blue-400/10 px-3 py-1 rounded-lg w-fit">Handshake Configuration</p>
                    </div>
                    <button onClick={() => setShowSettings(false)} className="w-12 h-12 flex items-center justify-center bg-white/5 rounded-2xl hover:bg-red-500/20 hover:text-red-500 transition-all">
                       <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </div>

                  <div className="space-y-10">
                     <div className="p-8 rounded-3xl bg-blue-500/5 border border-blue-500/20 relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-4 opacity-10">
                           <svg className="w-24 h-24 text-blue-500" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9v-2h2v2zm0-4H9V7h2v5z"/></svg>
                        </div>
                        <h4 className="text-[12px] font-black text-white uppercase tracking-widest mb-4 flex items-center">
                           <span className="w-2 h-2 bg-blue-500 rounded-full mr-2 animate-ping"></span>
                           OAuth 400 Resolution Guide
                        </h4>
                        <p className="text-xs text-slate-400 leading-relaxed mb-8 font-medium">구글 클라우드 콘솔의 <span className="text-white font-bold">'승인된 JavaScript 원본'</span> 섹션에 아래 주소를 입력하세요. Vercel 배포 후 에러 해결의 핵심입니다.</p>
                        
                        <div className="space-y-4">
                           <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block px-1">Current Production Origin</label>
                           <div className="flex items-center space-x-4">
                              <div className="flex-1 bg-black/80 p-5 rounded-2xl border border-white/5 font-mono text-[13px] text-blue-300 truncate shadow-inner">
                                 {currentOrigin}
                              </div>
                              <button onClick={() => {
                                 navigator.clipboard.writeText(currentOrigin);
                                 alert("구글 콘솔용 주소가 복사되었습니다: " + currentOrigin);
                              }} className="px-8 py-5 bg-white text-slate-950 text-[11px] font-black rounded-2xl hover:bg-blue-500 hover:text-white transition-all shadow-xl active:scale-95">COPY URL</button>
                           </div>
                        </div>
                     </div>

                     <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="space-y-3">
                           <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block px-1">Google Client ID</label>
                           <input type="text" value={clientId} onChange={(e) => {setClientId(e.target.value); localStorage.setItem('gdrive_client_id', e.target.value)}} className="w-full bg-slate-900 border border-white/10 rounded-2xl p-5 text-[11px] font-mono text-white focus:border-blue-500 outline-none transition-all shadow-inner" placeholder="Pungkings-client-id..." />
                        </div>
                        <div className="flex items-end">
                           <button onClick={() => setShowSettings(false)} className="w-full py-5 bg-blue-600 text-white text-[11px] font-black uppercase rounded-2xl shadow-2xl shadow-blue-600/30 hover:bg-blue-500 hover:-translate-y-1 transition-all active:translate-y-0">Apply Configuration</button>
                        </div>
                     </div>
                  </div>
               </div>
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-12">
             {[
               { label: 'Uptime', value: [Math.floor(stats.elapsedSeconds/60), stats.elapsedSeconds%60].map(v => v < 10 ? "0"+v : v).join(":"), color: 'text-white' },
               { label: 'Vault Access', value: accessToken ? 'AUTHENTICATED' : 'LOCKED', color: accessToken ? 'text-emerald-400' : 'text-red-500' },
               { label: 'Synced Count', value: stats.processed.toLocaleString(), color: 'text-white' },
               { label: 'Matrix Load', value: isEngineRunning ? 'OPTIMAL' : 'IDLE', color: isEngineRunning ? 'text-blue-400' : 'text-slate-600' }
             ].map((item, idx) => (
               <div key={idx} className="p-8 bg-slate-900/40 rounded-3xl border border-white/5 shadow-inner group hover:bg-slate-900/60 transition-all">
                 <p className="text-[10px] font-black text-slate-500 uppercase mb-3 tracking-widest">{item.label}</p>
                 <p className={`text-2xl font-mono font-black ${item.color} leading-none italic tracking-tighter`}>{item.value}</p>
               </div>
             ))}
          </div>

          <div className="space-y-6 mb-12">
            <div className="flex justify-between items-end px-2">
               <span className="text-[11px] font-black text-slate-500 uppercase tracking-[0.3em] italic">Universe Synchronization Progress</span>
               <span className="text-3xl font-black text-white font-mono tracking-tighter italic">{progress.toFixed(1)}%</span>
            </div>
            <div className="h-6 w-full bg-slate-950 rounded-full border border-white/5 p-1.5 shadow-inner">
               <div className="h-full bg-gradient-to-r from-blue-700 via-blue-500 to-indigo-400 transition-all duration-1000 shadow-[0_0_20px_rgba(59,130,246,0.6)] rounded-full relative overflow-hidden" style={{ width: `${progress}%` }}>
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-[shimmer_1.5s_infinite]"></div>
               </div>
            </div>
          </div>

          <div className="h-56 opacity-90 -mx-4">
             <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={performanceData}>
                  <defs>
                    <linearGradient id="colorTps" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <Area type="stepAfter" dataKey="tps" stroke="#3b82f6" strokeWidth={5} fillOpacity={1} fill="url(#colorTps)" />
                </AreaChart>
             </ResponsiveContainer>
          </div>
        </div>

        <div className="glass-panel p-10 rounded-[40px] border-t border-white/5 shadow-2xl">
           <h3 className="text-[11px] font-black text-slate-500 uppercase tracking-[0.4em] mb-12 italic">Cloud Archive Manifest</h3>
           <div className="grid grid-cols-1 md:grid-cols-2 gap-6 opacity-90">
              {driveFiles.map((file, idx) => (
                <div key={idx} className="p-6 rounded-3xl border border-white/5 bg-slate-900/40 flex justify-between items-center group hover:bg-slate-800 transition-all cursor-default">
                   <div className="flex items-center space-x-5">
                      <div className="w-12 h-12 bg-emerald-500/10 rounded-2xl flex items-center justify-center text-emerald-400 group-hover:scale-110 transition-transform">
                         <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                      </div>
                      <div>
                         <p className="text-sm font-black text-white font-mono tracking-tighter">{file.name}</p>
                         <p className="text-[10px] text-slate-600 font-bold uppercase mt-1 tracking-widest italic">{file.timestamp} • {file.size}</p>
                      </div>
                   </div>
                   <span className="text-[10px] font-black text-emerald-400 border border-emerald-500/30 px-3 py-1.5 rounded-xl uppercase tracking-tighter bg-emerald-500/5">Verified</span>
                </div>
              ))}
              {driveFiles.length === 0 && (
                <div className="col-span-2 py-32 text-center border-4 border-dashed border-white/5 rounded-[40px] group">
                   <div className="w-16 h-16 mx-auto mb-6 border-4 border-slate-900 rounded-full flex items-center justify-center group-hover:border-blue-500/20 transition-colors">
                      <div className="w-4 h-4 bg-slate-900 rounded-full animate-ping group-hover:bg-blue-500/40"></div>
                   </div>
                   <p className="text-xs font-black text-slate-800 uppercase tracking-[0.6em] italic">Awaiting Matrix Pulse...</p>
                </div>
              )}
           </div>
        </div>
      </div>

      <div className="space-y-8">
        <div className="glass-panel p-8 rounded-[40px] bg-slate-950 border-l-8 border-l-blue-600 shadow-2xl sticky top-8">
          <div className="flex justify-between items-center mb-8 px-1">
            <h3 className="font-black text-white uppercase text-xl italic tracking-tighter">IO Stream</h3>
            <span className={`px-3 py-1 text-[9px] font-black rounded-lg transition-colors ${accessToken ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/30' : 'bg-red-500/20 text-red-500'}`}>
              {accessToken ? 'ONLINE' : 'LOCKED'}
            </span>
          </div>
          <div className="bg-black/90 p-6 rounded-3xl font-mono text-[11px] text-blue-400/80 h-[640px] overflow-y-auto no-scrollbar space-y-5 shadow-inner border border-white/5 scroll-smooth">
            {consoleLogs.map((log, i) => (
              <div key={i} className="border-l-4 border-blue-600/30 pl-5 py-2 animate-in slide-in-from-left-4 duration-500 group">
                <span className="text-slate-800 mr-3 text-[9px] font-bold group-hover:text-blue-900 transition-colors">{new Date().toLocaleTimeString()}</span>
                <span className="group-hover:text-blue-300 transition-colors">{log}</span>
              </div>
            ))}
            <div ref={logEndRef} />
          </div>
          <button 
             disabled={!accessToken} 
             onClick={() => window.open(`https://drive.google.com/drive/folders/${GOOGLE_DRIVE_TARGET.folderId}`, '_blank')} 
             className="w-full mt-8 py-6 rounded-3xl bg-white text-slate-950 text-[11px] font-black uppercase tracking-[0.5em] hover:bg-blue-500 hover:text-white transition-all shadow-2xl active:scale-95 disabled:opacity-5 disabled:grayscale"
          >
            Vault Access
          </button>
        </div>
      </div>
    </div>
  );
};

export default UniverseGathering;
