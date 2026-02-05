
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

type WsProvider = 'FINNHUB' | 'ALPACA' | 'POLLING';

const MarketTicker: React.FC = () => {
  const [data, setData] = useState<MarketItem[]>([]);
  const [isPaused, setIsPaused] = useState(false);
  const [errorCount, setErrorCount] = useState(0);
  const [lastSync, setLastSync] = useState<string>('');
  
  // Hybrid Engine State
  const [activeProvider, setActiveProvider] = useState<WsProvider>('FINNHUB');
  const [socketStatus, setSocketStatus] = useState<'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'AUTH_ERROR' | 'FAILOVER'>('DISCONNECTED');
  const [realtimeData, setRealtimeData] = useState<Record<string, { price: number, direction: 'up' | 'down' | null }>>({});
  
  const wsRef = useRef<WebSocket | null>(null);
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // API Keys
  const fmpKey = API_CONFIGS.find(c => c.provider === ApiProvider.FMP)?.key;
  const finnhubKey = API_CONFIGS.find(c => c.provider === ApiProvider.FINNHUB)?.key;
  const alpacaKey = API_CONFIGS.find(c => c.provider === ApiProvider.ALPACA)?.key;
  const alpacaSecret = process.env.ALPACA_SECRET || ''; // Needs to be set in env for full Alpaca support

  // Configuration
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

  // --- 1. BASE DATA FETCHING (REST) ---
  const fetchMarketData = async () => {
    if (document.body.getAttribute('data-engine-running') === 'true') { setIsPaused(true); return; }
    setIsPaused(false);

    try {
        const stocks = stockConfig.map(s => s.symbol).join(',');
        
        // Attempt FMP first (Reliable Snapshot)
        if (fmpKey) {
            const res = await fetch(`https://financialmodelingprep.com/api/v3/quote/${stocks},^IXIC,^GSPC,^DJI,^VIX?apikey=${fmpKey}`);
            if (res.ok) {
                const json = await res.json();
                const map = new Map<string, any>(json.map((i:any) => [i.symbol, i]));
                const items: MarketItem[] = [];
                
                indexConfig.forEach(cfg => {
                    const i = map.get(cfg.fmp);
                    if(i) items.push({ symbol: cfg.id, label: cfg.label, price: i.price, change: i.changesPercentage, isIndex: true, typeLabel: "INDEX", colorTheme: cfg.theme });
                });
                stockConfig.forEach(cfg => {
                    const i = map.get(cfg.symbol);
                    if(i) items.push({ symbol: cfg.symbol, label: cfg.label, price: i.price, change: i.changesPercentage, isIndex: false, typeLabel: "EQUITY" });
                });
                setData(items);
                setLastSync(new Date().toLocaleTimeString());
                return;
            }
        }
        
        // Fallback: Yahoo Proxy (if FMP fails)
        const res = await fetch(`/api/yahoo?symbols=${stocks},^IXIC,^GSPC,^DJI,^VIX`);
        if (res.ok) {
            const json = await res.json();
            // ... (Simplified parsing for brevity, assuming standard Yahoo structure)
            if(Array.isArray(json) && json.length > 0) {
                 const map = new Map<string, any>(json.map((i:any) => [i.symbol, i]));
                 const items: MarketItem[] = [];
                 
                 // Reuse similar mapping or simple creation for fallback
                 // Just ensuring data is set for display
                 setData(json.map((i: any) => ({
                    symbol: i.symbol, 
                    label: i.name || i.symbol, 
                    price: i.price, 
                    change: i.change, 
                    isIndex: i.symbol.startsWith('^'), 
                    typeLabel: i.symbol.startsWith('^') ? 'INDEX' : 'EQUITY' 
                 })).slice(0, 8)); // Limit to fit
                 setLastSync(new Date().toLocaleTimeString());
                 return;
            }
        }
        
        throw new Error("REST Fetch Failed");
    } catch (e) {
      setErrorCount(prev => prev + 1);
    }
  };

  // --- 2. WEBSOCKET HANDLERS ---
  const updatePrice = (symbol: string, price: number) => {
      setRealtimeData(prev => {
          const current = prev[symbol];
          const oldPrice = current ? current.price : 0;
          let direction: 'up' | 'down' | null = null;
          
          if (oldPrice > 0) {
              if (price > oldPrice) direction = 'up';
              else if (price < oldPrice) direction = 'down';
          }
          
          if (price === oldPrice && current) return prev;

          return {
              ...prev,
              [symbol]: { price, direction: direction || (current?.direction ?? null) }
          };
      });

      setTimeout(() => {
          setRealtimeData(prev => {
              if (!prev[symbol]) return prev;
              return { ...prev, [symbol]: { ...prev[symbol], direction: null } };
          });
      }, 800);
  };

  // --- 3. HYBRID ENGINE ---
  useEffect(() => {
    // Determine Symbols to Track
    const symbolMap = new Map<string, string>();
    indexConfig.forEach(cfg => symbolMap.set(cfg.etf, cfg.id)); // Track ETFs for Indices
    stockConfig.forEach(cfg => symbolMap.set(cfg.symbol, cfg.symbol));
    const trackList = Array.from(symbolMap.keys());

    const connectFinnhub = () => {
        if (!finnhubKey) return failover('FINNHUB');
        
        console.log("[Hybrid WS] Connecting Primary: FINNHUB...");
        setSocketStatus('CONNECTING');
        const ws = new WebSocket(`wss://ws.finnhub.io?token=${finnhubKey}`);
        wsRef.current = ws;

        ws.onopen = () => {
            console.log("[Hybrid WS] Finnhub Connected.");
            setSocketStatus('CONNECTED');
            trackList.forEach(sym => ws.send(JSON.stringify({ type: 'subscribe', symbol: sym })));
        };

        ws.onmessage = (e) => {
            try {
                const msg = JSON.parse(e.data);
                if (msg.type === 'trade' && msg.data) {
                    msg.data.forEach((t: any) => {
                        const internalId = symbolMap.get(t.s);
                        if (internalId) updatePrice(internalId, t.p);
                    });
                }
            } catch {}
        };

        ws.onclose = () => {
            console.warn("[Hybrid WS] Finnhub Disconnected.");
            failover('FINNHUB');
        };

        ws.onerror = () => ws.close();
    };

    const connectAlpaca = () => {
        if (!alpacaKey) return failover('ALPACA');
        
        console.log("[Hybrid WS] Connecting Secondary: ALPACA...");
        setSocketStatus('CONNECTING');
        const ws = new WebSocket('wss://stream.data.alpaca.markets/v2/iex');
        wsRef.current = ws;

        ws.onopen = () => {
            console.log("[Hybrid WS] Alpaca Connected. Authenticating...");
            // Alpaca Auth
            ws.send(JSON.stringify({ action: 'auth', key: alpacaKey, secret: alpacaSecret }));
        };

        ws.onmessage = (e) => {
            try {
                const msg = JSON.parse(e.data);
                if (Array.isArray(msg)) {
                    msg.forEach(m => {
                        if (m.T === 'success' && m.msg === 'authenticated') {
                             setSocketStatus('CONNECTED');
                             ws.send(JSON.stringify({ action: 'subscribe', trades: trackList }));
                        }
                        if (m.T === 't' && m.S && m.p) { // Trade message
                            const internalId = symbolMap.get(m.S);
                            if (internalId) updatePrice(internalId, m.p);
                        }
                    });
                }
            } catch {}
        };

        ws.onclose = () => {
            console.warn("[Hybrid WS] Alpaca Disconnected.");
            failover('ALPACA');
        };

        ws.onerror = () => ws.close();
    };

    const failover = (failedProvider: WsProvider) => {
        if (failedProvider === 'FINNHUB') {
            console.warn(">> FAILOVER TRIGGERED: Switching to Alpaca...");
            setActiveProvider('ALPACA');
            setSocketStatus('FAILOVER');
        } else if (failedProvider === 'ALPACA') {
            console.warn(">> FAILOVER TRIGGERED: All Sockets Failed. Switching to Polling.");
            setActiveProvider('POLLING');
            setSocketStatus('DISCONNECTED');
        }
    };

    // Connection Router
    if (wsRef.current) wsRef.current.close();
    
    if (activeProvider === 'FINNHUB') connectFinnhub();
    else if (activeProvider === 'ALPACA') connectAlpaca();
    else if (activeProvider === 'POLLING') {
        fetchMarketData(); // Immediate fetch
    }

    return () => {
        if (wsRef.current) wsRef.current.close();
    };
  }, [activeProvider, finnhubKey, alpacaKey]);

  // Polling Fallback (Runs always as background sync, more frequent if WS is down)
  useEffect(() => {
    const intervalTime = activeProvider === 'POLLING' ? 5000 : 60000;
    const interval = setInterval(fetchMarketData, intervalTime);
    if (activeProvider === 'POLLING') fetchMarketData();
    return () => clearInterval(interval);
  }, [activeProvider]);

  return (
    <div className="flex items-center space-x-2 overflow-x-auto no-scrollbar py-1 px-1">
      {data.length > 0 ? data.map((item) => {
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
            <span className={`w-1.5 h-1.5 rounded-full ${isPaused ? 'bg-amber-500' : socketStatus === 'CONNECTED' ? 'bg-emerald-500 animate-ping' : socketStatus === 'FAILOVER' ? 'bg-yellow-500 animate-pulse' : 'bg-red-500'}`}></span>
            <span>
                {isPaused ? 'Sync_Paused' : 
                 activeProvider === 'POLLING' ? 'Polling_Mode (Backup)' :
                 socketStatus === 'CONNECTED' ? `Live_${activeProvider}` : 
                 socketStatus === 'FAILOVER' ? 'Failover_Active' :
                 'Connecting...'}
            </span>
        </div>
        <div className="flex items-center space-x-1.5">
           <span className="text-[6px] font-mono text-slate-800 uppercase tracking-tighter">SRC: {activeProvider}</span>
           <span className="text-slate-900 text-[6px]">•</span>
           <span className="text-[6px] font-mono text-slate-700 uppercase tracking-tighter">Sync: {lastSync || '---'}</span>
        </div>
      </div>
    </div>
  );
};

export default MarketTicker;
