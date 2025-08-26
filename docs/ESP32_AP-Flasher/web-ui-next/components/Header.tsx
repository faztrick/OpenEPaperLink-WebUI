import { useState } from 'react';
import { useDevices } from '../context/DeviceContext';
import { useUI } from '../context/UIContext';
import { useApiStatus } from '../hooks/useApiStatus';
import { useSerialPorts } from '../hooks/useSerialPorts';
import { useWebSocketStatus } from '../hooks/useWebSocketStatus';

export function Header(){
  const { ok: apiOk } = useApiStatus();
  const { connected: wsOk } = useWebSocketStatus(typeof window !== 'undefined' ? (location.protocol === 'https:'? 'wss':'ws') + '://' + location.host + '/ws' : undefined);
  const { ports } = useSerialPorts(); // still uses hook (will unify later)
  const { serialPorts } = useDevices();
  const [selectedPort, setSelectedPort] = useState('');
  const { openAIChat } = useUI();

  return (
    <header className="header" data-component-root="header" style={{borderBottom:'1px solid #30363d', padding:'0.5rem 1rem', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
      <div style={{display:'flex', alignItems:'center', gap:8}}>
        <i className="fas fa-microchip" aria-hidden />
        <h1 style={{fontSize:'1.1rem', margin:0}}>ESP32 DevWebUi</h1>
      </div>
      <div style={{display:'flex', gap:'1rem', alignItems:'center'}}>
        <StatusDot label="API" ok={apiOk} />
        <StatusDot label="WS" ok={wsOk} />
        <div style={{display:'flex', alignItems:'center', gap:6}}>
          <StatusDot label="Serial" ok={false} />
          <select value={selectedPort} onChange={e=>setSelectedPort(e.target.value)} style={{padding:4,borderRadius:4}} aria-label="COM port">
            <option value="">Port</option>
            {(serialPorts.length? serialPorts : ports).map(p=> (
              <option key={p.path} value={p.path}>{p.path}{p.manufacturer? ` (${p.manufacturer})`: ''}</option>
            ))}
          </select>
          <button onClick={openAIChat} style={{padding:'4px 6px'}}>AI</button>
        </div>
      </div>
    </header>
  );
}

function StatusDot({label, ok}:{label:string; ok:boolean}){
  return (
    <div style={{display:'flex', alignItems:'center', gap:6}} title={label}>
      <span style={{width:10,height:10,borderRadius:'50%',background: ok? '#16a34a':'#dc2626', display:'inline-block'}} />
      <small style={{color:'#9ca3af'}}>{label}</small>
    </div>
  );
}
