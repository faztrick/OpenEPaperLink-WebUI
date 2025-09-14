import React, { useState } from 'react';
import { useSerialWifiScan } from '../hooks/useSerialWifiScan';

export interface SerialWifiScannerPanelProps { onSelectSSID?: (ssid: string) => void }

const encMap: Record<number, string> = {
  0: 'OPEN',
  1: 'WEP',
  2: 'WPA-PSK',
  3: 'WPA2-PSK',
  4: 'WPA/WPA2',
  5: 'WPA2-E',
  6: 'WPA3',
  7: 'WPA2/WPA3',
};

export const SerialWifiScannerPanel: React.FC<SerialWifiScannerPanelProps> = ({ onSelectSSID }) => {
  const { networks, scanning, error, scan, lastCount, timedOut, elapsedMs, filters } = useSerialWifiScan();
  const [minRssi, setMinRssi] = useState<string>('');
  const [top, setTop] = useState<string>('');
  return (
    <div className="border rounded p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Serial WiFi Scan</h3>
        <div className="flex items-center gap-2">
          <input
            placeholder="Min RSSI"
            className="border rounded px-1 py-0.5 w-20 text-xs"
            value={minRssi}
            onChange={e => setMinRssi(e.target.value)}
          />
          <input
            placeholder="Top N"
            className="border rounded px-1 py-0.5 w-16 text-xs"
            value={top}
            onChange={e => setTop(e.target.value)}
          />
          <button disabled={scanning} onClick={() => {
            const opts: any = {};
            const mr = parseInt(minRssi, 10); if (!Number.isNaN(mr)) opts.minRssi = mr;
            const tp = parseInt(top, 10); if (!Number.isNaN(tp)) opts.top = tp;
            scan(Object.keys(opts).length ? opts : undefined);
          }} className="px-3 py-1 rounded bg-blue-600 text-white disabled:opacity-50">
            {scanning ? 'Scanning...' : 'Scan'}
          </button>
        </div>
      </div>
      {error && <div className="text-red-600 text-sm">Error: {error}</div>}
      {lastCount !== undefined && (
        <div className="text-xs text-gray-500 space-y-0.5">
          <div>Found {networks.length} network(s){timedOut && ' (timeout)'}{elapsedMs != null && ` in ${elapsedMs} ms`}.</div>
          {(filters.minRssi !== undefined || filters.top !== undefined) && (
            <div className="italic">Filters: {filters.minRssi !== undefined && `minRssi≥${filters.minRssi}`} {filters.top !== undefined && `top=${filters.top}`}</div>
          )}
        </div>
      )}
      <div className="max-h-64 overflow-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b"><th>SSID</th><th>RSSI</th><th>Ch</th><th>Enc</th><th>BSSID</th>{onSelectSSID && <th />}</tr>
          </thead>
          <tbody>
            {networks.map((n, i) => (
              <tr key={i} className="border-b hover:bg-gray-50">
                <td className="font-mono break-all">{n.ssid || '<hidden>'}</td>
                <td>{n.rssi}</td>
                <td>{n.channel}</td>
                <td>{typeof n.enc === 'number' ? (encMap[n.enc] || n.enc) : n.enc}</td>
                <td className="font-mono text-xs">{n.bssid}</td>
                {onSelectSSID && <td><button className="text-xs px-2 py-0.5 border rounded" onClick={() => n.ssid && onSelectSSID(n.ssid)}>Use</button></td>}
              </tr>
            ))}
            {!scanning && networks.length === 0 && <tr><td colSpan={onSelectSSID ? 6 : 5} className="text-center text-gray-400 py-4">No results yet</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-gray-500">Requires an open serial connection via /api/serial/open. Use the Serial panel to connect first.</p>
    </div>
  );
};

export default SerialWifiScannerPanel;
