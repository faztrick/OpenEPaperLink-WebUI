import type { NextApiRequest, NextApiResponse } from 'next';
import { ensureSerialApiEnabled, serialManager } from '../../../../lib/server/serialManager';

async function proxyToSidecar(req: NextApiRequest, res: NextApiResponse) {
  const baseRaw = process.env.SERIAL_SIDECAR_URL;
  if (!baseRaw) {
    // Should not happen after useSidecar guard, but be defensive.
    return res.status(500).json({ error: 'sidecar_not_configured', message: 'SERIAL_SIDECAR_URL env not set' });
  }
  // Normalize base (strip trailing slashes)
  const base = baseRaw.replace(/\/+$/, '');
  try {
    const body = { minRssi: (req.body?.minRssi ?? req.query.minRssi), top: (req.body?.top ?? req.query.top) };
    const r = await fetch(base + '/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const txt = await r.text();
    try {
      const json = JSON.parse(txt);
      json.proxied = true;
      res.status(r.status).json(json);
    } catch {
      res.status(r.status).send(txt);
    }
  } catch (e: any) {
    res.status(502).json({ error: 'Sidecar proxy failed: ' + e.message });
  }
}

// Starts a WiFi scan via serial CLI command 'wifiscan' and returns parsed networks.
// Optional query/body params:
//  minRssi: number (filter networks with rssi >= minRssi)
//  top: number (limit to strongest N by rssi)
// Response shape: { success:true, count, summaryCount, networks:[ { ssid,rssi,channel,enc,bssid } ], rawLineCount, timedOut, elapsedMs }
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try { ensureSerialApiEnabled(); } catch (e: any) { return res.status(400).json({ error: e.message }); }

  // Accept params either via JSON body or query string
  let minRssi: number | undefined; let top: number | undefined;
  try {
    if (req.body && typeof req.body === 'object') {
      if (req.body.minRssi !== undefined) minRssi = Number(req.body.minRssi);
      if (req.body.top !== undefined) top = Number(req.body.top);
    }
    if (req.query.minRssi !== undefined) minRssi = Number(req.query.minRssi);
    if (req.query.top !== undefined) top = Number(req.query.top);
  } catch {/* ignore parse issues */ }

  // Backend override: backend=serial|sidecar|auto (default auto)
  const backendParam = (req.query.backend || req.body?.backend || 'auto') as string;
  const wantSidecar = backendParam === 'sidecar';
  const wantSerial = backendParam === 'serial';
  const haveSidecarEnv = !!process.env.SERIAL_SIDECAR_URL;
  // Only use sidecar when env is present. Explicit sidecar request without env falls back to serial.
  const useSidecar = haveSidecarEnv && (wantSidecar || (!wantSerial));
  const backendDecision = {
    backendParam,
    haveSidecarEnv,
    wantSidecar,
    wantSerial,
    chosen: useSidecar ? 'sidecar' : 'serial'
  };
  if (useSidecar) {
    return proxyToSidecar(req, res);
  }
  const state = serialManager.getState();
  const requestedPort = (req.body?.port || req.query.port) as string | undefined;
  const desiredPort = requestedPort || process.env.DEFAULT_SERIAL_PORT || process.env.SERIAL_PORT || 'COM5';
  const baud = Number(process.env.DEFAULT_SERIAL_BAUD || process.env.SERIAL_BAUD || state.baudRate || 115200);
  let openedTemporarily = false;

  // Auto-open logic with small retry loop (helps when another hot-reload process just released it)
  if (!state.isOpen) {
    const maxAttempts = 5;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        await serialManager.open(desiredPort, baud);
        openedTemporarily = true;
        break;
      } catch (e: any) {
        const msg = (e?.message || '').toLowerCase();
        const transient = msg.includes('access denied') || msg.includes('busy') || msg.includes('cannot open');
        if (attempt === maxAttempts || !transient) {
          let ports: any[] = [];
          try { ports = await serialManager.listPorts(); } catch { /* ignore */ }
          return res.status(502).json({
            error: 'port_open_failed',
            message: `Failed to open serial port ${desiredPort}: ${e.message}`,
            port: desiredPort,
            backendUsed: 'serial',
            attempts: attempt,
            transient,
            availablePorts: ports.map(p => ({ path: (p as any).path, manufacturer: (p as any).manufacturer, serialNumber: (p as any).serialNumber })),
            guidance: 'Close other programs using the port (serial monitor, IDE, flashing tool). On Windows, ensure driver installed. If device recently flashed, wait a few seconds and retry.',
            backendDecision
          });
        }
        await new Promise(r => setTimeout(r, 150));
      }
    }
  }

  try {
    const result = await serialManager.execCli('wifiscan', 8000); // allow more time for scan
    const networks: any[] = [];
    let summaryCount: number | undefined = undefined;
    for (const l of result.lines) {
      if (!l.raw.startsWith('{')) continue; // only parse JSON-like lines
      try {
        const obj = JSON.parse(l.raw);
        if (obj.event === 'wifiscan_summary') { summaryCount = obj.count; }
        else if (obj.event === 'wifinet') {
          networks.push({ ssid: obj.ssid, rssi: obj.rssi, channel: obj.channel, enc: obj.enc, bssid: obj.bssid });
        }
      } catch { /* ignore parse errors */ }
    }

    // Filtering
    let filtered = networks;
    if (typeof minRssi === 'number' && !Number.isNaN(minRssi)) {
      filtered = filtered.filter(n => typeof n.rssi === 'number' ? n.rssi >= minRssi : true);
    }
    if (typeof top === 'number' && !Number.isNaN(top) && top > 0) {
      filtered = filtered.sort((a, b) => (b.rssi ?? -999) - (a.rssi ?? -999)).slice(0, top);
    }

    const debug = req.query.debug === '1' || req.body?.debug === '1';
    res.status(200).json({
      success: true,
      count: filtered.length,
      summaryCount: summaryCount ?? networks.length,
      networks: filtered,
      rawLineCount: result.lines.length,
      timedOut: result.timedOut,
      elapsedMs: result.elapsedMs,
      appliedFilters: { minRssi, top },
      openedTemporarily,
      port: desiredPort,
      proxied: false,
      backendUsed: 'serial',
      backendDecision: { ...backendDecision, requestedPort: requestedPort || null, effectivePort: desiredPort },
      ...(debug ? { stateBefore: state, networksUnfiltered: networks } : {})
    });
  } catch (e: any) {
    const recent = serialManager.getLog({ tail: 25 }).map(l => l.raw);
    res.status(500).json({ error: 'unexpected', message: e.message, backendUsed: 'serial', recentLines: recent, backendDecision });
  } finally {
    if (openedTemporarily) {
      try { await serialManager.close(); } catch {/* ignore */ }
    }
  }
}
