// Enhanced flashing UI logic for refactored flash.html
(function(){
  if (window.__FLASH_INIT) return; // SPA guard for initial script eval
  window.__FLASH_INIT = true;

  function initFlashPage(){
    const pageRoot = document.getElementById('flash-console');
    if (!pageRoot) return; // Not on flash page

    const socket = window.__OEPL_SOCKET || io();
    window.__OEPL_SOCKET = socket;

    // Elements
    const consoleEl = document.getElementById('flash-console');
    const envEl = document.getElementById('flash-env');
    const comEl = document.getElementById('flash-com');
    const baudEl = document.getElementById('flash-baud');
    const hostEl = document.getElementById('flash-host');
    const fsOnlyEl = document.getElementById('flash-fs-only');
    const skipUploadEl = document.getElementById('flash-skip-upload');
    const skipBuildEl = document.getElementById('flash-skip-build');
    const fastBuildEl = document.getElementById('flash-fast-build');
    const firmwareInput = document.getElementById('flash-firmware-file');
    const uploadFirmwareBtn = document.getElementById('flash-upload-firmware');
    const triggerOtaBtn = document.getElementById('flash-trigger-ota');
    const copyBtn = document.getElementById('flash-copy');
    const clearBtn = document.getElementById('flash-clear');
    const buildUploadPyBtn = document.getElementById('flash-build-upload-py');
    const buildPyBtn = document.getElementById('flash-build-py');
    const fastPyBtn = document.getElementById('flash-fast-py');
    const buildUploadPsBtn = document.getElementById('flash-build-upload-ps');
    const fastPsBtn = document.getElementById('flash-fast-ps');
    const monitorBtn = document.getElementById('flash-monitor');
    const cleanBtn = document.getElementById('flash-clean');
    const stopBtn = document.getElementById('flash-stop');
    const artifactMetaEl = document.getElementById('flash-artifacts-meta');

    const LS = {
      env: 'oepl:flash:env',
      port: 'oepl:flash:port',
      baud: 'oepl:flash:baud',
      flags: 'oepl:flash:flags'
    };

    let currentProcess = null;
    let lineCount = 0;
    const MAX_LINES = 1500;

    function persist(){
      try {
        const flags = {
          fsOnly: !!fsOnlyEl.checked,
            skipUpload: !!skipUploadEl.checked,
            skipBuild: !!skipBuildEl.checked,
            fast: !!fastBuildEl.checked
          };
        localStorage.setItem(LS.env, envEl.value || '');
        localStorage.setItem(LS.port, comEl.value || '');
        localStorage.setItem(LS.baud, baudEl.value || '');
        localStorage.setItem(LS.flags, JSON.stringify(flags));
      }catch(e){}
    }
    function restore(){
      try {
        const env = localStorage.getItem(LS.env);
        if (env) envEl.value = env;
        const port = localStorage.getItem(LS.port);
        if (port) comEl.value = port;
        const baud = localStorage.getItem(LS.baud);
        if (baud) baudEl.value = baud;
        const flags = JSON.parse(localStorage.getItem(LS.flags) || '{}');
        fsOnlyEl.checked = !!flags.fsOnly;
        skipUploadEl.checked = !!flags.skipUpload;
        skipBuildEl.checked = !!flags.skipBuild;
        fastBuildEl.checked = flags.fast !== false; // default true
      }catch(e){}
    }

    function log(msg, type='info') {
      const ts = new Date().toLocaleTimeString();
      const div = document.createElement('div');
      div.className = `log-line log-${type}`;
      div.textContent = `[${ts}] ${msg}`;
      consoleEl.appendChild(div);
      lineCount++;
      if (lineCount > MAX_LINES) {
        // trim oldest 10%
        const toRemove = Math.ceil(MAX_LINES * 0.1);
        for (let i=0;i<toRemove;i++){
          const first = consoleEl.firstChild; if (!first) break; first.remove(); lineCount--;
        }
      }
      consoleEl.scrollTop = consoleEl.scrollHeight;
    }

    function setProcessing(state){
      currentProcess = state ? (currentProcess || 'active') : null;
      const disabled = !!currentProcess;
      [buildUploadPyBtn, buildPyBtn, fastPyBtn, buildUploadPsBtn, fastPsBtn, monitorBtn, cleanBtn, uploadFirmwareBtn, triggerOtaBtn].forEach(b=>{ if (b) b.disabled = disabled; });
      if (stopBtn) stopBtn.disabled = !disabled;
    }

    function assembleArgs(base){
      const args = ['-Environment', envEl.value, '-ComPort', comEl.value, '-BaudRate', baudEl.value];
      if (fsOnlyEl.checked) args.push('-FilesystemOnly');
      if (skipUploadEl.checked) args.push('-SkipUpload');
      if (skipBuildEl.checked) args.push('-SkipBuild');
      return base.concat(args);
    }

    function startScript(script, extraArgs, label){
      if (currentProcess) { log('Process already running', 'warning'); return; }
      persist();
      const args = assembleArgs(extraArgs || []);
      log(`Starting ${label} (${script}) with ${args.join(' ')}`);
      setProcessing(true);
      socket.emit('run_script', { script, args });
    }

    function startCommand(command, args, label){
      if (currentProcess) { log('Process already running', 'warning'); return; }
      persist();
      log(`Starting ${label} (${command} ${args.join(' ')})`);
      setProcessing(true);
      socket.emit('run_command', { command, args });
    }

    // Socket events
    socket.on('connect', ()=>log('Socket connected','success'));
    socket.on('disconnect', ()=>log('Socket disconnected','error'));
    socket.on('process-started', d=>{ log(`Process started: ${d.command || d.action || 'unknown'}`); });
    socket.on('process-output', d=>{ if (d && d.data) log(d.data.trimEnd(), d.type==='stderr'?'error':'info'); });
    socket.on('output', d=>{ if (d && d.data) log(d.data.trimEnd(), d.type==='stderr'?'error':'info'); });
    socket.on('serial-data', d=>{ if (d && d.data) log(`[serial] ${d.data.trimEnd()}`,'info'); });
    socket.on('process-finished', d=>{ log(`Process finished exit=${d.exitCode}`, d.exitCode===0?'success':'error'); setProcessing(false); refreshArtifacts(); });
    socket.on('process_complete', d=>{ log(`Process complete ${d.success?'success':'failure'}`, d.success?'success':'error'); setProcessing(false); refreshArtifacts(); });

    // Button handlers
    if (buildUploadPyBtn) buildUploadPyBtn.onclick = ()=> startScript(fastBuildEl.checked ? 'compile.py' : 'compile.py', [], 'Build+Upload (Py)');
    if (buildPyBtn) buildPyBtn.onclick = ()=> startScript('compile.py', ['-SkipUpload'], 'Build Only (Py)');
    if (fastPyBtn) fastPyBtn.onclick = ()=> startScript('fast_compile.py', [], 'Fast Build+Upload (Py)');
    if (buildUploadPsBtn) buildUploadPsBtn.onclick = ()=> startScript('compile.ps1', [], 'Build+Upload (PS)');
    if (fastPsBtn) fastPsBtn.onclick = ()=> startScript('fast_compile.ps1', [], 'Fast Build+Upload (PS)');
    if (monitorBtn) monitorBtn.onclick = ()=> startCommand('pio', ['device','monitor','--port', comEl.value,'--baud', baudEl.value], 'Serial Monitor');
    if (cleanBtn) cleanBtn.onclick = ()=> startCommand('pio', ['run','-e', envEl.value,'-t','clean'], 'Clean');
    if (stopBtn) stopBtn.onclick = ()=>{ if (!currentProcess) return; log('Stopping process...','warning'); socket.emit('stop_process'); };
    if (clearBtn) clearBtn.onclick = ()=>{ consoleEl.innerHTML=''; lineCount=0; log('Console cleared'); };
    if (copyBtn) copyBtn.onclick = ()=>{ try { const text=[...consoleEl.querySelectorAll('.log-line')].map(l=>l.textContent).join('\n'); navigator.clipboard.writeText(text); log('Copied console to clipboard','success'); }catch(e){ log('Copy failed: '+e.message,'error'); } };

    if (uploadFirmwareBtn) uploadFirmwareBtn.onclick = async ()=>{
      if (!firmwareInput.files || firmwareInput.files.length===0){ alert('Select a .bin file'); return; }
      const f = firmwareInput.files[0];
      const fd = new FormData(); fd.append('firmware', f, f.name);
      try {
        const res = await fetch('/api/firmware/upload',{method:'POST', body:fd});
        const j = await res.json();
        if (j.success){ firmwareInput.dataset.serverPath = j.path; log('Firmware uploaded: '+j.path,'success'); refreshArtifacts(); }
        else log('Upload failed: '+ j.error,'error');
      }catch(err){ log('Upload error: '+err.message,'error'); }
    };
    if (triggerOtaBtn) triggerOtaBtn.onclick = async ()=>{
      const path = firmwareInput.dataset.serverPath; const host = (hostEl.value||'').trim();
      if (!path || !host){ alert('Upload firmware then set host'); return; }
      try {
        const res = await fetch('/api/firmware/trigger',{method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ host, firmwarePath: path })});
        const j = await res.json();
        if (j.success) log('OTA triggered: '+ JSON.stringify(j.deviceResponse),'success'); else log('OTA failed: '+j.error,'error');
      }catch(err){ log('OTA error: '+err.message,'error'); }
    };

    [envEl, comEl, baudEl, fsOnlyEl, skipUploadEl, skipBuildEl, fastBuildEl].forEach(el=>{ if (el) el.addEventListener('change', persist); });

    async function refreshPorts(){
      try {
        const res = await fetch('/api/com-ports');
        if (!res.ok) throw new Error('HTTP '+res.status);
        const ports = await res.json();
        comEl.innerHTML='';
        const list = Array.isArray(ports) ? ports : [];
        if (list.length){
          list.forEach(p=>{ const val = p.path || p; const opt=document.createElement('option'); opt.value=val; opt.textContent=val; comEl.appendChild(opt); });
        } else {
          ['COM3','COM5','COM10','COM13'].forEach(p=>{ const o=document.createElement('option'); o.value=p; o.textContent=p; comEl.appendChild(o); });
        }
      }catch(err){
        log('COM port refresh failed: '+err.message,'error');
      }
    }

    async function refreshEnvs(){
      // Attempt endpoint else fallback
      const fallback=['OutdoorAP','IndoorAP','Debug'];
      try {
        const res = await fetch('/api/platformio-envs');
        if (!res.ok) throw new Error('HTTP '+res.status);
        const envs = await res.json();
        if (!Array.isArray(envs) || !envs.length) throw new Error('Empty');
        envEl.innerHTML='';
        envs.forEach(e=>{ const o=document.createElement('option'); o.value=e; o.textContent=e; envEl.appendChild(o); });
      }catch(e){
        envEl.innerHTML='';
        fallback.forEach(e=>{ const o=document.createElement('option'); o.value=e; o.textContent=e; envEl.appendChild(o); });
      }
    }

    async function refreshArtifacts(){
      if (!artifactMetaEl) return;
      try {
        const res = await fetch(`/api/build-artifacts?env=${encodeURIComponent(envEl.value)}`);
        if (!res.ok) throw new Error('HTTP '+res.status);
        const data = await res.json();
        if (data && data.files && data.files.length){
          artifactMetaEl.textContent = `${data.files.length} files, last: ${data.files[0].name || data.files[0]}`;
        } else artifactMetaEl.textContent = '(none)';
      }catch(e){ artifactMetaEl.textContent='(none)'; }
    }

    refreshEnvs().then(()=>{ restore(); });
    refreshPorts().then(()=>{ restore(); });
    refreshArtifacts();
  }

  // Run immediately
  document.addEventListener('DOMContentLoaded', initFlashPage);
  // SPA navigation support
  window.addEventListener('spa:navigated', ()=> setTimeout(initFlashPage, 0));
})();
