
import React, { useState, useEffect, useCallback } from 'react';
import { ApiProvider, ApiStatus } from './types';
import { API_CONFIGS, STAGES_FLOW, GITHUB_REPO } from './constants';
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

  const refreshApiStatuses = useCallback(() => {
    const hasGdriveToken = !!sessionStorage.getItem('gdrive_access_token');
    
    setApiStatuses(() => {
      return API_CONFIGS.map(config => {
        const isConnected = config.provider === ApiProvider.GOOGLE_DRIVE ? hasGdriveToken : !!config.key;
        return {
          provider: config.provider,
          isConnected: isConnected,
          latency: isConnected ? Math.floor(Math.random() * 40) + 15 : 0,
          lastChecked: new Date().toLocaleTimeString()
        };
      });
    });
  }, []);

  useEffect(() => {
    setIsProd(window.location.hostname === 'us-alpha-seeker.vercel.app');
    setIsHttps(window.location.protocol === 'https:');
    refreshApiStatuses();
    const interval = setInterval(refreshApiStatuses, 5000);
    return () => clearInterval(interval);
  }, [refreshApiStatuses]);

  const runAiAnalysis = async () => {
    setIsAiLoading(true);
    const mockStats = { totalFound: 12450, processed: 12450, failed: 0 };
    const report = await analyzeCollectionSummary(mockStats);
    setAiReport(report);
    setIsAiLoading(false);
  };

  return (
    <div className="min-h-screen pb-20 p-4 md:p-8 space-y-8 max-w-[1600px] mx-auto overflow-x-hidden">
      <div className="flex flex-wrap gap-3 items-center glass-panel px-6 py-3 rounded-2xl border-white/5">
        <div className="flex items-center space-x-2 bg-slate-900/50 px-3 py-1.5 rounded-xl border border-white/5">
          <div className={`w-2 h-2 rounded-full ${isProd ? 'bg-emerald-500' : 'bg-blue-500'}`}></div>
          <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">{isProd ? 'Production' : 'Development'}</span>
        </div>
        <div className="flex items-center space-x-2 bg-slate-900/50 px-3 py-1.5 rounded-xl border border-white/5">
          <div className={`w-2 h-2 rounded-full ${isGdriveConnected ? 'bg-emerald-500 animate-pulse' : 'bg-slate-700'}`}></div>
          <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Vault Sync</span>
        </div>
        <div className="ml-auto hidden md:flex items-center space-x-4">
           <a href={GITHUB_REPO} target="_blank" rel="noreferrer" className="text-[9px] font-black text-slate-500 hover:text-white transition-all uppercase tracking-widest border border-white/5 px-4 py-2 rounded-lg">Sync Repository</a>
        </div>
      </div>

      <header className="flex flex-col md:flex-row justify-between items-start md:items-center py-6">
        <div className="relative group">
          <p className="text-blue-500 text-[10px] font-black uppercase tracking-[0.4em] mb-2 italic">US Market Discovery Node</p>
          <h1 className="text-6xl font-black tracking-tighter text-white italic transition-all group-hover:text-blue-500">US_ALPHA_SEEKER</h1>
        </div>
        
        <div className="flex items-center space-x-6 mt-6 md:mt-0">
           <div className="glass-panel px-8 py-4 rounded-3xl border-white/5 shadow-2xl flex items-center space-x-5 group cursor-pointer hover:bg-slate-800 transition-all">
             <div className="text-right">
               <p className="text-[9px] text-slate-500 font-black uppercase tracking-tighter">Chief Architect</p>
               <p className="text-lg font-black text-white italic tracking-tight">InnocentBae</p>
             </div>
             <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center text-white font-black text-xl border border-white/10 shadow-lg group-hover:rotate-6 transition-all">IB</div>
           </div>
        </div>
      </header>

      <nav className="flex space-x-4 pb-4 overflow-x-auto no-scrollbar">
        {STAGES_FLOW.map((stage) => (
          <button
            key={stage.id}
            onClick={() => setCurrentStage(stage.id)}
            className={`flex-shrink-0 px-10 py-5 rounded-2xl text-[11px] font-black uppercase tracking-[0.2em] transition-all duration-500 border-2 ${
              currentStage === stage.id
                ? 'bg-blue-600 text-white border-blue-400 shadow-[0_20px_40px_rgba(37,99,235,0.3)] scale-105 z-10'
                : 'bg-slate-800/20 text-slate-600 border-white/5 hover:bg-slate-800/40'
            }`}
          >
            {stage.label}
          </button>
        ))}
      </nav>

      <section className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 xl:grid-cols-9 gap-4">
        {apiStatuses.map((status) => (
          <ApiStatusCard 
            key={status.provider} 
            status={status} 
            isAuthConnected={status.provider === ApiProvider.GOOGLE_DRIVE ? isGdriveConnected : true} 
          />
        ))}
      </section>

      <main>
        {currentStage === 0 ? (
          <UniverseGathering onAuthSuccess={(status) => setIsGdriveConnected(status)} />
        ) : (
          <div className="glass-panel p-32 rounded-[40px] border-dashed border-4 border-slate-900 flex flex-col items-center justify-center text-center opacity-50 grayscale hover:grayscale-0 transition-all">
            <h2 className="text-4xl font-black text-slate-700 uppercase tracking-[0.5em] italic">Access Restricted</h2>
            <p className="text-slate-500 max-w-lg mt-8 font-bold leading-relaxed tracking-tight uppercase text-[11px]">Please complete the Stage 0 Universe Gathering protocol to unlock next-gen analysis pipelines.</p>
          </div>
        )}
      </main>

      <section className="glass-panel p-10 rounded-[40px] border-t-8 border-t-emerald-600 shadow-2xl">
        <div className="flex justify-between items-center mb-10">
          <div className="flex items-center space-x-6">
             <div className="bg-emerald-500/10 p-5 rounded-3xl border border-emerald-500/20">
                <svg className="w-10 h-10 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
             </div>
             <div>
                <h3 className="font-black text-white uppercase text-2xl tracking-tight italic tracking-tighter">AI Neural Pipeline Auditor</h3>
                <p className="text-[10px] text-slate-500 font-black uppercase tracking-[0.3em] mt-1 italic">Gemini 3.0 Pro Intelligence Protocol</p>
             </div>
          </div>
          <button 
            onClick={runAiAnalysis}
            disabled={isAiLoading}
            className={`px-12 py-5 rounded-2xl text-[11px] font-black uppercase tracking-[0.3em] transition-all border-2 ${isAiLoading ? 'bg-slate-900 text-slate-700 border-slate-800' : 'bg-emerald-600 text-white border-emerald-400 hover:bg-emerald-500 active:scale-95 shadow-xl shadow-emerald-600/30'}`}
          >
            {isAiLoading ? 'Synthesizing...' : 'Invoke Auditor'}
          </button>
        </div>
        
        <div className="bg-slate-950/80 p-12 rounded-[48px] border border-white/5 min-h-[250px] shadow-inner font-serif italic text-lg text-slate-300 leading-relaxed whitespace-pre-line">
          {aiReport || "Awaiting Matrix Command..."}
        </div>
      </section>
    </div>
  );
};

export default App;
