import { beforeEach, describe, expect, it } from 'vitest';
import { useDeviceWifiStatus } from '../hooks/useDeviceWifi';
import { renderHook } from './utils/renderHook';

// Provide minimal mocks for device selection and transport
vi.mock('../lib/deviceSelection', () => ({ getSelectedDevice: () => ({ id: 'dev1', baseUrl: 'http://x' }) }));
vi.mock('../lib/transport', () => ({ transport: () => ({ getStatus: () => ({ preferred: 'serial', serialOpen: false }), }) }));

// Simple fetch mock sequence: serial attempt fails, http succeeds
beforeEach(() => {
  let call = 0;
  // @ts-ignore
  global.fetch = vi.fn(async (url: string) => {
    call++;
    if (url.startsWith('/api/serial')) {
      return { ok: true, json: async () => ({ error: 'status_parse_failed' }) } as any;
    }
    if (url.includes('/api/device/api/wifi/status')) {
      return { ok: true, json: async () => ({ connected: true, ssid: 'TestNet', ip: '1.2.3.4' }) } as any;
    }
    if (url.includes('/api/device/api/v1/wifi/status')) {
      return { ok: true, json: async () => ({ connected: true, ssid: 'TestNetV1', ip: '1.2.3.4' }) } as any;
    }
    return { ok: false, status: 404, json: async () => ({ error: 'nf' }) } as any;
  });
});

describe('useDeviceWifiStatus serial+http fallback', () => {
  it('falls back to http when serial parse fails', async () => {
    const { result } = renderHook(() => useDeviceWifiStatus(0));
    // allow microtask flush
    await new Promise(r => setTimeout(r, 10));
    expect(result.current.status?.connected).toBe(true);
    expect(result.current.status?.ssid).toBe('TestNet');
  });
});
