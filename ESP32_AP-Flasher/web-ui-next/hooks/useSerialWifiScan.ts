import { useCallback, useState } from 'react';

export interface SerialWifiNetwork { ssid: string; rssi?: number; channel?: number; enc?: number; bssid?: string }

export function useSerialWifiScan(options?: { backend?: 'auto' | 'serial' | 'sidecar' }) {
  const [networks, setNetworks] = useState<SerialWifiNetwork[]>([]);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [lastCount, setLastCount] = useState<number | undefined>();
  // original (unfiltered) count reported by firmware summary line
  const [originalCount, setOriginalCount] = useState<number | undefined>();
  const [timedOut, setTimedOut] = useState(false);
  const [elapsedMs, setElapsedMs] = useState<number | undefined>();
  const [filters, setFilters] = useState<{ minRssi?: number; top?: number }>({});
  const [proxied, setProxied] = useState<boolean | undefined>(undefined);
  const [backendUsed, setBackendUsed] = useState<'serial' | 'sidecar' | undefined>();
  const [appliedFilters, setAppliedFilters] = useState<{ minRssi?: number; top?: number } | undefined>(undefined);
  const [port, setPort] = useState<string | undefined>();
  const [openedTemporarily, setOpenedTemporarily] = useState<boolean | undefined>();

  const scan = useCallback(async (opts?: { minRssi?: number; top?: number; backend?: 'auto' | 'serial' | 'sidecar' }) => {
    setScanning(true); setError(undefined); setTimedOut(false);
    if (opts) setFilters(opts); else setFilters({});
    try {
      const backend = opts?.backend || options?.backend || 'auto';
      const payload: any = { ...opts };
      if (backend && backend !== 'auto') payload.backend = backend;
      const r = await fetch('/api/serial/wifi/scan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const j = await r.json();
      if (!r.ok || j.error) { throw new Error(j.error || 'scan failed'); }
      setNetworks(j.networks || []);
      setLastCount(j.count);
      setOriginalCount(j.summaryCount);
      setTimedOut(!!j.timedOut);
      setElapsedMs(j.elapsedMs);
      setProxied(j.proxied);
      setAppliedFilters(j.appliedFilters);
      setPort(j.port);
      setOpenedTemporarily(j.openedTemporarily);
      setBackendUsed(j.backendUsed || (j.proxied ? 'sidecar' : 'serial'));
    } catch (e: any) { setError(e.message || String(e)); }
    finally { setScanning(false); }
  }, [options?.backend]);

  return { networks, scanning, error, scan, lastCount, originalCount, timedOut, elapsedMs, filters, proxied, appliedFilters, port, openedTemporarily, backendUsed };
}
