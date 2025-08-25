class ESP32DevUI {
    constructor() {
        this.socket = null;
        this.connected = false;
        this.currentProcess = null;
        this.aiAvailable = false;
        this.aiConfig = null;
    this.logBuffer = [];
    // device manager state
    this.devices = [];
    this.selectedDeviceId = null;
        this.config = {
            comPort: 'COM10',
            wifiSSID: '',
            wifiPassword: '',
            fastCompile: false,
            verboseOutput: false,
            cleanBuild: false,
            manualComOnly: false,
            allowedComPort: 'COM10'
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
    this.initDeviceManager();
        this.updateUI();
    // ensure COM header and device form are populated like Simple Flasher
    try { this.refreshPorts(); } catch (e) {}
    // if Serial Console is present on the page, populate its port list once
    try { if (document.getElementById('serial-port-select')) this.refreshSerialPorts(); } catch (e) {}
    // initialize artifacts UI when present
    try { this.initArtifactsPanel(); } catch (e) { /* ignore if not on this page */ }

    // Start API health checks after a short delay
        setTimeout(() => {
            this.startApiHealthChecks();
        }, 1000);

        // If on AI page, initialize code editing file list
        setTimeout(() => {
            try { this.initAICodeEditing(); } catch (_) {}
        }, 300);
    }

    // Central client logger: writes to on-page console and posts to server asynchronously
    log(message, type = 'info') {
        const consoleEl = document.getElementById('console');
        const ts = new Date().toLocaleTimeString();
        const text = `[${ts}] ${typeof message === 'string' ? message : JSON.stringify(message)}`;

        if (consoleEl) {
            const line = document.createElement('div');
            line.className = `console-line ${type}`;
            line.textContent = text;
            consoleEl.appendChild(line);
            consoleEl.scrollTop = consoleEl.scrollHeight;
            const lines = consoleEl.querySelectorAll('.console-line');
            if (lines.length > 1000) lines[0]?.remove();
        } else {
            // fallback to browser console
            try { console[type === 'error' ? 'error' : type === 'warning' ? 'warn' : 'log'](text); } catch (_) { }
        }

        try {
            this.logBuffer.push({ ts: new Date().toISOString(), type, message: typeof message === 'string' ? message : JSON.stringify(message) });
            if (this.logBuffer.length > 5000) this.logBuffer.shift();
        } catch (e) { /* ignore */ }

        // Fire-and-forget post to server log aggregator
        try {
            fetch('/api/log', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: 'client', message: `${type.toUpperCase()}: ${typeof message === 'string' ? message : JSON.stringify(message)}` })
            }).catch(() => {});
        } catch (_) { }
    }

    // Initialize socket.io connection. Chooses remote server when configured and connected,
    // otherwise connects to same-origin server. Guards if socket.io client is missing.
    initSocket() {
        if (typeof io === 'undefined') {
            console.warn('socket.io client (io) not found on the page; socket features disabled');
            return;
        }
      // Inline SVG icon set (monochrome, inherits currentColor)
                const icons = {
                    select: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M9.6 16.2 5.3 12l1.4-1.4 2.9 2.9 7.7-7.7 1.4 1.4z"/></svg>',
                    edit: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zm14.71-10.04c.19-.19.29-.44.29-.71 0-.27-.1-.52-.29-.71l-2.5-2.5a1.003 1.003 0 0 0-1.42 0l-1.83 1.83 3.75 3.75 1.79-1.66z"/></svg>',
                    ping: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M12 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm6.36-2.05 1.42 1.42C21.3 17.85 22 15.49 22 13c0-2.49-.7-4.85-2.22-6.36l-1.42 1.42A8.94 8.94 0 0 1 20 13c0 2.03-.76 3.91-1.64 4.95ZM4.22 6.64 2.8 5.22A10.94 10.94 0 0 0 2 13c0 2.49.7 4.85 2.22 6.36l1.42-1.42A8.94 8.94 0 0 1 4 13c0-2.03.76-3.91 1.64-5.95Zm12.02-.95L14.83 9.1A4.02 4.02 0 0 1 16 13a4 4 0 0 1-8 0c0-.88.29-1.69.77-2.36L7.76 9.63A5.98 5.98 0 0 0 6 13a6 6 0 0 0 12 0c0-1.63-.62-3.11-1.76-4.31Z"/></svg>',
                    delete: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6v12ZM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4Z"/></svg>',
                    adv: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M12 15.5A3.5 3.5 0 1 1 12 8.5a3.5 3.5 0 0 1 0 7Zm7.94-2.81-.82-.63c.05-.35.08-.71.08-1.06 0-.36-.03-.72-.08-1.06l.82-.63c.18-.14.23-.39.12-.6l-.75-1.3a.5.5 0 0 0-.58-.22l-.96.36c-.55-.47-1.17-.84-1.85-1.1l-.15-1.02a.5.5 0 0 0-.5-.42h-1.5a.5.5 0 0 0-.5.42l-.15 1.02c-.68.26-1.3.63-1.85 1.1l-.96-.36a.5.5 0 0 0-.58.22l-.75 1.3c-.11.21-.06.46.12.6l.82.63c-.05.34-.08.7-.08 1.06 0 .35.03.71.08 1.06l-.82.63a.5.5 0 0 0-.12.6l.75 1.3c.11.21.36.3.58.22l.96-.36c.55.47 1.17.84 1.85 1.1l.15 1.02c.05.24.26.42.5.42h1.5c.24 0 .45-.18.5-.42l.15-1.02c.68-.26 1.3-.63 1.85-1.1l.96.36c.22.08.47-.01.58-.22l.75-1.3a.5.5 0 0 0-.12-.6Z"/></svg>',
                    save: '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M17 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7l-4-4ZM12 19a3 3 0 1 1 0-6 3 3 0 0 1 0 6Zm3-10H5V5h10v4Z"/></svg>'
                };

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

            // Centralized serial manager status push
            this.socket.on('serial-status', (status) => {
                try {
                    if (status && status.open) {
                        this.updateSerialStatus(true, status.path || 'Serial');
                    } else {
                        this.updateSerialStatus(false);
                    }
                } catch (e) { /* ignore */ }
            });

            this.socket.on('com_ports', (ports) => {
                this.updateComPorts(ports);
                this.log(`Received ${ports.length} COM ports`, 'info');
            });

            // Generic log passthrough
            this.socket.on('log', (msg) => { if (msg) this.log(msg, 'info'); });

            // Centralized device events (DeviceManager)
            this.socket.on('device-list', (payload) => {
                try {
                    if (payload && Array.isArray(payload.devices)) {
                        this.devices = payload.devices.map(d => ({ id: d.id, name: d.name, ip: d.host || d.ip, com: d.port || d.com }));
                        this.selectedDeviceId = payload.selectedId || null;
                        this.renderDevices();
                        const sel = this.getSelectedDevice();
                        if (sel) this.applySelectedDevice(sel);
                        this.updateHeaderDeviceSelect();
                        this.updateHeaderCommControls();
                    }
                } catch (e) { /* ignore */ }
            });
            this.socket.on('device-selected', (dev) => {
                try {
                    this.selectedDeviceId = dev ? dev.id : null;
                    this.renderDevices();
                    const sel = this.getSelectedDevice();
                    if (sel) this.applySelectedDevice(sel); else this.applySelectedDevice(null);
                    this.updateHeaderDeviceSelect();
                    this.updateHeaderCommControls();
                } catch (e) { /* ignore */ }
            });
            this.socket.on('device-removed', (info) => {
                try {
                    if (info && info.id) {
                        this.devices = this.devices.filter(d => d.id !== info.id);
                        if (this.selectedDeviceId === info.id) this.selectedDeviceId = null;
                        this.renderDevices();
                        this.updateHeaderDeviceSelect();
                        this.updateHeaderCommControls();
                    }
                } catch (e) { /* ignore */ }
            });

            // Server-pushed aggregated WiFi status: array of {id, host, status}
            this.socket.on('device-wifi-status', (arr) => {
                try {
                    if (!Array.isArray(arr)) return;
                    arr.forEach(item => {
                        const el = document.getElementById(`wifi-status-${item.id}`);
                        if (el && item.status) {
                            const s = item.status;
                            if (s.connected) {
                                el.innerHTML = `<span class="wifi-ok">WiFi: ${s.ssid || ''} ${s.ip ? '('+s.ip+')' : ''}</span>`;
                            } else if (s.error) {
                                el.innerHTML = `<span class="wifi-err">WiFi: offline (${s.error.split(':')[0]})</span>`;
                            } else {
                                el.innerHTML = `<span class="wifi-off">WiFi: offline</span>`;
                            }
                        }
                    });
                } catch (e) { /* ignore */ }
            });
        };

        // expose a reconnect helper so other code (like remote test) can trigger a reconnect
        this.reconnectSocket = () => {
            try { if (this.socket && this.socket.disconnect) this.socket.disconnect(); } catch (e) { }
            tryConnect();
        };

        // initial connect
        tryConnect();

        // also poll the REST status once after short delay (covers race when socket connects late)
        setTimeout(async () => {
            try {
                const r = await fetch('/api/serial/status');
                const j = await r.json();
                if (j && j.success && j.status) {
                    if (j.status.open) this.updateSerialStatus(true, j.status.path || 'Serial');
                }
            } catch (_) { /* ignore */ }
        }, 750);
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
    const comRefreshBtn = document.getElementById('com-refresh');
    if (comRefreshBtn) comRefreshBtn.addEventListener('click', () => this.refreshPorts());
    const serialRefreshBtn = document.getElementById('serial-refresh');
    if (serialRefreshBtn) serialRefreshBtn.addEventListener('click', () => this.refreshSerialPorts());

    // Header COM select change: persist and copy to device form
        const headerComSelect = document.getElementById('com-port-select');
        if (headerComSelect) headerComSelect.addEventListener('change', (e) => {
            try { this.saveLastPort(e.target.value); } catch (_) {}
            // mirror to device modal COM select if present
            const devCom = document.getElementById('devCom');
            if (devCom) devCom.value = e.target.value;
            // also update main config
            this.updateConfig('comPort', e.target.value);
        });

    // Serial open/close/send bindings (panel)
    const serialOpenBtn = document.getElementById('serial-open');
    if (serialOpenBtn) serialOpenBtn.addEventListener('click', () => this.openSerialPort());
    const serialCloseBtn = document.getElementById('serial-close');
    if (serialCloseBtn) serialCloseBtn.addEventListener('click', () => this.closeSerialPort());
    const serialSendBtn = document.getElementById('serial-send-btn');
    if (serialSendBtn) serialSendBtn.addEventListener('click', () => this.sendSerial());
    const serialQuickSel = document.getElementById('serial-quick-cmd');
    const serialQuickBtn = document.getElementById('serial-send-quick');
    if (serialQuickBtn && serialQuickSel) serialQuickBtn.addEventListener('click', () => {
        const selVal = serialQuickSel.value || '';
        if (!selVal) { this.log('Select a quick command first', 'warning'); return; }
        const input = document.getElementById('serial-send-text');
        if (input) input.value = selVal;
        this.sendSerial();
    });
    const serialSendSelectedBtn = document.getElementById('serial-send-selected');
    if (serialSendSelectedBtn) serialSendSelectedBtn.addEventListener('click', () => this.sendSelectedSerialCommand());
    const serialCheckBtn = document.getElementById('serial-check');
    if (serialCheckBtn) serialCheckBtn.addEventListener('click', () => this.checkCom());
    const serialReopenBtn = document.getElementById('serial-reopen');
    if (serialReopenBtn) serialReopenBtn.addEventListener('click', () => this.reopenSerial());
    const serialDiagnoseBtn = document.getElementById('serial-diagnose');
    if (serialDiagnoseBtn) serialDiagnoseBtn.addEventListener('click', () => this.diagnoseSerial());
    const serialBaudSel = document.getElementById('serial-baud');
    if (serialBaudSel && !serialBaudSel.dataset.bound) {
        serialBaudSel.addEventListener('change', () => {
            const v = parseInt(serialBaudSel.value,10) || 115200;
            this.config.baudRate = v;
            try { this.saveConfig(); } catch (e) {}
        });
        serialBaudSel.dataset.bound = '1';
    }

    // Log tail controls
    const startTailBtn = document.getElementById('start-tail');
    if (startTailBtn) startTailBtn.addEventListener('click', () => this.startTail());
    const stopTailBtn = document.getElementById('stop-tail');
    if (stopTailBtn) stopTailBtn.addEventListener('click', () => this.stopTail());
    const logSourceSel = document.getElementById('log-source');
    if (logSourceSel) logSourceSel.addEventListener('change', () => {
        // restart tail on source change (if tailing)
        if (this._tailActive) this.startTail();
    });

    // Quick API tests
    const apiBtn = document.getElementById('btn-api-status');
    if (apiBtn) apiBtn.addEventListener('click', () => this.testApiStatus());
    const wifiScanBtn = document.getElementById('btn-wifi-scan');
    if (wifiScanBtn) wifiScanBtn.addEventListener('click', () => this.testWifiScan());

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

    // AI code editing buttons (present only on ai.html)
    const aiLoadBtn = document.getElementById('ai-load-file');
    const aiPreviewBtn = document.getElementById('ai-preview-edit');
    const aiApplyBtn = document.getElementById('ai-apply-edit');
    const aiClearBtn = document.getElementById('ai-clear-diff');
    if (aiLoadBtn) aiLoadBtn.addEventListener('click', () => this.aiLoadSelectedFile());
    if (aiPreviewBtn) aiPreviewBtn.addEventListener('click', () => this.aiPreviewEdit());
    if (aiApplyBtn) aiApplyBtn.addEventListener('click', () => this.aiApplyEdit());
    if (aiClearBtn) aiClearBtn.addEventListener('click', () => this.aiClearEditPanels());

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

    // Device manager UI bindings (if present on this page)
    const addDevBtn = document.getElementById('device-add');
    if (addDevBtn) addDevBtn.addEventListener('click', () => this.openDeviceModal('add'));

    // Quick-open buttons used in several pages (data-href)
    try {
        document.querySelectorAll('button.quick-open').forEach(b => {
            if (b.__bound_quick_open) return; // idempotent
            b.addEventListener('click', (e) => {
                const href = b.getAttribute('data-href');
                if (!href) return;
                // prefer opening in same window for dev tools
                window.location.href = href;
            });
            b.__bound_quick_open = true;
        });
    } catch (e) { /* ignore when not present */ }

    // Open settings button (some pages include this)
    const openSettingsBtn = document.getElementById('open-settings-btn');
    if (openSettingsBtn) openSettingsBtn.addEventListener('click', () => { window.location.href = 'settings.html'; });

    // AI modal close buttons (index.html and other pages)
    const aiChatClose = document.getElementById('ai-chat-close');
    if (aiChatClose) aiChatClose.addEventListener('click', () => closeAIChat());
    const aiConfigClose = document.getElementById('ai-config-close');
    if (aiConfigClose) aiConfigClose.addEventListener('click', () => closeAIConfig());

    // File manager: cancel new file modal
    const cancelNewFileBtn = document.getElementById('cancel-newfile');
    if (cancelNewFileBtn) cancelNewFileBtn.addEventListener('click', (e) => {
        const modal = document.getElementById('newFileModal');
        if (modal) modal.style.display = 'none';
    });

    // Cleanup on unload
    try { window.addEventListener('beforeunload', () => { try { this.stopTail(); } catch (_) {} }); } catch (e) { /* ignore */ }
    }

    // --- Artifacts panel ---
    initArtifactsPanel() {
        this._selectedArtifact = null; // { name, type, relPath }
        const envSel = document.getElementById('artifacts-env');
        const refreshBtn = document.getElementById('artifacts-refresh');
        const otaBtn = document.getElementById('artifact-ota');
        const serialBtn = document.getElementById('artifact-serial');
        const statusEl = document.getElementById('artifacts-status');

        if (!envSel || !refreshBtn) return; // panel not present

        // populate env selector from platformio.ini if backend provides devices list
        fetch('/api/platformio-devices').then(r => r.json()).then(j => {
            if (j && j.success && Array.isArray(j.devices) && j.devices.length) {
                envSel.innerHTML = '';
                j.devices.forEach(d => {
                    const opt = document.createElement('option');
                    opt.value = d.id || d.name || d.board || 'env';
                    opt.textContent = d.id || d.name || d.board || 'Env';
                    envSel.appendChild(opt);
                });
                // try set to current env in sidebar
                const curEnv = document.getElementById('current-env')?.textContent || 'OutdoorAP';
                try { envSel.value = curEnv; } catch (_) {}
            }
        }).catch(() => {});

        const refresh = async () => {
            const env = envSel.value || 'OutdoorAP';
            statusEl.textContent = 'Loading artifacts...';
            const listEl = document.getElementById('artifacts-list');
            if (listEl) listEl.innerHTML = '';
            this._selectedArtifact = null;
            this._updateArtifactButtons();
            try {
                const r = await fetch(`/api/artifacts?env=${encodeURIComponent(env)}`);
                const j = await r.json();
                if (!j.success) throw new Error(j.error || 'Failed');
                const arts = Array.isArray(j.artifacts) ? j.artifacts.filter(a => a.exists) : [];
                statusEl.textContent = `Env ${j.env}: ${arts.length} artifacts`;
                this.renderArtifacts(arts);
            } catch (e) {
                statusEl.textContent = `Error: ${e.message}`;
            }
        };

        refreshBtn.addEventListener('click', refresh);
        envSel.addEventListener('change', refresh);
        // auto-initialize once
        setTimeout(refresh, 50);

        if (otaBtn) otaBtn.addEventListener('click', () => this.otaSelectedArtifact());
        if (serialBtn) serialBtn.addEventListener('click', () => this.serialFlashSelectedArtifact());
    }

    renderArtifacts(artifacts) {
        const listEl = document.getElementById('artifacts-list');
        if (!listEl) return;
        listEl.innerHTML = '';
        if (!Array.isArray(artifacts) || artifacts.length === 0) {
            listEl.innerHTML = '<em>No artifacts found. Build first.</em>';
            return;
        }
        artifacts.forEach(a => {
            const card = document.createElement('div');
            card.className = 'artifact-card';
            card.style.cssText = 'border:1px solid #e5e7eb;border-radius:6px;padding:8px;min-width:180px;background:white;cursor:pointer';
            const sizeStr = (a.size != null) ? `${(a.size/1024).toFixed(1)} KB` : '-';
            const dateStr = a.mtime ? new Date(a.mtime).toLocaleString() : '';
            card.innerHTML = `
                <div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
                    <strong>${a.name}</strong>
                    <span class="badge">${a.type}</span>
                </div>
                <div class="muted" style="font-size:12px">${sizeStr}${dateStr ? ' • ' + dateStr : ''}</div>
                <div class="muted" style="font-size:11px;word-break:break-all">${a.relPath || ''}</div>
            `;
            card.addEventListener('click', () => {
                this._selectedArtifact = { name: a.name, type: a.type, relPath: a.relPath };
                // highlight selection
                listEl.querySelectorAll('.artifact-card').forEach(el => el.style.outline = 'none');
                card.style.outline = '2px solid #2563eb';
                this._updateArtifactButtons();
            });
            listEl.appendChild(card);
        });
    }

    _updateArtifactButtons() {
        const otaBtn = document.getElementById('artifact-ota');
        const serialBtn = document.getElementById('artifact-serial');
        const hasSel = !!(this._selectedArtifact && this._selectedArtifact.relPath);
        if (otaBtn) {
            otaBtn.disabled = !hasSel || (this._selectedArtifact.type !== 'firmware');
            otaBtn.title = (this._selectedArtifact && this._selectedArtifact.type !== 'firmware') ? 'OTA supports firmware.bin only' : '';
        }
        if (serialBtn) serialBtn.disabled = !hasSel;
    }

    async otaSelectedArtifact() {
        if (!this._selectedArtifact) { alert('Select an artifact first'); return; }
        const dev = this.getSelectedDevice();
        if (!dev || !dev.ip) { alert('Select a device with Host/IP first'); return; }
        // host the artifact through the server and trigger OTA
        try {
            this.log(`Preparing OTA for ${this._selectedArtifact.name} to ${dev.ip}...`, 'info');
            const hostResp = await fetch('/api/firmware/host-local', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: this._selectedArtifact.relPath })
            });
            const hostJson = await hostResp.json();
            if (!hostJson.success) throw new Error(hostJson.error || 'host failed');
            const firmwarePath = hostJson.path;
            const triggerResp = await fetch('/api/firmware/trigger', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ host: dev.ip, firmwarePath })
            });
            const trig = await triggerResp.json();
            if (!trig.success) throw new Error(trig.error || 'OTA trigger failed');
            this.log(`OTA triggered on ${dev.ip}: ${JSON.stringify(trig.deviceResponse)}`, 'success');
        } catch (e) {
            this.log(`OTA error: ${e.message}`, 'error');
            alert(`OTA failed: ${e.message}`);
        }
    }

    async serialFlashSelectedArtifact() {
        if (!this._selectedArtifact) { alert('Select an artifact first'); return; }
        const port = this.config.comPort || document.getElementById('com-port-select')?.value || 'COM10';
        if (!port) { alert('Select a COM port first'); return; }
        // Choose flashing method based on artifact type
        const envSel = document.getElementById('artifacts-env');
        const env = envSel ? envSel.value : 'OutdoorAP';
        if (this._selectedArtifact.type === 'filesystem') {
            // Upload filesystem image using PlatformIO target uploadfs
            this.log(`Uploading filesystem (env ${env}) to ${port}...`, 'info');
            this.showProgress('Uploading filesystem...');
            this.currentProcess = 'uploadfs';
            this.updateButtons();
            this.socket.emit('run_command', {
                command: 'pio',
                args: ['run', '-e', env, '--target', 'uploadfs', '--upload-port', port]
            });
        } else if (this._selectedArtifact.type === 'firmware') {
            // Upload firmware using compile.py upload-only path (skip build)
            this.log(`Uploading firmware (env ${env}) to ${port}...`, 'info');
            this.showProgress('Uploading firmware...');
            this.currentProcess = 'upload';
            this.updateButtons();
            const args = this.buildCompileArgs({
                environment: env,
                comPort: port,
                baudRate: 921600,
                jobs: 0,
                fastBuild: false,
                clean: false,
                verbose: false,
                filesystemOnly: false,
                skipUpload: false,
                monitor: false
            }, { skipBuild: true });
            this.socket.emit('run_script', { script: 'compile.py', args });
        } else {
            alert('Unsupported artifact type for serial flashing. Select firmware.bin or littlefs.bin');
        }
    }

    updateConnectionStatus() {
        // Specifically reflect WebSocket status in the header indicators
        const dot = document.getElementById('ws-status-dot');
        const text = document.getElementById('ws-status-text');
        if (dot) dot.className = `status-dot ${this.connected ? 'connected' : 'disconnected'}`;
        if (text) text.textContent = this.connected ? 'WS' : 'WS';
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

        // Manual COM mode: always show only the allowed port
        if (this.config.manualComOnly && this.config.allowedComPort) {
            const allowed = String(this.config.allowedComPort);
            const option = document.createElement('option');
            option.value = allowed;
            option.textContent = `${allowed} - Manual`;
            select.appendChild(option);
            select.disabled = false;
            select.value = allowed;
            this.updateConfig('comPort', allowed);
            // Mirror to header and device selects if present
            try {
                const header = document.getElementById('com-port-select');
                const device = document.getElementById('devCom');
                if (header) { header.innerHTML = `<option value="${allowed}">${allowed}</option>`; header.value = allowed; }
                if (device) { device.innerHTML = `<option value="${allowed}">${allowed}</option>`; device.value = allowed; }
            } catch (_) {}
            return;
        }

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

    // ---- Device Manager ----
    initDeviceManager() {
        // Load from server (preferred) then localStorage fallback
        this.fetchDevices().then(() => {
            this.renderDevices();
            // if a selection exists, apply it
            const sel = this.getSelectedDevice();
            if (sel) this.applySelectedDevice(sel);
        }).catch(() => {
            this.loadDevicesFromLocal();
            this.renderDevices();
            const sel = this.getSelectedDevice();
            if (sel) this.applySelectedDevice(sel);
        });
        // ensure COM dropdown for device form is hydrated by header COM list
    try { this.refreshHeaderComListToDeviceForm(); } catch (e) {}
    }

    async fetchDevices() {
        try {
            const resp = await fetch('/api/devices');
            if (!resp.ok) throw new Error('HTTP ' + resp.status);
            const json = await resp.json();
            if (!Array.isArray(json.devices)) throw new Error('invalid');
            this.devices = json.devices;
            this.selectedDeviceId = json.selectedId || null;
            return this.devices;
        } catch (err) {
            throw err;
        }
    }

    saveDevices() {
        // Try server first, fallback to localStorage
        const payload = { devices: this.devices, selectedId: this.selectedDeviceId };
        fetch('/api/devices', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
            .then(r => r.json()).then(() => {})
            .catch(() => {
                try { localStorage.setItem('oepl_devices', JSON.stringify(payload)); } catch (e) {}
            });
    }

    loadDevicesFromLocal() {
        try {
            const raw = localStorage.getItem('oepl_devices');
            if (raw) {
                const j = JSON.parse(raw);
                this.devices = Array.isArray(j.devices) ? j.devices : [];
                this.selectedDeviceId = j.selectedId || null;
            }
        } catch (e) {
            this.devices = [];
        }
    }

    // Inline add form removed; use modal via openDeviceModal('add')

    openDeviceModal(mode = 'add', device = null) {
        const modal = document.getElementById('device-modal');
        if (!modal) return;
        const title = document.getElementById('device-modal-title');
        const name = document.getElementById('devName');
        const host = document.getElementById('devHost');
        const com = document.getElementById('devCom');
        modal.style.display = 'block';
        if (title) title.textContent = mode === 'edit' ? 'Edit Device' : 'Add Device';
        if (device) {
            name.value = device.name || '';
            host.value = device.ip || '';
            com.value = device.com || '';
            modal.setAttribute('data-edit-id', device.id);
        } else {
            name.value = '';
            host.value = '';
            const headerSel = document.getElementById('com-port-select');
            com.value = headerSel && headerSel.value ? headerSel.value : (this.config.comPort || '');
            modal.removeAttribute('data-edit-id');
        }

        const cancel = document.getElementById('device-cancel');
        const cancel2 = document.getElementById('device-cancel-btn');
        const save = document.getElementById('device-save-btn');
        if (cancel && !cancel.__wired) { cancel.addEventListener('click', () => modal.style.display = 'none'); cancel.__wired = true; }
        if (cancel2 && !cancel2.__wired) { cancel2.addEventListener('click', () => modal.style.display = 'none'); cancel2.__wired = true; }
        if (save && !save.__wired) { save.addEventListener('click', () => this.saveDeviceModal()); save.__wired = true; }

        // Wire WiFi Setup launcher inside the modal
        const wifiBtn = document.getElementById('modal-wifi-setup');
        if (wifiBtn && !wifiBtn.__wired) {
            wifiBtn.addEventListener('click', () => {
                const devObj = device ? device : {
                    id: modal.getAttribute('data-edit-id') || `temp_${Date.now()}`,
                    name: (document.getElementById('devName')?.value || 'Device'),
                    ip: (document.getElementById('devHost')?.value || '')
                };
                this.openWifiScanModal(devObj);
            });
            wifiBtn.__wired = true;
        }
    }

    saveDeviceModal() {
        const modal = document.getElementById('device-modal');
        if (!modal) return;
        const editId = modal.getAttribute('data-edit-id');
        const name = document.getElementById('devName').value.trim();
        const ip = document.getElementById('devHost').value.trim();
        const com = document.getElementById('devCom').value.trim();
        if (!name) { alert('Enter a device name'); return; }
        if (editId) {
            const idx = this.devices.findIndex(d => d.id === editId);
            if (idx >= 0) {
                this.devices[idx] = { ...this.devices[idx], name, ip, com };
                this.saveDevices();
                this.renderDevices();
            }
        } else {
            const id = `${name}`.replace(/\s+/g, '_').toLowerCase() + '_' + Date.now();
            const dev = { id, name, ip, com };
            this.devices.push(dev);
            this.selectedDeviceId = id;
            this.saveDevices();
            this.renderDevices();
            this.applySelectedDevice(dev);
        }
        modal.style.display = 'none';
    }

    getSelectedDevice() {
        if (!this.selectedDeviceId) return null;
        return this.devices.find(d => d.id === this.selectedDeviceId) || null;
    }

    selectDevice(id) {
        this.selectedDeviceId = id;
        this.saveDevices();
        // Optimistically render locally
        const dev = this.getSelectedDevice();
        if (dev) this.applySelectedDevice(dev);
        this.renderDevices();
        // Inform backend so other clients / server state stay in sync
        try {
            fetch('/api/device/select', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ id }) })
                .then(r=>r.json()).then(j=>{
                    if(!j.success){ this.log('Server selection update failed','warning'); }
                }).catch(e=> this.log('Selection sync error: '+e.message,'error'));
        } catch(e){ /* ignore */ }
    }

    deleteDevice(id) {
        this.devices = this.devices.filter(d => d.id !== id);
        if (this.selectedDeviceId === id) this.selectedDeviceId = this.devices[0]?.id || null;
        this.saveDevices();
        this.renderDevices();
        const dev = this.getSelectedDevice();
        if (dev) this.applySelectedDevice(dev);
    }

    // Central helper to change device communication mode and persist to backend
    async setDeviceMode(deviceId, mode) {
        if (!deviceId || (mode !== 'serial' && mode !== 'wifi')) return;
        const dev = this.devices.find(d => d.id === deviceId);
        if (!dev) return;
        dev.meta = dev.meta || {};
        if (dev.meta.commMode === mode) return; // no change
        dev.meta.commMode = mode;
        // Persist to backend
        try {
            const r = await fetch(`/api/device/${encodeURIComponent(dev.id)}`, {
                method: 'PUT', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ port: dev.com || dev.port || null, meta: dev.meta })
            });
            const j = await r.json();
            if (!j.success) {
                this.log('Failed to update mode: ' + (j.error || 'error'), 'error');
            } else {
                this.log(`Mode set to ${mode} for ${dev.id}`, 'info');
                if (dev.id === this.selectedDeviceId) this.applySelectedDevice(dev);
                // Re-render affected UIs
                this.renderDevices();
                try { this.refreshTestControlsMode(); } catch(_){}
            }
        } catch (e) {
            this.log('Mode update error: ' + e.message, 'error');
        }
    }

    renderDevices() {
        const container = document.getElementById('saved-devices');
        if (!container) return;
        container.innerHTML = '';
        // Inject icon button styles (idempotent)
        if(!document.getElementById('device-card-icon-style')){
            const st = document.createElement('style');
            st.id='device-card-icon-style';
            st.textContent = `
            .device-card{position:relative;border:1px solid #30363d;border-radius:8px;padding:12px;background:#161b22;min-width:250px;}
            .device-card .device-status{display:flex;align-items:center;gap:6px;margin-bottom:4px;font-size:14px;}
            .device-card .status-dot{width:10px;height:10px;border-radius:50%;display:inline-block;background:#8b949e;}
            .device-card .status-online{background:#238636!important;}
            .device-card .status-offline{background:#d1242f!important;}
            .device-card .action-bar{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;}
            .device-card button.icon-btn{width:32px;height:32px;display:flex;align-items:center;justify-content:center;padding:0;border:1px solid #30363d;background:#1f242b;color:#e6e6e6;border-radius:6px;cursor:pointer;font-size:16px;line-height:1;transition:background .15s,border-color .15s;}
            .device-card button.icon-btn:hover{background:#30363d;border-color:#3a4149;}
            .device-card button.icon-btn.active{background:#238636;border-color:#238636;color:#fff;}
            .device-card button.icon-btn.danger{background:#3d1f1f;border-color:#593131;color:#ffb4b4;}
            .device-card button.icon-btn.danger:hover{background:#a40e26;border-color:#a40e26;color:#fff;}
            .device-card button.icon-btn.secondary{background:#1f242b;}
            .device-card .wifi-line{margin-top:4px;font-size:11px;min-height:16px;}
            .device-card .muted{opacity:.55;}
            .device-card.selected{outline:2px solid #238636;}
            .device-card .tooltip-wrap{display:none;}
            `;
            document.head.appendChild(st);
        }
        // Ensure test controls container exists (only once)
        this._ensureTestControls();
        if (!Array.isArray(this.devices) || this.devices.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'device-card';
            empty.innerHTML = '<em>No saved devices yet</em>';
            container.appendChild(empty);
            return;
        }
                this.devices.forEach(d => {
            const card = document.createElement('div');
            const selected = d.id === this.selectedDeviceId;
            card.className = 'device-card'+(selected?' selected':'');
            card.innerHTML = `
                <div class="device-status">
                    <span class="status-dot ${selected ? 'status-online' : 'status-offline'}" aria-label="${selected?'Selected':'Not Selected'}"></span>
                    <strong>${d.name || d.id}</strong>
                </div>
                                <div style="display:flex;gap:8px;flex-wrap:wrap;font-size:11px;margin-bottom:2px;align-items:center;">
                                    <div>IP: <span>${d.ip || '-'}</span></div>
                                    <div>COM: <span class="dev-com-label">${d.com || '-'}</span></div>
                                    <div style="display:flex;align-items:center;gap:4px;">
                                        <span style="font-size:10px;opacity:.6;">Mode</span>
                                        <div class="mode-btn-group" data-id="${d.id}" style="display:inline-flex;gap:4px;">
                                            <button class="icon-btn mode-btn ${ (d.meta&&d.meta.commMode==='serial')||(!d.meta||!d.meta.commMode)?'active':'' }" data-mode="serial" title="Serial mode">S</button>
                                            <button class="icon-btn mode-btn ${ d.meta&&d.meta.commMode==='wifi' ? 'active':'' }" data-mode="wifi" title="WiFi mode">W</button>
                                        </div>
                                    </div>
                                </div>
                                <div class="wifi-line"><small id="wifi-status-${d.id}"><span class="muted">WiFi: —</span></small><span class="ping-spinner" id="ping-spin-${d.id}" style="display:none;margin-left:6px;font-size:12px;">⏳</span></div>
                                <div class="action-bar">
                                    <div class="icon-btn-wrap"><button class="icon-btn ${selected?'active':''}" data-act="select" data-id="${d.id}" aria-label="Select Device">${selected?'✔':'✓'}</button><span class="lbl">${selected?'Sel':'Select'}</span></div>
                                    <div class="icon-btn-wrap"><button class="icon-btn secondary" data-act="edit" data-id="${d.id}" aria-label="Edit">✎</button><span class="lbl">Edit</span></div>
                                    <div class="icon-btn-wrap"><button class="icon-btn secondary" data-act="ping" data-id="${d.id}" aria-label="Ping">📡</button><span class="lbl">Ping</span></div>
                                    <div class="icon-btn-wrap"><button class="icon-btn secondary" data-act="led-off" data-id="${d.id}" aria-label="LED Off">💡✕</button><span class="lbl">LED</span></div>
                                    <div class="icon-btn-wrap"><button class="icon-btn danger" data-act="delete" data-id="${d.id}" aria-label="Delete">🗑</button><span class="lbl">Del</span></div>
                                    <div class="icon-btn-wrap"><button class="icon-btn secondary" data-act="adv" data-id="${d.id}" aria-label="Advanced">⚙</button><span class="lbl">Adv</span></div>
                                </div>
                                <div class="adv-panel" id="adv-${d.id}" style="display:none;margin-top:8px;padding:6px;border:1px solid #30363d;border-radius:6px;background:#1c2128;font-size:11px;line-height:1.4;">
                                     <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-bottom:4px;">
                                         <label style="font-size:10px;opacity:.65;">Comm Mode</label>
                                         <select data-role="comm-mode" style="background:#0d1117;color:#e6e6e6;border:1px solid #30363d;border-radius:4px;font-size:11px;padding:2px 4px;">
                                             <option value="serial" ${(d.meta&&d.meta.commMode==='wifi')?'':'selected'}>Serial</option>
                                             <option value="wifi" ${(d.meta&&d.meta.commMode==='wifi')?'selected':''}>WiFi</option>
                                         </select>
                                         <label style="font-size:10px;opacity:.65;">Port</label>
                                         <select data-role="comm-port" style="background:#0d1117;color:#e6e6e6;border:1px solid #30363d;border-radius:4px;font-size:11px;padding:2px 4px;min-width:90px;"></select>
                                         <button class="icon-btn secondary" data-act="apply-comm" data-id="${d.id}" title="Apply" aria-label="Apply">💾</button>
                                     </div>
                                     <div style="font-size:10px;opacity:.55;">ID: ${d.id}</div>
                                </div>
            `;
            container.appendChild(card);

            // wire actions
                        card.querySelectorAll('button[data-act]')?.forEach(btn => {
                const act = btn.getAttribute('data-act');
                const id = btn.getAttribute('data-id');
                btn.addEventListener('click', async () => {
                    if (act === 'select') this.selectDevice(id);
                    if (act === 'delete') this.deleteDevice(id);
                    if (act === 'edit') {
                        const dev = this.devices.find(x => x.id === id);
                        if (dev) this.openDeviceModal('edit', dev);
                    }
                    if (act === 'ping') {
                        const dev = this.devices.find(x => x.id === id);
                        if (dev && dev.ip) {
                                                        const spin = document.getElementById(`ping-spin-${id}`); if(spin) spin.style.display='inline';
                            try {
                                const ok = await this.testRemoteHost(dev.ip);
                                alert(ok ? `Device ${dev.name} reachable` : `Device ${dev.name} not reachable`);
                            } catch (_) { alert('Ping failed'); }
                                                        finally { if(spin) spin.style.display='none'; }
                        } else {
                            alert('No IP set for device');
                        }
                    }
                    if (act === 'led-off') {
                        this.sendLedOff(id);
                    }
                                        if (act === 'adv') {
                                             const panel = document.getElementById(`adv-${id}`); if(panel){ panel.style.display = panel.style.display==='none'?'block':'none'; }
                                        }
                });
            });

                        // Mode button group handling
                        const modeGroup = card.querySelector('.mode-btn-group');
                        if(modeGroup){
                            modeGroup.querySelectorAll('button.mode-btn').forEach(btn=>{
                                btn.addEventListener('click', ()=>{
                                    const newMode = btn.getAttribute('data-mode');
                                    this.setDeviceMode(d.id, newMode);
                                });
                            });
                        }

            // Fetch WiFi status for this device (non-blocking)
            this.updateDeviceWifiStatus(d).catch(() => {
                // silent
            });

            // Populate COM port select with current global header list (if any)
            try {
                const portSel = card.querySelector('select[data-role="comm-port"]');
                if (portSel) {
                    const headerSel = document.getElementById('com-port-select');
                    portSel.innerHTML = '';
                    if (headerSel && headerSel.options.length) {
                        Array.from(headerSel.options).forEach(o => {
                            const opt = document.createElement('option');
                            opt.value = o.value; opt.textContent = o.textContent || o.value;
                            if (d.com && d.com === o.value) opt.selected = true;
                            portSel.appendChild(opt);
                        });
                    } else {
                        const opt = document.createElement('option'); opt.value=''; opt.textContent='(no ports)'; portSel.appendChild(opt);
                    }
                }
            } catch (e) { /* ignore */ }
        });

        // Wire communication controls after all cards added
        try {
            container.querySelectorAll('button[data-act="apply-comm"]').forEach(btn => {
                btn.addEventListener('click', () => {
                    const id = btn.getAttribute('data-id');
                    const card = btn.closest('.device-card');
                    if (!card) return;
                    const modeSel = card.querySelector('select[data-role="comm-mode"]');
                    const portSel = card.querySelector('select[data-role="comm-port"]');
                    const commMode = modeSel ? modeSel.value : 'serial';
                    const portVal = portSel ? portSel.value : '';
                    const dev = this.devices.find(d => d.id === id);
                    if (dev) {
                        dev.com = portVal || null;
                        dev.meta = dev.meta || {};
                        dev.meta.commMode = commMode;
                        // Persist to backend
                        fetch(`/api/device/${encodeURIComponent(id)}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ port: portVal || null, meta: dev.meta }) })
                            .then(r=>r.json()).then(j=>{
                                if(!j.success) this.log(`Failed saving comm settings for ${id}: ${j.error}`,'error');
                                else this.log(`Updated communication settings for ${id}`,'info');
                                // If this is the selected device and mode=serial, apply COM immediately
                                if (this.selectedDeviceId === id && commMode === 'serial' && portVal) {
                                    this.config.comPort = portVal;
                                    try { this.saveConfig(); } catch (e) {}
                                }
                            }).catch(e=>this.log('Comm save error: '+e.message,'error'));
                        // Update label
                        const lbl = card.querySelector('.dev-com-label'); if(lbl) lbl.textContent = portVal || '-';
                    }
                });
            });
        } catch (e) { /* ignore */ }

        // Start/refresh periodic WiFi status updates (every 30s)
        try {
            if (this._wifiStatusInterval) clearInterval(this._wifiStatusInterval);
            this._wifiStatusInterval = setInterval(() => {
                this.refreshAllDevicesWifiStatus();
            }, 30000);
        } catch (e) { /* ignore */ }
    }

    updateHeaderDeviceSelect() {
        try {
            const sel = document.getElementById('header-device-select');
            if (!sel) return; // not on a page with header selector
            const prev = sel.value;
            sel.innerHTML = '';
            if (Array.isArray(this.devices)) {
                this.devices.forEach(d => {
                    const opt = document.createElement('option');
                    opt.value = d.id;
                    opt.textContent = d.name || d.id;
                    if (this.selectedDeviceId && this.selectedDeviceId === d.id) opt.selected = true;
                    sel.appendChild(opt);
                });
            }
            if (!sel.value && sel.options.length) sel.selectedIndex = 0;
            if (!sel.dataset.bound) {
                sel.addEventListener('change', () => {
                    const id = sel.value;
                    // local optimistic update
                    this.selectedDeviceId = id;
                    const dev = this.getSelectedDevice();
                    if (dev) this.applySelectedDevice(dev);
                    this.renderDevices();
                    fetch('/api/device/select', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
                        .then(r=>r.json()).then(j=>{ if(!j.success) this.log('Header selection sync failed','warning'); })
                        .catch(e=> this.log('Header selection error: '+e.message,'error'));
                });
                sel.dataset.bound = '1';
            }
            // After populating device list, refresh comm header selects
            this.updateHeaderCommControls();
        } catch (e) { /* ignore */ }
    }

    updateHeaderCommControls() {
        try {
            const portSel = document.getElementById('header-comm-port');
            if (!portSel) return;
            // Replace mode select with button group if not already transformed
            let modeContainer = document.getElementById('header-comm-mode');
            if (modeContainer && modeContainer.tagName === 'SELECT') {
                const parent = modeContainer.parentElement;
                const grp = document.createElement('div');
                grp.id = 'header-comm-mode';
                grp.className = 'mode-btn-group-header';
                grp.innerHTML = `
                  <button class="icon-btn mode-btn" data-mode="serial">Serial</button>
                  <button class="icon-btn mode-btn" data-mode="wifi">WiFi</button>`;
                parent.replaceChild(grp, modeContainer);
                modeContainer = grp;
            }
            const dev = this.getSelectedDevice();
            // Populate port list from master com select
            const master = document.getElementById('com-port-select');
            portSel.innerHTML = '';
            if (master && master.options.length) {
                Array.from(master.options).forEach(o => {
                    const opt = document.createElement('option'); opt.value = o.value; opt.textContent = o.textContent || o.value; portSel.appendChild(opt);
                });
            }
            let currentMode = 'serial';
            if (dev) {
                currentMode = dev.meta?.commMode || 'serial';
                if (dev.port) portSel.value = dev.port; else if (dev.com) portSel.value = dev.com;
            }
            // Update header mode buttons active state
            if (modeContainer) {
                modeContainer.querySelectorAll('button.mode-btn').forEach(btn => {
                    const m = btn.getAttribute('data-mode');
                    if (m === currentMode) btn.classList.add('active'); else btn.classList.remove('active');
                    if (!btn.dataset.bound) {
                        btn.addEventListener('click', () => {
                            if (!dev) return;
                            this.setDeviceMode(dev.id, m);
                        });
                        btn.dataset.bound = '1';
                    }
                    btn.disabled = !dev;
                });
            }
            portSel.disabled = !dev || currentMode !== 'serial';
            if (!portSel.dataset.bound) {
                portSel.addEventListener('change', () => this._persistHeaderComm());
                portSel.dataset.bound = '1';
            }
        } catch (e) { /* ignore */ }
    }

    _persistHeaderComm() {
    const portSel = document.getElementById('header-comm-port');
    const dev = this.getSelectedDevice();
    if (!dev || !portSel) return;
    const commMode = dev.meta?.commMode || 'serial';
        const port = portSel.value || null;
        // Update local model
        dev.meta = dev.meta || {}; dev.meta.commMode = commMode;
        dev.port = port; // keep consistent with backend property name
        if (commMode !== 'serial') {
            // In WiFi mode, we do not require a port; disable port select
            portSel.disabled = true;
        } else {
            portSel.disabled = false;
        }
    fetch(`/api/device/${encodeURIComponent(dev.id)}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ port, meta: dev.meta }) })
            .then(r=>r.json()).then(j=>{
                if (!j.success) this.log('Failed to persist comm settings: '+(j.error||'error'),'error');
                else this.log('Comm settings updated for '+dev.id,'info');
                // Re-apply device selection to update serial config if needed
                if (dev.id === this.selectedDeviceId) this.applySelectedDevice(dev);
                // Refresh header controls to reflect potential adjustments
                this.updateHeaderCommControls();
            }).catch(e=>this.log('Comm persist error: '+e.message,'error'));
    }

    applySelectedDevice(dev) {
        // Determine communication mode (default serial) and update COM only if mode=serial
        const commMode = dev?.meta?.commMode || 'serial';
        if (commMode === 'serial' && dev && dev.com) {
            this.config.comPort = dev.com;
            const headerSel = document.getElementById('com-port-select');
            if (headerSel) {
                const opt = Array.from(headerSel.options).find(o => o.value === dev.com);
                if (opt) headerSel.value = dev.com;
                const statusText = document.getElementById('serial-status-text');
                if (statusText) statusText.textContent = `Serial (${dev.com})`;
            }
            try { this.saveConfig(); } catch (e) {}
        }
        if (commMode === 'wifi') {
            // Clear serial indicator but keep selection
            const statusText = document.getElementById('serial-status-text');
            if (statusText) statusText.textContent = 'Serial (WiFi mode)';
        }

        // Update API hint in header if IP provided (WS remains local to this server)
        if (dev && dev.ip) {
            const apiText = document.getElementById('api-status-text');
            if (apiText) apiText.textContent = `API(${dev.ip})`;
            // set remote config for API/device proxy usage only
            this.remoteConfig.enabled = true;
            this.remoteConfig.host = dev.ip;
            // try reachability and mark
            this.testRemoteHost(dev.ip).then(ok => {
                this.remoteConfig.connected = !!ok;
                this.updateApiStatus(!!ok, 'API');
            }).catch(() => {
                this.remoteConfig.connected = false;
                this.updateApiStatus(false);
            });
        }
        if (!dev || !dev.ip) {
            this.remoteConfig.enabled = false;
            this.remoteConfig.host = '';
            this.remoteConfig.connected = false;
            this.updateApiStatus(false);
        }

        // Keep websocket local; no reconnect to device

    // Refresh WiFi status line immediately for selected device
    try { if (dev) this.updateDeviceWifiStatus(dev); } catch (e) { /* ignore */ }
    // Render dedicated selected card
    try { this.renderSelectedDeviceCard(); } catch (e) { /* ignore */ }
    // Update bottom test controls visibility based on mode
    try { this.refreshTestControlsMode(); } catch (e) { /* ignore */ }
    }

    // Send LED off command to backend (placeholder implementation)
    async sendLedOff(id){
        const targetId = id || this.selectedDeviceId;
        if(!targetId){ alert('No device selected'); return; }
        try {
            const r = await fetch(`/api/device/${encodeURIComponent(targetId)}/led/off`, { method:'POST' });
            const j = await r.json();
            if(!j.success) throw new Error(j.error||'failed');
            this.log(`LED off (${j.method||'?'}) OK for ${targetId}`,'info');
            // Optionally provide lightweight visual feedback
            try {
                const btns = document.querySelectorAll(`button[data-act='led-off'][data-id='${targetId}']`);
                btns.forEach(b=>{ b.classList.add('active'); setTimeout(()=>b.classList.remove('active'), 600); });
            } catch(_){}
        } catch(e){
            this.log('LED off error: '+e.message,'error');
            alert('LED off failed: '+e.message);
        }
    }

    // Dedicated selected device card renderer
    renderSelectedDeviceCard(){
        const host = document.getElementById('selected-device-card');
        if(!host) return;
        const dev = this.getSelectedDevice();
        if(!dev){ host.innerHTML = '<div class="device-card" style="opacity:.6"><em>No device selected</em></div>'; return; }
        const commMode = dev.meta?.commMode || 'serial';
        host.innerHTML = `<div class="device-card selected">
            <div style='display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;'>
               <div style='display:flex;align-items:center;gap:8px;'>
                   <span class="status-dot status-online"></span>
                   <strong>${dev.name || dev.id}</strong>
               </div>
               <button class='icon-btn' data-act='led-off' data-id='${dev.id}' title='LED Off' aria-label='LED Off'>💡✕</button>
            </div>
            <div style='display:flex;flex-wrap:wrap;gap:12px;font-size:12px;margin-bottom:6px;'>
                <div>IP: <span>${dev.ip||'-'}</span></div>
                <div>COM: <span>${dev.com||dev.port||'-'}</span></div>
                <div style='display:flex;align-items:center;gap:6px;'>
                    <span style='font-size:10px;opacity:.6;'>Mode</span>
                    <div class='mode-btn-group-selected' data-id='${dev.id}' style='display:inline-flex;gap:6px;'>
                        <button class='icon-btn mode-btn ${commMode==='serial'?'active':''}' data-mode='serial' title='Serial mode'>Serial</button>
                        <button class='icon-btn mode-btn ${commMode==='wifi'?'active':''}' data-mode='wifi' title='WiFi mode'>WiFi</button>
                    </div>
                </div>
            </div>
            <div class='wifi-line' style='font-size:11px'><small id='wifi-status-${dev.id}'><span class='muted'>WiFi: —</span></small></div>
        </div>`;
        // wire LED button
        const ledBtn = host.querySelector("button[data-act='led-off']");
        ledBtn?.addEventListener('click', ()=> this.sendLedOff(dev.id));
        // mode buttons in selected card
        const selGroup = host.querySelector('.mode-btn-group-selected');
        if(selGroup){
            selGroup.querySelectorAll('button.mode-btn').forEach(btn=>{
                btn.addEventListener('click', ()=>{
                    const m = btn.getAttribute('data-mode');
                    this.setDeviceMode(dev.id, m);
                });
            });
        }
        // fetch WiFi status line for selected device (fresh)
        try { this.updateDeviceWifiStatus(dev); } catch (e) { /* ignore */ }
    }

    refreshHeaderComListToDeviceForm() {
    const headerSel = document.getElementById('com-port-select');
    const devSel = document.getElementById('devCom');
        if (headerSel && devSel) {
            devSel.innerHTML = headerSel.innerHTML;
            if (headerSel.value) devSel.value = headerSel.value;
        }
    }

    _ensureTestControls() {
        try {
            if (document.getElementById('dev-test-controls')) return;
            const host = document.getElementById('dev-actions') || document.body;
            const wrap = document.createElement('div');
            wrap.id = 'dev-test-controls';
            wrap.style.margin = '12px 0';
            wrap.innerHTML = `
                <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center">
                    <button id="btn-run-api-tests" class="btn btn-outline btn-small mode-wifi-only" title="Run a set of HTTP health checks">Run API Tests</button>
                    <button id="btn-wifi-ping" class="btn btn-outline btn-small mode-wifi-only" title="Ping selected device host">Ping Device</button>
                    <button id="btn-wifi-status" class="btn btn-outline btn-small mode-wifi-only" title="Refresh WiFi status line">WiFi Status</button>
                    <button id="btn-run-serial-test" class="btn btn-outline btn-small mode-serial-only" title="Query serial manager status">Serial Status</button>
                    <button id="btn-run-serial-poke" class="btn btn-outline btn-small mode-serial-only" title="Send small poke over open serial">Serial Poke</button>
                    <span id="dev-test-summary" class="muted" style="margin-left:4px;"></span>
                </div>
                <details id="dev-test-details" style="margin-top:6px;">
                    <summary>Test Results</summary>
                    <pre id="dev-test-output" style="max-height:260px;overflow:auto;background:#111;padding:8px;color:#ddd;font-size:12px;"></pre>
                </details>`;
            host.parentNode.insertBefore(wrap, host.nextSibling);
            const out = () => document.getElementById('dev-test-output');
            const summary = () => document.getElementById('dev-test-summary');
            const append = (line) => { const o = out(); if (!o) return; o.textContent += line + "\n"; };
            const clear = () => { const o = out(); if (o) o.textContent = ''; };
            const setSummary = (t) => { const s = summary(); if (s) s.textContent = t; };

            const apiBtn = document.getElementById('btn-run-api-tests');
            apiBtn?.addEventListener('click', async () => {
                clear(); setSummary('Running API tests...');
                try {
                    const r = await fetch('/api/tests/api');
                    const j = await r.json();
                    if (!j.success) throw new Error(j.error || 'failed');
                    append(JSON.stringify(j, null, 2));
                    const pass = j.results.filter(x=>x.ok).length;
                    setSummary(`API: ${pass}/${j.results.length} reachable`);
                    document.getElementById('dev-test-details').open = true;
                } catch (e) { append('API test error: '+e.message); setSummary('API tests error'); }
            });

            const serialBtn = document.getElementById('btn-run-serial-test');
            serialBtn?.addEventListener('click', async () => {
                clear(); setSummary('Querying serial status...');
                try {
                    const r = await fetch('/api/tests/serial');
                    const j = await r.json();
                    if (!j.success) throw new Error(j.error || 'failed');
                    append(JSON.stringify(j, null, 2));
                    setSummary(j.available ? (j.status?.open ? 'Serial: OPEN' : 'Serial: CLOSED') : 'Serial: N/A');
                    document.getElementById('dev-test-details').open = true;
                } catch (e) { append('Serial status error: '+e.message); setSummary('Serial status error'); }
            });

            const pokeBtn = document.getElementById('btn-run-serial-poke');
            pokeBtn?.addEventListener('click', async () => {
                clear(); setSummary('Poking serial...');
                try {
                    const r = await fetch('/api/tests/serial?poke=1');
                    const j = await r.json();
                    if (!j.success) throw new Error(j.error || 'failed');
                    append(JSON.stringify(j, null, 2));
                    setSummary(j.available ? (j.status?.open ? (j.pokeSent ? 'Serial: POKE SENT' : 'Serial: OPEN (poke failed)') : 'Serial: CLOSED') : 'Serial: N/A');
                    document.getElementById('dev-test-details').open = true;
                } catch (e) { append('Serial poke error: '+e.message); setSummary('Serial poke error'); }
            });

            // WiFi / HTTP specific buttons
            const wifiPingBtn = document.getElementById('btn-wifi-ping');
            wifiPingBtn?.addEventListener('click', async () => {
                clear(); setSummary('Pinging device...');
                try {
                    const dev = this.getSelectedDevice();
                    if(!dev || !dev.ip) throw new Error('No selected device IP');
                    const ok = await this.testRemoteHost(dev.ip);
                    append(JSON.stringify({ host: dev.ip, reachable: ok }, null, 2));
                    setSummary(ok ? 'Ping OK' : 'Ping failed');
                    document.getElementById('dev-test-details').open = true;
                } catch(e){ append('Ping error: '+e.message); setSummary('Ping error'); }
            });
            const wifiStatusBtn = document.getElementById('btn-wifi-status');
            wifiStatusBtn?.addEventListener('click', async () => {
                clear(); setSummary('Fetching WiFi status...');
                try {
                    const dev = this.getSelectedDevice();
                    if(!dev || !dev.ip) throw new Error('No selected device IP');
                    await this.updateDeviceWifiStatus(dev);
                    append('WiFi status updated in device card.');
                    setSummary('WiFi status refreshed');
                } catch(e){ append('WiFi status error: '+e.message); setSummary('WiFi status error'); }
            });

            // Initial hide/show based on current selection
            try { this.refreshTestControlsMode(); } catch(_) {}
        } catch (e) { /* ignore */ }
    }

    // Toggle visibility of test controls depending on selected device communication mode
    refreshTestControlsMode(){
        const wrap = document.getElementById('dev-test-controls');
        if(!wrap) return;
        const dev = this.getSelectedDevice();
        const mode = dev?.meta?.commMode || 'serial';
        // Hide/show groups
        wrap.querySelectorAll('.mode-serial-only').forEach(el => {
            el.style.display = (mode === 'serial') ? '' : 'none';
        });
        wrap.querySelectorAll('.mode-wifi-only').forEach(el => {
            el.style.display = (mode === 'wifi') ? '' : 'none';
        });
        // Update summary hint when switching modes
        const summary = document.getElementById('dev-test-summary');
        if(summary){
            if(!dev) summary.textContent = 'No device selected';
            else summary.textContent = mode === 'serial' ? 'Serial test tools' : 'HTTP/WiFi test tools';
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

    // --- Device WiFi status helpers ---
    async getWifiStatusForHost(host) {
        if (!host) return { online: false };
        // Prefer unified summary endpoint first, then status, falling back to minimal ping
        const attempts = ['/api/wifi/summary', '/api/wifi/status', '/api/ping'];
        for (const p of attempts) {
            try {
                const url = `/device${p}?host=${encodeURIComponent(host)}`;
                const res = await fetch(url, { method: 'GET' });
                if (!res.ok) continue;
                const data = await res.json().catch(() => ({}));

                if (p === '/api/wifi/summary' && data) {
                    return {
                        online: !!data.connected,
                        ssid: data.ssid || '',
                        rssi: typeof data.rssi === 'number' ? data.rssi : undefined,
                        ip: data.ip || data.localIP || '',
                        channel: data.channel,
                        apActive: !!data.apActive
                    };
                }
                if (p === '/api/wifi/status' && data) {
                    const sta = data.sta || {};
                    return {
                        online: !!sta.connected,
                        ssid: sta.ssid || '',
                        rssi: typeof sta.rssi === 'number' ? sta.rssi : undefined,
                        ip: sta.ip || data.ip || '',
                        channel: sta.channel
                    };
                }
                if (p === '/api/ping' && data && data.ok) {
                    return { online: true };
                }
            } catch (_) {
                // try next
            }
        }
        return { online: false };
    }

    async updateDeviceWifiStatus(dev) {
        if (this._serverWifiPushEnabled) return; // server push active; skip legacy fetch
        try {
            const el = document.getElementById(`wifi-status-${dev.id}`);
            if (!el) return;
            if (!dev.ip) { el.innerHTML = '<span class="muted">WiFi: no IP set</span>'; return; }

            const info = await this.getWifiStatusForHost(dev.ip);
            const dot = `<span class="status-dot ${info.online ? 'status-online' : 'status-offline'}"></span>`;
            if (info.online) {
                const parts = [];
                if (info.ssid) parts.push(`SSID "${info.ssid}"`);
                if (info.rssi !== undefined) parts.push(`${info.rssi} dBm`);
                if (info.ip) parts.push(`IP ${info.ip}`);
                if (info.channel) parts.push(`ch ${info.channel}`);
                el.innerHTML = `${dot}<span>WiFi: Connected${parts.length ? ' • ' + parts.join(' • ') : ''}</span>`;
            } else {
                // Add inline WiFi scan action when offline
                const btnId = `wifi-scan-btn-${dev.id}`;
                el.innerHTML = `${dot}<span>WiFi: Offline</span> <button id="${btnId}" class="btn btn-small btn-outline" style="margin-left:6px"><i class="fas fa-wifi"></i> Scan</button>`;
                // Wire the scan button (idempotent by reassigning handler)
                const btn = document.getElementById(btnId);
                if (btn) {
                    btn.onclick = () => this.openWifiScanModal(dev);
                }
            }
        } catch (e) {
            // ignore update errors
        }
    }

    refreshAllDevicesWifiStatus() {
        if (this._serverWifiPushEnabled) return; // skip when push active
        try {
            if (!Array.isArray(this.devices)) return;
            this.devices.forEach(d => {
                // Only refresh if card element exists on page
                if (document.getElementById(`wifi-status-${d.id}`)) {
                    this.updateDeviceWifiStatus(d).catch(() => {});
                }
            });
        } catch (e) { /* ignore */ }
    }

    // --- Quick WiFi Scan Modal for a device ---
    openWifiScanModal(device) {
        try {
            const modal = document.getElementById('wifi-scan-modal');
            if (!modal) return alert('WiFi scan modal not found');
            modal.style.display = 'block';

            // Populate fields
            const title = document.getElementById('wifi-scan-title');
            const hostEl = document.getElementById('wifi-scan-host');
            const ssidEl = document.getElementById('wifi-scan-ssid');
            const passEl = document.getElementById('wifi-scan-pass');
            const statusEl = document.getElementById('wifi-scan-status');
            const listEl = document.getElementById('wifi-scan-list');
            if (title) title.textContent = `WiFi Setup: ${device.name || device.id}`;
            if (hostEl) hostEl.value = device.ip || '';
            if (ssidEl) ssidEl.value = '';
            if (passEl) passEl.value = '';
            if (statusEl) statusEl.textContent = '';
            if (listEl) listEl.innerHTML = '<em>Scanning...</em>';

            // Store device id for later submit
            modal.setAttribute('data-device-id', device.id);

            // Wire close buttons once
            const closeEls = [document.getElementById('wifi-scan-close'), document.getElementById('wifi-scan-cancel')];
            closeEls.forEach(el => { if (el && !el.__wired) { el.addEventListener('click', () => modal.style.display = 'none'); el.__wired = true; }});
            const sendBtn = document.getElementById('wifi-scan-send');
            if (sendBtn && !sendBtn.__wired) {
                sendBtn.addEventListener('click', () => this.sendWifiCredentialsFromModal());
                sendBtn.__wired = true;
            }

            // Kick off scan
            this.scanNetworksForHost(device.ip).catch(err => {
                if (statusEl) statusEl.textContent = `Scan error: ${err.message}`;
            });
        } catch (e) {
            alert(`Error opening WiFi scan: ${e.message}`);
        }
    }

    async scanNetworksForHost(host) {
        const listEl = document.getElementById('wifi-scan-list');
        const statusEl = document.getElementById('wifi-scan-status');
        if (!host) {
            if (statusEl) statusEl.textContent = 'Set device host/IP first';
            return;
        }
        try {
            if (statusEl) statusEl.textContent = 'Scanning...';
            const r = await fetch(`/api/device/wifi/scan?host=${encodeURIComponent(host)}`);
            const j = await r.json();
            if (!j.success) throw new Error(j.error || 'scan failed');
            const networks = Array.isArray(j.networks) ? j.networks : [];
            if (statusEl) statusEl.textContent = `Found ${networks.length} networks`;
            this.renderWifiScanList(networks);
        } catch (e) {
            if (statusEl) statusEl.textContent = `Error: ${e.message}`;
            if (listEl) listEl.innerHTML = '<em>Scan failed</em>';
        }
    }

    renderWifiScanList(list) {
        const box = document.getElementById('wifi-scan-list');
        const ssidEl = document.getElementById('wifi-scan-ssid');
        if (!box) return;
        box.innerHTML = '';
        if (!Array.isArray(list) || list.length === 0) {
            box.innerHTML = '<em>No networks found</em>';
            return;
        }
        const table = document.createElement('table');
        table.className = 'simple-table';
        const thead = document.createElement('thead');
        thead.innerHTML = '<tr><th>SSID</th><th>RSSI</th><th>Security</th><th></th></tr>';
        table.appendChild(thead);
        const tbody = document.createElement('tbody');
        list.forEach(n => {
            const ssid = n.ssid || n.SSID || n.name || '';
            const rssi = n.rssi ?? n.RSSI ?? '';
            const sec = n.encryption || n.auth || n.type || '';
            const tr = document.createElement('tr');
            tr.innerHTML = `<td>${ssid}</td><td>${rssi}</td><td>${sec}</td><td><button class="btn btn-small" data-ssid="${ssid}">Use</button></td>`;
            tbody.appendChild(tr);
        });
        table.appendChild(tbody);
        box.appendChild(table);
        // Wire Use buttons
        box.querySelectorAll('button[data-ssid]').forEach(btn => {
            btn.addEventListener('click', () => {
                const ssid = btn.getAttribute('data-ssid') || '';
                if (ssidEl) ssidEl.value = ssid;
                // Also mirror into WiFi page if present
                try { const wifiPageSsid = document.getElementById('wifi-ssid'); if (wifiPageSsid) wifiPageSsid.value = ssid; } catch (_) {}
            });
        });
    }

    async sendWifiCredentialsFromModal() {
        const modal = document.getElementById('wifi-scan-modal');
        if (!modal) return;
        const host = (document.getElementById('wifi-scan-host')?.value || '').trim();
        const ssid = (document.getElementById('wifi-scan-ssid')?.value || '').trim();
        const password = document.getElementById('wifi-scan-pass')?.value || '';
        const statusEl = document.getElementById('wifi-scan-status');
        if (!host) { if (statusEl) statusEl.textContent = 'Enter device host/IP'; return; }
        if (!ssid) { if (statusEl) statusEl.textContent = 'Choose an SSID'; return; }
        try {
            if (statusEl) statusEl.textContent = 'Sending credentials...';
            const res = await fetch('/api/device/wifi/connect', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ host, ssid, password }) });
            const j = await res.json();
            if (!j.success) throw new Error(j.error || 'connect failed');
            if (statusEl) statusEl.textContent = 'Saved. Device will try to connect.';
            // Update device status shortly after
            const devId = modal.getAttribute('data-device-id');
            const dev = this.devices.find(d => d.id === devId);
            setTimeout(() => { if (dev) this.updateDeviceWifiStatus(dev); }, 3000);
            // Also prefill WiFi page fields if present
            try { const wSsid = document.getElementById('wifi-ssid'); if (wSsid) wSsid.value = ssid; const wPass = document.getElementById('wifi-pass'); if (wPass) wPass.value = password; } catch (_) {}
        } catch (e) {
            if (statusEl) statusEl.textContent = `Error: ${e.message}`;
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
        // Try to load config via API first, then fall back to socket
        this.loadConfigViaAPI().catch(() => {
            // Fallback to socket if available
            if (this.socket && this.connected) {
                this.socket.emit('load_config');
            }
        });
    }

    async loadConfigViaAPI() {
        try {
            const response = await fetch('/api/config');
            if (response.ok) {
                const config = await response.json();
                this.config = { ...this.config, ...config };
                // keep comPort aligned when manual mode enabled
                if (this.config.manualComOnly && this.config.allowedComPort) {
                    this.config.comPort = this.config.allowedComPort;
                }
                this.updateConfigUI();
                this.log('Configuration loaded via API', 'info');
            }
        } catch (error) {
            this.log('Failed to load config via API', 'warning');
            throw error;
        }
    }

    saveConfig() {
        // Try to save config via API first, then fall back to socket
        this.saveConfigViaAPI().catch(() => {
            // Fallback to socket if available
            if (this.socket && this.connected) {
                this.socket.emit('save_config', this.config);
            }
        });
    }

    async saveConfigViaAPI() {
        try {
            const response = await fetch('/api/config', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(this.config)
            });
            if (response.ok) {
                const result = await response.json();
                // reflect any enforced server settings
                if (result && result.config) {
                    this.config = { ...this.config, ...result.config };
                }
                this.log('Configuration saved via API', 'success');
                return result;
            }
        } catch (error) {
            this.log('Failed to save config via API', 'warning');
            throw error;
        }
    }

    refreshComPorts() {
        this.refreshComPortsViaAPI().catch(() => {
            // Fallback to socket if available
            if (this.socket && this.connected) {
                this.socket.emit('get_com_ports');
            }
        });
        this.log('Refreshing COM ports...', 'info');
    }

    // --- COM helpers copied from flash.js to keep behavior identical ---
    saveLastPort(p) {
        try { localStorage.setItem('oepl:lastPort', p); } catch (e) {}
    }
    loadLastPort() { try { return localStorage.getItem('oepl:lastPort') || null } catch (e) { return null } }

    // Populate header (#com-port-select) and device modal (#devCom) with ports
    async refreshPorts() {
        try {
            this.log('Refreshing COM ports (header)...', 'info');
            const r = await fetch('/api/com-ports');
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            const ports = await r.json();

            const headerSelect = document.getElementById('com-port-select');
            const deviceSelect = document.getElementById('devCom');
            if (headerSelect) headerSelect.innerHTML = '';
            if (deviceSelect) deviceSelect.innerHTML = '';

            // Manual mode: force-only COM10
            if (this.config.manualComOnly && this.config.allowedComPort) {
                const allowed = String(this.config.allowedComPort);
                const o = document.createElement('option');
                o.value = allowed;
                o.textContent = allowed;
                if (headerSelect) headerSelect.appendChild(o.cloneNode(true));
                if (deviceSelect) deviceSelect.appendChild(o.cloneNode(true));
                this.updateConfig('comPort', allowed);
                this.saveLastPort(allowed);
                this.log('Manual COM mode: forcing COM list to allowed port', 'info');
            } else if (Array.isArray(ports) && ports.length > 0) {
                ports.forEach(p => {
                    const val = p.path || p;
                    const o = document.createElement('option');
                    o.value = val;
                    o.textContent = val;
                    if (headerSelect) headerSelect.appendChild(o);
                    if (deviceSelect) deviceSelect.appendChild(o.cloneNode(true));
                });
                this.log(`Found ${ports.length} COM ports`, 'info');
            } else {
                ['COM1', 'COM3', 'COM10', 'COM13'].forEach(port => {
                    const o = document.createElement('option');
                    o.value = port;
                    o.textContent = port;
                    if (headerSelect) headerSelect.appendChild(o);
                    if (deviceSelect) deviceSelect.appendChild(o.cloneNode(true));
                });
                this.log('Using fallback COM ports', 'warning');
            }

            const last = this.loadLastPort();
            if (last) {
                try { if (headerSelect) headerSelect.value = last; if (deviceSelect) deviceSelect.value = last; } catch (e) {}
            }
        } catch (e) {
            this.log(`Failed to refresh header COM ports: ${e.message}`, 'error');
            const headerSelect = document.getElementById('com-port-select');
            const deviceSelect = document.getElementById('devCom');
            if (headerSelect) headerSelect.innerHTML = '';
            if (deviceSelect) deviceSelect.innerHTML = '';
            const ports = (this.config.manualComOnly && this.config.allowedComPort) ? [this.config.allowedComPort] : ['COM1', 'COM3', 'COM10', 'COM13'];
            ports.forEach(port => {
                const o = document.createElement('option');
                o.value = port;
                o.textContent = port;
                if (headerSelect) headerSelect.appendChild(o);
                if (deviceSelect) deviceSelect.appendChild(o.cloneNode(true));
            });
        }
    }

    async refreshComPortsViaAPI() {
        try {
            const response = await fetch('/api/com-ports');
            if (!response.ok) {
                const msg = `HTTP ${response.status}${response.statusText ? ' '+response.statusText : ''}`;
                this.log(`COM ports API returned non-OK: ${msg}`, 'warning');
                throw new Error(msg);
            }
            let ports = [];
            try {
                ports = await response.json();
            } catch (e) {
                this.log('COM ports JSON parse error: '+e.message, 'error');
                throw e;
            }
            if (!Array.isArray(ports)) {
                this.log('COM ports response not array; forcing fallback', 'warning');
                throw new Error('invalid format');
            }
            this.updateComPorts(ports);
            this.log(`COM ports refreshed (${ports.length}) via API`, 'info');
            return ports;
        } catch (error) {
            this.log(`Failed to refresh COM ports via API: ${error.message}`, 'warning');
            throw error;
        }
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
                // try align header dropdown
                const headerSel = document.getElementById('com-port-select');
                if (headerSel) {
                    headerSel.innerHTML = '';
                    this._availableSerialPorts.forEach(p => {
                        const o = document.createElement('option');
                        o.value = p.path || p.comName || p.path;
                        o.textContent = o.value;
                        headerSel.appendChild(o);
                    });
                }
            } else {
                this.log('No serial ports returned', 'warning');
                this._availableSerialPorts = [];
                try { this._updateFlashEraseButtons(); } catch (e) { }
            }
        } catch (err) {
            this.log(`Error refreshing serial ports: ${err.message}`, 'error');
        }
    }

    sendSelectedSerialCommand() {
        try {
            const sel = document.getElementById('serial-cmd-list');
            const input = document.getElementById('serial-send');
            if (!sel || !input) return;
            const cmd = sel.value || '';
            if (!cmd) { this.log('Select a command to send', 'warning'); return; }
            input.value = cmd;
            this.sendSerial();
        } catch (e) {
            this.log(`Failed to send selected command: ${e.message}`, 'error');
        }
    }

    async openSerialPort() {
        const select = document.getElementById('serial-port-select');
        // prefer explicit select if present, else use header or config
        const portPath = select && select.value ? select.value : (document.getElementById('com-port-select')?.value || this.config.comPort || 'COM10');
        if (!portPath) { this.log('No COM port selected', 'warning'); return; }
        try {
            const t0 = performance.now();
            const res = await fetch('/api/serial/open', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: portPath, baudRate: 115200 }) });
            const j = await res.json();
            const elapsed = j.elapsedMs != null ? j.elapsedMs : (performance.now() - t0);
            if (j.success) {
                this.log(`Opened serial ${portPath} (${Math.round(elapsed)} ms)`, 'success');
            } else {
                const msg = j.error || 'unknown';
                if (/timeout/i.test(msg)) {
                    this.log(`Serial open timeout after ${Math.round(elapsed)} ms for ${portPath}. Check: 1) Cable/Power 2) Driver 3) In-use by other program.`, 'error');
                } else {
                    this.log(`Failed to open serial: ${msg}`, 'error');
                }
            }
        } catch (err) {
            this.log(`Error opening serial port: ${err.message}`, 'error');
        }
    }

    async closeSerialPort() {
        const select = document.getElementById('serial-port-select');
        const portPath = select && select.value ? select.value : (document.getElementById('com-port-select')?.value || this.config.comPort || 'COM10');
        if (!portPath) { this.log('No COM port selected', 'warning'); return; }
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
        const input = document.getElementById('serial-send') || document.getElementById('serial-send-text');
        const portPath = select && select.value ? select.value : (document.getElementById('com-port-select')?.value || this.config.comPort || 'COM10');
        if (!input) { this.log('No serial input field found', 'warning'); return; }
        if (!portPath) { this.log('No COM port selected', 'warning'); return; }
        const data = input.value || '';
        const autoNL = document.getElementById('serial-auto-nl')?.checked;
        try {
            const url = autoNL ? '/api/serial/write?autoNL=1' : '/api/serial/write';
            const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: portPath, data }) });
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

    async reopenSerial() {
        const select = document.getElementById('serial-port-select');
        const baudSel = document.getElementById('serial-baud');
        const portPath = select && select.value ? select.value : (document.getElementById('com-port-select')?.value || this.config.comPort || 'COM10');
        const baudRate = baudSel ? parseInt(baudSel.value,10) || this.config.baudRate || 115200 : (this.config.baudRate || 115200);
        if (!portPath) { this.log('No COM port selected', 'warning'); return; }
        try {
            const r = await fetch('/api/serial/reopen', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ path: portPath, baudRate }) });
            const j = await r.json();
            if (j.success) {
                this.log(`Reopened ${portPath} @ ${baudRate}`, 'success');
                this.updateSerialStatus(true, portPath);
            } else {
                this.log(`Reopen failed: ${j.error || 'unknown'}`,'error');
            }
        } catch (e) { this.log('Reopen error: '+e.message,'error'); }
    }

    async diagnoseSerial() {
        try {
            const r = await fetch('/api/serial/diagnose');
            const j = await r.json();
            if (j.success) {
                this.log(`Serial diagnose: open=${j.status?.open?'yes':'no'} path=${j.status?.path||'-'} baud=${j.status?.baudRate||'-'} poke=${j.poked?'sent':'n/a'}`,'info');
                if (j.status?.open) this.updateSerialStatus(true, j.status.path);
            } else {
                this.log('Serial diagnose failed: '+(j.error||'unknown'),'error');
            }
        } catch (e) { this.log('Serial diagnose error: '+e.message,'error'); }
    }

    // Quick COM health check
    async checkCom() {
        try {
            const statusEl = document.getElementById('serial-check-status');
            if (statusEl) statusEl.textContent = 'Checking...';
            const portPath = (document.getElementById('serial-port-select')?.value) || (document.getElementById('com-port-select')?.value) || this.config.comPort || 'COM10';
            if (!portPath) { if (statusEl) statusEl.textContent = 'No COM selected'; return; }
            const r = await fetch('/api/com/check', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: portPath, testCmd: "\n", timeout: 800 }) });
            const j = await r.json();
            if (j.success) {
                if (statusEl) statusEl.textContent = 'OK';
                this.log(`COM check OK (${portPath})`, 'success');
            } else {
                if (statusEl) statusEl.textContent = 'Failed';
                this.log(`COM check failed: ${j.error || 'unknown'}`, 'error');
            }
        } catch (e) {
            const statusEl = document.getElementById('serial-check-status');
            if (statusEl) statusEl.textContent = `Error: ${e.message}`;
            this.log(`COM check error: ${e.message}`, 'error');
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
        // populate quick serial commands if dropdown present
        try { this.populateQuickSerialCommands(); } catch (e) { /* ignore */ }
    }

    // --- Console tailing (SSE) ---
    appendConsole(text, type = 'info') {
        try {
            const consoleEl = document.getElementById('console');
            if (consoleEl) {
                // Detect channel prefix like [node] or [api]
                let chan = 'misc';
                let raw = text;
                const m = text.match(/^\[(\w+)\]\s+(.*)$/);
                if (m) { chan = m[1]; raw = m[2]; }

                // Filtering (channel chips) – skip rendering if channel disabled
                if (this._channelFilter && this._channelFilter.length && !this._channelFilter.includes(chan)) {
                    // Still keep in buffer but do not render
                } else {
                    const line = document.createElement('div');
                    line.className = `console-line ${type}`;
                    line.dataset.chan = chan;
                    line.textContent = `[${chan}] ${raw}`;

                    // Search highlighting (simple substring, case-insensitive)
                    if (this._searchTerm && this._searchTerm.length > 1) {
                        const term = this._searchTerm;
                        const idx = raw.toLowerCase().indexOf(term.toLowerCase());
                        if (idx !== -1) {
                            const before = raw.slice(0, idx);
                            const match = raw.slice(idx, idx + term.length);
                            const after = raw.slice(idx + term.length);
                            line.innerHTML = `[${chan}] ` + this._escapeHtml(before) + '<mark>' + this._escapeHtml(match) + '</mark>' + this._escapeHtml(after);
                        }
                    }

                    consoleEl.appendChild(line);
                    consoleEl.scrollTop = consoleEl.scrollHeight;

                    // Bulk prune when exceeding threshold for performance
                    const max = 1000;
                    if (!this._consoleLineCount) this._consoleLineCount = 0;
                    this._consoleLineCount++;
                    if (this._consoleLineCount > max) {
                        // remove oldest 100 lines in one pass
                        let removed = 0;
                        while (consoleEl.firstChild && removed < 100) { consoleEl.removeChild(consoleEl.firstChild); removed++; }
                        this._consoleLineCount -= removed;
                    }
                }
            }
            // Buffer retention (bulk slice instead of shift spam)
            try {
                this.logBuffer.push({ ts: new Date().toISOString(), type, message: text });
                if (this.logBuffer.length > 6000) this.logBuffer = this.logBuffer.slice(-5000);
            } catch (_) { }
        } catch (_) { }
    }

    async populateQuickSerialCommands() {
        const sel = document.getElementById('serial-quick-cmd');
        if (!sel) return;
        try {
            const r = await fetch('/api/serial/commands');
            const j = await r.json();
            if (j && j.success && Array.isArray(j.commands)) {
                sel.innerHTML = '<option value="">--cmd--</option>' + j.commands.map(c => `<option value="${c}">${c}</option>`).join('');
            }
        } catch (e) {
            this.log('Failed to load quick serial commands: ' + e.message, 'warning');
        }
    }

    _escapeHtml(str) {
        try {
            return String(str)
                .replace(/&/g,'&amp;')
                .replace(/</g,'&lt;')
                .replace(/>/g,'&gt;')
                .replace(/"/g,'&quot;')
                .replace(/'/g,'&#39;');
        } catch (_) { return str; }
    }

    startTail() {
        try {
            const selected = document.getElementById('log-source')?.value || 'node';
            // stop any existing streams
            this.stopTail();

            if (typeof EventSource === 'undefined') {
                this.appendConsole(`[tail] EventSource not supported by this browser`, 'warning');
                return;
            }

            // Support multi-channel tail when 'all' selected
            const channels = ['node','python','serial','api','ws','client'];
            const targets = (selected === 'all') ? channels : [selected];
            this._multiSources = [];
            this._tailActive = true;
            try { const sBtn = document.getElementById('start-tail'); if (sBtn) sBtn.disabled = true; const pBtn = document.getElementById('stop-tail'); if (pBtn) pBtn.disabled = false; } catch (_) {}

            // Maintain retry state per channel
            this._tailRetry = {};
            const openChannel = (name) => {
                if (!this._tailActive) return;
                const url = `/api/log/stream?name=${encodeURIComponent(name)}`;
                try {
                    const es = new EventSource(url);
                    if (!this._multiSources) this._multiSources = [];
                    this._multiSources.push(es);
                    es.onopen = () => {
                        this._tailRetry[name] = { attempts:0, timer:null };
                        this.appendConsole(`[tail:${name}] connected`,'success');
                    };
                    es.onmessage = (ev) => {
                        try {
                            const data = JSON.parse(ev.data);
                            if (data.initial) {
                                const lines = String(data.initial).split(/\r?\n/).filter(Boolean);
                                lines.forEach(l => this.appendConsole(`[${name}] ${l}`, 'info'));
                            }
                            if (data.line) {
                                this.appendConsole(`[${name}] ${String(data.line).replace(/\n$/, '')}`, 'info');
                            }
                        } catch (e) {
                            if (ev.data) this.appendConsole(`[${name}] ${ev.data}`, 'info');
                        }
                    };
                    es.onerror = () => {
                        this.appendConsole(`[tail:${name}] error`, 'error');
                        try { es.close(); } catch(_){}
                        // schedule retry with backoff
                        if (!this._tailRetry[name]) this._tailRetry[name] = { attempts:0, timer:null };
                        const state = this._tailRetry[name];
                        state.attempts += 1;
                        const delay = Math.min(30000, 500 * Math.pow(2, state.attempts - 1)); // 0.5s,1s,2s,... up to 30s
                        this.appendConsole(`[tail:${name}] retry in ${(delay/1000).toFixed(1)}s (attempt ${state.attempts})`, 'warning');
                        state.timer = setTimeout(()=> openChannel(name), delay);
                    };
                } catch (e) {
                    this.appendConsole(`[tail:${name}] failed to open: ${e.message}`, 'error');
                    if (!this._tailRetry[name]) this._tailRetry[name] = { attempts:0, timer:null };
                    const state = this._tailRetry[name];
                    state.attempts += 1;
                    const delay = Math.min(30000, 500 * Math.pow(2, state.attempts - 1));
                    state.timer = setTimeout(()=> openChannel(name), delay);
                }
            };
            targets.forEach(openChannel);
            this.appendConsole(`Tailing ${targets.length === 1 ? `log '${targets[0]}'` : `${targets.length} logs (${targets.join(', ')})`}...`, 'success');
            // optional fetch list (once)
            fetch('/api/log/list').then(r => r.json()).then(j => {}).catch(()=>{});
        } catch (e) {
            this.appendConsole(`Tail start error: ${e.message}`, 'error');
        }
    }

    stopTail() {
        try {
            // Close legacy single source if present
            if (this._eventSource) { try { this._eventSource.close(); } catch (_) {} this._eventSource = null; }
            // Close any multi-sources
            if (this._multiSources && Array.isArray(this._multiSources)) {
                this._multiSources.forEach(es => { try { es.close(); } catch(_){} });
                this._multiSources = [];
            }
            if (this._tailRetry) {
                Object.values(this._tailRetry).forEach(r => { try { if (r.timer) clearTimeout(r.timer); } catch(_){} });
                this._tailRetry = null;
            }
            this._tailActive = false;
            try { const sBtn = document.getElementById('start-tail'); if (sBtn) sBtn.disabled = false; const pBtn = document.getElementById('stop-tail'); if (pBtn) pBtn.disabled = true; } catch (_) {}
        } catch (_) { }
    }

    // --- Enhanced Console UI Setup (Filters, Search, Export, AI) ---
    initConsoleEnhancements() {
        // Channel filter chips
        const container = document.getElementById('console-filters');
        if (container && !container.dataset.bound) {
            container.addEventListener('click', (e) => {
                const chip = e.target.closest('.console-filter-chip');
                if (!chip) return;
                chip.classList.toggle('active');
                const active = [...container.querySelectorAll('.console-filter-chip.active')].map(c=>c.dataset.chan);
                this._channelFilter = active.length === 0 ? [] : active; // empty => render none until user re-enables
                // Re-render from buffer
                this.refreshConsoleFromBuffer();
                try { localStorage.setItem('oepl.console.channels', JSON.stringify(this._channelFilter)); } catch(_){}
            });
            // Load persisted
            try {
                const saved = JSON.parse(localStorage.getItem('oepl.console.channels')||'null');
                if (Array.isArray(saved) && saved.length) {
                    [...container.querySelectorAll('.console-filter-chip')].forEach(ch=>{
                        if (!saved.includes(ch.dataset.chan)) ch.classList.remove('active');
                    });
                    this._channelFilter = saved;
                }
            } catch(_){}
            container.dataset.bound='1';
        }

        // Search input
        const searchInput = document.getElementById('console-search');
        if (searchInput && !searchInput.dataset.bound) {
            const handler = () => {
                this._searchTerm = searchInput.value.trim();
                this.refreshConsoleFromBuffer();
            };
            searchInput.addEventListener('input', handler);
            searchInput.dataset.bound='1';
        }
        const clearSearchBtn = document.getElementById('console-clear-search');
        if (clearSearchBtn && !clearSearchBtn.dataset.bound) {
            clearSearchBtn.addEventListener('click', ()=>{
                const si = document.getElementById('console-search');
                if (si) { si.value=''; this._searchTerm=''; this.refreshConsoleFromBuffer(); }
            });
            clearSearchBtn.dataset.bound='1';
        }

        // Collapse toggle
        const collapseBtn = document.getElementById('console-collapse');
        if (collapseBtn && !collapseBtn.dataset.bound) {
            collapseBtn.addEventListener('click', ()=>{
                const wrap = document.querySelector('.console-panel');
                if (!wrap) return;
                wrap.classList.toggle('console-collapsed');
                const collapsed = wrap.classList.contains('console-collapsed');
                collapseBtn.textContent = collapsed ? 'Expand' : 'Collapse';
                try { localStorage.setItem('oepl.console.collapsed', collapsed? '1':'0'); } catch(_){}
            });
            // load state
            try { if (localStorage.getItem('oepl.console.collapsed')==='1') collapseBtn.click(); } catch(_){}
            collapseBtn.dataset.bound='1';
        }

        // Export button
        const exportBtn = document.getElementById('console-export');
        if (exportBtn && !exportBtn.dataset.bound) {
            exportBtn.addEventListener('click', ()=>{
                try {
                    const lines = [...document.querySelectorAll('#console .console-line')].map(l=>l.textContent);
                    const blob = new Blob([lines.join('\n')], {type:'text/plain'});
                    const a = document.createElement('a');
                    a.href = URL.createObjectURL(blob);
                    a.download = 'console-log-'+Date.now()+'.txt';
                    document.body.appendChild(a); a.click(); setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); }, 100);
                } catch (e) { this.log('Export failed: '+e.message, 'error'); }
            });
            exportBtn.dataset.bound='1';
        }

        // Explain Errors (AI)
        const explainBtn = document.getElementById('console-explain-errors');
        if (explainBtn && !explainBtn.dataset.bound) {
            explainBtn.addEventListener('click', ()=> this.explainRecentErrors());
            explainBtn.dataset.bound='1';
        }

        // Keyboard shortcuts
        if (!this._kbBound) {
            window.addEventListener('keydown', (e)=>{
                if (e.ctrlKey && e.shiftKey && e.key.toLowerCase()==='l') {
                    const si = document.getElementById('console-search'); if (si) { si.focus(); si.select(); e.preventDefault(); }
                } else if (e.key==='F2') {
                    const btn = document.getElementById('start-tail');
                    if (this._tailActive) this.stopTail(); else if (btn) this.startTail();
                }
            });
            this._kbBound = true;
        }

        // Initial render from buffer if existed (e.g., after navigation resume)
        this.refreshConsoleFromBuffer();
    }

    refreshConsoleFromBuffer() {
        const consoleEl = document.getElementById('console');
        if (!consoleEl) return;
        consoleEl.innerHTML='';
        this._consoleLineCount = 0;
        (this.logBuffer||[]).forEach(entry => this.appendConsole(entry.message, entry.type));
    }

    explainRecentErrors() {
        try {
            const lines = [...document.querySelectorAll('#console .console-line')];
            const recent = lines.slice(-400); // search last 400 lines
            const errLines = recent.filter(l => /error|failed|exception|traceback/i.test(l.textContent)).slice(-25);
            if (!errLines.length) { this.appendConsole('[ai] No recent errors found to analyze','info'); return; }
            const payload = errLines.map(l=>l.textContent).join('\n');
            const prompt = `Analyze these log lines and summarize root causes + suggested fixes (concise):\n\n${payload}`;
            this.appendConsole('[ai] Analyzing recent errors...','info');
            fetch('/api/ai/chat', {
                method:'POST',
                headers:{'Content-Type':'application/json','x-agent-token': (localStorage.getItem('agentToken')||'')},
                body: JSON.stringify({ messages:[{role:'user', content: prompt}] })
            }).then(r=>r.json()).then(j=>{
                this.appendConsole('[ai] '+(j.reply||'No reply'), 'info');
            }).catch(e=>{ this.appendConsole('[ai] Error calling AI: '+e.message,'error'); });
        } catch (e) { this.appendConsole('[ai] Failed to prepare error analysis: '+e.message,'error'); }
    }

    // Quick API tests for the inline panel
    async testApiStatus() {
        const host = (document.getElementById('test-host')?.value || '').trim();
        const statusEl = document.getElementById('api-test-status');
        if (statusEl) statusEl.textContent = 'Testing...';
        try {
            if (host) {
                // Try device endpoints via proxy
                const tryPaths = ['/api/status', '/sysinfo', '/api/telemetry'];
                let ok = false, lastErr = '';
                for (const p of tryPaths) {
                    try {
                        const r = await fetch(`/device${p}?host=${encodeURIComponent(host)}`);
                        if (r.ok) { ok = true; break; }
                        lastErr = `HTTP ${r.status}`;
                    } catch (e) { lastErr = e.message; }
                }
                if (ok) {
                    if (statusEl) statusEl.textContent = `OK (${host})`;
                    this.log(`Device API reachable at ${host}`, 'success');
                } else {
                    if (statusEl) statusEl.textContent = `Failed (${lastErr})`;
                    this.log(`Device API test failed for ${host}: ${lastErr}`, 'error');
                }
                return;
            }
            // Local server API
            const r = await fetch('/api/status');
            if (r.ok) {
                if (statusEl) statusEl.textContent = 'OK (server)';
                this.log('Local /api/status OK', 'success');
            } else {
                if (statusEl) statusEl.textContent = `Failed (HTTP ${r.status})`;
                this.log(`Local /api/status failed: HTTP ${r.status}`, 'error');
            }
        } catch (e) {
            if (statusEl) statusEl.textContent = `Error: ${e.message}`;
            this.log(`API status test error: ${e.message}`, 'error');
        }
    }

    async testWifiScan() {
        const host = (document.getElementById('test-host')?.value || '').trim();
        const statusEl = document.getElementById('api-test-status');
        if (!host) { if (statusEl) statusEl.textContent = 'Set host/IP first'; return; }
        if (statusEl) statusEl.textContent = 'Scanning...';
        try {
            const r = await fetch(`/api/device/wifi/scan?host=${encodeURIComponent(host)}`);
            const j = await r.json();
            if (j.success) {
                const n = Array.isArray(j.networks) ? j.networks.length : 0;
                if (statusEl) statusEl.textContent = `Scan OK (${n})`;
                this.log(`WiFi scan on ${host}: ${n} networks`, 'success');
            } else {
                if (statusEl) statusEl.textContent = `Scan failed: ${j.error || 'unknown'}`;
                this.log(`WiFi scan failed: ${j.error || 'unknown'}`, 'error');
            }
        } catch (e) {
            if (statusEl) statusEl.textContent = `Error: ${e.message}`;
            this.log(`WiFi scan error: ${e.message}`, 'error');
        }
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

    // Build an args array suitable for passing to compile.py (accepts legacy flags) based on formConfig and overrides
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
    const formCfg = this.getFormConfig();
    // For compile-only, skip upload
    const args = this.buildCompileArgs(formCfg, { skipUpload: true });
    this.socket.emit('run_script', { script, args });
    }

    fastCompile() {
        if (this.currentProcess) return;

    this.log('Starting fast compilation (no upload)...', 'info');
        this.showProgress('Fast compiling...');
        this.currentProcess = 'fast_compile';
        this.updateButtons();

    const formCfg = this.getFormConfig();
    const args = this.buildCompileArgs(formCfg, { fastBuild: true, skipUpload: true });
    this.socket.emit('run_script', { script: 'fast_compile.py', args });
    }

    flash() {
        if (this.currentProcess) return;

        this.log(`Flashing to ${this.config.comPort}...`, 'info');
        this.showProgress('Flashing...');
        this.currentProcess = 'flash';
        this.updateButtons();

    // Flash (upload only) using legacy-compatible flags the Python script understands
    const formCfg = this.getFormConfig();
    const args = this.buildCompileArgs(formCfg, { skipBuild: true });
    // Ensure upload-only even if UI toggles are odd
    args.push('-Flash', '-Port', this.config.comPort);
    this.socket.emit('run_script', { script: 'compile.py', args });
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
                this.log('Starting build (compile.py)...', 'info');
                this.showProgress('Building...');
                this.currentProcess = 'build';
                this.updateButtons();
                this.socket.emit('run_script', { script: 'compile.py', args });
                break;
            }
            case 'upload': {
                const args = this.buildCompileArgs(formCfg, { skipBuild: true });
                this.log('Starting upload (compile.py)...', 'info');
                this.showProgress('Uploading...');
                this.currentProcess = 'upload';
                this.updateButtons();
                this.socket.emit('run_script', { script: 'compile.py', args });
                break;
            }
            case 'build-upload': {
                const args = this.buildCompileArgs(formCfg, {});
                this.log('Starting build + upload (compile.py)...', 'info');
                this.showProgress('Building & Uploading...');
                this.currentProcess = 'build-upload';
                this.updateButtons();
                this.socket.emit('run_script', { script: 'compile.py', args });
                break;
            }
            case 'fast-build': {
                const args = this.buildCompileArgs(formCfg, { fastBuild: true });
                this.log('Starting fast build (fast_compile.py)...', 'info');
                this.showProgress('Fast building...');
                this.currentProcess = 'fast-build';
                this.updateButtons();
                this.socket.emit('run_script', { script: 'fast_compile.py', args });
                break;
            }
            case 'clean': {
                const args = this.buildCompileArgs(formCfg, { clean: true, skipUpload: true });
                this.log('Starting clean (compile.py)...', 'info');
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
            case 'gzip-www': {
                this.log('Gzipping www files...', 'info');
                this.showProgress('Gzipping www files...');
                this.currentProcess = 'gzip_www';
                this.updateButtons();
                this.socket.emit('run_script', { script: 'gzip_wwwfiles.py', args: [] });
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

    gzipWwwFiles() {
        if (this.currentProcess) return;

        this.log('Gzipping www files...', 'info');
        this.showProgress('Gzipping www files...');
        this.currentProcess = 'gzip_www';
        this.updateButtons();

        this.socket.emit('run_script', { script: 'gzip_wwwfiles.py', args: [] });
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
        if (console) {
            console.innerHTML = '';
        }
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
    // new editing feature toggles
    const feEdit = document.getElementById('feature-code-editing');
    if (feEdit) feEdit.checked = !!this.aiConfig.features.codeEditing;
    const enApply = document.getElementById('editing-enable-file-edits');
    if (enApply) enApply.checked = !!(this.aiConfig.editing && this.aiConfig.editing.enableFileEdits);
    const maxSize = document.getElementById('editing-max-size');
    if (maxSize) maxSize.value = Math.round(((this.aiConfig.editing && this.aiConfig.editing.maxFileSize) || (200*1024)) / 1024);
    const allowedExt = document.getElementById('editing-allowed-ext');
    if (allowedExt) allowedExt.value = (this.aiConfig.editing && this.aiConfig.editing.allowedExtensions) ? this.aiConfig.editing.allowedExtensions.join(',') : '';
    const blockList = document.getElementById('editing-block-list');
    if (blockList) blockList.value = (this.aiConfig.editing && this.aiConfig.editing.blockList) ? this.aiConfig.editing.blockList.join(',') : '';
    const rootEl = document.getElementById('editing-root');
    if (rootEl) rootEl.value = (this.aiConfig.editing && this.aiConfig.editing.root) || '';
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
            },
            // include new features
            codeEditing: document.getElementById('feature-code-editing')?.checked
        };

        const editingCfg = {
            enableFileEdits: document.getElementById('editing-enable-file-edits')?.checked || false,
            maxFileSize: (parseInt(document.getElementById('editing-max-size')?.value,10) || 200) * 1024,
            allowedExtensions: (document.getElementById('editing-allowed-ext')?.value || '')
                .split(',').map(s=>s.trim()).filter(Boolean),
            blockList: (document.getElementById('editing-block-list')?.value || '')
                .split(',').map(s=>s.trim()).filter(Boolean),
            // root is controlled server-side; we send back for completeness but server may ignore if changed
            root: document.getElementById('editing-root')?.value || undefined
        };

        fetch('/api/ai/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...config, editing: editingCfg })
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

    /* ================= AI Code Editing (frontend) ================= */
    async initAICodeEditing() {
        const fileList = document.getElementById('ai-file-list');
        if (!fileList) return; // not on ai.html
        // Clear list first
        fileList.innerHTML = '';
        const statusEl = document.getElementById('ai-edit-status');
        const disabledEl = document.getElementById('ai-editing-disabled');
        try {
            const r = await fetch('/api/ai/files');
            const j = await r.json();
            if (!j.success) throw new Error(j.error || 'Failed');
            if (!j.enabled) {
                if (disabledEl) disabledEl.style.display = 'block';
                return; // editing disabled server side
            }
            if (disabledEl) disabledEl.style.display = 'none';
            const files = Array.isArray(j.files) ? j.files : [];
            files.forEach(f => {
                const opt = document.createElement('option');
                opt.value = f;
                opt.textContent = f;
                fileList.appendChild(opt);
            });
            if (statusEl) statusEl.textContent = `${files.length} files available.`;
        } catch (e) {
            if (statusEl) statusEl.textContent = `Error loading files: ${e.message}`;
        }
    }

    async aiLoadSelectedFile() {
        const list = document.getElementById('ai-file-list');
        const diffEl = document.getElementById('ai-diff');
        const proposedEl = document.getElementById('ai-proposed');
        const originalStore = document.getElementById('ai-original-file');
        const statusEl = document.getElementById('ai-edit-status');
        const applyBtn = document.getElementById('ai-apply-edit');
        if (!list || !list.value) { if (statusEl) statusEl.textContent = 'Select a file first.'; return; }
        const file = list.value;
        try {
            if (statusEl) statusEl.textContent = `Loading ${file}...`;
            const r = await fetch(`/api/ai/file?path=${encodeURIComponent(file)}`);
            const j = await r.json();
            if (!j.success) throw new Error(j.error || 'Failed');
            originalStore.textContent = j.content;
            if (diffEl) diffEl.textContent = '';
            if (proposedEl) proposedEl.textContent = '';
            if (applyBtn) applyBtn.disabled = true;
            if (statusEl) statusEl.textContent = `Loaded ${file} (${j.size} bytes). Enter an instruction and preview.`;
        } catch (e) {
            if (statusEl) statusEl.textContent = `Load failed: ${e.message}`;
        }
    }

    async aiPreviewEdit() {
        const list = document.getElementById('ai-file-list');
        const instr = document.getElementById('ai-edit-instruction');
        const originalStore = document.getElementById('ai-original-file');
        const diffEl = document.getElementById('ai-diff');
        const proposedEl = document.getElementById('ai-proposed');
        const statusEl = document.getElementById('ai-edit-status');
        const applyBtn = document.getElementById('ai-apply-edit');
        if (!list || !list.value) { if (statusEl) statusEl.textContent = 'Select a file first.'; return; }
        if (!instr || !instr.value.trim()) { if (statusEl) statusEl.textContent = 'Provide an instruction.'; return; }
        if (!originalStore || !originalStore.textContent) { if (statusEl) statusEl.textContent = 'Load the file first.'; return; }
        const file = list.value;
        const instruction = instr.value.trim();
        try {
            if (statusEl) statusEl.textContent = 'Requesting AI edit preview...';
            const r = await fetch('/api/ai/patch/preview', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: file, instruction })
            });
            const j = await r.json();
            if (!j.success) throw new Error(j.error || 'Failed');
            // render diff & proposed
            this.aiRenderDiff(j.diff, diffEl);
            if (proposedEl) proposedEl.textContent = j.newContent;
            if (applyBtn) applyBtn.disabled = false;
            if (statusEl) statusEl.textContent = `Preview ready. Review diff then Apply.`;
        } catch (e) {
            if (statusEl) statusEl.textContent = `Preview failed: ${e.message}`;
        }
    }

    async aiApplyEdit() {
        const list = document.getElementById('ai-file-list');
        const instr = document.getElementById('ai-edit-instruction');
        const statusEl = document.getElementById('ai-edit-status');
        const applyBtn = document.getElementById('ai-apply-edit');
        if (!list || !list.value) { if (statusEl) statusEl.textContent = 'Select a file first.'; return; }
        if (!instr || !instr.value.trim()) { if (statusEl) statusEl.textContent = 'Provide an instruction.'; return; }
        const file = list.value;
        const instruction = instr.value.trim();
        try {
            if (statusEl) statusEl.textContent = 'Applying edit...';
            if (applyBtn) applyBtn.disabled = true;
            const r = await fetch('/api/ai/patch/apply', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: file, instruction })
            });
            const j = await r.json();
            if (!j.success) throw new Error(j.error || 'Failed');
            if (statusEl) statusEl.textContent = `Edit applied to ${file}. (${j.size} bytes)`;
            this.log(`AI edit applied to ${file}`, 'success');
            // reload file into original store
            this.aiLoadSelectedFile();
        } catch (e) {
            if (statusEl) statusEl.textContent = `Apply failed: ${e.message}`;
            if (applyBtn) applyBtn.disabled = false;
        }
    }

    aiRenderDiff(diffObj, diffEl) {
        if (!diffEl) diffEl = document.getElementById('ai-diff');
        if (!diffEl) return;
        if (!diffObj || !Array.isArray(diffObj.lines)) { diffEl.textContent = 'No diff.'; return; }
        const header = diffObj.header || '';
        const lines = diffObj.lines.map(l => {
            const cls = l.startsWith('+') ? 'color:#16a34a' : l.startsWith('-') ? 'color:#dc2626' : 'color:#94a3b8';
            return `<span style="${cls}">${l.replace(/</g,'&lt;')}</span>`;
        }).join('\n');
        diffEl.innerHTML = `<code>${header ? header + '\n' : ''}${lines}</code>`;
    }

    aiClearEditPanels() {
        const diffEl = document.getElementById('ai-diff');
        const proposedEl = document.getElementById('ai-proposed');
        const instr = document.getElementById('ai-edit-instruction');
        const applyBtn = document.getElementById('ai-apply-edit');
        const statusEl = document.getElementById('ai-edit-status');
        if (diffEl) diffEl.textContent = '';
        if (proposedEl) proposedEl.textContent = '';
        if (instr) instr.value = '';
        if (applyBtn) applyBtn.disabled = true;
        if (statusEl) statusEl.textContent = 'Cleared.';
    }
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    const app = new ESP32DevUI();
    try { window.App = app; } catch (e) {}
    try { app.initConsoleEnhancements(); } catch (e) { console.error('Failed to init console enhancements', e); }

    /* ================= Global Progress Bar Init (Added) ================= */
    (function initGlobalProgress(){
        if (window.__globalProgressInit) return; window.__globalProgressInit = true;
        const existing = document.getElementById('global-progress-container');
        if (!existing) {
            const c = document.createElement('div');
            c.id = 'global-progress-container';
            const bar = document.createElement('div');
            bar.id = 'global-progress-bar';
            c.appendChild(bar);
            document.body.appendChild(c);
        }
        const bar = document.getElementById('global-progress-bar');
        const body = document.body;
        let activeRequests = 0;
        let startedAt = 0;
        let trickleTimer = null;
        let currentProgress = 0; // 0..1
        let hideTimeout = null;

        function setProgress(p, force){
            currentProgress = p = Math.min(1, Math.max(0, p));
            if (bar) bar.style.width = (p*100).toFixed(2)+'%';
            if (p>=1) finish();
        }
        function start(){
            if (activeRequests===0){
                startedAt = performance.now();
                body.classList.remove('progress-hiding');
                body.classList.add('progress-active');
                setProgress(0.02);
                trickle();
            }
            activeRequests++;
        }
        function done(){
            if (activeRequests>0) activeRequests--;
            if (activeRequests===0) {
                const elapsed = performance.now()-startedAt;
                // ensure minimum show time ~400ms for visibility
                const remaining = elapsed < 400 ? 400 - elapsed : 0;
                setTimeout(()=> setProgress(1), remaining);
            }
        }
        function finish(){
            clearInterval(trickleTimer); trickleTimer=null;
            if (hideTimeout) clearTimeout(hideTimeout);
            hideTimeout = setTimeout(()=>{
                body.classList.add('progress-hiding');
                body.classList.remove('progress-active');
                if (bar){ bar.style.width='0%'; }
                // reset state
                currentProgress = 0;
            }, 450); // allow fade
        }
        function trickle(){
            if (trickleTimer) return;
            trickleTimer = setInterval(()=>{
                if (activeRequests===0) { clearInterval(trickleTimer); trickleTimer=null; return; }
                // dynamic increment slows as it approaches 80%
                const target = currentProgress < 0.8 ? currentProgress + (0.03 + Math.random()*0.04) : currentProgress + 0.01;
                if (target < 0.98) setProgress(target);
            }, 250);
        }

        // Wrap fetch
        const origFetch = window.fetch;
        window.fetch = function(resource, options){
            const opts = options || {};
            if (!(opts && opts.noProgress)) start();
            let p;
            try { p = origFetch.apply(this, arguments); } catch (e){ done(); throw e; }
            return p.then(r=>{ if (!(opts && opts.noProgress)) done(); return r; })
                    .catch(err=>{ if (!(opts && opts.noProgress)) done(); throw err; });
        };

        // Navigation click handling (anchor tags) for internal links
        document.addEventListener('click', (e)=>{
            const a = e.target.closest ? e.target.closest('a') : null;
            if (!a) return;
            // only same-origin navigations without target _blank and with href
            const href = a.getAttribute('href');
            if (!href || href.startsWith('#') || a.target==='_blank') return;
            if (href.startsWith('http') && !href.startsWith(location.origin)) return;
            start();
        }, true);

        // When page is shown (bfcache) reset progress state
        window.addEventListener('pageshow', ()=>{
            activeRequests=0; finish();
        });

        // Expose API
        window.GlobalProgress = { start, done, set:setProgress, _state:()=>({activeRequests,currentProgress}) };
    })();
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
