
export default async function handler(req: any, res: any) {
  // "The Holy Grail" - TradingView Scanner Proxy v9.1 (Resilient Mode)
  // Target: Reliable fetch of Top 12,000 US Assets (NYSE, NASDAQ, AMEX)
  // Strategy: Relax filters (remove subtype) to ensure non-zero results.
  
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

  // Unified "Standard" Columns for Rich Data
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

  // Strategy: Request 'america' scanner directly with minimal filters.
  // Removing 'subtype' filter often fixes empty results.
  const getPayload = (start: number, end: number) => ({
      "filter": [
          { "left": "type", "operation": "in_range", "right": ["stock", "dr", "fund"] },
          // Removed subtype filter to be safer
          { "left": "exchange", "operation": "in_range", "right": ["AMEX", "NASDAQ", "NYSE"] } 
      ],
      "options": { "lang": "en" },
      "symbols": { "query": { "types": [] } },
      "columns": standardColumns,
      "sort": { "sortBy": "market_cap_basic", "sortOrder": "desc" },
      "range": [start, end]
  });

  const fetchChunk = async (payload: any, retries = 2): Promise<any> => {
      try {
          const response = await fetch('https://scanner.tradingview.com/america/scan', {
            method: 'POST',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Content-Type': 'application/json',
                'Origin': 'https://www.tradingview.com',
                'Referer': 'https://www.tradingview.com/',
                'Accept': 'application/json, text/plain, */*'
            },
            body: JSON.stringify(payload)
          });
          
          if (!response.ok) {
               console.warn(`TV API Warning: ${response.status} ${response.statusText}`);
               if (retries > 0) {
                   await new Promise(r => setTimeout(r, 2000)); // Increased cool down
                   return fetchChunk(payload, retries - 1);
               }
               return null;
          }
          return await response.json();
      } catch (e: any) {
          console.error("TV Chunk Network Error:", e.message);
          if (retries > 0) {
              await new Promise(r => setTimeout(r, 2000));
              return fetchChunk(payload, retries - 1);
          }
          return null;
      }
  };

  try {
    let allRows: any[] = [];
    const CHUNK_SIZE = 5000; // Increased chunk size
    let start = 0;
    
    // Target: Top 15,000 assets to cover decent liquidity
    let totalCount = 15000; 

    console.log(`TV Scanner (v9.1): Starting Resilient America Scan...`);

    while (start < totalCount) {
        if (start >= 15000) break; // Hard safety limit

        const end = Math.min(start + CHUNK_SIZE, totalCount);
        const payload = getPayload(start, end);
        
        const chunk = await fetchChunk(payload);
        
        if (chunk && chunk.data && chunk.data.length > 0) {
            allRows = allRows.concat(chunk.data);
            const apiTotal = chunk.totalCount || 0;
            totalCount = Math.min(apiTotal, 15000); 
            
            console.log(`TV Scanner: Fetched [${start}-${end}]. Rows: ${chunk.data.length}. Total: ${allRows.length}`);
        } else {
            console.warn(`TV Scanner: Chunk [${start}-${end}] returned empty. Stopping.`);
            break;
        }
        
        start += CHUNK_SIZE;
        await new Promise(r => setTimeout(r, 100)); 
    }

    if (allRows.length === 0) {
        console.error("TV Scanner: Zero assets returned after all retries.");
        throw new Error("TradingView API returned 0 assets (America Endpoint).");
    }

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
    return res.status(500).json({ error: "Data Gathering Failed", details: error.message }); 
  }
}
