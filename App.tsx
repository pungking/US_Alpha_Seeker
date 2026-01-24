
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
import { analyzePipelineStatus } from './services/intelligenceService';

const App: React.FC = () => {
  const [apiStatuses, setApiStatuses] = useState<(ApiStatus & { category: string })[]>([]);
  const [currentStage, setCurrentStage] = useState(0);
  const [aiReport, setAiReport] = useState<string | null>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [isGdriveConnected, setIsGdriveConnected] = useState(!!sessionStorage.getItem('gdrive_access_token'));
  const [isProd, setIsProd] = useState(false);
  
  // 분석된 최종 종목들을 공유하기 위한 상태
  const [finalSymbols, setFinalSymbols] = useState<string[]>([]);
  
  // 엔진 선택 상태 (전역 관리)
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

  // 하단 Auditor 실행 함수
  const runAiAnalysis = async () => {
    setIsAiLoading(true);
    const brainLabel = selectedBrain === ApiProvider.GEMINI ? "Gemini 3 Pro" : "Sonar Pro (PPLX)";
    
    // 분석할 종목이 있는지 확인
    const targetSymbols = finalSymbols.length > 0 ? finalSymbols : undefined;
    
    setAiReport(`> ${brainLabel.toUpperCase()} 전략 노드 활성화...\n> 대상 종목: ${targetSymbols?.join(", ") || "섹터 전체 스캐닝 중"}\n> 실시간 뉴스 및 매크로 데이터 분석 중...`);
    
    try {
      const report = await analyzePipelineStatus({
        currentStage,
        apiStatuses,
        symbols: targetSymbols,
        systemLoad: "INTEGRATED_STRATEGY_MODE"
      }, selectedBrain);
      
      setAiReport(report);
    } catch (err: any) {
      setAiReport(`> 분석 노드 치명적 오류: ${err.message}`);
    } finally {
      setIsAiLoading(false);
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
                isAuthConnected={status.isConnected} 
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
        {currentStage === 1 && <PreliminaryFilter />}
        {currentStage === 2 && <DeepQualityFilter />}
        {currentStage === 3 && <FundamentalAnalysis />}
        {currentStage === 4 && <TechnicalAnalysis />}
        {currentStage === 5 && <IctAnalysis />}
        {currentStage === 6 && (
          <AlphaAnalysis 
            selectedBrain={selectedBrain} 
            setSelectedBrain={setSelectedBrain}
            onFinalSymbolsDetected={(symbols) => setFinalSymbols(symbols)}
          />
        )}
      </main>

      {/* AI Auditor Section */}
      <section className="glass-panel p-6 md:p-10 rounded-[40px] border-t-4 border-t-emerald-600 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 p-10 opacity-[0.03] pointer-events-none">
           <svg className="w-64 h-64 text-emerald-500" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2L1 21h22L12 2zm0 3.45l8.27 14.3H3.73L12 5.45z"/></svg>
        </div>

        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-8 gap-6 relative z-10">
          <div className="flex items-center space-x-6">
             <div className="bg-emerald-500/10 p-4 rounded-3xl border border-emerald-500/20">
                <svg className={`w-8 h-8 text-emerald-400 ${isAiLoading ? 'animate-spin' : 'animate-pulse'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
             </div>
             <div>
                <h3 className="font-black text-white uppercase text-xl tracking-tighter italic">AI Alpha Auditor</h3>
                <div className="flex items-center space-x-2 mt-1">
                   <span className="text-[7px] font-black text-emerald-500 uppercase tracking-widest bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">Alpha_Strategic_Insight</span>
                   <span className="text-[7px] text-slate-500 font-black uppercase tracking-widest italic">
                     Active Engine: {selectedBrain === ApiProvider.GEMINI ? 'Gemini 3 Pro' : 'Sonar Pro'}
                   </span>
                </div>
             </div>
          </div>
          <button 
            onClick={runAiAnalysis}
            disabled={isAiLoading}
            className={`px-10 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest border transition-all ${isAiLoading ? 'opacity-50 cursor-not-allowed bg-slate-900 border-slate-800' : 'bg-emerald-600 text-white border-emerald-400 hover:bg-emerald-500 shadow-xl shadow-emerald-600/20'}`}
          >
            {isAiLoading ? 'Analyzing Market...' : 'Execute Strategic Report'}
          </button>
        </div>

        <div className="bg-black/60 p-8 rounded-[32px] font-mono text-xs md:text-sm text-emerald-300/90 leading-relaxed min-h-[120px] shadow-inner overflow-y-auto max-h-[400px] whitespace-pre-wrap">
          {aiReport || `> 시스템 대기 중... \n> [안내] Stage 6에서 최종 종목이 확정된 후 이 버튼을 누르면 실시간 시황과 결합된 상세 분석이 제공됩니다.`}
        </div>
      </section>
    </div>
  );
};

export default App;
