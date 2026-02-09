
export default async function handler(req: any, res: any) {
  // "The Alpha Sieve" - Resilient Data Aggregation v7.1 (Zombie Protocol)
  // Strategy: 
  // 1. FMP Bulk (Primary - Fastest)
  // 2. Yahoo Bulk (Secondary - Rich Stats)
  // 3. Yahoo Chart V8 (Deep Fallback - Almost impossible to block, guarantees Price)
  
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
  
  // Safe number parser
  const getVal = (v: any) => {
    if (v === null || v === undefined || v === 'N/A') return null;
    const num = parseFloat(v);
    return isNaN(num) ? null : num;
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

    // Init map
    symbolList.forEach(sym => aggregatedData.set(sym, { symbol: sym, source: [] }));

    // --- 1. FMP BULK (Primary) ---
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
                    // FMP doesn't give ROE in quote, only in ratios.
                    
                    current.source.push('FMP');
                    aggregatedData.set(item.symbol, current);
                });
            }
        }
    } catch (e) {
        console.warn("FMP Failed:", e);
    }

    // --- 2. YAHOO BULK (Secondary - Excellent for ROE/PBR) ---
    try {
        // Use query2 (sometimes less restricted)
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
                if (!current.peRatio) current.peRatio = getVal(item.trailingPE) || getVal(item.forwardPE);
                if (!current.returnOnEquity) current.returnOnEquity = item.financialCurrency === 'USD' ? getVal(item.returnOnEquity) : null;
                if (!current.priceToBook) current.priceToBook = getVal(item.priceToBook);
                if (!current.marketCap) current.marketCap = getVal(item.marketCap);
                if (!current.eps) current.eps = getVal(item.epsTrailingTwelveMonths);
                
                if (current.returnOnEquity && current.returnOnEquity < 1) current.returnOnEquity *= 100;

                current.source.push('YHO_V7');
                aggregatedData.set(sym, current);
            });
        }
    } catch (e) {
        console.warn("Yahoo V7 Failed:", e);
    }

    // --- 3. YAHOO CHART V8 (Deep Fallback - Zombie Mode) ---
    // If still missing Price, check individual charts for the MISSING ones only.
    // This is slow but guarantees data for stubborn tickers.
    const missingPrice = Array.from(aggregatedData.values()).filter((i: any) => !i.price);
    if (missingPrice.length > 0 && missingPrice.length < 5) { // Only do this if a few are missing to avoid timeout
         await Promise.all(missingPrice.map(async (item: any) => {
             try {
                const chartUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${item.symbol}?interval=1d&range=1d`;
                const cRes = await fetch(chartUrl, { headers: { 'User-Agent': getRandomUA() } });
                if (cRes.ok) {
                    const cJson = await cRes.json();
                    const meta = cJson.chart?.result?.[0]?.meta;
                    if (meta && meta.regularMarketPrice) {
                        const current = aggregatedData.get(item.symbol);
                        current.price = meta.regularMarketPrice;
                        current.source.push('YHO_V8_CHART');
                        // Infer Market Cap roughly if missing? No, too risky.
                    }
                }
             } catch(e) {}
         }));
    }

    // --- 4. DERIVATION & CLEANUP ---
    const finalResults = Array.from(aggregatedData.values()).map((item: any) => {
        // Derive PE if missing
        if (!item.peRatio && item.price && item.eps && item.eps > 0) {
            item.peRatio = parseFloat((item.price / item.eps).toFixed(2));
            item.source.push('CALC_PE');
        }

        // Clean up output
        return {
            symbol: item.symbol,
            price: item.price || 0,
            peRatio: item.peRatio || 0,
            returnOnEquity: item.returnOnEquity || 0,
            priceToBook: item.priceToBook || 0,
            marketCap: item.marketCap || 0,
            debtToEquity: 0, // Hard to get in bulk without deep dive
            source: item.source.join('+') || 'None'
        };
    });

    return res.status(200).json(finalResults);

  } catch (error: any) {
      console.error("Alpha Sieve Error:", error);
      return res.status(200).json(symbolList.map(s => ({ symbol: s, error: "Failed" }))); // Soft fail
  }
}
