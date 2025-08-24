// Unified boot loader to prevent duplicate script tags across pages.
(function(){
  function detectPageId(){
    const file = (location.pathname.split('/').pop()||'').toLowerCase();
    if(!file || !file.endsWith('.html')) return 'index';
    return file.replace(/\.html$/,'');
  }
  function loadSequential(urls){
    return urls.reduce((p,u)=>p.then(()=>appendScript(u)), Promise.resolve());
  }
  function appendScript(src){
    return new Promise((resolve,reject)=>{
      const s = document.createElement('script');
      s.src = src;
      s.async = false; // preserve order
      s.onload = resolve; s.onerror = ()=>reject(new Error('Failed '+src));
      document.head.appendChild(s);
    });
  }
  function start(){
    if(!window.PageManifest){ console.error('PageManifest missing'); return; }
    const pageId = document.documentElement.getAttribute('data-page') || detectPageId();
    const scripts = window.PageManifest.getScripts(pageId);
    loadSequential(scripts).then(()=>{
      document.dispatchEvent(new CustomEvent('boot:ready',{ detail:{ page:pageId, scripts }}));
    }).catch(err=>{
      console.error('Boot loader error', err);
    });
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
