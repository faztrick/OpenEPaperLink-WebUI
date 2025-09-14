import { useCallback, useEffect, useState } from 'react';
import { showToast } from '../hooks/useToast';
import { transport, TransportStatus } from '../lib/transport';
import ConnectionStatusBadge from './ConnectionStatusBadge';

interface TransportControlPanelProps {
  onNext?: () => void; // invoked when user clicks Next (typically scroll to Wi-Fi)
}

// Panel allowing user to inspect and change connection preference and force a serial session.
// Provides: preferred selector, effective badge, force serial button (opens port if needed),
// revert to auto, and a Next button enabled once serial is active when serial preference chosen.
export function TransportControlPanel({ onNext }: TransportControlPanelProps) {
  const t = transport();
  const [status, setStatus] = useState<TransportStatus>(() => t.getStatus());
  const [mounted, setMounted] = useState(false);
  const [opening, setOpening] = useState(false);

  useEffect(() => { setMounted(true); }, []);
  useEffect(() => { const unsub = t.subscribe(setStatus); return () => unsub(); }, [t]);

  const forceSerial = useCallback(async () => {
    try {
      t.setPreferred('serial');
      if (!status.serialOpen) {
        setOpening(true);
        await t.openSerial();
        showToast('Serial port opened', 'success');
      }
    } catch (e: any) {
      showToast('Failed to open serial: ' + (e?.message || e), 'error');
    } finally {
      setOpening(false);
    }
  }, [t, status.serialOpen]);

  const revertAuto = useCallback(() => { t.setPreferred('auto'); }, [t]);

  if (!mounted) return null; // SSR guard

  const canNext = status.preferred === 'serial' ? status.serialOpen : true; // allow Next always unless serial preferred but not open
  const nextDisabledReason = !canNext ? 'Open serial first' : undefined;

  return (
    <div className="sec mt-8" id="transport-panel">
      <h3 className="heading-mid">Connection Type</h3>
      <div className="xsmall muted mt-1">Preferred channel determines how API calls are sent. In Auto we try HTTP first and fall back to Serial if already open.</div>
      <div className="mt-3 flex-col gap-2 transport-grid">
        <div className="row-line">
          <label className="lbl">Preferred</label>
          <div className="flex-row gap-2">
            <select className="input" value={status.preferred} onChange={e => t.setPreferred(e.target.value as any)}>
              <option value="auto">auto</option>
              <option value="http">http</option>
              <option value="serial">serial</option>
            </select>
            {status.preferred === 'serial' && !status.serialOpen && (
              <span className="xsmall warn">Serial not open</span>
            )}
          </div>
        </div>
        <div className="row-line">
          <label className="lbl">Effective</label>
          <div className="flex-row gap-2 align-center">
            <ConnectionStatusBadge minimal />
            {status.openingSerial && <span className="xsmall muted">Opening…</span>}
            {status.lastHttpTimeout && <span className="badge badge-warn" title="Last HTTP attempt timed out">HTTP Timeout</span>}
          </div>
        </div>
        <div className="row-line">
          <label className="lbl">Actions</label>
          <div className="flex-row gap-2 flex-wrap">
            <button className="btn-slim" onClick={forceSerial} disabled={opening}>{opening ? 'Opening…' : 'Force Serial'}</button>
            <button className="btn-slim" onClick={revertAuto} disabled={status.preferred === 'auto'}>Auto</button>
            <button className="btn-slim" onClick={() => t.setPreferred('http')} disabled={status.preferred === 'http'}>HTTP Only</button>
            {status.serialOpen && <button className="btn-slim" onClick={() => t.closeSerial()}>Close Serial</button>}
          </div>
        </div>
        {status.error && (
          <div className="row-line">
            <label className="lbl">Serial Error</label>
            <div className="text-error xsmall mono">{status.error}</div>
          </div>
        )}
        {status.lastError && (
          <div className="row-line">
            <label className="lbl">Last Req Error</label>
            <div className="xsmall mono" title={new Date(status.lastErrorAt || 0).toLocaleString()}>{status.lastError}</div>
          </div>
        )}
        <div className="row-line">
          <label className="lbl">Next</label>
          <button className="btn-slim" disabled={!canNext} title={nextDisabledReason} onClick={() => {
            if (onNext) onNext(); else {
              const el = document.getElementById('wifi-panel');
              if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
          }}>Next</button>
        </div>
      </div>
      <style jsx>{`
        .transport-grid { display:flex; flex-direction:column; gap:10px; }
        .row-line { display:flex; gap:12px; align-items:center; flex-wrap:wrap; }
        .lbl { width:90px; font-size:0.7rem; text-transform:uppercase; letter-spacing:0.06em; color:var(--muted-fg,#777); }
        .flex-row { display:flex; }
        .flex-col { display:flex; flex-direction:column; }
        .gap-2 { gap:8px; }
        .warn { color:#d18b00; }
        .mono { font-family:var(--font-mono, monospace); }
        @media (max-width: 640px) {
          .lbl { width:70px; }
        }
      `}</style>
    </div>
  );
}

export default TransportControlPanel;
