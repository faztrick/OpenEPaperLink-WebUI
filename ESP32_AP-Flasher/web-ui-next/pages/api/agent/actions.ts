import type { NextApiRequest, NextApiResponse } from 'next';
import { agentActionRunner, createAgentAuth } from '../../../lib/server/agent';

const auth = createAgentAuth();
export default function handler(req: NextApiRequest, res: NextApiResponse) {
  // @ts-ignore middleware style
  auth(req, res, () => {
    if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'method_not_allowed' });
    return res.status(200).json({ success: true, actions: agentActionRunner.listActions() });
  });
}
