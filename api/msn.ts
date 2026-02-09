
export default async function handler(req: any, res: any) {
  // "The Hidden Gem" - MSN Money / Bing Finance Proxy v2.0
  // Supports:
  // 1. 'overview': Fast, single snapshot for Stage 1 enrichment (ROE, PE, PBR).
  // 2. 'financials': Deep historical data for Stage 2 audit (Income/Balance/Cashflow).
  
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

  const targetSymbol = symbol.toUpperCase();
  const timestamp = new Date().getTime();

  // Endpoints
  const ENDPOINTS: Record<string, string> = {
      // Stage 2: Deep Dive (5-10 years history)
      'financials': `https://services.bingapis.com/contentsvc-finance/v1/en-us/finance/securities/${targetSymbol}/financialstatements?periodType=Annual&${timestamp}`,
      
      // Stage 1: Basic Stats Injection (ROE, PER, PBR, Market Cap)
      'overview': `https://services.bingapis.com/contentsvc-finance/v1/en-us/finance/securities/${targetSymbol}/overview?${timestamp}`,
      
      // Meta
      'profile': `https://services.bingapis.com/contentsvc-finance/v1/en-us/finance/securities/${targetSymbol}/profile?${timestamp}`
  };

  const targetUrl = ENDPOINTS[type as string] || ENDPOINTS['overview'];

  try {
      const fetchWithRetry = async (url: string, retries = 1): Promise<any> => {
          const response = await fetch(url, {
              headers: {
                  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                  'Accept': 'application/json, text/plain, */*',
                  'Referer': 'https://www.msn.com/',
                  'Origin': 'https://www.msn.com'
              }
          });
          if (!response.ok) {
              if (retries > 0) {
                  // Try with "US:" prefix if standard failed
                  const altUrl = url.includes(`securities/${targetSymbol}`) 
                      ? url.replace(`securities/${targetSymbol}`, `securities/US:${targetSymbol}`) 
                      : url;
                  return fetchWithRetry(altUrl, retries - 1);
              }
              throw new Error(`MSN ${response.status}`);
          }
          return response.json();
      };

      const data = await fetchWithRetry(targetUrl);
      
      // Normalize Data for Frontend consistency
      if (type === 'overview') {
          // Extract Key Stats into a cleaner format
          const stats = data.keyStats || {};
          const quote = data.quote || {};
          
          const normalized = {
              symbol: targetSymbol,
              price: quote.last || 0,
              peRatio: stats.peRatio || 0,
              returnOnEquity: stats.returnOnEquity || 0,
              returnOnAssets: stats.returnOnAssets || 0,
              priceToBook: stats.priceToBook || 0,
              marketCap: stats.marketCap || quote.marketCap || 0,
              debtToEquity: stats.debtToEquity || 0,
              beta: stats.beta || 1,
              dividendYield: stats.dividendYield || 0,
              profitMargin: stats.profitMargin || 0,
              revenueGrowth: stats.revenueGrowth || 0
          };
          return res.status(200).json(normalized);
      }

      res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');
      return res.status(200).json(data);

  } catch (error: any) {
      // console.error(`MSN Proxy Fail [${symbol}]:`, error.message);
      // Return empty object on fail so frontend can continue with partial data
      return res.status(200).json({ error: error.message, symbol }); 
  }
}
