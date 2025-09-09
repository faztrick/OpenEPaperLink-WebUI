import { requestJson } from '../request';
import { SerialPortInfo } from './types';

export async function fetchSerialPorts(): Promise<SerialPortInfo[]> {
  try {
    const data = await requestJson('/api/serial/ports');
    if (!Array.isArray(data)) return [];
    return data.filter(p => p && typeof p === 'object' && 'path' in p).map(p => ({
      path: String(p.path),
      manufacturer: p.manufacturer ? String(p.manufacturer) : undefined,
      serialNumber: p.serialNumber ? String(p.serialNumber) : undefined,
      vendorId: p.vendorId ? String(p.vendorId) : undefined,
      productId: p.productId ? String(p.productId) : undefined
    }));
  } catch { return []; }
}
