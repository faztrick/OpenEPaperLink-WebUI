// Lightweight client-side metadata store for devices.
// Persists per-device details (modules, configs, notes, connectionType history, etc.)
// Strictly local (no backend yet). Can be exported/imported via JSON.

export interface DeviceMeta {
  id: string;
  modules: string[];
  connectionType?: string; // derived (e.g., serial, sidecar, http)
  preferredTransport?: 'auto' | 'http' | 'serial'; // per-device preferred transport (overrides global when device selected)
  configs?: Record<string, string>; // arbitrary key/value config
  notes?: string;
  categories?: string[]; // grouping tags (core, hw, net, etc.)
  caps?: Record<string, boolean>; // discovered capabilities
  updatedAt: number; // epoch ms
}

interface MetaStore {
  version: number;
  items: Record<string, DeviceMeta>;
}

const LS_KEY = 'deviceMetaStore.v1';

function loadStore(): MetaStore {
  if (typeof window === 'undefined') return { version: 1, items: {} };
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return { version: 1, items: {} };
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && parsed.items) return parsed as MetaStore;
  } catch {/* ignore */ }
  return { version: 1, items: {} };
}

function saveStore(store: MetaStore) {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(LS_KEY, JSON.stringify(store)); } catch {/* ignore */ }
}

let cache: MetaStore | null = null;
const listeners = new Set<() => void>();

function getStore(): MetaStore {
  if (!cache) cache = loadStore();
  return cache;
}

export function getDeviceMeta(id: string): DeviceMeta | null {
  const s = getStore();
  return s.items[id] || null;
}

export function listDeviceMeta(): DeviceMeta[] {
  const s = getStore();
  return Object.values(s.items);
}

export function upsertDeviceMeta(id: string, patch: Partial<Omit<DeviceMeta, 'id' | 'updatedAt'>>): DeviceMeta {
  const s = getStore();
  const existing = s.items[id] || { id, modules: [], updatedAt: Date.now() } as DeviceMeta;
  const updated: DeviceMeta = {
    ...existing,
    ...patch,
    modules: patch.modules ? [...new Set(patch.modules.map(m => m.trim()).filter(Boolean))] : existing.modules,
    categories: patch.categories ? [...new Set(patch.categories.map(c => c.trim()).filter(Boolean))] : existing.categories,
    updatedAt: Date.now(),
  };
  s.items[id] = updated;
  saveStore(s);
  for (const l of listeners) l();
  return updated;
}

export function replaceAllMeta(metas: DeviceMeta[]) {
  const s: MetaStore = { version: 1, items: {} };
  for (const m of metas) {
    if (!m.id) continue;
    s.items[m.id] = { ...m, modules: Array.isArray(m.modules) ? m.modules : [], categories: Array.isArray(m.categories) ? m.categories : undefined, updatedAt: m.updatedAt || Date.now() };
  }
  cache = s;
  saveStore(s);
  for (const l of listeners) l();
}

export function exportMeta(): string {
  const s = getStore();
  return JSON.stringify(s.items, null, 2);
}

export function importMeta(json: string) {
  try {
    const parsed = JSON.parse(json);
    if (parsed && typeof parsed === 'object') {
      const metas: DeviceMeta[] = Object.keys(parsed).map(id => ({ id, modules: [], updatedAt: Date.now(), ...(parsed as any)[id] }));
      replaceAllMeta(metas);
    }
  } catch (e) {
    throw new Error('Invalid JSON: ' + (e as Error).message);
  }
}

export function subscribeDeviceMeta(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
