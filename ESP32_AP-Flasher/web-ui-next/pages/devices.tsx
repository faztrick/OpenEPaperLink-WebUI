import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { Layout } from '../components/Layout';
import { Seo } from '../components/Seo';
import type { DeviceSummary as SharedDeviceSummary } from '../lib/api-types';
import { getSelectedDevice, setSelectedDevice } from '../lib/deviceSelection';
import { fetcher } from '../lib/fetcher';

export default function DevicesPage() {
  const { data, error, isLoading } = useSWR<SharedDeviceSummary[]>('/api/devices', fetcher);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    const current = getSelectedDevice();
    if (current) setSelectedId(current.id);
  }, []);

  function selectDevice(d: SharedDeviceSummary) {
    // Derive a baseUrl from summary if present (ip or host fields). Fallback example.
    const baseUrl = (d as any).ip ? `http://${(d as any).ip}` : (d as any).baseUrl || '';
    if (!baseUrl) {
      alert('Device has no reachable baseUrl/ip field');
      return;
    }
    setSelectedDevice({ id: d.id, name: d.name, baseUrl });
    setSelectedId(d.id);
  }

  return (
    <Layout title="Devices">
      <Seo title="Devices" description="List of devices (placeholder)" />
      <h2>Devices</h2>
      {isLoading && <p>Loading devices...</p>}
      {error && <p className="text-error">Failed to load devices: {(error as Error).message}</p>}
      {!isLoading && !error && (
        <table className="table-mini">
          <thead>
            <tr className="text-left"><th>ID</th><th>Name</th><th>Status</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {(data && data.length ? data : [{ id: 'example-1', name: 'Example Device', status: 'offline', ip: '192.168.4.1' } as any]).map(d => {
              const isSel = selectedId === d.id;
              return (
                <tr key={d.id} className="row-border-top">
                  <td><a href={`/device/${d.id}`}>{d.id}</a></td>
                  <td>{d.name} {isSel && <span className="badge badge-ok">Selected</span>}</td>
                  <td>{d.status ?? '-'}</td>
                  <td>
                    <button className="btn-slim" disabled={isSel} onClick={() => selectDevice(d)}>{isSel ? 'Active' : 'Select'}</button>
                    {isSel && <button className="btn-slim ml-2" onClick={() => { setSelectedDevice(null); setSelectedId(null); }}>Clear</button>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </Layout>
  );
}
