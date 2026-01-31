import React, { useState, useEffect, useRef, useMemo } from 'react';
import { GoogleGenAI } from "@google/genai";
import { GOOGLE_DRIVE_TARGET, API_CONFIGS } from '../constants';
import { ApiProvider } from '../types';
import { trackUsage } from '../services/intelligenceService';

interface MasterTicker {
  symbol: string;
  name?: string;
  price: number;
  volume: number;
  change: number;
  updated: string;
  type?: string;
}

interface AiProposal {
  suggestedPrice: number;
  suggestedVolume: number;
  regime: string;
  reasoning: string;
}

interface Props {
  autoStart?: boolean;
  onComplete?: () => void;
}

const PreliminaryFilter: React.FC<Props> = ({ autoStart, onComplete }) => {
  const [loading, setLoading] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [activeAi, setActiveAi] = useState<string>('Standby'); 
  const [rawUniverse, setRawUniverse] = useState<MasterTicker[]>([]);
  const [filteredCount, setFilteredCount] = useState(0);
  const [logs, setLogs] = useState<string[]>(['> Filter_Node v2.2.0: Resilience Protocol Active.']);
  
  // Filter State
  const [minPrice, setMinPrice] = useState(2.0);
  const [minVolume, setMinVolume] = useState(500000);
  const [isManual, setIsManual] = useState(false);
  const [aiProposal, setAiProposal] = useState<AiProposal | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  
  // Automation Internal State
  const [autoStep, setAutoStep] = useState<'IDLE' | 'ANALYZING' | 'COMMITTING' | 'DONE'>('IDLE');

  // UI State
  const [showConfig, setShowConfig] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [clientId, setClientId] = useState<string>(() => 
    localStorage.getItem('gdrive_client_id') || '741017429020-k7aka3ot8lmba6e3114205nnpp584oiu.apps.googleusercontent.com'
  );
  const [searchTerm, setSearchTerm] = useState('');
  const [stats, setStats] = useState({
    found: 0,
    provider: 'Idle',
    elapsed: 0,
    phase: 'Idle' as 'Idle' | 'Discovery' | 'Mapping' | 'Commit' | 'Finalized' | 'Cooldown',
    target: 10000
  });
  
  const accessToken = sessionStorage.getItem('gdrive_access_token');
  const logRef = useRef<HTMLDivElement>(null);
  const startTimeRef = useRef<number>(0);

  // Derived state
  const isEngineRunning = loading || isAnalyzing;

  const searchResult = useMemo(() => {
    if (!searchTerm || rawUniverse.length === 0) return null;
    return rawUniverse.find(s => s.symbol.toUpperCase() === searchTerm.toUpperCase());
  }, [searchTerm, rawUniverse]);

  const handleSetTarget = () => {
    if (searchResult) {
      addLog(`Target Audit Locked: ${searchResult.symbol}`, "ok");
    }
  };

  const startEngine = () => {
    if (isEngineRunning || cooldown > 0) return;
    syncAndAnalyzeMarket();
  };

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  useEffect(() => {
    if (rawUniverse.length > 0) {
      const count = rawUniverse.filter(s => s.price >= minPrice && s.volume >= minVolume).length;
      setFilteredCount(count);
      setStats(prev => ({ ...prev, found: count }));
    }
  }, [minPrice, minVolume, rawUniverse]);

  useEffect(() => {
    if (cooldown > 0) {
      const timer = setTimeout(() => setCooldown(cooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [cooldown]);

  // Timer Effect
  useEffect(() => {
    let interval: any;
    if (isEngineRunning && startTimeRef.current > 0) {
      interval = setInterval(() => {
        setStats(prev => ({ ...prev, elapsed: Math.floor((Date.now() - startTimeRef.current) / 1000) }));
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isEngineRunning]);

  // AUTO START LOGIC
  useEffect(() => {
    if (autoStart && autoStep === 'IDLE' && !loading && !isAnalyzing) {
        addLog("AUTO-PILOT: Initiating Preliminary Filter Sequence...", "signal");
        setAutoStep('ANALYZING');
        syncAndAnalyzeMarket();
    }
  }, [autoStart, autoStep, loading, isAnalyzing]);

  // Step 2: Auto Commit after Analysis
  useEffect(() => {
      if (autoStart && autoStep === 'ANALYZING' && !loading && !isAnalyzing && (aiProposal || aiError)) {
          const timer = setTimeout(() => {
              setAutoStep('COMMITTING');
              commitPurification();
          }, 2000);
          return () => clearTimeout(timer);
      }
  }, [autoStart, autoStep, loading, isAnalyzing, aiProposal, aiError]);

  const addLog = (m: string, t: 'info' | 'ok' | 'err' | 'warn' | 'signal' = 'info') => {
    const p = { info: '>', ok: '[OK]', err: '[ERR]', warn: '[WARN]', signal: '[AUTO]' };
    setLogs(prev => [...prev, `${p[t]} ${m}`].slice(-40));
  };

  const sanitizeJson = (text: string) => {
    try {
      let clean = text.replace(/```json/g, "").replace(/```/g, "").trim();
      const first = clean.indexOf('{');
      const last = clean.lastIndexOf('}');
      if (first !== -1 && last !== -1) return JSON.parse(clean.substring(first, last + 1));
      return JSON.parse(clean);
    } catch (e) { return null; }
  };

  const syncAndAnalyzeMarket = async () => {
    if (!accessToken) {
      addLog("Cloud link required. Check Auth Status.", "warn");
      return;
    }
    setLoading(true);
    setIsAnalyzing(true);
    setIsManual(false);
    setAiError(null);
    setAiProposal(null);
    setActiveAi('Initializing');
    startTimeRef.current = Date.now();
    setStats(prev => ({ ...prev, phase: 'Discovery', provider: 'Initializing', elapsed: 0 }));
    addLog("Phase 1: Retrieving Global Universe Matrix from Stage 0...", "info");

    try {
      const q = encodeURIComponent(`name contains 'STAGE0_MASTER_UNIVERSE' and trashed = false`);
      const listRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&orderBy=createdTime desc&pageSize=1`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      }).then(r => r.json());

      if (!listRes.files?.length) throw new Error("Stage 0 Data not found. Please run Stage 0 first.");

      const content = await fetch(`https://www.googleapis.com/drive/v3/files/${listRes.files[0].id}?alt=media`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      }).then(r => r.json());

      const data = content.universe || [];
      setRawUniverse(data);
      addLog(`Matrix Synced: ${data.length} assets. Calculating distribution stats...`, "ok");
      setStats(prev => ({ ...prev, phase: 'Mapping', provider: 'System' }));

      const prices = data.map((s: any) => s.price).filter((p: any) => p > 0).sort((a: any, b: any) => a - b);
      const volumes = data.map((s: any) => s.volume).filter((v: any) => v > 0).sort((a: any, b: any) => a - b);
      
      const statsSummary = {
        date: new Date().toLocaleDateString(),
        totalCount: data.length,
        priceDistribution: {
            p25: prices[Math.floor(prices.length * 0.25)] || 0,
            p50: prices[Math.floor(prices.length * 0.50)] || 0,
            p75: prices[Math.floor(prices.length * 0.75)] || 0,
        },
        volumeDistribution: {
            p25: volumes[Math.floor(volumes.length * 0.25)] || 0,
            p50: volumes[Math.floor(volumes.length * 0.50)] || 0,
            p80: volumes[Math.floor(volumes.length * 0.80)] || 0,
        },
        pennyStocksCount: data.filter((s:any) => s.price < 1).length
      };

      const prompt = `
      [Role: Senior Quantitative Market Strategist]
      Current Date: ${statsSummary.date}
      Market Stats (US Equities):
      - Total Assets: ${statsSummary.totalCount}
      - Price Dist: P25=$${statsSummary.priceDistribution.p25}, Median=$${statsSummary.priceDistribution.p50}, P75=$${statsSummary.priceDistribution.p75}
      - Volume Dist: P25=${statsSummary.volumeDistribution.p25}, Median=${statsSummary.volumeDistribution.p50}, P80=${statsSummary.volumeDistribution.p80}
      - Penny Stocks (<$1): ${statsSummary.pennyStocksCount}

      [Task]
      Determine optimal 'Price Floor' and 'Volume Threshold' to filter out junk/illiquid assets while keeping high-potential runners.
      - Typically Price Floor is between $1.5 and $5.0.
      - Typically Volume Threshold is between 100,000 and 1,000,000.
      - Use the provided distribution stats to justify your choice.

      Return ONLY JSON: { "suggestedPrice": number, "suggestedVolume": number, "regime": "string", "reasoning": "string (Korean)" }
      `;

      let aiResult = null;
      let usedProvider = '';

      try {
          setActiveAi('Gemini 3 Pro');
          const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || "" });
          const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: prompt,
            config: { responseMimeType: "application/json" }
          });
          
          trackUsage(ApiProvider.GEMINI, response.usageMetadata?.totalTokenCount || 0);
          aiResult = sanitizeJson(response.text);
          usedProvider = 'Gemini 3 Pro';
      } catch (e: any) { 
          trackUsage(ApiProvider.GEMINI, 0, true, e.message);
      }

      if (!aiResult) {
          try {
              setActiveAi('Sonar Pro (Fallback)');
              const perplexityKey = API_CONFIGS.find(c => c.provider === ApiProvider.PERPLEXITY)?.key || "";
              const pRes = await fetch('https://api.perplexity.ai/chat/completions', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${perplexityKey}` },
                  body: JSON.stringify({
                      model: 'sonar-pro', 
                      messages: [{ role: "user", content: prompt + " Return JSON only." }]
                  })
              });
              const pJson = await pRes.json();
              if (pJson.usage) trackUsage(ApiProvider.PERPLEXITY, pJson.usage.total_tokens || 0);
              aiResult = sanitizeJson(pJson.choices?.[0]?.message?.content);
              usedProvider = 'Perplexity Sonar';
          } catch (e: any) {
              trackUsage(ApiProvider.PERPLEXITY, 0, true, e.message);
          }
      }

      if (aiResult) {
          setAiProposal(aiResult);
          setMinPrice(aiResult.suggestedPrice);
          setMinVolume(aiResult.suggestedVolume);
          addLog(`Strategy Generated by ${usedProvider}: [${aiResult.regime}]`, "ok");
          setActiveAi(usedProvider);
          setStats(prev => ({ ...prev, provider: usedProvider }));
      } else {
          setAiError("AI Nodes Unresponsive. Default filters applied.");
          setMinPrice(2.0);
          setMinVolume(500000);
          setActiveAi('Default Logic');
          setStats(prev => ({ ...prev, provider: 'Default' }));
      }

    } catch (e: any) {
      setAiError(e.message);
      addLog(`Critical Error: ${e.message}`, "err");
    } finally {
      setLoading(false);
      setIsAnalyzing(false);
    }
  };

  const commitPurification = async () => {
    if (!accessToken || rawUniverse.length === 0) return;
    
    setLoading(true);
    setStats(prev => ({ ...prev, phase: 'Commit' }));
    addLog(`Phase 2: Purifying Universe... (P: $${minPrice}, V: ${minVolume})`, "info");

    try {
      const filtered = rawUniverse.filter(s => s.price >= minPrice && s.volume >= minVolume);
      const folderId = await ensureFolder(accessToken, GOOGLE_DRIVE_TARGET.stage1SubFolder);
      const fileName = `STAGE1_PURIFIED_UNIVERSE_${new Date().toISOString().split('T')[0]}.json`;
      
      const payload = {
        manifest: { version: "2.1.0", regime: aiProposal?.regime || "Manual", filters: { minPrice, minVolume }, timestamp: new Date().toISOString() },
        investable_universe: filtered
      };

      const meta = { name: fileName, parents: [folderId], mimeType: 'application/json' };
      const form = new FormData();
      form.append('metadata', new Blob([JSON.stringify(meta)], { type: 'application/json' }));
      form.append('file', new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));

      await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST', headers: { 'Authorization': `Bearer ${accessToken}` }, body: form
      });

      addLog(`Purification Success: ${filtered.length} assets committed.`, "ok");
      setStats(prev => ({ ...prev, phase: 'Finalized', synced: filtered.length }));
      
      if (autoStart) {
          setAutoStep('DONE');
          if (onComplete) onComplete();
      }

    } catch (e: any) {
      addLog(`Vault Error: ${e.message}`, "err");
    } finally {
      setLoading(false);
    }
  };

  const ensureFolder = async (token: string, name: string) => {
    const q = encodeURIComponent(`name = '${name}' and '${GOOGLE_DRIVE_TARGET.rootFolderId}' in parents and trashed = false`);
    const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    }).then(r => r.json());
    if (res.files?.length > 0) return res.files[0].id;
    const create = await fetch(`https://www.googleapis.com/drive/v3/files`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, parents: [GOOGLE_DRIVE_TARGET.rootFolderId], mimeType: 'application/vnd.google-apps.folder' })
    }).then(r => r.json());
    return create.id;
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
       {showConfig && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="glass-panel p-8 rounded-[40px] max-w-md w-full border-t-2 border-t-blue-500 shadow-2xl space-y-6">
            <div className="flex justify-between items-center">
              <h3 className="text-xl font-black text-white italic tracking-tight uppercase">Infrastructure Config</h3>
              <button onClick={() => setShowConfig(false)} className="text-slate-500 hover:text-white transition-colors">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Google Cloud Client ID</label>
              <input 
                type="text" 
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                className="w-full bg-black/60 border border-white/10 rounded-2xl px-6 py-4 text-xs font-mono text-blue-400 focus:border-blue-500 outline-none"
                placeholder="Enter GDrive Client ID"
              />
              <p className="text-[9px] text-slate-600 font-medium">Project ID: 741017429020</p>
            </div>
            <button 
              onClick={() => {
                localStorage.setItem('gdrive_client_id', clientId);
                setShowConfig(false);
                addLog("Infrastructure Persisted Successfully.", "ok");
              }}
              className="w-full py-4 bg-blue-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-blue-900/20 active:scale-95 transition-all"
            >
              Apply Changes
            </button>
          </div>
        </div>
      )}

      <div className="xl:col-span-3 space-y-6">
        <div className="glass-panel p-5 md:p-8 lg:p-10 rounded-[32px] md:rounded-[40px] border-t-2 border-t-blue-500 shadow-2xl bg-slate-900/40 relative overflow-hidden">
          
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-6 md:mb-10 gap-6">
            <div className="flex items-center space-x-4 md:space-x-6">
              <div className={`w-12 h-12 md:w-14 md:h-14 rounded-3xl bg-blue-600/10 flex items-center justify-center border border-blue-500/20 ${isEngineRunning ? 'animate-pulse' : ''}`}>
                <div className={`w-4 h-4 md:w-5 md:h-5 bg-blue-500 rounded-lg ${isEngineRunning ? 'animate-spin' : ''}`}></div>
              </div>
              <div>
                <h2 className="text-xl md:text-3xl font-black text-white italic tracking-tighter uppercase leading-none">Omni_Nexus v2.4.0</h2>
                <div className="flex items-center mt-2 space-x-2">
                  <span className={`text-[8px] px-2 py-0.5 rounded-md font-black border uppercase tracking-widest ${cooldown > 0 ? 'bg-red-500/20 text-red-400 border-red-500/20' : 'bg-indigo-500/20 text-indigo-400 border-indigo-500/20'}`}>
                    {cooldown > 0 ? `Rate_Limit_Lock: ${cooldown}s` : 'Multi-Provider_Ready'}
                  </span>
                  <button onClick={() => setShowConfig(true)} className="text-[8px] px-2 py-0.5 bg-slate-800 text-slate-400 rounded-md font-black border border-white/5 uppercase hover:bg-slate-700 transition-all">⚙ Config</button>
                  {autoStart && <span className="text-[8px] px-2 py-0.5 bg-rose-600 text-white rounded-md font-black uppercase animate-pulse">AUTO PILOT ENGAGED</span>}
                </div>
              </div>
            </div>
            <button 
              onClick={startEngine} 
              disabled={isEngineRunning || cooldown > 0}
              className={`w-full md:w-auto px-6 py-4 md:px-12 md:py-5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${
                  isEngineRunning || cooldown > 0 
                    ? 'bg-slate-800 text-slate-500 cursor-not-allowed' 
                    : !accessToken 
                        ? 'bg-amber-600 text-white shadow-xl hover:bg-amber-500 hover:scale-105 animate-pulse shadow-amber-900/20' 
                        : 'bg-blue-600 text-white shadow-xl hover:scale-105 shadow-blue-900/20' 
              }`}
            >
              {isEngineRunning 
                ? 'Acquiring Universe...' 
                : cooldown > 0 
                    ? `Wait ${cooldown}s` 
                    : !accessToken 
                        ? 'Connect Cloud Vault' 
                        : 'Execute Data Fusion'}
            </button>
          </div>
          
           <div className="bg-black/40 p-4 md:p-6 rounded-3xl border border-white/5 mb-8">
            <div className="flex items-center justify-between mb-4">
              <p className="text-[9px] font-black text-blue-400 uppercase tracking-widest">Global Integrity Validator</p>
              <div className="flex items-center gap-2">
                <span className="text-[8px] text-slate-500 uppercase">Mode: Active_Equity_Mapping</span>
              </div>
            </div>
            <div className="flex flex-col gap-4">
                <div className="flex flex-col md:flex-row gap-4">
                  <input 
                    type="text" 
                    placeholder="Verify Ticker (e.g. AAPL, TSLA)"
                    className="flex-1 bg-slate-950 border border-white/10 rounded-xl px-6 py-4 text-white font-mono text-sm focus:border-blue-500 outline-none uppercase"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                  <div className={`flex-1 flex items-center px-6 py-4 md:py-0 rounded-xl border transition-all ${searchResult ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-400' : 'bg-slate-900 border-white/5 text-slate-600'}`}>
                    {searchResult ? (
                      <div className="flex justify-between items-center w-full font-mono text-[10px] font-bold">
                        <span className="truncate">{searchResult.name || searchResult.symbol}</span>
                        <div className="flex items-center gap-3">
                            <span className="bg-emerald-500/20 px-2 py-1 rounded text-emerald-300">${searchResult.price?.toFixed(2) || '0.00'}</span>
                            <button 
                                onClick={handleSetTarget}
                                className="px-3 py-1.5 rounded-lg text-[8px] font-black uppercase tracking-widest border transition-all bg-rose-600 text-white border-rose-500 hover:bg-rose-500 shadow-lg"
                            >
                                Set Audit Target
                            </button>
                        </div>
                      </div>
                    ) : (
                      <span className="text-[10px] font-black italic uppercase tracking-widest">Awaiting Master Map...</span>
                    )}
                  </div>
                </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mb-10">
            {[
              { label: 'Equities Found', val: stats.found.toLocaleString(), color: 'text-white' },
              { label: 'Active Provider', val: activeAi, color: 'text-indigo-400' },
              { label: 'Cycle Time', val: `${stats.elapsed}s`, color: 'text-slate-400' },
              { label: 'Pipeline Phase', val: stats.phase, color: 'text-blue-400' }
            ].map((s, i) => (
              <div key={i} className="bg-black/40 p-4 md:p-6 rounded-3xl border border-white/5">
                <p className="text-[7px] font-black text-slate-600 uppercase mb-2 tracking-[0.2em]">{s.label}</p>
                <p className={`text-lg md:text-xl font-mono font-black italic ${s.color} truncate`}>{s.val}</p>
              </div>
            ))}
          </div>
          
           <div className="h-4 bg-black/60 rounded-2xl overflow-hidden border border-white/5 p-1">
            <div 
              className={`h-full rounded-xl transition-all duration-700 ${cooldown > 0 ? 'bg-red-600 animate-pulse' : 'bg-gradient-to-r from-blue-700 to-indigo-500'}`}
              style={{ width: stats.phase === 'Finalized' ? '100%' : cooldown > 0 ? `${(cooldown/60)*100}%` : `${Math.min(100, (stats.found / (stats.target || 10000)) * 100)}%` }}
            ></div>
          </div>

          {aiProposal && (
            <div className="mt-8 p-6 bg-blue-500/10 border border-blue-500/20 rounded-3xl animate-in fade-in slide-in-from-bottom-2">
                <div className="flex justify-between items-center mb-4">
                    <h4 className="text-sm font-black text-white italic uppercase tracking-wider">AI Filter Proposal</h4>
                    <span className="text-[8px] bg-blue-600 text-white px-2 py-0.5 rounded font-black uppercase">{aiProposal.regime} Regime</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                    <div>
                        <p className="text-[10px] text-slate-400 mb-2 uppercase font-bold">Suggested Constraints</p>
                        <div className="flex gap-4">
                            <div className="bg-black/40 p-4 rounded-2xl border border-white/5 flex-1">
                                <p className="text-[8px] text-slate-500 uppercase mb-1">Price Floor</p>
                                <p className="text-lg font-black text-blue-400">${aiProposal.suggestedPrice.toFixed(2)}</p>
                            </div>
                            <div className="bg-black/40 p-4 rounded-2xl border border-white/5 flex-1">
                                <p className="text-[8px] text-slate-500 uppercase mb-1">Vol Threshold</p>
                                <p className="text-lg font-black text-blue-400">{aiProposal.suggestedVolume.toLocaleString()}</p>
                            </div>
                        </div>
                    </div>
                    <div>
                        <p className="text-[10px] text-slate-400 mb-2 uppercase font-bold">Neural Logic</p>
                        <p className="text-xs text-slate-300 leading-relaxed italic">{aiProposal.reasoning}</p>
                    </div>
                </div>
                <button 
                  onClick={commitPurification}
                  disabled={loading}
                  className="w-full py-4 bg-emerald-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-emerald-900/20 active:scale-95 transition-all"
                >
                  {loading ? 'Committing Changes...' : 'Accept & Commit Stage 1'}
                </button>
            </div>
          )}
        </div>
      </div>

      <div className="xl:col-span-1">
        <div className="glass-panel h-[400px] lg:h-[680px] rounded-[32px] md:rounded-[40px] bg-slate-950 border-l-4 border-l-blue-600 flex flex-col p-6 shadow-2xl">
          <div className="flex items-center justify-between mb-8">
            <h3 className="font-black text-white text-[10px] uppercase tracking-[0.4em] italic">Synthesis_Terminal</h3>
          </div>
          <div ref={logRef} className="flex-1 bg-black/70 p-6 rounded-[32px] font-mono text-[9px] text-blue-300/60 overflow-y-auto no-scrollbar space-y-4 border border-white/5 leading-relaxed">
            {logs.map((l, i) => (
              <div key={i} className={`pl-4 border-l-2 ${l.includes('[OK]') ? 'border-emerald-500 text-emerald-400' : l.includes('[ERR]') ? 'border-red-500 text-red-400' : l.includes('[WARN]') ? 'border-amber-500 text-amber-400' : l.includes('[AUTO]') ? 'border-rose-500 text-rose-400' : 'border-blue-900'}`}>
                {l}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PreliminaryFilter;
