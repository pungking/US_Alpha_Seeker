
import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI } from "@google/genai";
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { GOOGLE_DRIVE_TARGET, API_CONFIGS, GEMINI_MODELS } from '../constants';
import { ApiProvider } from '../types';
import { trackUsage, removeCitations } from '../services/intelligenceService';
import { fetchPortalIndices } from '../services/portalIndicesService';

// [STAGE 0 -> 1 DATA STRUCTURE]
interface MasterTicker {
  symbol: string;
  name: string;
  price: number;
  volume: number;
  marketCap: number;
  sector: string;
  industry: string;
  pe: number;
  roe: number;
  targetMeanPrice: number; // Critical for Stage 3 & 5
  // ... other metrics from Stage 0 are preserved
  [key: string]: any;
}

interface MarketContext {
    vix: number;
    spxChange: number;
    nasdaqChange: number;
    status: string;
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
  
  // Data State
  const [rawUniverse, setRawUniverse] = useState<MasterTicker[]>([]);
  const [filteredCount, setFilteredCount] = useState(0);
  const [marketContext, setMarketContext] = useState<MarketContext | null>(null);

  // Filter State
  const [minPrice, setMinPrice] = useState(2.0);
  const [minVolume, setMinVolume] = useState(500000);
  const [aiProposal, setAiProposal] = useState<AiProposal | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  
  // Logs & UI
  const [logs, setLogs] = useState<string[]>(['> Filter_Node v11.7: Resilience Protocol Active.']);
  const logRef = useRef<HTMLDivElement>(null);
  const accessToken = sessionStorage.getItem('gdrive_access_token');

  // Auto-scroll logs
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  // Update filtered count when thresholds change
  useEffect(() => {
    if (rawUniverse.length > 0) {
      // VISUAL ONLY: Shows count based on UI sliders.
      // NOTE: Actual commit will enforce PE/ROE/Target checks.
      const count = rawUniverse.filter(s => s.price >= minPrice && s.volume >= minVolume).length;
      setFilteredCount(count);
    }
  }, [minPrice, minVolume, rawUniverse]);

  // AUTO START LOGIC
  useEffect(() => {
    if (autoStart && !loading && rawUniverse.length === 0) {
        addLog("AUTO-PILOT: Initiating Context-Aware Filtration Sequence...", "signal");
        handleSyncAndAnalyze(true); 
    }
  }, [autoStart]);

  const addLog = (m: string, t: 'info' | 'ok' | 'err' | 'warn' | 'signal' = 'info') => {
    const p = { info: '>', ok: '[OK]', err: '[ERR]', warn: '[WARN]', signal: '[AUTO]' };
    setLogs(prev => [...prev, `${p[t]} ${m}`].slice(-50));
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

  // Helper for strict timeouts to prevent hanging
  const timeoutPromise = (ms: number, msg: string) => new Promise((_, reject) => 
      setTimeout(() => reject(new Error(msg)), ms)
  );

  const handleSyncAndAnalyze = async (autoCommit = false) => {
      if (!accessToken) {
          addLog("Cloud link required. Check Auth Status.", "warn");
          return;
      }

      setLoading(true);
      setIsAnalyzing(true);
      setAiError(null);
      setAiProposal(null);
      setActiveAi('Initializing');

      try {
          // 1. Fetch Market Context (VIX, Indices)
          addLog("Phase 1: Analyzing Market Conditions (VIX/Macro)...", "info");
          const context = await fetchMarketContext();
          setMarketContext(context);
          addLog(`Market Regime: VIX ${context.vix} | NASDAQ ${context.nasdaqChange}%`, "ok");

          // 2. Load Stage 0 Data
          addLog("Phase 2: Retrieving Global Universe from Stage 0...", "info");
          const q = encodeURIComponent(`name contains 'STAGE0_MASTER_UNIVERSE' and trashed = false`);
          const listRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&orderBy=createdTime desc&pageSize=1`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
          }).then(r => r.json());

          if (!listRes.files?.length) throw new Error("Stage 0 Data not found. Please run Stage 0 first.");

          const content = await fetch(`https://www.googleapis.com/drive/v3/files/${listRes.files[0].id}?alt=media`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
          }).then(r => r.json());

          // CRITICAL: Capture data in local scope to avoid State Race Conditions
          const data: MasterTicker[] = content.universe || [];
          setRawUniverse(data); // State update for UI
          addLog(`Matrix Synced: ${data.length} rich assets loaded.`, "ok");

          // 3. AI Analysis for Thresholds
          addLog("Phase 3: Calculating Optimal Thresholds via AI...", "info");
          addLog("ICT 기반 유니버스 정제 중...", "info"); // [NEW] ICT Log
          
          // CRITICAL: Pass data directly, receive proposal directly
          const proposal = await runAiAnalysis(data, context);

          // 4. Auto Commit if requested
          if (autoCommit && proposal) {
              addLog("Auto-Committing AI Proposal...", "signal");
              // Pass EXPLICIT values to commit, don't rely on state
              await commitPurification(data, proposal.suggestedPrice, proposal.suggestedVolume, proposal);
          } else {
              setLoading(false);
              setIsAnalyzing(false);
          }

      } catch (e: any) {
          setAiError(e.message);
          addLog(`Critical Error: ${e.message}`, "err");
          setLoading(false);
          setIsAnalyzing(false);
      }
  };

  const fetchMarketContext = async (): Promise<MarketContext> => {
      try {
          const data = await fetchPortalIndices();
          const vix = data.find((i: any) => i.symbol === 'VIX' || i.symbol === '.VIX')?.price || 20;
          const ndx = data.find((i: any) => i.symbol === 'NASDAQ' || i.symbol === 'NDX')?.change || 0;
          const spx = data.find((i: any) => i.symbol === 'SP500' || i.symbol === 'SPX')?.change || 0;
          
          return {
              vix,
              spxChange: spx,
              nasdaqChange: ndx,
              status: vix > 25 ? "Risk-Off (High Fear)" : vix < 15 ? "Risk-On (Greed)" : "Neutral"
          };
      } catch (e) {
          addLog("Market Context Fetch Failed. Using Default.", "warn");
          return { vix: 20, spxChange: 0, nasdaqChange: 0, status: "Unknown (Default)" };
      }
  };

  // [MODIFIED] Now returns the proposal object for immediate use, with fallback logic
  const runAiAnalysis = async (universe: MasterTicker[], context: MarketContext): Promise<AiProposal | null> => {
      const prices = universe.map(s => s.price).filter(p => p > 0).sort((a, b) => a - b);
      const volumes = universe.map(s => s.volume).filter(v => v > 0).sort((a, b) => a - b);
      
      const stats = {
          count: universe.length,
          priceMedian: prices[Math.floor(prices.length * 0.5)] || 0,
          volMedian: volumes[Math.floor(volumes.length * 0.5)] || 0,
      };

      const prompt = `
      [Role: Hedge Fund Risk Manager & ICT Specialist]
      Current Market Context:
      - VIX: ${context.vix} (${context.status})
      - NASDAQ Change: ${context.nasdaqChange}%
      
      Universe Stats:
      - Total Assets: ${stats.count}
      - Median Price: $${stats.priceMedian}
      - Median Volume: ${stats.volMedian}

      [Task]
      Determine optimal 'Price Floor' (minPrice) and 'Volume Threshold' (minVolume) to filter this universe for a Swing Trading Strategy, incorporating ICT (Inner Circle Trader) concepts.
      
      [STRATEGIC INSTRUCTION: SMART MONEY TRACKING]
      You track the "Smart Money". Even if market conditions are poor (High VIX), DO NOT blindly raise thresholds.
      - **Hidden Gems**: Do not miss low-priced stocks ($2-$5) showing **High Relative Volume (RVOL)** or **ICT Accumulation** signs.
      - **Flexibility**: Propose thresholds that capture "Diamonds in the rough" rather than just safe, large-cap stocks.
      - **Diversity**: Ensure the thresholds allow for a diversified universe across different sectors. Do not extinguish entire sectors with overly strict limits.

      ICT Focus:
      1. **Discount Zone**: Prioritize stocks that have retraced from 52-week highs into a 'Discount Zone' (below Equilibrium).
      2. **Displacement**: Look for signs of institutional sponsorship via high Relative Volume (RVOL).
      3. **Liquidity**: Ensure sufficient volume to support institutional accumulation.

      Rules:
      1. **High VIX (>25)**: Increase thresholds (Flight to quality, avoid illiquid penny stocks).
      2. **Low VIX (<15)**: Lower thresholds (Risk-on, allow speculative runners).
      3. **Volume**: Should ensure liquidity. Typically > 300k, but adjust based on VIX.
      4. **Price**: Typically > $2.00 to avoid pink sheets.

      [Regime Definition]
      Classify the current market regime using ICT terms:
      - 'Accumulation': Low volatility, range-bound, smart money buying.
      - 'Manipulation': False breakouts, liquidity sweeps (Judas Swing).
      - 'Distribution': High volatility, smart money selling into strength.
      - 'Expansion': Strong trend, displacement.

      Return JSON ONLY: { 
        "suggestedPrice": number, 
        "suggestedVolume": number, 
        "regime": "Accumulation | Manipulation | Distribution | Expansion", 
        "reasoning": "string (Korean Markdown, explain why these thresholds favor ICT setups like liquidity sweeps or OTE)" 
      }
      `;

      let aiResult: AiProposal | null = null;
      const geminiChain = GEMINI_MODELS.CHAIN;

      const compactGeminiError = (error: any): string => {
          const raw = String(error?.message || error || '');
          return raw.length > 240 ? `${raw.slice(0, 240)}...` : raw;
      };

      const isGeminiQuotaHardStop = (error: any): boolean => {
          const msg = String(error?.message || error || '').toLowerCase();
          return (
              msg.includes('resource_exhausted') &&
              (msg.includes('limit: 0') || msg.includes('free_tier'))
          );
      };

      const geminiNodeName = (model: string): string => {
          if (model.includes('pro')) return 'Gemini Pro';
          if (model.includes('lite')) return 'Gemini Flash Lite';
          return 'Gemini Flash';
      };

      // Helper: Perplexity Call
      const callPerplexity = async (): Promise<AiProposal | null> => {
          try {
              setActiveAi('Perplexity Sonar');
              
              // Small delay to ensure UI updates
              await new Promise(r => setTimeout(r, 1500));

              const perplexityConfig = API_CONFIGS.find(c => c.provider === ApiProvider.PERPLEXITY) || API_CONFIGS.find(c => c.provider === 'Perplexity' as ApiProvider);
              let perplexityKey = perplexityConfig?.key;

              if (!perplexityKey) {
                   perplexityKey = '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'; 
              }
              
              if (perplexityKey) {
                  const perplexityRequest = fetch('https://api.perplexity.ai/chat/completions', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${perplexityKey}` },
                      body: JSON.stringify({
                          model: 'sonar-pro', 
                          messages: [{ role: "user", content: prompt + " Return JSON only." }]
                      })
                  });

                  const res: any = await Promise.race([perplexityRequest, timeoutPromise(15000, "Perplexity Timeout")]);
                  const json = await res.json();
                  
                  if (!res.ok) throw new Error(`Perplexity API Error: ${res.status}`);
                  
                  if (json.usage) trackUsage(ApiProvider.PERPLEXITY, json.usage.total_tokens || 0);

                  if (json.choices && json.choices[0]) {
                      return sanitizeJson(json.choices[0].message.content);
                  }
              }
          } catch (e: any) {
              trackUsage(ApiProvider.PERPLEXITY, 0, true, e.message);
              addLog(`Perplexity Fallback Failed: ${e.message}`, "warn");
          }
          return null;
      };

      // [GEMINI AUTO-DEGRADE CHAIN] model not found => next model, quota hard-stop => immediate Perplexity
      try {
          // Explicitly search for Gemini Config
          const geminiConfig = API_CONFIGS.find(c => c.provider === ApiProvider.GEMINI);
          const geminiKey = process.env.API_KEY || geminiConfig?.key || "";
          
          if (geminiKey) {
              const ai = new GoogleGenAI({ apiKey: geminiKey });

              for (let i = 0; i < geminiChain.length; i++) {
                  const model = geminiChain[i];
                  const nodeName = geminiNodeName(model);
                  setActiveAi(nodeName);
                  const timeoutMs = model.includes('pro') ? 80000 : 30000;

                  try {
                      const request = ai.models.generateContent({
                          model,
                          contents: prompt,
                          config: { responseMimeType: "application/json" }
                      });
                      const response: any = await Promise.race([request, timeoutPromise(timeoutMs, `${nodeName} Timeout`)]);
                      trackUsage(ApiProvider.GEMINI, response.usageMetadata?.totalTokenCount || 0);
                      aiResult = sanitizeJson(response.text);
                      if (aiResult) break;
                      throw new Error(`${model} returned empty payload`);
                  } catch (geminiError: any) {
                      const message = compactGeminiError(geminiError);

                      if (isGeminiQuotaHardStop(geminiError)) {
                          throw new Error(`GEMINI_QUOTA_HARD_STOP:${message}`);
                      }

                      if (i < geminiChain.length - 1) {
                          addLog(`[RETRY] ${nodeName} Failed (${message}). Trying ${geminiNodeName(geminiChain[i + 1])}...`, "warn");
                          continue;
                      }

                      throw geminiError;
                  }
              }
          } else {
              throw new Error("Gemini Key Not Found");
          }
      } catch (geminiError: any) {
          // [STAGE 3] Perplexity
          addLog(`[FALLBACK] Gemini Ecosystem Down (${compactGeminiError(geminiError)}). Engaging Perplexity...`, "warn");
          aiResult = await callPerplexity();
      }

      // 3. Final Safety Net (Hardcoded Default) - Prevents Hanging
      if (aiResult) {
          if (aiResult.reasoning) aiResult.reasoning = removeCitations(aiResult.reasoning);
          setAiProposal(aiResult);
          // Set UI State (for visual feedback)
          setMinPrice(aiResult.suggestedPrice);
          setMinVolume(aiResult.suggestedVolume);
          addLog(`Strategy Adopted: [${aiResult.regime}] P>$${aiResult.suggestedPrice} V>${(aiResult.suggestedVolume/1000).toFixed(0)}k`, "ok");
          return aiResult;
      } else {
          setAiError("AI Offline. Applying Default Safety Filters.");
          addLog("All AI Nodes Unresponsive. Using Default Safety Protocols.", "err");
          // Default Fallback
          const defaultProposal = { suggestedPrice: 2.0, suggestedVolume: 500000, regime: "Default_Safe_Mode", reasoning: "AI Failure Fallback: Standard Swing Settings Applied." };
          setMinPrice(2.0);
          setMinVolume(500000);
          setAiProposal(defaultProposal);
          return defaultProposal;
      }
  };

  // [CRITICAL FIX] Accept direct data arguments to bypass State Async lag
  const commitPurification = async (
      explicitData?: MasterTicker[], 
      explicitPrice?: number, 
      explicitVolume?: number,
      explicitProposal?: AiProposal
  ) => {
    if (!accessToken) return;
    
    // Use explicit args if provided (Auto-Pilot path), otherwise use State (Manual path)
    const dataToFilter = explicitData || rawUniverse;
    const targetPrice = explicitPrice !== undefined ? explicitPrice : minPrice;
    const targetVolume = explicitVolume !== undefined ? explicitVolume : minVolume;
    const activeProposal = explicitProposal || aiProposal;

    if (!dataToFilter || dataToFilter.length === 0) {
        addLog("Commit Failed: No universe data available.", "err");
        setLoading(false);
        return;
    }

    setLoading(true);

    // [V11.3 UPDATE] Enhanced Hard Quality Gates
    // Added PE > 0, ROE > 0 AND Target Price > 0 to prevent data poisoning downstream
    const filteredList = dataToFilter.reduce<MasterTicker[]>((acc, s) => {
        // [DYNAMIC SCALING] Small Cap Protection Logic
        // If Market Cap <= 300M, lower volume threshold by 40% (0.6 multiplier) to catch "Hidden Gems"
        let effectiveMinVolume = targetVolume;
        const marketCap = s.marketCap || 0;
        
        if (marketCap > 0 && marketCap <= 300000000) {
             effectiveMinVolume = targetVolume * 0.6;
        }

        const passesFilters = 
            s.price >= targetPrice && 
            s.volume >= effectiveMinVolume &&
            (s.pe > 0 || s.per > 0) && // Must have positive earnings
            (s.roe > 0) &&             // Must be profitable
            (s.targetMeanPrice > 0);   // Must have Analyst Target Price

        if (passesFilters) {
            const newItem = { ...s };
            
            // [LINEAGE TAGGING] Traceability for downstream analysis
            newItem.origin = activeProposal ? "AI_FILTER" : "FALLBACK_RECOVERY";
            
            // Determine Discovery Tag based on characteristics
            if (marketCap > 0 && marketCap <= 300000000 && s.volume < targetVolume) {
                newItem.discoveryTag = "SmallCap_Gem";
            } else if (s.price < 5 && s.volume > targetVolume * 2) {
                newItem.discoveryTag = "High_RVOL_Penny";
            } else if (s.price < s.targetMeanPrice * 0.6) {
                newItem.discoveryTag = "Deep_Value_Discount";
            } else {
                newItem.discoveryTag = "Standard_Growth";
            }
            
            acc.push(newItem);
        }
        return acc;
    }, []);
    
    addLog(`Phase 4: Committing ${filteredList.length} assets to Stage 1 Vault...`, "info");
    addLog(`Commit Filters: P>=${targetPrice}, V>=${targetVolume} (Scaled for SmallCaps), PE>0, ROE>0`, "info");

    try {
      const folderId = await ensureFolder(accessToken, GOOGLE_DRIVE_TARGET.stage1SubFolder);
      const now = new Date();
      const kstDate = new Date(now.getTime() + 9 * 60 * 60 * 1000);
      const timestamp = kstDate.toISOString().replace('T', '_').replace(/:/g, '-').split('.')[0];
        
      const fileName = `STAGE1_PURIFIED_UNIVERSE_${timestamp}.json`;
      
      const payload = {
        manifest: { 
            version: "11.3.0", 
            regime: activeProposal?.regime || "Manual", 
            filters: { minPrice: targetPrice, minVolume: targetVolume, hardGate: "PE>0 && ROE>0 && Target>0" }, 
            timestamp: new Date().toISOString(), 
            note: "Enhanced Quality Gate applied" 
        },
        investable_universe: filteredList
      };

      const meta = { name: fileName, parents: [folderId], mimeType: 'application/json' };
      const form = new FormData();
      form.append('metadata', new Blob([JSON.stringify(meta)], { type: 'application/json' }));
      form.append('file', new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));

      const uploadRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST', headers: { 'Authorization': `Bearer ${accessToken}` }, body: form
      });
      if (!uploadRes.ok) {
        const errText = await uploadRes.text().catch(() => '');
        throw new Error(`Drive upload failed (${fileName}): HTTP ${uploadRes.status} ${errText.slice(0, 240)}`);
      }

      addLog(`Success: Stage 1 Complete. Data Saved.`, "ok");
      
      if (onComplete) onComplete();

    } catch (e: any) {
      addLog(`Vault Error: ${e.message}`, "err");
    } finally {
      setLoading(false);
      setIsAnalyzing(false);
    }
  };

  const ensureFolder = async (token: string, name: string) => {
    const q = encodeURIComponent(`name = '${name}' and '${GOOGLE_DRIVE_TARGET.rootFolderId}' in parents and trashed = false`);
    const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}`, { headers: { 'Authorization': `Bearer ${token}` } }).then(r => r.json());
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
          
          {/* Header */}
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-6 md:mb-10 gap-6">
            <div className="flex items-center space-x-6">
              <div className={`w-12 h-12 md:w-14 md:h-14 rounded-3xl bg-emerald-600/10 flex items-center justify-center border border-emerald-500/20 ${loading ? 'animate-pulse' : ''}`}>
                <svg className={`w-5 h-5 md:w-6 md:h-6 text-emerald-500 ${isAnalyzing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              </div>
              <div>
                <h2 className="text-xl md:text-3xl font-black text-white italic tracking-tighter uppercase leading-none">Purification_Hub v11.7</h2>
                <div className="flex items-center space-x-3 mt-2">
                   <span className={`text-[8px] font-black px-2 py-0.5 rounded border uppercase tracking-widest transition-all duration-300 ${isAnalyzing ? 'border-yellow-500/20 bg-yellow-500/10 text-yellow-400' : 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400'}`}>
                     {isAnalyzing ? `Strategies via ${activeAi}...` : 'System Standby'}
                   </span>
                   {autoStart && <span className="text-[8px] px-2 py-0.5 bg-rose-600 text-white rounded font-black uppercase animate-pulse">AUTO PILOT</span>}
                </div>
              </div>
            </div>
            <div className="flex gap-4 w-full lg:w-auto">
              <button 
                onClick={() => handleSyncAndAnalyze(true)} 
                disabled={loading}
                className={`flex-1 lg:flex-none px-6 py-4 md:px-8 md:py-5 bg-slate-800 text-slate-300 rounded-2xl text-[10px] font-black uppercase tracking-widest border border-white/5 hover:bg-slate-700 transition-all`}
              >
                {isAnalyzing ? 'Auto-Analyzing...' : 'Sync & Analyze'}
              </button>
              
              <button 
                onClick={() => commitPurification()} 
                disabled={loading || rawUniverse.length === 0}
                className={`flex-1 lg:flex-none px-8 py-4 md:px-12 md:py-5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${
                    loading 
                      ? 'bg-emerald-800 text-emerald-200/50 shadow-inner scale-95 cursor-wait border-t border-black/20' 
                      : 'bg-emerald-600 text-white shadow-xl shadow-emerald-900/20 hover:scale-105 active:scale-95'
                }`}
              >
                Commit Filter
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
                  onChange={(e) => setMinPrice(parseFloat(e.target.value))}
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
                  onChange={(e) => setMinVolume(parseInt(e.target.value))}
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
                   <span className="text-emerald-500/40 text-[8px] font-mono mt-1">Passing Filters</span>
                </div>
              </div>
            </div>
            
            {/* Market Context Badge */}
            <div className="bg-black/20 p-6 md:p-10 rounded-3xl border border-white/5 flex flex-col justify-center items-center">
              <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-4 italic">Market Condition</p>
              {marketContext ? (
                  <div className="text-center">
                      <p className={`text-2xl font-black italic tracking-tighter ${marketContext.vix > 25 ? 'text-rose-500' : 'text-blue-400'}`}>VIX {marketContext.vix.toFixed(2)}</p>
                      <p className="text-[9px] text-slate-400 mt-2 font-bold uppercase">{marketContext.status}</p>
                  </div>
              ) : (
                  <p className="text-xl font-black text-slate-600 italic tracking-tighter">WAITING...</p>
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
      </div>
    </div>
  );
};

export default PreliminaryFilter;
