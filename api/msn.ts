
import crypto from 'crypto';

export default async function handler(req: any, res: any) {
  // "The Trinity" - MSN Secret Protocol v7.1 (Static Asset Priority)
  // Strategy:
  // 1. Generate FRESH activityId (UUID v4) for EVERY request to look like a new user session.
  // 2. Prioritize STATIC sitemap assets (less bot protection) over dynamic endpoints.
  // 3. Masquerade headers.
  
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

  // --- Dynamic Identity Generation ---
  const generateActivityId = () => crypto.randomUUID();

  // --- Stealth Headers ---
  const getHeaders = (referer = 'https://www.msn.com/') => {
      const agents = [
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Edge/122.0.0.0 Safari/537.36"
      ];
      return {
          'User-Agent': agents[Math.floor(Math.random() * agents.length)],
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate, br',
          'Referer': referer,
          'Origin': 'https://www.msn.com',
          'Connection': 'keep-alive',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'same-origin',
          'Sec-Fetch-User': '?1',
          'Upgrade-Insecure-Requests': '1'
      };
  };

  const fetchWithBackoff = async (url: string, retries = 2, baseDelay = 800): Promise<Response> => {
      try {
          const response = await fetch(url, { headers: getHeaders() });
          if (!response.ok) {
              if (response.status === 403 || response.status === 429 || response.status >= 500) {
                  throw new Error(`Retryable Error ${response.status}`);
              }
              throw new Error(`Fatal Error ${response.status}`);
          }
          return response;
      } catch (e: any) {
          if (retries > 0) {
              const delay = baseDelay * 1.5 + Math.random() * 200;
              await new Promise(r => setTimeout(r, delay));
              return fetchWithBackoff(url, retries - 1, delay);
          }
          throw e;
      }
  };

  // --- MODE 1: HARVEST IDs from Sitemap ---
  if (mode === 'fetch_sitemap_ids') {
      try {
          // Prioritize the static asset URL as it's less likely to be gated
          const sitemapUrls = [
              'https://www.msn.com/staticsb/statics/latest/0/finance/sitemaps/stockdetails-en-us-sitemap.xml',
              'https://assets.msn.com/en-us/money/stockdetails/stockdetails-en-us-sitemap.xml',
              'https://www.msn.com/en-us/money/stockdetails/stockdetails-en-us-sitemap.xml'
          ];

          let text = "";
          let success = false;

          for (const url of sitemapUrls) {
              try {
                  const response = await fetchWithBackoff(url, 2, 800);
                  text = await response.text();
                  if (text && text.length > 500) {
                      success = true;
                      break; 
                  }
              } catch (e) {
                  console.warn(`Failed to fetch sitemap: ${url}`, e);
              }
          }

          if (!success) {
              return res.status(500).json({ error: "Sitemap Harvest Failed. IP likely blocked." });
          }
          
          const regex = /fi-([a-z0-9]+)/gi;
          const idsSet = new Set<string>();
          let match;
          while ((match = regex.exec(text)) !== null) {
              if(match[1]) idsSet.add(match[1]);
          }

          const idList = Array.from(idsSet);
          
          if (idList.length === 0) {
             return res.status(500).json({ error: "Parsed 0 IDs from Sitemap." });
          }

          return res.status(200).json({ count: idList.length, ids: idList });

      } catch (e: any) {
          console.error("Sitemap Harvest Error:", e);
          return res.status(500).json({ error: e.message });
      }
  }

  // --- MODE 2: RESOLVE BATCH (Dual Endpoint Strategy + Fresh ActivityID) ---
  if (mode === 'resolve_batch_by_ids' && ids) {
      // Generate a FRESH ID for every batch request
      const freshActivityId = generateActivityId();
      
      const endpoints = [
          // Primary: Assets API
          `https://assets.msn.com/service/Finance/Equities?apikey=${MSN_API_KEY}&activityId=${freshActivityId}&ocid=finance-utils-peregrine&cm=en-us&it=web&scn=ANON&ids=${ids}&wrapodata=false`,
          // Secondary: Bing Finance API
          `https://finance.services.appex.bing.com/Market.svc/Equities?apikey=${MSN_API_KEY}&activityId=${freshActivityId}&ocid=finance-utils-peregrine&cm=en-us&it=web&scn=ANON&ids=${ids}&wrapodata=false`
      ];

      for (const apiUrl of endpoints) {
          try {
              const apiRes = await fetchWithBackoff(apiUrl, 1, 300); // Low retry, fail fast to next endpoint
              const data = await apiRes.json();
              
              if (Array.isArray(data) && data.length > 0) {
                  const mapping: any[] = [];
                  data.forEach((item: any) => {
                      if (item.symbol && item.instrumentId) {
                          mapping.push({
                              id: item.instrumentId,
                              symbol: item.symbol,
                              name: item.displayName || item.shortName,
                              type: item.instrumentType,
                              price: item.price || 0,
                              change: item.priceChangePercent || 0,
                              volume: item.volume || 0,
                              currency: item.currency,
                              pe: item.averagePE || item.peRatio || 0,
                              roe: item.returnOnEquity ? item.returnOnEquity * 100 : 0,
                              pbr: item.priceToBookRatio || 0,
                              debtToEquity: item.debtToEquityRatio || 0,
                              marketCap: item.marketCap || 0
                          });
                      }
                  });
                  return res.status(200).json(mapping); // Success!
              }
          } catch (e) {
              console.warn(`Endpoint failed: ${apiUrl.split('?')[0]}`, e);
              // Continue to next endpoint
          }
      }

      // If all failed
      console.error("All batch resolve endpoints failed for IDs:", ids.substring(0, 20) + "...");
      return res.status(200).json([]); // Return empty to prevent crash
  }

  // --- MODE 3: DEEP DIVE (Single Asset + Fresh ActivityID) ---
  if (mode === 'get_details' && id) {
      const freshActivityId = generateActivityId();
      
      // Use the secondary endpoint primarily for single details as it's often faster
      const apiUrl = `https://finance.services.appex.bing.com/Market.svc/Equities?apikey=${MSN_API_KEY}&activityId=${freshActivityId}&ocid=finance-utils-peregrine&cm=en-us&it=web&scn=ANON&ids=${id}&wrapodata=false`;
      
      try {
          const apiRes = await fetchWithBackoff(apiUrl, 2, 300);
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
              source: "MSN_BING_API"
          };

          return res.status(200).json(normalized);

      } catch (e: any) {
          return res.status(500).json({ error: e.message });
      }
  }
  
  return res.status(400).json({ error: 'Invalid Mode' });
}
