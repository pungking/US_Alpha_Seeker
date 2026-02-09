
export default async function handler(req: any, res: any) {
  // "The Hidden Gem" - MSN Money / Bing Finance Proxy v3.0 (Dual Mode)
  // Handles both basic injection (Stage 1) and deep dive (Stage 2)
  
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

  // FORCE US PREFIX: MSN requires "US:AAPL" format
  let targetSymbol = String(symbol).toUpperCase();
  if (!targetSymbol.includes(':') && !targetSymbol.startsWith('^')) {
      targetSymbol = `US:${targetSymbol}`;
  }

  const timestamp = new Date().getTime();

  // URL Routing based on requested type
  // Note: We use services.bingapis.com which accepts "US:SYMBOL" directly, 
  // bypassing the need to lookup the obscure "a1mou2" internal IDs required by assets.msn.com
  const ENDPOINTS: Record<string, string> = {
      // Stage 2: Deep Financials (Income, Balance Sheet, Cash Flow)
      'financials': `https://services.bingapis.com/contentsvc-finance/v1/en-us/finance/securities/${targetSymbol}/financialstatements?periodType=Annual&${timestamp}`,
      
      // Stage 1: Basic Stats (ROE, PER, PBR, Market Cap, Beta)
      'overview': `https://services.bingapis.com/contentsvc-finance/v1/en-us/finance/securities/${targetSymbol}/overview?${timestamp}`,
  };

  const targetUrl = ENDPOINTS[type as string] || ENDPOINTS['overview'];

  try {
      const fetchWithRetry = async (url: string, retries = 1): Promise<any> => {
          try {
              const response = await fetch(url, {
                  headers: {
                      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                      'Accept': 'application/json, text/plain, */*',
                      'Origin': 'https://www.msn.com',
                      'Referer': 'https://www.msn.com/',
                      'Sec-Fetch-Dest': 'empty',
                      'Sec-Fetch-Mode': 'cors',
                      'Sec-Fetch-Site': 'cross-site'
                  }
              });
              
              if (!response.ok) {
                   // Retry logic for rare 404s on valid tickers (sometimes omitting prefix helps)
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
                  await new Promise(r => setTimeout(r, 800));
                  return fetchWithRetry(url, retries - 1);
              }
              throw e;
          }
      };

      const data = await fetchWithRetry(targetUrl);
      
      // STAGE 1 NORMALIZATION: Return clean flat object for PreliminaryFilter
      if (type === 'overview') {
          const stats = data.keyStats || data.KeyStats || {};
          const quote = data.quote || data.Quote || {};
          const company = data.company || data.Company || {};
          
          // Helper to safely get number
          const getVal = (v: any) => (typeof v === 'number' ? v : 0);

          const normalized = {
              symbol: symbol,
              name: quote.displayName || company.name || symbol,
              price: quote.last || 0,
              
              // Key Fundamentals
              peRatio: getVal(stats.peRatio || stats.PeRatio || stats.priceToEarnings),
              returnOnEquity: getVal(stats.returnOnEquity || stats.ReturnOnEquity || stats.roe),
              returnOnAssets: getVal(stats.returnOnAssets || stats.ReturnOnAssets || stats.roa),
              priceToBook: getVal(stats.priceToBook || stats.PriceToBook || stats.pbr),
              marketCap: getVal(stats.marketCap || stats.MarketCap || quote.marketCap),
              debtToEquity: getVal(stats.debtToEquity || stats.DebtToEquity),
              profitMargin: getVal(stats.profitMargin || stats.ProfitMargin),
              beta: getVal(stats.beta || stats.Beta || 1),
              
              // Meta
              sector: company.sector || company.Sector || "Unclassified",
              industry: company.industry || company.Industry || "Unknown"
          };
          
          // Return Normalized Data for Stage 1
          return res.status(200).json(normalized);
      }

      // STAGE 2: Return Raw Data for Deep Analysis (DeepQualityFilter will parse)
      res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');
      return res.status(200).json(data);

  } catch (error: any) {
      // Graceful error for frontend to handle
      return res.status(200).json({ error: error.message, symbol: symbol }); 
  }
}
