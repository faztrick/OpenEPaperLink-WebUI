import { useCallback, useEffect, useRef, useState } from 'react';
import { getSelectedDevice } from '../lib/deviceSelection';

export interface WifiStatus {
  connected: boolean;
  ssid?: string;
  ip?: string;
  hostname?: string;
  rssi?: number;
  channel?: number;
  mac?: string;
  mode?: number;
  apMode?: boolean;
  apClients?: number;
  apIp?: string;
  reconnectAttempts?: number;
  useWiFiMulti?: boolean;
  savedNetworkCount?: number;
  lastScan?: number;
  scanRunning?: boolean;
  gw?: string;
  dns?: string;
  txPowerDbm?: number;
  healthy?: boolean;
  error?: string;
  wifiMode?: number;
  lastEvent?: { ts: number; name: string; data?: string };
}

export function useDeviceWifiStatus(intervalMs = 5000) {
  const [status, setStatus] = useState<WifiStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsDeviceSelection, setNeedsDeviceSelection] = useState(false);
  const [stale, setStale] = useState(false);
  const timer = useRef<any>(null);
  const lastUpdatedRef = useRef<number | null>(null);
  const clientStaleRef = useRef<boolean>(false);
  const requestIdRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const firstLoadRef = useRef(true);

  const load = useCallback(async (opts?: { manual?: boolean }) => {
    const manual = !!opts?.manual;
    // Only show spinner if first load or manual trigger (avoid flicker during background polling)
    if (firstLoadRef.current || manual) setLoading(true);
    setError(null);
    setNeedsDeviceSelection(false);
    try {
      // Cancel any in-flight request
      if (abortRef.current) abortRef.current.abort();
      const myReqId = ++requestIdRef.current;
      const controller = new AbortController();
      abortRef.current = controller;
      const sel = getSelectedDevice();
      const headers = sel ? { 'x-device-base-url': sel.baseUrl } : undefined;
      // First attempt legacy path (still widely used). If upstream timeout error, attempt v1 path.
      const attempt = async (path: string) => {
        const resp = await fetch('/api/device/' + path, { headers, signal: controller.signal });
        let json: any = null;
        try { json = await resp.json(); } catch { /* ignore */ }
        return { resp, json };
      };
      setStale(false);
      let { resp, json } = await attempt('api/wifi/status');
      if (!resp.ok) {
        const code = json?.error;
        if (code === 'device_base_url_not_set') {
          setNeedsDeviceSelection(true);
          throw new Error('No device selected. Select a device on the Devices page.');
        }
        // If upstream timeout and stale data present, use stale.
        if (code === 'upstream_timeout' && json?.stale?.data) {
          if (myReqId === requestIdRef.current) {
            setStatus(json.stale.data as WifiStatus);
            setError('Using stale Wi-Fi status (upstream timeout).');
            setStale(true);
            lastUpdatedRef.current = Date.now();
            clientStaleRef.current = false; // server-supplied stale takes precedence
          }
          return;
        }
        // Retry with v1 path if legacy failed (timeout or 404 etc.)
        const needsRetry = code === 'upstream_timeout' || resp.status === 404 || resp.status === 504;
        if (needsRetry) {
          ({ resp, json } = await attempt('api/v1/wifi/status'));
        }
      }
      if (!resp.ok) {
        const code = json?.error;
        if (code === 'upstream_timeout' && json?.stale?.data) {
          if (myReqId === requestIdRef.current) {
            setStatus(json.stale.data as WifiStatus);
            setError('Using stale Wi-Fi status (upstream timeout).');
            setStale(true);
            lastUpdatedRef.current = Date.now();
            clientStaleRef.current = false;
          }
          return;
        }
        if (code) throw new Error(code);
        throw new Error(`HTTP ${resp.status}`);
      }
      // Success path.
      if (myReqId === requestIdRef.current) {
        setStatus(json as WifiStatus);
        setStale(false);
        lastUpdatedRef.current = Date.now();
        clientStaleRef.current = false;
      }
    } catch (e: any) {
      if (e?.name === 'AbortError') {
        // ignore aborts
      } else {
        setError(e.message);
      }
    } finally {
      if (firstLoadRef.current) firstLoadRef.current = false;
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (intervalMs > 0 && !needsDeviceSelection) {
      timer.current = setInterval(() => {
        // derive client-side staleness prior to issuing next poll
        if (lastUpdatedRef.current && intervalMs > 0) {
          const age = Date.now() - lastUpdatedRef.current;
          if (!stale && age > intervalMs * 2) {
            clientStaleRef.current = true;
          }
        }
        load();
      }, intervalMs);
      return () => { if (timer.current) clearInterval(timer.current); };
    }
  }, [load, intervalMs, needsDeviceSelection, stale]);

  // Expose client computed stale status (merged with server stale)
  const clientStale = clientStaleRef.current;
  const effectiveStale = stale || clientStale;
  return { status, loading, error, reload: () => load({ manual: true }), needsDeviceSelection, stale: effectiveStale, serverStale: stale, clientStale, lastUpdated: lastUpdatedRef.current };
}

interface ScanResult { ssid: string; rssi?: number; channel?: number; enc?: number; bssid?: string; }

interface ScanState {
  initiating: boolean;
  results: ScanResult[];
  running: boolean;
  error: string | null;
  needsDeviceSelection: boolean;
  stale: boolean;
  partial: boolean;
  legacyFallback: boolean;
  lastStarted: number | null;
}

// Device-based Wi-Fi scan (via device proxy). Serial scanning split into its own hook.
export function useDeviceWifiScan(pollMs = 2000, cooldownMs = 10000) {
  const [state, setState] = useState<ScanState>({ initiating: false, results: [], running: false, error: null, needsDeviceSelection: false, stale: false, partial: false, legacyFallback: false, lastStarted: null });
  const pollTimer = useRef<any>(null);
  const lastScanKickAttempt = useRef<number>(0);

  const update = (patch: Partial<ScanState>) => setState(s => ({ ...s, ...patch }));

  const startScan = useCallback(async () => {
    if (state.initiating || state.running) return;
    const now = Date.now();
    if (state.lastStarted && (now - state.lastStarted) < cooldownMs) {
      update({ error: `Please wait ${Math.ceil((cooldownMs - (now - state.lastStarted)) / 1000)}s before scanning again.` });
      return;
    }
    update({ initiating: true, error: null, needsDeviceSelection: false, stale: false, partial: false, legacyFallback: false, lastStarted: now, results: [] });
    lastScanKickAttempt.current = now;
    try {
      const sel = getSelectedDevice();
      if (!sel) {
        update({ initiating: false, needsDeviceSelection: true, error: 'Select a device before scanning.' });
        return;
      }
      const headers = { 'x-device-base-url': sel.baseUrl };
      const resp = await fetch('/api/device/api/wifi/scan', { headers });
      let json: any = null; try { json = await resp.json(); } catch { /* ignore */ }
      if (!resp.ok) {
        const code = json?.error;
        if (code === 'device_base_url_not_set') {
          update({ needsDeviceSelection: true, initiating: false, error: 'Select a device before scanning.' });
          return;
        }
        if (code === 'upstream_timeout' && json?.legacyFallback) {
          update({ results: json.networks || [], initiating: false, running: false, legacyFallback: true });
          return;
        }
        if (code === 'upstream_timeout' && json?.stale?.type === 'scan') {
          update({ results: json.stale.networks || [], initiating: false, running: false, stale: true, error: 'Using stale scan results (timeout).' });
          return;
        }
        update({ initiating: false, error: code || `HTTP ${resp.status}` });
        return;
      }
      const completed = json.completed === true;
      update({ running: !completed, initiating: false, partial: !!json.partial, legacyFallback: !!json.legacyFallback });
      // Immediate first results poll if scan still running
      if (!completed) {
        setTimeout(() => { pollResultsReal(); }, 50);
      }
      if (Array.isArray(json.networks) && json.networks.length) update({ results: json.networks });
    } catch (e: any) {
      update({ initiating: false, error: e.message });
    }
  }, [state.initiating, state.running, state.lastStarted, cooldownMs]);

  // (removed placeholder fetchResults stub; real polling implemented below)

  const pollResultsReal = useCallback(async () => {
    try {
      const sel = getSelectedDevice();
      if (!sel) return; // no device selected anymore
      const headers = { 'x-device-base-url': sel.baseUrl };
      const r = await fetch('/api/device/api/wifi/scan/results', { headers });
      let j: any = null; try { j = await r.json(); } catch { /* ignore */ }
      if (!r.ok) {
        const code = j?.error;
        if (code === 'device_base_url_not_set') {
          update({ needsDeviceSelection: true, running: false, error: 'Select a device to view scan results.' });
          return;
        }
        if (code === 'upstream_timeout' && j?.stale?.type === 'scan') {
          update({ results: j.stale.networks || [], running: false, stale: true, error: 'Using stale scan results (timeout).' });
          return;
        }
        update({ running: false, error: code || `HTTP ${r.status}` });
        return;
      }
      const nets = j.networks || j.results || j.scanResults || [];
      update({ results: nets, running: !!j.running, partial: !!j.partial, legacyFallback: !!j.legacyFallback });
      if (!j.running && pollTimer.current) { clearInterval(pollTimer.current); pollTimer.current = null; }
    } catch (e: any) {
      update({ error: e.message });
    }
  }, []);

  useEffect(() => {
    if (state.running && !state.needsDeviceSelection) {
      pollTimer.current = setInterval(pollResultsReal, pollMs);
      return () => { if (pollTimer.current) clearInterval(pollTimer.current); };
    }
  }, [state.running, state.needsDeviceSelection, pollResultsReal, pollMs]);

  return { startScan, fetchResults: pollResultsReal, ...state };
}

export async function connectWifi(ssid: string, password: string) {
  const body = new URLSearchParams();
  body.set('ssid', ssid);
  if (password) body.set('password', password);
  const sel = getSelectedDevice();
  const r = await fetch('/api/device/api/wifi/connect', { method: 'POST', body, headers: sel ? { 'x-device-base-url': sel.baseUrl } : undefined });
  const j = await r.json();
  if (!r.ok || j.success === false) throw new Error(j.error || j.message || `HTTP ${r.status}`);
  return j;
}

export async function disconnectWifi() {
  const sel = getSelectedDevice();
  const r = await fetch('/api/device/api/wifi/disconnect', { method: 'POST', headers: sel ? { 'x-device-base-url': sel.baseUrl } : undefined });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || j.message || `HTTP ${r.status}`);
  return j;
}

export async function setWifiMode(mode: number) {
  const body = new URLSearchParams();
  body.set('mode', String(mode));
  const sel = getSelectedDevice();
  const r = await fetch('/api/device/api/wifi/setmode', { method: 'POST', body, headers: sel ? { 'x-device-base-url': sel.baseUrl } : undefined });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || j.message || `HTTP ${r.status}`);
  return j;
}
