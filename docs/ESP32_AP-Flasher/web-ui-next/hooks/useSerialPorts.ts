import { useEffect, useState } from 'react';

export interface SerialPortInfo {
  path: string;
  manufacturer?: string;
  serialNumber?: string;
  vendorId?: string;
  productId?: string;
}

export function useSerialPorts(refreshMs = 10000){
  const [ports, setPorts] = useState<SerialPortInfo[]>([]);
  const [loading, setLoading] = useState(false);
  useEffect(()=>{
    let cancelled = false;
    async function load(){
      try {
        setLoading(true);
        const res = await fetch('/api/serial/ports');
        if(!res.ok) throw new Error('ports');
        const data = await res.json();
        if(!cancelled && Array.isArray(data)){
          const mapped: SerialPortInfo[] = data
            .filter(p=> p && typeof p === 'object' && 'path' in p)
            .map(p=> ({
              path: String(p.path),
              manufacturer: p.manufacturer ? String(p.manufacturer) : undefined,
              serialNumber: p.serialNumber ? String(p.serialNumber) : undefined,
              vendorId: p.vendorId ? String(p.vendorId) : undefined,
              productId: p.productId ? String(p.productId) : undefined
            }));
          setPorts(mapped);
        }
      } catch {
        if(!cancelled) setPorts([]);
      } finally {
        if(!cancelled) setLoading(false);
      }
    }
    load();
    const id = setInterval(load, refreshMs);
    return ()=> { cancelled = true; clearInterval(id); };
  }, [refreshMs]);
  return { ports, loading };
}
