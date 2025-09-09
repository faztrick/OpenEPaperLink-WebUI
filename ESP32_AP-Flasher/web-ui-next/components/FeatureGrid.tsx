import { useDeviceFeatures } from '../hooks/useDeviceFeatures';

export function FeatureGrid({ deviceId }: { deviceId: string }) {
  const { loading, error, list, fetchedAt, reload } = useDeviceFeatures(deviceId, { auto: true, refreshMs: 30000 });
  return (
    <div style={{ border: '1px solid #ddd', borderRadius: 8, padding: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <strong>Features</strong>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {fetchedAt && <span style={{ fontSize: 11, opacity: 0.6 }}>updated {new Date(fetchedAt).toLocaleTimeString()}</span>}
          <button onClick={reload} className="btn btn-small" disabled={loading}>↻</button>
        </div>
      </div>
      {loading && <p style={{ fontSize: 12, opacity: 0.7 }}>Loading...</p>}
      {error && <p style={{ fontSize: 12, color: 'tomato' }}>Error: {error}</p>}
      {!loading && !error && list.length === 0 && <p style={{ fontSize: 12, opacity: 0.6 }}>No features reported.</p>}
      <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fill,minmax(120px,1fr))' }}>
        {list.map(f => (
          <div key={f.name} style={{
            padding: 6,
            border: '1px solid ' + (f.enabled ? '#16a34a' : '#dc2626'),
            background: f.enabled ? 'rgba(16,185,129,0.08)' : 'rgba(220,38,38,0.08)',
            borderRadius: 6,
            fontSize: 12
          }}>
            <strong style={{ display: 'block', marginBottom: 4 }}>{f.name}</strong>
            <span style={{ color: f.enabled ? '#16a34a' : '#dc2626' }}>{f.enabled ? 'ENABLED' : 'MISSING'}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
