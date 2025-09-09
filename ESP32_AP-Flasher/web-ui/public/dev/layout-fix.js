// Dynamically measure header and nav heights and update CSS variables
(function(){
  let lastHeaderH = 0, lastNavH = 0;
  function applyHeights(force=false){
    const header = document.querySelector('.header');
    const nav = document.querySelector('.top-nav');
    if(!header || !nav) return;
    const headerH = Math.round(header.getBoundingClientRect().height);
    const navH = Math.round(nav.getBoundingClientRect().height);
    if(!force && headerH === lastHeaderH && navH === lastNavH) return; // skip if unchanged
    lastHeaderH = headerH; lastNavH = navH;
    const root = document.documentElement;
    root.style.setProperty('--header-height', headerH + 'px');
    root.style.setProperty('--nav-height', navH + 'px');
  }
  let rafPending = false;
  function schedule(force=false){
    if(rafPending) return;
    rafPending = true;
    requestAnimationFrame(()=>{ rafPending=false; applyHeights(force); });
  }
  window.addEventListener('resize', ()=>schedule());
  document.addEventListener('DOMContentLoaded', ()=>schedule(true));
  window.addEventListener('load', ()=>schedule(true));
  // Support SPA / dynamic navigation: expose global
  window.updateLayoutHeights = ()=>schedule(true);
  // Observe size changes (e.g., fonts loaded, dynamic content)
  if('ResizeObserver' in window){
    const ro = new ResizeObserver(()=>schedule());
    ['.header','.top-nav'].forEach(sel=>{
      const el = document.querySelector(sel);
      if(el) ro.observe(el);
    });
  } else {
    // MutationObserver fallback
    const mo = new MutationObserver(()=>schedule());
    ['.header','.top-nav'].forEach(sel=>{
      const el = document.querySelector(sel);
      if(el) mo.observe(el,{childList:true,subtree:true,attributes:true});
    });
  }
  // Initial asap run
  schedule(true);
})();
