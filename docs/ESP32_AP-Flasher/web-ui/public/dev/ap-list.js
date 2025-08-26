// ap-list.js - renders AP / STA status for all saved devices
// ap-list.js - renders AP / STA status for all saved devices (SPA aware)
(function(global){
  if(global.__OEPL_APLIST_MODULE__) return; // singleton helper
  const MODULE = {};
  const tableBodyId = 'ap-summary-body';
  const refreshBtnId = 'ap-refresh';
  const statusSpanId = 'ap-refresh-status';
  let timer = null;

  function fmt(val, fallback='-') { if(val===null||val===undefined||val==='') return fallback; return val; }
  function escapeHtml(s){ return String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c])); }

  async function loadSummary() {
    const statusEl = document.getElementById(statusSpanId);
    if(statusEl) statusEl.textContent = 'Loading...';
    try {
      const r = await fetch('/api/ap-summary');
      const j = await r.json();
      if(!j.success) throw new Error(j.error||'failed');
      renderSummary(j.devices||[]);
      if(statusEl) statusEl.textContent = `Updated ${new Date().toLocaleTimeString()}`;
    } catch(e){
      if(statusEl) statusEl.textContent = 'Error: '+e.message;
    }
  }

  function renderSummary(list){
    const body = document.getElementById(tableBodyId);
    if(!body) return;
    body.innerHTML='';
    if(!list.length){
      const tr = document.createElement('tr');
      tr.innerHTML = '<td colspan="10" class="muted">No devices</td>';
      body.appendChild(tr);
      return;
    }
    list.forEach(d => {
      const ap = d.ap||{}; const wifi = d.wifi||{};
      const tr = document.createElement('tr');
      const modeBadge = d.mode? `<span class="badge badge-${d.mode.replace('+','-')}">${escapeHtml(d.mode)}</span>` : '<span class="badge">?</span>';
      const apClients = (ap && ap.enabled) ? fmt(ap.clients,0) : '-';
      const apEnabled = ap && ap.enabled ? 'Yes' : 'No';
      const wifiConn = wifi && wifi.connected ? 'Yes' : 'No';
      const errorCell = d.error ? `<span class="err" title="${escapeHtml(d.error)}">${escapeHtml(d.error.split(':')[0])}</span>` : '';
      tr.innerHTML = `
        <td>${escapeHtml(d.id)}</td>
        <td>${escapeHtml(d.host||'')}</td>
        <td>${modeBadge}</td>
        <td>${apEnabled}</td>
        <td>${apClients}</td>
        <td>${wifiConn}</td>
        <td>${escapeHtml(wifi.ssid||'')}</td>
        <td>${wifi.rssi!==undefined? wifi.rssi: ''}</td>
        <td>${escapeHtml(wifi.localIP||wifi.ip||'')}</td>
        <td>${errorCell}</td>
        <td>
          <div style="display:flex;gap:4px;flex-wrap:wrap">
            <button class="btn btn-small" data-act="enable-ap" data-id="${d.id}">AP</button>
            <button class="btn btn-small" data-act="enable-apsta" data-id="${d.id}">AP+STA</button>
            <button class="btn btn-small" data-act="disable-ap" data-id="${d.id}">STA</button>
          </div>
        </td>`;
      body.appendChild(tr);
    });
    bindRowActions();
  }

  function bindRowActions(){
    document.querySelectorAll('[data-act]')?.forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        const act = btn.getAttribute('data-act');
        btn.disabled = true; const old = btn.textContent;
        btn.textContent='...';
        try {
          if(act==='enable-ap') await setMode(id,'ap');
          if(act==='enable-apsta') await setMode(id,'ap+sta');
          if(act==='disable-ap') await setMode(id,'sta');
          await loadSummary();
        } catch(e){ alert('Action failed: '+e.message); }
        finally { btn.disabled=false; btn.textContent=old; }
      });
    });
  }

  async function setMode(id, mode){
    if(mode==='sta') {
      const r = await fetch(`/api/device/${encodeURIComponent(id)}/ap/disable`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({})});
      const j = await r.json(); if(!j.success) throw new Error(j.error||'fail'); return j;
    }
    const r = await fetch(`/api/device/${encodeURIComponent(id)}/ap/enable`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ mode })});
    const j = await r.json(); if(!j.success) throw new Error(j.error||'fail'); return j;
  }

  function startAuto(){
    if(timer) clearInterval(timer);
    timer = setInterval(loadSummary, 15000);
  }

  function init(){
    const root = document.getElementById(tableBodyId);
    if(!root) return; // not on this page
    if(root.dataset.bound === '1') return; // already for this DOM instance
    root.dataset.bound = '1';
    const refreshBtn = document.getElementById(refreshBtnId);
    refreshBtn?.addEventListener('click', () => loadSummary());
    loadSummary();
    startAuto();
  }

  document.addEventListener('DOMContentLoaded', init);
  window.addEventListener('spa:navigated', init);
  global.__OEPL_APLIST_MODULE__ = { init };
})(window);
