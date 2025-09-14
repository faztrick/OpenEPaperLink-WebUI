import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useDeviceWifiStatus } from '../hooks/useDeviceWifi';
import { getDeviceMeta, subscribeDeviceMeta, upsertDeviceMeta } from '../lib/deviceMeta';
import { getSelectedDevice, subscribeSelectedDevice } from '../lib/deviceSelection';
import { useSerialConfig } from '../lib/serialConfig';
import { transport } from '../lib/transport';
import ConnectionStatusBadge from './ConnectionStatusBadge';

interface BuildInfo { env: string; lastBuild: string; firmwareSize: string; target: string; }

export function Sidebar() {
  const [info, setInfo] = useState<BuildInfo>({ env: 'OutdoorAP', lastBuild: 'Never', firmwareSize: '-', target: 'ESP32-S3 DevKit C-1' });
  const [advanced, setAdvanced] = useState<string[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(() => getSelectedDevice()?.id || null);
  const [metaRev, setMetaRev] = useState(0);
  const selMeta = selectedId ? getDeviceMeta(selectedId) : null;
  const wifiEnabled = !!selectedId;
  const { status } = useDeviceWifiStatus(wifiEnabled ? 10000 : 0);
  const [tStatus, setTStatus] = useState(() => transport().getStatus());
  const { port: serialPort, backend: serialBackend } = useSerialConfig();

  useEffect(() => { /* TODO build info endpoint */ }, []);
  useEffect(() => { setAdvanced(['System', 'Diagnostics', 'Logs']); }, []);
  useEffect(() => {
    const unsubSel = subscribeSelectedDevice(d => setSelectedId(d?.id || null));
    const unsubMeta = subscribeDeviceMeta(() => setMetaRev(r => r + 1));
    const t = transport();
    const unsubT = t.subscribe(s => setTStatus(s));
    return () => { unsubSel(); unsubMeta(); unsubT(); };
  }, []);

  // When a device is selected, if it has a stored preferredTransport, apply it to transport layer.
  useEffect(() => {
    if (!selectedId) return;
    const meta = getDeviceMeta(selectedId);
    if (meta?.preferredTransport) {
      const t = transport();
      if (t.getStatus().preferred !== meta.preferredTransport) {
        t.setPreferred(meta.preferredTransport);
      }
    }
  }, [selectedId, metaRev]);

  // auto annotate connection type when effective transport changes
  useEffect(() => {
    if (!selectedId) return;
    const current = getDeviceMeta(selectedId);
    if (!current || current.connectionType !== tStatus.effective) {
      upsertDeviceMeta(selectedId, { connectionType: tStatus.effective });
    }
  }, [selectedId, tStatus.effective]);
  // NOTE: preferredTransport is handled separately (device page UI) and applied on selection above.

  // ensure basic modules placeholder
  useEffect(() => {
    if (!selectedId) return;
    const current = getDeviceMeta(selectedId);
    if (!current || !current.modules.length) {
      upsertDeviceMeta(selectedId, { modules: ['wifi', 'tags', 'ap', 'led'] });
    }
  }, [selectedId]);

  return (
    <aside className="sidebar" data-component-root="sidebar">
      <div className="sidebar-inner">
        <section className="project-info">
          <h3 className="mt-0 mb-1 small"><i className="fas fa-project-diagram" /> Project</h3>
          <InfoRow label="Target" value={info.target} />
          <InfoRow label="Env" value={info.env} />
          <InfoRow label="Last" value={info.lastBuild} />
          <InfoRow label="Size" value={info.firmwareSize} />
        </section>
        {selectedId && (
          <section className="sidebar-block">
            <h4 className="mt-0 mb-1 xsmall heading-tiny"><i className="fas fa-microchip" /> Device</h4>
            <div className="xsmall line-tight">
              <div><strong>{selMeta?.id || selectedId}</strong></div>
              {selMeta?.connectionType && (
                <div className="muted flex items-center gap-1">
                  Conn: {selMeta.connectionType}
                  <ConnectionStatusBadge status={tStatus} minimal showWhenEqual={false} />
                </div>
              )}
              {status?.ip && <div>IP: {status.ip}</div>}
              {serialPort && <div className="muted">COM: {serialPort}</div>}
              {serialBackend && <div className="muted">SerialMode: {serialBackend}</div>}
              {status?.ssid && <div>SSID: {status.ssid}</div>}
              {status?.rssi != null && <div>RSSI: {status.rssi} dBm</div>}
              {status?.wifiMode != null && <div>Mode: {status.wifiMode}</div>}
              <div>Healthy: {status?.healthy === false ? 'No' : 'Yes'}</div>
              <div className="mt-1">Mods: {selMeta?.modules?.length ? selMeta.modules.join(',') : '—'}</div>
              {selMeta?.categories?.length && <div>Cats: {selMeta.categories.join(',')}</div>}
            </div>
            <div className="mt-1">
              <Link href="/device" className="btn-slim inline-flex">Open Details</Link>
            </div>
          </section>
        )}
        <section className="sidebar-block">
          <h4><i className="fas fa-folder-open" /> Advanced</h4>
          {advanced.length ? <ul className="list-reset xsmall pl-1">{advanced.map(a => <li key={a}>{a}</li>)}</ul> : <div className="muted xsmall">Loading...</div>}
        </section>
        <section className="sidebar-block">
          <h4><i className="fas fa-wrench" /> Settings</h4>
          <p className="mt-0 xsmall muted">Move configuration & remote server options to dedicated settings page.</p>
          <div><button className="btn-slim btn-primary xsmall">Open Settings</button></div>
        </section>
      </div>
    </aside>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between small py-1">
      <span className="muted">{label}:</span>
      <span>{value}</span>
    </div>
  );
}
