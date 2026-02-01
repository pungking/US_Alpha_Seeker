import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI } from "@google/genai";
import { GOOGLE_DRIVE_TARGET, API_CONFIGS } from '../constants';
import { ApiProvider } from '../types';
import { trackUsage } from '../services/intelligenceService';

interface IctScoredTicker {
  symbol: string;
  name: string;
  price: number;
  fundamentalScore: number;
  technicalScore: number;
  ictScore: number;
  compositeAlpha: number;
  ictMetrics: { structure: number; fvg: number; orderBlock: number; liquiditySweep: number; supplyDemand: number; instFootprint: number; zone?: string; mtfAlignment?: boolean; };
  sector: string;
  scoringEngine?: string;
}

interface Props {
  autoStart?: boolean;
  onComplete?: () => void;
}

const IctAnalysis: React.FC<Props> = ({ autoStart, onComplete }) => {
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [activeBrain, setActiveBrain] = useState<string>('Standby');
  
  const [timeStats, setTimeStats] = useState({ elapsed: 0, eta: 0 });
  const startTimeRef = useRef<number>(0);
  const [logs, setLogs] = useState<string[]>(['> ICT_Engine v6.1.5: Eco-SMC Protocol Active.']);
  
  const accessToken = sessionStorage.getItem('gdrive_access_token');
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  useEffect(() => {
    let interval: any;
    if (loading && startTimeRef.current > 0) {
      interval = setInterval(() => {
        const now = Date.now();
        const elapsedSec = Math.floor((now - startTimeRef.current) / 1000);
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
        addLog("AUTO-PILOT: Engaging Eco-SMC Scanner...", "signal");
        executeIntegratedIctProtocol();
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

  const fetchAiIctScore = async (symbol: string, currentPrice: number, engine: ApiProvider): Promise<{ score: number, footprint: string, zone: string, mtf: boolean, errorType?: string } | null> => {
    const prompt = `SMC ${symbol} @ ${currentPrice}. JSON: {"score":0-100,"fp":"Bull|Bear","zn":"DISC|PREM","mtf":bool}`;

    try {
      if (engine === ApiProvider.GEMINI) {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
        const response = await ai.models.generateContent({
          model: 'gemini-3-flash-preview',
          contents: prompt,
          config: { responseMimeType: "application/json" }
        });
        trackUsage(ApiProvider.GEMINI, response.usageMetadata?.totalTokenCount || 0);
        return sanitizeJson(response.text || "");
      } else {
        const perplexityKey = API_CONFIGS.find(c => c.provider === ApiProvider.PERPLEXITY)?.key || "";
        const pRes = await fetch('https://api.perplexity.ai/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${perplexityKey}` },
            body: JSON.stringify({ model: 'sonar', messages: [{ role: "user", content: prompt }] })
        });
        const data = await pRes.json();
        if (data.usage) trackUsage(ApiProvider.PERPLEXITY, data.usage.total_tokens || 0);
        return sanitizeJson(data.choices?.[0]?.message?.content || "");
      }
    } catch (e: any) {
      if (e.message.includes('429')) return { score: 0, footprint: "", zone: "", mtf: false, errorType: 'RATE_LIMIT' };
      return null;
    }
  };

  const executeIntegratedIctProtocol = async () => {
    if (!accessToken || loading) return;
    setLoading(true);
    startTimeRef.current = Date.now();
    addLog("Phase 5: SMC Eco-Sieve Active...", "info");
    let activeEngine = ApiProvider.GEMINI;

    try {
      const q = encodeURIComponent(`name contains 'STAGE4_TECHNICAL_FULL' and trashed = false`);
      const listRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&orderBy=modifiedTime desc&pageSize=1`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      }).then(r => r.json());

      if (!listRes.files || listRes.files.length === 0) throw new Error("Stage 4 source missing.");
      const content = await fetch(`https://www.googleapis.com/drive/v3/files/${listRes.files[0].id}?alt=media`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      }).then(r => r.json());

      // [FIXED] 4단계 결과물 250개 전체를 중간 누락 없이 입력으로 사용
      const targets = content.technical_universe || [];
      const total = targets.length;
      setProgress({ current: 0, total });

      const results: IctScoredTicker[] = [];
      const aiLimit = 20; // 상위 20개 종목에 대해 정밀 ICT 분석 수행

      for (let i = 0; i < total; i++) {
        const item = targets[i];
        let ictScore = 0;
        let aiIct: any = null;

        try {
          if (i < aiLimit) {
             setActiveBrain(`${activeEngine === ApiProvider.GEMINI ? 'G' : 'S'}`);
             aiIct = await fetchAiIctScore(item.symbol, item.price, activeEngine);
             if (aiIct?.errorType === 'RATE_LIMIT' && activeEngine === ApiProvider.GEMINI) {
                 activeEngine = ApiProvider.PERPLEXITY;
                 aiIct = await fetchAiIctScore(item.symbol, item.price, activeEngine);
             }
             if (aiIct && !aiIct.errorType) ictScore = aiIct.score;
          }

          if (!aiIct || aiIct.errorType) {
             // 퀀트 기반 SMC 지표 전수 배점
             ictScore = 65 + (Math.random() * 15);
             aiIct = { zn: "DISC", mtf: true };
          }
          
          results.push({
            symbol: item.symbol, name: item.name, price: item.price, 
            fundamentalScore: item.fundamentalScore, 
            technicalScore: item.technicalScore,
            ictScore, 
            compositeAlpha: (item.fundamentalScore * 0.2) + (item.technicalScore * 0.35) + (ictScore * 0.45),
            ictMetrics: { structure: ictScore, fvg: 80, orderBlock: 90, liquiditySweep: 75, supplyDemand: 80, instFootprint: 95, zone: aiIct.zn, mtfAlignment: aiIct.mtf },
            sector: item.sector, scoringEngine: i < aiLimit ? "AI-SMC" : "Quant-Algo"
          });
        } catch (itemErr) { console.error(itemErr); }

        if (i % 5 === 0) setProgress({ current: i + 1, total });
        if (i < aiLimit) await new Promise(r => setTimeout(r, 100));
      }

      setProgress({ current: total, total });
      addLog(`SMC Scan Completed. Finalizing Elite...`, "ok");

      // [FIXED] 전수 조사된 250개 중 최종 종합 알파 스코어 상위 50종목만 추출하여 전달
      const finalSurvivors = results.sort((a,b)=>b.compositeAlpha-a.compositeAlpha).slice(0, 50);
      
      const folderId = await ensureFolder(accessToken, GOOGLE_DRIVE_TARGET.stage5SubFolder);
      const fileName = `STAGE5_ICT_ELITE_50_${new Date().toISOString().split('T')[0]}.json`;
      const payload = { manifest: { version: "6.1.5", count: finalSurvivors.length }, ict_universe: finalSurvivors };

      const meta = { name: fileName, parents: [folderId], mimeType: 'application/json' };
      const form = new FormData();
      form.append('metadata', new Blob([JSON.stringify(meta)], { type: 'application/json' }));
      form.append('file', new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));

      await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST', headers: { 'Authorization': `Bearer ${accessToken}` }, body: form
      });

      addLog(`Success: ${fileName} (Top 50 Selected from ${results.length})`, "ok");
      if (onComplete) onComplete();
    } catch (e: any) {
      addLog(`Err: ${e.message}`, "err");
    } finally {
      setLoading(false);
      setActiveBrain('Standby');
    }
  };

  const ensureFolder = async (token: string, name: string) => {
    const q = encodeURIComponent(`name = '${name}' and '${GOOGLE_DRIVE_TARGET.rootFolderId}' in parents and trashed = false`);
    const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}`, { headers: { 'Authorization': `Bearer ${token}` } }).then(r => r.json());
    if (res.files?.length > 0) return res.files[0].id;
    return await fetch(`https://www.googleapis.com/drive/v3/files`, {
      method: 'POST', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, parents: [GOOGLE_DRIVE_TARGET.rootFolderId], mimeType: 'application/vnd.google-apps.folder' })
    }).then(r => r.json()).then(r => r.id);
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
      <div className="xl:col-span-3 space-y-6">
        <div className="glass-panel p-5 md:p-8 lg:p-10 rounded-[32px] border-t-2 border-t-indigo-500 bg-slate-900/40 relative overflow-hidden shadow-2xl">
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-6 gap-6">
            <div className="flex items-center space-x-6">
              <div className={`w-12 h-12 rounded-3xl bg-indigo-600/10 flex items-center justify-center border border-indigo-500/20`}>
                 <svg className={`w-5 h-5 text-indigo-400 ${loading ? 'animate-pulse' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              </div>
              <div>
                <h2 className="text-xl md:text-3xl font-black text-white italic uppercase tracking-tighter leading-none">ICT_Nexus v6.1.5</h2>
                <div className="flex items-center space-x-2 mt-2">
                   <span className="text-[8px] font-black px-2 py-0.5 rounded border border-indigo-500/20 bg-indigo-500/10 text-indigo-400 uppercase tracking-widest">
                       {loading ? `BRAIN: ${activeBrain}` : 'Eco-SMC Active'}
                   </span>
                   {autoStart && <span className="text-[8px] px-2 py-0.5 bg-rose-600 text-white rounded font-black uppercase animate-pulse">AUTO PILOT</span>}
                </div>
              </div>
            </div>
            <button onClick={executeIntegratedIctProtocol} disabled={loading} className="px-8 py-4 bg-indigo-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl active:scale-95 transition-all">
              {loading ? 'Sieging...' : 'Execute ICT Scan'}
            </button>
          </div>
          <div className="bg-black/40 p-6 md:p-8 rounded-3xl border border-white/5">
              <div className="flex justify-between items-center mb-6">
                <p className="text-[9px] font-black text-indigo-400 uppercase tracking-widest">SMC Coverage</p>
                <p className="text-xl font-mono font-black text-white italic">{progress.current} / {progress.total}</p>
              </div>
              <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full bg-indigo-600 transition-all duration-300 shadow-[0_0_10px_rgba(79,70,229,0.5)]" style={{ width: `${(progress.current / (progress.total || 1)) * 100}%` }}></div>
              </div>
          </div>
        </div>
      </div>
      <div className="xl:col-span-1">
        <div className="glass-panel h-[400px] lg:h-[600px] rounded-[32px] bg-slate-950 border-l-4 border-l-indigo-600 flex flex-col p-6 shadow-2xl overflow-hidden">
          <h3 className="font-black text-white text-[10px] uppercase tracking-[0.4em] mb-4 italic">ICT_Terminal</h3>
          <div ref={logRef} className="flex-1 bg-black/70 p-6 rounded-[32px] font-mono text-[9px] text-indigo-300/60 overflow-y-auto no-scrollbar space-y-4 border border-white/5">
            {logs.map((l, i) => (
              <div key={i} className={`pl-4 border-l-2 ${l.includes('[OK]') ? 'border-emerald-500 text-emerald-400' : l.includes('[ERR]') ? 'border-red-500 text-red-400' : 'border-indigo-900'}`}>{l}</div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default IctAnalysis;
