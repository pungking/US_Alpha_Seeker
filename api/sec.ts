
import { captureApiError, withSentryApi } from "./_sentry";

const handler = async (req: any, res: any) => {
  // SEC EDGAR Proxy
  // Mode 1: Listing (No params) -> https://www.sec.gov/files/company_tickers.json
  // Mode 2: Detail (cik) -> https://data.sec.gov/submissions/CIK##########.json
  // Mode 3: XBRL Facts (action=facts, cik) -> https://data.sec.gov/api/xbrl/companyfacts/CIK##########.json
  
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const { cik, action } = req.query;
  // SEC strictly requires a User-Agent with contact info.
  // Using a generic academic research string to comply.
  const userAgent = "AlphaSeekerResearch contact@alphaseeker.com";

  try {
    if (cik) {
        const paddedCik = String(cik).padStart(10, '0');

        // [MODE 3] XBRL Company Facts (The "Pure" Data)
        if (action === 'facts') {
             const url = `https://data.sec.gov/api/xbrl/companyfacts/CIK${paddedCik}.json`;
             const response = await fetch(url, {
                headers: { 
                    'User-Agent': userAgent, 
                    'Host': 'data.sec.gov',
                    'Accept-Encoding': 'gzip, deflate',
                    'Cache-Control': 'no-cache'
                }
             });

             if (!response.ok) throw new Error(`SEC XBRL Error: ${response.status}`);
             
             const data = await response.json();
             const facts = data.facts?.['us-gaap'];

             if (!facts) return res.status(200).json({ error: "No US-GAAP facts found" });

             // Filter only essential tags for Quant Scoring to reduce payload size
             const essentialTags = [
                 'Assets', 'Liabilities', 'StockholdersEquity', 
                 'CurrentAssets', 'CurrentLiabilities', 
                 'RetainedEarningsAccumulatedDeficit', 
                 'OperatingIncomeLoss', 'Revenues', 'RevenueFromContractWithCustomerExcludingAssessedTax',
                 'NetIncomeLoss', 'NetCashProvidedByUsedInOperatingActivities'
             ];

             const filteredFacts: any = {};
             essentialTags.forEach(tag => {
                 if (facts[tag]) filteredFacts[tag] = facts[tag];
             });

             res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');
             return res.status(200).json({ taxonomy: 'us-gaap', facts: filteredFacts });
        }

        // [MODE 2] Fetch Submission Metadata (Existing)
        const url = `https://data.sec.gov/submissions/CIK${paddedCik}.json`;
        const response = await fetch(url, {
            headers: { 
                'User-Agent': userAgent, 
                'Host': 'data.sec.gov'
            }
        });

        if (!response.ok) throw new Error(`SEC Detail Error: ${response.status}`);
        const data = await response.json();
        
        const result = {
            cik: data.cik,
            entityType: data.entityType,
            sic: data.sic,
            sicDescription: data.sicDescription,
            name: data.name,
            tickers: data.tickers,
            exchanges: data.exchanges,
            fiscalYearEnd: data.fiscalYearEnd,
            latestFilings: (data.filings?.recent?.accessionNumber || []).slice(0, 5).map((acc: string, idx: number) => ({
                accessionNumber: acc,
                form: data.filings.recent.form[idx],
                filingDate: data.filings.recent.filingDate[idx],
                reportDate: data.filings.recent.reportDate[idx]
            }))
        };

        res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');
        return res.status(200).json(result);

    } else {
        // [MODE 1] Fetch All Tickers
        const response = await fetch('https://www.sec.gov/files/company_tickers.json', {
            headers: { 
                'User-Agent': userAgent, 
                'Host': 'www.sec.gov' 
            }
        });

        if (!response.ok) throw new Error(`SEC List Error: ${response.status}`);

        const data = await response.json();
        const normalized = Object.values(data).map((item: any) => ({
            symbol: item.ticker,
            name: item.title,
            cik: item.cik_str,
            source: 'SEC_EDGAR'
        }));

        res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate'); 
        return res.status(200).json(normalized);
    }

  } catch (error: any) {
    console.error('SEC Proxy Error:', error);
    captureApiError(error, {
      source: 'sec_proxy',
      method: req?.method || 'UNKNOWN',
      action: String(req?.query?.action || ''),
      cik: String(req?.query?.cik || '')
    });
    return res.status(500).json({ error: error.message });
  }
};

export default withSentryApi(handler);
