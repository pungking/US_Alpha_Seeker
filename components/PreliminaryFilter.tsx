
import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI } from "@google/genai";
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { GOOGLE_DRIVE_TARGET, API_CONFIGS } from '../constants';
import { ApiProvider } from '../types';
import { trackUsage, removeCitations } from '../services/intelligenceService';

// [STAGE 1 OUTPUT STRUCTURE]
interface MasterTicker {
  symbol: string;
  name?: string;
  price: number;
  volume: number;
  change: number;
  updated: string;
  type?: string;
  
  // Basic Fundamentals (Injected via Alpha Sieve)
  marketCap?: number;
  pe?: number;
  roe?: number;
  pbr?: number;
  debtToEquity?: number;
  
  // Meta
  sector?: string;
  industry?: string;
  source?: string;
  [key: string]: any;
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

// Markdown Styles
const MarkdownComponents: any = {
  p: (props: any) => <p className="mb-2 text-slate-300 leading-relaxed text-[11px]" {...props} />,
  ul: (props: any) => <ul className="list-disc pl-4 mb-2 space-y-1" {...props} />,
  li: (props: any) => <li className="text-slate-300 text-[11px]" {...props} />,
  strong: (props: any) => <strong className="text-emerald-400 font-bold" {...props} />,
  h1: (props: any) => <h1 className="text-sm font-bold text-white mb-2" {...props} />,
  h2: (props: any) => <h2 className="text-xs font-bold text-white mb-1" {...props} />,
};

const PreliminaryFilter: React.FC<Props> = ({ autoStart, onComplete }) => {
  const [loading, setLoading] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [activeAi, setActiveAi] = useState<string>('Standby'); 
  const [rawUniverse, setRawUniverse] = useState<MasterTicker[]>([]);
  const [filteredCount, setFilteredCount] = useState(0);
  const [logs, setLogs] = useState<string[]>(['> Filter_Node v8.0: Fundamentalist Protocol Ready.']);
  const [inspectionLogs, setInspectionLogs] = useState<string[]>([]); // Real-time data feed
  
  // Filter State
  const [minPrice, setMinPrice] = useState(2.0);
  const [minVolume, setMinVolume] = useState(500000);
  const [isManual, setIsManual] = useState(false);
  const [aiProposal, setAiProposal] = useState<AiProposal | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  
  // Injection Progress
  const [injectionProgress, setInjectionProgress] = useState({ current: 0, total: 0 });
  const [isInjecting, setIsInjecting] = useState(false);
  const [hasEnriched, setHasEnriched] = useState(false);
  
  // Automation State
  const [autoChainActive, setAutoChainActive] = useState(false);
  
  const accessToken = sessionStorage.getItem('gdrive_access_token');
  const logRef = useRef<HTMLDivElement>(null);
  const inspectorRef = useRef<HTMLDivElement>(null);

  // Auto-scroll logs
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  // Auto-scroll inspector
  useEffect(() => {
    if (inspectorRef.current) inspectorRef.current.scrollTop = inspectorRef.current.scrollHeight;
  }, [inspectionLogs]);

  useEffect(() => {
    if (rawUniverse.length > 0) {
      const count = rawUniverse.filter(s => s.price >= minPrice && s.volume >= minVolume).length;
      setFilteredCount(count);
    }
  }, [minPrice, minVolume, rawUniverse]);

  // AUTO START LOGIC
  useEffect(() => {
    if (autoStart && !loading && !hasEnriched) {
        addLog("AUTO-PILOT: Initiating One-Stop Sequence...", "signal");
        handleSyncAndAnalyze(true); 
    }
  }, [autoStart]);

  useEffect(() => {
      if (autoChainActive && !isAnalyzing && (aiProposal || aiError)) {
          const timer = setTimeout(() => startFundamentalInjection(true), 1500); 
          return () => clearTimeout(timer);
      }
  }, [autoChainActive, isAnalyzing, aiProposal, aiError]);

  const addLog = (m: string, t: 'info' | 'ok' | 'err' | 'warn' | 'signal' = 'info') => {
    const p = { info: '>', ok: '[OK]', err: '[ERR]', warn: '[WARN]', signal: '[AUTO]' };
    setLogs(prev => [...prev, `${p[t]} ${m}`].slice(-50));
  };

  const addInspectorLog = (msg: string, type: 'success' | 'partial' | 'fail' = 'partial') => {
      const time = new Date().toLocaleTimeString('en-US', { hour12: false, minute: "2-digit", second: "2-digit" });
      setInspectionLogs(prev => [...prev, `[${time}] ${msg}`].slice(-200));
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

  const handleSyncAndAnalyze = (forceAuto = false) => {
      setAutoChainActive(forceAuto); 
      syncAndAnalyzeMarket();
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
    setHasEnriched(false);
    setActiveAi('Initializing');
    addLog("Phase 1: Retrieving Global Universe from Stage 0...", "info");

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
      addLog(`Matrix Synced: ${data.length} assets loaded.`, "ok");

      const prices = data.map((s: any) => s.price).filter((p: any) => p > 0).sort((a: any, b: any) => a - b);
      const volumes = data.map((s: any) => s.volume).filter((v: any) => v > 0).sort((a: any, b: any) => a - b);
      
      const statsSummary = {
        date: new Date().toLocaleDateString(),
        totalCount: data.length,
        priceDistribution: {
            p25: prices[Math.floor(prices.length * 0.25)] || 0,
            p50: prices[Math.floor(prices.length * 0.50)] || 0,
        },
        volumeDistribution: {
            p25: volumes[Math.floor(volumes.length * 0.25)] || 0,
            p50: volumes[Math.floor(volumes.length * 0.50)] || 0,
        }
      };

      const prompt = `
      [Role: Senior Quantitative Market Strategist]
      Market Stats: Total ${statsSummary.totalCount}, Median Price $${statsSummary.priceDistribution.p50}, Median Vol ${statsSummary.volumeDistribution.p50}.
      
      Determine 'Price Floor' and 'Volume Threshold' to filter for liquid candidates.
      - Standard Anchor: Price > $2.00, Volume > 500k.
      - Adjustment: If median volume is low, lower threshold slightly to capture emerging runners.
      - Reasoning: Explain why in Korean using **Markdown** bullet points. Keep it concise.

      Return JSON: { "suggestedPrice": number, "suggestedVolume": number, "regime": "string", "reasoning": "string (Markdown)" }
      `;

      let aiResult = null;
      
      try {
          setActiveAi('Gemini 3 Pro');
          const geminiKey = process.env.API_KEY || API_CONFIGS.find(c => c.provider === ApiProvider.GEMINI)?.key || "";
          if (geminiKey) {
            const ai = new GoogleGenAI({ apiKey: geminiKey });
            const response = await ai.models.generateContent({
                model: 'gemini-3-flash-preview',
                contents: prompt,
                config: { responseMimeType: "application/json" }
            });
            trackUsage(ApiProvider.GEMINI, response.usageMetadata?.totalTokenCount || 0);
            aiResult = sanitizeJson(response.text);
          }
      } catch (e: any) { 
          addLog(`Gemini Analysis Failed: ${e.message}`, "warn");
      }

      if (!aiResult) {
         try {
            setActiveAi('Perplexity Sonar');
            const perplexityKey = API_CONFIGS.find(c => c.provider === ApiProvider.PERPLEXITY)?.key || "";
            if (perplexityKey) {
                const res = await fetch('https://api.perplexity.ai/chat/completions', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${perplexityKey}` },
                    body: JSON.stringify({
                        model: 'sonar-pro', 
                        messages: [{ role: "user", content: prompt + " Return JSON only." }]
                    })
                });
                const json = await res.json();
                if (json.choices && json.choices[0]) {
                    aiResult = sanitizeJson(json.choices[0].message.content);
                }
            }
         } catch(e) {
             addLog(`Perplexity Fallback Failed`, "warn");
         }
      }

      if (aiResult) {
          if (aiResult.reasoning) {
              aiResult.reasoning = removeCitations(aiResult.reasoning);
          }
          setAiProposal(aiResult);
          setMinPrice(aiResult.suggestedPrice);
          setMinVolume(aiResult.suggestedVolume);
          addLog(`Strategy: [${aiResult.regime}] P>$${aiResult.suggestedPrice} V>${(aiResult.suggestedVolume/1000).toFixed(0)}k`, "ok");
      } else {
          setAiError("AI Offline. Using Defaults.");
          setMinPrice(2.0);
          setMinVolume(500000);
      }

    } catch (e: any) {
      setAiError(e.message);
      addLog(`Critical Error: ${e.message}`, "err");
    } finally {
      setLoading(false);
      setIsAnalyzing(false);
    }
  };

  const startFundamentalInjection = async (shouldAutoCommit: boolean) => {
      setIsInjecting(true);
      setLoading(true);
      setInspectionLogs([]); 
      
      const survivors = rawUniverse.filter(s => s.price >= minPrice && s.volume >= minVolume);
      addLog(`Injection Phase: Gathering Fundamentals (FMP/Yahoo/Calculated)...`, "info");
      setInjectionProgress({ current: 0, total: survivors.length });

      const enrichedTickers: MasterTicker[] = [];
      const BATCH_SIZE = 10; 
      
      const survivorMap = new Map(survivors.map(s => [s.symbol, s]));

      for (let i = 0; i < survivors.length; i += BATCH_SIZE) {
          const batch = survivors.slice(i, i + BATCH_SIZE);
          const symbolString = batch.map(t => t.symbol).join(',');

          try {
               const res = await fetch(`/api/msn?symbols=${symbolString}`);
               
               if (res.ok) {
                   const data = await res.json();
                   if (Array.isArray(data)) {
                       data.forEach((item: any) => {
                           const original = survivorMap.get(item.symbol);
                           if (original) {
                               const enriched = {
                                   ...original,
                                   pe: item.peRatio || original.pe,
                                   roe: item.returnOnEquity || original.roe,
                                   pbr: item.priceToBook || original.pb,
                                   debtToEquity: item.debtToEquity || original.debtToEquity,
                                   marketCap: item.marketCap || original.marketCap,
                                   price: item.price || original.price, // Update price if fresh
                                   source: (original.source || '') + (item.source ? `+${item.source}` : '')
                               };
                               enrichedTickers.push(enriched);
                               
                               // [ENHANCED LOGGING] Explicitly show retrieved metrics
                               let logParts = [];
                               if (enriched.pe) logParts.push(`PE:${enriched.pe.toFixed(1)}`);
                               if (enriched.roe) logParts.push(`ROE:${enriched.roe.toFixed(1)}%`);
                               if (enriched.pbr) logParts.push(`PBR:${enriched.pbr.toFixed(1)}`);
                               
                               if (logParts.length > 0) {
                                  addInspectorLog(`${item.symbol}: ${logParts.join(' | ')}`, 'success');
                               } else if (enriched.price > 0) {
                                  addInspectorLog(`${item.symbol}: PRICE ONLY [$${enriched.price}]`, 'partial');
                               } else {
                                  addInspectorLog(`${item.symbol}: FAILED`, 'fail');
                               }
                           }
                       });
                   }
               } else {
                   batch.forEach(b => enrichedTickers.push(b));
                   addInspectorLog(`Batch Error: Keeping Originals`, 'partial');
               }
          } catch (e) {
               batch.forEach(b => enrichedTickers.push(b));
               addInspectorLog(`Net Error: Keeping Originals`, 'fail');
          }

          setInjectionProgress({ current: Math.min(i + BATCH_SIZE, survivors.length), total: survivors.length });
          await new Promise(r => setTimeout(r, 200)); 
      }

      const validEnrichmentMap = new Map(enrichedTickers.map(t => [t.symbol, t]));
      const newUniverse = rawUniverse.map(t => validEnrichmentMap.get(t.symbol) || t);
      
      const enrichedCount = enrichedTickers.filter(t => t.pe || t.roe).length;
      addLog(`Injection Complete. ${enrichedCount} Fundamental Hits. ${enrichedTickers.length} Prices Verified.`, "ok");
      
      setRawUniverse(newUniverse);
      setHasEnriched(true);

      if (shouldAutoCommit) {
           addLog("Auto-Chain: Proceeding to Commit...", "signal");
           commitPurification(enrichedTickers.length > 0 ? enrichedTickers : survivors); 
      } else {
           addLog("Ready for Commit. Adjust sliders if needed, then click 'Finalize & Commit'.", "info");
           setLoading(false);
           setIsInjecting(false);
           setAutoChainActive(false);
      }
  };

  const commitPurification = async (finalList?: MasterTicker[]) => {
    if (!accessToken) return;
    setLoading(true);
    
    let listToSave = finalList;
    if (!listToSave) {
        listToSave = rawUniverse.filter(s => s.price >= minPrice && s.volume >= minVolume);
    }
    
    addLog(`Phase 3: Committing ${listToSave.length} assets to Stage 1 Vault...`, "info");

    try {
      const folderId = await ensureFolder(accessToken, GOOGLE_DRIVE_TARGET.stage1SubFolder);
      const now = new Date();
      const kstDate = new Date(now.getTime() + 9 * 60 * 60 * 1000);
      const timestamp = kstDate.toISOString().replace('T', '_').replace(/:/g, '-').split('.')[0];
        
      const fileName = `STAGE1_PURIFIED_UNIVERSE_${timestamp}.json`;
      
      const payload = {
        manifest: { version: "8.0.0", regime: aiProposal?.regime || "Manual", filters: { minPrice, minVolume }, timestamp: new Date().toISOString(), note: "Fundamentals Injected (Yahoo+FMP)" },
        investable_universe: listToSave
      };

      const meta = { name: fileName, parents: [folderId], mimeType: 'application/json' };
      const form = new FormData();
      form.append('metadata', new Blob([JSON.stringify(meta)], { type: 'application/json' }));
      form.append('file', new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));

      await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST', headers: { 'Authorization': `Bearer ${accessToken}` }, body: form
      });

      addLog(`Success: Stage 1 Complete. Data Saved.`, "ok");
      
      if (onComplete) onComplete();
      setAutoChainActive(false); 

    } catch (e: any) {
      addLog(`Vault Error: ${e.message}`, "err");
    } finally {
      setLoading(false);
      setIsInjecting(false);
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

  const handleManualChange = (type: 'price' | 'volume', val: number) => {
    setIsManual(true);
    setAutoChainActive(false); 
    if (type === 'price') setMinPrice(val);
    else setMinVolume(val);
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
      <div className="xl:col-span-3 space-y-6">
        <div className="glass-panel p-5 md:p-8 lg:p-10 rounded-[32px] md:rounded-[40px] border-t-2 border-t-emerald-500 shadow-2xl bg-slate-900/40 relative overflow-hidden">
          
          {/* Header */}
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-6 md:mb-10 gap-6">
            <div className="flex items-center space-x-6">
              <div className={`w-12 h-12 md:w-14 md:h-14 rounded-3xl bg-emerald-600/10 flex items-center justify-center border border-emerald-500/20 ${loading ? 'animate-pulse' : ''}`}>
                <svg className={`w-5 h-5 md:w-6 md:h-6 text-emerald-500 ${isAnalyzing || isInjecting ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              </div>
              <div>
                <h2 className="text-xl md:text-3xl font-black text-white italic tracking-tighter uppercase leading-none">Purification_Hub v8.0</h2>
                <div className="flex items-center space-x-3 mt-2">
                   <span className={`text-[8px] font-black px-2 py-0.5 rounded border uppercase tracking-widest transition-all duration-300 ${isInjecting ? 'border-blue-500/20 bg-blue-500/10 text-blue-400' : isAnalyzing ? 'border-yellow-500/20 bg-yellow-500/10 text-yellow-400' : 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400'}`}>
                     {isInjecting ? `Fundamentalist: ${injectionProgress.current}/${injectionProgress.total}` : isAnalyzing ? `Analyzing via ${activeAi}...` : 'System Standby'}
                   </span>
                   {autoStart && <span className="text-[8px] px-2 py-0.5 bg-rose-600 text-white rounded font-black uppercase animate-pulse">AUTO PILOT</span>}
                </div>
              </div>
            </div>
            <div className="flex gap-4 w-full lg:w-auto">
              <button 
                onClick={() => handleSyncAndAnalyze(true)} 
                disabled={loading}
                className={`flex-1 lg:flex-none px-6 py-4 md:px-8 md:py-5 bg-slate-800 text-slate-300 rounded-2xl text-[10px] font-black uppercase tracking-widest border border-white/5 hover:bg-slate-700 transition-all ${autoChainActive ? 'ring-1 ring-emerald-500/50' : ''}`}
              >
                {isAnalyzing ? 'Processing...' : 'Sync & AI Analysis (One-Stop)'}
              </button>
              
              <button 
                onClick={() => commitPurification()} 
                disabled={loading || rawUniverse.length === 0 || (!hasEnriched && !autoChainActive)}
                className={`flex-1 lg:flex-none px-8 py-4 md:px-12 md:py-5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${
                    loading 
                      ? 'bg-emerald-800 text-emerald-200/50 shadow-inner scale-95 cursor-wait border-t border-black/20' 
                      : hasEnriched
                          ? 'bg-blue-600 text-white shadow-xl shadow-blue-900/20 hover:scale-105 active:scale-95'
                          : 'bg-emerald-600 text-white shadow-xl shadow-emerald-900/20 hover:scale-105 active:scale-95 disabled:opacity-50 disabled:scale-100 disabled:shadow-none'
                }`}
              >
                {isInjecting ? 'Injecting Data...' : hasEnriched ? 'Re-Commit Filter' : 'Force Commit'}
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
                   <span className="text-emerald-500/40 text-[8px] font-mono mt-1">Ready for Fundamental Injection</span>
                </div>
              </div>
            </div>
            
            {/* Injection Progress Bar */}
            <div className="bg-black/20 p-6 md:p-10 rounded-3xl border border-white/5 flex flex-col justify-center items-center">
              <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-4 italic">Injection Status</p>
              {isInjecting ? (
                  <div className="w-full">
                      <div className="flex justify-between text-[10px] font-mono text-blue-400 mb-2">
                          <span>Progress</span>
                          <span>{Math.round((injectionProgress.current / (injectionProgress.total || 1)) * 100)}%</span>
                      </div>
                      <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                          <div className="h-full bg-blue-500 transition-all duration-300" style={{ width: `${(injectionProgress.current / (injectionProgress.total || 1)) * 100}%` }}></div>
                      </div>
                  </div>
              ) : (
                  <p className="text-2xl font-black text-slate-600 italic tracking-tighter">{hasEnriched ? 'DONE' : 'IDLE'}</p>
              )}
            </div>
          </div>
          
          {/* AI Reasoning Block */}
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
               <div className="prose-report text-xs text-slate-300 leading-relaxed font-medium">
                 {aiError ? (
                     <span className="font-mono text-rose-400">{aiError}</span>
                 ) : (
                     <ReactMarkdown remarkPlugins={[remarkGfm]} components={MarkdownComponents}>
                        {aiProposal?.reasoning || ""}
                     </ReactMarkdown>
                 )}
               </div>
            </div>
          )}
        </div>
      </div>

      <div className="xl:col-span-1">
        <div className="glass-panel h-[400px] lg:h-[720px] rounded-[32px] md:rounded-[40px] bg-slate-950 border-l-4 border-l-emerald-600 flex flex-col p-6 shadow-2xl overflow-hidden relative">
          
          {/* Split View: Top Half for System Logs */}
          <div className="flex flex-col h-1/2 border-b border-white/10 pb-4 mb-4">
              <div className="flex items-center justify-between mb-4 px-2">
                <h3 className="font-black text-white text-[10px] uppercase tracking-[0.4em] italic">Purification_Terminal</h3>
              </div>
              <div ref={logRef} className="flex-1 bg-black/70 p-4 rounded-[24px] font-mono text-[9px] text-emerald-300/60 overflow-y-auto no-scrollbar space-y-3 border border-white/5">
                {logs.map((l, i) => (
                  <div key={i} className={`pl-4 border-l-2 transition-all duration-300 ${l.includes('[OK]') ? 'border-emerald-500 text-emerald-400 bg-emerald-500/5' : l.includes('[WARN]') ? 'border-amber-500 text-amber-400 bg-amber-500/5' : l.includes('[AUTO]') ? 'border-rose-500 text-rose-400' : 'border-blue-900'}`}>
                    {l}
                  </div>
                ))}
              </div>
          </div>

          {/* Bottom Half for Live Data Stream */}
          <div className="flex flex-col h-1/2">
              <div className="flex items-center justify-between mb-2 px-2">
                <h3 className="font-black text-slate-400 text-[9px] uppercase tracking-[0.2em]">Live Data Stream</h3>
                {isInjecting && <span className="text-[8px] text-emerald-500 animate-pulse">● ACTIVE</span>}
              </div>
              <div ref={inspectorRef} className="flex-1 bg-black/40 p-4 rounded-[24px] font-mono text-[8px] text-slate-400 overflow-y-auto custom-scrollbar border border-white/5">
                  {inspectionLogs.length === 0 ? (
                      <div className="h-full flex items-center justify-center text-slate-600 italic">Waiting for injection...</div>
                  ) : (
                      <div className="space-y-1">
                          {inspectionLogs.map((msg, i) => {
                             // Dynamic Color for Partial Success
                             let color = 'text-amber-400';
                             if (msg.includes('FULL') || msg.includes('success')) color = 'text-emerald-400';
                             else if (msg.includes('BASIC') || msg.includes('partial')) color = 'text-yellow-300';
                             else if (msg.includes('FAIL') || msg.includes('Error')) color = 'text-rose-400';
                             
                             return <div key={i} className={`${color} border-b border-white/5 pb-0.5 mb-0.5 last:border-0`}>{msg}</div>
                          })}
                      </div>
                  )}
              </div>
          </div>

        </div>
      </div>
    </div>
  );
};

export default PreliminaryFilter;
