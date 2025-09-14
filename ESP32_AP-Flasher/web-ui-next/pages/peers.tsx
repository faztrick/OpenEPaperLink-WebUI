import { useCallback, useEffect, useMemo, useState } from 'react';
import { Layout } from '../components/Layout';
import { Seo } from '../components/Seo';
import { useSavedDevices } from '../hooks/useSavedDevices';
import { showToast } from '../hooks/useToast';
import { buildApiUrl } from '../lib/apiBase';

async function testPeer(host: string) {
  const url = buildApiUrl(`/api/peer/test?host=${encodeURIComponent(host)}`);
  const r = await fetch(url);
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}

export default function PeersPage() {
  const { list } = useSavedDevices();
  const peers = useMemo(() => list.filter(d => d.host).map(d => ({ id: d.id, name: d.name, host: d.host! })), [list]);
  const [host, setHost] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [events, setEvents] = useState<{ ts: number; event: string; data?: string }[]>([]);
  const [summary, setSummary] = useState<any | null>(null);
  const [loadingExtra, setLoadingExtra] = useState(false);

  const loadLocalWifiInfo = useCallback(async () => {
    setLoadingExtra(true);
    try {
      const s = await fetch(buildApiUrl('/api/wifi/summary')); if (s.ok) setSummary(await s.json());
      const ev = await fetch(buildApiUrl('/api/wifi/events')); if (ev.ok) { const j = await ev.json(); if (Array.isArray(j.events)) setEvents(j.events); }
    } catch (e) { /* ignore */ } finally { setLoadingExtra(false); }
  }, []);

  useEffect(() => { loadLocalWifiInfo(); const id = setInterval(loadLocalWifiInfo, 10000); return () => clearInterval(id); }, [loadLocalWifiInfo]);
  const chipStyle: React.CSSProperties = { background: '#1f242d', padding: '2px 8px', borderRadius: 12, border: '1px solid #30363d' };

  const runTest = useCallback(async (h: string) => {
    setBusyId(h);
    try {
      const res = await testPeer(h);
      if (res.success) showToast(`Peer ${h} OK (status ${res.status})`, 'success');
      else showToast(`Peer ${h} failed (${res.status || 'no status'})`, 'error');
    } catch (e: any) { showToast(`Peer ${h} error: ${e.message}`, 'error'); }
    finally { setBusyId(null); }
  }, []);

  return (
    <Layout title="Peers">
      <Seo title="Peers" description="Test peer connectivity via /api/peer/test" />
      <h2>Peers</h2>
      <div className="grid-gap-16">
        <div className="flex gap input-row-wrap items-center">
          <input placeholder='Peer host/ip' value={host} onChange={e => setHost(e.target.value)} className="minw-220" />
          <button onClick={() => host && runTest(host)} disabled={!host || busyId === host} className="btn btn-small">{busyId === host ? 'Testing…' : 'Test Host'}</button>
        </div>
        <div className="box">
          <h3 className="heading-mid">Local Wi‑Fi Snapshot {loadingExtra && <small className="fw-400">(loading)</small>}</h3>
          {summary && <div className="flex flex-wrap gap-8 text-12">
            <span className="chip-lite">STA: {summary.status?.connected ? 'connected' : 'idle'}</span>
            {summary.status?.ssid && <span className="chip-lite">SSID {summary.status.ssid}</span>}
            {summary.status?.ip && <span className="chip-lite">IP {summary.status.ip}</span>}
            <span className="chip-lite">AP Clients {summary.status?.apClients}</span>
            <span className="chip-lite">Mode {summary.status?.wifiMode}</span>
          </div>}
          {events.length > 0 && <div className="mt-8 maxh-120 scroll-auto text-11">
            {events.slice(-8).reverse().map(e => <div key={e.ts}>{new Date(e.ts).toLocaleTimeString()} {e.event} {e.data ? '(' + e.data + ')' : ''}</div>)}
          </div>}
        </div>
        <div>
          <h3 className="mt-8 mb-4">Saved Devices</h3>
          {peers.length === 0 && <div className="opacity-60 text-12">No saved devices with host set.</div>}
          <div className="grid-gap-8">
            {peers.map(p => (
              <div key={p.id} className="peer-card">
                <div className="peer-card-grid">
                  <strong>{p.name}</strong>
                  <small className="opacity-70">{p.host}</small>
                </div>
                <button className="btn btn-small" onClick={() => runTest(p.host)} disabled={busyId === p.host}>{busyId === p.host ? 'Testing…' : 'Test'}</button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Layout>
  );
}
