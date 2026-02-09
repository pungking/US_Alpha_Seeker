
export default async function handler(req: any, res: any) {
  // "The Fundamentalist" - Precision Ratio Aggregation v11.0 (MSN ID Hunter)
  // 1. Bulk Quote: FMP/Yahoo (Speed)
  // 2. Surgical Strike: Yahoo v10 (Deep Data)
  // 3. ID Hunter: Parse MSN Sitemap to map Ticker -> SecretID (a1mou2)
  // 4. Deep Financials: Fetch 5-year raw statements via SecretID
  
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const { type, symbol, symbols, msnId } = req.query;
  const FMP_KEY = process.env.FMP_KEY || 'dMhbH7OaYJKXeCCpCp001RQrq55259p7';
  
  // --- [NEW] MODE A: SITEMAP ID HUNTER ---
  // Parses MSN XML sitemaps to find the secret ID for a ticker
  if (type === 'sitemap_discovery') {
      try {
          // Main Index
          const indexUrl = "https://www.msn.com/staticsb/statics/latest/0/finance/sitemaps/sitemap-index.xml";
          const indexRes = await fetch(indexUrl);
          if (!indexRes.ok) throw new Error("MSN Sitemap Index Unreachable");
          const indexXml = await indexRes.text();

          // Find equity sitemaps (0, 1, 2 typically contain US stocks)
          const subMapRegex = /<loc>(https:\/\/[\w.-]+\/finance\/sitemaps\/sitemap-finance-equities-\d+\.xml)<\/loc>/g;
          const subMaps = [];
          let match;
          while ((match = subMapRegex.exec(indexXml)) !== null) {
              subMaps.push(match[1]);
          }

          // We only parse the first 3 equity maps to save time (covers most major US stocks)
          const targetMaps = subMaps.slice(0, 3); 
          const idMap: Record<string, string> = {};
          
          // Parallel fetch of sub-sitemaps
          await Promise.all(targetMaps.map(async (url) => {
              try {
                  const subRes = await fetch(url);
                  const subXml = await subRes.text();
                  // Regex to extract: /stockdetails/financials/EXCHANGE-TICKER/fi-ID
                  // Targets: NAS, NYS, AMX, OTC
                  const urlRegex = /\/stockdetails\/financials\/(?:NAS|NYS|AMX|OTC)-([A-Z0-9.]+)\/fi-([a-z0-9]+)/g;
                  let m;
                  while ((m = urlRegex.exec(subXml)) !== null) {
                      const ticker = m[1];
                      const id = m[2];
                      if (ticker && id) {
                          idMap[ticker] = id;
                      }
                  }
              } catch (e) {
                  console.warn(`Failed to parse sub-sitemap: ${url}`, e);
              }
          }));

          return res.status(200).json({ count: Object.keys(idMap).length, mapping: idMap });

      } catch (e: any) {
          console.error("MSN Sitemap Error:", e);
          return res.status(500).json({ error: e.message });
      }
  }

  // --- [NEW] MODE B: DEEP FINANCIALS (via Secret ID) ---
  if (type === 'financials' && msnId) {
      try {
          // Direct call to MSN internal API using the Secret ID
          const apiUrl = `https://assets.msn.com/service/Finance/Equities/financialstatements?apikey=0QfOX3Vn51YCzitbLaRkTTBadtWpgTN8NZLW0C1SEM&activityId=6989d7cd-b38e-4edc-a952-7633e6cc0169&ocid=finance-utils-peregrine&cm=en-us&it=web&scn=ANON&ids=${msnId}&wrapodata=false`;
          
          const response = await fetch(apiUrl);
          if (!response.ok) throw new Error(`MSN API Error: ${response.status}`);
          const data = await response.json();
          
          // Return raw data (Frontend will parse)
          return res.status(200).json(data);
      } catch (e: any) {
          return res.status(500).json({ error: e.message });
      }
  }

  // --- EXISTING MODE: BULK QUOTE ---
  if (!symbols && !symbol) {
    return res.status(400).json({ error: 'Symbols list is required' });
  }

  const symbolList = String(symbols || symbol).split(',');
  
  const getVal = (v: any) => {
    if (v === null || v === undefined || v === 'N/A') return null;
    const num = parseFloat(v);
    return isNaN(num) ? null : num;
  };

  const getYVal = (obj: any) => {
      if (obj === null || obj === undefined) return null;
      if (typeof obj === 'object' && 'raw' in obj) return obj.raw;
      return getVal(obj);
  };

  const getRandomUA = () => {
    const uas = [
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36'
    ];
    return uas[Math.floor(Math.random() * uas.length)];
  };

  try {
    const aggregatedData = new Map();

    // 0. Initialize Map
    symbolList.forEach(sym => aggregatedData.set(sym, { symbol: sym, source: [], isEtf: false }));

    // --- 1. FMP BULK QUOTE (Base Layer - Fast) ---
    try {
        const fmpUrl = `https://financialmodelingprep.com/api/v3/quote/${symbolList.join(',')}?apikey=${FMP_KEY}`;
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
    } catch (e) {
        // FMP Fail is acceptable, proceed to Yahoo
    }

    // --- 2. YAHOO BULK (Rich Layer) ---
    try {
        const yahooUrl = `https://query2.finance.yahoo.com/v7/finance/quote?symbols=${symbolList.join(',')}`;
        const yahooRes = await fetch(yahooUrl, {
            headers: { 'User-Agent': getRandomUA() }
        });
        
        if (yahooRes.ok) {
            const json = await yahooRes.json();
            const results = json.quoteResponse?.result || [];
            results.forEach((item: any) => {
                const sym = item.symbol;
                const current = aggregatedData.get(sym) || { symbol: sym, source: [] };

                if (!current.price) current.price = getVal(item.regularMarketPrice);
                
                // PE
                const yPe = getVal(item.trailingPE) || getVal(item.forwardPE);
                if (yPe) current.peRatio = yPe;
                
                // ROE
                if (!current.returnOnEquity) current.returnOnEquity = item.financialCurrency === 'USD' ? getVal(item.returnOnEquity) : null; 
                
                // PBR
                if (!current.priceToBook) current.priceToBook = getVal(item.priceToBook);
                
                // Market Cap
                if (!current.marketCap) current.marketCap = getVal(item.marketCap);
                
                // EPS
                if (!current.eps) current.eps = getVal(item.epsTrailingTwelveMonths);
                
                // Type Check (ETF vs Equity)
                if (item.quoteType === 'ETF' || item.quoteType === 'MUTUALFUND') {
                    current.isEtf = true;
                }
                
                // Fix ROE units (Yahoo gives 0.15 for 15%)
                if (current.returnOnEquity && current.returnOnEquity < 1) current.returnOnEquity *= 100;

                current.source.push('YHO');
                aggregatedData.set(sym, current);
            });
        }
    } catch (e) {
        // Yahoo Bulk Fail
    }

    // --- 3. SURGICAL STRIKE: YAHOO QUOTE SUMMARY ---
    // If PE, ROE, or PBR are still missing, use the heavy Yahoo endpoint.
    const missingFundamentals = Array.from(aggregatedData.values()).filter((item: any) => 
        !item.isEtf && (!item.returnOnEquity || !item.priceToBook || !item.peRatio)
    );

    if (missingFundamentals.length > 0) {
        await Promise.all(missingFundamentals.map(async (item: any) => {
             try {
                 const modules = "financialData,defaultKeyStatistics,summaryDetail";
                 const v10Url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${item.symbol}?modules=${modules}`;
                 
                 const v10Res = await fetch(v10Url, { headers: { 'User-Agent': getRandomUA() } });
                 if (v10Res.ok) {
                     const v10Json = await v10Res.json();
                     const result = v10Json.quoteSummary?.result?.[0];
                     
                     if (result) {
                         const fd = result.financialData;
                         const ks = result.defaultKeyStatistics;
                         const sd = result.summaryDetail;

                         if (!item.peRatio) item.peRatio = getYVal(sd?.trailingPE) || getYVal(sd?.forwardPE);
                         if (!item.priceToBook) item.priceToBook = getYVal(ks?.priceToBook) || getYVal(ks?.bookValue) ? (item.price / getYVal(ks?.bookValue)) : null;
                         if (!item.returnOnEquity) {
                             const roeRaw = getYVal(fd?.returnOnEquity);
                             item.returnOnEquity = roeRaw ? roeRaw * 100 : null; 
                         }
                         if (!item.debtToEquity) item.debtToEquity = getYVal(fd?.debtToEquity);
                         
                         item.source.push('SURGICAL_V10');
                         aggregatedData.set(item.symbol, item);
                     }
                 }
             } catch(e) { /* Ignore individual failure */ }
        }));
    }

    // --- 4. DERIVATION & CLEANUP ---
    const finalResults = Array.from(aggregatedData.values()).map((item: any) => {
        if (!item.peRatio && item.price && item.eps && item.eps > 0) {
            item.peRatio = parseFloat((item.price / item.eps).toFixed(2));
            item.source.push('CALC_PE');
        }
        
        return {
            symbol: item.symbol,
            price: item.price || 0,
            peRatio: item.peRatio || 0,
            returnOnEquity: item.returnOnEquity || 0,
            priceToBook: item.priceToBook || 0,
            marketCap: item.marketCap || 0,
            debtToEquity: item.debtToEquity || 0,
            isEtf: item.isEtf,
            source: item.source.join('+') || 'None'
        };
    });

    return res.status(200).json(finalResults);

  } catch (error: any) {
      console.error("Alpha Sieve Error:", error);
      return res.status(200).json(symbolList.map(s => ({ symbol: s, error: "Failed" }))); 
  }
}
