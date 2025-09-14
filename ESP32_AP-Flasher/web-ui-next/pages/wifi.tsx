import { useEffect, useState } from 'react';
import { Layout } from '../components/Layout';
import { WifiConnectPanel } from '../components/WifiConnectPanel';
import { useDeviceWifiStatus } from '../hooks/useDeviceWifi';
import { transport, TransportStatus } from '../lib/transport';

const WIFI_MODE_NAMES: Record<number, string> = { 0: 'AUTO', 1: 'AP', 2: 'STA', 3: 'AP+STA' };

export default function WifiPage() {
  const { status, loading: statusLoading, error: statusError, reload: reloadStatus, needsDeviceSelection: needSelStatus } = useDeviceWifiStatus(5000);
  const [tStatus, setTStatus] = useState<TransportStatus>(() => transport().getStatus());

  // Subscribe to transport changes
  useEffect(() => {
    const t = transport();
    const unsub = t.subscribe(s => setTStatus(s));
    return () => unsub();
  }, []);

  // Legacy per-page Wi-Fi connect/scan/mode UI removed; using consolidated WifiConnectPanel.

  return (
    <Layout title="Wi‑Fi" description="Device Wi‑Fi status and controls">
      <h1 className="mt-0">Wi‑Fi Management</h1>
      <div className="sec mt sec-wide">
        <h2 className="heading-mid">Wi‑Fi</h2>
        <WifiConnectPanel selectedDeviceId={null /* device selection handled globally elsewhere */} />
        {needSelStatus && <div className="callout warn xsmall mt-4">Select a device on the Devices page to enable Wi‑Fi management.</div>}
        {statusError && !needSelStatus && <div className="text-error xsmall mt-4">Error: {statusError}</div>}
      </div>
      <div className="text-center xsmall center-muted mt-16">Wi‑Fi controls consolidated. Legacy per-page controls removed.</div>
    </Layout>
  );
}
