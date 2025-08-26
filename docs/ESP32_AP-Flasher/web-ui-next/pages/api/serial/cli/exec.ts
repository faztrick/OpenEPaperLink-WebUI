import type { NextApiRequest, NextApiResponse } from 'next';
import { ensureSerialApiEnabled, serialManager } from '../../../../lib/server/serialManager';

export default async function handler(req:NextApiRequest, res:NextApiResponse){
  if(req.method !== 'POST') return res.status(405).json({ error:'Method not allowed' });
  const { command, timeoutMs } = req.body || {};
  try { ensureSerialApiEnabled(); } catch(e:any){ return res.status(400).json({ error:e.message }); }
  if(!command) return res.status(400).json({ error:'command required' });
  try {
    const result = await serialManager.execCli(String(command), timeoutMs? Number(timeoutMs):1500);
    res.status(200).json(result);
  } catch(e:any){ res.status(500).json({ error:e.message }); }
}