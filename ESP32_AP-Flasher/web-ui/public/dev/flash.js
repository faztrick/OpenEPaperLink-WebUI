(function(){
  const socket = io();
  const consoleEl = document.getElementById('console');
  const envEl = document.getElementById('env');
  const portEl = document.getElementById('port');
  const baudEl = document.getElementById('baud');
  const buildBtn = document.getElementById('buildUpload');
  const monitorBtn = document.getElementById('monitor');
  const clearBtn = document.getElementById('clear');
  const hostEl = document.getElementById('host');
  const firmwareFile = document.getElementById('firmware-file');
  const uploadBtn = document.getElementById('upload-firmware');
  const triggerBtn = document.getElementById('trigger-ota');
  const presetBtn = document.getElementById('preset-realtek');
  const smokeCheckbox = document.getElementById('smoke-test');

  let currentProcess = null;

  function log(msg, type='info'){
    const ts = new Date().toISOString();
    consoleEl.textContent += `[${ts}] ${msg}\n`;
    consoleEl.scrollTop = consoleEl.scrollHeight;
  }

  function saveLastPort(p) {
    try { localStorage.setItem('oepl:lastPort', p); } catch(e){}
  }
  function loadLastPort(){ try { return localStorage.getItem('oepl:lastPort') || null } catch(e){ return null } }

  socket.on('connect', ()=>log('Connected to server'));
  socket.on('disconnect', ()=>log('Disconnected'));
  socket.on('process-output', (d)=>{
    log(d.data || d);
  });
  socket.on('process-started', (d)=>{
    currentProcess = d.processId || 'socket';
    log(`Process started: ${d.command || ''}`);
  });
  socket.on('process-finished', (d)=>{
    log(`Process finished (code ${d.exitCode})`);
    currentProcess = null;
  });
  socket.on('serial-data', (d)=>{
    log(`[serial:${d.port}] ${d.data}`);
  });

  buildBtn.addEventListener('click', ()=>{
    if (smokeCheckbox && smokeCheckbox.checked) {
      // Simulate build output
      log('Starting smoke-test build (simulated)...');
      let i=0; const ints = setInterval(()=>{ i++; log(`(sim) build step ${i}`); if (i>8){ clearInterval(ints); log('Simulated build finished (0)'); } }, 400);
      return;
    }

  const args = ['-Environment', envEl.value, '-ComPort', portEl.value, '-BaudRate', baudEl.value];
  socket.emit('run_script', { script: 'compile.py', args });
    log('Requested build+upload...');
    saveLastPort(portEl.value);
  });

  monitorBtn.addEventListener('click', ()=>{
  socket.emit('run_command', { command: 'pio', args: ['device','monitor','--port', portEl.value, '--baud', baudEl.value] });
  log('Started serial monitor...');
  saveLastPort(portEl.value);
  });

  clearBtn.addEventListener('click', ()=>{ consoleEl.textContent = ''; });

  // populate ports from server
  async function refreshPorts(){
    try{
      const r = await fetch('/api/serial/list');
      const j = await r.json();
      if (j.success && Array.isArray(j.ports)){
        portEl.innerHTML = '';
        j.ports.forEach(p=>{ const o=document.createElement('option'); o.value=p.path;o.textContent=p.path;portEl.appendChild(o);});
        const last = loadLastPort(); if (last) { try{ portEl.value = last }catch(e){} }
      }
    }catch(e){/* ignore */}
  }
  refreshPorts();

  // Upload firmware
  if (uploadBtn) uploadBtn.addEventListener('click', async ()=>{
    if (!firmwareFile || !firmwareFile.files || firmwareFile.files.length===0){ alert('Choose a .bin file'); return; }
    const f = firmwareFile.files[0];
    const fd = new FormData(); fd.append('firmware', f, f.name);
    try{
      const res = await fetch('/api/firmware/upload', { method: 'POST', body: fd });
      const j = await res.json();
      if (j.success) { log(`Uploaded: ${j.path}`); firmwareFile.dataset.serverPath = j.path; }
      else log(`Upload failed: ${j.error}`, 'error');
    }catch(err){ log(`Upload error: ${err.message}`, 'error'); }
  });

  // Trigger OTA
  if (triggerBtn) triggerBtn.addEventListener('click', async ()=>{
    const serverPath = firmwareFile && firmwareFile.dataset && firmwareFile.dataset.serverPath;
    const host = hostEl && hostEl.value ? hostEl.value.trim() : null;
    if (!serverPath || !host){ alert('Select firmware and device host'); return; }
    try{
      const res = await fetch('/api/firmware/trigger', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ host, firmwarePath: serverPath }) });
      const j = await res.json();
      if (j.success) log(`OTA triggered: ${JSON.stringify(j.deviceResponse)}`);
      else log(`OTA trigger failed: ${j.error}`, 'error');
    }catch(err){ log(`Trigger error: ${err.message}`, 'error'); }
  });

  // Realtek preset
  if (presetBtn) presetBtn.addEventListener('click', ()=>{
    envEl.value = 'Debug'; portEl.value = 'COM3'; baudEl.value = '115200';
    log('Applied Realtek preset');
    saveLastPort(portEl.value);
  });
})();
