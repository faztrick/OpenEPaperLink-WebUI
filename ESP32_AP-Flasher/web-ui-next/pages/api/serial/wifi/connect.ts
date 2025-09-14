import type { NextApiRequest, NextApiResponse } from 'next';
import { ensureSerialApiEnabled, serialManager } from '../../../../lib/server/serialManager';

async function proxyToSidecar(req: NextApiRequest, res: NextApiResponse) {
  const base = process.env.SERIAL_SIDECAR_URL;
  if (!base) return null;
  const url = base.replace(/\/$/, '') + '/wifi/connect';
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ssid: req.body?.ssid, password: req.body?.password })
    } as any);
    const data = await r.json();
    return { status: r.status, data };
  } catch (e: any) {
    return { status: 500, data: { error: 'Sidecar proxy error: ' + e.message } };
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const backendParam = (req.query.backend || req.body?.backend || 'auto') as string;
  const wantSidecar = backendParam === 'sidecar';
  const wantSerial = backendParam === 'serial';
  const haveSidecarEnv = !!process.env.SERIAL_SIDECAR_URL;
  const useSidecar = wantSidecar || (!wantSerial && haveSidecarEnv);
  if (useSidecar) {
    const proxied = await proxyToSidecar(req, res);
    if (proxied) return res.status(proxied.status).json({ ...proxied.data, proxied: true, backendUsed: 'sidecar' });
  }

  try { ensureSerialApiEnabled(); } catch (e: any) { return res.status(400).json({ error: e.message }); }
  const ssid = req.body?.ssid || req.query.ssid;
  const password = req.body?.password || req.query.password;
  if (!ssid) return res.status(400).json({ error: 'missing_ssid' });

  const state = serialManager.getState();
  const requestedPort = (req.body?.port || req.query.port) as string | undefined;
  const desiredPort = requestedPort || process.env.DEFAULT_SERIAL_PORT || process.env.SERIAL_PORT || 'COM5';
  const baud = Number(process.env.DEFAULT_SERIAL_BAUD || process.env.SERIAL_BAUD || state.baudRate || 115200);
  let openedTemporarily = false;
  if (!state.isOpen) {
    const maxAttempts = 5;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try { await serialManager.open(desiredPort, baud); openedTemporarily = true; break; }
      catch (e: any) {
        const msg = (e?.message || '').toLowerCase();
        const transient = msg.includes('access denied') || msg.includes('busy') || msg.includes('cannot open');
        if (attempt === maxAttempts || !transient) {
          return res.status(502).json({ error: 'port_open_failed', message: `Failed to open serial port ${desiredPort}: ${e.message}`, backendUsed: 'serial', attempts: attempt, transient });
        }
        await new Promise(r => setTimeout(r, 150));
      }
    }
  }
  try {
    let command = 'wificonnect ';
    // Quote if contains spaces
    const needsQuote = /\s/.test(ssid);
    command += needsQuote ? `"${ssid}"` : ssid;
    if (password) {
      const needsQ2 = /\s/.test(password);
      command += ' ' + (needsQ2 ? `"${password}"` : password);
    }
    const result = await serialManager.execCli(command, 15000); // allow connect time
    const rawLines = result.lines.map(l => l.raw);
    const event = rawLines.find(l => l.startsWith('{') && l.includes('"event":"wificonnect"'));
    let obj: any = null;
    if (event) {
      try { obj = JSON.parse(event); } catch { /* ignore */ }
    }
    const timedOut = result.timedOut;
    if (!obj) {
      return res.status(timedOut ? 504 : 422).json({ error: 'connect_parse_failed', backendUsed: 'serial', timedOut, elapsedMs: result.elapsedMs, rawCount: rawLines.length, openedTemporarily, port: desiredPort });
    }
    return res.status(200).json({ ...obj, backendUsed: 'serial', proxied: false, openedTemporarily, port: desiredPort, elapsedMs: result.elapsedMs, timedOut, rawCount: rawLines.length, backendDecision: { requestedPort: requestedPort || null, effectivePort: desiredPort } });
  } catch (e: any) {
    const recent = serialManager.getLog({ tail: 25 }).map(l => l.raw);
    return res.status(500).json({ error: 'unexpected', message: e.message, backendUsed: 'serial', recentLines: recent });
  } finally {
    if (openedTemporarily) { try { await serialManager.close(); } catch { /* ignore */ } }
  }
}
