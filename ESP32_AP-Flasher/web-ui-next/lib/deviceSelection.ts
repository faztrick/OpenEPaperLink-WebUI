// Global device selection store for device-aware transport.
// A lightweight pub-sub pattern (no external state lib) to track selected device context.
// Selected device influences API base resolution (see apiBase.ts) so that transport
// operations target the chosen device without manual base URL overrides.

export interface SelectedDevice {
  id: string;
  name?: string;
  // Base URL to reach device root (e.g., http://192.168.4.23 ) NO trailing slash.
  baseUrl: string;
  // Optional metadata for future (firmware version, lastSeen, etc.)
  meta?: Record<string, any>;
}

interface DeviceSelectionStore {
  current: SelectedDevice | null;
  listeners: Set<(d: SelectedDevice | null) => void>;
}

const store: DeviceSelectionStore = {
  current: null,
  listeners: new Set(),
};

const LS_KEY = 'selectedDevice';

function persist(device: SelectedDevice | null) {
  try {
    if (typeof window === 'undefined') return;
    if (device) localStorage.setItem(LS_KEY, JSON.stringify(device));
    else localStorage.removeItem(LS_KEY);
  } catch { /* ignore */ }
}

function restore() {
  if (typeof window === 'undefined') return;
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as SelectedDevice;
      if (parsed && parsed.baseUrl) {
        store.current = parsed;
      }
    }
  } catch { /* ignore */ }
}

export function initDeviceSelection() {
  if (typeof window !== 'undefined' && store.current == null) restore();
}

export function getSelectedDevice(): SelectedDevice | null {
  return store.current;
}

export function setSelectedDevice(dev: SelectedDevice | null) {
  store.current = dev;
  persist(dev);
  for (const l of store.listeners) l(dev);
}

export function subscribeSelectedDevice(cb: (d: SelectedDevice | null) => void) {
  store.listeners.add(cb);
  cb(store.current);
  return () => store.listeners.delete(cb);
}
