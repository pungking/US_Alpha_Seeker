
import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI, Type } from "@google/genai";
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

interface MarketStats {
  medianPrice: number;
  medianVolume: number;
  p15Price: number;
  p40Volume: number;
  totalCount: number;
}

const PreliminaryFilter: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [rawUniverse, setRawUniverse] = useState<MasterTicker[]>([]);
  const [filteredCount, setFilteredCount] = useState(0);
  const [logs, setLogs] = useState<string[]>(['> Filter_Node v1.8.0: AI-Driven Purification Online.']);
  
  // 가변 필터 상태
  const [minPrice, setMinPrice] = useState(2.0);
  const [minVolume, setMinVolume] = useState(500000);
  const [aiReasoning, setAiReasoning] = useState<string>("");
  
  const accessToken = sessionStorage.getItem('gdrive_access_token');
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  // 슬라이더 값 변경 시 예상 필터 결과 개수 실시간 반영
  useEffect(() => {
    if (rawUniverse.length > 0) {
      const count = rawUniverse.filter(s => s.price >= minPrice && s.volume >= minVolume).length;
      setFilteredCount(count);
    }
  }, [minPrice, minVolume, rawUniverse]);

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
    addLog("Phase 1: Retrieving Stage 0 Master Universe...", "info");

    try {
      const folderQ = encodeURIComponent(`name = '${GOOGLE_DRIVE_TARGET.targetSubFolder}' and '${GOOGLE_DRIVE_TARGET.rootFolderId}' in parents and trashed = false`);
      const folderRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${folderQ}`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      }).then(r => r.json());

      if (!folderRes.files?.length) throw new Error("Stage 0 Directory missing.");

      const fileQ = encodeURIComponent(`name contains 'STAGE0_MASTER_UNIVERSE' and '${folderRes.files[0].id}' in parents and trashed = false`);
      const listRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${fileQ}&orderBy=createdTime desc&pageSize=1`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      }).then(r => r.json());

      if (!listRes.files?.length) throw new Error("Master Universe Matrix not found.");

      const contentRes = await fetch(`https://www.googleapis.com/drive/v3/files/${listRes.files[0].id}?alt=media`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      }).then(r => r.json());

      const data = contentRes.universe || [];
      setRawUniverse(data);
      addLog(`Synced ${data.length} assets. Initializing AI Market Baseline Analysis...`, "ok");

      // AI 시장 진단 로직
      const prices = data.map((s: any) => s.price).filter((p: any) => p > 0).sort((a: any, b: any) => a - b);
      const volumes = data.map((s: any) => s.volume).filter((v: any) => v > 0).sort((a: any, b: any) => a - b);
      
      const statsSummary = {
        avgPrice: prices.reduce((a:number,b:number)=>a+b,0)/prices.length,
        p10Price: prices[Math.floor(prices.length * 0.1)],
        p50Price: prices[Math.floor(prices.length * 0.5)],
        p30Volume: volumes[Math.floor(volumes.length * 0.3)],
        totalCount: data.length
      };

      const geminiConfig = API_CONFIGS.find(c => c.provider === ApiProvider.GEMINI);
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || geminiConfig?.key || "" });
      
      const prompt = `당신은 시장 유동성 분석 전문가입니다. 다음 미국 주식 시장 통계 데이터를 분석하여, '투자 부적격(Penny Stock 및 유동성 부족)' 종목을 필터링하기 위한 최적의 최소 가격(minPrice)과 최소 거래량(minVolume) 하한선을 제안하십시오.
      데이터: ${JSON.stringify(statsSummary)}
      
      지침:
      1. minPrice는 $1.0~$5.0 사이로 제안하십시오.
      2. minVolume은 50,000~1,000,000 사이로 제안하십시오.
      3. 제안 이유를 한국어 전문 용어를 섞어 마크다운 형식으로 'reasoning' 필드에 작성하십시오.
      
      응답은 반드시 다음 JSON 형식을 따르십시오:
      { "suggestedPrice": number, "suggestedVolume": number, "reasoning": "string" }`;

      const aiResponse = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
        config: { responseMimeType: "application/json" }
      });

      const aiData = JSON.parse(aiResponse.text || "{}");
      setMinPrice(aiData.suggestedPrice || 2.0);
      setMinVolume(aiData.suggestedVolume || 500000);
      setAiReasoning(aiData.reasoning || "기본 통계 모델을 기반으로 하한선이 설정되었습니다.");
      
      addLog("AI Market Diagnosis Complete. Strategy Grounding established.", "ok");
    } catch (e: any) {
      addLog(`AI Analysis Failure: ${e.message}. Using Default Percentiles.`, "warn");
      setMinPrice(2.0);
      setMinVolume(500000);
    } finally {
      setLoading(false);
      setIsAnalyzing(false);
    }
  };

  const commitPurification = async () => {
    if (!accessToken || rawUniverse.length === 0) return;
    setLoading(true);
    addLog(`Phase 2: Executing Purification with manual overrides... (P: $${minPrice}, V: ${minVolume})`, "info");

    try {
      const filtered = rawUniverse.filter(s => s.price >= minPrice && s.volume >= minVolume);
      
      const folderId = await ensureFolder(accessToken, GOOGLE_DRIVE_TARGET.stage1SubFolder);
      const fileName = `STAGE1_INVESTABLE_UNIVERSE_${new Date().toISOString().split('T')[0]}.json`;
      const payload = {
        manifest: { 
          version: "1.8.0", 
          node: "AI_Manual_Hybrid", 
          count: filtered.length, 
          filters: { minPrice, minVolume },
          timestamp: new Date().toISOString() 
        },
        investable_universe: filtered
      };

      const meta = { name: fileName, parents: [folderId], mimeType: 'application/json' };
      const form = new FormData();
      form.append('metadata', new Blob([JSON.stringify(meta)], { type: 'application/json' }));
      form.append('file', new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));

      await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST', headers: { 'Authorization': `Bearer ${accessToken}` }, body: form
      });

      addLog(`Vault Finalized: ${fileName} (${filtered.length} assets)`, "ok");
    } catch (e: any) {
      addLog(`Commit Error: ${e.message}`, "err");
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
                <h2 className="text-3xl font-black text-white italic tracking-tighter uppercase leading-none">Purification_Hub v1.8.0</h2>
                <div className="flex items-center space-x-2 mt-2">
                   <span className="text-[8px] font-black px-2 py-0.5 rounded border border-emerald-500/20 bg-emerald-500/10 text-emerald-400 uppercase tracking-widest">AI_Manual_Hybrid_Pipeline</span>
                </div>
              </div>
            </div>
            <div className="flex gap-4">
              <button 
                onClick={syncAndAnalyzeMarket} 
                disabled={loading}
                className={`px-8 py-5 bg-slate-800 text-slate-300 rounded-2xl text-[10px] font-black uppercase tracking-widest border border-white/5 hover:bg-slate-700 transition-all`}
              >
                {isAnalyzing ? 'AI Diagnosing...' : 'Sync & AI Baseline'}
              </button>
              <button 
                onClick={commitPurification} 
                disabled={loading || rawUniverse.length === 0}
                className={`px-12 py-5 bg-emerald-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-emerald-900/20 hover:scale-105 transition-all disabled:opacity-50`}
              >
                {loading ? 'Processing...' : 'Run Purification & Commit'}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
            <div className="col-span-2 bg-gradient-to-br from-emerald-600/10 to-transparent p-8 rounded-3xl border border-emerald-500/10">
              <p className="text-[8px] font-black text-emerald-400 uppercase tracking-[0.3em] mb-2">Expected Alpha Universe</p>
              <div className="flex items-baseline space-x-6">
                <span className="text-5xl font-black text-white italic tracking-tighter">{filteredCount.toLocaleString()}</span>
                <span className="text-slate-500 text-[10px] uppercase font-bold tracking-widest italic">Purified Candidates</span>
              </div>
            </div>
            <div className="bg-black/20 p-8 rounded-3xl border border-white/5 flex flex-col justify-center text-center">
              <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-2">Trash/ETF Purge</p>
              <p className="text-3xl font-black text-indigo-500/80 italic">{rawUniverse.length - filteredCount}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-10">
            <div className="bg-black/40 p-8 rounded-3xl border border-white/10 group hover:border-blue-500/30 transition-colors">
              <div className="flex justify-between items-center mb-6">
                 <p className="text-[9px] font-black text-blue-400 uppercase tracking-widest">Price Floor: ${minPrice.toFixed(2)}</p>
                 <span className="text-[8px] text-slate-500 font-bold uppercase">Min: $1.00</span>
              </div>
              <input 
                type="range" 
                min="1.0" 
                max="10.0" 
                step="0.1" 
                value={minPrice} 
                onChange={(e) => setMinPrice(parseFloat(e.target.value))}
                className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-blue-500" 
              />
            </div>
            <div className="bg-black/40 p-8 rounded-3xl border border-white/10 group hover:border-blue-500/30 transition-colors">
              <div className="flex justify-between items-center mb-6">
                 <p className="text-[9px] font-black text-blue-400 uppercase tracking-widest">Volume Floor: {(minVolume/1000).toFixed(0)}k</p>
                 <span className="text-[8px] text-slate-500 font-bold uppercase">Min: 50k</span>
              </div>
              <input 
                type="range" 
                min="50000" 
                max="2000000" 
                step="10000" 
                value={minVolume} 
                onChange={(e) => setMinVolume(parseInt(e.target.value))}
                className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-blue-500" 
              />
            </div>
          </div>

          {aiReasoning && (
            <div className="bg-emerald-500/5 p-8 rounded-3xl border border-emerald-500/20 animate-in fade-in slide-in-from-top-4 duration-500">
               <div className="flex items-center space-x-3 mb-4">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
                  <h4 className="text-[10px] font-black text-emerald-500 uppercase tracking-[0.4em]">AI Strategic Grounding</h4>
               </div>
               <p className="text-xs text-slate-400 leading-relaxed font-medium italic">
                 {aiReasoning}
               </p>
            </div>
          )}
        </div>
      </div>

      <div className="xl:col-span-1">
        <div className="glass-panel h-[720px] rounded-[40px] bg-slate-950 border-l-4 border-l-emerald-600 flex flex-col p-6 shadow-2xl overflow-hidden">
          <div className="flex items-center justify-between mb-8 px-2">
            <h3 className="font-black text-white text-[10px] uppercase tracking-[0.4em] italic">Purification_Terminal</h3>
          </div>
          <div ref={logRef} className="flex-1 bg-black/70 p-6 rounded-[32px] font-mono text-[9px] text-emerald-300/60 overflow-y-auto no-scrollbar space-y-4 border border-white/5">
            {logs.map((l, i) => (
              <div key={i} className={`pl-4 border-l-2 transition-all duration-300 ${l.includes('[OK]') ? 'border-emerald-500 text-emerald-400 bg-emerald-500/5' : 'border-blue-900'}`}>
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
