
export default async function handler(req: any, res: any) {
  // Yahoo Finance Proxy v4.0: "Deep Drill" Strategy
  // Targets v10 quoteSummary for full ledger acquisition.
  
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const { symbols, modules } = req.query;

  if (!symbols) {
    return res.status(400).json({ error: 'Missing symbols query param' });
  }

  // Random User Agents to prevent blocking
  const userAgents = [
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36',
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36'
  ];
  const userAgent = userAgents[Math.floor(Math.random() * userAgents.length)];

  // STRATEGY 1: DEEP LEDGER FETCH (v10 quoteSummary)
  // This endpoint returns EVERYTHING: Balance Sheet, Cash Flow, Income Statement, Earnings, Statistics.
  if (modules) {
    try {
      const symbol = symbols.split(',')[0]; // quoteSummary only supports one symbol at a time usually
      const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${symbol}?modules=${modules}&formatting=false&corsDomain=finance.yahoo.com`;
      
      const response = await fetch(url, {
          headers: {
              'User-Agent': userAgent,
              'Accept': '*/*',
              'Accept-Encoding': 'gzip, deflate, br',
              'Connection': 'keep-alive',
              'Referer': 'https://finance.yahoo.com',
              'Origin': 'https://finance.yahoo.com'
          }
      });

      if (!response.ok) {
          // Retry logic could go here, but for now we fallback gracefully
           console.warn(`Yahoo v10 failed for ${symbol}: ${response.status}`);
           return res.status(200).json({}); // Return empty to allow fallback logic in frontend
      }

      const data = await response.json();
      const result = data.quoteSummary?.result?.[0] || {};
      
      // Cache for performance
      res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');
      return res.status(200).json(result);
      
    } catch (error: any) {
      console.error("Yahoo Deep Scan Error:", error);
      return res.status(500).json({ error: error.message });
    }
  }

  // STRATEGY 2: BULK QUOTE FETCH (v7 quote) - Fast, lightweight
  // Used for price updates and simple metrics
  try {
    const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${symbols}`;
    
    const response = await fetch(url, {
        headers: {
            'User-Agent': userAgent,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
            'Connection': 'keep-alive'
        }
    });

    if (!response.ok) {
        return res.status(response.status).json({ error: 'Upstream Error' });
    }
    
    const data = await response.json();
    const result = data.quoteResponse?.result || [];

    const mappedData = result.map((item: any) => ({
        symbol: item.symbol,
        price: item.regularMarketPrice,
        change: item.regularMarketChangePercent,
        changeAmount: item.regularMarketChange,
        prevClose: item.regularMarketPreviousClose,
        name: item.shortName || item.longName,
        trailingPE: item.trailingPE,
        forwardPE: item.forwardPE,
        priceToBook: item.priceToBook,
        returnOnEquity: item.returnOnEquity,
        debtToEquity: item.debtToEquity,
        marketCap: item.marketCap,
        sector: item.sector || item.category, 
        industry: item.industry
    }));

    return res.status(200).json(mappedData);

  } catch (error: any) {
    return res.status(500).json({ error: 'Internal Server Error', details: error.message });
  }
}
