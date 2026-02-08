
export default async function handler(req: any, res: any) {
  // "The Holy Grail" - TradingView Scanner Proxy v8.0 (Pure Real Data Mode)
  // Hardcoding REMOVED. Only fetches real-time data from TradingView.
  // Target: All US Equities (NYSE, NASDAQ, AMEX, ARCA, OTC)
  
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Unified "Standard" Columns
  const standardColumns = [
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
      "description",                  // 10
      "price_book_ratio_fq",          // 11
      "debt_to_equity_fq",            // 12
      "total_revenue_ttm",            // 13
      "current_ratio",                // 14
      "type"                          // 15
  ];

  // Aggressive Payload: US Market + Broad Filters
  const getPayload = (start: number, end: number) => ({
      "filter": [
          { "left": "type", "operation": "in_range", "right": ["stock", "dr", "fund"] },
          { "left": "subtype", "operation": "in_range", "right": ["common", "etf", "adr", "reit", "unit", "preference"] },
          { "left": "exchange", "operation": "in_range", "right": ["AMEX", "NASDAQ", "NYSE", "NYSE ARCA", "OTC"] },
          { "left": "country", "operation": "equal", "right": "US" }
      ],
      "options": { "lang": "en" },
      "symbols": { "query": { "types": [] } }, // Essential for TV API to accept the request
      "columns": standardColumns,
      "sort": { "sortBy": "market_cap_basic", "sortOrder": "desc" },
      "range": [start, end]
  });

  // User-Agent Rotation to prevent soft-blocks
  const userAgents = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
  ];
  const getRandomAgent = () => userAgents[Math.floor(Math.random() * userAgents.length)];

  const fetchChunk = async (payload: any, retries = 3): Promise<any> => {
      try {
          const response = await fetch('https://scanner.tradingview.com/global/scan', {
            method: 'POST',
            headers: {
                'User-Agent': getRandomAgent(),
                'Content-Type': 'application/json',
                'Origin': 'https://www.tradingview.com',
                'Referer': 'https://www.tradingview.com/'
            },
            body: JSON.stringify(payload)
          });
          
          if (!response.ok) {
               console.warn(`TV API Warning: ${response.status} ${response.statusText}`);
               if (retries > 0) {
                   await new Promise(r => setTimeout(r, 1000));
                   return fetchChunk(payload, retries - 1);
               }
               return null;
          }
          return await response.json();
      } catch (e: any) {
          console.error("TV Chunk Network Error:", e.message);
          if (retries > 0) {
              await new Promise(r => setTimeout(r, 1000));
              return fetchChunk(payload, retries - 1);
          }
          return null;
      }
  };

  try {
    let allRows: any[] = [];
    const CHUNK_SIZE = 5000; // Maximize chunk size to reduce RTT
    let start = 0;
    // We aim for 20,000 high-quality assets to stay within Vercel execution limits (10s).
    // Fetching 130k assets would likely timeout on a free serverless function.
    let totalCount = 25000; 

    console.log(`TV Scanner (v8.0): Initiating Pure Real Data Scan...`);

    while (start < totalCount) {
        if (start >= 25000) break; // Safety brake for serverless timeout

        const end = Math.min(start + CHUNK_SIZE, totalCount);
        const payload = getPayload(start, end);
        
        const chunk = await fetchChunk(payload);
        
        if (chunk && chunk.data && chunk.data.length > 0) {
            allRows = allRows.concat(chunk.data);
            totalCount = Math.min(chunk.totalCount, 25000); // Update total but respect safety brake
            console.log(`TV Scanner: Fetched [${start}-${end}]. Rows: ${chunk.data.length}. Total collected: ${allRows.length}`);
        } else {
            console.warn(`TV Scanner: Chunk [${start}-${end}] empty or failed.`);
            break;
        }
        
        start += CHUNK_SIZE;
        // Minimal delay to be polite but fast
        await new Promise(r => setTimeout(r, 50)); 
    }

    if (allRows.length === 0) {
        // [CRITICAL] Do NOT return fake data. Throw error to let the frontend know.
        throw new Error("TradingView API returned 0 assets. Possible IP Block or API change.");
    }

    // Map raw array to schema
    const normalized = allRows.map((r: any) => {
        const d = r.d; // data array
        const val = (v: any) => (v === null || v === undefined) ? 0 : v;

        return {
            symbol: r.s.split(':')[1] || r.s,
            name: d[0] || "",
            price: val(d[1]),
            volume: val(d[2]),
            marketCap: val(d[3]),
            sector: d[4] || "Unclassified",
            industry: d[5] || "Unknown",
            pe: val(d[6]),
            eps: val(d[7]),
            roe: val(d[8]),
            change: val(d[9]),
            description: d[10] || "",
            pbr: val(d[11]),
            debtToEquity: val(d[12]),
            revenue: val(d[13]),
            currentRatio: val(d[14]),
            source: 'TradingView_RealTime'
        };
    });

    console.log(`TV Scanner: Successfully processed ${normalized.length} real assets.`);
    return res.status(200).json(normalized);

  } catch (error: any) {
    console.error('TV Proxy Fatal Error:', error.message);
    // Return Error 500 to signal frontend to retry or handle failure, NO FAKE DATA.
    return res.status(500).json({ error: "Data Gathering Failed", details: error.message }); 
  }
}
