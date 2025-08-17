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
    const ts = new Date().toLocaleTimeString();
    const line = document.createElement('div');
    line.className = `log-line log-${type}`;
    line.textContent = `[${ts}] ${msg}`;
    consoleEl.appendChild(line);
    consoleEl.scrollTop = consoleEl.scrollHeight;

    // Limit console lines
    const lines = consoleEl.querySelectorAll('.log-line');
    if (lines.length > 1000) {
      lines[0].remove();
    }
  }

  function saveLastPort(p) {
    try { localStorage.setItem('oepl:lastPort', p); } catch(e){}
  }
  function loadLastPort(){ try { return localStorage.getItem('oepl:lastPort') || null } catch(e){ return null } }

  socket.on('connect', ()=>log('Connected to server', 'success'));
  socket.on('disconnect', ()=>log('Disconnected from server', 'warning'));
  socket.on('connect_error', (err)=>log(`Connection error: ${err.message}`, 'error'));

  socket.on('output', (d)=>{
    if (d && d.data) {
      log(d.data, d.type || 'info');
    }
  });

  socket.on('process_complete', (d)=>{
    currentProcess = null;
    updateButtons();
    if (d.success) {
      log('Process completed successfully', 'success');
    } else {
      log(`Process failed: ${d.error || 'Unknown error'}`, 'error');
    }
  });

  socket.on('process-output', (d)=>{
    if (d && d.data) {
      log(d.data, d.type || 'info');
    }
  });

  socket.on('process-started', (d)=>{
    currentProcess = d.processId || 'socket';
    updateButtons();
    log(`Process started: ${d.command || d.action || 'Unknown process'}`, 'info');
  });

  socket.on('process-finished', (d)=>{
    log(`Process finished with exit code: ${d.exitCode}`, d.exitCode === 0 ? 'success' : 'error');
    currentProcess = null;
    updateButtons();
  });

  socket.on('serial-data', (d)=>{
    if (d && d.data) {
      log(`[${d.port || 'serial'}] ${d.data}`, 'info');
    }
  });

  function updateButtons() {
    const buttons = [buildBtn, monitorBtn, uploadBtn, triggerBtn];
    buttons.forEach(btn => {
      if (btn) {
        btn.disabled = !!currentProcess;
      }
    });
  }

  buildBtn.addEventListener('click', ()=>{
    if (currentProcess) {
      log('Another process is already running', 'warning');
      return;
    }

    if (smokeCheckbox && smokeCheckbox.checked) {
      // Simulate build output
      log('Starting smoke-test build (simulated)...', 'info');
      currentProcess = 'smoke-test';
      updateButtons();
      let i=0;
      const ints = setInterval(()=>{
        i++;
        log(`[simulation] Build step ${i}/10 - Processing...`, 'info');
        if (i>=10){
          clearInterval(ints);
          log('✓ Simulated build completed successfully', 'success');
          currentProcess = null;
          updateButtons();
        }
      }, 800);
      return;
    }

    const args = ['-Environment', envEl.value, '-ComPort', portEl.value, '-BaudRate', baudEl.value];
    socket.emit('run_script', { script: 'compile.py', args });
    log(`Starting build and upload for ${envEl.value} on ${portEl.value}`, 'info');
    saveLastPort(portEl.value);
  });

  monitorBtn.addEventListener('click', ()=>{
    if (currentProcess) {
      log('Another process is already running', 'warning');
      return;
    }

    socket.emit('run_command', { command: 'pio', args: ['device','monitor','--port', portEl.value, '--baud', baudEl.value] });
    log(`Opening serial monitor on ${portEl.value} at ${baudEl.value} baud`, 'info');
    saveLastPort(portEl.value);
  });

  clearBtn.addEventListener('click', ()=>{
    consoleEl.innerHTML = '';
    log('Console cleared', 'info');
  });

  // populate ports from server
  async function refreshPorts(){
    try{
      log('Refreshing COM ports...', 'info');
      const r = await fetch('/api/com-ports');
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const ports = await r.json();

      portEl.innerHTML = '';

      if (Array.isArray(ports) && ports.length > 0){
        ports.forEach(p=>{
          const o=document.createElement('option');
          o.value = p.path || p;
          o.textContent = p.path || p;
          portEl.appendChild(o);
        });
        log(`Found ${ports.length} COM ports`, 'success');
      } else {
        // Add fallback ports
        ['COM1', 'COM3', 'COM10', 'COM13'].forEach(port => {
          const o=document.createElement('option');
          o.value = port;
          o.textContent = port;
          portEl.appendChild(o);
        });
        log('Using fallback COM ports', 'warning');
      }

      const last = loadLastPort();
      if (last) {
        try{ portEl.value = last; }catch(e){}
      }
    }catch(e){
      log(`Failed to refresh ports: ${e.message}`, 'error');
      // Add fallback ports on error
      portEl.innerHTML = '';
      ['COM1', 'COM3', 'COM10', 'COM13'].forEach(port => {
        const o=document.createElement('option');
        o.value = port;
        o.textContent = port;
        portEl.appendChild(o);
      });
    }
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
