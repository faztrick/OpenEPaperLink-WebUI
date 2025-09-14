import { useCallback, useEffect, useRef, useState } from 'react';
import { buildApiUrl } from '../lib/apiBase';

export interface DeviceLogsOptions { lines?: number; refreshMs?: number }

export function useDeviceLogs(opts: DeviceLogsOptions = {}) {
  const { lines = 400, refreshMs = 5000 } = opts;
  const [logLines, setLogLines] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<any>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const u = buildApiUrl(`/api/logs/tail?lines=${encodeURIComponent(lines)}`);
      const res = await fetch(u, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (Array.isArray(data.lines)) setLogLines(data.lines as string[]);
    } catch (e: any) {
      setError(e.message || 'error');
    } finally {
      setLoading(false);
    }
  }, [lines]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (refreshMs > 0) {
      timer.current = setInterval(load, refreshMs);
      return () => clearInterval(timer.current);
    }
  }, [load, refreshMs]);

  return { logLines, loading, error, reload: load };
}
