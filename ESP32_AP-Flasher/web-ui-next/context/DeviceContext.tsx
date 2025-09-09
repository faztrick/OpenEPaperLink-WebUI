import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { createDevicesManager, DevicesManager } from '../lib/legacy/devices';
import { fetchSerialPorts } from '../lib/legacy/ports';
import type { SerialPortInfo } from '../lib/legacy/types';

interface DeviceContextValue extends DevicesManager {
  serialPorts: SerialPortInfo[];
  refreshSerialPorts(): Promise<void>;
}

const DeviceContext = createContext<DeviceContextValue | undefined>(undefined);

export function DeviceProvider({ children }: { children: React.ReactNode }){
  const [mgr] = useState(()=> createDevicesManager());
  const [version, setVersion] = useState(0);
  const [serialPorts, setSerialPorts] = useState<SerialPortInfo[]>([]);

  async function refreshDevices(){ await mgr.refreshDevices(); setVersion(v=>v+1); }
  async function refreshSerialPorts(){ const list = await fetchSerialPorts(); setSerialPorts(list); }

  useEffect(()=>{ refreshDevices(); refreshSerialPorts(); const id = setInterval(()=>{ refreshDevices(); refreshSerialPorts(); }, 15000); return ()=> clearInterval(id); }, []);

  const value: DeviceContextValue = useMemo(()=> ({
    ...mgr,
    serialPorts,
    refreshDevices,
    refreshSerialPorts
  }), [mgr, version, serialPorts]);

  return <DeviceContext.Provider value={value}>{children}</DeviceContext.Provider>;
}

export function useDevices(){
  const ctx = useContext(DeviceContext);
  if(!ctx) throw new Error('useDevices must be used within DeviceProvider');
  return ctx;
}
