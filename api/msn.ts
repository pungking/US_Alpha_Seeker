
export default async function handler(req: any, res: any) {
  // "The Hidden Gem" - MSN Money / Bing Finance Proxy v2.5 (Robust)
  
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

  // FORCE US PREFIX: Most failures occur because 'AAPL' is sent instead of 'US:AAPL'
  let targetSymbol = String(symbol).toUpperCase();
  if (!targetSymbol.includes(':')) {
      targetSymbol = `US:${targetSymbol}`;
  }

  const timestamp = new Date().getTime();

  // Endpoints
  const ENDPOINTS: Record<string, string> = {
      // Stage 2: Deep Dive (5-10 years history)
      'financials': `https://services.bingapis.com/contentsvc-finance/v1/en-us/finance/securities/${targetSymbol}/financialstatements?periodType=Annual&${timestamp}`,
      
      // Stage 1: Basic Stats Injection (ROE, PER, PBR, Market Cap)
      'overview': `https://services.bingapis.com/contentsvc-finance/v1/en-us/finance/securities/${targetSymbol}/overview?${timestamp}`,
  };

  const targetUrl = ENDPOINTS[type as string] || ENDPOINTS['overview'];

  try {
      const fetchWithRetry = async (url: string, retries = 2): Promise<any> => {
          try {
              const response = await fetch(url, {
                  headers: {
                      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                      'Accept': 'application/json, text/plain, */*',
                      'Accept-Language': 'en-US,en;q=0.9',
                      'Referer': 'https://www.msn.com/',
                      'Origin': 'https://www.msn.com',
                      'Sec-Fetch-Dest': 'empty',
                      'Sec-Fetch-Mode': 'cors',
                      'Sec-Fetch-Site': 'cross-site'
                  }
              });
              
              if (!response.ok) {
                   // If US: fails, try without prefix as fallback (rare edge case)
                   if (response.status === 404 && url.includes("US:")) {
                       const noPrefixSymbol = targetSymbol.replace("US:", "");
                       const newUrl = url.replace(targetSymbol, noPrefixSymbol);
                       return fetchWithRetry(newUrl, retries - 1);
                   }
                   throw new Error(`MSN ${response.status}`);
              }
              return await response.json();
          } catch (e: any) {
              if (retries > 0) {
                  await new Promise(r => setTimeout(r, 1000)); // Increased cool down
                  return fetchWithRetry(url, retries - 1);
              }
              throw e;
          }
      };

      const data = await fetchWithRetry(targetUrl);
      
      // Normalize Data for Frontend consistency
      if (type === 'overview') {
          // Robust checking for key stats in various potential locations
          const stats = data.keyStats || data.KeyStats || {};
          const quote = data.quote || data.Quote || {};
          const company = data.company || data.Company || {};
          
          if (!quote.last && !stats.peRatio) {
               // If completely empty, treat as error so frontend knows to use fallback
               return res.status(200).json({ error: "Empty Data from MSN", symbol });
          }
          
          const normalized = {
              symbol: symbol, // Return original requested symbol
              name: quote.displayName || company.name || symbol,
              price: quote.last || 0,
              
              // Robust Field Mapping: Check camelCase and PascalCase
              peRatio: stats.peRatio || stats.PeRatio || stats.priceToEarnings || stats.PriceToEarnings || 0,
              returnOnEquity: stats.returnOnEquity || stats.ReturnOnEquity || stats.roe || stats.Roe || 0,
              returnOnAssets: stats.returnOnAssets || stats.ReturnOnAssets || stats.roa || stats.Roa || 0,
              priceToBook: stats.priceToBook || stats.PriceToBook || stats.pbr || stats.Pbr || 0,
              marketCap: stats.marketCap || stats.MarketCap || quote.marketCap || quote.MarketCap || 0,
              debtToEquity: stats.debtToEquity || stats.DebtToEquity || stats.totalDebtToEquity || 0,
              beta: stats.beta || stats.Beta || 1,
              dividendYield: stats.dividendYield || stats.DividendYield || 0,
              profitMargin: stats.profitMargin || stats.ProfitMargin || 0,
              revenueGrowth: stats.revenueGrowth || stats.RevenueGrowth || 0,
              
              // Meta
              sector: company.sector || company.Sector || "Unclassified",
              industry: company.industry || company.Industry || "Unknown"
          };
          return res.status(200).json(normalized);
      }

      res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');
      return res.status(200).json(data);

  } catch (error: any) {
      // Return partial error object to allow frontend flow to continue without crashing
      return res.status(200).json({ error: error.message, symbol: symbol }); 
  }
}
