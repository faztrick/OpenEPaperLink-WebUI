import { useEffect, useState } from 'react';
import { Layout } from '../components/Layout';
import { apiGet } from '../lib/apiClient';

interface SysInfo {
  alias?: string; env?: string; buildtime?: string; buildversion?: string; sha?: string; psramsize?: number; flashsize?: number; rollback?: boolean; ap_version?: string; hasC6?: number; hasH2?: number; hasTslr?: number; hasFlasher?: number;
}
interface Telemetry { uptime_ms?: number; freeHeap?: number; freePsram?: number; heapSize?: number; minFreeHeap?: number; cpuFreqMHz?: number; rssi?: number; wifiStatus?: number; localIP?: string; macAddress?: string; apState?: any; tagCount?: number; }

export default function BuildPage() {
  const [sys, setSys] = useState<SysInfo | null>(null);
  const [tel, setTel] = useState<Telemetry | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const s = await apiGet<SysInfo>('/api/device/sysinfo');
      setSys(s);
      const t = await apiGet<Telemetry>('/api/device/api/telemetry');
      setTel(t);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); const i = setInterval(load, 10000); return () => clearInterval(i); }, []);

  return (
    <Layout title="Build" description="Device build & runtime info">
      <h2>Build & Runtime</h2>
      {loading && <div className='center-muted'>Loading…</div>}
      {error && <div className='small text-error'>Error: {error}</div>}
      {sys && (
        <section className='sec sec-mid'>
          <h3 className='heading-gap-tight'>Build Metadata</h3>
          <div className='grid-2col-meta'>
            <div>Alias</div><div>{sys.alias}</div>
            <div>Environment</div><div>{sys.env}</div>
            <div>Version</div><div>{sys.buildversion}</div>
            <div>Build Time</div><div>{sys.buildtime}</div>
            <div>Commit SHA</div><div>{sys.sha}</div>
            <div>AP FW Version</div><div>{sys.ap_version}</div>
            <div>Flash Size</div><div>{sys.flashsize} bytes</div>
            <div>PSRAM Size</div><div>{sys.psramsize}</div>
            <div>Rollback Available</div><div>{sys.rollback ? 'Yes' : 'No'}</div>
            <div>Modules</div><div>C6:{sys.hasC6} H2:{sys.hasH2} TSLR:{sys.hasTslr} Flasher:{sys.hasFlasher}</div>
          </div>
        </section>
      )}
      {tel && (
        <section className='sec mt sec-mid'>
          <h3 className='heading-gap-tight'>Telemetry</h3>
          <div className='grid-2col-meta'>
            <div>Uptime</div><div>{tel.uptime_ms} ms</div>
            <div>Free Heap</div><div>{tel.freeHeap} / {tel.heapSize} (min {tel.minFreeHeap})</div>
            {typeof tel.freePsram === 'number' && <><div>Free PSRAM</div><div>{tel.freePsram}</div></>}
            <div>CPU MHz</div><div>{tel.cpuFreqMHz}</div>
            <div>Wi‑Fi RSSI</div><div>{tel.rssi}</div>
            <div>Wi‑Fi Status</div><div>{tel.wifiStatus}</div>
            <div>Local IP</div><div>{tel.localIP}</div>
            <div>MAC</div><div>{tel.macAddress}</div>
            <div>AP State</div><div>{String(tel.apState)}</div>
            <div>Tag Count</div><div>{tel.tagCount}</div>
          </div>
        </section>
      )}
    </Layout>
  );
}
