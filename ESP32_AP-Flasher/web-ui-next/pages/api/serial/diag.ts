import type { NextApiRequest, NextApiResponse } from 'next';
import { ensureSerialApiEnabled, serialManager } from '../../../lib/server/serialManager';

async function probeSidecar(url: string) {
  try {
    const r = await fetch(url.replace(/\/$/, '') + '/status', { method: 'GET' });
    if (!r.ok) return { reachable: false, status: r.status };
    const js = await r.json().catch(() => ({}));
    return { reachable: true, status: r.status, bodyKeys: Object.keys(js || {}) };
  } catch (e: any) {
    return { reachable: false, error: e.message };
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const haveSidecarEnv = !!process.env.SERIAL_SIDECAR_URL;
  const sidecarProbe = haveSidecarEnv ? await probeSidecar(process.env.SERIAL_SIDECAR_URL!) : null;
  const desiredPort = process.env.DEFAULT_SERIAL_PORT || process.env.SERIAL_PORT || 'COM5';
  const baud = Number(process.env.DEFAULT_SERIAL_BAUD || process.env.SERIAL_BAUD || 115200);
  let serialEnabled = true;
  try { ensureSerialApiEnabled(); } catch { serialEnabled = false; }
  const state = serialManager.getState();
  let ports: any[] = [];
  try { ports = await serialManager.listPorts(); } catch { /* ignore */ }
  return res.status(200).json({
    ok: true,
    backendDecisionExample: haveSidecarEnv ? 'auto -> sidecar (SERIAL_SIDECAR_URL present)' : 'auto -> serial (no sidecar env)',
    env: {
      SERIAL_SIDECAR_URL: haveSidecarEnv ? 'set' : 'unset',
      DEFAULT_SERIAL_PORT: process.env.DEFAULT_SERIAL_PORT || null,
      SERIAL_PORT: process.env.SERIAL_PORT || null,
      ENABLE_SERIAL_API: process.env.ENABLE_SERIAL_API || null
    },
    desiredPort,
    baud,
    serialEnabled,
    sidecarProbe,
    serialState: state,
    availablePorts: ports.map(p => ({ path: (p as any).path, manufacturer: (p as any).manufacturer, serialNumber: (p as any).serialNumber })),
    guidance: haveSidecarEnv ? 'If scan failing: confirm sidecar reachable, or unset SERIAL_SIDECAR_URL to force direct serial. Ensure port matches desiredPort.' : 'If scan failing: verify device on desiredPort, not locked by another program. Optionally set SERIAL_SIDECAR_URL to use sidecar.'
  });
}
