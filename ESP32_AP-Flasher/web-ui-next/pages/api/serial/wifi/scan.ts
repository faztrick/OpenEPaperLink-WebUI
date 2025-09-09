import type { NextApiRequest, NextApiResponse } from 'next';
import { ensureSerialApiEnabled, serialManager } from '../../../../lib/server/serialManager';

// Starts a WiFi scan via serial CLI command 'wifiscan' and returns parsed networks.
// Response shape: { success:true, count, networks:[ { ssid,rssi,channel,enc,bssid } ], rawLines: [...], timedOut:boolean }
export default async function handler(req:NextApiRequest, res:NextApiResponse){
  if(req.method !== 'POST') return res.status(405).json({ error:'Method not allowed' });
  try { ensureSerialApiEnabled(); } catch(e:any){ return res.status(400).json({ error:e.message }); }
  try {
    const result = await serialManager.execCli('wifiscan', 5000); // more time for scan
    const networks: any[] = [];
    let count: number | undefined = undefined;
    for(const l of result.lines){
      try {
        if(!l.raw.startsWith('{')) continue; // only parse JSON-like lines
        const obj = JSON.parse(l.raw);
        if(obj.event === 'wifiscan_summary'){ count = obj.count; }
        else if(obj.event === 'wifinet'){
          networks.push({ ssid: obj.ssid, rssi: obj.rssi, channel: obj.channel, enc: obj.enc, bssid: obj.bssid });
        }
      } catch{ /* ignore parse errors */ }
    }
    res.status(200).json({ success:true, count: count ?? networks.length, networks, rawLineCount: result.lines.length, timedOut: result.timedOut });
  } catch(e:any){
    res.status(500).json({ error:e.message });
  }
}
