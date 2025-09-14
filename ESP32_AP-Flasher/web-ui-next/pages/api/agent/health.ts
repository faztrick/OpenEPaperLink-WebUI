import type { NextApiRequest, NextApiResponse } from 'next';
import { createAgentAuth, getAgentHealth, getProvider } from '../../../lib/server/agent';

const auth = createAgentAuth();
export default function handler(req: NextApiRequest, res: NextApiResponse) {
  // @ts-ignore
  auth(req, res, () => {
    if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'method_not_allowed' });
    return res.status(200).json({ success: true, agent: getAgentHealth(), provider: getProvider() });
  });
}
