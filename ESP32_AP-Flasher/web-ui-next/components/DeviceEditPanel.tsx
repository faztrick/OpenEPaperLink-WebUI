import { useEffect, useRef, useState } from 'react';
import { getDeviceOverride, setDeviceOverride } from '../lib/deviceOverrides';
import { getSelectedDevice, setSelectedDevice } from '../lib/deviceSelection';

interface DeviceEditPanelProps {
  id: string;
  name: string;
  derivedBaseUrl: string;
  onClose: () => void;
  onSaved?: () => void;
}

interface TestState {
  status: 'idle' | 'testing' | 'ok' | 'fail';
  message?: string;
}

export function DeviceEditPanel({ id, name, derivedBaseUrl, onClose, onSaved }: DeviceEditPanelProps) {
  const existing = getDeviceOverride(id) || {};
  const [alias, setAlias] = useState(existing.alias || '');
  const [baseUrl, setBaseUrl] = useState(existing.baseUrl || '');
  const [port, setPort] = useState(existing.port || '');
  const [dirty, setDirty] = useState(false);
  const [test, setTest] = useState<TestState>({ status: 'idle' });
  const panelRef = useRef<HTMLDivElement | null>(null);

  // compute effective fields
  const effectiveAlias = alias.trim() || name;
  const cleanedBase = baseUrl.trim().replace(/\/$/, '');
  // If user supplied a port separately, we ensure effective base reflects it (unless base already explicit with different port)
  let effectiveFromBase = cleanedBase || derivedBaseUrl || '';
  try {
    if (effectiveFromBase && port.trim()) {
      const u = new URL(effectiveFromBase);
      // Only override if user port differs from existing explicit port or if none
      if (port && String(u.port) !== port.trim()) {
        u.port = port.trim();
        effectiveFromBase = u.toString().replace(/\/$/, '');
      }
    }
  } catch { /* ignore parse issues */ }
  const effectiveBase = effectiveFromBase;

  useEffect(() => {
    setDirty(
      (alias.trim() || '') !== (existing.alias || '') ||
      (cleanedBase || '') !== (existing.baseUrl || '') ||
      (port.trim() || '') !== (existing.port || '')
    );
  }, [alias, baseUrl, port, existing.alias, existing.baseUrl, existing.port, cleanedBase]);

  // Escape key & outside click handler
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    function onDown(e: MouseEvent) {
      if (!panelRef.current) return;
      if (e.target instanceof Node && !panelRef.current.contains(e.target)) onClose();
    }
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onDown);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('mousedown', onDown); };
  }, [onClose]);

  function validateBase(u: string): string | null {
    const t = u.trim();
    if (!t) return null; // empty allowed (means derive)
    if (!/^https?:\/\//i.test(t)) return 'Must start with http:// or https://';
    try { new URL(t); } catch { return 'Invalid URL'; }
    return null;
  }

  const baseError = validateBase(cleanedBase);

  async function runTest() {
    setTest({ status: 'testing' });
    const testUrl = '/api/device/api/info'; // proxied endpoint expected on device
    const started = performance.now();
    async function attempt(url: string) {
      const resp = await fetch(testUrl, { headers: { 'x-device-base-url': url } });
      if (!resp.ok) throw new Error(resp.status + ' ' + resp.statusText);
      await resp.text();
    }
    try {
      await attempt(effectiveBase);
      const ms = Math.round(performance.now() - started);
      setTest({ status: 'ok', message: `Reachable (${ms} ms)` });
    } catch (firstErr: any) {
      // HTTPS fallback: if base starts with http:// try https://
      if (/^http:\/\//i.test(effectiveBase)) {
        try {
          const alt = effectiveBase.replace(/^http:\/\//i, 'https://');
          await attempt(alt);
          const ms = Math.round(performance.now() - started);
          setTest({ status: 'ok', message: `Reachable via HTTPS fallback (${ms} ms)` });
          return;
        } catch (secondErr: any) {
          setTest({ status: 'fail', message: secondErr.message || firstErr.message || 'Failed' });
          return;
        }
      }
      setTest({ status: 'fail', message: firstErr.message || 'Failed' });
    }
  }

  // Autofocus first interactive field & focus trap inside panel
  const firstInputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => { firstInputRef.current?.focus(); }, []);
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Tab') return;
      if (!panelRef.current) return;
      const focusables = Array.from(panelRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      )).filter(el => !el.hasAttribute('disabled'));
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); (last as HTMLElement).focus(); }
      } else {
        if (document.activeElement === last) { e.preventDefault(); (first as HTMLElement).focus(); }
      }
    }
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  function save() {
    const override: any = {};
    if (alias.trim() && alias.trim() !== name) override.alias = alias.trim();
    if (cleanedBase) override.baseUrl = cleanedBase;
    if (port.trim()) override.port = port.trim();
    setDeviceOverride(id, Object.keys(override).length ? override : null);
    // refresh currently selected device if relevant
    const sel = getSelectedDevice();
    if (sel && sel.id === id) {
      setSelectedDevice({ id, name: override.alias || name, baseUrl: effectiveBase });
    }
    onSaved && onSaved();
    onClose();
  }

  function resetOverride() {
    setAlias('');
    setBaseUrl('');
    setPort('');
  }

  return (
    <div className="device-edit-overlay" role="dialog" aria-modal="true">
      <div className="device-edit-panel" ref={panelRef}>
        <div className="panel-head">
          <h3>Edit Device</h3>
          <button className="btn-slim" onClick={onClose}>×</button>
        </div>
        <div className="panel-body">
          <div className="field">
            <label>Device ID</label>
            <div className="mono small break-all">{id}</div>
          </div>
          <div className="field">
            <label>Original Name</label>
            <div>{name}</div>
          </div>
          <div className="field">
            <label>Alias</label>
            <input ref={firstInputRef} value={alias} onChange={e => setAlias(e.target.value)} placeholder={name} />
            <div className="hint small">Leave blank to use original name.</div>
          </div>
          <div className="field">
            <label>Custom Base URL</label>
            <input value={baseUrl} onChange={e => setBaseUrl(e.target.value)} placeholder={derivedBaseUrl || 'http://...'} />
            <div className="hint small">Optionally override derived base ({derivedBaseUrl || 'none'}). No trailing slash.</div>
            {baseError && <div className="text-error small mt-1">{baseError}</div>}
          </div>
          <div className="field">
            <label>Port</label>
            <input value={port} onChange={e => setPort(e.target.value.replace(/[^0-9]/g, ''))} placeholder={(() => { try { if (effectiveBase) { const u = new URL(effectiveBase); return u.port || ''; } } catch { } return ''; })()} />
            <div className="hint small">Optional. If set, overrides port in base URL.</div>
          </div>
          <div className="field inline-test-row">
            <button className="btn-slim" disabled={!effectiveBase || !!baseError || test.status === 'testing'} onClick={runTest}>{test.status === 'testing' ? 'Testing…' : 'Test Connection'}</button>
            {test.status === 'ok' && <span className="text-ok ml-2 small">{test.message}</span>}
            {test.status === 'fail' && <span className="text-error ml-2 small">{test.message}</span>}
          </div>
          <div className="preview mt-3 small">
            <div>Effective Alias: <strong>{effectiveAlias}</strong></div>
            <div>Effective Base URL: <strong>{effectiveBase || '—'}</strong></div>
            {port && <div>Port Override: <strong>{port}</strong></div>}
          </div>
        </div>
        <div className="panel-foot">
          <button className="btn-slim" onClick={resetOverride} disabled={!alias && !baseUrl && !port}>Clear Fields</button>
          <div className="flex-spacer" />
          <button className="btn-slim" onClick={onClose}>Cancel</button>
          <button className="btn-slim" disabled={!!baseError || !dirty} onClick={save}>Save</button>
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
        .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace; }
        .flex-spacer { flex:1; }
        .btn-slim { background:#222; border:1px solid #444; color:#eee; padding:0.3rem 0.65rem; cursor:pointer; font-size:0.7rem; border-radius:4px; }
        .btn-slim:hover:not(:disabled) { background:#2c2c2c; }
        .btn-slim:disabled { opacity:0.4; cursor:not-allowed; }
      `}</style>
    </div>
  );
}
