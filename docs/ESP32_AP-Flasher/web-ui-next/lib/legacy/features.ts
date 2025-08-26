// Migration of legacy device-features.js to a reusable module
// Provides fetchDeviceFeatures(deviceId) and normalisation logic.

export interface DeviceFeaturesMap { [name: string]: any }

export interface FeaturesResult {
  ok: boolean;
  features: DeviceFeaturesMap;
  error?: string;
  fetchedAt: number;
}

async function request(url: string, timeoutMs = 4000): Promise<any> {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const resp = await fetch(url, { signal: ctrl.signal });
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    return await resp.json();
  } finally { clearTimeout(to); }
}

export async function fetchDeviceFeatures(deviceId: string): Promise<FeaturesResult> {
  try {
    // Expect API: /api/device/[id]/features returning object or {features:object} or list
    const raw = await request(`/api/device/${encodeURIComponent(deviceId)}/features`);
    let obj: DeviceFeaturesMap;
    if (Array.isArray(raw)) {
      obj = raw.reduce((acc: DeviceFeaturesMap, k: string) => { acc[k] = 1; return acc; }, {});
    } else if (raw && Array.isArray(raw.features)) {
      obj = raw.features.reduce((acc: DeviceFeaturesMap, k: string) => { acc[k] = 1; return acc; }, {});
    } else if (raw && typeof raw.features === 'object') {
      obj = raw.features as DeviceFeaturesMap;
    } else if (raw && typeof raw === 'object') {
      obj = raw as DeviceFeaturesMap;
    } else {
      obj = {};
    }
    return { ok: true, features: obj, fetchedAt: Date.now() };
  } catch (e: any) {
    return { ok: false, features: {}, error: e.message, fetchedAt: Date.now() };
  }
}

export function classifyFeatureValue(val: any): boolean {
  if (!val) return false;
  if (val === '0' || val === 'false') return false;
  return true;
}
