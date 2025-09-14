import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { ConnectionSwitcher } from '../components/ConnectionSwitcher';
import { Layout } from '../components/Layout';
import { Seo } from '../components/Seo';
import { WifiConnectPanel } from '../components/WifiConnectPanel';
import { useDeviceWifiStatus } from '../hooks/useDeviceWifi';
import type { DeviceSummary } from '../lib/api-types';
import { getDeviceOverride } from '../lib/deviceOverrides';
import { getSelectedDevice, setSelectedDevice } from '../lib/deviceSelection';
import { fetcher } from '../lib/fetcher';
import { transport } from '../lib/transport';

const WIFI_MODE_NAMES: Record<number, string> = { 0: 'AUTO', 1: 'AP', 2: 'STA', 3: 'AP+STA' };

export default function Dashboard() {
  const { data: devices, error, isLoading } = useSWR<DeviceSummary[]>('/api/devices', fetcher);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<'info' | 'wifi' | 'tags' | 'ap'>('info');

  // sync initial selection
  useEffect(() => {
    const cur = getSelectedDevice();
    if (cur) setSelectedId(cur.id);
  }, []);

  function chooseDevice(d: DeviceSummary) {
    const ov = getDeviceOverride(d.id);
    const derived = (d as any).ip ? `http://${(d as any).ip}` : (d as any).baseUrl || '';
    const baseUrl = ov?.baseUrl?.trim() || derived;
    if (!baseUrl) { alert('Device has no reachable base URL'); return; }
    setSelectedDevice({ id: d.id, name: ov?.alias || d.name, baseUrl });
    setSelectedId(d.id);
  }

  // Wi-Fi integration (device + serial) when wifi tab active
  const wifiEnabled = !!selectedId && tab === 'wifi';
  const { status, loading: statusLoading, error: statusError, reload: reloadStatus, needsDeviceSelection: needSelStatus, stale: statusStale } = useDeviceWifiStatus(wifiEnabled ? 5000 : 0);
  const [tStatus, setTStatus] = useState(() => transport().getStatus());

  useEffect(() => {
    const t = transport();
    const unsub = t.subscribe(s => setTStatus(s));
    return () => unsub();
  }, []);

  const disabledTabs = !selectedId;

  const filteredDevices = useMemo(() => devices || [], [devices]);

  // Legacy per-page Wi-Fi connect/scan/mode UI removed; replaced by consolidated WifiConnectPanel.

  return (
    <Layout title="Dashboard" description="Unified device dashboard">
      <Seo title="Dashboard" description="Unified device dashboard" />
      <div className="flex gap flex-wrap mt-2">
        <div className="minw-300 card">
          <h2 className="mt-0 heading-mid">Devices</h2>
          {isLoading && <p className="small muted">Loading...</p>}
          {error && <p className="text-error small">Failed: {(error as Error).message}</p>}
          <table className="table-mini mt-2">
            <thead><tr><th>ID</th><th>Name</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {filteredDevices.map(d => {
                const isSel = d.id === selectedId;
                return (
                  <tr key={d.id} className={isSel ? 'row-border-top active-row' : 'row-border-top'}>
                    <td>{d.id}</td>
                    <td>{(getDeviceOverride(d.id)?.alias) || d.name}</td>
                    <td>{(d as any).status ?? '-'}</td>
                    <td><button className="btn-slim" disabled={isSel} onClick={() => chooseDevice(d)}>{isSel ? 'Selected' : 'Select'}</button></td>
                  </tr>
                );
              })}
              {!isLoading && filteredDevices.length === 0 && <tr><td colSpan={4}>No devices</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="flex-1 minw-480 card">
          <h2 className="mt-0 heading-mid flex gap-2 items-center">Details <span className="flex-1" /> <span className="xsmall"><ConnectionSwitcher /></span></h2>
          <div className="tab-bar flex gap mt-2 flex-wrap">
            <button className="btn-slim" disabled={false} onClick={() => setTab('info')}>Info{tab === 'info' ? '*' : ''}</button>
            <button className="btn-slim" disabled={disabledTabs} onClick={() => setTab('wifi')}>Wi‑Fi{tab === 'wifi' ? '*' : ''}</button>
            <button className="btn-slim" disabled={disabledTabs} onClick={() => setTab('tags')}>Tags{tab === 'tags' ? '*' : ''}</button>
            <button className="btn-slim" disabled={disabledTabs} onClick={() => setTab('ap')}>AP List{tab === 'ap' ? '*' : ''}</button>
          </div>
          {!selectedId && <div className="callout warn small mt-4">Select a device to enable tabs.</div>}
          {tab === 'info' && selectedId && (
            <div className="mt-4 small">Device <strong>{selectedId}</strong> selected. (Additional info panel TBD)</div>
          )}
          {tab === 'wifi' && (
            <div className="mt-4">
              <WifiConnectPanel selectedDeviceId={selectedId} />
            </div>
          )}
          {tab === 'tags' && selectedId && <div className="mt-4 small">Tags view placeholder for device {selectedId}</div>}
          {tab === 'ap' && selectedId && <div className="mt-4 small">AP List placeholder for device {selectedId}</div>}
        </div>
      </div>
    </Layout>
  );
}
