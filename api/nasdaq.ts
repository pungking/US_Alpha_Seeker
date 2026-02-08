
export default async function handler(req: any, res: any) {
  // "The Holy Grail" - TradingView Scanner Proxy
  // Fetches entire US market + Fundamentals.
  // V5.3 Update: Range restored to 20k to ensure full market coverage (~13k+ assets).
  
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const url = 'https://scanner.tradingview.com/america/scan';
  
  // 1. Rich Payload: All desired columns
  const richPayload = {
      "filter": [
          { "left": "type", "operation": "in_range", "right": ["stock", "dr", "fund"] },
          { "left": "subtype", "operation": "in_range", "right": ["common", "etf", "adr", "reit"] }
      ],
      "options": { "lang": "en" },
      "symbols": { "query": { "types": [] }, "tickers": [] },
      "columns": [
          "name",                         // d[0]
          "close",                        // d[1]
          "volume",                       // d[2]
          "market_cap_basic",             // d[3]
          "sector",                       // d[4]
          "industry",                     // d[5]
          "price_earnings_ttm",           // d[6]
          "earnings_per_share_basic_ttm", // d[7]
          "return_on_equity_fq",          // d[8]
          "change",                       // d[9]
          "description",                  // d[10]
          "price_book_ratio_fq",          // d[11] (NEW)
          "debt_to_equity_fq",            // d[12] (NEW)
          "current_ratio_fq",             // d[13] (NEW)
          "total_revenue_ttm"             // d[14] (NEW)
      ],
      "sort": { "sortBy": "volume", "sortOrder": "desc" },
      "range": [0, 20000] // Restored to 20k to capture full market
  };

  // 2. Basic Payload: Core columns only (High reliability fallback)
  const basicPayload = {
      ...richPayload,
      "columns": [
          "name", "close", "volume", "market_cap_basic", "sector", "industry",
          "price_earnings_ttm", "earnings_per_share_basic_ttm", "return_on_equity_fq", 
          "change", "description"
      ],
      "range": [0, 20000] // Restored to 20k
  };

  const fetchScan = async (payload: any) => {
      try {
          const response = await fetch(url, {
            method: 'POST',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
          });
          if (!response.ok) return null;
          return await response.json();
      } catch (e) {
          console.error("TV Fetch Error:", e);
          return null;
      }
  };

  try {
    // Attempt 1: Rich Scan (Full Range)
    let json = await fetchScan(richPayload);
    let rows = json?.data || [];
    let isRich = true;

    // Attempt 2: Basic Scan (Full Range) - Fallback if rich data fails
    if (rows.length === 0) {
        console.warn("TV Scanner: Rich Scan returned 0 items. Falling back to Basic Scan...");
        json = await fetchScan(basicPayload);
        rows = json?.data || [];
        isRich = false;
    }

    // Map raw array to schema
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
            roe: d[8] || 0,
            change: d[9] || 0,
            // Conditional Fields (only if Rich Scan succeeded)
            pbr: isRich ? (d[11] || 0) : 0,
            debtToEquity: isRich ? (d[12] || 0) : 0,
            currentRatio: isRich ? (d[13] || 0) : 0,
            revenue: isRich ? (d[14] || 0) : 0,
            source: isRich ? 'TradingView_Rich' : 'TradingView_Basic'
        };
    });

    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');
    return res.status(200).json(normalized);

  } catch (error: any) {
    console.error('TV Proxy Critical Error:', error);
    // Return empty array instead of 500 to allow graceful handling on client
    return res.status(200).json([]); 
  }
}
