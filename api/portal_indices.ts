
import { captureApiError, withSentryApi } from "./_sentry";

const handler = async (req: any, res: any) => {
  // Portal Proxy v4.1: Enhanced Index Coverage (NDX + IXIC)
  
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const parseValue = (str: string | number) => {
    if (typeof str === 'number') return str;
    return parseFloat(String(str).replace(/,/g, '').replace(/%/g, ''));
  };

  // --- STRATEGY A: CNBC DIRECT (Fastest, No Quota) ---
  const fetchCNBC = async () => {
    try {
        // Added .NDX for Nasdaq 100 specifically
        const symbols = ".IXIC|.NDX|.SPX|.DJI|.VIX|AAPL|NVDA|TSLA|MSFT";
        const url = `https://quote.cnbc.com/quote-html-webservice/quote.htm?partnerId=2&requestMethod=quick&exthrs=1&noform=1&fund=1&output=json&players=null&symbols=${symbols}`;
        
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });

        if (!response.ok) throw new Error(`CNBC Direct Status ${response.status}`);
        const data = await response.json();
        const quotes = data.QuickQuoteResult?.QuickQuote;
        if (!quotes || !Array.isArray(quotes)) throw new Error("CNBC Direct Empty");

        return normalizeQuotes(quotes, 'CNBC_Direct');
    } catch (e) {
        console.error("Strategy A (Direct) Fail:", e);
        return null;
    }
  };

  // --- STRATEGY B: RAPID API CNBC (Reliable Proxy - NEW) ---
  const fetchRapidCNBC = async () => {
    try {
        const RAPID_KEY = String(process.env.RAPID_API_KEY || '').trim();
        if (!RAPID_KEY) throw new Error('RapidAPI key missing');
        const RAPID_HOST = 'cnbc.p.rapidapi.com';
        const symbols = ".IXIC|.NDX|.SPX|.DJI|.VIX|AAPL|NVDA|TSLA|MSFT";
        
        const url = `https://${RAPID_HOST}/market/get-quote?symbol=${encodeURIComponent(symbols)}&requestMethod=quick&exthrs=1&noform=1&fund=1&output=json`;

        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'X-RapidAPI-Key': RAPID_KEY,
                'X-RapidAPI-Host': RAPID_HOST
            }
        });

        if (!response.ok) throw new Error(`RapidAPI Status ${response.status}`);
        
        const data = await response.json();
        const quotes = data.QuickQuoteResult?.QuickQuote;
        
        if (!quotes || !Array.isArray(quotes)) throw new Error("RapidAPI Empty Data");

        return normalizeQuotes(quotes, 'CNBC_RapidAPI');

    } catch (e) {
        console.error("Strategy B (RapidAPI) Fail:", e);
        return null;
    }
  };

  // Helper to normalize CNBC-style responses
  const normalizeQuotes = (quotes: any[], sourceLabel: string) => {
    // Updated mapping for distinct indices
    const map: Record<string, string> = {
        ".IXIC": "IXIC",  // Nasdaq Composite
        ".NDX": "NDX",    // Nasdaq 100
        ".SPX": "SPX",    // S&P 500
        ".DJI": "DJI",    // Dow Jones
        ".VIX": "VIX",    // Volatility
        "AAPL": "AAPL",
        "NVDA": "NVDA",
        "TSLA": "TSLA",
        "MSFT": "MSFT"
    };

    const results = quotes.map((q: any) => {
        const internalSymbol = map[q.symbol] || q.symbol;
        return {
            symbol: internalSymbol,
            price: parseValue(q.last),
            change: parseValue(q.change_pct),
            source: sourceLabel
        };
    }).filter(item => item !== null);

    if (results.length < 2) throw new Error("Insufficient Data Parsed");
    return results;
  };

  // --- STRATEGY C: TRADINGVIEW SCANNER (Backup) ---
  const fetchTradingView = async () => {
    try {
      const response = await fetch('https://scanner.tradingview.com/america/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbols: {
            tickers: [
                "TVC:NDX", "TVC:SPX", "TVC:DJI", "TVC:VIX", "TVC:IXIC",
                "NASDAQ:AAPL", "NASDAQ:NVDA", "NASDAQ:TSLA", "NASDAQ:MSFT"
            ]
          },
          columns: ["close", "change|1"] 
        })
      });

      if (!response.ok) throw new Error(`TV Status ${response.status}`);
      const json = await response.json();
      
      if (!json.data || json.data.length === 0) throw new Error("TV Empty Data");

      const map: Record<string, string> = {
        "TVC:NDX": "NDX",
        "TVC:IXIC": "IXIC",
        "TVC:SPX": "SPX",
        "TVC:DJI": "DJI",
        "TVC:VIX": "VIX",
        "NASDAQ:AAPL": "AAPL",
        "NASDAQ:NVDA": "NVDA",
        "NASDAQ:TSLA": "TSLA",
        "NASDAQ:MSFT": "MSFT"
      };

      return json.data.map((item: any) => ({
           symbol: map[item.s] || item.s.split(':')[1] || item.s, 
           price: item.d[0],
           change: item.d[1],
           source: 'TradingView'
      }));
    } catch (e) {
      console.error("Strategy C (TV) Fail:", e);
      return null;
    }
  };

  // --- STRATEGY D: INVESTING.COM SCRAPER (Deep Backup) ---
  const fetchInvestingCom = async () => {
    try {
      const response = await fetch('https://www.investing.com/indices/major-indices', {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      });
      if (!response.ok) throw new Error(`Investing Status ${response.status}`);
      const html = await response.text();

      const extract = (pid: string, id: string) => {
        const priceRegex = new RegExp(`class="[^"]*pid-${pid}-last[^"]*">([\\d,.]+)`, 'i');
        const changeRegex = new RegExp(`class="[^"]*pid-${pid}-pcp[^"]*">([+\\-]?[\\d,.]+)%`, 'i');
        const pMatch = html.match(priceRegex);
        const cMatch = html.match(changeRegex);

        if (pMatch && cMatch) {
          return { symbol: id, price: parseValue(pMatch[1]), change: parseValue(cMatch[1]), source: 'Investing.com' };
        }
        return null;
      };

      const results = [
        extract('20', 'NDX'), extract('14958', 'IXIC'), extract('166', 'SPX'), extract('169', 'DJI'), extract('44336', 'VIX')
      ].filter(r => r !== null);

      if (results.length < 2) throw new Error("Investing Parsing Failed");
      return results;
    } catch (e) {
      console.error("Strategy D (Investing) Fail:", e);
      return null;
    }
  };

  try {
    let data = await fetchCNBC();
    if (!data) data = await fetchRapidCNBC();
    if (!data) data = await fetchTradingView();
    if (!data) data = await fetchInvestingCom();

    if (!data) return res.status(500).json({ error: "All Index Providers Failed" });

    return res.status(200).json(data);

  } catch (error: any) {
    captureApiError(error, {
      source: 'portal_indices',
      method: req?.method || 'UNKNOWN'
    });
    return res.status(500).json({ error: 'Internal Server Error', details: error.message });
  }
};

export default withSentryApi(handler);
