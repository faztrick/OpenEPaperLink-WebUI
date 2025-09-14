import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { ConnectionSwitcher } from '../components/ConnectionSwitcher';
import { Layout } from '../components/Layout';
import { Seo } from '../components/Seo';
import { WifiStatus as WifiStatusBlock } from '../components/WifiStatus';
import { connectWifi, disconnectWifi, setWifiMode, useDeviceWifiScan, useDeviceWifiStatus } from '../hooks/useDeviceWifi';
import { useSerialPorts } from '../hooks/useSerialPorts';
import { useSerialWifiScan } from '../hooks/useSerialWifiScan';
import type { DeviceSummary } from '../lib/api-types';
import { getDeviceOverride } from '../lib/deviceOverrides';
import { getSelectedDevice, setSelectedDevice } from '../lib/deviceSelection';
import { fetcher } from '../lib/fetcher';
import { useSerialConfig } from '../lib/serialConfig';
import { transport } from '../lib/transport';

const WIFI_MODE_NAMES: Record<number, string> = { 0: 'AUTO', 1: 'AP', 2: 'STA', 3: 'AP+STA' };

export default function Dashboard() {
  const { data: devices, error, isLoading } = useSWR<DeviceSummary[]>('/api/devices', fetcher);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<'info' | 'wifi' | 'tags' | 'ap'>('info');

  // sync initial selection
  useEffect(() => {
    const cur = getSelectedDevice();
    if (cur) setSelectedId(cur.id);
  }, []);

  function chooseDevice(d: DeviceSummary) {
    const ov = getDeviceOverride(d.id);
    const derived = (d as any).ip ? `http://${(d as any).ip}` : (d as any).baseUrl || '';
    const baseUrl = ov?.baseUrl?.trim() || derived;
    if (!baseUrl) { alert('Device has no reachable base URL'); return; }
    setSelectedDevice({ id: d.id, name: ov?.alias || d.name, baseUrl });
    setSelectedId(d.id);
  }

  // Wi-Fi integration (device + serial) when wifi tab active
  const wifiEnabled = !!selectedId && tab === 'wifi';
  const { status, loading: statusLoading, error: statusError, reload: reloadStatus, needsDeviceSelection: needSelStatus, stale: statusStale } = useDeviceWifiStatus(wifiEnabled ? 5000 : 0);
  const { startScan, initiating, results, running, error: scanError, fetchResults, needsDeviceSelection: needSelScan } = useDeviceWifiScan(wifiEnabled ? 2000 : 0);
  // Serial / Sidecar Wi‑Fi scan hook & config
  const { start: startSerialScan, networks: serialNetworks, scanning: serialScanning, error: serialScanError, backendUsed: serialBackendUsed, backendDecision: serialBackendDecision, elapsedMs: serialElapsed } = useSerialWifiScan();
  const { backend: serialBackendPref, setBackend: setSerialBackendPref, port: serialPort, setPort: setSerialPort } = useSerialConfig();
  const { ports: serialPorts, loading: serialPortsLoading } = useSerialPorts(12000);
  // Determine which backend powers the scan portion (parity with dedicated wifi page): auto -> device, serial/sidecar -> serial
  const usingSerialLike = serialBackendPref === 'serial' || serialBackendPref === 'sidecar';
  const activeNetworks = usingSerialLike ? serialNetworks : results;
  const activeRunning = usingSerialLike ? serialScanning : running;
  const activeInitiating = usingSerialLike ? serialScanning && !activeNetworks.length : initiating;
  const activeError = usingSerialLike ? serialScanError : scanError;
  const [ssid, setSsid] = useState('');
  const [password, setPassword] = useState('');
  const [connectBusy, setConnectBusy] = useState(false);
  const [connectMsg, setConnectMsg] = useState<string | null>(null);
  const [modeBusy, setModeBusy] = useState(false);
  const [modeError, setModeError] = useState<string | null>(null);
  const [tStatus, setTStatus] = useState(() => transport().getStatus());

  useEffect(() => {
    const t = transport();
    const unsub = t.subscribe(s => setTStatus(s));
    return () => unsub();
  }, []);

  const disabledTabs = !selectedId;

  const filteredDevices = useMemo(() => devices || [], [devices]);

  async function doConnect() {
    if (!ssid) return;
    setConnectBusy(true); setConnectMsg(null);
    try { const r = await connectWifi(ssid, password); setConnectMsg(r.message || 'Connected/initiated'); setPassword(''); setTimeout(reloadStatus, 1200); }
    catch (e: any) { setConnectMsg('Error: ' + e.message); }
    finally { setConnectBusy(false); }
  }
  async function doDisconnect() {
    setConnectBusy(true); setConnectMsg(null);
    try { const r = await disconnectWifi(); setConnectMsg(r.message || 'Disconnected'); setTimeout(reloadStatus, 800); }
    catch (e: any) { setConnectMsg('Error: ' + e.message); }
    finally { setConnectBusy(false); }
  }
  async function changeMode(m: number) {
    setModeBusy(true); setModeError(null);
    try { await setWifiMode(m); setTimeout(reloadStatus, 1000); }
    catch (e: any) { setModeError(e.message); }
    finally { setModeBusy(false); }
  }

  return (
    <Layout title="Dashboard" description="Unified device dashboard">
      <Seo title="Dashboard" description="Unified device dashboard" />
      <div className="flex gap flex-wrap mt-2">
        <div className="minw-300 card">
          <h2 className="mt-0 heading-mid">Devices</h2>
          {isLoading && <p className="small muted">Loading...</p>}
          {error && <p className="text-error small">Failed: {(error as Error).message}</p>}
          <table className="table-mini mt-2">
            <thead><tr><th>ID</th><th>Name</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {filteredDevices.map(d => {
                const isSel = d.id === selectedId;
                return (
                  <tr key={d.id} className={isSel ? 'row-border-top active-row' : 'row-border-top'}>
                    <td>{d.id}</td>
                    <td>{(getDeviceOverride(d.id)?.alias) || d.name}</td>
                    <td>{(d as any).status ?? '-'}</td>
                    <td><button className="btn-slim" disabled={isSel} onClick={() => chooseDevice(d)}>{isSel ? 'Selected' : 'Select'}</button></td>
                  </tr>
                );
              })}
              {!isLoading && filteredDevices.length === 0 && <tr><td colSpan={4}>No devices</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="flex-1 minw-480 card">
          <h2 className="mt-0 heading-mid flex gap-2 items-center">Details <span className="flex-1" /> <span className="xsmall"><ConnectionSwitcher /></span></h2>
          <div className="tab-bar flex gap mt-2 flex-wrap">
            <button className="btn-slim" disabled={false} onClick={() => setTab('info')}>Info{tab === 'info' ? '*' : ''}</button>
            <button className="btn-slim" disabled={disabledTabs} onClick={() => setTab('wifi')}>Wi‑Fi{tab === 'wifi' ? '*' : ''}</button>
            <button className="btn-slim" disabled={disabledTabs} onClick={() => setTab('tags')}>Tags{tab === 'tags' ? '*' : ''}</button>
            <button className="btn-slim" disabled={disabledTabs} onClick={() => setTab('ap')}>AP List{tab === 'ap' ? '*' : ''}</button>
          </div>
          {!selectedId && <div className="callout warn small mt-4">Select a device to enable tabs.</div>}
          {tab === 'info' && selectedId && (
            <div className="mt-4 small">Device <strong>{selectedId}</strong> selected. (Additional info panel TBD)</div>
          )}
          {tab === 'wifi' && (
            <div className="mt-4">
              <h3 className="heading-mid">Status {statusLoading && <small>(loading)</small>} {statusStale && !statusLoading && <span className="badge warn" title="Showing last known data; device timed out.">STALE</span>} <button className="btn-slim" onClick={() => reloadStatus()} disabled={needSelStatus}>Refresh</button></h3>
              {/* Only show selection prompt if no device actually selected. */}
              {!selectedId && needSelStatus && <div className="callout warn small mt-4">Select a device first.</div>}
              {selectedId && needSelStatus && statusLoading && <div className="small mt-4 muted">Loading status…</div>}
              {statusError && (!needSelStatus || !!selectedId) && <div className="text-error small">Error: {statusError}</div>}
              {(!needSelStatus || !!selectedId) && (
                <div className="mt-4">
                  <WifiStatusBlock
                    status={status}
                    loading={statusLoading}
                    stale={statusStale}
                    modeNames={WIFI_MODE_NAMES}
                    transportPreferred={tStatus.preferred}
                    transportEffective={tStatus.effective}
                    serialOpen={tStatus.serialOpen}
                    showPolicy
                    lastEventInline
                  />
                  <div className="xsmall mt-6 muted">0=AUTO 1=AP 2=STA 3=AP+STA</div>
                </div>
              )}
              <div className="mt-5">
                <h4 className="heading-tiny">Connect / Disconnect</h4>
                <div className="mt-2">
                  <input className="input-slim" placeholder="SSID" value={ssid} onChange={e => setSsid(e.target.value)} />{' '}
                  <input className="input-slim" type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} />{' '}
                  <button className="btn-slim" disabled={!ssid || connectBusy} onClick={doConnect}>{connectBusy ? '...' : 'Connect'}</button>{' '}
                  <button className="btn-slim" disabled={connectBusy} onClick={doDisconnect}>Disconnect</button>
                </div>
                {connectMsg && <div className="small mt-4">{connectMsg}</div>}
              </div>
              <div className="mt-5">
                <h4 className="heading-tiny">Mode Policy</h4>
                <div className="flex gap flex-wrap mt-2">
                  {[{ m: 0, n: 'AUTO' }, { m: 1, n: 'AP' }, { m: 2, n: 'STA' }, { m: 3, n: 'AP+STA' }].map(o => (
                    <button key={o.m} className="btn-slim" disabled={modeBusy || status?.wifiMode === o.m} onClick={() => changeMode(o.m)}>{o.n}{status?.wifiMode === o.m ? '*' : ''}</button>
                  ))}
                </div>
                {modeError && <div className="text-error xsmall mt-4">Mode Error: {modeError}</div>}
              </div>
              <div className="mt-5">
                <h4 className="heading-tiny">Scan Networks <button className="btn-slim" onClick={() => {
                  if (usingSerialLike) {
                    if (!serialScanning) startSerialScan({ backend: serialBackendPref });
                  } else {
                    if (!initiating && !running) { startScan(); setTimeout(fetchResults, 1200); }
                  }
                }} disabled={usingSerialLike ? serialScanning : (initiating || running) || (needSelScan && !usingSerialLike)}>{activeInitiating ? 'Starting...' : (activeRunning ? (usingSerialLike ? 'Scanning (serial)...' : 'Running...') : 'Start Scan')}</button></h4>
                <div className="xsmall mt-2 flex gap-1 flex-wrap">
                  <span className="badge">Mode: {usingSerialLike ? (serialBackendPref === 'sidecar' ? 'Serial Sidecar' : 'Serial Direct') : 'Device (HTTP)'}</span>
                  <span className="badge">Backend Pref: {serialBackendPref}</span>
                  {usingSerialLike && serialBackendUsed && <span className="badge">Backend Used: {serialBackendUsed}{serialBackendPref !== serialBackendUsed ? ' (fallback)' : ''}</span>}
                  {usingSerialLike && serialElapsed != null && <span className="badge">Elapsed: {serialElapsed}ms</span>}
                  <div className="flex gap-1 flex-wrap">
                    {usingSerialLike && (
                      <div className="flex gap-1 mt-1 flex-wrap">
                        <span className="badge">Port: {serialPort || '(auto)'}</span>
                        <select className="input-slim" value={serialPort || ''} onChange={e => setSerialPort(e.target.value || null)}>
                          <option value="">(auto)</option>
                          {serialPorts.map(p => <option key={p.path} value={p.path}>{p.path}{p.manufacturer ? ' - ' + p.manufacturer : ''}</option>)}
                        </select>
                        {serialPortsLoading && <span className="xsmall muted">scanning ports...</span>}
                        {!serialPortsLoading && serialPorts.length === 0 && <span className="xsmall muted">no ports</span>}
                      </div>
                    )}
                    {(['auto', 'serial', 'sidecar'] as const).map(b => (
                      <button key={b} className={`btn-slim ${serialBackendPref === b ? 'btn-primary' : ''}`} disabled={serialBackendPref === b} onClick={() => setSerialBackendPref(b)}>{b}</button>
                    ))}
                  </div>
                </div>
                {!usingSerialLike && needSelScan && !selectedId && <div className="callout warn xsmall mt-3">Select a device first to perform scans.</div>}
                {!usingSerialLike && needSelScan && selectedId && <div className="xsmall mt-3 muted">Preparing scan interface…</div>}
                {activeError && !(needSelScan && !usingSerialLike) && <div className="text-error xsmall">Scan Error: {activeError}</div>}
                {usingSerialLike && serialBackendDecision && <div className="xsmall mt-2">Decision: chosen={serialBackendDecision?.chosen} envSidecar={String(serialBackendDecision?.haveSidecarEnv)} param={serialBackendDecision?.backendParam}</div>}
                <table className="table-mini mt-2">
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
                    {(!needSelScan || usingSerialLike) && activeNetworks.map((n, i) => (
                      <tr key={i}>
                        <td className="tcell">{n.ssid || '<hidden>'}</td>
                        <td className="tcell">{n.rssi} dBm</td>
                        <td className="tcell">{n.channel}</td>
                        <td className="tcell">{n.enc}</td>
                        <td className="tcell">{n.bssid}</td>
                        <td className="tcell"><button className="btn-slim" onClick={() => { setSsid(n.ssid); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Use</button></td>
                      </tr>
                    ))}
                    {(!needSelScan || usingSerialLike) && activeNetworks.length === 0 && <tr><td className="tcell" colSpan={6}>No results yet</td></tr>}
                    {!usingSerialLike && needSelScan && <tr><td className="tcell" colSpan={6}>Device selection required</td></tr>}
                  </tbody>
                </table>
                {!usingSerialLike && running && !needSelScan && <div className="xsmall mt-3">Device scan running...</div>}
                {usingSerialLike && serialScanning && <div className="xsmall mt-3">Serial scan in progress...</div>}
              </div>
            </div>
          )}
          {tab === 'tags' && selectedId && <div className="mt-4 small">Tags view placeholder for device {selectedId}</div>}
          {tab === 'ap' && selectedId && <div className="mt-4 small">AP List placeholder for device {selectedId}</div>}
        </div>
      </div>
    </Layout>
  );
}
