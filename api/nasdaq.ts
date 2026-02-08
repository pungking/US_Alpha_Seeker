
export default async function handler(req: any, res: any) {
  // "The Holy Grail" - TradingView Scanner Proxy
  // Fetches entire US market + Fundamentals.
  // V5.4 Update: Enhanced Fallback to include PBR & Debt. Optimized column mapping.
  
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const url = 'https://scanner.tradingview.com/america/scan';
  
  // Base columns shared by both modes
  const baseColumns = [
      "name",                         // 0
      "close",                        // 1
      "volume",                       // 2
      "market_cap_basic",             // 3
      "sector",                       // 4
      "industry",                     // 5
      "price_earnings_ttm",           // 6
      "earnings_per_share_basic_ttm", // 7
      "return_on_equity_fq",          // 8
      "change",                       // 9
      "description"                   // 10
  ];

  // 1. Rich Payload: All desired columns including heavy calculations
  const richPayload = {
      "filter": [
          { "left": "type", "operation": "in_range", "right": ["stock", "dr", "fund"] },
          { "left": "subtype", "operation": "in_range", "right": ["common", "etf", "adr", "reit"] }
      ],
      "options": { "lang": "en" },
      "symbols": { "query": { "types": [] }, "tickers": [] },
      "columns": [
          ...baseColumns,
          "price_book_ratio_fq",          // 11 (Rich)
          "debt_to_equity_fq",            // 12 (Rich)
          "current_ratio_fq",             // 13 (Rich - Heavy)
          "total_revenue_ttm"             // 14 (Rich - Heavy)
      ],
      "sort": { "sortBy": "volume", "sortOrder": "desc" },
      "range": [0, 20000] 
  };

  // 2. Basic Payload: Includes PBR & Debt, excludes Heavy fields (Current Ratio, Revenue)
  // This ensures Stage 2 still has critical data even in fallback mode.
  const basicPayload = {
      ...richPayload,
      "columns": [
          ...baseColumns,
          "price_book_ratio_fq",          // 11 (Basic)
          "debt_to_equity_fq"             // 12 (Basic)
          // Excluded: current_ratio, revenue
      ],
      "range": [0, 20000]
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
    // Attempt 1: Rich Scan (Full Data)
    let json = await fetchScan(richPayload);
    let rows = json?.data || [];
    let isRich = true;

    // Attempt 2: Basic Scan (Critical Data Only) - Fallback
    if (rows.length === 0) {
        console.warn("TV Scanner: Rich Scan returned 0 items. Falling back to Robust Basic Scan (w/ PBR & Debt)...");
        json = await fetchScan(basicPayload);
        rows = json?.data || [];
        isRich = false;
    }

    // Map raw array to schema
    const normalized = rows.map((r: any) => {
        const d = r.d; // data array
        
        // Safe number extraction
        const val = (v: any) => (v === null || v === undefined) ? 0 : v;

        const baseObj = {
            symbol: r.s.split(':')[1] || r.s, // Remove "NASDAQ:" prefix
            name: d[10] || "",
            price: val(d[1]),
            volume: val(d[2]),
            marketCap: val(d[3]),
            sector: d[4] || "Unclassified",
            industry: d[5] || "Unknown",
            pe: val(d[6]),
            eps: val(d[7]),
            roe: val(d[8]),
            change: val(d[9]),
            // Fields present in BOTH Rich and Basic payloads (indices 11, 12 match)
            pbr: val(d[11]),
            debtToEquity: val(d[12]),
            source: isRich ? 'TradingView_Rich' : 'TradingView_Robust'
        };

        // Fields ONLY in Rich payload
        if (isRich) {
            return {
                ...baseObj,
                currentRatio: val(d[13]),
                revenue: val(d[14])
            };
        }

        // Fallback: Missing fields default to 0
        return {
            ...baseObj,
            currentRatio: 0,
            revenue: 0
        };
    });

    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');
    return res.status(200).json(normalized);

  } catch (error: any) {
    console.error('TV Proxy Critical Error:', error);
    return res.status(200).json([]); 
  }
}
