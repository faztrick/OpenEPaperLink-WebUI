import useSWR from 'swr';
import { fetchTag, TagRecord } from '../lib/api';

export function useTag(mac: string | undefined, opts: { refreshMs?: number } = {}) {
  const { refreshMs = 10000 } = opts;
  const key = mac ? `tag-${mac}` : null;
  const swr = useSWR<TagRecord | null>(key, () => mac ? fetchTag(mac) : Promise.resolve(null), { refreshInterval: refreshMs });
  return swr;
}

export function deriveTagState(tag: TagRecord | null | undefined) : 'idle' | 'awaiting-wake' | 'updating' | 'unknown' {
  if (!tag) return 'unknown';
  if (tag.pending > 0) {
    // If last seen is older than 10s we assume it's waiting for wake, else updating
    const ageMs = Date.now() - (tag.lastSeenDate?.getTime() || 0);
    return ageMs < 10_000 ? 'updating' : 'awaiting-wake';
  }
  return 'idle';
}