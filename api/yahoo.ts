
import { captureApiError, withSentryApi } from "./_sentry.js";

const handler = async (req: any, res: any) => {
  // Yahoo Finance Proxy v5.0: "Polymer" Strategy
  // Features: Rotational User-Agents, Dual Endpoint Fallback (v10 -> v7)
  
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

  // [STEALTH MODE] Advanced User-Agent Rotation Pool
  const userAgents = [
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36 Edg/119.0.0.0',
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0'
  ];
  
  const getRandomAgent = () => userAgents[Math.floor(Math.random() * userAgents.length)];

  // Helper to fetch with retry and rotation
  const fetchWithRotation = async (url: string, retries = 1): Promise<any> => {
      try {
          const response = await fetch(url, {
              headers: {
                  'User-Agent': getRandomAgent(),
                  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                  'Accept-Language': 'en-US,en;q=0.9',
                  'Connection': 'keep-alive',
                  'Upgrade-Insecure-Requests': '1',
                  'Sec-Fetch-Dest': 'document',
                  'Sec-Fetch-Mode': 'navigate',
                  'Sec-Fetch-Site': 'none',
                  'Sec-Fetch-User': '?1',
                  'Cache-Control': 'no-cache',
                  'Pragma': 'no-cache'
              }
          });
          
          if (!response.ok) {
              if (retries > 0 && response.status === 429) {
                   await new Promise(r => setTimeout(r, 1000)); // Cool down
                   return fetchWithRotation(url, retries - 1);
              }
              throw new Error(`HTTP_${response.status}`);
          }
          return response.json();
      } catch (e) {
          throw e;
      }
  };

  // STRATEGY 1: DEEP LEDGER FETCH (v10 quoteSummary) -> Fallback to v7 quote
  if (modules) {
    try {
      const symbol = String(symbols).split(',')[0];
      const urlV10 = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${symbol}?modules=${modules}&formatting=false&corsDomain=finance.yahoo.com`;
      
      try {
          const data = await fetchWithRotation(urlV10);
          const result = data.quoteSummary?.result?.[0] || {};
          if (Object.keys(result).length === 0) throw new Error("Empty V10 Response");
          
          res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');
          return res.status(200).json(result);
      } catch (v10Error) {
          console.warn(`Yahoo v10 failed for ${symbol}, falling back to v7. Error:`, v10Error);
          // FALLBACK to v7 (Summary only)
          const urlV7 = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${symbol}`;
          const dataV7 = await fetchWithRotation(urlV7);
          // Return as array to signal it's a fallback list
          return res.status(200).json(dataV7.quoteResponse?.result || []); 
      }
      
    } catch (error: any) {
      console.error("Yahoo Deep Scan Error:", error);
      captureApiError(error, {
        source: 'yahoo_proxy_deep',
        method: req?.method || 'UNKNOWN',
        symbols: String(symbols || ''),
        modules: String(modules || '')
      });
      return res.status(500).json({ error: error.message });
    }
  }

  // STRATEGY 2: BULK QUOTE FETCH (v7 quote) - Fast, lightweight
  try {
    const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${symbols}`;
    const data = await fetchWithRotation(url);
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
    captureApiError(error, {
      source: 'yahoo_proxy',
      method: req?.method || 'UNKNOWN',
      symbols: String(symbols || '')
    });
    return res.status(500).json({ error: 'Internal Server Error', details: error.message });
  }
};

export default withSentryApi(handler);
