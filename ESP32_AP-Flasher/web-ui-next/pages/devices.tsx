import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { DeviceCustomPanel } from '../components/DeviceCustomPanel';
import { DeviceEditPanel } from '../components/DeviceEditPanel';
import { Layout } from '../components/Layout';
import { ReachabilityBadge } from '../components/ReachabilityBadge';
import { Seo } from '../components/Seo';
import { computeReachabilitySummary, triggerReachabilityRefresh } from '../hooks/useDeviceReachability';
import { showToast } from '../hooks/useToast';
import type { DeviceSummary as SharedDeviceSummary } from '../lib/api-types';
import { CustomDevice, exportCustomDevices, getAllCustomDevices, importCustomDevices, subscribeCustomDevices } from '../lib/customDevices';
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
    if (!baseUrl) { showToast('Device has no reachable base URL', 'error'); return; }
    setSelectedDevice({ id: d.id, name: ov?.alias || d.name, baseUrl });
    setSelectedId(d.id);
  }

  // Removed transport subscription (handled in device detail page now).

  // Transport controls removed here.

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingMeta, setEditingMeta] = useState<{ name: string; derived: string } | null>(null);
  const [customPanelMode, setCustomPanelMode] = useState<'add' | 'edit' | null>(null);
  const [editingCustomId, setEditingCustomId] = useState<string | null>(null);
  const [customVersion, setCustomVersion] = useState(0);
  // Serial backend/port selection moved into device detail page.

  function openEdit(d: SharedDeviceSummary) {
    const derived = (d as any).ip ? `http://${(d as any).ip}` : (d as any).baseUrl || '';
    setEditingId(d.id);
    setEditingMeta({ name: d.name, derived });
  }

  // Custom devices support
  useEffect(() => {
    const unsub = subscribeCustomDevices(() => setCustomVersion(v => v + 1));
    return () => { try { unsub(); } catch { /* ignore */ } };
  }, []);

  const customDevices: CustomDevice[] = (() => {
    const all = getAllCustomDevices();
    return Object.values(all).sort((a, b) => a.id.localeCompare(b.id));
  })();

  function openAddCustom() {
    setCustomPanelMode('add');
    setEditingCustomId(null);
  }

  function openEditCustom(id: string) {
    setCustomPanelMode('edit');
    setEditingCustomId(id);
  }

  function handleCustomSaved() {
    setCustomVersion(v => v + 1);
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

  // Aggregate reachability summary (computed from cache + current list). Refresh when relevant lists change or on events.
  const [summary, setSummary] = useState<{ up: number; down: number; unknown: number; total: number } | null>(null);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    function updateSummary() {
      const discovered = (data && data.length ? data : [{ id: 'example-1', ip: '192.168.4.1' } as any]).map(d => (getDeviceOverride(d.id)?.baseUrl || ((d as any).ip ? `http://${(d as any).ip}` : (d as any).baseUrl || ''))).filter(Boolean);
      const custom = customDevices.filter(cd => !(data || []).some(d => d.id === cd.id)).map(cd => cd.baseUrl);
      const all = [...discovered, ...custom];
      setSummary(computeReachabilitySummary(all));
    }
    updateSummary();
    const handler = () => updateSummary();
    window.addEventListener('reachability.updated', handler);
    return () => { window.removeEventListener('reachability.updated', handler); };
  }, [data, customVersion, ovVersion]);

  function manualRefresh() {
    triggerReachabilityRefresh();
    // optimistic immediate summary refresh (will refine as probes complete)
    setTimeout(() => {
      try {
        const discovered = (data && data.length ? data : [{ id: 'example-1', ip: '192.168.4.1' } as any]).map(d => (getDeviceOverride(d.id)?.baseUrl || ((d as any).ip ? `http://${(d as any).ip}` : (d as any).baseUrl || ''))).filter(Boolean);
        const custom = customDevices.filter(cd => !(data || []).some(d => d.id === cd.id)).map(cd => cd.baseUrl);
        const all = [...discovered, ...custom];
        setSummary(computeReachabilitySummary(all));
      } catch { /* ignore */ }
    }, 50);
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
        <>
          <div className="mb-3 flex-row gap-2">
            <button className="btn-slim" onClick={openAddCustom}>Add Custom Device</button>
            <button className="btn-slim" onClick={() => {
              try {
                const blob = new Blob([JSON.stringify(exportCustomDevices(), null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'custom-devices.json';
                document.body.appendChild(a);
                a.click();
                a.remove();
                URL.revokeObjectURL(url);
              } catch (e: any) { showToast('Export failed: ' + (e?.message || e), 'error'); }
            }}>Export</button>
            <button className="btn-slim" onClick={() => { document.getElementById('importCustomDevicesInput')?.click(); }}>Import</button>
            <button className="btn-slim" onClick={manualRefresh}>Refresh Status</button>
            {summary && (
              <span className="xsmall muted ml-2">Reachability: <span className="mono">{summary.up}</span> up / <span className="mono">{summary.down}</span> down / <span className="mono">{summary.unknown}</span> unknown</span>
            )}
            <input id="importCustomDevicesInput" type="file" accept="application/json" className="hidden-input" onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              try {
                const text = await file.text();
                const parsed = JSON.parse(text);
                const res = importCustomDevices(parsed, { overwrite: true });
                showToast(`Import: +${res.added} upd:${res.updated} skip:${res.skipped} err:${res.errors}`, res.errors ? 'error' : 'success');
                setCustomVersion(v => v + 1);
              } catch (err: any) {
                showToast('Import failed: ' + (err?.message || err), 'error');
              } finally {
                e.target.value = '';
              }
            }} />
          </div>
          <table className="table-mini">
            <thead>
              <tr className="text-left"><th>ID</th><th>Name / Alias</th><th>Status</th><th>Base URL</th><th>Type</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {(data && data.length ? data : [{ id: 'example-1', name: 'Example Device', status: 'offline', ip: '192.168.4.1' } as any]).map((d, idx) => {
                const isSel = selectedId === d.id;
                // Derive effective baseUrl (override > ip > provided baseUrl)
                const effectiveBaseUrl = getDeviceOverride(d.id)?.baseUrl || ((d as any).ip ? `http://${(d as any).ip}` : (d as any).baseUrl || '');
                // Stagger to avoid thundering herd of pings across device list.
                return (
                  <tr key={d.id} className="row-border-top">
                    <td><a href={`/device/${d.id}`}>{d.id}</a></td>
                    <td>{(getDeviceOverride(d.id)?.alias) || d.name} {isSel && <span className="badge badge-ok">Selected</span>}</td>
                    <td><ReachabilityBadge baseUrl={effectiveBaseUrl} intervalMs={20000} startDelayMs={idx * 350} unreachableTitle={d.status || 'Unreachable'} /></td>
                    <td>{effectiveBaseUrl || '-'}</td>
                    <td><span className="badge badge-dim">Discovered</span></td>
                    <td>
                      <button className="btn-slim" onClick={() => openEdit(d)}>Edit</button>{' '}
                      <button className="btn-slim" disabled={isSel} onClick={() => selectDevice(d)}>{isSel ? 'Active' : 'Select'}</button>
                      {isSel && <button className="btn-slim ml-2" onClick={() => { setSelectedDevice(null); setSelectedId(null); }}>Clear</button>}
                    </td>
                  </tr>
                );
              })}
              {(() => {
                const discoveredCount = (data && data.length ? data.length : 1); // include example row fallback
                return customDevices.filter(cd => !(data || []).some(d => d.id === cd.id)).map((cd, idx) => {
                  const isSel = selectedId === cd.id;
                  return (
                    <tr key={cd.id} className="row-border-top">
                      <td><span className="mono">{cd.id}</span></td>
                      <td>{cd.name} {isSel && <span className="badge badge-ok">Selected</span>}</td>
                      <td><ReachabilityBadge baseUrl={cd.baseUrl} intervalMs={20000} startDelayMs={(discoveredCount + idx) * 350} /></td>
                      <td>{cd.baseUrl}</td>
                      <td><span className="badge badge-warn">Custom</span></td>
                      <td>
                        <button className="btn-slim" onClick={() => openEditCustom(cd.id)}>Edit</button>{' '}
                        <button className="btn-slim" disabled={isSel} onClick={() => { setSelectedDevice({ id: cd.id, name: cd.name, baseUrl: cd.baseUrl }); setSelectedId(cd.id); }}>{isSel ? 'Active' : 'Select'}</button>
                        {isSel && <button className="btn-slim ml-2" onClick={() => { setSelectedDevice(null); setSelectedId(null); }}>Clear</button>}
                      </td>
                    </tr>
                  );
                });
              })()}
            </tbody>
          </table>
        </>
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
      {customPanelMode && (
        <DeviceCustomPanel
          mode={customPanelMode}
          id={editingCustomId || undefined}
          existingIds={new Set([
            ...(data || []).map(d => d.id),
            ...customDevices.map(cd => cd.id)
          ])}
          onClose={() => { setCustomPanelMode(null); setEditingCustomId(null); }}
          onSaved={handleCustomSaved}
        />
      )}
    </Layout>
  );
}
<style jsx>{`
  .hidden-input { display:none; }
`}</style>
