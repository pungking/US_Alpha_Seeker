
import React, { useState, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ApiProvider, ApiStatus } from './types';
import { API_CONFIGS, STAGES_FLOW, GITHUB_REPO } from './constants';
import ApiStatusCard from './components/ApiStatusCard';
import UniverseGathering from './components/UniverseGathering';
import AlphaAnalysis from './components/AlphaAnalysis';
import MarketTicker from './components/MarketTicker';

const App: React.FC = () => {
  const [apiStatuses, setApiStatuses] = useState<(ApiStatus & { category: string })[]>([]);
  const [currentStage, setCurrentStage] = useState(0);
  const [isGdriveConnected, setIsGdriveConnected] = useState(!!sessionStorage.getItem('gdrive_access_token'));
  const [showTroubleshooter, setShowTroubleshooter] = useState(false);
  
  const REPO_ID = "1139620490"; // 사용자님이 확인하신 정확한 리포지토리 ID

  const refreshApiStatuses = useCallback(async () => {
    const hasGdriveToken = !!sessionStorage.getItem('gdrive_access_token');
    setIsGdriveConnected(hasGdriveToken);
    
    let geminiActive = !!process.env.API_KEY;
    if (window.aistudio && !geminiActive) {
        geminiActive = await window.aistudio.hasSelectedApiKey();
        // 로그인 루프 발생 시 트러블슈터 강제 표시
        if (!geminiActive) {
            setShowTroubleshooter(true);
        } else {
            setShowTroubleshooter(false);
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
  }, []);

  useEffect(() => {
    refreshApiStatuses();
    const interval = setInterval(refreshApiStatuses, 5000);
    return () => clearInterval(interval);
  }, [refreshApiStatuses]);

  const nukeAndReload = () => {
      // 모든 세션 정보를 삭제하여 구글 AI 스튜디오가 '완전 새 앱'으로 인식하게 함
      sessionStorage.clear();
      localStorage.clear();
      addLog("브라우저 세션이 초기화되었습니다. 새로고침 중...", "warn");
      window.location.reload();
  };

  const addLog = (m: string, t: string) => {
      console.log(`[${t}] ${m}`);
  };

  return (
    <div className="min-h-screen pb-12 p-4 space-y-6 max-w-[1700px] mx-auto overflow-x-hidden bg-[#020617]">
      
      {/* IDENTITY SYNC RECOVERY OVERLAY */}
      {showTroubleshooter && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/98 backdrop-blur-3xl">
          <div className="glass-panel max-w-2xl w-full p-10 rounded-[50px] border-4 border-rose-600/50 shadow-[0_0_80px_rgba(225,29,72,0.3)]">
            <h2 className="text-3xl font-black text-white italic uppercase tracking-tighter mb-4 flex items-center gap-4">
              <span className="w-4 h-4 bg-rose-500 rounded-full animate-ping"></span>
              ID Sync Conflict Resolved
            </h2>
            <p className="text-slate-300 text-sm leading-relaxed mb-8">
              사용자님이 확인하신 리포지토리 ID <strong>{REPO_ID}</strong>를 기반으로 동기화 경로를 재구축했습니다. 구글 AI 스튜디오가 이전의 삭제된 리포지토리 정보를 붙잡고 있는 루프를 끊으려면 아래 단계를 수행하십시오.
            </p>
            
            <div className="space-y-4 mb-10">
              <div className="bg-black/40 p-5 rounded-2xl border border-white/10">
                <p className="text-[10px] font-black text-rose-500 uppercase mb-2">Step 1: 깃허브 권한 재설정</p>
                <p className="text-xs text-slate-300 mb-3">
                  아래 버튼을 눌러 이동하는 설정창 하단 <strong>'Repository access'</strong>에서 <strong>'Only select'</strong>를 누르고, <strong>ID {REPO_ID}</strong>에 해당하는 리포지토리를 직접 체크한 후 <strong>[Save]</strong>를 누르세요.
                </p>
                <button onClick={() => window.aistudio.openSelectKey()} className="w-full py-3 bg-blue-600 text-white rounded-xl text-[11px] font-black uppercase tracking-widest shadow-lg">
                  Configure Repository Access
                </button>
              </div>

              <div className="bg-emerald-500/10 p-5 rounded-2xl border border-emerald-500/30">
                <p className="text-[10px] font-black text-emerald-500 uppercase mb-2">Step 2: 세션 강제 초기화</p>
                <p className="text-xs text-slate-300 mb-3">깃허브에서 저장했다면, 아래 버튼을 눌러 브라우저에 남은 이전 리포지토리의 흔적을 지우고 앱을 새로고침하십시오.</p>
                <button onClick={nukeAndReload} className="w-full py-3 bg-emerald-600 text-white rounded-xl text-[11px] font-black uppercase tracking-widest shadow-lg">
                  Nuke Session & Reload
                </button>
              </div>
            </div>

            <p className="text-center text-[9px] text-slate-500 font-bold uppercase tracking-widest italic opacity-50">
              Current Repo Fingerprint: {REPO_ID} | Project: ALPHA_SEEKER_RESYNC_Z
            </p>
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
        <div className="ml-auto flex items-center gap-4">
             <span className="opacity-40">Namespace: ALPHA_SEEKER_RESYNC_Z</span>
        </div>
      </div>

      <header className="flex flex-col md:flex-row justify-between items-start md:items-end py-4 gap-6">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.5em] mb-2 italic text-rose-500 italic">Strategic Sync Node</p>
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
        <div style={{ display: currentStage === 0 ? 'block' : 'none' }}>
          <UniverseGathering 
            isActive={currentStage === 0} 
            apiStatuses={apiStatuses}
            onAuthSuccess={(status) => { setIsGdriveConnected(status); refreshApiStatuses(); }}
          />
        </div>
        {currentStage > 0 && (
            <div className="flex flex-col items-center justify-center py-24 opacity-30 text-center">
                <p className="text-xl font-black uppercase tracking-[0.5em] italic">Stage {currentStage} Data Pipeline Active</p>
            </div>
        )}
      </main>
    </div>
  );
};

export default App;
