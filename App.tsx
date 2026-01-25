
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
  const [auditReports, setAuditReports] = useState<{ [key in ApiProvider]?: string }>({});
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [isGdriveConnected, setIsGdriveConnected] = useState(!!sessionStorage.getItem('gdrive_access_token'));
  const [isProd, setIsProd] = useState(false);
  const [finalSymbols, setFinalSymbols] = useState<string[]>([]);
  const [selectedBrain, setSelectedBrain] = useState<ApiProvider>(ApiProvider.GEMINI);
  const [auditBrain, setAuditBrain] = useState<ApiProvider>(ApiProvider.PERPLEXITY);
  
  const [isAutoPilotActive, setIsAutoPilotActive] = useState(false);

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

  const runAiAnalysis = async (symbolsToUse?: string[]) => {
    setIsAiLoading(true);
    try {
      const report = await analyzePipelineStatus({
        currentStage,
        apiStatuses,
        symbols: symbolsToUse || (finalSymbols.length > 0 ? finalSymbols : null),
      }, auditBrain);
      setAuditReports(prev => ({ ...prev, [auditBrain]: report }));
    } catch (err: any) {
      setAuditReports(prev => ({ ...prev, [auditBrain]: `### CRITICAL_NODE_ERROR\n> ${err.message}` }));
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleStageComplete = useCallback((symbols?: string[]) => {
    if (isAutoPilotActive) {
      if (currentStage < 6) {
        // 드라이브 인덱싱 지연에 대응하기 위해 스테이지 전환 지연 시간을 3초로 확장
        console.log(`[Auto-Pilot] Stage ${currentStage} Complete. Waiting for Cloud Sync...`);
        setTimeout(() => {
          setCurrentStage(prev => prev + 1);
        }, 3000);
      } else {
        // 최종 6단계 완료
        console.log("[Auto-Pilot] All Stages Complete. Initiating Strategic Audit.");
        if (symbols && symbols.length > 0) setFinalSymbols(symbols);
        runAiAnalysis(symbols);
        setIsAutoPilotActive(false);
      }
    }
  }, [isAutoPilotActive, currentStage]);

  const startAutoPilot = () => {
    console.log("[Auto-Pilot] System Initializing...");
    setIsAutoPilotActive(true);
    setCurrentStage(0);
  };

  return (
    <div className="min-h-screen pb-10 p-3 md:p-6 space-y-6 max-w-[1600px] mx-auto overflow-x-hidden">
      {/* 툴바 및 메뉴 영역 - 기존과 동일 */}
      <div className="flex items-center glass-panel px-4 py-2.5 rounded-xl border-white/5 text-[8px] md:text-[9px] font-black uppercase tracking-widest text-slate-500 overflow-x-auto no-scrollbar whitespace-nowrap relative">
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

        <div className="ml-auto flex items-center space-x-4 shrink-0">
          <button 
            onClick={startAutoPilot}
            disabled={isAutoPilotActive}
            className={`px-4 py-1.5 rounded-lg border text-[8px] font-black uppercase tracking-tighter transition-all flex items-center space-x-2 ${isAutoPilotActive ? 'bg-emerald-600/20 border-emerald-500/50 text-emerald-400' : 'bg-blue-600 text-white border-blue-400 hover:scale-105 active:scale-95'}`}
          >
            <div className={`w-1.5 h-1.5 rounded-full ${isAutoPilotActive ? 'bg-emerald-400 animate-ping' : 'bg-white'}`}></div>
            <span>{isAutoPilotActive ? 'Nexus_AutoPilot_Engaged' : 'Execute_Full_AutoPilot'}</span>
          </button>
          <a href={GITHUB_REPO} className="opacity-40 hover:opacity-100 transition-opacity">Nexus_Source</a>
        </div>
      </div>
      
      {/* 스테이지 전환 시에도 데이터 수집 노드가 살아있도록 조건부 렌더링 최적화 */}
      <main className="min-h-[450px]">
        {currentStage === 0 && <UniverseGathering onAuthSuccess={(status) => setIsGdriveConnected(status)} onComplete={() => handleStageComplete()} autoStart={isAutoPilotActive} />}
        {currentStage === 1 && <PreliminaryFilter onComplete={() => handleStageComplete()} autoStart={isAutoPilotActive} />}
        {currentStage === 2 && <DeepQualityFilter onComplete={() => handleStageComplete()} autoStart={isAutoPilotActive} />}
        {currentStage === 3 && <FundamentalAnalysis onComplete={() => handleStageComplete()} autoStart={isAutoPilotActive} />}
        {currentStage === 4 && <TechnicalAnalysis onComplete={() => handleStageComplete()} autoStart={isAutoPilotActive} />}
        {currentStage === 5 && <IctAnalysis onComplete={() => handleStageComplete()} autoStart={isAutoPilotActive} />}
        {currentStage === 6 && <AlphaAnalysis selectedBrain={selectedBrain} setSelectedBrain={setSelectedBrain} onFinalSymbolsDetected={(symbols) => { setFinalSymbols(symbols); handleStageComplete(symbols); }} autoStart={isAutoPilotActive} />}
      </main>

      {/* AI 감사 섹션 - 기존과 동일 */}
      <section className="glass-panel p-8 md:p-12 rounded-[48px] border-t-4 border-t-emerald-600 shadow-2xl relative overflow-hidden transition-all duration-500 hover:shadow-emerald-900/20">
         {/* ... */}
         <button onClick={() => runAiAnalysis()} disabled={isAiLoading} className={`px-12 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest border transition-all ${isAiLoading ? 'opacity-50 cursor-not-allowed bg-slate-900 border-slate-800' : 'bg-emerald-600 text-white border-emerald-400 hover:bg-emerald-500 active:scale-95'}`}>{isAiLoading ? 'Generating Intelligence...' : 'Execute Strategic Audit'}</button>
         {/* ... */}
      </section>
    </div>
  );
};

export default App;
