
import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI } from "@google/genai";
import { GOOGLE_DRIVE_TARGET, API_CONFIGS } from '../constants';
import { ApiProvider } from '../types';

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
  onComplete?: () => void;
  autoStart?: boolean;
}

const PreliminaryFilter: React.FC<Props> = ({ onComplete, autoStart }) => {
  const [loading, setLoading] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  
  const [rawUniverse, setRawUniverse] = useState<MasterTicker[]>(() => {
    const cached = sessionStorage.getItem('stage1_rawUniverse');
    return cached ? JSON.parse(cached) : [];
  });
  
  const [filteredCount, setFilteredCount] = useState(0);
  
  const [logs, setLogs] = useState<string[]>(() => {
    const cached = sessionStorage.getItem('stage1_logs');
    return cached ? JSON.parse(cached) : ['> Filter_Node v2.0.1: Macro-Liquidity Protocol Online.'];
  });
  
  const [minPrice, setMinPrice] = useState(() => parseFloat(sessionStorage.getItem('stage1_minPrice') || '2.0'));
  const [minVolume, setMinVolume] = useState(() => parseInt(sessionStorage.getItem('stage1_minVolume') || '500000'));
  
  const [aiProposal, setAiProposal] = useState<AiProposal | null>(() => {
    const cached = sessionStorage.getItem('stage1_aiProposal');
    return cached ? JSON.parse(cached) : null;
  });
  
  const [aiError, setAiError] = useState<string | null>(null);
  
  const accessToken = sessionStorage.getItem('gdrive_access_token');
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  // 세션 스토리지 업데이트
  useEffect(() => {
    sessionStorage.setItem('stage1_logs', JSON.stringify(logs));
  }, [logs]);
  useEffect(() => {
    sessionStorage.setItem('stage1_minPrice', minPrice.toString());
  }, [minPrice]);
  useEffect(() => {
    sessionStorage.setItem('stage1_minVolume', minVolume.toString());
  }, [minVolume]);
  useEffect(() => {
    sessionStorage.setItem('stage1_aiProposal', JSON.stringify(aiProposal));
  }, [aiProposal]);
  useEffect(() => {
    if (rawUniverse.length > 0) {
      sessionStorage.setItem('stage1_rawUniverse', JSON.stringify(rawUniverse));
    }
  }, [rawUniverse]);

  useEffect(() => {
    if (rawUniverse.length > 0) {
      const count = rawUniverse.filter(s => s.price >= minPrice && s.volume >= minVolume).length;
      setFilteredCount(count);
    }
  }, [minPrice, minVolume, rawUniverse]);

  // 오토파일럿 트리거
  useEffect(() => {
    if (autoStart && !loading && rawUniverse.length === 0) {
      syncAndAnalyzeMarket();
    }
  }, [autoStart]);

  const addLog = (m: string, t: 'info' | 'ok' | 'err' | 'warn' = 'info') => {
    const p = { info: '>', ok: '[OK]', err: '[ERR]', warn: '[WARN]' };
    setLogs(prev => [...prev, `${p[t]} ${m}`].slice(-40));
  };

  const syncAndAnalyzeMarket = async () => {
    if (!accessToken) {
      addLog("Cloud link required. Check Auth Status.", "warn");
      return;
    }
    setLoading(true);
    setIsAnalyzing(true);
    setAiError(null);
    setAiProposal(null);
    addLog("Phase 1: Retrieving Global Universe Matrix...", "info");

    try {
      const q = encodeURIComponent(`name contains 'STAGE0_MASTER_UNIVERSE' and trashed = false`);
      const listRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&orderBy=createdTime desc&pageSize=1`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      }).then(r => r.json());

      if (!listRes.files?.length) throw new Error("Stage 0 Data not found.");

      const content = await fetch(`https://www.googleapis.com/drive/v3/files/${listRes.files[0].id}?alt=media`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      }).then(r => r.json());

      const data = content.universe || [];
      setRawUniverse(data);
      addLog(`Matrix Synced: ${data.length} assets. Requesting AI Strategic Analysis...`, "ok");

      const prices = data.map((s: any) => s.price).filter((p: any) => p > 0).sort((a: any, b: any) => a - b);
      const volumes = data.map((s: any) => s.volume).filter((v: any) => v > 0).sort((a: any, b: any) => a - b);
      
      const statsSummary = {
        total: data.length,
        p25Price: prices[Math.floor(prices.length * 0.25)],
        p50Price: prices[Math.floor(prices.length * 0.50)],
        p75Price: prices[Math.floor(prices.length * 0.75)],
        p50Volume: volumes[Math.floor(volumes.length * 0.5)],
        p80Volume: volumes[Math.floor(volumes.length * 0.8)],
        pennyCount: data.filter((s:any) => s.price < 1).length
      };

      const geminiConfig = API_CONFIGS.find(c => c.provider === ApiProvider.GEMINI);
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || geminiConfig?.key || "" });
      
      const prompt = `미국 주식 시장 유동성 분석: ${JSON.stringify(statsSummary)}. 
      위 데이터를 기반으로 잡주를 걸러내고 기관 수급이 원활한 종목만 남기기 위한 최적의 suggestedPrice($1.5~$5)와 suggestedVolume(100k~1.5M)을 제안하세요.
      반드시 JSON 형식으로만 응답하세요: { "suggestedPrice": number, "suggestedVolume": number, "regime": "string", "reasoning": "string" }`;

      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
        config: { responseMimeType: "application/json" }
      });
      
      const aiData: AiProposal = JSON.parse(response.text || "{}");
      setAiProposal(aiData);
      setMinPrice(aiData.suggestedPrice);
      setMinVolume(aiData.suggestedVolume);
      
      addLog(`AI Strategy Finalized: [${aiData.regime}]`, "ok");
    } catch (e: any) {
      const errorMsg = e.message?.includes("429") ? "API 할당량 초과" : e.message;
      setAiError(errorMsg);
      addLog(`AI Node Warning: ${errorMsg}`, "warn");
      setMinPrice(2.0);
      setMinVolume(500000);
    } finally {
      setLoading(false);
      setIsAnalyzing(false);
    }
  };

  const handleManualChange = (type: 'price' | 'volume', val: number) => {
    if (type === 'price') setMinPrice(val);
    else setMinVolume(val);
  };

  const commitPurification = async () => {
    if (!accessToken || rawUniverse.length === 0) return;
    setLoading(true);
    addLog(`Phase 2: Purifying Universe... (P: $${minPrice}, V: ${minVolume})`, "info");

    try {
      const filtered = rawUniverse.filter(s => s.price >= minPrice && s.volume >= minVolume);
      const folderId = await ensureFolder(accessToken, GOOGLE_DRIVE_TARGET.stage1SubFolder);
      const fileName = `STAGE1_PURIFIED_UNIVERSE_${new Date().toISOString().split('T')[0]}.json`;
      
      const payload = {
        manifest: { version: "2.0.1", regime: aiProposal?.regime || "Manual", filters: { minPrice, minVolume }, timestamp: new Date().toISOString() },
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
      if (onComplete) onComplete();
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
        <div className="glass-panel p-8 md:p-10 rounded-[40px] border-t-2 border-t-emerald-500 shadow-2xl bg-slate-900/40 relative overflow-hidden">
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-10 gap-6">
            <div className="flex items-center space-x-6">
              <div className={`w-14 h-14 rounded-3xl bg-emerald-600/10 flex items-center justify-center border border-emerald-500/20 ${loading ? 'animate-pulse' : ''}`}>
                <svg className={`w-6 h-6 text-emerald-500 ${isAnalyzing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              </div>
              <div>
                <h2 className="text-3xl font-black text-white italic tracking-tighter uppercase leading-none">Purification_Hub v2.0.1</h2>
              </div>
            </div>
            <div className="flex gap-4">
              <button onClick={syncAndAnalyzeMarket} disabled={loading} className="px-8 py-5 bg-slate-800 text-slate-300 rounded-2xl text-[10px] font-black uppercase tracking-widest border border-white/5 hover:bg-slate-700 transition-all">
                {isAnalyzing ? 'Grounding...' : 'Sync & AI Baseline'}
              </button>
              <button onClick={commitPurification} disabled={loading || rawUniverse.length === 0} className="px-12 py-5 bg-emerald-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-emerald-900/20 hover:scale-105 active:scale-95 transition-all">
                {loading ? 'Processing...' : 'Run Purification & Commit'}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-10">
            <div className="bg-black/40 p-10 rounded-3xl border border-white/10 group hover:border-emerald-500/30 transition-all relative">
              <div className="flex justify-between items-center mb-8">
                 <div><p className="text-[9px] font-black text-emerald-400 uppercase tracking-widest mb-1">Price Floor Matrix</p><p className="text-2xl font-black text-white italic tracking-tighter">${minPrice.toFixed(2)}</p></div>
                 <div className="text-right"><p className="text-[7px] font-black text-slate-500 uppercase mb-1">AI Recommendation</p><p className={`text-xs font-black italic ${isAnalyzing ? 'animate-pulse text-emerald-500/40' : 'text-emerald-500/80'}`}>{isAnalyzing ? 'Thinking...' : aiProposal ? `$${aiProposal.suggestedPrice.toFixed(2)}` : aiError ? 'ERROR' : '$---'}</p></div>
              </div>
              <input type="range" min="1.0" max="10.0" step="0.1" value={minPrice} onChange={(e) => handleManualChange('price', parseFloat(e.target.value))} className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-500" />
            </div>
            <div className="bg-black/40 p-10 rounded-3xl border border-white/10 group hover:border-emerald-500/30 transition-all relative">
              <div className="flex justify-between items-center mb-8">
                 <div><p className="text-[9px] font-black text-emerald-400 uppercase tracking-widest mb-1">Volume Threshold</p><p className="text-2xl font-black text-white italic tracking-tighter">{(minVolume/1000).toFixed(0)}k</p></div>
                 <div className="text-right"><p className="text-[7px] font-black text-slate-500 uppercase mb-1">AI Recommendation</p><p className={`text-xs font-black italic ${isAnalyzing ? 'animate-pulse text-emerald-500/40' : 'text-emerald-500/80'}`}>{isAnalyzing ? 'Thinking...' : aiProposal ? `${(aiProposal.suggestedVolume/1000).toFixed(0)}k` : aiError ? 'ERROR' : '---'}</p></div>
              </div>
              <input type="range" min="50000" max="2000000" step="10000" value={minVolume} onChange={(e) => handleManualChange('volume', parseInt(e.target.value))} className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-500" />
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-10">
            <div className="lg:col-span-2 bg-gradient-to-br from-emerald-600/10 to-transparent p-10 rounded-3xl border border-emerald-500/10 relative">
              <p className="text-[8px] font-black text-emerald-400 uppercase tracking-[0.3em] mb-4">Targeted Alpha Universe</p>
              <div className="flex items-baseline space-x-6">
                <span className="text-6xl font-black text-white italic tracking-tighter">{filteredCount.toLocaleString()}</span>
                <div className="flex flex-col"><span className="text-slate-500 text-[10px] uppercase font-bold tracking-widest italic">Purified Assets</span><span className="text-emerald-500/40 text-[8px] font-mono mt-1">Sieving {rawUniverse.length.toLocaleString()} Initial Tickers</span></div>
              </div>
            </div>
            <div className="bg-black/20 p-10 rounded-3xl border border-white/5 flex flex-col justify-center items-center">
              <p className="text-4xl font-black text-rose-500/80 italic tracking-tighter">-{((rawUniverse.length - filteredCount) / (rawUniverse.length || 1) * 100).toFixed(1)}%</p>
              <p className="text-[8px] text-slate-600 uppercase mt-4 font-bold tracking-widest">{rawUniverse.length - filteredCount} Assets Excluded</p>
            </div>
          </div>
        </div>
      </div>
      <div className="xl:col-span-1">
        <div className="glass-panel h-[720px] rounded-[40px] bg-slate-950 border-l-4 border-l-emerald-600 flex flex-col p-6 shadow-2xl overflow-hidden">
          <div className="flex items-center justify-between mb-8 px-2"><h3 className="font-black text-white text-[10px] uppercase tracking-[0.4em] italic">Purification_Terminal</h3></div>
          <div ref={logRef} className="flex-1 bg-black/70 p-6 rounded-[32px] font-mono text-[9px] text-emerald-300/60 overflow-y-auto no-scrollbar space-y-4 border border-white/5 leading-relaxed">
            {logs.map((l, i) => (<div key={i} className={`pl-4 border-l-2 ${l.includes('[OK]') ? 'border-emerald-500 text-emerald-400 bg-emerald-500/5' : 'border-blue-900'}`}>{l}</div>))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PreliminaryFilter;
