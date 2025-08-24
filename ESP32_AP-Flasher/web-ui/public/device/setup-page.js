// setup-page.js
// Initialization logic for WiFi setup page migrated from legacy inline usage of main.js WiFiSetup
// Relies on main.js (WiFiSetup module) already included via manifest (main.js + core scripts)
(function(){
  const PAGE_ID = 'setup';

  function init(){
    if(!document.documentElement.dataset.page || document.documentElement.dataset.page !== PAGE_ID) return;
    // main.js previously auto-initialized WiFiSetup when detecting setup page elements.
    // We explicitly invoke if available to avoid reliance on legacy DOM heuristics.
    if(window.WiFiSetup && typeof window.WiFiSetup.init === 'function'){
      try { window.WiFiSetup.init(); } catch(e){ console.error('WiFiSetup.init failed', e); }
    }
  }

  window.addEventListener('boot:ready', init, { once:true });
})();
