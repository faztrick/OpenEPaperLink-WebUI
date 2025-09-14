import type { NextApiRequest, NextApiResponse } from 'next';
import { ensureSerialApiEnabled, serialManager } from '../../../../lib/server/serialManager';

async function proxyToSidecar(req: NextApiRequest, res: NextApiResponse) {
  const base = process.env.SERIAL_SIDECAR_URL;
  if (!base) return null;
  const url = base.replace(/\/$/, '') + '/wifi/status';
  try {
    const r = await fetch(url, { method: 'GET' } as any);
    const data = await r.json();
    return { status: r.status, data };
  } catch (e: any) {
    return { status: 500, data: { error: 'Sidecar proxy error: ' + e.message } };
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const backendParam = (req.query.backend || 'auto') as string;
  const wantSidecar = backendParam === 'sidecar';
  const wantSerial = backendParam === 'serial';
  const haveSidecarEnv = !!process.env.SERIAL_SIDECAR_URL;
  const useSidecar = wantSidecar || (!wantSerial && haveSidecarEnv);
  const debug = req.query.debug === '1' || req.query.debug === 'true';
  const timeoutMs = Math.min(15000, Math.max(500, Number(req.query.timeoutMs) || 2500));
  if (useSidecar) {
    const proxied = await proxyToSidecar(req, res);
    if (proxied) return res.status(proxied.status).json({ ...proxied.data, proxied: true, backendUsed: 'sidecar' });
  }
  try { ensureSerialApiEnabled(); } catch (e: any) { return res.status(400).json({ error: e.message }); }
  const state = serialManager.getState();
  const desiredPort = process.env.DEFAULT_SERIAL_PORT || process.env.SERIAL_PORT || 'COM5';
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
    const start = Date.now();
    const result = await serialManager.execCli('wifistatus', timeoutMs);
    const rawLines = result.lines.map(l => l.raw);
    const eventIdx = rawLines.findIndex(l => l.startsWith('{') && l.includes('"event":"wifistatus"'));
    let obj: any = null; let parseError: string | undefined; let parsedLine: string | undefined;
    if (eventIdx >= 0) {
      parsedLine = rawLines[eventIdx];
      try { obj = JSON.parse(parsedLine); } catch (e: any) { parseError = e.message; }
    }
    if (!obj) {
      // Attempt fallback: if sidecar available and backend=auto, try proxy now
      if (!useSidecar && backendParam === 'auto' && haveSidecarEnv) {
        const proxied = await proxyToSidecar(req, res);
        if (proxied) return res.status(proxied.status).json({ ...proxied.data, proxied: true, backendUsed: 'sidecar', fallbackReason: 'serial_status_parse_failed', serialTimedOut: result.timedOut, serialElapsedMs: result.elapsedMs, serialRaw: debug ? rawLines : undefined });
      }
      return res.status(result.timedOut ? 504 : 422).json({
        error: 'status_parse_failed',
        backendUsed: 'serial',
        timedOut: result.timedOut,
        elapsedMs: result.elapsedMs,
        rawCount: rawLines.length,
        parsedLine,
        parseError,
        openedTemporarily,
        port: desiredPort,
        guidance: 'Ensure firmware outputs JSON line with event=wifistatus. Update firmware or increase timeoutMs if slow.',
        debugRaw: debug ? rawLines : undefined
      });
    }
    const totalMs = Date.now() - start;
    return res.status(200).json({ ...obj, backendUsed: 'serial', proxied: false, openedTemporarily, port: desiredPort, elapsedMs: result.elapsedMs, totalMs, timedOut: result.timedOut, rawCount: rawLines.length, debugRaw: debug ? rawLines : undefined });
  } catch (e: any) {
    const recent = serialManager.getLog({ tail: 25 }).map(l => l.raw);
    // Last-chance fallback to sidecar if available in auto mode and serial failed immediately
    if (backendParam === 'auto' && haveSidecarEnv) {
      const proxied = await proxyToSidecar(req, res);
      if (proxied) return res.status(proxied.status).json({ ...proxied.data, proxied: true, backendUsed: 'sidecar', fallbackReason: 'serial_exception', serialError: e.message, serialRecent: debug ? recent : undefined });
    }
    return res.status(500).json({ error: 'unexpected', message: e.message, backendUsed: 'serial', recentLines: debug ? recent : undefined });
  } finally {
    if (openedTemporarily) { try { await serialManager.close(); } catch { /* ignore */ } }
  }
}
