import type { NextApiRequest, NextApiResponse } from 'next';
import { createAgentAuth, setProvider, getProvider } from '../../../lib/server/agent';

const auth = createAgentAuth();
export default function handler(req: NextApiRequest, res: NextApiResponse) {
  // @ts-ignore
  auth(req, res, () => {
    if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'method_not_allowed' });
    const { provider } = req.body || {};
    if (!provider) return res.status(400).json({ success: false, error: 'provider required' });
    setProvider(String(provider));
    return res.status(200).json({ success: true, provider: getProvider() });
  });
}
