import { useState } from 'react';
import { Layout } from '../components/Layout';
import { useFlash } from '../hooks/useFlash';
import { apiGet, apiPostForm, apiPostNoBody } from '../lib/apiClient';

export default function FlashPage() {
  const { state, run } = useFlash();
  const [env, setEnv] = useState('OutdoorAP');
  const [port, setPort] = useState('COM10');
  const [baud, setBaud] = useState('921600');
  const [fsOnly, setFsOnly] = useState(false);
  const [skipUpload, setSkipUpload] = useState(false);
  const [skipBuild, setSkipBuild] = useState(false);
  const [fast, setFast] = useState(true);
  const start = () => run({ env, port, baud, fsOnly, skipUpload, skipBuild, fast });
  const [otaUrl, setOtaUrl] = useState('');
  const [otaBusy, setOtaBusy] = useState(false);
  const [checkPath, setCheckPath] = useState('/current/tagDB.json');
  const [checkResult, setCheckResult] = useState<any>(null);
  const doFlashC6 = async () => {
    if (!otaUrl) return alert('Provide URL');
    setOtaBusy(true);
    try { const body = new URLSearchParams(); body.set('url', otaUrl); await apiPostForm('/api/device/update_c6', body); alert('OTA requested'); }
    catch (e: any) { alert('OTA failed: ' + e.message); }
    finally { setOtaBusy(false); }
  };
  const doCleanup = async () => { try { await apiPostNoBody('/api/device/update_actions'); alert('Cleanup done'); } catch (e: any) { alert('Cleanup failed: ' + e.message); } };
  const doRollback = async () => { if (!confirm('Attempt rollback?')) return; try { await apiPostNoBody('/api/device/rollback'); alert('Rollback requested'); } catch (e: any) { alert('Rollback failed: ' + e.message); } };
  const doCheckFile = async () => { try { const r = await apiGet<any>('/api/device/check_file?path=' + encodeURIComponent(checkPath)); setCheckResult(r); } catch (e: any) { alert('Check failed: ' + e.message); } };
  return (
    <Layout title="Flash" description="Firmware flashing UI">
      <h2>Flash</h2>
      <div className="flex gap-24 flex-wrap">
        <div className="minw-260">
          <h3 className="m-8y">Config</h3>
          <label className="label-block">Env
            <input value={env} onChange={e => setEnv(e.target.value)} className="w-full" />
          </label>
          <label className="label-block">Port
            <input value={port} onChange={e => setPort(e.target.value)} className="w-full" />
          </label>
          <label className="label-block">Baud
            <input value={baud} onChange={e => setBaud(e.target.value)} className="w-full" />
          </label>
          <div className="grid-gap-sm small mt-8">
            <label><input type="checkbox" checked={fsOnly} onChange={e => setFsOnly(e.target.checked)} /> FS Only</label>
            <label><input type="checkbox" checked={skipUpload} onChange={e => setSkipUpload(e.target.checked)} /> Skip Upload</label>
            <label><input type="checkbox" checked={skipBuild} onChange={e => setSkipBuild(e.target.checked)} /> Skip Build</label>
            <label><input type="checkbox" checked={fast} onChange={e => setFast(e.target.checked)} /> Fast Mode</label>
          </div>
          <button onClick={start} disabled={state.running} className="btn btn-small mt-12">Start</button>
          <hr className="hr-line" />
          <h3 className="m-8y">OTA</h3>
          <label className="label-block">Update URL
            <input value={otaUrl} onChange={e => setOtaUrl(e.target.value)} placeholder='http(s)://...' className="w-full" />
          </label>
          <div className='flex gap flex-wrap'>
            <button className='btn btn-tiny' disabled={otaBusy || !otaUrl} onClick={doFlashC6}>Flash C6</button>
            <button className='btn btn-tiny' onClick={doCleanup}>Apply update_actions</button>
            <button className='btn btn-tiny' onClick={doRollback}>Rollback</button>
          </div>
          <div className='mt-12'>
            <label className='label-block'>Check File Path
              <input value={checkPath} onChange={e => setCheckPath(e.target.value)} className='w-full' />
            </label>
            <button className='btn btn-tiny' onClick={doCheckFile}>Check File</button>
            {checkResult && <div className='xsmall mt-4'>Size: {checkResult.filesize} MD5: {checkResult.md5}</div>}
          </div>
        </div>
        <div className="flex-1 minw-320">
          <h3 className="m-8y">Console</h3>
          <div className="console-box">
            {state.lines.map(l => <div key={l.ts + ':' + l.text} className={l.level === 'error' ? 'log-error' : l.level === 'success' ? 'log-success' : 'log-default'}>{new Date(l.ts).toLocaleTimeString()} {l.text}</div>)}
            {!state.lines.length && <div className='center-muted'>No output yet.</div>}
          </div>
        </div>
      </div>
    </Layout>
  );
}
