import { handleDashboardAi } from '../services/dashboardAiServer.mjs';

export default async function handler(req: any, res: any) {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Vary', 'Authorization');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  const result = await handleDashboardAi(req, process.env);
  return res.status(result.status).json(result.body);
}
