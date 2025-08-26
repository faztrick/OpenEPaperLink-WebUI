// Shared legacy-migrated types
export interface DeviceRecord {
  id: string;
  name: string;
  host?: string; // ip/host base
  com?: string; // serial COM path
  method?: 'http' | 'serial' | 'ws';
}

export interface DevicesState {
  devices: DeviceRecord[];
  selectedId: string | null;
  commMode: 'serial' | 'http' | 'ws';
  commPort: string;
}

export interface SerialPortInfo { path: string; manufacturer?: string; serialNumber?: string; vendorId?: string; productId?: string }
