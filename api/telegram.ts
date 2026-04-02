import { captureApiError, withSentryApi } from "../services/sentryApiNode.js";

const handler = async (req: any, res: any) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Guard against null/invalid JSON body to avoid runtime destructuring errors.
  const payload = req?.body && typeof req.body === "object" ? req.body : {};
  const token = typeof payload.token === "string" ? payload.token.trim() : "";
  const method = typeof payload.method === "string" ? payload.method.trim() : "";
  const body = payload.body ?? {};

  if (!token || !method) {
    return res.status(400).json({
      error: "missing_parameters",
      message: "token and method are required"
    });
  }

  try {
    const url = `https://api.telegram.org/bot${token}/${method}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    const data = await response.json();
    
    if (!response.ok) {
        return res.status(response.status).json(data);
    }

    return res.status(200).json(data);
  } catch (error: any) {
    console.error("Telegram Proxy Error:", error);
    captureApiError(error, {
      source: "telegram_proxy",
      method: req?.method || "UNKNOWN",
      telegramMethod: String(req?.body?.method || "")
    });
    return res.status(500).json({ error: error.message });
  }
};

export default withSentryApi(handler);
