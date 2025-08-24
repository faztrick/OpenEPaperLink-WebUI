// Dispatcher executing tool calls securely.
// Each function returns a JSON-serializable object.
// Heavy operations guarded against concurrency explosions.

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const axios = require('axios');

// Allow caller to inject references (e.g., deviceManager, serialManager, logger)
function createDispatcher(opts = {}) {
  const projectRoot = path.join(__dirname, '..');
  const flasherRoot = projectRoot; // parent already ESP32_AP-Flasher
  const buildRoot = path.join(projectRoot, '.pio');
  const {
    deviceManager = null,
    serialManager = null,
    log = () => {},
  } = opts;

  const running = new Map(); // name -> promise

  function guardOnce(key, fn) {
    if (running.has(key)) return running.get(key);
    const p = (async () => {
      try { return await fn(); } finally { running.delete(key); }
    })();
    running.set(key, p);
    return p;
  }

  function tail(text, lines = 120) {
    if (!text) return '';
    return text.split(/\r?\n/).slice(-lines).join('\n');
  }

  function spawnCollect(cmd, args, cwd, timeoutMs = 15 * 60_000) {
    return new Promise((resolve) => {
      const start = Date.now();
      const proc = spawn(cmd, args, { cwd, shell: false });
      let stdout = '';
      let stderr = '';
      proc.stdout.on('data', d => { stdout += d.toString(); if (stdout.length > 500_000) stdout = stdout.slice(-400_000); });
      proc.stderr.on('data', d => { stderr += d.toString(); if (stderr.length > 200_000) stderr = stderr.slice(-150_000); });
      let killed = false;
      const to = setTimeout(() => { killed = true; proc.kill('SIGKILL'); }, timeoutMs);
      proc.on('close', code => {
        clearTimeout(to);
        resolve({ code, durationMs: Date.now() - start, stdout: tail(stdout), stderr: tail(stderr), killed });
      });
      proc.on('error', e => {
        clearTimeout(to);
        resolve({ code: -1, error: e.message, stdout: tail(stdout), stderr: tail(stderr), durationMs: Date.now() - start });
      });
    });
  }

  async function build_firmware(args) {
    const { environment, fast, clean } = args;
    if (!/^OutdoorAP$/.test(environment)) return { error: 'invalid environment' };
    return guardOnce('build', async () => {
      const cwd = flasherRoot;
      let result;
      if (fast) {
        const py = process.env.PYTHON || 'python';
        const buildArgs = ['fast_compile.py','--env', environment];
        if (clean) buildArgs.push('--clean');
        result = await spawnCollect(py, buildArgs, cwd);
      } else {
        const args = ['run','-e', environment];
        if (clean) args.push('-t','clean');
        result = await spawnCollect('pio', args, cwd);
      }
      return { success: result.code === 0, ...result };
    });
  }

  async function flash_firmware(args) {
    const { environment, port, baud, monitor } = args;
    if (!/^OutdoorAP$/.test(environment)) return { error: 'invalid environment' };
    if (!/^COM\d+$/i.test(port)) return { error: 'invalid port' };
    return guardOnce('flash', async () => {
      const cwd = flasherRoot;
      const pioArgs = ['run','-e', environment,'-t','upload','--upload-port', port];
      const res = await spawnCollect('pio', pioArgs, cwd, 20*60_000);
      // Optionally open monitor (non-blocking background) - best effort
      if (monitor && serialManager) {
        try { await serialManager.close().catch(()=>{}); await serialManager.open(port, 115200); } catch (_) {}
      }
      return { success: res.code === 0, ...res };
    });
  }

  async function upload_filesystem(args) {
    const { environment, port, baud, skipBuild } = args;
    if (!/^OutdoorAP$/.test(environment)) return { error: 'invalid environment' };
    if (!/^COM\d+$/i.test(port)) return { error: 'invalid port' };
    return guardOnce('upload_fs', async () => {
      const cwd = flasherRoot;
      // Prefer fast_compile.ps1 if present (Windows host assumption)
      const script = path.join(cwd, 'fast_compile.ps1');
      if (process.platform === 'win32' && fs.existsSync(script)) {
        const argsPs = ['-NoProfile','-ExecutionPolicy','Bypass','-File', script, '-Environment', environment, '-ComPort', port, '-BaudRate', String(baud), '-FilesystemOnly'];
        if (skipBuild) argsPs.push('-SkipBuild');
        const res = await spawnCollect('pwsh', argsPs, cwd, 15*60_000);
        return { success: res.code === 0, used: 'fast_compile.ps1', ...res };
      }
      // Fallback: pio run -t uploadfs (if defined)
      const res = await spawnCollect('pio', ['run','-e', environment,'-t','uploadfs','--upload-port', port], cwd, 15*60_000);
      return { success: res.code === 0, used: 'pio uploadfs', ...res };
    });
  }

  async function list_serial_ports(_args) {
    if (!serialManager) return { success: true, ports: [] };
    try { const ports = await serialManager.listPorts(); return { success: true, ports }; } catch (e) { return { success:false, error:e.message }; }
  }

  async function optimize_www_assets(args) {
    const { minify, gzip } = args;
    return guardOnce('opt_www', async () => {
      const cwd = flasherRoot;
      const py = process.env.PYTHON || 'python';
      const steps = [];
      if (minify) steps.push(['optimize_for_production.py']);
      if (gzip) steps.push(['gzip_wwwfiles.py']);
      const results = [];
      for (const s of steps) {
        if (!fs.existsSync(path.join(cwd, s[0]))) { results.push({ step: s[0], skipped: true, reason: 'missing script' }); continue; }
        const r = await spawnCollect(py, s, cwd, 5*60_000);
        results.push({ step: s[0], success: r.code === 0, ...r });
      }
      return { success: results.every(r=>r.success || r.skipped), results };
    });
  }

  async function query_device_status(args) {
    const { identifier, detail } = args;
    let host = identifier;
    if (deviceManager) {
      const dev = deviceManager.get(identifier);
      if (dev && (dev.host || dev.ip)) host = dev.host || dev.ip;
    }
    if (!/^[\w.-]+$/.test(host)) return { error: 'invalid identifier/host' };
    try {
      const url = `http://${host}/api/wifi/summary`;
      let summary = null; let raw = {};
      try { const r = await axios.get(url, { timeout: 4000 }); if (r.status === 200) { summary = r.data; raw.summary = r.data; } } catch (_) {}
      if (!summary) {
        try { const r2 = await axios.get(`http://${host}/network_info`, { timeout: 4000 }); if (r2.status === 200) { summary = r2.data; raw.network_info = r2.data; } } catch (_) {}
      }
      if (!summary) return { success:false, error:'unreachable', host };
      const out = { success:true, host, mode: summary.mode || null, wifi: summary.wifi || summary.network || null };
      if (detail === 'full') out.raw = raw;
      return out;
    } catch (e) { return { success:false, error:e.message }; }
  }

  async function run_emulation(args) {
    const { environment, headless } = args;
    if (!/^OutdoorAP$/.test(environment)) return { error:'invalid environment' };
    return guardOnce('emulation', async () => {
      const cwd = flasherRoot;
      const script = path.join(cwd, 'emulation_setup.ps1');
      if (process.platform === 'win32' && fs.existsSync(script)) {
        const psArgs = ['-NoProfile','-ExecutionPolicy','Bypass','-File', script, 'qemu','-Environment', environment];
        if (headless) psArgs.push('-Headless');
        const res = await spawnCollect('pwsh', psArgs, cwd, 10*60_000);
        return { success: res.code === 0, ...res };
      }
      return { success:false, error:'emulation script not present' };
    });
  }

  const map = { build_firmware, flash_firmware, upload_filesystem, list_serial_ports, optimize_www_assets, query_device_status, run_emulation };

  async function dispatch(name, args) {
    if (!Object.prototype.hasOwnProperty.call(map, name)) return { error: 'unknown tool '+name };
    log('ai-tools', `dispatch ${name} args=${JSON.stringify(args)}`);
    try { return await map[name](args || {}); } catch (e) { return { error: e.message || String(e) }; }
  }

  return { dispatch };
}

module.exports = { createDispatcher };
