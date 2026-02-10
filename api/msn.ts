
export default async function handler(req: any, res: any) {
  // "The Trinity" - MSN Secret Protocol v5.1
  // Strategy:
  // 1. Scrape ALL "fi-ids" from Sitemap (Source of Truth for Existence).
  // 2. Query Equities API with IDs -> Get Symbol + Market Data (Source of Truth for Identity & Price).
  // 3. Map perfectly or Discover new assets.
  
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const { mode, id, ids } = req.query;
  const MSN_API_KEY = '0QfOX3Vn51YCzitbLaRkTTBadtWpgTN8NZLW0C1SEM';

  // --- MODE 1: HARVEST IDs from Sitemap ---
  if (mode === 'fetch_sitemap_ids') {
      try {
          const sitemapUrl = 'https://www.msn.com/en-us/money/stockdetails/stockdetails-en-us-sitemap.xml';
          const response = await fetch(sitemapUrl);
          if (!response.ok) throw new Error(`Sitemap Fetch Failed: ${response.status}`);
          
          const text = await response.text();
          // Regex to find all "fi-xxxxxx" patterns
          const regex = /fi-([a-z0-9]+)/g;
          const ids = new Set<string>();
          let match;
          
          while ((match = regex.exec(text)) !== null) {
              if(match[1]) ids.add(match[1]);
          }

          const idList = Array.from(ids);
          return res.status(200).json({ count: idList.length, ids: idList });

      } catch (e: any) {
          console.error("Sitemap Harvest Error:", e);
          return res.status(500).json({ error: e.message });
      }
  }

  // --- MODE 2: RESOLVE BATCH (ID -> Symbol + Rich Data) ---
  if (mode === 'resolve_batch_by_ids' && ids) {
      try {
          const apiUrl = `https://assets.msn.com/service/Finance/Equities?apikey=${MSN_API_KEY}&activityId=6989d7cd-b38e-4edc-a952-7633e6cc0169&ocid=finance-utils-peregrine&cm=en-us&it=web&scn=ANON&ids=${ids}&wrapodata=false`;
          
          const apiRes = await fetch(apiUrl);
          if (!apiRes.ok) throw new Error(`MSN API Error: ${apiRes.status}`);
          
          const data = await apiRes.json();
          const mapping: any[] = [];

          if (data && Array.isArray(data)) {
              data.forEach((item: any) => {
                  if (item.symbol && item.instrumentId) {
                      mapping.push({
                          id: item.instrumentId, // Secret ID
                          symbol: item.symbol,   // Ticker
                          name: item.displayName || item.shortName,
                          type: item.instrumentType,
                          // [NEW] Market Data Injection
                          price: item.price || 0,
                          change: item.priceChangePercent || 0,
                          volume: item.volume || 0,
                          currency: item.currency
                      });
                  }
              });
          }
          
          return res.status(200).json(mapping);

      } catch (e: any) {
          console.error("Batch Resolve Error:", e.message);
          return res.status(500).json({ error: e.message });
      }
  }

  // --- MODE 3: DEEP DIVE (Single Asset Details) ---
  if (mode === 'get_details' && id) {
      try {
          const apiUrl = `https://assets.msn.com/service/Finance/Equities?apikey=${MSN_API_KEY}&activityId=6989d7cd-b38e-4edc-a952-7633e6cc0169&ocid=finance-utils-peregrine&cm=en-us&it=web&scn=ANON&ids=${id}&wrapodata=false`;
          
          const apiRes = await fetch(apiUrl);
          if (!apiRes.ok) throw new Error(`MSN API Error: ${apiRes.status}`);
          
          const data = await apiRes.json();
          if (!data || data.length === 0) return res.status(404).json({ error: "No data found for ID" });

          const raw = data[0]; 

          const normalized = {
              symbol: raw.symbol,
              name: raw.displayName || raw.shortName,
              price: raw.price || 0,
              peRatio: raw.averagePE || raw.peRatio,
              eps: raw.eps,
              roe: raw.returnOnEquity ? raw.returnOnEquity * 100 : 0, 
              roa: raw.returnOnAssets ? raw.returnOnAssets * 100 : 0,
              pbr: raw.priceToBookRatio,
              debtToEquity: raw.debtToEquityRatio,
              marketCap: raw.marketCap,
              netIncome: raw.netIncome,
              revenue: raw.revenue,
              totalAssets: raw.assets,
              totalLiabilities: raw.liabilities,
              currency: raw.currency,
              exchange: raw.exchangeCode,
              source: "MSN_TRINITY_API"
          };

          return res.status(200).json(normalized);

      } catch (e: any) {
          return res.status(500).json({ error: e.message });
      }
  }
  
  return res.status(400).json({ error: 'Invalid Mode' });
}
