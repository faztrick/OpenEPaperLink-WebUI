import { useCallback, useEffect, useState } from 'react';
import { Layout } from '../components/Layout';
import { connectWifi, disconnectWifi, setWifiMode, useDeviceWifiScan, useDeviceWifiStatus } from '../hooks/useDeviceWifi';
import { transport, TransportStatus } from '../lib/transport';

const WIFI_MODE_NAMES: Record<number, string> = { 0: 'AUTO', 1: 'AP', 2: 'STA', 3: 'AP+STA' };

export default function WifiPage() {
  const { status, loading: statusLoading, error: statusError, reload: reloadStatus } = useDeviceWifiStatus(5000);
  const { startScan, initiating, results, running, error: scanError, fetchResults } = useDeviceWifiScan(2000);
  const [ssid, setSsid] = useState('');
  const [password, setPassword] = useState('');
  const [connectBusy, setConnectBusy] = useState(false);
  const [connectMsg, setConnectMsg] = useState<string | null>(null);
  const [modeBusy, setModeBusy] = useState(false);
  const [modeError, setModeError] = useState<string | null>(null);
  const [tStatus, setTStatus] = useState<TransportStatus>(() => transport().getStatus());

  // Subscribe to transport changes
  useEffect(() => {
    const t = transport();
    const unsub = t.subscribe(s => setTStatus(s));
    return () => unsub();
  }, []);

  const doConnect = useCallback(async () => {
    if (!ssid) return;
    setConnectBusy(true); setConnectMsg(null);
    try { const r = await connectWifi(ssid, password); setConnectMsg(r.message || 'Connected/initiated'); setPassword(''); setTimeout(reloadStatus, 1200); }
    catch (e: any) { setConnectMsg('Error: ' + e.message); }
    finally { setConnectBusy(false); }
  }, [ssid, password, reloadStatus]);

  const doDisconnect = useCallback(async () => {
    setConnectBusy(true); setConnectMsg(null);
    try { const r = await disconnectWifi(); setConnectMsg(r.message || 'Disconnected'); setTimeout(reloadStatus, 800); }
    catch (e: any) { setConnectMsg('Error: ' + e.message); }
    finally { setConnectBusy(false); }
  }, [reloadStatus]);

  const changeMode = useCallback(async (m: number) => {
    setModeBusy(true); setModeError(null);
    try { await setWifiMode(m); setTimeout(reloadStatus, 1000); }
    catch (e: any) { setModeError(e.message); }
    finally { setModeBusy(false); }
  }, [reloadStatus]);

  return (
    <Layout title="Wi‑Fi" description="Device Wi‑Fi status and controls">
      <h1 className="mt-0">Wi‑Fi Management</h1>
      <div className="sec sec-wide">
        <h2 className="heading-mid">Status {statusLoading && <small>(loading)</small>} <button className="btn-slim" onClick={() => reloadStatus()}>Refresh</button></h2>
        {statusError && <div className="text-error">Error: {statusError}</div>}
        {status && (
          <>
            <div className="flex gap flex-wrap mt-4 small">
              <span className="badge">Connected: {String(status.connected)}</span>
              {status.ssid && <span className="badge">SSID: {status.ssid}</span>}
              {status.ip && <span className="badge">IP: {status.ip}</span>}
              {status.rssi != null && <span className="badge">RSSI: {status.rssi} dBm</span>}
              {status.channel != null && <span className="badge">Ch: {status.channel}</span>}
              <span className="badge">Policy: {status.wifiMode} ({WIFI_MODE_NAMES[status.wifiMode || 0] || 'Unknown'})</span>
              {status.apMode && <span className="badge">AP Clients: {status.apClients}</span>}
              {status.txPowerDbm != null && <span className="badge">Tx: {status.txPowerDbm} dBm</span>}
              <span className="badge {status.healthy ? 'badge-ok' : 'badge-bad'}">Healthy: {String(status.healthy)}</span>
              <span className="badge">Transport Pref: {tStatus.preferred}</span>
              <span className="badge">Transport Eff: {tStatus.effective}</span>
              {tStatus.serialOpen && <span className="badge badge-ok">Serial Open</span>}
            </div>
            {status.lastEvent && <div className="small mt-6">Last Event: {status.lastEvent.name} ({status.lastEvent.ts}) {status.lastEvent.data && 'data=' + status.lastEvent.data}</div>}
            <div className="xsmall mt-6 muted">Policy legend: 0=AUTO (STA then AP fallback), 1=AP, 2=STA, 3=AP+STA simultaneous</div>
          </>
        )}
      </div>
      <div className="sec mt">
        <h2 className="heading-mid">Connect / Disconnect</h2>
        <div>
          <input className="input-slim" placeholder="SSID" value={ssid} onChange={e => setSsid(e.target.value)} />{' '}
          <input className="input-slim" type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} />{' '}
          <button className="btn-slim" disabled={!ssid || connectBusy} onClick={doConnect}>{connectBusy ? '...' : 'Connect'}</button>{' '}
          <button className="btn-slim" disabled={connectBusy} onClick={doDisconnect}>Disconnect</button>
        </div>
        {connectMsg && <div className="small mt-6">{connectMsg}</div>}
      </div>
      <div className="sec mt">
        <h2 className="heading-mid">Mode Policy</h2>
        <div className="flex gap flex-wrap">
          {[{ m: 0, n: 'AUTO' }, { m: 1, n: 'AP' }, { m: 2, n: 'STA' }, { m: 3, n: 'AP+STA' }].map(o => (
            <button key={o.m} className="btn-slim" disabled={modeBusy || status?.wifiMode === o.m} onClick={() => changeMode(o.m)}>{o.n}{status?.wifiMode === o.m ? '*' : ''}</button>
          ))}
        </div>
        {modeError && <div className="text-error small mt-6">Mode Error: {modeError}</div>}
      </div>
      <div className="sec mt sec-wide">
        <h2 className="heading-mid">Scan Networks <button className="btn-slim" onClick={() => { startScan(); setTimeout(fetchResults, 1200); }} disabled={initiating || running}>{initiating ? 'Starting...' : (running ? 'Running...' : 'Start Scan')}</button></h2>
        {scanError && <div className="text-error">Scan Error: {scanError}</div>}
        <table className="table-mini">
          <thead>
            <tr>
              <th className="tcell">SSID</th>
              <th className="tcell">RSSI</th>
              <th className="tcell">Ch</th>
              <th className="tcell">Enc</th>
              <th className="tcell">BSSID</th>
              <th className="tcell">Action</th>
            </tr>
          </thead>
          <tbody>
            {results.map((n, i) => (
              <tr key={i}>
                <td className="tcell">{n.ssid || '<hidden>'}</td>
                <td className="tcell">{n.rssi} dBm</td>
                <td className="tcell">{n.channel}</td>
                <td className="tcell">{n.enc}</td>
                <td className="tcell">{n.bssid}</td>
                <td className="tcell"><button className="btn-slim" onClick={() => { setSsid(n.ssid); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Use</button></td>
              </tr>
            ))}
            {results.length === 0 && <tr><td className="tcell" colSpan={6}>No results yet</td></tr>}
          </tbody>
        </table>
        {running && <div className="small mt-6">Scan running... polling results</div>}
      </div>
      <div className="text-center xsmall center-muted mt-16">Device proxy via /api/device/* (set DEVICE_BASE_URL)</div>
    </Layout>
  );
}
