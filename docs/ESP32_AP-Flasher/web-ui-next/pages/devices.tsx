import useSWR from 'swr';
import { Layout } from '../components/Layout';
import { Seo } from '../components/Seo';
import type { DeviceSummary as SharedDeviceSummary } from '../lib/api-types';
import { fetcher } from '../lib/fetcher';

export default function DevicesPage() {
  const { data, error, isLoading } = useSWR<SharedDeviceSummary[]>('/api/devices', fetcher);

  return (
    <Layout title="Devices">
      <Seo title="Devices" description="List of devices (placeholder)" />
      <h2>Devices</h2>
      {isLoading && <p>Loading devices...</p>}
      {error && <p style={{color:'tomato'}}>Failed to load devices: {(error as Error).message}</p>}
      {!isLoading && !error && (
        <table style={{width:'100%', borderCollapse:'collapse'}}>
          <thead>
            <tr><th style={{textAlign:'left'}}>ID</th><th style={{textAlign:'left'}}>Name</th><th style={{textAlign:'left'}}>Status</th></tr>
          </thead>
          <tbody>
            {(data && data.length ? data : [{id:'example-1', name:'Example Device', status:'offline'}]).map(d=> (
              <tr key={d.id} style={{borderTop:'1px solid #30363d'}}>
                <td><a href={`/device/${d.id}`}>{d.id}</a></td>
                <td>{d.name}</td>
                <td>{d.status ?? '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Layout>
  );
}
