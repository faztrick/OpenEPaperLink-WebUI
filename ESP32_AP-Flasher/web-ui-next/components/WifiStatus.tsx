import type { WifiStatus } from '../hooks/useDeviceWifi';

interface WifiStatusProps {
  status: WifiStatus | null | undefined;
  loading?: boolean;
  stale?: boolean;
  modeNames?: Record<number, string>;
  showPolicy?: boolean; // show policy mapping badge
  transportPreferred?: string;
  transportEffective?: string;
  serialOpen?: boolean;
  lastEventInline?: boolean; // show last event at end of badges
  className?: string; // wrapper class override
}

const DEFAULT_MODE_NAMES: Record<number, string> = { 0: 'AUTO', 1: 'AP', 2: 'STA', 3: 'AP+STA' };

export function WifiStatus({ status, loading, stale, modeNames = DEFAULT_MODE_NAMES, showPolicy = true, transportPreferred, transportEffective, serialOpen, lastEventInline, className }: WifiStatusProps) {
  if (!status) return <div className={"xsmall muted" + (className ? ' ' + className : '')}>{loading ? 'Loading Wi‑Fi...' : 'No status'}</div>;
  return (
    <div className={(className ? className + ' ' : '') + 'flex gap flex-wrap small mt-2'}>
      {status.connected != null && <span className="badge">Connected: {String(status.connected)}</span>}
      {status.ssid && <span className="badge">SSID: {status.ssid}</span>}
      {status.ip && <span className="badge">IP: {status.ip}</span>}
      {status.rssi != null && <span className="badge">RSSI: {status.rssi}</span>}
      {status.channel != null && <span className="badge">Ch: {status.channel}</span>}
      {status.wifiMode != null && showPolicy && <span className="badge">Mode: {status.wifiMode} {modeNames[status.wifiMode] && '(' + modeNames[status.wifiMode] + ')'}</span>}
      {status.apMode && <span className="badge">AP Clients: {status.apClients}</span>}
      {status.txPowerDbm != null && <span className="badge">Tx: {status.txPowerDbm} dBm</span>}
      <span className="badge">Healthy: {String(status.healthy)}</span>
      {transportPreferred && <span className="badge">Pref: {transportPreferred}</span>}
      {transportEffective && <span className="badge">Eff: {transportEffective}</span>}
      {serialOpen && <span className="badge success">Serial</span>}
      {stale && <span className="badge warn" title="Last known; source timeout">STALE</span>}
      {lastEventInline && status.lastEvent && <span className="badge" title={String(status.lastEvent.ts)}>Evt: {status.lastEvent.name}</span>}
    </div>
  );
}
