import { useRouter } from 'next/router';
import Link from 'next/link';
import { Layout } from '../../components/Layout';
import { useTag, deriveTagState } from '../../hooks/useTag';
import { formatMac } from '../../lib/api';
import TagImageUploader from '../../components/TagImageUploader';
import React from 'react';

export default function TagDetailPage() {
  const router = useRouter();
  const macParam = router.query.mac as string | undefined;
  const { data: tag, error, isLoading, mutate } = useTag(macParam, { refreshMs: 8000 });
  const state = deriveTagState(tag);
  const title = macParam ? `Tag ${macParam}` : 'Tag';

  return (
    <Layout title={title} description="Tag detail">
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
        <h2 style={{margin:'0 0 1rem'}}>{title}</h2>
        <Link href="/tags" style={{fontSize:12}}>← Back to tags</Link>
      </div>
      {!macParam && <p>No MAC specified.</p>}
      {error && <p style={{color:'tomato'}}>Error: {(error as Error).message}</p>}
      {isLoading && <p>Loading tag…</p>}
      {tag && <TagOverview tag={tag} state={state} onRefresh={()=> mutate()} />}
      {macParam && <div style={{marginTop:32}}><TagImageUploader compact onUploaded={()=> mutate()} /></div>}
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
    ['Battery', tag.batteryMv ? (tag.batteryMv/1000).toFixed(2)+' V' : '-'],
    ['Temperature', tag.temperature ? tag.temperature + '°C' : '-'],
    ['RSSI', tag.RSSI ?? '-'],
    ['LQI', tag.LQI ?? '-'],
    ['Wakeup Reason', tag.wakeupReason ?? '-'],
    ['Capabilities', '0x'+tag.capabilities.toString(16)],
    ['Last Seen', tag.lastSeenDate?.toLocaleString() || 'never', tag.lastSeenDate?.toISOString()],
    ['Next Update (epoch)', tag.nextupdate || '-'],
    ['Next Checkin (epoch)', tag.nextcheckin || '-'],
    ['Updates Sent', tag.updatecount || 0],
    ['Update Last (epoch)', tag.updatelast || '-'],
    ['Rotate', tag.rotate],
    ['LUT', tag.lut],
    ['Invert', tag.invert ? 'yes':'no'],
    ['Channel', tag.ch],
    ['Version', tag.ver]
  ];
  return (
    <div style={{display:'grid', gap:12}}>
      <div style={{display:'flex', gap:16, flexWrap:'wrap'}}>
        <StateBadge state={state} pending={tag.pending} />
        <button onClick={onRefresh} style={{padding:'4px 10px', fontSize:12}}>Manual Refresh</button>
      </div>
      <table style={{width:'100%', maxWidth:640, borderCollapse:'collapse'}}>
        <tbody>
          {rows.map(([k,v,title]) => (
            <tr key={k} style={{borderTop:'1px solid #30363d'}} title={title}> <th style={{textAlign:'left', padding:'4px 8px', fontWeight:500, width:180, opacity:.7}}>{k}</th><td style={{padding:'4px 8px'}}>{String(v)}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StateBadge({ state, pending }: { state: string; pending: number }) {
  const map: Record<string,{label:string;color:string}> = {
    idle:{label:'Idle',color:'#3fb950'},
    'awaiting-wake':{label:'Awaiting Wake',color:'#d29922'},
    updating:{label:'Updating Now',color:'#58a6ff'},
    unknown:{label:'Unknown',color:'#6e7681'}
  };
  const meta = map[state] || map.unknown;
  return <span style={{display:'inline-flex', alignItems:'center', gap:6, padding:'4px 10px', background:meta.color+'22', color:meta.color, borderRadius:16, fontSize:12}}>{meta.label}{pending>0 && <span style={{opacity:.7}}>(pending {pending})</span>}</span>;
}