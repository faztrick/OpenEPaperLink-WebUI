import { useEffect, useState } from 'react';
import { Layout } from '../components/Layout';
import { setWifiMode } from '../hooks/useDeviceWifi';
import { useFsInfo } from '../hooks/useFsInfo';
import { useStartupModules } from '../hooks/useStartupModules';
import { showToast } from '../hooks/useToast';
import { useWifiAp } from '../hooks/useWifiAp';
import { apiPostNoBody } from '../lib/apiClient';
import { getLogConfig, sendTestLog, setLogConfig } from '../lib/apiLogs';

export default function SettingsPage() {
  const [ip, setIp] = useState('');
  const [port, setPort] = useState(0);
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Startup modules
  const startup = useStartupModules();

  // Filesystem info
  const fs = useFsInfo();

  // Wi-Fi AP state
  const ap = useWifiAp();

  const [apSsid, setApSsid] = useState('');
  const [apChannel, setApChannel] = useState<number>(1);
  const [apHidden, setApHidden] = useState(false);
  const [apMaxClients, setApMaxClients] = useState(4);
  const [modeChanging, setModeChanging] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try { const cfg = await getLogConfig(); setIp(cfg.ip || ''); setPort(cfg.port || 0); setEnabled(!!cfg.enabled); }
      catch (e: any) { showToast('Failed to load log config: ' + e.message, 'error'); }
      finally { setLoading(false); }
    })();
  }, []);

  const save = async () => {
    setSaving(true);
    try { await setLogConfig({ ip, port, enabled }); showToast('Saved log config', 'success'); }
    catch (e: any) { showToast('Save failed: ' + e.message, 'error'); }
    finally { setSaving(false); }
  };

  return (
    <Layout title="Settings" description="Device settings">
      <h2>Settings</h2>
      <section className="sec sec-narrow">
        <h3 className="heading-gap">Log Streaming (UDP Mirror)</h3>
        <p className="muted">Configure device to mirror logs over UDP to a collector.</p>
        {loading ? (
          <div className="center-muted">Loading…</div>
        ) : (
          <div className="grid-gap">
            <label className="small">Enabled <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} /></label>
            <label className="small">Target IP <input value={ip} onChange={e => setIp(e.target.value)} placeholder='e.g. 192.168.1.50' className="ml-6" /></label>
            <label className="small">Port <input type="number" value={port} onChange={e => setPort(Math.max(0, Number(e.target.value)))} className="w-100" /></label>
            <div className="flex gap">
              <button className="btn btn-small" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
              <button className="btn btn-small" onClick={async () => { const ok = await sendTestLog('Test via Settings'); if (ok) showToast('Test sent', 'success'); else showToast('Test failed', 'error'); }}>Send Test Log</button>
            </div>
          </div>
        )}
      </section>

      {/* Startup Modules */}
      <section className="sec mt sec-wide">
        <h3 className="heading-gap">Startup Modules</h3>
        <p className="muted">Enable or disable optional modules on next boot. Persisted in startup_modules.json.</p>
        {startup.loading && <div className="center-muted">Loading…</div>}
        {startup.error && <div className="small text-error">Error: {startup.error}</div>}
        {startup.data && (
          <div className="flex flex-wrap gap-lg">
            {Object.entries(startup.data.modules).map(([name, val]) => (
              <label key={name} className="module-pill">
                <input type="checkbox" checked={val} onChange={e => startup.updateModule(name, e.target.checked)} className="pill-check" />{name}
              </label>
            ))}
          </div>
        )}
        <div className="flex gap mt-sm">
          <button className="btn btn-small" disabled={startup.saving} onClick={async () => { try { await startup.save(); showToast('Startup modules saved', 'success'); } catch { } }}>{startup.saving ? 'Saving…' : 'Save'}</button>
          <button className="btn btn-small" onClick={() => startup.reload()}>Reload</button>
        </div>
      </section>

      {/* Filesystem Diagnostics */}
      <section className="sec mt sec-wide">
        <h3 className="heading-gap">Filesystem</h3>
        <p className="muted">Active content filesystem status, mount type, presence of key config files.</p>
        {fs.loading && <div className="center-muted">Loading…</div>}
        {fs.error && <div className="small text-error">Error: {fs.error}</div>}
        {fs.info && (
          <div className="grid-gap-sm small">
            <div>Type: <strong>{fs.info.type}</strong> {fs.info.mounted ? '(mounted)' : '(not mounted)'}</div>
            {typeof fs.info.totalBytes === 'number' && (
              <div>Usage: {fs.info.usedBytes} / {fs.info.totalBytes} bytes ({fs.info.totalBytes ? ((fs.info.usedBytes! / fs.info.totalBytes) * 100).toFixed(1) : '0'}%)</div>
            )}
            {fs.info.paths && (
              <div className="badge-row">
                {Object.entries(fs.info.paths).map(([p, ok]) => (
                  <span key={p} className={`badge ${ok ? 'badge-ok' : 'badge-bad'}`}>{ok ? '✓' : '✕'} {p}</span>
                ))}
              </div>
            )}
          </div>
        )}
        <div className="flex gap mt-sm">
          <button className="btn btn-small" onClick={() => fs.reload()}>Refresh</button>
          <button className="btn btn-small" onClick={async () => { try { await fs.remount(); showToast('Remount complete', 'success'); } catch (e: any) { showToast('Remount failed: ' + e.message, 'error'); } }}>Remount</button>
        </div>
      </section>

      {/* Wi-Fi AP Control */}
      <section className="sec mt sec-wide">
        <h3 className="heading-gap">Wi‑Fi Access Point</h3>
        <p className="muted">Manage the device fallback / management AP and Wi‑Fi mode policy.</p>
        {ap.loading && <div className="center-muted">Loading…</div>}
        {ap.error && <div className="small text-error">Error: {ap.error}</div>}
        {ap.state && (
          <div className="grid-gap-sm small">
            <div>Policy Mode (wifiMode): <strong>{ap.state.wifiMode}</strong></div>
            <div>Runtime Mode enum: {ap.state.mode}</div>
            <div>AP Active: {ap.state.apActive ? 'Yes' : 'No'} | Started: {ap.state.apStarted ? 'Yes' : 'No'} | Clients: {ap.state.apClients}</div>
            <div>AP IP: {ap.state.apIP}</div>
            {ap.state.managementAP && <div>Management AP: true</div>}
            {ap.state.config && (<div>Config: SSID={ap.state.config.ssid} Channel={ap.state.config.channel} Hidden={String(ap.state.config.hidden)} Max={ap.state.config.max_clients}</div>)}
          </div>
        )}
        <div className="flex flex-wrap gap mt-sm">
          <div className="flex-col gap-sm small">
            <label className="small">SSID <input value={apSsid} onChange={e => setApSsid(e.target.value)} placeholder='Override or blank to default' /></label>
            <label className="small">Channel <input type='number' value={apChannel} onChange={e => setApChannel(Number(e.target.value))} className='w-70' /></label>
            <label className="small">Hidden <input type='checkbox' checked={apHidden} onChange={e => setApHidden(e.target.checked)} /></label>
            <label className="small">Max Clients <input type='number' value={apMaxClients} onChange={e => setApMaxClients(Number(e.target.value))} className='w-90' /></label>
          </div>
          <div className="flex-col gap-sm">
            <button className='btn btn-small' onClick={async () => { try { await ap.action('start', { ssid: apSsid || undefined, channel: apChannel, hidden: apHidden, max_clients: apMaxClients }); showToast('AP start requested', 'success'); } catch (e: any) { showToast('Start failed: ' + e.message, 'error'); } }}>Start</button>
            <button className='btn btn-small' onClick={async () => { try { await ap.action('stop'); showToast('AP stopped', 'success'); } catch (e: any) { showToast('Stop failed: ' + e.message, 'error'); } }}>Stop</button>
            <button className='btn btn-small' onClick={async () => { try { await ap.action('restart'); showToast('AP restarted', 'success'); } catch (e: any) { showToast('Restart failed: ' + e.message, 'error'); } }}>Restart</button>
          </div>
          <div className="flex-col gap-sm small">
            <div>Set Wi‑Fi Policy Mode</div>
            {[0, 1, 2, 3].map(m => (
              <button key={m} className='btn btn-tiny' disabled={modeChanging || ap.state?.wifiMode === m} onClick={async () => { setModeChanging(true); try { await setWifiMode(m); showToast('Mode set to ' + m, 'success'); ap.reload(); } catch (e: any) { showToast('Set mode failed: ' + e.message, 'error'); } finally { setModeChanging(false); } }}>{ap.state?.wifiMode === m ? 'Current ' + m : 'Set ' + m}</button>
            ))}
          </div>
        </div>
      </section>

      {/* System Control */}
      <section className="sec mt maxw-500">
        <h3 className="heading-gap">System</h3>
        <p className="muted">Administrative actions.</p>
        <button className='btn btn-small' onClick={async () => {
          if (!confirm('Reboot device now?')) return;
          try { await apiPostNoBody('/api/device/reboot'); showToast('Reboot requested', 'success'); } catch (e: any) { showToast('Reboot failed: ' + e.message, 'error'); }
        }}>Reboot Device</button>
      </section>
    </Layout>
  );
}
