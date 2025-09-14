import type { NextApiRequest, NextApiResponse } from 'next';

// Device proxy route with adaptive (shorter) timeouts, optional override, and
// stale cache fallback for high-frequency status endpoints.
// Resolution order for base URL:
// 1. DEVICE_BASE_URL env var
// 2. x-device-base-url header (trusted from same-origin frontend)
// If neither present -> 400 error (client must select / configure device).
//
// Enhancements:
// - Reduced default timeout (7s) vs prior 15s to avoid 504 UX stalls.
// - Path-specific tighter timeout (wifi status endpoints -> 3500ms).
// - Optional X-Device-Timeout header (ms) clamped [500, 15000].
// - Simple in-memory cache for /api/wifi/status (and /api/v1/wifi/status) last good JSON.
// - On upstream timeout: returns HTTP 504 with error=upstream_timeout; includes stale data if available.
// - If legacy status path times out, will attempt versioned path (/api/v1/wifi/status) once (and vice versa) before failing.

interface CachedEntry { data: any; ts: number; }
const statusCache: { legacy?: CachedEntry; v1?: CachedEntry } = {};
interface ScanCacheEntry { networks: any[]; ts: number; durationMs?: number; unified?: boolean; legacyEndpoint?: string; }
let lastScanCache: ScanCacheEntry | null = null;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const envBase = process.env.DEVICE_BASE_URL;
  const headerBase = (req.headers['x-device-base-url'] as string | undefined)?.trim();
  const base = (envBase && envBase.trim()) || headerBase;
  if (!base) {
    return res.status(400).json({ error: 'device_base_url_not_set', message: 'Provide DEVICE_BASE_URL env or x-device-base-url header.' });
  }

  const segments = (req.query.path || []) as string[];
  const targetPath = segments.join('/');

  // Determine if this is a wifi status path (legacy or v1) for special handling.
  const isLegacyStatus = targetPath === 'api/wifi/status';
  const isV1Status = targetPath === 'api/v1/wifi/status';
  const isScanKick = targetPath === 'api/wifi/scan';
  const isScanResults = targetPath === 'api/wifi/scan/results';

  // Allow client override of timeout (ms) within bounds; else choose defaults.
  const overrideStr = req.headers['x-device-timeout'] as string | undefined;
  let override = overrideStr ? parseInt(overrideStr, 10) : NaN;
  if (Number.isNaN(override)) override = 0;
  if (override) override = Math.min(15000, Math.max(500, override));

  const baseDefault = 7000; // general default
  const statusTight = 3500; // wifi status specific tighter timeout
  const scanKickTight = 3000; // kick should respond quickly
  const scanResultsTight = 5000; // polling for results shorter than general
  const timeoutMs = override || (isLegacyStatus || isV1Status ? statusTight : isScanKick ? scanKickTight : isScanResults ? scanResultsTight : baseDefault);

  // Helper to perform one fetch attempt.
  async function attempt(path: string) {
    const url = base.replace(/\/$/, '') + '/' + path;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const init: RequestInit = { method: req.method, headers: {} };
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        if (req.headers['content-type']?.includes('application/json')) {
          init.body = JSON.stringify(req.body);
          (init.headers as any)['content-type'] = 'application/json';
        } else if (typeof req.body === 'string') {
          init.body = req.body;
        } else if (req.body) {
          try { init.body = JSON.stringify(req.body); (init.headers as any)['content-type'] = 'application/json'; } catch { /* ignore */ }
        }
      }
      (init.headers as any)['x-proxy-from'] = 'next-device-proxy';
      init.signal = controller.signal;
      const started = Date.now();
      const r = await fetch(url, init as any);
      const elapsed = Date.now() - started;
      const ct = r.headers.get('content-type') || '';
      let body: any;
      if (ct.includes('application/json')) {
        try { body = await r.json(); } catch (e: any) { body = { rawError: 'json_parse_failed', message: e.message }; }
      } else {
        body = await r.text();
      }
      return { ok: true, response: r, contentType: ct, body, url, elapsed };
    } catch (e: any) {
      const aborted = e.name === 'AbortError';
      return { ok: false, aborted, error: e, url };
    }
  }

  // Primary attempt path.
  let primaryPath = targetPath;
  let fallbackPath: string | null = null;
  if (isLegacyStatus) fallbackPath = 'api/v1/wifi/status';
  else if (isV1Status) fallbackPath = 'api/wifi/status';

  // Execute primary attempt.
  const primary = await attempt(primaryPath);

  // If timeout/abort and we have fallback path (status) try once more quickly (same timeout still applies).
  let secondary: any = null;
  if (!primary.ok && primary.aborted && fallbackPath) {
    secondary = await attempt(fallbackPath);
  }

  // Decide which result to use.
  const result = (secondary && secondary.ok) ? secondary : primary;

  // If successful.
  if (result.ok && result.response) {
    const r = result.response;
    const ct = result.contentType;
    res.status(r.status);
    if (ct.includes('application/json')) {
      const data = { proxied: true, target: result.url, status: r.status, elapsedMs: result.elapsed, ... (typeof result.body === 'object' ? result.body : { value: result.body }) };
      // Cache wifi status on 2xx only.
      if (r.ok && (isLegacyStatus || isV1Status)) {
        const cacheKey = isLegacyStatus ? 'legacy' : (isV1Status ? 'v1' : null);
        if (cacheKey) statusCache[cacheKey] = { data, ts: Date.now() };
      }
      // For scan kick success: nothing to cache yet. For scan results: cache networks if present.
      if (r.ok && isScanResults) {
        try {
          const networks = (data as any).networks || (data as any).results || (data as any).scanResults;
          if (Array.isArray(networks) && networks.length) {
            lastScanCache = { networks, ts: Date.now(), durationMs: (data as any).scanDurationMs, unified: (data as any).unified, legacyEndpoint: (data as any).legacyEndpoint };
          }
        } catch { /* ignore */ }
      }
      return res.json(data);
    } else {
      res.setHeader('content-type', ct || 'text/plain');
      return res.send(result.body);
    }
  }

  // Failure handling.
  const aborted = result.aborted;
  const err: any = result.error || (secondary && secondary.error);
  const upstreamTimedOut = aborted;

  // Provide stale cache if available (status endpoints or scan results) when timeout happens.
  let stale: any = null;
  if (upstreamTimedOut) {
    if (isLegacyStatus || isV1Status) {
      const legacy = statusCache.legacy;
      const v1 = statusCache.v1;
      const chosen = (!legacy && v1) ? v1 : (!v1 && legacy) ? legacy : (legacy && v1) ? (legacy.ts >= v1.ts ? legacy : v1) : null;
      if (chosen) stale = { type: 'status', ageMs: Date.now() - chosen.ts, data: chosen.data };
    } else if (isScanResults && lastScanCache) {
      stale = { type: 'scan', ageMs: Date.now() - lastScanCache.ts, networks: lastScanCache.networks };
    }
  }

  // Special fallback flow: if scan kick times out, attempt legacy /wifi_scan once (direct) for backward compatibility.
  let legacyScanAttempt: any = null;
  if (upstreamTimedOut && isScanKick) {
    try {
      const legacyUrl = base.replace(/\/$/, '') + '/wifi_scan';
      const controller = new AbortController();
      const lt = setTimeout(() => controller.abort(), 6000);
      const r = await fetch(legacyUrl, { signal: controller.signal });
      clearTimeout(lt);
      if (r.ok) {
        let body: any = null; try { body = await r.json(); } catch { body = await r.text(); }
        const networks = Array.isArray((body as any)?.networks) ? (body as any).networks : (Array.isArray(body) ? body : []);
        if (Array.isArray(networks)) {
          lastScanCache = { networks, ts: Date.now(), unified: false, legacyEndpoint: '/wifi_scan' };
          return res.status(200).json({ proxied: true, legacyFallback: true, legacyEndpoint: '/wifi_scan', networks, elapsedMs: timeoutMs, status: 200 });
        }
        legacyScanAttempt = { status: r.status };
      }
    } catch (e: any) {
      legacyScanAttempt = { error: e.message };
    }
  }

  return res.status(504).json({
    error: upstreamTimedOut ? 'upstream_timeout' : 'device_proxy_error',
    message: err?.message || (upstreamTimedOut ? 'Upstream device timeout' : 'Proxy error'),
    target: base.replace(/\/$/, '') + '/' + primaryPath,
    attempted: [primaryPath, ...(fallbackPath ? [fallbackPath] : []), ...(legacyScanAttempt ? ['wifi_scan'] : [])],
    timeoutMs,
    stale,
    legacyScanAttempt
  });
}
