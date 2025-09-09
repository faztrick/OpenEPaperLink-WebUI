import { useState, useCallback } from 'react';

export interface SerialWifiNetwork { ssid:string; rssi?:number; channel?:number; enc?:number; bssid?:string }

export function useSerialWifiScan(){
  const [networks,setNetworks] = useState<SerialWifiNetwork[]>([]);
  const [scanning,setScanning] = useState(false);
  const [error,setError] = useState<string|undefined>();
  const [lastCount,setLastCount] = useState<number|undefined>();
  const [timedOut,setTimedOut] = useState(false);

  const scan = useCallback(async ()=>{
    setScanning(true); setError(undefined); setTimedOut(false);
    try {
      const r = await fetch('/api/serial/wifi/scan',{ method:'POST' });
      const j = await r.json();
      if(!r.ok || j.error){ throw new Error(j.error || 'scan failed'); }
      setNetworks(j.networks||[]); setLastCount(j.count); setTimedOut(!!j.timedOut);
    } catch(e:any){ setError(e.message||String(e)); }
    finally { setScanning(false); }
  },[]);

  return { networks, scanning, error, scan, lastCount, timedOut };
}
