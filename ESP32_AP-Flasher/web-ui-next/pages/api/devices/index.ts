import type { NextApiRequest, NextApiResponse } from 'next';
import { mockDevices } from '../../../lib/api-types';

export default function handler(req:NextApiRequest, res:NextApiResponse){
  if(req.method !== 'GET') return res.status(405).json({ error:'Method not allowed' });
  const list = mockDevices().map(({ tags, ...d}) => d); // summary (no tags count included? keep minimal)
  res.status(200).json(list);
}
