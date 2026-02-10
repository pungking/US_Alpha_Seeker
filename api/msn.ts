
export default async function handler(req: any, res: any) {
  // "The Fundamentalist" - MSN Secret Protocol v4.0 (Direct Resolution)
  // Direct Symbol-to-ID Mapping via Quote API to ensure 100% accuracy.
  
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const { symbols, mode, id } = req.query;
  const MSN_API_KEY = '0QfOX3Vn51YCzitbLaRkTTBadtWpgTN8NZLW0C1SEM';

  // --- MODE A: RESOLVE IDs (Batch Processing) ---
  if (mode === 'resolve_ids') {
      if (!symbols) return res.status(400).json({ error: 'Symbols required' });
      
      try {
          // Fetch quotes for the batch of symbols
          const targetUrl = `https://assets.msn.com/service/Finance/quotes?apikey=${MSN_API_KEY}&symbols=${symbols}&wrapodata=false`;
          const apiRes = await fetch(targetUrl);
          
          if (!apiRes.ok) throw new Error(`MSN API Error: ${apiRes.status}`);
          
          const data = await apiRes.json();
          const map: Record<string, string> = {};

          if (data && Array.isArray(data)) {
              data.forEach((item: any) => {
                  // instrumentId is the "Secret ID" (e.g., "a1xzim")
                  if (item.symbol && item.instrumentId) {
                      map[item.symbol] = item.instrumentId;
                  }
              });
          }
          
          // Return simple Map: { "AAPL": "a1xzim", "TSLA": "afu4h7" }
          return res.status(200).json(map);
      } catch (e: any) {
          console.error("MSN Resolve Error:", e.message);
          return res.status(500).json({ error: e.message });
      }
  }

  // --- MODE B: DEEP DIVE (Fetch Data by ID) ---
  if (mode === 'get_details' && id) {
      try {
          const apiUrl = `https://assets.msn.com/service/Finance/Equities?apikey=${MSN_API_KEY}&activityId=6989d7cd-b38e-4edc-a952-7633e6cc0169&ocid=finance-utils-peregrine&cm=en-us&it=web&scn=ANON&ids=${id}&wrapodata=false`;
          
          const apiRes = await fetch(apiUrl);
          if (!apiRes.ok) throw new Error(`MSN API Error: ${apiRes.status}`);
          
          const data = await apiRes.json();
          if (!data || data.length === 0) return res.status(404).json({ error: "No data found for ID" });

          const raw = data[0]; 

          // Normalize Data
          const normalized = {
              symbol: raw.symbol,
              name: raw.displayName || raw.shortName,
              price: raw.price || 0,
              // Fundamental Data
              peRatio: raw.averagePE || raw.peRatio,
              eps: raw.eps,
              roe: raw.returnOnEquity ? raw.returnOnEquity * 100 : 0, 
              roa: raw.returnOnAssets ? raw.returnOnAssets * 100 : 0,
              pbr: raw.priceToBookRatio,
              debtToEquity: raw.debtToEquityRatio,
              marketCap: raw.marketCap,
              // Financial Statements Snapshot (if available in summary)
              netIncome: raw.netIncome,
              revenue: raw.revenue,
              totalAssets: raw.assets,
              totalLiabilities: raw.liabilities,
              // Meta
              currency: raw.currency,
              exchange: raw.exchangeCode,
              source: "MSN_SECRET_API"
          };

          return res.status(200).json(normalized);

      } catch (e: any) {
          return res.status(500).json({ error: e.message });
      }
  }
  
  return res.status(400).json({ error: 'Invalid Mode' });
}
