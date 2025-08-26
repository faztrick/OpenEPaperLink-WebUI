// Migration skeleton for wifi.js – provide imperative functions used by hooks/UI.

export interface WifiNetwork { ssid: string; rssi?: number; security?: string }
export interface WifiStatus { connected: boolean; ssid?: string; ip?: string; rssi?: number; channel?: number; mode?: string; updatedAt: number }

export async function wifiScan(deviceId: string) {
  const r = await fetch(`/api/device/${encodeURIComponent(deviceId)}/wifi/scan`);
  const j = await r.json();
  if (!j.success) throw new Error(j.error || 'scan failed');
  return (j.networks || []).map((n: any) => ({ ssid: n.ssid || n.SSID || n.name || '', rssi: n.rssi ?? n.RSSI, security: n.encryption || n.auth || n.type || '' }));
}

export async function wifiStatus(deviceId: string): Promise<WifiStatus> {
  const r = await fetch(`/api/device/${encodeURIComponent(deviceId)}/wifi/status`);
  const j = await r.json();
  if (!j.success) throw new Error(j.error || 'status failed');
  return { connected: !!j.connected, ssid: j.ssid, ip: j.ip, rssi: j.rssi, channel: j.channel, mode: j.mode, updatedAt: Date.now() };
}

export async function wifiConnect(deviceId: string, ssid: string, password: string) {
  const r = await fetch(`/api/device/${encodeURIComponent(deviceId)}/wifi/connect`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ssid, password }) });
  const j = await r.json();
  if (!j.success) throw new Error(j.error || 'connect failed');
  return true;
}

export async function wifiDisconnect(deviceId: string) {
  const r = await fetch(`/api/device/${encodeURIComponent(deviceId)}/wifi/disconnect`, { method: 'POST', headers: { 'Content-Type': 'application/json' } });
  const j = await r.json();
  if (!j.success) throw new Error(j.error || 'disconnect failed');
  return true;
}
