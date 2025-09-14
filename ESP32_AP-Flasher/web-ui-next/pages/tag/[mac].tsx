import Link from 'next/link';
import { useRouter } from 'next/router';
import { Layout } from '../../components/Layout';
import TagImageUploader from '../../components/TagImageUploader';
import { deriveTagState, useTag } from '../../hooks/useTag';
import { formatMac } from '../../lib/api';

export default function TagDetailPage() {
  const router = useRouter();
  const macParam = router.query.mac as string | undefined;
  const { data: tag, error, isLoading, mutate } = useTag(macParam, { refreshMs: 8000 });
  const state = deriveTagState(tag);
  const title = macParam ? `Tag ${macParam}` : 'Tag';

  return (
    <Layout title={title} description="Tag detail">
      <div className="flex justify-between items-center mb-4">
        <h2 className="mt-0 mb-4">{title}</h2>
        <Link href="/tags" className="small">← Back to tags</Link>
      </div>
      {!macParam && <p>No MAC specified.</p>}
      {error && <p className="text-error">Error: {(error as Error).message}</p>}
      {isLoading && <p>Loading tag…</p>}
      {tag && <TagOverview tag={tag} state={state} onRefresh={() => mutate()} />}
      {macParam && <div className="mt-32"><TagImageUploader compact onUploaded={() => mutate()} /></div>}
    </Layout>
  );
}

function TagOverview({ tag, state, onRefresh }: { tag: any; state: string; onRefresh: () => void }) {
  const rows: [string, any, string?][] = [
    ['Alias', tag.alias || '—'],
    ['MAC', formatMac(tag.mac)],
    ['Hardware', tag.hwType],
    ['ContentMode', tag.contentMode],
    ['Pending Items', tag.pending],
    ['Battery', tag.batteryMv ? (tag.batteryMv / 1000).toFixed(2) + ' V' : '-'],
    ['Temperature', tag.temperature ? tag.temperature + '°C' : '-'],
    ['RSSI', tag.RSSI ?? '-'],
    ['LQI', tag.LQI ?? '-'],
    ['Wakeup Reason', tag.wakeupReason ?? '-'],
    ['Capabilities', '0x' + tag.capabilities.toString(16)],
    ['Last Seen', tag.lastSeenDate?.toLocaleString() || 'never', tag.lastSeenDate?.toISOString()],
    ['Next Update (epoch)', tag.nextupdate || '-'],
    ['Next Checkin (epoch)', tag.nextcheckin || '-'],
    ['Updates Sent', tag.updatecount || 0],
    ['Update Last (epoch)', tag.updatelast || '-'],
    ['Rotate', tag.rotate],
    ['LUT', tag.lut],
    ['Invert', tag.invert ? 'yes' : 'no'],
    ['Channel', tag.ch],
    ['Version', tag.ver]
  ];
  return (
    <div className="grid-gap-12">
      <div className="flex gap-16 flex-wrap">
        <StateBadge state={state} pending={tag.pending} />
        <button onClick={onRefresh} className="btn-slim">Manual Refresh</button>
      </div>
      <table className="table-detail">
        <tbody>
          {rows.map(([k, v, title]) => (
            <tr key={k} className="row-border-top" title={title}> <th className="detail-th">{k}</th><td className="detail-td">{String(v)}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StateBadge({ state, pending }: { state: string; pending: number }) {
  const map: Record<string, { label: string; color: string }> = {
    idle: { label: 'Idle', color: '#3fb950' },
    'awaiting-wake': { label: 'Awaiting Wake', color: '#d29922' },
    updating: { label: 'Updating Now', color: '#58a6ff' },
    unknown: { label: 'Unknown', color: '#6e7681' }
  };
  const meta = map[state] || map.unknown;
  const clsMap: Record<string, string> = {
    idle: 'pill-idle',
    'awaiting-wake': 'pill-wait',
    updating: 'pill-updating',
    unknown: 'pill-unknown'
  };
  return <span className={`tag-state-pill ${clsMap[state] || 'pill-unknown'}`}>{meta.label}{pending > 0 && <span className="opacity-70">(pending {pending})</span>}</span>;
}
