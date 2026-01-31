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

/**
 * Main Application Component
 * Orchestrates the US Alpha Seeker pipeline stages and manages global state.
 */
const App: React.FC = () => {
  const [apiStatuses, setApiStatuses] = useState<(ApiStatus & { category: string })[]>([]);
  const [currentStage, setCurrentStage] = useState(0);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [isGdriveConnected, setIsGdriveConnected] = useState(!!sessionStorage.getItem('gdrive_access_token'));
  const [isProd, setIsProd] = useState(false);
  
  // --- HYBRID MODE STATE ---
  const [viewMode, setViewMode] = useState<'MANUAL' | 'AUTO'>('MANUAL');
  const [isAutoPilotRunning, setIsAutoPilotRunning] = useState(false);
  const [autoStatusMessage, setAutoStatusMessage] = useState("SYSTEM STANDBY");
  
  // AI Usage State
  const [aiUsage, setAiUsage] = useState<any>({ 
    gemini: { tokens: 0, requests: 0, status: 'OK', lastError: '' }, 
    perplexity: { tokens: 0, requests: 0, status: 'OK', lastError: '' } 
  });

  // Drive Usage State
  const [driveUsage, setDriveUsage] = useState<{ limit: number, usage: number, percent: number } | null>(null);
  
  // Data State
  const [finalSymbols, setFinalSymbols] = useState<string[]>([]);
  const [recommendedData, setRecommendedData] = useState<any[] | null>(null);
  
  // Brain State (Defaults changed to GEMINI)
  const [selectedBrain, setSelectedBrain] = useState<ApiProvider>(ApiProvider.GEMINI);
  const [auditBrain, setAuditBrain] = useState<ApiProvider>(ApiProvider.GEMINI);

  // Unified Target State
  const [selectedStock, setSelectedStock] = useState<any | null>(null);
  const [stockAuditCache, setStockAuditCache] = useState<{ [key: string]: string }>({});
  const [analyzingStocks, setAnalyzingStocks] = useState<Set<string>>(new Set());

  // [NEW] GITHUB ACTION HOOK: Check for ?auto=true in URL to start immediately
  useEffect(() => {
      const params = new URLSearchParams(window.location.search);
      if (params.get('auto') === 'true' && isGdriveConnected && viewMode === 'MANUAL') {
          console.log("Headless Automation Triggered via URL");
          toggleViewMode();
      }
  }, [isGdriveConnected]);

  // Stage Completion Handler (Single Run Logic)
  const handleStageComplete = async (stageId: number, reportPayload?: string) => {
      if (viewMode !== 'AUTO' || !isAutoPilotRunning) return;

      const nextStage = stageId + 1;
      
      // Delay transition for visual confirmation
      setTimeout(async () => {
          if (nextStage <= 6) {
              setCurrentStage(nextStage);
              setAutoStatusMessage(`ADVANCING TO STAGE ${nextStage}...`);
          } else {
              // ALL STAGES COMPLETED (Stage 6 finished)
              setIsAutoPilotRunning(false);
              
              if (reportPayload) {
                  setAutoStatusMessage("TRANSMITTING TO TELEGRAM...");
                  const sent = await sendTelegramReport(reportPayload);
                  setAutoStatusMessage(sent ? "ALL PIPELINES EXECUTED." : "TELEGRAM SEND FAILED.");
              } else {
                  setAutoStatusMessage("ALL PIPELINES EXECUTED.");
              }
              
              console.log("✅ Auto Pilot Complete: Alpha Report Processed.");
          }
      }, 3000); 
  };

  const toggleViewMode = () => {
      if (viewMode === 'MANUAL') {
          if (!isGdriveConnected) {
              setAutoStatusMessage("⚠️ CONNECT CLOUD VAULT");
              setTimeout(() => setAutoStatusMessage("SYSTEM STANDBY"), 3000);
              return;
          }
          setViewMode('AUTO');
          setIsAutoPilotRunning(true);
          setAutoStatusMessage("AUTO PILOT ENGAGED");
      } else {
          setViewMode('MANUAL');
          setIsAutoPilotRunning(false);
          setAutoStatusMessage("SYSTEM STANDBY");
      }
  };

  /**
   * Renders the current stage component based on the currentStage state.
   */
  const renderStage = () => {
    const commonProps = {
      isActive: true,
      autoStart: isAutoPilotRunning,
      onComplete: () => handleStageComplete(currentStage)
    };

    switch (currentStage) {
      case 0: return <UniverseGathering {...commonProps} onAuthSuccess={setIsGdriveConnected} apiStatuses={apiStatuses} onStockSelected={setSelectedStock} />;
      case 1: return <PreliminaryFilter {...commonProps} />;
      case 2: return <DeepQualityFilter {...commonProps} />;
      case 3: return <FundamentalAnalysis {...commonProps} />;
      case 4: return <TechnicalAnalysis {...commonProps} />;
      case 5: return <IctAnalysis {...commonProps} />;
      case 6: return <AlphaAnalysis 
                {...commonProps}
                selectedBrain={selectedBrain} 
                setSelectedBrain={setSelectedBrain} 
                onFinalSymbolsDetected={(symbols, data) => {
                    setFinalSymbols(symbols);
                    setRecommendedData(data || null);
                }}
                onStockSelected={setSelectedStock}
                onComplete={(report) => handleStageComplete(6, report)}
              />;
      default: return null;
    }
  };

  // Fixed: Added return statement to satisfy React.FC requirements and fix the reported error.
  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 p-4 md:p-8 font-sans selection:bg-rose-500/30">
      <header className="max-w-[1600px] mx-auto mb-12 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div>
          <div className="flex items-center gap-4 mb-2">
            <h1 className="text-4xl font-black text-white italic tracking-tighter uppercase leading-none">US Alpha Seeker <span className="text-rose-600 text-lg">v2.4.0</span></h1>
            {isAutoPilotRunning && <span className="px-3 py-1 bg-rose-600 text-white text-[10px] font-black rounded-full animate-pulse">AUTO-PILOT ACTIVE</span>}
          </div>
          <MarketTicker />
        </div>
        
        <div className="flex flex-wrap gap-4">
          <div className="flex bg-slate-900/50 p-2 rounded-2xl border border-white/5 gap-2">
            {API_CONFIGS.slice(0, 5).map(config => {
               const status = apiStatuses.find(s => s.provider === config.provider);
               return (
                 <div key={config.provider} className={`w-2 h-2 rounded-full ${status?.isConnected ? 'bg-emerald-500' : 'bg-slate-700'}`} title={config.provider} />
               );
            })}
          </div>
          <button 
            onClick={toggleViewMode}
            className={`px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${isAutoPilotRunning ? 'bg-rose-600 text-white shadow-lg shadow-rose-900/20' : 'bg-slate-800 text-slate-400 border border-white/5'}`}
          >
            {viewMode}: {autoStatusMessage}
          </button>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto space-y-12">
        <nav className="flex flex-wrap gap-3 pb-6 border-b border-white/5 overflow-x-auto no-scrollbar">
          {STAGES_FLOW.map((stage) => (
            <button
              key={stage.id}
              onClick={() => setCurrentStage(stage.id)}
              className={`px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all whitespace-nowrap ${currentStage === stage.id ? 'bg-blue-600 border-blue-400 text-white shadow-xl shadow-blue-900/20' : 'bg-slate-900 border-white/5 text-slate-500 hover:bg-white/5'}`}
            >
              {stage.label}
            </button>
          ))}
        </nav>

        <section className="animate-in fade-in slide-in-from-bottom-4 duration-500">
          {renderStage()}
        </section>
      </main>

      <footer className="max-w-[1600px] mx-auto mt-20 pt-8 border-t border-white/5 flex justify-between items-center opacity-30">
        <p className="text-[10px] font-black uppercase tracking-widest">Neural Quantitative Hedge Fund System</p>
        <a href={GITHUB_REPO} target="_blank" rel="noreferrer" className="text-[10px] font-black uppercase tracking-widest hover:text-white transition-colors">Repository</a>
      </footer>
    </div>
  );
};

// Fixed: Added default export to satisfy module import in index.tsx
export default App;
