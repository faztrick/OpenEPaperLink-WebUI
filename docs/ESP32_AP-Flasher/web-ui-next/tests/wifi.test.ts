import { describe, expect, it } from 'vitest';
import { wifiConnect, wifiDisconnect, wifiScan, wifiStatus } from '../lib/legacy/wifi';

function setFetch(handler: (url:string, init?:any)=>any){
  // @ts-ignore
  global.fetch = async (url: string, init?: any) => {
    const data = await handler(url, init);
    return { ok: data.ok !== false, json: async () => data.body } as any;
  };
}

describe('wifi module', () => {
  it('scan maps network fields', async () => {
    setFetch(()=> ({ body: { success: true, networks: [{ SSID:'TestNet', RSSI: -50, encryption:'WPA2' }] } }));
    const nets = await wifiScan('dev1');
    expect(nets[0]).toMatchObject({ ssid: 'TestNet', rssi: -50 });
  });

  it('status returns normalized object', async () => {
    setFetch(()=> ({ body: { success: true, connected:true, ssid:'X', ip:'1.2.3.4', rssi:-42, channel:6, mode:'STA' } }));
    const st = await wifiStatus('dev1');
    expect(st.connected).toBe(true);
    expect(st.ssid).toBe('X');
  });

  it('connect throws on failure', async () => {
    setFetch(()=> ({ body: { success: false, error: 'bad' } }));
    await expect(wifiConnect('dev1','a','b')).rejects.toThrow(/bad/);
  });

  it('disconnect ok', async () => {
    setFetch(()=> ({ body: { success: true } }));
    await expect(wifiDisconnect('dev1')).resolves.toBe(true);
  });
});
