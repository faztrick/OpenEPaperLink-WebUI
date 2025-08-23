// wifi.js module can be re-initialized after SPA navigation.
(function(global){
  if(global.__OEPL_WIFI_MODULE__) return; // singleton pattern for helpers; init() still re-runs per page load
  const WIFI = { initializedOnce:false };
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
    const headerSel = document.getElementById('header-device-select');
    const selects = [sel]; if(headerSel) selects.push(headerSel);
    const list = devicesList();
    selects.forEach(s=>{
      if(!s) return;
      s.innerHTML='';
      if(list.length === 0){ const o = document.createElement('option'); o.value=''; o.textContent='No saved devices'; s.appendChild(o); return; }
      list.forEach(d=>{ const o=document.createElement('option'); o.value=d.id; o.textContent=`${d.name||d.id}`; s.appendChild(o); });
    });
    const cur = getSelectedDevice();
    if(cur){ selects.forEach(s=>{ try{ s.value = cur.id; }catch(_){ } }); }
  }

  async function refreshDevicesFromServer(autoSelect=true){
    try {
      const r = await fetch('/api/devices');
      if(!r.ok) throw new Error('http '+r.status);
      const j = await r.json();
      if(j && Array.isArray(j.devices)) {
        // If global app present update it, else keep local copy in window.wifiDevices
        if(window.app){
          window.app.devices = j.devices.map(d=>({ id:d.id, name:d.name, ip:d.host||d.ip, com:d.port||d.com }));
          window.app.selectedDeviceId = j.selectedId || null;
        } else {
          window.wifiDevices = j.devices;
          window.wifiSelectedId = j.selectedId || null;
        }
        populateDevices();
        if(autoSelect && j.selectedId){
          const selEl = document.getElementById('wifi-device-select');
          if(selEl) selEl.value = j.selectedId;
        }
      }
    } catch(e){ log('Device list load failed: '+e.message,'error'); }
  }

  async function selectDeviceFromWifiTab(){
    const id = document.getElementById('wifi-device-select').value;
    if(!id){ alert('Choose a saved device first'); return; }
    try {
      const r = await fetch('/api/device/select',{ method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ id }) });
      const j = await r.json();
      if(!j.success) throw new Error(j.error||'select failed');
      log(`Device '${id}' selected.`);
      // mirror selection into global app if present
      if(window.app){ window.app.selectedDeviceId = id; }
      // update host override field
      const dev = devicesList().find(d=>d.id===id);
      if(dev && dev.ip){ const h=document.getElementById('wifi-host'); if(h) h.value = dev.ip; }
      fetchStatus(false);
    } catch(e){ log('Select device error: '+e.message,'error'); }
  }

  function currentHost(){
    const ov = document.getElementById('wifi-host').value.trim();
    if(ov) return ov;
    const dev = getSelectedDevice(); return dev && dev.ip ? dev.ip : '';
  }

  async function scan(){
    // Prefer device-id based endpoint if a device is selected
    const dev = getSelectedDevice();
    if(!dev){ alert('Select a device first'); return; }
    setText('wifi-scan-status', 'Scanning...'); log(`Scanning WiFi on device ${dev.name||dev.id} ...`);
    try{
      const r = await fetch(`/api/device/${encodeURIComponent(dev.id)}/wifi/scan`);
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
    const dev = getSelectedDevice(); if(!dev){ alert('Select a device first'); return; }
    const ssid = document.getElementById('wifi-ssid').value.trim();
    const password = document.getElementById('wifi-pass').value;
    if(!ssid){ alert('Enter SSID'); return; }
    setText('wifi-connect-status','Connecting...'); log(`Connecting device ${dev.name||dev.id} to SSID='${ssid}' ...`);
    try{
      const r = await fetch(`/api/device/${encodeURIComponent(dev.id)}/wifi/connect`,{ method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ ssid, password })});
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

  // ---- Status Handling ----
  async function fetchStatus(showLog=false){
    const dev = getSelectedDevice(); if(!dev){ if(showLog) log('No device selected','warning'); return; }
    try {
      const r = await fetch(`/api/device/${encodeURIComponent(dev.id)}/wifi/status`);
      const j = await r.json();
      if(!j.success){ throw new Error(j.error||'status failed'); }
      renderStatus(j);
      if(showLog) log(`Status: ${j.connected?'connected':'offline'} ${j.ssid||''} ${j.ip||''}`);
    } catch(e){ if(showLog) log(`Status error: ${e.message}`,'error'); }
  }

  function renderStatus(s){
    const set = (id,val)=>{ const el=document.getElementById(id); if(el) el.textContent = (val==null||val==='')?'-':val; };
    if(!s){ set('wifi-status-connected','?'); return; }
    set('wifi-status-connected', s.connected? 'Yes':'No');
    set('wifi-status-ssid', s.ssid);
    set('wifi-status-ip', s.ip);
    set('wifi-status-rssi', (s.rssi!=null)? s.rssi+' dBm': null);
    set('wifi-status-channel', s.channel);
    set('wifi-status-mode', s.mode);
    set('wifi-status-updated', new Date().toLocaleTimeString());
  }

  async function disconnectWifi(){
    const dev = getSelectedDevice(); if(!dev){ alert('Select a device first'); return; }
    const stId = 'wifi-disconnect-status'; setText(stId,'Disconnecting...');
    try {
      const r = await fetch(`/api/device/${encodeURIComponent(dev.id)}/wifi/disconnect`,{ method:'POST', headers:{'Content-Type':'application/json'} });
      const j = await r.json();
      if(!j.success) throw new Error(j.error||'disconnect failed');
      setText(stId,'Disconnect sent'); log('Disconnect command sent.');
      setTimeout(()=>fetchStatus(false),1500);
    }catch(e){ setText(stId,'Error: '+e.message); log('Disconnect error: '+e.message,'error'); }
  }

  async function initWifiPage(){
    const rootMarker = document.getElementById('wifi-device-select') || document.getElementById('wifi-status-panel');
    if(!rootMarker) return; // not on wifi page
    if(rootMarker.dataset.bound === '1') return; // prevent double binding for same DOM
    rootMarker.dataset.bound = '1';
    (async () => {
    // Ensure ESP32DevUI is attached (if app.js loaded). If not, create a minimal stub for device list use.
    if(!window.app){ window.app = { devices: window.wifiDevices||[], selectedDeviceId: window.wifiSelectedId||null, getSelectedDevice(){ return this.devices.find(d=>d.id===this.selectedDeviceId)||null; } }; }
    await refreshDevicesFromServer(true);
    populateDevices();
    const cur = getSelectedDevice(); if(cur && cur.ip){ document.getElementById('wifi-host').value = cur.ip; }
  updateSelectedComLabel();
  // Keep label in sync when header COM changes
  const headerSel = document.getElementById('com-port-select');
  if (headerSel) headerSel.addEventListener('change', updateSelectedComLabel);
    document.getElementById('wifi-use-selected').addEventListener('click', selectDeviceFromWifiTab);
    const devSel = document.getElementById('wifi-device-select');
    if(devSel) devSel.addEventListener('change', ()=>{ /* passive change only; selection action explicit */ });
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
    // Status buttons
    const refreshBtn = document.getElementById('wifi-refresh-status'); if(refreshBtn) refreshBtn.addEventListener('click', ()=>fetchStatus(true));
    const discBtn = document.getElementById('wifi-disconnect'); if(discBtn) discBtn.addEventListener('click', disconnectWifi);
  // Initial status (single); ongoing updates come from server push via app.js socket
  fetchStatus(false);
    })();
  }

  // Hook events
  document.addEventListener('DOMContentLoaded', initWifiPage);
  window.addEventListener('spa:navigated', initWifiPage);
  // expose for manual debug
  global.__OEPL_WIFI_MODULE__ = { init: initWifiPage };
})(window);
