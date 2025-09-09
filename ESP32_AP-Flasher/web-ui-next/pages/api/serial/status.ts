import type { NextApiRequest, NextApiResponse } from 'next';
import { ensureSerialApiEnabled, serialManager } from '../../../lib/server/serialManager';

export default function handler(req:NextApiRequest, res:NextApiResponse){
  if(req.method !== 'GET') return res.status(405).json({ error:'Method not allowed' });
  try { ensureSerialApiEnabled(); } catch(e:any){ return res.status(400).json({ error:e.message }); }
  res.status(200).json(serialManager.getState());
}
