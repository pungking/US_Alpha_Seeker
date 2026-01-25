
import React, { useState, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ApiProvider, ApiStatus } from './types';
import { API_CONFIGS, STAGES_FLOW, GITHUB_REPO } from './constants';
import ApiStatusCard from './components/ApiStatusCard';
import UniverseGathering from './components/UniverseGathering';
import PreliminaryFilter from './components/PreliminaryFilter';
import DeepQualityFilter from './components/DeepQualityFilter';
import FundamentalAnalysis from './components/FundamentalAnalysis';
import TechnicalAnalysis from './components/TechnicalAnalysis';
import IctAnalysis from './components/IctAnalysis';
import AlphaAnalysis from './components/AlphaAnalysis';
import MarketTicker from './components/MarketTicker';
import { analyzePipelineStatus } from './services/intelligenceService';

const App: React.FC = () => {
  const [apiStatuses, setApiStatuses] = useState<(ApiStatus & { category: string })[]>([]);
  const [currentStage, setCurrentStage] = useState(0);
  const [aiReport, setAiReport] = useState<string | null>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [isGdriveConnected, setIsGdriveConnected] = useState(!!sessionStorage.getItem('gdrive_access_token'));
  const [isProd, setIsProd] = useState(false);
  const [finalSymbols, setFinalSymbols] = useState<string[]>([]);
  const [selectedBrain, setSelectedBrain] = useState<ApiProvider>(ApiProvider.PERPLEXITY);

  const refreshApiStatuses = useCallback(async () => {
    const hasGdriveToken = !!sessionStorage.getItem('gdrive_access_token');
    setIsGdriveConnected(hasGdriveToken);
    
    let geminiActive = !!process.env.API_KEY;
    if (window.aistudio && !geminiActive) {
      geminiActive = await window.aistudio.hasSelectedApiKey();
    }
    if (!geminiActive) {
      const geminiConfig = API_CONFIGS.find(c => c.provider === ApiProvider.GEMINI);
      geminiActive = !!geminiConfig?.key;
    }

    setApiStatuses(() => {
      const orderedConfigs = [
        ...API_CONFIGS.filter(c => c.category === 'Acquisition'),
        ...API_CONFIGS.filter(c => c.category === 'Intelligence'),
        ...API_CONFIGS.filter(c => c.category === 'Infrastructure')
      ];

      return orderedConfigs.map(config => {
        let isConnected = false;
        if (config.provider === ApiProvider.GOOGLE_DRIVE) {
          isConnected = hasGdriveToken;
        } else if (config.provider === ApiProvider.GEMINI) {
          isConnected = geminiActive;
        } else {
          isConnected = !!config.key;
        }

        return {
          provider: config.provider,
          category: config.category,
          isConnected: isConnected,
          latency: isConnected ? Math.floor(Math.random() * 20) + 5 : 0,
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
    setAiReport(null);
    
    try {
      const report = await analyzePipelineStatus({
        currentStage,
        apiStatuses,
        symbols: finalSymbols.length > 0 ? finalSymbols : null,
      }, selectedBrain);
      
      setAiReport(report);
    } catch (err: any) {
      setAiReport(`### CRITICAL_NODE_ERROR\n> ${err.message}`);
    } finally {
      setIsAiLoading(false);
    }
  };

  const copyReport = () => {
    if (aiReport) {
      navigator.clipboard.writeText(aiReport);
      alert('전략 보고서가 클립보드에 복사되었습니다.');
    }
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

      {/* API Matrix & Ticker Row */}
      <div className="space-y-4">
        <div className="flex gap-2 md:gap-3 overflow-x-auto no-scrollbar pb-1 px-1 scroll-smooth">
          {apiStatuses.map(status => (
            <ApiStatusCard key={status.provider} status={status} isAuthConnected={status.isConnected} />
          ))}
        </div>
        <MarketTicker />
      </div>

      <nav className="flex space-x-2 overflow-x-auto no-scrollbar py-1">
        {STAGES_FLOW.map((stage) => (
          <button
            key={stage.id}
            onClick={() => setCurrentStage(stage.id)}
            className={`flex-shrink-0 px-5 py-3.5 rounded-xl text-[8px] md:text-[9px] font-black uppercase tracking-widest transition-all border ${
              currentStage === stage.id ? 'bg-blue-600 text-white border-blue-400 shadow-lg scale-105 z-10' : 'bg-slate-800/20 text-slate-500 border-white/5 hover:bg-slate-800/40'
            }`}
          >
            {stage.label}
          </button>
        ))}
      </nav>

      <main className="min-h-[450px]">
        {/* Keep-Alive Rendering Logic to prevent Data Loss on Tab Switch */}
        <div style={{ display: currentStage === 0 ? 'block' : 'none' }}>
          <UniverseGathering onAuthSuccess={(status) => setIsGdriveConnected(status)} />
        </div>
        <div style={{ display: currentStage === 1 ? 'block' : 'none' }}>
          <PreliminaryFilter />
        </div>
        <div style={{ display: currentStage === 2 ? 'block' : 'none' }}>
          <DeepQualityFilter />
        </div>
        <div style={{ display: currentStage === 3 ? 'block' : 'none' }}>
          <FundamentalAnalysis />
        </div>
        <div style={{ display: currentStage === 4 ? 'block' : 'none' }}>
          <TechnicalAnalysis />
        </div>
        <div style={{ display: currentStage === 5 ? 'block' : 'none' }}>
          <IctAnalysis />
        </div>
        <div style={{ display: currentStage === 6 ? 'block' : 'none' }}>
          <AlphaAnalysis 
            selectedBrain={selectedBrain} 
            setSelectedBrain={setSelectedBrain}
            onFinalSymbolsDetected={(symbols) => setFinalSymbols(symbols)}
          />
        </div>
      </main>

      {/* AI ALPHA AUDITOR Section */}
      <section className="glass-panel p-8 md:p-12 rounded-[48px] border-t-4 border-t-emerald-600 shadow-2xl relative overflow-hidden transition-all duration-500 hover:shadow-emerald-900/20">
        <div className="absolute top-0 right-0 p-12 opacity-[0.05] pointer-events-none">
           <svg className="w-80 h-80 text-emerald-500" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2L1 21h22L12 2zm0 3.45l8.27 14.3H3.73L12 5.45z"/></svg>
        </div>

        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-10 gap-8 relative z-10">
          <div className="flex items-center space-x-8">
             <div className="bg-emerald-500/10 p-5 rounded-[28px] border border-emerald-500/20 shadow-inner">
                <svg className={`w-10 h-10 text-emerald-400 ${isAiLoading ? 'animate-spin' : 'animate-pulse'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
             </div>
             <div>
                <h3 className="font-black text-white uppercase text-2xl tracking-tighter italic leading-none">AI Alpha Auditor Matrix</h3>
                <div className="flex items-center space-x-3 mt-3">
                   <span className="text-[8px] font-black text-emerald-500 uppercase tracking-widest bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/20">Alpha_Insight_Node_Active</span>
                   <span className="text-[8px] text-slate-500 font-black uppercase tracking-widest italic border-l border-white/10 pl-3">
                     Engine: {selectedBrain === ApiProvider.GEMINI ? 'Gemini 3 Pro' : 'Sonar Pro'}
                   </span>
                </div>
             </div>
          </div>
          
          <div className="flex gap-4">
             {aiReport && (
               <button 
                 onClick={copyReport}
                 className="px-6 py-4 bg-slate-800 text-slate-300 rounded-2xl text-[10px] font-black uppercase tracking-widest border border-white/5 hover:bg-slate-700 transition-all"
               >
                 Copy Report
               </button>
             )}
             <button 
                onClick={runAiAnalysis}
                disabled={isAiLoading}
                className={`px-12 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest border transition-all ${isAiLoading ? 'opacity-50 cursor-not-allowed bg-slate-900 border-slate-800' : 'bg-emerald-600 text-white border-emerald-400 hover:bg-emerald-500 shadow-2xl shadow-emerald-600/30 active:scale-95'}`}
              >
                {isAiLoading ? 'Generating Intelligence...' : 'Execute Strategic Audit'}
              </button>
          </div>
        </div>

        <div className="bg-black/40 rounded-[40px] border border-white/5 p-8 md:p-12 min-h-[300px] shadow-inner relative group">
          {isAiLoading ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center space-y-6">
              <div className="w-16 h-16 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin"></div>
              <p className="text-[10px] font-black text-emerald-500/60 uppercase tracking-[0.4em] animate-pulse">Synthesizing High-Frequency Market Data...</p>
            </div>
          ) : aiReport ? (
            <div className="prose-report animate-in fade-in slide-in-from-bottom-4 duration-700">
               <ReactMarkdown remarkPlugins={[remarkGfm]}>
                 {aiReport}
               </ReactMarkdown>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-24 opacity-30 text-center space-y-4">
              <svg className="w-16 h-16 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.6em] italic">
                Awaiting Alpha Protocol Signal... <br/>
                <span className="text-[8px] mt-2 block">Stage 6 Data must be synthesized before audit.</span>
              </p>
            </div>
          )}
        </div>

        <div className="mt-8 flex justify-between items-center px-4 opacity-40">
           <p className="text-[8px] font-black text-slate-600 uppercase tracking-widest">InnocentBae Systems • Integrated Neural Strategy Node</p>
           <p className="text-[8px] font-black text-slate-600 uppercase tracking-widest">v8.2.0_Audit_Ready</p>
        </div>
      </section>
    </div>
  );
};

export default App;
