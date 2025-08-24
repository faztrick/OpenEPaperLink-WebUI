// dev-common.js
// Centralized header + device / communication management for all dev pages.
(function(global){
  if(global.__OEPL_DEV_COMMON__) return; // singleton
  const STATE = {
    devices: [],
    selectedId: null,
    commMode: 'serial',
    commPort: '',
    lastPortsRefresh: 0
  };

  const LS_KEYS = {
    selectedId: 'oepl:dev:selectedDevice',
    commMode: 'oepl:dev:commMode',
    commPort: 'oepl:dev:commPort'
  };

  function loadPersisted(){
    try {
      STATE.selectedId = localStorage.getItem(LS_KEYS.selectedId) || STATE.selectedId;
      STATE.commMode = localStorage.getItem(LS_KEYS.commMode) || STATE.commMode;
      STATE.commPort = localStorage.getItem(LS_KEYS.commPort) || STATE.commPort;
    } catch(_){}
  }
  function persist(){
    try {
      localStorage.setItem(LS_KEYS.selectedId, STATE.selectedId||'');
      localStorage.setItem(LS_KEYS.commMode, STATE.commMode||'serial');
      localStorage.setItem(LS_KEYS.commPort, STATE.commPort||'');
    } catch(_){}
  }

  function headerEls(){
    return {
      deviceSel: document.getElementById('header-device-select'),
      commModeSel: document.getElementById('header-comm-mode'),
      commPortSel: document.getElementById('header-comm-port'),
      apiDot: document.getElementById('api-status-dot'),
      apiText: document.getElementById('api-status-text'),
      wsDot: document.getElementById('ws-status-dot'),
      wsText: document.getElementById('ws-status-text'),
      serialDot: document.getElementById('serial-status-dot'),
      serialText: document.getElementById('serial-status-text')
    };
  }

  async function loadDevices(){
    try {
      const r = await fetch('/api/devices');
      if(!r.ok) throw new Error('HTTP '+r.status);
      const j = await r.json();
      if(j && Array.isArray(j.devices)){
        STATE.devices = j.devices.map(d=>({ id:d.id, name:d.name||d.id, ip:d.host||d.ip||'', com:d.port||d.com||'' }));
        if(!STATE.selectedId) STATE.selectedId = j.selectedId || (STATE.devices[0] && STATE.devices[0].id) || null;
        populateDeviceSelect();
        dispatch('devices:updated',{ devices: STATE.devices, selectedId: STATE.selectedId });
      }
    }catch(e){ console.warn('[dev-common] loadDevices failed', e); }
  }

  function populateDeviceSelect(){
    const { deviceSel } = headerEls();
    if(!deviceSel) return;
    deviceSel.innerHTML='';
    if(STATE.devices.length===0){
      const o=document.createElement('option'); o.value=''; o.textContent='No devices'; deviceSel.appendChild(o); return;
    }
    STATE.devices.forEach(d=>{ const o=document.createElement('option'); o.value=d.id; o.textContent=d.name; deviceSel.appendChild(o); });
    if(STATE.selectedId){ try{ deviceSel.value = STATE.selectedId; }catch(_){}}
  }

  async function refreshComPorts(force=false){
    const now = Date.now();
    if(!force && (now - STATE.lastPortsRefresh < 3000)) return; // throttle
    STATE.lastPortsRefresh = now;
    const { commPortSel } = headerEls(); if(!commPortSel) return;
    try {
      const r = await fetch('/api/com-ports');
      if(!r.ok) throw new Error('HTTP '+r.status);
      const ports = await r.json();
      commPortSel.innerHTML='';
      const list = Array.isArray(ports)?ports:[];
      if(list.length){
        list.forEach(p=>{ const val=p.path||p; const o=document.createElement('option'); o.value=val; o.textContent=val; commPortSel.appendChild(o); });
      } else {
        ['COM3','COM5','COM10','COM13'].forEach(v=>{ const o=document.createElement('option'); o.value=v; o.textContent=v; commPortSel.appendChild(o); });
      }
      if(STATE.commPort){ try{ commPortSel.value = STATE.commPort; }catch(_){}}
      if(!commPortSel.value && commPortSel.options.length) STATE.commPort = commPortSel.value;
      persist();
      dispatch('com:updated',{ port: STATE.commPort });
    }catch(e){ console.warn('[dev-common] refreshComPorts failed', e); }
  }

  function setStatus(dotEl, textEl, ok, label){
    if(!dotEl) return;
    dotEl.classList.remove('connected','disconnected');
    dotEl.classList.add(ok?'connected':'disconnected');
    if(textEl && label) textEl.textContent = label;
  }

  function computeDeviceBase(){
    const d = STATE.devices.find(dd=>dd.id===STATE.selectedId);
    if(!d || !d.ip) return null;
    if(/^https?:\/\//i.test(d.ip)) return d.ip.replace(/\/$/,'');
    return 'http://'+d.ip.replace(/\/$/,'');
  }

  async function probeApi(){
    const base = computeDeviceBase();
    const { apiDot, apiText } = headerEls();
    if(!base){ setStatus(apiDot, apiText, false, 'API (no host)'); return; }
    try {
      const ctrl = new AbortController();
      setTimeout(()=>ctrl.abort(), 2500);
      const r = await fetch(base+'/sysinfo',{ signal: ctrl.signal });
      setStatus(apiDot, apiText, r.ok, 'API '+ (new URL(base).host));
    }catch(e){ setStatus(apiDot, apiText, false, 'API '+(new URL(base).host)); }
  }

  function initSocket(){
    if(global.__OEPL_SOCKET_INIT) return;
    const sock = global.__OEPL_SOCKET || io();
    global.__OEPL_SOCKET = sock;
    global.__OEPL_SOCKET_INIT = true;
    const { wsDot, wsText } = headerEls();
    sock.on('connect', ()=> setStatus(wsDot, wsText, true, 'WS connected'));
    sock.on('disconnect', ()=> setStatus(wsDot, wsText, false, 'WS disconnected'));
  }

  function bindHeaderEvents(){
    const { deviceSel, commModeSel, commPortSel } = headerEls();
    if(deviceSel){
      deviceSel.addEventListener('change', ()=>{
        STATE.selectedId = deviceSel.value || null; persist(); dispatch('device:changed',{ id: STATE.selectedId }); probeApi();
        // Persist selection to backend (mirrors legacy app.js behavior) so other clients/processes stay in sync
        if(STATE.selectedId){
          try {
            fetch('/api/device/select', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ id: STATE.selectedId }) });
          } catch(e){ /* ignore network errors */ }
        }
      });
    }
    if(commModeSel){
      commModeSel.value = STATE.commMode;
      commModeSel.addEventListener('change', ()=>{ STATE.commMode = commModeSel.value; persist(); dispatch('comm:mode',{ mode: STATE.commMode }); });
    }
    if(commPortSel){
      commPortSel.addEventListener('change', ()=>{ STATE.commPort = commPortSel.value; persist(); dispatch('comm:port',{ port: STATE.commPort }); });
    }
  }

  function dispatch(name, detail){
    document.dispatchEvent(new CustomEvent('dev-common:'+name,{ detail }));
  }

  function init(){
    loadPersisted();
    populateDeviceSelect();
    bindHeaderEvents();
    initSocket();
    loadDevices().then(()=> probeApi());
    refreshComPorts();
    // periodic refresh (devices + ports)
    setInterval(()=>{ loadDevices(); refreshComPorts(); probeApi(); }, 15000);
  }

  document.addEventListener('DOMContentLoaded', init);
  window.addEventListener('spa:navigated', ()=> setTimeout(init,0));

  global.__OEPL_DEV_COMMON__ = {
    getState: ()=>({ ...STATE }),
    computeDeviceBase,
    refreshDevices: loadDevices,
    refreshPorts: refreshComPorts
  };
})(window);
