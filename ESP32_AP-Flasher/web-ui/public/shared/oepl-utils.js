/*
 * OEPL Shared Utilities (initial extraction)
 * Lightweight, dependency-free helpers shared by /dev and /device UIs.
 * Pattern: UMD-style attachment to window.OEPLUtils so legacy non-module scripts can consume.
 * Incrementally migrate duplicated logic (fetch wrappers, status dots, storage, debounce/throttle, device list sync).
 */
(function(global){
  if(global.OEPLUtils) return; // singleton guard

  const DEFAULT_TIMEOUT = 4000;

  function withTimeout(promise, ms){
    const t = ms || DEFAULT_TIMEOUT;
    return new Promise((resolve, reject)=>{
      const id = setTimeout(()=>reject(new Error('timeout '+t+'ms')), t);
      promise.then(v=>{ clearTimeout(id); resolve(v); }, e=>{ clearTimeout(id); reject(e); });
    });
  }

  async function fetchJSON(url, opts={}){
    const { timeout, retry=0, retryDelay=300, onRetry } = opts;
    let attempt = 0;
    while(true){
      try {
        const r = await withTimeout(fetch(url, opts), timeout);
        if(!r.ok) throw new Error('HTTP '+r.status);
        const ct = r.headers.get('content-type')||'';
        if(ct.includes('application/json')) return await r.json();
        return await r.json().catch(()=>({}));
      } catch(e){
        if(attempt < retry){
          attempt++;
            if(onRetry) try{ onRetry(attempt,e);}catch(_){ }
          await new Promise(res=>setTimeout(res, retryDelay*Math.pow(1.4, attempt-1)));
          continue;
        }
        throw e;
      }
    }
  }

  function updateStatusDot(dotElOrId, textElOrId, ok, label){
    const dot = typeof dotElOrId === 'string'? document.getElementById(dotElOrId): dotElOrId;
    const text = typeof textElOrId === 'string'? document.getElementById(textElOrId): textElOrId;
    if(!dot) return;
    dot.classList.remove('connected','disconnected');
    dot.classList.add(ok? 'connected':'disconnected');
    if(text && label) text.textContent = label;
  }

  function loadLocal(key, def){
    try { const v = localStorage.getItem(key); return v!==null? v: def; } catch(_){ return def; }
  }
  function saveLocal(key, val){ try { localStorage.setItem(key, val); } catch(_){ } }

  function debounce(fn, wait=200){
    let t; return function(...args){ clearTimeout(t); t = setTimeout(()=>fn.apply(this,args), wait); };
  }
  function throttle(fn, interval=200){
    let last=0, pending=null; return function(...args){ const now=Date.now(); if(now-last>=interval){ last=now; fn.apply(this,args);} else { pending = args; if(!pending._sched){ pending._sched=true; setTimeout(()=>{ if(pending){ fn.apply(this,pending); pending=null;} last=Date.now(); }, interval-(now-last)); } } };
  }

  // Simple event bus independent from any framework
  const bus = document.createElement('div');
  function emit(name, detail){ bus.dispatchEvent(new CustomEvent(name,{ detail })); }
  function on(name, handler){ bus.addEventListener(name, handler); }
  function off(name, handler){ bus.removeEventListener(name, handler); }

  // Device cache (optional shared between dev & device UIs)
  const deviceState = { list: [], selectedId: null, lastFetch: 0 };
  function upsertDevice(dev){
    if(!dev || !dev.id) return;
    const idx = deviceState.list.findIndex(d=>d.id===dev.id);
    const norm = { id: dev.id, name: dev.name||dev.id, ip: dev.ip||dev.host||'', com: dev.com||dev.port||'' };
    if(idx>=0){
      // Merge but keep existing props if new ones empty
      const existing = deviceState.list[idx];
      deviceState.list[idx] = {
        id: existing.id,
        name: norm.name || existing.name,
        ip: norm.ip || existing.ip,
        com: norm.com || existing.com
      };
    } else {
      deviceState.list.push(norm);
    }
    // Do not alter selectedId unless currently null or matches this id (preserve selection continuity)
    if(!deviceState.selectedId) deviceState.selectedId = norm.id;
    emit('devices:updated', { devices:[...deviceState.list], selectedId: deviceState.selectedId });
  }
  async function loadDevices(force=false){
    const now = Date.now();
    if(!force && now - deviceState.lastFetch < 5000) return deviceState.list;
    try {
      const j = await fetchJSON('/api/devices',{ timeout:3000, retry:1 });
      if(j && Array.isArray(j.devices)){
        deviceState.list = j.devices.map(d=>({ id:d.id, name:d.name||d.id, ip:d.host||d.ip||'', com:d.port||d.com||'' }));
        deviceState.selectedId = j.selectedId || deviceState.selectedId || (deviceState.list[0] && deviceState.list[0].id) || null;
        deviceState.lastFetch = now;
        emit('devices:updated', { devices:[...deviceState.list], selectedId: deviceState.selectedId });
      }
    }catch(e){ /* swallow */ }
    return deviceState.list;
  }
  function getSelectedDevice(){ return deviceState.list.find(d=>d.id===deviceState.selectedId) || null; }
  function setSelectedDevice(id){ deviceState.selectedId = id; saveLocal('oepl:selectedDevice', id||''); try { fetch('/api/device/select',{ method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ id }) }); } catch(_){ } emit('device:selected', { id }); }

  function computeDeviceBase(){ const d = getSelectedDevice(); if(!d || !d.ip) return null; if(/^https?:\/\//i.test(d.ip)) return d.ip.replace(/\/$/,''); return 'http://'+d.ip.replace(/\/$/,''); }

  async function probeApi(){ const base = computeDeviceBase(); if(!base){ updateStatusDot('api-status-dot','api-status-text',false,'API (no host)'); return false; } try { const ctrl = new AbortController(); setTimeout(()=>ctrl.abort(),2500); const r = await fetch(base+'/sysinfo',{ signal: ctrl.signal }); updateStatusDot('api-status-dot','api-status-text', r.ok, 'API '+(new URL(base).host)); return r.ok; } catch(e){ updateStatusDot('api-status-dot','api-status-text',false,'API '+(new URL(base).host)); return false; } }

  global.OEPLUtils = { fetchJSON, withTimeout, updateStatusDot, loadLocal, saveLocal, debounce, throttle, on, off, emit, loadDevices, upsertDevice, getSelectedDevice, setSelectedDevice, computeDeviceBase, probeApi };
})(window);
