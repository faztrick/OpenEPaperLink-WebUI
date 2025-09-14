import { useEffect, useState } from 'react';
import { PreferredChannel, transport, TransportStatus } from '../lib/transport';

export function ConnectionSwitcher() {
  const t = transport();
  const [status, setStatus] = useState<TransportStatus>(() => {
    // On server we cannot reliably know serial support; force a stable placeholder.
    const base = t.getStatus();
    return typeof window === 'undefined'
      ? { ...base, serialSupported: false, serialOpen: false }
      : base;
  });
  const [mounted, setMounted] = useState(false);

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

  function setPreferred(p: PreferredChannel) {
    t.setPreferred(p);
    if (typeof window !== 'undefined') localStorage.setItem('connPref', p);
  }

  async function connectSerial() {
    try {
      await t.openSerial();
    } catch (e: any) {
      alert('Serial open failed: ' + e.message);
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

  return (
    <div className="conn-switcher-row">
      <strong>Connection:</strong>
      <button onClick={() => setPreferred('auto')} disabled={pref === 'auto'} className="btn-slim">Auto</button>
      <button onClick={() => setPreferred('http')} disabled={pref === 'http'} className="btn-slim">Force HTTP</button>
      <button onClick={() => setPreferred('serial')} disabled={!serialSupported || pref === 'serial'} className="btn-slim">Force Serial</button>
      {serialControls}
      {pref !== 'serial' && status.serialOpen && <span className="ml-2 text-xs opacity-70">(Serial fallback ready)</span>}
      {!serialSupported && <span className="opacity-60">Serial unsupported</span>}
    </div>
  );
}
