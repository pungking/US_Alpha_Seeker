
export default async function handler(req: any, res: any) {
  // "The Fundamentalist" - MSN Secret Protocol v2.0
  // 1. Map Builder: Parses sitemaps to link Tickers <-> Secret IDs
  // 2. Deep Dive: Uses Secret IDs to fetch rich fundamental data from assets.msn.com
  
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const { mode, symbol, id } = req.query;
  const MSN_API_KEY = '0QfOX3Vn51YCzitbLaRkTTBadtWpgTN8NZLW0C1SEM'; // User provided key

  // --- MODE A: GENERATE ID MAP (Sitemap Parsing) ---
  if (mode === 'generate_map') {
      try {
          // Target the specific sitemap provided by user
          // Note: This sitemap often contains links to other sitemaps or direct links. 
          // We will try to parse a few known equity sitemaps derived from the index structure.
          const targetMaps = [
              "https://www.msn.com/staticsb/statics/latest/0/finance/sitemaps/stockdetails-en-us-sitemap.xml",
              // Fallbacks/Alternatives often found in the index
              "https://www.msn.com/staticsb/statics/latest/0/finance/sitemaps/sitemap-finance-equities-0.xml",
              "https://www.msn.com/staticsb/statics/latest/0/finance/sitemaps/sitemap-finance-equities-1.xml"
          ];
          
          const idMap: Record<string, string> = {};
          let totalFound = 0;

          // Parallel Fetch
          await Promise.all(targetMaps.map(async (url) => {
              try {
                  const subRes = await fetch(url);
                  if(!subRes.ok) return;
                  const subXml = await subRes.text();
                  
                  // Regex to capture: .../stockdetails/(exchange)-(ticker)/fi-(id)
                  // Covers: us-nas-aapl, nas-tsla, nys-f, etc.
                  // Pattern matches: /stockdetails/([a-z]+-)?([a-z0-9]+)-([a-z0-9.]+)/fi-([a-z0-9]+)
                  // Simplified for robustness: Look for 'fi-' followed by ID after a ticker-like slug
                  
                  // 1. Try strict pattern (Exchange-Ticker)
                  // ex: .../stockdetails/nas-aapl/fi-a1mou2
                  const strictRegex = /\/stockdetails\/(?:[a-z]{2,3}-)?([a-z]{3})-([a-z0-9.]+)\/fi-([a-z0-9]+)/gi;
                  
                  let m;
                  while ((m = strictRegex.exec(subXml)) !== null) {
                      const exchange = m[1].toUpperCase();
                      const ticker = m[2].toUpperCase();
                      const secretId = m[3];
                      
                      // Filter for US Exchanges mostly
                      if (['NAS', 'NYS', 'AMX'].includes(exchange) && ticker.length < 10) {
                          idMap[ticker] = secretId;
                          totalFound++;
                      }
                  }

              } catch (e) {
                  console.warn(`Failed to parse map: ${url}`);
              }
          }));

          return res.status(200).json({ 
              status: 'success', 
              count: totalFound, 
              map: idMap,
              message: `Successfully mapped ${totalFound} US tickers.`
          });

      } catch (e: any) {
          return res.status(500).json({ error: e.message });
      }
  }

  // --- MODE B: DEEP DIVE (Fetch Data by ID) ---
  if (mode === 'get_details' && id) {
      try {
          // The Secret API Endpoint
          const apiUrl = `https://assets.msn.com/service/Finance/Equities?apikey=${MSN_API_KEY}&activityId=6989d7cd-b38e-4edc-a952-7633e6cc0169&ocid=finance-utils-peregrine&cm=en-us&it=web&scn=ANON&ids=${id}&wrapodata=false`;
          
          const apiRes = await fetch(apiUrl);
          if (!apiRes.ok) throw new Error(`MSN API Error: ${apiRes.status}`);
          
          const data = await apiRes.json();
          if (!data || data.length === 0) return res.status(404).json({ error: "No data found for ID" });

          const raw = data[0]; // Assuming array response

          // Normalize Data
          const normalized = {
              symbol: raw.symbol || symbol || "Unknown",
              name: raw.displayName || raw.shortName,
              price: raw.price || 0,
              // Fundamental Data
              peRatio: raw.averagePE || raw.peRatio,
              eps: raw.eps,
              roe: raw.returnOnEquity ? raw.returnOnEquity * 100 : 0, // Convert to %
              roa: raw.returnOnAssets ? raw.returnOnAssets * 100 : 0,
              pbr: raw.priceToBookRatio,
              debtToEquity: raw.debtToEquityRatio,
              marketCap: raw.marketCap,
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

  return res.status(400).json({ error: 'Invalid Mode. Use generate_map or get_details.' });
}
