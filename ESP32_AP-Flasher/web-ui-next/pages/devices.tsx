import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { DeviceCustomPanel } from '../components/DeviceCustomPanel';
import { DeviceEditPanel } from '../components/DeviceEditPanel';
import { Layout } from '../components/Layout';
import { ReachabilityBadge } from '../components/ReachabilityBadge';
import { Seo } from '../components/Seo';
import { SysinfoPreviewModal } from '../components/SysinfoPreviewModal';
import { TransportControlPanel } from '../components/TransportControlPanel';
import { WifiConnectPanel } from '../components/WifiConnectPanel';
import { computeReachabilitySummary, triggerReachabilityRefresh } from '../hooks/useDeviceReachability';
import { showToast } from '../hooks/useToast';
import type { DeviceSummary as SharedDeviceSummary } from '../lib/api-types';
import { CustomDevice, exportCustomDevices, getAllCustomDevices, importCustomDevices, subscribeCustomDevices, upsertCustomDevice } from '../lib/customDevices';
import { getDeviceOverride, subscribeDeviceOverrides } from '../lib/deviceOverrides';
import { getSelectedDevice, setSelectedDevice } from '../lib/deviceSelection';
import { fetcher } from '../lib/fetcher';
import { deriveDeviceIdentity, fetchHttpSysinfo, fetchSerialSysinfo } from '../lib/serialSysinfo';

// Subcomponent: device tables (kept local to file to avoid prop drilling elsewhere)
interface DeviceTablesProps {
  data: any; error: any; isLoading: boolean; selectedId: string | null; autoAdding: boolean;
  customDevices: any[]; summary: any; openAddCustom: () => void; setAutoAdding: (v: boolean) => void;
  setPendingSysinfo: (v: any) => void; manualRefresh: () => void; openEdit: (d: any) => void;
  openEditCustom: (id: string) => void; selectDevice: (d: any) => void; setSelectedDevice: any;
  setSelectedId: any; setCustomVersion: any;
}
function DeviceTables(props: DeviceTablesProps) {
  const { data, error, isLoading, selectedId, autoAdding, customDevices, summary, openAddCustom, setAutoAdding, setPendingSysinfo, manualRefresh, openEdit, openEditCustom, selectDevice, setSelectedDevice, setSelectedId, setCustomVersion } = props;
  if (isLoading) return <p>Loading devices...</p>;
  if (error) return <p className="text-error">Failed to load devices: {(error as Error).message}</p>;

  async function handleAutoAdd() { if (autoAdding) return; setAutoAdding(true); try { showToast('Probing serial for sysinfo...', 'info'); let res = await fetchSerialSysinfo(); if (!res.success) { const msgMap: any = { 'no-port': 'No open serial port. Open it in the device detail page.', 'timeout': 'Command timed out. Ensure device is responsive.', 'parse': 'Output unrecognized. Firmware may be outdated.', 'cli-failed': 'CLI endpoint error.' }; showToast(`Serial sysinfo failed: ${(res.error || 'unknown')} (${msgMap[res.errorCode || ''] || 'Falling back to HTTP.'})`, 'info'); const sel = getSelectedDevice(); if (sel?.baseUrl) res = await fetchHttpSysinfo(sel.baseUrl); } if (!res.success) { showToast('Auto-add failed: ' + (res.errorCode === 'unreachable' ? 'HTTP sysinfo unreachable' : (res.error || 'no sysinfo')), 'error'); return; } const sel = getSelectedDevice(); const identity = deriveDeviceIdentity(res.sysinfo, sel?.baseUrl); if (!identity) { showToast('Could not derive device identity from sysinfo', 'error'); return; } setPendingSysinfo({ identity, raw: res.sysinfo, source: res.source }); showToast('Review discovered device details before adding.', 'info'); } catch (e: any) { showToast('Auto-add error: ' + (e.message || e), 'error'); } finally { setAutoAdding(false); } }

  function renderDiscoveredRow(d: any, idx: number) {
    const isSel = selectedId === d.id;
    const effectiveBaseUrl = getDeviceOverride(d.id)?.baseUrl || ((d as any).ip ? `http://${(d as any).ip}` : (d as any).baseUrl || '');
    return (
      <tr key={d.id} className="row-border-top">
        <td><a href={`/device/${d.id}`}>{d.id}</a></td>
        <td>{(getDeviceOverride(d.id)?.alias) || d.name} {isSel && <span className="badge badge-ok">Selected</span>}</td>
        <td><ReachabilityBadge baseUrl={effectiveBaseUrl} intervalMs={20000} startDelayMs={idx * 350} unreachableTitle={d.status || 'Unreachable'} /></td>
        <td>{effectiveBaseUrl || '-'}</td>
        <td><span className="badge badge-dim">Discovered</span></td>
        <td>
          <button className="btn-slim" onClick={() => selectDevice(d)}>{isSel ? 'Active' : 'Select'}</button>
          <button className="btn-slim" onClick={() => openEdit(d)}>Edit</button>
          {isSel && <button className="btn-slim ml-2" onClick={() => { setSelectedDevice(null); setSelectedId(null); }}>Clear</button>}
        </td>
      </tr>
    );
  }

  function renderCustomRow(cd: any, idx: number, discoveredCount: number) {
    const isSel = selectedId === cd.id;
    return (
      <tr key={cd.id} className="row-border-top">
        <td><span className="mono">{cd.id}</span></td>
        <td>{cd.name} {isSel && <span className="badge badge-ok">Selected</span>}</td>
        <td><ReachabilityBadge baseUrl={cd.baseUrl} intervalMs={20000} startDelayMs={(discoveredCount + idx) * 350} /></td>
        <td>{cd.baseUrl}</td>
        <td><span className="badge badge-warn">Custom</span></td>
        <td>
          <button className="btn-slim" onClick={() => openEditCustom(cd.id)}>Edit</button>
          <button className="btn-slim" onClick={() => { setSelectedDevice({ id: cd.id, name: cd.name, baseUrl: cd.baseUrl }); setSelectedId(cd.id); }}>{isSel ? 'Active' : 'Select'}</button>
          {isSel && <button className="btn-slim ml-2" onClick={() => { setSelectedDevice(null); setSelectedId(null); }}>Clear</button>}
        </td>
      </tr>
    );
  }

  const discoveredList = (data && data.length ? data : [{ id: 'example-1', name: 'Example Device', status: 'offline', ip: '192.168.4.1' } as any]);
  const customList = customDevices.filter((cd: any) => !(data || []).some((d: any) => d.id === cd.id));

  return (
    <>
      <div className="mb-3 flex-row gap-2">
        <button className="btn-slim" onClick={openAddCustom}>Add Custom Device</button>
        <button className="btn-slim" disabled={autoAdding} onClick={handleAutoAdd}>{autoAdding ? <span className="inline-flex-center"><span className="spinner-mini" aria-hidden /> Adding…</span> : 'Add From Serial (Auto)'}</button>
        <button className="btn-slim" onClick={() => { try { const blob = new Blob([JSON.stringify(exportCustomDevices(), null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'custom-devices.json'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url); } catch (e: any) { showToast('Export failed: ' + (e?.message || e), 'error'); } }}>Export</button>
        <button className="btn-slim" onClick={() => { document.getElementById('importCustomDevicesInput')?.click(); }}>Import</button>
        <button className="btn-slim" onClick={manualRefresh}>Refresh Status</button>
        {summary && (<span className="xsmall muted ml-2">Reachability: <span className="mono">{summary.up}</span> up / <span className="mono">{summary.down}</span> down / <span className="mono">{summary.unknown}</span> unknown</span>)}
        <input id="importCustomDevicesInput" type="file" accept="application/json" className="hidden-input" onChange={async (e) => { const file = e.target.files?.[0]; if (!file) return; try { const text = await file.text(); const parsed = JSON.parse(text); const res = importCustomDevices(parsed, { overwrite: true }); showToast(`Import: +${res.added} upd:${res.updated} skip:${res.skipped} err:${res.errors}`, res.errors ? 'error' : 'success'); setCustomVersion((v: number) => v + 1); } catch (err: any) { showToast('Import failed: ' + (err?.message || err), 'error'); } finally { e.target.value = ''; } }} />
      </div>
      <table className="table-mini">
        <thead><tr className="text-left"><th>ID</th><th>Name / Alias</th><th>Status</th><th>Base URL</th><th>Type</th><th>Actions</th></tr></thead>
        <tbody>
          {discoveredList.map((d: any, idx: number) => renderDiscoveredRow(d, idx))}
          {customList.map((cd: any, idx: number) => renderCustomRow(cd, idx, discoveredList.length))}
        </tbody>
      </table>
    </>
  );
}

export default function DevicesPage() {
  const { data, error, isLoading } = useSWR<SharedDeviceSummary[]>('/api/devices', fetcher);
  const [ovVersion, setOvVersion] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Initialize selection from stored device on first mount
  useEffect(() => {
    const current = getSelectedDevice();
    if (current) setSelectedId(current.id);
  }, []);

  const [customDevices, setCustomDevices] = useState<CustomDevice[]>([]);
  useEffect(() => {
    const unsub = subscribeDeviceOverrides(() => setOvVersion(v => v + 1));
    return () => { try { unsub(); } catch { /* ignore */ } };
  }, []);

  function selectDevice(d: SharedDeviceSummary) { const ov = getDeviceOverride(d.id); const ipPart = (d as any).ip ? `http://${(d as any).ip}` : ''; const derived = ipPart || (d as any).baseUrl || ''; const baseUrl = (ov?.baseUrl || '').trim() || derived; if (!baseUrl) { showToast('Device has no reachable base URL', 'error'); return; } setSelectedDevice({ id: d.id, name: (ov?.alias || d.name), baseUrl }); setSelectedId(d.id); }

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingMeta, setEditingMeta] = useState<{ name: string; derived: string } | null>(null);
  const [customPanelMode, setCustomPanelMode] = useState<'add' | 'edit' | null>(null);
  const [editingCustomId, setEditingCustomId] = useState<string | null>(null);
  const [customVersion, setCustomVersion] = useState(0);
  const [autoAdding, setAutoAdding] = useState(false);
  const [pendingSysinfo, setPendingSysinfo] = useState<{ identity: { id: string; name: string; baseUrl: string }; raw: any; source: string } | null>(null);

  function openEdit(d: SharedDeviceSummary) {
    const derived = (d as any).ip ? `http://${(d as any).ip}` : (d as any).baseUrl || '';
    setEditingId(d.id);
    setEditingMeta({ name: d.name, derived });
  }

  useEffect(() => {
    const unsub = subscribeCustomDevices(() => setCustomVersion(v => v + 1));
    return () => { try { unsub(); } catch { /* ignore */ } };
  }, []);

  // Load custom devices client-side only
  useEffect(() => {
    function load() {
      try {
        const all = getAllCustomDevices();
        setCustomDevices(Object.values(all).sort((a, b) => a.id.localeCompare(b.id)));
      } catch { /* ignore */ }
    }
    load();
    const unsub = subscribeCustomDevices(() => { setCustomVersion(v => v + 1); load(); });
    return () => { try { unsub(); } catch { /* ignore */ } };
  }, []);

  function openAddCustom() { setCustomPanelMode('add'); setEditingCustomId(null); }
  function openEditCustom(id: string) { setCustomPanelMode('edit'); setEditingCustomId(id); }
  function handleCustomSaved() { setCustomVersion(v => v + 1); }

  function handleSaved() {
    const sel = getSelectedDevice();
    if (sel) {
      const ov = getDeviceOverride(sel.id);
      if (ov) setSelectedDevice({ id: sel.id, name: ov.alias || sel.name, baseUrl: ov.baseUrl || sel.baseUrl });
    }
    setOvVersion(v => v + 1);
  }

  const [summary, setSummary] = useState<{ up: number; down: number; unknown: number; total: number } | null>(null);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    function updateSummary() {
      const discovered = (data && data.length ? data : [{ id: 'example-1', ip: '192.168.4.1' } as any])
        .map(d => (getDeviceOverride(d.id)?.baseUrl || ((d as any).ip ? `http://${(d as any).ip}` : (d as any).baseUrl || '')))
        .filter(Boolean);
      const custom = customDevices.filter(cd => !(data || []).some(d => d.id === cd.id)).map(cd => cd.baseUrl);
      const all = [...discovered, ...custom];
      setSummary(computeReachabilitySummary(all));
    }
    updateSummary();
    const handler = () => updateSummary();
    window.addEventListener('reachability.updated', handler);
    return () => { window.removeEventListener('reachability.updated', handler); };
  }, [data, customDevices, customVersion, ovVersion]);

  function manualRefresh() {
    triggerReachabilityRefresh();
    setTimeout(() => {
      try {
        const discovered = (data && data.length ? data : [{ id: 'example-1', ip: '192.168.4.1' } as any])
          .map(d => (getDeviceOverride(d.id)?.baseUrl || ((d as any).ip ? `http://${(d as any).ip}` : (d as any).baseUrl || '')))
          .filter(Boolean);
        const custom = customDevices.filter(cd => !(data || []).some(d => d.id === cd.id)).map(cd => cd.baseUrl);
        const all = [...discovered, ...custom];
        setSummary(computeReachabilitySummary(all));
      } catch { /* ignore */ }
    }, 50);
  }

  return (
    <Layout>
      <Seo title="Devices" />
      <DeviceTables
        data={data}
        error={error}
        isLoading={isLoading}
        selectedId={selectedId}
        autoAdding={autoAdding}
        customDevices={customDevices}
        summary={summary}
        openAddCustom={openAddCustom}
        setAutoAdding={setAutoAdding}
        setPendingSysinfo={setPendingSysinfo}
        manualRefresh={manualRefresh}
        openEdit={openEdit}
        openEditCustom={openEditCustom}
        selectDevice={selectDevice}
        setSelectedDevice={setSelectedDevice}
        setSelectedId={setSelectedId}
        setCustomVersion={setCustomVersion}
      />
      <TransportControlPanel />
      <WifiConnectPanel selectedDeviceId={selectedId} />
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
          existingIds={new Set([...(data || []).map(d => d.id), ...customDevices.map(cd => cd.id)])}
          onClose={() => { setCustomPanelMode(null); setEditingCustomId(null); }}
          onSaved={handleCustomSaved}
        />
      )}
      {pendingSysinfo && (
        <SysinfoPreviewModal
          initialId={pendingSysinfo.identity.id}
          initialName={pendingSysinfo.identity.name}
          baseUrl={pendingSysinfo.identity.baseUrl}
          source={pendingSysinfo.source as any}
          rawSysinfo={pendingSysinfo.raw}
          onCancel={() => setPendingSysinfo(null)}
          onConfirm={({ id, name }) => {
            const exists = customDevices.some(cd => cd.id === pendingSysinfo.identity.id);
            const finalIdentity = { ...pendingSysinfo.identity, id, name };
            upsertCustomDevice(finalIdentity);
            showToast(`${exists ? 'Updated' : 'Added'} device ${finalIdentity.id} from ${pendingSysinfo.source}`, 'success');
            setCustomVersion(v => v + 1);
            triggerReachabilityRefresh();
            if (!exists) {
              setSelectedDevice({ id: finalIdentity.id, name: finalIdentity.name, baseUrl: finalIdentity.baseUrl });
              setSelectedId(finalIdentity.id);
            }
            setPendingSysinfo(null);
          }}
        />
      )}
      <style jsx>{`
        .hidden-input { display:none; }
        .inline-flex-center { display:inline-flex; align-items:center; gap:4px; }
      `}</style>
    </Layout>
  );
}
