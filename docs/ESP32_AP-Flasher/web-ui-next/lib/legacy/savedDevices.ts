import { DeviceRecord } from './types';

const STORE_KEY = 'dev_saved_devices_v1';
const SELECT_KEY = 'dev_selected_device_v2';

export interface SavedDevice extends DeviceRecord {}

export interface SavedDevicesStore {
  list: SavedDevice[];
  selectedId: string | null;
}

function readJSON<T>(key: string, fallback: T): T { try { const v = localStorage.getItem(key); if(!v) return fallback; return JSON.parse(v); } catch { return fallback; } }
function writeJSON(key: string, value: any){ try { localStorage.setItem(key, JSON.stringify(value)); } catch {} }
function readStr(key: string){ try { return localStorage.getItem(key); } catch { return null; } }
function writeStr(key: string, val: string | null){ try { if(val) localStorage.setItem(key, val); else localStorage.removeItem(key);} catch {} }

export function loadSavedDevices(): SavedDevicesStore {
  const raw = readJSON<any[]>(STORE_KEY, []);
  const list: SavedDevice[] = Array.isArray(raw) ? raw.map(d=> ({
    id: d.id,
    name: d.name || d.id || 'Device',
    host: d.host || d.ip || '',
    com: d.com || '',
    method: (d.method === 'serial' || d.method === 'ws' || d.method === 'http') ? d.method : 'http'
  })) : [];
  const selectedId = readStr(SELECT_KEY) || null;
  return { list, selectedId };
}

export function persistSavedDevices(store: SavedDevicesStore){
  writeJSON(STORE_KEY, store.list.map(d=> ({ id:d.id, name:d.name, host:d.host, com:d.com, method:d.method })));
  writeStr(SELECT_KEY, store.selectedId);
}

export function addSavedDevice(store: SavedDevicesStore, dev: Omit<SavedDevice,'id'> & Partial<Pick<SavedDevice,'id'>>): SavedDevicesStore {
  const id = dev.id || ('d'+Math.random().toString(36).slice(2,10));
  const rec: SavedDevice = { id, name: dev.name || id, host: dev.host || '', com: dev.com || '', method: dev.method || 'http' };
  const next: SavedDevicesStore = { list: [...store.list, rec], selectedId: store.selectedId || id };
  persistSavedDevices(next); return next;
}

export function updateSavedDevice(store: SavedDevicesStore, id: string, patch: Partial<SavedDevice>): SavedDevicesStore {
  const list = store.list.map(d=> d.id===id ? { ...d, ...patch } : d);
  const next = { list, selectedId: store.selectedId };
  persistSavedDevices(next); return next;
}

export function removeSavedDevice(store: SavedDevicesStore, id: string): SavedDevicesStore {
  const list = store.list.filter(d=> d.id!==id);
  const selectedId = store.selectedId === id ? (list[0]?.id || null) : store.selectedId;
  const next = { list, selectedId };
  persistSavedDevices(next); return next;
}

export function selectSavedDevice(store: SavedDevicesStore, id: string | null): SavedDevicesStore {
  const next = { list: store.list, selectedId: id };
  persistSavedDevices(next); return next;
}

export function cycleDeviceMethod(store: SavedDevicesStore, id: string): SavedDevicesStore {
  const order = ['http','ws','serial'] as const;
  const list = store.list.map(d=>{
    if(d.id!==id) return d;
    const idx = order.indexOf((d.method as any) || 'http');
    return { ...d, method: order[(idx+1)%order.length] };
  });
  const next = { list, selectedId: store.selectedId };
  persistSavedDevices(next); return next;
}
