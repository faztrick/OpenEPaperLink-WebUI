import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';

interface SerialConfigState {
  port: string | null;
  backend: 'serial' | 'sidecar' | 'auto';
  setPort(p: string | null): void;
  setBackend(b: 'serial' | 'sidecar' | 'auto'): void;
  refreshKey: number; // changes when port/backend updated
}

const KEY = 'serialConfig.v1';

const SerialConfigContext = createContext<SerialConfigState | undefined>(undefined);

export const SerialConfigProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [port, setPortState] = useState<string | null>(null);
  const [backend, setBackendState] = useState<'serial' | 'sidecar' | 'auto'>('serial');
  const [refreshKey, setRefreshKey] = useState(0);

  // Load from localStorage
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const obj = JSON.parse(raw);
        if (obj.port) setPortState(obj.port);
        if (obj.backend) setBackendState(obj.backend);
      }
    } catch { /* ignore */ }
  }, []);

  const persist = useCallback((next: { port?: string | null; backend?: string }) => {
    if (typeof window === 'undefined') return;
    try {
      const current = { port, backend };
      const merged = { ...current, ...next };
      localStorage.setItem(KEY, JSON.stringify(merged));
    } catch { /* ignore */ }
  }, [port, backend]);

  const setPort = useCallback((p: string | null) => {
    setPortState(p);
    persist({ port: p });
    setRefreshKey(k => k + 1);
  }, [persist]);

  const setBackend = useCallback((b: 'serial' | 'sidecar' | 'auto') => {
    setBackendState(b);
    persist({ backend: b });
    setRefreshKey(k => k + 1);
  }, [persist]);

  return (
    <SerialConfigContext.Provider value={{ port, backend, setPort, setBackend, refreshKey }}>
      {children}
    </SerialConfigContext.Provider>
  );
};

export function useSerialConfig() {
  const ctx = useContext(SerialConfigContext);
  if (!ctx) throw new Error('useSerialConfig must be used within SerialConfigProvider');
  return ctx;
}
