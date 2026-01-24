
import React, { useState, useEffect, useRef } from 'react';
import { API_CONFIGS } from '../constants';
import { ApiProvider } from '../types';

interface MarketItem {
  symbol: string;
  label: string;
  price: number;
  change: number;
  isIndex: boolean;
}

const MarketTicker: React.FC = () => {
  const [data, setData] = useState<MarketItem[]>([]);
  const [isPaused, setIsPaused] = useState(false);
  const [errorCount, setErrorCount] = useState(0);
  const polygonKey = API_CONFIGS.find(c => c.provider === ApiProvider.POLYGON)?.key;
  const retryTimeoutRef = useRef<number | null>(null);

  const tickers = [
    { s: 'SPY', l: 'S&P 500', i: true },
    { s: 'QQQ', l: 'NASDAQ', i: true },
    { s: 'AAPL', l: 'APPLE', i: false },
    { s: 'MSFT', l: 'MICROSOFT', i: false },
    { s: 'NVDA', l: 'NVIDIA', i: false },
    { s: 'TSLA', l: 'TESLA', i: false },
    { s: 'AMZN', l: 'AMAZON', i: false },
  ];

  const getLatestTradingDate = () => {
    const d = new Date();
    // Go back at least one day
    d.setDate(d.getDate() - 1);
    // If Sunday, go back to Friday
    if (d.getDay() === 0) d.setDate(d.getDate() - 2);
    // If Saturday, go back to Friday
    else if (d.getDay() === 6) d.setDate(d.getDate() - 1);
    return d.toISOString().split('T')[0];
  };

  const fetchMarketData = async () => {
    // If the data gathering engine is running, pause ticker to save quota
    if (document.body.getAttribute('data-engine-running') === 'true') {
      setIsPaused(true);
      return;
    }
    setIsPaused(false);

    if (!polygonKey) return;

    try {
      const targetDate = getLatestTradingDate();
      const response = await fetch(`https://api.polygon.io/v2/aggs/grouped/locale/us/market/stocks/${targetDate}?adjusted=true&apiKey=${polygonKey}`);
      
      if (response.status === 429) {
        throw new Error("Throttled");
      }

      const res = await response.json();
      
      if (res.results && Array.isArray(res.results)) {
        const resultMap = new Map(res.results.map((r: any) => [r.T, r]));
        const merged = tickers.map(t => {
          const r: any = resultMap.get(t.s);
          return {
            symbol: t.s,
            label: t.l,
            price: r?.c || 0,
            change: r?.o ? ((r.c - r.o) / r.o) * 100 : 0,
            isIndex: t.i
          };
        });
        const validData = merged.filter(d => d.price > 0);
        if (validData.length > 0) {
          setData(validData);
          setErrorCount(0); // Reset error count on success
        }
      }
    } catch (e) {
      console.warn("Market pulse fetch error:", e);
      setErrorCount(prev => prev + 1);
      // If failed, wait longer for the next attempt
    }
  };

  useEffect(() => {
    fetchMarketData();
    // Safety interval: 5 minutes to stay well within free tier limits
    const interval = setInterval(fetchMarketData, 300000); 
    return () => {
      clearInterval(interval);
      if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
    };
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
              {item.isIndex ? 'Index' : 'Equity'}
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
          {errorCount > 2 ? 'API QUOTA EXCEEDED - WAITING' : 'Synchronizing Market Pulse...'}
        </div>
      )}
      <div className="flex-1 h-[1px] bg-white/5 ml-4"></div>
      <div className="flex items-center space-x-2 text-[7px] font-black text-slate-600 uppercase tracking-widest italic ml-4 whitespace-nowrap">
        <span className={`w-1.5 h-1.5 rounded-full ${isPaused ? 'bg-amber-500' : errorCount > 0 ? 'bg-red-500' : 'bg-emerald-500 animate-pulse'}`}></span>
        <span>{isPaused ? 'Pulse_Paused_For_Sync' : errorCount > 0 ? 'Pulse_Connection_Retry' : 'Market_Pulse_Safe_Mode'}</span>
      </div>
    </div>
  );
};

export default MarketTicker;
