import type { NextApiRequest, NextApiResponse } from 'next';
import { ensureSerialApiEnabled, serialManager } from '../../../../lib/server/serialManager';

// This API route proxies Wi-Fi mode get/set operations to the serial-sidecar if configured
// or executes the CLI directly (future enhancement) similar to wifi scan route.
// Response shape (GET): { success:true, mode:number, modeName:string }
// Response shape (POST): { success:true, mode:number, modeName:string, changed:boolean, prior:number }

async function proxyToSidecar(req: NextApiRequest, res: NextApiResponse) {
  const base = process.env.SERIAL_SIDECAR_URL;
  if (!base) return null;
  const url = base.replace(/\/$/, '') + '/wifi/mode';
  try {
    const fetchOpts: RequestInit = { method: req.method };
    if (req.method === 'POST') {
      fetchOpts.headers = { 'Content-Type': 'application/json' };
      fetchOpts.body = JSON.stringify({ mode: (req.body?.mode ?? req.query.mode) });
    }
    const r = await fetch(url, fetchOpts as any);
    const data = await r.json();
    return { status: r.status, data };
  } catch (e: any) {
    return { status: 500, data: { error: 'Sidecar proxy error: ' + e.message } };
  }
}

// Parse CLI output lines for wifimode events
function parseModeLines(lines: { raw: string }[]) {
  let mode: number | undefined; let modeName: string | undefined; let changed = false; let prior: number | undefined;
  let sawJson = false;
  for (const l of lines) {
    if (l.raw.startsWith('{')) {
      try {
        const obj = JSON.parse(l.raw);
        if (obj.event === 'wifimode') {
          sawJson = true;
          if (obj.mode !== undefined) mode = obj.mode;
          if (obj.modeName) modeName = obj.modeName;
          if (obj.changed !== undefined) changed = !!obj.changed;
          if (obj.prior !== undefined) prior = obj.prior;
        }
      } catch { /* ignore */ }
    }
    // fallback textual patterns if JSON absent
    if (!sawJson) {
      const m = l.raw.match(/wifimode.*mode(?:=|:)\s*(\d+)/i) || l.raw.match(/Current\s+Wi-?Fi\s+mode\s*:\s*(\d+)/i);
      if (m) {
        const val = Number(m[1]); if (!Number.isNaN(val)) mode = val;
      }
    }
  }
  return { mode, modeName, changed, prior, sawJson };
}

async function handleDirect(req: NextApiRequest, res: NextApiResponse, backendUsed: string, opts: { backendParam: string; haveSidecarEnv: boolean }) {
  try { ensureSerialApiEnabled(); } catch (e: any) { return res.status(400).json({ error: e.message }); }
  const state = serialManager.getState();
  const desiredPort = process.env.DEFAULT_SERIAL_PORT || process.env.SERIAL_PORT || 'COM5';
  const baud = Number(process.env.DEFAULT_SERIAL_BAUD || process.env.SERIAL_BAUD || state.baudRate || 115200);
  if (!desiredPort) {
    return res.status(503).json({ error: 'no_port_configured', message: 'No serial port configured for Wi-Fi mode', backendUsed, proxied: false, guidance: 'Set SERIAL_PORT env or configure sidecar (SERIAL_SIDECAR_URL).' });
  }
  let openedTemporarily = false;
  if (!state.isOpen) {
    if (process.env.ENABLE_SERIAL_API === 'false' && !opts.haveSidecarEnv) {
      return res.status(503).json({ error: 'serial_disabled', message: 'Serial API disabled and no sidecar configured', backendUsed, proxied: false, guidance: 'Enable serial (unset ENABLE_SERIAL_API) or configure SERIAL_SIDECAR_URL.' });
    }
    const maxAttempts = 5;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        await serialManager.open(desiredPort, baud);
        openedTemporarily = true; break;
      } catch (e: any) {
        const msg = (e?.message || '').toLowerCase();
        const transient = msg.includes('access denied') || msg.includes('busy') || msg.includes('cannot open');
        if (attempt === maxAttempts || !transient) {
          return res.status(503).json({ error: 'port_open_failed', message: `Failed to open serial port ${desiredPort}: ${e.message}`, backendUsed, proxied: false, guidance: 'Check cable/permissions or disable serial API (ENABLE_SERIAL_API=false). If a sidecar service exists set SERIAL_SIDECAR_URL.' });
        }
        await new Promise(r => setTimeout(r, 150));
      }
    }
  }
  try {
    const isGet = req.method === 'GET';
    const modeParam = req.body?.mode ?? req.query.mode;
    let command = 'wifimode';
    if (!isGet && modeParam !== undefined) command = `wifimode ${modeParam}`;
    const result = await serialManager.execCli(command, 3000);
    const rawLines = result.lines.map(l => l.raw);
    // detect unknown command
    const unknown = rawLines.some(l => /Unknown command:.*wifimode/i.test(l));
    const parsed = parseModeLines(result.lines);
    const debug = req.query.debug === '1' || req.body?.debug === '1';
    if (unknown) {
      // If backend was auto and sidecar is available, attempt transparent fallback
      if (opts.backendParam === 'auto' && opts.haveSidecarEnv) {
        const proxied = await proxyToSidecar(req, res);
        if (proxied) {
          return res.status(proxied.status).json({ ...proxied.data, proxied: true, backendUsed: 'sidecar', fallbackFrom: 'serial-unknown-command' });
        }
      }
      return res.status(400).json({
        error: 'unknown_command',
        message: 'Firmware does not support wifimode command (update firmware to newer build that includes this CLI).',
        guidance: 'Update the ESP32 AP firmware to a version that implements the wifimode serial CLI or use sidecar mode if available.',
        backendUsed,
        proxied: false,
        openedTemporarily,
        rawCount: rawLines.length,
        parseStatus: 'unknown',
        ...(debug ? { rawLines } : {})
      });
    }
    if (parsed.mode === undefined) {
      if (result.timedOut) {
        return res.status(200).json({ degraded: true, error: 'mode_timeout', message: 'Wi-Fi mode query timed out', backendUsed, proxied: false, openedTemporarily, rawCount: rawLines.length, elapsedMs: result.elapsedMs, timedOut: true, parseStatus: 'no_mode', guidance: 'Verify firmware implements wifimode CLI or increase timeout.', ...(debug ? { rawLines } : {}) });
      }
      return res.status(422).json({ error: 'parse_failed', message: 'Failed to extract mode', backendUsed, proxied: false, openedTemporarily, rawCount: rawLines.length, elapsedMs: result.elapsedMs, timedOut: result.timedOut, parseStatus: 'no_mode', ...(debug ? { rawLines } : {}) });
    }
    res.status(200).json({ success: true, mode: parsed.mode, modeName: parsed.modeName, changed: parsed.changed, prior: parsed.prior, backendUsed, proxied: false, openedTemporarily, port: desiredPort, elapsedMs: result.elapsedMs, timedOut: result.timedOut, rawCount: rawLines.length, parseStatus: parsed.sawJson ? 'json' : 'fallback', ...(debug ? { rawLines } : {}) });
  } catch (e: any) {
    // Attempt to snapshot any recent lines for debugging
    const recent = serialManager.getLog({ tail: 25 }).map(l => l.raw);
    res.status(500).json({ error: 'unexpected', message: e.message, backendUsed, proxied: false, recentLines: recent });
  } finally {
    // Close if we opened just for this
    // (Keep if user likely wants to do multiple operations? For now close to mirror scan route.)
    if (openedTemporarily) { try { await serialManager.close(); } catch { /* ignore */ } }
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const backendParam = (req.query.backend || req.body?.backend || 'auto') as string;
  const wantSidecar = backendParam === 'sidecar';
  const wantSerial = backendParam === 'serial';
  const haveSidecarEnv = !!process.env.SERIAL_SIDECAR_URL;
  const useSidecar = wantSidecar || (!wantSerial && haveSidecarEnv);

  if (useSidecar) {
    const proxied = await proxyToSidecar(req, res);
    if (proxied) {
      return res.status(proxied.status).json({ ...proxied.data, proxied: true, backendUsed: 'sidecar' });
    }
  }
  return handleDirect(req, res, 'serial', { backendParam, haveSidecarEnv });
}
