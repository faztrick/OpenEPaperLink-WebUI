import { useEffect, useState } from 'react';
import { PreferredChannel, transport, TransportStatus } from '../lib/transport';
// (Status badge moved to global sidebar; keep switcher lean.)

interface ConnectionSwitcherProps {
  deviceId?: string | null;
  syncMeta?: boolean; // if true and deviceId provided, persist preferred transport into device meta
  className?: string;
  compact?: boolean; // show shorter labels
  revertOnFail?: boolean; // revert preference if auto serial open fails
  showMetaDiff?: boolean; // display note if meta preferredTransport differs
}

import { upsertDeviceMeta } from '../lib/deviceMeta';

export function ConnectionSwitcher({ deviceId, syncMeta, className = 'conn-switcher-row', compact, revertOnFail, showMetaDiff }: ConnectionSwitcherProps) {
  const t = transport();
  const [status, setStatus] = useState<TransportStatus>(() => {
    // On server we cannot reliably know serial support; force a stable placeholder.
    const base = t.getStatus();
    return typeof window === 'undefined'
      ? { ...base, serialSupported: false, serialOpen: false }
      : base;
  });
  const [mounted, setMounted] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);
  // auto-dismiss open error after delay
  useEffect(() => {
    if (!openError) return;
    const id = setTimeout(() => setOpenError(null), 5000);
    return () => clearTimeout(id);
  }, [openError]);

  // subscribe to transport status (only after mount to avoid SSR/client divergence)
  useEffect(() => {
    setMounted(true);
    const unsub = t.subscribe((s) => {
      setStatus((prev) => {
        // Avoid turning serialSupported true before mount hydration completes
        if (!mounted) return prev;
        return s;
      });
    });
    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t]);

  // one-time persisted preference restore
  useEffect(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('connPref') as PreferredChannel | null : null;
    if (saved && saved !== status.preferred) {
      t.setPreferred(saved);
    }
    // we intentionally only want to run on mount + when t reference changes; ignore status changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t]);

  async function setPreferred(p: PreferredChannel) {
    t.setPreferred(p);
    if (typeof window !== 'undefined') localStorage.setItem('connPref', p);
    // If forcing serial, auto-attempt to open (browser permission prompt may appear)
    if (p === 'serial' && !t.getStatus().serialOpen) {
      try {
        await t.openSerial();
      } catch (e: any) {
        console.warn('Auto-open serial failed:', e?.message || e);
        if (revertOnFail) {
          t.setPreferred('auto');
          if (typeof window !== 'undefined') localStorage.setItem('connPref', 'auto');
        }
        setOpenError(`Serial open failed${revertOnFail ? ' (reverted to auto)' : ''}`);
      }
    }
    if (syncMeta && deviceId) {
      try { upsertDeviceMeta(deviceId, { preferredTransport: p }); } catch { /* ignore meta write errors */ }
    }
  }

  async function connectSerial() {
    try {
      await t.openSerial();
    } catch (e: any) {
      console.warn('Serial open failed:', e?.message || e);
      setOpenError('Serial open failed: ' + (e?.message || 'unknown'));
    }
  }

  async function closeSerial() {
    try { await t.closeSerial(); } catch { }
  }

  const serialSupported = mounted ? status.serialSupported : false; // lock until mounted
  const pref = status.preferred;
  const serialControls = (
    <>
      {status.serialOpen ? (
        <>
          <span className="text-ok">Serial Open</span>
          <button onClick={closeSerial} className="btn-slim">Close</button>
        </>
      ) : (
        <button onClick={connectSerial} className="btn-slim" disabled={!serialSupported}>Open Serial</button>
      )}
    </>
  );

  const label = compact ? 'Conn' : 'Connection:';
  const meta = ((): any => {
    if (!deviceId) return null;
    try {
      // Lazy require to avoid circular imports (already imported upsert earlier)
      // dynamic import not needed since build bundling handles it; but safe guard
      const { getDeviceMeta } = require('../lib/deviceMeta');
      return getDeviceMeta(deviceId);
    } catch { return null; }
  })();
  const metaDiff = showMetaDiff && meta?.preferredTransport && meta.preferredTransport !== status.preferred;
  const warningNeedsOpen = status.preferred === 'serial' && !status.serialOpen;
  return (
    <div className={className}>
      <strong>{label}</strong>
      <button
        onClick={() => setPreferred('auto')}
        disabled={pref === 'auto'}
        className="btn-slim"
        title="Automatic: choose serial when open, otherwise HTTP"
      >{compact ? 'Auto' : 'Auto'}</button>
      <button
        onClick={() => setPreferred('http')}
        disabled={pref === 'http'}
        className="btn-slim"
        title="Force HTTP: always use HTTP (ignore serial)"
      >{compact ? 'HTTP' : 'Force HTTP'}</button>
      <button
        onClick={() => setPreferred('serial')}
        disabled={!serialSupported || pref === 'serial'}
        className="btn-slim"
        title="Force Serial: use serial API (falls back to HTTP if closed)"
      >{compact ? 'Serial' : 'Force Serial'}</button>
      {serialControls}
      {pref !== 'serial' && status.serialOpen && <span className="ml-2 text-xs opacity-70" title="Serial is open; Auto mode will use it when possible">(fallback ready)</span>}
      {!serialSupported && <span className="opacity-60" title="Browser does not support Web Serial or permission denied">Serial unsupported</span>}
      {warningNeedsOpen && <span className="ml-2 badge warn xsmall" title="Preferred serial but port is not open">Serial not open</span>}
      {metaDiff && <span className="ml-2 xsmall muted" title="Device meta stored a different preferred transport">Meta pref: {meta.preferredTransport}</span>}
      {openError && <span className="ml-2 badge warn xsmall" title={openError}>{openError}</span>}
    </div>
  );
}
