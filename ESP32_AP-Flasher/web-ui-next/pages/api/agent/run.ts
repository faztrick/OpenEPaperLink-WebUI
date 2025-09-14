import type { NextApiRequest, NextApiResponse } from 'next';
import { agentActionRunner, createAgentAuth } from '../../../lib/server/agent';

const auth = createAgentAuth();
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // @ts-ignore
  auth(req, res, async () => {
    if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'method_not_allowed' });
    const { action, config } = req.body || {};
    if (!action) return res.status(400).json({ success: false, error: 'action required' });
    const result = await agentActionRunner.execute(String(action), { config });
    return res.status(200).json({ success: result.success, result });
  });
}
