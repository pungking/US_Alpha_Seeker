
export default async function handler(req: any, res: any) {
  // "The Fundamentalist" - MSN Secret Protocol v3.0 (API-Based Mapping)
  // 1. Map Builder: Extracts 'fi-IDs' from Sitemap -> Batch calls MSN API -> Maps Symbol to ID
  // 2. Deep Dive: Uses Secret IDs to fetch rich fundamental data
  
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const { symbols, mode, id, symbol } = req.query;
  const MSN_API_KEY = '0QfOX3Vn51YCzitbLaRkTTBadtWpgTN8NZLW0C1SEM'; // User provided key

  // --- MODE A: GENERATE ID MAP (Sitemap ID Extraction -> API Validation) ---
  if (mode === 'generate_map') {
      try {
          const targetMap = "https://www.msn.com/staticsb/statics/latest/0/finance/sitemaps/stockdetails-en-us-sitemap.xml";
          console.log(`[MSN] Fetching Sitemap: ${targetMap}`);
          
          const subRes = await fetch(targetMap, {
              headers: {
                  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
              }
          });
          
          if(!subRes.ok) throw new Error(`Sitemap fetch failed: ${subRes.status}`);
          
          const subXml = await subRes.text();
          
          // 1. Extract ALL Secret IDs (fi-xxxxxx)
          const regex = /fi-([a-zA-Z0-9]+)/g;
          const foundIds = new Set<string>();
          let m;
          while ((m = regex.exec(subXml)) !== null) {
              if(m[1]) foundIds.add(m[1]);
          }
          
          const allIds = Array.from(foundIds);
          console.log(`[MSN] Extracted ${allIds.length} Unique Secret IDs.`);

          const idMap: Record<string, string> = {};
          
          // 2. Batch Processing Configuration
          const BATCH_SIZE = 20; // MSN API accepts comma separated IDs
          const batches = [];
          for (let i = 0; i < allIds.length; i += BATCH_SIZE) {
              batches.push(allIds.slice(i, i + BATCH_SIZE));
          }

          // 3. Execute API Calls (Limit concurrency to prevent timeouts/rate-limits)
          // Note: Vercel functions have time limits. We process as many as possible safely.
          // For 10k items, 20 per batch = 500 requests. We'll do batches of batches.
          
          let processedCount = 0;
          const CONCURRENCY_LIMIT = 5; // Parallel requests

          for (let i = 0; i < batches.length; i += CONCURRENCY_LIMIT) {
              const currentBatchGroup = batches.slice(i, i + CONCURRENCY_LIMIT);
              
              await Promise.all(currentBatchGroup.map(async (batchIds) => {
                  try {
                      const idsParam = batchIds.join(',');
                      const apiUrl = `https://assets.msn.com/service/Finance/Equities?apikey=${MSN_API_KEY}&activityId=6989d7cd-b38e-4edc-a952-7633e6cc0169&ocid=finance-utils-peregrine&cm=en-us&it=web&scn=ANON&ids=${idsParam}&wrapodata=false`;
                      
                      const apiRes = await fetch(apiUrl);
                      if (apiRes.ok) {
                          const items = await apiRes.json();
                          if (Array.isArray(items)) {
                              items.forEach((item: any) => {
                                  // Map Symbol -> Secret ID
                                  // Use upper case symbol as key
                                  if (item.symbol && item.id) {
                                      // item.id is the secret ID (e.g. "a24kar")
                                      // item.symbol is the ticker (e.g. "TSLA")
                                      idMap[item.symbol.toUpperCase()] = item.id;
                                  }
                              });
                          }
                      }
                  } catch (e) {
                      console.warn("[MSN] Batch failed", e);
                  }
              }));
              
              processedCount += currentBatchGroup.length * BATCH_SIZE;
              
              // Safety: Optional delay to be nice to the API
              await new Promise(r => setTimeout(r, 50)); 
          }

          const mappedCount = Object.keys(idMap).length;
          console.log(`[MSN] Map Generation Complete. Successfully Mapped: ${mappedCount} Tickers.`);

          return res.status(200).json({ 
              status: 'success', 
              count: mappedCount, 
              map: idMap,
              message: `Successfully validated and mapped ${mappedCount} tickers via MSN API.`
          });

      } catch (e: any) {
          console.error("[MSN] Map Gen Error:", e);
          return res.status(500).json({ error: e.message });
      }
  }

  // --- MODE B: DEEP DIVE (Fetch Data by ID) ---
  if (mode === 'get_details' && id) {
      try {
          const apiUrl = `https://assets.msn.com/service/Finance/Equities?apikey=${MSN_API_KEY}&activityId=6989d7cd-b38e-4edc-a952-7633e6cc0169&ocid=finance-utils-peregrine&cm=en-us&it=web&scn=ANON&ids=${id}&wrapodata=false`;
          
          const apiRes = await fetch(apiUrl);
          if (!apiRes.ok) throw new Error(`MSN API Error: ${apiRes.status}`);
          
          const data = await apiRes.json();
          if (!data || data.length === 0) return res.status(404).json({ error: "No data found for ID" });

          const raw = data[0]; 

          // Normalize Data
          const normalized = {
              symbol: raw.symbol || symbol || "Unknown",
              name: raw.displayName || raw.shortName,
              price: raw.price || 0,
              // Fundamental Data
              peRatio: raw.averagePE || raw.peRatio,
              eps: raw.eps,
              roe: raw.returnOnEquity ? raw.returnOnEquity * 100 : 0, 
              roa: raw.returnOnAssets ? raw.returnOnAssets * 100 : 0,
              pbr: raw.priceToBookRatio,
              debtToEquity: raw.debtToEquityRatio,
              marketCap: raw.marketCap,
              // Financial Statements Snapshot
              netIncome: raw.netIncome,
              revenue: raw.revenue,
              totalAssets: raw.assets,
              totalLiabilities: raw.liabilities,
              // Meta
              currency: raw.currency,
              exchange: raw.exchangeCode,
              source: "MSN_SECRET_API"
          };

          return res.status(200).json(normalized);

      } catch (e: any) {
          return res.status(500).json({ error: e.message });
      }
  }
  
  // --- STANDARD MODE: FUNDAMENTAL DATA FETCH (Existing Logic) ---
  if (!symbols) {
    return res.status(400).json({ error: 'Symbols list is required' });
  }

  const symbolList = String(symbols).split(',');
  const FMP_KEY = process.env.FMP_KEY || 'dMhbH7OaYJKXeCCpCp001RQrq55259p7';
  
  const getVal = (v: any) => {
    if (v === null || v === undefined || v === 'N/A') return null;
    const num = parseFloat(v);
    return isNaN(num) ? null : num;
  };

  try {
    const aggregatedData = new Map();
    symbolList.forEach(sym => aggregatedData.set(sym, { symbol: sym, source: [], isEtf: false }));
    
    // --- 1. FMP BULK QUOTE ---
    try {
        const fmpUrl = `https://financialmodelingprep.com/api/v3/quote/${symbols}?apikey=${FMP_KEY}`;
        const fmpRes = await fetch(fmpUrl);
        if (fmpRes.ok) {
            const data = await fmpRes.json();
            if (Array.isArray(data)) {
                data.forEach((item: any) => {
                    const current = aggregatedData.get(item.symbol) || { symbol: item.symbol, source: [] };
                    if (item.price) current.price = getVal(item.price);
                    if (item.pe) current.peRatio = getVal(item.pe);
                    if (item.eps) current.eps = getVal(item.eps);
                    if (item.marketCap) current.marketCap = getVal(item.marketCap);
                    current.source.push('FMP_Q');
                    aggregatedData.set(item.symbol, current);
                });
            }
        }
    } catch (e) {}

    const finalResults = Array.from(aggregatedData.values()).map((item: any) => ({
            symbol: item.symbol,
            price: item.price || 0,
            peRatio: item.peRatio || 0,
            returnOnEquity: item.returnOnEquity || 0,
            priceToBook: item.priceToBook || 0,
            marketCap: item.marketCap || 0,
            debtToEquity: item.debtToEquity || 0,
            isEtf: item.isEtf,
            source: item.source.join('+') || 'None'
    }));
    return res.status(200).json(finalResults);
  } catch (error: any) {
      return res.status(200).json(symbolList.map(s => ({ symbol: s, error: "Failed" }))); 
  }
}
