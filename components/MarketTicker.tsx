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
  const polygonKey = API_CONFIGS.find(c => c.provider === ApiProvider.POLYGON)?.key;
  
  // Configuration for Market Indices
  // We map the provider specific symbols to our internal IDs
  const indexConfig = [
    { id: 'NASDAQ', fmp: '^IXIC', poly: 'I:NDX', label: 'NASDAQ 100', theme: 'text-indigo-400' },
    { id: 'SP500', fmp: '^GSPC', poly: 'I:SPX', label: 'S&P 500', theme: 'text-blue-400' },
    { id: 'DOW', fmp: '^DJI', poly: 'I:DJI', label: 'DOW JONES', theme: 'text-slate-400' },
    { id: 'VIX', fmp: '^VIX', poly: 'I:VIX', label: 'VIX (Fear)', theme: 'text-purple-400' },
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

  // --- STRATEGY A: FMP (Primary) ---
  const fetchFMP = async () => {
      if (!fmpKey) throw new Error("No FMP Key");
      // FMP uses ^ for indices. Batch request.
      const indices = indexConfig.map(i => i.fmp).join(',');
      const stocks = stockConfig.map(s => s.symbol).join(',');
      
      const [idxRes, stkRes] = await Promise.all([
          fetch(`https://financialmodelingprep.com/api/v3/quote/${indices}?apikey=${fmpKey}`),
          fetch(`https://financialmodelingprep.com/api/v3/quote/${stocks}?apikey=${fmpKey}`)
      ]);

      if (!idxRes.ok) throw new Error("FMP Index Error");
      
      const idxData = await idxRes.json();
      const stkData = await stkRes.json();

      if (!Array.isArray(idxData) || idxData.length === 0) throw new Error("FMP Empty Data");

      const finalItems: MarketItem[] = [];
      const dataMap = new Map([...idxData, ...(stkData || [])].map((item: any) => [item.symbol, item]));

      // Map Indices
      indexConfig.forEach(cfg => {
          const item = dataMap.get(cfg.fmp);
          if (item) {
              finalItems.push({
                  symbol: cfg.id,
                  label: cfg.label,
                  price: item.price,
                  change: item.changesPercentage,
                  isIndex: true,
                  typeLabel: cfg.id === 'VIX' ? "FEAR_INDEX" : "Composite",
                  colorTheme: cfg.theme
              });
          }
      });

      // Map Stocks
      stockConfig.forEach(cfg => {
          const item = dataMap.get(cfg.symbol);
          if (item) {
              finalItems.push({
                  symbol: cfg.symbol,
                  label: cfg.label,
                  price: item.price,
                  change: item.changesPercentage,
                  isIndex: false,
                  typeLabel: "Equity"
              });
          }
      });

      return finalItems;
  };

  // --- STRATEGY B: POLYGON (Backup) ---
  const fetchPolygon = async () => {
    if (!polygonKey) throw new Error("No Polygon Key");
    
    // Try up to 3 days back
    for (let i = 0; i < 3; i++) {
        const date = getTradingDate(i);
        try {
            const [idxRes, stkRes] = await Promise.all([
                fetch(`https://api.polygon.io/v2/aggs/grouped/locale/global/market/indices/${date}?adjusted=true&apiKey=${polygonKey}`),
                fetch(`https://api.polygon.io/v2/aggs/grouped/locale/us/market/stocks/${date}?adjusted=true&apiKey=${polygonKey}`)
            ]);

            if (idxRes.ok && stkRes.ok) {
                const idxJson = await idxRes.json();
                const stkJson = await stkRes.json();
                
                if (idxJson.results && idxJson.results.length > 0) {
                     const idxMap = new Map<string, PolygonAgg>((idxJson.results || []).map((r: any) => [r.T, r]));
                     const stkMap = new Map<string, PolygonAgg>((stkJson.results || []).map((r: any) => [r.T, r]));
                     
                     // Check if we actually found our indices
                     const hasIndices = indexConfig.some(cfg => idxMap.has(cfg.poly) || stkMap.has(cfg.poly));
                     if (!hasIndices) continue; // Try next date

                     const finalItems: MarketItem[] = [];

                     indexConfig.forEach(cfg => {
                        const t = idxMap.get(cfg.poly) || stkMap.get(cfg.poly);
                        if (t) {
                            finalItems.push({
                                symbol: cfg.id,
                                label: cfg.label,
                                price: t.c,
                                change: t.o ? ((t.c - t.o) / t.o) * 100 : 0,
                                isIndex: true,
                                typeLabel: cfg.id === 'VIX' ? "FEAR_INDEX" : "Composite",
                                colorTheme: cfg.theme
                            });
                        }
                     });

                     stockConfig.forEach(cfg => {
                        const t = stkMap.get(cfg.symbol);
                        if (t) {
                            finalItems.push({
                                symbol: cfg.symbol,
                                label: cfg.label,
                                price: t.c,
                                change: t.o ? ((t.c - t.o) / t.o) * 100 : 0,
                                isIndex: false,
                                typeLabel: "Equity"
                            });
                        }
                     });
                     
                     return finalItems;
                }
            }
        } catch (e) { continue; }
    }
    throw new Error("Polygon Exhausted");
  };

  const fetchMarketData = async () => {
    if (document.body.getAttribute('data-engine-running') === 'true') {
      setIsPaused(true);
      return;
    }
    setIsPaused(false);

    try {
        // Try FMP First (Best for Indices)
        try {
            const items = await fetchFMP();
            setData(items);
            setActiveSource('FMP_v3');
            setErrorCount(0);
            setLastSync(new Date().toLocaleTimeString());
            return;
        } catch (fmpError) {
            console.warn("FMP Failed, switching to Polygon", fmpError);
        }

        // Try Polygon Second
        try {
            const items = await fetchPolygon();
            setData(items);
            setActiveSource('POLY_v2');
            setErrorCount(0);
            setLastSync(new Date().toLocaleTimeString());
        } catch (polyError) {
            throw new Error("All Providers Failed");
        }

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
          className={`flex-shrink-0 glass-panel px-4 py-2 rounded-xl border-l-2 flex items-center space-x-3 transition-all hover:bg-white/5 ${item.typeLabel === 'FEAR_INDEX' ? 'bg-purple-900/10 border-l-purple-500' : ''}`}
          style={{ borderLeftColor: item.typeLabel === 'FEAR_INDEX' ? '#a855f7' : item.change >= 0 ? '#10b981' : '#ef4444' }}
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