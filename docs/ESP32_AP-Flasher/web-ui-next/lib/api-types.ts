export interface DeviceSummary { id:string; name:string; status:'online'|'offline'|'unknown'; lastSeen?:string; };
export interface DeviceDetail extends DeviceSummary { firmware?:string; ip?:string; mac?:string; tags?:number; }

export function mockDevices(): DeviceDetail[] {
  return [
    { id:'gw-001', name:'Gateway 001', status:'online', ip:'192.168.1.10', mac:'AA:BB:CC:DD:EE:01', firmware:'1.0.0', lastSeen:new Date().toISOString(), tags:12 },
    { id:'gw-002', name:'Gateway 002', status:'offline', ip:'192.168.1.11', mac:'AA:BB:CC:DD:EE:02', firmware:'1.0.0', lastSeen:new Date(Date.now()-3600_000).toISOString(), tags:5 },
    { id:'gw-003', name:'Gateway 003', status:'unknown', ip:'192.168.1.12', mac:'AA:BB:CC:DD:EE:03', firmware:'1.1.0-beta', lastSeen:new Date(Date.now()-86_400_000).toISOString(), tags:0 }
  ];
}
