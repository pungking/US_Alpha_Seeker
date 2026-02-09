
export default async function handler(req: any, res: any) {
  // "The Holy Grail" - TradingView Scanner Proxy
  // Fetches entire US market + Fundamentals in ONE request.
  
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    const url = 'https://scanner.tradingview.com/america/scan';
    
    // Requesting massive data columns: Close, Volume, MarketCap, Sector, Industry, PER, EPS, ROE
    // range: [0, 20000] attempts to get everything sorted by volume
    const payload = {
        "filter": [
            { "left": "type", "operation": "in_range", "right": ["stock", "dr", "fund"] },
            { "left": "subtype", "operation": "in_range", "right": ["common", "etf", "adr", "reit"] }
        ],
        "options": { "lang": "en" },
        "symbols": { "query": { "types": [] }, "tickers": [] },
        "columns": [
            "name",                 // d[0]
            "close",                // d[1]
            "volume",               // d[2]
            "market_cap_basic",     // d[3]
            "sector",               // d[4]
            "industry",             // d[5]
            "price_earnings_ttm",   // d[6]
            "earnings_per_share_basic_ttm", // d[7]
            "return_on_equity_fq",  // d[8]
            "change",               // d[9]
            "description"           // d[10]
        ],
        "sort": { "sortBy": "volume", "sortOrder": "desc" },
        "range": [0, 20000]
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Content-Type': 'application/json',
        'Origin': 'https://www.tradingview.com',
        'Referer': 'https://www.tradingview.com/'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
        const txt = await response.text();
        throw new Error(`TV Scanner Error: ${response.status} - ${txt.substring(0, 100)}`);
    }

    const json = await response.json();
    const rows = json.data || [];

    // Map raw array to our MasterTicker/QualityTicker schema
    const normalized = rows.map((r: any) => {
        const d = r.d; // data array
        return {
            symbol: r.s.split(':')[1] || r.s, // Remove "NASDAQ:" prefix
            name: d[10] || "",
            price: d[1] || 0,
            volume: d[2] || 0,
            marketCap: d[3] || 0,
            sector: d[4] || "Unclassified",
            industry: d[5] || "Unknown",
            pe: d[6] || 0,
            eps: d[7] || 0,
            roe: d[8] || 0, // TV returns percentage directly usually
            change: d[9] || 0,
            source: 'TradingView_Scan'
        };
    });

    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');
    return res.status(200).json(normalized);

  } catch (error: any) {
    console.error('TV Proxy Error:', error);
    return res.status(200).json([]); // Return empty for graceful failover
  }
}
