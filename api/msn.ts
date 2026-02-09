
export default async function handler(req: any, res: any) {
  // "The Hidden Gem" - MSN Money / Bing Finance Proxy v1.0
  // Strategy: Access undocumented Bing Finance APIs used by MSN Money widgets.
  // No API Key required. High quality data.
  
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const { symbol, type } = req.query;

  if (!symbol) {
    return res.status(400).json({ error: 'Symbol is required' });
  }

  // MSN/Bing often uses slightly different tickers (e.g., 'US:AAPL' or just 'AAPL')
  // We'll try generic first.
  const targetSymbol = symbol.toUpperCase();

  // Endpoints discovered via Network Analysis
  const ENDPOINTS: Record<string, string> = {
      // Detailed Financial Statements (Annual/Quarterly)
      'financials': `https://services.bingapis.com/contentsvc-finance/v1/en-us/finance/securities/${targetSymbol}/financialstatements?periodType=Annual`,
      // Company Profile & Key Stats
      'profile': `https://services.bingapis.com/contentsvc-finance/v1/en-us/finance/securities/${targetSymbol}/profile`,
      // Overview (Price, Change, some fundamentals)
      'overview': `https://services.bingapis.com/contentsvc-finance/v1/en-us/finance/securities/${targetSymbol}/overview`
  };

  const targetUrl = ENDPOINTS[type as string] || ENDPOINTS['overview'];

  try {
      const response = await fetch(targetUrl, {
          headers: {
              // Mimic a standard browser request to avoid blocking
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Accept': 'application/json, text/plain, */*',
              'Referer': 'https://www.msn.com/',
              'Origin': 'https://www.msn.com'
          }
      });

      if (!response.ok) {
          // Sometimes adding 'US:' prefix helps for US stocks if direct fails
          if (type !== 'profile' && !symbol.startsWith('US:')) {
             console.log(`Retrying MSN with US: prefix for ${symbol}`);
             const retryUrl = targetUrl.replace(targetSymbol, `US:${targetSymbol}`);
             const retryRes = await fetch(retryUrl, {
                 headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                 }
             });
             if (retryRes.ok) {
                 const retryData = await retryRes.json();
                 res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');
                 return res.status(200).json(retryData);
             }
          }
          throw new Error(`MSN API Error: ${response.status}`);
      }

      const data = await response.json();
      
      // Cache success for 1 hour
      res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');
      return res.status(200).json(data);

  } catch (error: any) {
      console.error(`MSN Proxy Fail [${symbol}]:`, error.message);
      return res.status(500).json({ error: error.message });
  }
}
