
import React, { useState, useEffect, useRef } from 'react';
import { ApiProvider } from '../types';
import { API_CONFIGS } from '../constants';
import { fetchPortalIndices, type PortalIndexPoint } from '../services/portalIndicesService';

type WsProvider = 'FINNHUB' | 'ALPACA' | 'POLLING';

interface MarketItem {
  symbol: string;
  label: string;
  price: number;
  change: number;
  prevClose?: number;
  isIndex: boolean;
  typeLabel: string;
  colorTheme?: string;
  isProxy?: boolean;
}

const toSafeNumber = (value: any, fallback = 0) => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

// Sub-component for individual ticker card to handle flash animation state locally
const TickerCard: React.FC<{ item: MarketItem }> = ({ item }) => {
  const [flash, setFlash] = useState<'up' | 'down' | null>(null);
  const prevPriceRef = useRef<number>(item.price);
  const displayPrice = toSafeNumber(item.price);
  const displayChange = toSafeNumber(item.change);

  useEffect(() => {
    if (displayPrice > prevPriceRef.current) {
      setFlash('up');
    } else if (displayPrice < prevPriceRef.current) {
      setFlash('down');
    }
    prevPriceRef.current = displayPrice;

    const timer = setTimeout(() => setFlash(null), 300); // 300ms flash duration
    return () => clearTimeout(timer);
  }, [displayPrice]);

  // Visual Logic: "Band" (Border) Flashing
  // Resting State: Based on daily change (Green/Red)
  // Active State: Bright Neon Green/Red based on tick direction
  
  const getBorderColor = () => {
      if (flash === 'up') return '#4ade80'; // Bright Green (Flash)
      if (flash === 'down') return '#f87171'; // Bright Red (Flash)
      
      if (item.typeLabel.includes('FEAR')) return '#a855f7'; // VIX Purple (Base)
      return displayChange >= 0 ? '#10b981' : '#ef4444'; // Daily Change (Base)
  };

  const getBackgroundColor = () => {
      if (flash === 'up') return 'rgba(74, 222, 128, 0.15)'; // Green Tint
      if (flash === 'down') return 'rgba(248, 113, 113, 0.15)'; // Red Tint
      if (item.typeLabel.includes('FEAR')) return 'rgba(168, 85, 247, 0.1)'; // Purple Tint
      return 'rgba(255, 255, 255, 0.03)'; // Default Glass
  };

  return (
    <div 
        className="flex-shrink-0 glass-panel px-4 py-2 rounded-xl flex items-center space-x-3 transition-all duration-300"
        style={{ 
            borderLeftWidth: '4px', // Thicker band as requested
            borderLeftColor: getBorderColor(),
            backgroundColor: getBackgroundColor(),
            transform: flash ? 'scale(1.02)' : 'scale(1)', // Subtle pop effect
        }}
    >
      <div className="flex flex-col">
        <span className={`text-[7px] font-black uppercase tracking-widest ${item.colorTheme || 'text-slate-500'}`}>{item.typeLabel}</span>
        <span className="text-[10px] font-black text-white italic tracking-tighter uppercase whitespace-nowrap">{item.label}</span>
      </div>
      <div className="text-right">
        <p className={`text-[10px] font-mono font-bold tracking-tighter ${flash === 'up' ? 'text-green-300' : flash === 'down' ? 'text-red-300' : 'text-white'}`}>
          {displayPrice > 1000 ? displayPrice.toLocaleString(undefined, { maximumFractionDigits: 0 }) : displayPrice.toFixed(2)}
        </p>
        <p className={`text-[8px] font-black ${displayChange >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
          {displayChange >= 0 ? '▲' : '▼'} {Math.abs(displayChange).toFixed(2)}%
        </p>
      </div>
    </div>
  );
};

const MarketTicker: React.FC = () => {
  const [marketData, setMarketData] = useState<MarketItem[]>([]);
  const [socketStatus, setSocketStatus] = useState<string>('INIT');
  const [lastUpdate, setLastUpdate] = useState<string>('');
  
  // [FIX] Prioritize WebSocket Providers if keys exist
  const [activeProvider, setActiveProvider] = useState<WsProvider>(() => {
    const fh = API_CONFIGS.find(c => c.provider === ApiProvider.FINNHUB)?.key;
    if (fh) return 'FINNHUB';
    const alp = API_CONFIGS.find(c => c.provider === ApiProvider.ALPACA)?.key;
    if (alp) return 'ALPACA';
    return 'POLLING';
  });
  
  const wsRef = useRef<WebSocket | null>(null);

  const finnhubKey = API_CONFIGS.find(c => c.provider === ApiProvider.FINNHUB)?.key;
  const alpacaKey = API_CONFIGS.find(c => c.provider === ApiProvider.ALPACA)?.key;
  const alpacaSecret =
    // @ts-ignore
    (typeof import.meta !== 'undefined' && import.meta.env?.VITE_ALPACA_SECRET) ||
    // Legacy support for non-prefixed local builds.
    // @ts-ignore
    (typeof import.meta !== 'undefined' && import.meta.env?.ALPACA_SECRET) ||
    '';

  // [PRESERVED] Index Order: NASDAQ Comp First, then NASDAQ 100
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

  const updatePrice = (symbol: string, newPrice: number) => {
      const safeNewPrice = toSafeNumber(newPrice, NaN);
      if (!Number.isFinite(safeNewPrice)) return;
      setMarketData(prev => {
          const next = [...prev];
          const idx = next.findIndex(i => i.symbol === symbol);
          if (idx !== -1) {
              const item = next[idx];
              // Recalculate change based on derived prevClose if available
              let newChange = item.change;
              if (item.prevClose) {
                  newChange = ((safeNewPrice - item.prevClose) / item.prevClose) * 100;
              }
              next[idx] = { ...item, price: safeNewPrice, change: toSafeNumber(newChange) };
          }
          return next;
      });
      // [PRESERVED] 24-hour format
      setLastUpdate(new Date().toLocaleTimeString('en-GB', { hour12: false }));
  };

  const resolveIndexPoint = (rows: PortalIndexPoint[], id: string) => {
      const alias: Record<string, string[]> = {
          IXIC: ['IXIC', 'NASDAQ_COMP', 'NASDAQCOMPOSITE'],
          NDX: ['NDX', 'NASDAQ', 'NASDAQ100'],
          SPX: ['SPX', 'SP500'],
          DJI: ['DJI', 'DOW'],
          VIX: ['VIX'],
      };
      const lookup = new Set([id, ...(alias[id] || [])]);
      return rows.find((row) => lookup.has(String(row.symbol || '').toUpperCase()));
  };

  const fetchMarketData = async () => {
      try {
          const data = await fetchPortalIndices();
          const map = new Map<string, any>(data.map((d: any) => [String(d.symbol).toUpperCase(), d]));
          const formatted: MarketItem[] = [];
          let source = "PORTAL_HYBRID";

          indexConfig.forEach(cfg => {
              const d = resolveIndexPoint(data, cfg.id);
              if (d) {
                  if (d.source) source = d.source;
                  const price = toSafeNumber(d.price, NaN);
                  const change = toSafeNumber(d.change, NaN);
                  if (!Number.isFinite(price) || !Number.isFinite(change)) return;
                  // Derive prevClose for dynamic change calculation
                  const prevClose = price / (1 + (change / 100));
                  formatted.push({
                      symbol: cfg.id,
                      label: cfg.label,
                      price,
                      change,
                      prevClose: prevClose,
                      isIndex: true,
                      typeLabel: cfg.id === 'VIX' ? 'FEAR_INDEX' : 'Composite',
                      colorTheme: cfg.theme
                  });
              }
          });

          stockConfig.forEach(cfg => {
              const d = map.get(String(cfg.symbol).toUpperCase());
              if (d) {
                  const price = toSafeNumber(d.price, NaN);
                  const change = toSafeNumber(d.change, NaN);
                  if (!Number.isFinite(price) || !Number.isFinite(change)) return;
                  const prevClose = price / (1 + (change / 100));
                  formatted.push({
                      symbol: cfg.symbol,
                      label: cfg.label,
                      price,
                      change,
                      prevClose: prevClose,
                      isIndex: false,
                      typeLabel: 'Equity'
                  });
              }
          });

          if (formatted.length > 0) {
              setMarketData(formatted);
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

  // Initial Poll & Interval (Backup / Initialization)
  useEffect(() => {
      // [FIX] Disable Ticker Polling in Auto Mode to prevent log flooding in CI/CD
      // This prevents the "Market Data Fetch Failed" warnings in GitHub Actions
      const isAuto = new URLSearchParams(window.location.search).get('auto') === 'true';
      if (isAuto) {
          setSocketStatus("AUTO_MODE (IDLE)");
          return;
      }

      fetchMarketData();
      // [SPEED UP] Polling increased to 2 seconds for near-real-time feel without hitting hard limits
      const interval = setInterval(fetchMarketData, 2000); 
      return () => clearInterval(interval);
  }, []);

  // Hybrid Engine (WebSocket)
  useEffect(() => {
    // [CI FIX] Detect Automation Mode
    const isAuto = new URLSearchParams(window.location.search).get('auto') === 'true';
    
    if (isAuto) {
        console.log("[MarketTicker] Automation mode detected. Disabling WebSocket to prevent 429 errors.");
        // Stop any WS attempts
        return; 
    }

    const symbolMap = new Map<string, string>();
    // Map ETF symbols (e.g., QQQ) to Internal IDs (e.g., NDX) for WebSocket matching
    // [FIX] DISABLED: ETFs (like QQQ ~500) were overwriting Index prices (like NDX ~20000). 
    // Indices will rely on the Polling loop (Portal API) which gets correct Index data.
    // indexConfig.forEach(cfg => symbolMap.set(cfg.etf, cfg.id)); 
    
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
        if (!alpacaKey || !alpacaSecret) return failover('ALPACA');
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
            if (alpacaKey && alpacaSecret) {
                setActiveProvider('ALPACA');
            } else {
                setActiveProvider('POLLING');
                setSocketStatus('POLLING (BACKUP)');
            }
        } else if (failedProvider === 'ALPACA') {
            setActiveProvider('POLLING');
            setSocketStatus('POLLING (BACKUP)');
        }
    };

    // Cleanup previous socket
    if (wsRef.current) wsRef.current.close();
    
    // Connect based on active provider
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
          <TickerCard key={item.symbol} item={item} />
        ))
      ) : (
        <div className="text-[10px] font-black text-slate-700 animate-pulse uppercase px-4">
           {socketStatus.includes("AUTO") ? "MARKET FEED PAUSED (AUTO MODE)" : "INITIALIZING MARKET FEED..."}
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
