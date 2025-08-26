import { useCallback, useEffect, useState } from 'react';
import { wifiScan, wifiStatus, wifiConnect, wifiDisconnect, WifiNetwork, WifiStatus } from '../lib/legacy/wifi';

export function useWifi(deviceId?: string | null) {
  const [networks, setNetworks] = useState<WifiNetwork[]>([]);
  const [status, setStatus] = useState<WifiStatus | null>(null);
  const [loadingScan, setLoadingScan] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scan = useCallback(async () => {
    if (!deviceId) return;
    setLoadingScan(true); setError(null);
    try { setNetworks(await wifiScan(deviceId)); } catch (e: any) { setError(e.message); setNetworks([]); }
    setLoadingScan(false);
  }, [deviceId]);

  const refreshStatus = useCallback(async () => {
    if (!deviceId) return;
    setLoadingStatus(true); setError(null);
    try { setStatus(await wifiStatus(deviceId)); } catch (e: any) { setError(e.message); setStatus(null); }
    setLoadingStatus(false);
  }, [deviceId]);

  useEffect(() => { refreshStatus(); }, [refreshStatus]);

  const connect = useCallback(async (ssid: string, password: string) => {
    if (!deviceId) throw new Error('no device');
    await wifiConnect(deviceId, ssid, password); await refreshStatus();
  }, [deviceId, refreshStatus]);

  const disconnect = useCallback(async () => { if (!deviceId) return; await wifiDisconnect(deviceId); await refreshStatus(); }, [deviceId, refreshStatus]);

  return { networks, status, loadingScan, loadingStatus, error, scan, refreshStatus, connect, disconnect };
}
