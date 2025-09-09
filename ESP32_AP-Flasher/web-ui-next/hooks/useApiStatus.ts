import { useState } from 'react';
import { useInterval } from './useInterval';

export function useApiStatus(endpoint='/api/health', pollMs=5000){
  const [ok, setOk] = useState<boolean>(false);
  const [lastChecked, setLastChecked] = useState<number>(0);
  useInterval(async ()=>{
    try {
      const res = await fetch(endpoint, { cache:'no-store' });
      setOk(res.ok);
    } catch { setOk(false); }
    setLastChecked(Date.now());
  }, pollMs);
  return { ok, lastChecked };
}
