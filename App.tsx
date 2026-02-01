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
  const [isProd, setIsProd] = useState(false);
  
  const [viewMode, setViewMode] = useState<'MANUAL' | 'AUTO'>('MANUAL');
  const [isAutoPilotRunning, setIsAutoPilotRunning] = useState(false);
  const [autoStatusMessage, setAutoStatusMessage] = useState("SYSTEM STANDBY");
  
  const [aiUsage, setAiUsage] = useState<any>({ 
    gemini: { tokens: 0, requests: 0, status: 'OK', lastError: '' }, 
    perplexity: { tokens: 0, requests: 0, status: 'OK', lastError: '' } 
  });

  const [driveUsage, setDriveUsage] = useState<{ limit: number, usage: number, percent: number } | null>(null);
  
  // [PERSISTENT STATES] 스테이지 이동 시에도 절대 보존
  const [masterRegistry, setMasterRegistry] = useState<Map<string, any>>(new Map());
  const [selectedStock, setSelectedStock] = useState<any | null>(null);
  const [stockAuditCache, setStockAuditCache] = useState<{ [key: string]: string }>({});
  const [analyzingStocks, setAnalyzingStocks] = useState<Set<string>>(new Set());
  
  // 브레인 선택 상태 (사용자가 수동 변경 가능, 자동 폴백 시에도 연동)
  const [selectedBrain, setSelectedBrain] = useState<ApiProvider>(ApiProvider.GEMINI);

  useEffect(() => {
      const params = new URLSearchParams(window.location.search);
      if (params.get('auto') === 'true' && isGdriveConnected && viewMode === 'MANUAL') {
          toggleViewMode();
      }
  }, [isGdriveConnected]);

  const handleStageComplete = async (stageId: number, reportPayload?: string) => {
      if (viewMode !== 'AUTO' || !isAutoPilotRunning) return;
      const nextStage = stageId + 1;
      setTimeout(async () => {
          if (nextStage <= 6) {
              setCurrentStage(nextStage);
              setAutoStatusMessage(`ADVANCING TO STAGE ${nextStage}...`);
          } else {
              setIsAutoPilotRunning(false);
              if (reportPayload) {
                  setAutoStatusMessage("RELAYING TO TELEGRAM...");
                  const sent = await sendTelegramReport(reportPayload);
                  setAutoStatusMessage(sent ? "SEQUENCE COMPLETE." : "TELEGRAM ERROR.");
              } else {
                  setAutoStatusMessage("SEQUENCE COMPLETE.");
              }
          }
      }, 3000); 
  };

  const toggleViewMode = () => {
      if (viewMode === 'MANUAL') {
          if (!isGdriveConnected) {
              setAutoStatusMessage("⚠️ LINK VAULT FIRST");
              setTimeout(() => setAutoStatusMessage("SYSTEM STANDBY"), 3000);
              return;
          }
          setViewMode('AUTO');
          setIsAutoPilotRunning(true);
          setCurrentStage(0);
          setAutoStatusMessage("AUTO PILOT ENGAGED");
      } else {
          setViewMode('MANUAL');
          setIsAutoPilotRunning(false);
          setAutoStatusMessage("MANUAL OVERRIDE");
          setTimeout(() => setAutoStatusMessage("SYSTEM STANDBY"), 2000);
      }
  };

  const loadUsageStats = () => {
      const raw = sessionStorage.getItem('US_ALPHA_SEEKER_AI_USAGE');
      if (raw) { try { setAiUsage(JSON.parse(raw)); } catch(e) {} }
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
      if (!token) return;
      try {
          const res = await fetch('https://www.googleapis.com/drive/v3/about?fields=storageQuota', { headers: { 'Authorization': `Bearer ${token}` } });
          if (res.ok) {
              const data = await res.json();
              if (data.storageQuota) {
                  const limit = parseInt(data.storageQuota.limit || '0');
                  const usage = parseInt(data.storageQuota.usage || '0');
                  const percent = limit > 0 ? (usage / limit) * 100 : 0;
                  setDriveUsage({ limit, usage, percent });
              }
          }
      } catch (e) {}
  };

  const refreshApiStatuses = useCallback(async () => {
    const hasGdriveToken = !!sessionStorage.getItem('gdrive_access_token');
    setIsGdriveConnected(hasGdriveToken);
    let geminiActive = !!process.env.API_KEY;
    if (window.aistudio && !geminiActive) geminiActive = await window.aistudio.hasSelectedApiKey();
    if (!geminiActive) {
      const geminiConfig = API_CONFIGS.find(c => c.provider === ApiProvider.GEMINI);
      geminiActive = !!geminiConfig?.key;
    }
    loadUsageStats();
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
          provider: config.provider, category: config.category, isConnected, latency: isConnected ? Math.floor(Math.random() * 20) + 5 : 0, lastChecked: new Date().toLocaleTimeString()
        };
      });
    });
  }, []);

  useEffect(() => {
    setIsProd(window.location.hostname === 'us-alpha-seeker.vercel.app');
    refreshApiStatuses();
    fetchDriveQuota();
    const interval = setInterval(() => { refreshApiStatuses(); if (new Date().getSeconds() < 5) fetchDriveQuota(); }, 5000);
    window.addEventListener('storage-usage-update', loadUsageStats);
    return () => { clearInterval(interval); window.removeEventListener('storage-usage-update', loadUsageStats); };
  }, [refreshApiStatuses]);

  // AI Auditor Matrix: Gemini -> Sonar 자동 폴백 및 아카이브 통합
  const runStockAudit = async () => {
    if (!selectedStock) return;
    setIsAiLoading(true);
    setAnalyzingStocks(prev => new Set(prev).add(selectedStock.symbol));
    
    let targetBrain = selectedBrain;
    const mode = currentStage === 0 ? 'INTEGRITY_CHECK' : 'SINGLE_STOCK';
    const token = sessionStorage.getItem('gdrive_access_token');

    try {
      let report = await analyzePipelineStatus({
        currentStage, apiStatuses, symbols: [selectedStock.symbol], targetStock: selectedStock, mode: mode
      }, targetBrain);

      // Gemini 429 오류 감지 시 Sonar로 자동 전환
      if (targetBrain === ApiProvider.GEMINI && (report.includes("429") || report.includes("QUOTA") || report.includes("LIMIT") || report.includes("OFFLINE"))) {
          setSelectedBrain(ApiProvider.PERPLEXITY); 
          targetBrain = ApiProvider.PERPLEXITY;
          
          report = await analyzePipelineStatus({
            currentStage, apiStatuses, symbols: [selectedStock.symbol], targetStock: selectedStock, mode: mode
          }, ApiProvider.PERPLEXITY);
      }

      const cacheKey = `${selectedStock.symbol}-${targetBrain}-STAGE${currentStage}`;
      setStockAuditCache(prev => ({ ...prev, [cacheKey]: report }));

      // 드라이브 Report 폴더 자동 저장
      if (token && !report.includes("OFFLINE")) {
          const date = new Date().toISOString().split('T')[0];
          const brainLabel = targetBrain === ApiProvider.GEMINI ? 'Gemini' : 'Sonar';
          const typeLabel = currentStage === 0 ? 'Integrity' : 'Audit';
          const fileName = `${date}_${typeLabel}_${selectedStock.symbol}_${brainLabel}.md`;
          archiveReport(token, fileName, report);
      }

    } catch (err: any) {
      const cacheKey = `${selectedStock.symbol}-${targetBrain}-STAGE${currentStage}`;
      setStockAuditCache(prev => ({ ...prev, [cacheKey]: `### CRITICAL_NODE_FAILURE\n> ${err.message}` }));
    } finally {
      setIsAiLoading(false);
      setAnalyzingStocks(prev => { const next = new Set(prev); next.delete(selectedStock.symbol); return next; });
      loadUsageStats(); 
    }
  };

  const currentReportKey = selectedStock ? `${selectedStock.symbol}-${selectedBrain}-STAGE${currentStage}` : '';
  const currentReport = stockAuditCache[currentReportKey];
  const copyReport = () => { if (currentReport) { navigator.clipboard.writeText(currentReport); alert('보고서가 복사되었습니다.'); } };

  const isMirror = viewMode === 'AUTO';
  const showWarning = !isMirror && autoStatusMessage !== "SYSTEM STANDBY";

  return (
    <div className={`min-h-screen pb-10 p-2 sm:p-4 md:p-6 space-y-4 md:space-y-6 max-w-[1600px] mx-auto overflow-x-hidden ${isMirror ? 'border-4 border-rose-600 rounded-xl bg-slate-950' : ''}`}>
      <div className={`flex items-center glass-panel px-4 py-2.5 rounded-xl border-white/5 text-[8px] md:text-[9px] font-black uppercase tracking-widest text-slate-500 overflow-x-auto no-scrollbar whitespace-nowrap ${isMirror ? 'bg-rose-900/10 border-rose-500/30' : ''}`}>
        <div className="flex items-center space-x-2 mr-6 shrink-0">
          <div className={`w-1.5 h-1.5 rounded-full ${isMirror ? 'bg-rose-500 animate-ping' : isProd ? 'bg-emerald-500' : 'bg-blue-500'}`}></div>
          <span className={isMirror ? 'text-rose-500 font-bold' : ''}>{isMirror ? 'AUTOMATION_RUNNING' : isProd ? 'Production_Node' : 'Development_Node'}</span>
        </div>
        <div className="flex items-center space-x-2 mr-6 shrink-0">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]"></div>
          <span className="text-emerald-400 font-bold">Version: v1.5.4 (Hedge Fund Quality)</span>
        </div>
        <div className="flex items-center space-x-2 mr-6 shrink-0">
          <div className={`w-1.5 h-1.5 rounded-full ${isGdriveConnected ? 'bg-emerald-500' : 'bg-slate-700'}`}></div>
          <span>Cloud_Vault: {isGdriveConnected ? 'Linked' : 'Offline'}</span>
        </div>
        <a href={GITHUB_REPO} className="ml-auto opacity-40 hover:opacity-100 transition-opacity shrink-0">Nexus_Source</a>
      </div>

      <header className="flex flex-col md:flex-row justify-between items-start md:items-end py-2 gap-4">
        <div>
          <p className={`text-[8px] md:text-[9px] font-black uppercase tracking-[0.4em] mb-1 italic ${isMirror ? 'text-rose-500' : 'text-blue-500'}`}>US Alpha Seeker Infrastructure</p>
          <div className="flex items-center gap-4">
             <h1 className="text-2xl sm:text-3xl md:text-5xl font-black tracking-tighter text-white italic uppercase leading-tight">US_Alpha_Seeker</h1>
             {isMirror && <span className="px-3 py-1 bg-rose-600 text-white text-[10px] font-black uppercase rounded animate-pulse shadow-[0_0_15px_rgba(225,29,72,0.6)]">MIRROR ACTIVE</span>}
          </div>
          <p className="text-[10px] text-slate-500 mt-1 font-medium tracking-wide animate-pulse">© 2026. Designed by Bae Sang Min</p>
        </div>

        <div className={`glass-panel px-4 py-2.5 rounded-xl border-white/5 flex items-center gap-5 w-full md:w-auto ${isMirror ? 'border-rose-500/20' : ''}`}>
             <div className="flex flex-col border-r border-white/5 pr-5">
                 <span className="text-[7px] font-black text-slate-500 uppercase tracking-widest mb-1">AI Session Load</span>
                 <div className="flex items-center gap-3">
                     <div className="flex flex-col">
                         <div className="flex items-center gap-1.5">
                             <div className={`w-1.5 h-1.5 rounded-full ${aiUsage.gemini.status === 'OK' ? 'bg-emerald-500' : 'bg-red-500 animate-ping'}`}></div>
                             <span className="text-[8px] font-bold text-slate-300">GEMINI</span>
                         </div>
                         <span className={`text-[9px] font-mono ${aiUsage.gemini.status === 'OK' ? 'text-emerald-400' : 'text-red-400'}`}>
                             {aiUsage.gemini.status === 'OK' ? `${aiUsage.gemini.tokens.toLocaleString()} Tks` : 'QUOTA_HIT'}
                         </span>
                     </div>
                     <div className="flex flex-col">
                         <div className="flex items-center gap-1.5">
                             <div className={`w-1.5 h-1.5 rounded-full ${aiUsage.perplexity.status === 'OK' ? 'bg-cyan-500' : 'bg-red-500 animate-ping'}`}></div>
                             <span className="text-[8px] font-bold text-slate-300">SONAR</span>
                         </div>
                         <span className={`text-[9px] font-mono ${aiUsage.perplexity.status === 'OK' ? 'text-cyan-400' : 'text-red-400'}`}>
                             {aiUsage.perplexity.status === 'OK' ? `${aiUsage.perplexity.tokens.toLocaleString()} Tks` : 'QUOTA_HIT'}
                         </span>
                     </div>
                 </div>
             </div>
             <div className="flex flex-col min-w-[100px]">
                 <span className="text-[7px] font-black text-slate-500 uppercase tracking-widest mb-1">Vault Storage</span>
                 {driveUsage ? (
                     <div className="flex flex-col gap-1">
                        <div className="flex justify-between items-end">
                            <span className="text-[9px] font-mono font-bold text-white">{formatBytes(driveUsage.usage)}</span>
                            <span className="text-[7px] text-slate-500">/ {formatBytes(driveUsage.limit)}</span>
                        </div>
                        <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full transition-all duration-500 ${driveUsage.percent > 90 ? 'bg-red-500' : 'bg-blue-500'}`} style={{ width: `${driveUsage.percent}%` }}></div>
                        </div>
                     </div>
                 ) : ( <span className="text-[9px] font-black text-slate-600 uppercase">Not Linked</span> )}
             </div>
        </div>

        <div className={`glass-panel px-4 py-2.5 rounded-xl border flex flex-col justify-center items-end min-w-[180px] transition-all ${isMirror ? 'border-rose-500 bg-rose-950/20' : showWarning ? 'border-amber-500 bg-amber-950/20' : 'border-blue-500/30'}`}>
           <div className="flex items-center gap-2 mb-1">
               <span className={`text-[8px] font-black uppercase ${isMirror ? 'text-rose-400 animate-pulse' : showWarning ? 'text-amber-500 animate-pulse' : 'text-slate-500'}`}>
                   {isMirror ? autoStatusMessage : (showWarning ? autoStatusMessage : "MANUAL CONTROL")}
               </span>
               <button onClick={toggleViewMode} className={`w-10 h-5 rounded-full transition-colors relative flex items-center border ${isMirror ? 'bg-rose-600 border-rose-400' : 'bg-slate-800 border-slate-600'}`}>
                   <div className={`absolute w-3 h-3 bg-white rounded-full transition-all shadow-md ${isMirror ? 'left-6' : 'left-1'}`}></div>
               </button>
           </div>
           <span className={`text-[7px] font-black uppercase ${isMirror ? 'text-rose-300' : 'text-slate-500'}`}>{isMirror ? 'Single Pass Mode' : 'Standard Mode'}</span>
        </div>
      </header>

      <div className="space-y-4">
        <div className="flex gap-2 md:gap-3 overflow-x-auto no-scrollbar pb-1 px-1">
          {apiStatuses.map(status => ( <ApiStatusCard key={status.provider} status={status} isAuthConnected={status.isConnected} /> ))}
        </div>
        <MarketTicker />
      </div>

      <nav className="flex space-x-2 overflow-x-auto no-scrollbar py-1">
        {STAGES_FLOW.map((stage) => (
          <button key={stage.id} onClick={() => setCurrentStage(stage.id)} disabled={isMirror && isAutoPilotRunning} className={`flex-shrink-0 px-4 md:px-5 py-3 md:py-3.5 rounded-xl text-[8px] md:text-[9px] font-black uppercase tracking-widest transition-all border ${currentStage === stage.id ? 'bg-blue-600 text-white border-blue-400 shadow-lg scale-105' : 'bg-slate-800/20 text-slate-500 border-white/5 hover:bg-slate-800/40'}`}>
            {stage.label}
          </button>
        ))}
      </nav>

      <main className="min-h-[450px]">
        <div style={{ display: currentStage === 0 ? 'block' : 'none' }}>
          <UniverseGathering isActive={currentStage === 0} apiStatuses={apiStatuses} onAuthSuccess={(status) => { setIsGdriveConnected(status); fetchDriveQuota(); }} onStockSelected={(stock) => setSelectedStock(stock)} autoStart={isMirror && isAutoPilotRunning && currentStage === 0} onComplete={() => handleStageComplete(0)} externalRegistry={masterRegistry} onRegistryUpdate={setMasterRegistry} />
        </div>
        <div style={{ display: currentStage === 1 ? 'block' : 'none' }}> <PreliminaryFilter autoStart={isMirror && isAutoPilotRunning && currentStage === 1} onComplete={() => handleStageComplete(1)} /> </div>
        <div style={{ display: currentStage === 2 ? 'block' : 'none' }}> <DeepQualityFilter autoStart={isMirror && isAutoPilotRunning && currentStage === 2} onComplete={() => handleStageComplete(2)} /> </div>
        <div style={{ display: currentStage === 3 ? 'block' : 'none' }}> <FundamentalAnalysis autoStart={isMirror && isAutoPilotRunning && currentStage === 3} onComplete={() => handleStageComplete(3)} /> </div>
        <div style={{ display: currentStage === 4 ? 'block' : 'none' }}> <TechnicalAnalysis autoStart={isMirror && isAutoPilotRunning && currentStage === 4} onComplete={() => handleStageComplete(4)} /> </div>
        <div style={{ display: currentStage === 5 ? 'block' : 'none' }}> <IctAnalysis autoStart={isMirror && isAutoPilotRunning && currentStage === 5} onComplete={() => handleStageComplete(5)} /> </div>
        <div style={{ display: currentStage === 6 ? 'block' : 'none' }}> <AlphaAnalysis selectedBrain={selectedBrain} setSelectedBrain={setSelectedBrain} onFinalSymbolsDetected={(symbols, fullData) => { if(fullData?.[0]) setSelectedStock(fullData[0]); }} onStockSelected={setSelectedStock} analyzingSymbols={analyzingStocks} autoStart={isMirror && isAutoPilotRunning && currentStage === 6} onComplete={(report) => handleStageComplete(6, report)} isActive={currentStage === 6} /> </div>
      </main>

      <section className={`glass-panel p-6 md:p-8 lg:p-12 rounded-[32px] md:rounded-[48px] border-t-4 shadow-2xl relative overflow-hidden transition-all duration-500 ${selectedStock ? 'border-t-emerald-600' : 'border-t-slate-700 opacity-80'}`}>
        <div className="absolute top-0 right-0 p-12 opacity-[0.05] pointer-events-none"> <svg className="w-80 h-80 text-emerald-500" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2L1 21h22L12 2zm0 3.45l8.27 14.3H3.73L12 5.45z"/></svg> </div>
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-6 md:mb-10 gap-6 md:gap-8 relative z-10">
          <div className="flex flex-col md:flex-row items-start md:items-center space-y-4 md:space-y-0 md:space-x-8">
             <div className="bg-emerald-500/10 p-5 rounded-[28px] border border-emerald-500/20 shadow-inner hidden md:block">
                <svg className={`w-10 h-10 text-emerald-400 ${isAiLoading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
             </div>
             <div>
                <h3 className="font-black text-white uppercase text-xl md:text-2xl tracking-tighter italic leading-none">AI Alpha Auditor Matrix</h3>
                <div className="flex flex-wrap items-center gap-3 mt-3">
                   <span className="text-[8px] font-black text-emerald-500 uppercase tracking-widest bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/20">
                       {selectedStock ? `Target: ${selectedStock.symbol}` : 'System Standby'}
                   </span>
                   {/* [FIXED] 토글 버튼 항상 노출 */}
                   <div className="flex bg-black/40 p-1 rounded-full border border-white/10 ml-0 md:ml-4">
                      <button onClick={() => setSelectedBrain(ApiProvider.GEMINI)} className={`px-3 py-1 rounded-full text-[7px] font-black uppercase transition-all ${selectedBrain === ApiProvider.GEMINI ? 'bg-emerald-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}>Gemini</button>
                      <button onClick={() => setSelectedBrain(ApiProvider.PERPLEXITY)} className={`px-3 py-1 rounded-full text-[7px] font-black uppercase transition-all ${selectedBrain === ApiProvider.PERPLEXITY ? 'bg-cyan-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}>Sonar</button>
                   </div>
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
              <p className="text-[10px] font-black text-emerald-500/60 uppercase tracking-[0.4em] animate-pulse">Running {currentStage === 0 ? 'Integrity Validation' : 'Deep Dive Audit'} Protocol...</p>
            </div>
          ) : currentReport ? (
            <div className="prose-report animate-in fade-in slide-in-from-bottom-4 duration-700">
               <div className="mb-4 flex items-center justify-between border-b border-emerald-500/20 pb-4">
                  <span className="text-[9px] font-black uppercase tracking-widest text-emerald-500"> {currentStage === 0 ? 'Integrity Validation' : 'Deep Audit'} for {selectedStock?.symbol} via {selectedBrain === ApiProvider.GEMINI ? 'Gemini 3 Pro' : 'Sonar Pro'} </span>
                  <span className="text-[9px] font-mono text-slate-600">{new Date().toLocaleTimeString()}</span>
               </div>
               <ReactMarkdown remarkPlugins={[remarkGfm]}>{String(currentReport || "")}</ReactMarkdown>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-24 opacity-30 text-center space-y-4">
              <svg className="w-16 h-16 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.6em] italic text-center"> {selectedStock ? `Ready to Audit ${selectedStock.symbol}.` : currentStage === 0 ? 'Search a ticker above to verify integrity.' : 'Select a stock from Stage 6 to begin Deep Audit.'} </p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
};

export default App;
