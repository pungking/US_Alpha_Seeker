
export default async function handler(req: any, res: any) {
  // Yahoo Finance Proxy - Enhanced Headers for Anti-Bot Bypass
  
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
    return res.status(400).json({ error: 'Missing symbols query param' });
  }

  try {
    const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${symbols}`;
    
    // [FIX] Robust Headers to mimic Chrome on Windows/Mac
    const response = await fetch(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Sec-Fetch-User': '?1',
            'Referer': 'https://finance.yahoo.com/'
        }
    });

    if (!response.ok) {
        const text = await response.text();
        console.error(`Yahoo Upstream Error: ${response.status}`, text);
        return res.status(response.status).json({ error: 'Upstream Error', details: text });
    }
    
    const data = await response.json();
    const result = data.quoteResponse?.result || [];

    // Map expanded fundamentals for Stage 2 & 3
    const mappedData = result.map((item: any) => ({
        symbol: item.symbol,
        price: item.regularMarketPrice,
        change: item.regularMarketChangePercent,
        changeAmount: item.regularMarketChange,
        prevClose: item.regularMarketPreviousClose,
        name: item.shortName || item.longName,
        // Fundamentals
        trailingPE: item.trailingPE,
        forwardPE: item.forwardPE,
        priceToBook: item.priceToBook,
        returnOnEquity: item.returnOnEquity, // Decimal (e.g. 0.15)
        debtToEquity: item.debtToEquity, // Usually a number like 150.4 (percentage)
        marketCap: item.marketCap,
        // Sector & Industry (Critical for Stage 2)
        sector: item.sector || item.category, // Fallback to category if sector missing
        industry: item.industry
    }));

    return res.status(200).json(mappedData);

  } catch (error: any) {
    console.error('Yahoo Proxy Server Error:', error);
    return res.status(500).json({ error: 'Internal Server Error', details: error.message });
  }
}
