import React, { useEffect, useState } from 'react';
import { useSavedDevices } from '../hooks/useSavedDevices';

export function SavedDevicesPanel() {
  const { list, selectedId, add, update, remove, select, cycleMethod } = useSavedDevices();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', host: '', port: '', com: '', method: 'http' as 'http' | 'ws' | 'serial' });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: '', host: '', port: '', com: '', method: 'http' as 'http' | 'ws' | 'serial' });
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  function submitNew(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    add(form);
    setForm({ name: '', host: '', port: '', com: '', method: 'http' });
    setShowForm(false);
  }

  function startEdit(id: string) {
    const dev = list.find(d => d.id === id);
    if (!dev) return;
    setEditingId(id);
    setEditForm({ name: dev.name, host: dev.host || '', port: dev.port || '', com: dev.com || '', method: dev.method as any });
  }

  function cancelEdit() {
    setEditingId(null);
  }

  function submitEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingId) return;
    if (!editForm.name.trim()) return;
    update(editingId, { ...editForm });
    setEditingId(null);
  }

  return (
    <section className="sdp-root">
      <header className="sdp-head">
        <h3 className="sdp-title">Devices</h3>
        <button onClick={() => setShowForm(s => !s)}>{showForm ? 'Cancel' : 'Add'}</button>
      </header>
      {showForm && (
        <form onSubmit={submitNew} className="sdp-form">
          <input placeholder='Name' value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
          <input placeholder='Host/IP' value={form.host} onChange={e => setForm(f => ({ ...f, host: e.target.value }))} />
          <input placeholder='Port' value={form.port} onChange={e => setForm(f => ({ ...f, port: e.target.value.replace(/[^0-9]/g, '') }))} />
          <input placeholder='COM' value={form.com} onChange={e => setForm(f => ({ ...f, com: e.target.value }))} />
          <select value={form.method} onChange={e => setForm(f => ({ ...f, method: e.target.value as any }))}>
            <option value='http'>http</option>
            <option value='ws'>ws</option>
            <option value='serial'>serial</option>
          </select>
          <button type='submit' className="sdp-save">Save</button>
        </form>
      )}
      <div className="sdp-list" suppressHydrationWarning>
        {!mounted && (
          <div className="sdp-hint">Loading saved devices…</div>
        )}
        {mounted && list.length === 0 && <div className="sdp-hint">No saved devices.</div>}
        {mounted && list.map(dev => {
          const isEditing = editingId === dev.id;
          if (isEditing) {
            return (
              <form key={dev.id} className={"sdp-card editing" + (dev.id === selectedId ? ' selected' : '')} onSubmit={submitEdit}>
                <input value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} required />
                <input value={editForm.host} placeholder='Host/IP' onChange={e => setEditForm(f => ({ ...f, host: e.target.value }))} />
                <input value={editForm.port} placeholder='Port' onChange={e => setEditForm(f => ({ ...f, port: e.target.value.replace(/[^0-9]/g, '') }))} />
                <input value={editForm.com} placeholder='COM' onChange={e => setEditForm(f => ({ ...f, com: e.target.value }))} />
                <select value={editForm.method} onChange={e => setEditForm(f => ({ ...f, method: e.target.value as any }))}>
                  <option value='http'>http</option>
                  <option value='ws'>ws</option>
                  <option value='serial'>serial</option>
                </select>
                <div className='sdp-actions'>
                  <button type='submit'>Save</button>
                  <button type='button' onClick={cancelEdit}>Cancel</button>
                </div>
              </form>
            );
          }
          return (
            <div key={dev.id} className={"sdp-card" + (dev.id === selectedId ? ' selected' : '')}>
              <strong>{dev.name}</strong>
              <small className="sdp-sub">{dev.host ? (dev.host + (dev.port ? ':' + dev.port : '')) : '-'} {dev.com ? `(${dev.com})` : ''}</small>
              <div className="sdp-actions">
                <button type='button' onClick={() => select(dev.id)} disabled={dev.id === selectedId}>Select</button>
                <button type='button' onClick={() => cycleMethod(dev.id)} title='Cycle method'>{dev.method}</button>
                <button type='button' onClick={() => startEdit(dev.id)}>Edit</button>
                <button type='button' onClick={() => remove(dev.id)}>Remove</button>
              </div>
            </div>
          );
        })}
      </div>
      <style jsx>{`
        .sdp-root { border:1px solid #30363d; border-radius:8px; padding:0.75rem; display:flex; flex-direction:column; gap:12px; }
        .sdp-head { display:flex; justify-content:space-between; align-items:center; }
        .sdp-title { margin:0; font-size:1rem; }
        .sdp-form { display:grid; gap:6px; grid-template-columns:repeat(auto-fit,minmax(120px,1fr)); }
        .sdp-save { grid-column:1/-1; }
        .sdp-list { display:grid; gap:8px; }
        .sdp-hint { opacity:.6; }
  .sdp-card { border:1px solid #444; padding:8px; border-radius:6px; background:#111; display:grid; gap:4px; }
  .sdp-card.editing { background:#1a1a1a; }
  .sdp-card.editing input, .sdp-card.editing select { font-size:.75rem; }
        .sdp-card.selected { background:rgba(59,130,246,0.15); }
        .sdp-sub { opacity:.8; }
        .sdp-actions { display:flex; gap:6px; flex-wrap:wrap; }
      `}</style>
    </section>
  );
}
