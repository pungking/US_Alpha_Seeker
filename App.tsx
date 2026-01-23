
import React, { useState, useEffect, useCallback } from 'react';
import { ApiProvider, ApiStatus } from './types';
import { API_CONFIGS, STAGES_FLOW, GITHUB_REPO } from './constants';
import ApiStatusCard from './components/ApiStatusCard';
import UniverseGathering from './components/UniverseGathering';
import PreliminaryFilter from './components/PreliminaryFilter';
import DeepQualityFilter from './components/DeepQualityFilter';
import MarketTicker from './components/MarketTicker';
import { analyzeCollectionSummary } from './services/geminiService';

const App: React.FC = () => {
  const [apiStatuses, setApiStatuses] = useState<(ApiStatus & { category: string })[]>([]);
  const [currentStage, setCurrentStage] = useState(0);
  const [aiReport, setAiReport] = useState<string | null>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [isGdriveConnected, setIsGdriveConnected] = useState(!!sessionStorage.getItem('gdrive_access_token'));
  const [isProd, setIsProd] = useState(false);

  const refreshApiStatuses = useCallback(() => {
    const hasGdriveToken = !!sessionStorage.getItem('gdrive_access_token');
    setIsGdriveConnected(hasGdriveToken);
    
    setApiStatuses(() => {
      const orderedConfigs = [
        ...API_CONFIGS.filter(c => c.category === 'Acquisition'),
        ...API_CONFIGS.filter(c => c.category === 'Intelligence'),
        ...API_CONFIGS.filter(c => c.category === 'Infrastructure')
      ];

      return orderedConfigs.map(config => {
        const isConnected = config.provider === ApiProvider.GOOGLE_DRIVE ? hasGdriveToken : !!config.key;
        return {
          provider: config.provider,
          category: config.category,
          isConnected: isConnected,
          latency: isConnected ? Math.floor(Math.random() * 40) + 15 : 0,
          lastChecked: new Date().toLocaleTimeString()
        };
      });
    });
  }, []);

  useEffect(() => {
    setIsProd(window.location.hostname === 'us-alpha-seeker.vercel.app');
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
    <div className="min-h-screen pb-10 p-3 md:p-6 space-y-6 max-w-[1600px] mx-auto overflow-x-hidden">
      {/* Nexus Toolbar */}
      <div className="flex items-center glass-panel px-4 py-2.5 rounded-xl border-white/5 text-[8px] md:text-[9px] font-black uppercase tracking-widest text-slate-500 overflow-x-auto no-scrollbar whitespace-nowrap">
        <div className="flex items-center space-x-2 mr-6 shrink-0">
          <div className={`w-1.5 h-1.5 rounded-full ${isProd ? 'bg-emerald-500' : 'bg-blue-500'}`}></div>
          <span>{isProd ? 'Production_Node' : 'Development_Node'}</span>
        </div>
        <div className="flex items-center space-x-2 mr-6 shrink-0">
          <div className={`w-1.5 h-1.5 rounded-full ${isGdriveConnected ? 'bg-emerald-500' : 'bg-slate-700'}`}></div>
          <span>Cloud_Vault: {isGdriveConnected ? 'Linked' : 'Disconnected'}</span>
        </div>
        <div className="flex items-center space-x-2 shrink-0">
          <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse"></div>
          <span>Pipeline_State: Stage_{currentStage}</span>
        </div>
        <a href={GITHUB_REPO} className="ml-auto opacity-40 hover:opacity-100 transition-opacity shrink-0">Nexus_Source</a>
      </div>

      <header className="flex flex-col md:flex-row justify-between items-start md:items-end py-2 gap-4">
        <div>
          <p className="text-blue-500 text-[8px] md:text-[9px] font-black uppercase tracking-[0.4em] mb-1 italic">US Alpha Seeker Infrastructure</p>
          <h1 className="text-4xl md:text-5xl font-black tracking-tighter text-white italic uppercase">US_Alpha_Seeker</h1>
        </div>
        <div className="flex items-center space-x-3 glass-panel px-4 py-2.5 rounded-xl border-white/5">
           <div className="text-right">
             <p className="text-[7px] text-slate-500 font-black uppercase">Architect</p>
             <p className="text-xs font-black text-white italic uppercase">InnocentBae</p>
           </div>
           <div className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center text-white font-black text-xs">IB</div>
        </div>
      </header>

      {/* Unified API Row */}
      <div className="space-y-4">
        <div className="space-y-2">
          <h2 className="text-[8px] font-black text-slate-600 uppercase tracking-[0.3em] italic flex items-center px-1">
            <span className="mr-3">Nexus Node Status Matrix</span>
            <div className="h-[1px] flex-1 bg-white/5"></div>
          </h2>
          <div className="flex gap-2 md:gap-3 overflow-x-auto no-scrollbar pb-1 px-1 scroll-smooth">
            {apiStatuses.map(status => (
              <ApiStatusCard 
                key={status.provider} 
                status={status} 
                isAuthConnected={isGdriveConnected} 
              />
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <h2 className="text-[8px] font-black text-slate-600 uppercase tracking-[0.3em] italic flex items-center px-1">
            <span className="mr-3">Market Intelligence Terminal</span>
            <div className="h-[1px] flex-1 bg-white/5"></div>
          </h2>
          <MarketTicker />
        </div>
      </div>

      <nav className="flex space-x-2 overflow-x-auto no-scrollbar py-1">
        {STAGES_FLOW.map((stage) => (
          <button
            key={stage.id}
            onClick={() => setCurrentStage(stage.id)}
            className={`flex-shrink-0 px-5 py-3.5 rounded-xl text-[8px] md:text-[9px] font-black uppercase tracking-widest transition-all border ${
              currentStage === stage.id
                ? 'bg-blue-600 text-white border-blue-400 shadow-lg scale-105 z-10'
                : 'bg-slate-800/20 text-slate-500 border-white/5 hover:bg-slate-800/40'
            }`}
          >
            {stage.label}
          </button>
        ))}
      </nav>

      <main className="min-h-[450px]">
        {currentStage === 0 && (
          <UniverseGathering onAuthSuccess={(status) => setIsGdriveConnected(status)} />
        )}
        {currentStage === 1 && (
          <PreliminaryFilter />
        )}
        {currentStage === 2 && (
          <DeepQualityFilter />
        )}
        {currentStage > 2 && (
          <div className="glass-panel p-16 md:p-24 rounded-[32px] border-dashed border-2 border-slate-800 flex flex-col items-center justify-center text-center opacity-30">
            <h2 className="text-xl md:text-2xl font-black text-slate-600 uppercase tracking-[0.3em]">Stage_Locked</h2>
            <p className="text-[8px] md:text-[9px] text-slate-500 mt-4 uppercase tracking-[0.2em]">Previous Matrix Finalization Required</p>
          </div>
        )}
      </main>

      {/* AI Auditor Section */}
      <section className="glass-panel p-5 md:p-8 rounded-[32px] border-t-4 border-t-emerald-600 shadow-2xl">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
          <div className="flex items-center space-x-4">
             <div className="bg-emerald-500/10 p-2.5 rounded-xl">
                <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
             </div>
             <div>
                <h3 className="font-black text-white uppercase text-base md:text-lg tracking-tighter italic">AI Pipeline Auditor</h3>
                <p className="text-[7px] md:text-[8px] text-slate-500 font-black uppercase tracking-widest">Model_Node: Gemini_3_Flash</p>
             </div>
          </div>
          <button 
            onClick={runAiAnalysis}
            disabled={isAiLoading}
            className={`w-full md:w-auto px-7 py-3.5 rounded-xl text-[9px] font-black uppercase tracking-widest border transition-all ${isAiLoading ? 'opacity-50 cursor-not-allowed bg-slate-900 border-slate-800' : 'bg-emerald-600 text-white border-emerald-400 hover:bg-emerald-500 shadow-lg shadow-emerald-600/20'}`}
          >
            {isAiLoading ? 'Auditing Matrix...' : 'Invoke Auditor'}
          </button>
        </div>
        <div className="bg-slate-950/50 p-6 md:p-8 rounded-2xl border border-white/5 font-serif italic text-xs md:text-sm text-slate-400 leading-relaxed min-h-[120px]">
          {aiReport || "Awaiting Node Status Telemetry..."}
        </div>
      </section>
    </div>
  );
};

export default App;
