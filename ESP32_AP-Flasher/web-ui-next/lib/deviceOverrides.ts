// Local device override store: aliases & custom base URLs per device id.
// Persisted in localStorage. Not synced to backend (future option).

export interface DeviceOverride {
  alias?: string;
  baseUrl?: string; // custom base URL override
  port?: string; // optional explicit port; if present can override / supplement baseUrl
}

interface OverridesState {
  map: Record<string, DeviceOverride>;
  listeners: Set<() => void>;
}

const LS_KEY = 'deviceOverrides';
const state: OverridesState = { map: {}, listeners: new Set() };
let restored = false;

function persist() {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(LS_KEY, JSON.stringify(state.map)); } catch { /* ignore */ }
}

function restore() {
  if (restored || typeof window === 'undefined') return;
  restored = true;
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') state.map = parsed;
    }
  } catch { /* ignore */ }
}

export function getDeviceOverride(id: string): DeviceOverride | undefined {
  restore();
  return state.map[id];
}

export function getAllDeviceOverrides(): Record<string, DeviceOverride> {
  restore();
  return { ...state.map };
}

export function setDeviceOverride(id: string, override: DeviceOverride | null) {
  restore();
  if (!override || (Object.keys(override).length === 0)) delete state.map[id];
  else state.map[id] = override;
  persist();
  for (const l of state.listeners) l();
}

export function subscribeDeviceOverrides(cb: () => void) {
  restore();
  state.listeners.add(cb);
  return () => state.listeners.delete(cb);
}
