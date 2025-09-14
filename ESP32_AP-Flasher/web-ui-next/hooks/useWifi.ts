import { useCallback, useEffect, useState } from 'react';
// Migrate to new versioned API client with fallback (legacy kept for safety)
import { wifiConnect, wifiDisconnect, WifiNetwork, wifiScan, wifiStatus, WifiStatus } from '../lib/wifi';

export function useWifi(_deviceId?: string | null) {
  const [networks, setNetworks] = useState<WifiNetwork[]>([]);
  const [status, setStatus] = useState<WifiStatus | null>(null);
  const [loadingScan, setLoadingScan] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scan = useCallback(async () => {
    setLoadingScan(true); setError(null);
    try { setNetworks(await wifiScan()); } catch (e: any) { setError(e.message); setNetworks([]); }
    setLoadingScan(false);
  }, []);

  const refreshStatus = useCallback(async () => {
    setLoadingStatus(true); setError(null);
    try { setStatus(await wifiStatus()); } catch (e: any) { setError(e.message); setStatus(null); }
    setLoadingStatus(false);
  }, []);

  useEffect(() => { refreshStatus(); }, [refreshStatus]);

  const connect = useCallback(async (ssid: string, password: string) => {
    await wifiConnect(ssid, password); await refreshStatus();
  }, [refreshStatus]);

  const disconnect = useCallback(async () => { await wifiDisconnect(); await refreshStatus(); }, [refreshStatus]);

  return { networks, status, loadingScan, loadingStatus, error, scan, refreshStatus, connect, disconnect };
}
