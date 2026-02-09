
export default async function handler(req: any, res: any) {
  // "The Fundamentalist" - Precision Ratio Aggregation v8.0
  // Strategy: 
  // 1. FMP Bulk Quote (Price, PE basic)
  // 2. Yahoo Bulk Quote (Rich Data: ROE, PBR, PE)
  // 3. FMP Ratios TTM (Surgical Strike) -> Fetches missing ROE/PBR for survivors
  
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
    symbolList.forEach(sym => aggregatedData.set(sym, { symbol: sym, source: [] }));

    // --- 1. FMP BULK QUOTE (Base Layer) ---
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
        console.warn("FMP Quote Failed:", e);
    }

    // --- 2. YAHOO BULK (Rich Layer - ROE/PBR/PE) ---
    try {
        // Use query2 for better reliability
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
                // Prefer Yahoo PE as it's often TTM adjusted
                const yPe = getVal(item.trailingPE) || getVal(item.forwardPE);
                if (yPe) current.peRatio = yPe;
                
                if (!current.returnOnEquity) current.returnOnEquity = item.financialCurrency === 'USD' ? getVal(item.returnOnEquity) : null; 
                if (!current.priceToBook) current.priceToBook = getVal(item.priceToBook);
                if (!current.marketCap) current.marketCap = getVal(item.marketCap);
                if (!current.eps) current.eps = getVal(item.epsTrailingTwelveMonths);
                
                // Fix ROE units (Yahoo gives 0.15 for 15%)
                if (current.returnOnEquity && current.returnOnEquity < 1) current.returnOnEquity *= 100;

                current.source.push('YHO');
                aggregatedData.set(sym, current);
            });
        }
    } catch (e) {
        console.warn("Yahoo Failed:", e);
    }

    // --- 3. SURGICAL STRIKE: FMP RATIOS (Fill Missing ROE/PBR) ---
    // If we still lack ROE or PBR, fetch FMP Ratios specifically for those tickers.
    const missingFundamentals = Array.from(aggregatedData.values()).filter((item: any) => 
        !item.returnOnEquity || !item.priceToBook || !item.peRatio
    );

    if (missingFundamentals.length > 0) {
        // We limit parallel requests to avoid rate limits, but for small batch size (10) it's fine.
        await Promise.all(missingFundamentals.map(async (item: any) => {
             try {
                 const ratioUrl = `https://financialmodelingprep.com/api/v3/ratios-ttm/${item.symbol}?apikey=${FMP_KEY}`;
                 const rRes = await fetch(ratioUrl);
                 if (rRes.ok) {
                     const rData = await rRes.json();
                     if (Array.isArray(rData) && rData.length > 0) {
                         const ratios = rData[0];
                         // Fill gaps
                         if (!item.peRatio) item.peRatio = getVal(ratios.peRatioTTM);
                         if (!item.returnOnEquity) item.returnOnEquity = getVal(ratios.returnOnEquityTTM) ? getVal(ratios.returnOnEquityTTM)! * 100 : null; // FMP is usually decimal
                         if (item.returnOnEquity && item.returnOnEquity < 1) item.returnOnEquity *= 100;

                         if (!item.priceToBook) item.priceToBook = getVal(ratios.priceToBookRatioTTM);
                         
                         item.source.push('FMP_R');
                         aggregatedData.set(item.symbol, item);
                     }
                 }
             } catch(e) { /* Ignore individual failure */ }
        }));
    }

    // --- 4. DERIVATION & CLEANUP ---
    const finalResults = Array.from(aggregatedData.values()).map((item: any) => {
        // Derive PE if missing
        if (!item.peRatio && item.price && item.eps && item.eps > 0) {
            item.peRatio = parseFloat((item.price / item.eps).toFixed(2));
            item.source.push('CALC');
        }

        return {
            symbol: item.symbol,
            price: item.price || 0,
            peRatio: item.peRatio || 0,
            returnOnEquity: item.returnOnEquity || 0,
            priceToBook: item.priceToBook || 0,
            marketCap: item.marketCap || 0,
            debtToEquity: 0, 
            source: item.source.join('+') || 'None'
        };
    });

    return res.status(200).json(finalResults);

  } catch (error: any) {
      console.error("Alpha Sieve Error:", error);
      return res.status(200).json(symbolList.map(s => ({ symbol: s, error: "Failed" }))); 
  }
}
