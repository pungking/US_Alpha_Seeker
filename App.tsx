
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
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [isGdriveConnected, setIsGdriveConnected] = useState(!!sessionStorage.getItem('gdrive_access_token'));
  const [isProd, setIsProd] = useState(false);
  const [finalSymbols, setFinalSymbols] = useState<string[]>([]);
  const [recommendedData, setRecommendedData] = useState<any[] | null>(null);
  
  const [selectedBrain, setSelectedBrain] = useState<ApiProvider>(ApiProvider.PERPLEXITY);
  // Independent brain state for the bottom Auditor Panel
  const [auditBrain, setAuditBrain] = useState<ApiProvider>(ApiProvider.PERPLEXITY);

  // New State for Single Stock Audit
  const [selectedStock, setSelectedStock] = useState<any | null>(null);
  const [stockAuditCache, setStockAuditCache] = useState<{ [symbol: string]: string }>({});
  const [analyzingStocks, setAnalyzingStocks] = useState<Set<string>>(new Set());

  useEffect(() => {
    // Sync default audit brain with top brain initially
    setAuditBrain(selectedBrain);
  }, [selectedBrain]);

  const refreshApiStatuses = useCallback(async () => {
    const hasGdriveToken = !!sessionStorage.getItem('gdrive_access_token');
    setIsGdriveConnected(hasGdriveToken);
    let geminiActive = !!process.env.API_KEY;
    if (window.aistudio && !geminiActive) geminiActive = await window.aistudio.hasSelectedApiKey();
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
        let isConnected = config.provider === ApiProvider.GOOGLE_DRIVE ? hasGdriveToken : 
                          config.provider === ApiProvider.GEMINI ? geminiActive : !!config.key;
        return {
          provider: config.provider,
          category: config.category,
          isConnected,
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

  const runStockAudit = async () => {
    if (!selectedStock) return;
    
    setIsAiLoading(true);
    setAnalyzingStocks(prev => new Set(prev).add(selectedStock.symbol));

    try {
      const report = await analyzePipelineStatus({
        currentStage,
        apiStatuses,
        symbols: [selectedStock.symbol],
        targetStock: selectedStock,
        mode: 'SINGLE_STOCK'
      }, auditBrain);
      
      setStockAuditCache(prev => ({ ...prev, [selectedStock.symbol]: report }));
    } catch (err: any) {
      console.error(err);
      setStockAuditCache(prev => ({ ...prev, [selectedStock.symbol]: `### CRITICAL_NODE_ERROR\n> ${err.message}` }));
    } finally {
      setIsAiLoading(false);
      setAnalyzingStocks(prev => {
          const next = new Set(prev);
          next.delete(selectedStock.symbol);
          return next;
      });
    }
  };

  // Safe access for the report, fallback to null/empty string if not ready
  const currentReport = selectedStock?.symbol ? stockAuditCache[selectedStock.symbol] : null;

  const copyReport = () => {
    if (currentReport) {
      navigator.clipboard.writeText(currentReport);
      alert('전략 보고서가 클립보드에 복사되었습니다.');
    }
  };

  return (
    <div className="min-h-screen pb-10 p-2 sm:p-4 md:p-6 space-y-4 md:space-y-6 max-w-[1600px] mx-auto overflow-x-hidden">
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
          <h1 className="text-2xl sm:text-3xl md:text-5xl font-black tracking-tighter text-white italic uppercase leading-tight">US_Alpha_Seeker</h1>
        </div>
        <div className="flex items-center space-x-3 glass-panel px-4 py-2.5 rounded-xl border-white/5 w-full md:w-auto justify-between md:justify-end">
           <div className="text-right">
             <p className="text-[7px] text-slate-500 font-black uppercase">Architect</p>
             <p className="text-xs font-black text-white italic uppercase">InnocentBae</p>
           </div>
           <div className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center text-white font-black text-xs">IB</div>
        </div>
      </header>

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
            className={`flex-shrink-0 px-4 md:px-5 py-3 md:py-3.5 rounded-xl text-[8px] md:text-[9px] font-black uppercase tracking-widest transition-all border ${
              currentStage === stage.id ? 'bg-blue-600 text-white border-blue-400 shadow-lg scale-105 z-10' : 'bg-slate-800/20 text-slate-500 border-white/5 hover:bg-slate-800/40'
            }`}
          >
            {stage.label}
          </button>
        ))}
      </nav>

      <main className="min-h-[450px]">
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
            onFinalSymbolsDetected={(symbols, fullData) => {
              setFinalSymbols(symbols);
              setRecommendedData(fullData);
            }}
            onStockSelected={setSelectedStock}
            analyzingSymbols={analyzingStocks}
          />
        </div>
      </main>

      <section className={`glass-panel p-6 md:p-8 lg:p-12 rounded-[32px] md:rounded-[48px] border-t-4 shadow-2xl relative overflow-hidden transition-all duration-500 hover:shadow-emerald-900/20 ${selectedStock ? 'border-t-emerald-600' : 'border-t-slate-700 opacity-80'}`}>
        <div className="absolute top-0 right-0 p-12 opacity-[0.05] pointer-events-none">
           <svg className="w-80 h-80 text-emerald-500" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2L1 21h22L12 2zm0 3.45l8.27 14.3H3.73L12 5.45z"/></svg>
        </div>
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-6 md:mb-10 gap-6 md:gap-8 relative z-10">
          <div className="flex flex-col md:flex-row items-start md:items-center space-y-4 md:space-y-0 md:space-x-8">
             <div className="bg-emerald-500/10 p-5 rounded-[28px] border border-emerald-500/20 shadow-inner hidden md:block">
                <svg className={`w-10 h-10 text-emerald-400 ${isAiLoading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
             </div>
             <div>
                <h3 className="font-black text-white uppercase text-xl md:text-2xl tracking-tighter italic leading-none">AI Alpha Auditor Matrix</h3>
                <div className="flex flex-wrap items-center gap-3 mt-3">
                   <span className="text-[8px] font-black text-emerald-500 uppercase tracking-widest bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/20 whitespace-nowrap">
                       {selectedStock ? `Target: ${selectedStock.symbol}` : 'System Standby'}
                   </span>
                   {selectedStock && (
                       <div className="flex bg-black/40 p-1 rounded-full border border-white/10 ml-0 md:ml-4">
                          <button onClick={() => setAuditBrain(ApiProvider.PERPLEXITY)} className={`px-3 py-1 rounded-full text-[7px] font-black uppercase transition-all ${auditBrain === ApiProvider.PERPLEXITY ? 'bg-cyan-600 text-white' : 'text-slate-500'}`}>Sonar (Default)</button>
                          <button onClick={() => setAuditBrain(ApiProvider.GEMINI)} className={`px-3 py-1 rounded-full text-[7px] font-black uppercase transition-all ${auditBrain === ApiProvider.GEMINI ? 'bg-emerald-600 text-white' : 'text-slate-500'}`}>Gemini</button>
                       </div>
                   )}
                </div>
             </div>
          </div>
          <div className="flex gap-4 w-full lg:w-auto">
             {currentReport && <button onClick={copyReport} className="flex-1 lg:flex-none px-6 py-4 bg-slate-800 text-slate-300 rounded-2xl text-[10px] font-black uppercase tracking-widest border border-white/5">Copy Report</button>}
             <button onClick={runStockAudit} disabled={isAiLoading || !selectedStock} className={`flex-1 lg:flex-none px-8 md:px-12 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest border transition-all ${isAiLoading ? 'opacity-50 bg-slate-900' : 'bg-emerald-600 text-white border-emerald-400 hover:bg-emerald-500 shadow-2xl shadow-emerald-600/30'}`}>
                {isAiLoading ? 'Auditing...' : selectedStock ? `Audit ${selectedStock.symbol}` : 'Select Stock'}
              </button>
          </div>
        </div>
        <div className="bg-black/40 rounded-[32px] md:rounded-[40px] border border-white/5 p-6 md:p-8 lg:p-12 min-h-[300px] shadow-inner relative group">
          {isAiLoading ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center space-y-6">
              <div className="w-16 h-16 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin"></div>
              <p className="text-[10px] font-black text-emerald-500/60 uppercase tracking-[0.4em] animate-pulse">Running Deep Dive Audit Protocol...</p>
            </div>
          ) : currentReport ? (
            <div className="prose-report animate-in fade-in slide-in-from-bottom-4 duration-700">
               <div className="mb-4 flex items-center justify-between border-b border-emerald-500/20 pb-4">
                  <span className="text-[9px] font-black uppercase tracking-widest text-emerald-500">
                     Deep Audit for {selectedStock?.symbol || 'Target'} via {auditBrain === ApiProvider.GEMINI ? 'Gemini Pro' : 'Sonar Pro'}
                  </span>
                  <span className="text-[9px] font-mono text-slate-600">{new Date().toLocaleTimeString()}</span>
               </div>
               <ReactMarkdown remarkPlugins={[remarkGfm]}>{String(currentReport || "")}</ReactMarkdown>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-24 opacity-30 text-center space-y-4">
              <svg className="w-16 h-16 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.6em] italic text-center">
                 {selectedStock ? `Ready to Audit ${selectedStock.symbol}. Click 'Audit ${selectedStock.symbol}' to begin.` : 'Select a stock from Stage 6 (Alpha Analysis) to begin Audit.'}
              </p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
};

export default App;
