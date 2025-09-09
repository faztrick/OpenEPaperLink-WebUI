import { DeviceRecord, DevicesState } from './types';

const LS_SELECTED = 'oepl:dev:selectedDevice';
const LS_COMM_MODE = 'oepl:dev:commMode';
const LS_COMM_PORT = 'oepl:dev:commPort';

function loadLS(key: string){ try { return localStorage.getItem(key); } catch { return null; } }
function saveLS(key: string, val: string){ try { localStorage.setItem(key, val); } catch {} }

export interface DevicesManager extends DevicesState {
  refreshDevices(): Promise<void>;
  setSelected(id: string | null): void;
  setCommPort(port: string): void;
  computeDeviceBase(id?: string | null): string | null;
}

export function createDevicesManager(): DevicesManager {
  const state: DevicesState = {
    devices: [],
    selectedId: null,
    commMode: (loadLS(LS_COMM_MODE) as any) || 'serial',
    commPort: loadLS(LS_COMM_PORT) || ''
  };
  const mgr: DevicesManager = {
    ...state,
    async refreshDevices(){
      try {
        const r = await fetch('/api/devices');
        if(!r.ok) throw new Error('devices HTTP '+r.status);
        const j = await r.json();
        if(j && Array.isArray(j.devices)){
          state.devices = j.devices.map((d: any)=> ({ id: d.id, name: d.name || d.id, host: d.host || d.ip || '', com: d.port || d.com || '', method: d.method || 'http' } as DeviceRecord));
          if(!state.selectedId){
            state.selectedId = j.selectedId || (state.devices[0]?.id ?? null);
          }
        }
      } catch(e){
        // swallow for now
      }
      Object.assign(mgr, state);
    },
    setSelected(id){
      state.selectedId = id; saveLS(LS_SELECTED, id || '');
      Object.assign(mgr, state);
    },
    setCommPort(port){
      state.commPort = port; saveLS(LS_COMM_PORT, port);
      Object.assign(mgr, state);
    },
    computeDeviceBase(id = state.selectedId){
      const d = state.devices.find(dd=>dd.id===id);
      if(!d || !d.host) return null;
      if(/^https?:\/\//i.test(d.host)) return d.host.replace(/\/$/, '');
      return 'http://' + d.host.replace(/\/$/, '');
    }
  };
  // initialize selected from LS
  const sel = loadLS(LS_SELECTED); if(sel) mgr.setSelected(sel);
  return mgr;
}
