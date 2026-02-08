
export default async function handler(req: any, res: any) {
  // "The Holy Grail" - TradingView Scanner Proxy
  // Fetches entire US market + Fundamentals.
  // V5.6 Update: Hyper-Robust Chunking + 3-Level Fallback + Header Camouflage
  
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const url = 'https://scanner.tradingview.com/america/scan';
  
  // Columns Definitions
  // Level 1: Full Fundamental Data
  const richColumns = [
      "name", "close", "volume", "market_cap_basic", "sector", "industry",
      "price_earnings_ttm", "earnings_per_share_basic_ttm", "return_on_equity_fq",
      "change", "description",
      "price_book_ratio_fq", "debt_to_equity_fq", "current_ratio_fq", "total_revenue_ttm"
  ];

  // Level 2: Critical Fundamentals only (PBR/Debt included)
  const basicColumns = [
      "name", "close", "volume", "market_cap_basic", "sector", "industry",
      "price_earnings_ttm", "earnings_per_share_basic_ttm", "return_on_equity_fq",
      "change", "description",
      "price_book_ratio_fq", "debt_to_equity_fq"
  ];

  // Level 3: Bare minimum (Survival Mode)
  const minimalColumns = [
      "name", "close", "volume", "market_cap_basic", "sector", "industry",
      "change", "description"
  ];

  // Random User Agent Rotator
  const userAgents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0'
  ];
  const getRandomAgent = () => userAgents[Math.floor(Math.random() * userAgents.length)];

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

  const fetchChunk = async (payload: any, retries = 3): Promise<any> => {
      try {
          const response = await fetch(url, {
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
               if (retries > 0 && (response.status === 429 || response.status >= 500)) {
                   await new Promise(r => setTimeout(r, 2000));
                   return fetchChunk(payload, retries - 1);
               }
               return null;
          }
          return await response.json();
      } catch (e) {
          if (retries > 0) {
              await new Promise(r => setTimeout(r, 2000));
              return fetchChunk(payload, retries - 1);
          }
          console.error("TV Chunk Error:", e);
          return null;
      }
  };

  try {
    let allRows: any[] = [];
    let activeColumns = richColumns;
    let mode = 'Rich';
    
    // Chunking Strategy: Smaller chunks are safer
    const CHUNK_SIZE = 2000; 
    let start = 0;
    let totalCount = 20000; // Will update after first request

    // Initial Probe to determine capability
    console.log(`TV Scanner: Probing API...`);
    let firstBatch = await fetchChunk(getPayload(0, CHUNK_SIZE, richColumns));

    if (!firstBatch || !firstBatch.data || firstBatch.data.length === 0) {
        console.warn("TV Scanner: Rich Mode failed. Downgrading to Basic...");
        mode = 'Basic';
        activeColumns = basicColumns;
        firstBatch = await fetchChunk(getPayload(0, CHUNK_SIZE, basicColumns));
    }

    if (!firstBatch || !firstBatch.data || firstBatch.data.length === 0) {
        console.warn("TV Scanner: Basic Mode failed. Downgrading to Minimal...");
        mode = 'Minimal';
        activeColumns = minimalColumns;
        firstBatch = await fetchChunk(getPayload(0, CHUNK_SIZE, minimalColumns));
    }

    if (!firstBatch || !firstBatch.data || firstBatch.data.length === 0) {
        throw new Error("Critical: TradingView returned 0 assets across all modes.");
    }

    // Process First Batch
    totalCount = firstBatch.totalCount || 20000;
    allRows = [...firstBatch.data];
    start += CHUNK_SIZE;

    console.log(`TV Scanner: Mode [${mode}] Active. Total assets to fetch: ${totalCount}`);

    // Fetch remaining chunks
    while (start < totalCount) {
        // Range cannot exceed totalCount
        const end = Math.min(start + CHUNK_SIZE, totalCount); 
        
        // Safety break
        if (start >= 25000) break; 

        const chunk = await fetchChunk(getPayload(start, end, activeColumns));
        
        if (chunk && chunk.data && chunk.data.length > 0) {
            allRows = allRows.concat(chunk.data);
            console.log(`TV Scanner: Chunk [${start}-${end}] OK. Total: ${allRows.length}`);
        } else {
            console.warn(`TV Scanner: Chunk [${start}-${end}] Empty/Failed. Stop.`);
            break;
        }
        
        start += CHUNK_SIZE;
        // Rate limit niceness
        await new Promise(r => setTimeout(r, 500)); 
    }

    // Mapping Logic based on Mode
    const normalized = allRows.map((r: any) => {
        const d = r.d; // data array
        const val = (v: any) => (v === null || v === undefined) ? 0 : v;

        // Base 11 columns (0-10) are same for Rich/Basic/Minimal (Minimal cuts off after 7 actually)
        // Adjust indices based on columns definition
        /*
          Rich/Basic: 0:name, 1:close, 2:vol, 3:mktcap, 4:sect, 5:ind, 6:pe, 7:eps, 8:roe, 9:chg, 10:desc
          Minimal:    0:name, 1:close, 2:vol, 3:mktcap, 4:sect, 5:ind, 6:chg, 7:desc
        */

        let baseObj: any = {};
        
        if (mode === 'Minimal') {
             baseObj = {
                symbol: r.s.split(':')[1] || r.s,
                name: d[0] || "",
                price: val(d[1]),
                volume: val(d[2]),
                marketCap: val(d[3]),
                sector: d[4] || "Unclassified",
                industry: d[5] || "Unknown",
                change: val(d[6]),
                description: d[7] || "",
                // Zero out missing
                pe: 0, eps: 0, roe: 0, pbr: 0, debtToEquity: 0, currentRatio: 0, revenue: 0,
                source: 'TradingView_Minimal_Rescue'
            };
        } else {
            // Rich or Basic (Indices 0-10 match)
            baseObj = {
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
                // Conditional fields
                pbr: val(d[11]), // Rich/Basic index 11
                debtToEquity: val(d[12]), // Rich/Basic index 12
                source: mode === 'Rich' ? 'TradingView_Rich' : 'TradingView_Basic'
            };

            if (mode === 'Rich') {
                baseObj.currentRatio = val(d[13]);
                baseObj.revenue = val(d[14]);
            } else {
                baseObj.currentRatio = 0;
                baseObj.revenue = 0;
            }
        }
        
        return baseObj;
    });

    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');
    return res.status(200).json(normalized);

  } catch (error: any) {
    console.error('TV Proxy Critical Error:', error.message);
    // Return empty array to allow frontend to handle gracefully (e.g. retry or show error)
    return res.status(200).json([]); 
  }
}
