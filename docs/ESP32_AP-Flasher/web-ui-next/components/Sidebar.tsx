import { useEffect, useState } from 'react';

interface BuildInfo { env:string; lastBuild:string; firmwareSize:string; target:string; }

export function Sidebar(){
  const [info, setInfo] = useState<BuildInfo>({env:'OutdoorAP', lastBuild:'Never', firmwareSize:'-', target:'ESP32-S3 DevKit C-1'});
  const [advanced, setAdvanced] = useState<string[]>([]);

  useEffect(()=>{ /* TODO load build info via API */ }, []);

  return (
    <aside className="sidebar" data-component-root="sidebar" style={{padding:'1rem', width:260, borderRight:'1px solid #30363d'}}>
      <section className="project-info">
        <h3 style={{marginTop:0}}><i className="fas fa-project-diagram" /> Project Info</h3>
        <InfoRow label="Target" value={info.target} />
        <InfoRow label="Environment" value={info.env} />
        <InfoRow label="Last Build" value={info.lastBuild} />
        <InfoRow label="Firmware Size" value={info.firmwareSize} />
      </section>
      <section style={{marginTop:'1.25rem', paddingTop:'0.5rem', borderTop:'1px solid #30363d'}}>
        <h4><i className="fas fa-folder-open" /> Advanced Pages</h4>
        {advanced.length ? (
          <ul style={{margin:0,paddingLeft:'1rem'}}>{advanced.map(a=> <li key={a}>{a}</li>)}</ul>
        ): <div>Loading...</div>}
      </section>
      <section style={{marginTop:'1.25rem'}}>
        <h3><i className="fas fa-wrench" /> Settings</h3>
        <p style={{marginTop:0}}>Move configuration and remote server options to a dedicated settings page.</p>
        <div>
          <button className="btn btn-primary">Open Settings</button>
        </div>
      </section>
    </aside>
  );
}

function InfoRow({label, value}:{label:string; value:string}){
  return (
    <div style={{display:'flex', justifyContent:'space-between', fontSize:'.85rem', padding:'2px 0'}}>
      <span style={{opacity:.7}}>{label}:</span>
      <span>{value}</span>
    </div>
  );
}
