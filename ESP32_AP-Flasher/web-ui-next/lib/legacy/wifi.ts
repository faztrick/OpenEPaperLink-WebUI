// Unified WiFi client for firmware endpoints under /api/wifi/*
// Uses buildApiUrl so the UI can run on localhost and target the device AP.
import { buildApiUrl } from '../apiBase';

export interface WifiNetwork { ssid: string; rssi?: number; security?: string }
export interface WifiStatus { connected: boolean; ssid?: string; ip?: string; rssi?: number; channel?: number; mode?: string; updatedAt: number }

export async function wifiScan(_deviceId?: string) {
  // Start scan, then fetch latest results
  const start = await fetch(buildApiUrl('/api/wifi/scan'));
  if (!start.ok) throw new Error('scan start failed');
  const r = await fetch(buildApiUrl('/api/wifi/scan/results'));
  const j = await r.json();
  if (j && j.deprecated && j.use) {
    const rr = await fetch(buildApiUrl(j.use));
    const jj = await rr.json();
    return (jj.networks || []).map((n: any) => ({ ssid: n.ssid || n.SSID || n.name || '', rssi: n.rssi ?? n.RSSI, security: n.enc || n.encryption || n.auth || n.type || '' }));
  }
  if (j && j.networks) {
    return (j.networks || []).map((n: any) => ({ ssid: n.ssid || n.SSID || n.name || '', rssi: n.rssi ?? n.RSSI, security: n.enc || n.encryption || n.auth || n.type || '' }));
  }
  if (!j || j.error) throw new Error(j?.error || 'scan failed');
  return [];
}

export async function wifiStatus(_deviceId?: string): Promise<WifiStatus> {
  const r = await fetch(buildApiUrl('/api/wifi/status'));
  const j = await r.json();
  if (j && j.deprecated && j.use) {
    const rr = await fetch(buildApiUrl(j.use));
    const jj = await rr.json();
    return { connected: !!jj.connected, ssid: jj.ssid, ip: jj.ip, rssi: jj.rssi, channel: jj.channel, mode: jj.mode, updatedAt: Date.now() };
  }
  if (j && (j.success === undefined || j.success === true)) {
    return { connected: !!j.connected, ssid: j.ssid, ip: j.ip, rssi: j.rssi, channel: j.channel, mode: j.mode, updatedAt: Date.now() };
  }
  throw new Error(j?.error || 'status failed');
}

export async function wifiConnect(_deviceId: string, ssid: string, password: string) {
  // Try JSON then form-encoded for broad compatibility
  const tryJson = async () => fetch(buildApiUrl('/api/wifi/connect'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ssid, password }) });
  const tryForm = async () => {
    const fd = new URLSearchParams(); fd.set('ssid', ssid); fd.set('password', password);
    return fetch(buildApiUrl('/api/wifi/connect'), { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: fd.toString() });
  };
  let resp = await tryJson();
  if (!resp.ok) resp = await tryForm();
  const j = await resp.json().catch(() => ({}));
  if (resp.ok && (j.success === undefined || j.success === true)) return true;
  throw new Error(j.error || 'connect failed');
}

export async function wifiDisconnect(_deviceId?: string) {
  const r = await fetch(buildApiUrl('/api/wifi/disconnect'), { method: 'POST' });
  const j = await r.json().catch(() => ({}));
  if (r.ok && (j.success === undefined || j.success === true)) return true;
  throw new Error(j.error || 'disconnect failed');
}

