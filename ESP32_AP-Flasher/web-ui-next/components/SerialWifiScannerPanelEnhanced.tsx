import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSerialWifiScan } from '../hooks/useSerialWifiScan';
import styles from './SerialWifiScannerPanelEnhanced.module.css';

interface Props { onSelectSSID?: (ssid: string) => void; backend?: 'auto' | 'serial' | 'sidecar' }

const encMap: Record<number, string> = { 0: 'OPEN', 1: 'WEP', 2: 'WPA-PSK', 3: 'WPA2-PSK', 4: 'WPA/WPA2', 5: 'WPA2-E', 6: 'WPA3', 7: 'WPA2/WPA3' };

function classifyBars(rssi?: number) {
  if (rssi == null) return 0; if (rssi >= -50) return 4; if (rssi >= -65) return 3; if (rssi >= -75) return 2; if (rssi >= -85) return 1; return 0;
}

const Bars: React.FC<{ rssi?: number }> = ({ rssi }) => {
  const bars = classifyBars(rssi);
  return <div className={styles.bars} title={rssi != null ? rssi + " dBm" : ""}>{[1, 2, 3, 4].map(i => <span key={i} className={styles.bar + ' ' + (bars >= i ? styles.on : '')} />)}</div>;
};

export const SerialWifiScannerPanelEnhanced: React.FC<Props> = ({ onSelectSSID, backend }) => {
  const { networks, scanning, error, scan, lastCount, originalCount, timedOut, elapsedMs, proxied, appliedFilters, port, openedTemporarily, backendUsed } = useSerialWifiScan({ backend });
  const [connectSSID, setConnectSSID] = useState('');
  const [password, setPassword] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [connectResult, setConnectResult] = useState<any>(null);
  const [status, setStatus] = useState<any>(null);
  const [fetchingStatus, setFetchingStatus] = useState(false);
  const [minRssi, setMinRssi] = useState<number | undefined>();
  const [top, setTop] = useState<number | undefined>();
  const [auto, setAuto] = useState(false);
  const [intervalMs, setIntervalMs] = useState(10000);
  const [lastScanAt, setLastScanAt] = useState<Date | undefined>();
  const countdownRef = useRef<number>(0);
  const [countdown, setCountdown] = useState<number>(0);
  const timerRef = useRef<any>(null);

  const doScan = useCallback(async () => {
    const opts: any = {};
    if (minRssi !== undefined) opts.minRssi = minRssi;
    if (top !== undefined) opts.top = top;
    await scan(Object.keys(opts).length ? opts : undefined);
    setLastScanAt(new Date());
    // fetch proxied flag via last fetch result by re-calling lightweight head? We piggyback by reading window.fetch override not present; simplest: after scan, call log tail no; for now ignore until hook extended
  }, [minRssi, top, scan]);

  // Auto refresh logic
  useEffect(() => {
    if (!auto) { setCountdown(0); if (timerRef.current) clearTimeout(timerRef.current); return; }
    countdownRef.current = Math.floor(intervalMs / 1000);
    setCountdown(countdownRef.current);
    const tick = () => {
      countdownRef.current -= 1;
      if (countdownRef.current <= 0) {
        doScan();
        countdownRef.current = Math.floor(intervalMs / 1000);
      }
      setCountdown(countdownRef.current);
      timerRef.current = setTimeout(tick, 1000);
    };
    timerRef.current = setTimeout(tick, 1000);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [auto, intervalMs, doScan]);

  const metrics = useMemo(() => {
    if (!networks.length) return { avg: undefined as number | undefined, strongest: undefined as number | undefined };
    let sum = 0; let cnt = 0; let strongest = -999;
    for (const n of networks) { if (typeof n.rssi === 'number') { sum += n.rssi; cnt++; if (n.rssi > strongest) strongest = n.rssi; } }
    return { avg: cnt ? Math.round(sum / cnt) : undefined, strongest: strongest > -999 ? strongest : undefined };
  }, [networks]);

  const loadStatus = useCallback(async () => {
    setFetchingStatus(true);
    try {
      const url = '/api/serial/wifi/status' + (backend && backend !== 'auto' ? ('?backend=' + backend) : '');
      const r = await fetch(url);
      const j = await r.json();
      if (r.ok) setStatus(j); else setStatus({ error: j.error || 'status_failed' });
    } catch (e: any) { setStatus({ error: e.message }); } finally { setFetchingStatus(false); }
  }, [backend]);

  useEffect(() => { if (status == null) loadStatus(); }, [status, loadStatus]);

  const doConnect = useCallback(async () => {
    if (!connectSSID) return;
    setConnecting(true); setConnectResult(null);
    try {
      const url = '/api/serial/wifi/connect' + (backend && backend !== 'auto' ? ('?backend=' + backend) : '');
      const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ssid: connectSSID, password }) });
      const j = await r.json();
      setConnectResult(j);
      if (r.ok && j.success) setTimeout(() => loadStatus(), 1200);
    } catch (e: any) { setConnectResult({ error: e.message }); } finally { setConnecting(false); }
  }, [connectSSID, password, backend, loadStatus]);

  const summaryChips = (
    <div className={styles.chips}>
      <span className={styles.chip}>Filtered: {lastCount ?? 0}</span>
      {originalCount != null && originalCount !== lastCount && <span className={styles.chip}>Original: {originalCount}</span>}
      <span className={styles.chip}>Showing: {networks.length}</span>
      {appliedFilters && (appliedFilters.minRssi != null || appliedFilters.top != null) && (
        <span className={styles.chip}>Filters: {(appliedFilters.minRssi != null ? `r≥${appliedFilters.minRssi}` : '') + (appliedFilters.top != null ? (appliedFilters.minRssi != null ? ', ' : '') + `top ${appliedFilters.top}` : '')}</span>
      )}
      {port && <span className={styles.chip}>Port: {port}{openedTemporarily ? '*' : ''}</span>}
      {elapsedMs != null && <span className={styles.chip}>Elapsed: {elapsedMs} ms</span>}
      {backend && <span className={styles.chip}>Pref: {backend}</span>}
      {backendUsed && backendUsed !== backend && <span className={styles.chip}>Used: {backendUsed}</span>}
      {lastScanAt && <span className={styles.chip}>Last: {lastScanAt.toLocaleTimeString()}</span>}
      {metrics.avg != null && <span className={styles.chip}>Avg RSSI: {metrics.avg} dBm</span>}
      {metrics.strongest != null && <span className={styles.chip}>Strongest: {metrics.strongest} dBm</span>}
      {status && !status.error && status.connected && <span className={styles.chip}>Connected: {status.ssid}</span>}
      {timedOut && <span className={styles.chipWarn}>Timeout</span>}
    </div>
  );

  const neverScanned = !lastScanAt && networks.length === 0 && !scanning && !error;
  const filteredOut = lastScanAt && (originalCount != null) && originalCount > 0 && networks.length === 0 && !scanning && !timedOut && (appliedFilters?.minRssi != null || appliedFilters?.top != null);

  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <div className={styles.titleRow}>
          <strong>Serial Wi‑Fi Scan</strong>
          {proxied !== undefined && <span className={proxied ? styles.badgeSidecar : styles.badgeDirect}>{proxied ? 'sidecar' : 'direct'}</span>}
        </div>
        <div className={styles.actions}>
          <label className={styles.inline}><input type="checkbox" checked={auto} onChange={e => setAuto(e.target.checked)} /> Auto</label>
          {auto && <select aria-label="Auto refresh interval" value={intervalMs} onChange={e => setIntervalMs(Number(e.target.value))} className={styles.select}>
            <option value={5000}>5s</option>
            <option value={10000}>10s</option>
            <option value={30000}>30s</option>
          </select>}
          {auto && <span className={styles.countdown}>{countdown}s</span>}
          <button onClick={() => doScan()} disabled={scanning} className={styles.button}>{scanning ? 'Scanning…' : 'Scan'}</button>
        </div>
      </div>
      <div className={styles.filters}>
        <div>
          <label className={styles.filterLabel}>Min RSSI</label>
          <input type="number" className={styles.input} value={minRssi ?? ''} placeholder="e.g. -80" onChange={e => setMinRssi(e.target.value === '' ? undefined : Number(e.target.value))} />
        </div>
        <div>
          <label className={styles.filterLabel}>Top N</label>
          <input type="number" className={styles.input} value={top ?? ''} placeholder="e.g. 10" onChange={e => setTop(e.target.value === '' ? undefined : Number(e.target.value))} />
        </div>
        <div className={styles.filterButtons}>
          <button className={styles.buttonSecondary} onClick={() => { setMinRssi(undefined); setTop(undefined); }}>Clear Filters</button>
        </div>
      </div>
      {summaryChips}
      {error && <div className={styles.error}>Error: {error}</div>}
      {status && status.error && <div className={styles.error}>Status Error: {status.error}</div>}
      {!error && neverScanned && <div className={styles.empty}>No networks yet. Click Scan to start a serial scan.</div>}
      {!error && filteredOut && <div className={styles.empty}>All {originalCount} networks filtered out. Adjust filters.</div>}
      {!error && timedOut && networks.length === 0 && !scanning && <div className={styles.empty}>Scan timed out and returned no results.</div>}
      {!error && !scanning && networks.length === 0 && !neverScanned && !filteredOut && !timedOut && <div className={styles.empty}>No networks discovered.</div>}
      {scanning && <div className={styles.progressOuter}><div className={styles.progressBar} /></div>}
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr><th>SSID</th><th>Signal</th><th>Ch</th><th>Enc</th><th>BSSID</th><th>Action</th></tr>
          </thead>
          <tbody>
            {networks.map((n, i) => {
              const isSelected = n.ssid && n.ssid === connectSSID;
              return (
                <tr key={i}>
                  <td className={styles.ssid}>{n.ssid || '<hidden>'}</td>
                  <td><div className={styles.signalCell}><Bars rssi={n.rssi} /><span className={styles.rssi}>{n.rssi != null ? n.rssi + ' dBm' : ''}</span></div></td>
                  <td>{n.channel}</td>
                  <td>{typeof n.enc === 'number' ? (encMap[n.enc] || n.enc) : n.enc}</td>
                  <td className={styles.bssid}>{n.bssid}</td>
                  <td>{n.ssid && <button className={styles.buttonTiny + (isSelected ? ' ' + styles.buttonTinyActive : '')} onClick={() => { setConnectSSID(n.ssid!); setPassword(''); }}>{isSelected ? 'Selected' : 'Select'}</button>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className={styles.connectBox}>
        <div className={styles.connectRow}>
          <label className={styles.filterLabel}>SSID</label>
          <input className={styles.input} value={connectSSID} onChange={e => setConnectSSID(e.target.value)} placeholder="Select or enter SSID" />
        </div>
        <div className={styles.connectRow}>
          <label className={styles.filterLabel}>Password</label>
          <input className={styles.input} type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="(leave blank for open)" />
        </div>
        <div className={styles.connectActions}>
          <button className={styles.button} disabled={!connectSSID || connecting} onClick={doConnect}>{connecting ? 'Connecting…' : 'Connect'}</button>
          <button className={styles.buttonSecondary} onClick={() => loadStatus()} disabled={fetchingStatus}>{fetchingStatus ? 'Refreshing…' : 'Refresh Status'}</button>
        </div>
        {connectResult && connectResult.error && <div className={styles.error}>Connect Error: {connectResult.error}</div>}
        {connectResult && connectResult.event === 'wificonnect' && connectResult.success && <div className={styles.notice}>Connected: {connectResult.ssid} IP {connectResult.ip}</div>}
        {status && !status.error && <div className={styles.statusLine}>Status: {status.connected ? `Connected to ${status.ssid} (IP ${status.ip})` : 'Not connected'} Mode {status.mode}</div>}
      </div>
    </div>
  );
};

export default SerialWifiScannerPanelEnhanced;
