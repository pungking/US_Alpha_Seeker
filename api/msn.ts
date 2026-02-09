
export default async function handler(req: any, res: any) {
  // "The Fundamentalist" - Precision Ratio Aggregation v10.0
  // Inspired by the user's MSN ID mapping concept, this acts as a 'Surgical Strike' engine.
  // Strategy: 
  // 1. FMP Bulk Quote (Base Layer - Fast)
  // 2. Yahoo Bulk Quote (Broad Layer)
  // 3. Surgical Strike (Precision Layer): If ROE/PBR missing, hit Yahoo quoteSummary (v10) individually.
  
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const { symbols } = req.query;

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
    } catch (e) {
        // FMP Fail is acceptable, proceed to Yahoo
    }

    // --- 2. YAHOO BULK (Rich Layer - ROE/PBR/PE) ---
    try {
        const yahooUrl = `https://query2.finance.yahoo.com/v7/finance/quote?symbols=${symbols}`;
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

    // --- 3. SURGICAL STRIKE: YAHOO QUOTE SUMMARY (Fill Missing Fundamentals) ---
    // Precision targeting for items that still lack ROE/PBR but are NOT ETFs
    const missingFundamentals = Array.from(aggregatedData.values()).filter((item: any) => 
        !item.isEtf && (!item.returnOnEquity || !item.priceToBook || !item.peRatio)
    );

    if (missingFundamentals.length > 0) {
        // Parallel execution for the surgical batch (limit concurrency if needed, but 10 is small)
        await Promise.all(missingFundamentals.map(async (item: any) => {
             try {
                 // The "Surgical Strike" URL - gets deep financial data
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

                         // PE Ratio
                         if (!item.peRatio) {
                             item.peRatio = getYVal(sd?.trailingPE) || getYVal(sd?.forwardPE);
                         }

                         // PBR
                         if (!item.priceToBook) {
                             item.priceToBook = getYVal(ks?.priceToBook) || getYVal(ks?.bookValue) ? (item.price / getYVal(ks?.bookValue)) : null;
                         }

                         // ROE
                         if (!item.returnOnEquity) {
                             const roeRaw = getYVal(fd?.returnOnEquity);
                             item.returnOnEquity = roeRaw ? roeRaw * 100 : null; 
                         }

                         // Debt to Equity
                         if (!item.debtToEquity) {
                             item.debtToEquity = getYVal(fd?.debtToEquity);
                         }
                         
                         item.source.push('SURGICAL_V10');
                         aggregatedData.set(item.symbol, item);
                     }
                 }
             } catch(e) { /* Ignore individual failure */ }
        }));
    }

    // --- 4. DERIVATION & CLEANUP ---
    const finalResults = Array.from(aggregatedData.values()).map((item: any) => {
        // Derive PE if missing: Price / EPS
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
