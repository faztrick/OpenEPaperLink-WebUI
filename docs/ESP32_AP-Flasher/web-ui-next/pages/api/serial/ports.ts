import type { NextApiRequest, NextApiResponse } from 'next';
import { ensureSerialApiEnabled, serialManager } from '../../../lib/server/serialManager';

export default async function handler(req:NextApiRequest, res:NextApiResponse){
  if(req.method !== 'GET') return res.status(405).json({ error:'Method not allowed' });
  try {
    ensureSerialApiEnabled();
    const ports = await serialManager.listPorts();
    res.status(200).json(ports.map(p=>({ path:p.path, manufacturer:p.manufacturer, serialNumber:p.serialNumber, vendorId:p.vendorId, productId:p.productId })));
  } catch(e:any){
    res.status(500).json({ error:e.message });
  }
}
