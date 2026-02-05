
export default async function handler(req: any, res: any) {
  // Yahoo Finance Proxy - Enhanced for Resilience (v3.1)
  
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

  const userAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

  // [NEW] Detailed Data Mode for Stage 3 (Real Data Acquisition)
  if (modules) {
    try {
      const symbol = symbols.split(',')[0]; 
      // Switch to query1 which sometimes has better availability than query2
      const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${symbol}?modules=${modules}`;
      
      const response = await fetch(url, {
          headers: {
              'User-Agent': userAgent,
              'Accept': '*/*',
              'Accept-Encoding': 'gzip, deflate, br',
              'Connection': 'keep-alive'
          }
      });

      if (!response.ok) {
          // Return empty object instead of error for individual symbol failures to keep pipeline moving
          return res.status(200).json({});
      }

      const data = await response.json();
      const result = data.quoteSummary?.result?.[0] || {};
      return res.status(200).json(result);
    } catch (error: any) {
      console.error("Yahoo Module Fetch Error:", error);
      return res.status(500).json({ error: error.message });
    }
  }

  // [EXISTING] Bulk Quote Mode (Preserved for Stage 0, 1, 2)
  try {
    const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${symbols}`;
    
    const response = await fetch(url, {
        headers: {
            'User-Agent': userAgent,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Connection': 'keep-alive',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Sec-Fetch-User': '?1',
            'Upgrade-Insecure-Requests': '1'
        }
    });

    if (!response.ok) {
        const text = await response.text();
        console.error(`Yahoo Upstream Error: ${response.status}`);
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
    console.error('Yahoo Proxy Server Error:', error);
    return res.status(500).json({ error: 'Internal Server Error', details: error.message });
  }
}
