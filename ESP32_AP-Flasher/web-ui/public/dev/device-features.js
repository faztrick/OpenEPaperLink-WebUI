// device-features.js
// Lightweight feature discovery module for device.html
(function(){
  if(window.__DEVICE_FEATURES_INIT) return; window.__DEVICE_FEATURES_INIT = true;
  const GRID_ID = 'features-grid';
  const STATUS_ID = 'features-status';
  const REFRESH_ID = 'refresh-features';

  function el(id){ return document.getElementById(id); }

  function render(features){
    const grid = el(GRID_ID); if(!grid) return;
    grid.innerHTML = '';
    if(!features || Object.keys(features).length===0){
      grid.innerHTML = '<div style="grid-column:1/-1;font-size:12px" class="muted">No features reported.</div>';
      return;
    }
    Object.keys(features).sort().forEach(key=>{
      const val = features[key];
      const card = document.createElement('div');
      const ok = !!val && val !== '0' && val !== 'false';
      card.style.padding='8px';
      card.style.border='1px solid '+(ok?'#16a34a':'#dc2626');
      card.style.borderRadius='6px';
      card.style.background= ok? 'rgba(16,185,129,0.08)':'rgba(220,38,38,0.08)';
      card.style.fontSize='12px';
      card.innerHTML = `<strong style="display:block;margin-bottom:4px">${key}</strong><span style="color:${ok?'#16a34a':'#dc2626'}">${ok?'ENABLED':'MISSING'}</span>`;
      grid.appendChild(card);
    });
  }

  async function load(){
    const statusEl = el(STATUS_ID); if(statusEl) statusEl.textContent = 'Loading...';
    try {
      const base = window.__OEPL_DEV_COMMON__?.computeDeviceBase();
      if(!base){ if(statusEl) statusEl.textContent='No device base URL'; render({}); return; }
      const ctrl = new AbortController(); setTimeout(()=>ctrl.abort(), 4000);
      const resp = await fetch(base+'/api/features',{ signal: ctrl.signal });
      if(!resp.ok) throw new Error('HTTP '+resp.status);
      let data = await resp.json();
      // Accept both list or object; normalize to object of {name:1}
      if(Array.isArray(data)){
        data = data.reduce((acc,k)=>{ acc[k]=1; return acc; },{});
      }
      render(data.features || data);
      if(statusEl) statusEl.textContent = 'OK';
      setTimeout(()=>{ if(statusEl && statusEl.textContent==='OK') statusEl.textContent=''; }, 1500);
    }catch(e){
      console.warn('[device-features] load failed', e);
      if(el(STATUS_ID)) el(STATUS_ID).textContent = 'Error';
      render({});
    }
  }

  function init(){
    if(!el(GRID_ID)) return; // only on device.html
    const btn = el(REFRESH_ID); if(btn) btn.addEventListener('click', load);
    document.addEventListener('dev-common:device:changed', load);
    // initial
    load();
  }

  document.addEventListener('DOMContentLoaded', init);
  window.addEventListener('spa:navigated', ()=> setTimeout(init,0));
})();
