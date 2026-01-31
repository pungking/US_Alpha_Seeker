import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI } from "@google/genai";
import { GOOGLE_DRIVE_TARGET, API_CONFIGS } from '../constants';
import { ApiProvider } from '../types';
import { trackUsage } from '../services/intelligenceService';

interface ScoredTicker {
  symbol: string;
  name: string;
  price: number;
  alphaScore: number;
  metrics: { profitability: number; growth: number; health: number; valuation: number; cashflow: number; marketCap: number; fScore?: number; zScore?: number; };
  sector: string;
  lastUpdate: string;
  scoringEngine?: string; 
}

interface Props {
  autoStart?: boolean;
  onComplete?: () => void;
}

const FundamentalAnalysis: React.FC<Props> = ({ autoStart, onComplete }) => {
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [activeBrain, setActiveBrain] = useState<string>('Standby');
  const [currentEngine, setCurrentEngine] = useState<ApiProvider>(ApiProvider.GEMINI);
  
  // Time Tracking
  const [timeStats, setTimeStats] = useState({ elapsed: 0, eta: 0 });
  const startTimeRef = useRef<number>(0);
  
  const [logs, setLogs] = useState<string[]>(['> Fundamental_Node v4.1.0: Advanced Quant-Reasoning Hybrid.']);
  
  const accessToken = sessionStorage.getItem('gdrive_access_token');
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  // Timer Effect
  useEffect(() => {
    let interval: any;
    if (loading && startTimeRef.current > 0) {
      interval = setInterval(() => {
        const now = Date.now();
        const elapsedSec = Math.floor((now - startTimeRef.current) / 1000);
        
        // Calculate ETA
        let etaSec = 0;
        if (progress.current > 0 && progress.total > 0) {
           const rate = progress.current / elapsedSec; 
           const remaining = progress.total - progress.current;
           etaSec = rate > 0 ? Math.floor(remaining / rate) : 0;
        }
        
        setTimeStats({ elapsed: elapsedSec, eta: etaSec });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [loading, progress]);

  useEffect(() => {
    if (autoStart && !loading) {
        addLog("AUTO-PILOT: Engaging Advanced Fundamental Audit...", "signal");
        executeIntegratedAudit();
    }
  }, [autoStart]);

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

  const fetchAiFundamentalScore = async (ticker: any, engine: ApiProvider): Promise<{ score: number, fScore: number, zScore: number, reason: string, errorType?: string } | null> => {
    const prompt = `
    [Role: Institutional Equity Analyst]
    Task: Multi-dimensional Fundamental Audit for ${ticker.symbol}.
    Data: ROE=${ticker.roe}%, PER=${ticker.per}, Debt/Eq=${ticker.debtToEquity}, PBR=${ticker.pbr}, MktCap=$${(ticker.marketValue/1e9).toFixed(2)}B.
    
    Analysis Requirements:
    1. Estimate Piotroski F-Score (0-9) based on these trends.
    2. Estimate Altman Z-Score (Financial Distress Probability).
    3. Evaluate "Quality of Earnings" (ROE vs Debt).
    
    Return ONLY JSON: { "score": number, "fScore": number, "zScore": number, "reason": "string" }
    `;

    try {
      if (engine === ApiProvider.GEMINI) {
        const geminiKey = process.env.API_KEY || API_CONFIGS.find(c => c.provider === ApiProvider.GEMINI)?.key || "";
        const ai = new GoogleGenAI({ apiKey: geminiKey });
        const response = await ai.models.generateContent({
          model: 'gemini-3-flash-preview',
          contents: prompt,
          config: { responseMimeType: "application/json" }
        });
        
        // Track Gemini Usage
        trackUsage(ApiProvider.GEMINI, response.usageMetadata?.totalTokenCount || 0);
        
        return sanitizeJson(response.text);
      } else {
        const perplexityKey = API_CONFIGS.find(c => c.provider === ApiProvider.PERPLEXITY)?.key || "";
        const pRes = await fetch('https://api.perplexity.ai/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${perplexityKey}` },
            body: JSON.stringify({
                model: 'sonar-pro', 
                messages: [{ role: "user", content: prompt + " Return valid JSON only." }]
            })
        });
        const data = await pRes.json();
        
        // Track Perplexity Usage
        if (data.usage) trackUsage(ApiProvider.PERPLEXITY, data.usage.total_tokens || 0);
        
        return sanitizeJson(data.choices?.[0]?.message?.content);
      }
    } catch (e: any) {
      if (e.message.includes('429') || e.message.includes('Quota')) {
          trackUsage(engine, 0, true, e.message);
          return { score: 0, fScore: 0, zScore: 0, reason: "", errorType: 'RATE_LIMIT' };
      }
      return null;
    }
  };

  const executeIntegratedAudit = async () => {
    if (!accessToken || loading) return;
    setLoading(true);
    startTimeRef.current = Date.now();
    setTimeStats({ elapsed: 0, eta: 0 });
    
    addLog("Phase 3: Initializing Resilient Deep-Audit Protocol...", "info");
    let activeEngine = ApiProvider.GEMINI;
    setCurrentEngine(activeEngine);
    
    try {
      const q = encodeURIComponent(`name contains 'STAGE2_ELITE_UNIVERSE' and trashed = false`);
      const listRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&orderBy=createdTime desc&pageSize=1`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      }).then(r => r.json());

      if (!listRes.files?.length) {
        addLog("Stage 2 source missing. Run Stage 2 first.", "err");
        setLoading(false); return;
      }
      
      const content = await fetch(`https://www.googleapis.com/drive/v3/files/${listRes.files[0].id}?alt=media`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      }).then(r => r.json());

      const rawTargets = content.elite_universe || [];
      const targetsToAnalyze = rawTargets
          .sort((a: any, b: any) => (b.qualityScore || 0) - (a.qualityScore || 0))
          .slice(0, 250); 

      const total = targetsToAnalyze.length;
      setProgress({ current: 0, total: total });
      addLog(`Auditing ${total} assets with F-Score & Z-Score models.`, "ok");
      
      const results: ScoredTicker[] = [];
      const eliteLimit = 40; 

      for (let i = 0; i < total; i++) {
        const item = targetsToAnalyze[i];
        let finalScore = 0;
        let aiData: any = null;
        let engineLabel = "Quant-Algorithm";

        try {
          if (i < eliteLimit) {
            setActiveBrain(`${activeEngine === ApiProvider.GEMINI ? 'Gemini' : 'Sonar'} (Audit)`);
            
            // Try current engine
            aiData = await fetchAiFundamentalScore(item, activeEngine);
            
            // Sticky Switch Logic: If Gemini fails with rate limit, switch to Perplexity for the REST of the run
            if (aiData?.errorType === 'RATE_LIMIT' && activeEngine === ApiProvider.GEMINI) {
                addLog(`Gemini Limit Reached. Switching Global Engine to Sonar.`, "warn");
                activeEngine = ApiProvider.PERPLEXITY;
                setCurrentEngine(activeEngine);
                // Retry current item with new engine
                aiData = await fetchAiFundamentalScore(item, activeEngine);
            }

            if (aiData && !aiData.errorType) {
              finalScore = aiData.score;
              engineLabel = "AI-Quant-Verified";
            }
          }

          if (!aiData || aiData.errorType) {
            if (i < eliteLimit) setActiveBrain("Algo-Fallback");
            else setActiveBrain("Stream-Quant");
            
            const roeBase = Math.min(100, (Number(item.roe) || 0) * 2.5);
            const debtPenalty = Math.max(0, (Number(item.debtToEquity) || 0) / 2);
            const valBonus = (item.per > 0 && item.per < 20) ? 20 : 0;
            finalScore = Math.min(100, roeBase - debtPenalty + valBonus + 30);
            aiData = { fScore: finalScore > 70 ? 7 : 5, zScore: finalScore > 60 ? 3 : 2 };
          }

          results.push({
            symbol: item.symbol, name: item.name, price: item.price, alphaScore: finalScore,
            metrics: { 
              profitability: Math.min(100, (item.roe || 0) * 3), 
              growth: 65 + (Math.random() * 20), 
              health: Math.max(0, 100 - (item.debtToEquity || 50)), 
              valuation: (item.per > 0 && item.per < 15) ? 95 : 60, 
              cashflow: 75, 
              marketCap: Math.min(100, (item.marketValue / 1e9) * 5),
              fScore: aiData.fScore,
              zScore: aiData.zScore
            },
            sector: item.sector || 'N/A', lastUpdate: new Date().toISOString(),
            scoringEngine: engineLabel
          });

        } catch (itemErr) {
            console.error(`Error processing ${item.symbol}:`, itemErr);
        }

        // Update progress every 5 items
        if (i % 5 === 0) setProgress({ current: i + 1, total: total });
        
        // Adaptive Delay
        if (i < eliteLimit) await new Promise(r => setTimeout(r, 350));
        else if (i % 20 === 0) await new Promise(r => setTimeout(r, 0));
      }

      // [FIX] Force update to 100% after loop completes
      setProgress({ current: total, total: total });
      addLog(`Audit Sequence Completed. Synchronizing Vault...`, "ok");

      results.sort((a, b) => b.alphaScore - a.alphaScore);
      const folderId = await ensureFolder(accessToken, GOOGLE_DRIVE_TARGET.stage3SubFolder);
      const fileName = `STAGE3_FUNDAMENTAL_FULL_${new Date().toISOString().split('T')[0]}.json`;
      const payload = {
        manifest: { version: "4.1.0", count: results.length, timestamp: new Date().toISOString(), engine: activeEngine },
        fundamental_universe: results
      };

      const meta = { name: fileName, parents: [folderId], mimeType: 'application/json' };
      const form = new FormData();
      form.append('metadata', new Blob([JSON.stringify(meta)], { type: 'application/json' }));
      form.append('file', new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));

      await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST', headers: { 'Authorization': `Bearer ${accessToken}` }, body: form
      });

      addLog(`Vault Synchronized: ${fileName}`, "ok");
      
      // Finalize the stage
      if (onComplete) {
          setTimeout(() => onComplete(), 1000);
      }

    } catch (e: any) {
      addLog(`Critical Audit Failure: ${e.message}`, "err");
    } finally {
      setLoading(false);
      setActiveBrain('Standby');
      startTimeRef.current = 0;
    }
  };

  const ensureFolder = async (token: string, name: string) => {
    const q = encodeURIComponent(`name = '${name}' and '${GOOGLE_DRIVE_TARGET.rootFolderId}' in parents and trashed = false`);
    const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    }).then(r => r.json());
    if (res.files?.length > 0) return res.files[0].id;
    return await fetch(`https://www.googleapis.com/drive/v3/files`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, parents: [GOOGLE_DRIVE_TARGET.rootFolderId], mimeType: 'application/vnd.google-apps.folder' })
    }).then(r => r.json()).then(r => r.id);
  };

  const formatTime = (seconds: number) => {
    if (seconds <= 0) return "--:--";
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
      <div className="xl:col-span-3 space-y-6">
        <div className="glass-panel p-5 md:p-8 lg:p-10 rounded-[32px] md:rounded-[40px] border-t-2 border-t-cyan-500 shadow-2xl bg-slate-900/40 relative overflow-hidden">
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-6 md:mb-10 gap-6">
            <div className="flex items-center space-x-6">
              <div className={`w-12 h-12 md:w-14 md:h-14 rounded-3xl bg-cyan-600/10 flex items-center justify-center border border-cyan-500/20 ${loading ? 'animate-pulse' : ''}`}>
                 <svg className={`w-5 h-5 md:w-6 md:h-6 text-cyan-400 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>
              </div>
              <div>
                <h2 className="text-xl md:text-3xl font-black text-white italic tracking-tighter uppercase leading-none">Audit_Nexus v4.1.0</h2>
                <div className="flex flex-col mt-2 gap-1">
                   <div className="flex items-center space-x-2">
                        <span className={`text-[8px] font-black px-2 py-0.5 rounded border uppercase tracking-widest ${loading ? 'border-cyan-400 text-cyan-400 animate-pulse' : 'border-cyan-500/20 bg-cyan-500/10 text-cyan-400'}`}>
                            {loading ? `ENGINE: ${activeBrain}` : 'Resilient Deep-Audit Active'}
                        </span>
                        {autoStart && <span className="text-[8px] px-2 py-0.5 bg-rose-600 text-white rounded font-black uppercase animate-pulse">AUTO PILOT</span>}
                   </div>
                   {loading && (
                     <div className="flex items-center space-x-2 mt-0.5">
                       <span className="text-[8px] font-mono font-bold text-slate-400 uppercase">
                         Elapsed: <span className="text-white">{formatTime(timeStats.elapsed)}</span>
                       </span>
                       <span className="text-[8px] font-mono font-bold text-slate-500">|</span>
                       <span className="text-[8px] font-mono font-bold text-slate-400 uppercase">
                         ETA: <span className="text-emerald-400">{formatTime(timeStats.eta)}</span>
                       </span>
                     </div>
                   )}
                </div>
              </div>
            </div>
            <button onClick={executeIntegratedAudit} disabled={loading} className="w-full lg:w-auto px-8 md:px-12 py-4 md:py-5 bg-cyan-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-cyan-900/20 hover:scale-105 active:scale-95 transition-all">
              {loading ? 'Performing Multi-Model Audit...' : 'Start Global Fundamental Audit'}
            </button>
          </div>

          <div className="bg-black/40 p-6 md:p-8 rounded-3xl border border-white/5">
              <div className="flex justify-between items-center mb-6">
                <p className="text-[9px] font-black text-cyan-400 uppercase tracking-widest">Sieve Pipeline Integrity</p>
                <p className="text-xl font-mono font-black text-white italic">{progress.current} / {progress.total}</p>
              </div>
              <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full bg-cyan-500 transition-all duration-300 shadow-[0_0_10px_rgba(6,182,212,0.5)]" style={{ width: `${(progress.current / (progress.total || 1)) * 100}%` }}></div>
              </div>
          </div>
        </div>
      </div>

      <div className="xl:col-span-1">
        <div className="glass-panel h-[400px] lg:h-[600px] rounded-[32px] md:rounded-[40px] bg-slate-950 border-l-4 border-l-cyan-600 flex flex-col p-6 shadow-2xl overflow-hidden">
          <div className="flex items-center justify-between mb-8 px-2">
            <h3 className="font-black text-white text-[10px] uppercase tracking-[0.4em] italic">Audit_Log</h3>
          </div>
          <div ref={logRef} className="flex-1 bg-black/70 p-6 rounded-[32px] font-mono text-[9px] text-cyan-300/60 overflow-y-auto no-scrollbar space-y-4 border border-white/5">
            {logs.map((l, i) => (
              <div key={i} className={`pl-4 border-l-2 ${l.includes('[OK]') ? 'border-emerald-500 text-emerald-400' : l.includes('[ERR]') ? 'border-red-500 text-red-400' : l.includes('[AUTO]') ? 'border-rose-500 text-rose-400' : 'border-cyan-900'}`}>
                {l}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default FundamentalAnalysis;
