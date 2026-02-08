
export default async function handler(req: any, res: any) {
  // "The Holy Grail" - TradingView Scanner Proxy
  // Fetches entire US market + Fundamentals.
  // V5.5 Update: Implemented Pagination (Chunking) to bypass 20k range limits.
  // Also ensures Basic Fallback includes PBR & Debt columns.
  
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

  // 1. Rich Columns: Include heavy calculation fields
  const richColumns = [
      ...baseColumns,
      "price_book_ratio_fq",          // 11
      "debt_to_equity_fq",            // 12
      "current_ratio_fq",             // 13 (Heavy)
      "total_revenue_ttm"             // 14 (Heavy)
  ];

  // 2. Basic Columns: Include CRITICAL fields only (PBR & Debt are critical)
  const basicColumns = [
      ...baseColumns,
      "price_book_ratio_fq",          // 11
      "debt_to_equity_fq"             // 12
  ];

  const getPayload = (rangeStart: number, rangeEnd: number, columns: string[]) => ({
      "filter": [
          { "left": "type", "operation": "in_range", "right": ["stock", "dr", "fund"] },
          { "left": "subtype", "operation": "in_range", "right": ["common", "etf", "adr", "reit"] }
      ],
      "options": { "lang": "en" },
      "symbols": { "query": { "types": [] }, "tickers": [] },
      "columns": columns,
      "sort": { "sortBy": "volume", "sortOrder": "desc" },
      "range": [rangeStart, rangeEnd]
  });

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
    let allRows: any[] = [];
    let isRich = true;
    let start = 0;
    const step = 8000; // Safe chunk size (below 10k limit often imposed by TV)
    const maxFetchLimit = 30000; // Safety brake

    console.log(`TV Scanner: Initiating Paginated Scan (Step: ${step})...`);

    // 1. Initial Probe (Rich Data)
    let firstBatch = await fetchScan(getPayload(0, step, richColumns));

    // 2. Fallback Probe (Basic Data) if Rich failed
    if (!firstBatch || !firstBatch.data || firstBatch.data.length === 0) {
        console.warn("TV Scanner: Rich Probe failed or empty. Switching to Robust Basic Mode.");
        isRich = false;
        firstBatch = await fetchScan(getPayload(0, step, basicColumns));
    }

    if (!firstBatch || !firstBatch.data || firstBatch.data.length === 0) {
        throw new Error("Critical: TradingView returned 0 assets in both Rich and Basic modes.");
    }

    // Add first batch
    allRows = [...firstBatch.data];
    const totalCount = firstBatch.totalCount || 20000;
    start += step;

    // 3. Pagination Loop
    while (start < totalCount && start < maxFetchLimit) {
        const columns = isRich ? richColumns : basicColumns;
        console.log(`TV Scanner: Fetching chunk [${start} - ${start + step}] (${isRich ? 'Rich' : 'Basic'})...`);
        
        const chunk = await fetchScan(getPayload(start, start + step, columns));
        
        if (chunk && chunk.data && chunk.data.length > 0) {
            allRows = allRows.concat(chunk.data);
            if (chunk.data.length < step) break; // End of list reached
        } else {
            break; // No more data or error
        }
        
        start += step;
        await new Promise(r => setTimeout(r, 100)); // Rate limit niceness
    }

    console.log(`TV Scanner: Total assets retrieved: ${allRows.length}`);

    // Map raw array to schema
    const normalized = allRows.map((r: any) => {
        const d = r.d; // data array
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
            // Fields present in BOTH Rich and Basic (indices 11, 12 match)
            pbr: val(d[11]),
            debtToEquity: val(d[12]),
            source: isRich ? 'TradingView_Rich' : 'TradingView_Robust'
        };

        if (isRich) {
            return {
                ...baseObj,
                currentRatio: val(d[13]),
                revenue: val(d[14])
            };
        }

        // Fallback fills
        return {
            ...baseObj,
            currentRatio: 0,
            revenue: 0
        };
    });

    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');
    return res.status(200).json(normalized);

  } catch (error: any) {
    console.error('TV Proxy Critical Error:', error.message);
    // Return empty array to allow frontend to handle gracefully (e.g. retry or show error)
    return res.status(200).json([]); 
  }
}
