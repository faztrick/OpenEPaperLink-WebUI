import { useState } from 'react';
import { useDevices } from '../context/DeviceContext';
import { useUI } from '../context/UIContext';
import { useApiStatus } from '../hooks/useApiStatus';
import { useSerialPorts } from '../hooks/useSerialPorts';
import { useWebSocketStatus } from '../hooks/useWebSocketStatus';

export function Header() {
  const { ok: apiOk } = useApiStatus();
  const { connected: wsOk } = useWebSocketStatus(typeof window !== 'undefined' ? (location.protocol === 'https:' ? 'wss' : 'ws') + '://' + location.host + '/ws' : undefined);
  const { ports } = useSerialPorts(); // still uses hook (will unify later)
  const { serialPorts } = useDevices();
  const [selectedPort, setSelectedPort] = useState('');
  const { openAIChat } = useUI();

  return (
    <header className="app-header" data-component-root="header">
      <div className="flex items-center gap">
        <i className="fas fa-microchip" aria-hidden />
        <h1 className="mt-0 mb-0" style={{ fontSize: '1.05rem' }}>ESP32 DevWebUi</h1>
      </div>
      <div className="flex items-center gap">
        <StatusDot label="API" ok={apiOk} />
        <StatusDot label="WS" ok={wsOk} />
        <div className="flex items-center gap-sm">
          <StatusDot label="Serial" ok={false} />
          <select value={selectedPort} onChange={e => setSelectedPort(e.target.value)} className="input-slim" aria-label="COM port">
            <option value="">Port</option>
            {(serialPorts.length ? serialPorts : ports).map(p => (
              <option key={p.path} value={p.path}>{p.path}{p.manufacturer ? ` (${p.manufacturer})` : ''}</option>
            ))}
          </select>
          <button onClick={openAIChat} className="btn-slim btn-outline">AI</button>
        </div>
      </div>
    </header>
  );
}

function StatusDot({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="flex items-center gap-sm" title={label}>
      <span className={`dot ${ok ? 'ok' : 'bad'}`} />
      <small className="muted">{label}</small>
    </div>
  );
}
