import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { GOOGLE_DRIVE_TARGET } from '../constants';
import { ApiProvider } from '../types';
import { generateAlphaSynthesis, runAiBacktest, generateTelegramBrief } from '../services/intelligenceService';

interface Props {
  selectedBrain: ApiProvider;
  setSelectedBrain: (provider: ApiProvider) => void;
  onFinalSymbolsDetected: (symbols: string[], fullData: any[]) => void;
  onStockSelected: (stock: any) => void;
  analyzingSymbols: Set<string>;
  autoStart: boolean;
  onComplete: (reportPayload: string) => void;
}

const MarkdownComponents = {
    p: ({node, ...props}: any) => <p className="mb-2 text-[10px] leading-relaxed text-slate-300" {...props} />,
    strong: ({node, ...props}: any) => <span className="font-bold text-emerald-400" {...props} />,
    li: ({node, ...props}: any) => <li className="ml-4 list-disc text-[10px] text-slate-300" {...props} />,
    h1: ({node, ...props}: any) => <h1 className="text-sm font-black text-white mt-4 mb-2" {...props} />,
    h2: ({node, ...props}: any) => <h2 className="text-xs font-black text-white mt-3 mb-1" {...props} />,
    h3: ({node, ...props}: any) => <h3 className="text-[10px] font-black text-white mt-2 mb-1" {...props} />,
};

const cleanMarkdown = (text: string) => {
    return text ? text.replace(/\*\*/g, '').replace(/##/g, '').replace(/-/g, '').trim() : '';
};

const AlphaAnalysis: React.FC<Props> = ({ 
    selectedBrain, 
    setSelectedBrain, 
    onFinalSymbolsDetected, 
    onStockSelected, 
    analyzingSymbols,
    autoStart, 
    onComplete 
}) => {
    const [loading, setLoading] = useState(false);
    const [alphaPicks, setAlphaPicks] = useState<any[]>([]);
    const [logs, setLogs] = useState<string[]>(['> Alpha_Node v6.0.0: Synthesis Engine Online.']);
    
    // Backtest State
    const [backtestResults, setBacktestResults] = useState<{[key: string]: any}>({});
    const [backtestLoading, setBacktestLoading] = useState<{[key: string]: boolean}>({});

    const accessToken = sessionStorage.getItem('gdrive_access_token');
    const logRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
    }, [logs]);

    const addLog = (m: string, t: 'info' | 'ok' | 'err' | 'warn' | 'signal' = 'info') => {
        const p = { info: '>', ok: '[OK]', err: '[ERR]', warn: '[WARN]', signal: '[AUTO]' };
        setLogs(prev => [...prev, `${p[t]} ${m}`].slice(-40));
    };

    // Auto-Start Logic
    useEffect(() => {
        if (autoStart && !loading && alphaPicks.length === 0) {
            addLog("AUTO-PILOT: Engaging Alpha Synthesis...", "signal");
            runSynthesis();
        }
    }, [autoStart]);

    const runSynthesis = async () => {
        if (loading) return;
        if (!accessToken) {
            addLog("Auth Token Missing.", "err");
            return;
        }

        setLoading(true);
        addLog(`Phase 1: Loading Stage 5 (ICT Elite) Data...`, "info");

        try {
            // 1. Fetch Stage 5 Data
            const q = encodeURIComponent(`name contains 'STAGE5_ICT_ELITE' and trashed = false`);
            const listRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&orderBy=createdTime desc&pageSize=1`, {
                headers: { 'Authorization': `Bearer ${accessToken}` }
            }).then(r => r.json());

            if (!listRes.files?.length) {
                addLog("Stage 5 data not found. Run Stage 5 first.", "err");
                setLoading(false);
                return;
            }

            const content = await fetch(`https://www.googleapis.com/drive/v3/files/${listRes.files[0].id}?alt=media`, {
                headers: { 'Authorization': `Bearer ${accessToken}` }
            }).then(r => r.json());

            const candidates = content.ict_universe || [];
            addLog(`Input: ${candidates.length} ICT Elite Assets.`, "info");

            // 2. Filter Top 12 for Deep Analysis
            const topCandidates = candidates
                .sort((a: any, b: any) => b.compositeAlpha - a.compositeAlpha)
                .slice(0, 12);
            
            addLog(`Selected Top 12 for AI Deep Synthesis via ${selectedBrain}...`, "info");

            // 3. AI Synthesis
            const { data: synthesisResults, error } = await generateAlphaSynthesis(topCandidates, selectedBrain);

            if (error || !synthesisResults) {
                throw new Error(error || "AI Synthesis returned empty.");
            }

            addLog(`AI Synthesis Complete: ${synthesisResults.length} Final Alpha Picks.`, "ok");
            setAlphaPicks(synthesisResults);
            onFinalSymbolsDetected(synthesisResults.map((s: any) => s.symbol), synthesisResults);

            // 4. Save to Vault (Stage 6)
            const folderId = await ensureFolder(accessToken, GOOGLE_DRIVE_TARGET.stage6SubFolder);
            const fileName = `STAGE6_ALPHA_FINAL_${new Date().toISOString().split('T')[0]}.json`;
            const payload = {
                manifest: { version: "6.0.0", brain: selectedBrain, count: synthesisResults.length, timestamp: new Date().toISOString() },
                alpha_picks: synthesisResults
            };
            
            await uploadFile(accessToken, folderId, fileName, payload);
            addLog(`Vault Finalized: ${fileName}`, "ok");

            // 5. Generate Telegram Brief & Complete
            if (autoStart) {
                addLog("Generating Telegram Brief...", "signal");
                const brief = await generateTelegramBrief(synthesisResults, selectedBrain);
                onComplete(brief);
            }

        } catch (e: any) {
            addLog(`Synthesis Error: ${e.message}`, "err");
        } finally {
            setLoading(false);
        }
    };

    const handleRunBacktest = async (stock: any, e: React.MouseEvent) => {
        e.stopPropagation();
        if (backtestLoading[stock.symbol]) return;

        setBacktestLoading(prev => ({ ...prev, [stock.symbol]: true }));
        addLog(`Running Backtest for ${stock.symbol}...`, "info");

        try {
            const { data, error, isRealData } = await runAiBacktest(stock, selectedBrain);
            if (error || !data) throw new Error(error || "Backtest Failed");

            setBacktestResults(prev => ({ 
                ...prev, 
                [stock.symbol]: { ...data, isRealData } 
            }));
            addLog(`Backtest Complete for ${stock.symbol}.`, "ok");

        } catch (e: any) {
            addLog(`Backtest Error (${stock.symbol}): ${e.message}`, "err");
        } finally {
            setBacktestLoading(prev => ({ ...prev, [stock.symbol]: false }));
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

    const uploadFile = async (token: string, folderId: string, name: string, content: any) => {
        const meta = { name, parents: [folderId], mimeType: 'application/json' };
        const form = new FormData();
        form.append('metadata', new Blob([JSON.stringify(meta)], { type: 'application/json' }));
        form.append('file', new Blob([JSON.stringify(content, null, 2)], { type: 'application/json' }));
        return fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
            method: 'POST', headers: { 'Authorization': `Bearer ${token}` }, body: form
        });
    };

    return (
        <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
            <div className="xl:col-span-3 space-y-6">
                <div className="glass-panel p-5 md:p-8 rounded-[32px] border-t-2 border-t-rose-500 shadow-2xl bg-slate-900/40">
                    <div className="flex justify-between items-center mb-6">
                         <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-2xl bg-rose-600/10 flex items-center justify-center border border-rose-500/20">
                                <span className="text-2xl">💎</span>
                            </div>
                            <div>
                                <h2 className="text-2xl font-black text-white italic uppercase tracking-tighter">Alpha_Synthesis v6.0</h2>
                                <div className="flex items-center gap-2 mt-1">
                                    <span className="text-[9px] font-bold text-rose-400 uppercase tracking-widest border border-rose-500/20 px-2 py-0.5 rounded">Brain: {selectedBrain}</span>
                                    {autoStart && <span className="text-[9px] font-bold bg-rose-600 text-white px-2 py-0.5 rounded animate-pulse">AUTO</span>}
                                </div>
                            </div>
                         </div>
                         <div className="flex gap-3">
                             {/* Brain Selector */}
                             <div className="flex bg-black/40 p-1 rounded-xl border border-white/10">
                                <button onClick={() => setSelectedBrain(ApiProvider.PERPLEXITY)} className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase transition-all ${selectedBrain === ApiProvider.PERPLEXITY ? 'bg-cyan-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}>Sonar</button>
                                <button onClick={() => setSelectedBrain(ApiProvider.GEMINI)} className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase transition-all ${selectedBrain === ApiProvider.GEMINI ? 'bg-emerald-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}>Gemini</button>
                             </div>
                             <button onClick={runSynthesis} disabled={loading} className="px-8 py-3 bg-rose-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:scale-105 transition-all shadow-lg shadow-rose-900/20 disabled:opacity-50">
                                 {loading ? 'Synthesizing...' : 'Execute Synthesis'}
                             </button>
                         </div>
                    </div>

                    {/* Alpha Picks Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {alphaPicks.map((stock, idx) => {
                            const uniqueChartId = `chart_${stock.symbol}`;
                            const chartColor = "#f43f5e";
                            const currentBacktest = backtestResults[stock.symbol];
                            const isBacktesting = backtestLoading[stock.symbol];
                            const chartData = currentBacktest?.equityCurve || [];

                            return (
                                <div key={idx} onClick={() => onStockSelected(stock)} className="bg-black/40 border border-white/5 rounded-3xl p-6 hover:border-rose-500/30 transition-all cursor-pointer group relative overflow-hidden">
                                     <div className="flex justify-between items-start mb-4">
                                         <div>
                                             <div className="flex items-center gap-2 mb-1">
                                                 <span className="text-2xl font-black text-white italic tracking-tighter">{stock.symbol}</span>
                                                 <span className="text-[9px] font-bold text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20">{stock.aiVerdict}</span>
                                             </div>
                                             <p className="text-[10px] text-slate-500 uppercase font-bold tracking-widest">{stock.sectorTheme}</p>
                                         </div>
                                         <div className="text-right">
                                             <p className="text-3xl font-black text-white italic tracking-tighter">{stock.convictionScore}<span className="text-sm text-slate-600">%</span></p>
                                             <p className="text-[8px] text-slate-500 uppercase font-bold">Conviction</p>
                                         </div>
                                     </div>
                                     
                                     <div className="space-y-2 mb-6">
                                         <div className="flex justify-between items-center text-[10px] border-b border-white/5 pb-1">
                                             <span className="text-slate-500 font-bold uppercase">Target</span>
                                             <span className="text-emerald-400 font-mono font-bold">${stock.resistanceLevel} ({stock.expectedReturn})</span>
                                         </div>
                                         <div className="flex justify-between items-center text-[10px] border-b border-white/5 pb-1">
                                             <span className="text-slate-500 font-bold uppercase">Entry</span>
                                             <span className="text-blue-400 font-mono font-bold">${stock.supportLevel}</span>
                                         </div>
                                         <div className="flex justify-between items-center text-[10px]">
                                             <span className="text-slate-500 font-bold uppercase">Stop</span>
                                             <span className="text-rose-400 font-mono font-bold">${stock.stopLoss}</span>
                                         </div>
                                     </div>

                                     {/* Rationale & Backtest Toggle Section */}
                                     <div className="lg:col-span-2 space-y-4">
                                        <div className="p-4 bg-black/30 rounded-2xl border border-white/5 shadow-inner">
                                            <h4 className="text-[8px] font-black text-slate-500 uppercase mb-2 italic tracking-widest">Alpha Core Rationale</h4>
                                            <ul className="space-y-2">
                                                {stock.selectionReasons?.length ? stock.selectionReasons.slice(0, 2).map((r: string, i: number) => (
                                                <li key={i} className="flex items-start gap-2">
                                                    <div className="w-1.5 h-1.5 rounded-full bg-rose-500 mt-1 shrink-0" />
                                                    <p className="text-[10px] font-medium text-slate-300 leading-snug">{cleanMarkdown(r)}</p>
                                                </li>
                                                )) : <li className="text-[10px] text-slate-500 italic">No specific rationale provided.</li>}
                                            </ul>
                                        </div>

                                        {/* Backtest Trigger */}
                                        {!currentBacktest && (
                                            <button 
                                                onClick={(e) => handleRunBacktest(stock, e)} 
                                                disabled={isBacktesting}
                                                className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-[9px] font-black uppercase tracking-widest border border-white/5 transition-all flex justify-center items-center gap-2"
                                            >
                                                {isBacktesting ? <div className="w-3 h-3 border-2 border-white/20 border-t-white rounded-full animate-spin"></div> : '⚡ Run Algo Backtest'}
                                            </button>
                                        )}

                                        {/* Backtest Results Display */}
                                        {currentBacktest && (
                                            <div className="bg-slate-900/50 rounded-2xl border border-white/5 p-4 animate-in fade-in slide-in-from-bottom-2">
                                                 <div className="flex justify-between items-center mb-4">
                                                    <h4 className="text-[9px] font-black text-blue-400 uppercase tracking-widest flex items-center gap-2">
                                                        <span className={`w-1.5 h-1.5 rounded-full ${currentBacktest.isRealData ? 'bg-emerald-500' : 'bg-blue-500'}`}></span>
                                                        {currentBacktest.isRealData ? 'Real-Data Sim' : 'AI Sim'}
                                                    </h4>
                                                    <span className="text-[8px] font-mono text-slate-500">{currentBacktest.metrics?.winRate} Win</span>
                                                 </div>
                                                 
                                                 <div className="h-[100px] w-full mb-4">
                                                    <ResponsiveContainer width="100%" height="100%">
                                                        <AreaChart data={chartData}>
                                                            <defs>
                                                                <linearGradient id={uniqueChartId} x1="0" y1="0" x2="0" y2="1">
                                                                    <stop offset="5%" stopColor={chartColor} stopOpacity={0.3}/>
                                                                    <stop offset="95%" stopColor={chartColor} stopOpacity={0}/>
                                                                </linearGradient>
                                                            </defs>
                                                            <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.1} vertical={false} />
                                                            <Area type="monotone" dataKey="value" stroke={chartColor} strokeWidth={2} fillOpacity={1} fill={`url(#${uniqueChartId})`} />
                                                        </AreaChart>
                                                    </ResponsiveContainer>
                                                 </div>

                                                 <div className="grid grid-cols-3 gap-2 text-[9px]">
                                                     <div className="bg-black/30 p-2 rounded border border-white/5 text-center">
                                                         <div className="text-slate-500 mb-0.5">Profit F.</div>
                                                         <div className="font-mono font-bold text-white">{currentBacktest.metrics?.profitFactor}</div>
                                                     </div>
                                                     <div className="bg-black/30 p-2 rounded border border-white/5 text-center">
                                                         <div className="text-slate-500 mb-0.5">MDD</div>
                                                         <div className="font-mono font-bold text-rose-400">{currentBacktest.metrics?.maxDrawdown}</div>
                                                     </div>
                                                     <div className="bg-black/30 p-2 rounded border border-white/5 text-center">
                                                         <div className="text-slate-500 mb-0.5">Sharpe</div>
                                                         <div className="font-mono font-bold text-emerald-400">{currentBacktest.metrics?.sharpeRatio}</div>
                                                     </div>
                                                 </div>
                                            </div>
                                        )}
                                     </div>
                                </div>
                            );
                        })}
                        {alphaPicks.length === 0 && !loading && (
                            <div className="col-span-2 py-20 flex flex-col items-center justify-center text-slate-500 opacity-50 border-2 border-dashed border-white/5 rounded-3xl">
                                <span className="text-4xl mb-4">🔮</span>
                                <p className="text-xs font-black uppercase tracking-widest">Ready to Synthesize Alpha</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Logs Terminal */}
            <div className="xl:col-span-1">
                <div className="glass-panel h-[600px] rounded-[32px] bg-slate-950 border-l-4 border-l-rose-600 flex flex-col p-6 shadow-2xl overflow-hidden">
                    <div className="flex items-center justify-between mb-8 px-2">
                        <h3 className="font-black text-white text-[10px] uppercase tracking-[0.4em] italic">Alpha_Terminal</h3>
                    </div>
                    <div ref={logRef} className="flex-1 bg-black/70 p-6 rounded-[32px] font-mono text-[9px] text-rose-300/60 overflow-y-auto no-scrollbar space-y-4 border border-white/5">
                        {logs.map((l, i) => (
                        <div key={i} className={`pl-4 border-l-2 ${l.includes('[OK]') ? 'border-emerald-500 text-emerald-400' : l.includes('[ERR]') ? 'border-red-500 text-red-400' : l.includes('[AUTO]') ? 'border-rose-500 text-rose-400' : 'border-rose-900'}`}>
                            {l}
                        </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AlphaAnalysis;