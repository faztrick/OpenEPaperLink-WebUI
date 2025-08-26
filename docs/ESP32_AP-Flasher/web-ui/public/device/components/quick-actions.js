// quick-actions component script
(function(){
  function init(){
    console.log('[component] quick-actions loaded');
    const scanBtn = document.getElementById('scan-wi-btn');
    if(scanBtn && !scanBtn._bound){
      scanBtn.addEventListener('click', ()=>{
        if(typeof scanWi === 'function') scanWi();
      });
      scanBtn._bound = true;
    }
  }
  init();
})();
