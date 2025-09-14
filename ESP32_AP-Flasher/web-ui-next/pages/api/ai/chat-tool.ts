import type { NextApiRequest, NextApiResponse } from 'next';
import { performAiChat } from '../../../lib/server/aiTools';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'method_not_allowed' });
  if (!process.env.ENABLE_AI_TOOL_API || process.env.ENABLE_AI_TOOL_API === 'false') return res.status(503).json({ success: false, error: 'ai_tool_api_disabled' });
  const { message, sessionId } = req.body || {};
  if (!message) return res.status(400).json({ success: false, error: 'message required' });
  const resp = await performAiChat(String(message));
  return res.status(resp.success ? 200 : 500).json({ ...resp, sessionId: sessionId || 'default' });
}
