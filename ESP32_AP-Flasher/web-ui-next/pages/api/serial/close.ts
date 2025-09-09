import type { NextApiRequest, NextApiResponse } from 'next';
import { ensureSerialApiEnabled, serialManager } from '../../../lib/server/serialManager';

export default async function handler(req:NextApiRequest, res:NextApiResponse){
  if(req.method !== 'POST') return res.status(405).json({ error:'Method not allowed' });
  try {
    ensureSerialApiEnabled();
    await serialManager.close();
    res.status(200).json({ ok:true });
  } catch(e:any){ res.status(500).json({ error:e.message }); }
}
