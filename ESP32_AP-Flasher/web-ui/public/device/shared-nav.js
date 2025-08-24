// Shared navigation injection module
// Inserts a consistent header/navigation bar across pages and exposes lifecycle hooks.
(function(){
  const NAV_KEY = 'oepl_last_nav';
  const LINKS = [
    { href:'index.html', label:'Dashboard' },
    { href:'tag_control_panel.html', label:'Tag Control' },
    { href:'tags.html', label:'Tags' },
    { href:'flasher.html', label:'Flasher' },
    { href:'nrf52_swd.html', label:'nRF52 SWD' },
    { href:'c6_module.html', label:'C6 Module' },
    { href:'ai-agent.html', label:'AI Assistant' },
    { href:'ai-tools.html', label:'AI Tools' },
    { href:'updates.html', label:'Updates' },
    { href:'settings.html', label:'Settings' },
    { href:'logs.html', label:'Logs' },
    { href:'edit.html', label:'Editor' },
    { href:'jsontemplate-demo-v2.html', label:'Templates' }
  ];
  function buildLinks(){
    const cur = location.pathname.split('/').pop() || 'index.html';
    return LINKS.map(l=>`<a href="${l.href}" class="${cur===l.href?'active':''}">${l.label}</a>`).join('');
  }
  function buildNav(){
    return `\n<header class="oepl-nav">\n  <div class="nav-left">\n    <div class="brand" title="OpenEPaperLink">📰 <span>OpenEPL</span></div>\n    <nav class="nav-links">${buildLinks()}<span class="nav-more-sep"></span></nav>\n  </div>\n  <div class="nav-right">\n    <span id="nav-device-target" class="nav-pill" title="Current target">${getDeviceTarget()||'—'}</span>\n    <button id="nav-open-device" title="Scroll to device card" class="nav-icon">🔧</button>\n  </div>\n</header>`; }
  // Removed device method pill (nav-device-method) per request; device method now implicit and not shown in nav.
  function getDeviceTarget(){ try { const cfg = JSON.parse(localStorage.getItem('oepl_device_cfg_v1')||'null'); if(!cfg) return ''; return cfg.method==='api'? (cfg.host||'') : (cfg.serialPort||''); } catch(_){ return ''; } }
  function inject(){
    if(document.querySelector('.oepl-nav')) return; // already
    const wrap = document.createElement('div');
    wrap.innerHTML = buildNav();
    document.body.prepend(wrap.firstElementChild);
    attachHandlers();
    persist();
  }
  function attachHandlers(){
    const btn = document.getElementById('nav-open-device');
    if(btn){ btn.addEventListener('click', ()=>{
      const el = document.getElementById('device-card-container');
      if(el){ el.scrollIntoView({behavior:'smooth', block:'center'}); el.classList.add('nav-flash'); setTimeout(()=> el.classList.remove('nav-flash'), 1600); }
    }); }
  }
  function persist(){ try { localStorage.setItem(NAV_KEY, Date.now()); } catch(_){ } }
  function refreshPills(){ const t=document.getElementById('nav-device-target'); if(t) t.textContent=getDeviceTarget()||'—'; refreshActive(); }
  function refreshActive(){ const cur = location.pathname.split('/').pop() || 'index.html'; document.querySelectorAll('.oepl-nav .nav-links a').forEach(a=>{ if(a.getAttribute('href')===cur) a.classList.add('active'); else a.classList.remove('active'); }); }
  window.oeplSharedNav = { refreshPills };
  const style = document.createElement('style');
  style.textContent = `.oepl-nav{position:sticky;top:0;z-index:200;display:flex;justify-content:space-between;align-items:center;padding:6px 14px;background:#161b22;border-bottom:1px solid #30363d;font:13px system-ui,Arial,sans-serif;} .oepl-nav .brand{font-weight:600;display:flex;align-items:center;gap:6px;} .oepl-nav .nav-links{display:flex;gap:14px;margin-left:20px;flex-wrap:wrap;} .oepl-nav .nav-links a{color:#e6e6e6;text-decoration:none;opacity:.7;padding:4px 6px;border-radius:4px;transition:background .15s,opacity .15s;} .oepl-nav .nav-links a.active{background:#238636;opacity:1;} .oepl-nav .nav-links a:hover{opacity:1;background:#30363d;} .oepl-nav .nav-right{display:flex;align-items:center;gap:8px;} .nav-pill{background:#30363d;padding:3px 8px;border-radius:20px;font-size:11px;} .nav-icon{background:#30363d;border:1px solid #3a4149;color:#e6e6e6;cursor:pointer;border-radius:4px;font-size:16px;width:32px;height:32px;display:flex;align-items:center;justify-content:center;} .nav-icon:hover{background:#3a4149;} .nav-flash{outline:2px solid #58a6ff;transition:outline-color 1.2s;} @media (max-width:900px){ .oepl-nav .nav-links{max-height:90px;overflow:auto;} } @media (max-width:700px){ .oepl-nav{flex-wrap:wrap;gap:8px;} .oepl-nav .nav-links{flex:1 1 100%; order:3;} }`;
  document.head.appendChild(style);
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', inject); else inject();
  // Periodic pill refresh (in case device context changes)
  setInterval(refreshPills, 4000);
})();
