
export default async function handler(req: any, res: any) {
  // "The Hybrid Harvester" - MSN & Yahoo Dual-Core Injection v5.0
  // Strategy:
  // 1. Try MSN Peregrine with Browser-Like Headers.
  // 2. If blocked/empty, immediately detour to Yahoo Finance v10 (Deep Summary).
  // 3. Normalize output so the frontend doesn't know the difference.
  
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

  // Helper: Rotate User Agents to evade WAF
  const getRandomUA = () => {
      const uas = [
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0'
      ];
      return uas[Math.floor(Math.random() * uas.length)];
  };

  const getVal = (v: any) => (typeof v === 'number' ? v : 0);

  // --- ENGINE 1: YAHOO FINANCE FALLBACK (High Reliability) ---
  const fetchYahooData = async (ticker: string) => {
      try {
          // Removes "US:" prefix if present
          const cleanSymbol = ticker.replace("US:", "");
          const modules = "financialData,defaultKeyStatistics,summaryDetail";
          const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${cleanSymbol}?modules=${modules}`;
          
          const response = await fetch(url, {
              headers: { 'User-Agent': getRandomUA() }
          });
          
          if (!response.ok) return null;
          
          const json = await response.json();
          const result = json.quoteSummary?.result?.[0];
          
          if (!result) return null;

          const stats = result.defaultKeyStatistics || {};
          const fin = result.financialData || {};
          const sum = result.summaryDetail || {};

          return {
              symbol: ticker,
              name: "Yahoo_Fallback", // Name isn't critical for injection, just metrics
              price: getVal(fin.currentPrice?.raw),
              peRatio: getVal(sum.trailingPE?.raw) || getVal(sum.forwardPE?.raw),
              returnOnEquity: getVal(fin.returnOnEquity?.raw) * 100, // Convert to %
              returnOnAssets: getVal(fin.returnOnAssets?.raw) * 100,
              priceToBook: getVal(stats.priceToBook?.raw),
              marketCap: getVal(sum.marketCap?.raw),
              debtToEquity: getVal(fin.debtToEquity?.raw),
              profitMargin: getVal(fin.profitMargins?.raw) * 100,
              beta: getVal(sum.beta?.raw),
              sector: "Unknown", // Yahoo v10 endpoint doesn't always have sector in this module
              industry: "Unknown",
              source: "Yahoo_V10"
          };
      } catch (e) {
          return null;
      }
  };

  // --- ENGINE 2: MSN PEREGRINE (Primary) ---
  try {
      const searchSymbol = String(symbol).replace("US:", "").replace(":", " ");
      
      // 1. ID Resolution
      const searchUrl = `https://services.bingapis.com/contentsvc-finance/v1/en-us/finance/search?q=${encodeURIComponent(searchSymbol)}&limit=1`;
      const searchRes = await fetch(searchUrl, { 
          headers: { 'User-Agent': getRandomUA() } 
      });
      
      let msnData = null;

      if (searchRes.ok) {
          const searchData = await searchRes.json();
          const topMatch = searchData.data?.stocks?.[0] || searchData.data?.etfs?.[0];

          if (topMatch && topMatch.id) {
              const instrumentId = topMatch.id;
              const PEREGRINE_API_KEY = '0QfOX3Vn51YCzitbLaRkTTBadtWpgTN8NZLW0C1SEM';
              
              let targetUrl = "";
              if (type === 'financials') {
                  targetUrl = `https://assets.msn.com/service/Finance/Equities/financialstatements?apikey=${PEREGRINE_API_KEY}&ids=${instrumentId}&wrapodata=false`;
              } else {
                  targetUrl = `https://assets.msn.com/service/Finance/Equities?apikey=${PEREGRINE_API_KEY}&ids=${instrumentId}&wrapodata=false`;
              }

              const dataRes = await fetch(targetUrl, { 
                  headers: { 
                      'User-Agent': getRandomUA(),
                      'Origin': 'https://www.msn.com',
                      'Referer': 'https://www.msn.com/',
                      'Sec-Fetch-Dest': 'empty',
                      'Sec-Fetch-Mode': 'cors',
                      'Sec-Fetch-Site': 'same-site'
                  } 
              });

              if (dataRes.ok) {
                  const rawData = await dataRes.json();
                  const item = Array.isArray(rawData) ? rawData[0] : rawData;
                  if (item) {
                      if (type === 'financials') {
                          return res.status(200).json(item); // Direct return for Stage 2
                      }
                      
                      const stats = item.keyStats || {};
                      const priceInfo = item.price || {};
                      const meta = item.displayName ? item : (item.stock || {});
                      
                      msnData = {
                          symbol: symbol,
                          msnId: instrumentId,
                          name: meta.displayName || meta.shortName || symbol,
                          price: getVal(priceInfo.last || item.last),
                          peRatio: getVal(stats.peRatio || stats.priceToEarnings),
                          returnOnEquity: getVal(stats.returnOnEquity || stats.roe),
                          returnOnAssets: getVal(stats.returnOnAssets || stats.roa),
                          priceToBook: getVal(stats.priceToBook || stats.pbr),
                          marketCap: getVal(stats.marketCap || priceInfo.marketCap),
                          debtToEquity: getVal(stats.debtToEquity),
                          profitMargin: getVal(stats.profitMargin),
                          beta: getVal(stats.beta),
                          sector: item.sectorName || "Unclassified",
                          industry: item.industryName || "Unknown",
                          source: "MSN_Peregrine"
                      };
                  }
              }
          }
      }

      // 3. FINAL DECISION
      // If MSN gave us valid data (PE or ROE exists), use it.
      // Otherwise, FAILOVER to Yahoo immediately.
      if (msnData && (msnData.peRatio || msnData.returnOnEquity)) {
          return res.status(200).json(msnData);
      } else {
          // Trigger Fallback
          const yahooData = await fetchYahooData(symbol);
          if (yahooData) {
              return res.status(200).json(yahooData);
          } else {
              // Both failed, return empty object with error flag but 200 OK to prevent crash
              return res.status(200).json({ symbol, error: "NO_DATA_ALL_SOURCES", source: "None" });
          }
      }

  } catch (error: any) {
      // Emergency Fallback on Crash
      const yahooData = await fetchYahooData(symbol);
      if (yahooData) {
          return res.status(200).json(yahooData);
      }
      return res.status(200).json({ error: error.message, symbol: symbol }); 
  }
}
