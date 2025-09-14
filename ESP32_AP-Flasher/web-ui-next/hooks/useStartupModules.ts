import { useCallback, useEffect, useState } from 'react';
import { apiGet, apiPostJson } from '../lib/apiClient';

export interface StartupModulesState { modules: Record<string, boolean>; }

const DEFAULT_MODULES: Record<string, boolean> = {
  APTask: false,
  BLEWriter: false,
  IRRemote: false,
  USBFlasher: false,
  WebFlasher: false,
  UDP: false,
  ContentRunner: false,
};

export function useStartupModules() {
  const [data, setData] = useState<StartupModulesState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const d = await apiGet<StartupModulesState>('/api/device/api/startup_modules');
      // Ensure modules object & defaults
      const merged: Record<string, boolean> = { ...DEFAULT_MODULES, ...(d?.modules || {}) } as any;
      setData({ modules: merged });
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const updateModule = (name: string, value: boolean) => {
    setData(prev => prev ? { modules: { ...prev.modules, [name]: value } } : { modules: { ...DEFAULT_MODULES, [name]: value } });
  };

  const save = async () => {
    if (!data) return;
    setSaving(true); setError(null);
    try { await apiPostJson('/api/device/api/startup_modules', { modules: data.modules }); }
    catch (e: any) { setError(e.message); throw e; }
    finally { setSaving(false); }
  };

  return { data, loading, error, reload: load, updateModule, save, saving };
}
