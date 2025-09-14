import { beforeEach, describe, expect, it } from 'vitest';
import handler from '../pages/api/device/[...path]';

interface MockReq {
  method: string;
  headers: Record<string, string>;
  query: { path: string[] };
  body?: any;
}
interface MockRes {
  status: (code: number) => MockRes;
  json: (data: any) => any;
  send: (data: any) => any;
  setHeader: (k: string, v: string) => void;
  _status?: number;
  _json?: any;
}

function createRes(): MockRes {
  const res: MockRes = {
    status(code: number) { this._status = code; return this; },
    json(data: any) { this._json = data; return data; },
    send(data: any) { this._json = data; return data; },
    setHeader() { /* noop */ }
  } as any;
  return res;
}

// Helper to invoke the Next.js API route directly
async function callProxy(path: string[], opts: { headers?: Record<string, string>, method?: string, body?: any } = {}) {
  const req: MockReq = {
    method: opts.method || 'GET',
    headers: { ...(opts.headers || {}) },
    query: { path },
    body: opts.body
  };
  const res = createRes();
  await handler(req as any, res as any);
  return { status: res._status, json: res._json };
}

// Build a fetch mock that supports AbortController and dynamic behavior per URL.
function buildAbortableFetcher(respond: (url: string, init: any) => Promise<({ type: 'json', body: any, status?: number, headers?: Record<string, string> }) | ({ type: 'text', body: string, status?: number, headers?: Record<string, string> })>) {
  return (url: string, init: any = {}) => {
    const signal: AbortSignal | undefined = init.signal;
    let aborted = false;
    return new Promise(async (resolve, reject) => {
      const onAbort = () => {
        aborted = true;
        const err: any = new Error('Aborted');
        err.name = 'AbortError';
        reject(err);
      };
      if (signal) {
        if (signal.aborted) { onAbort(); return; }
        signal.addEventListener('abort', onAbort, { once: true });
      }
      try {
        const r = await respond(url, init);
        if (aborted) return; // already aborted
        const status = r.status ?? 200;
        const headersObj = r.headers || { 'content-type': r.type === 'json' ? 'application/json' : 'text/plain' };
        const response = {
          ok: status >= 200 && status < 300,
          status,
          headers: { get: (k: string) => headersObj[k.toLowerCase()] || headersObj[k] || (k.toLowerCase() === 'content-type' ? headersObj['content-type'] : undefined) }
        } as any;
        if (r.type === 'json') {
          response.json = async () => r.body;
          response.text = async () => JSON.stringify(r.body);
        } else {
          response.text = async () => r.body;
          response.json = async () => { throw new Error('not json'); };
        }
        resolve(response);
      } catch (e) {
        if (!aborted) reject(e);
      }
    });
  };
}

describe('device proxy wifi scan resilience', () => {
  beforeEach(() => {
    // Reset fetch between tests
    // @ts-ignore
    global.fetch = undefined;
  });

  it('falls back to legacy /wifi_scan when unified scan kick times out', async () => {
    const legacyNetworks = [{ ssid: 'LegacyNet', rssi: -40 }];
    // State to control which request we are seeing
    // We simulate timeout for /api/wifi/scan by never resolving until abort
    // and immediate success for /wifi_scan
    // @ts-ignore
    global.fetch = buildAbortableFetcher(async (url) => {
      if (url.endsWith('/api/wifi/scan')) {
        // never resolve; rely on abort
        return new Promise(() => { /* aborted externally */ });
      }
      if (url.endsWith('/wifi_scan')) {
        return { type: 'json', body: { networks: legacyNetworks } };
      }
      throw new Error('Unexpected URL ' + url);
    });

    const { status, json } = await callProxy(['api', 'wifi', 'scan'], { headers: { 'x-device-base-url': 'http://device.local', 'x-device-timeout': '80' } });
    expect(status).toBe(200);
    expect(json.legacyFallback).toBe(true);
    expect(Array.isArray(json.networks)).toBe(true);
    expect(json.networks[0].ssid || json.networks[0].SSID).toBe('LegacyNet');
  }, 5000);

  it('returns stale scan cache on results timeout after a successful results fetch', async () => {
    const networks = [{ ssid: 'CachedNet', rssi: -55 }];
    let callCount = 0;
    // @ts-ignore
    global.fetch = buildAbortableFetcher(async (url) => {
      if (url.endsWith('/api/wifi/scan/results')) {
        callCount++;
        if (callCount === 1) {
          return { type: 'json', body: { networks } }; // initial success caches networks
        }
        // Subsequent call simulates timeout via never resolving promise
        return new Promise(() => { /* aborted */ });
      }
      throw new Error('Unexpected URL ' + url);
    });

    // First call (success)
    const first = await callProxy(['api', 'wifi', 'scan', 'results'], { headers: { 'x-device-base-url': 'http://device.local', 'x-device-timeout': '80' } });
    expect(first.status).toBe(200);
    expect(first.json.networks?.length).toBe(1);

    // Second call (timeout -> stale)
    const second = await callProxy(['api', 'wifi', 'scan', 'results'], { headers: { 'x-device-base-url': 'http://device.local', 'x-device-timeout': '80' } });
    expect(second.status).toBe(504);
    expect(second.json.error).toBe('upstream_timeout');
    expect(second.json.stale?.type).toBe('scan');
    expect(Array.isArray(second.json.stale?.networks)).toBe(true);
    expect(second.json.stale.networks[0].ssid || second.json.stale.networks[0].SSID).toBe('CachedNet');
  }, 8000);
});
