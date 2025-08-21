const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const { spawn } = require('child_process');
const axios = require('axios');
const path = require('path');
const fs = require('fs');
const os = require('os');
const multer = require('multer');
const net = require('net');
const ESP32AIAgent = require('./ai_agent');
const RemoteServerManager = require('./remote_manager');
const FileManager = require('./file_manager');
// Resolve a Python executable preferring a local virtual environment (venv) when present.
function resolvePythonExecutable() {
    const projectRoot = path.join(__dirname, '..');
    const candidates = [];

    if (os.platform() === 'win32') {
        candidates.push(path.join(projectRoot, 'venv', 'Scripts', 'python.exe'));
        candidates.push(path.join(projectRoot, '.venv', 'Scripts', 'python.exe'));


        candidates.push(path.join(projectRoot, 'env', 'Scripts', 'python.exe'));
        candidates.push(path.join(__dirname, 'venv', 'Scripts', 'python.exe'));
        candidates.push(path.join(__dirname, '.venv', 'Scripts', 'python.exe'));
        // System Python fallbacks
        candidates.push('python');
        candidates.push('python3');
        candidates.push('py');
    } else {
        candidates.push(path.join(projectRoot, 'venv', 'bin', 'python'));
        candidates.push(path.join(projectRoot, '.venv', 'bin', 'python'));
        candidates.push(path.join(projectRoot, 'env', 'bin', 'python'));
        candidates.push(path.join(__dirname, 'venv', 'bin', 'python'));
        candidates.push(path.join(__dirname, '.venv', 'bin', 'python'));
        // System Python fallbacks
        candidates.push('python3');
        candidates.push('python');
    }

    for (const p of candidates) {
        try {
            if (path.isAbsolute(p) && fs.existsSync(p)) {
                console.log(`Using Python executable: ${p}`);
                return p;
            } else if (!path.isAbsolute(p)) {
                // For system commands, we'll try them and let spawn handle resolution
                console.log(`Will try system Python: ${p}`);
                return p;
            }
        } catch (e) { /* ignore */ }
    }

    // Final fallback
    const fallback = process.env.PYTHON || 'python';
    console.log(`Using fallback Python: ${fallback}`);
    return fallback;
}
const PYTHON_EXEC = resolvePythonExecutable();
let SerialPort;
let serialAvailable = false;
try {
    // serialport v10+ exposes { SerialPort } named export; older versions exported the class directly
    const sp = require('serialport');
    SerialPort = sp.SerialPort || sp;
    serialAvailable = typeof SerialPort === 'function';
    if (!serialAvailable) {
        console.warn('serialport module loaded but no SerialPort constructor found');
    }
} catch (err) {
    console.warn('serialport not installed, serial features disabled');
    serialAvailable = false;
}

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// --- Logging infrastructure ---
const { EventEmitter } = require('events');
const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });
const logEmitter = new EventEmitter();

function appendLog(name, msg) {
    try {
        const file = path.join(logsDir, `${name}.log`);
        const line = `[${new Date().toISOString()}] ${msg}\n`;
        fs.appendFileSync(file, line, { encoding: 'utf8' });
        // emit raw line for streaming viewers
        logEmitter.emit(name, line);
    } catch (err) {
        console.error('appendLog error', err);
    }
}

function tailLines(name, lines = 200) {
    try {
        const file = path.join(logsDir, `${name}.log`);
        if (!fs.existsSync(file)) return '';
        const content = fs.readFileSync(file, 'utf8');
        const all = content.split(/\r?\n/).filter(Boolean);
        return all.slice(-lines).join('\n');
    } catch (err) {
        console.error('tailLines error', err);
        return '';
    }
}

// Log server start
appendLog('node', `server start pid=${process.pid} cwd=${process.cwd()}`);

// Wire socket events to logs
io.on('connection', (socket) => {
    const addr = socket.handshake.address || socket.conn?.remoteAddress || 'unknown';
    appendLog('ws', `connect id=${socket.id} addr=${addr}`);
    socket.on('disconnect', (reason) => appendLog('ws', `disconnect id=${socket.id} reason=${reason}`));
    socket.onAny((ev, ...args) => {
        try { appendLog('ws', `event ${ev} ${JSON.stringify(args)}`); } catch (e) { appendLog('ws', `event ${ev} <serialize error>`); }
    });
});

// Initialize AI Agent and Remote Server Manager
const aiAgent = new ESP32AIAgent();
const remoteManager = new RemoteServerManager();

// Initialize File Manager for local operations (optional)
const fileManager = new FileManager(path.join(__dirname, '..'));

const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
// Serve advanced UI pages from the repo-level wwwroot (if present). Mount this first
// so those pages take precedence when the file exists there.
const repoWwwRoot = path.join(__dirname, '..', 'wwwroot');
if (fs.existsSync(repoWwwRoot)) {
    console.log(`Serving advanced UI from ${repoWwwRoot}`);
    app.use(express.static(repoWwwRoot));
    // Also expose the repo-level wwwroot under the /device path so the web UI
    // can load the advanced device UI from /device/* without copying files.
    app.use('/device', express.static(repoWwwRoot));
} else {
    console.log('No repo wwwroot directory found; skipping');
}

// Fallback to the web-ui/public folder for the built-in UI assets
app.use(express.static(path.join(__dirname, 'public/dev')));

// Also serve the public/device subfolder at /device so a physical copy placed
// in web-ui/public/device will be reachable via /device/* as well.
app.use('/device', express.static(path.join(__dirname, 'public', 'device')));

// Legacy URL compatibility: redirect /development.html to /device.html
app.get(['/development', '/development.html'], (req, res) => {
    try { res.redirect(301, '/device.html'); } catch (e) { res.redirect('/device.html'); }
});

// Ensure uploads folder exists
const uploadsDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
// Ensure data folder exists (for saved devices)
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
const devicesFile = path.join(dataDir, 'devices.json');

// Multer setup for firmware uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadsDir);
    },
    filename: function (req, file, cb) {
        // keep original name but prefix timestamp
        const name = `${Date.now()}-${file.originalname}`;
        cb(null, name);
    }
});
const upload = multer({ storage });

// Device proxy: forward calls to a remote device (C6) so the UI doesn't need CORS or direct IPs.
// Usage: GET/POST /device/<path>?host=192.168.4.2
app.all('/device/*', async (req, res) => {
    try {
        const host = req.query.host || req.body?.host;
        if (!host) return res.status(400).json({ success: false, error: 'no host specified' });

        // Extract path after /device and forward remaining query params except 'host'
        const devicePath = req.path.replace(/^\/device/, '') || '/';
        const query = { ...req.query };
        delete query.host;
        const qs = new URLSearchParams(query).toString();
        const url = `http://${host}${devicePath}${qs ? `?${qs}` : ''}`;

        // Build axios options
        const opts = {
            method: req.method,
            url,
            headers: { ...req.headers },
            // Use stream by default to support binary and text
            responseType: 'stream',
            validateStatus: () => true,
            timeout: 15000
        };

        // Remove hop-by-hop headers that might confuse the device
        delete opts.headers.host;
        delete opts.headers.connection;
        delete opts.headers['content-length'];

        if (req.method !== 'GET' && req.method !== 'HEAD') {
            // If body is JSON/object, send as-is; otherwise pipe the request stream
            if (req.is('application/json') && req.body && Object.keys(req.body).length) {
                opts.data = req.body;
            } else {
                opts.data = req;
            }
        }

        const resp = await axios(opts);

        // pipe headers
        Object.entries(resp.headers).forEach(([k, v]) => {
            try { res.setHeader(k, v); } catch (e) {}
        });

        res.status(resp.status);
        if (resp.data && resp.data.pipe) {
            resp.data.pipe(res);
        } else {
            // In case responseType changed upstream
            res.send(resp.data);
        }
    } catch (err) {
        console.error('Device proxy error:', err.message || err);
        res.status(500).json({ success: false, error: err.message || String(err) });
    }
});

// Store for active processes
const activeProcesses = new Map();

// Serial port management
const serialPorts = new Map(); // key: id (e.g., COM3) -> { port: SerialPort instance }

// Helper: list system serial ports
async function listSystemSerialPorts() {
    if (!serialAvailable) return [];
    try {
    const ports = await SerialPort.list();
        return ports;
    } catch (err) {
        console.error('Error listing serial ports:', err.message || err);
        return [];
    }
}

// ---- Improv Serial helpers (WiFi scan/connect over serial) ----
// Frame structure: 'IMPROV' (6 bytes), version(1), type(1), len(1), payload(len), checksum(1)
const IMPROV_HDR = Buffer.from('IMPROV');
const IMPROV_VER = 0x01;
const TYPE_RPC = 0x03;
const TYPE_RPC_RESPONSE = 0x04;
const CMD_WIFI_SETTINGS = 0x01;
const CMD_GET_CURRENT_STATE = 0x02;
const CMD_GET_DEVICE_INFO = 0x03;
const CMD_GET_WIFI_NETWORKS = 0x04;

function checksum(buf) {
    let sum = 0;
    for (let i = 0; i < buf.length; i++) sum = (sum + buf[i]) & 0xFF;
    return Buffer.from([sum]);
}

function buildImprovRpc(command, payload = Buffer.alloc(0)) {
    // Insert an overall data-length byte (payload length) after the command to
    // match the firmware's parse_improv_data expectation.
    const lenByte = Buffer.from([payload.length & 0xFF]);
    const pl = Buffer.concat([Buffer.from([command]), lenByte, payload]);
    const header = Buffer.concat([IMPROV_HDR, Buffer.from([IMPROV_VER, TYPE_RPC, pl.length])]);
    const frame = Buffer.concat([header, pl]);
    return Buffer.concat([frame, checksum(frame)]);
}

function buildWifiSettingsPayload(ssid, password) {
    const ss = Buffer.from(String(ssid || ''), 'utf8');
    const pw = Buffer.from(String(password || ''), 'utf8');
    if (ss.length > 255 || pw.length > 255) throw new Error('ssid/password too long');
    return Buffer.concat([Buffer.from([ss.length]), ss, Buffer.from([pw.length]), pw]);
}

function parseImprovFrames(buffer, onFrame) {
    // Returns remaining buffer after consuming frames
    let buf = buffer;
    while (true) {
        const idx = buf.indexOf(IMPROV_HDR);
        if (idx === -1) return buf.length > IMPROV_HDR.length ? buf.slice(-IMPROV_HDR.length) : buf;
        if (idx > 0) buf = buf.slice(idx);
        if (buf.length < 9) return buf; // need at least header+ver+type+len
        const ver = buf[6];
        const typ = buf[7];
        const len = buf[8];
        const fullLen = 9 + len + 1;
        if (buf.length < fullLen) return buf; // wait for more
        const frame = buf.slice(0, fullLen);
        const calc = checksum(frame.slice(0, -1))[0];
        if (calc !== frame[frame.length - 1]) {
            // bad checksum, drop first byte and continue
            buf = buf.slice(1);
            continue;
        }
        const payload = frame.slice(9, -1);
        try { onFrame({ ver, typ, payload }); } catch (_) { /* ignore */ }
        buf = buf.slice(fullLen);
    }
}

function decodeRpcPayload(payload) {
    if (!payload || payload.length === 0) return { cmd: 0, items: [] };
    const cmd = payload[0];

    // Parser that assumes items start at given index and are encoded as [len][bytes]...
    const tryParseFrom = (startIdx) => {
        const items = [];
        let i = startIdx;
        while (i < payload.length) {
            const sl = payload[i];
            i += 1;
            if (i + sl > payload.length) return items; // truncated or invalid
            const s = payload.slice(i, i + sl).toString('utf8');
            items.push(s);
            i += sl;
        }
        return items;
    };

    // Most implementations put an overall-length byte at index 1; others omit it.
    // Try the simple parse first; if it yields no items but payload has room,
    // try skipping the overall-length byte at index 1.
    let items = tryParseFrom(1);
    if (items.length === 0 && payload.length >= 2) {
        const maybeTotalLen = payload[1];
        // If there is a total length, the items should start at index 2.
        const items2 = tryParseFrom(2);
        // Prefer the parse that yields more items
        if (items2.length > items.length) items = items2;
    }

    return { cmd, items };
}

// Configuration defaults
const defaultConfig = {
    environment: 'OutdoorAP',
    comPort: 'COM10',
    baudRate: 921600,
    jobs: 0,
    fastBuild: true,
    clean: false,
    verbose: false,
    filesystemOnly: false,
    skipUpload: false,
    monitor: false,
    // When true, the web UI and APIs will only work with a single, manually-selected COM port.
    // This disables auto-open behavior and hides other system ports from the UI list.
    manualComOnly: true,
    allowedComPort: 'COM10'
};

let currentConfig = { ...defaultConfig };

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
app.get('/api/devices', (req, res) => {
    try {
        let devices = [];
        let selectedId = null;
        if (fs.existsSync(devicesFile)) {
            const j = JSON.parse(fs.readFileSync(devicesFile, 'utf8'));
            devices = Array.isArray(j.devices) ? j.devices : [];
            selectedId = j.selectedId || null;
        }
        res.json({ success: true, devices, selectedId });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message, devices: [], selectedId: null });
    }
});

app.post('/api/devices', (req, res) => {
    try {
        const { devices, selectedId } = req.body || {};
        if (!Array.isArray(devices)) return res.status(400).json({ success: false, error: 'devices array required' });
        const payload = { devices, selectedId: selectedId || null };
        fs.writeFileSync(devicesFile, JSON.stringify(payload, null, 2), 'utf8');
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
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

app.get('/api/com-ports', async (req, res) => {
    try {
        let ports = [];

        // Try to get system serial ports first
        if (serialAvailable) {
            try {
                const systemPorts = await listSystemSerialPorts();
                ports = systemPorts.map(p => ({
                    path: p.path || p.comName || p.vendorId || '',
                    manufacturer: p.manufacturer || p.friendlyName || ''
                }));
            } catch (err) {
                console.warn('Failed to list system serial ports:', err.message);
            }
        }

        // If no ports found, try the Windows PowerShell method or provide fallbacks
        if (ports.length === 0) {
            try {
                const fallbackPorts = await getComPorts();
                ports = Array.isArray(fallbackPorts) ? fallbackPorts.map(p => ({
                    path: p,
                    manufacturer: ''
                })) : [];
            } catch (err) {
                console.warn('Failed to get fallback COM ports:', err.message);
                // Final fallback for common ports
                ports = ['COM1', 'COM3', 'COM10', 'COM13'].map(p => ({
                    path: p,
                    manufacturer: 'Fallback'
                }));
            }
        }

        // Manual COM mode: hide all but the allowed COM port
        if (currentConfig.manualComOnly && currentConfig.allowedComPort) {
            const allowed = String(currentConfig.allowedComPort).toUpperCase();
            const filtered = ports.filter(p => (p.path || '').toUpperCase() === allowed);
            // If not present, still return only the allowed as a choice
            ports = filtered.length > 0 ? filtered : [{ path: allowed, manufacturer: 'Manual' }];
        }

        appendLog('api', `com-ports returned ${ports.length} ports`);
        res.json(ports);
    } catch (error) {
        console.error('COM ports API error:', error);
        appendLog('api', `com-ports error: ${error.message}`);
        // Return fallback ports on any error
        let fallbackPorts = ['COM1', 'COM3', 'COM10', 'COM13'].map(p => ({ path: p, manufacturer: 'Fallback' }));
        if (currentConfig.manualComOnly && currentConfig.allowedComPort) {
            const allowed = String(currentConfig.allowedComPort).toUpperCase();
            fallbackPorts = [{ path: allowed, manufacturer: 'Manual' }];
        }
        res.json(fallbackPorts);
    }
});

// Serial control endpoints
app.get('/api/serial/list', async (req, res) => {
    const ports = await listSystemSerialPorts();
    res.json({ success: true, ports });
});

// Firmware upload endpoint
app.post('/api/firmware/upload', upload.single('firmware'), (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ success: false, error: 'file required' });
        const relPath = path.join('uploads', req.file.filename);
        res.json({ success: true, path: relPath, filename: req.file.filename });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Trigger OTA flash on device (proxying POST to device)
app.post('/api/firmware/trigger', async (req, res) => {
    try {
        const { host, firmwarePath } = req.body || {};
        if (!host || !firmwarePath) return res.status(400).json({ success: false, error: 'host and firmwarePath required' });

        // Proxy to device endpoint: POST /ota_flash with JSON { firmwareUrl }
        // Build URL to the uploaded firmware served by this server
        const firmwareUrl = `http://${req.hostname}:${PORT}/${firmwarePath}`;

        // Use axios to POST to device via server proxy route
        const resp = await axios.post(`http://${host}/ota_flash`, { firmwareUrl }, { timeout: 15000 });
        res.json({ success: true, deviceResponse: resp.data });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message || String(err) });
    }
});

app.post('/api/serial/open', (req, res) => {
    if (!serialAvailable) return res.status(501).json({ success: false, error: 'serialport not available on server' });
    const { path: portPath, baudRate = 115200 } = req.body || {};
    if (!portPath) return res.status(400).json({ success: false, error: 'path required' });

    // Enforce manual COM mode if enabled
    if (currentConfig.manualComOnly && currentConfig.allowedComPort) {
        const allowed = String(currentConfig.allowedComPort).toUpperCase();
        if (String(portPath).toUpperCase() !== allowed) {
            return res.status(403).json({ success: false, error: `Manual COM mode active. Only ${allowed} is allowed.` });
        }
    }

    try {
        if (serialPorts.has(portPath)) return res.json({ success: true, message: 'already open' });

    // serialport v10+ expects an options object with path
    const port = new SerialPort({ path: portPath, baudRate: parseInt(baudRate, 10) });
        port.on('data', (data) => {
            const text = data.toString();
            // broadcast to all sockets
            io.emit('serial-data', { port: portPath, data: text, text });
            // append to server-side serial log
            appendLog('serial', `port=${portPath} ${text.replace(/\r?\n/g, '\\n')}`);
        });
        port.on('error', (err) => {
            io.emit('serial-error', { port: portPath, error: err.message });
            appendLog('serial', `port=${portPath} ERROR ${err.message}`);
        });

        serialPorts.set(portPath, { port });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message || String(err) });
    }
});

app.post('/api/serial/close', (req, res) => {
    const { path: portPath } = req.body || {};
    if (!portPath) return res.status(400).json({ success: false, error: 'path required' });

    // Enforce manual COM mode if enabled (only allow closing the allowed port)
    if (currentConfig.manualComOnly && currentConfig.allowedComPort) {
        const allowed = String(currentConfig.allowedComPort).toUpperCase();
        if (String(portPath).toUpperCase() !== allowed) {
            return res.status(403).json({ success: false, error: `Manual COM mode active. Only ${allowed} can be closed.` });
        }
    }

    const rec = serialPorts.get(portPath);
    if (!rec) return res.json({ success: false, error: 'port not open' });

    rec.port.close((err) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        serialPorts.delete(portPath);
        res.json({ success: true });
    });
});

app.post('/api/serial/write', (req, res) => {
    const { path: portPath, data } = req.body || {};
    if (!portPath || data === undefined) return res.status(400).json({ success: false, error: 'path and data required' });

    // Enforce manual COM mode if enabled
    if (currentConfig.manualComOnly && currentConfig.allowedComPort) {
        const allowed = String(currentConfig.allowedComPort).toUpperCase();
        if (String(portPath).toUpperCase() !== allowed) {
            return res.status(403).json({ success: false, error: `Manual COM mode active. Only ${allowed} is allowed.` });
        }
    }

    const rec = serialPorts.get(portPath);
    if (!rec) return res.status(400).json({ success: false, error: 'port not open' });

    try {
        rec.port.write(data, (err) => {
            if (err) return res.status(500).json({ success: false, error: err.message });
            res.json({ success: true });
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message || String(err) });
    }
});

// Serial WiFi scan using Improv protocol
// body: { path, baudRate? }
app.post('/api/serial/wifi/scan', async (req, res) => {
    if (!serialAvailable) return res.status(501).json({ success: false, error: 'serialport not available on server' });
    const { path: portPath, baudRate = 115200, timeoutMs = 8000 } = req.body || {};
    if (!portPath) return res.status(400).json({ success: false, error: 'path required' });

    // Enforce manual COM mode if enabled
    if (currentConfig.manualComOnly && currentConfig.allowedComPort) {
        const allowed = String(currentConfig.allowedComPort).toUpperCase();
        if (String(portPath).toUpperCase() !== allowed) {
            return res.status(403).json({ success: false, error: `Manual COM mode active. Only ${allowed} is allowed.` });
        }
    }

    let tempPort = null;
    let usedExisting = false;
    let portRec = serialPorts.get(portPath);
    try {
        let port;
        if (portRec && portRec.port) {
            port = portRec.port;
            usedExisting = true;
        } else {
            // Add an error handler to avoid unhandled 'error' events when port cannot be opened
            port = new SerialPort({ path: portPath, baudRate: parseInt(baudRate, 10) });
            try { port.on('error', (e) => appendLog('serial', `wifi_scan error path=${portPath} err=${e.message || e}`)); } catch (_) {}
            tempPort = port;
        }

        // Send GET_WIFI_NETWORKS
        const frame = buildImprovRpc(CMD_GET_WIFI_NETWORKS);
        await new Promise((resolve, reject) => {
            try { port.write(frame, (err) => err ? reject(err) : resolve()); } catch (e) { reject(e); }
        });

        const networks = [];
        let buf = Buffer.alloc(0);
        let done = false;
        const onData = (data) => {
            buf = Buffer.concat([buf, Buffer.isBuffer(data) ? data : Buffer.from(data)]);
            buf = parseImprovFrames(buf, (fr) => {
                if (fr.typ !== TYPE_RPC_RESPONSE) return;
                const { cmd, items } = decodeRpcPayload(fr.payload);
                if (cmd === CMD_GET_WIFI_NETWORKS) {
                    if (!items || items.length === 0) {
                        done = true; // final marker
                        return;
                    }
                    const ssid = items[0] || '';
                    const rssi = items[1] ? Number(items[1]) : 0;
                    const auth = items[2] || '';
                    if (ssid) networks.push({ ssid, rssi, auth });
                }
            });
        };
        port.on('data', onData);

        const started = Date.now();
        while (!done && (Date.now() - started) < timeoutMs) {
            await new Promise(r => setTimeout(r, 100));
        }
        try { port.removeListener('data', onData); } catch (_) {}
    if (tempPort) { try { await new Promise(r => tempPort.close(() => r())); } catch (_) {} }

        return res.json({ success: true, networks });
    } catch (err) {
    if (tempPort) { try { await new Promise(r => tempPort.close(() => r())); } catch (_) {} }
        return res.status(500).json({ success: false, error: err.message || String(err) });
    }
});

// Serial WiFi connect using Improv protocol
// body: { path, ssid, password, baudRate? }
app.post('/api/serial/wifi/connect', async (req, res) => {
    if (!serialAvailable) return res.status(501).json({ success: false, error: 'serialport not available on server' });
    const { path: portPath, ssid, password = '', baudRate = 115200 } = req.body || {};
    if (!portPath || !ssid) return res.status(400).json({ success: false, error: 'path and ssid required' });

    // Enforce manual COM mode if enabled
    if (currentConfig.manualComOnly && currentConfig.allowedComPort) {
        const allowed = String(currentConfig.allowedComPort).toUpperCase();
        if (String(portPath).toUpperCase() !== allowed) {
            return res.status(403).json({ success: false, error: `Manual COM mode active. Only ${allowed} is allowed.` });
        }
    }

    let tempPort = null;
    try {
        const portRec = serialPorts.get(portPath);
        let port;
        if (portRec && portRec.port) {
            port = portRec.port;
        } else {
            // Add an error handler to avoid unhandled 'error' events
            port = new SerialPort({ path: portPath, baudRate: parseInt(baudRate, 10) });
            try { port.on('error', (e) => appendLog('serial', `wifi_connect error path=${portPath} err=${e.message || e}`)); } catch (_) {}
            tempPort = port;
        }

        const payload = buildWifiSettingsPayload(ssid, password);
        const frame = buildImprovRpc(CMD_WIFI_SETTINGS, payload);
        await new Promise((resolve, reject) => {
            try { port.write(frame, (err) => err ? reject(err) : resolve()); } catch (e) { reject(e); }
        });

        // Optionally, wait briefly for a response frame
        let received = false;
        let buf = Buffer.alloc(0);
        const onData = (data) => {
            buf = Buffer.concat([buf, Buffer.isBuffer(data) ? data : Buffer.from(data)]);
            buf = parseImprovFrames(buf, (fr) => {
                if (fr.typ !== TYPE_RPC_RESPONSE) return;
                const { cmd } = decodeRpcPayload(fr.payload);
                if (cmd === CMD_WIFI_SETTINGS) received = true;
            });
        };
        port.on('data', onData);
        const started = Date.now();
        while (!received && (Date.now() - started) < 3000) {
            await new Promise(r => setTimeout(r, 100));
        }
        try { port.removeListener('data', onData); } catch (_) {}
    if (tempPort) { try { await new Promise(r => tempPort.close(() => r())); } catch (_) {} }

        return res.json({ success: true, acknowledged: received });
    } catch (err) {
    if (tempPort) { try { await new Promise(r => tempPort.close(() => r())); } catch (_) {} }
        return res.status(500).json({ success: false, error: err.message || String(err) });
    }
});

// Quick COM health check: write a test command and wait briefly for any response
app.post('/api/com/check', async (req, res) => {
    if (!serialAvailable) return res.status(501).json({ success: false, error: 'serialport not available on server' });
    const { path: portPath, baudRate = 115200, testCmd = '\n', timeout = 1000 } = req.body || {};
    if (!portPath) return res.status(400).json({ success: false, error: 'path required' });

    // Enforce manual COM mode if enabled
    if (currentConfig.manualComOnly && currentConfig.allowedComPort) {
        const allowed = String(currentConfig.allowedComPort).toUpperCase();
        if (String(portPath).toUpperCase() !== allowed) {
            return res.status(403).json({ success: false, error: `Manual COM mode active. Only ${allowed} is allowed.` });
        }
    }

    let rec = serialPorts.get(portPath);
    let tempOpened = false;
    let port;
    let portErrored = null;

    try {
        if (rec && rec.port) {
            port = rec.port;
        } else {
            // open temporary port
            port = new SerialPort({ path: portPath, baudRate: parseInt(baudRate, 10) });
            // Guard against unhandled 'error' events that can crash the process
            try { port.on('error', (e) => { portErrored = e; appendLog('serial', `com_check error-event path=${portPath} err=${e.message || e}`); }); } catch (_) {}
            tempOpened = true;
        }

        let captured = '';
        const onData = (data) => {
            captured += data.toString();
        };

        port.on('data', onData);

        // write test command (if port didn't already error)
        if (portErrored) throw portErrored;
        await new Promise((resolve, reject) => {
            try {
                port.write(testCmd, (err) => {
                    if (err) return reject(err);
                    resolve();
                });
            } catch (err) { reject(err); }
        });

        // wait up to timeout ms for data (or early exit on error)
        const toMs = parseInt(timeout, 10);
        let waited = 0;
        while (waited < toMs && !portErrored) {
            await new Promise(r => setTimeout(r, 50));
            waited += 50;
        }

        port.removeListener('data', onData);

        if (tempOpened) {
            try { port.close(() => {}); } catch (e) {}
        }

        if (portErrored) {
            appendLog('serial', `com_check failed path=${portPath} err=${portErrored.message || portErrored}`);
            return res.status(500).json({ success: false, error: portErrored.message || String(portErrored) });
        }
        appendLog('serial', `com_check path=${portPath} resp=${captured.replace(/\r?\n/g,'\\n')}`);
        return res.json({ success: true, response: captured });
    } catch (err) {
        if (tempOpened && port && port.close) {
            try { port.close(() => {}); } catch (e) {}
        }
        appendLog('serial', `com_check error path=${portPath} err=${err.message || err}`);
        return res.status(500).json({ success: false, error: err.message || String(err) });
    }
});

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

// WiFi: scan networks on device (proxy)
// GET /api/device/wifi/scan?host=IP
// Attempts to call device endpoints in order: /wifi_scan, /scan_wifi
app.get('/api/device/wifi/scan', async (req, res) => {
    try {
        const host = req.query.host;
        if (!host) return res.status(400).json({ success: false, error: 'host required' });

        const base = `http://${host}`;
        const tryPaths = ['/wifi_scan', '/scan_wifi'];
        let lastErr = null;
        for (const p of tryPaths) {
            try {
                const url = `${base}${p}`;
                const r = await axios.get(url, { timeout: 10000, validateStatus: () => true });
                if (r.status >= 200 && r.status < 300) {
                    // Try to normalize payload
                    let data = r.data;
                    // some firmwares wrap in { networks: [...] }
                    if (data && data.networks && Array.isArray(data.networks)) {
                        data = data.networks;
                    }
                    // ensure array
                    if (!Array.isArray(data) && typeof data === 'object') {
                        data = Object.values(data);
                    }
                    return res.json({ success: true, networks: data });
                }
                lastErr = new Error(`HTTP ${r.status}`);
            } catch (e) {
                lastErr = e;
            }
        }
        return res.status(502).json({ success: false, error: lastErr?.message || 'scan failed' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message || String(err) });
    }
});

// WiFi: connect to a network (proxy saver)
// POST /api/device/wifi/connect { host, ssid, password }
// Tries device endpoints in order:
//  - POST /save_wifi_config (JSON) { ssid, password }
//  - POST /save_wifi_config (x-www-form-urlencoded)
//  - POST /set_wifi (JSON)
app.post('/api/device/wifi/connect', async (req, res) => {
    try {
        const { host, ssid, password = '' } = req.body || {};
        if (!host || !ssid) return res.status(400).json({ success: false, error: 'host and ssid required' });

        const base = `http://${host}`;
        const payload = { ssid, password };

        // helpers
        const postJson = async (path) => axios.post(`${base}${path}`, payload, { timeout: 12000, validateStatus: () => true });
        const postForm = async (path) => axios.post(`${base}${path}`, new URLSearchParams(payload).toString(), {
            timeout: 12000,
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            validateStatus: () => true
        });

        const attempts = [
            async () => postJson('/save_wifi_config'),
            async () => postForm('/save_wifi_config'),
            async () => postJson('/set_wifi')
        ];

        let last = null;
        for (const fn of attempts) {
            try {
                const r = await fn();
                if (r.status >= 200 && r.status < 300) {
                    return res.json({ success: true, data: r.data });
                }
                last = new Error(`HTTP ${r.status}`);
            } catch (e) {
                last = e;
            }
        }

        return res.status(502).json({ success: false, error: last?.message || 'connect failed' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message || String(err) });
    }
});

app.get('/api/status', (req, res) => {
    const status = getProjectStatus();
    res.json(status);
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
app.get('/api/source-files/tree', (req, res) => {
    try {
        const tree = fileManager.getFileTree();
        res.json({ success: true, tree });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/source-files/stats', (req, res) => {
    try {
        const stats = fileManager.getProjectStats();
        res.json({ success: true, stats });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/source-files/recent', (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 20;
        const files = fileManager.getRecentFiles(limit);
        res.json({ success: true, files });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Read single local source file (relative path)
app.get('/api/source-files/read', (req, res) => {
    try {
        const p = req.query.path;
        if (!p) return res.status(400).json({ success: false, error: 'path query required' });
        const file = fileManager.readFile(p);
        res.json({ success: true, file });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message || String(err) });
    }
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
app.get('/api/ai/config', (req, res) => {
    res.json(aiAgent.getConfig());
});

app.post('/api/ai/config', (req, res) => {
    try {
        aiAgent.updateConfig(req.body);
        res.json({ success: true, config: aiAgent.getConfig() });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/ai/chat', async (req, res) => {
    try {
        const { message, context } = req.body;
        const response = await aiAgent.chat(message, context);
        res.json({ success: true, response });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
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
    console.log('Client connected:', socket.id);

    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
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
            const portsList = await getComPorts();
            const ports = portsList.map(p => ({ path: p, manufacturer: '' }));
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
                const text = data.toString();
                socket.emit('output', { type: 'stdout', data: text });
                io.emit('process-output', { processId: socket.id, type: 'stdout', data: text });
                appendLog('process-out', text.replace(/\r?\n/g, '\\n'));
            });

            proc.stderr.on('data', (data) => {
                const text = data.toString();
                socket.emit('output', { type: 'stderr', data: text });
                io.emit('process-output', { processId: socket.id, type: 'stderr', data: text });
                appendLog('process-err', text.replace(/\r?\n/g, '\\n'));
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
        // Echo the command back as debug output for now
        socket.emit('debug-output', {
            message: `Command executed: ${command}`,
            level: 'INFO'
        });

        // In a real implementation, this would execute actual debug commands
        if (command.toLowerCase().includes('reset')) {
            socket.emit('debug-output', { message: 'Device reset command sent', level: 'WARN' });
        } else if (command.toLowerCase().includes('status')) {
            socket.emit('debug-output', { message: 'Device status: Online, Heap: 128KB free', level: 'INFO' });
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
            message: `Starting ${type} analysis...`,
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
    socket.emit('status-update', getProjectStatus());
    socket.emit('ai-status', {
        available: aiAgent.isAvailable(),
        config: aiAgent.getConfig()
    });
    socket.emit('remote-status', remoteManager.getConnectionStatus());
});

// Start server
server.listen(PORT, () => {
    console.log(`🚀 ESP32 Development UI Server running on http://localhost:${PORT}`);
    console.log(`📡 WebSocket server ready for real-time communication`);
    console.log(`🤖 AI Assistant: ${aiAgent.isAvailable() ? 'Available' : 'Configure API keys in web UI'}`);
    console.log(`🌐 Remote Servers: ${remoteManager.getServers().length} configured`);

    // Try to open browser automatically
    const open = require('child_process').spawn;
    try {
        if (os.platform() === 'win32') {
            open('start', [`http://localhost:${PORT}`], { shell: true });
        } else if (os.platform() === 'darwin') {
            open('open', [`http://localhost:${PORT}`]);
        } else {
            open('xdg-open', [`http://localhost:${PORT}`]);
        }
    } catch (error) {
        console.log(`🌐 Open your browser to http://localhost:${PORT}`);
    }
});

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
