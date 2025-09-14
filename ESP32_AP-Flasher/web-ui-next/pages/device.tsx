import { useEffect, useState } from 'react';
import { ConnectionSwitcher } from '../components/ConnectionSwitcher';
import { Layout } from '../components/Layout';
import { Seo } from '../components/Seo';
import { WifiStatus as WifiStatusBlock } from '../components/WifiStatus';
import { useDeviceWifiStatus } from '../hooks/useDeviceWifi';
import { exportMeta, getDeviceMeta, importMeta, subscribeDeviceMeta, upsertDeviceMeta } from '../lib/deviceMeta';
import { getSelectedDevice, setSelectedDevice, subscribeSelectedDevice } from '../lib/deviceSelection';
import { useSerialConfig } from '../lib/serialConfig';
import { transport } from '../lib/transport';

const WIFI_MODE_NAMES: Record<number, string> = { 0: 'AUTO', 1: 'AP', 2: 'STA', 3: 'AP+STA' };

export default function DevicePage() {
  const [sel, setSel] = useState(() => getSelectedDevice());
  const [rev, setRev] = useState(0);
  const meta = sel ? getDeviceMeta(sel.id) : null;
  const { status, loading, error, reload } = useDeviceWifiStatus(sel ? 6000 : 0);
  const [modulesInput, setModulesInput] = useState('');
  const [categoriesInput, setCategoriesInput] = useState('');
  const [noteInput, setNoteInput] = useState(meta?.notes || '');
  const [configKey, setConfigKey] = useState('');
  const [configValue, setConfigValue] = useState('');
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [tStatus, setTStatus] = useState(() => transport().getStatus());
  const { port: serialPort, backend: serialBackend } = useSerialConfig();
  const t = transport();

  useEffect(() => {
    const unsubSel = subscribeSelectedDevice(d => { setSel(d); });
    const unsubMeta = subscribeDeviceMeta(() => setRev(r => r + 1));
    const t = transport();
    const unsubT = t.subscribe(s => setTStatus(s));
    return () => { unsubSel(); unsubMeta(); unsubT(); };
  }, []);

  useEffect(() => { if (sel && !meta) { upsertDeviceMeta(sel.id, { modules: ['wifi', 'tags'] }); setRev(r => r + 1); } }, [sel, meta]);
  useEffect(() => { setNoteInput(meta?.notes || ''); }, [meta?.notes]);

  function applyModules() { if (!sel) return; const mods = modulesInput.split(',').map(m => m.trim()).filter(Boolean); upsertDeviceMeta(sel.id, { modules: mods }); setModulesInput(''); }
  function applyCategories() { if (!sel) return; const cats = categoriesInput.split(',').map(c => c.trim()).filter(Boolean); upsertDeviceMeta(sel.id, { categories: cats }); setCategoriesInput(''); }
  function saveNotes() { if (!sel) return; upsertDeviceMeta(sel.id, { notes: noteInput }); }
  function addConfig() { if (!sel || !configKey) return; const current = getDeviceMeta(sel.id); const cfg = { ...(current?.configs || {}) }; cfg[configKey] = configValue; upsertDeviceMeta(sel.id, { configs: cfg }); setConfigKey(''); setConfigValue(''); }
  function removeConfig(k: string) { if (!sel) return; const current = getDeviceMeta(sel.id); const cfg = { ...(current?.configs || {}) }; delete cfg[k]; upsertDeviceMeta(sel.id, { configs: cfg }); }
  function onImportChange(e: React.ChangeEvent<HTMLTextAreaElement>) { setImportError(null); try { importMeta(e.target.value); } catch (err: any) { setImportError(err.message); } }

  return (
    <Layout title="Device" description="Selected device details">
      <Seo title="Device" description="Selected device details" />
      <h1 className="mt-0">Device</h1>
      {!sel && <div className="callout warn mt-4">No device selected. Go to Dashboard and select one.</div>}
      {sel && (
        <>
          <div className="flex gap flex-wrap">
            <div className="minw-300">
              <h2 className="heading-mid mt-2 flex gap-2 items-center">Overview <span className="flex-1" /> <span className="xsmall"><ConnectionSwitcher deviceId={sel?.id} syncMeta compact showMetaDiff revertOnFail /></span></h2>
              <div className="small">ID: <strong>{sel.id}</strong></div>
              <div className="small">Base: {sel.baseUrl}</div>
              <div className="small">Transport: pref {tStatus.preferred} / eff {tStatus.effective}{tStatus.serialOpen && ' (serial open)'}{serialBackend ? ` / serial mode ${serialBackend}` : ''}</div>
              {/* Meta diff now shown inline by ConnectionSwitcher when showMetaDiff is set */}
              {serialPort && <div className="small">Serial Port: {serialPort}</div>}
              {meta?.connectionType && <div className="small">ConnType: {meta.connectionType}</div>}
              <div className="small">Modules: {meta?.modules?.join(', ') || '—'}</div>
              {meta?.categories?.length && <div className="small">Categories: {meta.categories.join(', ')}</div>}
              {meta?.notes && <div className="small mt-1">Notes: {meta.notes}</div>}
              <div className="mt-2"><button className="btn-slim" onClick={() => setSelectedDevice(null)}>Clear Selection</button></div>
            </div>
            <div className="minw-360 flex-1">
              <h2 className="heading-mid mt-2">Wi‑Fi {loading && <small>(loading)</small>} <button className="btn-slim" onClick={() => reload()}>Refresh</button></h2>
              {error && <div className="text-error small mt-2">{error}</div>}
              <WifiStatusBlock status={status} loading={loading} modeNames={WIFI_MODE_NAMES} lastEventInline stale={false /* hook variant w/out stale passed on device page yet */} />
              {(serialBackend === 'sidecar') && (
                <div className="mt-4 card p-2">
                  <h3 className="heading-tiny mt-0">Sidecar</h3>
                  <div className="xsmall">Mode: sidecar</div>
                  <div className="xsmall">Effective Transport: {tStatus.effective}</div>
                  <div className="xsmall">Serial Open: {tStatus.serialOpen ? 'Yes' : 'No'}</div>
                  {tStatus.portInfo && <div className="xsmall">PortInfo: <code>{tStatus.portInfo}</code></div>}
                  {!tStatus.portInfo && <div className="xsmall muted">No port info available</div>}
                </div>
              )}
            </div>
          </div>
          <div className="mt-6">
            <h2 className="heading-mid">Metadata</h2>
            <div className="flex gap flex-wrap mt-2">
              <div className="minw-260">
                <h4 className="heading-tiny mt-0">Modules</h4>
                <div className="xsmall">Current: {meta?.modules?.join(', ') || '—'}</div>
                <div className="mt-1"><input className="input-slim" placeholder="wifi,tags,ap,led" value={modulesInput} onChange={e => setModulesInput(e.target.value)} /> <button className="btn-slim" disabled={!modulesInput.trim()} onClick={applyModules}>Set</button></div>
              </div>
              <div className="minw-260">
                <h4 className="heading-tiny mt-0">Categories</h4>
                <div className="xsmall">Current: {meta?.categories?.join(', ') || '—'}</div>
                <div className="mt-1"><input className="input-slim" placeholder="core,net,hw" value={categoriesInput} onChange={e => setCategoriesInput(e.target.value)} /> <button className="btn-slim" disabled={!categoriesInput.trim()} onClick={applyCategories}>Set</button></div>
              </div>
              <div className="minw-260">
                <h4 className="heading-tiny mt-0">Notes</h4>
                <textarea className="input-slim w-100 h-80" value={noteInput} onChange={e => setNoteInput(e.target.value)} />
                <div className="mt-1"><button className="btn-slim" onClick={saveNotes}>Save Notes</button></div>
              </div>
              <div className="minw-320">
                <h4 className="heading-tiny mt-0">Configs</h4>
                <div className="flex gap mt-1 flex-wrap">
                  <input className="input-slim w-110" placeholder="key" value={configKey} onChange={e => setConfigKey(e.target.value)} />
                  <input className="input-slim w-140" placeholder="value" value={configValue} onChange={e => setConfigValue(e.target.value)} />
                  <button className="btn-slim" disabled={!configKey} onClick={addConfig}>Add</button>
                </div>
                {meta?.configs && Object.keys(meta.configs).length ? (
                  <table className="table-mini mt-2 xsmall"><thead><tr><th>Key</th><th>Value</th><th></th></tr></thead><tbody>
                    {Object.entries(meta.configs).map(([k, v]) => <tr key={k}><td>{k}</td><td>{v}</td><td><button className="btn-slim" onClick={() => removeConfig(k)}>X</button></td></tr>)}
                  </tbody></table>
                ) : <div className="xsmall mt-2 muted">No configs.</div>}
              </div>
              <div className="minw-300">
                <h4 className="heading-tiny mt-0">Export / Import</h4>
                <div className="flex gap mt-1">
                  <button className="btn-slim" onClick={() => {
                    const blob = new Blob([exportMeta()], { type: 'application/json' });
                    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'device-meta.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1500);
                  }}>Export JSON</button>
                  <button className="btn-slim" onClick={() => setImporting(i => !i)}>{importing ? 'Hide' : 'Import'}</button>
                </div>
                {importing && <div className="mt-2"><textarea className="input-slim w-100 h-120" placeholder="Paste JSON" onChange={onImportChange}></textarea>{importError && <div className="text-error xsmall mt-1">{importError}</div>}</div>}
              </div>
            </div>
          </div>
        </>
      )}
    </Layout>
  );
}
