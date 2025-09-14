import type { NextApiRequest, NextApiResponse } from 'next';
import { agentActionRunner, createAgentAuth } from '../../../lib/server/agent';

const auth = createAgentAuth();
export default function handler(req: NextApiRequest, res: NextApiResponse) {
  // @ts-ignore
  auth(req, res, () => {
    if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'method_not_allowed' });
    const { processId } = req.body || {};
    if (!processId) return res.status(400).json({ success: false, error: 'processId required' });
    const result = agentActionRunner.kill(String(processId));
    return res.status(200).json(result);
  });
}
