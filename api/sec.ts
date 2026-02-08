
export default async function handler(req: any, res: any) {
  // SEC EDGAR Proxy: Fetches official company tickers
  // Source: https://www.sec.gov/files/company_tickers.json
  
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    // [CRITICAL] SEC requires a specific User-Agent format: "AppName contact@email.com"
    const userAgent = "US_Alpha_Seeker_Research contact@example.com";
    
    const response = await fetch('https://www.sec.gov/files/company_tickers.json', {
      headers: {
        'User-Agent': userAgent,
        'Accept-Encoding': 'gzip, deflate',
        'Host': 'www.sec.gov'
      }
    });

    if (!response.ok) {
        throw new Error(`SEC API Error: ${response.status}`);
    }

    const data = await response.json();
    
    // SEC returns an object with numeric keys: { "0": { cik_str: 320193, ticker: "AAPL", title: "Apple Inc." }, ... }
    // We normalize this into an array.
    const normalized = Object.values(data).map((item: any) => ({
        symbol: item.ticker,
        name: item.title,
        cik: item.cik_str,
        source: 'SEC_EDGAR'
    }));

    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate'); // Cache for 24 hours
    return res.status(200).json(normalized);

  } catch (error: any) {
    console.error('SEC Proxy Error:', error);
    return res.status(500).json({ error: error.message });
  }
}
