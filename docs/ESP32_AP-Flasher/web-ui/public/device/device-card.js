// Reusable Device Communication Card Module
// Provides unified device configuration (API or Serial) with WiFi status/scan, LED Off, auto-refresh.
// Persists settings in localStorage under oepl_device_cfg_v1 and exposes context via window.getSharedDeviceContext().
(function(){
  const STORAGE_KEY = 'oepl_device_cfg_v1';
  let cfg = { method:'api', host:'', serialPort:'', lastWifiStatus:null, auto:true, interval:15000, lastUpdated:null };
  let wifiTimer = null; let metaTimer = null; let healthTimer = null; const HEALTH_KEY='oepl_device_health_log_v1';
  function loadCfg(){
    try { const raw = JSON.parse(localStorage.getItem(STORAGE_KEY)||'null'); if(raw) cfg = { ...cfg, ...raw }; } catch(_){ }
  }
  function saveCfg(){ try { localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg)); } catch(_){ } }
  function pushHealth(entry){ try { const arr = JSON.parse(localStorage.getItem(HEALTH_KEY)||'[]'); arr.push({ ...entry, ts: Date.now() }); while(arr.length>300) arr.shift(); localStorage.setItem(HEALTH_KEY, JSON.stringify(arr)); } catch(_){ } }
  function escapeHtml(str){ return String(str||'').replace(/[&<>"]/g,c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c])); }
  function render(container){
    container.innerHTML = `
      <style id="device-card-styles">.device-card *{box-sizing:border-box} .device-card{font:12px system-ui,Arial,sans-serif; background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.08); padding:8px; border-radius:8px; display:flex; flex-direction:column; gap:6px;} .device-card h4{margin:0 0 4px; font-size:13px; letter-spacing:.05em; text-transform:uppercase; opacity:.75;} .dc-row{display:flex; gap:6px; align-items:center;} .dc-row label{font-size:11px; opacity:.7; min-width:64px;} .device-card select,.device-card input{flex:1; background:#0d1117; color:#e6e6e6; border:1px solid #30363d; border-radius:4px; padding:4px 6px; font-size:12px;} .device-card button{background:#30363d; color:#e6e6e6; border:1px solid #3a4149; padding:4px 6px; font-size:14px; line-height:1; border-radius:4px; cursor:pointer; width:30px; height:30px; display:flex; align-items:center; justify-content:center;} .device-card button.primary{background:#238636; border-color:#238636;} .device-card button:disabled{opacity:.35; cursor:not-allowed;} .dc-actions{display:flex; flex-wrap:wrap; gap:6px;} #dc-status{font-size:11px; line-height:1.4; background:#0d1117; border:1px solid #30363d; border-radius:4px; padding:6px; max-height:120px; overflow:auto;} .hidden{display:none !important;} .dc-inline{display:flex; gap:6px; align-items:center;} .dc-inline input[type=number]{width:80px;} .badge-mini{background:#30363d; padding:2px 6px; border-radius:4px; font-size:10px; margin-left:4px;} .icon-btn{font-size:15px;} .icon-btn:hover{background:#3a4149;} </style>
      <div class="device-card">
        <h4>Device Comm <span id="dc-method-badge" class="badge-mini"></span></h4>
        <div class="dc-row">
          <label for="dc-method">Method</label>
          <select id="dc-method">
            <option value="api">Web API</option>
            <option value="serial">Serial</option>
          </select>
        </div>
        <div id="dc-api-fields">
          <div class="dc-row"><label for="dc-host">Host/IP</label><input id="dc-host" placeholder="192.168.x.x" /></div>
          <div class="dc-actions" style="margin-top:4px;">
            <button id="dc-wifi-status" class="icon-btn" type="button" title="WiFi Status" aria-label="WiFi Status">📶</button>
            <button id="dc-wifi-scan" class="icon-btn" type="button" title="WiFi Scan" aria-label="WiFi Scan">📡</button>
          </div>
        </div>
        <div id="dc-serial-fields" class="hidden">
          <div class="dc-row"><label for="dc-port">Port</label><select id="dc-port"></select></div>
          <div class="dc-actions" style="margin-top:4px;">
            <button id="dc-refresh-ports" class="icon-btn" type="button" title="Refresh Ports" aria-label="Refresh Ports">♻️</button>
            <button id="dc-open-port" class="icon-btn" type="button" title="Open Serial" aria-label="Open Serial">🔌</button>
          </div>
        </div>
        <div class="dc-actions" style="margin-top:2px;">
          <button id="dc-led-off" type="button" class="primary icon-btn" title="LED Off" aria-label="LED Off">💡</button>
          <button id="dc-save" type="button" class="icon-btn" title="Save Settings" aria-label="Save Settings">💾</button>
          <button id="dc-refresh" type="button" class="icon-btn" title="Refresh Status" aria-label="Refresh Status">🔄</button>
        </div>
        <div class="dc-inline" style="margin-top:2px;">
          <label style="min-width:unset;">Auto</label><input id="dc-auto" type="checkbox" />
          <label style="min-width:unset;">Every</label><input id="dc-interval" type="number" min="3000" step="1000" value="15000" />
          <span style="font-size:10px; opacity:.6;">ms</span>
        </div>
        <div id="dc-status">No status yet.</div>
        <div id="dc-meta" style="font-size:10px; opacity:.55;">No updates yet.</div>
      </div>`;
    hook(container);
  }
  function hook(container){
    const methodSel = container.querySelector('#dc-method');
    const hostInput = container.querySelector('#dc-host');
    const apiFields = container.querySelector('#dc-api-fields');
    const serialFields = container.querySelector('#dc-serial-fields');
    const portSel = container.querySelector('#dc-port');
    const statusBox = container.querySelector('#dc-status');
    const methodBadge = container.querySelector('#dc-method-badge');
    const autoChk = container.querySelector('#dc-auto');
    const intervalInput = container.querySelector('#dc-interval');
    // Apply cfg
    methodSel.value = cfg.method;
    hostInput.value = cfg.host;
    autoChk.checked = !!cfg.auto;
    intervalInput.value = cfg.interval;
    methodBadge.textContent = cfg.method;
    function updateVisibility(){
      if(methodSel.value==='serial'){ apiFields.classList.add('hidden'); serialFields.classList.remove('hidden'); }
      else { serialFields.classList.add('hidden'); apiFields.classList.remove('hidden'); }
      methodBadge.textContent = methodSel.value;
      cfg.method = methodSel.value; saveCfg(); maybeStartTimer();
    }
    methodSel.addEventListener('change', updateVisibility);
    hostInput.addEventListener('change', ()=>{ cfg.host = hostInput.value.trim(); saveCfg(); maybeStartTimer(true); });
    autoChk.addEventListener('change', ()=>{ cfg.auto = autoChk.checked; saveCfg(); maybeStartTimer(true); });
    intervalInput.addEventListener('change', ()=>{ let v = parseInt(intervalInput.value)||15000; if(v<3000) v=3000; cfg.interval = v; intervalInput.value=v; saveCfg(); maybeStartTimer(true); });
  const btnSave = container.querySelector('#dc-save');
  const btnRefresh = container.querySelector('#dc-refresh');
  const btnLed = container.querySelector('#dc-led-off');
  const btnWifiStatus = container.querySelector('#dc-wifi-status');
  const btnWifiScan = container.querySelector('#dc-wifi-scan');
  const btnPorts = container.querySelector('#dc-refresh-ports');
  const btnOpen = container.querySelector('#dc-open-port');
  btnSave.addEventListener('click', ()=>{ cfg.host = hostInput.value.trim(); cfg.method = methodSel.value; cfg.serialPort = portSel.value; cfg.auto = autoChk.checked; cfg.interval = parseInt(intervalInput.value)||15000; saveCfg(); pushStatus('Settings saved.'); });
  btnRefresh.addEventListener('click', ()=>{ if(cfg.method==='api') guarded(async ()=> fetchWifiStatus(statusBox, hostInput)); else guarded(async ()=> fetchSerialPorts(portSel,statusBox)); });
  btnLed.addEventListener('click', ()=> guarded(async ()=> ledOff(statusBox, methodSel, hostInput, portSel)) );
  btnWifiStatus.addEventListener('click', ()=> guarded(async ()=> fetchWifiStatus(statusBox, hostInput, true)) );
  btnWifiScan.addEventListener('click', ()=> guarded(async ()=> wifiScan(statusBox, hostInput)) );
  btnPorts.addEventListener('click', ()=> guarded(async ()=> fetchSerialPorts(portSel,statusBox,true)) );
  btnOpen.addEventListener('click', ()=> guarded(async ()=> openSerial(portSel,statusBox)) );
    updateVisibility();
    fetchSerialPorts(portSel,statusBox);
  maybeStartTimer();
  startMetaUpdater();
  startHealthMonitor();
  }
  function pushStatus(msg){ const box = document.getElementById('dc-status'); if(box){ box.textContent = msg; } }
  let busy=false; function setBusy(v){ busy=v; const btns=document.querySelectorAll('.device-card button'); btns.forEach(b=> b.disabled=v); }
  async function guarded(fn){ if(busy) return; try { setBusy(true); await fn(); } finally { setBusy(false); } }
  async function fetchSerialPorts(sel,statusBox,force){
    try { const r = await fetch('/api/serial/list'+(force?('?t='+(Date.now())):'')); const j = await r.json(); if(j.success){
      const cur = cfg.serialPort;
      sel.innerHTML = j.ports.map(p=>`<option value="${p.path||p}">${p.path||p}</option>`).join('');
      if(cur && [...sel.options].some(o=>o.value===cur)) sel.value = cur; else cfg.serialPort = sel.value; saveCfg();
      if(statusBox) statusBox.textContent = 'Ports loaded';
    } else { if(statusBox) statusBox.textContent='Port list failed'; }
    } catch(e){ if(statusBox) statusBox.textContent='Port list error: '+e.message; }
  }
  async function openSerial(sel,statusBox){ const port = sel.value; if(!port){ statusBox.textContent='Select port'; return; }
    try { const r = await fetch('/api/serial/reopen',{ method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ path: port }) }); const j = await r.json(); if(j.success){ statusBox.textContent='Serial open '+port; } else { statusBox.textContent='Serial open failed'; } } catch(e){ statusBox.textContent='Serial open error: '+e.message; }
  }
  async function fetchWifiStatus(statusBox, hostInput, manual){ if(busy && !manual) return; const host = hostInput.value.trim(); if(!host){ statusBox.textContent='Enter host first.'; return; }
    statusBox.textContent='Fetching WiFi status...';
    try { const r = await fetch(`/api/device/wifi/status?host=${encodeURIComponent(host)}`); const j = await r.json(); if(j.success){ cfg.lastWifiStatus = j; cfg.lastUpdated = Date.now(); saveCfg(); statusBox.textContent = `WiFi: ${j.connected? 'connected':'disconnected'} SSID=${j.ssid||'-'} RSSI=${j.rssi??'-'} IP=${j.ip||'-'}`; if(manual) statusBox.textContent += ' (manual)'; updateMeta(); } else { statusBox.textContent='WiFi status failed'; }
    } catch(e){ statusBox.textContent='WiFi status error: '+e.message; }
  }
  async function wifiScan(statusBox, hostInput){ const host = hostInput.value.trim(); if(!host){ statusBox.textContent='Enter host first.'; return; }
    statusBox.textContent='Scanning WiFi...';
    try { const r = await fetch(`/api/device/wifi/scan?host=${encodeURIComponent(host)}`); const j = await r.json(); if(j.success){ const list = (j.networks||[]).slice(0,8).map(n=>n.ssid||n).join(', '); statusBox.textContent = `Scan (${(j.networks||[]).length}): ${escapeHtml(list)}`; } else { statusBox.textContent='Scan failed'; }
    } catch(e){ statusBox.textContent='Scan error: '+e.message; }
  }
  async function ledOff(statusBox, methodSel, hostInput, portSel){ if(methodSel.value==='api'){ const host = hostInput.value.trim(); if(!host){ statusBox.textContent='Enter host first.'; return; } statusBox.textContent='Sending LED off...'; try { const r = await fetch('/api/device/cmd',{ method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ host, action:'led_off', params:{} })}); const j = await r.json(); if(j.success){ statusBox.textContent='LED off sent (API).'; } else { statusBox.textContent='LED off failed'; } } catch(e){ statusBox.textContent='LED off error: '+e.message; } }
    else { const port = portSel.value; if(!port){ statusBox.textContent='Select port'; return; } statusBox.textContent='Sending LED off (serial)...'; try { const r = await fetch('/api/serial/write?autoNL=1',{ method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ path: port, data:'led_off' })}); const j = await r.json(); if(j.success){ statusBox.textContent='LED off sent (serial).'; } else { statusBox.textContent='LED off serial failed'; } } catch(e){ statusBox.textContent='LED off serial error: '+e.message; } }
  }
  function maybeStartTimer(reset){ if(reset && wifiTimer){ clearInterval(wifiTimer); wifiTimer=null; }
    if(!cfg.auto) { if(wifiTimer){ clearInterval(wifiTimer); wifiTimer=null; } return; }
    if(cfg.method!=='api' || !cfg.host){ if(wifiTimer){ clearInterval(wifiTimer); wifiTimer=null; } return; }
    if(wifiTimer) return; // already running
    wifiTimer = setInterval(()=>{ if(busy) return; const box=document.getElementById('dc-status'); const hostInput=document.getElementById('dc-host'); if(box && hostInput) fetchWifiStatus(box, hostInput); }, cfg.interval);
  }
  function updateMeta(){ const el = document.getElementById('dc-meta'); if(!el) return; if(!cfg.lastUpdated){ el.textContent='No updates yet.'; return; } const age = Date.now() - cfg.lastUpdated; const sec = Math.floor(age/1000); const stale = age > cfg.interval*2; el.textContent = `Last update: ${new Date(cfg.lastUpdated).toLocaleTimeString()} (${sec}s ago)${stale?' – STALE':''}`; el.style.color = stale ? '#f0883e' : '#8b949e'; }
  function startMetaUpdater(){ if(metaTimer) clearInterval(metaTimer); metaTimer = setInterval(updateMeta, 1000); updateMeta(); }
  function getContext(){ const ctx = { method: cfg.method }; if(cfg.method==='api'){ ctx.host = cfg.host; if(cfg.lastWifiStatus){ ctx.wifi = { connected: cfg.lastWifiStatus.connected, ip: cfg.lastWifiStatus.ip, ssid: cfg.lastWifiStatus.ssid, rssi: cfg.lastWifiStatus.rssi }; } if(cfg.lastUpdated){ ctx.lastStatusAgeMs = Date.now()-cfg.lastUpdated; } } else { ctx.serialPort = cfg.serialPort; } return ctx; }
  function startHealthMonitor(){ if(healthTimer) clearInterval(healthTimer); healthTimer = setInterval(async ()=>{ if(busy) return; if(cfg.method!=='api' || !cfg.host) return; try { const ctrl=new AbortController(); const to=setTimeout(()=>ctrl.abort(),2500); const r=await fetch(`/api/device/wifi/status?host=${encodeURIComponent(cfg.host)}`, { method:'GET', signal: ctrl.signal }); clearTimeout(to); if(r.ok) pushHealth({ ok:true }); else pushHealth({ ok:false, code:r.status }); } catch(e){ pushHealth({ ok:false, err:(e&&e.name)||'err' }); } }, Math.max(15000, cfg.interval)); }
  // ensure health monitor runs if widget already started
  startHealthMonitor();
  // Public initializer
  window.initDeviceCard = function(opts){ loadCfg(); const id = opts && opts.containerId || 'device-card-container'; const el = document.getElementById(id); if(!el){ console.warn('DeviceCard: container not found', id); return; } render(el); };
  window.getSharedDeviceContext = getContext;
  // Auto-init if container present and not already initialized.
  document.addEventListener('DOMContentLoaded', ()=>{
    try {
      const el = document.getElementById('device-card-container');
      if(el && !el.dataset.dcInit){
        el.dataset.dcInit = '1';
        if(!el.firstElementChild || !el.querySelector('.device-card')){
          window.initDeviceCard({ containerId: 'device-card-container' });
        }
      }
    } catch(e){ console.warn('DeviceCard auto-init failed', e); }
  });
})();
