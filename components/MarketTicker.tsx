
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
  const [wsStatus, setWsStatus] = useState<'OFF' | 'CONNECTING' | 'LIVE'>('OFF');

  const fmpKey = API_CONFIGS.find(c => c.provider === ApiProvider.FMP)?.key;
  const finnhubKey = API_CONFIGS.find(c => c.provider === ApiProvider.FINNHUB)?.key;
  const polygonKey = API_CONFIGS.find(c => c.provider === ApiProvider.POLYGON)?.key;
  
  const wsRef = useRef<WebSocket | null>(null);

  const indexConfig = [
    { id: 'NASDAQ', portalId: 'NASDAQ', yahoo: '^IXIC', fmp: '^IXIC', poly: 'I:NDX', label: 'NASDAQ 100', theme: 'text-indigo-400' },
    { id: 'SP500', portalId: 'SP500', yahoo: '^GSPC', fmp: '^GSPC', poly: 'I:SPX', label: 'S&P 500', theme: 'text-blue-400' },
    { id: 'DOW', portalId: 'DOW', yahoo: '^DJI', fmp: '^DJI', poly: 'I:DJI', label: 'DOW JONES', theme: 'text-slate-400' },
    { id: 'VIX', portalId: 'VIX', yahoo: '^VIX', fmp: '^VIX', poly: 'I:VIX', label: 'VIX (Fear)', theme: 'text-purple-400' },
  ];

  const stockConfig = [
    { symbol: 'AAPL', label: 'APPLE' },
    { symbol: 'NVDA', label: 'NVIDIA' },
    { symbol: 'TSLA', label: 'TESLA' },
    { symbol: 'MSFT', label: 'MICROSOFT' },
  ];

  // --- WEBSOCKET LOGIC (POLYGON) ---
  const connectWebSocket = () => {
      if (!polygonKey || wsRef.current) return;

      const ws = new WebSocket('wss://socket.polygon.io/stocks');
      wsRef.current = ws;
      setWsStatus('CONNECTING');

      ws.onopen = () => {
          ws.send(JSON.stringify({ action: 'auth', params: polygonKey }));
          // Subscribe to Trades (T.*) for stocks and Aggregates (A.*) for indices if possible
          // Note: Polygon Basic plan often limits Index Websockets. We try anyway.
          const symbols = stockConfig.map(s => `T.${s.symbol}`).join(',');
          ws.send(JSON.stringify({ action: 'subscribe', params: symbols }));
          setWsStatus('LIVE');
      };

      ws.onmessage = (event) => {
          try {
              const messages = JSON.parse(event.data);
              messages.forEach((msg: any) => {
                  if (msg.ev === 'T') { // Trade Event
                      updateRealTimeData(msg.sym, msg.p);
                  }
              });
          } catch (e) { }
      };

      ws.onclose = () => {
          setWsStatus('OFF');
          wsRef.current = null;
          // Auto reconnect after 5s
          setTimeout(connectWebSocket, 5000);
      };

      ws.onerror = () => {
          ws.close();
      };
  };

  const updateRealTimeData = (symbol: string, price: number) => {
      setData(prev => prev.map(item => {
          if (item.symbol === symbol) {
              const change = ((price - (item.price / (1 + (item.change/100)))) / (item.price / (1 + (item.change/100)))) * 100;
              return { ...item, price, change };
          }
          return item;
      }));
  };

  // --- REST FALLBACK STRATEGIES ---
  const fetchPortalProxy = async () => {
      const res = await fetch('/api/portal_indices');
      if (!res.ok) throw new Error("Portal Proxy Failed");
      
      const json = await res.json();
      if (!Array.isArray(json) || json.length === 0) throw new Error("Portal Data Empty");

      const finalItems: MarketItem[] = [];
      const dataMap = new Map(json.map((item: any) => [item.symbol, item]));

      let providerName = 'PORTAL_HYBRID';

      indexConfig.forEach(cfg => {
          const item = dataMap.get(cfg.portalId) as any;
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
          }
      });
      
      stockConfig.forEach(cfg => {
          const item = dataMap.get(cfg.symbol) as any;
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
      
      return { items: finalItems, source: providerName };
  };

  const fetchYahooProxy = async () => {
    const indices = indexConfig.map(i => i.yahoo).join(',');
    const stocks = stockConfig.map(s => s.symbol).join(',');
    
    const res = await fetch(`/api/yahoo?symbols=${indices},${stocks}`);
    if (!res.ok) throw new Error("Yahoo Proxy Failed");
    const json = await res.json();
    
    const finalItems: MarketItem[] = [];
    const dataMap = new Map(json.map((item: any) => [item.symbol, item]));

    indexConfig.forEach(cfg => {
        const item = dataMap.get(cfg.yahoo);
        if (item) finalItems.push({ symbol: cfg.id, label: cfg.label, price: item.price, change: item.change, isIndex: true, typeLabel: cfg.id === 'VIX' ? "FEAR_INDEX" : "Composite", colorTheme: cfg.theme });
    });

    stockConfig.forEach(cfg => {
        const item = dataMap.get(cfg.symbol);
        if (item) finalItems.push({ symbol: cfg.symbol, label: cfg.label, price: item.price, change: item.change, isIndex: false, typeLabel: "Equity" });
    });

    return finalItems;
  };

  const fetchMarketData = async () => {
    if (document.body.getAttribute('data-engine-running') === 'true') { setIsPaused(true); return; }
    setIsPaused(false);

    try {
        try {
            const result = await fetchPortalProxy();
            // Only update if WS isn't active for that symbol to avoid overwrite flicker
            if (wsStatus !== 'LIVE') setData(result.items);
            else {
                // If WS is live, only update Indices (since WS handles stocks)
                setData(prev => {
                    const stockMap = new Map(prev.filter(i => !i.isIndex).map(i => [i.symbol, i]));
                    return [...result.items.filter(i => i.isIndex), ...Array.from(stockMap.values())];
                });
            }
            setActiveSource(result.source); 
            setErrorCount(0);
            setLastSync(new Date().toLocaleTimeString());
            return;
        } catch (e) { }

        // Fallback to Yahoo
        try {
            const items = await fetchYahooProxy();
            if (wsStatus !== 'LIVE') setData(items);
            setActiveSource('YAHOO_PORTAL');
            setLastSync(new Date().toLocaleTimeString());
            return;
        } catch (e) { }

    } catch (e) {
      setErrorCount(prev => prev + 1);
    }
  };

  useEffect(() => {
    fetchMarketData();
    connectWebSocket();
    const interval = setInterval(fetchMarketData, 60000); 
    return () => {
        clearInterval(interval);
        if (wsRef.current) wsRef.current.close();
    };
  }, []);

  return (
    <div className="flex items-center space-x-2 overflow-x-auto no-scrollbar py-1 px-1">
      {data.length > 0 ? data.map((item) => (
        <div 
          key={item.symbol} 
          className={`flex-shrink-0 glass-panel px-4 py-2 rounded-xl border-l-2 flex items-center space-x-3 transition-all hover:bg-white/5 ${item.typeLabel.includes('FEAR') ? 'bg-purple-900/10 border-l-purple-500' : ''}`}
          style={{ borderLeftColor: item.typeLabel.includes('FEAR') ? '#a855f7' : item.change >= 0 ? '#10b981' : '#ef4444' }}
        >
          <div className="flex flex-col">
            <span className={`text-[7px] font-black uppercase tracking-widest ${item.colorTheme || 'text-slate-500'}`}>
              {item.typeLabel}
            </span>
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
      )) : (
        <div className="text-[10px] font-black text-slate-700 animate-pulse uppercase px-4">
          ESTABLISHING SECURE FEED...
        </div>
      )}
      <div className="flex-1 h-[1px] bg-white/5 ml-4"></div>
      <div className="flex flex-col items-end space-y-0.5 ml-4">
        <div className="flex items-center space-x-2 text-[7px] font-black text-slate-600 uppercase tracking-widest italic whitespace-nowrap">
            <span className={`w-1.5 h-1.5 rounded-full ${wsStatus === 'LIVE' ? 'bg-emerald-500 animate-pulse' : 'bg-slate-500'}`}></span>
            <span>{wsStatus === 'LIVE' ? 'WS_STREAM_ACTIVE' : 'REST_POLLING'}</span>
        </div>
        <div className="flex items-center space-x-1.5">
           <span className="text-[6px] font-mono text-slate-800 uppercase tracking-tighter">SRC: {activeSource}</span>
           <span className="text-slate-900 text-[6px]">•</span>
           <span className="text-[6px] font-mono text-slate-700 uppercase tracking-tighter">Upd: {lastSync || '---'}</span>
        </div>
      </div>
    </div>
  );
};

export default MarketTicker;
