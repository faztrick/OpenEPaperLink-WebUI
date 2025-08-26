import { useState } from 'react';
import { Layout } from '../components/Layout';
import { useFlash } from '../hooks/useFlash';

export default function FlashPage(){
  const { state, run } = useFlash();
  const [env, setEnv] = useState('OutdoorAP');
  const [port, setPort] = useState('COM10');
  const [baud, setBaud] = useState('921600');
  const [fsOnly, setFsOnly] = useState(false);
  const [skipUpload, setSkipUpload] = useState(false);
  const [skipBuild, setSkipBuild] = useState(false);
  const [fast, setFast] = useState(true);
  const start = () => run({ env, port, baud, fsOnly, skipUpload, skipBuild, fast });
  return (
    <Layout title="Flash" description="Firmware flashing UI">
      <h2>Flash</h2>
      <div style={{display:'flex', gap:24, flexWrap:'wrap'}}>
        <div style={{minWidth:260}}>
          <h3 style={{margin:'8px 0'}}>Config</h3>
          <label style={{display:'block', fontSize:12, marginBottom:4}}>Env
            <input value={env} onChange={e=>setEnv(e.target.value)} style={{width:'100%'}} />
          </label>
          <label style={{display:'block', fontSize:12, marginBottom:4}}>Port
            <input value={port} onChange={e=>setPort(e.target.value)} style={{width:'100%'}} />
          </label>
          <label style={{display:'block', fontSize:12, marginBottom:4}}>Baud
            <input value={baud} onChange={e=>setBaud(e.target.value)} style={{width:'100%'}} />
          </label>
          <div style={{display:'grid', gap:4, fontSize:12, marginTop:8}}>
            <label><input type="checkbox" checked={fsOnly} onChange={e=>setFsOnly(e.target.checked)} /> FS Only</label>
            <label><input type="checkbox" checked={skipUpload} onChange={e=>setSkipUpload(e.target.checked)} /> Skip Upload</label>
            <label><input type="checkbox" checked={skipBuild} onChange={e=>setSkipBuild(e.target.checked)} /> Skip Build</label>
            <label><input type="checkbox" checked={fast} onChange={e=>setFast(e.target.checked)} /> Fast Mode</label>
          </div>
          <button onClick={start} disabled={state.running} className="btn btn-small" style={{marginTop:12}}>Start</button>
        </div>
        <div style={{flex:1, minWidth:320}}>
          <h3 style={{margin:'8px 0'}}>Console</h3>
          <div style={{fontSize:11, border:'1px solid #ddd', borderRadius:6, padding:6, maxHeight:360, overflow:'auto', background:'#111', color:'#eee'}}>
            {state.lines.map(l=> <div key={l.ts+':'+l.text} style={{color: l.level==='error'? '#f87171': l.level==='success'? '#4ade80':'#fff'}}>{new Date(l.ts).toLocaleTimeString()} {l.text}</div>)}
            {!state.lines.length && <div style={{opacity:.6}}>No output yet.</div>}
          </div>
        </div>
      </div>
    </Layout>
  );
}
