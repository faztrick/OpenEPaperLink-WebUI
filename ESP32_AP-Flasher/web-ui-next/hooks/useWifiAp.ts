import { useCallback, useEffect, useState } from 'react';
import { apiGet, apiPostForm } from '../lib/apiClient';

export interface WifiApState {
  mode: number; // current WiFi mode (bitmask / enum from firmware)
  wifiMode?: number; // policy mode (0-3) from config
  apActive: boolean;
  apStarted: boolean;
  apClients: number;
  apIP: string;
  managementAP?: boolean;
  config?: { ssid?: string; channel?: number; hidden?: boolean; max_clients?: number };
}

export function useWifiAp(intervalMs = 5000) {
  const [state, setState] = useState<WifiApState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { const d = await apiGet<WifiApState>('/api/device/api/wifi/ap'); setState(d); }
    catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (intervalMs > 0) { const t = setInterval(load, intervalMs); return () => clearInterval(t); }
  }, [intervalMs, load]);

  const action = async (act: 'start' | 'stop' | 'restart', params?: { ssid?: string; channel?: number; hidden?: boolean; max_clients?: number; }) => {
    const body = new URLSearchParams();
    body.set('action', act);
    if (params?.ssid) body.set('ssid', params.ssid);
    if (params?.channel) body.set('channel', String(params.channel));
    if (params?.hidden !== undefined) body.set('hidden', params.hidden ? '1' : '0');
    if (params?.max_clients) body.set('max_clients', String(params.max_clients));
    await apiPostForm('/api/device/api/wifi/ap', body);
    await load();
  };

  return { state, loading, error, reload: load, action };
}
