import { useEffect, useState } from 'react';
import { fetchSerialPorts } from '../lib/legacy/ports';

export interface SerialPortInfo {
  path: string;
  manufacturer?: string;
  serialNumber?: string;
  vendorId?: string;
  productId?: string;
}

export function useSerialPorts(refreshMs = 10000) {
  const [ports, setPorts] = useState<SerialPortInfo[]>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try { setLoading(true); const list = await fetchSerialPorts(); if (!cancelled) setPorts(list); }
      catch { if (!cancelled) setPorts([]); }
      finally { if (!cancelled) setLoading(false); }
    }
    load();
    const id = setInterval(load, refreshMs);
    return () => { cancelled = true; clearInterval(id); };
  }, [refreshMs]);
  return { ports, loading };
}
