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

const App: React.FC = () => {
  const [apiStatuses, setApiStatuses] = useState<(ApiStatus & { category: string })[]>([]);
  const [currentStage, setCurrentStage] = useState(0);
  const [isGdriveConnected, setIsGdriveConnected] = useState(!!sessionStorage.getItem('gdrive_access_token'));
  const [showTroubleshooter, setShowTroubleshooter] = useState(false);
  const [selectedBrain, setSelectedBrain] = useState<ApiProvider>(ApiProvider.GEMINI);
  
  const REPO_ID = "1139620490"; // 사용자님의 정확한 리포지토리 ID

  const refreshApiStatuses = useCallback(async () => {
    const hasGdriveToken = !!sessionStorage.getItem('gdrive_access_token');
    setIsGdriveConnected(hasGdriveToken);
    
    let geminiActive = !!process.env.API_KEY;
    if (window.aistudio && !geminiActive) {
        geminiActive = await window.aistudio.hasSelectedApiKey();
        // 로그인 루프 발생 시 (hasSelectedApiKey가 계속 false인 경우) 트러블슈터 표시
        if (!geminiActive && currentStage === 6) {
            setShowTroubleshooter(true);
        }
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
          latency: isConnected ? Math.floor(Math.random() * 5) + 2 : 0,
          lastChecked: new Date().toLocaleTimeString()
        };
      });
    });
  }, [currentStage]);

  useEffect(() => {
    refreshApiStatuses();
    const interval = setInterval(refreshApiStatuses, 5000);
    return () => clearInterval(interval);
  }, [refreshApiStatuses]);

  const nukeAndReload = () => {
      sessionStorage.clear();
      localStorage.clear();
      window.location.reload();
  };

  return (
    <div className="min-h-screen pb-12 p-4 space-y-6 max-w-[1700px] mx-auto overflow-x-hidden bg-[#020617]">
      
      {/* IDENTITY SYNC RECOVERY OVERLAY - 오직 문제 발생시에만 팝업 */}
      {showTroubleshooter && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/98 backdrop-blur-3xl">
          <div className="glass-panel max-w-2xl w-full p-10 rounded-[50px] border-4 border-rose-600/50 shadow-[0_0_80px_rgba(225,29,72,0.3)]">
            <h2 className="text-3xl font-black text-white italic uppercase tracking-tighter mb-4 flex items-center gap-4">
              <span className="w-4 h-4 bg-rose-500 rounded-full animate-ping"></span>
              Identity Sync Required
            </h2>
            <p className="text-slate-300 text-sm leading-relaxed mb-8">
              사용자님의 리포지토리 ID <strong>{REPO_ID}</strong> 연동을 완료해야 합니다. 아래 단계를 순서대로 클릭하세요.
            </p>
            
            <div className="space-y-4 mb-10">
              <div className="bg-black/40 p-5 rounded-2xl border border-white/10">
                <p className="text-[10px] font-black text-rose-500 uppercase mb-2">Step 1: 깃허브 권한 설정</p>
                <p className="text-xs text-slate-400 mb-3">설정창 하단 'Only select'에서 ID {REPO_ID} 리포지토리를 체크하고 Save 하세요.</p>
                <button onClick={() => window.aistudio.openSelectKey()} className="w-full py-3 bg-blue-600 text-white rounded-xl text-[11px] font-black uppercase tracking-widest">
                  Configure Repository Access
                </button>
              </div>
              <div className="bg-emerald-500/10 p-5 rounded-2xl border border-emerald-500/30">
                <p className="text-[10px] font-black text-emerald-500 uppercase mb-2">Step 2: 세션 초기화</p>
                <button onClick={nukeAndReload} className="w-full py-3 bg-emerald-600 text-white rounded-xl text-[11px] font-black uppercase tracking-widest">
                  Nuke Session & Reload
                </button>
              </div>
            </div>
            <button onClick={() => setShowTroubleshooter(false)} className="w-full text-[9px] text-slate-500 uppercase font-black hover:text-white transition-colors">Close Troubleshooter</button>
          </div>
        </div>
      )}

      {/* HEADER SECTION */}
      <div className="flex items-center glass-panel px-5 py-3 rounded-2xl border-white/5 text-[9px] font-black uppercase tracking-widest text-slate-400 overflow-x-auto no-scrollbar whitespace-nowrap">
        <div className="flex items-center space-x-3 mr-8 shrink-0">
          <div className="w-2 h-2 rounded-full bg-emerald-400"></div>
          <span className="text-emerald-400">Node ID: {REPO_ID}</span>
        </div>
        <div className="flex items-center space-x-3 mr-8 shrink-0">
          <div className={`w-2 h-2 rounded-full ${isGdriveConnected ? 'bg-emerald-500' : 'bg-slate-700'}`}></div>
          <span>Cloud_Vault: {isGdriveConnected ? 'Synced' : 'N/A'}</span>
        </div>
        <button onClick={() => setShowTroubleshooter(true)} className="text-rose-500 hover:text-rose-400 transition-colors ml-4">Sync Tool</button>
        <div className="ml-auto flex items-center gap-4">
             <span className="opacity-40">Namespace: MASTER_NODE_V7</span>
        </div>
      </div>

      <header className="flex flex-col md:flex-row justify-between items-start md:items-end py-4 gap-6">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.5em] mb-2 italic text-rose-500">Alpha_Seeker Intelligence Pipeline</p>
          <div className="flex items-center gap-5">
             <h1 className="text-3xl sm:text-4xl md:text-6xl font-black tracking-tighter text-white italic uppercase leading-none">US_Alpha_Seeker</h1>
          </div>
        </div>
      </header>

      <div className="space-y-4">
        <div className="flex gap-3 overflow-x-auto no-scrollbar pb-2 px-1">
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
            className={`flex-shrink-0 px-6 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all border ${
              currentStage === stage.id ? 'bg-blue-600 text-white border-blue-400 shadow-2xl scale-105 z-10' : 'bg-slate-800/20 text-slate-500 border-white/5 hover:bg-slate-800/40'
            }`}
          >
            {stage.label}
          </button>
        ))}
      </nav>

      <main className="min-h-[500px]">
        {currentStage === 0 && <UniverseGathering isActive={true} apiStatuses={apiStatuses} onAuthSuccess={(s) => { setIsGdriveConnected(s); refreshApiStatuses(); }} />}
        {currentStage === 1 && <PreliminaryFilter />}
        {currentStage === 2 && <DeepQualityFilter />}
        {currentStage === 3 && <FundamentalAnalysis />}
        {currentStage === 4 && <TechnicalAnalysis />}
        {currentStage === 5 && <IctAnalysis />}
        {currentStage === 6 && <AlphaAnalysis selectedBrain={selectedBrain} setSelectedBrain={setSelectedBrain} />}
      </main>
    </div>
  );
};

export default App;
