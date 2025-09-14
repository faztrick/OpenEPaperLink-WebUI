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
      <h2 className="mt-0 flex gap-16 items-center">Tags <small className="small center-muted fw-400">{isValidating ? '(refreshing)' : ''}</small></h2>
      <div className="grid-gap-lg items-start">
        <div className="flex-col-gap-12">
          <TagImageUploader onUploaded={() => mutate()} />
          <div className="flex gap-12 flex-wrap items-center">
            <input placeholder='Search mac or alias…' value={filter} onChange={e => setFilter(e.target.value)} className="input-grow" />
            <button onClick={() => mutate()} className="btn-slim">Refresh</button>
          </div>
          <div className="overflow-x-auto">
            <table className="table-tags">
              <thead>
                <tr className="row-border-bottom text-left">
                  <th>MAC</th><th>Alias</th><th>Status</th><th>Pending</th><th>Last Seen</th><th>Battery</th><th>RSSI</th><th>HW</th><th></th>
                </tr>
              </thead>
              <tbody>
                {isLoading && <tr><td colSpan={9} className="pad-cell">Loading tags…</td></tr>}
                {error && <tr><td colSpan={9} className="pad-cell text-error">Error loading tags: {(error as Error).message}</td></tr>}
                {!isLoading && !error && filtered.length === 0 && <tr><td colSpan={9} className="pad-cell">No tags match.</td></tr>}
                {filtered.map(t => {
                  const age = t.lastSeenDate ? ((Date.now() - t.lastSeenDate.getTime()) / 60000).toFixed(1) + 'm' : '-';
                  const editing = editingMac === t.mac;
                  return (
                    <tr key={t.mac} className="row-border-top">
                      <td className="mono">{t.mac}</td>
                      <td>{editing ? (
                        <span className="alias-edit-wrap">
                          <input autoFocus value={aliasDraft} maxLength={63} placeholder="Alias" onChange={e => setAliasDraft(e.target.value)} className="w-140" />
                          <button disabled={aliasBusy} onClick={() => saveAlias(t.mac)} className="btn-slim">Save</button>
                          <button disabled={aliasBusy} onClick={() => { setEditingMac(null); setAliasDraft(''); }} className="btn-slim">Cancel</button>
                        </span>
                      ) : (
                        <span className="alias-view">
                          {t.alias || <span className="opacity-40">—</span>}
                          <button className="btn-xs" onClick={(e) => { e.preventDefault(); setEditingMac(t.mac); setAliasDraft(t.alias || ''); }}>Edit</button>
                        </span>
                      )}</td>
                      <td><StatusBadge status={t.status} /></td>
                      <td>{t.pending}</td>
                      <td title={t.lastSeenDate?.toISOString()}>{age}</td>
                      <td><BatteryCell mv={t.batteryMv} /></td>
                      <td>{t.RSSI ?? '-'}</td>
                      <td>{t.hwType}</td>
                      <td><a className="small" href={`/tag/${t.mac}`}>Details</a></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="small center-muted">Auto-refreshing every 15s. Uploading an image will queue it immediately.</div>
        </div>
      </div>
    </Layout>
  );
}

function StatusBadge({ status }: { status: TagRecord['status'] }) {
  const cls: Record<string, string> = { online: 'status-online', stale: 'status-stale', unknown: 'status-unknown' };
  return <span className={`status-pill ${cls[status] || 'status-unknown'}`}>{status}</span>;
}

function BatteryCell({ mv }: { mv: number | undefined }) {
  if (!mv) return <span>-</span>;
  const v = mv / 1000;
  let cls = 'bat-good';
  if (v < 2.9) cls = 'bat-low';
  else if (v < 3.1) cls = 'bat-warn';
  return <span className={cls}>{v.toFixed(2)}V</span>;
}
