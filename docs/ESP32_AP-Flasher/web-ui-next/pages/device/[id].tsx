import { useRouter } from 'next/router';
import useSWR from 'swr';
import { FeatureGrid } from '../../components/FeatureGrid';
import { Layout } from '../../components/Layout';
import { Seo } from '../../components/Seo';
import type { DeviceDetail } from '../../lib/api-types';
import { fetcher } from '../../lib/fetcher';

export default function DeviceDetails(){
  const router = useRouter();
  const { id } = router.query;
  const title = `Device ${id ?? ''}`;
  const enabled = typeof id === 'string';
  const { data, error, isLoading } = useSWR<DeviceDetail>(enabled? `/api/devices/${id}`: null, fetcher);

  return (
    <Layout title={title}>
      <Seo title={title} description="Device details (placeholder)" />
      <h2>{title}</h2>
      {!enabled && <p>Waiting for id...</p>}
      {isLoading && <p>Loading device...</p>}
      {error && <p style={{color:'tomato'}}>Failed to load: {(error as Error).message}</p>}
      {data && (
        <div style={{display:'flex', gap:24, alignItems:'flex-start', flexWrap:'wrap'}}>
          <div style={{display:'grid', gap:4, maxWidth:360}}>
            <Field label="Name" value={data.name} />
            <Field label="Status" value={data.status} />
            <Field label="Firmware" value={data.firmware ?? '-'} />
            <Field label="IP" value={data.ip ?? '-'} />
            <Field label="MAC" value={data.mac ?? '-'} />
            <Field label="Tags" value={String(data.tags ?? 0)} />
            <Field label="Last Seen" value={data.lastSeen ?? '-'} />
          </div>
          <div style={{minWidth:320, flex:1}}>
            <FeatureGrid deviceId={data.id} />
          </div>
        </div>
      )}
    </Layout>
  );
}

function Field({label, value}:{label:string; value:string}){
  return <div style={{display:'flex', justifyContent:'space-between'}}><span style={{opacity:.6}}>{label}</span><span>{value}</span></div>;
}
