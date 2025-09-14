import { useEffect, useState } from 'react';
import { getSelectedDevice, setSelectedDevice, subscribeSelectedDevice } from '../lib/deviceSelection';

export function SelectedDeviceBar() {
  const [dev, setDev] = useState(() => getSelectedDevice());

  useEffect(() => {
    const unsub = subscribeSelectedDevice(d => setDev(d));
    return () => { unsub(); };
  }, []);

  if (!dev) return null;

  return (
    <div className="selected-device-bar">
      <span className="small">Device: <strong>{dev.name || dev.id}</strong> <span className="muted">({dev.baseUrl})</span></span>
      <button className="btn-slim ml-4" onClick={() => setSelectedDevice(null)}>Clear</button>
    </div>
  );
}
