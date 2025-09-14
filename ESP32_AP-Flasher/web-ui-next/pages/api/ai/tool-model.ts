import type { NextApiRequest, NextApiResponse } from 'next';
import { selectAiToolModel } from '../../../lib/server/aiTools';

export default function handler(_req: NextApiRequest, res: NextApiResponse) {
  if (!process.env.ENABLE_AI_TOOL_API || process.env.ENABLE_AI_TOOL_API === 'false') return res.status(503).json({ success: false, error: 'ai_tool_api_disabled' });
  return res.status(200).json({ success: true, model: selectAiToolModel(), explicit: !!process.env.OPEL_AI_TOOL_MODEL, list: process.env.OPEL_AI_TOOL_MODELS || null, mock: !process.env.OPENAI_API_KEY });
}
