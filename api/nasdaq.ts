
export default async function handler(req: any, res: any) {
  // "The Holy Grail" - TradingView Scanner Proxy
  // Fetches entire US market + Fundamentals.
  // V5.7 Update: DISABLING CACHE to fix "0 data" persistence issues.
  // Unified "Standard" column set to ensure consistency.
  
  // [CRITICAL] Disable Caching to force fresh data fetch
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

  const url = 'https://scanner.tradingview.com/america/scan';
  
  // Unified "Standard" Columns - The Golden Set
  // Contains all essential data for Stage 3 Analysis.
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

  // Fixed Reliable User Agent
  const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

  const getPayload = (rangeStart: number, rangeEnd: number) => ({
      "filter": [
          { "left": "type", "operation": "in_range", "right": ["stock", "dr", "fund"] },
          { "left": "subtype", "operation": "in_range", "right": ["common", "etf", "adr", "reit"] }
      ],
      "options": { "lang": "en" },
      "symbols": { "query": { "types": [] }, "tickers": [] },
      "columns": standardColumns,
      "sort": { "sortBy": "volume", "sortOrder": "desc" },
      "range": [rangeStart, rangeEnd]
  });

  const fetchChunk = async (payload: any, retries = 2): Promise<any> => {
      try {
          const response = await fetch(url, {
            method: 'POST',
            headers: {
                'User-Agent': userAgent,
                'Content-Type': 'application/json',
                'Origin': 'https://www.tradingview.com',
                'Referer': 'https://www.tradingview.com/'
            },
            body: JSON.stringify(payload)
          });
          
          if (!response.ok) {
               if (retries > 0) {
                   await new Promise(r => setTimeout(r, 1500));
                   return fetchChunk(payload, retries - 1);
               }
               return null;
          }
          return await response.json();
      } catch (e) {
          if (retries > 0) {
              await new Promise(r => setTimeout(r, 1500));
              return fetchChunk(payload, retries - 1);
          }
          console.error("TV Chunk Error:", e);
          return null;
      }
  };

  try {
    let allRows: any[] = [];
    
    // Chunking Strategy: 4000 items per chunk (Balance between speed and payload size)
    const CHUNK_SIZE = 4000; 
    let start = 0;
    let totalCount = 20000; // Updated by first request

    console.log(`TV Scanner (No-Cache): Starting scan with Standard columns...`);

    // Fetch loop
    while (start < totalCount) {
        // Limit total to top 16k to prevent timeouts on free tiers
        if (start >= 16000) break;

        const end = Math.min(start + CHUNK_SIZE, totalCount);
        const payload = getPayload(start, end);
        
        const chunk = await fetchChunk(payload);
        
        if (chunk && chunk.data && chunk.data.length > 0) {
            allRows = allRows.concat(chunk.data);
            totalCount = chunk.totalCount; // Update total count from API
            console.log(`TV Scanner: Fetched [${start}-${end}]. Total so far: ${allRows.length}`);
        } else {
            console.warn(`TV Scanner: Chunk [${start}-${end}] returned empty. Stopping.`);
            break;
        }
        
        start += CHUNK_SIZE;
        await new Promise(r => setTimeout(r, 300)); // Gentle pacing
    }

    if (allRows.length === 0) {
        throw new Error("Critical: TradingView returned 0 assets.");
    }

    // Map raw array to schema
    const normalized = allRows.map((r: any) => {
        const d = r.d; // data array
        const val = (v: any) => (v === null || v === undefined) ? 0 : v;

        // Columns:
        // 0:name, 1:close, 2:vol, 3:mktcap, 4:sect, 5:ind, 6:pe, 7:eps, 8:roe, 9:chg, 10:desc, 11:pbr, 12:debt, 13:rev

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
            source: 'TradingView_Standard'
        };
    });

    return res.status(200).json(normalized);

  } catch (error: any) {
    console.error('TV Proxy Critical Error:', error.message);
    return res.status(200).json([]); 
  }
}
