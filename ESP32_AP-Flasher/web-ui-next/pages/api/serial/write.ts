import type { NextApiRequest, NextApiResponse } from 'next';
import { ensureSerialApiEnabled, serialManager } from '../../../lib/server/serialManager';

export default async function handler(req:NextApiRequest, res:NextApiResponse){
  if(req.method !== 'POST') return res.status(405).json({ error:'Method not allowed' });
  const { data, line } = req.body || {};
  try { ensureSerialApiEnabled(); } catch(e:any){ return res.status(400).json({ error:e.message }); }
  if(!data && !line) return res.status(400).json({ error:'data or line required' });
  try {
    if(line) await serialManager.writeLine(String(line));
    else await serialManager.write(String(data));
    res.status(200).json({ ok:true });
  } catch(e:any){ res.status(500).json({ error:e.message }); }
}
