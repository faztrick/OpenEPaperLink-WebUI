import type { NextApiRequest, NextApiResponse } from 'next';
import { mockDevices } from '../../../lib/api-types';

export default function handler(req:NextApiRequest, res:NextApiResponse){
  if(req.method !== 'GET') return res.status(405).json({ error:'Method not allowed' });
  const { id } = req.query;
  const dev = mockDevices().find(d=> d.id === id);
  if(!dev) return res.status(404).json({ error:'Not found' });
  return res.status(200).json(dev);
}
