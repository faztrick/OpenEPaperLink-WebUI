// Lightweight component loader: scans for [data-component] elements and injects HTML partials from ./components/<name>.html
(function(){
  async function loadComponent(el){
    const name = el.getAttribute('data-component');
    if(!name) return;
    const url = `components/${name}.html`;
    try {
      const resp = await fetch(url, { cache: 'no-cache' });
      if(!resp.ok) throw new Error(`${resp.status} ${resp.statusText}`);
      const html = await resp.text();
      el.innerHTML = html;
      el.setAttribute('data-component-loaded','1');
      // If a matching JS file exists (convention components/<name>.js) load it once.
      const jsUrl = `components/${name}.js`;
      // speculative request with HEAD first to avoid console 404 noise
      try {
        const head = await fetch(jsUrl, { method:'HEAD' });
        if(head.ok){
          await new Promise((resolve,reject)=>{
            const s = document.createElement('script');
            s.src = jsUrl + '?v='+Date.now();
            s.onload = resolve; s.onerror = reject; document.head.appendChild(s);
          });
          if(window && typeof window.__onComponentLoaded === 'function'){
            window.__onComponentLoaded(name, el);
          }
        }
      } catch(_){ /* ignore missing js */ }
    } catch(e){
      console.warn('Component load failed', name, e.message);
      el.innerHTML = `<div class="component-error">Failed to load component '${name}'</div>`;
      el.setAttribute('data-component-error','1');
    }
  }
  async function loadAll(){
    const nodes = document.querySelectorAll('[data-component]');
    for(const el of nodes){ await loadComponent(el); }
    document.dispatchEvent(new CustomEvent('componentsLoaded'));
  }
  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', loadAll);
  } else {
    loadAll();
  }
})();
