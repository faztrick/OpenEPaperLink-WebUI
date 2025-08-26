import type { NextApiRequest, NextApiResponse } from 'next';
import { ensureSerialApiEnabled, serialManager } from '../../../lib/server/serialManager';

export default function handler(req:NextApiRequest, res:NextApiResponse){
  if(req.method !== 'GET') return res.status(405).json({ error:'Method not allowed' });
  try {
    ensureSerialApiEnabled();
    const { tail, since } = req.query;
    const tailNum = tail? Number(tail): undefined;
    const sinceIdx = since? Number(since): undefined;
    const lines = serialManager.getLog({ tail: tailNum, sinceIdx });
    res.status(200).json({ lines, nextIndex: serialManager.getState().nextIndex });
  } catch(e:any){
    res.status(400).json({ error:e.message });
  }
}
