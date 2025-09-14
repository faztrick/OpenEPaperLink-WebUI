import { useEffect, useRef, useState } from 'react';
import { CustomDevice, deleteCustomDevice, getCustomDevice, upsertCustomDevice } from '../lib/customDevices';
import { getSelectedDevice, setSelectedDevice } from '../lib/deviceSelection';
import { testDeviceConnection } from '../lib/testConnection';

interface DeviceCustomPanelProps {
  mode: 'add' | 'edit';
  // For edit mode
  id?: string;
  onClose: () => void;
  onSaved?: () => void;
  // Optionally provide list of existing (backend + custom) ids to validate uniqueness on add
  existingIds: Set<string>;
}

interface TestState { status: 'idle' | 'testing' | 'ok' | 'fail'; message?: string; }

export function DeviceCustomPanel({ mode, id, onClose, onSaved, existingIds }: DeviceCustomPanelProps) {
  const editing = mode === 'edit' && id ? getCustomDevice(id) : null;
  const [devId, setDevId] = useState(editing?.id || '');
  const [name, setName] = useState(editing?.name || '');
  const [baseUrl, setBaseUrl] = useState(editing?.baseUrl || '');
  const [test, setTest] = useState<TestState>({ status: 'idle' });
  const [dirty, setDirty] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const firstInputRef = useRef<HTMLInputElement | null>(null);

  const cleanedBase = baseUrl.trim().replace(/\/$/, '');

  useEffect(() => { firstInputRef.current?.focus(); }, []);

  useEffect(() => {
    if (editing) {
      setDirty(
        devId !== editing.id ||
        name.trim() !== editing.name ||
        cleanedBase !== editing.baseUrl
      );
    } else {
      setDirty(!!devId.trim() && !!name.trim() && !!cleanedBase);
    }
  }, [devId, name, cleanedBase, editing]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    function onDown(e: MouseEvent) { if (!panelRef.current) return; if (e.target instanceof Node && !panelRef.current.contains(e.target)) onClose(); }
    window.addEventListener('keydown', onKey); window.addEventListener('mousedown', onDown);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('mousedown', onDown); };
  }, [onClose]);

  function validateId(idVal: string): string | null {
    const t = idVal.trim();
    if (!t) return 'Required';
    if (!/^[A-Za-z0-9_-]+$/.test(t)) return 'Only letters, numbers, dash, underscore';
    if (!editing || t !== editing.id) {
      if (existingIds.has(t)) return 'ID already exists';
    }
    return null;
  }

  function validateBase(u: string): string | null {
    const t = u.trim();
    if (!t) return 'Required';
    if (!/^https?:\/\//i.test(t)) return 'Must start with http:// or https://';
    try { new URL(t); } catch { return 'Invalid URL'; }
    return null;
  }

  const idError = validateId(devId);
  const baseError = validateBase(cleanedBase);
  const nameError = !name.trim() ? 'Required' : null;

  async function runTest() {
    if (baseError) return;
    setTest({ status: 'testing' });
    const res = await testDeviceConnection(cleanedBase);
    setTest({ status: res.ok ? 'ok' : 'fail', message: res.message });
  }

  function save() {
    if (idError || baseError || nameError) return;
    const entry: CustomDevice = { id: devId.trim(), name: name.trim(), baseUrl: cleanedBase };
    upsertCustomDevice(entry);
    // If selected device matches editing id or we just created it, update selection base/name
    const sel = getSelectedDevice();
    if (sel && sel.id === entry.id) {
      setSelectedDevice({ id: entry.id, name: entry.name, baseUrl: entry.baseUrl });
    }
    onSaved && onSaved();
    onClose();
  }

  function performDelete() {
    if (!editing) return;
    if (!confirm('Delete this custom device?')) return;
    deleteCustomDevice(editing.id);
    const sel = getSelectedDevice();
    if (sel && sel.id === editing.id) setSelectedDevice(null);
    onSaved && onSaved();
    onClose();
  }

  return (
    <div className="device-edit-overlay" role="dialog" aria-modal="true">
      <div className="device-edit-panel" ref={panelRef}>
        <div className="panel-head">
          <h3>{mode === 'add' ? 'Add Custom Device' : 'Edit Custom Device'}</h3>
          <button className="btn-slim" onClick={onClose}>×</button>
        </div>
        <div className="panel-body">
          <div className="field">
            <label>Device ID</label>
            <input ref={firstInputRef} value={devId} onChange={e => setDevId(e.target.value)} placeholder="unique-id" disabled={mode === 'edit'} />
            {idError && <div className="text-error small mt-1">{idError}</div>}
          </div>
          <div className="field">
            <label>Name</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Friendly name" />
            {nameError && <div className="text-error small mt-1">{nameError}</div>}
          </div>
          <div className="field">
            <label>Base URL</label>
            <input value={baseUrl} onChange={e => setBaseUrl(e.target.value)} placeholder="http://192.168.4.50" />
            <div className="hint small">Root URL to reach the device (no trailing slash).</div>
            {baseError && <div className="text-error small mt-1">{baseError}</div>}
          </div>
          <div className="field inline-test-row">
            <button className="btn-slim" disabled={!!baseError || !cleanedBase || test.status === 'testing'} onClick={runTest}>{test.status === 'testing' ? 'Testing…' : 'Test Connection'}</button>
            {test.status === 'ok' && <span className="text-ok ml-2 small">{test.message}</span>}
            {test.status === 'fail' && <span className="text-error ml-2 small">{test.message}</span>}
          </div>
          <div className="preview mt-3 small">
            <div>Effective ID: <strong>{devId || '—'}</strong></div>
            <div>Effective Name: <strong>{name || '—'}</strong></div>
            <div>Effective Base URL: <strong>{cleanedBase || '—'}</strong></div>
            {editing && <div className="muted mt-2">Created: {editing.createdAt ? new Date(editing.createdAt).toLocaleString() : '—'} | Updated: {editing.updatedAt ? new Date(editing.updatedAt).toLocaleString() : '—'}</div>}
          </div>
        </div>
        <div className="panel-foot">
          {mode === 'edit' && <button className="btn-slim" onClick={performDelete}>Delete</button>}
          <div className="flex-spacer" />
          <button className="btn-slim" onClick={onClose}>Cancel</button>
          <button className="btn-slim" disabled={!!idError || !!baseError || !!nameError || !dirty} onClick={save}>Save</button>
        </div>
      </div>
      <style jsx>{`
        .device-edit-overlay { position: fixed; inset:0; background:rgba(0,0,0,0.4); display:flex; align-items:center; justify-content:center; z-index:2000; }
        .device-edit-panel { background:#111; border:1px solid #333; padding:1rem 1.25rem; width:420px; max-width:90%; border-radius:8px; box-shadow:0 4px 18px rgba(0,0,0,0.5); display:flex; flex-direction:column; }
        .panel-head { display:flex; align-items:center; justify-content:space-between; margin-bottom:0.5rem; }
        .panel-body { flex:1; overflow-y:auto; max-height:60vh; }
        .panel-foot { display:flex; align-items:center; gap:0.5rem; margin-top:0.75rem; }
        .field { margin-bottom:0.75rem; display:flex; flex-direction:column; }
        label { font-size:0.8rem; opacity:0.75; margin-bottom:0.25rem; }
        input { background:#1b1b1b; border:1px solid #333; border-radius:4px; padding:0.4rem 0.5rem; font-size:0.85rem; color:#eee; }
        input:focus { outline:1px solid #555; }
        .hint { opacity:0.55; margin-top:0.25rem; }
        .inline-test-row { display:flex; align-items:center; gap:0.5rem; }
        .preview div { margin-top:0.25rem; }
        .flex-spacer { flex:1; }
        .btn-slim { background:#222; border:1px solid #444; color:#eee; padding:0.3rem 0.65rem; cursor:pointer; font-size:0.7rem; border-radius:4px; }
        .btn-slim:hover:not(:disabled) { background:#2c2c2c; }
        .btn-slim:disabled { opacity:0.4; cursor:not-allowed; }
        .muted { opacity:0.6; }
      `}</style>
    </div>
  );
}
