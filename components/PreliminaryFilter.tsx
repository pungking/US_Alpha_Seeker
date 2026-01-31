import React, { useState, useEffect, useRef } from 'react';
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
  
  const accessToken = sessionStorage.getItem('gdrive_access_token');
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  useEffect(() => {
    if (rawUniverse.length > 0) {
      const count = rawUniverse.filter(s => s.price >= minPrice && s.volume >= minVolume).length;
      setFilteredCount(count);
    }
  }, [minPrice, minVolume, rawUniverse]);

  // AUTO START LOGIC
  useEffect(() => {
    if (autoStart && autoStep === 'IDLE' && !loading) {
        addLog("AUTO-PILOT: Initiating Preliminary Filter Sequence...", "signal");
        setAutoStep('ANALYZING');
        syncAndAnalyzeMarket();
    }
  }, [autoStart, autoStep, loading]);

  // Step 2: Auto Commit after Analysis
  useEffect(() => {
      if (autoStart && autoStep === 'ANALYZING' && !loading && !isAnalyzing && (aiProposal || aiError)) {
          // Wait briefly for state to settle then commit
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
      setLoading(false);
      setIsAnalyzing(false);
      return;
    }
    setLoading(true);
    setIsAnalyzing(true);
    setIsManual(false);
    setAiError(null);
    setAiProposal(null);
    setActiveAi('Initializing');
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

      // AI Analysis Logic...
      const prices = data.map((s: any) => s.price).filter((p: any) => p > 0).sort((a: any, b: any) => a - b);
      const volumes = data.map((s: any) => s.volume).filter((v: any) => v > 0).sort((a: any, b: any) => a - b);
      
      const statsSummary = {
        date: new Date().toLocaleDateString(),
        totalCount: data.length,
        priceDistribution: {
            min: prices[0] || 0,
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

      // Try Gemini
      try {
          setActiveAi('Gemini 3 Pro');
          const geminiKey = process.env.API_KEY || API_CONFIGS.find(c => c.provider === ApiProvider.GEMINI)?.key || "";
          const ai = new GoogleGenAI({ apiKey: geminiKey });
          const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: prompt,
            config: { responseMimeType: "application/json" }
          });
          
          // Track Usage
          trackUsage(ApiProvider.GEMINI, response.usageMetadata?.totalTokenCount || 0);
          
          aiResult = sanitizeJson(response.text);
          usedProvider = 'Gemini 3 Pro';
      } catch (e: any) { /* Fallback handled below */ }

      // Try Perplexity if Gemini failed
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
              
              // Track Usage
              if (pJson.usage) trackUsage(ApiProvider.PERPLEXITY, pJson.usage.total_tokens || 0);
              
              aiResult = sanitizeJson(pJson.choices?.[0]?.message?.content);
              usedProvider = 'Perplexity Sonar';
          } catch (e: any) {}
      }

      if (aiResult) {
          setAiProposal(aiResult);
          setMinPrice(aiResult.suggestedPrice);
          setMinVolume(aiResult.suggestedVolume);
          addLog(`Strategy Generated by ${usedProvider}: [${aiResult.regime}]`, "ok");
          setActiveAi(usedProvider);
      } else {
          setAiError("AI Nodes Unresponsive. Default filters applied.");
          setMinPrice(2.0);
          setMinVolume(500000);
          setActiveAi('Default Logic');
      }

    } catch (e: any) {
      setAiError(e.message);
      addLog(`Critical Error: ${e.message}`, "err");
    } finally {
      setLoading(false);
      setIsAnalyzing(false);
    }
  };

  const handleManualChange = (type: 'price' | 'volume', val: number) => {
    setIsManual(true);
    if (type === 'price') setMinPrice(val);
    else setMinVolume(val);
  };

  const resetToAi = () => {
    if (aiProposal) {
      setMinPrice(aiProposal.suggestedPrice);
      setMinVolume(aiProposal.suggestedVolume);
      setIsManual(false);
      addLog("Reverted to AI Baseline.", "info");
    }
  };

  const commitPurification = async () => {
    // Ensure rawUniverse is populated before committing
    if (!accessToken || rawUniverse.length === 0) {
        if (autoStart && autoStep === 'COMMITTING') {
             // Retry later if somehow data isn't ready
             console.warn("Commit delayed: Data not ready");
             return; 
        }
        return;
    }
    
    setLoading(true);
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
      <div className="xl:col-span-3 space-y-6">
        <div className="glass-panel p-5 md:p-8 lg:p-10 rounded-[32px] md:rounded-[40px] border-t-2 border-t-emerald-500 shadow-2xl bg-slate-900/40 relative overflow-hidden">
          
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-6 md:mb-10 gap-6">
            <div className="flex items-center space-x-6">
              <div className={`w-12 h-12 md:w-14 md:h-14 rounded-3xl bg-emerald-600/10 flex items-center justify-center border border-emerald-500/20 ${loading ? 'animate-pulse' : ''}`}>
                <svg className={`w-5 h-5 md:w-6 md:h-6 text-emerald-500 ${isAnalyzing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              </div>
              <div>
                <h2 className="text-xl md:text-3xl font-black text-white italic tracking-tighter uppercase leading-none">Purification_Hub v2.2.0</h2>
                <div className="flex items-center space-x-3 mt-2">
                   <span className={`text-[8px] font-black px-2 py-0.5 rounded border uppercase tracking-widest transition-all duration-300 ${isAnalyzing ? 'border-yellow-500/20 bg-yellow-500/10 text-yellow-400' : 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400'}`}>
                     {isAnalyzing ? `Analyzing via ${activeAi}...` : activeAi !== 'Standby' ? `Active Brain: ${activeAi}` : 'System Standby'}
                   </span>
                   {aiError && (
                     <span className="text-[8px] font-black px-2 py-0.5 rounded border border-red-500/20 bg-red-500/10 text-red-400 uppercase tracking-widest">
                       AI_OFFLINE
                     </span>
                   )}
                   {autoStart && <span className="text-[8px] px-2 py-0.5 bg-rose-600 text-white rounded font-black uppercase animate-pulse">AUTO PILOT</span>}
                </div>
              </div>
            </div>
            <div className="flex gap-4 w-full lg:w-auto">
              <button 
                onClick={syncAndAnalyzeMarket} 
                disabled={loading}
                className={`flex-1 lg:flex-none px-6 py-4 md:px-8 md:py-5 bg-slate-800 text-slate-300 rounded-2xl text-[10px] font-black uppercase tracking-widest border border-white/5 hover:bg-slate-700 transition-all`}
              >
                {isAnalyzing ? 'Thinking...' : 'Sync & AI Analysis'}
              </button>
              <button 
                onClick={commitPurification} 
                disabled={loading || rawUniverse.length === 0}
                className={`flex-1 lg:flex-none px-8 py-4 md:px-12 md:py-5 bg-emerald-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-emerald-900/20 hover:scale-105 active:scale-95 transition-all disabled:opacity-50`}
              >
                {loading ? 'Processing...' : 'Commit Filter'}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8 mb-6 md:mb-10">
            {/* Price Filter */}
            <div className="bg-black/40 p-6 md:p-10 rounded-3xl border border-white/10 group hover:border-emerald-500/30 transition-all duration-500 relative">
              <div className="flex justify-between items-center mb-6 md:mb-8">
                 <div>
                   <p className="text-[9px] font-black text-emerald-400 uppercase tracking-widest mb-1">Price Floor Matrix</p>
                   <p className="text-2xl font-black text-white italic tracking-tighter">${minPrice.toFixed(2)}</p>
                 </div>
                 <div className="text-right">
                   <p className="text-[7px] font-black text-slate-500 uppercase mb-1">AI Recommendation</p>
                   <p className={`text-xs font-black italic ${isAnalyzing ? 'animate-pulse text-emerald-500/40' : 'text-emerald-500/80'}`}>
                     {isAnalyzing ? 'Thinking...' : aiProposal ? `$${aiProposal.suggestedPrice.toFixed(2)}` : aiError ? 'ERROR' : '$---'}
                   </p>
                 </div>
              </div>
              <div className="relative pt-2">
                <input 
                  type="range" min="1.0" max="10.0" step="0.1" value={minPrice} 
                  onChange={(e) => handleManualChange('price', parseFloat(e.target.value))}
                  className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-500" 
                />
                {aiProposal && (
                   <div className="absolute -top-1 w-0.5 h-4 bg-emerald-500/40 pointer-events-none transition-all duration-700"
                     style={{ left: `${((aiProposal.suggestedPrice - 1) / 9) * 100}%` }}>
                     <span className="absolute -top-6 left-1/2 -translate-x-1/2 text-[6px] font-black text-emerald-500/40 uppercase whitespace-nowrap">AI_REC</span>
                   </div>
                )}
              </div>
            </div>

            {/* Volume Filter */}
            <div className="bg-black/40 p-6 md:p-10 rounded-3xl border border-white/10 group hover:border-emerald-500/30 transition-all duration-500 relative">
              <div className="flex justify-between items-center mb-6 md:mb-8">
                 <div>
                   <p className="text-[9px] font-black text-emerald-400 uppercase tracking-widest mb-1">Volume Threshold</p>
                   <p className="text-2xl font-black text-white italic tracking-tighter">{(minVolume/1000).toFixed(0)}k</p>
                 </div>
                 <div className="text-right">
                   <p className="text-[7px] font-black text-slate-500 uppercase mb-1">AI Recommendation</p>
                   <p className={`text-xs font-black italic ${isAnalyzing ? 'animate-pulse text-emerald-500/40' : 'text-emerald-500/80'}`}>
                     {isAnalyzing ? 'Thinking...' : aiProposal ? `${(aiProposal.suggestedVolume/1000).toFixed(0)}k` : aiError ? 'ERROR' : '---'}
                   </p>
                 </div>
              </div>
              <div className="relative pt-2">
                <input 
                  type="range" min="50000" max="2000000" step="10000" value={minVolume} 
                  onChange={(e) => handleManualChange('volume', parseInt(e.target.value))}
                  className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-500" 
                />
                {aiProposal && (
                   <div className="absolute -top-1 w-0.5 h-4 bg-emerald-500/40 pointer-events-none transition-all duration-700"
                     style={{ left: `${((aiProposal.suggestedVolume - 50000) / 1950000) * 100}%` }}>
                     <span className="absolute -top-6 left-1/2 -translate-x-1/2 text-[6px] font-black text-emerald-500/40 uppercase whitespace-nowrap">AI_REC</span>
                   </div>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-10">
            <div className="lg:col-span-2 bg-gradient-to-br from-emerald-600/10 to-transparent p-6 md:p-10 rounded-3xl border border-emerald-500/10 relative">
              <p className="text-[8px] font-black text-emerald-400 uppercase tracking-[0.3em] mb-4">Targeted Alpha Universe</p>
              <div className="flex flex-col sm:flex-row items-start sm:items-baseline space-y-2 sm:space-y-0 sm:space-x-6">
                <span className="text-4xl md:text-6xl font-black text-white italic tracking-tighter">{filteredCount.toLocaleString()}</span>
                <div className="flex flex-col">
                   <span className="text-slate-500 text-[10px] uppercase font-bold tracking-widest italic">Purified Assets</span>
                   <span className="text-emerald-500/40 text-[8px] font-mono mt-1">Sieving {rawUniverse.length.toLocaleString()} Initial Tickers</span>
                </div>
              </div>
              {isManual && (
                <button onClick={resetToAi} className="absolute top-6 right-6 md:top-8 md:right-8 text-[7px] font-black text-amber-500 border border-amber-500/20 px-3 py-1.5 rounded-full bg-amber-500/5 hover:bg-amber-500 hover:text-white transition-all uppercase tracking-widest">
                  Reset to AI Baseline
                </button>
              )}
            </div>
            <div className="bg-black/20 p-6 md:p-10 rounded-3xl border border-white/5 flex flex-col justify-center items-center">
              <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-4 italic">Liquidity Purge</p>
              <p className="text-3xl md:text-4xl font-black text-rose-500/80 italic tracking-tighter">-{((rawUniverse.length - filteredCount) / (rawUniverse.length || 1) * 100).toFixed(1)}%</p>
              <p className="text-[8px] text-slate-600 uppercase mt-4 font-bold tracking-widest">{rawUniverse.length - filteredCount} Assets Excluded</p>
            </div>
          </div>

          {(aiProposal || aiError) && (
            <div className={`p-6 md:p-10 rounded-[32px] border animate-in fade-in slide-in-from-top-4 duration-500 ${aiError ? 'bg-red-500/5 border-red-500/20' : 'bg-emerald-500/5 border-emerald-500/20'}`}>
               <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center space-x-3">
                    <div className={`w-2 h-2 rounded-full animate-pulse ${aiError ? 'bg-red-500' : 'bg-emerald-500'}`}></div>
                    <h4 className={`text-[10px] font-black uppercase tracking-[0.4em] ${aiError ? 'text-red-500' : 'text-emerald-500'}`}>
                      {aiError ? 'AI Node Error Response' : `AI Reasoning (${activeAi}) — ${aiProposal?.regime}`}
                    </h4>
                  </div>
               </div>
               <div className="prose-report text-[11px] text-slate-400 leading-relaxed italic uppercase font-mono tracking-tighter">
                 {aiError || aiProposal?.reasoning}
               </div>
            </div>
          )}
        </div>
      </div>

      <div className="xl:col-span-1">
        <div className="glass-panel h-[400px] lg:h-[720px] rounded-[32px] md:rounded-[40px] bg-slate-950 border-l-4 border-l-emerald-600 flex flex-col p-6 shadow-2xl overflow-hidden">
          <div className="flex items-center justify-between mb-8 px-2">
            <h3 className="font-black text-white text-[10px] uppercase tracking-[0.4em] italic">Purification_Terminal</h3>
          </div>
          <div ref={logRef} className="flex-1 bg-black/70 p-6 rounded-[32px] font-mono text-[9px] text-emerald-300/60 overflow-y-auto no-scrollbar space-y-4 border border-white/5">
            {logs.map((l, i) => (
              <div key={i} className={`pl-4 border-l-2 transition-all duration-300 ${l.includes('[OK]') ? 'border-emerald-500 text-emerald-400 bg-emerald-500/5' : l.includes('[WARN]') ? 'border-amber-500 text-amber-400 bg-amber-500/5' : l.includes('[AUTO]') ? 'border-rose-500 text-rose-400' : 'border-blue-900'}`}>
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
