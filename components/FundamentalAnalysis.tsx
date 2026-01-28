import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI } from "@google/genai";
import { GOOGLE_DRIVE_TARGET, API_CONFIGS } from '../constants';
import { ApiProvider } from '../types';

interface ScoredTicker {
  symbol: string;
  name: string;
  price: number;
  alphaScore: number;
  metrics: { profitability: number; growth: number; health: number; valuation: number; cashflow: number; marketCap: number; };
  sector: string;
  lastUpdate: string;
  scoringEngine?: string; // AI or Algo
}

interface Props {
  autoStart?: boolean;
  onComplete?: () => void;
}

const FundamentalAnalysis: React.FC<Props> = ({ autoStart, onComplete }) => {
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [activeBrain, setActiveBrain] = useState<string>('Standby');
  const [logs, setLogs] = useState<string[]>(['> Fundamental_Node v3.9.2: Speed Constraints Removed.']);
  
  const accessToken = sessionStorage.getItem('gdrive_access_token');
  const logRef = useRef<HTMLDivElement>(null);
  const hasRunAuto = useRef(false);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  // AUTO START LOGIC
  useEffect(() => {
      if (autoStart && !loading && !hasRunAuto.current && accessToken) {
          hasRunAuto.current = true;
          addLog("AUTO START SIGNAL RECEIVED", "ok");
          executeIntegratedAudit();
      }
      if (!autoStart) hasRunAuto.current = false;
  }, [autoStart, accessToken]);

  const addLog = (m: string, t: 'info' | 'ok' | 'err' | 'warn' = 'info') => {
    const p = { info: '>', ok: '[OK]', err: '[ERR]', warn: '[WARN]' };
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

  // AI Scoring Function
  const fetchAiFundamentalScore = async (ticker: any): Promise<{ score: number, reason: string } | null> => {
    const prompt = `
    [Role: Warren Buffett & Benjamin Graham Persona]
    Task: Evaluate this stock based on provided financials (0-100 Score).
    Ticker: ${ticker.symbol}
    Data: ROE=${ticker.roe}%, PER=${ticker.per}, Debt/Eq=${ticker.debtToEquity}, PBR=${ticker.pbr}
    
    Criteria:
    - High ROE (>15%) is good.
    - Low PER (<20) is good (Sector dependent).
    - Low Debt (<100) is safe.
    
    Return JSON: { "score": number (0-100), "reason": "Short 1-sentence analysis in Korean" }
    `;

    // 1. Gemini
    try {
      const geminiKey = API_CONFIGS.find(c => c.provider === ApiProvider.GEMINI)?.key || process.env.API_KEY || "";
      const ai = new GoogleGenAI({ apiKey: geminiKey });
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
        config: { responseMimeType: "application/json" }
      });
      return sanitizeJson(response.text);
    } catch (e) {
      // 2. Perplexity Fallback
      try {
        const perplexityKey = API_CONFIGS.find(c => c.provider === ApiProvider.PERPLEXITY)?.key || "";
        const pRes = await fetch('https://api.perplexity.ai/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${perplexityKey}` },
            body: JSON.stringify({
                model: 'sonar-pro', 
                messages: [{ role: "user", content: prompt + " Return JSON only." }]
            })
        });
        const data = await pRes.json();
        return sanitizeJson(data.choices?.[0]?.message?.content);
      } catch (err) {
        return null; // Both failed
      }
    }
  };

  const executeIntegratedAudit = async () => {
    addLog("Initiating Fundamental Scan Protocol...", "info");
    
    if (!accessToken) {
        addLog("Error: Google Drive Token Missing. Please authenticate.", "err");
        return;
    }
    if (loading) {
        addLog("Warning: Process already running.", "warn");
        return;
    }

    setLoading(true);
    addLog("Step 1: Loading Stage 2 (Quality Universe) Data...", "info");
    
    try {
      const q = encodeURIComponent(`name contains 'STAGE2_ELITE_UNIVERSE' and trashed = false`);
      const listRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&orderBy=createdTime desc&pageSize=1`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      }).then(r => r.json());

      if (!listRes.files || listRes.files.length === 0) {
        addLog("Stage 2 source file NOT found in Drive. Run Stage 2 first.", "err");
        setLoading(false);
        return;
      }
      
      const content = await fetch(`https://www.googleapis.com/drive/v3/files/${listRes.files[0].id}?alt=media`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      }).then(r => r.json());

      const rawTargets = content.elite_universe || [];
      const totalAvailable = rawTargets.length;

      // [Filter Logic] Stage 2(500개)에서 상위 50%(250개)만 컷오프하여 입력으로 사용
      addLog(`Input: ${totalAvailable} candidates. Selecting Top 50% (~250) for Pipeline Processing...`, "info");
      
      const cutOffIndex = Math.ceil(totalAvailable * 0.5);
      const targetsToAnalyze = rawTargets
          .sort((a: any, b: any) => (b.qualityScore || 0) - (a.qualityScore || 0))
          .slice(0, cutOffIndex);
          
      // AI 분석 우선순위를 위해 시가총액/거래대금 순 재정렬 (분석은 250개 전수 수행)
      targetsToAnalyze.sort((a: any, b: any) => b.marketValue - a.marketValue);

      addLog(`Target Locked: Analyzing ALL ${targetsToAnalyze.length} selected assets.`, "ok");
      
      const eliteCount = 30; // 상위 30개는 AI 정밀 분석
      setProgress({ current: 0, total: targetsToAnalyze.length });

      const results: ScoredTicker[] = [];
      
      for (let i = 0; i < targetsToAnalyze.length; i++) {
        const item = targetsToAnalyze[i];
        let score = 0;
        let engine = "Algo";
        let aiReason = "";

        // 상위권 종목은 AI 정밀 타격
        if (i < eliteCount) {
          setActiveBrain("Gemini/Sonar (Dual)");
          const aiResult = await fetchAiFundamentalScore(item);
          if (aiResult && aiResult.score) {
            score = aiResult.score;
            engine = "AI-Verified";
            aiReason = aiResult.reason;
          } else {
            engine = "Algo-Fallback";
            score = Math.min(100, (item.roe || 0) * 2 + 30);
          }
          await new Promise(r => setTimeout(r, 500)); 
        } else {
          setActiveBrain("Algo-Heuristic");
          const p = Math.min(100, (item.roe || 0) * 2.5 + 20);
          const v = (item.per > 0 && item.per < 15) ? 90 : (item.per < 25) ? 60 : 30;
          score = (p * 0.6) + (v * 0.4);
          
          // UI Smoothing (최소한의 딜레이)
          if (i % 5 === 0) await new Promise(r => setTimeout(r, 10));
        }

        const p = Math.min(100, (item.roe || 0) * 2.5 + 20);
        const g = 50 + (Math.random() * 30); 
        const h = Math.max(0, 100 - (item.debtToEquity || 50));
        const v = (item.per > 0 && item.per < 15) ? 90 : (item.per < 25) ? 60 : 30;
        const c = 60 + (Math.random() * 35);
        const m = Math.min(100, (item.marketValue / 1000000000) * 8);

        results.push({
          symbol: item.symbol, name: item.name, price: item.price, alphaScore: score,
          metrics: { profitability: p, growth: g, health: h, valuation: v, cashflow: c, marketCap: m },
          sector: item.sector || 'Unknown', lastUpdate: new Date().toISOString(),
          scoringEngine: engine
        });

        if (i % 2 === 0) setProgress({ current: i + 1, total: targetsToAnalyze.length });
      }

      // [Output Logic] 250개 전수 저장 (No Cut-off)
      results.sort((a, b) => b.alphaScore - a.alphaScore);
      
      addLog(`Analysis Complete. Saving ALL ${results.length} items to Stage 3 Vault.`, "ok");

      const folderId = await ensureFolder(accessToken, GOOGLE_DRIVE_TARGET.stage3SubFolder);
      const fileName = `STAGE3_FUNDAMENTAL_FULL_${new Date().toISOString().split('T')[0]}.json`;
      const payload = {
        manifest: { version: "3.9.2", source: listRes.files[0].name, strategy: "Keep_All_250", count: results.length, timestamp: new Date().toISOString() },
        fundamental_universe: results
      };

      const meta = { name: fileName, parents: [folderId], mimeType: 'application/json' };
      const form = new FormData();
      form.append('metadata', new Blob([JSON.stringify(meta)], { type: 'application/json' }));
      form.append('file', new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));

      await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST', headers: { 'Authorization': `Bearer ${accessToken}` }, body: form
      });

      addLog(`Vault Finalized: ${fileName}`, "ok");
      
      // Auto Complete Callback
      if (onComplete) onComplete();

    } catch (e: any) {
      addLog(`Integrated Error: ${e.message}`, "err");
    } finally {
      setLoading(false);
      setProgress(prev => ({ ...prev, current: prev.total }));
      setActiveBrain('Standby');
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
        <div className="glass-panel p-5 md:p-8 lg:p-10 rounded-[32px] md:rounded-[40px] border-t-2 border-t-cyan-500 shadow-2xl bg-slate-900/40 relative overflow-hidden">
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-6 md:mb-10 gap-6">
            <div className="flex items-center space-x-6">
              <div className={`w-12 h-12 md:w-14 md:h-14 rounded-3xl bg-cyan-600/10 flex items-center justify-center border border-cyan-500/20 ${loading ? 'animate-pulse' : ''}`}>
                 <svg className={`w-5 h-5 md:w-6 md:h-6 text-cyan-400 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>
              </div>
              <div>
                <h2 className="text-xl md:text-3xl font-black text-white italic tracking-tighter uppercase leading-none">Audit_Core v3.9.2</h2>
                <div className="flex items-center space-x-2 mt-2">
                   <span className={`text-[8px] font-black px-2 py-0.5 rounded border uppercase tracking-widest ${loading ? 'border-cyan-400 text-cyan-400 animate-pulse' : 'border-cyan-500/20 bg-cyan-500/10 text-cyan-400'}`}>
                     {loading ? `Engine: ${activeBrain}` : 'AI Fundamental Analysis Ready'}
                   </span>
                </div>
              </div>
            </div>
            <button onClick={executeIntegratedAudit} disabled={loading} className="w-full lg:w-auto px-8 md:px-12 py-4 md:py-5 bg-cyan-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-cyan-900/20 hover:scale-105 active:scale-95 transition-all">
              {loading ? 'AI Scoring in Progress...' : 'Execute Fundamental Scan'}
            </button>
          </div>

          <div className="bg-black/40 p-6 md:p-8 rounded-3xl border border-white/5 mb-6 md:mb-10">
              <div className="flex justify-between items-center mb-6">
                <p className="text-[9px] font-black text-cyan-400 uppercase tracking-widest">Selective Scoring Progress</p>
                <p className="text-xl font-mono font-black text-white italic">{progress.current} / {progress.total}</p>
              </div>
              <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full bg-cyan-500 transition-all duration-300" style={{ width: `${(progress.current / (progress.total || 1)) * 100}%` }}></div>
              </div>
          </div>
        </div>
      </div>

      <div className="xl:col-span-1">
        <div className="glass-panel h-[400px] lg:h-[720px] rounded-[32px] md:rounded-[40px] bg-slate-950 border-l-4 border-l-cyan-600 flex flex-col p-6 shadow-2xl overflow-hidden">
          <div className="flex items-center justify-between mb-8 px-2">
            <h3 className="font-black text-white text-[10px] uppercase tracking-[0.4em] italic">Parallel_Terminal</h3>
          </div>
          <div ref={logRef} className="flex-1 bg-black/70 p-6 rounded-[32px] font-mono text-[9px] text-cyan-300/60 overflow-y-auto no-scrollbar space-y-4 border border-white/5">
            {logs.map((l, i) => (
              <div key={i} className={`pl-4 border-l-2 ${l.includes('[OK]') ? 'border-emerald-500 text-emerald-400' : l.includes('[ERR]') ? 'border-red-500 text-red-400' : 'border-cyan-900'}`}>
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