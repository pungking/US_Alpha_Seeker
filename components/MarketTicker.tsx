
import React, { useState, useEffect } from 'react';
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
  const polygonKey = API_CONFIGS.find(c => c.provider === ApiProvider.POLYGON)?.key;

  const tickers = [
    { s: 'SPY', l: 'S&P 500', i: true },
    { s: 'QQQ', l: 'NASDAQ', i: true },
    { s: 'AAPL', l: 'APPLE', i: false },
    { s: 'MSFT', l: 'MICROSOFT', i: false },
    { s: 'NVDA', l: 'NVIDIA', i: false },
    { s: 'TSLA', l: 'TESLA', i: false },
    { s: 'AMZN', l: 'AMAZON', i: false },
  ];

  useEffect(() => {
    const fetchMarketData = async () => {
      try {
        // Grouped daily API를 사용하여 한 번에 주요 종목 가격 획득
        const res = await fetch(`https://api.polygon.io/v2/aggs/grouped/locale/us/market/stocks/2026-01-22?adjusted=true&apiKey=${polygonKey}`).then(r => r.json());
        
        if (res.results) {
          const resultMap = new Map(res.results.map((r: any) => [r.T, r]));
          const merged = tickers.map(t => {
            const r: any = resultMap.get(t.s);
            return {
              symbol: t.s,
              label: t.l,
              price: r?.c || 0,
              change: r ? ((r.c - r.o) / r.o) * 100 : 0,
              isIndex: t.i
            };
          });
          setData(merged);
        }
      } catch (e) {
        console.error("Market data fetch failed");
      }
    };

    fetchMarketData();
    const interval = setInterval(fetchMarketData, 60000); // 1분마다 갱신
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex items-center space-x-2 overflow-x-auto no-scrollbar py-1 px-1">
      {data.map((item) => (
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
              ${item.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
            <p className={`text-[8px] font-black ${item.change >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {item.change >= 0 ? '▲' : '▼'} {Math.abs(item.change).toFixed(2)}%
            </p>
          </div>
        </div>
      ))}
      <div className="flex-1 h-[1px] bg-white/5 ml-4"></div>
      <div className="flex items-center space-x-2 text-[7px] font-black text-slate-600 uppercase tracking-widest italic ml-4 whitespace-nowrap">
        <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span>
        <span>Market_Pulse_Live</span>
      </div>
    </div>
  );
};

export default MarketTicker;
