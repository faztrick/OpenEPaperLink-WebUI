// Versioned Wi-Fi API client (prefers /api/v1/wifi/*, falls back to legacy /api/wifi/*)
// Keeps the legacy module (`lib/legacy/wifi.ts`) intact during migration.
// Once firmware drops legacy endpoints this file becomes the single source.

import { transport } from './transport';

export interface WifiNetwork { ssid: string; rssi?: number; security?: string; channel?: number; }
export interface WifiStatus { connected: boolean; ssid?: string; ip?: string; rssi?: number; channel?: number; mode?: string; updatedAt: number }

interface FallbackOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: BodyInit | null;
  accept404?: boolean; // if true, treat 404 as normal result for fallback logic
}

async function tryV1ThenLegacy<T = any>(v1Path: string, legacyPath: string, opts: FallbackOptions = {}): Promise<{ json: T; used: 'v1' | 'legacy' }> {
  const t = transport();
  const attempt = async (path: string) => {
    try {
      const method = opts.method || 'GET';
      const rel = path.startsWith('/') ? path : ('/' + path);
      let json: any;
      if (method === 'GET') json = await t.get(rel);
      else json = await t.post(rel, opts.body ?? {} , { headers: opts.headers });
      return { ok: true, status: 200, json } as any;
    } catch (e: any) {
      // Expose minimal shape similar to fetch Response for fallback logic
      return { ok: false, status: e?.status || 500, json: {} } as any;
    }
  };

  // First try versioned endpoint
  try {
    const { ok, status, json } = await attempt(v1Path);
    if (ok) return { json, used: 'v1' };
    // If not 404 or explicitly allowed, try legacy path anyway
    if (status !== 404 && !opts.accept404) {
      // Some other failure: still attempt legacy as resilience measure
      // (e.g., early firmware build without v1 path returning 500)
    }
  } catch (e) {
    // Network error -> allow fallback
  }
  const { ok: lok, status: lstatus, json: legacyJson } = await attempt(legacyPath);
  if (!lok) {
    const msg = (legacyJson && (legacyJson.error || legacyJson.message)) || `HTTP ${lstatus}`;
    throw new Error(msg);
  }
  return { json: legacyJson, used: 'legacy' };
}

export async function wifiStatus(): Promise<WifiStatus> {
  const { json } = await tryV1ThenLegacy<any>('/api/v1/wifi/status', '/api/wifi/status');
  // Some legacy wrappers may return {deprecated:true,use:"/api/v1/..."}; if so, ignore and use nested fetch if provided.
  if (json && json.deprecated && json.use) {
    // Attempt the provided path once (already tried v1 first, so this is usually redundant but safe)
    try {
      const t = transport();
      const j2: any = await t.get(json.use.startsWith('/') ? json.use : ('/' + json.use));
      return { connected: !!j2.connected, ssid: j2.ssid, ip: j2.ip, rssi: j2.rssi, channel: j2.channel, mode: j2.mode, updatedAt: Date.now() };
    } catch { /* ignore and fall back */ }
  }
  return { connected: !!json.connected, ssid: json.ssid, ip: json.ip, rssi: json.rssi, channel: json.channel, mode: json.mode, updatedAt: Date.now() };
}

export async function wifiScan(): Promise<WifiNetwork[]> {
  // Start scan (fire & forget errors propagate)
  await tryV1ThenLegacy('/api/v1/wifi/scan', '/api/wifi/scan');
  const { json } = await tryV1ThenLegacy<any>('/api/v1/wifi/scan/results', '/api/wifi/scan/results');
  const list = (json.networks || []).map((n: any) => ({
    ssid: n.ssid || n.SSID || n.name || '',
    rssi: n.rssi ?? n.RSSI,
    security: n.enc || n.encryption || n.auth || n.type || '',
    channel: n.channel || n.CH || n.ch
  }));
  return list;
}

export async function wifiConnect(ssid: string, password: string) {
  // Prefer JSON on v1, fallback form on legacy if needed
  const bodyJson = JSON.stringify({ ssid, password });
  try {
    const { json } = await tryV1ThenLegacy<any>(
      '/api/v1/wifi/connect',
      '/api/wifi/connect',
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: bodyJson }
    );
    if (json.success === false) throw new Error(json.error || 'connect failed');
    return true;
  } catch (e) {
    // Attempt legacy form-encoded if JSON failed entirely (use transport.post with encoded body string)
    const fd = new URLSearchParams(); fd.set('ssid', ssid); fd.set('password', password);
    const t = transport();
    try {
      const j = await t.post('/api/wifi/connect', fd.toString(), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
      if (j?.success === false) throw new Error(j.error || 'connect failed');
      return true;
    } catch (ee) {
      throw ee instanceof Error ? ee : new Error('connect failed');
    }
  }
}

export async function wifiDisconnect() {
  const { json } = await tryV1ThenLegacy<any>(
    '/api/v1/wifi/disconnect',
    '/api/wifi/disconnect',
    { method: 'POST' }
  );
  if (json.success === false) throw new Error(json.error || 'disconnect failed');
  return true;
}

// Optionally expose which path set was used (for telemetry / UI hints)
export async function detectWifiApiGeneration(): Promise<'v1' | 'legacy'> {
  try {
    const t = transport();
    await t.get('/api/v1/wifi/status');
    return 'v1';
  } catch { /* ignore */ }
  return 'legacy';
}
