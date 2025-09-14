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
  const requestedPort = (req.query.port) as string | undefined; // GET only
  const desiredPort = requestedPort || process.env.DEFAULT_SERIAL_PORT || process.env.SERIAL_PORT || 'COM5';
  const baud = Number(process.env.DEFAULT_SERIAL_BAUD || process.env.SERIAL_BAUD || state.baudRate || 115200);
  if (!desiredPort) {
    return res.status(503).json({ error: 'no_port_configured', message: 'No serial port configured for Wi-Fi status', backendUsed: 'serial', guidance: 'Set SERIAL_PORT env or configure sidecar (SERIAL_SIDECAR_URL).' });
  }
  let openedTemporarily = false;
  if (!state.isOpen) {
    // Fast abort path: if serial API disabled or port missing and no sidecar fallback we shouldn't wait full timeout
    if (process.env.ENABLE_SERIAL_API === 'false' && !haveSidecarEnv) {
      return res.status(503).json({ error: 'serial_disabled', message: 'Serial API disabled and no sidecar configured', backendUsed: 'serial', guidance: 'Enable serial (unset ENABLE_SERIAL_API) or configure SERIAL_SIDECAR_URL.' });
    }
    const maxAttempts = 5;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try { await serialManager.open(desiredPort, baud); openedTemporarily = true; break; }
      catch (e: any) {
        const msg = (e?.message || '').toLowerCase();
        const transient = msg.includes('access denied') || msg.includes('busy') || msg.includes('cannot open');
        if (attempt === maxAttempts || !transient) {
          return res.status(503).json({ error: 'port_open_failed', message: `Failed to open serial port ${desiredPort}: ${e.message}`, backendUsed: 'serial', attempts: attempt, transient, guidance: 'Verify device is connected and not locked by another program. Set ENABLE_SERIAL_API=false to suppress serial backend or configure SERIAL_SIDECAR_URL for proxy.' });
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
      if (result.timedOut) {
        // Degraded response: deliver partial info with 200 so UI can show stale/unknown instead of hard error.
        return res.status(200).json({
          degraded: true,
          error: 'status_timeout',
          message: 'Wi-Fi status timed out / no parseable event',
          backendUsed: 'serial',
          timedOut: result.timedOut,
          elapsedMs: result.elapsedMs,
          rawCount: rawLines.length,
          openedTemporarily,
          port: desiredPort,
          guidance: 'Check device firmware supports wifistatus CLI. Consider longer timeoutMs or updating firmware.',
          debugRaw: debug ? rawLines : undefined
        });
      }
      return res.status(422).json({
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
    return res.status(200).json({ ...obj, backendUsed: 'serial', proxied: false, openedTemporarily, port: desiredPort, elapsedMs: result.elapsedMs, totalMs, timedOut: result.timedOut, rawCount: rawLines.length, backendDecision: { requestedPort: requestedPort || null, effectivePort: desiredPort }, debugRaw: debug ? rawLines : undefined });
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
