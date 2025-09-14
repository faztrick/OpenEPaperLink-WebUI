import { useEffect, useRef, useState } from 'react';
import type { AutoAddResult } from '../lib/serialSysinfo';

interface SysinfoPreviewModalProps {
  initialId: string;
  initialName: string;
  baseUrl: string;
  source: AutoAddResult['source'];
  rawSysinfo: any;
  onConfirm: (final: { id: string; name: string }) => void;
  onCancel: () => void;
}

// Lightweight confirmation modal allowing user to adjust friendly name (and, if desired, ID before persisting) after sysinfo discovery.
// We intentionally do not allow baseUrl editing here; user can adjust via edit panel afterwards to keep flow quick.
export function SysinfoPreviewModal({ initialId, initialName, baseUrl, source, rawSysinfo, onConfirm, onCancel }: SysinfoPreviewModalProps) {
  const [devId, setDevId] = useState(initialId);
  const [name, setName] = useState(initialName);
  const [confirming, setConfirming] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const firstInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => { firstInputRef.current?.focus(); }, []);
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onCancel(); }
    function onDown(e: MouseEvent) { if (!panelRef.current) return; if (e.target instanceof Node && !panelRef.current.contains(e.target)) onCancel(); }
    window.addEventListener('keydown', onKey); window.addEventListener('mousedown', onDown);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('mousedown', onDown); };
  }, [onCancel]);

  function validateId(idVal: string): string | null {
    const t = idVal.trim();
    if (!t) return 'Required';
    if (!/^[A-Za-z0-9_-]+$/.test(t)) return 'Only letters, numbers, dash, underscore';
    return null;
  }
  const idError = validateId(devId);
  const nameError = !name.trim() ? 'Required' : null;

  async function handleConfirm() {
    if (idError || nameError) return;
    setConfirming(true);
    try {
      onConfirm({ id: devId.trim(), name: name.trim() });
    } finally {
      setConfirming(false);
    }
  }

  return (
    <div className="device-edit-overlay" role="dialog" aria-modal="true">
      <div className="device-edit-panel" ref={panelRef}>
        <div className="panel-head">
          <h3>Confirm Discovered Device</h3>
          <button className="btn-slim" onClick={onCancel}>×</button>
        </div>
        <div className="panel-body">
          <div className="small muted mb-2">Source: <strong>{source}</strong> | Base URL: <strong>{baseUrl}</strong></div>
          <div className="field">
            <label>Device ID</label>
            <input ref={firstInputRef} value={devId} onChange={e => setDevId(e.target.value)} />
            {idError && <div className="text-error small mt-1">{idError}</div>}
          </div>
          <div className="field">
            <label>Name</label>
            <input value={name} onChange={e => setName(e.target.value)} />
            {nameError && <div className="text-error small mt-1">{nameError}</div>}
          </div>
          <details className="raw-block mt-2">
            <summary className="small">Raw sysinfo JSON</summary>
            <pre className="raw-json">{JSON.stringify(rawSysinfo, null, 2)}</pre>
          </details>
        </div>
        <div className="panel-foot">
          <button className="btn-slim" onClick={onCancel} disabled={confirming}>Cancel</button>
          <div className="flex-spacer" />
          <button className="btn-slim" disabled={!!idError || !!nameError || confirming} onClick={handleConfirm}>{confirming ? 'Saving…' : 'Add Device'}</button>
        </div>
      </div>
      <style jsx>{`
        .device-edit-overlay { position: fixed; inset:0; background:rgba(0,0,0,0.4); display:flex; align-items:center; justify-content:center; z-index:2100; }
        .device-edit-panel { background:#111; border:1px solid #333; padding:1rem 1.25rem; width:440px; max-width:92%; border-radius:8px; box-shadow:0 4px 18px rgba(0,0,0,0.55); display:flex; flex-direction:column; }
        .panel-head { display:flex; align-items:center; justify-content:space-between; margin-bottom:0.5rem; }
        .panel-body { flex:1; overflow-y:auto; max-height:60vh; }
        .panel-foot { display:flex; align-items:center; gap:0.5rem; margin-top:0.75rem; }
        .field { margin-bottom:0.75rem; display:flex; flex-direction:column; }
        label { font-size:0.75rem; opacity:0.75; margin-bottom:0.25rem; }
        input { background:#1b1b1b; border:1px solid #333; border-radius:4px; padding:0.4rem 0.5rem; font-size:0.85rem; color:#eee; }
        input:focus { outline:1px solid #555; }
        .raw-block summary { cursor:pointer; }
        .raw-json { margin:0.5rem 0 0; font-size:0.65rem; max-height:180px; overflow:auto; background:#1a1a1a; padding:0.5rem; border:1px solid #282828; border-radius:4px; }
        .flex-spacer { flex:1; }
        .btn-slim { background:#222; border:1px solid #444; color:#eee; padding:0.3rem 0.65rem; cursor:pointer; font-size:0.7rem; border-radius:4px; }
        .btn-slim:hover:not(:disabled) { background:#2c2c2c; }
        .btn-slim:disabled { opacity:0.5; cursor:not-allowed; }
        .muted { opacity:0.6; }
      `}</style>
    </div>
  );
}
