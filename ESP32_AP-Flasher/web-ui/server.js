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
// Optional modules wrapped so server does not crash if dependencies or native builds are missing.
let ESP32AIAgent, RemoteServerManager, FileManager, DeviceManager, AgentActionRunner, ToolSchemas, ToolDispatcher;
function safeRequire(name, localPath, onFailNote) {
    try { return require(localPath); } catch (e) { console.warn(`[startup] Optional module '${name}' disabled: ${e.message}${onFailNote? ' - '+onFailNote: ''}`); return null; }
}
ESP32AIAgent        = safeRequire('ai_agent', './ai_agent');
ToolSchemas         = safeRequire('ai_tools', './ai_tools');
ToolDispatcher      = safeRequire('ai_tool_dispatcher', './ai_tool_dispatcher');
AgentActionRunner   = safeRequire('agent_actions', './agent_actions');
RemoteServerManager  = safeRequire('remote_manager', './remote_manager');
FileManager          = safeRequire('file_manager', './file_manager');
DeviceManager        = safeRequire('device_manager', './device_manager');
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
// Centralized serial manager abstraction
const SerialManager = require('./serial_manager');
let serialAvailable = true; // final determination done by SerialManager instance

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Centralized logging utilities
const { appendLog, tailLines, logEmitter, logsDir, setConsoleMirror, getConsoleMirrorState } = require('./logging');

// Log server start
appendLog('node', `server start pid=${process.pid} cwd=${process.cwd()}`);

// (Removed early bare io.on connection logger; merged into main handler below)

// Initialize AI Agent, Action Runner and Remote Server Manager
const aiAgent = ESP32AIAgent ? new ESP32AIAgent() : null;
// Tool calling dispatcher (independent of legacy aiAgent). Inject device & serial managers once available.
let aiToolSessionStore = new Map(); // sessionId -> { inputList: [] }
let aiToolDispatcher = null; // lazily created after serial/device managers ready
const agentActionRunner = AgentActionRunner ? new AgentActionRunner({
    projectRoot: path.join(__dirname, '..'),
    logFn: (name, line) => appendLog(name, line)
}) : null;
const remoteManager = RemoteServerManager ? new RemoteServerManager() : null;

// Initialize File Manager for local operations (optional)
const fileManager = FileManager ? new FileManager(path.join(__dirname, '..')) : { getFileTree:()=>[], getProjectStats:()=>({}), getRecentFiles:()=>[], readFile:()=>({}) };

const PORT = process.env.PORT || 3000;
// Simple shared auth token for agent endpoints (set OPEL_AGENT_TOKEN env). If unset, agent endpoints disabled.
const AGENT_TOKEN = process.env.OPEL_AGENT_TOKEN || process.env.AGENT_TOKEN || '';

// Middleware
app.use(cors());
app.use(express.json());
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

// --- AI Tool Chat Endpoint (OpenAI Responses API) ---
// POST /api/ai/chat-tool { message, sessionId?, stream? }
// Returns: { success, responseText, toolCalls:[...], toolResults:[...], model }
// If OPENAI_API_KEY missing, returns mock echo.
app.post('/api/ai/chat-tool', async (req, res) => {
    try {
        const { message, sessionId = 'default', stream = false } = req.body || {};
        if (!message) return res.status(400).json({ success:false, error:'message required' });
        if (!ToolSchemas || !ToolSchemas.toolSchemas) return res.status(503).json({ success:false, error:'tool schemas unavailable' });
        if (!aiToolDispatcher) {
            aiToolDispatcher = ToolDispatcher ? ToolDispatcher.createDispatcher({ deviceManager, serialManager, log: appendLog }) : null;
        }
        if (!process.env.OPENAI_API_KEY) {
            return res.json({ success:true, mock:true, responseText:`[mock] You said: ${message}`, toolCalls:[], toolResults:[] });
        }
        const OpenAI = require('openai');
        const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        // Retrieve session input list
        const session = aiToolSessionStore.get(sessionId) || { inputList: [] };
        const inputList = session.inputList;
        // Append user message
        inputList.push({ role: 'user', content: message });
        const tools = ToolSchemas.toolSchemas;
        const model = process.env.OPEL_AI_TOOL_MODEL || 'gpt-4.1-mini';
        const basePayload = { model, tools, input: inputList };
        let response = await client.responses.create(basePayload);
        inputList.push(...response.output); // keep raw tool call objects
        const toolCalls = [];
        const toolResults = [];
        for (const item of response.output) {
            if (item.type === 'function_call') {
                let argsParsed = {};
                try { argsParsed = JSON.parse(item.arguments || '{}'); } catch (_) {}
                toolCalls.push({ name: item.name, call_id: item.call_id, arguments: argsParsed });
                if (aiToolDispatcher) {
                    const result = await aiToolDispatcher.dispatch(item.name, argsParsed);
                    const outObj = { type: 'function_call_output', call_id: item.call_id, output: JSON.stringify(result) };
                    inputList.push(outObj);
                    toolResults.push({ call_id: item.call_id, result });
                }
            }
        }
        if (toolResults.length) {
            response = await client.responses.create({ model, tools, input: inputList, instructions: 'Incorporate tool results. If errors, explain next step. Be concise.' });
            inputList.push(...response.output);
        }
        aiToolSessionStore.set(sessionId, { inputList });
        res.json({ success:true, responseText: response.output_text, toolCalls, toolResults, model });
    } catch (e) {
        appendLog('ai-tools', 'error '+(e.message||e));
        res.status(500).json({ success:false, error:e.message||String(e) });
    }
});

// Fallback to the web-ui/public folder for the built-in UI assets
app.use(express.static(path.join(__dirname, 'public/dev')));

// Also serve the public/device subfolder at /device so a physical copy placed
// in web-ui/public/device will be reachable via /device/* as well.
app.use('/device', express.static(path.join(__dirname, 'public', 'device')));

// Legacy URL compatibility: redirect /development.html to /device.html
app.get(['/development', '/development.html'], (req, res) => {
    try { res.redirect(301, '/device.html'); } catch (e) { res.redirect('/device.html'); }
});

// --- API Request Logging Middleware (toggle with API_LOGGING env var) ---
const ENABLE_API_LOGGING = !['0', 'false', 'no'].includes(String(process.env.API_LOGGING || '').toLowerCase());
if (ENABLE_API_LOGGING) {
    app.use((req, res, next) => {
        if (!req.path.startsWith('/api')) return next();
        const start = process.hrtime.bigint();
        const method = req.method;
        const pathPart = req.path;
        const queryStr = Object.keys(req.query || {}).length ? `?${Object.entries(req.query).map(([k,v])=>`${k}=${v}`).join('&')}` : '';
        const bodyPreview = (() => {
            if (!req.body || typeof req.body !== 'object') return '';
            try {
                const json = JSON.stringify(req.body);
                return json.length > 200 ? json.slice(0,200)+"…" : json;
            } catch { return ''; }
        })();
        appendLog('api', `REQ ${method} ${pathPart}${queryStr} body=${bodyPreview}`);
        res.on('finish', () => {
            const durNs = Number(process.hrtime.bigint() - start);
            const durMs = (durNs/1e6).toFixed(2);
            appendLog('api', `RES ${method} ${pathPart} status=${res.statusCode} durMs=${durMs}`);
        });
        next();
    });
}

    // --- Agent Endpoint Auth Middleware ---
    function requireAgentAuth(req, res, next) {
        if (!agentActionRunner) return res.status(501).json({ success:false, error:'agent runner disabled' });
        if (!AGENT_TOKEN) return res.status(503).json({ success:false, error:'agent token not configured' });
        // Accept token from header (x-agent-token) or bearer auth or query (?token=)
        const header = req.headers['x-agent-token'] || req.headers['authorization'] || '';
        const queryTok = req.query.token;
        let token = '';
        if (header.startsWith('Bearer ')) token = header.substring(7).trim(); else if (header && !header.toLowerCase().startsWith('bearer')) token = header.toString();
        if (!token && queryTok) token = String(queryTok);
        if (token !== AGENT_TOKEN) return res.status(403).json({ success:false, error:'forbidden' });
        next();
    }

    // --- Agent Endpoints ---
    // GET /api/agent/actions -> list available actions
    app.get('/api/agent/actions', requireAgentAuth, (req, res) => {
        try { res.json({ success:true, actions: agentActionRunner.listActions() }); } catch (e) { res.status(500).json({ success:false, error:e.message }); }
    });
    // POST /api/agent/run { action, config? }
    app.post('/api/agent/run', requireAgentAuth, (req, res) => {
        try {
            const { action, config } = req.body || {};
            if (!action) return res.status(400).json({ success:false, error:'action required' });
            const result = agentActionRunner.execute(action, { config, aiAgent });
            res.json({ success: !!result.started || result.success, result });
        } catch (e) { res.status(500).json({ success:false, error:e.message }); }
    });
    // POST /api/agent/kill { processId }
    app.post('/api/agent/kill', requireAgentAuth, (req, res) => {
        try { const { processId } = req.body || {}; if (!processId) return res.status(400).json({ success:false, error:'processId required'}); res.json(agentActionRunner.kill(processId)); } catch (e) { res.status(500).json({ success:false, error:e.message }); }
    });
    // POST /api/agent/provider { provider }
    app.post('/api/agent/provider', requireAgentAuth, (req, res) => {
        try { const { provider } = req.body || {}; if (!provider) return res.status(400).json({ success:false, error:'provider required'}); if (!aiAgent) return res.status(503).json({ success:false, error:'ai agent disabled'}); const ok = aiAgent.setProvider(provider); res.json({ success: ok, provider, active: aiAgent.config.defaultProvider }); } catch (e) { res.status(500).json({ success:false, error:e.message }); }
    });
    // GET /api/agent/health
    app.get('/api/agent/health', requireAgentAuth, (req, res) => {
        try { res.json({ success:true, agent: aiAgent ? aiAgent.getHealth() : null, runner: !!agentActionRunner }); } catch (e) { res.status(500).json({ success:false, error:e.message }); }
    });
    // Runtime console log mirror control
    app.get('/api/logging/console', requireAgentAuth, (req, res) => {
        try { res.json({ success:true, state: getConsoleMirrorState() }); } catch (e) { res.status(500).json({ success:false, error:e.message }); }
    });
    app.post('/api/logging/console', requireAgentAuth, (req, res) => {
        try {
            const { enable, channels } = req.body || {};
            const state = setConsoleMirror(!!enable, Array.isArray(channels)? channels : (channels === null ? null : undefined));
            appendLog('node', `console-mirror ${state.enabled? 'enabled':'disabled'} channels=${state.channels? state.channels.join(','):'*'}`);
            res.json({ success:true, state });
        } catch (e) { res.status(500).json({ success:false, error:e.message }); }
    });

// --- Simple in-memory rate limiting for heavy endpoints ---
const _rateBuckets = new Map();
function _rateCheck(key, limit, intervalMs) {
    const now = Date.now();
    const windowStart = now - intervalMs;
    let arr = _rateBuckets.get(key) || [];
    // prune old
    arr = arr.filter(ts => ts > windowStart);
    if (arr.length >= limit) {
        _rateBuckets.set(key, arr); // keep pruned
        return false;
    }
    arr.push(now);
    _rateBuckets.set(key, arr);
    return true;
}
function rateLimit(req, res, keySuffix, limit, intervalMs = 60000) {
    const key = `${req.ip || 'unknown'}:${keySuffix}`;
    if (!_rateCheck(key, limit, intervalMs)) {
        return res.status(429).json({ success: false, error: 'rate limit exceeded' });
    }
    return null;
}

// Ensure uploads folder exists
const uploadsDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
// Ensure data folder exists (for saved devices)
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
const devicesFile = path.join(dataDir, 'devices.json');
// Initialize Device Manager
const deviceManager = new DeviceManager(devicesFile);

// DeviceManager event bridging
try {
    deviceManager.on('changed', (list) => {
        io.emit('device-list', { devices: list, selectedId: deviceManager.selectedId });
    });
    deviceManager.on('selected', (dev) => {
        io.emit('device-selected', dev ? { id: dev.id, host: dev.host, name: dev.name, port: dev.port } : null);
    });
    deviceManager.on('removed', (dev) => {
        io.emit('device-removed', { id: dev.id });
    });
} catch (_) { /* ignore wiring issues */ }

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
// Enhancements: configurable timeout, per-host concurrency cap, circuit breaker, metrics.
const DEVICE_PROXY_DEFAULT_TIMEOUT = parseInt(process.env.DEVICE_PROXY_TIMEOUT_MS || '15000', 10);
const DEVICE_PROXY_MAX_CONCURRENT = parseInt(process.env.DEVICE_PROXY_MAX_CONCURRENT || '4', 10); // per host
const DEVICE_PROXY_CIRCUIT_FAILS = parseInt(process.env.DEVICE_PROXY_CIRCUIT_FAILS || '5', 10); // open after N consecutive failures
const DEVICE_PROXY_CIRCUIT_RESET_MS = parseInt(process.env.DEVICE_PROXY_CIRCUIT_RESET_MS || '60000', 10); // half-open after
const _proxyState = {
    hosts: new Map(), // host -> { active:number, fails:number, openedAt:number|null, last:number }
    totals: { requests:0, errors:0, timeouts:0, streamed:0 }
};
function _getHostState(h) {
    let st = _proxyState.hosts.get(h);
    if (!st) { st = { active:0, fails:0, openedAt:null, last:0 }; _proxyState.hosts.set(h, st); }
    return st;
}
app.get('/api/proxy/metrics', (req,res)=> {
    try {
        const hosts = {};
        for (const [h, s] of _proxyState.hosts.entries()) {
            hosts[h] = { active:s.active, fails:s.fails, circuitOpen: !!s.openedAt, openedAt: s.openedAt };
        }
        res.json({ success:true, totals:_proxyState.totals, hosts, config:{ DEVICE_PROXY_DEFAULT_TIMEOUT, DEVICE_PROXY_MAX_CONCURRENT, DEVICE_PROXY_CIRCUIT_FAILS, DEVICE_PROXY_CIRCUIT_RESET_MS } });
    } catch(e) { res.status(500).json({ success:false, error:e.message }); }
});
app.all('/device/*', async (req, res) => {
    const tStart = Date.now();
    let host = null;
    try {
        host = req.query.host || req.body?.host;
        if (!host) return res.status(400).json({ success: false, error: 'no host specified' });
        const st = _getHostState(host);
        // Circuit breaker: if open and not yet reset
        if (st.openedAt) {
            if (Date.now() - st.openedAt < DEVICE_PROXY_CIRCUIT_RESET_MS) {
                appendLog('api', `proxy deny host=${host} reason=circuit-open`);
                return res.status(503).json({ success:false, error:'circuit open' });
            } else {
                // half-open trial: allow one request by resetting fails but keeping openedAt until success
                st.openedAt = null;
                st.fails = 0;
            }
        }
        if (st.active >= DEVICE_PROXY_MAX_CONCURRENT) {
            appendLog('api', `proxy deny host=${host} reason=concurrency active=${st.active}`);
            return res.status(429).json({ success:false, error:'too many concurrent proxy requests' });
        }
        // Extract path after /device and forward remaining query params except 'host'
        const devicePath = req.path.replace(/^\/device/, '') || '/';
        const query = { ...req.query };
        delete query.host;
        // optional override: timeout=<ms>
        let perReqTimeout = DEVICE_PROXY_DEFAULT_TIMEOUT;
        if (query.timeout) {
            const ov = parseInt(query.timeout,10); if (!isNaN(ov) && ov>0 && ov < 120000) perReqTimeout = ov;
            delete query.timeout;
        }
        const qs = new URLSearchParams(query).toString();
        const url = `http://${host}${devicePath}${qs ? `?${qs}` : ''}`;
        _proxyState.totals.requests++;
        st.active++;

        const opts = {
            method: req.method,
            url,
            headers: { ...req.headers },
            responseType: 'stream',
            validateStatus: () => true,
            timeout: perReqTimeout
        };
        delete opts.headers.host;
        delete opts.headers.connection;
        delete opts.headers['content-length'];
        if (req.method !== 'GET' && req.method !== 'HEAD') {
            if (req.is('application/json') && req.body && Object.keys(req.body).length) {
                opts.data = req.body;
            } else {
                opts.data = req;
            }
        }
        appendLog('api', `proxy req host=${host} path=${devicePath} timeoutMs=${perReqTimeout}`);
        let resp;
        try {
            resp = await axios(opts);
        } catch (err) {
            st.fails++;
            _proxyState.totals.errors++;
            if (err.code === 'ECONNABORTED') _proxyState.totals.timeouts++;
            if (st.fails >= DEVICE_PROXY_CIRCUIT_FAILS) {
                st.openedAt = Date.now();
                appendLog('api', `proxy circuit-open host=${host} fails=${st.fails}`);
            }
            const dur = Date.now() - tStart;
            appendLog('api', `proxy err host=${host} durMs=${dur} msg=${err.message}`);
            return res.status(504).json({ success:false, error:err.message || 'proxy error' });
        } finally {
            st.active = Math.max(0, st.active - 1);
        }
        // success or at least response
        if (resp.status >= 500) st.fails++; else st.fails = 0; // reset fails on non-5xx
        if (st.fails >= DEVICE_PROXY_CIRCUIT_FAILS) { st.openedAt = Date.now(); appendLog('api', `proxy circuit-open host=${host} fails=${st.fails}`); }
        const dur = Date.now() - tStart;
        appendLog('api', `proxy res host=${host} status=${resp.status} durMs=${dur}`);
        Object.entries(resp.headers).forEach(([k,v])=> { try { res.setHeader(k,v); } catch(_){} });
        res.status(resp.status);
        if (resp.data && resp.data.pipe) {
            resp.data.on('data', ()=>{ _proxyState.totals.streamed++; });
            resp.data.pipe(res);
        } else {
            res.send(resp.data);
        }
    } catch (err) {
        if (host) {
            const st = _getHostState(host); st.fails++; if (st.fails >= DEVICE_PROXY_CIRCUIT_FAILS) st.openedAt = Date.now();
        }
        console.error('Device proxy error:', err.message || err);
        res.status(500).json({ success: false, error: err.message || String(err) });
    }
});

// Store for active processes
const activeProcesses = new Map();

// Serial Manager instance (initialized after currentConfig definition to get manual COM settings)
let serialManager = null;

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

// Initialize Serial Manager now that initial config is available
try {
    serialManager = new SerialManager({
        manualComOnly: currentConfig.manualComOnly,
        allowedComPort: currentConfig.allowedComPort
    });
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

// Serial control endpoints
app.get('/api/serial/list', async (req, res) => {
    if (!serialManager) return res.json({ success:false, error:'serial manager not available' });
    try { const ports = await serialManager.listPorts(); res.json({ success: true, ports }); }
    catch (e) { res.json({ success: false, error: e.message }); }
});

// Serial centralized status
app.get('/api/serial/status', (req, res) => {
    if (!serialManager) return res.json({ success:true, status:{ available:false }, note:'serial manager disabled' });
    try { res.json({ success: true, status: serialManager.getStatus() }); } catch (e) { res.status(500).json({ success: false, error: e.message }); }
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

app.post('/api/serial/open', async (req, res) => {
    if (!serialManager || !serialManager.isAvailable()) return res.status(501).json({ success: false, error: 'serialport not available on server' });
    const { path: portPath, baudRate = 115200 } = req.body || {};
    if (!portPath) return res.status(400).json({ success: false, error: 'path required' });
    try {
        const result = await serialManager.open(portPath, baudRate);
        res.json({ success: true, ...result });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

app.post('/api/serial/close', async (req, res) => {
    if (!serialManager) return res.json({ success:true, alreadyClosed:true });
    const { path: portPath } = req.body || {};
    // If a different port provided than open one, just report state
    if (portPath && serialManager.getStatus().path && portPath !== serialManager.getStatus().path) {
        return res.json({ success: false, error: 'different port currently open', status: serialManager.getStatus() });
    }
    try {
        const result = await serialManager.close();
        res.json({ success: !!result.success, ...result });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

app.post('/api/serial/write', async (req, res) => {
    if (!serialManager) return res.status(501).json({ success:false, error:'serial manager not available' });
    const { path: portPath, data } = req.body || {};
    if (!portPath || data === undefined) return res.status(400).json({ success: false, error: 'path and data required' });
    const status = serialManager.getStatus();
    if (!status.open || status.path !== portPath) return res.status(400).json({ success: false, error: 'port not open' });
    try {
        const autoNL = req.query && req.query.autoNL === '1';
        let payload = data;
        if (autoNL && typeof payload === 'string' && !payload.endsWith('\n')) payload += '\n';
        await serialManager.write(payload);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// Reopen serial (optionally change baud). POST { path?, baudRate? }
app.post('/api/serial/reopen', async (req, res) => {
    try {
        if (!serialManager || !serialManager.isAvailable()) return res.status(501).json({ success:false, error:'serialport not available on server' });
        const { path: portPath, baudRate } = req.body || {};
        const targetPort = portPath || currentConfig.comPort;
        const targetBaud = parseInt(baudRate,10) || currentConfig.baudRate || 115200;
        const st = serialManager.getStatus();
        if (st.open && (st.path !== targetPort || st.baudRate !== targetBaud)) {
            await serialManager.close();
        }
        const result = await serialManager.open(targetPort, targetBaud);
        currentConfig.comPort = targetPort;
        currentConfig.baudRate = targetBaud;
        res.json({ success:true, result, status: serialManager.getStatus() });
    } catch (e) { res.status(400).json({ success:false, error:e.message }); }
});

// Diagnose serial: returns status and pokes newline if open
app.get('/api/serial/diagnose', async (req, res) => {
    try {
        if (!serialManager || !serialManager.isAvailable()) return res.status(501).json({ success:false, error:'serialport not available on server' });
        const status = serialManager.getStatus();
        let poked = false;
        if (status.open) {
            try { await serialManager.write('\n'); poked = true; } catch (_) {}
        }
        res.json({ success:true, status, poked });
    } catch (e) { res.status(500).json({ success:false, error:e.message }); }
});

// Curated list of common serial commands (extend as firmware grows)
// Keeping this static avoids probing the device and provides quick access in the UI.
// If a future dynamic discovery mechanism is added, this endpoint can merge results.
const DEFAULT_SERIAL_COMMANDS = [
    'help',
    'version',
    'reboot',
    'sysinfo',
    'wifi_scan',
    'heap',
    'tasks',
    'get_db',
    'list_serial_ports',
    // Developer / maintenance helpers (only if supported by firmware)
    'ping',
    'ota_status'
];

app.get('/api/serial/commands', (req, res) => {
    try {
        // Allow optional filtering (?q=prefix)
        const q = (req.query.q || '').toString().trim().toLowerCase();
        let cmds = DEFAULT_SERIAL_COMMANDS.slice();
        if (q) cmds = cmds.filter(c => c.toLowerCase().startsWith(q));
        res.json({ success: true, commands: cmds });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// Serial WiFi scan using Improv protocol
// body: { path, baudRate? }
app.post('/api/serial/wifi/scan', async (req, res) => {
    if (!serialManager || !serialManager.isAvailable()) return res.status(501).json({ success: false, error: 'serialport not available on server' });
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
    const status = serialManager.getStatus();
    try {
        let port;
        if (status.open && status.path === portPath) {
            port = serialManager._port; // reuse existing (internal)
            usedExisting = true;
        } else {
            // open a temporary dedicated port (do not replace manager's open port)
            const spLib = require('serialport');
            const SP = spLib.SerialPort || spLib;
            port = new SP({ path: portPath, baudRate: parseInt(baudRate, 10) });
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
    if (!serialManager || !serialManager.isAvailable()) return res.status(501).json({ success: false, error: 'serialport not available on server' });
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
        let port;
        const status = serialManager.getStatus();
        if (status.open && status.path === portPath) {
            port = serialManager._port; // reuse shared port
        } else {
            const spLib = require('serialport');
            const SP = spLib.SerialPort || spLib;
            port = new SP({ path: portPath, baudRate: parseInt(baudRate, 10) });
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
    if (!serialManager || !serialManager.isAvailable()) return res.status(501).json({ success: false, error: 'serialport not available on server' });
    const { path: portPath, baudRate = 115200, testCmd = '\n', timeout = 1000 } = req.body || {};
    if (!portPath) return res.status(400).json({ success: false, error: 'path required' });

    // Enforce manual COM mode if enabled
    if (currentConfig.manualComOnly && currentConfig.allowedComPort) {
        const allowed = String(currentConfig.allowedComPort).toUpperCase();
        if (String(portPath).toUpperCase() !== allowed) {
            return res.status(403).json({ success: false, error: `Manual COM mode active. Only ${allowed} is allowed.` });
        }
    }

    let tempOpened = false;
    let port;
    let portErrored = null;

    try {
        const status = serialManager.getStatus();
        if (status.open && status.path === portPath) {
            port = serialManager._port;
        } else {
            const spLib = require('serialport');
            const SP = spLib.SerialPort || spLib;
            port = new SP({ path: portPath, baudRate: parseInt(baudRate, 10) });
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
// Unified sequence (preferred):
//   1. POST /api/wifi/scan
//   2. Poll /api/wifi/scan/results until scanRunning=false or timeout
// Legacy fallback (deprecated – will be removed): /wifi_scan, /scan_wifi
app.get('/api/device/wifi/scan', async (req, res) => {
    // Limit to 4 scans per minute per IP to protect devices
    if (rateLimit(req, res, 'wifi_scan', 4)) return;
    try {
        const host = req.query.host;
        if (!host) return res.status(400).json({ success: false, error: 'host required' });
        const base = `http://${host}`;

        // Helper: normalize any results array shape
        const normalizeNetworks = (raw) => {
            if (!raw) return [];
            // Accept { networks: [...] } or { results: [...] }
            if (Array.isArray(raw.networks)) raw = raw.networks;
            if (Array.isArray(raw.results)) raw = raw.results;
            if (Array.isArray(raw.scanResults)) raw = raw.scanResults;
            if (!Array.isArray(raw) && typeof raw === 'object') {
                // convert object map -> array of values
                raw = Object.values(raw);
            }
            if (!Array.isArray(raw)) return [];
            return raw.map(n => {
                if (n && typeof n === 'object') return n; // assume already structured
                return { ssid: String(n) };
            });
        };

        // --- Preferred unified API path ---
        try {
            const kick = await axios.post(`${base}/api/wifi/scan`, {}, { timeout: 8000, validateStatus: () => true });
            if (kick.status >= 200 && kick.status < 300) {
                const started = Date.now();
                const timeoutMs = 15000; // overall scan timeout
                let lastData = null;
                while ((Date.now() - started) < timeoutMs) {
                    await new Promise(r => setTimeout(r, 750));
                    try {
                        const r = await axios.get(`${base}/api/wifi/scan/results`, { timeout: 6000, validateStatus: () => true });
                        if (r.status >= 200 && r.status < 300) {
                            lastData = r.data;
                            const running = !!r.data?.scanRunning;
                            if (!running) {
                                const nets = normalizeNetworks(r.data);
                                return res.json({ success: true, networks: nets, unified: true, scanDurationMs: Date.now() - started });
                            }
                        } else {
                            // Non-success status while polling: break to fallback
                            break;
                        }
                    } catch (pollErr) {
                        // break to fallback on persistent error
                        break;
                    }
                }
                // If we exit loop with lastData that has results but scanRunning maybe stuck false
                if (lastData) {
                    const nets = normalizeNetworks(lastData);
                    if (nets.length) return res.json({ success: true, networks: nets, unified: true, partial: true });
                }
                // fall through to legacy
            }
        } catch (unifiedErr) {
            // swallow and attempt legacy
        }

        // --- Legacy fallback paths --- (deprecated)
        const legacyPaths = ['/wifi_scan', '/scan_wifi'];
        let lastErr = null;
        for (const p of legacyPaths) {
            try {
                const url = `${base}${p}`;
                const r = await axios.get(url, { timeout: 10000, validateStatus: () => true });
                if (r.status >= 200 && r.status < 300) {
                    const nets = normalizeNetworks(r.data);
                    return res.json({ success: true, networks: nets, unified: false, legacyEndpoint: p });
                }
                lastErr = new Error(`HTTP ${r.status}`);
            } catch (e) { lastErr = e; }
        }
        return res.status(502).json({ success: false, error: lastErr?.message || 'scan failed', unifiedTried: true });
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

// WiFi: status aggregator
// GET /api/device/wifi/status?host=IP
// Tries multiple known firmware endpoints to gather: connected, ssid, rssi, ip, channel, mode
app.get('/api/device/wifi/status', async (req, res) => {
    const host = req.query.host;
    if (!host) return res.status(400).json({ success: false, error: 'host required' });
    const base = `http://${host}`;
    const result = { success: true, host, connected: false, ssid: null, rssi: null, ip: null, channel: null, mode: null, raw: {} };
    // Preferred unified endpoints first; legacy fallbacks after
    const attempts = [
        { path: '/api/wifi/summary', tag: 'summary' },
        { path: '/api/wifi/status', tag: 'status' },
        // --- legacy (deprecated) ---
        { path: '/network_info', tag: 'network_info' },
        { path: '/sysinfo', tag: 'sysinfo' },
        { path: '/api/telemetry', tag: 'telemetry' },
        { path: '/api/status', tag: 'api_status' }
    ];
    for (const a of attempts) {
        try {
            const r = await axios.get(base + a.path, { timeout: 5000, validateStatus: () => true });
            if (r.status >= 200 && r.status < 300 && r.data) {
                result.raw[a.tag] = r.data;
                const d = r.data;
                const wifi = d.wifi || d.network || d; // d.network legacy alias
                if (wifi) {
                    if (wifi.ssid && !result.ssid) result.ssid = wifi.ssid;
                    if (typeof wifi.rssi === 'number' && result.rssi == null) result.rssi = wifi.rssi;
                    if (wifi.localIP && !result.ip) result.ip = wifi.localIP;
                    if (wifi.ip && !result.ip) result.ip = wifi.ip;
                    if (wifi.channel && !result.channel) result.channel = wifi.channel;
                    if ((wifi.connected === true || wifi.status === 'connected') && !result.connected) result.connected = true;
                }
                if (d.ap && d.ap.enabled && !result.mode) result.mode = d.ap.mode || 'ap';
                if (d.mode && !result.mode) result.mode = d.mode;
                if (d.wifiStatus !== undefined) {
                    const ws = (typeof d.wifiStatus === 'string') ? parseInt(d.wifiStatus, 10) : d.wifiStatus;
                    if (ws === 3) result.connected = true;
                }
            }
        } catch (_) { /* ignore individual attempt */ }
    }
    if (!result.connected) {
        try {
            const ping = await axios.get(base + '/api/ping', { timeout: 2000, validateStatus: () => true });
            if (ping.status >= 200 && ping.status < 300 && ping.data && ping.data.ok) result.connected = true;
        } catch (_) { /* ignore */ }
    }
    res.json(result);
});

// Convenience: perform WiFi status/scan/connect/disconnect operations by device id
// These wrap the host-based endpoints so the browser can avoid duplicating host lookup logic.
app.get('/api/device/:id/wifi/status', async (req, res) => {
    try {
        const dev = deviceManager.get(req.params.id);
        if (!dev || !(dev.host || dev.ip)) return res.status(404).json({ success: false, error: 'device not found' });
        // Reuse existing aggregator via internal call (duplicate logic kept minimal for clarity)
        req.query.host = dev.host || dev.ip; // mutate for reuse
        return app._router.handle({ ...req, url: `/api/device/wifi/status?host=${encodeURIComponent(req.query.host)}`, path: '/api/device/wifi/status' }, res, () => {});
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

app.get('/api/device/:id/wifi/scan', async (req, res) => {
    try {
        const dev = deviceManager.get(req.params.id);
        if (!dev || !(dev.host || dev.ip)) return res.status(404).json({ success: false, error: 'device not found' });
        const host = dev.host || dev.ip;
        req.query.host = host;
        return app._router.handle({ ...req, url: `/api/device/wifi/scan?host=${encodeURIComponent(host)}`, path: '/api/device/wifi/scan' }, res, () => {});
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

app.post('/api/device/:id/wifi/connect', async (req, res) => {
    try {
        const dev = deviceManager.get(req.params.id);
        if (!dev || !(dev.host || dev.ip)) return res.status(404).json({ success: false, error: 'device not found' });
        const host = dev.host || dev.ip;
        const { ssid, password = '' } = req.body || {};
        if (!ssid) return res.status(400).json({ success: false, error: 'ssid required' });
        req.body.host = host;
        return app._router.handle({ ...req, url: `/api/device/wifi/connect`, path: '/api/device/wifi/connect', method: 'POST' }, res, () => {});
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

app.post('/api/device/:id/wifi/disconnect', async (req, res) => {
    try {
        const dev = deviceManager.get(req.params.id);
        if (!dev || !(dev.host || dev.ip)) return res.status(404).json({ success: false, error: 'device not found' });
        const host = dev.host || dev.ip;
        req.body.host = host;
        return app._router.handle({ ...req, url: `/api/device/wifi/disconnect`, path: '/api/device/wifi/disconnect', method: 'POST' }, res, () => {});
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// WiFi: disconnect attempt (best-effort)
// POST /api/device/wifi/disconnect { host }
// Tries multiple endpoints; returns first success
app.post('/api/device/wifi/disconnect', async (req, res) => {
    try {
        const { host } = req.body || {};
        if (!host) return res.status(400).json({ success: false, error: 'host required' });
        const base = `http://${host}`;
        const paths = [
            { method: 'post', path: '/wifi_disconnect' },
            { method: 'post', path: '/disconnect_wifi' },
            { method: 'get', path: '/wifi_disconnect' },
            { method: 'get', path: '/disconnect_wifi' },
            { method: 'post', path: '/api/wifi/disconnect' },
            { method: 'get', path: '/api/wifi/disconnect' }
        ];
        let lastErr = null;
        for (const p of paths) {
            try {
                const fn = p.method === 'post' ? axios.post : axios.get;
                const r = await fn(base + p.path, {}, { timeout: 5000, validateStatus: () => true });
                if (r.status >= 200 && r.status < 300) return res.json({ success: true, endpoint: p.path, data: r.data });
                lastErr = new Error(`HTTP ${r.status}`);
            } catch (e) { lastErr = e; }
        }
        return res.status(502).json({ success: false, error: lastErr?.message || 'disconnect failed' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message || String(err) });
    }
});

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

function computeUnifiedDiff(oldStr, newStr, filePath) {
    const oldLines = oldStr.split(/\r?\n/);
    const newLines = newStr.split(/\r?\n/);
    // Simple diff (O(n^2) worst) acceptable for <=200KB; use LCS dynamic programming
    const m = oldLines.length, n = newLines.length;
    const dp = Array(m+1).fill(null).map(()=>Array(n+1).fill(0));
    for (let i=m-1;i>=0;--i) {
        for (let j=n-1;j>=0;--j) {
            dp[i][j] = oldLines[i] === newLines[j] ? dp[i+1][j+1]+1 : Math.max(dp[i+1][j], dp[i][j+1]);
        }
    }
    const diff = [];
    let i=0,j=0;
    while (i<m && j<n) {
        if (oldLines[i] === newLines[j]) { diff.push(' '+oldLines[i]); i++; j++; }
        else if (dp[i+1][j] >= dp[i][j+1]) { diff.push('-'+oldLines[i]); i++; }
        else { diff.push('+'+newLines[j]); j++; }
    }
    while (i<m) { diff.push('-'+oldLines[i]); i++; }
    while (j<n) { diff.push('+'+newLines[j]); j++; }
    return { header: `--- a/${filePath}\n+++ b/${filePath}`, lines: diff };
}

app.post('/api/ai/patch/preview', async (req, res) => {
    if (!aiEditingEnabled()) return res.status(403).json({ success:false, error:'Editing disabled' });
    const { path: relPath, instruction } = req.body || {};
    if (!relPath || !instruction) return res.status(400).json({ success:false, error:'path and instruction required' });
    try {
        const full = resolveSafePath(relPath);
        validateFileTarget(full);
        const original = fs.readFileSync(full, 'utf8');
        const { reasoning, content } = await aiAgent.generateFileEdit(relPath, original, instruction);
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
            if (err && err.code === 'EADDRINUSE' && attempt < 10) {
                console.warn(`Port ${port} in use, trying ${port+1}...`);
                // Small backoff
                setTimeout(()=>startServer(port+1, attempt+1), 250 + (attempt*50));
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
