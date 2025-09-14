import { useCallback, useEffect, useRef, useState } from 'react';
import { getSelectedDevice } from '../lib/deviceSelection';
import { transport } from '../lib/transport';

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

function buildHeaders() {
  const sel = getSelectedDevice();
  return sel ? { 'x-device-base-url': sel.baseUrl } : undefined;
}

interface LegacyAttemptResult { resp: Response; json: any; }

async function fetchWifiStatus(path: string, controller: AbortController): Promise<LegacyAttemptResult> {
  const selHeaders = buildHeaders();
  const resp = await fetch('/api/device/' + path, { headers: selHeaders, signal: controller.signal });
  let json: any = null; try { json = await resp.json(); } catch { }
  return { resp, json };
}

function applyStaleFromJson(json: any, setStatus: any, setError: any, setStale: any, requestId: number, requestIdRef: any, lastUpdatedRef: any, clientStaleRef: any) {
  setStatus(json.stale.data as WifiStatus);
  setError('Using stale Wi-Fi status (upstream timeout).');
  setStale(true);
  lastUpdatedRef.current = Date.now();
  clientStaleRef.current = false;
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

  // HTTP attempt paths (device proxy) – serial path handled separately
  const attemptPaths = ['api/wifi/status', 'api/v1/wifi/status'];

  // Helper: perform serial status fetch (returns shape similar to HTTP handlers)
  async function fetchSerialStatus(controller: AbortController): Promise<LegacyAttemptResult & { source: 'serial' }> {
    const resp = await fetch('/api/serial/wifi/status?backend=serial', { signal: controller.signal });
    let json: any = null; try { json = await resp.json(); } catch { }
    return { resp, json, source: 'serial' } as any;
  }

  function handleStale(json: any, myReqId: number) {
    if (json?.stale?.data && myReqId === requestIdRef.current) {
      applyStaleFromJson(json, setStatus, setError, setStale, myReqId, requestIdRef, lastUpdatedRef, clientStaleRef);
      return true;
    }
    return false;
  }

  function shouldRetry(resp: Response, code: string | undefined) {
    return code === 'upstream_timeout' || resp.status === 404 || resp.status === 504;
  }

  async function fetchWithFallback(controller: AbortController) {
    const t = transport();
    const tr = t.getStatus();
    // Build ordered attempt list based on preference
    // serial-first when preferred=serial; http-first otherwise. In 'auto' we still start with http.
    const attemptOrder: Array<'serial' | 'http'> = tr.preferred === 'serial' ? ['serial', 'http'] : ['http', 'serial'];
    let last: { resp: Response; json: any; source: string } | null = null;
    for (const kind of attemptOrder) {
      if (kind === 'serial') {
        try {
          last = await fetchSerialStatus(controller);
        } catch (e: any) {
          // If serial hard fails (network/abort) continue to HTTP unless serial was strictly preferred
          if (tr.preferred === 'serial') {
            // propagate error so UI can show message
            throw e;
          }
          continue;
        }
        // Serial route returns degraded responses with status 200 sometimes; treat degraded/timeouts as stale path
        const code = last.json?.error;
        if (last.json?.event === 'wifistatus' || last.json?.connected !== undefined || last.json?.success) {
          break; // have usable data
        }
        if (code === 'status_timeout' && last.json?.degraded) {
          // treat as stale (will be processed by caller)
          break;
        }
        // If parse_failed try HTTP fallback unless serial strictly preferred
        if (code === 'status_parse_failed' && tr.preferred !== 'serial') continue;
        // Unknown command etc -> fall back to HTTP
        if (code === 'unknown_command' && tr.preferred !== 'serial') continue;
        // Otherwise break and let classification handle
        break;
      } else {
        for (let i = 0; i < attemptPaths.length; i++) {
          const path = attemptPaths[i];
          const httpAttempt = await fetchWifiStatus(path, controller);
          last = { ...httpAttempt, source: 'http' };
          if (!last.resp.ok) {
            const code = last.json?.error;
            if (code === 'device_base_url_not_set') throw new Error('device_base_url_not_set');
            if (code === 'upstream_timeout' && last.json?.stale?.data) break; // stale
            if (i < attemptPaths.length - 1 && shouldRetry(last.resp, code)) continue; // try next http path
          }
          break; // success or non-retriable error
        }
        if (last) break;
      }
    }
    return last!;
  }

  function classifyWifiFetch(resp: Response, json: any, source: string): { kind: 'stale' | 'needsDeviceSelection' | 'error' | 'ok'; message?: string } {
    const code = json?.error;
    // HTTP specific handling
    if (source === 'http') {
      if (!resp.ok) {
        if (code === 'device_base_url_not_set') return { kind: 'needsDeviceSelection' };
        if (code === 'upstream_timeout' && json?.stale?.data) return { kind: 'stale' };
        if (code) return { kind: 'error', message: code };
        return { kind: 'error', message: `HTTP ${resp.status}` };
      }
      if (code === 'upstream_timeout' && json?.stale?.data) return { kind: 'stale' };
      return { kind: 'ok' };
    }
    // Serial specific handling
    if (source === 'serial') {
      if (!resp.ok) {
        if (code) return { kind: 'error', message: code };
        return { kind: 'error', message: `HTTP ${resp.status}` };
      }
      if (json?.degraded || code === 'status_timeout') return { kind: 'stale', message: code };
      if (code && code !== 'status_timeout') return { kind: 'error', message: code };
      return { kind: 'ok' };
    }
    return { kind: 'ok' };
  }

  const load = useCallback(async (opts?: { manual?: boolean }) => {
    const manual = !!opts?.manual;
    if (firstLoadRef.current || manual) setLoading(true);
    setError(null);
    setNeedsDeviceSelection(false);
    if (abortRef.current) abortRef.current.abort();
    const myReqId = ++requestIdRef.current;
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      setStale(false);
      const { resp, json, source } = await fetchWithFallback(controller) as any;
      const outcome = classifyWifiFetch(resp, json, source);
      switch (outcome.kind) {
        case 'needsDeviceSelection':
          setNeedsDeviceSelection(true);
          throw new Error('No device selected. Select a device on the Devices page.');
        case 'stale':
          if (handleStale(json, myReqId)) return;
          // For serial degraded timeout: treat as stale using last known status
          if (json?.degraded && status) {
            setError('Using stale Wi-Fi status (serial timeout).');
            setStale(true);
            return;
          }
          break; // handleStale sets state
        case 'error':
          throw new Error(outcome.message || 'wifi_status_error');
        case 'ok':
          if (myReqId === requestIdRef.current) {
            setStatus(json as WifiStatus);
            lastUpdatedRef.current = Date.now();
            clientStaleRef.current = false;
          }
          break;
      }
    } catch (e: any) {
      if (e?.message === 'device_base_url_not_set') {
        setNeedsDeviceSelection(true);
        setError('No device selected. Select a device on the Devices page.');
      } else if (e?.name !== 'AbortError') {
        // Preserve last status on error (don't null it out) – mark stale if we have previous data
        if (status) { setStale(true); setError(e.message); } else { setError(e.message); }
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

  function handleTimeoutScan(json: any) {
    if (json?.legacyFallback) {
      update({ results: json.networks || [], initiating: false, running: false, legacyFallback: true });
      return true;
    }
    if (json?.stale?.type === 'scan') {
      update({ results: json.stale.networks || [], initiating: false, running: false, stale: true, error: 'Using stale scan results (timeout).' });
      return true;
    }
    return false;
  }

  function handleScanError(code: string | undefined, respStatus: number, json: any) {
    if (!code && respStatus < 400) return false; // not an error path
    if (code === 'device_base_url_not_set') {
      update({ needsDeviceSelection: true, initiating: false, error: 'Select a device before scanning.' });
      return true;
    }
    if (code === 'upstream_timeout' && handleTimeoutScan(json)) return true;
    if (code) { update({ initiating: false, error: code }); return true; }
    update({ initiating: false, error: `HTTP ${respStatus}` }); return true;
  }

  function withinCooldown(now: number, last: number | null, cdMs: number) {
    if (!last) return false;
    return (now - last) < cdMs;
  }

  function cooldownMessage(now: number, last: number, cdMs: number) {
    const remain = cdMs - (now - last);
    return `Please wait ${Math.ceil(remain / 1000)}s before scanning again.`;
  }

  async function processInitialScanResponse(resp: Response, json: any) {
    if (!resp.ok) {
      if (handleScanError(json?.error, resp.status, json)) return;
    }
    const completed = json.completed === true;
    update({ running: !completed, initiating: false, partial: !!json.partial, legacyFallback: !!json.legacyFallback });
    if (!completed) setTimeout(() => { pollResultsReal(); }, 50);
    if (Array.isArray(json.networks) && json.networks.length) update({ results: json.networks });
  }

  const startScan = useCallback(async () => {
    if (state.initiating || state.running) return;
    const now = Date.now();
    if (withinCooldown(now, state.lastStarted, cooldownMs)) {
      update({ error: cooldownMessage(now, state.lastStarted!, cooldownMs) });
      return;
    }
    update({ initiating: true, error: null, needsDeviceSelection: false, stale: false, partial: false, legacyFallback: false, lastStarted: now, results: [] });
    lastScanKickAttempt.current = now;
    try {
      const t = transport();
      const tr = t.getStatus();
      const preferSerial = tr.preferred === 'serial';
      // If serial preferred, attempt serial scan first (immediate results; no running state)
      if (preferSerial) {
        try {
          const r = await fetch('/api/serial/wifi/scan?backend=serial', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
          let j: any = null; try { j = await r.json(); } catch { }
          if (r.ok && j?.networks) {
            update({ initiating: false, running: false, results: j.networks, partial: false, legacyFallback: false });
            return; // done
          }
          // fall through to HTTP if serial failed
        } catch (e: any) {
          // fallback to HTTP below
        }
      }
      const sel = getSelectedDevice();
      if (!sel) { update({ initiating: false, needsDeviceSelection: true, error: 'Select a device before scanning.' }); return; }
      const headers = { 'x-device-base-url': sel.baseUrl };
      const resp = await fetch('/api/device/api/wifi/scan', { headers });
      let json: any = null; try { json = await resp.json(); } catch { /* ignore */ }
      await processInitialScanResponse(resp, json);
    } catch (e: any) {
      update({ initiating: false, error: e.message });
    }
  }, [state.initiating, state.running, state.lastStarted, cooldownMs]);

  // (removed placeholder fetchResults stub; real polling implemented below)

  function handlePollError(j: any, r: Response) {
    const code = j?.error;
    if (code === 'device_base_url_not_set') {
      update({ needsDeviceSelection: true, running: false, error: 'Select a device to view scan results.' });
      return true;
    }
    if (code === 'upstream_timeout' && j?.stale?.type === 'scan') {
      update({ results: j.stale.networks || [], running: false, stale: true, error: 'Using stale scan results (timeout).' });
      return true;
    }
    update({ running: false, error: code || `HTTP ${r.status}` });
    return true;
  }

  const pollResultsReal = useCallback(async () => {
    try {
      const sel = getSelectedDevice();
      if (!sel) return; // no device selected anymore
      const headers = { 'x-device-base-url': sel.baseUrl };
      const r = await fetch('/api/device/api/wifi/scan/results', { headers });
      let j: any = null; try { j = await r.json(); } catch { /* ignore */ }
      if (!r.ok) { handlePollError(j, r); return; }
      const nets = j.networks || j.results || j.scanResults || [];
      update({ results: nets, running: !!j.running, partial: !!j.partial, legacyFallback: !!j.legacyFallback });
      if (!j.running && pollTimer.current) { clearInterval(pollTimer.current); pollTimer.current = null; }
    } catch (e: any) {
      update({ error: e.message });
    }
  }, []);

  useEffect(() => {
    if (!state.running || state.needsDeviceSelection) return;
    pollTimer.current = setInterval(pollResultsReal, pollMs);
    return () => { if (pollTimer.current) clearInterval(pollTimer.current); };
  }, [state.running, state.needsDeviceSelection, pollResultsReal, pollMs]);

  return { startScan, fetchResults: pollResultsReal, ...state };
}

async function ensureSerialIfPreferred() {
  try {
    const t = transport();
    const st = t.getStatus();
    if (st.preferred === 'serial' && !st.serialOpen) await t.openSerial();
  } catch { /* ignore */ }
}

// Serial-first Wi-Fi connect. If transport preferred=serial we force serial API usage.
// If serial not preferred, we keep legacy HTTP path for now.
export async function connectWifi(ssid: string, password: string, opts?: { strictSerial?: boolean }) {
  const t = transport();
  const st = t.getStatus();
  const wantSerial = st.preferred === 'serial' || opts?.strictSerial;
  if (wantSerial) {
    // Ensure serial is opened (will attempt adoption/open)
    await ensureSerialIfPreferred();
    // Use serial API endpoint; body must be JSON for serial route.
    const r = await fetch('/api/serial/wifi/connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ssid, password, backend: 'serial' })
    });
    let j: any = null; try { j = await r.json(); } catch { /* ignore */ }
    if (!r.ok || j?.error || j?.success === false) throw new Error(j?.error || j?.message || `HTTP ${r.status}`);
    return j;
  }
  // HTTP fallback (device proxy) when not serial preferred.
  const body = new URLSearchParams(); body.set('ssid', ssid); if (password) body.set('password', password);
  const sel = getSelectedDevice();
  const r = await fetch('/api/device/api/wifi/connect', { method: 'POST', body, headers: sel ? { 'x-device-base-url': sel.baseUrl } : undefined });
  const j = await r.json(); if (!r.ok || j.success === false) throw new Error(j.error || j.message || `HTTP ${r.status}`); return j;
}

export async function disconnectWifi(opts?: { strictSerial?: boolean }) {
  const t = transport();
  const st = t.getStatus();
  const wantSerial = st.preferred === 'serial' || opts?.strictSerial;
  if (wantSerial) {
    await ensureSerialIfPreferred();
    const r = await fetch('/api/serial/wifi/disconnect', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ backend: 'serial' }) });
    let j: any = null; try { j = await r.json(); } catch { /* ignore */ }
    if (!r.ok || j?.error || j?.success === false) throw new Error(j?.error || j?.message || `HTTP ${r.status}`);
    return j;
  }
  const sel = getSelectedDevice();
  const r = await fetch('/api/device/api/wifi/disconnect', { method: 'POST', headers: sel ? { 'x-device-base-url': sel.baseUrl } : undefined });
  const j = await r.json(); if (!r.ok) throw new Error(j.error || j.message || `HTTP ${r.status}`); return j;
}

// Wi-Fi Mode Policy mapping (firmware dependent):
//  0 AUTO (firmware decides / saved) | 1 AP | 2 STA | 3 AP+STA (combo)
// Serial-first implementation similar to connect/disconnect.
// Errors:
//  upstream_timeout -> surface friendly guidance (try serial or firmware busy)
//  unknown_command  -> firmware lacks wifimode CLI (advise update)
//  parse_failed / mode_timeout -> degraded/timeout states
export async function setWifiMode(mode: number, opts?: { strictSerial?: boolean }) {
  const t = transport();
  const st = t.getStatus();
  const wantSerial = st.preferred === 'serial' || opts?.strictSerial;
  if (wantSerial) {
    await ensureSerialIfPreferred();
    const r = await fetch('/api/serial/wifi/mode?backend=serial', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode })
    });
    let j: any = null; try { j = await r.json(); } catch { /* ignore */ }
    if (!r.ok || j?.error) {
      const code = j?.error;
      if (code === 'unknown_command') throw new Error('Firmware missing wifimode CLI (update firmware).');
      if (code === 'mode_timeout') throw new Error('Wi-Fi mode change timed out (device busy).');
      throw new Error(code || j?.message || `HTTP ${r.status}`);
    }
    return j;
  }
  // HTTP device proxy fallback when not serial preferred.
  const body = new URLSearchParams(); body.set('mode', String(mode));
  const sel = getSelectedDevice();
  const r = await fetch('/api/device/api/wifi/setmode', { method: 'POST', body, headers: sel ? { 'x-device-base-url': sel.baseUrl } : undefined });
  const j = await r.json();
  if (!r.ok) {
    const code = j?.error;
    if (code === 'upstream_timeout') throw new Error('Wi-Fi mode request timed out (try again or use serial).');
    throw new Error(code || j?.message || `HTTP ${r.status}`);
  }
  return j;
}

// On-demand fetch of current Wi-Fi mode via serial (lower latency vs full status poll)
export async function getWifiMode(opts?: { strictSerial?: boolean }) {
  const t = transport();
  const st = t.getStatus();
  const wantSerial = st.preferred === 'serial' || opts?.strictSerial;
  if (wantSerial) {
    await ensureSerialIfPreferred();
    const r = await fetch('/api/serial/wifi/mode?backend=serial', { method: 'GET' });
    let j: any = null; try { j = await r.json(); } catch { /* ignore */ }
    if (!r.ok || j?.error) throw new Error(j?.error || j?.message || `HTTP ${r.status}`);
    return j; // { success:true, mode, modeName, ... }
  }
  // Fallback: derive from full status (saves adding another HTTP endpoint if not implemented)
  const sel = getSelectedDevice();
  if (!sel) throw new Error('No device selected');
  const r = await fetch('/api/device/api/wifi/status', { headers: { 'x-device-base-url': sel.baseUrl } });
  let j: any = null; try { j = await r.json(); } catch { }
  if (!r.ok) throw new Error(j?.error || j?.message || `HTTP ${r.status}`);
  return { success: true, mode: j.mode ?? j.wifiMode, modeName: j.modeName || undefined };
}
