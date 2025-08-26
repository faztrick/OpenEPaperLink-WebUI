import { useCallback, useEffect, useState } from 'react';
import { DeviceFeaturesMap, classifyFeatureValue, fetchDeviceFeatures } from '../lib/legacy/features';

export interface UseDeviceFeaturesOptions { refreshMs?: number; auto?: boolean }

export function useDeviceFeatures(deviceId?: string | null, opts: UseDeviceFeaturesOptions = {}) {
  const { refreshMs = 15000, auto = true } = opts;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [features, setFeatures] = useState<DeviceFeaturesMap>({});
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!deviceId) return;
    setLoading(true); setError(null);
    const res = await fetchDeviceFeatures(deviceId);
    if (res.ok) { setFeatures(res.features); setFetchedAt(res.fetchedAt); }
    else { setError(res.error || 'Failed'); setFeatures({}); setFetchedAt(res.fetchedAt); }
    setLoading(false);
  }, [deviceId]);

  useEffect(() => { if (auto && deviceId) { load(); } }, [deviceId, auto, load]);
  useEffect(() => {
    if (!auto || !deviceId || !refreshMs) return;
    const id = setInterval(() => load(), refreshMs);
    return () => clearInterval(id);
  }, [auto, deviceId, refreshMs, load]);

  const list = Object.keys(features).sort().map(k => ({ name: k, enabled: classifyFeatureValue(features[k]) }));

  return { loading, error, features, list, fetchedAt, reload: load };
}
