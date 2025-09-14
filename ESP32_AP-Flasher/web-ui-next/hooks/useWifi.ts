import { useCallback, useEffect, useState } from 'react';
import { wifiScan, wifiStatus, wifiConnect, wifiDisconnect, WifiNetwork, WifiStatus } from '../lib/legacy/wifi';

export function useWifi(deviceId?: string | null) {
  const [networks, setNetworks] = useState<WifiNetwork[]>([]);
  const [status, setStatus] = useState<WifiStatus | null>(null);
  const [loadingScan, setLoadingScan] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scan = useCallback(async () => {
    setLoadingScan(true); setError(null);
    try { setNetworks(await wifiScan(deviceId || undefined)); } catch (e: any) { setError(e.message); setNetworks([]); }
    setLoadingScan(false);
  }, [deviceId]);

  const refreshStatus = useCallback(async () => {
    setLoadingStatus(true); setError(null);
    try { setStatus(await wifiStatus(deviceId || undefined)); } catch (e: any) { setError(e.message); setStatus(null); }
    setLoadingStatus(false);
  }, [deviceId]);

  useEffect(() => { refreshStatus(); }, [refreshStatus]);

  const connect = useCallback(async (ssid: string, password: string) => {
    await wifiConnect(deviceId || '', ssid, password); await refreshStatus();
  }, [deviceId, refreshStatus]);

  const disconnect = useCallback(async () => { await wifiDisconnect(deviceId || undefined); await refreshStatus(); }, [deviceId, refreshStatus]);

  return { networks, status, loadingScan, loadingStatus, error, scan, refreshStatus, connect, disconnect };
}
