import { useCallback, useEffect, useRef, useState } from 'react';
import { getSelectedDevice } from '../lib/deviceSelection';

interface WifiStatus {
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
  const timer = useRef<any>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const sel = getSelectedDevice();
      const r = await fetch('/api/device/api/wifi/status', { headers: sel ? { 'x-device-base-url': sel.baseUrl } : undefined });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      setStatus(j as WifiStatus);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (intervalMs > 0) {
      timer.current = setInterval(load, intervalMs);
      return () => clearInterval(timer.current);
    }
  }, [load, intervalMs]);

  return { status, loading, error, reload: load };
}

interface ScanResult { ssid: string; rssi: number; channel: number; enc: number; bssid: string; }

export function useDeviceWifiScan(pollMs = 2000) {
  const [initiating, setInitiating] = useState(false);
  const [results, setResults] = useState<ScanResult[]>([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollTimer = useRef<any>(null);
  const lastStart = useRef<number | null>(null);

  const startScan = useCallback(async () => {
    setInitiating(true); setError(null); lastStart.current = Date.now();
    try {
      const sel = getSelectedDevice();
      const r = await fetch('/api/device/api/wifi/scan', { headers: sel ? { 'x-device-base-url': sel.baseUrl } : undefined });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      setRunning(!j.completed);
      if (j.completed) {
        // immediate sync results path
        // fetch results below will get them anyway
      }
    } catch (e: any) {
      setError(e.message);
    } finally { setInitiating(false); }
  }, []);

  const fetchResults = useCallback(async () => {
    try {
      const sel = getSelectedDevice();
      const r = await fetch('/api/device/api/wifi/scan/results', { headers: sel ? { 'x-device-base-url': sel.baseUrl } : undefined });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      setResults(j.networks || []);
      setRunning(j.running);
    } catch (e: any) {
      setError(e.message);
    }
  }, []);

  useEffect(() => {
    if (running) {
      pollTimer.current = setInterval(fetchResults, pollMs);
      return () => clearInterval(pollTimer.current);
    }
  }, [running, fetchResults, pollMs]);

  return { startScan, initiating, results, running, error, fetchResults };
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
