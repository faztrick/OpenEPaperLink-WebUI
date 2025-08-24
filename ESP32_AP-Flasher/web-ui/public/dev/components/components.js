// components.js - lightweight HTML component loader for dev pages
// Usage: place <div data-include="header"></div> where header/nav/sidebar/modals should appear.
// It will fetch /dev/components/<name>.html and inject, then dispatch 'components:loaded'.
(function(){
  if(window.__DEV_COMPONENT_LOADER__) return; window.__DEV_COMPONENT_LOADER__ = true;

  const CACHE = {};
  const COMPONENTS_PATH = 'components';

  async function fetchComponent(name){
    if(CACHE[name]) return CACHE[name];
    const url = `${COMPONENTS_PATH}/${name}.html`;
    try {
      const res = await fetch(url, { headers:{'X-Dev-Component':'1'} });
      if(!res.ok) throw new Error(res.status+' '+res.statusText);
      const text = await res.text();
      CACHE[name] = text;
      return text;
    } catch(e){
      console.warn('[components] failed to load', name, e);
      return `<!-- component ${name} load failed -->`;
    }
  }

  async function inject(el){
    const name = el.getAttribute('data-include');
    if(!name) return;
    const html = await fetchComponent(name);
    el.outerHTML = html; // replace placeholder wrapper to avoid extra div nesting
  }

  async function loadAll(root=document){
    const placeholders = [...root.querySelectorAll('[data-include]')];
    for(const ph of placeholders){ await inject(ph); }
    // Post-process: apply active class on nav link for current page
    highlightActiveNav();
    document.dispatchEvent(new CustomEvent('components:loaded'));
  }

  function highlightActiveNav(){
    const page = location.pathname.split('/').pop();
    document.querySelectorAll('nav.top-nav a.nav-link').forEach(a=>{
      if(a.getAttribute('href') === page) a.classList.add('active'); else a.classList.remove('active');
    });
  }

  // SPA integration: when spa:navigated fire, ensure components exist (in case nav/main replaced)
  window.addEventListener('spa:navigated', ()=> setTimeout(()=> loadAll(), 0));

  document.addEventListener('DOMContentLoaded', ()=> loadAll());

  window.DevComponents = { reload: loadAll };
})();
