
import React, { useState, useEffect, useCallback } from 'react';
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
import { analyzePipelineStatus } from './services/geminiService';

const App: React.FC = () => {
  const [apiStatuses, setApiStatuses] = useState<(ApiStatus & { category: string })[]>([]);
  const [currentStage, setCurrentStage] = useState(0);
  const [aiReport, setAiReport] = useState<string | null>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [isGdriveConnected, setIsGdriveConnected] = useState(!!sessionStorage.getItem('gdrive_access_token'));

  const refreshApiStatuses = useCallback(() => {
    const hasGdriveToken = !!sessionStorage.getItem('gdrive_access_token');
    setIsGdriveConnected(hasGdriveToken);
    
    setApiStatuses(() => {
      return API_CONFIGS.map(config => {
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
    refreshApiStatuses();
    const interval = setInterval(refreshApiStatuses, 5000);
    return () => clearInterval(interval);
  }, [refreshApiStatuses]);

  const runAiAudit = async () => {
    setIsAiLoading(true);
    const report = await analyzePipelineStatus({
      currentStage,
      apiStatuses,
      systemLoad: "OPTIMIZED"
    });
    setAiReport(report);
    setIsAiLoading(false);
  };

  return (
    <div className="min-h-screen pb-10 p-3 md:p-6 space-y-8 max-w-[1600px] mx-auto overflow-x-hidden bg-[#030712] text-slate-200">
      {/* Nexus Toolbar */}
      <div className="flex items-center glass-panel px-4 py-3 rounded-xl border-white/5 text-[9px] font-black uppercase tracking-widest text-slate-500 whitespace-nowrap overflow-x-auto no-scrollbar">
        <div className="flex items-center space-x-2 mr-8 shrink-0">
          <div className="w-1.5 h-1.5 rounded-full bg-blue-500"></div>
          <span>NEXUS NODE STATUS MATRIX</span>
        </div>
        <div className="flex items-center space-x-2 shrink-0">
          <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse"></div>
          <span>PIPELINE_STATE: STAGE_{currentStage}</span>
        </div>
        <a href={GITHUB_REPO} className="ml-auto opacity-40 hover:opacity-100 transition-opacity">Nexus_Source</a>
      </div>

      {/* API Status Matrix */}
      <div className="space-y-4">
        <div className="flex gap-3 overflow-x-auto no-scrollbar pb-2">
          {apiStatuses.map(status => (
            <ApiStatusCard key={status.provider} status={status} isAuthConnected={isGdriveConnected} />
          ))}
        </div>
        <div className="flex items-center space-x-3 px-1">
           <span className="text-[9px] font-black text-slate-600 uppercase tracking-[0.3em] italic whitespace-nowrap">Market Intelligence Terminal</span>
           <div className="h-[1px] flex-1 bg-white/5"></div>
        </div>
        <MarketTicker />
      </div>

      {/* Navigation Stage Selectors */}
      <nav className="flex space-x-3 overflow-x-auto no-scrollbar py-2">
        {STAGES_FLOW.map((stage) => (
          <button
            key={stage.id}
            onClick={() => setCurrentStage(stage.id)}
            className={`flex-shrink-0 px-8 py-4 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border-2 ${
              currentStage === stage.id
                ? 'bg-[#2563eb] text-white border-[#3b82f6] shadow-[0_0_25px_rgba(37,99,235,0.3)] scale-105 z-10'
                : 'bg-slate-900/30 text-slate-500 border-white/5 hover:bg-slate-800/40'
            }`}
          >
            {stage.label}
          </button>
        ))}
      </nav>

      {/* Main Analysis Engine */}
      <main className="min-h-[500px]">
        {currentStage === 0 && <UniverseGathering onAuthSuccess={(status) => setIsGdriveConnected(status)} />}
        {currentStage === 1 && <PreliminaryFilter />}
        {currentStage === 2 && <DeepQualityFilter />}
        {currentStage === 3 && <FundamentalAnalysis />}
        {currentStage === 4 && <TechnicalAnalysis />}
        {currentStage === 5 && <IctAnalysis />}
        {currentStage === 6 && <AlphaAnalysis />}
      </main>

      {/* AI Pipeline Auditor - Scrolled Image Match */}
      <section className="glass-panel p-10 md:p-14 rounded-[45px] border-t-4 border-t-[#10b981] bg-slate-900/40 relative shadow-2xl">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-10">
           <div className="flex items-center space-x-8">
              <div className="bg-[#10b981]/10 p-6 rounded-[30px] border border-[#10b981]/20">
                 <svg className={`w-12 h-12 text-[#10b981] ${isAiLoading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
              </div>
              <div className="space-y-3">
                 <h3 className="font-black text-white uppercase text-3xl italic tracking-tighter">AI PIPELINE AUDITOR</h3>
                 <div className="flex items-center space-x-4">
                    <span className="text-[8px] font-black bg-[#10b981]/20 text-[#10b981] px-3 py-1 rounded border border-[#10b981]/30 tracking-widest uppercase">ALPHA_CONFIDENCE_SHIELD</span>
                    <p className="text-[7px] text-slate-500 font-black uppercase tracking-widest">Model: GEMINI_3_FLASH_DIAGNOSTICS</p>
                 </div>
              </div>
           </div>
           
           <div className="flex flex-col lg:items-end gap-6 w-full lg:w-auto">
              <div className="text-right">
                 <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">AUDIT ROLE</p>
                 <p className="text-[10px] text-[#10b981] font-black italic">데이터 오염 방지 및 분석 신뢰도 무결성 검증</p>
              </div>
              <button 
                onClick={runAiAudit} 
                disabled={isAiLoading} 
                className={`px-14 py-6 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all shadow-2xl ${
                  isAiLoading ? 'bg-slate-800 text-slate-500' : 'bg-[#10b981] text-white hover:bg-[#059669] hover:scale-105 active:scale-95'
                }`}
              >
                {isAiLoading ? 'AUDITING NODE...' : 'EXECUTE OPERATIONAL AUDIT'}
              </button>
           </div>
        </div>

        {aiReport && (
          <div className="mt-12 bg-black/60 p-10 rounded-[40px] border border-white/5 font-mono text-xs md:text-sm text-[#10b981]/90 leading-relaxed min-h-[200px] whitespace-pre-wrap animate-in fade-in slide-in-from-bottom-4">
            {aiReport}
          </div>
        )}
      </section>
    </div>
  );
};

export default App;
