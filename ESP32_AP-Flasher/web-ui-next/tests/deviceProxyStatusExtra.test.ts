import { beforeEach, describe, expect, it } from 'vitest';
import handler from '../pages/api/device/[...path]';

interface MockReq { method: string; headers: Record<string, string>; query: { path: string[] }; body?: any; }
interface MockRes { status: (c: number) => MockRes; json: (d: any) => any; send: (d: any) => any; setHeader: (k: string, v: string) => void; _status?: number; _json?: any; }

function createRes(): MockRes { return { status(c: number) { this._status = c; return this; }, json(d: any) { this._json = d; return d; }, send(d: any) { this._json = d; return d; }, setHeader() { } } as any; }
async function callProxy(path: string[], headers: Record<string, string> = {}, method = 'GET') { const req: MockReq = { method, headers, query: { path } }; const res = createRes(); await handler(req as any, res as any); return { status: res._status, json: res._json }; }

function buildAbortableFetcher(respond: (url: string, init: any) => Promise<{ type: 'json' | 'text', body: any, status?: number, headers?: Record<string, string> }>) {
  return (url: string, init: any = {}) => {
    const signal: AbortSignal | undefined = init.signal; let aborted = false;
    return new Promise(async (resolve, reject) => {
      const onAbort = () => { aborted = true; const e: any = new Error('Aborted'); e.name = 'AbortError'; reject(e); };
      if (signal) { if (signal.aborted) { onAbort(); return; } signal.addEventListener('abort', onAbort, { once: true }); }
      try { const r = await respond(url, init); if (aborted) return; const status = r.status ?? 200; const headersObj = r.headers || { 'content-type': r.type === 'json' ? 'application/json' : 'text/plain' }; const response: any = { ok: status >= 200 && status < 300, status, headers: { get: (k: string) => headersObj[k.toLowerCase()] || headersObj[k] || (k.toLowerCase() === 'content-type' ? headersObj['content-type'] : undefined) } }; if (r.type === 'json') { response.json = async () => r.body; response.text = async () => JSON.stringify(r.body); } else { response.text = async () => r.body; response.json = async () => { throw new Error('not json'); }; } resolve(response); } catch (e) { if (!aborted) reject(e); }
    });
  };
}

describe('device proxy status cache preference & timeout clamp', () => {
  beforeEach(() => { // @ts-ignore
    global.fetch = undefined;
  });

  it('uses newest between legacy & v1 cached for stale return', async () => {
    const baseHeaders = { 'x-device-base-url': 'http://device.local', 'x-device-timeout': '70' };
    // Phase 1: seed legacy (older)
    // @ts-ignore
    global.fetch = buildAbortableFetcher(async (url) => {
      if (url.endsWith('/api/wifi/status')) return { type: 'json', body: { connected: true, ssid: 'LEG', ts: 1 } };
      throw new Error('Unexpected ' + url);
    });
    const seedLegacy = await callProxy(['api', 'wifi', 'status'], baseHeaders);
    expect(seedLegacy.status).toBe(200);

    // Phase 2: seed v1 (newer) after slight delay to ensure timestamp difference in cache selection logic
    await new Promise(r => setTimeout(r, 15));
    // @ts-ignore
    global.fetch = buildAbortableFetcher(async (url) => {
      if (url.endsWith('/api/v1/wifi/status')) return { type: 'json', body: { connected: true, ssid: 'V1NEW', ts: 2 } };
      throw new Error('Unexpected ' + url);
    });
    const seedV1 = await callProxy(['api', 'v1', 'wifi', 'status'], baseHeaders);
    expect(seedV1.status).toBe(200);

    // Phase 3: cause both to timeout -> expect stale selecting v1 variant
    // @ts-ignore
    global.fetch = buildAbortableFetcher(async (url) => {
      if (url.endsWith('/api/wifi/status')) return new Promise(() => { }); // abort
      if (url.endsWith('/api/v1/wifi/status')) return new Promise(() => { }); // abort
      throw new Error('Unexpected ' + url);
    });
    const staleResp = await callProxy(['api', 'wifi', 'status'], baseHeaders);
    expect(staleResp.status).toBe(504);
    expect(staleResp.json.stale?.type).toBe('status');
    expect(staleResp.json.stale?.data?.ssid).toBe('V1NEW');
  }, 7000);

  it('clamps timeout below 500ms to 500ms in 504 response metadata', async () => {
    // @ts-ignore
    global.fetch = buildAbortableFetcher(async (url) => {
      if (url.endsWith('/api/wifi/status')) return new Promise(() => { }); // force abort
      if (url.endsWith('/api/v1/wifi/status')) return new Promise(() => { }); // fallback also aborts
      throw new Error('Unexpected ' + url);
    });
    const resp = await callProxy(['api', 'wifi', 'status'], { 'x-device-base-url': 'http://device.local', 'x-device-timeout': '120' });
    // Provided 120ms < 500 should clamp to 500; we assert timeoutMs >= 500 and equals 500
    expect(resp.status).toBe(504);
    expect(resp.json.timeoutMs).toBeGreaterThanOrEqual(500);
    expect(resp.json.timeoutMs).toBe(500);
  }, 4000);
});
