// shared-devices.js
// Lightweight reusable Saved Devices component injected across dev pages.
// Provides add/select/remove of devices persisted in localStorage and a global
// selection event. Designed to gracefully coexist with existing page-specific
// device managers (if a richer manager already exists it will simply hook
// selection highlighting).
(function(){
  const STORE_KEY = 'dev_saved_devices_v1';
  const SELECT_KEY = 'dev_selected_device_v2'; // bump for separate config-based defaulting
  const BUS_EVT_SELECT = 'devDeviceSelected';
  // Canonical device config endpoint now served by server.js
  const CONFIG_URL = '/device.json';
  let configLoaded = false;
  let config = { version:1, customDevices:[], defaultSelectedDevice:null, unified:true, selectedId:null };
  let configIdSet = new Set(); // track device ids (all from unified list)

  function load(){
    try {
      const arr = JSON.parse(localStorage.getItem(STORE_KEY)||'[]');
      if(!Array.isArray(arr)) return [];
      return arr.map(d=>({
        id:d.id,
        name:d.name||d.id||'Device',
        host:d.host||d.ip||'',
        com:d.com||'',
        method:(d.method==='serial'||d.method==='ws'||d.method==='http')?d.method:'http'
      }));
    } catch(e){ return []; }
  }
  function mergedDevices(){
    // In unified mode we ignore local saved list and rely solely on server devices
    if(configLoaded && config.unified){
      configIdSet = new Set(config.customDevices.filter(cd=>cd && cd.id).map(cd=>cd.id));
      return config.customDevices.map(d=>({ id:d.id, name:d.name||d.id, host:d.host||d.ip||'', com:d.com||'', method:d.method||'http'}));
    }
    // Fallback legacy behavior before load
    return load();
  }
  function save(list){ try { localStorage.setItem(STORE_KEY, JSON.stringify(list)); } catch(_){} }
  function loadSelected(){ try { return localStorage.getItem(SELECT_KEY)||null; } catch(_){ return null; } }
  function saveSelected(id){ try { if(id) localStorage.setItem(SELECT_KEY,id); else localStorage.removeItem(SELECT_KEY);} catch(_){ } }

  function uuid(){ return 'd'+Math.random().toString(36).slice(2,10); }

  function ensureContainer(){
    // Prefer existing explicit container
    let c = document.getElementById('saved-devices');
    if(c) return c;
    // Force attach to body (top) for global visibility independent of page layout
    const wrap = document.createElement('section');
    wrap.id = 'dev-shared-devices-section';
    wrap.className = 'dev-devices-root';
  wrap.innerHTML = `\n<div class=\"dev-devices-shell\">\n  <div class=\"dev-devices-header\">\n    <h3 class=\"dev-devices-title\"><span>🖧</span><span>Devices</span></h3>\n    <div class=\"dev-devices-actions\">\n      <button id=\"sd-add\" class=\"btn btn-small\" title=\"Add device\">＋</button>\n    </div>\n  </div>\n  <div id=\"saved-devices\" class=\"device-grid\"></div>\n  <div id=\"sd-empty\" class=\"dev-devices-empty\" style=\"display:none;\">No devices saved yet.</div>\n</div>`;
    document.body.prepend(wrap);
    return document.getElementById('saved-devices');
  }

  function render(){
  const all = mergedDevices();
  const configDevices = all; // unified list
  const localDevices = []; // none when unified

    let sel = loadSelected();
    if(!sel){
      if(config.defaultSelectedDevice && (configIdSet.has(config.defaultSelectedDevice) || localDevices.some(d=>d.id===config.defaultSelectedDevice))){
        sel = config.defaultSelectedDevice; saveSelected(sel);
      } else if(configDevices.length){ sel = configDevices[0].id; saveSelected(sel); }
      else if(localDevices.length){ sel = localDevices[0].id; saveSelected(sel); }
    }

    const container = ensureContainer();
    if(!container) return;
    container.innerHTML='';

    const empty = document.getElementById('sd-empty');
    if(!configDevices.length && !localDevices.length){ if(empty) empty.style.display='block'; } else if(empty) empty.style.display='none';

    // Helper to build a section
    function appendSection(title, devices, isConfig){
      if(!devices.length) return;
      const header = document.createElement('div');
      header.className='sd-section-title';
      header.textContent = title;
      container.appendChild(header);
      devices.forEach(dev=>{
        const card = document.createElement('div');
        card.className = 'compact-device-card sd-card'+(dev.id===sel?' selected':'');
        card.setAttribute('data-id', dev.id);
        card.setAttribute('data-method', dev.method||'http');
        const showToggle = (dev.method==='http' || dev.method==='serial');
        card.innerHTML = `
          <strong class=\"sd-name\" title=\"${escapeHtml(dev.name||'Device')}\">${escapeHtml(dev.name||'Device')}</strong>
          <span class=\"sd-host\" title=\"${escapeHtml(dev.host||'-')}\">${escapeHtml(dev.host||'-')}</span>
          <span class=\"sd-com\" title=\"${escapeHtml(dev.com||'')}\">${escapeHtml(dev.com||'')}</span>
          <div class=\"sd-method-badge method-${(dev.method||'http')} ${isConfig?'config-src':''}\" data-id=\"${dev.id}\" title=\"Method: ${dev.method||'http'}${isConfig?' (config)':' (click to cycle)'}\">${(dev.method||'http')==='http'?'🌐':(dev.method==='serial'?'🔌':'🔁')}</div>
          ${showToggle?`<div class=\"sd-toggle-row\"><label class=\"sd-toggle-label\">Conn:</label><label class=\"sd-toggle-switch\"><input type=\"checkbox\" class=\"sd-toggle-webserial\" data-id=\"${dev.id}\" ${dev.method==='serial'?'checked':''} ${isConfig?'disabled':''} /><span class=\"sd-toggle-text\" data-on=\"serial\" data-off=\"web\"></span></label></div>`:''}
          <div class=\"sd-btn-row\">\n            <button class=\"sd-select btn btn-small\" data-id=\"${dev.id}\">${dev.id===sel?'Selected':'Select'}</button>\n            ${isConfig?'':`<button class=\"sd-edit btn btn-small\" data-id=\"${dev.id}\" title=\"Edit\">✎</button>`}\n            ${isConfig?'':`<button class=\"sd-del btn btn-small\" data-id=\"${dev.id}\" title=\"Remove\">✕</button>`}\n          </div>`;
        container.appendChild(card);
      });
    }

  // Allow interaction (edit/delete/toggle) for unified devices; pass false for isConfig so controls are enabled
  appendSection('All Devices', configDevices.map(d=>({ id:d.id, name:d.name||d.id, host:d.host||d.ip||'', com:d.com||'', method:d.method||'http' })), false);

    // Local devices section
  if(localDevices.length){
      const header = document.createElement('div');
      header.className='sd-section-title';
      header.textContent = 'Local Devices';
      container.appendChild(header);
      localDevices.forEach(dev=>{
        const card = document.createElement('div');
        card.className = 'compact-device-card sd-card'+(dev.id===sel?' selected':'');
        card.setAttribute('data-id', dev.id);
        card.setAttribute('data-method', dev.method||'http');
        card.innerHTML = `
          <strong class=\"sd-name\" title=\"${escapeHtml(dev.name||'Device')}">${escapeHtml(dev.name||'Device')}</strong>
          <span class=\"sd-host\" title=\"${escapeHtml(dev.host||'-')}">${escapeHtml(dev.host||'-')}</span>
          <span class=\"sd-com\" title=\"${escapeHtml(dev.com||'')}">${escapeHtml(dev.com||'')}</span>
          <div class=\"sd-method-badge method-${(dev.method||'http')}\" data-id=\"${dev.id}\" title=\"Method: ${dev.method||'http'} (click to cycle)\">${(dev.method||'http')==='http'?'🌐':(dev.method==='serial'?'🔌':'🔁')}</div>
          <div class=\"sd-btn-row\">\n            <button class=\"sd-select btn btn-small\" data-id=\"${dev.id}\">${dev.id===sel?'Selected':'Select'}</button>\n            <button class=\"sd-edit btn btn-small\" data-id=\"${dev.id}\" title=\"Edit\">✎</button>\n            <button class=\"sd-del btn btn-small\" data-id=\"${dev.id}\" title=\"Remove\">✕</button>\n          </div>`;
        container.appendChild(card);
      });
      // Add tile last
      const addCard = document.createElement('button');
      addCard.type='button';
      addCard.className='compact-device-card sd-add-card';
      addCard.setAttribute('aria-label','Add device');
      addCard.innerHTML = '<div class="sd-add-icon">＋</div><div class="sd-add-text">Add Device</div>';
      addCard.addEventListener('click', addDeviceInteractive);
      container.appendChild(addCard);
    } else {
      // No local devices: show standalone add tile (no header)
      const soloWrap = document.createElement('div');
      soloWrap.className='sd-add-alone';
      const addCard = document.createElement('button');
      addCard.type='button';
      addCard.className='compact-device-card sd-add-card';
      addCard.setAttribute('aria-label','Add device');
      addCard.innerHTML = '<div class="sd-add-icon">＋</div><div class="sd-add-text">Add Device</div>';
      addCard.addEventListener('click', addDeviceInteractive);
      soloWrap.appendChild(addCard);
      container.appendChild(soloWrap);
    }
  }

  function escapeHtml(str){ return (str||'').replace(/[&<>"']/g, c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;' }[c])); }

  async function addDeviceInteractive(){
    const name = prompt('Device name'); if(name===null) return;
    const host = prompt('Host/IP (optional)')||'';
    const com = prompt('COM port (optional)')||'';
    const method = prompt('Method (http / serial / ws) [default http]','http')||'http';
    const rec = { name: name.trim()||'Device', host: host.trim(), port: com.trim()||undefined, meta:{ method: ['serial','ws','http'].includes(method.trim())?method.trim():'http' } };
    try { const r = await fetch('/api/device', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(rec) });
      if(r.ok){
        const j = await r.json();
        if(j && j.device && config && Array.isArray(config.customDevices)){
          config.customDevices.push({ id:j.device.id, name:j.device.name, host:j.device.host, com:j.device.port||'', method: rec.meta.method });
          render();
        }
      }
    } catch(_){ /* ignore */ }
  }

  async function editDeviceInteractive(id){
    const list = mergedDevices();
    const dev = list.find(d=>d.id===id); if(!dev) return;
    const name = prompt('Device name', dev.name); if(name===null) return;
    const host = prompt('Host/IP (optional)', dev.host||'')||'';
    const com = prompt('COM port (optional)', dev.com||'')||'';
    const method = prompt('Method (http / serial / ws)', dev.method||'http')||dev.method||'http';
    const payload = { name: name.trim()||'Device', host: host.trim(), port: com.trim()||undefined, meta:{ ...(dev.meta||{}), method: ['serial','ws','http'].includes(method.trim())?method.trim():dev.method } };
    try {
      const r = await fetch(`/api/device/${encodeURIComponent(id)}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
      if(r.ok){
        const idx = config.customDevices.findIndex(d=>d.id===id);
        if(idx!==-1){ config.customDevices[idx] = { ...config.customDevices[idx], name:payload.name, host:payload.host, com:payload.port||'', method: payload.meta.method }; }
        render();
      }
    } catch(_){ }
  }

  async function removeDevice(id){
    if(!id) return;
    try {
      const r = await fetch(`/api/device/${encodeURIComponent(id)}`, { method:'DELETE' });
      if(r.ok){
        config.customDevices = config.customDevices.filter(d=>d.id!==id);
        if(loadSelected()===id) saveSelected(null);
        render();
      }
    } catch(_){ }
  }

  function selectDevice(id){
    saveSelected(id);
    render();
    // Broadcast selection for any listeners (e.g., app.js could react)
    try { window.dispatchEvent(new CustomEvent(BUS_EVT_SELECT,{ detail:{ id } })); } catch(_){ }
    // Optional sync to OEPLUtils (so status/probing uses the dev-chosen device). We don't persist via its key.
    if(window.OEPLUtils && typeof window.OEPLUtils.setSelectedDevice === 'function'){
      try {
        const list = mergedDevices();
        const dev = list.find(d=>d.id===id);
        if(dev && typeof window.OEPLUtils.upsertDevice === 'function'){
          window.OEPLUtils.upsertDevice({ id:dev.id, name:dev.name, ip:dev.host||dev.ip, com:dev.com, method:dev.method });
        }
        window.OEPLUtils.setSelectedDevice(id);
      } catch(_){ }
    }
  }

  function bindGlobalHandlers(){
    document.addEventListener('click', (e)=>{
      const selBtn = e.target.closest('.sd-select');
      if(selBtn){ selectDevice(selBtn.getAttribute('data-id')); }
      const delBtn = e.target.closest('.sd-del');
      if(delBtn){ if(confirm('Remove device?')) removeDevice(delBtn.getAttribute('data-id')); }
      const editBtn = e.target.closest('.sd-edit');
      if(editBtn){ editDeviceInteractive(editBtn.getAttribute('data-id')); }
      const methodBadge = e.target.closest('.sd-method-badge');
      if(methodBadge){
        const id = methodBadge.getAttribute('data-id');
        if(id){
          const list = mergedDevices();
          const dev = list.find(d=>d.id===id);
          if(dev){
            const order=['http','ws','serial'];
            const idx = order.indexOf(dev.method||'http');
            const nextMethod = order[(idx+1)%order.length];
            // Persist via update
            const payload = { name:dev.name, host:dev.host, port:dev.com||undefined, meta:{ ...(dev.meta||{}), method: nextMethod } };
            fetch(`/api/device/${encodeURIComponent(id)}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) })
              .then(r=>{
                if(r.ok){ const idx = config.customDevices.findIndex(d=>d.id===id); if(idx!==-1){ config.customDevices[idx].method = nextMethod; } }
                if(window.OEPLUtils && typeof window.OEPLUtils.upsertDevice==='function'){
                  try { window.OEPLUtils.upsertDevice({ id:dev.id, name:dev.name, ip:dev.host, com:dev.com, method:nextMethod }); } catch(_){ }
                }
              })
              .finally(()=>render());
          }
        }
      }
      const toggle = e.target.closest('.sd-toggle-webserial');
      if(toggle){
        const id = toggle.getAttribute('data-id');
        const list = mergedDevices();
        const dev = list.find(d=>d.id===id); if(!dev) return;
        const nextMethod = toggle.checked ? 'serial' : 'http';
        if(dev.method===nextMethod) return;
        const payload = { name:dev.name, host:dev.host, port:dev.com||undefined, meta:{ ...(dev.meta||{}), method: nextMethod } };
        fetch(`/api/device/${encodeURIComponent(id)}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) })
          .then(r=>{ if(r.ok){ const idx = config.customDevices.findIndex(d=>d.id===id); if(idx!==-1){ config.customDevices[idx].method = nextMethod; } if(window.OEPLUtils && typeof window.OEPLUtils.upsertDevice==='function'){ try { window.OEPLUtils.upsertDevice({ id:dev.id, name:dev.name, ip:dev.host, com:dev.com, method:nextMethod }); } catch(_){ } } } })
          .finally(()=>render());
      }
      if(e.target.id==='sd-add'){ addDeviceInteractive(); }
    });
  }

  async function fetchConfig(){
    if(configLoaded) return config;
    try {
      const r = await fetch(CONFIG_URL, { cache:'no-store' });
      if(r.ok){
        const j = await r.json();
        if(j && typeof j === 'object'){
          config.version = j.version||config.version;
          if(Array.isArray(j.customDevices)) config.customDevices = j.customDevices.filter(d=>d && d.id);
          if(j.defaultSelectedDevice) config.defaultSelectedDevice = j.defaultSelectedDevice;
        }
      }
    } catch(_){ /* ignore */ }
    finally { configLoaded = true; }
    // Bridge config devices into OEPLUtils (non-destructive) so global status/probing can use their hosts
    if(window.OEPLUtils && typeof window.OEPLUtils.upsertDevice==='function'){
      try { config.customDevices.forEach(d=> window.OEPLUtils.upsertDevice({ id:d.id, name:d.name, ip:d.host||d.ip, com:d.com })); } catch(_){ }
    }
    return config;
  }

  function init(){
    if(init._ran) return; init._ran = true;
    ensureContainer();
    // Styles now provided in dev/styles.css (Removed dynamic injection)
    bindGlobalHandlers();
    fetchConfig().then(()=> render());
    render(); // initial paint; no periodic refresh (single-load design)
  }

  // Expose minimal API
  window.devSharedDevices = { reload: render, list: mergedDevices, selected: loadSelected, fetchConfig };

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
