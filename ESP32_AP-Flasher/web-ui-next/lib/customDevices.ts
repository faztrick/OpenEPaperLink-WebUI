// Local custom devices store (devices manually added by the user and not discovered via backend).
// Persisted in localStorage. Provides CRUD utilities + subscription.

export interface CustomDevice {
  id: string;            // unique id chosen by user (must not collide with backend provided devices)
  name: string;          // display name
  baseUrl: string;       // root base URL (no trailing slash)
  createdAt?: number;
  updatedAt?: number;
}

interface CustomDevicesState {
  map: Record<string, CustomDevice>;
  listeners: Set<() => void>;
  restored: boolean;
}

const LS_KEY = 'customDevices';
const state: CustomDevicesState = { map: {}, listeners: new Set(), restored: false };

function restore() {
  if (state.restored || typeof window === 'undefined') return;
  state.restored = true;
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') state.map = parsed;
    }
  } catch { /* ignore */ }
}

function persist() {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(LS_KEY, JSON.stringify(state.map)); } catch { /* ignore */ }
}

export function getAllCustomDevices(): Record<string, CustomDevice> {
  restore();
  return { ...state.map };
}

export function getCustomDevice(id: string): CustomDevice | undefined {
  restore();
  return state.map[id];
}

export function upsertCustomDevice(dev: CustomDevice) {
  restore();
  const now = Date.now();
  const existing = state.map[dev.id];
  state.map[dev.id] = { ...existing, ...dev, createdAt: existing?.createdAt || now, updatedAt: now };
  persist();
  for (const l of state.listeners) l();
}

export function deleteCustomDevice(id: string) {
  restore();
  if (state.map[id]) {
    delete state.map[id];
    persist();
    for (const l of state.listeners) l();
  }
}

export function subscribeCustomDevices(cb: () => void) {
  restore();
  state.listeners.add(cb);
  return () => state.listeners.delete(cb);
}

// ---- Import / Export helpers ----
export interface CustomDevicesExportFile {
  kind: 'OpenEPaperLinkCustomDevices';
  version: 1;
  exportedAt: string; // ISO date
  devices: CustomDevice[];
}

export function exportCustomDevices(): CustomDevicesExportFile {
  restore();
  return {
    kind: 'OpenEPaperLinkCustomDevices',
    version: 1,
    exportedAt: new Date().toISOString(),
    devices: Object.values(state.map).sort((a, b) => a.id.localeCompare(b.id)),
  };
}

export interface ImportResult {
  added: number;
  updated: number;
  skipped: number;
  total: number;
  errors: number;
}

export function importCustomDevices(json: any, opts?: { overwrite?: boolean }): ImportResult {
  restore();
  const overwrite = !!opts?.overwrite;
  const res: ImportResult = { added: 0, updated: 0, skipped: 0, total: 0, errors: 0 };
  try {
    if (!json || json.kind !== 'OpenEPaperLinkCustomDevices') throw new Error('Invalid kind');
    if (json.version !== 1) throw new Error('Unsupported version');
    if (!Array.isArray(json.devices)) throw new Error('Missing devices array');
    for (const raw of json.devices) {
      res.total++;
      try {
        if (!raw || typeof raw !== 'object') throw new Error('bad entry');
        const { id, name, baseUrl } = raw;
        if (!id || !name || !baseUrl) throw new Error('missing fields');
        if (!/^https?:\/\//i.test(baseUrl)) throw new Error('invalid baseUrl');
        const exists = state.map[id];
        if (exists && !overwrite) {
          res.skipped++;
          continue;
        }
        upsertCustomDevice({ id, name, baseUrl });
        if (exists) res.updated++; else res.added++;
      } catch {
        res.errors++;
      }
    }
  } catch {
    res.errors = res.total || 1;
  }
  return res;
}
