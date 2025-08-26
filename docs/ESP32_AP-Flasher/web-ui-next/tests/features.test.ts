import { beforeEach, describe, expect, it } from 'vitest';
import { classifyFeatureValue, fetchDeviceFeatures } from '../lib/legacy/features';

// Helper to mock fetch
function mockFetch(respond: (url:string)=>any | Promise<any>, ok = true){
  // @ts-ignore
  global.fetch = (async (url: string) => ({ ok, json: async () => respond(url) })) as any;
}

describe('features module', () => {
  beforeEach(() => { /* reset */ });

  it('normalizes array into object map', async () => {
    mockFetch(()=> ['A','B']);
    const r = await fetchDeviceFeatures('dev1');
    expect(r.ok).toBe(true);
    expect(Object.keys(r.features).sort()).toEqual(['A','B']);
  });

  it('classifyFeatureValue logic', () => {
    expect(classifyFeatureValue(1)).toBe(true);
    expect(classifyFeatureValue('1')).toBe(true);
    expect(classifyFeatureValue('0')).toBe(false);
    expect(classifyFeatureValue('false')).toBe(false);
    expect(classifyFeatureValue(null)).toBe(false);
  });

  it('handles error path', async () => {
    // @ts-ignore
    global.fetch = (async () => ({ ok: false, json: async () => ({}) })) as any;
    const r = await fetchDeviceFeatures('dev1');
    expect(r.ok).toBe(false);
    expect(r.features).toEqual({});
  });
});
