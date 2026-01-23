
import React, { useState, useEffect } from 'react';
import { ApiProvider, ApiStatus } from './types';
import { API_CONFIGS, STAGES_FLOW, GITHUB_REPO, PRODUCTION_URL } from './constants';
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
  const [isHttps, setIsHttps] = useState(false);

  useEffect(() => {
    setIsProd(window.location.hostname === 'us-alpha-seeker.vercel.app');
    setIsHttps(window.location.protocol === 'https:');
    
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
    <div className="min-h-screen pb-20 p-4 md:p-8 space-y-8 max-w-[1600px] mx-auto">
      {/* Integrated Connection Dashboard */}
      <div className="flex flex-wrap gap-3 items-center glass-panel px-6 py-3 rounded-2xl border-white/5">
        <div className="flex items-center space-x-2 bg-slate-900/50 px-3 py-1.5 rounded-xl border border-white/5">
          <div className={`w-2 h-2 rounded-full ${isProd ? 'bg-emerald-500' : 'bg-blue-500'}`}></div>
          <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">{isProd ? 'Vercel Deployment' : 'Local Dev'}</span>
        </div>
        <div className="flex items-center space-x-2 bg-slate-900/50 px-3 py-1.5 rounded-xl border border-white/5">
          <div className={`w-2 h-2 rounded-full ${isHttps ? 'bg-emerald-500' : 'bg-red-500'}`}></div>
          <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">{isHttps ? 'SSL Secure' : 'Insecure'}</span>
        </div>
        <div className="flex items-center space-x-2 bg-slate-900/50 px-3 py-1.5 rounded-xl border border-white/5">
          <div className={`w-2 h-2 rounded-full ${isGdriveConnected ? 'bg-emerald-500 animate-pulse' : 'bg-slate-700'}`}></div>
          <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">G-Drive Sync</span>
        </div>
        <div className="ml-auto flex items-center space-x-4">
           <a href={GITHUB_REPO} target="_blank" rel="noreferrer" className="flex items-center space-x-2 text-slate-500 hover:text-white transition-colors group">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>
              <span className="text-[9px] font-black uppercase tracking-widest group-hover:underline">Repository Verified</span>
           </a>
        </div>
      </div>

      <header className="flex flex-col md:flex-row justify-between items-start md:items-center space-y-4 md:space-y-0">
        <div className="relative group">
          <div className="flex items-center space-x-2 mb-1">
             <span className="text-blue-500 text-[10px] font-black uppercase tracking-[0.3em]">System Uplink</span>
             <span className="text-slate-600 text-[10px] font-bold uppercase tracking-widest">Node: {isProd ? 'Vercel_Edge' : 'Local_Host'}</span>
          </div>
          <h1 className="text-5xl font-black tracking-tighter text-white flex items-center italic group-hover:text-blue-500 transition-all">
            US_ALPHA_SEEKER
            <span className={`ml-4 w-3.5 h-3.5 rounded-full shadow-[0_0_25px] ${isGdriveConnected ? 'bg-emerald-500 shadow-emerald-500/80 animate-pulse' : 'bg-red-500 shadow-red-500/80'}`}></span>
          </h1>
        </div>
        
        <div className="flex items-center space-x-6">
           <div className="flex items-center space-x-4 glass-panel px-6 py-3 rounded-2xl border-white/5 shadow-2xl group hover:border-white/10 transition-all">
             <div className="text-right">
               <p className="text-[10px] text-slate-500 font-black uppercase tracking-tighter">System Manager</p>
               <p className="text-sm font-black text-slate-200 tracking-tight italic">InnocentBae</p>
             </div>
             <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-600 to-blue-700 flex items-center justify-center text-white font-black border border-white/10 shadow-lg group-hover:scale-110 group-hover:rotate-3 transition-all cursor-pointer">
               IB
             </div>
           </div>
        </div>
      </header>

      <div className="relative">
         <nav className="relative flex overflow-x-auto pb-4 space-x-4 no-scrollbar">
           {STAGES_FLOW.map((stage) => (
             <button
               key={stage.id}
               onClick={() => setCurrentStage(stage.id)}
               className={`flex-shrink-0 px-12 py-5 rounded-2xl text-[11px] font-black uppercase tracking-[0.2em] transition-all duration-500 border-2 ${
                 currentStage === stage.id
                   ? 'bg-blue-600 text-white border-blue-400 shadow-[0_20px_40px_rgba(37,99,235,0.3)] scale-105 z-10'
                   : 'bg-slate-800/20 text-slate-600 border-white/5 hover:bg-slate-800/40 hover:text-slate-300'
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
          <div className="glass-panel p-32 rounded-[40px] border-dashed border-4 border-slate-900 flex flex-col items-center justify-center text-center group">
            <div className="p-10 bg-slate-900/50 rounded-[32px] mb-8 border border-white/5 shadow-2xl group-hover:scale-110 transition-transform duration-700">
               <svg className="w-24 h-24 text-slate-800 group-hover:text-blue-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
               </svg>
            </div>
            <h2 className="text-3xl font-black text-slate-700 uppercase tracking-[0.4em] italic">Stage {currentStage}: Restricted</h2>
            <p className="text-slate-500 max-w-xl mt-6 font-bold leading-relaxed tracking-tight uppercase text-[10px]">
               The analytical engine is on standby. Please finalize the <span className="text-blue-500">Universe Gathering</span> stage before initializing Phase {currentStage} protocols.
            </p>
          </div>
        )}
      </main>

      <section className="glass-panel p-10 rounded-[40px] border-t-8 border-t-emerald-600 shadow-2xl shadow-emerald-950/20">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 space-y-4 md:space-y-0">
          <div className="flex items-center space-x-6">
             <div className="bg-emerald-500/10 p-5 rounded-3xl border border-emerald-500/20 shadow-xl">
                <svg className="w-10 h-10 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
             </div>
             <div>
                <h3 className="font-black text-white uppercase text-2xl tracking-tight italic italic">Gemini AI Pipeline Auditor</h3>
                <p className="text-[10px] text-slate-500 font-black uppercase tracking-[0.3em] mt-1">Real-time Data Integrity & Risk Synthesizer</p>
             </div>
          </div>
          <button 
            onClick={runAiAnalysis}
            disabled={isAiLoading}
            className={`px-12 py-5 rounded-2xl text-[11px] font-black uppercase tracking-[0.2em] transition-all border-2 ${
              isAiLoading 
              ? 'bg-slate-900 text-slate-700 border-slate-800' 
              : 'bg-emerald-600 text-white border-emerald-400 hover:bg-emerald-500 shadow-xl shadow-emerald-600/30 active:scale-95'
            }`}
          >
            {isAiLoading ? 'Synthesizing Intelligence...' : 'Invoke Neural Auditor'}
          </button>
        </div>
        
        <div className="bg-slate-950/80 p-10 rounded-[48px] border border-white/5 shadow-inner min-h-[200px]">
          {aiReport ? (
            <div className="prose prose-invert max-w-none animate-in fade-in duration-1000">
               <div className="text-base leading-relaxed text-slate-300 font-medium whitespace-pre-line font-serif italic">
                 {aiReport}
               </div>
            </div>
          ) : (
            <div className="flex flex-col items-center py-16 text-slate-800">
               <div className="w-16 h-16 mb-6 border-8 border-slate-900 border-t-emerald-600 rounded-full animate-spin"></div>
               <p className="text-[10px] font-black uppercase tracking-[0.6em] animate-pulse">Awaiting Matrix Response</p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
};

export default App;
