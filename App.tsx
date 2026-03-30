
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
import PerformanceDashboard from './components/PerformanceDashboard';
import LegalDocs from './components/LegalDocs';
import RenderGuard from './components/RenderGuard';
import { analyzePipelineStatus, archiveReport } from './services/intelligenceService';
import { sendTelegramReport } from './services/telegramService';

const AUTO_CONTROL_PREFIX = "__AUTO_CONTROL__:";
const AUTO_TERMINAL_MESSAGES = new Set([
  "ALL PIPELINES EXECUTED.",
  "TELEGRAM SEND FAILED.",
  "AUTO ABORTED: INTEGRITY GATE BLOCKED.",
  "AUTO ABORTED: BRIEF GENERATION FAILED.",
  "AUTO ABORTED: NO CANDIDATES.",
  "AUTO ABORTED: AI FAILED NO REPORT.",
  "AUTO ABORTED: STAGE6 FAILED."
]);

// Markdown Components for ReactMarkdown
const MarkdownComponents: any = {
  p: (props: any) => <p className="mb-2 text-slate-300 leading-relaxed text-[11px]" {...props} />,
  ul: (props: any) => <ul className="list-disc pl-4 mb-2 space-y-1" {...props} />,
  li: (props: any) => <li className="text-slate-300 text-[11px]" {...props} />,
  strong: (props: any) => <strong className="text-emerald-400 font-bold" {...props} />,
  h1: (props: any) => <h1 className="text-sm font-bold text-white mb-2" {...props} />,
  h2: (props: any) => <h2 className="text-xs font-bold text-white mb-1" {...props} />,
  h3: (props: any) => <h3 className="text-xs font-bold text-blue-400 mb-1" {...props} />,
  blockquote: (props: any) => <blockquote className="border-l-4 border-emerald-500/50 pl-4 py-2 my-2 bg-emerald-900/10 italic text-slate-400 text-xs" {...props} />,
  code: ({inline, ...props}: any) => inline 
    ? <code className="bg-slate-800 text-emerald-300 px-1 py-0.5 rounded font-mono text-[10px] border border-white/10" {...props} />
    : <div className="overflow-x-auto my-3"><pre className="bg-slate-950 p-3 rounded-xl border border-white/10 text-[10px] text-slate-300 font-mono" {...props} /></div>,
};

const App: React.FC = () => {
  const [apiStatuses, setApiStatuses] = useState<(ApiStatus & { category: string })[]>([]);
  const [currentStage, setCurrentStage] = useState(0);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [isGdriveConnected, setIsGdriveConnected] = useState(!!sessionStorage.getItem('gdrive_access_token'));
  const [isProd, setIsProd] = useState(false);
  
  // --- CLOCK STATE (Restored) ---
  const [currentTime, setCurrentTime] = useState(new Date());

  // --- HYBRID MODE STATE ---
  const [viewMode, setViewMode] = useState<'MANUAL' | 'AUTO'>('MANUAL');
  const [isAutoPilotRunning, setIsAutoPilotRunning] = useState(false);
  const [autoStatusMessage, setAutoStatusMessage] = useState("SYSTEM STANDBY");
  
  // Legal Docs State
  const [showLegalDocs, setShowLegalDocs] = useState(false);
  const [initialLegalTab, setInitialLegalTab] = useState<'privacy' | 'terms'>('privacy');

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

  // [NEW] GITHUB ACTION HOOK & LEGAL DOC HOOK
  useEffect(() => {
      const params = new URLSearchParams(window.location.search);
      
      // 1. Check for Automation Trigger
      if (params.get('auto') === 'true' && isGdriveConnected && viewMode === 'MANUAL') {
          console.log("Headless Automation Triggered via URL");
          toggleViewMode();
      }

      // 2. Check for Legal Docs Link (Google Verification Support)
      const docType = params.get('doc');
      if (docType === 'privacy' || docType === 'terms') {
          setInitialLegalTab(docType);
          setShowLegalDocs(true);
      }
  }, [isGdriveConnected]);

  // CLOCK TICKER (Restored)
  useEffect(() => {
      const timer = setInterval(() => setCurrentTime(new Date()), 1000);
      return () => clearInterval(timer);
  }, []);

  // Headless automation sync flag
  useEffect(() => {
      const win = window as any;
      win.__AUTO_STATUS = autoStatusMessage;
      const stageMeta = STAGES_FLOW.find((s) => s.id === currentStage);
      win.__AUTO_PROGRESS = {
          mode: viewMode,
          auto: isAutoPilotRunning,
          stageId: currentStage,
          stageLabel: stageMeta?.label || `Stage ${currentStage}`,
          status: autoStatusMessage,
          updatedAt: new Date().toISOString()
      };
      if (AUTO_TERMINAL_MESSAGES.has(autoStatusMessage)) {
          win.__AUTO_DONE = autoStatusMessage;
      }
  }, [autoStatusMessage, currentStage, viewMode, isAutoPilotRunning]);

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
              const controlPayload = String(reportPayload || '');
              const isControlMessage =
                  controlPayload.startsWith(AUTO_CONTROL_PREFIX) ||
                  controlPayload === "NO_CANDIDATES" ||
                  controlPayload === "AI_FAILED_NO_REPORT" ||
                  controlPayload === "STAGE6_FAILED";

              if (isControlMessage) {
                  const controlCode = controlPayload.startsWith(AUTO_CONTROL_PREFIX)
                      ? controlPayload.slice(AUTO_CONTROL_PREFIX.length)
                      : controlPayload;

                  if (controlCode === "INTEGRITY_GATE_BLOCKED") {
                      setAutoStatusMessage("AUTO ABORTED: INTEGRITY GATE BLOCKED.");
                  } else if (controlCode === "BRIEF_GENERATION_FAILED") {
                      setAutoStatusMessage("AUTO ABORTED: BRIEF GENERATION FAILED.");
                  } else if (controlCode === "NO_CANDIDATES") {
                      setAutoStatusMessage("AUTO ABORTED: NO CANDIDATES.");
                  } else if (controlCode === "AI_FAILED_NO_REPORT") {
                      setAutoStatusMessage("AUTO ABORTED: AI FAILED NO REPORT.");
                  } else if (controlCode === "STAGE6_FAILED") {
                      setAutoStatusMessage("AUTO ABORTED: STAGE6 FAILED.");
                  } else {
                      setAutoStatusMessage("AUTO ABORTED: STAGE6 FAILED.");
                  }
              } else if (reportPayload) {
                  setAutoStatusMessage("TRANSMITTING TO TELEGRAM...");
                  const sent = await sendTelegramReport(reportPayload);
                  setAutoStatusMessage(sent ? "ALL PIPELINES EXECUTED." : "TELEGRAM SEND FAILED.");
              } else {
                  setAutoStatusMessage("ALL PIPELINES EXECUTED.");
              }
              
              // [UX UPDATE] Auto Disengage & Toggle Off
              setIsAutoPilotRunning(false);
              setViewMode('MANUAL');
              
              console.log("✅ Auto Pilot Complete: Alpha Report Processed.");
          }
      }, 3000); 
  };

  const toggleViewMode = () => {
      if (viewMode === 'MANUAL') {
          if (!isGdriveConnected) {
              // [UX UPGRADE] Replaced alert with inline status warning
              setAutoStatusMessage("⚠️ CONNECT CLOUD VAULT");
              setTimeout(() => setAutoStatusMessage("SYSTEM STANDBY"), 3000);
              return;
          }
          
          // [MODIFIED] Removed 'confirm' dialog to support seamless Headless Automation
          setViewMode('AUTO');
          setIsAutoPilotRunning(true);
          setCurrentStage(0);
          setAutoStatusMessage("AUTO PILOT ENGAGED");
          (window as any).__AUTO_DONE = "";
          (window as any).__STAGE6_DISPATCH_INFO = null;
          
      } else {
          setViewMode('MANUAL');
          setIsAutoPilotRunning(false);
          setAutoStatusMessage("MANUAL OVERRIDE");
          (window as any).__AUTO_DONE = "";
          (window as any).__STAGE6_DISPATCH_INFO = null;
          setTimeout(() => setAutoStatusMessage("SYSTEM STANDBY"), 2000);
      }
  };

  // Cleanup on Stage Change
  useEffect(() => {
    // Keep selection persistence
  }, [currentStage]);

  useEffect(() => {
    setAuditBrain(selectedBrain);
  }, [selectedBrain]);

  const loadUsageStats = () => {
      const raw = sessionStorage.getItem('US_ALPHA_SEEKER_AI_USAGE');
      if (raw) {
          try {
              setAiUsage(JSON.parse(raw));
          } catch(e) {}
      }
  };

  const formatBytes = (bytes: number, decimals = 1) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  };

  const fetchDriveQuota = async () => {
      const token = sessionStorage.getItem('gdrive_access_token');
      if (!token) {
          setDriveUsage(null);
          return;
      }
      try {
          const res = await fetch('https://www.googleapis.com/drive/v3/about?fields=storageQuota', {
              headers: { 'Authorization': `Bearer ${token}` }
          });
          if (res.ok) {
              const data = await res.json();
              if (data.storageQuota) {
                  const limit = parseInt(data.storageQuota.limit || '0');
                  const usage = parseInt(data.storageQuota.usage || '0');
                  const percent = limit > 0 ? (usage / limit) * 100 : 0;
                  setDriveUsage({ limit, usage, percent });
              }
          }
      } catch (e) {
          console.error("Drive Quota Fetch Error", e);
      }
  };

  const refreshApiStatuses = useCallback(async () => {
    const hasGdriveToken = !!sessionStorage.getItem('gdrive_access_token');
    setIsGdriveConnected(hasGdriveToken);
    let geminiActive = !!API_CONFIGS.find(c => c.provider === ApiProvider.GEMINI)?.key;
    if (window.aistudio && !geminiActive) geminiActive = await window.aistudio.hasSelectedApiKey();
    if (!geminiActive) {
      const geminiConfig = API_CONFIGS.find(c => c.provider === ApiProvider.GEMINI);
      geminiActive = !!geminiConfig?.key;
    }
    
    // Refresh Usage Stats
    loadUsageStats();

    setApiStatuses(() => {
      const orderedConfigs = [
        ...API_CONFIGS.filter(c => c.category === 'Acquisition'),
        ...API_CONFIGS.filter(c => c.category === 'Intelligence'),
        ...API_CONFIGS.filter(c => c.category === 'Infrastructure')
      ];
      
      const statuses = orderedConfigs.map(config => {
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

      // [MODIFIED] Inject Hybrid Feed Status (Finnhub + Alpaca)
      const acquisitionIndex = statuses.findIndex(s => s.category === 'Acquisition');
      if (acquisitionIndex !== -1) {
          const hasFinnhub = !!API_CONFIGS.find(c => c.provider === ApiProvider.FINNHUB)?.key;
          const hasAlpaca = !!API_CONFIGS.find(c => c.provider === ApiProvider.ALPACA)?.key;
          
          statuses.splice(2, 0, {
              provider: 'Hybrid Feed (FH+ALP)' as any,
              category: 'Acquisition',
              isConnected: hasFinnhub || hasAlpaca,
              latency: 18, // Merged latency
              lastChecked: 'REDUNDANT'
          });
      }
      
      return statuses;
    });
  }, []);

  useEffect(() => {
    setIsProd(window.location.hostname === 'us-alpha-seeker.vercel.app');
    refreshApiStatuses();
    fetchDriveQuota();
    const interval = setInterval(() => {
        refreshApiStatuses();
        if (new Date().getSeconds() < 5) fetchDriveQuota(); 
    }, 5000);
    window.addEventListener('storage-usage-update', loadUsageStats);
    return () => {
        clearInterval(interval);
        window.removeEventListener('storage-usage-update', loadUsageStats);
    };
  }, [refreshApiStatuses]);

  const runStockAudit = async () => {
    if (!selectedStock) return;
    setIsAiLoading(true);
    setAnalyzingStocks(prev => new Set(prev).add(selectedStock.symbol));
    const targetBrain = auditBrain;
    const cacheKey = `${selectedStock.symbol}-${targetBrain}-STAGE${currentStage}`;
    const mode = currentStage === 0 ? 'INTEGRITY_CHECK' : 'SINGLE_STOCK';

    try {
      const report = await analyzePipelineStatus({
        currentStage,
        apiStatuses,
        symbols: [selectedStock.symbol],
        targetStock: selectedStock,
        mode: mode
      }, targetBrain);

      // [AUTO-TOGGLE] Robust Failover Logic
      // Checks for various failure keywords including specific Quota errors
      if (report.includes("AUDIT_FAILURE") || report.includes("ERROR") || report.includes("API Key Missing") || report.includes("QUOTA_EXCEEDED")) {
         // Specifically if Gemini failed with a Quota/Rate Limit error
         if (targetBrain === ApiProvider.GEMINI) {
             console.warn("Gemini Audit Failed/Quota Exceeded. Auto-switching to Sonar for next attempt.");
             
             // 1. Switch UI State ONLY. Do not auto-retry in Manual Audit.
             setAuditBrain(ApiProvider.PERPLEXITY);
         }
      } else {
         // [NEW] Automatic Report Archiving (Only on Success)
         const token = sessionStorage.getItem('gdrive_access_token');
         if (token) {
             const date = new Date().toISOString().split('T')[0];
             const type = currentStage === 0 ? 'Integrity_Check' : 'Deep_Audit';
             const brain = targetBrain === ApiProvider.GEMINI ? 'Gemini' : 'Sonar';
             const fileName = `${date}_${type}_${selectedStock.symbol}_${brain}.md`;
             
             // Fire and forget archive
             archiveReport(token, fileName, report).then(ok => {
                 if(ok) console.log(`[Archive] Report Saved: ${fileName}`);
                 else console.warn(`[Archive] Failed to save report: ${fileName}`);
             });
         }
      }

      setStockAuditCache(prev => ({ ...prev, [cacheKey]: report }));
      
    } catch (err: any) {
      // If the retry itself failed or some other catastrophic error
      if (targetBrain === ApiProvider.GEMINI) {
         setAuditBrain(ApiProvider.PERPLEXITY);
         console.warn("Critical Audit Error. Auto-switching to Sonar.");
      }
      setStockAuditCache(prev => ({ ...prev, [cacheKey]: `### CRITICAL_NODE_ERROR\n> ${err.message}` }));
    } finally {
      setIsAiLoading(false);
      setAnalyzingStocks(prev => {
          const next = new Set(prev);
          next.delete(selectedStock.symbol);
          return next;
      });
      loadUsageStats(); 
    }
  };

  const handleCloseLegalDocs = () => {
      setShowLegalDocs(false);
      // Clean URL params to avoid re-opening on refresh if user wants to use app
      const url = new URL(window.location.href);
      if (url.searchParams.has('doc')) {
          url.searchParams.delete('doc');
          window.history.replaceState({}, '', url);
      }
  };

  const currentReportKey = selectedStock ? `${selectedStock.symbol}-${auditBrain}-STAGE${currentStage}` : '';
  const currentReport = stockAuditCache[currentReportKey];
  const copyReport = () => {
    if (currentReport) {
      navigator.clipboard.writeText(currentReport);
      alert('보고서가 클립보드에 복사되었습니다.');
    }
  };

  const isMirror = viewMode === 'AUTO';
  const showWarning = !isMirror && autoStatusMessage !== "SYSTEM STANDBY";

  return (
    <div className={`min-h-screen pb-10 p-2 sm:p-4 md:p-6 space-y-4 md:space-y-6 max-w-[1600px] mx-auto overflow-x-hidden ${isMirror ? 'border-4 border-rose-600 rounded-xl bg-slate-950' : ''}`}>
      {/* LEGAL DOCS MODAL */}
      {showLegalDocs && <LegalDocs onClose={handleCloseLegalDocs} initialTab={initialLegalTab} />}

      {/* HEADER STATUS BAR */}
      <div className={`flex items-center glass-panel px-4 py-2.5 rounded-xl border-white/5 text-[8px] md:text-[9px] font-black uppercase tracking-widest text-slate-500 overflow-x-auto no-scrollbar whitespace-nowrap ${isMirror ? 'bg-rose-900/10 border-rose-500/30' : ''}`}>
        <div className="flex items-center space-x-2 mr-6 shrink-0">
          <div className={`w-1.5 h-1.5 rounded-full ${isMirror ? 'bg-rose-500 animate-ping' : isProd ? 'bg-emerald-500' : 'bg-blue-500'}`}></div>
          <span className={isMirror ? 'text-rose-500 font-bold' : ''}>{isMirror ? (isAutoPilotRunning ? 'AUTOMATION_RUNNING' : 'AUTOMATION_COMPLETE') : isProd ? 'Production_Node' : 'Development_Node'}</span>
        </div>
        <div className="flex items-center space-x-2 mr-6 shrink-0">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]"></div>
          <span className="text-emerald-400 font-bold">Version: v1.5.3 (Hybrid Feed)</span>
        </div>
        <div className="flex items-center space-x-2 mr-6 shrink-0">
          <div className={`w-1.5 h-1.5 rounded-full ${isGdriveConnected ? 'bg-emerald-500' : 'bg-slate-700'}`}></div>
          <span>Cloud_Vault: {isGdriveConnected ? 'Linked' : 'Disconnected'}</span>
        </div>
        <div className="flex items-center space-x-2 shrink-0">
          <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse"></div>
          <span>Pipeline: Stage_{currentStage}</span>
        </div>
        
        {/* WORLD CLOCKS (RIGHT ALIGNED using ml-auto) */}
        <div className="flex items-center gap-4 px-6 border-l border-white/5 ml-auto mr-6 shrink-0 hidden lg:flex">
             <div className="flex items-center gap-2">
                 <span className="text-[7px] font-black text-slate-500">SEOUL</span>
                 <span className="font-mono text-white text-[9px] font-bold">
                     {currentTime.toLocaleTimeString('en-US', { timeZone: 'Asia/Seoul', hour12: false, hour: '2-digit', minute: '2-digit' })}
                 </span>
             </div>
             <div className="flex items-center gap-2">
                 <span className="text-[7px] font-black text-slate-500">NEW YORK</span>
                 <span className="font-mono text-orange-400 text-[9px] font-bold">
                     {currentTime.toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour12: false, hour: '2-digit', minute: '2-digit' })}
                 </span>
             </div>
        </div>
        
        {/* LEGAL LINKS (Google Compliance - Explicit <a href> tags required) */}
        <div className="flex items-center gap-2 shrink-0 mr-6">
            <a 
                href="?doc=privacy"
                onClick={(e) => { e.preventDefault(); setInitialLegalTab('privacy'); setShowLegalDocs(true); }} 
                className="opacity-50 hover:opacity-100 transition-opacity text-slate-300 hover:text-white cursor-pointer hover:underline underline-offset-2 decoration-slate-500"
            >
                Privacy Policy
            </a>
             <span className="opacity-20 text-slate-500">/</span>
            <a 
                href="?doc=terms"
                onClick={(e) => { e.preventDefault(); setInitialLegalTab('terms'); setShowLegalDocs(true); }} 
                className="opacity-50 hover:opacity-100 transition-opacity text-slate-300 hover:text-white cursor-pointer hover:underline underline-offset-2 decoration-slate-500"
            >
                Terms
            </a>
        </div>

        <a href={GITHUB_REPO} className="opacity-40 hover:opacity-100 transition-opacity shrink-0">Nexus_Source</a>
      </div>

      <header className="flex flex-col md:flex-row justify-between items-start md:items-end py-2 gap-4">
        <div>
          <p className={`text-[8px] md:text-[9px] font-black uppercase tracking-[0.4em] mb-1 italic ${isMirror ? 'text-rose-500' : 'text-blue-500'}`}>US Alpha Seeker Infrastructure</p>
          <div className="flex items-center gap-4">
             <h1 className="text-2xl sm:text-3xl md:text-5xl font-black tracking-tighter text-white italic uppercase leading-tight">US_Alpha_Seeker</h1>
          </div>
          <p className="text-[10px] text-slate-500 mt-1 font-medium tracking-wide animate-pulse text-right">
            © 2026. Created & Designed by Bae Sang Min
          </p>
        </div>

        {/* AI Resource & Drive Monitor Widget */}
        <div className={`glass-panel px-4 py-2.5 rounded-xl border-white/5 flex items-center gap-5 w-full md:w-auto ${isMirror ? 'border-rose-500/20' : ''}`}>
             
             {/* Section 1: AI Brains */}
             <div className="flex flex-col border-r border-white/5 pr-5">
                 <span className="text-[7px] font-black text-slate-500 uppercase tracking-widest mb-1">AI Session Load</span>
                 <div className="flex items-center gap-3">
                     <div className="flex flex-col">
                         <div className="flex items-center gap-1.5">
                             <div className={`w-1.5 h-1.5 rounded-full ${aiUsage.gemini.status === 'OK' ? 'bg-emerald-500' : 'bg-red-500 animate-ping'}`}></div>
                             <span className="text-[8px] font-bold text-slate-300">GEMINI</span>
                         </div>
                         <span className={`text-[9px] font-mono ${aiUsage.gemini.status === 'OK' ? 'text-emerald-400' : 'text-red-400 font-black animate-pulse'}`}>
                             {aiUsage.gemini.status === 'OK' ? `${aiUsage.gemini.tokens.toLocaleString()} Tks` : 'API LIMIT HIT'}
                         </span>
                     </div>
                     <div className="flex flex-col">
                         <div className="flex items-center gap-1.5">
                             <div className={`w-1.5 h-1.5 rounded-full ${aiUsage.perplexity.status === 'OK' ? 'bg-cyan-500' : 'bg-red-500 animate-ping'}`}></div>
                             <span className="text-[8px] font-bold text-slate-300">SONAR</span>
                         </div>
                         <span className={`text-[9px] font-mono ${aiUsage.perplexity.status === 'OK' ? 'text-cyan-400' : 'text-red-400 font-black animate-pulse'}`}>
                             {aiUsage.perplexity.status === 'OK' ? `${aiUsage.perplexity.tokens.toLocaleString()} Tks` : 'API LIMIT HIT'}
                         </span>
                     </div>
                 </div>
             </div>

             {/* Section 2: Vault (Drive) Storage */}
             <div className="flex flex-col min-w-[100px]">
                 <span className="text-[7px] font-black text-slate-500 uppercase tracking-widest mb-1">Vault Storage</span>
                 {driveUsage ? (
                     <div className="flex flex-col gap-1">
                        <div className="flex justify-between items-end">
                            <span className="text-[9px] font-mono font-bold text-white">{formatBytes(driveUsage.usage)}</span>
                            <span className="text-[7px] text-slate-500">/ {formatBytes(driveUsage.limit)}</span>
                        </div>
                        <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                            <div 
                                className={`h-full rounded-full transition-all duration-500 ${driveUsage.percent > 90 ? 'bg-red-500' : driveUsage.percent > 75 ? 'bg-amber-500' : 'bg-blue-500'}`}
                                style={{ width: `${driveUsage.percent}%` }}
                            ></div>
                        </div>
                     </div>
                 ) : (
                     <span className="text-[9px] font-black text-slate-600 uppercase">Not Connected</span>
                 )}
             </div>

        </div>

        {/* HYBRID MODE CONTROLLER */}
        <div className={`glass-panel px-4 py-2.5 rounded-xl border flex flex-col justify-center items-end min-w-[180px] transition-all ${isMirror ? 'border-rose-500 bg-rose-950/20' : showWarning ? 'border-amber-500 bg-amber-950/20' : 'border-blue-500/30'}`}>
           <div className="flex items-center gap-2 mb-1">
               <span className={`text-[8px] font-black uppercase ${isMirror ? (isAutoPilotRunning ? 'text-rose-400 animate-pulse' : 'text-emerald-400') : showWarning ? 'text-amber-500 animate-pulse' : 'text-slate-500'}`}>
                   {isMirror ? autoStatusMessage : (showWarning ? autoStatusMessage : "MANUAL CONTROL")}
               </span>
               <button 
                  onClick={toggleViewMode}
                  className={`w-10 h-5 rounded-full transition-colors relative flex items-center border ${isMirror ? 'bg-rose-600 border-rose-400' : showWarning ? 'bg-amber-600 border-amber-400' : 'bg-slate-800 border-slate-600'}`}
               >
                   <div className={`absolute w-3 h-3 bg-white rounded-full transition-all shadow-md ${isMirror ? 'left-6' : 'left-1'}`}></div>
               </button>
           </div>
           <div className="flex items-center gap-3">
               <span className={`text-[7px] font-black uppercase ${isMirror ? 'text-rose-300' : 'text-slate-500'}`}>{isMirror ? 'Single Pass Mode' : 'Standard Mode'}</span>
           </div>
        </div>
      </header>

      <div className="space-y-4">
        <div className="flex gap-2 md:gap-3 overflow-x-auto no-scrollbar pb-1 px-1 scroll-smooth">
          {apiStatuses.map((status, idx) => (
            <ApiStatusCard key={`${status.provider}-${idx}`} status={status} isAuthConnected={status.isConnected} />
          ))}
        </div>
        <RenderGuard label="Market Ticker">
          <MarketTicker />
        </RenderGuard>
      </div>

      <nav className="flex space-x-2 overflow-x-auto no-scrollbar py-1">
        {STAGES_FLOW.map((stage) => (
          <button
            key={stage.id}
            onClick={() => setCurrentStage(stage.id)}
            disabled={isMirror && isAutoPilotRunning} 
            className={`flex-shrink-0 px-4 md:px-5 py-3 md:py-3.5 rounded-xl text-[8px] md:text-[9px] font-black uppercase tracking-widest transition-all border ${
              isMirror && isAutoPilotRunning
                ? 'opacity-40 cursor-not-allowed border-transparent bg-slate-900 text-slate-600'
                : currentStage === stage.id 
                    ? 'bg-blue-600 text-white border-blue-400 shadow-lg scale-105 z-10' 
                    : 'bg-slate-800/20 text-slate-500 border-white/5 hover:bg-slate-800/40'
            }`}
          >
            {stage.label}
          </button>
        ))}
      </nav>

      <main className="min-h-[450px] flex-1">
        <div className="w-full h-full" style={{ display: currentStage === 0 ? 'block' : 'none' }}>
          <RenderGuard label="Stage 0">
            <UniverseGathering 
              isActive={currentStage === 0} 
              apiStatuses={apiStatuses}
              onAuthSuccess={(status) => { setIsGdriveConnected(status); fetchDriveQuota(); }}
              onStockSelected={setSelectedStock}
              autoStart={isMirror && isAutoPilotRunning && currentStage === 0}
              onComplete={() => handleStageComplete(0)}
            />
          </RenderGuard>
        </div>
        <div className="w-full h-full" style={{ display: currentStage === 1 ? 'block' : 'none' }}>
          <RenderGuard label="Stage 1">
            <PreliminaryFilter 
              autoStart={isMirror && isAutoPilotRunning && currentStage === 1}
              onComplete={() => handleStageComplete(1)}
            />
          </RenderGuard>
        </div>
        <div className="w-full h-full" style={{ display: currentStage === 2 ? 'block' : 'none' }}>
          <RenderGuard label="Stage 2">
            <DeepQualityFilter 
              autoStart={isMirror && isAutoPilotRunning && currentStage === 2}
              onComplete={() => handleStageComplete(2)}
              onStockSelected={setSelectedStock}
              isVisible={currentStage === 2}
            />
          </RenderGuard>
        </div>
        <div className="w-full h-full" style={{ display: currentStage === 3 ? 'block' : 'none' }}>
          <RenderGuard label="Stage 3">
            <FundamentalAnalysis 
              autoStart={isMirror && isAutoPilotRunning && currentStage === 3}
              onComplete={() => handleStageComplete(3)}
              onStockSelected={setSelectedStock}
              isVisible={currentStage === 3}
            />
          </RenderGuard>
        </div>
        <div className="w-full h-full" style={{ display: currentStage === 4 ? 'block' : 'none' }}>
          <RenderGuard label="Stage 4">
            <TechnicalAnalysis 
              autoStart={isMirror && isAutoPilotRunning && currentStage === 4}
              onComplete={() => handleStageComplete(4)}
              onStockSelected={setSelectedStock}
              isVisible={currentStage === 4}
            />
          </RenderGuard>
        </div>
        <div className="w-full h-full" style={{ display: currentStage === 5 ? 'block' : 'none' }}>
          <RenderGuard label="Stage 5">
            <IctAnalysis 
              autoStart={isMirror && isAutoPilotRunning && currentStage === 5}
              onComplete={() => handleStageComplete(5)}
              onStockSelected={setSelectedStock}
              isVisible={currentStage === 5}
            />
          </RenderGuard>
        </div>
        <div className="w-full h-full" style={{ display: currentStage === 6 ? 'block' : 'none' }}>
          <RenderGuard label="Stage 6">
            <AlphaAnalysis 
              selectedBrain={selectedBrain} 
              setSelectedBrain={setSelectedBrain}
              onFinalSymbolsDetected={(symbols, fullData) => {
                setFinalSymbols(symbols);
                setRecommendedData(fullData);
              }}
              onStockSelected={setSelectedStock}
              analyzingSymbols={analyzingStocks}
              autoStart={isMirror && isAutoPilotRunning && currentStage === 6}
              onComplete={(report) => handleStageComplete(6, report)}
              isVisible={currentStage === 6}
            />
          </RenderGuard>
        </div>
        <div className="w-full h-full" style={{ display: currentStage === 7 ? 'block' : 'none' }}>
          <RenderGuard label="Stage 7">
            <PerformanceDashboard isVisible={currentStage === 7} />
          </RenderGuard>
        </div>
      </main>

      {/* Detail Section */}
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
                          <button onClick={() => setAuditBrain(ApiProvider.GEMINI)} className={`px-3 py-1 rounded-full text-[7px] font-black uppercase transition-all ${auditBrain === ApiProvider.GEMINI ? 'bg-emerald-600 text-white' : 'text-slate-500'}`}>Gemini (Default)</button>
                          <button onClick={() => setAuditBrain(ApiProvider.PERPLEXITY)} className={`px-3 py-1 rounded-full text-[7px] font-black uppercase transition-all ${auditBrain === ApiProvider.PERPLEXITY ? 'bg-cyan-600 text-white' : 'text-slate-500'}`}>Sonar</button>
                       </div>
                   )}
                </div>
             </div>
          </div>
          <div className="flex gap-4 w-full lg:w-auto">
             {currentReport && <button onClick={copyReport} className="flex-1 lg:flex-none px-6 py-4 bg-slate-800 text-slate-300 rounded-2xl text-[10px] font-black uppercase tracking-widest border border-white/5">Copy Report</button>}
             <button onClick={runStockAudit} disabled={isAiLoading || !selectedStock} className={`flex-1 lg:flex-none px-8 md:px-12 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest border transition-all ${isAiLoading ? 'opacity-50 bg-slate-900' : 'bg-emerald-600 text-white border-emerald-400 hover:bg-emerald-500 shadow-2xl shadow-emerald-600/30'}`}>
                {isAiLoading ? 'Auditing & Archiving...' : selectedStock ? `Audit ${selectedStock.symbol}` : 'Select Stock'}
              </button>
          </div>
        </div>
        <div className="bg-black/40 rounded-[32px] md:rounded-[40px] border border-white/5 p-6 md:p-8 lg:p-12 min-h-[300px] shadow-inner relative group">
          {isAiLoading ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center space-y-6">
              <div className="w-16 h-16 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin"></div>
              <p className="text-[10px] font-black text-emerald-500/60 uppercase tracking-[0.4em] animate-pulse">Running {currentStage === 0 ? 'Integrity Validation' : 'Deep Dive Audit'} Protocol...</p>
            </div>
          ) : currentReport ? (
            <div className="prose-report animate-in fade-in slide-in-from-bottom-4 duration-700">
               <div className="mb-4 flex items-center justify-between border-b border-emerald-500/20 pb-4">
                  <span className="text-[9px] font-black uppercase tracking-widest text-emerald-500">
                     {currentStage === 0 ? 'Integrity Validation' : 'Deep Audit'} for {selectedStock?.symbol || 'Target'} via {auditBrain === ApiProvider.GEMINI ? 'Gemini Pro' : 'Sonar Pro'}
                  </span>
                  <span className="text-[9px] font-mono text-slate-600">{new Date().toLocaleTimeString()}</span>
               </div>
               <ReactMarkdown remarkPlugins={[remarkGfm]} components={MarkdownComponents}>{String(currentReport || "")}</ReactMarkdown>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-24 opacity-30 text-center space-y-4">
              <svg className="w-16 h-16 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.6em] italic text-center">
                 {selectedStock ? `Ready to Audit ${selectedStock.symbol}. Click 'Audit ${selectedStock.symbol}' to begin.` : 
                  currentStage === 0 
                    ? 'Search a ticker above and click "Set Target" to verify integrity.' 
                    : 'Select a stock from Stage 6 (Alpha Analysis) to begin Deep Audit.'}
              </p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
};

export default App;
