import { beforeEach, describe, expect, it } from 'vitest';
import handler from '../pages/api/device/[...path]';

interface MockReq { method: string; headers: Record<string, string>; query: { path: string[] }; body?: any; }
interface MockRes { status: (code: number) => MockRes; json: (data: any) => any; send: (data: any) => any; setHeader: (k: string, v: string) => void; _status?: number; _json?: any; }

function createRes(): MockRes { return { status(c: number) { this._status = c; return this; }, json(d: any) { this._json = d; return d; }, send(d: any) { this._json = d; return d; }, setHeader() { } } as any; }

async function callProxy(path: string[], opts: { headers?: Record<string, string>, method?: string, body?: any } = {}) {
  const req: MockReq = { method: opts.method || 'GET', headers: { ...(opts.headers || {}) }, query: { path }, body: opts.body };
  const res = createRes();
  await handler(req as any, res as any);
  return { status: res._status, json: res._json };
}

function buildAbortableFetcher(respond: (url: string, init: any) => Promise<{ type: 'json' | 'text', body: any, status?: number, headers?: Record<string, string> }>) {
  return (url: string, init: any = {}) => {
    const signal: AbortSignal | undefined = init.signal;
    let aborted = false;
    return new Promise(async (resolve, reject) => {
      const onAbort = () => { aborted = true; const e: any = new Error('Aborted'); e.name = 'AbortError'; reject(e); };
      if (signal) { if (signal.aborted) { onAbort(); return; } signal.addEventListener('abort', onAbort, { once: true }); }
      try {
        const r = await respond(url, init);
        if (aborted) return;
        const status = r.status ?? 200;
        const headersObj = r.headers || { 'content-type': r.type === 'json' ? 'application/json' : 'text/plain' };
        const response = { ok: status >= 200 && status < 300, status, headers: { get: (k: string) => headersObj[k.toLowerCase()] || headersObj[k] || (k.toLowerCase() === 'content-type' ? headersObj['content-type'] : undefined) } } as any;
        if (r.type === 'json') { response.json = async () => r.body; response.text = async () => JSON.stringify(r.body); } else { response.text = async () => r.body; response.json = async () => { throw new Error('not json'); }; }
        resolve(response);
      } catch (e) { if (!aborted) reject(e); }
    });
  };
}

describe('device proxy wifi status resilience', () => {
  beforeEach(() => {
    // @ts-ignore
    global.fetch = undefined;
  });

  it('falls back from legacy status to v1 status on legacy timeout', async () => {
    const statusObj = { connected: true, ssid: 'TestNet', ip: '1.2.3.4' };
    // @ts-ignore
    global.fetch = buildAbortableFetcher(async (url) => {
      if (url.endsWith('/api/wifi/status')) {
        // never resolves -> abort
        return new Promise(() => { /* aborted */ });
      }
      if (url.endsWith('/api/v1/wifi/status')) {
        return { type: 'json', body: statusObj };
      }
      throw new Error('Unexpected URL ' + url);
    });
    const { status, json } = await callProxy(['api', 'wifi', 'status'], { headers: { 'x-device-base-url': 'http://device.local', 'x-device-timeout': '60' } });
    expect(status).toBe(200);
    expect(json.connected).toBe(true);
    expect(json.ssid).toBe('TestNet');
  }, 4000);

  it('returns stale status after both legacy and v1 time out (using cached prior success)', async () => {
    const statusObj = { connected: true, ssid: 'CacheNet', ip: '10.0.0.5' };
    // Step 1: successful v1 fetch to seed cache
    // @ts-ignore
    global.fetch = buildAbortableFetcher(async (url) => {
      if (url.endsWith('/api/v1/wifi/status')) return { type: 'json', body: statusObj };
      if (url.endsWith('/api/wifi/status')) return { type: 'json', body: statusObj };
      throw new Error('Unexpected URL ' + url);
    });
    const prime = await callProxy(['api', 'v1', 'wifi', 'status'], { headers: { 'x-device-base-url': 'http://device.local', 'x-device-timeout': '80' } });
    expect(prime.status).toBe(200);
    // Step 2: both legacy and v1 attempts abort -> expect stale in 504
    // @ts-ignore
    global.fetch = buildAbortableFetcher(async (url) => {
      if (url.endsWith('/api/wifi/status')) return new Promise(() => { }); // abort
      if (url.endsWith('/api/v1/wifi/status')) return new Promise(() => { }); // abort
      throw new Error('Unexpected URL ' + url);
    });
    const timeoutResp = await callProxy(['api', 'wifi', 'status'], { headers: { 'x-device-base-url': 'http://device.local', 'x-device-timeout': '60' } });
    expect(timeoutResp.status).toBe(504);
    expect(timeoutResp.json.error).toBe('upstream_timeout');
    expect(timeoutResp.json.stale?.type).toBe('status');
    expect(timeoutResp.json.stale?.data?.ssid).toBe('CacheNet');
  }, 6000);
});
