
export default async function handler(req: any, res: any) {
  // "The Peregrine Protocol" - MSN Money Private API Bypass v4.0
  // Strategy:
  // 1. Resolve Ticker -> Internal Instrument ID (e.g. "AAPL" -> "a1mou2") via Search API
  // 2. Query Private Assets API using the 'Peregrine' API Key
  
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

  // MSN uses a specific public-facing API key for their frontend assets
  const PEREGRINE_API_KEY = '0QfOX3Vn51YCzitbLaRkTTBadtWpgTN8NZLW0C1SEM';
  const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

  try {
      // STEP 1: RESOLVE TICKER TO INSTRUMENT ID
      // We strip "US:" prefix for search flexibility
      const searchSymbol = String(symbol).replace("US:", "").replace(":", " ");
      const searchUrl = `https://services.bingapis.com/contentsvc-finance/v1/en-us/finance/search?q=${encodeURIComponent(searchSymbol)}&limit=1`;
      
      const searchRes = await fetch(searchUrl, { headers: { 'User-Agent': UA } });
      if (!searchRes.ok) throw new Error(`ID Resolution Failed: ${searchRes.status}`);
      
      const searchData = await searchRes.json();
      const topMatch = searchData.data?.stocks?.[0] || searchData.data?.etfs?.[0];
      
      if (!topMatch || !topMatch.id) {
          throw new Error(`Instrument ID not found for ${symbol}`);
      }

      const instrumentId = topMatch.id; // e.g., "a1mou2" or "126.1.AAPL.NAS"
      const instrumentType = topMatch.secIdType || topMatch.instrumentType; // e.g., "Stock"

      // STEP 2: QUERY PRIVATE ASSETS API
      // Only Overview uses the new Peregrine endpoint. Financials might need the old one or a different path.
      
      let targetUrl = "";
      
      if (type === 'financials') {
           // For Financials, we use the robust equities endpoint with the resolved ID
           // Note: The user provided url was /Equities/financialstatements. 
           // We use the ID directly.
           targetUrl = `https://assets.msn.com/service/Finance/Equities/financialstatements?apikey=${PEREGRINE_API_KEY}&ids=${instrumentId}&wrapodata=false`;
      } else {
           // For Overview (Stage 1), we use the main Equities endpoint
           targetUrl = `https://assets.msn.com/service/Finance/Equities?apikey=${PEREGRINE_API_KEY}&ids=${instrumentId}&wrapodata=false`;
      }

      const dataRes = await fetch(targetUrl, { 
          headers: { 
              'User-Agent': UA,
              'Origin': 'https://www.msn.com',
              'Referer': 'https://www.msn.com/'
          } 
      });

      if (!dataRes.ok) throw new Error(`Peregrine API Failed: ${dataRes.status}`);
      
      const rawData = await dataRes.json();
      
      // The assets API returns a list, usually we want the first item
      const item = Array.isArray(rawData) ? rawData[0] : rawData;
      if (!item) throw new Error("Empty Data from Peregrine");

      // STAGE 1 NORMALIZATION
      if (type === 'overview') {
          // MSN Assets API structure is slightly different (flatter)
          // Look for 'keyStats', 'financials', 'price', etc. at root level or inside specific blocks
          
          const stats = item.keyStats || {};
          const priceInfo = item.price || {};
          const meta = item.displayName ? item : (item.stock || {});
          
          const getVal = (v: any) => (typeof v === 'number' ? v : 0);

          const normalized = {
              symbol: symbol, // Keep original requested symbol
              msnId: instrumentId,
              name: meta.displayName || meta.shortName || symbol,
              price: getVal(priceInfo.last || item.last),
              
              // Fundamentals (Deep Extraction)
              peRatio: getVal(stats.peRatio || stats.priceToEarnings),
              returnOnEquity: getVal(stats.returnOnEquity || stats.roe),
              returnOnAssets: getVal(stats.returnOnAssets || stats.roa),
              priceToBook: getVal(stats.priceToBook || stats.pbr),
              marketCap: getVal(stats.marketCap || priceInfo.marketCap),
              debtToEquity: getVal(stats.debtToEquity),
              profitMargin: getVal(stats.profitMargin),
              beta: getVal(stats.beta),
              
              // Meta
              sector: item.sectorName || "Unclassified",
              industry: item.industryName || "Unknown"
          };
          
          return res.status(200).json(normalized);
      }

      // STAGE 2: Return Raw Financials
      return res.status(200).json(item);

  } catch (error: any) {
      console.warn(`MSN Proxy Error for ${symbol}:`, error.message);
      return res.status(200).json({ error: error.message, symbol: symbol }); 
  }
}
