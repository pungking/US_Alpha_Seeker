
import React, { useState, useEffect, useRef } from 'react';
import { API_CONFIGS } from '../constants';
import { ApiProvider } from '../types';

interface MarketItem {
  symbol: string;
  label: string;
  price: number;
  change: number;
  isIndex: boolean;
  typeLabel: string;
  colorTheme?: string;
  isProxy?: boolean;
}

const MarketTicker: React.FC = () => {
  const [data, setData] = useState<MarketItem[]>([]);
  const [isPaused, setIsPaused] = useState(false);
  const [errorCount, setErrorCount] = useState(0);
  const [lastSync, setLastSync] = useState<string>('');
  const [activeSource, setActiveSource] = useState<string>('INIT');

  // Real-time State
  const [realtimeData, setRealtimeData] = useState<Record<string, { price: number, direction: 'up' | 'down' | null }>>({});
  const [socketStatus, setSocketStatus] = useState<'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'AUTH_ERROR'>('DISCONNECTED');
  
  const wsRef = useRef<WebSocket | null>(null);
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fmpKey = API_CONFIGS.find(c => c.provider === ApiProvider.FMP)?.key;
  const finnhubKey = API_CONFIGS.find(c => c.provider === ApiProvider.FINNHUB)?.key;
  
  // Finnhub (Free) is Real-time for trades, not delayed.
  const isPollingOnly = !finnhubKey;
  const isDelayed = false;

  // Configuration: Added ETF mapping for real-time proxy
  const indexConfig = [
    { id: 'NASDAQ', portalId: 'NASDAQ', yahoo: '^IXIC', fmp: '^IXIC', poly: 'I:NDX', etf: 'QQQ', label: 'NASDAQ 100', theme: 'text-indigo-400' },
    { id: 'SP500', portalId: 'SP500', yahoo: '^GSPC', fmp: '^GSPC', poly: 'I:SPX', etf: 'SPY', label: 'S&P 500', theme: 'text-blue-400' },
    { id: 'DOW', portalId: 'DOW', yahoo: '^DJI', fmp: '^DJI', poly: 'I:DJI', etf: 'DIA', label: 'DOW JONES', theme: 'text-slate-400' },
    { id: 'VIX', portalId: 'VIX', yahoo: '^VIX', fmp: '^VIX', poly: 'I:VIX', etf: 'VXX', label: 'VIX (Fear)', theme: 'text-purple-400' },
  ];

  const stockConfig = [
    { symbol: 'AAPL', label: 'APPLE' },
    { symbol: 'NVDA', label: 'NVIDIA' },
    { symbol: 'TSLA', label: 'TESLA' },
    { symbol: 'MSFT', label: 'MICROSOFT' },
  ];

  // --- REST API FETCHING (BASE LAYER) ---
  const fetchPortalProxy = async () => {
      const res = await fetch('/api/portal_indices');
      if (!res.ok) throw new Error("Portal Proxy Failed");
      
      const json = await res.json();
      if (!Array.isArray(json) || json.length === 0) throw new Error("Portal Data Empty");

      const finalItems: MarketItem[] = [];
      const dataMap = new Map<string, any>(json.map((item: any) => [item.symbol, item]));

      let indexCount = 0;
      let providerName = 'PORTAL_HYBRID';

      indexConfig.forEach(cfg => {
          const item = dataMap.get(cfg.portalId);
          if (item) {
              if (item.source) providerName = item.source;
              finalItems.push({
                  symbol: cfg.id,
                  label: cfg.label,
                  price: item.price,
                  change: item.change,
                  isIndex: true,
                  typeLabel: cfg.id === 'VIX' ? "FEAR_INDEX" : "Composite",
                  colorTheme: cfg.theme
              });
              indexCount++;
          }
      });
      
      stockConfig.forEach(cfg => {
          const item = dataMap.get(cfg.symbol);
          if (item) {
              finalItems.push({
                  symbol: cfg.symbol,
                  label: cfg.label,
                  price: item.price,
                  change: item.change,
                  isIndex: false,
                  typeLabel: "Equity"
              });
          }
      });
      
      if (indexCount < 2) throw new Error("Portal Insufficient Indices");
      return { items: finalItems, source: providerName };
  };

  const fetchYahooProxy = async () => {
    const indices = indexConfig.map(i => i.yahoo).join(',');
    const stocks = stockConfig.map(s => s.symbol).join(',');
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    try {
        const res = await fetch(`/api/yahoo?symbols=${indices},${stocks}`, { signal: controller.signal });
        clearTimeout(timeoutId);
        if (!res.ok) throw new Error("Yahoo Proxy Failed");
        const json = await res.json();
        
        const finalItems: MarketItem[] = [];
        const dataMap = new Map<string, any>(json.map((item: any) => [item.symbol, item]));

        indexConfig.forEach(cfg => {
            const item = dataMap.get(cfg.yahoo);
            if (item) {
                finalItems.push({
                    symbol: cfg.id,
                    label: cfg.label,
                    price: item.price,
                    change: item.change,
                    isIndex: true,
                    typeLabel: cfg.id === 'VIX' ? "FEAR_INDEX" : "Composite",
                    colorTheme: cfg.theme
                });
            }
        });

        stockConfig.forEach(cfg => {
            const item = dataMap.get(cfg.symbol);
            if (item) finalItems.push({ symbol: cfg.symbol, label: cfg.label, price: item.price, change: item.change, isIndex: false, typeLabel: "Equity" });
        });

        if (finalItems.length < 2) throw new Error("Yahoo Insufficient Data");
        return finalItems;
    } catch (e) {
        clearTimeout(timeoutId);
        throw e;
    }
  };

  const fetchFMP = async () => {
      if (!fmpKey) throw new Error("No FMP Key");
      const indices = indexConfig.map(i => i.fmp).join(',');
      const stocks = stockConfig.map(s => s.symbol).join(',');
      const [idxRes, stkRes] = await Promise.all([
          fetch(`https://financialmodelingprep.com/api/v3/quote/${indices}?apikey=${fmpKey}`),
          fetch(`https://financialmodelingprep.com/api/v3/quote/${stocks}?apikey=${fmpKey}`)
      ]);
      if (!idxRes.ok) throw new Error("FMP Index Error");
      const idxData = await idxRes.json();
      const stkData = await stkRes.json();
      
      const finalItems: MarketItem[] = [];
      const dataMap = new Map<string, any>([...idxData, ...(stkData || [])].map((item: any) => [item.symbol, item]));
      
      indexConfig.forEach(cfg => {
          const item = dataMap.get(cfg.fmp);
          if (item) finalItems.push({ symbol: cfg.id, label: cfg.label, price: item.price, change: item.changesPercentage, isIndex: true, typeLabel: cfg.id === 'VIX' ? "FEAR_INDEX" : "Composite", colorTheme: cfg.theme });
      });
      stockConfig.forEach(cfg => {
          const item = dataMap.get(cfg.symbol);
          if (item) finalItems.push({ symbol: cfg.symbol, label: cfg.label, price: item.price, change: item.changesPercentage, isIndex: false, typeLabel: "Equity" });
      });
      return finalItems;
  };
  
  const fetchEtfProxies = async () => {
    if (!finnhubKey) throw new Error("No Finnhub Key");
    const providerName = 'FHUB_ETF_PROXY';
    const etfMap = indexConfig.map(cfg => ({ ...cfg, target: cfg.etf }));
    const promises = [
        ...etfMap.map(cfg => fetch(`https://finnhub.io/api/v1/quote?symbol=${cfg.target}&token=${finnhubKey}`).then(r => r.json()).then(d => ({ ...d, id: cfg.id, label: `${cfg.label} (ETF)`, isIndex: true, theme: cfg.theme, typeLabel: cfg.id === 'VIX' ? "FEAR_ETF" : "Composite_ETF", isProxy: true }))),
        ...stockConfig.map(cfg => fetch(`https://finnhub.io/api/v1/quote?symbol=${cfg.symbol}&token=${finnhubKey}`).then(r => r.json()).then(d => ({ ...d, id: cfg.symbol, label: cfg.label, isIndex: false, typeLabel: "Equity" })))
    ];
    const results = await Promise.all(promises);
    const valid = results.filter((r: any) => r.c > 0);
    if (valid.length === 0) throw new Error("ETF Proxy Failed");
    return { items: valid.map((item: any) => ({ symbol: item.id, label: item.label, price: item.c, change: item.dp, isIndex: item.isIndex, typeLabel: item.typeLabel, colorTheme: item.theme, isProxy: item.isProxy })), source: providerName };
  };

  const fetchMarketData = async () => {
    if (document.body.getAttribute('data-engine-running') === 'true') { setIsPaused(true); return; }
    setIsPaused(false);

    try {
        try {
            const result = await fetchPortalProxy();
            setData(result.items);
            setActiveSource(result.source);
            setErrorCount(0);
            setLastSync(new Date().toLocaleTimeString());
            return;
        } catch (e) { /* Fallback */ }

        try {
            const items = await fetchYahooProxy();
            setData(items);
            setActiveSource('YAHOO_PORTAL');
            setErrorCount(0);
            setLastSync(new Date().toLocaleTimeString());
            return;
        } catch (e) { /* Fallback */ }

        try {
            const items = await fetchFMP();
            setData(items);
            setActiveSource('FMP_v3');
            setErrorCount(0);
            setLastSync(new Date().toLocaleTimeString());
            return;
        } catch (e) { /* Fallback */ }
        
        try {
            const result = await fetchEtfProxies();
            setData(result.items);
            setActiveSource(result.source);
            setErrorCount(0);
            setLastSync(new Date().toLocaleTimeString());
            return;
        } catch (e) { throw new Error("All Failed"); }

    } catch (e) {
      console.warn("Market sync delayed:", e);
      setErrorCount(prev => prev + 1);
    }
  };

  // --- FINNHUB WEBSOCKET IMPLEMENTATION ---
  useEffect(() => {
    if (!finnhubKey) return;

    // Map Finnhub trade symbols back to our internal IDs
    // Stocks: AAPL -> AAPL
    // ETFs: QQQ -> NASDAQ, SPY -> SP500
    const symbolMap = new Map<string, string>();
    indexConfig.forEach(cfg => symbolMap.set(cfg.etf, cfg.id));
    stockConfig.forEach(cfg => symbolMap.set(cfg.symbol, cfg.symbol));

    const connect = () => {
        if (wsRef.current) {
            wsRef.current.close();
        }

        console.log(`[Finnhub WS] Connecting...`);
        setSocketStatus('CONNECTING');

        const ws = new WebSocket(`wss://ws.finnhub.io?token=${finnhubKey}`);
        wsRef.current = ws;

        ws.onopen = () => {
            console.log("[Finnhub WS] Connected. Subscribing...");
            setSocketStatus('CONNECTED');
            
            // Subscribe to Stocks
            stockConfig.forEach(cfg => {
                ws.send(JSON.stringify({ type: 'subscribe', symbol: cfg.symbol }));
            });
            // Subscribe to ETFs (as proxies for Indices)
            indexConfig.forEach(cfg => {
                ws.send(JSON.stringify({ type: 'subscribe', symbol: cfg.etf }));
            });
        };

        ws.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data);
                if (msg.type === 'trade' && msg.data) {
                    msg.data.forEach((trade: any) => {
                        const sym = trade.s; // Symbol
                        const price = trade.p; // Price
                        const internalId = symbolMap.get(sym);
                        
                        if (internalId && price > 0) {
                             setRealtimeData(prev => {
                                const current = prev[internalId];
                                const oldPrice = current ? current.price : 0;
                                let direction: 'up' | 'down' | null = null;
                                
                                if (oldPrice > 0) {
                                    if (price > oldPrice) direction = 'up';
                                    else if (price < oldPrice) direction = 'down';
                                }
                                
                                if (price === oldPrice && current) return prev; // No change

                                return {
                                    ...prev,
                                    [internalId]: { price, direction: direction || (current?.direction ?? null) }
                                };
                            });

                             // Reset direction after flash
                             setTimeout(() => {
                                setRealtimeData(prev => {
                                    if (!prev[internalId]) return prev;
                                    return { ...prev, [internalId]: { ...prev[internalId], direction: null } };
                                });
                            }, 800);
                        }
                    });
                }
            } catch (e) {
                console.error("WS Parse Error", e);
            }
        };

        ws.onclose = (e) => {
            console.log("[Finnhub WS] Closed", e.code, e.reason);
            setSocketStatus('DISCONNECTED');
            setRealtimeData({}); // <--- IMPORTANT: Clear RT data to revert to fixed (REST) amounts
            
            // Retry after delay
            retryTimeoutRef.current = setTimeout(() => {
                connect();
            }, 5000);
        };

        ws.onerror = (e) => {
            console.error("[Finnhub WS] Error", e);
            ws.close();
        };
    };

    connect();

    return () => {
        if (wsRef.current) wsRef.current.close();
        if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
    };
  }, [finnhubKey]);


  // Initial Poll + Interval (Fallback)
  useEffect(() => {
    fetchMarketData();
    const interval = setInterval(fetchMarketData, 60000); 
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex items-center space-x-2 overflow-x-auto no-scrollbar py-1 px-1">
      {data.length > 0 ? data.map((item) => {
        // Fallback Logic: Use Realtime if available AND Connected, otherwise use fixed Item Price
        // Since we clear realtimeData on disconnect, this check implicitly handles it.
        const rt = realtimeData[item.symbol];
        const displayPrice = rt ? rt.price : item.price;
        
        const flashClass = rt?.direction === 'up' ? 'bg-emerald-500/10 border-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.3)]' 
                         : rt?.direction === 'down' ? 'bg-rose-500/10 border-rose-500 shadow-[0_0_15px_rgba(244,63,94,0.3)]' 
                         : 'hover:bg-white/5';

        return (
            <div 
            key={item.symbol} 
            className={`flex-shrink-0 glass-panel px-4 py-2 rounded-xl border-l-2 flex items-center space-x-3 transition-all duration-300 ${item.typeLabel.includes('FEAR') ? 'bg-purple-900/10 border-l-purple-500' : ''} ${flashClass}`}
            style={{ borderLeftColor: item.typeLabel.includes('FEAR') ? '#a855f7' : item.change >= 0 ? '#10b981' : '#ef4444' }}
            >
            <div className="flex flex-col">
                <span className={`text-[7px] font-black uppercase tracking-widest ${item.colorTheme || 'text-slate-500'}`}>
                {item.typeLabel}
                </span>
                <span className="text-[10px] font-black text-white italic tracking-tighter uppercase whitespace-nowrap">{item.label}</span>
            </div>
            <div className="text-right">
                <p className={`text-[10px] font-mono font-bold tracking-tighter ${rt?.direction === 'up' ? 'text-emerald-400' : rt?.direction === 'down' ? 'text-rose-400' : 'text-white'}`}>
                {displayPrice > 1000 ? displayPrice.toLocaleString(undefined, { maximumFractionDigits: 0 }) : displayPrice.toFixed(2)}
                </p>
                <div className="flex items-center justify-end gap-1">
                    {socketStatus === 'CONNECTED' && rt && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>}
                    <p className={`text-[8px] font-black ${item.change >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {item.change >= 0 ? '▲' : '▼'} {Math.abs(item.change).toFixed(2)}%
                    </p>
                </div>
            </div>
            </div>
        );
      }) : (
        <div className="text-[10px] font-black text-slate-700 animate-pulse uppercase px-4">
          {errorCount > 2 ? 'CONNECTIVITY_ERROR: RETRYING...' : 'ESTABLISHING SECURE FEED...'}
        </div>
      )}
      <div className="flex-1 h-[1px] bg-white/5 ml-4"></div>
      <div className="flex flex-col items-end space-y-0.5 ml-4">
        <div className="flex items-center space-x-2 text-[7px] font-black text-slate-600 uppercase tracking-widest italic whitespace-nowrap">
            <span className={`w-1.5 h-1.5 rounded-full ${isPaused ? 'bg-amber-500' : socketStatus === 'CONNECTED' ? 'bg-emerald-500 animate-ping' : socketStatus === 'CONNECTING' ? 'bg-yellow-500 animate-pulse' : 'bg-red-500'}`}></span>
            <span>
                {isPaused ? 'Sync_Paused' : 
                 socketStatus === 'CONNECTED' ? (isDelayed ? 'WS_Live (Delayed)' : 'WS_Realtime') : 
                 isPollingOnly ? 'Polling_Mode (Plan Limit)' :
                 socketStatus === 'CONNECTING' ? 'WS_Connecting...' : 
                 'Polling_Mode'}
            </span>
        </div>
        <div className="flex items-center space-x-1.5">
           <span className="text-[6px] font-mono text-slate-800 uppercase tracking-tighter">SRC: {socketStatus === 'CONNECTED' ? 'FINNHUB_LIVE' : activeSource}</span>
           <span className="text-slate-900 text-[6px]">•</span>
           <span className="text-[6px] font-mono text-slate-700 uppercase tracking-tighter">Upd: {lastSync || '---'}</span>
        </div>
      </div>
    </div>
  );
};

export default MarketTicker;
