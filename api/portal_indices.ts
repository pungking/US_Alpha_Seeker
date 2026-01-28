export default async function handler(req: any, res: any) {
  // Portal Proxy v3: Unified "Magic Bullet" for Indices AND Major Stocks
  // Priority: 1. CNBC (API) -> 2. TradingView (Scanner API) -> 3. Investing.com (Scraper - Indices Only Fallback)
  
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

  // --- STRATEGY A: CNBC API (High Reliability) ---
  const fetchCNBC = async () => {
    try {
        // Indices (.IXIC) + Stocks (AAPL, etc.)
        const symbols = ".IXIC|.SPX|.DJI|.VIX|AAPL|NVDA|TSLA|MSFT";
        const url = `https://quote.cnbc.com/quote-html-webservice/quote.htm?partnerId=2&requestMethod=quick&exthrs=1&noform=1&fund=1&output=json&players=null&symbols=${symbols}`;
        
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });

        if (!response.ok) throw new Error(`CNBC Status ${response.status}`);
        const data = await response.json();
        
        const quotes = data.QuickQuoteResult?.QuickQuote;
        if (!quotes || !Array.isArray(quotes)) throw new Error("CNBC Empty Data");

        const map: Record<string, string> = {
            ".IXIC": "NASDAQ",
            ".SPX": "SP500",
            ".DJI": "DOW",
            ".VIX": "VIX",
            "AAPL": "AAPL",
            "NVDA": "NVDA",
            "TSLA": "TSLA",
            "MSFT": "MSFT"
        };

        const results = quotes.map((q: any) => {
            const internalSymbol = map[q.symbol] || q.symbol; // Fallback to raw symbol if mapped
            
            return {
                symbol: internalSymbol,
                price: parseValue(q.last),
                change: parseValue(q.change_pct),
                source: 'CNBC_Direct'
            };
        }).filter(item => item !== null);

        if (results.length < 2) throw new Error("CNBC Insufficient Data");
        return results;

    } catch (e) {
        console.error("CNBC Fail:", e);
        return null;
    }
  };

  // --- STRATEGY B: TRADINGVIEW SCANNER (Backup) ---
  const fetchTradingView = async () => {
    try {
      const response = await fetch('https://scanner.tradingview.com/america/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbols: {
            tickers: [
                "TVC:NDX", "TVC:SPX", "TVC:DJI", "TVC:VIX",
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
        "TVC:NDX": "NASDAQ",
        "TVC:SPX": "SP500",
        "TVC:DJI": "DOW",
        "TVC:VIX": "VIX",
        "NASDAQ:AAPL": "AAPL",
        "NASDAQ:NVDA": "NVDA",
        "NASDAQ:TSLA": "TSLA",
        "NASDAQ:MSFT": "MSFT"
      };

      return json.data.map((item: any) => ({
           symbol: map[item.s] || item.s.split(':')[1] || item.s, // Handle NASDAQ:AAPL -> AAPL
           price: item.d[0],
           change: item.d[1],
           source: 'TradingView'
      }));
    } catch (e) {
      console.error("TradingView Fail:", e);
      return null;
    }
  };

  // --- STRATEGY C: INVESTING.COM SCRAPER (Deep Backup - Indices Only) ---
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
        extract('20', 'NASDAQ'), extract('166', 'SP500'), extract('169', 'DOW'), extract('44336', 'VIX')
      ].filter(r => r !== null);

      if (results.length < 2) throw new Error("Investing Parsing Failed");
      return results;
    } catch (e) {
      console.error("Investing.com Fail:", e);
      return null;
    }
  };

  try {
    // 1. Try CNBC First (Includes Indices + Stocks)
    let data = await fetchCNBC();

    // 2. Try TradingView (Includes Indices + Stocks)
    if (!data) data = await fetchTradingView();

    // 3. Try Investing.com (Indices Only - Better than nothing)
    if (!data) data = await fetchInvestingCom();

    if (!data) return res.status(500).json({ error: "All Index Providers Failed" });

    return res.status(200).json(data);

  } catch (error: any) {
    return res.status(500).json({ error: 'Internal Server Error', details: error.message });
  }
}