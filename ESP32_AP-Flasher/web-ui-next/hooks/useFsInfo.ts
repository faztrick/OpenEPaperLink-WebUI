import { useCallback, useEffect, useState } from 'react';
import { apiGet, apiPostNoBody } from '../lib/apiClient';

export interface FsInfo {
  type: string;
  mounted: boolean;
  totalBytes?: number;
  usedBytes?: number;
  paths?: Record<string, boolean>;
}

export function useFsInfo(pollMs = 0) {
  const [info, setInfo] = useState<FsInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { const d = await apiGet<FsInfo>('/api/device/api/fs/info'); setInfo(d); }
    catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (pollMs > 0) {
      const t = setInterval(load, pollMs);
      return () => clearInterval(t);
    }
  }, [pollMs, load]);

  const remount = async () => {
    const r = await apiPostNoBody<FsInfo>('/api/device/api/fs/remount');
    setInfo(r); return r;
  };

  return { info, loading, error, reload: load, remount };
}
