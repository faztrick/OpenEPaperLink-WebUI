// Simple SPA navigation layer: intercept internal dev page links, fetch partial HTML, swap <main|.main-container>.
(function(){
  if(window.__OEPL_SPA_READY__) return; // singleton
  window.__OEPL_SPA_READY__ = true;

  const LOG_PREFIX = '[SPA]';
  const DEV_PAGES_PATTERN = /^(index|wifi|device|ap-list|tags|peers|flash|settings|ai)\.html$/;

  function log(...a){ console.debug(LOG_PREFIX, ...a); }

  function currentContainer(){
    return document.querySelector('main.main-content') || document.querySelector('.main-container') || document.querySelector('main.container') || document.querySelector('main');
  }

  function extractContent(html){
    // Create a DOM from fetched HTML and extract main container and title
    const tpl = document.createElement('template'); tpl.innerHTML = html;
    const newDoc = tpl.content;
    const main = newDoc.querySelector('main.main-content') || newDoc.querySelector('.main-container') || newDoc.querySelector('main.container') || newDoc.querySelector('main');
    const bodyScripts = [...newDoc.querySelectorAll('script[src], script:not([src])')];
    const titleEl = newDoc.querySelector('title');
    const nav = newDoc.querySelector('nav.top-nav');
    return { main, scripts: bodyScripts, title: titleEl? titleEl.textContent: null, nav };
  }

  async function navigate(href, push=true){
    try {
      log('Navigate to', href);
      const res = await fetch(href, { headers: { 'X-OEPL-PARTIAL': '1' } });
      if(!res.ok){ throw new Error('HTTP '+res.status); }
      const text = await res.text();
      const { main, scripts, title, nav } = extractContent(text);
      if(!main){ log('No main in fetched doc, doing full redirect'); location.href = href; return; }
      const container = currentContainer();
      if(container){
        container.replaceWith(main);
      } else {
        // fallback: full replace
        document.body.innerHTML = ''; document.body.appendChild(main);
      }
      // Replace nav active state if nav captured
      if(nav){
        const existingNav = document.querySelector('nav.top-nav');
        if(existingNav) existingNav.replaceWith(nav);
      } else {
        // adjust existing nav links active class
        document.querySelectorAll('nav.top-nav a.nav-link').forEach(a=>{
          if(a.getAttribute('href')===href) a.classList.add('active'); else a.classList.remove('active');
        });
      }
      if(title) document.title = title;
      // Execute page-specific scripts: only those ending with page script names; skip app.js & spa.js duplicates
      const scriptNamesToLoad = [];
      scripts.forEach(s=>{
        const src = s.getAttribute('src');
        if(src){
          if(/app\.js$/.test(src) || /spa\.js$/.test(src)) return; // already loaded
          if(/(wifi|ap-list|device)\.js$/.test(src)) scriptNamesToLoad.push(src);
        }
      });
      // Dynamically import scripts sequentially
      for(const src of scriptNamesToLoad){ await loadScript(src); }
      // Dispatch event so page modules can init themselves if they expose global init
      window.dispatchEvent(new CustomEvent('spa:navigated', { detail: { href } }));
      if(push){ history.pushState({ href }, '', href); }
      focusMain();
    } catch(e){
      console.warn(LOG_PREFIX,'Navigate failed, full reload', e.message); location.href = href; // graceful fallback
    }
  }

  function focusMain(){
    const m = currentContainer(); if(m){ m.setAttribute('tabindex','-1'); m.focus({ preventScroll:false }); }
  }

  function loadScript(src){
    return new Promise((resolve, reject)=>{
      if(document.querySelector(`script[data-spa-loaded="${src}"]`)) return resolve();
      const s = document.createElement('script'); s.src = src; s.async = false; s.dataset.spaLoaded = src;
      s.onload = ()=>resolve(); s.onerror = (e)=>reject(e);
      document.body.appendChild(s);
    });
  }

  function onClick(e){
    if(e.defaultPrevented) return;
    const a = e.target.closest('a.nav-link');
    if(!a) return;
    const href = a.getAttribute('href');
    if(!href) return;
    if(href.startsWith('http') || href.startsWith('#')) return;
    if(!DEV_PAGES_PATTERN.test(href)) return; // only intercept dev pages
    e.preventDefault();
    if(location.pathname.endsWith('/'+href)) return; // already there
    navigate(href, true);
  }

  window.addEventListener('popstate', ev => {
    const href = (ev.state && ev.state.href) || location.pathname.split('/').pop();
    if(DEV_PAGES_PATTERN.test(href)) navigate(href, false);
  });

  document.addEventListener('click', onClick);
  log('SPA layer active');
})();