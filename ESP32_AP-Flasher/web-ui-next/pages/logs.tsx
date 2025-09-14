import { useCallback, useEffect, useMemo, useState } from 'react';
import { Layout } from '../components/Layout';
import { showToast } from '../hooks/useToast';
import { sendTestLog, tailLogs } from '../lib/apiLogs';

export default function LogsPage() {
  const [lines, setLines] = useState<string[]>([]);
  const [count, setCount] = useState(0);
  const [limit, setLimit] = useState(300);
  const [loading, setLoading] = useState(false);
  const [auto, setAuto] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const r = await tailLogs(limit);
      setLines(r.lines || []);
      setCount(r.count || 0);
    } catch (e: any) {
      showToast('Failed to load logs: ' + e.message, 'error');
    } finally { setLoading(false); }
  }, [limit]);

  useEffect(() => { reload(); }, [reload]);
  useEffect(() => {
    if (!auto) return;
    const id = setInterval(reload, 3000);
    return () => clearInterval(id);
  }, [auto, reload]);

  const view = useMemo(() => lines.join('\n'), [lines]);

  return (
    <Layout title="Logs" description="Device logs">
      <h2 className="mt-0">Logs</h2>
      <div className="flex gap-lg items-center flex-wrap">
        <label className="small">Tail lines <input type="number" min={10} max={2000} value={limit} onChange={e => setLimit(Math.max(10, Math.min(2000, Number(e.target.value))))} className="w-80 ml-6" /></label>
        <label className="small"><input type="checkbox" checked={auto} onChange={e => setAuto(e.target.checked)} /> Auto refresh</label>
        <button className="btn btn-small" onClick={reload} disabled={loading}>{loading ? 'Loading…' : 'Refresh'}</button>
        <button className="btn btn-small" onClick={async () => { const ok = await sendTestLog('Test from UI'); if (ok) showToast('Sent test log', 'success'); else showToast('Send test failed', 'error'); }}>Send Test Log</button>
      </div>
      <div className="log-box font-mono">
        {view ? view.split('\n').map((l, i) => <div key={i} className="ws-pre">{l}</div>) : <div className='center-muted'>No logs.</div>}
      </div>
      <div className="small center-muted mt-6">Showing {count} lines (limit {limit}). Updates every 3s when auto refresh is enabled.</div>
    </Layout>
  );
}
