import { useCallback, useEffect, useState } from 'react';

export type BackendChoice = 'auto' | 'serial' | 'sidecar';

const LS_KEY = 'wifiBackendChoice';

export function useBackendSelection() {
  const [backend, setBackend] = useState<BackendChoice>('auto');

  // Load from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(LS_KEY) as BackendChoice | null;
      if (saved === 'auto' || saved === 'serial' || saved === 'sidecar') setBackend(saved);
    } catch { /* ignore */ }
  }, []);

  const update = useCallback((b: BackendChoice) => {
    setBackend(b);
    try { localStorage.setItem(LS_KEY, b); } catch { /* ignore */ }
  }, []);

  return { backend, setBackend: update };
}
