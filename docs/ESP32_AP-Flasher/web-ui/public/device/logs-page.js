// Logs page controller: live stream device logs via Socket.IO and send text to device TFT
(function(){
  let ioSocket;
  let followActive = false;
  let lastInitialRendered = false;

  function byId(id){ return document.getElementById(id); }
  function appendLine(text, cls){
    const ul = byId('messages');
    if(!ul) return;
    const li = document.createElement('li');
    if(cls) li.className = cls;
    li.textContent = text;
    ul.appendChild(li);
    ul.scrollTop = ul.scrollHeight;
  }
  function appendLines(lines){
    const ul = byId('messages');
    if(!ul || !Array.isArray(lines)) return;
    const frag = document.createDocumentFragment();
    for(const s of lines){
      const li = document.createElement('li');
      li.textContent = s;
      frag.appendChild(li);
    }
    ul.appendChild(frag);
    ul.scrollTop = ul.scrollHeight;
  }

  function ensureSocket(){
    if(ioSocket) return ioSocket;
    try {
      ioSocket = window.io();
      ioSocket.on('connect', () => {
        console.log('socket.io connected', ioSocket.id);
      });
      ioSocket.on('disconnect', () => {
        console.log('socket.io disconnected');
      });
      ioSocket.on('device-log', (payload) => {
        const { host, lines, count, error } = payload || {};
        if(error){
          appendLine(`[${host||''}] ${error}`, 'error');
          return;
        }
        if(Array.isArray(lines)){
          // First render after follow: render initial set only once
          if(!lastInitialRendered){
            byId('messages').innerHTML = '';
            appendLines(lines);
            lastInitialRendered = true;
          } else {
            // subsequent polls: add any new tail set naively
            appendLines(lines);
          }
        }
      });
    } catch (e){ console.error('socket.io init failed', e); }
    return ioSocket;
  }

  async function fetchOnce(host, n){
    try {
      const url = `/api/device/logs/tail?host=${encodeURIComponent(host)}&lines=${encodeURIComponent(n)}`;
      const resp = await fetch(url);
      const j = await resp.json();
      if(!j.success){ appendLine(j.error || 'fetch failed', 'error'); return; }
      const arr = (j.data && j.data.lines) || [];
      byId('messages').innerHTML = '';
      appendLines(arr);
    } catch(e){ appendLine(String(e), 'error'); }
  }

  async function tftPrint(host, text){
    try {
      const resp = await fetch('/api/device/tft/print', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ host, text })
      });
      const j = await resp.json();
      if(!j.success){ appendLine(j.error || 'tft print failed', 'error'); return; }
      appendLine(`[${host}] sent to TFT: ${text}`, 'info');
    } catch(e){ appendLine(String(e), 'error'); }
  }

  function startFollow(){
    const host = (byId('deviceHost')?.value || '').trim();
    const lines = parseInt(byId('tailLines')?.value, 10) || 200;
    if(!host){ appendLine('Enter device IP', 'warning'); return; }
    const s = ensureSocket();
    if(!s) return;
    lastInitialRendered = false;
    s.emit('device-log-follow', { host, lines, intervalMs: 1500 });
    followActive = true;
    appendLine(`Following ${host} (last ${lines} lines)`);
  }
  function stopFollow(){
    const host = (byId('deviceHost')?.value || '').trim();
    const s = ensureSocket();
    if(!s) return;
    s.emit('device-log-unfollow', { host });
    followActive = false;
    appendLine(`Stopped following ${host}`);
  }

  function init(){
    const btnFollow = byId('btnFollow');
    const btnUnfollow = byId('btnUnfollow');
    const btnFetchOnce = byId('btnFetchOnce');
    const btnTftPrint = byId('btnTftPrint');

    if(btnFollow) btnFollow.addEventListener('click', startFollow);
    if(btnUnfollow) btnUnfollow.addEventListener('click', stopFollow);
    if(btnFetchOnce) btnFetchOnce.addEventListener('click', () => {
      const host = (byId('deviceHost')?.value || '').trim();
      const lines = parseInt(byId('tailLines')?.value, 10) || 200;
      if(!host){ appendLine('Enter device IP', 'warning'); return; }
      fetchOnce(host, lines);
    });
    if(btnTftPrint) btnTftPrint.addEventListener('click', () => {
      const host = (byId('deviceHost')?.value || '').trim();
      const text = (byId('tftText')?.value || '').slice(0, 240);
      if(!host){ appendLine('Enter device IP', 'warning'); return; }
      if(!text){ appendLine('Enter text to send to TFT', 'warning'); return; }
      tftPrint(host, text);
    });

    // Try to prefill host from query (?host=...)
    try {
      const url = new URL(window.location.href);
      const h = url.searchParams.get('host');
      if(h) byId('deviceHost').value = h;
    } catch(e) {}

    ensureSocket();
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', init);
  } else { init(); }
})();
