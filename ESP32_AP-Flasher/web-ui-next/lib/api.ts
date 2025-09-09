// API helpers for firmware endpoints (initial minimalist version)
// Device-related placeholders retained; focus added for tag operations.
export interface DeviceSummary { id: string; name: string; status?: string }

export async function fetchDevices(): Promise<DeviceSummary[]> {
  return []; // TODO: real implementation later
}

// Tag data structures derived from tag_db.cpp JSON fields
export interface RawTagRecord {
  mac: string;
  hash: string;
  lastseen: number;
  nextupdate: number;
  nextcheckin: number;
  pending: number;
  alias: string;
  contentMode: number;
  LQI: number;
  RSSI: number;
  temperature: number;
  batteryMv: number;
  hwType: number;
  wakeupReason: number;
  capabilities: number;
  modecfgjson: string;
  isexternal: boolean;
  apip: string;
  rotate: number;
  lut: number;
  invert: number;
  updatecount: number;
  updatelast: number;
  ch: number;
  ver: number;
}

export interface TagRecord extends RawTagRecord {
  // Derived helper fields for UI presentation
  lastSeenDate: Date | null;
  status: 'online' | 'stale' | 'unknown';
}

interface TagDBResponse {
  tags: RawTagRecord[];
  continu?: number; // pagination cursor if present
}

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(path, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${path} -> ${res.status}`);
  return res.json() as Promise<T>;
}

function normalizeTag(raw: RawTagRecord): TagRecord {
  const ageMs = Date.now() - raw.lastseen * 1000; // lastseen appears to be epoch seconds
  let status: TagRecord['status'] = 'unknown';
  if (raw.lastseen > 0) {
    status = ageMs < 5 * 60_000 ? 'online' : 'stale';
  }
  return { ...raw, lastSeenDate: raw.lastseen ? new Date(raw.lastseen * 1000) : null, status };
}

export async function fetchAllTags(limit: number = 200): Promise<TagRecord[]> {
  // Iterate pagination if firmware emits 'continu'.
  let pos = 0;
  const out: TagRecord[] = [];
  while (true) {
    const url = pos ? `/get_db?pos=${pos}` : '/get_db';
    const data = await fetchJson<TagDBResponse>(url);
    if (Array.isArray(data.tags)) {
      for (const t of data.tags) out.push(normalizeTag(t));
    }
    if (out.length >= limit) return out.slice(0, limit);
    if (data.continu === undefined) break;
    pos = data.continu;
    if (pos === 0) break; // safety
  }
  return out;
}

export async function fetchTag(mac: string): Promise<TagRecord | null> {
  const data = await fetchJson<TagDBResponse>(`/get_db?mac=${mac}`);
  if (!data.tags || !data.tags.length) return null;
  return normalizeTag(data.tags[0]);
}

export function formatMac(mac: string): string {
  // Insert colons every 2 chars if not already containing them and length is 16 or 12
  if (mac.includes(':')) return mac.toUpperCase();
  if (mac.length === 16 || mac.length === 12) {
    return mac.match(/.{1,2}/g)!.join(':').toUpperCase();
  }
  return mac.toUpperCase();
}

export async function updateTagAlias(mac: string, alias: string): Promise<{ success: boolean; mac: string; alias: string }> {
  const fd = new FormData();
  fd.append('mac', mac);
  fd.append('alias', alias);
  const res = await fetch('/tag_alias', { method: 'POST', body: fd });
  if (!res.ok) throw new Error(`alias update failed: ${res.status}`);
  return res.json();
}
