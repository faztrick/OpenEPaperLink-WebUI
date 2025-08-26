import type { NextApiRequest, NextApiResponse } from 'next';
import { ensureSerialApiEnabled, serialManager } from '../../../lib/server/serialManager';

// Extended CLI endpoint: if capture/timeoutMs provided, uses execCli to return output lines
// Body fields:
//  command (string, required)
//  timeoutMs (number, optional) - maximum time to wait for prompt
//  capture (boolean, optional) - force capture even without timeout
export default async function handler(req:NextApiRequest, res:NextApiResponse){
  if(req.method !== 'POST') return res.status(405).json({ error:'Method not allowed' });
  const { command, timeoutMs, capture } = req.body || {};
  try { ensureSerialApiEnabled(); } catch(e:any){ return res.status(400).json({ error:e.message }); }
  if(!command) return res.status(400).json({ error:'command required' });
  try {
    if(capture || timeoutMs){
      const result = await serialManager.execCli(String(command), timeoutMs? Number(timeoutMs):1500);
      return res.status(200).json(result);
    }
    await serialManager.writeLine(String(command));
    res.status(200).json({ ok:true });
  } catch(e:any){ res.status(500).json({ error:e.message }); }
}
