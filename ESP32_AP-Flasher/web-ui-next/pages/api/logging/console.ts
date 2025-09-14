import type { NextApiRequest, NextApiResponse } from 'next';
import { createAgentAuth } from '../../../lib/server/agent';
import { appendLog, getConsoleMirrorState, setConsoleMirror } from '../../../lib/server/logging';

const auth = createAgentAuth();
export default function handler(req: NextApiRequest, res: NextApiResponse) {
  // Protected behind agent token for symmetry
  // @ts-ignore
  auth(req, res, () => {
    if (req.method === 'GET') {
      return res.status(200).json({ success: true, state: getConsoleMirrorState() });
    }
    if (req.method === 'POST') {
      const { enable, channels } = req.body || {};
      const state = setConsoleMirror(!!enable, Array.isArray(channels) ? channels : (channels === null ? null : undefined));
      appendLog('node', `console-mirror ${state.enabled ? 'enabled' : 'disabled'} channels=${state.channels ? state.channels.join(',') : '*'}`);
      return res.status(200).json({ success: true, state });
    }
    return res.status(405).json({ success: false, error: 'method_not_allowed' });
  });
}
