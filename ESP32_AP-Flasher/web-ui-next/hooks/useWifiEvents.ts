import { useEffect, useRef, useState } from 'react';
import { getApiBase } from '../lib/apiBase';

export interface WifiEvent { ts: number; name: string; data?: any }

interface UseWifiEventsOptions {
  maxEvents?: number;          // ring buffer size
  autoConnect?: boolean;       // start immediately
  reconnect?: boolean;         // rely on browser's EventSource auto-retry
  onEvent?: (ev: WifiEvent) => void;
}

export function useWifiEvents(opts: UseWifiEventsOptions = {}) {
  const { maxEvents = 250, autoConnect = true, onEvent } = opts;
  const [connected, setConnected] = useState(false);
  const [usingLegacy, setUsingLegacy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastEvent, setLastEvent] = useState<WifiEvent | null>(null);
  const eventsRef = useRef<WifiEvent[]>([]);
  const srcRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!autoConnect || typeof window === 'undefined') return;

    const base = getApiBase();
    const makeUrl = (path: string) => (base ? base.replace(/\/$/, '') + path : path);
    let cancelled = false;

    const connect = (path: string, isLegacy: boolean) => {
      try { srcRef.current?.close(); } catch { /* */ }
      const es = new EventSource(makeUrl(path));
      srcRef.current = es;
      setUsingLegacy(isLegacy);
      es.onopen = () => { if (!cancelled) { setConnected(true); setError(null); } };
      es.onerror = () => {
        if (cancelled) return;
        // If first attempt was v1 and we haven't tried legacy yet, fallback
        if (!isLegacy) {
          // Attempt legacy events endpoint
          connect('/api/wifi/events', true);
          return;
        }
        setConnected(false);
        setError('event_source_error');
      };
      es.onmessage = (msg) => {
        if (cancelled) return;
        const txt = msg.data;
        try {
          const obj = JSON.parse(txt);
          if (typeof obj.ts === 'number' && obj.name) {
            const ev: WifiEvent = obj;
            eventsRef.current.push(ev);
            if (eventsRef.current.length > maxEvents) eventsRef.current.splice(0, eventsRef.current.length - maxEvents);
            setLastEvent(ev);
            onEvent?.(ev);
          }
        } catch { /* ignore parse errors */ }
      };
    };

    // Start with v1 path
    connect('/api/v1/events', false);

    return () => { cancelled = true; try { srcRef.current?.close(); } catch { /* */ } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoConnect]);

  return { events: eventsRef.current, lastEvent, connected, usingLegacy, error };
}
