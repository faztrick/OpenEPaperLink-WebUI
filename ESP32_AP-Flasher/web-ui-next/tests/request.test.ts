import { describe, expect, it } from 'vitest';
import { requestJson } from '../lib/request';

// Simple smoke test mocking fetch via globalThis

describe('requestJson', () => {
  it('returns parsed JSON on 200', async () => {
    const prev = (globalThis as any).fetch;
    (globalThis as any).fetch = async () => ({ ok: true, json: async () => ({ a: 1 }) });
    const data = await requestJson('/x');
    expect(data).toEqual({ a: 1 });
    (globalThis as any).fetch = prev;
  });

  it('throws on non-ok status', async () => {
    const prev = (globalThis as any).fetch;
    (globalThis as any).fetch = async () => ({ ok: false, status: 500, json: async () => ({}) });
    await expect(requestJson('/x')).rejects.toThrow(/HTTP 500/);
    (globalThis as any).fetch = prev;
  });
});
