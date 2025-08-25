
try { require('dotenv').config(); } catch (_) { /* dotenv optional */ }
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const { spawn } = require('child_process');
const axios = require('axios');
const path = require('path');
const fs = require('fs');
const os = require('os');
// Removed multer (unused) to reduce dependencies
const net = require('net');
// NOTE: To ship the Web UI to run directly against the ESP32 device (which now hosts
// its own REST API in firmware main.cpp), we provide an optional "static only" mode.
// Enable via env WEBUI_STATIC_ONLY=1 or CLI flag --static-only. In this mode the Node
// server acts purely as a static file server for the dev UI and intentionally blocks
// all /api/* requests (except a lightweight /api/ping) so the front-end must talk
// directly to the device's HTTP API. This avoids confusion with legacy local proxy
// endpoints that previously existed here.
const STATIC_ONLY = process.env.WEBUI_STATIC_ONLY === '1' || process.argv.includes('--static-only');
// Core app/server objects (were previously declared farther down). They must be
// initialized before middleware registration below.
const app = express();
const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: '*'} });

// Basic in-memory logging emitter (redeclared here if not yet required elsewhere)
const EventEmitter = require('events');
const logEmitter = new EventEmitter();
function appendLog(channel, line){
    try {
        logEmitter.emit(channel, line);
    } catch (_) { /* ignore */ }
}

// Provide lightweight fallbacks so static-only mode can run without the heavy
// development subsystems (AI agent, remote manager, serial, etc.). The real
// implementations are defined later in the original file; if they load they
// will overwrite these placeholders.
let aiAgent = {
    config: { openai:{enabled:false}, anthropic:{enabled:false}, features:{}, editing:null, defaultProvider:'none' },
    isAvailable: () => false,
    getConfig: function(){ return this.config; }
};
let deviceManager = {
    list: () => [],
    selectedId: null,
    getSelected: () => null
};
let remoteManager = {
    getServers: () => [],
    getConnectionStatus: () => ({ servers: [] }),
    disconnectAll: ()=>{}
};
function rateLimit(){ return false; }
function tailLines(){ return ''; }
const PYTHON_EXEC = 'python';
// Helper to resolve listening port (reinserted after cleanup)
function resolvePort(argv){
    const DEFAULT_PORT = 3000;
    let port = DEFAULT_PORT;
    if (process.env.WEBUI_PORT) {
        const p = parseInt(process.env.WEBUI_PORT, 10); if (!isNaN(p) && p > 0) port = p;
    } else if (process.env.PORT) {
        const p = parseInt(process.env.PORT, 10); if (!isNaN(p) && p > 0) port = p;
    }
    for (let i=2; i<argv.length; i++) {
        const a = argv[i];
        if (a === '--port' || a === '-p') {
            const v = argv[i+1];
            if (v) { const p = parseInt(v,10); if (!isNaN(p) && p>0) port = p; i++; continue; }
        } else if (a.startsWith('--port=')) {
            const v = a.split('=')[1]; const p = parseInt(v,10); if (!isNaN(p) && p>0) port = p; continue;
        }
    }
    return port;
}
const STRICT_PORT = process.argv.includes('--strict-port');
const PORT = resolvePort(process.argv);
if (process.argv.includes('--print-port')) { console.log(PORT); }
// Simple shared auth token for agent endpoints (set OPEL_AGENT_TOKEN env). If unset, agent endpoints disabled.
const AGENT_TOKEN = process.env.OPEL_AGENT_TOKEN || process.env.AGENT_TOKEN || '';

// Middleware
app.use(cors());
app.use(express.json());
// If running in static-only mode, install an early blocker for all /api/* requests
// (after JSON parse so clients still get clean JSON error). Allow a tiny allowlist.
if (STATIC_ONLY) {
    const allow = new Set(['/api/ping']);
    app.use('/api', (req, res, next) => {
        if (allow.has(req.path)) return next();
        // Explicit 410 Gone to signal the old API surface is intentionally removed.
        return res.status(410).json({
            success: false,
            error: 'Local Node APIs disabled (static-only mode). Use device ESP32 HTTP API directly.',
            staticOnly: true
        });
    });
}
// Serve advanced UI pages from the new preferred path web-ui/public/device or legacy wwwroot (mount first)
const newDeviceRoot = path.join(__dirname, 'web-ui', 'public', 'device');
const repoWwwRoot = path.join(__dirname, '..', 'wwwroot'); // legacy location one level up

let staticRootServed = false;
if (fs.existsSync(newDeviceRoot)) {
    console.log(`Serving device UI from ${newDeviceRoot}`);
    app.use(express.static(newDeviceRoot));
    app.use('/device', express.static(newDeviceRoot));
    staticRootServed = true;
}
if (fs.existsSync(repoWwwRoot)) {
    console.log(`Serving legacy UI from ${repoWwwRoot}`);
    app.use(express.static(repoWwwRoot));
    app.use('/device-legacy', express.static(repoWwwRoot));
    if (!staticRootServed) {
        // Also alias /device to legacy if new path absent
        app.use('/device', express.static(repoWwwRoot));
    }
    staticRootServed = true;
}
if (!staticRootServed) {
    console.log('No UI static roots found (expected web-ui/public/device or ../wwwroot).');
}

// Lightweight ping endpoint (always available in any mode) mainly for front-end
// health checks. When in STATIC_ONLY mode it helps the UI confirm the local host is
// only serving static assets and should switch to device-hosted APIs.
app.get('/api/ping', (req, res) => {
    res.json({ ok: true, ts: Date.now(), staticOnly: !!STATIC_ONLY });
});

// AI Tool chat endpoints moved to routes/aiTools.js for modularity
const selectAiToolModel = require('./lib/aiToolModel');

// Store for active processes
const activeProcesses = new Map();

// Serial Manager instance (initialized after currentConfig definition to get manual COM settings)
let serialManager = null; // will initialize after currentConfig is defined

// Improv protocol helpers extracted to lib/improv
const { IMPROV_HDR, IMPROV_VER, TYPE_RPC, TYPE_RPC_RESPONSE, CMD_WIFI_SETTINGS, CMD_GET_WIFI_NETWORKS, buildImprovRpc, buildWifiSettingsPayload, parseImprovFrames, decodeRpcPayload } = require('./lib/improv');

// Configuration defaults
const defaultConfig = {
    environment: 'OutdoorAP',
    comPort: 'COM10',
    // Align with firmware Serial.begin(115200) for human-readable console
    baudRate: 115200,
    jobs: 0,
    fastBuild: true,
    clean: false,
    verbose: false,
    filesystemOnly: false,
    skipUpload: false,
    monitor: false,
    // manualComOnly disabled by default so all available ports are displayed everywhere.
    // Set to true via /api/config if you want to lock to a single port again.
    manualComOnly: false,
    allowedComPort: 'COM10'
};

let currentConfig = { ...defaultConfig };

// Initialize Serial Manager now that initial config is available (safe require)
try {
    if (!STATIC_ONLY) {
        const SerialManager = require('./serial_manager');
        serialManager = new SerialManager({
            manualComOnly: currentConfig.manualComOnly,
            allowedComPort: currentConfig.allowedComPort
        });
    }
} catch (e) {
    console.warn('[startup] SerialManager unavailable:', e.message);
}

// Bridge serial manager events to socket.io and logs
try {
    if (serialManager) serialManager.on('open', (info) => {
        appendLog('serial', `OPEN path=${info.path} baud=${info.baudRate}`);
        io.emit('serial-opened', info.path);
        io.emit('serial-status', serialManager.getStatus());
    });
    if (serialManager) serialManager.on('close', (info) => {
        appendLog('serial', `CLOSE path=${info.path}`);
        io.emit('serial-closed', info.path);
        io.emit('serial-status', serialManager.getStatus());
    });
    if (serialManager) serialManager.on('data', (d) => {
        const text = d.text || d.data?.toString() || '';
        appendLog('serial', `port=${d.path} ${text.replace(/\r?\n/g,'\\n')}`);
        io.emit('serial-data', { port: d.path, text });
    });
    if (serialManager) serialManager.on('error', (e) => {
        appendLog('serial', `ERROR path=${e.path} err=${e.error}`);
        io.emit('serial-error', e);
        io.emit('serial-status', serialManager.getStatus());
    });
    if (serialManager) serialManager.on('status', (s) => {
        io.emit('serial-status', s);
    });
} catch (_) { /* ignore wiring issues */ }

// Helper function to get COM ports
function getComPorts() {
    try {
        if (os.platform() === 'win32') {
            const result = spawn('powershell', [
                '-Command',
                "Get-WmiObject -Class Win32_PnPEntity | Where-Object { $_.Caption -match 'COM\\d+' } | ForEach-Object { if ($_.Caption -match '(COM\\d+)') { $Matches[1] } } | Sort-Object"
            ], { encoding: 'utf8' });

            return new Promise((resolve) => {
                let output = '';
                result.stdout.on('data', (data) => {
                    output += data;
                });
                result.on('close', () => {
                    const ports = output.trim().split('\n').filter(port => port.trim());
                    resolve(ports.length > 0 ? ports : ['COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9', 'COM10']);
                });
            });
        } else {
            // Linux/Mac
            return Promise.resolve(['/dev/ttyUSB0', '/dev/ttyUSB1', '/dev/ttyACM0', '/dev/ttyACM1']);
        }
    } catch (error) {
        return Promise.resolve(['COM10']); // Fallback
    }
}

// Helper function to check project status
function getProjectStatus() {
    const buildPath = path.join('..', '.pio', 'build', currentConfig.environment);
    const status = {
        hasBuilds: false,
        lastBuild: null,
        firmwareSize: null,
        filesystemSize: null
    };

    try {
        if (fs.existsSync(buildPath)) {
            status.hasBuilds = true;

            const firmwarePath = path.join(buildPath, 'firmware.bin');
            if (fs.existsSync(firmwarePath)) {
                const stats = fs.statSync(firmwarePath);
                status.lastBuild = stats.mtime;
                status.firmwareSize = Math.round(stats.size / 1024 / 1024 * 100) / 100; // MB
            }

            const filesystemPath = path.join(buildPath, 'littlefs.bin');
            if (fs.existsSync(filesystemPath)) {
                const stats = fs.statSync(filesystemPath);
                status.filesystemSize = Math.round(stats.size / 1024 / 1024 * 100) / 100; // MB
            }
        }
    } catch (error) {
        console.error('Error checking project status:', error);
    }

    return status;
}

// Routes
app.get('/api/config', (req, res) => {
    res.json(currentConfig);
});

// Saved devices (name/ip/com) persistence
// New unified device endpoints
app.get('/api/devices', (req, res) => {
    try {
        res.json({ success: true, devices: deviceManager.list(), selectedId: deviceManager.selectedId });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// Backward compatible bulk replace (legacy behavior)
app.post('/api/devices', (req, res) => {
    try {
        const { devices, selectedId } = req.body || {};
        const result = deviceManager.replaceAll(Array.isArray(devices) ? devices : [], selectedId || null);
        res.json({ success: true, ...result });
    } catch (e) {
        res.status(400).json({ success: false, error: e.message });
    }
});

app.post('/api/device', (req, res) => {
    try {
        const dev = deviceManager.add(req.body || {});
        res.json({ success: true, device: dev });
    } catch (e) {
        res.status(400).json({ success: false, error: e.message });
    }
});

app.put('/api/device/:id', (req, res) => {
    try {
        const dev = deviceManager.update(req.params.id, req.body || {});
        res.json({ success: true, device: dev });
    } catch (e) {
        res.status(400).json({ success: false, error: e.message });
    }
});

app.delete('/api/device/:id', (req, res) => {
    try {
        const ok = deviceManager.remove(req.params.id);
        res.json({ success: ok });
    } catch (e) {
        res.status(400).json({ success: false, error: e.message });
    }
});

app.post('/api/device/select', (req, res) => {
    try {
        const { id } = req.body || {};
        const dev = deviceManager.select(id === null ? null : id);
        res.json({ success: true, selected: dev ? dev.id : null });
    } catch (e) {
        res.status(400).json({ success: false, error: e.message });
    }
});

// Simple LED off action placeholder (extend to send real command via serial or network later)
app.post('/api/device/:id/led/off', async (req, res) => {
    try {
        const { id } = req.params;
        const dev = deviceManager.get(id);
        if (!dev) return res.status(404).json({ success:false, error:'device not found' });
        const mode = dev.meta?.commMode || 'serial';
        appendLog('api', `LED off requested for ${id} mode=${mode}`);

        // SERIAL path
        if (mode === 'serial') {
            if (!serialManager) return res.status(503).json({ success:false, error:'serial manager unavailable' });
            const st = serialManager.getStatus();
            if (!st.open) return res.status(409).json({ success:false, error:'serial port not open' });
            // Placeholder command; adjust to actual firmware protocol
            const cmd = 'LED:OFF\n';
            try {
                await serialManager.write(cmd);
                appendLog('serial', `LED off command sent (${cmd.trim()})`);
                return res.json({ success:true, id, method:'serial', command:cmd.trim() });
            } catch (e) {
                return res.status(500).json({ success:false, error:'serial write failed: '+(e.message||e), method:'serial' });
            }
        }

        // WIFI / HTTP path
        if (mode === 'wifi') {
            const host = dev.host || dev.ip || '';
            if (!host) return res.status(400).json({ success:false, error:'device host/ip missing' });
            const base = host.match(/^https?:\/\//) ? host : `http://${host}`;
            // Try /led/off then /api/led/off
            const endpoints = ['led/off', 'api/led/off'];
            let lastErr = null;
            for (const ep of endpoints) {
                const url = `${base.replace(/\/$/, '')}/${ep}`;
                try {
                    const r = await fetch(url, { method:'POST' }).catch(e=>{ throw e; });
                    if (r.ok) {
                        appendLog('api', `LED off via HTTP ${url}`);
                        return res.json({ success:true, id, method:'http', url });
                    }
                    lastErr = new Error(`HTTP ${r.status}`);
                } catch (e) { lastErr = e; }
            }
            return res.status(502).json({ success:false, error:'http request failed: '+(lastErr?.message||lastErr||'error'), method:'http' });
        }

        // Unknown mode
        return res.status(400).json({ success:false, error:'unsupported comm mode '+mode });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// Make home and dashboard paths serve the same UI file
app.get(['/dashboard', '/home'], (req, res) => {
    try {
        // Prefer repo wwwroot if it exists (it was mounted earlier as static)
        const candidate1 = path.join(repoWwwRoot, 'index.html');
        const candidate2 = path.join(__dirname, 'public', 'index.html');

        if (fs.existsSync(candidate1)) return res.sendFile(candidate1);
        return res.sendFile(candidate2);
    } catch (err) {
        console.error('Error serving dashboard route:', err);
        res.status(500).send('Internal Server Error');
    }
});

app.post('/api/config', (req, res) => {
    currentConfig = { ...currentConfig, ...req.body };
    // If manual mode is enabled, keep comPort aligned to allowedComPort
    if (currentConfig.manualComOnly && currentConfig.allowedComPort) {
        currentConfig.comPort = currentConfig.allowedComPort;
    }
    res.json({ success: true, config: currentConfig });
});

// Graceful shutdown endpoint: closes HTTP & socket server then exits process.
app.post('/api/shutdown', async (req, res) => {
    appendLog('api', 'Shutdown requested');
    res.json({ success: true, message: 'Shutting down' });
    // Allow response flush
    setTimeout(() => {
        try { io.close(() => appendLog('node', 'socket.io closed')); } catch (_) {}
        try { server.close(() => appendLog('node', 'http server closed')); } catch (_) {}
        setTimeout(() => process.exit(0), 250);
    }, 50);
});

app.get('/api/com-ports', async (req, res) => {
    try {
        const ports = await serialManager.listPorts();
        appendLog('api', `com-ports returned ${ports.length} ports (centralized)`);
        res.json(ports);
    } catch (e) {
        res.json([]);
    }
});

// Serial & WiFi route modules (extracted from monolith)
// Inject dependencies after deviceManager & serialManager are ready so modules can use them.
try {
    const currentConfigRef = { value: currentConfig }; // pass by ref for mutation
    const { buildImprovRpc, buildWifiSettingsPayload, CMD_GET_WIFI_NETWORKS, TYPE_RPC_RESPONSE, decodeRpcPayload, CMD_WIFI_SETTINGS, parseImprovFrames } = require('./lib/improv');
    // Serial routes
    require('./routes/serial')(app, {
        serialManager,
        appendLog,
        currentConfigRef,
        DEFAULT_SERIAL_COMMANDS: [
            'help','version','reboot','sysinfo','wifi_scan','heap','tasks','get_db','list_serial_ports','ping','ota_status'
        ],
        buildImprovRpc,
        buildWifiSettingsPayload,
        CMD_GET_WIFI_NETWORKS,
        TYPE_RPC_RESPONSE,
        decodeRpcPayload,
        CMD_WIFI_SETTINGS,
        parseImprovFrames,
        rateLimit
    });
    // WiFi device proxy routes
    require('./routes/wifi')(app, { deviceManager, axios, appendLog, rateLimit });
    appendLog('node', 'Modular routes loaded: serial, wifi');
} catch (e) { appendLog('node', 'Failed to load modular routes (serial/wifi): '+(e.message||e)); }

// Firmware endpoints will be modularized in a subsequent pass (TODO: routes/firmware.js)

// Legacy inline serial/wifi endpoints removed (now in routes/serial.js & routes/wifi.js)

// Device command: either proxy to network device (host) or emit a socket event for local handling
app.post('/api/device/cmd', async (req, res) => {
    try {
        const { host, action, params } = req.body || {};
        if (!action) return res.status(400).json({ success: false, error: 'action required' });

        if (host) {
            // proxy to device endpoint /cmd or /action - try a few fallbacks
            try {
                const targets = [`/cmd`, `/command`, `/action`, `/${action}`];
                for (const t of targets) {
                    try {
                        const url = `http://${host}${t}`;
                        const resp = await axios.post(url, { action, params }, { timeout: 5000 });
                        return res.json({ success: true, proxied: true, url, data: resp.data });
                    } catch (e) {
                        // try next
                    }
                }
                // none succeeded
                return res.status(502).json({ success: false, error: 'no device endpoint accepted the command' });
            } catch (err) {
                return res.status(500).json({ success: false, error: err.message || String(err) });
            }
        }

        // No host: emit socket event for local clients
        io.emit('device-command', { action, params });
        appendLog('node', `device-command local action=${action} params=${JSON.stringify(params)}`);
        return res.json({ success: true, emitted: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message || String(err) });
    }
});

// Device wifi setter: proxies to device if host provided or emits socket event
app.post('/api/device/wifi', async (req, res) => {
    try {
        const { host, ssid, password } = req.body || {};
        if (!ssid) return res.status(400).json({ success: false, error: 'ssid required' });

        if (host) {
            try {
                const resp = await axios.post(`http://${host}/set_wifi`, { ssid, password }, { timeout: 5000 });
                return res.json({ success: true, proxied: true, data: resp.data });
            } catch (err) {
                return res.status(500).json({ success: false, error: err.message || String(err) });
            }
        }

        io.emit('set-wifi', { ssid, password });
        appendLog('node', `set-wifi ssid=${ssid}`);
        return res.json({ success: true, emitted: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message || String(err) });
    }
});

// (Removed duplicated WiFi proxy endpoints; now exclusively handled in routes/wifi.js)

app.get('/api/status', (req, res) => {
    const status = getProjectStatus();
    res.json(status);
});

// AP/STA Summary: aggregate unified /api/wifi/summary for all devices (fallback to /network_info)
// GET /api/ap-summary -> { success, devices: [ { id, host, ap, wifi, mode, error } ] }
app.get('/api/ap-summary', async (req, res) => {
    try {
        const out = [];
        const devs = deviceManager.list();
        for (const d of devs) {
            const host = d.host || d.ip;
            const rec = { id: d.id, host, ap: null, wifi: null, mode: null, error: null };
            if (!host) { rec.error = 'no-host'; out.push(rec); continue; }
            try {
                let data = null;
                // Try unified summary first
                try {
                    const rSum = await axios.get(`http://${host}/api/wifi/summary`, { timeout: 5000, validateStatus: () => true });
                    if (rSum.status >= 200 && rSum.status < 300 && rSum.data) data = rSum.data;
                } catch (_) { /* ignore */ }
                // Fallback legacy
                if (!data) {
                    const rLegacy = await axios.get(`http://${host}/network_info`, { timeout: 5000, validateStatus: () => true });
                    if (rLegacy.status >= 200 && rLegacy.status < 300 && rLegacy.data) data = rLegacy.data; else rec.error = 'http-' + rLegacy.status;
                }
                if (data) {
                    rec.ap = data.ap || null;
                    rec.wifi = data.wifi || data.network || null;
                    // derive mode heuristically
                    if (data.mode) rec.mode = data.mode;
                    else if (rec.ap && rec.ap.enabled && rec.wifi && rec.wifi.connected) rec.mode = 'ap+sta';
                    else if (rec.ap && rec.ap.enabled) rec.mode = 'ap';
                    else if (rec.wifi && rec.wifi.connected) rec.mode = 'sta';
                }
            } catch (e) {
                if (!rec.error) rec.error = e.message || 'fetch-failed';
            }
            out.push(rec);
        }
        res.json({ success: true, devices: out });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// AP Mode Control (best-effort; tries possible endpoints exposed by firmware variants)
// POST /api/device/:id/ap/enable { mode? }   (mode: 'ap','sta','ap+sta')
app.post('/api/device/:id/ap/enable', async (req, res) => {
    try {
        const dev = deviceManager.get(req.params.id);
        if (!dev || !(dev.host || dev.ip)) return res.status(404).json({ success: false, error: 'device not found' });
        const host = dev.host || dev.ip;
        const desired = (req.body && req.body.mode) ? String(req.body.mode).toLowerCase() : 'ap';
        // Attempt heuristic endpoints
        const attempts = [];
        // Hypothetical endpoints (future firmware): /api/wifi/mode {mode}, /wifi_mode?m=ap, /set_ap?enable=1
        attempts.push(async () => axios.post(`http://${host}/api/wifi/mode`, { mode: desired }, { timeout: 6000, validateStatus: () => true }));
        attempts.push(async () => axios.get(`http://${host}/wifi_mode?m=${encodeURIComponent(desired)}`, { timeout: 6000, validateStatus: () => true }));
        attempts.push(async () => {
            if (desired.startsWith('ap')) return axios.get(`http://${host}/set_ap?enable=1`, { timeout: 6000, validateStatus: () => true });
            return { status: 599 }; // skip
        });
        let last = null;
        for (const fn of attempts) {
            try {
                const r = await fn();
                if (r && r.status >= 200 && r.status < 300) {
                    return res.json({ success: true, mode: desired, endpoint: r.config?.url });
                }
                last = new Error('http-' + (r ? r.status : 'no'));
            } catch (e) { last = e; }
        }
        return res.status(502).json({ success: false, error: last?.message || 'enable failed' });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// Disable AP (best-effort)
app.post('/api/device/:id/ap/disable', async (req, res) => {
    try {
        const dev = deviceManager.get(req.params.id);
        if (!dev || !(dev.host || dev.ip)) return res.status(404).json({ success: false, error: 'device not found' });
        const host = dev.host || dev.ip;
        const attempts = [];
        attempts.push(async () => axios.post(`http://${host}/api/wifi/mode`, { mode: 'sta' }, { timeout: 6000, validateStatus: () => true }));
        attempts.push(async () => axios.get(`http://${host}/wifi_mode?m=sta`, { timeout: 6000, validateStatus: () => true }));
        attempts.push(async () => axios.get(`http://${host}/set_ap?enable=0`, { timeout: 6000, validateStatus: () => true }));
        let last = null;
        for (const fn of attempts) {
            try {
                const r = await fn();
                if (r && r.status >= 200 && r.status < 300) {
                    return res.json({ success: true, mode: 'sta', endpoint: r.config?.url });
                }
                last = new Error('http-' + (r ? r.status : 'no'));
            } catch (e) { last = e; }
        }
        return res.status(502).json({ success: false, error: last?.message || 'disable failed' });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// Quick API connectivity test for all saved devices
// GET /api/tests/api -> { success, tested: N, results: [ { id, host, ok, http, durationMs, endpointTried, note } ] }
app.get('/api/tests/api', async (req, res) => {
    const devices = deviceManager.list();
    const results = [];
    for (const d of devices) {
        const host = d.host || d.ip;
        if (!host) { results.push({ id: d.id, host: null, ok: false, http: null, durationMs: 0, endpointTried: null, note: 'no host' }); continue; }
        const base = `http://${host}`;
    // Prefer unified endpoints, then legacy fallbacks
    const endpoints = ['/api/wifi/summary', '/api/wifi/status', '/api/ping', '/network_info', '/sysinfo', '/api/telemetry', '/api/status'];
        let ok = false; let http = null; let endpointTried = null; let note = '';
        const start = Date.now();
        for (const ep of endpoints) {
            try {
                const r = await axios.get(base + ep, { timeout: 4000, validateStatus: () => true });
                http = r.status; endpointTried = ep;
                if (r.status >= 200 && r.status < 300) {
                    if (ep === '/api/ping' && !(r.data && r.data.ok)) { note = 'ping responded but ok flag missing'; } else { ok = true; }
                    break;
                }
            } catch (e) {
                http = null; endpointTried = ep; note = e.message;
            }
        }
        const durationMs = Date.now() - start;
        results.push({ id: d.id, host, ok, http, durationMs, endpointTried, note });
    }
    res.json({ success: true, tested: results.length, results });
});

// Serial test: attempts to report current serial status and optionally poke the device
// GET /api/tests/serial?poke=1 -> uses SerialManager.getStatus(); if open and poke=1 sends a newline
app.get('/api/tests/serial', async (req, res) => {
    try {
        if (!serialManager || !serialManager.isAvailable()) return res.json({ success: true, available: false, status: null, note: 'serial manager not available' });
        const status = serialManager.getStatus();
        let pokeSent = false;
        if (req.query.poke === '1' && status && status.open) {
            try {
                await serialManager.write('\n');
                pokeSent = true;
            } catch (e) { /* ignore */ }
        }
        return res.json({ success: true, available: true, status, pokeSent });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// List build artifacts for a given environment (defaults to currentConfig.environment)
// Returns a list of objects: { name, type, size, mtime, relPath, exists }
app.get('/api/artifacts', (req, res) => {
    try {
        const env = (req.query.env || currentConfig.environment || 'OutdoorAP').toString();
        const buildDir = path.join(__dirname, '..', '.pio', 'build', env);
        const projectRoot = path.join(__dirname, '..');
        const types = [
            { name: 'firmware.bin', type: 'firmware' },
            { name: 'littlefs.bin', type: 'filesystem' },
            { name: 'bootloader.bin', type: 'bootloader' },
            { name: 'partitions.bin', type: 'partitions' },
            { name: 'app.elf', type: 'elf' }
        ];

        const out = [];
        types.forEach(t => {
            try {
                const abs = path.join(buildDir, t.name);
                const exists = fs.existsSync(abs);
                let size = null, mtime = null;
                if (exists) {
                    const st = fs.statSync(abs);
                    size = st.size;
                    mtime = st.mtime;
                }
                const relPath = path.relative(projectRoot, abs).replace(/\\/g, '/');
                out.push({ name: t.name, type: t.type, size, mtime, relPath, exists });
            } catch (_) { /* ignore individual errors */ }
        });

        res.json({ success: true, env, artifacts: out });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message || String(err) });
    }
});

// Host a local artifact by copying it into the public/uploads folder so it can be served via HTTP
// body: { path: 'relative/path/from/project/root' }
app.post('/api/firmware/host-local', (req, res) => {
    try {
        const rel = (req.body && req.body.path) ? String(req.body.path) : '';
        if (!rel) return res.status(400).json({ success: false, error: 'path required' });
        const projectRoot = path.join(__dirname, '..');
        const src = path.resolve(projectRoot, rel);
        // ensure src is inside projectRoot
        if (!src.startsWith(path.resolve(projectRoot))) {
            return res.status(400).json({ success: false, error: 'invalid path' });
        }
        if (!fs.existsSync(src)) return res.status(404).json({ success: false, error: 'file not found' });

        const uploads = path.join(__dirname, 'public', 'uploads');
        if (!fs.existsSync(uploads)) fs.mkdirSync(uploads, { recursive: true });
        const baseName = path.basename(src);
        const destName = `${Date.now()}-${baseName}`;
        const dest = path.join(uploads, destName);
        fs.copyFileSync(src, dest);
        const st = fs.statSync(dest);
        const relHosted = path.join('uploads', destName).replace(/\\/g, '/');
        res.json({ success: true, path: relHosted, filename: destName, size: st.size });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message || String(err) });
    }
});

// Parse platformio.ini and return device environments
app.get('/api/platformio-devices', (req, res) => {
    try {
        const pioPath = path.join(__dirname, '..', 'platformio.ini');
        if (!fs.existsSync(pioPath)) return res.json({ success: false, error: 'platformio.ini not found', devices: [] });

        const ini = fs.readFileSync(pioPath, 'utf8');
        const lines = ini.split(/\r?\n/);

        const devices = [];
        let currentEnv = null;
        const envRegex = /^\[env:?([^\]]*)\]/i;
        lines.forEach((raw) => {
            const line = raw.trim();
            if (!line || line.startsWith(';') || line.startsWith('#')) return;

            const envMatch = line.match(envRegex);
            if (envMatch) {
                // start new env
                currentEnv = { id: envMatch[1] || 'default', name: envMatch[1] || 'default', board: null, monitor_speed: null };
                devices.push(currentEnv);
                return;
            }

            if (!currentEnv) return; // skip global keys

            // parse key = value
            const kv = line.split('=', 2);
            if (kv.length !== 2) return;
            const key = kv[0].trim();
            const value = kv[1].trim();

            if (key === 'board' && currentEnv) currentEnv.board = value;
            if (key === 'monitor_speed' && currentEnv) currentEnv.monitor_speed = parseInt(value, 10) || null;
            if ((key === 'board' || key === 'monitor_speed') && currentEnv) {
                // store
            }
        });

        // If no envs found, fallback to [env] block defaults (common env)
        if (devices.length === 0) {
            // Try to parse the [env] default block
            const defaultBlock = ini.match(/\[env\]([\s\S]*?)\n\[/i);
            const defaults = { id: 'default', name: 'default', board: null, monitor_speed: null };
            if (defaultBlock && defaultBlock[1]) {
                const block = defaultBlock[1].split(/\r?\n/);
                block.forEach(l => {
                    const line = l.trim();
                    if (!line || line.startsWith(';') || line.startsWith('#')) return;
                    const kv = line.split('=', 2);
                    if (kv.length !== 2) return;
                    const key = kv[0].trim();
                    const value = kv[1].trim();
                    if (key === 'board') defaults.board = value;
                    if (key === 'monitor_speed') defaults.monitor_speed = parseInt(value, 10) || null;
                });
            }
            devices.push(defaults);
        }

        res.json({ success: true, devices });
    } catch (err) {
        console.error('Error reading platformio.ini:', err);
        res.status(500).json({ success: false, error: err.message || String(err), devices: [] });
    }
});

// Return raw platformio.ini content for editing
app.get('/api/platformio-raw', (req, res) => {
    try {
        const pioPath = path.join(__dirname, '..', 'platformio.ini');
        if (!fs.existsSync(pioPath)) return res.status(404).json({ success: false, error: 'platformio.ini not found' });
        const content = fs.readFileSync(pioPath, 'utf8');
        res.json({ success: true, content });
    } catch (err) {
        console.error('Error reading platformio.ini:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// Write platformio.ini content. body: { content: string, backend: 'node'|'python' }
app.post('/api/platformio-write', async (req, res) => {
    try {
        const { content, backend } = req.body || {};
        if (typeof content !== 'string') return res.status(400).json({ success: false, error: 'content required' });

        const pioPath = path.join(__dirname, '..', 'platformio.ini');
        if (!fs.existsSync(pioPath)) return res.status(404).json({ success: false, error: 'platformio.ini not found' });

        const backupPath = pioPath + '.' + Date.now() + '.bak';
        fs.copyFileSync(pioPath, backupPath);

        if (backend === 'python') {
            // Try to invoke python helper if available
            const py = process.env.PYTHON || 'python';
            const script = path.join(__dirname, 'tools', 'platformio_write.py');
            if (!fs.existsSync(script)) {
                // fallback to node write
                fs.writeFileSync(pioPath, content, 'utf8');
                return res.json({ success: true, method: 'node', backup: backupPath });
            }

            // spawn python and pass content via stdin
            const proc = spawn(py, [script, pioPath], { stdio: ['pipe', 'pipe', 'pipe'] });
            proc.stdin.write(content);
            proc.stdin.end();

            let out = '';
            let errBuf = '';
            proc.stdout.on('data', d => out += d.toString());
            proc.stderr.on('data', d => errBuf += d.toString());
            proc.on('close', (code) => {
                // log helper output
                if (out) appendLog('python', `out: ${out.replace(/\r?\n/g,'\\n')}`);
                if (errBuf) appendLog('python', `err: ${errBuf.replace(/\r?\n/g,'\\n')}`);
                if (code === 0) return res.json({ success: true, method: 'python', backup: backupPath, out });
                console.error('python write failed:', errBuf);
                return res.status(500).json({ success: false, error: 'python write failed', details: errBuf });
            });
            return;
        }

        // Default: node write
        fs.writeFileSync(pioPath, content, 'utf8');
        res.json({ success: true, method: 'node', backup: backupPath });
    } catch (err) {
        console.error('Error writing platformio.ini:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// List files under repo-level wwwroot for discovery
app.get('/wwwroot-list', (req, res) => {
    try {
        if (!fs.existsSync(repoWwwRoot)) return res.json({ success: false, error: 'wwwroot not present' });
        const walk = (dir) => {
            const results = [];
            const list = fs.readdirSync(dir);
            list.forEach((file) => {
                const full = path.join(dir, file);
                const stat = fs.statSync(full);
                if (stat && stat.isDirectory()) {
                    const sub = walk(full);
                    sub.forEach(s => results.push(path.join(file, s)));
                } else {
                    results.push(file);
                }
            });
            return results;
        };

        const files = walk(repoWwwRoot);
        res.json({ success: true, root: repoWwwRoot, files });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Logging APIs
app.get('/api/log/list', (req, res) => {
    try {
        const files = fs.readdirSync(logsDir).filter(f => f.endsWith('.log'));
        const names = files.map(f => f.replace(/\.log$/, ''));
        res.json({ success: true, logs: names });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Return a list of registered express routes for UI discovery
app.get('/api/list', (req, res) => {
    try {
        const routes = [];
        // Express 4 stores routes in app._router.stack
        const stack = app._router && app._router.stack ? app._router.stack : [];
        stack.forEach((layer) => {
            if (layer.route && layer.route.path) {
                const methods = layer.route.methods;
                Object.keys(methods).forEach(m => {
                    routes.push({ method: m.toUpperCase(), path: layer.route.path });
                });
            } else if (layer.name === 'router' && layer.handle && layer.handle.stack) {
                layer.handle.stack.forEach((nested) => {
                    if (nested.route && nested.route.path) {
                        const methods = nested.route.methods;
                        Object.keys(methods).forEach(m => {
                            routes.push({ method: m.toUpperCase(), path: nested.route.path });
                        });
                    }
                });
            }
        });

        // Deduplicate and sort
        const uniq = [];
        const seen = new Set();
        routes.forEach(r => {
            const key = `${r.method} ${r.path}`;
            if (!seen.has(key)) { seen.add(key); uniq.push(r); }
        });

        uniq.sort((a,b) => (a.path > b.path ? 1 : a.path < b.path ? -1 : a.method > b.method ? 1 : -1));
        res.json({ success: true, routes: uniq });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message || String(err) });
    }
});

app.get('/api/log/read', (req, res) => {
    try {
        const name = req.query.name;
        if (!name) return res.status(400).json({ success: false, error: 'name query required' });
        const text = tailLines(name, parseInt(req.query.lines) || 500);
        res.json({ success: true, name, text });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Server-sent events for live tail
app.get('/api/log/stream', (req, res) => {
    const name = req.query.name;
    if (!name) return res.status(400).send('name required');
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive'
    });
    // send initial tail
    const initial = tailLines(name, 200);
    if (initial) res.write(`data: ${JSON.stringify({ initial })}\n\n`);

    const onLine = (line) => {
        try { res.write(`data: ${JSON.stringify({ line })}\n\n`); } catch (e) {}
    };

    logEmitter.on(name, onLine);
    req.on('close', () => logEmitter.removeListener(name, onLine));
});

// Ingest external logs (client JS, python helper) via POST { name, message }
app.post('/api/log', (req, res) => {
    try {
        const { name, message } = req.body || {};
        if (!name || !message) return res.status(400).json({ success: false, error: 'name and message required' });
        appendLog(name, message);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Device file management endpoints - proxy to ESP32 device
// New: device log tail proxy and TFT print proxy
app.get('/api/device/logs/tail', async (req, res) => {
    // Limit tail requests (initial bursts) to reduce device pressure
    if (rateLimit(req, res, 'device_logs_tail', 12)) return;
    try {
        const host = req.query.host;
        const lines = req.query.lines || 200;
        if (!host) return res.status(400).json({ success: false, error: 'host required' });

        const url = `http://${host}/api/logs/tail?lines=${encodeURIComponent(lines)}`;
        const response = await axios.get(url, { timeout: 8000 });
        res.json({ success: true, host, lines: Number(lines), data: response.data });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message || 'Failed to tail logs' });
    }
});

app.post('/api/device/tft/print', async (req, res) => {
    try {
        const { host, text } = req.body || {};
        if (!host) return res.status(400).json({ success: false, error: 'host required' });
        const payload = new URLSearchParams();
        if (typeof text === 'string') payload.append('text', text);
        const url = `http://${host}/api/tft/print`;
        const response = await axios.post(url, payload.toString(), {
            timeout: 8000,
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });
        res.json({ success: true, host, data: response.data });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message || 'Failed to print to TFT' });
    }
});

app.get('/api/device-files/list', async (req, res) => {
    try {
        const host = req.query.host || '192.168.26.117';
        const dir = req.query.dir || '/';

        const response = await axios.get(`http://${host}/list_files?dir=${encodeURIComponent(dir)}`, {
            timeout: 5000
        });

        res.json({ success: true, ...response.data });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to list device files'
        });
    }
});

app.get('/api/device-files/read', async (req, res) => {
    try {
        const host = req.query.host || '192.168.26.117';
        const path = req.query.path;

        if (!path) {
            return res.status(400).json({ success: false, error: 'Path parameter required' });
        }

        const response = await axios.get(`http://${host}/read_file?path=${encodeURIComponent(path)}`, {
            timeout: 10000
        });

        res.json({
            success: true,
            content: response.data,
            path: path
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to read device file'
        });
    }
});

app.post('/api/device-files/write', async (req, res) => {
    try {
        const { host = '192.168.26.117', path, content } = req.body;

        if (!path || content === undefined) {
            return res.status(400).json({ success: false, error: 'Path and content required' });
        }

        // Firmware expects x-www-form-urlencoded form fields (path, content)
        const body = new URLSearchParams();
        body.append('path', path);
        body.append('content', typeof content === 'string' ? content : String(content));

        await axios.post(`http://${host}/update_file`, body.toString(), {
            timeout: 15000,
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });

        res.json({ success: true, message: 'File updated successfully' });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to write device file'
        });
    }
});

app.post('/api/device-files/create', async (req, res) => {
    try {
        const { host = '192.168.26.117', path, content = '' } = req.body;

        if (!path) {
            return res.status(400).json({ success: false, error: 'Path required' });
        }

        // Firmware expects x-www-form-urlencoded form fields (path, content)
        const body = new URLSearchParams();
        body.append('path', path);
        body.append('content', typeof content === 'string' ? content : String(content));

        await axios.post(`http://${host}/create_file`, body.toString(), {
            timeout: 15000,
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });

        res.json({ success: true, message: 'File created successfully' });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to create device file'
        });
    }
});

app.delete('/api/device-files/delete', async (req, res) => {
    try {
        const host = req.query.host || '192.168.26.117';
        const path = req.query.path;

        if (!path) {
            return res.status(400).json({ success: false, error: 'Path parameter required' });
        }

        const response = await axios.delete(`http://${host}/delete_file?path=${encodeURIComponent(path)}`, {
            timeout: 10000
        });

        res.json({ success: true, message: 'File deleted successfully' });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to delete device file'
        });
    }
});

// Local source file browser (for reference/comparison)
app.get('/api/source-files/tree', (req, res) => { try { const tree = fileManager.getFileTree(); res.json({ success: true, tree }); } catch (error) { res.status(500).json({ success: false, error: error.message }); } });

app.get('/api/source-files/stats', (req, res) => { try { const stats = fileManager.getProjectStats(); res.json({ success: true, stats }); } catch (error) { res.status(500).json({ success: false, error: error.message }); } });

app.get('/api/source-files/recent', (req, res) => { try { const limit = parseInt(req.query.limit) || 20; const files = fileManager.getRecentFiles(limit); res.json({ success: true, files }); } catch (error) { res.status(500).json({ success: false, error: error.message }); } });

// Read single local source file (relative path)
app.get('/api/source-files/read', (req, res) => { try { const p = req.query.path; if (!p) return res.status(400).json({ success: false, error: 'path query required' }); const file = fileManager.readFile(p); res.json({ success: true, file }); } catch (err) { res.status(500).json({ success: false, error: err.message || String(err) }); } });

// Simple health endpoint
app.get('/api/health', (req, res) => {
    res.json({ ok:true, uptimeSec: Math.floor(process.uptime()), pid: process.pid, serialAvailable: !!(serialManager && serialManager.isAvailable && serialManager.isAvailable()), aiAgent: !!aiAgent });
});

app.get('/api/source-files/search', (req, res) => {
    try {
        const { query, types, limit } = req.query;
        if (!query) {
            return res.status(400).json({ success: false, error: 'Query parameter required' });
        }

        const fileTypes = types ? types.split(',') : [];
        const maxResults = parseInt(limit) || 100;
        const results = fileManager.searchInFiles(query, fileTypes, maxResults);

        res.json({ success: true, results, query, count: results.length });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Development Tools API Endpoints
app.post('/api/build', (req, res) => {
    const { type } = req.body;
    const processId = Date.now().toString();

    res.json({ success: true, processId, message: `${type} build started` });

    // Map build types to actions
    const buildActions = {
        'quick': 'fast-build',
        'build-upload': 'build-upload',
        'clean': 'clean'
    };

    const action = buildActions[type] || 'build';
    executeAction(action, processId);
});

app.get('/api/analyze-build', (req, res) => {
    try {
        // Mock build analysis data - in real implementation this would analyze actual build files
        const analysis = {
            firmwareSize: 2097152, // 2MB
            flashUsage: 65,
            ramUsage: 45,
            buildTime: 12.5,
            warnings: [
                'Warning: Unused variable in main.cpp:45',
                'Warning: Deprecated function call in wifi_manager.cpp:123'
            ],
            errors: []
        };

        res.json({ success: true, ...analysis });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/devices/status', async (req, res) => {
    try {
        // Mock device status - in real implementation this would ping devices
        const devices = [
            {
                ip: '192.168.26.117',
                name: 'ESP32-S3 DevKit',
                status: 'online',
                firmware: 'OutdoorAP v1.2.3',
                uptime: '2h 34m',
                lastSeen: new Date().toISOString()
            },
            {
                ip: '192.168.4.2',
                name: 'ESP32-C6 Radio',
                status: 'offline',
                firmware: 'Unknown',
                uptime: 'N/A',
                lastSeen: new Date(Date.now() - 5 * 60 * 1000).toISOString()
            }
        ];

        res.json(devices);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Build and execution endpoints
app.post('/api/execute', (req, res) => {
    const { action, config, remote } = req.body;

    // Update current config
    if (config) {
        currentConfig = { ...currentConfig, ...config };
    }

    const processId = Date.now().toString();
    res.json({ success: true, processId });

    // Execute the action (local or remote)
    if (remote && remote.enabled) {
        executeRemoteAction(action, processId, remote.serverId);
    } else {
        executeAction(action, processId);
    }
});

function executeAction(action, processId) {
    let scriptPath = '';
    let args = [];

    // Build arguments based on current config
    const buildArgs = () => {
        const baseArgs = [
            '-Environment', currentConfig.environment,
            '-ComPort', currentConfig.comPort,
            '-BaudRate', currentConfig.baudRate.toString()
        ];

        if (currentConfig.jobs > 0) {
            baseArgs.push('-Jobs', currentConfig.jobs.toString());
        }

        if (currentConfig.fastBuild) baseArgs.push('-FastBuild');
        if (currentConfig.clean) baseArgs.push('-Clean');
        if (currentConfig.verbose) baseArgs.push('-Verbose');
        if (currentConfig.filesystemOnly) baseArgs.push('-FilesystemOnly');
        if (currentConfig.skipUpload) baseArgs.push('-SkipUpload');
        if (currentConfig.monitor) baseArgs.push('-Monitor');

        return baseArgs;
    };

    switch (action) {
        case 'build':
            scriptPath = path.join('..', 'compile.py');
            args = [...buildArgs(), '-SkipUpload'];
            break;
        case 'upload':
            scriptPath = path.join('..', 'compile.py');
            args = [...buildArgs(), '-SkipBuild'];
            break;
        case 'build-upload':
            scriptPath = path.join('..', 'compile.py');
            args = buildArgs();
            break;
        case 'fast-build':
            scriptPath = path.join('..', 'fast_compile.py');
            args = buildArgs();
            break;
        case 'clean':
            scriptPath = path.join('..', 'compile.py');
            args = [...buildArgs(), '-Clean', '-SkipUpload'];
            break;
        case 'monitor':
            scriptPath = 'pio';
            args = ['device', 'monitor', '--port', currentConfig.comPort, '--baud', '115200'];
            break;
        case 'configure-wifi':
            scriptPath = path.join('..', 'configure_wifi.py');
            args = [];
            break;
        case 'configure-newton':
            scriptPath = path.join('..', 'configure_newton_m3.py');
            args = [];
            break;
        case 'validate-config':
            scriptPath = 'python';
            args = [path.join('..', 'validate_config.py')];
            break;
        case 'test-endpoints':
            scriptPath = path.join('..', 'test_api_endpoints.py');
            args = [];
            break;
        default:
            io.emit('process-error', { processId, error: 'Unknown action' });
            return;
    }

    // If the scriptPath looks like a Python script, run with python.
    let command, finalArgs;
    if (String(scriptPath).toLowerCase().endsWith('.py')) {
        command = 'python';
        finalArgs = [scriptPath, ...args];
    } else {
        // treat scriptPath as a direct command (e.g., 'pio') or an executable path
        command = scriptPath;
        finalArgs = args;
    }

    // Start the process
    const process = spawn(command, finalArgs, {
        cwd: path.join(__dirname, '..'),
        stdio: ['pipe', 'pipe', 'pipe']
    });

    activeProcesses.set(processId, process);

    io.emit('process-started', { processId, action, command: `${command} ${finalArgs.join(' ')}` });

    let outputBuffer = '';
    let errorBuffer = '';

    process.stdout.on('data', (data) => {
        const output = data.toString();
        outputBuffer += output;
        io.emit('process-output', { processId, type: 'stdout', data: output });
    });

    process.stderr.on('data', (data) => {
        const error = data.toString();
        errorBuffer += error;
        io.emit('process-output', { processId, type: 'stderr', data: error });
    });

    process.on('close', (code) => {
        activeProcesses.delete(processId);
        io.emit('process-finished', { processId, exitCode: code });

        // AI Analysis for errors
        if (code !== 0 && aiAgent.isAvailable()) {
            aiAgent.analyzeError(errorBuffer + outputBuffer, {
                action,
                config: currentConfig,
                exitCode: code
            }).then(analysis => {
                if (analysis) {
                    io.emit('ai-analysis', {
                        processId,
                        type: 'error',
                        analysis,
                        timestamp: new Date().toISOString()
                    });
                }
            }).catch(err => {
                console.error('AI error analysis failed:', err);
            });
        }
    });

    process.on('error', (error) => {
        activeProcesses.delete(processId);
        io.emit('process-error', { processId, error: error.message });
    });
}

// Remote execution function
async function executeRemoteAction(action, processId, serverId) {
    try {
        io.emit('process-started', { processId, action, command: `Remote: ${action}`, serverId });

        // Map action to remote command
        let command = '';
        const server = remoteManager.getServer(serverId);
        const workingDir = server.projectPath;

        switch (action) {
            case 'build':
                command = 'pio run';
                break;
            case 'upload':
                command = `pio run --target upload --upload-port ${currentConfig.comPort}`;
                break;
            case 'build-upload':
                command = `pio run --target upload --upload-port ${currentConfig.comPort}`;
                break;
            case 'fast-build':
                command = `pio run -j ${currentConfig.jobs || 'auto'}`;
                break;
            case 'clean':
                command = 'pio run --target clean';
                break;
            case 'monitor':
                command = `pio device monitor --port ${currentConfig.comPort} --baud 115200`;
                break;
            case 'configure-wifi':
                command = 'python3 configure_wifi.py';
                break;
            case 'validate-config':
                command = 'python3 validate_config.py';
                break;
            default:
                io.emit('process-error', { processId, error: 'Unknown remote action' });
                return;
        }

        // Execute command on remote server with streaming output
        await remoteManager.executeCommandStream(serverId, command, (output) => {
            io.emit('process-output', {
                processId,
                type: output.type,
                data: output.data
            });
        }, { cwd: workingDir });

        io.emit('process-finished', { processId, exitCode: 0, remote: true });

        // If this was a build, optionally download the artifacts
        if (action.includes('build') && !action.includes('upload')) {
            try {
                const remoteBuildPath = path.join(workingDir, '.pio/build', currentConfig.environment);
                const localBuildPath = path.join(__dirname, '..', '.pio', 'build', currentConfig.environment);

                await remoteManager.downloadBuild(serverId, remoteBuildPath, localBuildPath);
                io.emit('process-output', {
                    processId,
                    type: 'stdout',
                    data: '\n✓ Build artifacts downloaded to local machine\n'
                });
            } catch (downloadError) {
                io.emit('process-output', {
                    processId,
                    type: 'stderr',
                    data: `\nWarning: Failed to download build artifacts: ${downloadError.message}\n`
                });
            }
        }

    } catch (error) {
        io.emit('process-error', { processId, error: error.message, remote: true });
        io.emit('process-finished', { processId, exitCode: 1, remote: true });

        // AI Analysis for remote errors
        if (aiAgent.isAvailable()) {
            aiAgent.analyzeError(error.message, {
                action,
                config: currentConfig,
                remote: true,
                serverId,
                exitCode: 1
            }).then(analysis => {
                if (analysis) {
                    io.emit('ai-analysis', {
                        processId,
                        type: 'error',
                        analysis,
                        remote: true,
                        timestamp: new Date().toISOString()
                    });
                }
            }).catch(err => {
                console.error('AI remote error analysis failed:', err);
            });
        }
    }
}

// Kill process endpoint
app.post('/api/kill/:processId', (req, res) => {
    const { processId } = req.params;
    const process = activeProcesses.get(processId);

    if (process) {
        process.kill();
        activeProcesses.delete(processId);
        res.json({ success: true });
    } else {
        res.json({ success: false, error: 'Process not found' });
    }
});

// AI Agent endpoints
/**
 * AI Endpoints Overview
 * GET  /api/ai/config         -> Safe config (keys masked)
 * POST /api/ai/config         -> Update config (body may include openai, anthropic, features, editing)
 * POST /api/ai/chat           -> { message, context? }
 * POST /api/ai/analyze-code   -> { filePath, code }
 * POST /api/ai/suggestions    -> { input, projectState }
 * GET  /api/ai/history        -> conversation history
 * DELETE /api/ai/history      -> clear history
 * GET  /api/ai/files          -> list editable files (requires editing enabled)
 * GET  /api/ai/file?path=     -> fetch file content
 * POST /api/ai/patch/preview  -> { path, instruction } generate diff & proposed content
 * POST /api/ai/patch/apply    -> { path, instruction } apply AI edit (atomic)
 * GET  /api/ai/health         -> Provider availability + feature flags
 */
app.get('/api/ai/config', (req, res) => {
    res.json(aiAgent.getConfig());
});

app.post('/api/ai/config', (req, res) => {
    try {
        const body = req.body || {};
        // Defensive merge ensuring nested objects exist
        const merged = {};
        if (body.openai) {
            merged.openai = {
                apiKey: body.openai.apiKey !== undefined ? body.openai.apiKey : aiAgent.config.openai.apiKey,
                model: body.openai.model || aiAgent.config.openai.model,
                enabled: !!body.openai.enabled
            };
        }
        if (body.anthropic) {
            merged.anthropic = {
                apiKey: body.anthropic.apiKey !== undefined ? body.anthropic.apiKey : aiAgent.config.anthropic.apiKey,
                model: body.anthropic.model || aiAgent.config.anthropic.model,
                enabled: !!body.anthropic.enabled
            };
        }
        if (body.features) {
            merged.features = { ...aiAgent.config.features, ...body.features };
        }
        if (body.codeEditing !== undefined) { // backward compatibility (older clients may send separate flag)
            merged.features = { ...aiAgent.config.features, codeEditing: !!body.codeEditing };
        }
        if (body.editing) {
            merged.editing = { ...aiAgent.config.editing };
            if (body.editing.enableFileEdits !== undefined) merged.editing.enableFileEdits = !!body.editing.enableFileEdits;
            if (body.editing.maxFileSize) merged.editing.maxFileSize = parseInt(body.editing.maxFileSize,10) || aiAgent.config.editing.maxFileSize;
            if (Array.isArray(body.editing.allowedExtensions)) merged.editing.allowedExtensions = body.editing.allowedExtensions.filter(e=>/^\./.test(e));
            if (Array.isArray(body.editing.blockList)) merged.editing.blockList = body.editing.blockList;
            if (body.editing.root && typeof body.editing.root === 'string') {
                // For safety: ignore attempts to move root outside current root
                try {
                    const proposed = path.resolve(body.editing.root);
                    const current = path.resolve(aiAgent.config.editing.root);
                    if (proposed.startsWith(current)) merged.editing.root = proposed; // allow narrowing deeper
                } catch {/* ignore */}
            }
        }
        aiAgent.updateConfig(merged);
        res.json({ success: true, config: aiAgent.getConfig() });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/ai/chat', async (req, res) => {
    if (!aiAgent) return res.status(503).json({ success:false, error:'AI agent unavailable on server' });
    try {
    let { message, context, messages, provider, verbosity, maxTokens, temperature, reasoningEffort } = req.body || {};

        // Allow client to send an array of messages (chat history); extract last user message
        if (!message && Array.isArray(messages)) {
            // Find last user role content; also build a condensed context from prior assistant turns
            const userMsgs = messages.filter(m=>m && m.role==='user');
            const lastUser = userMsgs[userMsgs.length-1];
            if (lastUser) message = lastUser.content;
            if (!context) {
                // Derive lightweight context of last few exchanges (excluding final user message)
                const recent = messages.slice(-6, -1).map(m=>({ role:m.role, content: (m.content||'').slice(0,400) }));
                context = { prior: recent };
            }
        }

        // Alternate top-level keys (prompt, input, text, content)
        if (!message) {
            const b = req.body || {};
            message = b.prompt || b.input || b.text || b.content || message;
        }

        // If still no message and messages array present, attempt broader extraction
        if (!message && Array.isArray(messages)) {
            for (let i = messages.length - 1; i >= 0; i--) {
                const m = messages[i];
                if (!m) continue;
                const cand = m.content || m.message || m.text || m.prompt;
                if (typeof cand === 'string' && cand.trim()) { message = cand.trim(); break; }
            }
        }

        if (provider && typeof provider === 'string') {
            // Temporary provider override (does not persist) – if allowed by config
            const prev = aiAgent.config.defaultProvider;
            if (aiAgent.config.agent?.allowDynamicProviderSwitch) {
                aiAgent.config.defaultProvider = provider;
                // Re-initialize clients only if switching to provider requiring key and not yet initialized
                if (provider==='openai' || provider==='anthropic') aiAgent.initializeClients();
                // We'll restore after response
                var restoreProvider = prev; // var for function scope
            }
        }

        if (!message || typeof message !== 'string') {
            return res.status(400).json({ success:false, error:'Missing message string (expected body.message or body.messages[...].content or prompt/input/text/content)' });
        }

        const started = Date.now();
        let response;
        try {
            response = await aiAgent.chat(message, context || {}, { verbosity, maxTokens, temperature, reasoningEffort });
        } finally {
            if (typeof restoreProvider !== 'undefined') aiAgent.config.defaultProvider = restoreProvider;
        }
        const elapsed = Date.now() - started;
        const modelUsed = aiAgent.lastModelUsed || aiAgent.config.openai.model || aiAgent.config.anthropic.model || aiAgent.config.ollama.model;
        appendLog('api', `ai/chat ok provider=${aiAgent.config.defaultProvider} model=${modelUsed} ms=${elapsed} chars=${(response||'').length}`);
        res.json({ success: true, response, reply: response, elapsedMs: elapsed, modelUsed });
    } catch (error) {
        appendLog('api', `ai/chat error: ${error.message}`);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Streaming chat (SSE) - OpenAI only for now
app.get('/api/ai/chat/stream', async (req, res) => {
    if (!aiAgent) return res.status(503).json({ success:false, error:'AI agent unavailable on server' });
    const { message, prompt, input, text, content, verbosity, maxTokens, temperature, reasoningEffort } = req.query;
    let msg = message || prompt || input || text || content;
    if (!msg) {
        res.status(400).json({ success:false, error:'Missing message (query param message|prompt|input|text|content)' });
        return;
    }
    // SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();
    const started = Date.now();
    let full = '';
    const send = (event, data) => {
        res.write(`event: ${event}\n`);
        res.write(`data: ${JSON.stringify(data)}\n\n`);
    };
    try {
        let fallbackUsed = false;
        await aiAgent.streamChat(msg, {}, { verbosity, maxTokens: maxTokens?parseInt(maxTokens,10):undefined, temperature: temperature?parseFloat(temperature):undefined, reasoningEffort }, (delta) => {
            full += delta;
            send('token', { delta });
        });
        const elapsed = Date.now() - started;
        send('done', { success:true, message: full, elapsedMs: elapsed, modelUsed: aiAgent.lastModelUsed, provider: aiAgent.config.defaultProvider, fallbackUsed });
    } catch (e) {
        const errMsg = e.message || 'stream error';
        const verification = /verification|not authorized for streaming|pending approval|requires verification/i.test(errMsg);
        send('error', { success:false, error: errMsg, modelUsed: aiAgent.lastModelUsed, provider: aiAgent?.config?.defaultProvider, verificationRelated: verification });
    } finally {
        res.end();
    }
});

app.post('/api/ai/analyze-code', async (req, res) => {
    try {
        const { filePath, code } = req.body;
        const analysis = await aiAgent.analyzeCode(filePath, code);
        res.json({ success: true, analysis });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/ai/suggestions', async (req, res) => {
    try {
        const { input, projectState } = req.body;
        const suggestions = await aiAgent.getAutoSuggestions(input, projectState);
        res.json({ success: true, suggestions });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/ai/history', (req, res) => {
    res.json(aiAgent.getHistory());
});

app.delete('/api/ai/history', (req, res) => {
    aiAgent.clearHistory();
    res.json({ success: true });
});

app.get('/api/ai/health', (req, res) => {
    try {
        const cfg = aiAgent.getConfig();
        res.json({
            success: true,
            providers: {
                openai: { enabled: cfg.openai.enabled, model: cfg.openai.model, available: !!aiAgent.openai },
                anthropic: { enabled: cfg.anthropic.enabled, model: cfg.anthropic.model, available: !!aiAgent.anthropic },
                ollama: { enabled: !!cfg.ollama?.enabled, model: cfg.ollama?.model || null, available: !!cfg.ollama?.enabled }
            },
            features: cfg.features,
            editing: cfg.editing ? { ...cfg.editing, apiKeyMasked: true } : null,
            available: aiAgent.isAvailable()
        });
    } catch (e) {
        res.status(500).json({ success:false, error: e.message });
    }
});

// List local Ollama models (if enabled)
app.get('/api/ai/ollama/models', async (req, res) => {
    try {
        const cfg = aiAgent.getConfig();
        if (!cfg.ollama || !cfg.ollama.enabled) return res.json({ success:true, enabled:false, models:[] });
        const base = (cfg.ollama.url || 'http://localhost:11434').replace(/\/$/, '');
        const url = base + '/api/tags';
        let fetchImpl = (typeof fetch !== 'undefined') ? fetch : null;
        if (!fetchImpl) { try { fetchImpl = require('node-fetch'); } catch (_) {} }
        if (!fetchImpl) return res.status(500).json({ success:false, error:'fetch unavailable' });
        const r = await fetchImpl(url, { timeout: 7000 }).catch(e => { throw new Error('request failed: '+e.message); });
        if (!r.ok) return res.status(502).json({ success:false, error: 'ollama http '+r.status });
        let j; try { j = await r.json(); } catch (e) { return res.status(500).json({ success:false, error:'bad json '+e.message }); }
        const models = Array.isArray(j.models) ? j.models.map(m => ({ name: m.name, size: m.size, modified: m.modified })) : [];
        res.json({ success:true, enabled:true, models });
    } catch (e) {
        res.status(500).json({ success:false, error: e.message });
    }
});

// --- AI Assisted Code Editing Endpoints ---
// Security & safety constraints applied:
//  * Must enable both config.features.codeEditing and config.editing.enableFileEdits
//  * File must reside under configured root (default repo root) and within size & extension allow-lists
//  * Preview endpoint never writes; Apply endpoint performs atomic write via temp file + rename
//  * Block list prevents modification of sensitive runtime/config files

function aiEditingEnabled() {
    try { return aiAgent.config.features.codeEditing && aiAgent.config.editing.enableFileEdits; } catch { return false; }
}

function resolveSafePath(rel) {
    const root = aiAgent.config.editing.root;
    const full = path.resolve(root, rel);
    if (!full.startsWith(path.resolve(root))) throw new Error('Path outside allowed root');
    return full;
}

function validateFileTarget(fullPath) {
    const { allowedExtensions, maxFileSize, blockList } = aiAgent.config.editing;
    const ext = path.extname(fullPath).toLowerCase();
    if (!allowedExtensions.includes(ext)) throw new Error('Extension not allowed');
    const base = path.basename(fullPath);
    if (blockList.includes(base)) throw new Error('File is blocked');
    if (!fs.existsSync(fullPath)) throw new Error('File does not exist');
    const stat = fs.statSync(fullPath);
    if (!stat.isFile()) throw new Error('Not a regular file');
    if (stat.size > maxFileSize) throw new Error('File exceeds size limit');
    // crude binary detection: if first 800 bytes contain many \0 bytes
    const fd = fs.openSync(fullPath, 'r');
    const buf = Buffer.alloc(Math.min(800, stat.size));
    fs.readSync(fd, buf, 0, buf.length, 0); fs.closeSync(fd);
    const nulCount = buf.reduce((a,b)=> a + (b===0?1:0),0);
    if (nulCount > 5) throw new Error('Binary file rejected');
    return stat.size;
}

function listTextFiles(dir, root, acc, depth=0) {
    if (depth > 6) return; // limit breadth
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const ent of entries) {
        const full = path.join(dir, ent.name);
        if (ent.isDirectory()) {
            if (['.git', 'node_modules', '.pio', 'build', 'dist'].includes(ent.name)) continue;
            listTextFiles(full, root, acc, depth+1);
        } else {
            const ext = path.extname(ent.name).toLowerCase();
            if (aiAgent.config.editing.allowedExtensions.includes(ext)) {
                acc.push(path.relative(root, full));
            }
        }
    }
}

app.get('/api/ai/files', (req, res) => {
    if (!aiEditingEnabled()) return res.status(403).json({ success:false, error:'Editing disabled' });
    try {
        const root = aiAgent.config.editing.root;
        const files = [];
        listTextFiles(root, root, files);
        res.json({ success:true, files });
    } catch (e) { res.status(500).json({ success:false, error:e.message }); }
});

app.get('/api/ai/file', (req, res) => {
    if (!aiEditingEnabled()) return res.status(403).json({ success:false, error:'Editing disabled' });
    const rel = req.query.path;
    if (!rel) return res.status(400).json({ success:false, error:'path required'});
    try {
        const full = resolveSafePath(rel);
        validateFileTarget(full);
        const content = fs.readFileSync(full, 'utf8');
        res.json({ success:true, path: rel, content });
    } catch (e) { res.status(400).json({ success:false, error:e.message }); }
});

// computeUnifiedDiff moved to ./lib/diff

app.post('/api/ai/patch/preview', async (req, res) => {
    if (!aiEditingEnabled()) return res.status(403).json({ success:false, error:'Editing disabled' });
    const { path: relPath, instruction } = req.body || {};
    if (!relPath || !instruction) return res.status(400).json({ success:false, error:'path and instruction required' });
    try {
        const full = resolveSafePath(relPath);
        validateFileTarget(full);
        const original = fs.readFileSync(full, 'utf8');
        const { reasoning, content } = await aiAgent.generateFileEdit(relPath, original, instruction);
    const { computeUnifiedDiff } = require('./lib/diff');
    const diff = computeUnifiedDiff(original, content, relPath);
        res.json({ success:true, reasoning, diff, proposed: content });
    } catch (e) { res.status(400).json({ success:false, error:e.message }); }
});

app.post('/api/ai/patch/apply', async (req, res) => {
    if (!aiEditingEnabled()) return res.status(403).json({ success:false, error:'Editing disabled' });
    const { path: relPath, instruction, token } = req.body || {};
    if (!relPath || !instruction) return res.status(400).json({ success:false, error:'path and instruction required'});
    // Basic CSRF-ish token optional hook: require token if configured later
    try {
        const full = resolveSafePath(relPath);
        validateFileTarget(full);
        const original = fs.readFileSync(full, 'utf8');
        const { reasoning, content } = await aiAgent.generateFileEdit(relPath, original, instruction);
        const tmp = full + '.ai_tmp';
        fs.writeFileSync(tmp, content, 'utf8');
        fs.renameSync(tmp, full);
    const { computeUnifiedDiff } = require('./lib/diff');
    const diff = computeUnifiedDiff(original, content, relPath);
        appendLog('node', `AI_APPLY path=${relPath} bytes_old=${original.length} bytes_new=${content.length}`);
        res.json({ success:true, reasoning, diff });
    } catch (e) { res.status(400).json({ success:false, error:e.message }); }
});

// Remote Server endpoints
app.get('/api/remote/servers', (req, res) => {
    res.json(remoteManager.getServers());
});

app.get('/api/remote/status', (req, res) => {
    res.json(remoteManager.getConnectionStatus());
});

app.post('/api/remote/connect/:serverId', async (req, res) => {
    try {
        const { serverId } = req.params;
        await remoteManager.connect(serverId);
        res.json({ success: true, message: 'Connected successfully' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/remote/disconnect/:serverId', async (req, res) => {
    try {
        const { serverId } = req.params;
        await remoteManager.disconnect(serverId);
        res.json({ success: true, message: 'Disconnected successfully' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/remote/test/:serverId', async (req, res) => {
    try {
        const { serverId } = req.params;
        const result = await remoteManager.testConnection(serverId);
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/remote/execute/:serverId', async (req, res) => {
    try {
        const { serverId } = req.params;
        const { command, cwd } = req.body;
        const result = await remoteManager.executeCommand(serverId, command, { cwd });
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/remote/sync/:serverId', async (req, res) => {
    try {
        const { serverId } = req.params;
        const { localPath, remotePath } = req.body;
        const result = await remoteManager.syncProject(serverId, localPath, remotePath);
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/remote/info/:serverId', async (req, res) => {
    try {
        const { serverId } = req.params;
        const info = await remoteManager.getServerInfo(serverId);
        res.json({ success: true, info });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/remote/setup/:serverId', async (req, res) => {
    try {
        const { serverId } = req.params;
        const results = await remoteManager.setupRemoteEnvironment(serverId);
        res.json({ success: true, results });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/remote/server', async (req, res) => {
    try {
        const server = remoteManager.addServer(req.body);
        res.json({ success: true, server });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Lightweight remote connectivity probe: POST { host, port? }
// - If port provided: attempt TCP connect within 3s
// - Else: attempt HTTP HEAD to http://host (5s)
app.post('/api/remote/test-connection', async (req, res) => {
    try {
        const { host, port } = req.body || {};
        if (!host || typeof host !== 'string' || host.trim() === '') {
            return res.status(400).json({ success: false, error: 'host required' });
        }

        const cleanHost = host.trim().replace(/^https?:\/\//i, '').replace(/\/$/, '');
        const started = Date.now();

        const tcpProbe = (h, p, timeoutMs = 3000) => new Promise((resolve) => {
            const socket = new net.Socket();
            let done = false;
            const onDone = (ok, err) => {
                if (done) return; done = true;
                try { socket.destroy(); } catch (e) { /* ignore */ }
                resolve({ ok, error: err ? (err.message || String(err)) : undefined });
            };
            socket.setTimeout(timeoutMs);
            socket.once('connect', () => onDone(true));
            socket.once('timeout', () => onDone(false, new Error('timeout')));
            socket.once('error', (e) => onDone(false, e));
            try { socket.connect({ host: h, port: Number(p) }); } catch (e) { onDone(false, e); }
        });

        let result;
        if (port) {
            result = await tcpProbe(cleanHost, port);
        } else {
            // HTTP HEAD probe
            const url = /^https?:\/\//i.test(host) ? host : `http://${cleanHost}`;
            try {
                const resp = await axios.head(url, { timeout: 5000, validateStatus: () => true });
                result = { ok: resp.status < 500, status: resp.status };
            } catch (err) {
                result = { ok: false, error: err.message || String(err) };
            }
        }

        const durationMs = Date.now() - started;
        return res.json({ success: !!result.ok, durationMs, details: result, host: cleanHost, port: port || null });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.put('/api/remote/server/:serverId', async (req, res) => {
    try {
        const { serverId } = req.params;
        const server = remoteManager.updateServer(serverId, req.body);
        res.json({ success: true, server });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.delete('/api/remote/server/:serverId', async (req, res) => {
    try {
        const { serverId } = req.params;
        const success = remoteManager.removeServer(serverId);
        res.json({ success });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Socket.io connection handling
io.on('connection', (socket) => {
    const addr = socket.handshake.address || socket.conn?.remoteAddress || 'unknown';
    appendLog('ws', `connect id=${socket.id} addr=${addr}`);
    console.log('Client connected:', socket.id); // retain console for dev visibility

    socket.on('disconnect', (reason) => {
        appendLog('ws', `disconnect id=${socket.id} reason=${reason}`);
        console.log('Client disconnected:', socket.id);
    });
    socket.onAny((ev, ...args) => {
        try { appendLog('ws', `event ${ev} ${JSON.stringify(args)}`); } catch (e) { appendLog('ws', `event ${ev} <serialize error>`); }
    });

    // AI Socket handlers
    socket.on('ai-chat', async (data) => {
        try {
            const response = await aiAgent.chat(data.message, data.context);
            socket.emit('ai-response', {
                messageId: data.messageId,
                response,
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            socket.emit('ai-error', {
                messageId: data.messageId,
                error: error.message
            });
        }
    });

    socket.on('ai-analyze-project', async () => {
        try {
            const projectState = {
                config: currentConfig,
                status: getProjectStatus(),
                timestamp: new Date().toISOString()
            };

            const analysis = await aiAgent.chat(
                'Analyze the current project state and provide insights and recommendations.',
                { type: 'project_analysis', projectState }
            );

            socket.emit('ai-project-analysis', { analysis, projectState });
        } catch (error) {
            socket.emit('ai-error', { error: error.message });
        }
    });

    // Remote server socket handlers
    socket.on('remote-sync', async (data) => {
        try {
            const { serverId, localPath, remotePath } = data;
            const result = await remoteManager.syncProject(serverId, localPath, remotePath);
            socket.emit('remote-sync-result', result);
        } catch (error) {
            socket.emit('remote-error', { error: error.message });
        }
    });

    socket.on('remote-execute', async (data) => {
        try {
            const { serverId, command, cwd } = data;
            await remoteManager.executeCommandStream(serverId, command, (output) => {
                socket.emit('remote-output', output);
            }, { cwd });
        } catch (error) {
            socket.emit('remote-error', { error: error.message });
        }
    });

    // Web UI compatibility handlers (legacy event names used by public/app.js)
    // Allow the browser UI to request config, com ports, and to run scripts/commands
    socket.on('load_config', () => {
        socket.emit('config_loaded', currentConfig);
    });

    socket.on('save_config', (cfg) => {
        try {
            currentConfig = { ...currentConfig, ...cfg };
            socket.emit('config_saved', currentConfig);
            io.emit('config-update', currentConfig);
        } catch (err) {
            socket.emit('config_error', { error: err.message });
        }
    });

    socket.on('get_com_ports', async () => {
        try {
            const ports = await serialManager.listPorts();
            socket.emit('com_ports', ports);
        } catch (err) {
            socket.emit('com_ports', []);
        }
    });

    // Track a single active process per socket (UI expects one running at a time)
    const socketProcesses = {};

    function startAndStreamProcess(socket, command, args = [], options = {}) {
        try {
            const workingDir = path.join(__dirname, '..');
            const spawnOptions = Object.assign({
                cwd: workingDir,
                stdio: ['pipe', 'pipe', 'pipe'],
                shell: os.platform() === 'win32' // Use shell on Windows for better command resolution
            }, options);

            appendLog('process', `Starting: ${command} ${args.join(' ')} in ${workingDir}`);

            const proc = spawn(command, args, spawnOptions);

            // keep reference
            socketProcesses[socket.id] = proc;

            socket.emit('output', { type: 'stdout', data: `Started: ${command} ${args.join(' ')}\n` });
            io.emit('process-started', { processId: socket.id, command: `${command} ${args.join(' ')}` });

            proc.stdout.on('data', (data) => {
                const output = data.toString();
                socket.emit('output', { type: 'stdout', data: output });
                io.emit('process-output', { processId: socket.id, type: 'stdout', data: output });
                appendLog('process-out', output.replace(/\r?\n/g, '\\n'));
            });

            proc.stderr.on('data', (data) => {
                const error = data.toString();
                socket.emit('output', { type: 'stderr', data: error });
                io.emit('process-output', { processId: socket.id, type: 'stderr', data: error });
                appendLog('process-err', error.replace(/\r?\n/g, '\\n'));
            });

            proc.on('close', (code) => {
                delete socketProcesses[socket.id];
                const success = code === 0;
                socket.emit('process_complete', { success, code });
                io.emit('process-finished', { processId: socket.id, exitCode: code });
                appendLog('process', `Finished: ${command} with code ${code}`);
            });

            proc.on('error', (err) => {
                delete socketProcesses[socket.id];
                const msg = err && err.message ? err.message : String(err);
                socket.emit('output', { type: 'stderr', data: `Process error: ${msg}\n` });
                socket.emit('process_complete', { success: false, error: msg });
                io.emit('process-error', { processId: socket.id, error: msg });
                appendLog('process', `Error: ${command} - ${msg}`);
            });

            return proc;
        } catch (err) {
            const msg = err && err.message ? err.message : String(err);
            socket.emit('output', { type: 'stderr', data: `Failed to start process: ${msg}\n` });
            socket.emit('process_complete', { success: false, error: msg });
            appendLog('process', `Start error: ${command} - ${msg}`);
            return null;
        }
    }

    socket.on('run_script', (data) => {
        // data: { script: 'compile.py', args: [] } or { script: 'some_command', args: [] }
        const { script, args = [] } = data || {};
        if (!script) {
            socket.emit('output', { type: 'stderr', data: 'No script specified\n' });
            socket.emit('process_complete', { success: false, error: 'No script specified' });
            return;
        }

        // Resolve script path relative to project root when it looks like a file
        const ext = path.extname(script).toLowerCase();
        let command, finalArgs;

        if (ext === '.py') {
            // Handle Python scripts
            let scriptPath;
            if (path.isAbsolute(script)) {
                scriptPath = script;
            } else {
                // Try multiple possible locations for the script
                const possiblePaths = [
                    path.join(__dirname, '..', script),
                    path.join(__dirname, script),
                    script  // Current directory relative
                ];

                scriptPath = possiblePaths.find(p => {
                    try {
                        return fs.existsSync(p);
                    } catch (e) {
                        return false;
                    }
                });

                if (!scriptPath) {
                    socket.emit('output', { type: 'stderr', data: `Python script not found: ${script}\nTried: ${possiblePaths.join(', ')}\n` });
                    socket.emit('process_complete', { success: false, error: `Script not found: ${script}` });
                    return;
                }
            }

            command = PYTHON_EXEC;
            finalArgs = [scriptPath, ...args];
            socket.emit('output', { type: 'stdout', data: `Executing: ${command} ${finalArgs.join(' ')}\n` });
        } else if (ext === '.ps1') {
            // PowerShell script (Windows focused). Execute via pwsh / powershell.
            let scriptPath;
            if (path.isAbsolute(script)) {
                scriptPath = script;
            } else {
                const possiblePaths = [
                    path.join(__dirname, '..', script),
                    path.join(__dirname, script),
                    script
                ];
                scriptPath = possiblePaths.find(p => {
                    try { return fs.existsSync(p); } catch { return false; }
                });
                if (!scriptPath) {
                    socket.emit('output', { type: 'stderr', data: `PowerShell script not found: ${script}\nTried: ${possiblePaths.join(', ')}\n` });
                    socket.emit('process_complete', { success: false, error: `Script not found: ${script}` });
                    return;
                }
            }
            // Prefer pwsh, fallback to powershell
            command = (process.platform === 'win32') ? 'pwsh' : 'pwsh';
            finalArgs = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath, ...args];
            socket.emit('output', { type: 'stdout', data: `Executing (PowerShell): ${command} ${finalArgs.join(' ')}\n` });
        } else {
            // treat as command (e.g., 'pio' or node script)
            command = script;
            finalArgs = args;
            socket.emit('output', { type: 'stdout', data: `Executing: ${command} ${finalArgs.join(' ')}\n` });
        }

        startAndStreamProcess(socket, command, finalArgs);
    });

    socket.on('run_command', (data) => {
        // data: { command: 'pio', args: ['run'] }
        const { command, args = [] } = data || {};
        if (!command) {
            socket.emit('output', { type: 'stderr', data: 'No command specified\n' });
            socket.emit('process_complete', { success: false, error: 'No command specified' });
            return;
        }
        startAndStreamProcess(socket, command, args);
    });

    socket.on('stop_process', () => {
        const proc = socketProcesses[socket.id];
        if (proc) {
            try {
                proc.kill();
                socket.emit('output', { type: 'stdout', data: 'Process killed\n' });
                socket.emit('process_complete', { success: false, error: 'killed' });
            } catch (err) {
                socket.emit('output', { type: 'stderr', data: `Failed to kill process: ${err.message}\n` });
            }
        } else {
            socket.emit('output', { type: 'stderr', data: 'No active process to stop\n' });
        }
    });

    // Development Tools Socket Events
    socket.on('debug-command', (data) => {
        const { command } = data;
        socket.emit('debug-output', {
            message: `Command executed: ${command}`,
            level: 'INFO'
        });

        // In a real implementation, this would execute actual debug commands
        if (command.toLowerCase().includes('reset')) {
            socket.emit('debug-output', { message: 'Device reset command sent', level: 'WARN' });
        } else if (command.toLowerCase().includes('status')) {
            socket.emit('debug-output', { message: 'Device status: Online, Heap: 128KB free', level: 'INFO' });
        } else if (command.toLowerCase().includes('upload')) {
            socket.emit('debug-output', { message: 'Uploading filesystem...', level: 'INFO' });
        }
    });

    socket.on('request-memory-stats', () => {
        // Mock memory stats - in real implementation this would query the device
        const memStats = {
            heapFree: 131072,
            stackUsage: 12288,
            flashFree: 1258291,
            taskCount: 8
        };
        socket.emit('memory-stats', memStats);
    });

    socket.on('run-analysis', (data) => {
        const { type } = data;
        socket.emit('debug-output', {
            message: `Running ${type} analysis...`,
            level: 'INFO'
        });

        // Mock analysis results
        setTimeout(() => {
            if (type === 'code') {
                socket.emit('debug-output', { message: 'Code analysis complete: 2 potential issues found', level: 'WARN' });
            } else if (type === 'memory') {
                socket.emit('debug-output', { message: 'Memory analysis: 65% flash usage, 45% heap usage', level: 'INFO' });
            } else if (type === 'performance') {
                socket.emit('debug-output', { message: 'Performance analysis: Average response time 12ms', level: 'INFO' });
            } else if (type === 'dependencies') {
                socket.emit('debug-output', { message: 'Dependencies check: All libraries up to date', level: 'SUCCESS' });
            }
        }, 1000);
    });

    socket.on('device-command', (data) => {
        const { action } = data;
        socket.emit('debug-output', {
            message: `Device command: ${action}`,
            level: 'WARN'
        });

        // Mock device command responses
        setTimeout(() => {
            if (action === 'reset') {
                socket.emit('debug-output', { message: 'Device reset successful', level: 'SUCCESS' });
            } else if (action === 'erase-flash') {
                socket.emit('debug-output', { message: 'Flash memory erased', level: 'SUCCESS' });
            } else if (action === 'upload-fs') {
                socket.emit('debug-output', { message: 'Filesystem upload started', level: 'INFO' });
            }
        }, 2000);
    });

    socket.on('run-tests', (data) => {
        const { type } = data;
        socket.emit('debug-output', {
            message: `Running ${type} tests...`,
            level: 'INFO'
        });

        // Mock test results
        setTimeout(() => {
            if (type === 'unit') {
                socket.emit('debug-output', { message: 'Unit tests: 15/15 passed', level: 'SUCCESS' });
            } else if (type === 'api') {
                socket.emit('debug-output', { message: 'API tests: All endpoints responding', level: 'SUCCESS' });
            } else if (type === 'benchmark') {
                socket.emit('debug-output', { message: 'Benchmark: 1000 ops/sec average', level: 'INFO' });
            } else if (type === 'memory-profile') {
                socket.emit('debug-output', { message: 'Memory profile: No leaks detected', level: 'SUCCESS' });
            }
        }, 3000);
    });

    // Live device log tail bridge
    // Client: socket.emit('device-log-follow', { host, lines?: 200, intervalMs?: 1500 });
    // Stop: socket.emit('device-log-unfollow', { host })
    const logTimers = new Map();
    socket.on('device-log-follow', async ({ host, lines = 200, intervalMs = 1500 } = {}) => {
        try {
            if (!host) return;
            const key = `${socket.id}:${host}`;
            if (logTimers.has(key)) clearInterval(logTimers.get(key));
            const pull = async () => {
                try {
                    const url = `http://${host}/api/logs/tail?lines=${encodeURIComponent(lines)}`;
                    const resp = await axios.get(url, { timeout: 7000 });
                    socket.emit('device-log', { host, ...resp.data });
                } catch (e) {
                    socket.emit('device-log', { host, error: e.message || String(e) });
                }
            };
            await pull();
            const t = setInterval(pull, Math.max(750, Number(intervalMs) || 1500));
            logTimers.set(key, t);
        } catch (err) {
            socket.emit('device-log', { host, error: err.message || String(err) });
        }
    });
    socket.on('device-log-unfollow', ({ host } = {}) => {
        const key = `${socket.id}:${host}`;
        if (logTimers.has(key)) {
            clearInterval(logTimers.get(key));
            logTimers.delete(key);
        }
    });
    socket.on('disconnect', () => {
        // Cleanup intervals
        for (const [key, t] of logTimers.entries()) {
            clearInterval(t);
            logTimers.delete(key);
        }
    });

    socket.on('git-command', (data) => {
        const { action, version } = data;
        socket.emit('debug-output', {
            message: `Git command: ${action}`,
            level: 'INFO'
        });

        // Mock git command responses
        setTimeout(() => {
            if (action === 'status') {
                socket.emit('debug-output', { message: 'Git status: Working directory clean', level: 'INFO' });
            } else if (action === 'backup') {
                socket.emit('debug-output', { message: 'Backup created successfully', level: 'SUCCESS' });
            } else if (action === 'diff') {
                socket.emit('debug-output', { message: 'Diff: 3 files modified, 15 lines added', level: 'INFO' });
            } else if (action === 'tag') {
                socket.emit('debug-output', { message: `Release tagged: ${version}`, level: 'SUCCESS' });
            }
        }, 1500);
    });

    socket.on('ping-device', (data) => {
        const { ip } = data;
        socket.emit('debug-output', {
            message: `Pinging device at ${ip}...`,
            level: 'INFO'
        });

        // Mock ping result
        setTimeout(() => {
            const success = Math.random() > 0.2; // 80% success rate
            socket.emit('debug-output', {
                message: success ? `Ping successful: ${ip} (12ms)` : `Ping failed: ${ip} unreachable`,
                level: success ? 'SUCCESS' : 'ERROR'
            });
        }, 1000);
    });

    socket.on('reconnect-device', (data) => {
        const { ip } = data;
        socket.emit('debug-output', {
            message: `Attempting to reconnect to ${ip}...`,
            level: 'INFO'
        });

        setTimeout(() => {
            socket.emit('debug-output', {
                message: `Reconnection to ${ip} successful`,
                level: 'SUCCESS'
            });

            // Update device status
            socket.emit('device-status', {
                ip,
                status: 'online',
                lastSeen: new Date().toISOString()
            });
        }, 2000);
    });

    // Send initial data
    socket.emit('config-update', currentConfig);
    // Emit initial serial status
    try { socket.emit('serial-status', serialManager.getStatus()); } catch (_) {}
    // Emit initial devices
    try { socket.emit('device-list', { devices: deviceManager.list(), selectedId: deviceManager.selectedId }); } catch (_) {}
    try { socket.emit('device-selected', deviceManager.getSelected()); } catch (_) {}
    socket.emit('status-update', getProjectStatus());
    socket.emit('ai-status', {
        available: aiAgent.isAvailable(),
        config: aiAgent.getConfig()
    });
    socket.emit('remote-status', remoteManager.getConnectionStatus());
});

// Start server (retry on EADDRINUSE by incrementing port up to +10)
let _serverListening = false;
function startServer(port, attempt=0){
    if (_serverListening) return; // already bound
    try {
        server.listen(port, () => {
            if (_serverListening) return; // double-callback safety
            _serverListening = true;
            console.log(`🚀 ESP32 Development UI Server running on http://localhost:${port}`);
            postListen(port);
        }).on('error', (err) => {
            if (_serverListening) return; // ignore errors after success
            if (err && err.code === 'EADDRINUSE') {
                if (STRICT_PORT) {
                    console.error(`Port ${port} is in use and --strict-port specified. Exiting.`);
                    process.exit(1);
                }
                if (attempt < 10) {
                    console.warn(`Port ${port} in use, trying ${port+1}... (omit --strict-port to allow this behavior)`);
                    // Small backoff
                    setTimeout(()=>startServer(port+1, attempt+1), 250 + (attempt*50));
                } else {
                    console.error('Failed to acquire a free port after 10 increments.');
                    process.exit(1);
                }
            } else {
                console.error('Failed to start server:', err);
                process.exit(1);
            }
        });
    } catch (e) {
        if (_serverListening) return;
        console.error('Unexpected start error:', e);
        if (attempt < 10) setTimeout(()=>startServer(port+1, attempt+1), 300); else process.exit(1);
    }
}

function postListen(port){
    console.log(`📡 WebSocket server ready for real-time communication`);
    console.log(`🤖 AI Assistant: ${aiAgent.isAvailable() ? 'Available' : 'Configure API keys in web UI'}`);
    console.log(`🌐 Remote Servers: ${remoteManager.getServers().length} configured`);

    // Try to open browser automatically
    const open = require('child_process').spawn;
    try {
        if (os.platform() === 'win32') {
            open('start', [`http://localhost:${port}`], { shell: true });
        } else if (os.platform() === 'darwin') {
            open('open', [`http://localhost:${port}`]);
        } else {
            open('xdg-open', [`http://localhost:${port}`]);
        }
    } catch (error) {
        console.log(`🌐 Open your browser to http://localhost:${port}`);
    }
}

// Basic health endpoint (not rate limited intentionally)
app.get('/healthz', (req, res) => {
    res.json({
        ok: true,
        uptime: process.uptime(),
        pid: process.pid,
        rss: process.memoryUsage().rss,
        devices: (()=>{ try { return deviceManager.list().length; } catch { return 0; }})(),
        ai: { available: aiAgent.isAvailable() },
        ts: Date.now()
    });
});

startServer(PORT);

// ---- WiFi Status Aggregator (server-pushed) ----
let _wifiAggregatorInterval = null;
async function _collectWifiStatus(){
    const devices = deviceManager.list();
    if(!Array.isArray(devices) || devices.length===0) return;
    const payload = [];
    await Promise.all(devices.map(async d => {
        const host = d.host || d.ip;
        if(!host) return;
        try {
            const r = await axios.get(`http://${host}/wifi/status`, { timeout: 2500 });
            payload.push({ id: d.id, host, status: r.data });
        } catch (e) {
            payload.push({ id: d.id, host, status: { connected:false, error: e.message } });
        }
    }));
    if(payload.length) io.emit('device-wifi-status', payload);
}
function startWifiAggregator(){
    if(_wifiAggregatorInterval) clearInterval(_wifiAggregatorInterval);
    _wifiAggregatorInterval = setInterval(_collectWifiStatus, 15000);
    setTimeout(_collectWifiStatus, 4000);
}
startWifiAggregator();

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down server...');

    // Kill all active processes
    activeProcesses.forEach((process, processId) => {
        console.log(`   Killing process ${processId}`);
        process.kill();
    });

    // Disconnect all remote servers
    remoteManager.disconnectAll();

    server.close(() => {
        console.log('👋 Server shut down gracefully');
        process.exit(0);
    });
});

// Add debug socket handling
io.on('connection', (socket) => {
    try {
        socket.on('debug:snapshot', () => {
            try {
                socket.emit('log-line', { line: '--- tail (node) ---' });
                const tail = tailLines('node', 120).split(/\r?\n/).filter(Boolean);
                tail.forEach(l => socket.emit('log-line', { line: l }));
            } catch (_) { /* ignore */ }
            // Placeholder status structures; integrate real HTTP fetches if needed.
            socket.emit('wifi-status', { placeholder: true, note: 'Fetch from device /api/wifi/status in future' });
            socket.emit('peer-status', { placeholder: true });
            socket.emit('sensors-status', { placeholder: true });
        });
        socket.on('debug:command', (data) => {
            const cmd = (data && data.cmd || '').trim();
            if (!cmd) return;
            appendLog('cmd', `user:${socket.id} cmd=${cmd}`);
            // Simple built-ins
            if (cmd === 'ping') {
                socket.emit('cmd-response', { cmd, result: 'pong' });
                return;
            }
            if (cmd === 'help') {
                socket.emit('cmd-response', { cmd, result: 'Available: ping, help, tail <n>' });
                return;
            }
            if (cmd.startsWith('tail')) {
                const parts = cmd.split(/\s+/);
                const n = parseInt(parts[1]||'50',10);
                const t = tailLines('node', isNaN(n)?50:n);
                socket.emit('cmd-response', { cmd, result: t.split(/\r?\n/).slice(-n).join('\n') });
                return;
            }
            // Fallback: echo; later map to device proxy
            socket.emit('cmd-response', { cmd, result: 'echo: '+cmd });
        });
    } catch (err) {
        console.error('debug socket error', err);
    }
});
// Stream log updates in real-time to clients
logEmitter.on('node', (line) => {
    io.emit('log-line', { line });
});
logEmitter.on('api', (line) => { io.emit('log-line', { line, level: 'api' }); });
logEmitter.on('cmd', (line) => { io.emit('log-line', { line, level: 'cmd' }); });
