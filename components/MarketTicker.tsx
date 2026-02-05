
import React, { useState, useEffect, useRef } from 'react';
import { ApiProvider } from '../types';
import { API_CONFIGS } from '../constants';

type WsProvider = 'FINNHUB' | 'ALPACA' | 'POLLING';

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
  const [marketData, setMarketData] = useState<MarketItem[]>([]);
  const [socketStatus, setSocketStatus] = useState<string>('INIT');
  const [lastUpdate, setLastUpdate] = useState<string>('');
  const [activeProvider, setActiveProvider] = useState<WsProvider>('POLLING');
  
  const wsRef = useRef<WebSocket | null>(null);

  const finnhubKey = API_CONFIGS.find(c => c.provider === ApiProvider.FINNHUB)?.key;
  const alpacaKey = API_CONFIGS.find(c => c.provider === ApiProvider.ALPACA)?.key;
  const alpacaSecret = ''; // Secret logic not fully implemented in frontend config

  // [UPDATED] Reordered: IXIC (Composite) FIRST, then NDX (100)
  const indexConfig = [
    { id: 'IXIC', portalId: 'IXIC', etf: 'ONEQ', label: 'NASDAQ Comp', theme: 'text-purple-400' },
    { id: 'NDX', portalId: 'NDX', etf: 'QQQ', label: 'NASDAQ 100', theme: 'text-indigo-400' },
    { id: 'SPX', portalId: 'SPX', etf: 'SPY', label: 'S&P 500', theme: 'text-blue-400' },
    { id: 'DJI', portalId: 'DJI', etf: 'DIA', label: 'DOW JONES', theme: 'text-slate-400' },
    { id: 'VIX', portalId: 'VIX', etf: 'VXX', label: 'VIX (Fear)', theme: 'text-rose-400' },
  ];

  const stockConfig = [
    { symbol: 'AAPL', label: 'APPLE' },
    { symbol: 'NVDA', label: 'NVIDIA' },
    { symbol: 'TSLA', label: 'TESLA' },
    { symbol: 'MSFT', label: 'MICROSOFT' },
  ];

  const updatePrice = (symbol: string, price: number) => {
      setMarketData(prev => {
          const next = [...prev];
          const idx = next.findIndex(i => i.symbol === symbol);
          if (idx !== -1) {
              next[idx] = { ...next[idx], price };
          }
          return next;
      });
      // [UX FIX] 24-hour format
      setLastUpdate(new Date().toLocaleTimeString('en-GB', { hour12: false }));
  };

  const fetchMarketData = async () => {
      try {
          const res = await fetch('/api/portal_indices');
          if (!res.ok) throw new Error('Portal API Failed');
          const data = await res.json();
          
          const map = new Map<string, any>(data.map((d: any) => [d.symbol, d]));
          const formatted: MarketItem[] = [];
          let source = "PORTAL_HYBRID";

          indexConfig.forEach(cfg => {
              const d = map.get(cfg.portalId);
              if (d) {
                  if (d.source) source = d.source;
                  formatted.push({
                      symbol: cfg.id,
                      label: cfg.label,
                      price: d.price,
                      change: d.change,
                      isIndex: true,
                      typeLabel: cfg.id === 'VIX' ? 'FEAR_INDEX' : 'Composite',
                      colorTheme: cfg.theme
                  });
              }
          });

          stockConfig.forEach(cfg => {
              const d = map.get(cfg.symbol);
              if (d) {
                  formatted.push({
                      symbol: cfg.symbol,
                      label: cfg.label,
                      price: d.price,
                      change: d.change,
                      isIndex: false,
                      typeLabel: 'Equity'
                  });
              }
          });

          if (formatted.length > 0) {
              setMarketData(formatted);
              // [UX FIX] 24-hour format
              setLastUpdate(new Date().toLocaleTimeString('en-GB', { hour12: false }));
              if (activeProvider === 'POLLING') {
                  setSocketStatus(`ACTIVE (${source})`);
              }
          }
      } catch (e) {
          console.warn("Market Data Fetch Failed", e);
          if (activeProvider === 'POLLING') {
              setSocketStatus('RETRYING...');
          }
      }
  };

  // Initial Poll & Interval (Increased to 10s for Real-time feel)
  useEffect(() => {
      fetchMarketData();
      const interval = setInterval(fetchMarketData, 10000); 
      return () => clearInterval(interval);
  }, []);

  // Hybrid Engine (WebSocket)
  useEffect(() => {
    // [CI FIX] Detect Automation Mode
    const isAuto = new URLSearchParams(window.location.search).get('auto') === 'true';
    
    if (isAuto) {
        console.log("[MarketTicker] Automation mode detected. Disabling WebSocket to prevent 429 errors.");
        if (activeProvider !== 'POLLING') setActiveProvider('POLLING');
        setSocketStatus('AUTO_MODE (NO_WS)');
        return; 
    }

    const symbolMap = new Map<string, string>();
    indexConfig.forEach(cfg => symbolMap.set(cfg.etf, cfg.id)); 
    stockConfig.forEach(cfg => symbolMap.set(cfg.symbol, cfg.symbol));
    const trackList = Array.from(symbolMap.keys());

    const connectFinnhub = () => {
        if (!finnhubKey) return failover('FINNHUB');
        setSocketStatus('CONNECTING (FH)...');
        
        try {
            const ws = new WebSocket(`wss://ws.finnhub.io?token=${finnhubKey}`);
            wsRef.current = ws;

            ws.onopen = () => {
                setSocketStatus('CONNECTED (FH)');
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

            ws.onclose = () => failover('FINNHUB');
            ws.onerror = () => {
                ws.close();
            };
        } catch (e) {
            failover('FINNHUB');
        }
    };

    const connectAlpaca = () => {
        if (!alpacaKey) return failover('ALPACA');
        setSocketStatus('CONNECTING (ALP)...');
        
        try {
            const ws = new WebSocket('wss://stream.data.alpaca.markets/v2/iex');
            wsRef.current = ws;

            ws.onopen = () => {
                ws.send(JSON.stringify({ action: 'auth', key: alpacaKey, secret: alpacaSecret }));
            };

            ws.onmessage = (e) => {
                try {
                    const msg = JSON.parse(e.data);
                    if (Array.isArray(msg)) {
                        msg.forEach(m => {
                            if (m.T === 'success' && m.msg === 'authenticated') {
                                 setSocketStatus('CONNECTED (ALP)');
                                 ws.send(JSON.stringify({ action: 'subscribe', trades: trackList }));
                            }
                            if (m.T === 't' && m.S && m.p) { 
                                const internalId = symbolMap.get(m.S);
                                if (internalId) updatePrice(internalId, m.p);
                            }
                        });
                    }
                } catch {}
            };

            ws.onclose = () => failover('ALPACA');
            ws.onerror = () => {
                 ws.close();
            };
        } catch (e) {
            failover('ALPACA');
        }
    };

    const failover = (failedProvider: WsProvider) => {
        console.warn(`WebSocket Provider ${failedProvider} failed. Switching...`);
        if (failedProvider === 'FINNHUB') {
            setActiveProvider('ALPACA');
        } else if (failedProvider === 'ALPACA') {
            setActiveProvider('POLLING');
            setSocketStatus('POLLING (BACKUP)');
        }
    };

    if (wsRef.current) wsRef.current.close();
    
    if (activeProvider === 'FINNHUB') connectFinnhub();
    else if (activeProvider === 'ALPACA') connectAlpaca();
    else if (activeProvider === 'POLLING') {
        fetchMarketData(); 
    }

    return () => {
        if (wsRef.current) wsRef.current.close();
    };
  }, [activeProvider, finnhubKey, alpacaKey]);

  return (
    <div className="flex items-center space-x-2 overflow-x-auto no-scrollbar py-1 px-1">
      {marketData.length > 0 ? (
        marketData.map((item) => (
          <div key={item.symbol} className={`flex-shrink-0 glass-panel px-4 py-2 rounded-xl border-l-2 flex items-center space-x-3 transition-all hover:bg-white/5 ${item.typeLabel.includes('FEAR') ? 'bg-purple-900/10 border-l-purple-500' : ''}`}
               style={{ borderLeftColor: item.typeLabel.includes('FEAR') ? '#a855f7' : item.change >= 0 ? '#10b981' : '#ef4444' }}>
            <div className="flex flex-col">
              <span className={`text-[7px] font-black uppercase tracking-widest ${item.colorTheme || 'text-slate-500'}`}>{item.typeLabel}</span>
              <span className="text-[10px] font-black text-white italic tracking-tighter uppercase whitespace-nowrap">{item.label}</span>
            </div>
            <div className="text-right">
              <p className="text-[10px] font-mono font-bold text-white tracking-tighter">
                {item.price > 1000 ? item.price.toLocaleString(undefined, { maximumFractionDigits: 0 }) : item.price.toFixed(2)}
              </p>
              <p className={`text-[8px] font-black ${item.change >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {item.change >= 0 ? '▲' : '▼'} {Math.abs(item.change).toFixed(2)}%
              </p>
            </div>
          </div>
        ))
      ) : (
        <div className="text-[10px] font-black text-slate-700 animate-pulse uppercase px-4">
           INITIALIZING MARKET FEED...
        </div>
      )}
      
      <div className="flex-1 h-[1px] bg-white/5 ml-4"></div>
      
      <div className="flex flex-col items-end space-y-0.5 ml-4">
         <div className="flex items-center space-x-2 text-[7px] font-black text-slate-600 uppercase tracking-widest italic whitespace-nowrap">
            <span className={`w-1.5 h-1.5 rounded-full ${socketStatus.includes('ERROR') ? 'bg-red-500' : socketStatus.includes('CONNECTED') ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`}></span>
            <span>{socketStatus}</span>
         </div>
         <div className="flex items-center space-x-1.5">
            <span className="text-[6px] font-mono text-slate-800 uppercase tracking-tighter">Upd: {lastUpdate || '--:--:--'}</span>
         </div>
      </div>
    </div>
  );
};

export default MarketTicker;
