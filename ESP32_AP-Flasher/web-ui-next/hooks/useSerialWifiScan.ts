import { useCallback, useState } from 'react';
import { useSerialConfig } from '../lib/serialConfig';

export interface SerialWifiNetwork { ssid: string; rssi?: number; channel?: number; enc?: number; bssid?: string }

export interface SerialScanState {
  networks: SerialWifiNetwork[];
  scanning: boolean;
  error?: string;
  count?: number;
  originalCount?: number;
  timedOut?: boolean;
  elapsedMs?: number;
  port?: string;
  openedTemporarily?: boolean;
  backendUsed?: 'serial' | 'sidecar';
  backendDecision?: any;
  proxied?: boolean;
  appliedFilters?: { minRssi?: number; top?: number };
}

export function useSerialWifiScan(defaultBackend: 'auto' | 'serial' | 'sidecar' = 'auto') {
  const [state, setState] = useState<SerialScanState>({ networks: [], scanning: false });
  const { port, backend: cfgBackend, refreshKey } = useSerialConfig();

  const start = useCallback(async (opts?: { minRssi?: number; top?: number; backend?: 'auto' | 'serial' | 'sidecar' }) => {
    if (state.scanning) return;
    setState(s => ({ ...s, scanning: true, error: undefined }));
    try {
      const backend = opts?.backend || cfgBackend || defaultBackend;
      const payload: any = { minRssi: opts?.minRssi, top: opts?.top };
      if (port) payload.port = port;
      if (backend !== 'auto') payload.backend = backend;
      const r = await fetch('/api/serial/wifi/scan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const txt = await r.text();
      let j: any = null; try { j = JSON.parse(txt); } catch { throw new Error('Invalid JSON from scan endpoint'); }
      if (!r.ok || j.error) throw new Error(j.error || `HTTP ${r.status}`);
      setState(s => ({
        ...s,
        scanning: false,
        networks: j.networks || [],
        count: j.count,
        originalCount: j.summaryCount,
        timedOut: j.timedOut,
        elapsedMs: j.elapsedMs,
        port: j.port,
        openedTemporarily: j.openedTemporarily,
        backendUsed: j.backendUsed || (j.proxied ? 'sidecar' : 'serial'),
        backendDecision: j.backendDecision,
        proxied: j.proxied,
        appliedFilters: j.appliedFilters
      }));
    } catch (e: any) {
      setState(s => ({ ...s, scanning: false, error: e.message || String(e) }));
    }
  }, [state.scanning, defaultBackend, cfgBackend, port, refreshKey]);

  return { ...state, start };
}
