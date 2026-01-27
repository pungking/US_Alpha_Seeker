import React, { useState, useEffect, useRef } from 'react';
import { API_CONFIGS } from '../constants';
import { ApiProvider } from '../types';

interface MarketItem {
  symbol: string;
  label: string;
  price: number;
  change: number;
  isIndex: boolean;
  isEtfFallback?: boolean;
}

interface PolygonTicker {
  T: string;
  c: number;
  o: number;
  v: number;
}

const MarketTicker: React.FC = () => {
  const [data, setData] = useState<MarketItem[]>([]);
  const [isPaused, setIsPaused] = useState(false);
  const [errorCount, setErrorCount] = useState(0);
  const polygonKey = API_CONFIGS.find(c => c.provider === ApiProvider.POLYGON)?.key;
  const retryTimeoutRef = useRef<number | null>(null);

  // Configuration for Market Indices & Stocks
  // Request: Swap Nasdaq & S&P, Add Dow to right of S&P.
  // Order: Nasdaq -> S&P 500 -> Dow Jones -> Stocks
  const indexConfig = [
    { id: 'NASDAQ', indexSymbol: 'I:NDX', etfSymbol: 'QQQ', label: 'NASDAQ 100' },
    { id: 'SP500', indexSymbol: 'I:SPX', etfSymbol: 'SPY', label: 'S&P 500' },
    { id: 'DOW', indexSymbol: 'I:DJI', etfSymbol: 'DIA', label: 'DOW JONES' },
  ];

  const stockConfig = [
    { symbol: 'AAPL', label: 'APPLE' },
    { symbol: 'MSFT', label: 'MICROSOFT' },
    { symbol: 'NVDA', label: 'NVIDIA' },
    { symbol: 'TSLA', label: 'TESLA' },
    { symbol: 'AMZN', label: 'AMAZON' },
  ];

  const getLatestTradingDate = () => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    if (d.getDay() === 0) d.setDate(d.getDate() - 2);
    else if (d.getDay() === 6) d.setDate(d.getDate() - 1);
    return d.toISOString().split('T')[0];
  };

  const fetchMarketData = async () => {
    if (document.body.getAttribute('data-engine-running') === 'true') {
      setIsPaused(true);
      return;
    }
    setIsPaused(false);

    if (!polygonKey) return;

    try {
      const targetDate = getLatestTradingDate();
      
      // 1. Fetch Stocks (US Equities)
      const stocksPromise = fetch(`https://api.polygon.io/v2/aggs/grouped/locale/us/market/stocks/${targetDate}?adjusted=true&apiKey=${polygonKey}`);
      
      // 2. Fetch Indices (Global Indices) - Requires specific Polygon plan, fallback handled below
      const indicesPromise = fetch(`https://api.polygon.io/v2/aggs/grouped/locale/global/market/indices/${targetDate}?adjusted=true&apiKey=${polygonKey}`);

      const [stocksRes, indicesRes] = await Promise.all([stocksPromise, indicesPromise]);

      if (stocksRes.status === 429) throw new Error("Throttled");

      const stocksData = await stocksRes.json();
      const indicesData = indicesRes.ok ? await indicesRes.json() : { results: [] };

      // Map Results
      const stockMap = new Map<string, PolygonTicker>((stocksData.results || []).map((r: any) => [r.T, r]));
      const indexMap = new Map<string, PolygonTicker>((indicesData.results || []).map((r: any) => [r.T, r]));

      const finalItems: MarketItem[] = [];

      // Process Indices (Priority: Real Index -> ETF Fallback)
      indexConfig.forEach(cfg => {
        let tickerData = indexMap.get(cfg.indexSymbol);
        let isFallback = false;
        
        // If Index data missing (common on free tier), try ETF
        if (!tickerData) {
            tickerData = stockMap.get(cfg.etfSymbol);
            isFallback = true;
        }

        if (tickerData) {
            finalItems.push({
                symbol: isFallback ? cfg.etfSymbol : cfg.indexSymbol,
                label: cfg.label,
                price: tickerData.c || 0,
                change: tickerData.o ? ((tickerData.c - tickerData.o) / tickerData.o) * 100 : 0,
                isIndex: true,
                isEtfFallback: isFallback
            });
        }
      });

      // Process Stocks
      stockConfig.forEach(cfg => {
          const r = stockMap.get(cfg.symbol);
          if (r) {
              finalItems.push({
                  symbol: cfg.symbol,
                  label: cfg.label,
                  price: r.c || 0,
                  change: r.o ? ((r.c - r.o) / r.o) * 100 : 0,
                  isIndex: false
              });
          }
      });

      if (finalItems.length > 0) {
        setData(finalItems);
        setErrorCount(0);
      } else {
          // If totally empty, maybe market holiday or data not ready
          console.warn("Market Data Empty");
      }

    } catch (e) {
      console.warn("Market pulse fetch error:", e);
      setErrorCount(prev => prev + 1);
    }
  };

  useEffect(() => {
    fetchMarketData();
    const interval = setInterval(fetchMarketData, 300000); // 5 min refresh
    return () => clearInterval(interval);
  }, [polygonKey]);

  return (
    <div className="flex items-center space-x-2 overflow-x-auto no-scrollbar py-1 px-1">
      {data.length > 0 ? data.map((item) => (
        <div 
          key={item.symbol} 
          className="flex-shrink-0 glass-panel px-4 py-2 rounded-xl border-l-2 flex items-center space-x-3 transition-all hover:bg-white/5"
          style={{ borderLeftColor: item.change >= 0 ? '#10b981' : '#ef4444' }}
        >
          <div className="flex flex-col">
            <span className={`text-[7px] font-black uppercase tracking-widest ${item.isIndex ? 'text-indigo-400' : 'text-slate-500'}`}>
              {item.isIndex ? (item.isEtfFallback ? 'Index (ETF)' : 'Market Index') : 'Equity'}
            </span>
            <span className="text-[10px] font-black text-white italic tracking-tighter">{item.label}</span>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-mono font-bold text-white tracking-tighter">
              ${item.price > 0 ? item.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '---'}
            </p>
            <p className={`text-[8px] font-black ${item.change >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {item.change >= 0 ? '▲' : '▼'} {Math.abs(item.change).toFixed(2)}%
            </p>
          </div>
        </div>
      )) : (
        <div className="text-[10px] font-black text-slate-700 animate-pulse uppercase px-4">
          {errorCount > 2 ? 'MARKET DATA DELAYED' : 'Synchronizing Market Pulse...'}
        </div>
      )}
      <div className="flex-1 h-[1px] bg-white/5 ml-4"></div>
      <div className="flex items-center space-x-2 text-[7px] font-black text-slate-600 uppercase tracking-widest italic ml-4 whitespace-nowrap">
        <span className={`w-1.5 h-1.5 rounded-full ${isPaused ? 'bg-amber-500' : errorCount > 0 ? 'bg-red-500' : 'bg-emerald-500 animate-pulse'}`}></span>
        <span>{isPaused ? 'Pulse_Paused' : 'Realtime_Indices_Active'}</span>
      </div>
    </div>
  );
};

export default MarketTicker;