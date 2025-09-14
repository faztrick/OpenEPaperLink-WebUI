import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { DeviceEditPanel } from '../components/DeviceEditPanel';
import { Layout } from '../components/Layout';
import { Seo } from '../components/Seo';
import type { DeviceSummary as SharedDeviceSummary } from '../lib/api-types';
import { getDeviceOverride, subscribeDeviceOverrides } from '../lib/deviceOverrides';
import { getSelectedDevice, setSelectedDevice } from '../lib/deviceSelection';
import { fetcher } from '../lib/fetcher';

export default function DevicesPage() {
  const { data, error, isLoading } = useSWR<SharedDeviceSummary[]>('/api/devices', fetcher);
  const [ovVersion, setOvVersion] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Transport UI moved into per-device configuration page.

  useEffect(() => {
    const current = getSelectedDevice();
    if (current) setSelectedId(current.id);
  }, []);

  useEffect(() => {
    const unsub = subscribeDeviceOverrides(() => setOvVersion(v => v + 1));
    return () => { try { unsub(); } catch { /* ignore */ } };
  }, []);

  function selectDevice(d: SharedDeviceSummary) { // depends on overrides (ovVersion)
    const ov = getDeviceOverride(d.id);
    const derived = (d as any).ip ? `http://${(d as any).ip}` : (d as any).baseUrl || '';
    const baseUrl = ov?.baseUrl?.trim() || derived;
    if (!baseUrl) { alert('Device has no reachable base URL'); return; }
    setSelectedDevice({ id: d.id, name: ov?.alias || d.name, baseUrl });
    setSelectedId(d.id);
  }

  // Removed transport subscription (handled in device detail page now).

  // Transport controls removed here.

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingMeta, setEditingMeta] = useState<{ name: string; derived: string } | null>(null);
  // Serial backend/port selection moved into device detail page.

  function openEdit(d: SharedDeviceSummary) {
    const derived = (d as any).ip ? `http://${(d as any).ip}` : (d as any).baseUrl || '';
    setEditingId(d.id);
    setEditingMeta({ name: d.name, derived });
  }

  function handleSaved() {
    // refresh selection meta if needed
    const sel = getSelectedDevice();
    if (sel) {
      const ov = getDeviceOverride(sel.id);
      if (ov) {
        setSelectedDevice({ id: sel.id, name: ov.alias || sel.name, baseUrl: ov.baseUrl || sel.baseUrl });
      }
    }
    setOvVersion(v => v + 1);
  }

  return (
    <Layout title="Devices">
      <Seo title="Devices" description="List of devices (placeholder)" />
      <h2>Devices</h2>
      <div className="sec mb-8">
        <h3 className="heading-mid">Devices</h3>
        <div className="xsmall muted mt-2">Select a device to manage transport, serial backend, and port in its detail page.</div>
      </div>
      {isLoading && <p>Loading devices...</p>}
      {error && <p className="text-error">Failed to load devices: {(error as Error).message}</p>}
      {!isLoading && !error && (
        <table className="table-mini">
          <thead>
            <tr className="text-left"><th>ID</th><th>Name / Alias</th><th>Status</th><th>Base URL</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {(data && data.length ? data : [{ id: 'example-1', name: 'Example Device', status: 'offline', ip: '192.168.4.1' } as any]).map(d => {
              const isSel = selectedId === d.id;
              return (
                <tr key={d.id} className="row-border-top">
                  <td><a href={`/device/${d.id}`}>{d.id}</a></td>
                  <td>{(getDeviceOverride(d.id)?.alias) || d.name} {isSel && <span className="badge badge-ok">Selected</span>}</td>
                  <td>{d.status ?? '-'}</td>
                  <td>{getDeviceOverride(d.id)?.baseUrl || ((d as any).ip ? `http://${(d as any).ip}` : (d as any).baseUrl || '-')}</td>
                  <td>
                    <button className="btn-slim" onClick={() => openEdit(d)}>Edit</button>{' '}
                    <button className="btn-slim" disabled={isSel} onClick={() => selectDevice(d)}>{isSel ? 'Active' : 'Select'}</button>
                    {isSel && <button className="btn-slim ml-2" onClick={() => { setSelectedDevice(null); setSelectedId(null); }}>Clear</button>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {editingId && editingMeta && (
        <DeviceEditPanel
          id={editingId}
          name={editingMeta.name}
          derivedBaseUrl={editingMeta.derived}
          onClose={() => { setEditingId(null); setEditingMeta(null); }}
          onSaved={handleSaved}
        />
      )}
    </Layout>
  );
}
