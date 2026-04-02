
import { captureApiError, withSentryApi } from "./_sentry.js";

const handler = async (req: any, res: any) => {
  // "The Holy Grail" - TradingView Scanner Proxy v9.5 (Stealth Mode)
  // Strategy: User-Agent Rotation to bypass soft blocks.
  
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

  const userAgents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:109.0) Gecko/20100101 Firefox/121.0',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36 Edg/121.0.0.0'
  ];

  const getPayload = (start: number, end: number) => ({
      "filter": [
          { "left": "type", "operation": "in_range", "right": ["stock", "dr", "fund"] },
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
          // Rotate User Agent
          const ua = userAgents[Math.floor(Math.random() * userAgents.length)];
          
          const response = await fetch('https://scanner.tradingview.com/america/scan', {
            method: 'POST',
            headers: {
                'User-Agent': ua,
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
                   await new Promise(r => setTimeout(r, 2000)); // Longer backoff
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
    const CHUNK_SIZE = 2000; 
    let start = 0;
    let totalCount = 15000; 

    while (start < totalCount) {
        if (start >= 15000) break; 

        const end = Math.min(start + CHUNK_SIZE, totalCount);
        const payload = getPayload(start, end);
        
        const chunk = await fetchChunk(payload);
        
        if (chunk && chunk.data && chunk.data.length > 0) {
            allRows = allRows.concat(chunk.data);
            const apiTotal = chunk.totalCount || 0;
            totalCount = Math.min(apiTotal, 15000); 
        } else {
            break;
        }
        
        start += CHUNK_SIZE;
        await new Promise(r => setTimeout(r, 150)); 
    }

    if (allRows.length === 0) {
        // Return empty array instead of error to allow frontend failover
        console.warn("TV Scanner: Zero assets returned.");
        return res.status(200).json([]);
    }

    const normalized = allRows.map((r: any) => {
        const d = r.d;
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

    return res.status(200).json(normalized);

  } catch (error: any) {
    console.error('TV Proxy Fatal Error:', error.message);
    captureApiError(error, {
      source: 'nasdaq_proxy',
      method: req?.method || 'UNKNOWN'
    });
    // Return empty array to allow failover
    return res.status(200).json([]); 
  }
};

export default withSentryApi(handler);
