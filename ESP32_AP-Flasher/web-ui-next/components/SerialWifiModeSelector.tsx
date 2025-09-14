import React, { useCallback, useEffect, useState } from 'react';
import styles from './SerialWifiModeSelector.module.css';

interface WifiModeState {
  success?: boolean;
  mode?: number;
  modeName?: string;
  changed?: boolean;
  prior?: number;
  error?: string;
  message?: string;
  guidance?: string;
  proxied?: boolean;
  backendUsed?: 'sidecar' | 'serial';
  fallbackFrom?: string;
}

const MODE_LABELS: Record<number, string> = {
  0: 'Auto (STA then fallback AP)',
  1: 'AP only',
  2: 'STA only',
  3: 'AP + STA forced'
};

export const SerialWifiModeSelector: React.FC<{ onModeChanged?: (mode: number) => void; backend?: 'auto' | 'serial' | 'sidecar' }> = ({ onModeChanged, backend = 'auto' }) => {
  const [state, setState] = useState<WifiModeState>({});
  const [loading, setLoading] = useState(false);
  const [setting, setSetting] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const fetchMode = useCallback(async () => {
    setLoading(true); setError(undefined);
    try {
      const url = '/api/serial/wifi/mode' + (backend && backend !== 'auto' ? ('?backend=' + backend) : '');
      const r = await fetch(url);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Request failed');
      setState(j);
    } catch (e: any) { setError(e.message); } finally { setLoading(false); }
  }, [backend]);

  useEffect(() => { fetchMode(); }, [fetchMode]);

  const setMode = useCallback(async (mode: number) => {
    setSetting(true); setError(undefined);
    try {
      const url = '/api/serial/wifi/mode' + (backend && backend !== 'auto' ? ('?backend=' + backend) : '');
      const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Request failed');
      setState(j);
      if (onModeChanged) onModeChanged(mode);
    } catch (e: any) { setError(e.message); } finally { setSetting(false); }
  }, [onModeChanged, backend]);

  return (
    <div className={styles.card}>
      <div className={styles.headerRow}>
        <strong>Wi-Fi Operating Mode</strong>
        {state.backendUsed && <span className={styles.badge}>{state.backendUsed}</span>}
      </div>
      {loading ? <div>Loading current mode...</div> : (
        <div className={styles.modeList}>
          {Object.entries(MODE_LABELS).map(([k, label]) => {
            const num = Number(k);
            return (
              <label key={k} className={styles.modeItem + (setting ? ' ' + styles.disabled : '')}>
                <input type="radio" name="wifiMode" disabled={setting} checked={state.mode === num} onChange={() => setMode(num)} />
                <span>{label}</span>
              </label>
            );
          })}
        </div>
      )}
      {error && (
        <div className={styles.error}>
          Error: {error}{state.message && state.message !== error && (<><br />{state.message}</>)}
          {state.guidance && (<><br /><em>{state.guidance}</em></>)}
          {state.fallbackFrom && (<><br />Fell back from: {state.fallbackFrom}</>)}
        </div>
      )}
      {state.changed && <div className={styles.notice}>Mode updated (apply on next Wi-Fi restart / reboot)</div>}
      {!loading && state.mode !== undefined && !error && <div className={styles.current}>Current: {MODE_LABELS[state.mode] || state.mode} ({state.modeName})</div>}
      <div className={styles.actions}>
        <button onClick={fetchMode} disabled={loading || setting}>Refresh</button>
      </div>
    </div>
  );
};

export default SerialWifiModeSelector;
