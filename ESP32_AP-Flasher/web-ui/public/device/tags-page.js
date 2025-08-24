// tags-page.js - initialization and periodic status updates for tags page
(function(){
  function init(){
    // Load initial tag database
    if(typeof loadTags === 'function'){
      try { loadTags(0); } catch(e){ console.error('loadTags failed', e); }
    }
    // If a custom page init exists (legacy hook), call it
    if(typeof window.initTagsPage === 'function'){
      try { window.initTagsPage(); } catch(e){ console.error('initTagsPage error', e); }
    }
    // Kick off status update timers
    setTimeout(()=>{
      updateCompactHeaderStatus();
      updateFooterStatus();
      updateHeaderUptime();
      setInterval(updateCompactHeaderStatus, 5000);
      setInterval(updateFooterStatus, 10000);
      setInterval(updateHeaderUptime, 60000);
    }, 1000);
  }
  // Expose update helpers if they exist in global scope (copied from legacy inline script).
  function updateCompactHeaderStatus(){
    if(!fetch) return;
    fetch('get_ap_config')
      .then(r=>r.json())
      .then(data=>{
        const systemDot = document.getElementById('systemDot');
        const systemStatus = document.getElementById('systemStatus');
        const tagCount = document.getElementById('tagCount');
        const wifiStatus = document.getElementById('wifiStatus');
        if(systemDot && systemStatus && data.apstate !== undefined){
          if (data.apstate === 1) { systemDot.className = 'status-dot online'; systemStatus.textContent = 'Online'; }
          else if (data.apstate === 2) { systemDot.className = 'status-dot warning'; systemStatus.textContent = 'Flashing'; }
          else if (data.apstate === 5) { systemDot.className = 'status-dot offline'; systemStatus.textContent = 'Failed'; }
          else { systemDot.className = 'status-dot warning'; systemStatus.textContent = 'Starting'; }
        }
        if(tagCount){
          try { const totalTags = Object.keys(window.tagDB||{}).length; tagCount.textContent = `${totalTags} Tags`; } catch(e){}
        }
        if(wifiStatus){ wifiStatus.textContent = data.wifiConnected ? 'Connected' : 'Disconnected'; }
      })
      .catch(err=>console.error('Status update error:',err));
  }
  function updateFooterStatus(){
    const footerTimestamp = document.getElementById('footerTimestamp');
    if(footerTimestamp) footerTimestamp.textContent = 'Last updated: ' + new Date().toLocaleTimeString();
  }
  function updateHeaderUptime(){
    const uptimeDisplay = document.getElementById('uptimeDisplay');
    if(uptimeDisplay){
      const now = new Date();
      uptimeDisplay.textContent = String(now.getHours()).padStart(2,'0')+':'+String(now.getMinutes()).padStart(2,'0');
    }
  }
  document.addEventListener('boot:ready', function(ev){
    if(ev.detail.page === 'tags'){ init(); }
  });
})();
