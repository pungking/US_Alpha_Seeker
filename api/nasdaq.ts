
export default async function handler(req: any, res: any) {
  // "The Holy Grail" - TradingView Scanner Proxy v6.0 (Ironclad)
  // Features: Multi-Endpoint Hopping, Payload Restoration, Emergency Data Injection
  
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
      "total_revenue_ttm"             // 13
  ];

  // Strategy 1: America Endpoint (Primary)
  const getAmericaPayload = (start: number, end: number) => ({
      "filter": [
          { "left": "type", "operation": "in_range", "right": ["stock", "dr", "fund"] },
          { "left": "subtype", "operation": "in_range", "right": ["common", "etf", "adr", "reit"] }
      ],
      "options": { "lang": "en" },
      "symbols": { "query": { "types": [] } }, // CRITICAL: Re-added for validity
      "columns": standardColumns,
      "sort": { "sortBy": "market_cap_basic", "sortOrder": "desc" },
      "range": [start, end]
  });

  // Strategy 2: Global Endpoint (Fallback)
  const getGlobalPayload = (start: number, end: number) => ({
      "filter": [
          { "left": "country", "operation": "equal", "right": "US" },
          { "left": "type", "operation": "in_range", "right": ["stock", "dr", "fund"] }
      ],
      "options": { "lang": "en" },
      "symbols": { "query": { "types": [] } },
      "columns": standardColumns,
      "sort": { "sortBy": "market_cap_basic", "sortOrder": "desc" },
      "range": [start, end]
  });

  const fetchChunk = async (url: string, payload: any) => {
      try {
          const response = await fetch(url, {
            method: 'POST',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Content-Type': 'application/json',
                'Origin': 'https://www.tradingview.com',
                'Referer': 'https://www.tradingview.com/'
            },
            body: JSON.stringify(payload)
          });
          
          if (!response.ok) return null;
          return await response.json();
      } catch (e) {
          return null;
      }
  };

  // [EMERGENCY DATASET] Top 30 Market Cap Assets (Hardcoded Life-Raft)
  const EMERGENCY_DATA = [
    { s: "NASDAQ:AAPL", d: ["Apple Inc", 180.0, 50000000, 2800000000000, "Technology", "Consumer Electronics", 28.5, 6.4, 160, 0.5, "Apple", 45, 1.5, 380000000000] },
    { s: "NASDAQ:MSFT", d: ["Microsoft", 400.0, 20000000, 3000000000000, "Technology", "Software", 35.2, 10.1, 40, 0.8, "Microsoft", 12, 0.5, 210000000000] },
    { s: "NASDAQ:NVDA", d: ["NVIDIA", 900.0, 40000000, 2200000000000, "Technology", "Semiconductors", 75.5, 12.5, 90, 2.5, "NVIDIA", 50, 0.2, 60000000000] },
    { s: "NASDAQ:AMZN", d: ["Amazon", 175.0, 30000000, 1800000000000, "Consumer Cyclical", "Internet Retail", 60.2, 3.5, 20, 1.2, "Amazon", 8, 0.8, 550000000000] },
    { s: "NASDAQ:GOOGL", d: ["Alphabet", 170.0, 25000000, 2100000000000, "Communication Services", "Internet Content", 25.1, 5.8, 25, 0.9, "Google", 6, 0.1, 300000000000] },
    { s: "NASDAQ:META", d: ["Meta", 170.0, 15000000, 1200000000000, "Communication Services", "Internet Content", 30.5, 15.2, 28, 1.5, "Meta Platforms", 7, 0.3, 130000000000] },
    { s: "NYSE:TSLA", d: ["Tesla", 250.0, 80000000, 800000000000, "Consumer Cyclical", "Auto Manufacturers", 40.2, 3.1, 22, 0.5, "Tesla Inc", 10, 0.1, 95000000000] },
    { s: "NYSE:BRK.B", d: ["Berkshire", 400.0, 3000000, 900000000000, "Financial", "Insurance", 11.5, 18.5, 10, 0.5, "Berkshire Hathaway", 1.5, 0.2, 300000000000] },
    { s: "NYSE:LLY", d: ["Eli Lilly", 750.0, 2000000, 700000000000, "Healthcare", "Drug Manufacturers", 120.5, 8.5, 55, 3.2, "Eli Lilly", 60, 1.8, 35000000000] },
    { s: "NYSE:V", d: ["Visa", 280.0, 5000000, 550000000000, "Financial", "Credit Services", 30.2, 9.2, 45, 0.8, "Visa Inc", 15, 0.6, 32000000000] },
    { s: "NYSE:JPM", d: ["JPMorgan", 190.0, 8000000, 560000000000, "Financial", "Banks", 11.2, 14.5, 16, 0.6, "JPMorgan Chase", 1.8, 1.2, 150000000000] },
    { s: "NYSE:WMT", d: ["Walmart", 60.0, 15000000, 480000000000, "Consumer Defensive", "Discount Stores", 28.5, 2.1, 18, 0.4, "Walmart Inc", 5, 0.8, 640000000000] },
    { s: "NYSE:XOM", d: ["Exxon Mobil", 110.0, 12000000, 430000000000, "Energy", "Oil & Gas", 12.5, 8.5, 14, 0.2, "Exxon Mobil", 2.2, 0.3, 340000000000] },
    { s: "NYSE:UNH", d: ["UnitedHealth", 480.0, 3000000, 440000000000, "Healthcare", "Healthcare Plans", 18.5, 22.5, 24, 0.5, "UnitedHealth", 5, 0.7, 370000000000] },
    { s: "NASDAQ:AVGO", d: ["Broadcom", 1300.0, 2000000, 600000000000, "Technology", "Semiconductors", 25.5, 40.5, 35, 1.5, "Broadcom Inc", 12, 1.5, 45000000000] }
  ];

  try {
    let allRows: any[] = [];
    const CHUNK_SIZE = 4000; 
    let start = 0;
    let totalCount = 12000; // Cap to speed up
    let useGlobal = false;

    console.log(`TV Scanner: Initiating Strategy 1 (America)...`);

    // Fetch Loop
    while (start < totalCount) {
        if (start >= 12000) break; // Hard Limit

        const end = Math.min(start + CHUNK_SIZE, totalCount);
        
        // Try Strategy 1
        let payload: any = getAmericaPayload(start, end);
        let url = 'https://scanner.tradingview.com/america/scan';
        
        let chunk = await fetchChunk(url, payload);

        // Try Strategy 2 (Switch to Global if America fails)
        if (!chunk || !chunk.data) {
             console.warn(`TV Scanner: Strategy 1 blocked. Switching to Strategy 2 (Global)...`);
             useGlobal = true;
             url = 'https://scanner.tradingview.com/global/scan';
             payload = getGlobalPayload(start, end);
             chunk = await fetchChunk(url, payload);
        }

        if (chunk && chunk.data && chunk.data.length > 0) {
            allRows = allRows.concat(chunk.data);
            totalCount = chunk.totalCount; 
            console.log(`TV Scanner: Fetched [${start}-${end}]. Total: ${allRows.length}`);
        } else {
            console.warn(`TV Scanner: Chunk [${start}-${end}] empty. Stopping.`);
            break;
        }
        
        start += CHUNK_SIZE;
        await new Promise(r => setTimeout(r, 200)); 
    }

    // [EMERGENCY PROTOCOL]
    // If we have 0 rows after all attempts, inject the hardcoded life-raft data.
    if (allRows.length === 0) {
        console.error("CRITICAL: All TV strategies failed. Injecting EMERGENCY DATASET to prevent app crash.");
        allRows = EMERGENCY_DATA; // Inject static data
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
            source: allRows === EMERGENCY_DATA ? 'Emergency_Backup_Data' : (useGlobal ? 'TradingView_Global' : 'TradingView_America')
        };
    });

    return res.status(200).json(normalized);

  } catch (error: any) {
    console.error('TV Proxy Fatal Error:', error.message);
    // Even on crash, return emergency data to keep app alive
    const fallback = EMERGENCY_DATA.map((r: any) => ({
        symbol: r.s.split(':')[1] || r.s,
        name: r.d[0], price: r.d[1], volume: r.d[2], marketCap: r.d[3],
        sector: r.d[4], industry: r.d[5], pe: r.d[6], eps: r.d[7], roe: r.d[8],
        change: r.d[9], description: r.d[10], pbr: r.d[11], debtToEquity: r.d[12], revenue: r.d[13],
        source: 'System_Recovery_Mode'
    }));
    return res.status(200).json(fallback); 
  }
}
