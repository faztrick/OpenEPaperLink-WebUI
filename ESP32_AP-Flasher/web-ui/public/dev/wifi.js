(function(){
  const logEl = () => document.getElementById('wifi-console');
  function log(msg, type='info'){
    const el = logEl(); if(!el) return; const ts = new Date().toLocaleTimeString();
    const d = document.createElement('div'); d.className = `console-line ${type}`; d.textContent = `[${ts}] ${msg}`;
    el.appendChild(d); el.scrollTop = el.scrollHeight;
  }

  function setText(id, txt){ const el = document.getElementById(id); if(el) el.textContent = txt || ''; }
  function getSelectedDevice(){ try{ return (window.app && window.app.getSelectedDevice) ? window.app.getSelectedDevice() : null; }catch(_){ return null; } }
  function devicesList(){ try{ return (window.app && Array.isArray(window.app.devices)) ? window.app.devices : []; }catch(_){ return []; } }

  function populateDevices(){
    const sel = document.getElementById('wifi-device-select'); if(!sel) return;
    sel.innerHTML = '';
    const list = devicesList();
    if(list.length === 0){ const o = document.createElement('option'); o.value = ''; o.textContent = 'No saved devices'; sel.appendChild(o); return; }
    list.forEach(d=>{ const o = document.createElement('option'); o.value = d.id; o.textContent = `${d.name||d.id} (${d.ip||'-'})`; sel.appendChild(o); });
    const cur = getSelectedDevice(); if(cur) sel.value = cur.id;
  }

  function currentHost(){
    const ov = document.getElementById('wifi-host').value.trim();
    if(ov) return ov;
    const dev = getSelectedDevice(); return dev && dev.ip ? dev.ip : '';
  }

  async function scan(){
    const host = currentHost(); if(!host){ alert('Set device host'); return; }
    setText('wifi-scan-status', 'Scanning...'); log(`Scanning WiFi on ${host}...`);
    try{
      const r = await fetch(`/api/device/wifi/scan?host=${encodeURIComponent(host)}`);
      const j = await r.json();
      if(!j.success){ throw new Error(j.error||'scan failed'); }
      renderNetworks(j.networks||[]); setText('wifi-scan-status', `Found ${Array.isArray(j.networks)?j.networks.length:0}`);
    }catch(e){ setText('wifi-scan-status', `Error: ${e.message}`); log(`Scan error: ${e.message}`,'error'); }
  }

  async function serialScan(){
    const sel = document.getElementById('serial-port-select'); if(!sel||!sel.value){ alert('Select a COM port'); return; }
    setText('wifi-serial-scan-status','Scanning via serial...'); log(`Serial WiFi scan on ${sel.value}...`);
    try{
      const r = await fetch('/api/serial/wifi/scan', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ path: sel.value }) });
      const j = await r.json();
      if(!j.success) throw new Error(j.error||'serial scan failed');
      renderNetworks(j.networks||[]);
      setText('wifi-serial-scan-status',`Found ${Array.isArray(j.networks)?j.networks.length:0}`);
    }catch(e){ setText('wifi-serial-scan-status',`Error: ${e.message}`); log(`Serial scan error: ${e.message}`,'error'); }
  }

  function renderNetworks(list){
    const box = document.getElementById('wifi-list'); if(!box) return; box.innerHTML='';
    if(!Array.isArray(list) || list.length===0){ box.innerHTML = '<em>No networks found</em>'; return; }
    const table = document.createElement('table'); table.className='simple-table';
    const thead = document.createElement('thead'); thead.innerHTML = '<tr><th>SSID</th><th>RSSI</th><th>Security</th><th></th></tr>'; table.appendChild(thead);
    const tbody = document.createElement('tbody');
    list.forEach(n=>{
      const ssid = n.ssid || n.SSID || n.name || '';
      const rssi = n.rssi ?? n.RSSI ?? '';
      const sec = n.encryption || n.auth || n.type || '';
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${ssid}</td><td>${rssi}</td><td>${sec}</td><td><button class="btn btn-small" data-ssid="${ssid}">Use</button></td>`;
      tbody.appendChild(tr);
    });
    table.appendChild(tbody); box.appendChild(table);
    // wire use buttons
    box.querySelectorAll('button[data-ssid]').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const ssid = btn.getAttribute('data-ssid') || '';
        const i = document.getElementById('wifi-ssid'); if(i) i.value = ssid;
      });
    });
  }

  async function connect(){
    const host = currentHost(); if(!host){ alert('Set device host'); return; }
    const ssid = document.getElementById('wifi-ssid').value.trim();
    const password = document.getElementById('wifi-pass').value;
    if(!ssid){ alert('Enter SSID'); return; }
    setText('wifi-connect-status','Connecting...'); log(`Connecting ${host} to SSID='${ssid}' ...`);
    try{
      const r = await fetch('/api/device/wifi/connect',{ method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ host, ssid, password })});
      const j = await r.json();
      if(!j.success){ throw new Error(j.error||'connect failed'); }
      setText('wifi-connect-status','Saved. Device will attempt to connect.');
      log('WiFi credentials sent successfully.');
    }catch(e){ setText('wifi-connect-status',`Error: ${e.message}`); log(`Connect error: ${e.message}`,'error'); }
  }

  async function serialConnect(){
    const sel = document.getElementById('serial-port-select'); if(!sel||!sel.value){ alert('Select a COM port'); return; }
    const ssid = document.getElementById('wifi-ssid').value.trim();
    const password = document.getElementById('wifi-pass').value;
    if(!ssid){ alert('Enter SSID'); return; }
    setText('wifi-connect-status','Sending via serial...'); log(`Sending WiFi credentials via ${sel.value} for SSID='${ssid}' ...`);
    try{
      const r = await fetch('/api/serial/wifi/connect', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ path: sel.value, ssid, password }) });
      const j = await r.json();
      if(!j.success) throw new Error(j.error||'serial connect failed');
      setText('wifi-connect-status', j.acknowledged ? 'Acknowledged via serial.' : 'Sent via serial.');
      log('Serial WiFi settings sent successfully.');
    }catch(e){ setText('wifi-connect-status',`Error: ${e.message}`); log(`Serial connect error: ${e.message}`,'error'); }
  }

  // events
  document.addEventListener('DOMContentLoaded', ()=>{
    populateDevices();
    const cur = getSelectedDevice(); if(cur && cur.ip){ document.getElementById('wifi-host').value = cur.ip; }
    // populate serial ports selector via header list if available
    try {
      const headerSel = document.getElementById('com-port-select');
      const serialSel = document.getElementById('serial-port-select');
      if (headerSel && serialSel) {
        serialSel.innerHTML = headerSel.innerHTML;
        if (headerSel.value) serialSel.value = headerSel.value;
      }
    } catch(_) {}
    // Fallback: fetch from server
    (async () => {
      try {
        const serialSel = document.getElementById('serial-port-select');
        if (!serialSel || serialSel.options.length > 0) return;
        const r = await fetch('/api/com-ports');
        if (r.ok) {
          const ports = await r.json();
          if (Array.isArray(ports) && ports.length > 0) {
            serialSel.innerHTML = '';
            ports.forEach(p => {
              const val = p.path || p;
              const o = document.createElement('option'); o.value = val; o.textContent = val; serialSel.appendChild(o);
            });
          }
        }
      } catch(_) {}
    })();
    document.getElementById('wifi-use-selected').addEventListener('click', ()=>{
      const devId = document.getElementById('wifi-device-select').value; const dev = devicesList().find(d=>d.id===devId);
      if(dev && dev.ip){ document.getElementById('wifi-host').value = dev.ip; log(`Using device ${dev.name||dev.id} (${dev.ip})`); }
    });
    document.getElementById('wifi-scan').addEventListener('click', scan);
    const serialScanBtn = document.getElementById('wifi-serial-scan');
    if (serialScanBtn) serialScanBtn.addEventListener('click', serialScan);
    document.getElementById('wifi-connect').addEventListener('click', connect);
    const serialConnBtn = document.getElementById('wifi-serial-connect');
    if (serialConnBtn) serialConnBtn.addEventListener('click', serialConnect);
    document.getElementById('wifi-clear').addEventListener('click', ()=>{ const el = logEl(); if(el) el.innerHTML=''; });
  });
})();
