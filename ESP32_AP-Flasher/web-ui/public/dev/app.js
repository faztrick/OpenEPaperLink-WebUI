class ESP32DevUI {
    constructor() {
        this.socket = null;
        this.connected = false;
        this.currentProcess = null;
        this.aiAvailable = false;
        this.aiConfig = null;
    this.logBuffer = [];
        this.config = {
            comPort: 'COM3',
            wifiSSID: '',
            wifiPassword: '',
            fastCompile: false,
            verboseOutput: false,
            cleanBuild: false
        };

        this.remoteConfig = {
            enabled: false,
            host: '94.200.149.94',
            port: 22,
            user: 'root',
            connected: false
        };

        this.init();
    }

    init() {
        this.initSocket();
        this.bindEvents();
        this.loadConfig();
        this.updateUI();
    }

    // Central client logger that posts to server /api/log (non-blocking)
    log(message, level = 'info', name = 'client') {
        try {
            const line = `${level.toUpperCase()}: ${typeof message === 'string' ? message : JSON.stringify(message)}`;
            // keep small local buffer for console output
            this.logBuffer = this.logBuffer || [];
            this.logBuffer.push(line);
            if (this.logBuffer.length > 500) this.logBuffer.shift();

            // POST asynchronously (fire-and-forget)
            fetch('/api/log', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, message: line }) }).catch(()=>{});
        } catch (e) { /* ignore */ }
    }

    // Initialize socket.io connection. Chooses remote server when configured and connected,
    // otherwise connects to same-origin server. Guards if socket.io client is missing.
    initSocket() {
        if (typeof io === 'undefined') {
            console.warn('socket.io client (io) not found on the page; socket features disabled');
            return;
        }

        const tryConnect = () => {
            // Build socket URL when remote is enabled+connected
            const remote = this.remoteConfig;
            let socketUrl = null;

            if (remote && remote.enabled && remote.connected && remote.host) {
                const hostPart = remote.host.replace(/\/$/, '');
                const portPart = remote.port ? `:${remote.port}` : '';
                const prefix = hostPart.match(/^https?:\/\//) ? hostPart : `http://${hostPart}`;
                socketUrl = `${prefix}${portPart}`;
            }

            try {
                const opts = { transports: ['websocket'] };
                this.socket = socketUrl ? io(socketUrl, opts) : io(opts);
            } catch (err) {
                console.error('Failed to create socket:', err);
                return;
            }

            this.socket.on('connect', () => {
                this.connected = true;
                this.updateWsStatus(true);
                this.log('WebSocket connected', 'info');
            });

            this.socket.on('disconnect', (reason) => {
                this.connected = false;
                this.updateWsStatus(false);
                this.log(`WebSocket disconnected: ${reason}`, 'warning');
            });

            this.socket.on('connect_error', (err) => {
                this.updateWsStatus(false, 'ConnErr');
                this.log(`WebSocket connection error: ${err && err.message ? err.message : err}`, 'error');
            });

            // Serial events
            this.socket.on('serial-data', (data) => {
                try {
                    if (data && data.port) this.updateSerialStatus(true, data.port);
                    if (data && data.text) this.log(data.text, 'info');
                } catch (e) { /* ignore */ }
            });

            this.socket.on('serial-opened', (port) => {
                this.updateSerialStatus(true, port);
            });

            this.socket.on('serial-closed', (port) => {
                this.updateSerialStatus(false);
            });

            this.socket.on('serial-error', (err) => {
                this.updateSerialStatus(false);
                this.log(`Serial error: ${err && err.message ? err.message : err}`, 'error');
            });

            // Generic log passthrough
            this.socket.on('log', (msg) => { if (msg) this.log(msg, 'info'); });
        };

        // expose a reconnect helper so other code (like remote test) can trigger a reconnect
        this.reconnectSocket = () => {
            try { if (this.socket && this.socket.disconnect) this.socket.disconnect(); } catch (e) { }
            tryConnect();
        };

        // initial connect
        tryConnect();
    }

    // --- Connection status helpers ---
    updateApiStatus(online, info) {
        const dot = document.getElementById('api-status-dot');
        const text = document.getElementById('api-status-text');
        if (dot) dot.className = `status-dot ${online ? 'connected' : 'disconnected'}`;
        if (text) text.textContent = online ? (info || 'API') : 'API';
    }

    updateWsStatus(online, info) {
        const dot = document.getElementById('ws-status-dot');
        const text = document.getElementById('ws-status-text');
        if (dot) dot.className = `status-dot ${online ? 'connected' : 'disconnected'}`;
        if (text) text.textContent = online ? (info || 'WS') : 'WS';
    }

    updateSerialStatus(online, port) {
        const dot = document.getElementById('serial-status-dot');
        const text = document.getElementById('serial-status-text');
        if (dot) dot.className = `status-dot ${online ? 'connected' : 'disconnected'}`;
        if (text) text.textContent = online ? (port || 'Serial') : 'Serial';
    // track serial open state for enabling/disabling flash/erase UI
    try { this._serialOpen = !!online; } catch (e) { this._serialOpen = false; }
    try { this._updateFlashEraseButtons(); } catch (e) { /* ignore */ }
    }

    startApiHealthChecks(intervalMs = 5000) {
        // run immediately and then interval
        const check = async () => {
            try {
                const res = await fetch('/api/status');
                if (!res.ok) throw new Error('status not ok');
                const json = await res.json();
                this.updateApiStatus(true, 'API');
            } catch (err) {
                this.updateApiStatus(false);
            }
        };

        check();
        if (this._apiHealthInterval) clearInterval(this._apiHealthInterval);
        this._apiHealthInterval = setInterval(check, intervalMs);
    }

    // expose for other pages (settings, flash) to call helper functions
    attachToWindow() {
        try { window.app = this; } catch (e) { /* ignore */ }
    }


    bindEvents() {
        // Action buttons (guarded)
        const mapListener = (id, cb) => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('click', cb);
        };

        mapListener('btn-compile', () => this.compile());
        mapListener('btn-fast-compile', () => this.fastCompile());
        mapListener('btn-flash', () => this.flash());
        mapListener('btn-monitor', () => this.monitor());
        mapListener('btn-build-fs', () => this.buildFS());
        mapListener('btn-flash-fs', () => this.flashFS());
        mapListener('btn-clean', () => this.clean());
        mapListener('btn-erase', () => this.eraseFlash());
        mapListener('btn-wifi-config', () => this.wifiConfig());
        mapListener('btn-ota-update', () => this.otaUpdate());
        mapListener('btn-test-network', () => this.testNetwork());
        mapListener('btn-validate-config', () => this.validateConfig());

    // Console controls (IDs as in index.html)
    const clearBtn = document.getElementById('clear-console');
    if (clearBtn) clearBtn.addEventListener('click', () => this.clearConsole());
    const saveLogBtn = document.getElementById('save-log');
    if (saveLogBtn) saveLogBtn.addEventListener('click', () => this.saveLog());
    const killBtn = document.getElementById('kill-process');
    if (killBtn) killBtn.addEventListener('click', () => this.stopProcess());

        // Configuration bindings — these elements may live on settings page
        const bindIfPresent = (id, event, cb) => {
            const el = document.getElementById(id);
            if (el) el.addEventListener(event, cb);
        };

        bindIfPresent('com-port', 'change', (e) => this.updateConfig('comPort', e.target.value));
        bindIfPresent('wifi-ssid', 'input', (e) => this.updateConfig('wifiSSID', e.target.value));
        bindIfPresent('wifi-password', 'input', (e) => this.updateConfig('wifiPassword', e.target.value));
        bindIfPresent('fast-build', 'change', (e) => this.updateConfig('fastCompile', e.target.checked));
        bindIfPresent('verbose-output', 'change', (e) => this.updateConfig('verboseOutput', e.target.checked));
        bindIfPresent('clean-build', 'change', (e) => this.updateConfig('cleanBuild', e.target.checked));

    // Refresh COM ports (support multiple button ids used in different pages)
    const refreshPortsBtn = document.getElementById('refresh-ports');
    if (refreshPortsBtn) refreshPortsBtn.addEventListener('click', () => this.refreshComPorts());
    const serialRefreshBtn = document.getElementById('serial-refresh');
    if (serialRefreshBtn) serialRefreshBtn.addEventListener('click', () => this.refreshSerialPorts());

    // Serial open/close/send bindings (C6 panel)
    const serialOpenBtn = document.getElementById('serial-open');
    if (serialOpenBtn) serialOpenBtn.addEventListener('click', () => this.openSerialPort());
    const serialCloseBtn = document.getElementById('serial-close');
    if (serialCloseBtn) serialCloseBtn.addEventListener('click', () => this.closeSerialPort());
    const serialSendBtn = document.getElementById('serial-send-btn');
    if (serialSendBtn) serialSendBtn.addEventListener('click', () => this.sendSerial());

    // If running on settings.html, wire save button
    const saveSettingsBtn = document.getElementById('save-settings');
    if (saveSettingsBtn) saveSettingsBtn.addEventListener('click', () => this.saveConfig());

        // AI event handlers
        const aiAnalyze = document.getElementById('ai-analyze-project');
        if (aiAnalyze) aiAnalyze.addEventListener('click', () => this.analyzeProject());

        const aiChatToggle = document.getElementById('ai-chat-toggle');
        if (aiChatToggle) aiChatToggle.addEventListener('click', () => this.toggleAIChat());

        const aiSuggestions = document.getElementById('ai-suggestions');
        if (aiSuggestions) aiSuggestions.addEventListener('click', () => this.getAISuggestions());

        const aiConfigBtn = document.getElementById('ai-config');
        if (aiConfigBtn) aiConfigBtn.addEventListener('click', () => this.showAIConfig());

        const aiSend = document.getElementById('ai-send');
        if (aiSend) aiSend.addEventListener('click', () => this.sendAIMessage());

        const aiInput = document.getElementById('ai-input');
        if (aiInput) aiInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.sendAIMessage();
        });

        const saveAi = document.getElementById('save-ai-config');
        if (saveAi) saveAi.addEventListener('click', () => this.saveAIConfig());

        const testAi = document.getElementById('test-ai-connection');
        if (testAi) testAi.addEventListener('click', () => this.testAIConnection());

    // C6 management event handlers
    const c6TestBtn = document.getElementById('c6-test-connection');
    if (c6TestBtn) c6TestBtn.addEventListener('click', () => this.testC6Connection());

    const c6RadioBtn = document.getElementById('c6-test-radio');
    if (c6RadioBtn) c6RadioBtn.addEventListener('click', () => this.testC6Radio());

    const c6RestartBtn = document.getElementById('c6-restart');
    if (c6RestartBtn) c6RestartBtn.addEventListener('click', () => this.restartC6());

    const c6UploadBtn = document.getElementById('c6-upload');
    if (c6UploadBtn) c6UploadBtn.addEventListener('click', () => this.uploadC6Firmware());

    const c6FlashBtn = document.getElementById('c6-flash');
    if (c6FlashBtn) c6FlashBtn.addEventListener('click', () => this.triggerC6Flash());

    // Remote server event handlers (guarded - some pages don't include remote controls)
    const useRemoteEl = document.getElementById('use-remote');
    if (useRemoteEl) useRemoteEl.addEventListener('change', (e) => this.toggleRemoteServer(e.target.checked));

    const testConnBtn = document.getElementById('test-connection');
    if (testConnBtn) testConnBtn.addEventListener('click', () => this.testRemoteConnection());

    const remoteHost = document.getElementById('remote-host');
    if (remoteHost) remoteHost.addEventListener('change', (e) => this.updateRemoteConfig('host', e.target.value));

    const remotePort = document.getElementById('remote-port');
    if (remotePort) remotePort.addEventListener('change', (e) => this.updateRemoteConfig('port', e.target.value));

    const remoteUser = document.getElementById('remote-user');
    if (remoteUser) remoteUser.addEventListener('change', (e) => this.updateRemoteConfig('user', e.target.value));

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey) {
                switch (e.key) {
                    case 'b':
                        e.preventDefault();
                        this.compile();
                        break;
                    case 'f':
                        e.preventDefault();
                        this.flash();
                        break;
                    case 'm':
                        e.preventDefault();
                        this.monitor();
                        break;
                    case 'l':
                        e.preventDefault();
                        this.clearConsole();
                        break;
                }
            }
        });

        // Attach data-action buttons (generic handler)
        const actionButtons = document.querySelectorAll('.btn[data-action]');
        actionButtons.forEach(btn => {
            const act = btn.getAttribute('data-action');
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                this.handleActionButton(act);
            });
        });
    }

    updateConnectionStatus() {
        const statusDot = document.querySelector('.status-dot');
        const statusText = document.querySelector('.status-indicator span');

        if (this.connected) {
            if (statusDot) statusDot.className = 'status-dot connected';
            if (statusText) statusText.textContent = 'Connected';
        } else {
            if (statusDot) statusDot.className = 'status-dot disconnected';
            if (statusText) statusText.textContent = 'Disconnected';
        }
    }

    updateButtons() {
        const buttons = document.querySelectorAll('.btn[data-action]');
        buttons.forEach(btn => {
            if (this.currentProcess) {
                btn.disabled = true;
                btn.classList.add('loading');
            } else {
                btn.disabled = false;
                btn.classList.remove('loading');
            }
        });

        // Enable/disable stop button
    const stopBtn = document.getElementById('kill-process');
    if (stopBtn) stopBtn.disabled = !this.currentProcess;
    }

    updateComPorts(ports) {
        const select = document.getElementById('com-port');
        if (!select) return; // nothing to update on pages that don't include a com-port selector
        const currentValue = select.value;

        select.innerHTML = '';

        if (ports.length === 0) {
            const option = document.createElement('option');
            option.value = '';
            option.textContent = 'No COM ports found';
            select.appendChild(option);
            select.disabled = true;
        } else {
            select.disabled = false;
            ports.forEach(port => {
                const option = document.createElement('option');
                option.value = port.path;
                option.textContent = `${port.path} - ${port.manufacturer || 'Unknown'}`;
                select.appendChild(option);
            });

            // Restore previous selection or use first port
            if (ports.some(p => p.path === currentValue)) {
                select.value = currentValue;
            } else {
                select.value = ports[0].path;
                this.updateConfig('comPort', ports[0].path);
            }
        }
    }

    // Internal helper to enable/disable flash & erase buttons based on serial availability
    _updateFlashEraseButtons() {
        const flashBtn = document.getElementById('btn-flash') || document.getElementById('c6-flash');
        const eraseBtn = document.getElementById('btn-erase') || document.getElementById('btn-erase');

    // allow remote host reachability to satisfy flash/erase requirement (for OTA)
    const remoteOk = !!this._remoteReachable;
    const hasPort = (this._availableSerialPorts && this._availableSerialPorts.length > 0) || !!this._serialOpen || !!this.config.comPort || remoteOk;

        if (flashBtn) {
            flashBtn.disabled = !hasPort;
            flashBtn.title = hasPort ? '' : 'No serial port available';
        }
        if (eraseBtn) {
            eraseBtn.disabled = !hasPort;
            eraseBtn.title = hasPort ? '' : 'No serial port available';
        }
    }

    // Test reachability of a remote host (HTTP) with a short timeout
    async testRemoteHost(host) {
        if (!host) return false;
        // normalize
        let url = host.trim();
        if (!url.match(/^https?:\/\//)) url = `http://${url}`;
        // probe small path (root) with timeout
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3000);
        try {
            const res = await fetch(url, { method: 'HEAD', signal: controller.signal });
            clearTimeout(timeout);
            const ok = res && (res.ok || res.status < 400);
            this._remoteReachable = ok;
            try { this._updateFlashEraseButtons(); } catch (e) { }
            return ok;
        } catch (err) {
            clearTimeout(timeout);
            this._remoteReachable = false;
            try { this._updateFlashEraseButtons(); } catch (e) { }
            return false;
        }
    }

    updateConfigUI() {
    const elCom = document.getElementById('com-port'); if (elCom) elCom.value = this.config.comPort;
    const elSsid = document.getElementById('wifi-ssid'); if (elSsid) elSsid.value = this.config.wifiSSID;
    const elPass = document.getElementById('wifi-password'); if (elPass) elPass.value = this.config.wifiPassword;
    const elFast = document.getElementById('fast-compile') || document.getElementById('fast-build'); if (elFast) elFast.checked = this.config.fastCompile;
    const elVerb = document.getElementById('verbose-output') || document.getElementById('verbose'); if (elVerb) elVerb.checked = this.config.verboseOutput;
    const elClean = document.getElementById('clean-build') || document.getElementById('clean'); if (elClean) elClean.checked = this.config.cleanBuild;
    }

    updateConfig(key, value) {
        this.config[key] = value;
        this.saveConfig();
    }

    loadConfig() {
        this.socket.emit('load_config');
    }

    saveConfig() {
        this.socket.emit('save_config', this.config);
    }

    refreshComPorts() {
        this.socket.emit('get_com_ports');
        this.log('Refreshing COM ports...', 'info');
    }

    // Serial port helpers (server-backed)
    async refreshSerialPorts() {
        try {
            const res = await fetch('/api/serial/list');
            const json = await res.json();
            if (json.success && Array.isArray(json.ports)) {
                const select = document.getElementById('serial-port-select');
                if (!select) return;
                select.innerHTML = '';
                // track available ports for UI logic
                this._availableSerialPorts = json.ports || [];
                json.ports.forEach(p => {
                    const opt = document.createElement('option');
                    opt.value = p.path || p.comName || p.path;
                    opt.textContent = p.path || p.comName || p.path;
                    select.appendChild(opt);
                });
                this.log('Serial ports refreshed', 'info');
                try { this._updateFlashEraseButtons(); } catch (e) { }
            } else {
                this.log('No serial ports returned', 'warning');
                this._availableSerialPorts = [];
                try { this._updateFlashEraseButtons(); } catch (e) { }
            }
        } catch (err) {
            this.log(`Error refreshing serial ports: ${err.message}`, 'error');
        }
    }

    async openSerialPort() {
        const select = document.getElementById('serial-port-select');
        if (!select) return;
        const portPath = select.value;
        try {
            const res = await fetch('/api/serial/open', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: portPath, baudRate: 115200 }) });
            const j = await res.json();
            if (j.success) {
                this.log(`Opened serial ${portPath}`, 'success');
            } else {
                this.log(`Failed to open serial: ${j.error || 'unknown'}`, 'error');
            }
        } catch (err) {
            this.log(`Error opening serial port: ${err.message}`, 'error');
        }
    }

    async closeSerialPort() {
        const select = document.getElementById('serial-port-select');
        if (!select) return;
        const portPath = select.value;
        try {
            const res = await fetch('/api/serial/close', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: portPath }) });
            const j = await res.json();
            if (j.success) {
                this.log(`Closed serial ${portPath}`, 'success');
            } else {
                this.log(`Failed to close serial: ${j.error || 'unknown'}`, 'error');
            }
        } catch (err) {
            this.log(`Error closing serial port: ${err.message}`, 'error');
        }
    }

    async sendSerial() {
        const select = document.getElementById('serial-port-select');
        const input = document.getElementById('serial-send');
        if (!select || !input) return;
        const portPath = select.value;
        const data = input.value || '';
        try {
            const res = await fetch('/api/serial/write', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: portPath, data }) });
            const j = await res.json();
            if (j.success) {
                this.log(`Sent to ${portPath}: ${data}`, 'info');
            } else {
                this.log(`Failed to send: ${j.error || 'unknown'}`, 'error');
            }
        } catch (err) {
            this.log(`Error sending serial data: ${err.message}`, 'error');
        }
    }

    updateUI() {
        this.updateConnectionStatus();
        this.updateButtons();
        this.refreshComPorts();
    try { this._updateFlashEraseButtons(); } catch (e) { }
    this.attachToWindow();
        // populate advanced pages list if present on page
        try { this.renderAdvancedPages(); } catch (e) { /* ignore when element missing */ }
    }

    async renderAdvancedPages() {
        const container = document.getElementById('advanced-list');
        if (!container) return;
        container.textContent = 'Loading...';
        try {
            const res = await fetch('/wwwroot-list');
            const j = await res.json();
            if (!j.success) { container.textContent = 'No advanced pages found'; return; }
            const files = j.files || [];
            if (files.length === 0) { container.textContent = 'No advanced pages found'; return; }
            container.innerHTML = '';
            // show a few useful pages (index.html, dashboard.html, settings.html, flasher.html)
            const preferred = ['dashboard.html','index.html','settings.html','flasher.html','flasher.html','menu.html','updates.html'];
            const shown = new Set();
            const addLink = (f) => {
                if (shown.has(f)) return; shown.add(f);
                const a = document.createElement('a');
                a.href = '/' + f.replace(/\\\\/g, '/');
                a.textContent = f;
                a.target = '_blank';
                a.style.display = 'block';
                container.appendChild(a);
            };

            // add preferred first if present
            preferred.forEach(p => { if (files.includes(p)) addLink(p); });
            // then add remaining (limit to 20)
            files.slice(0, 50).forEach(f => addLink(f));
        } catch (err) {
            container.textContent = `Error: ${err.message}`;
        }
    }

    // Read current form values (prefer DOM values, fallback to this.config)
    getFormConfig() {
        const get = (id, fallback) => {
            const el = document.getElementById(id);
            if (!el) return fallback;
            if (el.type === 'checkbox') return el.checked;
            return el.value !== undefined ? el.value : fallback;
        };

        return {
            environment: get('environment', this.config.environment || 'OutdoorAP'),
            comPort: get('com-port', this.config.comPort || 'COM10'),
            baudRate: parseInt(get('baud-rate', this.config.baudRate || '921600')) || 921600,
            jobs: parseInt(get('jobs', this.config.jobs || '0')) || 0,
            fastBuild: get('fast-build', this.config.fastCompile || false),
            clean: get('clean-build', this.config.cleanBuild || false),
            verbose: get('verbose', this.config.verboseOutput || false),
            filesystemOnly: get('filesystem-only', false),
            skipUpload: get('skip-upload', false),
            monitor: get('monitor', false)
        };
    }

    // Build an args array suitable for passing to compile.ps1 based on formConfig and overrides
    buildCompileArgs(formConfig, overrides = {}) {
        const cfg = Object.assign({}, formConfig, overrides);
        const args = [];

        if (cfg.environment) { args.push('-Environment', cfg.environment); }
        if (cfg.comPort) { args.push('-ComPort', cfg.comPort); }
        if (cfg.baudRate) { args.push('-BaudRate', cfg.baudRate.toString()); }
        if (cfg.jobs && parseInt(cfg.jobs) > 0) { args.push('-Jobs', cfg.jobs.toString()); }

        if (cfg.fastBuild) args.push('-FastBuild');
        if (cfg.clean) args.push('-Clean');
        if (cfg.verbose) args.push('-Verbose');
        if (cfg.filesystemOnly) args.push('-FilesystemOnly');
        if (cfg.skipUpload) args.push('-SkipUpload');
        if (cfg.monitor) args.push('-Monitor');

        return args;
    }

    // Build and Flash Operations
    compile() {
        if (this.currentProcess) return;

        this.log('Starting compilation...', 'info');
        this.showProgress('Compiling...');
        this.currentProcess = 'compile';
        this.updateButtons();

    const script = this.config.fastCompile ? 'fast_compile.py' : 'compile.py';
        const args = [];

        if (this.config.cleanBuild) args.push('-Clean');
        if (this.config.verboseOutput) args.push('-Verbose');

        this.socket.emit('run_script', { script, args });
    }

    fastCompile() {
        if (this.currentProcess) return;

        this.log('Starting fast compilation...', 'info');
        this.showProgress('Fast compiling...');
        this.currentProcess = 'fast_compile';
        this.updateButtons();

    this.socket.emit('run_script', { script: 'fast_compile.py', args: [] });
    }

    flash() {
        if (this.currentProcess) return;

        this.log(`Flashing to ${this.config.comPort}...`, 'info');
        this.showProgress('Flashing...');
        this.currentProcess = 'flash';
        this.updateButtons();

        this.socket.emit('run_script', {
            script: 'compile.py',
            args: ['-Flash', '-Port', this.config.comPort]
        });
    }

    monitor() {
        if (this.currentProcess) return;

        this.log(`Starting serial monitor on ${this.config.comPort}...`, 'info');
        this.showProgress('Monitoring...');
        this.currentProcess = 'monitor';
        this.updateButtons();

        this.socket.emit('run_command', {
            command: 'pio',
            args: ['device', 'monitor', '--port', this.config.comPort, '--baud', '115200']
        });
    }

    // Generic handler for .btn[data-action]
    handleActionButton(action) {
        const formCfg = this.getFormConfig();

        switch (action) {
            case 'build': {
                const args = this.buildCompileArgs(formCfg, { skipUpload: true });
                this.log('Starting build (compile.ps1)...', 'info');
                this.showProgress('Building...');
                this.currentProcess = 'build';
                this.updateButtons();
                this.socket.emit('run_script', { script: 'compile.py', args });
                break;
            }
            case 'upload': {
                const args = this.buildCompileArgs(formCfg, { skipBuild: true });
                this.log('Starting upload (compile.ps1)...', 'info');
                this.showProgress('Uploading...');
                this.currentProcess = 'upload';
                this.updateButtons();
                this.socket.emit('run_script', { script: 'compile.py', args });
                break;
            }
            case 'build-upload': {
                const args = this.buildCompileArgs(formCfg, {});
                this.log('Starting build + upload (compile.ps1)...', 'info');
                this.showProgress('Building & Uploading...');
                this.currentProcess = 'build-upload';
                this.updateButtons();
                this.socket.emit('run_script', { script: 'compile.py', args });
                break;
            }
            case 'fast-build': {
                const args = this.buildCompileArgs(formCfg, { fastBuild: true });
                this.log('Starting fast build (compile.ps1)...', 'info');
                this.showProgress('Fast building...');
                this.currentProcess = 'fast-build';
                this.updateButtons();
                this.socket.emit('run_script', { script: 'fast_compile.py', args });
                break;
            }
            case 'clean': {
                const args = this.buildCompileArgs(formCfg, { clean: true, skipUpload: true });
                this.log('Starting clean (compile.ps1)...', 'info');
                this.showProgress('Cleaning...');
                this.currentProcess = 'clean';
                this.updateButtons();
                this.socket.emit('run_script', { script: 'compile.py', args });
                break;
            }
            case 'monitor': {
                // Use existing monitor method
                this.monitor();
                break;
            }
            case 'monitor-com13': {
                if (this.currentProcess) return;

                this.log('Starting serial monitor on COM13...', 'info');
                this.showProgress('Monitoring COM13...');
                this.currentProcess = 'monitor-com13';
                this.updateButtons();

                this.socket.emit('run_command', {
                    command: 'pio',
                    args: ['device', 'monitor', '--port', 'COM13', '--baud', '115200']
                });
                break;
            }
            case 'configure-wifi': {
                this.wifiConfig();
                break;
            }
            case 'validate-config': {
                this.validateConfig();
                break;
            }
            default: {
                this.log(`Unknown action: ${action}`, 'warning');
            }
        }
    }

    buildFS() {
        if (this.currentProcess) return;

        this.log('Building filesystem...', 'info');
        this.showProgress('Building filesystem...');
        this.currentProcess = 'build_fs';
        this.updateButtons();

        this.socket.emit('run_command', {
            command: 'pio',
            args: ['run', '--target', 'buildfs']
        });
    }

    flashFS() {
        if (this.currentProcess) return;

        this.log(`Flashing filesystem to ${this.config.comPort}...`, 'info');
        this.showProgress('Flashing filesystem...');
        this.currentProcess = 'flash_fs';
        this.updateButtons();

        this.socket.emit('run_command', {
            command: 'pio',
            args: ['run', '--target', 'uploadfs', '--upload-port', this.config.comPort]
        });
    }

    clean() {
        if (this.currentProcess) return;

        this.log('Cleaning build...', 'info');
        this.showProgress('Cleaning...');
        this.currentProcess = 'clean';
        this.updateButtons();

        this.socket.emit('run_command', {
            command: 'pio',
            args: ['run', '--target', 'clean']
        });
    }

    eraseFlash() {
        if (this.currentProcess) return;

        if (!confirm('This will erase all data on the ESP32. Continue?')) {
            return;
        }

        this.log(`Erasing flash on ${this.config.comPort}...`, 'warning');
        this.showProgress('Erasing flash...');
        this.currentProcess = 'erase';
        this.updateButtons();

        this.socket.emit('run_command', {
            command: 'esptool.py',
            args: ['--chip', 'esp32s3', '--port', this.config.comPort, 'erase_flash']
        });
    }

    // WiFi and Network Operations
    wifiConfig() {
        if (this.currentProcess) return;

        if (!this.config.wifiSSID || !this.config.wifiPassword) {
            alert('Please set WiFi SSID and password in the configuration panel');
            return;
        }

        this.log(`Configuring WiFi: ${this.config.wifiSSID}`, 'info');
        this.showProgress('Configuring WiFi...');
        this.currentProcess = 'wifi_config';
        this.updateButtons();

        this.socket.emit('run_script', {
            script: 'configure_wifi.py',
            args: ['-SSID', this.config.wifiSSID, '-Password', this.config.wifiPassword]
        });
    }

    otaUpdate() {
        if (this.currentProcess) return;

        this.log('Starting OTA update...', 'info');
        this.showProgress('OTA updating...');
        this.currentProcess = 'ota';
        this.updateButtons();

    this.socket.emit('run_script', { script: 'simple_upload.py', args: [] });
    }

    testNetwork() {
        if (this.currentProcess) return;

        this.log('Testing network connectivity...', 'info');
        this.showProgress('Testing network...');
        this.currentProcess = 'test_network';
        this.updateButtons();

    this.socket.emit('run_script', { script: 'test_network_connectivity.py', args: [] });
    }

    // C6 Management Methods
    getC6Host() {
        return document.getElementById('c6-host').value.trim();
    }

    async deviceRequest(host, path, options = {}) {
        // Normalize path
        if (path && !path.startsWith('/')) path = '/' + path;

        // Prefer explicit host parameter (if provided)
        if (host && host.trim()) {
            const hostStr = host.trim();
            const url = hostStr.startsWith('http') ? `${hostStr}${path}` : `http://${hostStr}${path}`;
            const fetchOptions = { method: options.method || 'GET' };
            if (options.body) {
                fetchOptions.body = options.body;
                if (options.headers) fetchOptions.headers = options.headers;
            }
            const res = await fetch(url, fetchOptions);
            return res;
        }

        // If the main app has a remote configured and connected, use it
        const app = window.app;
        const remoteCfg = app && app.remoteConfig ? app.remoteConfig : null;

        let url;
        if (remoteCfg && remoteCfg.enabled && remoteCfg.connected) {
            const hostPart = (remoteCfg.host || '127.0.0.1').replace(/\/$/, '');
            const portPart = remoteCfg.port ? `:${remoteCfg.port}` : '';
            url = `http://${hostPart}${portPart}${path}`;
        } else {
            // Default to server-side proxy at /device
            url = `/device${path}`;
        }

        const fetchOptions = { method: options.method || 'GET' };
        if (options.body) {
            fetchOptions.body = options.body;
            if (options.headers) fetchOptions.headers = options.headers;
        }

        const res = await fetch(url, fetchOptions);
        return res;
    }

    async testC6Connection() {
        const host = this.getC6Host();
        this.log('Testing C6 connection...', 'info');

        try {
            const res = await this.deviceRequest(host, '/test_c6_connection');
            const data = await res.json();
            this.log(`C6 connection test: ${JSON.stringify(data)}`, data.connected ? 'success' : 'warning');
        } catch (err) {
            this.log(`C6 connection test failed: ${err.message}`, 'error');
        }
    }

    async testC6Radio() {
        const host = this.getC6Host();
        this.log('Testing C6 radio...', 'info');

        try {
            const res = await this.deviceRequest(host, '/test_c6_radio');
            const data = await res.json();
            this.log(`C6 radio test: ${JSON.stringify(data)}`, data.success ? 'success' : 'warning');
        } catch (err) {
            this.log(`C6 radio test failed: ${err.message}`, 'error');
        }
    }

    async restartC6() {
        const host = this.getC6Host();
        if (!confirm('Restart C6 device now?')) return;

        this.log('Restarting C6...', 'info');
        try {
            const res = await this.deviceRequest(host, '/restart_c6', { method: 'POST' });
            const data = await res.json();
            this.log(`C6 restart: ${JSON.stringify(data)}`, data.success ? 'success' : 'warning');
        } catch (err) {
            this.log(`C6 restart failed: ${err.message}`, 'error');
        }
    }

    async uploadC6Firmware() {
        const host = this.getC6Host();
        const fileInput = document.getElementById('c6-firmware-file');
        const status = document.getElementById('c6-upload-status');

        if (!fileInput || fileInput.files.length === 0) {
            alert('Choose a .bin file to upload');
            return;
        }

        const file = fileInput.files[0];
        status.textContent = `Uploading ${file.name}...`;

        // Upload to the local web-ui server which will host the firmware
        const form = new FormData();
        // server expects the field name 'firmware'
        form.append('firmware', file, file.name);

        try {
            const res = await fetch('/api/firmware/upload', { method: 'POST', body: form });
            const data = await res.json();
            if (data.success && data.path) {
                // Build a hosted URL (relative) so user can confirm
                const hosted = `${window.location.origin}/${data.path}`;
                status.innerHTML = `Upload complete: <a href="${hosted}" target="_blank">${data.filename || file.name}</a>`;
                this.log(`C6 firmware uploaded: ${data.filename || file.name}`, 'success');
                // store uploaded path for later triggering
                this._lastUploadedC6Firmware = data.path;
            } else {
                status.textContent = `Upload error: ${data.error || 'unknown'}`;
                this.log(`C6 upload failed: ${JSON.stringify(data)}`, 'error');
            }
        } catch (err) {
            status.textContent = `Upload failed: ${err.message}`;
            this.log(`C6 upload failed: ${err.message}`, 'error');
        }
    }

    async triggerC6Flash() {
        const host = this.getC6Host();
        const status = document.getElementById('c6-upload-status');
        if (!confirm('Trigger OTA flash on C6 (uses previously uploaded image hosted on this server)?')) return;

        // prefer the stored upload path if present
        const firmwarePath = this._lastUploadedC6Firmware || null;
        if (!firmwarePath) {
            status.textContent = 'No uploaded firmware found. Upload first.';
            this.log('No uploaded firmware found. Please upload a .bin before triggering OTA.', 'warning');
            return;
        }

        const hosted = `${window.location.origin}/${firmwarePath}`;
        status.innerHTML = `Triggering C6 flash using <a href="${hosted}" target="_blank">${hosted}</a>...`;

        try {
            const resp = await fetch('/api/firmware/trigger', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ host: host || undefined, firmwarePath })
            });

            const data = await resp.json();
            if (data.success) {
                status.textContent = `Flash started: ${data.deviceResponse ? JSON.stringify(data.deviceResponse) : 'OK'}`;
                this.log(`C6 flash triggered via server: ${JSON.stringify(data.deviceResponse)}`, 'success');
            } else {
                status.textContent = `Flash error: ${data.error || 'unknown'}`;
                this.log(`C6 flash error: ${JSON.stringify(data)}`, 'error');
            }
        } catch (err) {
            status.textContent = `Flash failed: ${err.message}`;
            this.log(`C6 flash failed: ${err.message}`, 'error');
        }
    }

    validateConfig() {
        if (this.currentProcess) return;

        this.log('Validating configuration...', 'info');
        this.showProgress('Validating...');
        this.currentProcess = 'validate';
        this.updateButtons();

        this.socket.emit('run_command', {
            command: 'python',
            args: ['validate_config.py']
        });
    }

    // Process Control
    stopProcess() {
        if (!this.currentProcess) return;

        this.log('Stopping current process...', 'warning');
        this.socket.emit('stop_process');
        this.currentProcess = null;
        this.updateButtons();
        this.hideProgress();
    }

    // Console Operations
    log(message, type = 'info') {
        const console = document.getElementById('console');
        const line = document.createElement('div');
        line.className = `console-line ${type}`;

        const timestamp = new Date().toLocaleTimeString();
        line.textContent = `[${timestamp}] ${message}`;

        console.appendChild(line);
        console.scrollTop = console.scrollHeight;

        // Limit console lines
        const lines = console.querySelectorAll('.console-line');
        if (lines.length > 1000) {
            lines[0].remove();
        }
        // Also keep a buffer copy for saving/exporting logs
        try {
            this.logBuffer.push({ ts: new Date().toISOString(), type, message });
            // Keep buffer reasonable
            if (this.logBuffer.length > 5000) this.logBuffer.shift();
        } catch (e) { /* ignore */ }
    }

    saveLog() {
        // Create a plain text log from buffer and trigger download
        try {
            if (!this.logBuffer || this.logBuffer.length === 0) {
                alert('No log data to save');
                return;
            }

            const lines = this.logBuffer.map(entry => `[${entry.ts}] [${entry.type}] ${entry.message}`);
            const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `oepl-webui-log-${new Date().toISOString().replace(/[:.]/g,'-')}.txt`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
        } catch (err) {
            this.log(`Error saving log: ${err.message}`, 'error');
        }
    }

    clearConsole() {
        const console = document.getElementById('console');
        console.innerHTML = '';
        this.log('Console cleared', 'info');
    }

    // Progress Modal
    showProgress(text) {
        const modal = document.getElementById('progress-modal');
        const progressText = document.getElementById('progress-text');
        const progressFill = document.querySelector('.progress-fill');

        progressText.textContent = text;
        progressFill.style.width = '0%';
        modal.style.display = 'block';

        // Simulate progress
        let progress = 0;
        this.progressInterval = setInterval(() => {
            progress += Math.random() * 15;
            if (progress > 90) progress = 90;
            progressFill.style.width = progress + '%';
        }, 500);
    }

    hideProgress() {
        const modal = document.getElementById('progress-modal');
        modal.style.display = 'none';

        if (this.progressInterval) {
            clearInterval(this.progressInterval);
            this.progressInterval = null;
        }
    }

    updateProgress(percent, text) {
        const progressFill = document.querySelector('.progress-fill');
        const progressText = document.getElementById('progress-text');

        progressFill.style.width = percent + '%';
        if (text) progressText.textContent = text;
    }

    // AI Integration Methods
    updateAIStatus() {
        // Add AI status indicator to sidebar if not exists
        let statusIndicator = document.getElementById('ai-status-indicator');
        if (!statusIndicator) {
            statusIndicator = document.createElement('div');
            statusIndicator.id = 'ai-status-indicator';
            statusIndicator.className = 'ai-status-indicator';

            const configPanel = document.querySelector('.config-panel');
            configPanel.appendChild(statusIndicator);
        }

        if (this.aiAvailable) {
            statusIndicator.className = 'ai-status-indicator available';
            statusIndicator.innerHTML = '<i class="fas fa-robot"></i> AI Assistant Available';
        } else {
            statusIndicator.className = 'ai-status-indicator unavailable';
            statusIndicator.innerHTML = '<i class="fas fa-robot"></i> AI Assistant Unavailable';
        }
    }

    analyzeProject() {
        if (!this.aiAvailable) {
            alert('AI Assistant is not configured. Please set up your API keys in AI Config.');
            return;
        }

        this.log('Requesting AI project analysis...', 'info');
        this.socket.emit('ai-analyze-project');
    }

    showProjectAnalysis(data) {
        this.log('AI Project Analysis completed', 'success');

        // Show analysis in a dedicated panel
        this.showAIAnalysisPanel('Project Analysis', data.analysis);
    }

    toggleAIChat() {
        if (!this.aiAvailable) {
            alert('AI Assistant is not configured. Please set up your API keys in AI Config.');
            return;
        }

        const modal = document.getElementById('ai-chat-modal');
        modal.style.display = modal.style.display === 'block' ? 'none' : 'block';
    }

    sendAIMessage() {
        const input = document.getElementById('ai-input');
        const message = input.value.trim();

        if (!message) return;

        this.addAIMessage(message, 'user');
        input.value = '';

        // Show thinking indicator
        this.addAIMessage('Thinking...', 'thinking');

        const messageId = Date.now().toString();
        this.socket.emit('ai-chat', {
            messageId,
            message,
            context: {
                currentConfig: this.config,
                currentProcess: this.currentProcess
            }
        });
    }

    addAIMessage(content, type) {
        const messagesContainer = document.getElementById('ai-chat-messages');
        const messageDiv = document.createElement('div');

        if (type === 'thinking') {
            messageDiv.className = 'ai-thinking';
            messageDiv.innerHTML = content;
            messageDiv.id = 'ai-thinking-message';

            // Remove any existing thinking message
            const existing = document.getElementById('ai-thinking-message');
            if (existing) existing.remove();
        } else {
            messageDiv.className = `ai-message ${type}`;

            const timeDiv = document.createElement('div');
            timeDiv.className = 'message-time';
            timeDiv.textContent = new Date().toLocaleTimeString();

            const contentDiv = document.createElement('div');
            contentDiv.className = 'message-content';
            contentDiv.innerHTML = this.formatAIMessage(content);

            messageDiv.appendChild(timeDiv);
            messageDiv.appendChild(contentDiv);

            // Remove thinking message if this is an assistant response
            if (type === 'assistant') {
                const thinking = document.getElementById('ai-thinking-message');
                if (thinking) thinking.remove();
            }
        }

        messagesContainer.appendChild(messageDiv);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    formatAIMessage(content) {
        // Basic markdown-like formatting
        let formatted = content;

        // Code blocks
        formatted = formatted.replace(/```(\w+)?\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>');

        // Inline code
        formatted = formatted.replace(/`([^`]+)`/g, '<code>$1</code>');

        // Bold
        formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

        // Italic
        formatted = formatted.replace(/\*(.*?)\*/g, '<em>$1</em>');

        // Line breaks
        formatted = formatted.replace(/\n/g, '<br>');

        return formatted;
    }

    getAISuggestions() {
        if (!this.aiAvailable) {
            alert('AI Assistant is not configured. Please set up your API keys in AI Config.');
            return;
        }

        const input = prompt('What would you like suggestions for?', 'optimize build performance');
        if (!input) return;

        this.log('Getting AI suggestions...', 'info');

        fetch('/api/ai/suggestions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                input,
                projectState: {
                    config: this.config,
                    currentProcess: this.currentProcess
                }
            })
        })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    this.showAISuggestions(data.suggestions);
                } else {
                    this.log(`AI Suggestions error: ${data.error}`, 'error');
                }
            })
            .catch(error => {
                this.log(`Error getting AI suggestions: ${error.message}`, 'error');
            });
    }

    showAISuggestions(suggestions) {
        if (suggestions.length === 0) {
            this.log('No AI suggestions available', 'info');
            return;
        }

        let suggestionsHTML = '<h4><i class="fas fa-lightbulb"></i> AI Suggestions</h4>';

        suggestions.forEach(suggestion => {
            suggestionsHTML += `
                <div class="ai-suggestion-item" onclick="alert('Implement: ${suggestion.action}')">
                    <div class="priority ${suggestion.priority}">${suggestion.priority.toUpperCase()}</div>
                    <div><strong>${suggestion.action}</strong></div>
                    <div>${suggestion.description}</div>
                </div>
            `;
        });

        this.showAIAnalysisPanel('AI Suggestions', suggestionsHTML);
    }

    showAIConfig() {
        const modal = document.getElementById('ai-config-modal');
        modal.style.display = 'block';

        // Load current AI config
        this.loadAIConfigUI();
    }

    loadAIConfigUI() {
        if (!this.aiConfig) return;

        document.getElementById('openai-key').value = this.aiConfig.openai.apiKey === '***' ? '' : this.aiConfig.openai.apiKey;
        document.getElementById('openai-model').value = this.aiConfig.openai.model;
        document.getElementById('openai-enabled').checked = this.aiConfig.openai.enabled;

        document.getElementById('anthropic-key').value = this.aiConfig.anthropic.apiKey === '***' ? '' : this.aiConfig.anthropic.apiKey;
        document.getElementById('anthropic-model').value = this.aiConfig.anthropic.model;
        document.getElementById('anthropic-enabled').checked = this.aiConfig.anthropic.enabled;

        document.getElementById('feature-error-diagnosis').checked = this.aiConfig.features.errorDiagnosis;
        document.getElementById('feature-code-analysis').checked = this.aiConfig.features.codeAnalysis;
        document.getElementById('feature-optimization').checked = this.aiConfig.features.buildOptimization;
        document.getElementById('feature-suggestions').checked = this.aiConfig.features.autoSuggestions;
    }

    saveAIConfig() {
        const config = {
            openai: {
                apiKey: document.getElementById('openai-key').value,
                model: document.getElementById('openai-model').value,
                enabled: document.getElementById('openai-enabled').checked
            },
            anthropic: {
                apiKey: document.getElementById('anthropic-key').value,
                model: document.getElementById('anthropic-model').value,
                enabled: document.getElementById('anthropic-enabled').checked
            },
            features: {
                errorDiagnosis: document.getElementById('feature-error-diagnosis').checked,
                codeAnalysis: document.getElementById('feature-code-analysis').checked,
                buildOptimization: document.getElementById('feature-optimization').checked,
                autoSuggestions: document.getElementById('feature-suggestions').checked
            }
        };

        fetch('/api/ai/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(config)
        })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    this.log('AI configuration saved', 'success');
                    this.aiConfig = data.config;
                    this.aiAvailable = config.openai.enabled || config.anthropic.enabled;
                    this.updateAIStatus();
                    document.getElementById('ai-config-modal').style.display = 'none';
                } else {
                    this.log(`AI config error: ${data.error}`, 'error');
                }
            })
            .catch(error => {
                this.log(`Error saving AI config: ${error.message}`, 'error');
            });
    }

    testAIConnection() {
        this.log('Testing AI connection...', 'info');

        fetch('/api/ai/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message: 'Hello, can you help with ESP32 development?',
                context: { type: 'connection_test' }
            })
        })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    this.log('AI connection test successful', 'success');
                    alert('AI connection is working!');
                } else {
                    this.log(`AI connection test failed: ${data.error}`, 'error');
                    alert(`AI connection failed: ${data.error}`);
                }
            })
            .catch(error => {
                this.log(`AI connection test error: ${error.message}`, 'error');
                alert(`Connection test error: ${error.message}`);
            });
    }

    showAIAnalysis(data) {
        this.log('AI Error Analysis available', 'info');
        this.showAIAnalysisPanel('Error Analysis', data.analysis);
    }

    showAIAnalysisPanel(title, content) {
        // Create or update AI analysis panel
        let panel = document.getElementById('ai-analysis-panel');
        if (!panel) {
            panel = document.createElement('div');
            panel.id = 'ai-analysis-panel';
            panel.className = 'ai-analysis-panel';

            const mainContent = document.querySelector('.main-content');
            mainContent.appendChild(panel);
        }

        panel.innerHTML = `
            <h4><i class="fas fa-robot"></i> ${title}</h4>
            <div class="ai-analysis-content">${this.formatAIMessage(content)}</div>
        `;

        // Scroll to the panel
        panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new ESP32DevUI();
});

// Add some utility functions
window.ESP32DevUtils = {
    // fallback remoteConfig used when `window.app` is not present on the page
    _remoteConfigFallback: {
        enabled: false,
        host: '',
        port: 0,
        user: '',
        connected: false
    },

    formatBytes: (bytes, decimals = 2) => {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    },

    formatTime: (seconds) => {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = Math.floor(seconds % 60);
        return h > 0 ? `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
            : `${m}:${s.toString().padStart(2, '0')}`;
    },

    copyToClipboard: async (text) => {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch (err) {
            console.error('Failed to copy text: ', err);
            return false;
        }
    },

    // Helper to get the authoritative remoteConfig (app-level if present, else fallback)
    getRemoteConfig() {
        return (window.app && window.app.remoteConfig) ? window.app.remoteConfig : this._remoteConfigFallback;
    },

    // Toggle remote server usage (updates app.remoteConfig when available)
    toggleRemoteServer(enabled) {
        const cfg = this.getRemoteConfig();
        cfg.enabled = !!enabled;

        const remoteOptions = document.getElementById('remote-options');
        if (remoteOptions) remoteOptions.style.display = enabled ? 'block' : 'none';

        if (enabled) {
            // run a test connection immediately
            this.testRemoteConnection();
        } else {
            this.updateRemoteStatus('Not Connected', false);
        }

        // mirror to window.app if present
        if (window.app) window.app.remoteConfig = cfg;
    },

    updateRemoteConfig(key, value) {
        const cfg = this.getRemoteConfig();
        cfg[key] = value;
        console.log(`Remote config updated: ${key} = ${value}`);

        // mirror to window.app if present
        if (window.app) window.app.remoteConfig = cfg;
    },

    async testRemoteConnection() {
        const cfg = this.getRemoteConfig();
        const statusEl = document.getElementById('remote-status');
        const button = document.getElementById('test-connection');

        if (button) {
            button.disabled = true;
            button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Testing...';
        }

        try {
            const response = await fetch('/api/remote/test-connection', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ host: cfg.host, port: cfg.port, user: cfg.user })
            });

            const result = await response.json();

            if (result.success) {
                if (window.app) window.app.remoteConfig.connected = true;
                this.updateRemoteStatus('Connected', true);
                cfg.connected = true;
                // If app present, reconnect socket to use remote endpoint
                try { if (window.app && typeof window.app.reconnectSocket === 'function') window.app.reconnectSocket(); } catch (e) { /* ignore */ }
            } else {
                if (window.app) window.app.remoteConfig.connected = false;
                this.updateRemoteStatus(`Error: ${result.error}`, false);
                cfg.connected = false;
                // Ensure socket falls back to local when remote test fails
                try { if (window.app && typeof window.app.reconnectSocket === 'function') window.app.reconnectSocket(); } catch (e) { /* ignore */ }
            }
        } catch (error) {
            if (window.app) window.app.remoteConfig.connected = false;
            this.updateRemoteStatus(`Connection failed: ${error.message}`, false);
            cfg.connected = false;
            // Ensure socket falls back to local on error
            try { if (window.app && typeof window.app.reconnectSocket === 'function') window.app.reconnectSocket(); } catch (e) { /* ignore */ }
        } finally {
            if (button) {
                button.disabled = false;
                button.innerHTML = '<i class="fas fa-plug"></i> Test Connection';
            }
        }

        // mirror to fallback/app as needed
        if (!window.app) this._remoteConfigFallback = cfg;
    },

    updateRemoteStatus(text, connected) {
        const statusEl = document.getElementById('remote-status');
        if (!statusEl) return;
        const textEl = statusEl.querySelector('.status-text');
        if (textEl) textEl.textContent = text;

        statusEl.className = `status-indicator ${connected ? 'connected' : 'disconnected'}`;
    },

    isUsingRemoteServer() {
        const cfg = this.getRemoteConfig();
        return !!(cfg && cfg.enabled && cfg.connected);
    }
};

// Modal control functions
function closeAIChat() {
    const el = document.getElementById('ai-chat-modal');
    if (el) el.style.display = 'none';
}

function closeAIConfig() {
    const el = document.getElementById('ai-config-modal');
    if (el) el.style.display = 'none';
}

function openBuildFolder() {
    // This would need to be implemented on the server side
    alert('Build folder opening functionality would be implemented server-side');
}
