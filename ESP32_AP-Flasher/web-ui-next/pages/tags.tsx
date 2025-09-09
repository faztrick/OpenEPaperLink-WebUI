import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { Layout } from '../components/Layout';
import TagImageUploader from '../components/TagImageUploader';
import { fetchAllTags, TagRecord, updateTagAlias } from '../lib/api';

export default function TagsPage() {
  const { data, error, isLoading, mutate, isValidating } = useSWR<TagRecord[]>('tags-table', () => fetchAllTags(500), { refreshInterval: 15000 });
  const [filter, setFilter] = useState('');
  const [editingMac, setEditingMac] = useState<string | null>(null);
  const [aliasDraft, setAliasDraft] = useState('');
  const [aliasBusy, setAliasBusy] = useState(false);
  // Memoize tags array reference so filtering useMemo doesn't re-run unnecessarily
  const tags = useMemo(() => data || [], [data]);
  const filtered = useMemo(() => {
    if (!filter.trim()) return tags;
    const f = filter.toLowerCase();
    return tags.filter(t => t.mac.toLowerCase().includes(f) || (t.alias || '').toLowerCase().includes(f));
  }, [tags, filter]);

  async function saveAlias(mac: string) {
    setAliasBusy(true);
    try {
      await updateTagAlias(mac, aliasDraft.trim());
      setEditingMac(null);
      setAliasDraft('');
      mutate();
    } catch (e: any) {
      alert('Alias update failed: ' + e.message);
    } finally {
      setAliasBusy(false);
    }
  }

  return (
    <Layout title="Tags" description="Manage ePaper tags">
      <h2 style={{ marginTop: 0, display: 'flex', gap: 16, alignItems: 'center' }}>Tags <small style={{ fontSize: 12, fontWeight: 400, opacity: .6 }}>{isValidating ? '(refreshing)' : ''}</small></h2>
      <div style={{ display: 'grid', gap: 24, alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <TagImageUploader onUploaded={() => mutate()} />
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <input placeholder='Search mac or alias…' value={filter} onChange={e => setFilter(e.target.value)} style={{ flex: '1 1 220px', minWidth: 180 }} />
            <button onClick={() => mutate()} style={{ padding: '4px 10px' }}>Refresh</button>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '1px solid #30363d' }}>
                  <th>MAC</th><th>Alias</th><th>Status</th><th>Pending</th><th>Last Seen</th><th>Battery</th><th>RSSI</th><th>HW</th><th></th>
                </tr>
              </thead>
              <tbody>
                {isLoading && <tr><td colSpan={9} style={{ padding: 8 }}>Loading tags…</td></tr>}
                {error && <tr><td colSpan={9} style={{ color: 'tomato', padding: 8 }}>Error loading tags: {(error as Error).message}</td></tr>}
                {!isLoading && !error && filtered.length === 0 && <tr><td colSpan={9} style={{ padding: 8 }}>No tags match.</td></tr>}
                {filtered.map(t => {
                  const age = t.lastSeenDate ? ((Date.now() - t.lastSeenDate.getTime()) / 60000).toFixed(1) + 'm' : '-';
                  const editing = editingMac === t.mac;
                  return (
                    <tr key={t.mac} style={{ borderTop: '1px solid #30363d' }}>
                      <td style={{ fontFamily: 'monospace' }}>{t.mac}</td>
                      <td>{editing ? (
                        <span style={{ display: 'flex', gap: 4 }}>
                          <input autoFocus value={aliasDraft} maxLength={63} onChange={e => setAliasDraft(e.target.value)} style={{ width: 140 }} />
                          <button disabled={aliasBusy} onClick={() => saveAlias(t.mac)} style={{ fontSize: 12 }}>Save</button>
                          <button disabled={aliasBusy} onClick={() => { setEditingMac(null); setAliasDraft(''); }} style={{ fontSize: 12 }}>Cancel</button>
                        </span>
                      ) : (
                        <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                          {t.alias || <span style={{ opacity: .4 }}>—</span>}
                          <button style={{ fontSize: 10, padding: '2px 6px' }} onClick={(e) => { e.preventDefault(); setEditingMac(t.mac); setAliasDraft(t.alias || ''); }}>Edit</button>
                        </span>
                      )}</td>
                      <td><StatusBadge status={t.status} /></td>
                      <td>{t.pending}</td>
                      <td title={t.lastSeenDate?.toISOString()}>{age}</td>
                      <td><BatteryCell mv={t.batteryMv} /></td>
                      <td>{t.RSSI ?? '-'}</td>
                      <td>{t.hwType}</td>
                      <td><a style={{ fontSize: 12 }} href={`/tag/${t.mac}`}>Details</a></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{ fontSize: 12, opacity: .6 }}>Auto-refreshing every 15s. Uploading an image will queue it immediately.</div>
        </div>
      </div>
    </Layout>
  );
}

function StatusBadge({ status }: { status: TagRecord['status'] }) {
  const colors: Record<string, string> = { online: '#3fb950', stale: '#d29922', unknown: '#6e7681' };
  return <span style={{ display: 'inline-block', padding: '2px 6px', borderRadius: 12, fontSize: 11, background: colors[status] + '20', color: colors[status] }}>{status}</span>;
}

function BatteryCell({ mv }: { mv: number | undefined }) {
  if (!mv) return <span>-</span>;
  const v = mv / 1000;
  let color = '#3fb950';
  if (v < 2.9) color = '#f85149';
  else if (v < 3.1) color = '#d29922';
  return <span style={{ color }}>{v.toFixed(2)}V</span>;
}
