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
      {error && <p className="text-error">Failed to load devices: {(error as Error).message}</p>}
      {!isLoading && !error && (
        <table className="table-mini">
          <thead>
            <tr className="text-left"><th>ID</th><th>Name</th><th>Status</th></tr>
          </thead>
          <tbody>
            {(data && data.length ? data : [{ id: 'example-1', name: 'Example Device', status: 'offline' }]).map(d => (
              <tr key={d.id} className="row-border-top">
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
