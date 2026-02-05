
export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    const response = await fetch('https://scanner.tradingview.com/america/scan', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        },
        body: JSON.stringify({
            filter: [{ left: "type", operation: "in_range", right: ["stock", "dr", "fund"] }],
            options: { lang: "en" },
            symbols: { query: { types: [] }, tickers: [] },
            columns: [
                "name", "close", "volume", "market_cap_basic", "sector", "industry", 
                "price_earnings_ttm", "earnings_per_share_diluted_ttm", "return_on_equity_5_years", 
                "total_debt_to_equity_fq", "price_book_ratio_fq", "change", "description"
            ],
            sort: { sortBy: "volume", sortOrder: "desc" },
            range: [0, 8000] // Fetch high volume tickers
        })
    });

    if (!response.ok) {
        throw new Error(`Upstream TV Error: ${response.status}`);
    }

    const data = await response.json();
    
    // Map TV fields to our MasterTicker schema
    const result = data.data.map((item: any) => ({
        symbol: item.d[0],
        price: item.d[1],
        volume: item.d[2],
        marketCap: item.d[3],
        sector: item.d[4],
        industry: item.d[5],
        pe: item.d[6],
        eps: item.d[7],
        roe: item.d[8],
        debtToEquity: item.d[9],
        pb: item.d[10],
        change: item.d[11],
        name: item.d[12]
    }));

    return res.status(200).json(result);
  } catch (error: any) {
    console.error("TV Proxy Error:", error);
    return res.status(500).json({ error: error.message });
  }
}
