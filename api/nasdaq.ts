
export default async function handler(req: any, res: any) {
  // Nasdaq Official API Proxy
  
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    const url = 'https://api.nasdaq.com/api/screener/stocks?tableonly=true&limit=25000&exchange=all&download=true';
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Origin': 'https://www.nasdaq.com',
        'Referer': 'https://www.nasdaq.com/market-activity/stocks/screener',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'same-site'
      }
    });

    if (!response.ok) {
        // Return 200 with empty array to allow frontend fallback gracefully
        console.warn(`Nasdaq Upstream Error: ${response.status}`);
        return res.status(200).json([]);
    }

    const data = await response.json();
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

    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');
    return res.status(200).json(normalized);

  } catch (error: any) {
    console.error('Nasdaq Proxy Error:', error);
    return res.status(200).json([]); // Return empty array on error for graceful fallback
  }
}
