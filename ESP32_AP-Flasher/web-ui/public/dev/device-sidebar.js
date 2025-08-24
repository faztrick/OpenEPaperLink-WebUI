// Reusable Selected Device Sidebar Component
// Adds a sidebar section (or augments existing sidebars) with the current selected device card
// Depends on app.js having initialized ESP32DevUI (window.App)
(function(){
  const SIDEBAR_ID = 'global-device-sidebar';
  const CARD_HOST_ID = 'global-selected-device-card';
  const STYLE_ID = 'device-sidebar-style';

  function ensureStyles(){
    if(document.getElementById(STYLE_ID)) return;
    const st = document.createElement('style');
    st.id = STYLE_ID;
    st.textContent = `
    #${SIDEBAR_ID}{border:1px solid #30363d;border-radius:8px;padding:12px;background:#161b22;margin-bottom:16px;font-family:Inter,system-ui,Arial,sans-serif}
    #${SIDEBAR_ID} h3{margin:0 0 8px 0;font-size:14px;display:flex;align-items:center;gap:6px;font-weight:600}
    #${SIDEBAR_ID} .device-card{background:#1c2128;border:1px solid #30363d;border-radius:8px;padding:10px;font-size:12px}
    #${SIDEBAR_ID} .device-card.selected{outline:2px solid #238636}
    #${SIDEBAR_ID} .status-dot{width:10px;height:10px;display:inline-block;border-radius:50%;background:#8b949e}
    #${SIDEBAR_ID} .status-online{background:#238636!important}
    #${SIDEBAR_ID} button.icon-btn{cursor:pointer;border:1px solid #30363d;background:#1f242b;color:#e6e6e6;border-radius:6px;padding:4px 8px;font-size:11px;display:inline-flex;align-items:center;gap:4px}
    #${SIDEBAR_ID} button.icon-btn.active{background:#238636;border-color:#238636;color:#fff}
    #${SIDEBAR_ID} .mode-btn-group-selected button{height:28px}
    `;
    document.head.appendChild(st);
  }

  function ensureSidebarContainer(){
    if(document.getElementById(CARD_HOST_ID)) return document.getElementById(CARD_HOST_ID);
    // Try to place inside existing aside.sidebar if present
    let hostSidebar = document.querySelector('.sidebar');
    if(!hostSidebar){
      // Create floating side bar on left
      hostSidebar = document.createElement('aside');
      hostSidebar.className = 'sidebar';
      hostSidebar.style.maxWidth = '280px';
      // Insert before main content if container layout exists
      const mainContainer = document.querySelector('.main-container .main-content')?.parentElement || document.body;
      if(mainContainer.firstChild) mainContainer.insertBefore(hostSidebar, mainContainer.firstChild); else mainContainer.appendChild(hostSidebar);
    }
    const wrapper = document.createElement('div');
    wrapper.id = SIDEBAR_ID;
    wrapper.innerHTML = `<h3><span style="font-size:14px">🔌</span> Selected Device</h3><div id="${CARD_HOST_ID}"><div class="device-card" style="opacity:.6"><em>Loading...</em></div></div>`;
    hostSidebar.prepend(wrapper); // put at top
    return document.getElementById(CARD_HOST_ID);
  }

  function renderSelected(app){
    ensureStyles();
    const host = ensureSidebarContainer();
    if(!app || typeof app.getSelectedDevice !== 'function'){
      host.innerHTML = '<div class="device-card" style="opacity:.6"><em>No app</em></div>';
      return;
    }
    const dev = app.getSelectedDevice();
    if(!dev){
      host.innerHTML = '<div class="device-card" style="opacity:.6"><em>No device selected</em></div>';
      return;
    }
    const commMode = dev.meta?.commMode || 'serial';
    host.innerHTML = `<div class="device-card selected">
      <div style='display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;'>
         <div style='display:flex;align-items:center;gap:8px;'>
             <span class="status-dot status-online"></span>
             <strong>${dev.name || dev.id}</strong>
         </div>
         <button class='icon-btn' data-act='led-off' data-id='${dev.id}' title='LED Off' aria-label='LED Off'>💡✕</button>
      </div>
      <div style='display:flex;flex-wrap:wrap;gap:12px;font-size:11px;margin-bottom:6px;'>
          <div>IP: <span>${dev.ip||'-'}</span></div>
          <div>COM: <span>${dev.com||dev.port||'-'}</span></div>
          <div style='display:flex;align-items:center;gap:6px;'>
              <span style='font-size:10px;opacity:.6;'>Mode</span>
              <div class='mode-btn-group-selected' data-id='${dev.id}' style='display:inline-flex;gap:4px;'>
                  <button class='icon-btn mode-btn ${commMode==='serial'?'active':''}' data-mode='serial' title='Serial mode'>Serial</button>
                  <button class='icon-btn mode-btn ${commMode==='wifi'?'active':''}' data-mode='wifi' title='WiFi mode'>WiFi</button>
              </div>
          </div>
      </div>
      <div class='wifi-line' style='font-size:11px'><small id='wifi-status-${dev.id}'><span class='muted'>WiFi: —</span></small></div>
    </div>`;
    // wire LED button
    host.querySelector("button[data-act='led-off']")?.addEventListener('click', ()=> app.sendLedOff(dev.id));
    // mode buttons
    host.querySelectorAll('.mode-btn-group-selected button.mode-btn').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const m = btn.getAttribute('data-mode');
        app.setDeviceMode(dev.id, m);
      });
    });
    // update wifi status
    try { app.updateDeviceWifiStatus(dev); } catch(e){}
  }

  function attachAppListeners(app){
    if(!app || !app.socket) return;
    if(app.__sidebar_bound) return; // avoid duplicates
    app.__sidebar_bound = true;
    const rerender = ()=> renderSelected(app);
    const events = ['device-selected','device-list','device-removed'];
    events.forEach(ev=>{ try { app.socket.on(ev, rerender); } catch(_){} });
  }

  function initWhenReady(){
    const app = window.App || window.app;
    if(app){
      renderSelected(app);
      attachAppListeners(app);
      // Periodic refresh to capture mode changes that only trigger local re-render
      setInterval(()=> renderSelected(app), 8000);
      return true;
    }
    return false;
  }

  // initial attempt
  if(!initWhenReady()){
    const int = setInterval(()=>{ if(initWhenReady()) clearInterval(int); }, 300);
    setTimeout(()=> clearInterval(int), 15000); // stop polling after 15s
  }
})();
