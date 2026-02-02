
export default async function handler(req: any, res: any) {
  // Nasdaq Official API Proxy
  // Fetches data from: https://api.nasdaq.com/api/screener/stocks
  
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    // limit=25000 covers the entire US market (~10k-15k usually on Nasdaq/NYSE/AMEX + OTC)
    // We request 'tableonly' to get the clean data structure
    const url = 'https://api.nasdaq.com/api/screener/stocks?tableonly=true&limit=25000&exchange=all&download=true';
    
    // Nasdaq is strict about User-Agents. We mimic a standard browser.
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Origin': 'https://www.nasdaq.com',
        'Referer': 'https://www.nasdaq.com/'
      }
    });

    if (!response.ok) {
        throw new Error(`Nasdaq Upstream Error: ${response.status}`);
    }

    const data = await response.json();
    
    // Normalize Data Structure
    // Nasdaq returns strings with special chars (e.g. "$123.45", "1.5%", "1,000")
    // We clean these into proper numbers.
    const rows = data?.data?.table?.rows || [];
    
    const normalized = rows.map((r: any) => ({
        symbol: r.symbol,
        name: r.name,
        price: parseFloat(r.lastsale.replace('$', '').replace(',', '')) || 0,
        change: parseFloat(r.netchange.replace('$', '').replace(',', '')) || 0,
        pctChange: parseFloat(r.pctchange.replace('%', '').replace(',', '')) || 0,
        marketCap: parseFloat(r.marketCap.replace(/,/g, '')) || 0,
        volume: parseFloat(r.volume.replace(/,/g, '')) || 0,
        sector: r.sector,
        industry: r.industry,
        country: r.country,
        ipoyear: r.ipoyear
    }));

    // Cache control for 1 hour to reduce load on Nasdaq
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');
    
    return res.status(200).json(normalized);

  } catch (error: any) {
    console.error('Nasdaq Proxy Error:', error);
    return res.status(500).json({ error: 'Internal Server Error', details: error.message });
  }
}
