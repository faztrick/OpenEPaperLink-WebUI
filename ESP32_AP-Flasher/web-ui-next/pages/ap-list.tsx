import useSWR from 'swr';
import { Layout } from '../components/Layout';
import { Seo } from '../components/Seo';
import { buildApiUrl } from '../lib/apiBase';

interface APItem { hwType?: number; version?: number; channel?: number; rssi?: number; uptime?: number; capabilities?: string[]; mac?: string; state?: string }

async function fetchApList(): Promise<APItem[]> {
  const r = await fetch(buildApiUrl('/ap_list'), { cache: 'no-store' });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}

export default function APListPage() {
  const { data, error, isLoading, mutate, isValidating } = useSWR<APItem[]>('ap-list', fetchApList, { refreshInterval: 10000 });
  const list = data || [];
  return (
    <Layout title="AP List">
      <Seo title="AP List" description="C6 Module AP List" />
      <div className="flex items-center gap-12">
        <h2 className="mt-0">AP List</h2>
        <button className="btn btn-small" onClick={() => mutate()} disabled={isValidating}>{isValidating ? 'Refreshing…' : 'Refresh'}</button>
      </div>
      {isLoading && <p>Loading…</p>}
      {error && <p className="text-error">Error: {(error as Error).message}</p>}
      {!isLoading && !error && (
        <div className="grid-gap-8 mt-8">
          {list.length === 0 && <div className="opacity-60">No AP entries reported.</div>}
          {list.map((ap, i) => (
            <div key={i} className="ap-card">
              <div className="ap-card-header">
                <strong>C6 Module</strong>
                <span className="ap-state">state: {ap.state || '-'}</span>
              </div>
              <div className="ap-grid">
                <Field label="Version" value={String(ap.version ?? '-')} />
                <Field label="Channel" value={String(ap.channel ?? '-')} />
                <Field label="RSSI" value={ap.rssi != null ? `${ap.rssi} dBm` : '-'} />
                <Field label="Uptime" value={ap.uptime != null ? `${ap.uptime}s` : '-'} />
                <Field label="MAC" value={ap.mac || '-'} />
                <Field label="Caps" value={(ap.capabilities || []).join(', ') || '-'} />
              </div>
            </div>
          ))}
        </div>
      )}
    </Layout>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return <div><div className="opacity-60 text-12">{label}</div><div>{value}</div></div>;
}
