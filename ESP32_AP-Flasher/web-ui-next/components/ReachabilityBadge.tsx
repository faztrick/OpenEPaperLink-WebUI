import React from 'react';
import { useDeviceReachability } from '../hooks/useDeviceReachability';

export interface ReachabilityBadgeProps {
  baseUrl: string | null | undefined;
  intervalMs?: number;
  startDelayMs?: number;
  immediate?: boolean;
  showLatency?: boolean; // append latency (e.g. Up 42ms)
  className?: string;
  unreachableTitle?: string; // fallback tooltip when unreachable and no lastMessage
  // future: globalKey? currently baseUrl identifies uniqueness
}

// Lightweight, reusable badge that shows live reachability using useDeviceReachability.
// Handles missing baseUrl, loading state, success with optional latency, and failure with tooltip.
/**
 * ReachabilityBadge
 * Reusable presentational component that renders an Up/Down/Loading badge for a device base URL.
 * Internally uses useDeviceReachability (polling) and supports optional stagger via startDelayMs.
 * Memoized to avoid unnecessary re-renders; only props changes will trigger update.
 */
export const ReachabilityBadge: React.FC<ReachabilityBadgeProps> = React.memo((props) => {
  const { baseUrl, intervalMs = 20000, startDelayMs = 0, immediate = true, showLatency = true, className = '', unreachableTitle = 'Unreachable' } = props;
  // Always call hook (pass enabled=false when no baseUrl) to satisfy rules-of-hooks.
  const reach = useDeviceReachability(baseUrl || null, { intervalMs, immediate, startDelayMs, enabled: !!baseUrl });
  if (!baseUrl) return <span className={`badge badge-dim ${className}`.trim()} title="No base URL">?</span>;
  if (reach.loading && reach.reachable === null) return <span className={`badge badge-dim ${className}`.trim()}>…</span>;
  if (reach.reachable) {
    const latency = showLatency && reach.lastLatencyMs ? ` ${reach.lastLatencyMs}ms` : '';
    return <span className={`badge badge-ok ${className}`.trim()} title={reach.lastMessage || 'Reachable'}>Up{latency}</span>;
  }
  return <span className={`badge badge-bad ${className}`.trim()} title={reach.lastMessage || unreachableTitle}>Down</span>;
});

ReachabilityBadge.displayName = 'ReachabilityBadge';

export default ReachabilityBadge;
