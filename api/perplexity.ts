
export default async function handler(req: any, res: any) {
  // Vercel Serverless Function for Proxying Perplexity API
  // This handles CORS by making the request from the server side

  // Set CORS headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');

  // Handle preflight request
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const { model, messages, temperature } = req.body;
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({ error: 'Missing Authorization header' });
  }

  try {
    const apiRes = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authHeader,
        'Accept': 'application/json'
      },
      body: JSON.stringify({ 
        model: model || 'sonar', 
        messages, 
        temperature: temperature || 0.1 
      })
    });

    const contentType = apiRes.headers.get('content-type');
    let data;
    
    // Safely parse JSON or text
    if (contentType && contentType.includes('application/json')) {
        data = await apiRes.json();
    } else {
        const text = await apiRes.text();
        // If not JSON, it's likely an error page or 502/503 from upstream
        if (!apiRes.ok) {
            return res.status(apiRes.status).json({ error: `Upstream Non-JSON Error: ${text.substring(0, 200)}` });
        }
        // Fallback if 200 but not JSON (rare)
        return res.status(500).json({ error: 'Invalid Upstream Response Format', details: text.substring(0, 200) });
    }

    if (!apiRes.ok) {
      return res.status(apiRes.status).json(data);
    }

    return res.status(200).json(data);
  } catch (error: any) {
    console.error('Proxy Error:', error);
    return res.status(500).json({ error: 'Internal Server Error', details: error.message });
  }
}