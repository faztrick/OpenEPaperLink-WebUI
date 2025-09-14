import { useEffect, useMemo, useState } from 'react';
// Wi-Fi connect / scan / mode management panel.
// Mode selector below uses serial-first logic implemented in hooks (setWifiMode/getWifiMode)
// Error codes surfaced via toasts (unknown_command -> firmware lacks CLI; mode_timeout / upstream_timeout -> busy/stale situations)
import { connectWifi, disconnectWifi, getWifiMode, setWifiMode, useDeviceWifiScan, useDeviceWifiStatus } from '../hooks/useDeviceWifi';
import { showToast } from '../hooks/useToast';
import { getSelectedDevice } from '../lib/deviceSelection';

// Simple translator for encryption field (enc) -> human readable. Firmware specifics:
// Common enc values (heuristic): 0=open, 1=WEP, 2/3=WPA, 4=WPA2, 5=WPAX (mixed). Fallback to Unknown.
function encLabel(enc?: number) {
  if (enc === undefined || enc === null) return '-';
  switch (enc) {
    case 0: return 'Open';
    case 1: return 'WEP';
    case 2: return 'WPA';
    case 3: return 'WPA';
    case 4: return 'WPA2';
    case 5: return 'WPA/WPA2';
    default: return 'Enc';
  }
}

interface WifiConnectPanelProps { selectedDeviceId: string | null; }

export function WifiConnectPanel({ selectedDeviceId }: WifiConnectPanelProps) {
  const { status, loading: statusLoading, error: statusError, reload: reloadStatus, needsDeviceSelection, stale: statusStale } = useDeviceWifiStatus(6000);
  const { startScan, results, running: scanRunning, initiating: scanInitiating, error: scanError, stale: scanStale, legacyFallback, partial } = useDeviceWifiScan();
  const [mounted, setMounted] = useState(false);
  const [ssid, setSsid] = useState('');
  const [password, setPassword] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [modeChanging, setModeChanging] = useState(false);
  const sel = getSelectedDevice();

  useEffect(() => { setMounted(true); }, []);
  useEffect(() => { // clear form when selection changes
    setSsid(''); setPassword('');
  }, [selectedDeviceId]);

  const sortedResults = useMemo(() => {
    return [...results].sort((a, b) => (b.rssi || -999) - (a.rssi || -999));
  }, [results]);

  if (!mounted) return null; // avoid SSR hydration issues

  return (
    <div className="sec mt-10" id="wifi-panel">
      <h3 className="heading-mid">Wi-Fi</h3>
      {!sel && <div className="xsmall muted mt-1">Select a device above to manage Wi-Fi.</div>}
      {sel && (
        <>
          <div className="wifi-status-row">
            <div className="flex-col gap-1">
              <div>
                <strong>Status:</strong>{' '}
                {statusLoading && !status && <span>Loading…</span>}
                {!statusLoading && status && (
                  <>
                    {status.connected ? (
                      <span className="badge badge-ok">Connected</span>
                    ) : (
                      <span className="badge badge-dim">Not Connected</span>
                    )}
                    {statusStale && <span className="badge badge-warn ml-1" title="Using stale data">Stale</span>}
                    {status.connected && (
                      <span className="ml-2 xsmall mono">{status.ssid} ({status.ip || 'no ip'}) RSSI:{status.rssi ?? '?'} ch:{status.channel ?? '?'}</span>
                    )}
                  </>
                )}
                {statusError && <span className="text-error ml-2 xsmall">{statusError}</span>}
              </div>
              <div className="xsmall mt-1 flex-row gap-2 items-center">
                {(() => {
                  const modeVal = (status?.wifiMode ?? status?.mode);
                  const modeName = (() => {
                    switch (modeVal) {
                      case 0: return 'AUTO';
                      case 1: return 'AP';
                      case 2: return 'STA';
                      case 3: return 'AP+STA';
                      default: return modeVal !== undefined ? String(modeVal) : '—';
                    }
                  })();
                  return <span>Mode: <span className="mono">{modeName}</span></span>;
                })()}
                {modeChanging && <span className="badge badge-dim">Changing…</span>}
              </div>
            </div>
            <div className="flex-row gap-2 flex-wrap">
              <div className="mode-buttons flex-row gap-1">
                {[{ m: 0, l: 'AUTO' }, { m: 1, l: 'AP' }, { m: 2, l: 'STA' }, { m: 3, l: 'AP+STA' }].map(x => {
                  const cur = (status?.wifiMode ?? status?.mode);
                  const active = cur === x.m;
                  return (
                    <button
                      key={x.m}
                      className={`btn-slim ${active ? 'btn-active' : ''}`}
                      disabled={modeChanging || statusLoading}
                      title={`Set Wi-Fi mode to ${x.l}`}
                      onClick={async () => {
                        if (active) return;
                        try {
                          setModeChanging(true);
                          await setWifiMode(x.m);
                          showToast(`Mode change requested: ${x.l}`, 'success');
                          // Quick refresh via serial if available; fallback to status reload.
                          try { await getWifiMode(); } catch { /* ignore */ }
                          setTimeout(() => reloadStatus(), 500);
                          setTimeout(() => reloadStatus(), 2500);
                        } catch (e: any) {
                          showToast('Mode change failed: ' + (e.message || e), 'error');
                        } finally { setModeChanging(false); }
                      }}
                    >{x.l}</button>
                  );
                })}
              </div>
              <button className="btn-slim" onClick={() => reloadStatus()} disabled={statusLoading || modeChanging}>Reload</button>
              {status?.connected && <button className="btn-slim" disabled={connecting || modeChanging} onClick={async () => {
                try {
                  setConnecting(true);
                  await disconnectWifi();
                  showToast('Disconnect requested', 'info');
                  setTimeout(() => reloadStatus(), 600);
                } catch (e: any) {
                  showToast('Disconnect failed: ' + (e.message || e), 'error');
                } finally { setConnecting(false); }
              }}>Disconnect</button>}
            </div>
          </div>

          <div className="mt-4">
            <div className="flex-row gap-2 mb-2">
              <button className="btn-slim" disabled={scanInitiating || scanRunning} onClick={() => startScan()}>
                {scanInitiating ? 'Starting…' : scanRunning ? 'Scanning…' : 'Start Scan'}
              </button>
              {scanRunning && <span className="xsmall muted">Polling results…</span>}
              {scanStale && <span className="badge badge-warn" title="Using stale network list">Stale</span>}
              {legacyFallback && <span className="badge badge-warn" title="Legacy fallback used">Legacy</span>}
              {partial && <span className="badge badge-dim" title="Partial results">Partial</span>}
              {scanError && <span className="text-error xsmall">{scanError}</span>}
            </div>
            <div className="wifi-connect-form mb-3">
              <input className="input" placeholder="SSID" value={ssid} onChange={e => setSsid(e.target.value)} list="wifi-ssid-list" />
              <input className="input" placeholder="Password (optional)" value={password} onChange={e => setPassword(e.target.value)} type="password" />
              <button className="btn-slim" disabled={!ssid || connecting} onClick={async () => {
                try {
                  setConnecting(true);
                  await connectWifi(ssid, password);
                  showToast('Connect command sent', 'success');
                  // Clear password after attempt.
                  setPassword('');
                  // Reload status a couple times to capture new connection.
                  setTimeout(() => reloadStatus(), 1000);
                  setTimeout(() => reloadStatus(), 3000);
                } catch (e: any) {
                  showToast('Connect failed: ' + (e.message || e), 'error');
                } finally { setConnecting(false); }
              }}>{connecting ? 'Connecting…' : 'Connect'}</button>
            </div>
            <datalist id="wifi-ssid-list">
              {sortedResults.map(r => <option key={r.ssid} value={r.ssid} />)}
            </datalist>
            <div className="overflow-x-auto">
              <table className="table-mini">
                <thead>
                  <tr className="text-left"><th>SSID</th><th>RSSI</th><th>Ch</th><th>Enc</th><th></th></tr>
                </thead>
                <tbody>
                  {sortedResults.map((r, idx) => {
                    const isConnected = status?.connected && status?.ssid === r.ssid;
                    return (
                      <tr key={r.ssid + idx} className={isConnected ? 'row-highlight' : ''}>
                        <td className="mono">{r.ssid || <span className="muted">(hidden)</span>} {isConnected && <span className="badge badge-ok ml-1">Active</span>}</td>
                        <td>{r.rssi ?? ''}</td>
                        <td>{r.channel ?? ''}</td>
                        <td>{encLabel(r.enc)}</td>
                        <td>
                          <button className="btn-slim" disabled={connecting} onClick={() => { setSsid(r.ssid); if (encLabel(r.enc) === 'Open') setPassword(''); }}>Select</button>
                        </td>
                      </tr>
                    );
                  })}
                  {!sortedResults.length && <tr><td colSpan={5}><span className="xsmall muted">{scanRunning ? 'Scanning…' : 'No scan results yet.'}</span></td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
      <style jsx>{`
        .wifi-status-row { display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; }
        .wifi-connect-form { display:flex; flex-wrap:wrap; gap:6px; align-items:center; }
        .wifi-connect-form .input { padding:4px 6px; font-size:0.85rem; }
        .overflow-x-auto { overflow-x:auto; }
        .row-highlight { background:rgba(0,160,0,0.06); }
        .mono { font-family:var(--font-mono, monospace); }
        .mode-buttons .btn-slim.btn-active { background: #0a5; color:#fff; }
      `}</style>
    </div>
  );
}
