import { useEffect, useState } from 'react';
import { testDeviceConnection } from '../lib/testConnection';
/**
 * useDeviceReachability
 * Polls a device baseUrl for lightweight reachability / latency using testDeviceConnection.
 * Supports optional stagger (startDelayMs) and a small cache to immediately show last known state
 * after navigation or refresh, reducing initial loading spinners across large device lists.
 * Cache layers:
 *  - In-memory (session) map for fast repeated mounts.
 *  - localStorage key 'reachability.cache' storing a map of baseUrl -> { state..., cachedAt }.
 * Freshness controlled via cacheTtlMs (default 60s). Stale entries are ignored on hydrate.
 * Failures are also cached (so a recently unreachable device shows Down instantly) but will be
 * revalidated on next poll cycle.
 */

export interface ReachabilityState {
  loading: boolean;
  reachable: boolean | null; // null = unknown
  lastChecked?: number;
  lastLatencyMs?: number;
  lastMessage?: string;
}

interface Options {
  intervalMs?: number;       // polling interval
  timeoutMs?: number;        // single test timeout
  immediate?: boolean;       // run immediately (after optional startDelayMs)
  enabled?: boolean;         // allow disabling
  startDelayMs?: number;     // optional stagger delay before first run + interval start
  enableCache?: boolean;     // if true, seed from last known cached result
  cacheTtlMs?: number;       // how long a cached entry is considered fresh
}

// Simple module-level memory cache to avoid repeated localStorage parsing within a session.
const memCache: Record<string, ReachabilityState & { cachedAt: number }> = {};

export function useDeviceReachability(baseUrl: string | null | undefined, opts?: Options): ReachabilityState {
  const { intervalMs = 15000, timeoutMs = 5000, immediate = true, enabled = true, startDelayMs = 0, enableCache = true, cacheTtlMs = 60000 } = opts || {};

  // Seed initial state from cache if available and fresh; otherwise unknown/reachable null.
  const seed: ReachabilityState = (() => {
    if (!enableCache || typeof window === 'undefined' || !baseUrl) return { loading: !!(enabled && immediate), reachable: null };
    const now = Date.now();
    const mem = memCache[baseUrl];
    if (mem && (now - mem.cachedAt) < cacheTtlMs) {
      return { ...mem, loading: !!(enabled && immediate), }; // treat as immediate known state
    }
    try {
      const raw = localStorage.getItem('reachability.cache');
      if (raw) {
        const parsed = JSON.parse(raw) as Record<string, any>;
        const entry = parsed[baseUrl];
        if (entry && (now - entry.cachedAt) < cacheTtlMs) {
          memCache[baseUrl] = entry; // sync into memory
          return { ...entry, loading: !!(enabled && immediate) };
        }
      }
    } catch { /* ignore */ }
    return { loading: !!(enabled && immediate), reachable: null };
  })();

  const [state, setState] = useState<ReachabilityState>(seed);

  useEffect(() => {
    if (typeof window === 'undefined') return; // SSR noop
    if (!enabled || !baseUrl) return;
    let cancelled = false;
    let intervalTimer: any;
    let startTimer: any;

    async function run() {
      setState(s => ({ ...s, loading: true }));
      try {
        const res = await testDeviceConnection(baseUrl, { timeoutMs });
        if (cancelled) return;
        const nextState: ReachabilityState = {
          loading: false,
          reachable: res.ok,
          lastChecked: Date.now(),
          lastLatencyMs: res.elapsedMs,
          lastMessage: res.message,
        };
        setState(nextState);
        if (enableCache) {
          try {
            const cached = { ...nextState, cachedAt: Date.now() };
            memCache[baseUrl] = cached;
            const raw = localStorage.getItem('reachability.cache');
            const parsed = raw ? JSON.parse(raw) : {};
            parsed[baseUrl] = cached;
            localStorage.setItem('reachability.cache', JSON.stringify(parsed));
          } catch { /* ignore */ }
        }
      } catch (e: any) {
        if (cancelled) return;
        const nextState: ReachabilityState = {
          loading: false,
          reachable: false,
          lastChecked: Date.now(),
          lastMessage: e?.message || 'error',
        };
        setState(nextState);
        if (enableCache) {
          try {
            const cached = { ...nextState, cachedAt: Date.now() };
            memCache[baseUrl] = cached;
            const raw = localStorage.getItem('reachability.cache');
            const parsed = raw ? JSON.parse(raw) : {};
            parsed[baseUrl] = cached;
            localStorage.setItem('reachability.cache', JSON.stringify(parsed));
          } catch { /* ignore */ }
        }
      }
    }

    // Stagger start to avoid burst of simultaneous pings across large device lists.
    startTimer = setTimeout(() => {
      if (immediate) run();
      intervalTimer = setInterval(run, intervalMs);
    }, startDelayMs);

    return () => {
      cancelled = true;
      clearTimeout(startTimer);
      clearInterval(intervalTimer);
    };
  }, [baseUrl, intervalMs, timeoutMs, immediate, enabled, startDelayMs, enableCache, cacheTtlMs]);

  return state;
}
