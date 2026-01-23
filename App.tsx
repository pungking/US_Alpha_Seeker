
import React, { useState, useEffect } from 'react';
import { ApiProvider, ApiStatus } from './types';
import { API_CONFIGS, STAGES_FLOW } from './constants';
import ApiStatusCard from './components/ApiStatusCard';
import UniverseGathering from './components/UniverseGathering';
import { analyzeCollectionSummary } from './services/geminiService';

const App: React.FC = () => {
  const [apiStatuses, setApiStatuses] = useState<ApiStatus[]>([]);
  const [currentStage, setCurrentStage] = useState(0);
  const [aiReport, setAiReport] = useState<string | null>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [isGdriveConnected, setIsGdriveConnected] = useState(false);
  const [isProd, setIsProd] = useState(false);

  useEffect(() => {
    setIsProd(window.location.hostname === 'us-alpha-seeker.vercel.app');
    
    const checkAuth = () => {
      const hasToken = sessionStorage.getItem('gdrive_access_token');
      setIsGdriveConnected(!!hasToken);
    };
    const interval = setInterval(checkAuth, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const updateStatuses = () => {
      const newStatuses = API_CONFIGS.map(config => {
        const isConnected = config.provider === ApiProvider.GOOGLE_DRIVE ? isGdriveConnected : true;
        return {
          provider: config.provider,
          isConnected: isConnected,
          latency: isConnected ? (Math.floor(Math.random() * 30) + 15) : 0,
          lastChecked: new Date().toLocaleTimeString(),
          limitRemaining: config.provider === ApiProvider.POLYGON ? '98/100' : undefined
        };
      });
      setApiStatuses(newStatuses);
    };

    updateStatuses();
    const interval = setInterval(updateStatuses, 5000);
    return () => clearInterval(interval);
  }, [isGdriveConnected]);

  const runAiAnalysis = async () => {
    setIsAiLoading(true);
    const mockStats = { 
      totalFound: 12450, 
      processed: 9820, 
      failed: 45,
      providerDistribution: { Polygon: '70%', Alpaca: '20%', Others: '10%' }
    };
    const report = await analyzeCollectionSummary(mockStats);
    setAiReport(report);
    setIsAiLoading(false);
  };

  return (
    <div className="min-h-screen pb-20 p-4 md:p-8 space-y-8 max-w-[1600px] mx-auto transition-colors duration-1000">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center space-y-4 md:space-y-0">
        <div className="relative group">
          <div className="flex items-center space-x-2 mb-1">
             <span className={`px-2 py-0.5 text-[10px] font-bold rounded uppercase tracking-widest border transition-all ${isProd ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-blue-600/20 text-blue-400 border-blue-500/20'}`}>
               {isProd ? 'PRODUCTION' : 'LOCAL_DEV'}
             </span>
             <span className="text-slate-600 text-[10px] font-bold uppercase tracking-widest">Alpha V1.1</span>
          </div>
          <h1 className="text-4xl font-black tracking-tighter text-white flex items-center italic group-hover:text-blue-400 transition-colors">
            US_ALPHA_SEEKER
            <span className={`ml-3 w-2.5 h-2.5 rounded-full shadow-[0_0_15px] ${isGdriveConnected ? 'bg-emerald-500 shadow-emerald-500/80 animate-pulse' : 'bg-red-500 shadow-red-500/80'}`}></span>
          </h1>
        </div>
        
        <div className="flex items-center space-x-6">
           <div className="hidden lg:flex flex-col items-end">
              <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest">Global Network Latency</p>
              <p className="text-2xl font-mono font-black text-white italic">
                {Math.floor(apiStatuses.reduce((acc, curr) => acc + curr.latency, 0) / (apiStatuses.length || 1))}
                <span className="text-sm ml-1 text-slate-500 not-italic font-sans">MS</span>
              </p>
           </div>
           <div className="flex items-center space-x-4 glass-panel px-5 py-2.5 rounded-2xl border-white/5 shadow-2xl">
             <div className="text-right">
               <p className="text-[10px] text-slate-500 font-black uppercase tracking-tighter">System Manager</p>
               <p className="text-sm font-black text-slate-200 tracking-tight">InnocentBae</p>
             </div>
             <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-indigo-600 via-blue-600 to-blue-500 flex items-center justify-center text-white font-black border border-white/10 shadow-lg rotate-3 group-hover:rotate-0 transition-transform">
               IB
             </div>
           </div>
        </div>
      </header>

      <div className="relative">
         <div className="absolute inset-0 bg-blue-500/5 blur-3xl pointer-events-none"></div>
         <nav className="relative flex overflow-x-auto pb-4 space-x-4 scrollbar-hide no-scrollbar">
           {STAGES_FLOW.map((stage) => (
             <button
               key={stage.id}
               onClick={() => setCurrentStage(stage.id)}
               className={`flex-shrink-0 px-10 py-4 rounded-2xl text-[11px] font-black uppercase tracking-[0.2em] transition-all duration-500 border-2 ${
                 currentStage === stage.id
                   ? 'bg-blue-600 text-white border-blue-400 shadow-[0_20px_40px_rgba(37,99,235,0.3)] scale-105 z-10'
                   : 'bg-slate-800/40 text-slate-500 border-slate-700/50 hover:bg-slate-800 hover:text-slate-300 hover:border-slate-600'
               }`}
             >
               {stage.label}
             </button>
           ))}
         </nav>
      </div>

      <section className="animate-in fade-in zoom-in-95 duration-500">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 xl:grid-cols-9 gap-4">
          {apiStatuses.map((status) => (
            <ApiStatusCard 
              key={status.provider} 
              status={status} 
              isAuthConnected={status.provider === ApiProvider.GOOGLE_DRIVE ? isGdriveConnected : true} 
            />
          ))}
        </div>
      </section>

      <main className="animate-in slide-in-from-bottom-8 fade-in duration-1000 delay-150">
        {currentStage === 0 ? (
          <UniverseGathering onAuthSuccess={(status) => setIsGdriveConnected(status)} />
        ) : (
          <div className="glass-panel p-32 rounded-[40px] border-dashed border-4 border-slate-800 flex flex-col items-center justify-center text-center group">
            <div className="p-8 bg-slate-900 rounded-[32px] mb-8 border border-white/5 shadow-2xl group-hover:scale-110 transition-transform duration-500">
               <svg className="w-20 h-20 text-slate-700 group-hover:text-blue-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
               </svg>
            </div>
            <h2 className="text-3xl font-black text-slate-500 uppercase tracking-[0.3em] italic">Stage {currentStage}: Restricted</h2>
            <p className="text-slate-600 max-w-xl mt-5 font-bold leading-relaxed tracking-tight uppercase text-xs">
               The pipeline architecture requires the completion of <span className="text-blue-500">Stage 0: Universe Gathering</span>. 
               Handshake protocols for subsequent layers are currently on standby.
            </p>
          </div>
        )}
      </main>

      <section className="glass-panel p-10 rounded-3xl border-t-8 border-t-emerald-500 shadow-2xl shadow-emerald-950/20 animate-in fade-in slide-in-from-bottom-4 duration-700 delay-300">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 space-y-4 md:space-y-0">
          <div className="flex items-center space-x-5">
             <div className="bg-emerald-500/10 p-4 rounded-2xl border border-emerald-500/20 shadow-lg shadow-emerald-500/5">
                <svg className="w-8 h-8 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
             </div>
             <div>
                <h3 className="font-black text-white uppercase text-xl tracking-tight italic">Gemini AI Pipeline Audit</h3>
                <p className="text-[10px] text-slate-500 font-black uppercase tracking-[0.2em]">Universe Integrity & Coverage Analysis</p>
             </div>
          </div>
          <button 
            onClick={runAiAnalysis}
            disabled={isAiLoading}
            className={`px-10 py-3 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] transition-all border-2 ${
              isAiLoading 
              ? 'bg-slate-900 text-slate-700 border-slate-800 cursor-not-allowed' 
              : 'bg-emerald-600 text-white border-emerald-400 hover:bg-emerald-500 shadow-xl shadow-emerald-600/30 hover:-translate-y-1 active:translate-y-0'
            }`}
          >
            {isAiLoading ? 'Synthesizing Intelligence...' : 'Invoke AI Auditor'}
          </button>
        </div>
        
        <div className="bg-slate-950 p-8 rounded-[32px] border border-white/5 shadow-inner">
          {aiReport ? (
            <div className="prose prose-invert max-w-none">
               <div className="text-sm leading-loose text-slate-300 font-medium whitespace-pre-line font-serif italic">
                 {aiReport}
               </div>
            </div>
          ) : (
            <div className="flex flex-col items-center py-20 text-slate-700">
               <div className="w-16 h-16 mb-6 border-4 border-slate-800 border-t-emerald-500 rounded-full animate-spin"></div>
               <p className="text-[10px] font-black uppercase tracking-[0.5em]">Awaiting Neural Network Synchronization</p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
};

export default App;
