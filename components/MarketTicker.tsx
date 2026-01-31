import React, { useState, useEffect } from 'react';
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

interface PolygonAgg {
  T: string;
  c: number;
  o: number;
  v: number;
}

const MarketTicker: React.FC = () => {
  const [data, setData] = useState<MarketItem[]>([]);
  const [isPaused, setIsPaused] = useState(false);
  const [errorCount, setErrorCount] = useState(0);
  const [lastSync, setLastSync] = useState<string>('');
  const [activeSource, setActiveSource] = useState<string>('INIT');

  const fmpKey = API_CONFIGS.find(c => c.provider === ApiProvider.FMP)?.key;
  const finnhubKey = API_CONFIGS.find(c => c.provider === ApiProvider.FINNHUB)?.key;
  const polygonKey = API_CONFIGS.find(c => c.provider === ApiProvider.POLYGON)?.key;
  const twelveDataKey = API_CONFIGS.find(c => c.provider === ApiProvider.TWELVE_DATA)?.key;
  
  // Configuration for Market Indices
  // portalId is used to map responses from api/portal_indices
  const indexConfig = [
    { id: 'NASDAQ', portalId: 'NASDAQ', yahoo: '^IXIC', fmp: '^IXIC', fh: '^IXIC', poly: 'I:NDX', td: 'IXIC', etf: 'QQQ', label: 'NASDAQ 100', theme: 'text-indigo-400' },
    { id: 'SP500', portalId: 'SP500', yahoo: '^GSPC', fmp: '^GSPC', fh: '^GSPC', poly: 'I:SPX', td: 'GSPC', etf: 'SPY', label: 'S&P 500', theme: 'text-blue-400' },
    { id: 'DOW', portalId: 'DOW', yahoo: '^DJI', fmp: '^DJI', fh: '^DJI', poly: 'I:DJI', td: 'DJI', etf: 'DIA', label: 'DOW JONES', theme: 'text-slate-400' },
    { id: 'VIX', portalId: 'VIX', yahoo: '^VIX', fmp: '^VIX', fh: '^VIX', poly: 'I:VIX', td: 'VIX', etf: 'VXX', label: 'VIX (Fear)', theme: 'text-purple-400' },
  ];

  const stockConfig = [
    { symbol: 'AAPL', label: 'APPLE' },
    { symbol: 'NVDA', label: 'NVIDIA' },
    { symbol: 'TSLA', label: 'TESLA' },
    { symbol: 'MSFT', label: 'MICROSOFT' },
  ];

  const getTradingDate = (offsetDays = 0) => {
    const d = new Date();
    d.setDate(d.getDate() - 1 - offsetDays);
    if (d.getDay() === 0) d.setDate(d.getDate() - 2); 
    else if (d.getDay() === 6) d.setDate(d.getDate() - 1);
    return d.toISOString().split('T')[0];
  };

  // --- STRATEGY 0-A: HYBRID PORTAL PROXY (CNBC / TradingView / Investing) ---
  const fetchPortalProxy = async () => {
      // This endpoint tries CNBC first, then TradingView, then Investing
      // It now returns both Indices AND Stocks (AAPL, NVDA...)
      const res = await fetch('/api/portal_indices');
      if (!res.ok) throw new Error("Portal Proxy Failed");
      
      const json = await res.json();
      if (!Array.isArray(json) || json.length === 0) throw new Error("Portal Data Empty");

      const finalItems: MarketItem[] = [];
      const dataMap = new Map(json.map((item: any) => [item.symbol, item]));

      let indexCount = 0;
      let providerName = 'PORTAL_HYBRID';

      // 1. Map Indices
      indexConfig.forEach(cfg => {
          const item = dataMap.get(cfg.portalId);
          if (item) {
              if (item.source) providerName = item.source; // Update source label
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
      
      // 2. Map Stocks (Now sourced from the same Portal Proxy)
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

  // --- STRATEGY 0-B: YAHOO PROXY (Original Backup) ---
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
        if (!Array.isArray(json) || json.length === 0) throw new Error("Yahoo Proxy Empty");
        
        const finalItems: MarketItem[] = [];
        const dataMap = new Map(json.map((item: any) => [item.symbol, item]));

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

        if (finalItems.length < 2) throw new Error("Yahoo Insufficient Data");
        return finalItems;
    } catch (e) {
        clearTimeout(timeoutId);
        throw e;
    }
  };

  // ... (Other Strategies: FMP, TwelveData, etc. remain as deep backups) ...

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
      if (!Array.isArray(idxData) || idxData.length === 0) throw new Error("FMP Empty");
      
      const finalItems: MarketItem[] = [];
      const dataMap = new Map([...idxData, ...(stkData || [])].map((item: any) => [item.symbol, item]));
      
      indexConfig.forEach(cfg => {
          const item = dataMap.get(cfg.fmp);
          if (item) finalItems.push({ symbol: cfg.id, label: cfg.label, price: item.price, change: item.changesPercentage, isIndex: true, typeLabel: cfg.id === 'VIX' ? "FEAR_INDEX" : "Composite", colorTheme: cfg.theme });
      });
      stockConfig.forEach(cfg => {
          const item = dataMap.get(cfg.symbol);
          if (item) finalItems.push({ symbol: cfg.symbol, label: cfg.label, price: item.price, change: item.changesPercentage, isIndex: false, typeLabel: "Equity" });
      });
      if (finalItems.length < 2) throw new Error("FMP Insufficient");
      return finalItems;
  };
  
  const fetchEtfProxies = async () => {
    if (!finnhubKey) throw new Error("No Finnhub Key");
    const providerKey = finnhubKey;
    const providerName = 'FHUB_ETF_PROXY';
    const etfMap = indexConfig.map(cfg => ({ ...cfg, target: cfg.etf }));
    const promises = [
        ...etfMap.map(cfg => fetch(`https://finnhub.io/api/v1/quote?symbol=${cfg.target}&token=${providerKey}`).then(r => r.json()).then(d => ({ ...d, id: cfg.id, label: `${cfg.label} (ETF)`, isIndex: true, theme: cfg.theme, typeLabel: cfg.id === 'VIX' ? "FEAR_ETF" : "Composite_ETF", isProxy: true }))),
        ...stockConfig.map(cfg => fetch(`https://finnhub.io/api/v1/quote?symbol=${cfg.symbol}&token=${providerKey}`).then(r => r.json()).then(d => ({ ...d, id: cfg.symbol, label: cfg.label, isIndex: false, typeLabel: "Equity" })))
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
        // 1. New Hybrid Portal Proxy (CNBC / TradingView / Investing)
        try {
            const result = await fetchPortalProxy();
            setData(result.items);
            setActiveSource(result.source); // e.g. CNBC_Direct
            setErrorCount(0);
            setLastSync(new Date().toLocaleTimeString());
            return;
        } catch (e) { /* continue */ }

        // 2. Yahoo Proxy
        try {
            const items = await fetchYahooProxy();
            setData(items);
            setActiveSource('YAHOO_PORTAL');
            setErrorCount(0);
            setLastSync(new Date().toLocaleTimeString());
            return;
        } catch (e) { /* continue */ }

        // 3. FMP
        try {
            const items = await fetchFMP();
            setData(items);
            setActiveSource('FMP_v3');
            setErrorCount(0);
            setLastSync(new Date().toLocaleTimeString());
            return;
        } catch (e) { /* continue */ }
        
        // 4. ETF Fallback
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

  useEffect(() => {
    fetchMarketData();
    const interval = setInterval(fetchMarketData, 60000); // 1 min sync
    return () => clearInterval(interval);
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
          {errorCount > 2 ? 'CONNECTIVITY_ERROR: RETRYING...' : 'ESTABLISHING SECURE FEED...'}
        </div>
      )}
      <div className="flex-1 h-[1px] bg-white/5 ml-4"></div>
      <div className="flex flex-col items-end space-y-0.5 ml-4">
        <div className="flex items-center space-x-2 text-[7px] font-black text-slate-600 uppercase tracking-widest italic whitespace-nowrap">
            <span className={`w-1.5 h-1.5 rounded-full ${isPaused ? 'bg-amber-500' : errorCount > 0 ? 'bg-red-500' : 'bg-emerald-500 animate-pulse'}`}></span>
            <span>{isPaused ? 'Sync_Paused' : 'Live_Feed_Active'}</span>
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