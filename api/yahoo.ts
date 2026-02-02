
export default async function handler(req: any, res: any) {
  // Yahoo Finance Proxy - Enhanced for Resilience (v2.8)
  
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
    // Switch to query2 which is often less throttled for programmatic access
    const url = `https://query2.finance.yahoo.com/v7/finance/quote?symbols=${symbols}`;
    
    // Rotating User Agents can help, but a standard modern Chrome UA is usually best
    const response = await fetch(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive',
            'Sec-Fetch-Dest': 'empty',
            'Sec-Fetch-Mode': 'cors',
            'Sec-Fetch-Site': 'same-site',
            'Origin': 'https://finance.yahoo.com',
            'Referer': 'https://finance.yahoo.com/'
        }
    });

    if (!response.ok) {
        // If query2 fails, try query1 as fallback internally? 
        // For now, just return error to let the frontend handle retry/throttle.
        const text = await response.text();
        console.error(`Yahoo Upstream Error: ${response.status}`, text);
        return res.status(response.status).json({ error: 'Upstream Error', details: text });
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
        // Fundamentals
        trailingPE: item.trailingPE,
        forwardPE: item.forwardPE,
        priceToBook: item.priceToBook,
        returnOnEquity: item.returnOnEquity,
        debtToEquity: item.debtToEquity,
        marketCap: item.marketCap,
        // Critical for Stage 2
        sector: item.sector || item.category, 
        industry: item.industry
    }));

    return res.status(200).json(mappedData);

  } catch (error: any) {
    console.error('Yahoo Proxy Server Error:', error);
    return res.status(500).json({ error: 'Internal Server Error', details: error.message });
  }
}
