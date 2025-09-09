import React, { useEffect, useState } from 'react';
import { useSavedDevices } from '../hooks/useSavedDevices';

export function SavedDevicesPanel() {
  const { list, selectedId, add, update, remove, select, cycleMethod } = useSavedDevices();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', host: '', com: '', method: 'http' as 'http' | 'ws' | 'serial' });
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  function submitNew(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    add(form);
    setForm({ name: '', host: '', com: '', method: 'http' });
    setShowForm(false);
  }

  return (
    <section style={{ border: '1px solid #30363d', borderRadius: 8, padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0, fontSize: '1rem' }}>Saved Devices</h3>
        <button onClick={() => setShowForm(s => !s)}>{showForm ? 'Cancel' : 'Add'}</button>
      </header>
      {showForm && (
        <form onSubmit={submitNew} style={{ display: 'grid', gap: 6, gridTemplateColumns: 'repeat(auto-fit, minmax(120px,1fr))' }}>
          <input placeholder='Name' value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
          <input placeholder='Host/IP' value={form.host} onChange={e => setForm(f => ({ ...f, host: e.target.value }))} />
          <input placeholder='COM' value={form.com} onChange={e => setForm(f => ({ ...f, com: e.target.value }))} />
          <select value={form.method} onChange={e => setForm(f => ({ ...f, method: e.target.value as any }))}>
            <option value='http'>http</option>
            <option value='ws'>ws</option>
            <option value='serial'>serial</option>
          </select>
          <button type='submit' style={{ gridColumn: '1/-1' }}>Save</button>
        </form>
      )}
      <div style={{ display: 'grid', gap: 8 }} suppressHydrationWarning>
        {!mounted && (
          <div style={{ opacity: .6 }}>Loading saved devices…</div>
        )}
        {mounted && list.length === 0 && <div style={{ opacity: .6 }}>No saved devices.</div>}
        {mounted && list.map(dev => (
          <div key={dev.id} style={{ border: '1px solid #444', padding: 8, borderRadius: 6, background: dev.id === selectedId ? 'rgba(59,130,246,0.15)' : '#111', display: 'grid', gap: 4 }}>
            <strong>{dev.name}</strong>
            <small style={{ opacity: .8 }}>{dev.host || '-'} {dev.com ? `(${dev.com})` : ''}</small>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button type='button' onClick={() => select(dev.id)} disabled={dev.id === selectedId}>Select</button>
              <button type='button' onClick={() => cycleMethod(dev.id)} title='Cycle method'>{dev.method}</button>
              <button type='button' onClick={() => remove(dev.id)}>Remove</button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
