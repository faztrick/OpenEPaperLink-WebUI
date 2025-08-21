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

  function getHeaderCom(){
    const sel = document.getElementById('com-port-select');
    return sel && sel.value ? sel.value : '';
  }

  function updateSelectedComLabel(){
    const lbl = document.getElementById('wifi-selected-com');
    const com = getHeaderCom();
    if (lbl) lbl.textContent = com || '-';
  }

  async function serialScan(){
    const com = getHeaderCom(); if(!com){ alert('Select a COM port (header)'); return; }
    setText('wifi-serial-scan-status','Scanning via serial...'); log(`Serial WiFi scan on ${com}...`);
    try{
      const r = await fetch('/api/serial/wifi/scan', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ path: com }) });
      const j = await r.json();
      if(!j.success) throw new Error(j.error||'serial scan failed');
      renderNetworks(j.networks||[]);
      setText('wifi-serial-scan-status',`Found ${Array.isArray(j.networks)?j.networks.length:0}`);
    }catch(e){ setText('wifi-serial-scan-status',`Error: ${e.message}`); log(`Serial scan error: ${e.message}`,'error'); }
  }

  async function serialCheck(){
    const com = getHeaderCom(); if(!com){ alert('Select a COM port (header)'); return; }
    setText('wifi-serial-check-status','Checking...'); log(`Checking COM health on ${com}...`);
    try{
      const r = await fetch('/api/com/check', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ path: com, testCmd: '\n', timeout: 800 }) });
      const j = await r.json();
      if(!j.success) throw new Error(j.error||'check failed');
      const resp = (j.response||'').toString();
      const preview = resp.length ? ` OK (resp ${Math.min(resp.length,40)}b)` : ' OK (no response)';
      setText('wifi-serial-check-status', preview);
      log(`COM check success on ${com}.${resp?` Response: ${resp.substring(0,120).replace(/\r?\n/g,'\\n')}`:''}`);
    }catch(e){
      setText('wifi-serial-check-status',`Error: ${e.message}`);
      log(`COM check error on ${com}: ${e.message}`,'error');
    }
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
    const com = getHeaderCom(); if(!com){ alert('Select a COM port (header)'); return; }
    const ssid = document.getElementById('wifi-ssid').value.trim();
    const password = document.getElementById('wifi-pass').value;
    if(!ssid){ alert('Enter SSID'); return; }
    setText('wifi-connect-status','Sending via serial...'); log(`Sending WiFi credentials via ${com} for SSID='${ssid}' ...`);
    try{
      const r = await fetch('/api/serial/wifi/connect', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ path: com, ssid, password }) });
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
  updateSelectedComLabel();
  // Keep label in sync when header COM changes
  const headerSel = document.getElementById('com-port-select');
  if (headerSel) headerSel.addEventListener('change', updateSelectedComLabel);
    document.getElementById('wifi-use-selected').addEventListener('click', ()=>{
      const devId = document.getElementById('wifi-device-select').value; const dev = devicesList().find(d=>d.id===devId);
      if(dev && dev.ip){ document.getElementById('wifi-host').value = dev.ip; log(`Using device ${dev.name||dev.id} (${dev.ip})`); }
    });
    document.getElementById('wifi-scan').addEventListener('click', scan);
    const serialScanBtn = document.getElementById('wifi-serial-scan');
    if (serialScanBtn) serialScanBtn.addEventListener('click', serialScan);
  const serialCheckBtn = document.getElementById('wifi-serial-check');
  if (serialCheckBtn) serialCheckBtn.addEventListener('click', serialCheck);
    document.getElementById('wifi-connect').addEventListener('click', connect);
    const serialConnBtn = document.getElementById('wifi-serial-connect');
    if (serialConnBtn) serialConnBtn.addEventListener('click', () => {
      const com = getHeaderCom(); if(!com){ alert('Select a COM port (header)'); return; }
      // Wrap serialConnect to use header COM
      (async () => {
        const ssid = document.getElementById('wifi-ssid').value.trim();
        const password = document.getElementById('wifi-pass').value;
        if(!ssid){ alert('Enter SSID'); return; }
        setText('wifi-connect-status','Sending via serial...'); log(`Sending WiFi credentials via ${com} for SSID='${ssid}' ...`);
        try{
          const r = await fetch('/api/serial/wifi/connect', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ path: com, ssid, password }) });
          const j = await r.json();
          if(!j.success) throw new Error(j.error||'serial connect failed');
          setText('wifi-connect-status', j.acknowledged ? 'Acknowledged via serial.' : 'Sent via serial.');
          log('Serial WiFi settings sent successfully.');
        }catch(e){ setText('wifi-connect-status',`Error: ${e.message}`); log(`Serial connect error: ${e.message}`,'error'); }
      })();
    });
    document.getElementById('wifi-clear').addEventListener('click', ()=>{ const el = logEl(); if(el) el.innerHTML=''; });
  });
})();
