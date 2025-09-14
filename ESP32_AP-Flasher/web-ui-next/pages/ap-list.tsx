import { useCallback, useMemo, useState } from 'react';
import useSWR from 'swr';
import { Layout } from '../components/Layout';
import { Seo } from '../components/Seo';
import { transport } from '../lib/transport';

interface WifiSummaryItem {
  mac?: string;
  host?: string;
  ip?: string;
  ap?: { enabled?: boolean; channel?: number };
  wifi?: { ssid?: string; rssi?: number; channel?: number; connected?: boolean };
  uptime?: number;
  version?: string | number;
  hwType?: number;
  state?: string;
}

interface SummaryResponse { devices?: WifiSummaryItem[] }

async function fetchSummary(): Promise<WifiSummaryItem[]> {
  const t = transport();
  const j: SummaryResponse | WifiSummaryItem[] = await t.get('/api/wifi/summary');
  if (Array.isArray(j)) return j;
  if (j && Array.isArray((j as SummaryResponse).devices)) return (j as SummaryResponse).devices!;
  return [];
}

async function toggleAp(hostOrIp: string, enable: boolean): Promise<boolean> {
  const t = transport();
  const paths = enable
    ? ['/api/ap/enable', '/ap_enable']
    : ['/api/ap/disable', '/ap_disable'];
  for (const p of paths) {
    try {
      await t.post(p + (p.includes('?') ? '' : `?host=${encodeURIComponent(hostOrIp)}`), {});
      return true;
    } catch (_) { /* try next */ }
  }
  return false;
}

function normalize(items: WifiSummaryItem[]) {
  return items.map(d => {
    const apEnabled = d.ap?.enabled === true || /ap/i.test(d.state || '') && !(d.wifi?.connected);
    const channel = d.ap?.channel ?? d.wifi?.channel;
    const rssi = d.wifi?.rssi;
    return { ...d, apEnabled, channel, rssi } as WifiSummaryItem & { apEnabled: boolean; channel?: number; rssi?: number };
  });
}

export default function APListPage() {
  const { data, error, isLoading, mutate, isValidating } = useSWR<WifiSummaryItem[]>('wifi-summary', fetchSummary, { refreshInterval: 10000 });
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const list = useMemo(() => normalize(data || []), [data]);

  const handleToggle = useCallback(async (entry: any) => {
    setActionMsg(null);
    const host = entry.host || entry.ip;
    if (!host) { setActionMsg('No host for device'); return; }
    const target = !entry.apEnabled;
    setActionMsg((target ? 'Enabling' : 'Disabling') + ' AP...');
    const ok = await toggleAp(host, target);
    setActionMsg(ok ? 'AP ' + (target ? 'enabled' : 'disabled') : 'AP toggle failed');
    mutate();
    setTimeout(() => setActionMsg(null), 4000);
  }, [mutate]);

  return (
    <Layout title="AP / Wi-Fi Summary">
      <Seo title="AP / Wi-Fi Summary" description="Access Point & Wi-Fi status across devices" />
      <div className="flex items-center gap-12">
        <h2 className="mt-0">AP / Wi-Fi Summary</h2>
        <button className="btn btn-small" onClick={() => mutate()} disabled={isValidating}>{isValidating ? 'Refreshing…' : 'Refresh'}</button>
      </div>
      {actionMsg && <div className="text-12 mt-4 opacity-80">{actionMsg}</div>}
      {isLoading && <p>Loading…</p>}
      {error && <p className="text-error">Error: {(error as Error).message}</p>}
      {!isLoading && !error && (
        <div className="grid-gap-8 mt-8">
          {list.length === 0 && <div className="opacity-60">No devices reported.</div>}
          {list.map((dev, i) => (
            <div key={i} className="ap-card">
              <div className="ap-card-header">
                <strong>{dev.mac || dev.host || dev.ip || 'Device'}</strong>
                <span className="ap-state">{dev.apEnabled ? 'AP Enabled' : (dev.wifi?.connected ? 'STA Connected' : 'Idle')}</span>
              </div>
              <div className="ap-grid">
                <Field label="Version" value={String(dev.version ?? '-')} />
                <Field label="Channel" value={dev.channel != null ? String(dev.channel) : '-'} />
                <Field label="RSSI" value={dev.rssi != null ? `${dev.rssi} dBm` : '-'} />
                <Field label="SSID" value={dev.wifi?.ssid || '-'} />
                <Field label="IP" value={dev.ip || '-'} />
                <Field label="Uptime" value={dev.uptime != null ? `${dev.uptime}s` : '-'} />
                <Field label="Mode" value={dev.apEnabled ? 'AP' : (dev.wifi?.connected ? 'STA' : '-')} />
                <div className="flex flex-col gap-4 mt-4">
                  <button className="btn btn-small" onClick={() => handleToggle(dev)}>{dev.apEnabled ? 'Disable AP' : 'Enable AP'}</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Layout>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return <div><div className="opacity-60 text-12">{label}</div><div>{value}</div></div>;
}
