
import React, { useState, useEffect } from 'react';
import { ApiProvider, ApiStatus } from './types';
import { API_CONFIGS, STAGES_FLOW } from './constants';
import ApiStatusCard from './components/ApiStatusCard';
import UniverseGathering from './components/UniverseGathering';
import { analyzeCollectionSummary } from './services/geminiService';

const App: React.FC = () => {
  const [apiStatuses, setApiStatuses] = useState<ApiStatus[]>([]);
  const [currentStage, setCurrentStage] = useState(0);
  const [aiReport, setAiReport] = useState<string | null>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [isGdriveConnected, setIsGdriveConnected] = useState(false);

  // 전역적으로 구글 드라이브 연결 상태 감시 (UniverseGathering 컴포넌트와 통신 대용)
  useEffect(() => {
    const checkAuth = () => {
      const hasToken = sessionStorage.getItem('gdrive_access_token');
      setIsGdriveConnected(!!hasToken);
    };
    const interval = setInterval(checkAuth, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const updateStatuses = () => {
      const newStatuses = API_CONFIGS.map(config => {
        const isConnected = config.provider === ApiProvider.GOOGLE_DRIVE ? isGdriveConnected : true;
        return {
          provider: config.provider,
          isConnected: isConnected,
          latency: isConnected ? (Math.floor(Math.random() * 40) + 20) : 0,
          lastChecked: new Date().toLocaleTimeString(),
          limitRemaining: config.provider === ApiProvider.POLYGON ? '98/100' : undefined
        };
      });
      setApiStatuses(newStatuses);
    };

    updateStatuses();
    const interval = setInterval(updateStatuses, 5000);
    return () => clearInterval(interval);
  }, [isGdriveConnected]);

  const runAiAnalysis = async () => {
    setIsAiLoading(true);
    const mockStats = { 
      totalFound: 12450, 
      processed: 9820, 
      failed: 45,
      providerDistribution: { Polygon: '70%', Alpaca: '20%', Others: '10%' }
    };
    const report = await analyzeCollectionSummary(mockStats);
    setAiReport(report);
    setIsAiLoading(false);
  };

  return (
    <div className="min-h-screen pb-20 p-4 md:p-8 space-y-8 max-w-[1600px] mx-auto">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center space-y-4 md:space-y-0">
        <div>
          <div className="flex items-center space-x-2 mb-1">
             <span className="px-2 py-0.5 bg-blue-600/20 text-blue-400 text-[10px] font-bold rounded uppercase tracking-widest border border-blue-500/20">Alpha V1.0</span>
             <span className="text-slate-600 text-[10px] font-bold uppercase tracking-widest">InnocentBae Edition</span>
          </div>
          <h1 className="text-3xl font-black tracking-tight text-white flex items-center italic">
            US_ALPHA_SEEKER
            <span className="ml-2 w-2 h-2 bg-blue-500 rounded-full animate-pulse shadow-[0_0_10px_rgba(59,130,246,0.8)]"></span>
          </h1>
        </div>
        
        <div className="flex items-center space-x-6">
           <div className="hidden lg:flex flex-col items-end">
              <p className="text-[10px] text-slate-500 font-bold uppercase">System Latency (Avg)</p>
              <p className="text-lg font-mono font-bold text-white">
                {Math.floor(apiStatuses.reduce((acc, curr) => acc + curr.latency, 0) / (apiStatuses.length || 1))}ms
              </p>
           </div>
           <div className="flex items-center space-x-4 glass-panel px-4 py-2 rounded-xl border-slate-700/50">
             <div className="text-right">
               <p className="text-[10px] text-slate-500 font-bold uppercase">Authorized Manager</p>
               <p className="text-sm font-bold text-slate-200">InnocentBae</p>
             </div>
             <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center text-white font-bold border-2 border-slate-700 shadow-xl shadow-blue-500/10">
               IB
             </div>
           </div>
        </div>
      </header>

      <div className="relative">
         <div className="absolute inset-0 bg-blue-500/5 blur-3xl pointer-events-none"></div>
         <nav className="relative flex overflow-x-auto pb-4 space-x-3 scrollbar-hide no-scrollbar">
           {STAGES_FLOW.map((stage) => (
             <button
               key={stage.id}
               onClick={() => setCurrentStage(stage.id)}
               className={`flex-shrink-0 px-8 py-3 rounded-xl text-xs font-bold uppercase tracking-widest transition-all duration-300 border ${
                 currentStage === stage.id
                   ? 'bg-blue-600 text-white border-blue-400 shadow-2xl shadow-blue-600/30'
                   : 'bg-slate-800/50 text-slate-500 border-slate-700 hover:bg-slate-700 hover:text-slate-300 hover:border-slate-600'
               }`}
             >
               {stage.label}
             </button>
           ))}
         </nav>
      </div>

      <section>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 xl:grid-cols-9 gap-3">
          {apiStatuses.map((status) => (
            <ApiStatusCard 
              key={status.provider} 
              status={status} 
              isAuthConnected={status.provider === ApiProvider.GOOGLE_DRIVE ? isGdriveConnected : true} 
            />
          ))}
        </div>
      </section>

      <main className="animate-in fade-in slide-in-from-bottom-4 duration-700">
        {currentStage === 0 ? (
          <UniverseGathering onAuthSuccess={(status) => setIsGdriveConnected(status)} />
        ) : (
          <div className="glass-panel p-24 rounded-3xl border-dashed border-2 border-slate-700 flex flex-col items-center justify-center text-center">
            <div className="p-6 bg-slate-800/80 rounded-full mb-6 border border-slate-700 shadow-inner">
               <svg className="w-16 h-16 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
               </svg>
            </div>
            <h2 className="text-2xl font-black text-slate-400 uppercase tracking-widest italic">Stage {currentStage} Pending</h2>
            <p className="text-slate-500 max-w-lg mt-3 font-medium leading-relaxed">
               The pipeline is currently focused on <span className="text-blue-400 font-bold">Stage 0: Universe Gathering</span>. 
            </p>
          </div>
        )}
      </main>

      <section className="glass-panel p-8 rounded-2xl border-t-4 border-t-emerald-500 shadow-2xl shadow-emerald-900/10">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 space-y-4 md:space-y-0">
          <div className="flex items-center space-x-4">
             <div className="bg-emerald-500/10 p-3 rounded-2xl border border-emerald-500/20">
                <svg className="w-6 h-6 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
             </div>
             <div>
                <h3 className="font-black text-white uppercase text-lg tracking-tight">Gemini AI Audit</h3>
                <p className="text-xs text-slate-500 font-bold uppercase tracking-widest">Universe Integrity & Ticker Coverage Report</p>
             </div>
          </div>
          <button 
            onClick={runAiAnalysis}
            disabled={isAiLoading}
            className={`px-6 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all border ${
              isAiLoading 
              ? 'bg-slate-800 text-slate-600 border-slate-700 cursor-not-allowed' 
              : 'bg-emerald-600 text-white border-emerald-400 hover:bg-emerald-500 shadow-lg shadow-emerald-600/20'
            }`}
          >
            {isAiLoading ? 'Synthesizing...' : 'Re-Analyze Pipeline'}
          </button>
        </div>
        
        <div className="bg-slate-900/80 p-6 rounded-2xl border border-slate-800 shadow-inner">
          {aiReport ? (
            <div className="prose prose-invert max-w-none">
               <div className="text-sm leading-relaxed text-slate-300 font-medium whitespace-pre-line">
                 {aiReport}
               </div>
            </div>
          ) : (
            <div className="flex flex-col items-center py-12 text-slate-500">
               <svg className="w-12 h-12 mb-4 text-slate-700 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
               </svg>
               <p className="text-sm font-bold uppercase tracking-widest">Awaiting AI Intelligence Input</p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
};

export default App;
