import type { NextApiRequest, NextApiResponse } from 'next';

// Proxy arbitrary device (firmware) API calls to a configured base URL.
// Environment variable: DEVICE_BASE_URL (e.g. http://192.168.4.1 or http://bridge.local)
// Usage from frontend: fetch('/api/device/api/wifi/status') -> forwards to `${DEVICE_BASE_URL}/api/wifi/status`.

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const base = process.env.DEVICE_BASE_URL;
  if (!base) {
    return res.status(500).json({ error: 'device_base_url_not_set', message: 'Set DEVICE_BASE_URL env var to use device proxy.' });
  }
  const segments = (req.query.path || []) as string[];
  const targetPath = segments.join('/');
  const url = base.replace(/\/$/, '') + '/' + targetPath;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const init: RequestInit = { method: req.method, headers: {} };
    // Forward JSON or form bodies
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
    const r = await fetch(url, init as any);
    const ct = r.headers.get('content-type') || '';
    res.status(r.status);
    if (ct.includes('application/json')) {
      try {
        const data = await r.json();
        return res.json({ proxied: true, target: url, status: r.status, ...data });
      } catch (e: any) {
        return res.json({ proxied: true, target: url, status: r.status, rawError: 'json_parse_failed', message: e.message });
      }
    } else {
      const text = await r.text();
      res.setHeader('content-type', ct || 'text/plain');
      return res.send(text);
    }
  } catch (e: any) {
    const aborted = e.name === 'AbortError';
    return res.status(504).json({ error: aborted ? 'device_proxy_timeout' : 'device_proxy_error', message: e.message, target: url });
  } finally {
    clearTimeout(timeout);
  }
}
