
import { captureApiError, withSentryApi } from "../services/sentryApiNode.js";
import { validatePerplexityPayload } from "../services/perplexityRequest.mjs";

const handler = async (req: any, res: any) => {
  // Vercel Serverless Function for Proxying Perplexity API
  // This handles CORS by making the request from the server side

  // Set CORS headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');

  // Handle preflight request
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  let body;
  try { body = validatePerplexityPayload(req.body); }
  catch { return res.status(400).json({ error: 'PERPLEXITY_REQUEST_INVALID' }); }
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({ error: 'Missing Authorization header' });
  }

  try {
    res.setHeader('X-Perplexity-Upstream-Attempted', 'true');
    const apiRes = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(25000),
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authHeader,
        'Accept': 'application/json'
      },
      body: JSON.stringify(body)
    });

    const contentType = apiRes.headers.get('content-type');
    let data;
    
    // Safely parse JSON or text
    if (contentType && contentType.includes('application/json')) {
        data = await apiRes.json();
    } else {
        // If not JSON, it's likely an error page or 502/503 from upstream
        if (!apiRes.ok) {
            return res.status(apiRes.status).json({ error: 'PERPLEXITY_UPSTREAM_FAILURE' });
        }
        // Fallback if 200 but not JSON (rare)
        return res.status(502).json({ error: 'PERPLEXITY_RESPONSE_INVALID' });
    }

    if (!apiRes.ok) {
      return res.status(apiRes.status).json({ error: 'PERPLEXITY_UPSTREAM_FAILURE' });
    }

    return res.status(200).json(data);
  } catch (error: any) {
    captureApiError(new Error('PERPLEXITY_UPSTREAM_UNAVAILABLE'), {
      source: 'perplexity_proxy',
      method: req?.method || 'UNKNOWN',
      model: body.model
    });
    return res.status(502).json({ error: 'PERPLEXITY_UPSTREAM_UNAVAILABLE' });
  }
};

export default withSentryApi(handler);
