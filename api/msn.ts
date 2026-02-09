
export default async function handler(req: any, res: any) {
  // "The Bulk Aggregator" - High-Velocity Batch Injection v6.0
  // Strategy: 
  // 1. Accept comma-separated symbols (e.g. "AAPL,TSLA,NVDA").
  // 2. Hit FMP Bulk Quote API (Primary - Extremely Fast).
  // 3. Hit Yahoo Quote API (Secondary - Good for basic price/PE).
  // 4. Merge and normalize data.

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
  const FMP_KEY = process.env.FMP_KEY || 'dMhbH7OaYJKXeCCpCp001RQrq55259p7'; // Fallback to provided key
  
  // Helper to safely parse numbers
  const getVal = (v: any) => {
    if (v === null || v === undefined) return 0;
    const num = parseFloat(v);
    return isNaN(num) ? 0 : num;
  };

  try {
    // --- STRATEGY 1: FMP BULK QUOTE (Primary) ---
    // This is the "Nuclear Option". It gets everything in one shot if the key is valid.
    let fmpMap = new Map();
    try {
        const fmpUrl = `https://financialmodelingprep.com/api/v3/quote/${symbols}?apikey=${FMP_KEY}`;
        const fmpRes = await fetch(fmpUrl);
        if (fmpRes.ok) {
            const fmpData = await fmpRes.json();
            if (Array.isArray(fmpData)) {
                fmpData.forEach((item: any) => {
                    fmpMap.set(item.symbol, {
                        price: getVal(item.price),
                        pe: getVal(item.pe),
                        eps: getVal(item.eps),
                        marketCap: getVal(item.marketCap),
                        // FMP 'quote' endpoint doesn't give ROE directly, implies it from EPS/Book or requires profile.
                        // We will rely on price/pe/eps here.
                        change: getVal(item.changesPercentage),
                        source: 'FMP_Bulk'
                    });
                });
            }
        }
    } catch (e) {
        console.warn("FMP Bulk Failed:", e);
    }

    // --- STRATEGY 2: YAHOO FINANCE BULK (Secondary/Enrichment) ---
    // Excellent for ROE, PBR, and detailed stats
    let yahooMap = new Map();
    try {
        // Yahoo supports bulk symbols like ?symbols=AAPL,TSLA
        const yahooUrl = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${symbols}`;
        const yahooRes = await fetch(yahooUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });
        
        if (yahooRes.ok) {
            const yahooJson = await yahooRes.json();
            const results = yahooJson.quoteResponse?.result || [];
            results.forEach((item: any) => {
                yahooMap.set(item.symbol, {
                    price: getVal(item.regularMarketPrice),
                    pe: getVal(item.trailingPE) || getVal(item.forwardPE),
                    pbr: getVal(item.priceToBook),
                    roe: getVal(item.returnOnEquity) * 100, // Convert to %
                    marketCap: getVal(item.marketCap),
                    debtToEquity: getVal(item.debtToEquity),
                    eps: getVal(item.epsTrailingTwelveMonths),
                    source: 'Yahoo_Bulk'
                });
            });
        }
    } catch (e) {
        console.warn("Yahoo Bulk Failed:", e);
    }

    // --- MERGE STRATEGY ---
    const results = symbolList.map((sym: string) => {
        const fmp = fmpMap.get(sym);
        const yho = yahooMap.get(sym);
        const yhoUS = yahooMap.get("US:" + sym) || yahooMap.get(sym.replace("US:", "")); // Try variations

        // Prefer Yahoo for Ratios (ROE/PBR), FMP for Price/Vol real-time
        const base = yho || yhoUS || fmp || {};
        
        return {
            symbol: sym,
            price: base.price || 0,
            peRatio: base.pe || 0,
            returnOnEquity: base.roe || 0,
            priceToBook: base.pbr || 0,
            marketCap: base.marketCap || 0,
            debtToEquity: base.debtToEquity || 0,
            source: base.source || 'None'
        };
    });

    return res.status(200).json(results);

  } catch (error: any) {
      console.error("Bulk Aggregator Error:", error);
      // Return partial empty results to keep pipeline moving
      const emptyResults = symbolList.map((s: string) => ({ symbol: s, error: "Failed" }));
      return res.status(200).json(emptyResults);
  }
}
