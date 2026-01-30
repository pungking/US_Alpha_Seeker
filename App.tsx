
import React, { useState, useEffect, useCallback, useRef } from 'react';
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
import { analyzePipelineStatus, archiveReport } from './services/intelligenceService';
import { sendTelegramReport } from './services/telegramService';

const App: React.FC = () => {
  const [apiStatuses, setApiStatuses] = useState<(ApiStatus & { category: string })[]>([]);
  const [currentStage, setCurrentStage] = useState(0);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [isGdriveConnected, setIsGdriveConnected] = useState(!!sessionStorage.getItem('gdrive_access_token'));
  const [showTroubleshooter, setShowTroubleshooter] = useState(false);
  
  // Automation State
  const [viewMode, setViewMode] = useState<'MANUAL' | 'AUTO'>('MANUAL');
  const [isAutoPilotRunning, setIsAutoPilotRunning] = useState(false);
  const [autoStatusMessage, setAutoStatusMessage] = useState("SYSTEM STANDBY");
  
  // Resource Tracking
  const [aiUsage, setAiUsage] = useState<any>({ 
    gemini: { tokens: 0, requests: 0, status: 'OK', lastError: '' }, 
    perplexity: { tokens: 0, requests: 0, status: 'OK', lastError: '' } 
  });
  
  // Data State
  const [selectedBrain, setSelectedBrain] = useState<ApiProvider>(ApiProvider.GEMINI);
  const [auditBrain, setAuditBrain] = useState<ApiProvider>(ApiProvider.GEMINI);
  const [selectedStock, setSelectedStock] = useState<any | null>(null);
  const [stockAuditCache, setStockAuditCache] = useState<{ [key: string]: string }>({});

  const refreshApiStatuses = useCallback(async () => {
    const hasGdriveToken = !!sessionStorage.getItem('gdrive_access_token');
    setIsGdriveConnected(hasGdriveToken);
    let geminiActive = !!process.env.API_KEY;
    if (window.aistudio && !geminiActive) {
        geminiActive = await window.aistudio.hasSelectedApiKey();
        // If it's still false, it might be the GitHub sync issue
        if (!geminiActive) setShowTroubleshooter(true);
        else setShowTroubleshooter(false);
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
          latency: isConnected ? Math.floor(Math.random() * 10) + 5 : 0,
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

  const toggleViewMode = () => {
      if (viewMode === 'MANUAL') {
          if (!isGdriveConnected) return;
          setViewMode('AUTO');
          setIsAutoPilotRunning(true);
          setCurrentStage(0);
          setAutoStatusMessage("AUTO_PILOT_ACTIVE");
      } else {
          setViewMode('MANUAL');
          setIsAutoPilotRunning(false);
          setAutoStatusMessage("SYSTEM STANDBY");
      }
  };

  return (
    <div className={`min-h-screen pb-12 p-4 space-y-6 max-w-[1700px] mx-auto overflow-x-hidden ${isAutoPilotRunning ? 'border-4 border-rose-600 rounded-3xl bg-[#010409]' : ''}`}>
      
      {/* CONNECTION TROUBLESHOOTER OVERLAY */}
      {showTroubleshooter && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/90 backdrop-blur-xl">
          <div className="glass-panel max-w-2xl w-full p-8 rounded-[40px] border-2 border-rose-500/50 shadow-[0_0_50px_rgba(244,63,94,0.3)]">
            <h2 className="text-3xl font-black text-white italic uppercase tracking-tighter mb-4 flex items-center gap-3">
              <span className="w-3 h-3 bg-rose-500 rounded-full animate-ping"></span>
              Critical Sync Loop Detected
            </h2>
            <p className="text-slate-400 text-sm leading-relaxed mb-8">
              리포지토리를 삭제 후 재생성하여 구글 AI 스튜디오와의 연동 ID가 꼬였습니다. 로그인을 눌러도 깃허브 설정창만 나오는 이유는 **새로 만든 리포지토리에 대한 접근 권한**이 아직 허용되지 않았기 때문입니다.
            </p>
            
            <div className="space-y-4 mb-8">
              <div className="bg-white/5 p-4 rounded-2xl border border-white/10">
                <p className="text-[10px] font-black text-rose-500 uppercase mb-2">Step 1: 깃허브 설정창 확인</p>
                <p className="text-xs text-slate-300">튕겨나온 깃허브 설정 페이지 하단 <strong>"Repository access"</strong> 섹션을 보세요.</p>
              </div>
              <div className="bg-white/5 p-4 rounded-2xl border border-white/10">
                <p className="text-[10px] font-black text-rose-500 uppercase mb-2">Step 2: 리포지토리 재선택</p>
                <p className="text-xs text-slate-300"><strong>"Only select repositories"</strong>에서 새로 만든 리포지토리를 직접 체크하거나, <strong>"All repositories"</strong>로 변경 후 [Save]를 누르세요.</p>
              </div>
              <div className="bg-emerald-500/10 p-4 rounded-2xl border border-emerald-500/30">
                <p className="text-[10px] font-black text-emerald-500 uppercase mb-2">Step 3: AI 스튜디오 새로고침</p>
                <p className="text-xs text-slate-300">깃허브에서 저장 후 다시 AI 스튜디오로 돌아와 브라우저를 <strong>새로고침(F5)</strong> 하면 루프가 해결됩니다.</p>
              </div>
            </div>

            <div className="flex gap-4">
              <button 
                onClick={() => window.location.reload()}
                className="flex-1 py-4 bg-emerald-600 text-white rounded-2xl text-[11px] font-black uppercase tracking-widest shadow-xl shadow-emerald-900/20 hover:scale-105 transition-all"
              >
                I fixed it, Refresh Now
              </button>
              <button 
                onClick={() => window.aistudio.openSelectKey()}
                className="px-8 py-4 bg-slate-800 text-slate-300 rounded-2xl text-[11px] font-black uppercase tracking-widest border border-white/5"
              >
                Retry Login
              </button>
            </div>
          </div>
        </div>
      )}

      {/* GLOBAL STATUS HEADER */}
      <div className={`flex items-center glass-panel px-5 py-3 rounded-2xl border-white/5 text-[9px] font-black uppercase tracking-widest text-slate-400 overflow-x-auto no-scrollbar whitespace-nowrap`}>
        <div className="flex items-center space-x-3 mr-8 shrink-0">
          <div className="w-2 h-2 rounded-full bg-emerald-400"></div>
          <span className="text-emerald-400">System: RECOVERY_NODE_V4</span>
        </div>
        <div className="flex items-center space-x-3 mr-8 shrink-0">
          <div className={`w-2 h-2 rounded-full ${isGdriveConnected ? 'bg-emerald-500' : 'bg-slate-700'}`}></div>
          <span>Cloud_Vault: {isGdriveConnected ? 'Synced' : 'N/A'}</span>
        </div>
        <div className="ml-auto flex items-center gap-4">
             <span className="opacity-40">Status: {showTroubleshooter ? 'Awaiting_Manual_Sync' : 'Operational'}</span>
             <a href={GITHUB_REPO} className="px-3 py-1 bg-white/5 hover:bg-white/10 rounded border border-white/5">Source</a>
        </div>
      </div>

      <header className="flex flex-col md:flex-row justify-between items-start md:items-end py-4 gap-6">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.5em] mb-2 italic text-rose-500">Recovery_Node Active</p>
          <div className="flex items-center gap-5">
             <h1 className="text-3xl sm:text-4xl md:text-6xl font-black tracking-tighter text-white italic uppercase leading-none">US_Alpha_Seeker</h1>
             {isAutoPilotRunning && <span className="px-4 py-1.5 bg-rose-600 text-white text-[11px] font-black uppercase rounded-lg animate-pulse shadow-2xl">MIRROR ACTIVE</span>}
          </div>
        </div>

        <div className="flex items-center gap-6">
            <div className={`glass-panel px-6 py-3 rounded-2xl border flex flex-col justify-center items-end min-w-[200px] transition-all duration-500 ${isAutoPilotRunning ? 'border-rose-500 bg-rose-950/20' : 'border-blue-500/30'}`}>
               <div className="flex items-center gap-3 mb-1">
                   <span className={`text-[9px] font-black uppercase ${isAutoPilotRunning ? 'text-rose-400 animate-pulse' : 'text-slate-500'}`}>
                       {autoStatusMessage}
                   </span>
                   <button onClick={toggleViewMode} className={`w-11 h-6 rounded-full transition-colors relative flex items-center border ${isAutoPilotRunning ? 'bg-rose-600 border-rose-400 shadow-[0_0_15px_rgba(225,29,72,0.4)]' : 'bg-slate-800 border-slate-600'}`}>
                       <div className={`absolute w-4 h-4 bg-white rounded-full transition-all shadow-md ${isAutoPilotRunning ? 'left-6' : 'left-1'}`}></div>
                   </button>
               </div>
               <span className="text-[8px] font-bold text-slate-600 uppercase tracking-tighter">Hybrid Alpha Pipeline</span>
            </div>
        </div>
      </header>

      <div className="space-y-4">
        <div className="flex gap-3 overflow-x-auto no-scrollbar pb-2 px-1 scroll-smooth">
          {apiStatuses.map(status => (
            <ApiStatusCard key={status.provider} status={status} isAuthConnected={status.isConnected} />
          ))}
        </div>
        <MarketTicker />
      </div>

      <nav className="flex space-x-2 overflow-x-auto no-scrollbar py-2">
        {STAGES_FLOW.map((stage) => (
          <button
            key={stage.id}
            onClick={() => setCurrentStage(stage.id)}
            disabled={isAutoPilotRunning}
            className={`flex-shrink-0 px-6 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all border ${
              isAutoPilotRunning ? 'opacity-30 cursor-not-allowed' :
              currentStage === stage.id ? 'bg-blue-600 text-white border-blue-400 shadow-2xl scale-105 z-10' : 'bg-slate-800/20 text-slate-500 border-white/5 hover:bg-slate-800/40'
            }`}
          >
            {stage.label}
          </button>
        ))}
      </nav>

      <main className="min-h-[500px]">
        <div style={{ display: currentStage === 0 ? 'block' : 'none' }}>
          <UniverseGathering 
            isActive={currentStage === 0} 
            apiStatuses={apiStatuses}
            onAuthSuccess={(status) => { setIsGdriveConnected(status); refreshApiStatuses(); }}
            onStockSelected={setSelectedStock}
            autoStart={isAutoPilotRunning && currentStage === 0}
          />
        </div>
        <div style={{ display: currentStage === 6 ? 'block' : 'none' }}>
          <AlphaAnalysis 
            selectedBrain={selectedBrain} 
            setSelectedBrain={setSelectedBrain}
            onStockSelected={setSelectedStock}
          />
        </div>
        {currentStage > 0 && currentStage < 6 && (
            <div className="flex flex-col items-center justify-center py-20 opacity-30 text-center">
                <p className="text-xl font-black uppercase tracking-[0.5em] italic">Pipeline stage {currentStage} online</p>
                <p className="text-[10px] mt-2">Ready for strategic data ingestion</p>
            </div>
        )}
      </main>
    </div>
  );
};

export default App;
