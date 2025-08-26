import dynamic from 'next/dynamic';
import { useRouter } from 'next/router';
import { useState } from 'react';
import { Layout } from '../components/Layout';
import { useWifi } from '../hooks/useWifi';

const SerialWifiScannerPanel = dynamic(()=> import('../components/SerialWifiScannerPanel').then(m=>m.SerialWifiScannerPanel), { ssr:false, loading: ()=> <div style={{fontSize:12, opacity:.6}}>Loading serial scan...</div> });

export default function WifiPage(){
  const router = useRouter();
  const deviceId = (router.query.deviceId as string) || '';
  const showSerial = router.query.serial === '1';
  const { networks, status, loadingScan, loadingStatus, error, scan, refreshStatus, connect, disconnect } = useWifi(deviceId || undefined);
  const [ssid, setSsid] = useState('');
  const [pass, setPass] = useState('');
  return (
    <Layout title="Wi-Fi" description="Wi-Fi configuration">
      <h2>Wi-Fi</h2>
      <p style={{fontSize:12, opacity:.7, marginTop:-4}}>Standard device API Scan below. For direct serial scan <a href="/serial-wifi" style={{textDecoration:'underline'}}>open Serial WiFi page</a> or append <code>?serial=1</code> to view inline.</p>
      <div style={{display:'flex', gap:16, flexWrap:'wrap'}}>
        <div style={{minWidth:260}}>
          <h3 style={{margin:'8px 0'}}>Status</h3>
          <p style={{fontSize:13}}>{loadingStatus? 'Loading status...' : status? `Connected: ${status.connected? 'Yes':'No'} SSID=${status.ssid||'-'} IP=${status.ip||'-'}` : 'No status'}</p>
          <div style={{display:'flex', gap:8}}>
            <button onClick={()=>refreshStatus()} className="btn btn-small">Refresh</button>
            <button onClick={()=>disconnect()} disabled={!status?.connected} className="btn btn-small">Disconnect</button>
          </div>
          <h3 style={{margin:'16px 0 4px'}}>Connect</h3>
          <input placeholder="SSID" value={ssid} onChange={e=>setSsid(e.target.value)} style={{width:'100%', marginBottom:4}} />
            <input placeholder="Password" type="password" value={pass} onChange={e=>setPass(e.target.value)} style={{width:'100%', marginBottom:8}} />
          <button onClick={()=>{ if(!ssid) return; connect(ssid, pass).catch(e=>alert(e.message)); }} className="btn btn-small">Save Credentials</button>
        </div>
        <div style={{flex:1, minWidth:320}}>
          <h3 style={{margin:'8px 0'}}>Scan</h3>
          <div style={{display:'flex', gap:8, alignItems:'center'}}>
            <button onClick={()=>scan()} disabled={loadingScan} className="btn btn-small">{loadingScan? 'Scanning...':'Scan'}</button>
            <span style={{fontSize:12, opacity:.7}}>{networks.length? `${networks.length} networks` : ''}</span>
          </div>
          {error && <p style={{color:'tomato', fontSize:12}}>Error: {error}</p>}
          <div style={{marginTop:8, maxHeight:300, overflow:'auto', border:'1px solid #ddd', borderRadius:6, padding:4}}>
            {networks.length===0 && !loadingScan && <p style={{fontSize:12, opacity:.6}}>No networks scanned yet.</p>}
            {networks.map(n=> (
              <div key={n.ssid+':'+n.rssi} style={{display:'flex', fontSize:12, gap:8, padding:'4px 2px', borderBottom:'1px solid rgba(0,0,0,0.05)'}}>
                <strong style={{flex:1}}>{n.ssid||'<hidden>'}</strong>
                <span>{n.rssi!=null? n.rssi+' dBm':''}</span>
                <span>{n.security}</span>
                <button className="btn btn-tiny" onClick={()=>setSsid(n.ssid)}>Use</button>
              </div>
            ))}
          </div>
        </div>
        {showSerial && (
          <div style={{flex:1, minWidth:340}}>
            <SerialWifiScannerPanel onSelectSSID={(s)=>{ setSsid(s); /* focus maybe later */ }} />
          </div>
        )}
      </div>
    </Layout>
  );
}
