import type { NextApiRequest, NextApiResponse } from 'next';
import { ensureSerialApiEnabled, serialManager } from '../../../lib/server/serialManager';

export default async function handler(req:NextApiRequest, res:NextApiResponse){
  if(req.method !== 'POST') return res.status(405).json({ error:'Method not allowed' });
  const { path, baudRate } = req.body || {};
  try { ensureSerialApiEnabled(); } catch(e:any){ return res.status(400).json({ error:e.message }); }
  if(!path) return res.status(400).json({ error:'path required' });
  try {
  const st = await serialManager.open(String(path), baudRate? Number(baudRate): 115200);
  // Provide backward-compatible alias 'opened' expected by some scripts
  res.status(200).json({ ...st, opened: st.isOpen });
  } catch(e:any){ res.status(500).json({ error:e.message }); }
}
