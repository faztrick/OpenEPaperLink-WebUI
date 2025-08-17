// development.js
// Manage devices using NVS-style direct storage (no JSON serialization)

/*
  development.js - manage saved devices and selected device using NVS-style localStorage
  - Saved devices: individual keys per device property (e.g., 'oepl_devices_0_name', 'oepl_devices_0_ip')
  - Selected device: individual keys per property (e.g., 'oepl_selected_device_name', 'oepl_selected_device_ip')
  - Benefits: faster access, no JSON parsing overhead, more ESP32 NVS-like storage pattern
*/
(function () {
    const DEVICES_KEY = 'oepl_devices';
    const SELECTED_KEY = 'oepl_selected_device';

    function $id(id) { return document.getElementById(id); }

    // Device storage using NVS-style direct storage (no JSON)
    function loadDevices() {
        try {
            const devices = [];
            let index = 0;
            while (true) {
                const name = localStorage.getItem(`${DEVICES_KEY}_${index}_name`);
                if (!name) break;

                const device = {
                    id: localStorage.getItem(`${DEVICES_KEY}_${index}_id`) || `device_${index}_${Date.now()}`,
                    name: name,
                    ip: localStorage.getItem(`${DEVICES_KEY}_${index}_ip`) || '',
                    port: localStorage.getItem(`${DEVICES_KEY}_${index}_port`) || '',
                    description: localStorage.getItem(`${DEVICES_KEY}_${index}_description`) || ''
                };
                devices.push(device);
                index++;
            }
            return devices;
        } catch (e) {
            console.warn('Failed to load devices', e);
            return [];
        }
    }

    function saveDevices(list) {
        try {
            // Clear existing devices
            clearDeviceStorage();

            const clean = (list || []).filter(d => d && d.name && d.ip);
            clean.forEach((dev, idx) => {
                dev.id = dev.id || `device_${idx}_${Date.now()}`;
                localStorage.setItem(`${DEVICES_KEY}_${idx}_id`, dev.id);
                localStorage.setItem(`${DEVICES_KEY}_${idx}_name`, dev.name);
                localStorage.setItem(`${DEVICES_KEY}_${idx}_ip`, dev.ip);
                localStorage.setItem(`${DEVICES_KEY}_${idx}_port`, dev.port || '');
                localStorage.setItem(`${DEVICES_KEY}_${idx}_description`, dev.description || '');
            });
        } catch(e) {
            console.error('Failed to save devices:', e);
        }
    }

    function clearDeviceStorage() {
        // Remove all device entries
        let index = 0;
        while (localStorage.getItem(`${DEVICES_KEY}_${index}_name`)) {
            localStorage.removeItem(`${DEVICES_KEY}_${index}_id`);
            localStorage.removeItem(`${DEVICES_KEY}_${index}_name`);
            localStorage.removeItem(`${DEVICES_KEY}_${index}_ip`);
            localStorage.removeItem(`${DEVICES_KEY}_${index}_port`);
            localStorage.removeItem(`${DEVICES_KEY}_${index}_description`);
            index++;
        }
    }

    function loadSelected() {
        try {
            const name = localStorage.getItem(`${SELECTED_KEY}_name`);
            if (!name) return null;

            return {
                id: localStorage.getItem(`${SELECTED_KEY}_id`) || '',
                name: name,
                ip: localStorage.getItem(`${SELECTED_KEY}_ip`) || '',
                port: localStorage.getItem(`${SELECTED_KEY}_port`) || '',
                description: localStorage.getItem(`${SELECTED_KEY}_description`) || ''
            };
        }
        catch (e) { return null; }
    }

    function saveSelected(dev) {
        if (!dev) {
            localStorage.removeItem(`${SELECTED_KEY}_id`);
            localStorage.removeItem(`${SELECTED_KEY}_name`);
            localStorage.removeItem(`${SELECTED_KEY}_ip`);
            localStorage.removeItem(`${SELECTED_KEY}_port`);
            localStorage.removeItem(`${SELECTED_KEY}_description`);
        } else {
            localStorage.setItem(`${SELECTED_KEY}_id`, dev.id || '');
            localStorage.setItem(`${SELECTED_KEY}_name`, dev.name || '');
            localStorage.setItem(`${SELECTED_KEY}_ip`, dev.ip || '');
            localStorage.setItem(`${SELECTED_KEY}_port`, dev.port || '');
            localStorage.setItem(`${SELECTED_KEY}_description`, dev.description || '');
        }
        window.dispatchEvent(new CustomEvent('oepl:selected-device-changed', { detail: dev }));
    }

    function renderSavedDevices() {
        const container = $id('saved-devices');
        if (!container) return;
        const list = loadDevices();
        container.innerHTML = '';
        if (!list.length) {
            container.innerHTML = '<div style="color:var(--muted)">No saved devices.</div>';
            return;
        }

        list.forEach((d, idx) => {
            const card = document.createElement('div');
            card.className = 'device-card';
            card.style.marginBottom = '8px';
            // attach data attributes so other UI code can find and highlight cards
            const ipVal = (d.ip || d.host || '').trim();
            if (ipVal) card.setAttribute('data-ip', ipVal);
            if (d.com) card.setAttribute('data-com', String(d.com));
            card.innerHTML = `
                <div style="display:flex;justify-content:space-between;align-items:center">
                    <div>
                        <strong>${escapeHtml(d.name || d.label || 'Device')}</strong>
                        <div style="font-size:12px;color:#6b7280">${escapeHtml(ipVal)}${d.com? ' • ' + escapeHtml(d.com) : ''}</div>
                    </div>
                    <div style="display:flex;gap:6px">
                        <button class="btn btn-small" data-idx="${idx}" data-action="select">Select</button>
                        <button class="btn btn-small" data-idx="${idx}" data-action="edit">Edit</button>
                        <button class="btn btn-small" data-idx="${idx}" data-action="delete">Delete</button>
                    </div>
                </div>`;
            container.appendChild(card);
        });

        // Ensure the selection/highlight UI updates after rendering
        try { if (window.updateDeviceCardSelectionUI) setTimeout(() => window.updateDeviceCardSelectionUI(), 20); } catch (_) {}
    }

    // Device Edit Modal logic
    function openDeviceEditModal(identifier) {
        // identifier can be IP or host
        const list = loadDevices();
        let dev = null; let idx = -1;
        // support numeric index or string index
        if ((typeof identifier === 'number' && Number.isInteger(identifier)) || (/^\d+$/.test(String(identifier)))) {
            idx = parseInt(identifier, 10);
            if (idx >= 0 && idx < list.length) dev = list[idx];
        } else if (!identifier && list.length) {
            dev = list[0]; idx = 0;
        } else {
            idx = list.findIndex(d => (d.ip === identifier || d.host === identifier));
            if (idx >= 0) dev = list[idx];
        }

        // populate fields (guarded)
        const nameEl = $id('edit-device-name');
        const ipEl = $id('edit-device-ip');
        const comEl = $id('edit-device-com');
        if (!nameEl || !ipEl || !comEl) {
            console.error('Device edit modal fields missing');
            return;
        }
        nameEl.value = dev ? (dev.name || dev.label || '') : '';
        ipEl.value = dev ? (dev.ip || dev.host || '') : (identifier || '');
        comEl.value = dev ? (dev.com || '') : '';

        // store editing index on modal element for later reference
    const modal = $id('device-edit-modal');
    if (!modal) { console.error('Device edit modal element not found'); return; }
    modal.dataset.editIndex = idx;
    modal.style.display = 'block';
    modal.setAttribute('aria-hidden', 'false');
    // focus first input for quick keyboard editing
    setTimeout(() => { const el = $id('edit-device-name'); if (el) el.focus(); }, 40);
    }

    function closeDeviceEditModal() {
    const modal = $id('device-edit-modal');
    if (!modal) { console.warn('closeDeviceEditModal: modal not found'); return; }
    modal.style.display = 'none';
    modal.removeAttribute('aria-hidden');
    }

    async function saveEditedDevice() {
    const modal = $id('device-edit-modal');
    if (!modal) { alert('Edit modal missing'); return; }
    const idx = parseInt((modal.dataset.editIndex || -1), 10);
    const nameEl = $id('edit-device-name');
    const ipEl = $id('edit-device-ip');
    const comEl = $id('edit-device-com');
    if (!nameEl || !ipEl || !comEl) { alert('Edit modal fields missing'); return; }
    const name = nameEl.value.trim();
    const ip = ipEl.value.trim();
    const com = comEl.value.trim();
        // basic validation: require non-empty host/ip
        if (!ip) { alert('Please enter device IP or host'); return; }
        // allow hostnames and IPv4 with optional port. Ask for confirmation if it looks odd
        const hostPattern = /^(https?:\/\/)?(([a-zA-Z0-9\-_.]+\.)*[a-zA-Z0-9\-_.]+|\d{1,3}(\.\d{1,3}){3})(:\d+)?$/;
        if (!hostPattern.test(ip)) {
            if (!confirm('Device host looks unusual — save anyway?')) return;
        }
    const list = loadDevices();
        if (idx >= 0 && idx < list.length) {
            list[idx] = { name, ip, com };
        } else {
            // append
            list.push({ name, ip, com });
        }
        saveDevices(list);
        renderSavedDevices();
        closeDeviceEditModal();
    }

    function deleteEditedDevice() {
        const modal = $id('device-edit-modal');
        if (!modal) { alert('Edit modal missing'); return; }
        const idx = parseInt((modal.dataset.editIndex || -1), 10);
        if (idx >= 0) {
            const list = loadDevices();
            list.splice(idx, 1);
            saveDevices(list);
            renderSavedDevices();
        }
        closeDeviceEditModal();
    }

    function escapeHtml(s) { return String(s || '').replace(/[&<>"']/g, function (c) { return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"})[c]; }); }

    function addDeviceFromForm() {
        const name = ($id('device-name') || {}).value || '';
    const ip = ($id('device-ip') || {}).value || '';
    const com = ($id('device-com') || {}).value || '';
        if (!name && !ip && !com) return alert('Enter at least a name or host/IP');

        const list = loadDevices();
        list.push({ name: name.trim(), ip: ip.trim(), com: com.trim() });
    saveDevices(list);
    renderSavedDevices();

    // select the newly added device and open edit modal (pop)
    const newIdx = list.length - 1;
    const newDev = list[newIdx];
    try { saveSelected(newDev); updateSelectedUI(newDev); } catch (_) {}
    // open the edit modal for the new device
    try { openDeviceEditModal(newIdx); } catch (_) {}

    // clear inputs
    if ($id('device-name')) $id('device-name').value = '';
    if ($id('device-ip')) $id('device-ip').value = '';
    if ($id('device-com')) $id('device-com').value = '';
    }

    function deleteDeviceAt(idx) {
        const list = loadDevices();
        if (idx < 0 || idx >= list.length) return;
        list.splice(idx, 1);
        saveDevices(list);
        renderSavedDevices();
    }

    function selectDeviceAt(idx) {
        const list = loadDevices();
        if (idx < 0 || idx >= list.length) return;
        const dev = list[idx];
        saveSelected(dev);
        updateSelectedUI(dev);
    }

    function updateSelectedUI(dev) {
        const nameEl = $id('selected-device-name');
        const ipEl = $id('selected-device-ip');
        const comEl = $id('selected-device-com');
        const openBtn = $id('open-selected-webui');
        const pingBtn = $id('ping-selected');

        if (!dev) {
            if (nameEl) nameEl.textContent = 'None';
            if (ipEl) ipEl.textContent = '-';
            if (comEl) comEl.textContent = '-';
            if (openBtn) openBtn.disabled = true;
            if (pingBtn) pingBtn.disabled = true;
            return;
        }

        if (nameEl) nameEl.textContent = dev.name || dev.label || 'Device';
        if (ipEl) ipEl.textContent = dev.ip || dev.host || '-';
        if (comEl) comEl.textContent = dev.com || '-';

        if (openBtn) {
            openBtn.disabled = !dev.ip && !dev.host;
            openBtn.onclick = () => {
                const host = dev.ip || dev.host;
                if (!host) return;
                const url = host.startsWith('http') ? host : `http://${host}`;
                window.open(url, '_blank');
            };
        }

        if (pingBtn) {
            pingBtn.disabled = !dev.ip && !dev.host;
            pingBtn.onclick = () => pingDevice(dev.ip || dev.host);
        }
    }

    // Public API: allow external pages to set the selected device
    window.setSelectedDevice = function (deviceObj) {
        if (!deviceObj) {
            saveSelected(null);
            updateSelectedUI(null);
            return;
        }
        try {
            saveSelected(deviceObj);
            updateSelectedUI(deviceObj);
            window.dispatchEvent(new CustomEvent('oepl:selected-device-changed', { detail: deviceObj }));
        } catch (e) { console.error(e); }
    };

    window.getSelectedDevice = function () { return loadSelected(); };

    function pingDevice(host) {
        if (!host) return alert('No host to ping');
        const url = host.startsWith('http') ? host : `http://${host}`;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3000);
        fetch(url, { method: 'GET', mode: 'no-cors', signal: controller.signal })
            .then(() => { clearTimeout(timeout); alert(`Ping to ${host} seems reachable (request sent).`); })
            .catch((err) => {
                clearTimeout(timeout);
                if (err.name === 'AbortError') alert(`Ping to ${host} timed out.`);
                else { console.warn(err); alert(`Ping to ${host} failed (network error).`); }
            });
    }

    // Wire up form and saved devices actions
    document.addEventListener('DOMContentLoaded', () => {
        renderSavedDevices();

        const addBtn = $id('device-add');
        if (addBtn) addBtn.addEventListener('click', addDeviceFromForm);

        // delegated click for saved devices
        const container = $id('saved-devices');
        if (container) container.addEventListener('click', (ev) => {
            const btn = ev.target.closest('button');
            if (!btn) return;
            const idx = parseInt(btn.getAttribute('data-idx'), 10);
            const action = btn.getAttribute('data-action');
            if (action === 'select') selectDeviceAt(idx);
            else if (action === 'edit') {
                const list = loadDevices();
                const dev = list[idx];
                if (dev) openDeviceEditModal(dev.ip || dev.host || '');
            } else if (action === 'delete') deleteDeviceAt(idx);
        });

        // show currently selected
        const sel = loadSelected();
        updateSelectedUI(sel);

    // wire modal buttons
    const saveBtn = $id('device-edit-save');
    const delBtn = $id('device-edit-delete');
    const modal = $id('device-edit-modal');
    if (saveBtn) saveBtn.addEventListener('click', saveEditedDevice);
    if (delBtn) delBtn.addEventListener('click', deleteEditedDevice);
    if (modal) modal.addEventListener('click', (ev) => { if (ev.target === modal) closeDeviceEditModal(); });

    // proxy toggle wiring (global preference)
    const proxyCheckbox = $id('use-proxy-global');
    if (proxyCheckbox) {
        const stored = localStorage.getItem('oepl:useProxy');
        if (stored !== null) proxyCheckbox.checked = stored === 'true';
        proxyCheckbox.addEventListener('change', (e) => {
            try { localStorage.setItem('oepl:useProxy', e.target.checked ? 'true' : 'false'); } catch(_){}
        });
    }

    // keyboard support: Enter to save, Esc to close when modal open
    document.addEventListener('keydown', (ev) => {
        const m = $id('device-edit-modal');
        if (!m || m.style.display !== 'block') return;
        if (ev.key === 'Escape') closeDeviceEditModal();
        else if (ev.key === 'Enter') {
            const active = document.activeElement;
            if (active && active.tagName === 'TEXTAREA') return; // avoid accidental submit
            ev.preventDefault();
            saveEditedDevice();
        }
    });
    });

    // react to storage events in other tabs/windows
    window.addEventListener('storage', (ev) => {
        // Check for device list changes
        if (ev.key && ev.key.startsWith(DEVICES_KEY)) {
            renderSavedDevices();
        }
        // Check for selected device changes
        if (ev.key && ev.key.startsWith(SELECTED_KEY)) {
            updateSelectedUI(loadSelected());
        }
    });

})();

// Enhanced API Testing Functions
function initApiTesting() {
    // Quick test buttons
    document.querySelectorAll('.test-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const endpoint = btn.getAttribute('data-endpoint');
            const method = btn.getAttribute('data-method') || 'GET';
            const needsConfirm = btn.getAttribute('data-confirm') === 'true';

            if (needsConfirm && !confirm(`Are you sure you want to ${method} ${endpoint}?`)) {
                return;
            }

            await performApiTest(method, endpoint);
        });
    });

    // Custom request
    const sendCustomBtn = document.getElementById('send-custom');
    if (sendCustomBtn) {
        sendCustomBtn.addEventListener('click', async () => {
            const method = document.getElementById('custom-method').value;
            const endpoint = document.getElementById('custom-endpoint').value;
            const body = document.getElementById('custom-body').value;

            if (!endpoint) {
                alert('Please enter an endpoint');
                return;
            }

            await performApiTest(method, endpoint, body);
        });
    }

    // Response controls
    const clearResponseBtn = document.getElementById('clear-response');
    const copyResponseBtn = document.getElementById('copy-response');

    if (clearResponseBtn) {
        clearResponseBtn.addEventListener('click', () => {
            const responseEl = document.getElementById('api-response');
            if (responseEl) responseEl.textContent = 'Response cleared.';
        });
    }

    if (copyResponseBtn) {
        copyResponseBtn.addEventListener('click', async () => {
            const responseEl = document.getElementById('api-response');
            if (responseEl && responseEl.textContent) {
                try {
                    await navigator.clipboard.writeText(responseEl.textContent);
                    copyResponseBtn.textContent = 'Copied!';
                    setTimeout(() => copyResponseBtn.textContent = 'Copy', 2000);
                } catch (err) {
                    console.error('Failed to copy:', err);
                }
            }
        });
    }
}

async function performApiTest(method, endpoint, body = null) {
    const responseEl = document.getElementById('api-response');
    if (!responseEl) return;

    responseEl.textContent = `Sending ${method} ${endpoint}...`;

    try {
        // Determine base URL
        const useSelected = document.getElementById('default-to-selected-main')?.checked;
        const selected = window.getSelectedDevice && window.getSelectedDevice();
        let baseUrl = '';

        if (useSelected && selected && (selected.ip || selected.host)) {
            const host = selected.ip || selected.host;
            baseUrl = host.startsWith('http') ? host : `http://${host}`;
        } else {
            baseUrl = window.location.origin;
        }

        const url = endpoint.startsWith('http') ? endpoint : (baseUrl + endpoint);

        const options = {
            method: method.toUpperCase(),
            headers: {}
        };

        if (body && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
            try {
                JSON.parse(body);
                options.headers['Content-Type'] = 'application/json';
                options.body = body;
            } catch (e) {
                // Not JSON, send as form data or plain text
                options.body = body;
            }
        }

        const startTime = Date.now();
        const response = await fetch(url, options);
        const endTime = Date.now();
        const duration = endTime - startTime;

        const contentType = response.headers.get('content-type') || '';
        let responseBody;

        if (contentType.includes('application/json')) {
            try {
                responseBody = await response.json();
                responseBody = JSON.stringify(responseBody, null, 2);
            } catch (e) {
                responseBody = await response.text();
            }
        } else {
            responseBody = await response.text();
        }

        const result = [
            `${method} ${endpoint}`,
            `Status: ${response.status} ${response.statusText}`,
            `Duration: ${duration}ms`,
            `Content-Type: ${contentType}`,
            '',
            'Response Headers:',
            ...Array.from(response.headers.entries()).map(([key, value]) => `${key}: ${value}`),
            '',
            'Response Body:',
            responseBody
        ].join('\n');

        responseEl.textContent = result;

        // Log to debug console if available
        if (window.devTools && devTools.addDebugLog) {
            const statusColor = response.status < 400 ? 'SUCCESS' : 'ERROR';
            devTools.addDebugLog(`API ${method} ${endpoint}: ${response.status} (${duration}ms)`, statusColor);
        }

    } catch (error) {
        const errorMsg = `Request failed: ${error.message}`;
        responseEl.textContent = errorMsg;

        if (window.devTools && devTools.addDebugLog) {
            devTools.addDebugLog(`API ${method} ${endpoint}: ${error.message}`, 'ERROR');
        }
    }
}
// Enhanced Debug Console
function enhanceDebugConsole() {
    const debugLogEl = document.getElementById('debug-log');
    if (!debugLogEl) return;

    // Clear existing content and set up proper structure
    debugLogEl.innerHTML = '';

    // Log level filter
    const levelFilter = document.getElementById('debug-level-filter');
    if (levelFilter) {
        levelFilter.addEventListener('change', () => {
            filterLogsByLevel(levelFilter.value);
        });
    }

    // Enhanced addDebugLog function
    if (window.devTools) {
        const originalAddDebugLog = devTools.addDebugLog;
        devTools.addDebugLog = function(message, level = 'INFO') {
            const timestamp = new Date().toLocaleTimeString();
            const logLine = document.createElement('div');
            logLine.className = `log-line ${level.toLowerCase()}`;
            logLine.setAttribute('data-level', level);

            logLine.innerHTML = `
                <span class="timestamp">[${timestamp}]</span>
                <span class="level">[${level}]</span>
                <span class="message">${escapeHtml(message)}</span>
            `;

            debugLogEl.appendChild(logLine);
            debugLogEl.scrollTop = debugLogEl.scrollHeight;

            // Keep only last 100 log entries
            while (debugLogEl.children.length > 100) {
                debugLogEl.removeChild(debugLogEl.firstChild);
            }

            // Apply current filter
            const currentFilter = levelFilter ? levelFilter.value : 'ALL';
            if (currentFilter !== 'ALL') {
                filterLogsByLevel(currentFilter);
            }
        };
    }
}

function filterLogsByLevel(level) {
    const debugLogEl = document.getElementById('debug-log');
    if (!debugLogEl) return;

    const levelOrder = ['ERROR', 'WARN', 'INFO', 'DEBUG', 'TRACE'];
    const minLevel = levelOrder.indexOf(level);

    Array.from(debugLogEl.children).forEach(logLine => {
        const logLevel = logLine.getAttribute('data-level');
        const logLevelIndex = levelOrder.indexOf(logLevel);

        if (level === 'ALL' || (logLevelIndex !== -1 && logLevelIndex <= minLevel)) {
            logLine.style.display = 'flex';
        } else {
            logLine.style.display = 'none';
        }
    });
}

function escapeHtml(unsafe) {
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}
class DevelopmentTools {
    constructor() {
        this.socket = io();
        this.devices = new Map();
        this.debugLevel = 'INFO';
    this.selectedDevice = null;
        this.init();
    }

    init() {
        this.setupEventListeners();
    this.connectSocket();
    this.loadSelectedDevice();
    // Populate COM port lists using the same logic as Simple Flasher
    this.refreshPorts();
        this.refreshDeviceStatus();
        this.startPeriodicUpdates();
    }

    setupEventListeners() {
        // Build controls (guarded: some pages don't include these buttons)
        const quickBuildBtn = document.getElementById('quick-build');
        if (quickBuildBtn) quickBuildBtn.addEventListener('click', () => this.quickBuild());
        const buildUploadBtn = document.getElementById('build-upload');
        if (buildUploadBtn) buildUploadBtn.addEventListener('click', () => this.buildAndUpload());
        const analyzeBuildBtn = document.getElementById('analyze-build');
        if (analyzeBuildBtn) analyzeBuildBtn.addEventListener('click', () => this.analyzeBuild());

        // Debug console
        const debugCmd = document.getElementById('debug-command');
        if (debugCmd) debugCmd.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.sendDebugCommand();
        });

        // COM refresh button in header
        const comRefresh = document.getElementById('com-refresh');
        if (comRefresh) comRefresh.addEventListener('click', () => this.refreshPorts());

        // Header COM select change -> persist last port and copy to device form
        const headerCom = document.getElementById('com-port-select');
        if (headerCom) headerCom.addEventListener('change', (e) => {
            try { this.saveLastPort(e.target.value); } catch (_){ }
            const devCom = document.getElementById('device-com');
            if (devCom) devCom.value = e.target.value;
        });
    }

    connectSocket() {
        this.socket.on('connect', () => {
            this.addDebugLog('Connected to development server', 'INFO');
        });

        this.socket.on('build-progress', (data) => {
            this.updateBuildProgress(data);
        });

        this.socket.on('build-complete', (data) => {
            this.onBuildComplete(data);
        });

        this.socket.on('device-status', (data) => {
            this.updateDeviceStatus(data);
        });

        this.socket.on('memory-stats', (data) => {
            this.updateMemoryStats(data);
        });

        this.socket.on('debug-output', (data) => {
            this.addDebugLog(data.message, data.level);
        });
    }

    // Build Operations
    async quickBuild() {
        this.startBuild('Quick Build');
        try {
            const response = await fetch('/api/execute', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'fast-build' })
            });
            const result = await response.json();
            this.addDebugLog(`Fast build started: ${JSON.stringify(result)}`, 'INFO');
        } catch (error) {
            this.addDebugLog(`Build failed: ${error.message}`, 'ERROR');
        }
    }

    async buildAndUpload() {
        this.startBuild('Build & Upload');
        try {
            const response = await fetch('/api/execute', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'build-upload' })
            });
            const result = await response.json();
            this.addDebugLog(`Build & Upload started: ${JSON.stringify(result)}`, 'INFO');
        } catch (error) {
            this.addDebugLog(`Build & Upload failed: ${error.message}`, 'ERROR');
        }
    }

    async cleanBuild() {
        this.startBuild('Clean Build');
        try {
            const response = await fetch('/api/build', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type: 'clean' })
            });
            const result = await response.json();
            this.addDebugLog(`Clean build started: ${result.message}`, 'INFO');
        } catch (error) {
            this.addDebugLog(`Clean build failed: ${error.message}`, 'ERROR');
        }
    }

    async analyzeBuild() {
        this.addDebugLog('Starting build analysis...', 'INFO');
        try {
            const response = await fetch('/api/analyze-build');
            const result = await response.json();
            this.displayBuildAnalysis(result);
        } catch (error) {
            this.addDebugLog(`Analysis failed: ${error.message}`, 'ERROR');
        }
    }

    startBuild(buildType) {
        document.getElementById('build-status').textContent = 'Building...';
        document.getElementById('build-progress').style.display = 'block';
        this.updateBuildProgress({ progress: 0, message: `Starting ${buildType}...` });
    }

    updateBuildProgress(data) {
        const progressBar = document.getElementById('build-progress-fill');
        progressBar.style.width = `${data.progress || 0}%`;

        if (data.message) {
            this.addDebugLog(data.message, 'BUILD');
        }
    }

    onBuildComplete(data) {
        document.getElementById('build-status').textContent = data.success ? 'Success' : 'Failed';
        document.getElementById('build-progress').style.display = 'none';
        document.getElementById('last-build-time').textContent = new Date().toLocaleTimeString();

        if (data.firmwareSize) {
            document.getElementById('firmware-size').textContent = this.formatBytes(data.firmwareSize);
        }

        this.addDebugLog(`Build ${data.success ? 'completed' : 'failed'}: ${data.message}`, data.success ? 'SUCCESS' : 'ERROR');
    }

    // Device Management
    async loadSelectedDevice() {
        try {
            const res = await fetch('/api/devices');
            const j = await res.json();
            if (j && Array.isArray(j.devices)) {
                const selected = (j.selectedId && j.devices.find(d => d.id === j.selectedId)) || null;
                this.selectedDevice = selected;
                this.renderSelectedDevice();
            }
        } catch (err) {
            // fallback to localStorage using new NVS-style storage
            try {
                const selected = loadSelected();
                this.selectedDevice = selected;
                this.renderSelectedDevice();
            } catch (_) {}
        }
    }

    renderSelectedDevice() {
        const nameEl = document.getElementById('selected-device-name');
        const ipEl = document.getElementById('selected-device-ip');
        const comEl = document.getElementById('selected-device-com');
        const openBtn = document.getElementById('open-selected-webui');
        const pingBtn = document.getElementById('ping-selected');

        if (!nameEl || !ipEl || !comEl || !openBtn || !pingBtn) return;

        if (this.selectedDevice) {
            nameEl.textContent = this.selectedDevice.name || '(unnamed)';
            ipEl.textContent = this.selectedDevice.ip || '-';
            comEl.textContent = this.selectedDevice.com || '-';
            openBtn.disabled = !(this.selectedDevice.ip);
            pingBtn.disabled = !(this.selectedDevice.ip);
            openBtn.onclick = () => this.openDeviceWebUI(this.selectedDevice.ip);
            pingBtn.onclick = () => this.pingDevice(this.selectedDevice.ip);
        } else {
            nameEl.textContent = 'None';
            ipEl.textContent = '-';
            comEl.textContent = '-';
            openBtn.disabled = true;
            pingBtn.disabled = true;
        }
    }
    async refreshDeviceStatus() {
        try {
            const response = await fetch('/api/devices/status');
            const devices = await response.json();
            this.updateDeviceGrid(devices);
        } catch (error) {
            this.addDebugLog(`Failed to refresh device status: ${error.message}`, 'ERROR');
        }
    }

    updateDeviceGrid(devices) {
        // Update device status in the grid
        devices.forEach(device => {
            this.devices.set(device.ip, device);
        });
    }

    updateDeviceStatus(deviceData) {
        this.devices.set(deviceData.ip, deviceData);
        // Update UI elements for this device
    }

    // Memory Management
    updateMemoryStats(data) {
        if (data.heapFree) {
            document.getElementById('heap-free').textContent = this.formatBytes(data.heapFree);
        }
        if (data.stackUsage) {
            document.getElementById('stack-usage').textContent = this.formatBytes(data.stackUsage);
        }
        if (data.flashFree) {
            document.getElementById('flash-free').textContent = this.formatBytes(data.flashFree);
        }
        if (data.taskCount) {
            document.getElementById('task-count').textContent = data.taskCount;
        }
    }

    // Debug Console
    addDebugLog(message, level = 'INFO') {
        const logElement = document.getElementById('debug-log');
        const timestamp = new Date().toLocaleTimeString();
        const colorMap = {
            'ERROR': '#ff6b6b',
            'WARN': '#feca57',
            'INFO': '#48cae4',
            'DEBUG': '#5f27cd',
            'SUCCESS': '#00d2d3',
            'BUILD': '#ff9ff3',
            'TRACE': '#ff9f43'
        };

        const color = colorMap[level] || '#ffffff';
        const logLine = document.createElement('div');
        logLine.style.color = color;
        logLine.textContent = `[${timestamp}] [${level}] ${message}`;

        logElement.appendChild(logLine);
        logElement.scrollTop = logElement.scrollHeight;

        // Keep only last 100 log entries
        while (logElement.children.length > 100) {
            logElement.removeChild(logElement.firstChild);
        }
    }

    sendDebugCommand() {
        const commandInput = document.getElementById('debug-command');
        const command = commandInput.value.trim();

        if (!command) return;

        this.addDebugLog(`> ${command}`, 'INPUT');

        // Send command to server
        this.socket.emit('debug-command', { command });

        commandInput.value = '';
    }

    clearDebugLog() {
        document.getElementById('debug-log').innerHTML = '';
        this.addDebugLog('Debug log cleared', 'INFO');
    }

    saveDebugLog() {
        const logContent = document.getElementById('debug-log').textContent;
        const blob = new Blob([logContent], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = `debug-log-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`;
        a.click();

        URL.revokeObjectURL(url);
        this.addDebugLog('Debug log saved', 'INFO');
    }

    toggleDebugLevel() {
        const levels = ['ERROR', 'WARN', 'INFO', 'DEBUG', 'TRACE'];
        const currentIndex = levels.indexOf(this.debugLevel);
        this.debugLevel = levels[(currentIndex + 1) % levels.length];
        this.addDebugLog(`Debug level changed to: ${this.debugLevel}`, 'INFO');
    }

    // Utility Functions
    formatBytes(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    startPeriodicUpdates() {
        // Refresh device status every 30 seconds
        setInterval(() => {
            this.refreshDeviceStatus();
        }, 30000);

        // Update memory stats every 10 seconds
        setInterval(() => {
            this.socket.emit('request-memory-stats');
        }, 10000);
    }

    displayBuildAnalysis(analysis) {
        this.addDebugLog('=== Build Analysis ===', 'INFO');
        this.addDebugLog(`Firmware Size: ${this.formatBytes(analysis.firmwareSize)}`, 'INFO');
        this.addDebugLog(`Flash Usage: ${analysis.flashUsage}%`, 'INFO');
        this.addDebugLog(`RAM Usage: ${analysis.ramUsage}%`, 'INFO');
        this.addDebugLog(`Compilation Time: ${analysis.buildTime}s`, 'INFO');

        if (analysis.warnings && analysis.warnings.length > 0) {
            this.addDebugLog(`Warnings: ${analysis.warnings.length}`, 'WARN');
            analysis.warnings.forEach(warning => {
                this.addDebugLog(warning, 'WARN');
            });
        }

        if (analysis.errors && analysis.errors.length > 0) {
            this.addDebugLog(`Errors: ${analysis.errors.length}`, 'ERROR');
            analysis.errors.forEach(error => {
                this.addDebugLog(error, 'ERROR');
            });
        }
    }
}

async function callApiWithOptions(method, path, headersText, bodyText, respEl, baseOverride) {
    // Build URL using selected device or origin
    // baseOverride can be a full URL (http...) or host/ip. If provided use it.
    const sel = window.getSelectedDevice && window.getSelectedDevice();
    let base = '';
    if (baseOverride) {
        base = baseOverride;
    } else if (sel && (sel.ip || sel.host)) {
        base = sel.ip || sel.host;
    }
    if (base && !base.startsWith('http')) base = 'http://' + base;
    if (!base) base = window.location.origin;

    const url = path.startsWith('http') ? path : (base + path);

    const opts = { method: method.toUpperCase(), headers: {} };
    // parse headers text (one per line: Key: Value)
    headersText.split(/\r?\n/).map(l => l.trim()).filter(Boolean).forEach(line => {
        const idx = line.indexOf(':');
        if (idx > -1) {
            const k = line.slice(0, idx).trim();
            const v = line.slice(idx + 1).trim();
            opts.headers[k] = v;
        }
    });

    // set body if provided
    if (bodyText && (opts.method === 'POST' || opts.method === 'PUT' || opts.method === 'PATCH')) {
        // try to detect JSON
        try {
            JSON.parse(bodyText);
            opts.headers['Content-Type'] = opts.headers['Content-Type'] || 'application/json';
            opts.body = bodyText;
        } catch (e) {
            opts.body = bodyText;
        }
    }

    if (respEl) respEl.textContent = 'Sending...';

    const start = Date.now();
    const res = await fetch(url, opts);
    const took = Date.now() - start;
    const contentType = res.headers.get('content-type') || '';
    let body;
    if (contentType.includes('application/json')) {
        try { body = await res.json(); body = JSON.stringify(body, null, 2); } catch (e) { body = await res.text(); }
    } else {
        body = await res.text();
    }

    const out = `HTTP ${res.status} ${res.statusText} (took ${took}ms)\n\nHEADERS:\n${Array.from(res.headers.entries()).map(h=>h.join(': ')).join('\n')}\n\nBODY:\n${body}`;
    if (respEl) respEl.textContent = out;
    return { status: res.status, headers: res.headers, body };
}

// Tool Functions (called from HTML)
function runCodeAnalysis() {
    devTools.addDebugLog('Starting code analysis...', 'INFO');
    devTools.socket.emit('run-analysis', { type: 'code' });
}

function checkMemoryUsage() {
    devTools.addDebugLog('Checking memory usage...', 'INFO');
    devTools.socket.emit('run-analysis', { type: 'memory' });
}

function analyzePerformance() {
    devTools.addDebugLog('Analyzing performance...', 'INFO');
    devTools.socket.emit('run-analysis', { type: 'performance' });
}

function checkDependencies() {
    devTools.addDebugLog('Checking dependencies...', 'INFO');
    devTools.socket.emit('run-analysis', { type: 'dependencies' });
}

function monitorSerial() {
    devTools.addDebugLog('Opening serial monitor...', 'INFO');
    // Try to use selected device COM if present
    const com = (devTools.selectedDevice && devTools.selectedDevice.com) ? devTools.selectedDevice.com : null;
    if (com) {
        devTools.addDebugLog(`Using COM from selected device: ${com}`, 'INFO');
    try { saveLastPort(com); } catch(_){}
    }
    window.open('/monitor', '_blank');
}

function resetDevice() {
    devTools.addDebugLog('Resetting device...', 'WARN');
    const host = devTools.selectedDevice?.ip;
    if (!host) {
        devTools.addDebugLog('No selected device IP; cannot reset via Web API', 'ERROR');
        return;
    }
    // Use device-side reboot endpoint
    fetch(`/device/reboot?host=${encodeURIComponent(host)}`, { method: 'POST' })
        .then(r => r.text())
        .then(t => devTools.addDebugLog(`Reboot: ${t}`, 'SUCCESS'))
        .catch(err => devTools.addDebugLog(`Reset failed: ${err.message}`, 'ERROR'));
}

function eraseFlash() {
    if (confirm('Are you sure you want to erase the flash memory? This will remove all data on the device.')) {
        devTools.addDebugLog('Erasing flash memory...', 'WARN');
    const host = devTools.selectedDevice?.ip;
    if (!host) { devTools.addDebugLog('No selected device IP', 'ERROR'); return; }
    // No direct erase endpoint on device; keep as placeholder or implement via serial when applicable
    devTools.addDebugLog('Erase flash is not supported via device HTTP API; use local serial actions instead.', 'WARN');
    }
}

function uploadFilesystem() {
    devTools.addDebugLog('Uploading filesystem (use device file APIs)...', 'INFO');
    const host = devTools.selectedDevice?.ip;
    if (!host) { devTools.addDebugLog('No selected device IP', 'ERROR'); return; }
    // As an example, read /list_files root to validate API
    fetch(`/device/list_files?dir=${encodeURIComponent('/')}&host=${encodeURIComponent(host)}`)
        .then(r => r.json())
        .then(j => devTools.addDebugLog(`Device file list: ${JSON.stringify(j)}`, j.success ? 'SUCCESS' : 'ERROR'))
        .catch(err => devTools.addDebugLog(`File API failed: ${err.message}`, 'ERROR'));
}

// New endpoint helpers called from new UI buttons
function callWebApi() {
    devTools.addDebugLog('Calling sample Web API /sysinfo...', 'INFO');
    fetch('/sysinfo')
        .then(r => r.json())
        .then(json => {
            devTools.addDebugLog(`API /sysinfo response: ${JSON.stringify(json)}`, 'INFO');
        })
        .catch(err => devTools.addDebugLog(`Web API call failed: ${err.message}`, 'ERROR'));
}

// Simple UI helpers for the new test cards
async function runWebApiTest(path) {
    const out = document.getElementById('webapi-test-output');
    if (!out) return;
    out.textContent = 'Calling ' + path + '...';
    try {
        const r = await fetch(path);
        const ct = r.headers.get('content-type') || '';
        let body;
        if (ct.includes('application/json')) body = JSON.stringify(await r.json(), null, 2);
        else body = await r.text();
        out.textContent = `HTTP ${r.status} ${r.statusText}\n\n${body}`;
    } catch (e) {
        out.textContent = 'Request failed: ' + e.message;
    }
}

async function runSerialApiTest(action) {
    const out = document.getElementById('serial-test-output');
    if (!out) return;
    out.textContent = 'Calling ' + action + '...';
    try {
        const path = action.startsWith('/') ? action : '/' + action;
        const r = await fetch(path);
        const ct = r.headers.get('content-type') || '';
        let body;
        if (ct.includes('application/json')) body = JSON.stringify(await r.json(), null, 2);
        else body = await r.text();
        out.textContent = `HTTP ${r.status} ${r.statusText}\n\n${body}`;
    } catch (e) {
        out.textContent = 'Request failed: ' + e.message;
    }
}

// Attach UI listeners for test buttons (buttons use data-action/data-path)
function attachDevPageListeners() {
    try {
        document.querySelectorAll('button[data-action="webapi"]').forEach(btn => {
            // avoid attaching multiple handlers
            btn.removeEventListener('_dev_click', null);
            btn.addEventListener('click', () => {
                const path = btn.getAttribute('data-path');
                if (typeof runWebApiTest === 'function') runWebApiTest(path);
            });
        });

        document.querySelectorAll('button[data-action="serial"]').forEach(btn => {
            btn.removeEventListener('_dev_click', null);
            btn.addEventListener('click', () => {
                const path = btn.getAttribute('data-path');
                if (typeof runSerialApiTest === 'function') runSerialApiTest(path);
            });
        });
    } catch (e) {
        console.warn('attachDevPageListeners error:', e && e.message);
    }
}

// Auto-attach when DOM is ready
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', attachDevPageListeners);
else attachDevPageListeners();

function serialEndpoints() {
    devTools.addDebugLog('Querying serial ports (/list_serial_ports)...', 'INFO');
    fetch('/list_serial_ports')
        .then(r => r.json())
        .then(json => {
            devTools.addDebugLog(`/list_serial_ports: ${JSON.stringify(json)}`, 'INFO');
            // If ports present, try a quick com check on the first one (safe, will error if not available)
            if (json.ports && json.ports.length > 0) {
                const p = json.ports[0].path || json.ports[0].comName || json.ports[0];
                devTools.addDebugLog(`Performing quick COM check on ${p}...`, 'INFO');
                // Use the list_serial_ports check query if supported by server
                fetch('/list_serial_ports?check=' + encodeURIComponent(p))
                    .then(r => r.json()).then(rj => devTools.addDebugLog(`/list_serial_ports?check: ${JSON.stringify(rj)}`, 'INFO'))
                    .catch(e => devTools.addDebugLog(`/list_serial_ports?check failed: ${e.message}`, 'ERROR'));
            }
        })
        .catch(err => devTools.addDebugLog(`Serial list failed: ${err.message}`, 'ERROR'));
}

function wsEndpoints() {
    devTools.addDebugLog('Testing WebSocket endpoints by emitting request-memory-stats', 'INFO');
    // Request memory stats via websocket and wait for response (handled by socket 'memory-stats')
    devTools.socket.emit('request-memory-stats');
    // Also ask server for status update via websocket
    devTools.socket.emit('ai-analyze-project');
}

// Fetch and display API list from server
async function loadApiList() {
    const el = document.getElementById('api-list');
    if (!el) return;
    el.innerHTML = 'Loading...';
    try {
        const res = await fetch('/api/list');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (!json || !Array.isArray(json.routes)) {
            el.textContent = 'No routes returned';
            return;
        }

        // Render interactive route list: each row gets method/path, device selector, headers/body inputs and Send button
        el.innerHTML = '';
        // build device options from devTools.devices map and also include origin and selected-device
        const deviceOptions = [];
        let selectedDeviceValue = null;
        try {
            // selected device
            const sel = window.getSelectedDevice && window.getSelectedDevice();
            if (sel && (sel.ip || sel.host)) {
                selectedDeviceValue = sel.ip || sel.host;
                deviceOptions.push({ label: `Selected: ${sel.name || sel.ip || sel.host}`, value: sel.ip || sel.host });
            }
            // devices map
            if (window.devTools && devTools.devices) {
                devTools.devices.forEach((d, key) => {
                    const label = d.name ? `${d.name} (${d.ip || key})` : (d.ip || key);
                    deviceOptions.push({ label, value: d.ip || key });
                });
            }
        } catch (e) { /* ignore */ }
        // always allow origin
        deviceOptions.push({ label: 'This UI (origin)', value: window.location.origin });

        json.routes.forEach(r => {
            const row = document.createElement('div');
            row.style.borderBottom = '1px solid rgba(255,255,255,0.03)';
            row.style.padding = '8px 6px';
            row.style.display = 'grid';
            row.style.gridTemplateColumns = '120px 1fr 160px';
            row.style.gap = '8px';

            const info = document.createElement('div');
            info.textContent = `${r.method} ${r.path}` + (r.description ? ` — ${r.description}` : '');
            info.style.fontFamily = 'monospace';
            info.style.whiteSpace = 'nowrap';
            info.style.overflow = 'hidden';
            info.style.textOverflow = 'ellipsis';

            const controls = document.createElement('div');
            controls.style.display = 'flex';
            controls.style.flexDirection = 'column';

            // headers textarea
            const headers = document.createElement('textarea');
            headers.rows = 2;
            headers.placeholder = 'Headers (Key: Value per line)';
            headers.style.width = '100%';
            headers.style.fontFamily = 'monospace';
            headers.style.marginBottom = '6px';

            // body textarea
            const body = document.createElement('textarea');
            body.rows = 3;
            body.placeholder = 'Request body (for POST/PUT/PATCH)';
            body.style.width = '100%';
            body.style.fontFamily = 'monospace';

            controls.appendChild(headers);
            controls.appendChild(body);

            const rightCol = document.createElement('div');
            rightCol.style.display = 'flex';
            rightCol.style.flexDirection = 'column';
            rightCol.style.alignItems = 'stretch';

            // device selector
            const devSel = document.createElement('select');
            deviceOptions.forEach(opt => {
                const o = document.createElement('option');
                o.value = opt.value;
                o.textContent = opt.label;
                devSel.appendChild(o);
            });
            // If user enabled default-to-selected, pick that value if available
            const checkbox = document.getElementById('default-to-selected') || document.getElementById('default-to-selected-main');
            if (checkbox && checkbox.checked && selectedDeviceValue) {
                try { devSel.value = selectedDeviceValue; } catch (e) { /* ignore */ }
            }
            devSel.style.marginBottom = '6px';

            // send button
            const sendBtn = document.createElement('button');
            sendBtn.textContent = 'Send';
            sendBtn.style.padding = '6px 8px';
            sendBtn.style.cursor = 'pointer';

            // response area
            const resp = document.createElement('pre');
            resp.className = 'api-response';
            resp.style.whiteSpace = 'pre-wrap';
            resp.style.maxHeight = '240px';
            resp.style.overflow = 'auto';
            resp.style.marginTop = '8px';
            resp.style.background = 'rgba(0,0,0,0.4)';
            resp.style.padding = '8px';

        sendBtn.addEventListener('click', async () => {
                sendBtn.disabled = true;
                resp.textContent = 'Sending...';
                try {
            let base = devSel.value;
            // If devSel contains the origin string, pass it through; else it's ip/host
            // Normalize path: ensure leading slash when not absolute URL
            let pathVal = r.path || '/';
            if (!pathVal.startsWith('http') && !pathVal.startsWith('/')) pathVal = '/' + pathVal;
            await callApiWithOptions(r.method || 'GET', pathVal, headers.value || '', body.value || '', resp, base);
                } catch (e) {
                    resp.textContent = 'Request failed: ' + e.message;
                } finally {
                    sendBtn.disabled = false;
                }
            });

            rightCol.appendChild(devSel);
            rightCol.appendChild(sendBtn);

            // layout append
            row.appendChild(info);
            row.appendChild(controls);
            row.appendChild(rightCol);

            // full container with response below
            const container = document.createElement('div');
            container.appendChild(row);
            container.appendChild(resp);

            el.appendChild(container);
        });

        devTools.addDebugLog(`Loaded ${json.routes.length} API routes (interactive)`, 'INFO');
    } catch (err) {
        el.textContent = `Failed to load: ${err.message}`;
        devTools.addDebugLog(`Failed to load API list: ${err.message}`, 'ERROR');
    }
}

// Source Browser: load project file tree
async function loadSourceTree() {
    const el = document.getElementById('source-tree');
    if (!el) return;
    el.innerHTML = 'Loading...';
    try {
        const res = await fetch('/api/source-files/tree');
        const j = await res.json();
        if (!j.success || !j.tree) {
            el.textContent = 'Failed to load file tree';
            devTools.addDebugLog('Source tree: no tree returned', 'ERROR');
            return;
        }

        el.innerHTML = '';
        // j.tree is an array of file paths relative to repo
        j.tree.forEach(p => {
            const row = document.createElement('div');
            row.style.padding = '4px 0';
            row.style.cursor = 'pointer';
            row.textContent = p;
            row.title = p;
            row.onclick = () => showFile(p);
            el.appendChild(row);
        });
        devTools.addDebugLog(`Loaded ${j.tree.length} files`, 'INFO');
    } catch (err) {
        el.textContent = `Error: ${err.message}`;
        devTools.addDebugLog(`Failed to load source tree: ${err.message}`, 'ERROR');
    }
}

// Load recent files list
async function loadRecentFiles() {
    const el = document.getElementById('source-tree');
    if (!el) return;
    el.innerHTML = 'Loading recent...';
    try {
        const res = await fetch('/api/source-files/recent?limit=50');
        const j = await res.json();
        if (!j.success || !j.files) {
            el.textContent = 'Failed to load recent files';
            return;
        }
        el.innerHTML = '';
        j.files.forEach(f => {
            const row = document.createElement('div');
            row.style.padding = '4px 0';
            row.style.cursor = 'pointer';
            row.textContent = f.path || f;
            row.onclick = () => showFile(f.path || f);
            el.appendChild(row);
        });
        devTools.addDebugLog(`Loaded ${j.files.length} recent files`, 'INFO');
    } catch (err) {
        el.textContent = `Error: ${err.message}`;
        devTools.addDebugLog(`Failed to load recent files: ${err.message}`, 'ERROR');
    }
}

// Show single file content in viewer
async function showFile(path) {
    const fp = document.getElementById('file-path');
    const contentEl = document.getElementById('file-content');
    if (!contentEl || !fp) return;
    fp.textContent = path;
    contentEl.textContent = 'Loading...';
    try {
        const res = await fetch(`/api/source-files/read?path=${encodeURIComponent(path)}`);
        const j = await res.json();
        if (!j.success || !j.file) {
            contentEl.textContent = `Failed to load file: ${j.error || 'unknown'}`;
            return;
        }
        // j.file may be an object with content or raw string
        const txt = typeof j.file === 'string' ? j.file : (j.file.content || JSON.stringify(j.file, null, 2));
        contentEl.textContent = txt;
        devTools.addDebugLog(`Opened file ${path}`, 'INFO');
    } catch (err) {
        contentEl.textContent = `Error: ${err.message}`;
        devTools.addDebugLog(`Failed to open file ${path}: ${err.message}`, 'ERROR');
    }
}

function runUnitTests() {
    devTools.addDebugLog('Running unit tests...', 'INFO');
    devTools.socket.emit('run-tests', { type: 'unit' });
}

function testEndpoints() {
    devTools.addDebugLog('Testing API endpoints...', 'INFO');
    devTools.socket.emit('run-tests', { type: 'api' });
}

function benchmarkCode() {
    devTools.addDebugLog('Running performance benchmarks...', 'INFO');
    devTools.socket.emit('run-tests', { type: 'benchmark' });
}

function profileMemory() {
    devTools.addDebugLog('Profiling memory usage...', 'INFO');
    devTools.socket.emit('run-tests', { type: 'memory-profile' });
}

// COM port helpers (copied from flash.js)
function saveLastPort(p) {
    try { localStorage.setItem('oepl:lastPort', p); } catch(e){}
}
function loadLastPort(){ try { return localStorage.getItem('oepl:lastPort') || null } catch(e){ return null } }

async function refreshPorts(){
    try{
        devTools.addDebugLog('Refreshing COM ports...', 'INFO');
    const r = await fetch('/list_serial_ports');
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const ports = await r.json();

        const headerSelect = document.getElementById('com-port-select');
        const deviceSelect = document.getElementById('device-com');
        if (headerSelect) headerSelect.innerHTML = '';
        if (deviceSelect) deviceSelect.innerHTML = '';

        if (Array.isArray(ports) && ports.length > 0){
            ports.forEach(p=>{
                const val = p.path || p;
                const o=document.createElement('option');
                o.value = val;
                o.textContent = val;
                if (headerSelect) headerSelect.appendChild(o);
                if (deviceSelect) deviceSelect.appendChild(o.cloneNode(true));
            });
            devTools.addDebugLog(`Found ${ports.length} COM ports`, 'SUCCESS');
        } else {
            // fallback list
            ['COM1', 'COM3', 'COM10', 'COM13'].forEach(port => {
                const o=document.createElement('option');
                o.value = port;
                o.textContent = port;
                if (headerSelect) headerSelect.appendChild(o);
                if (deviceSelect) deviceSelect.appendChild(o.cloneNode(true));
            });
            devTools.addDebugLog('Using fallback COM ports', 'WARN');
        }

        const last = loadLastPort();
        if (last) {
            try{ if (headerSelect) headerSelect.value = last; if (deviceSelect) deviceSelect.value = last; }catch(e){}
        }
    }catch(e){
        devTools.addDebugLog(`Failed to refresh ports: ${e.message}`, 'ERROR');
        const headerSelect = document.getElementById('com-port-select');
        const deviceSelect = document.getElementById('device-com');
        if (headerSelect) headerSelect.innerHTML = '';
        if (deviceSelect) deviceSelect.innerHTML = '';
        ['COM1', 'COM3', 'COM10', 'COM13'].forEach(port => {
            const o=document.createElement('option');
            o.value = port;
            o.textContent = port;
            if (headerSelect) headerSelect.appendChild(o);
            if (deviceSelect) deviceSelect.appendChild(o.cloneNode(true));
        });
    }
}

// Upload Only action - calls server execute upload
async function uploadOnly() {
    devTools.addDebugLog('Starting upload only...', 'INFO');
    try {
        const res = await fetch('/api/execute', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'upload' })
        });
        const j = await res.json();
        devTools.addDebugLog(`Upload started: ${JSON.stringify(j)}`, 'INFO');
    } catch (err) {
        devTools.addDebugLog(`Upload failed: ${err.message}`, 'ERROR');
    }
}

function gitStatus() {
    devTools.addDebugLog('Checking git status...', 'INFO');
    devTools.socket.emit('git-command', { action: 'status' });
}

function createBackup() {
    devTools.addDebugLog('Creating project backup...', 'INFO');
    devTools.socket.emit('git-command', { action: 'backup' });
}

function diffChanges() {
    devTools.addDebugLog('Showing changes...', 'INFO');
    devTools.socket.emit('git-command', { action: 'diff' });
}

function tagRelease() {
    const version = prompt('Enter version tag (e.g., v1.2.3):');
    if (version) {
        devTools.addDebugLog(`Creating release tag: ${version}`, 'INFO');
        devTools.socket.emit('git-command', { action: 'tag', version });
    }
}

// Enhanced quick action button functionality
function initQuickActions() {
    const openBtn = document.getElementById('open-selected-webui');
    const pingBtn = document.getElementById('ping-selected');
    const rebootBtn = document.getElementById('call-device-reboot');
    const ledBtn = document.getElementById('call-device-led');

    if (openBtn) {
        openBtn.addEventListener('click', async () => {
            const selected = window.getSelectedDevice && window.getSelectedDevice();
            if (!selected || (!selected.ip && !selected.host)) {
                alert('No device selected or device has no IP address');
                return;
            }

            const host = selected.ip || selected.host;
            const url = host.startsWith('http') ? host : `http://${host}`;

            if (devTools && devTools.addDebugLog) {
                devTools.addDebugLog(`Opening Web UI for ${selected.name || host}`, 'INFO');
            }

            window.open(url, '_blank');
        });
    }

    if (pingBtn) {
        pingBtn.addEventListener('click', async () => {
            const selected = window.getSelectedDevice && window.getSelectedDevice();
            if (!selected || (!selected.ip && !selected.host)) {
                alert('No device selected or device has no IP address');
                return;
            }

            const host = selected.ip || selected.host;
            await performPing(host);
        });
    }

    if (rebootBtn) {
        rebootBtn.addEventListener('click', async () => {
            const selected = window.getSelectedDevice && window.getSelectedDevice();
            if (!selected || (!selected.ip && !selected.host)) {
                alert('No device selected or device has no IP address');
                return;
            }

            if (!confirm(`Are you sure you want to reboot ${selected.name || selected.ip || selected.host}?`)) {
                return;
            }

            const host = selected.ip || selected.host;
            await performReboot(host);
        });
    }

    if (ledBtn) {
        ledBtn.addEventListener('click', async () => {
            const selected = window.getSelectedDevice && window.getSelectedDevice();
            if (!selected || (!selected.ip && !selected.host)) {
                alert('No device selected or device has no IP address');
                return;
            }

            const host = selected.ip || selected.host;
            await performLedFlash(host);
        });
    }
}

async function performPing(host) {
    try {
        if (devTools && devTools.addDebugLog) {
            devTools.addDebugLog(`Pinging ${host}...`, 'INFO');
        }

        const url = host.startsWith('http') ? host : `http://${host}`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        const response = await fetch(url + '/api/features', {
            method: 'HEAD',
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        const status = response.status < 400 ? 'SUCCESS' : 'WARN';
        const message = `Ping to ${host}: HTTP ${response.status} (${response.statusText})`;

        if (devTools && devTools.addDebugLog) {
            devTools.addDebugLog(message, status);
        }

        alert(message);

    } catch (error) {
        const message = `Ping to ${host} failed: ${error.message}`;
        if (devTools && devTools.addDebugLog) {
            devTools.addDebugLog(message, 'ERROR');
        }
        alert(message);
    }
}

async function performReboot(host) {
    try {
        if (devTools && devTools.addDebugLog) {
            devTools.addDebugLog(`Rebooting device at ${host}...`, 'WARN');
        }

        const url = host.startsWith('http') ? host : `http://${host}`;
        const response = await fetch(url + '/reboot', { method: 'POST' });

        const message = `Reboot command sent to ${host}: HTTP ${response.status}`;
        const status = response.status < 400 ? 'SUCCESS' : 'ERROR';

        if (devTools && devTools.addDebugLog) {
            devTools.addDebugLog(message, status);
        }

        alert(message + '\nDevice may take a few moments to restart.');

    } catch (error) {
        const message = `Reboot failed for ${host}: ${error.message}`;
        if (devTools && devTools.addDebugLog) {
            devTools.addDebugLog(message, 'ERROR');
        }
        alert(message);
    }
}

async function performLedFlash(host) {
    try {
        if (devTools && devTools.addDebugLog) {
            devTools.addDebugLog(`Flashing LED on ${host}...`, 'INFO');
        }

        const url = host.startsWith('http') ? host : `http://${host}`;
        // Use a simple LED flash pattern
        const pattern = '3CE403000000000000000000';
        const response = await fetch(url + `/led_flash?pattern=${encodeURIComponent(pattern)}`);

        const responseText = await response.text();
        const message = `LED flash sent to ${host}: ${responseText}`;
        const status = response.status < 400 ? 'SUCCESS' : 'WARN';

        if (devTools && devTools.addDebugLog) {
            devTools.addDebugLog(message, status);
        }

        alert(message);

    } catch (error) {
        const message = `LED flash failed for ${host}: ${error.message}`;
        if (devTools && devTools.addDebugLog) {
            devTools.addDebugLog(message, 'ERROR');
        }
        alert(message);
    }
}

// Update quick action button states based on selected device
function updateQuickActionStates() {
    const selected = window.getSelectedDevice && window.getSelectedDevice();
    const hasValidDevice = selected && (selected.ip || selected.host);

    const actionButtons = [
        'open-selected-webui',
        'ping-selected',
        'call-device-reboot',
        'call-device-led'
    ];

    actionButtons.forEach(btnId => {
        const btn = document.getElementById(btnId);
        if (btn) {
            btn.disabled = !hasValidDevice;
        }
    });

    // Update device info display
    const nameEl = document.getElementById('selected-device-name');
    const ipEl = document.getElementById('selected-device-ip');
    const comEl = document.getElementById('selected-device-com');

    if (selected) {
        if (nameEl) nameEl.textContent = selected.name || selected.label || 'Device';
        if (ipEl) ipEl.textContent = selected.ip || selected.host || '-';
        if (comEl) comEl.textContent = selected.com || '-';
    } else {
        if (nameEl) nameEl.textContent = 'None';
        if (ipEl) ipEl.textContent = '-';
        if (comEl) comEl.textContent = '-';
    }
}

// Global instance
let devTools;

// Initialize when page loads
document.addEventListener('DOMContentLoaded', () => {
    devTools = new DevelopmentTools();

    // Initialize enhanced features
    initApiTesting();
    enhanceDebugConsole();
    initDeviceStatusMonitoring();
    initQuickActions();

    // Initialize memory refresh
    const refreshMemoryBtn = document.getElementById('refresh-memory');
    if (refreshMemoryBtn) {
        refreshMemoryBtn.addEventListener('click', () => {
            if (devTools && devTools.socket) {
                devTools.socket.emit('request-memory-stats');
                devTools.addDebugLog('Memory stats refresh requested', 'INFO');
            }
        });
    }

    // Listen for device selection changes
    window.addEventListener('oepl:selected-device-changed', () => {
        updateQuickActionStates();
        updateFirstCardStatus();
    });

    // Initial update of quick action states
    setTimeout(() => {
        updateQuickActionStates();
    }, 500);
});

// Enhanced device status monitoring
function initDeviceStatusMonitoring() {
    // Update status badges more frequently
    updateFirstCardStatus();
    setInterval(updateFirstCardStatus, 5000);

    // Monitor WebSocket connection
    if (window.devTools && devTools.socket) {
        devTools.socket.on('connect', () => {
            setBadge('badge-ws', 'WS: Connected', 'ok');
        });

        devTools.socket.on('disconnect', () => {
            setBadge('badge-ws', 'WS: Disconnected', 'error');
        });
    }
}

// Sidebar button wiring: Web API, Serial, Tag controls
document.addEventListener('DOMContentLoaded', () => {
    // Web API panel
    const callReboot = document.getElementById('call-reboot');
    const callGetDb = document.getElementById('call-get-db');
    const loadApi = document.getElementById('load-api-list');
    const refreshApi = document.getElementById('refresh-api-list');

    if (callReboot) callReboot.addEventListener('click', async () => {
        if (!confirm('Reboot AP now?')) return;
        try {
            const r = await fetch('/reboot', { method: 'POST' });
            const txt = await r.text();
            alert(`Reboot response: ${txt}`);
        } catch (e) { alert('Reboot failed: ' + e.message); }
    });

    if (callGetDb) callGetDb.addEventListener('click', async () => {
        try {
            // Prefer serial COM call when selected device has a com port configured
            const sel = window.getSelectedDevice && window.getSelectedDevice();
            if (sel && sel.com) {
                // Call the server-side serial API to request DB over COM
                try {
                    const res = await fetch('/api/serial/get-db', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ port: sel.com }) });
                    const json = await res.json();
                    const out = document.getElementById('api-list');
                    if (out) out.textContent = JSON.stringify(json, null, 2);
                    return;
                } catch (inner) {
                    // fallthrough to HTTP attempt
                    console.warn('Serial get-db failed, falling back to HTTP:', inner);
                }
            }

            // Fallback: try to request the DB via the selected device over proxied HTTP
            let base = '';
            if (sel && (sel.ip || sel.host)) base = sel.ip || sel.host;
            if (!base) {
                // try to use first device card in page
                const card = document.querySelector('.device-card[data-ip]');
                if (card) base = card.getAttribute('data-ip');
            }
            let url;
            if (base) {
                // Open via proxy path so browser doesn't need LAN access
                url = `/device/get_db?host=${encodeURIComponent(base)}`;
            } else {
                url = '/get_db';
            }

            const r = await fetch(url);
            const j = await r.json();
            const out = document.getElementById('api-list');
            if (out) out.textContent = JSON.stringify(j, null, 2);
        } catch (e) { alert('get_db failed: ' + e.message); }
    });

    if (loadApi) loadApi.addEventListener('click', () => loadApiList());
    if (refreshApi) refreshApi.addEventListener('click', () => loadApiList());

    // Serial & drives
    const refreshSerialBtn = document.getElementById('refresh-serial');
    const listSerialBtn = document.getElementById('list-serial');
    const listDrivesBtn = document.getElementById('list-drives');
    const comCheckBtn = document.getElementById('com-check');
    const serialSelect = document.getElementById('serial-port-select');
    const serialOutput = document.getElementById('serial-output');

    async function populateSerialSelect() {
        try {
            const r = await fetch('/list_serial_ports');
            const j = await r.json();
            if (Array.isArray(j)) {
                serialSelect.innerHTML = '';
                j.forEach(p => {
                    const opt = document.createElement('option');
                    opt.value = p.path || p;
                    opt.textContent = p.path || p;
                    serialSelect.appendChild(opt);
                });
            } else {
                serialSelect.innerHTML = '<option>none</option>';
            }
        } catch (e) {
            if (serialOutput) serialOutput.textContent = 'Serial list failed: ' + e.message;
        }
    }

    if (refreshSerialBtn) refreshSerialBtn.addEventListener('click', populateSerialSelect);
    if (listSerialBtn) listSerialBtn.addEventListener('click', async () => {
        try {
            const r = await fetch('/list_serial_ports');
            const j = await r.json();
            if (serialOutput) serialOutput.textContent = JSON.stringify(j, null, 2);
        } catch (e) { if (serialOutput) serialOutput.textContent = 'Error: ' + e.message; }
    });

    if (listDrivesBtn) listDrivesBtn.addEventListener('click', async () => {
        try {
            const r = await fetch('/list_drives');
            const j = await r.json();
            if (serialOutput) serialOutput.textContent = JSON.stringify(j, null, 2);
        } catch (e) { if (serialOutput) serialOutput.textContent = 'Error: ' + e.message; }
    });

    if (comCheckBtn) comCheckBtn.addEventListener('click', async () => {
        const sel = serialSelect.value;
        if (!sel) return alert('Select a COM port first');
        try {
            const r = await fetch('/list_serial_ports?check=' + encodeURIComponent(sel));
            const j = await r.json();
            if (serialOutput) serialOutput.textContent = JSON.stringify(j, null, 2);
        } catch (e) { if (serialOutput) serialOutput.textContent = 'Error: ' + e.message; }
    });

    // Tag controls
    const tagMacInput = document.getElementById('tag-mac');
    const tagOut = document.getElementById('tag-output');
    async function sendTagCmd(cmd) {
        const mac = (tagMacInput && tagMacInput.value) || '';
        if (!mac) return alert('Enter tag MAC (hex)');
        try {
            const body = new URLSearchParams();
            body.append('mac', mac);
            body.append('cmd', cmd);
            const r = await fetch('/tag_cmd', { method: 'POST', body: body });
            const txt = await r.text();
            if (tagOut) tagOut.textContent = txt;
        } catch (e) { if (tagOut) tagOut.textContent = 'Error: ' + e.message; }
    }

    const tagRefreshBtn = document.getElementById('tag-refresh');
    const tagRebootBtn = document.getElementById('tag-reboot');
    const tagScanBtn = document.getElementById('tag-scan');
    const tagClearBtn = document.getElementById('tag-clear');
    const tagLedBtn = document.getElementById('tag-ledflash');

    if (tagRefreshBtn) tagRefreshBtn.addEventListener('click', () => sendTagCmd('refresh'));
    if (tagRebootBtn) tagRebootBtn.addEventListener('click', () => sendTagCmd('reboot'));
    if (tagScanBtn) tagScanBtn.addEventListener('click', () => sendTagCmd('scan'));
    if (tagClearBtn) tagClearBtn.addEventListener('click', () => sendTagCmd('clear'));
    if (tagLedBtn) tagLedBtn.addEventListener('click', async () => {
        // call led_flash endpoint (GET) with pattern example
        const mac = (tagMacInput && tagMacInput.value) || '';
        if (!mac) return alert('Enter tag MAC (hex)');
        const pattern = '3CE403000000000000000000';
        try {
            const r = await fetch(`/led_flash?mac=${encodeURIComponent(mac)}&pattern=${encodeURIComponent(pattern)}`);
            const txt = await r.text();
            if (tagOut) tagOut.textContent = txt;
        } catch (e) { if (tagOut) tagOut.textContent = 'Error: ' + e.message; }
    });

    // initial populate
    populateSerialSelect();

    // ESP32 Quick Connect buttons (open/ping/reboot/led)
    const openBtn = document.getElementById('open-selected-webui');
    const pingBtn = document.getElementById('ping-selected');
    const rebootBtn = document.getElementById('call-device-reboot');
    const ledBtn = document.getElementById('call-device-led');
    function refreshQuickPanelState() {
        const sel = window.getSelectedDevice && window.getSelectedDevice();
        const nameEl = document.getElementById('selected-device-name');
        const ipEl = document.getElementById('selected-device-ip');
        const comEl = document.getElementById('selected-device-com');
        if (sel) {
            if (nameEl) nameEl.textContent = sel.name || sel.label || 'Device';
            if (ipEl) ipEl.textContent = sel.ip || sel.host || '-';
            if (comEl) comEl.textContent = sel.com || '-';
        } else {
            if (nameEl) nameEl.textContent = 'None';
            if (ipEl) ipEl.textContent = '-';
            if (comEl) comEl.textContent = '-';
        }
        const enabled = !!(sel && (sel.ip || sel.host));
        if (openBtn) openBtn.disabled = !enabled;
        if (pingBtn) pingBtn.disabled = !enabled;
        if (rebootBtn) rebootBtn.disabled = !enabled;
        if (ledBtn) ledBtn.disabled = !enabled;
    }

    if (openBtn) openBtn.addEventListener('click', () => {
        const sel = window.getSelectedDevice && window.getSelectedDevice();
        if (!sel) return alert('No device selected');
        openDeviceWebUI(sel.ip || sel.host);
    });
    if (pingBtn) pingBtn.addEventListener('click', () => {
        const sel = window.getSelectedDevice && window.getSelectedDevice();
        if (!sel) return alert('No device selected');
        pingDevice(sel.ip || sel.host);
    });
    if (rebootBtn) rebootBtn.addEventListener('click', () => {
        const sel = window.getSelectedDevice && window.getSelectedDevice();
        if (!sel) return alert('No device selected');
        if (!confirm('Reboot selected device now?')) return;
        // Use devTools resetDevice helper which uses proxied reboot when configured
        try { resetDevice(); } catch (e) { // fallback: proxied call
            fetch(`/device/reboot?host=${encodeURIComponent(sel.ip || sel.host)}`, { method: 'POST' })
                .then(r => r.text()).then(t => alert('Reboot: ' + t)).catch(err => alert('Reboot failed: ' + err.message));
        }
    });
    if (ledBtn) ledBtn.addEventListener('click', () => {
        const sel = window.getSelectedDevice && window.getSelectedDevice();
        if (!sel) return alert('No device selected');
        // Simple LED flash on device via led_flash endpoint (example pattern)
        const mac = '';
        const pattern = '3CE403000000000000000000';
        const host = sel.ip || sel.host;
        fetch(`/led_flash?pattern=${encodeURIComponent(pattern)}&host=${encodeURIComponent(host)}`)
            .then(r => r.text()).then(t => alert('LED flash: ' + t)).catch(err => alert('LED failed: ' + err.message));
    });

    // update quick panel when selection changes
    window.addEventListener('oepl:selected-device-changed', refreshQuickPanelState);
    // initial state
    setTimeout(refreshQuickPanelState, 50);

    // Centralized listeners for previously-inline onclicks
    const modalCloseBtn = document.getElementById('device-edit-close');
    if (modalCloseBtn) modalCloseBtn.addEventListener('click', () => closeDeviceEditModal());

    const clearDebugBtn = document.getElementById('clear-debug-log');
    if (clearDebugBtn) clearDebugBtn.addEventListener('click', () => clearDebugLog());
    const saveDebugBtn = document.getElementById('save-debug-log');
    if (saveDebugBtn) saveDebugBtn.addEventListener('click', () => saveDebugLog());
    const toggleDebugBtn = document.getElementById('toggle-debug-level');
    if (toggleDebugBtn) toggleDebugBtn.addEventListener('click', () => toggleDebugLevel());
    const sendDebugBtn = document.getElementById('send-debug-btn');
    if (sendDebugBtn) sendDebugBtn.addEventListener('click', () => sendDebugCommand());

    // quick-open links (data-href)
    document.querySelectorAll('button.quick-open').forEach(b => b.addEventListener('click', (e) => {
        const href = b.getAttribute('data-href');
        if (!href) return; window.open(href, '_self');
    }));

    const openSettingsBtn = document.getElementById('open-settings-btn');
    if (openSettingsBtn) openSettingsBtn.addEventListener('click', () => window.open('settings.html', '_self'));

    // ensure load-api-list element still calls loadApiList (some HTML variants had it inline)
    const loadApiBtn = document.getElementById('load-api-list');
    if (loadApiBtn) loadApiBtn.addEventListener('click', () => loadApiList());

    // Console-panel buttons
    const clearConsoleBtn = document.getElementById('clear-console');
    const saveLogBtn = document.getElementById('save-log');
    const killProcessBtn = document.getElementById('kill-process');
    if (clearConsoleBtn) clearConsoleBtn.addEventListener('click', () => {
        const consoleEl = document.getElementById('console');
        if (consoleEl) consoleEl.innerHTML = '';
        clearDebugLog();
    });
    if (saveLogBtn) saveLogBtn.addEventListener('click', () => saveDebugLog());
    if (killProcessBtn) killProcessBtn.addEventListener('click', () => alert('Kill process not implemented in this UI.'));
});

// Enhanced device status monitoring functions
function setBadge(elId, text, state) {
    const el = document.getElementById(elId);
    if (!el) return;

    const textEl = el.querySelector('.status-text');
    if (textEl) {
        textEl.textContent = text;
    } else {
        el.textContent = text;
    }

    // Remove existing state classes
    el.classList.remove('status-ok', 'status-warn', 'status-error', 'status-unknown');

    // Add new state class
    el.classList.add(`status-${state}`);

    // Update styles based on state
    const colors = {
        'ok': { bg: 'rgba(16,185,129,0.08)', border: 'rgba(16,185,129,0.25)', color: '#10b981' },
        'warn': { bg: 'rgba(253,224,71,0.06)', border: 'rgba(245,158,11,0.18)', color: '#f59e0b' },
        'error': { bg: 'rgba(248,113,113,0.06)', border: 'rgba(239,68,68,0.18)', color: '#ef4444' },
        'unknown': { bg: 'rgba(255,255,255,0.02)', border: 'rgba(255,255,255,0.03)', color: '#9ca3af' }
    };

    const colorSet = colors[state] || colors.unknown;
    el.style.background = colorSet.bg;
    el.style.borderColor = colorSet.border;
    el.style.color = colorSet.color;
}

async function updateFirstCardStatus() {
    // Determine host: use selected device if present, otherwise fallback
    const sel = window.getSelectedDevice && window.getSelectedDevice();
    let base = '';
    if (sel && (sel.ip || sel.host)) {
        base = sel.ip || sel.host;
    }

    if (base && !base.startsWith('http')) {
        base = 'http://' + base;
    }
    if (!base) {
        base = window.location.origin;
    }

    // Test Web API connectivity
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        const response = await fetch(base + '/api/features', {
            method: 'GET',
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (response.ok) {
            setBadge('badge-webapi', 'API: Online', 'ok');
        } else {
            setBadge('badge-webapi', `API: ${response.status}`, 'warn');
        }
    } catch (error) {
        if (error.name === 'AbortError') {
            setBadge('badge-webapi', 'API: Timeout', 'error');
        } else {
            setBadge('badge-webapi', 'API: Offline', 'error');
        }
    }

    // Test COM ports availability
    try {
        const response = await fetch('/list_serial_ports');
        if (response.ok) {
            const data = await response.json();
            const count = Array.isArray(data) ? data.length : (data && data.ports ? data.ports.length : 0);
            setBadge('badge-com', `COM: ${count} ports`, count > 0 ? 'ok' : 'warn');
        } else {
            setBadge('badge-com', `COM: Error ${response.status}`, 'warn');
        }
    } catch (error) {
        setBadge('badge-com', 'COM: Unavailable', 'error');
    }

    // Test WebSocket connection
    if (window.devTools && devTools.socket) {
        if (devTools.socket.connected) {
            setBadge('badge-ws', 'WS: Connected', 'ok');
        } else {
            setBadge('badge-ws', 'WS: Disconnected', 'error');
        }
    } else {
        setBadge('badge-ws', 'WS: Not initialized', 'warn');
    }
}

// Run updater on load and every 10 seconds
document.addEventListener('DOMContentLoaded', () => {
    updateFirstCardStatus();
    setInterval(updateFirstCardStatus, 10000);
});

// Connected Devices: add Select controls and highlight the currently selected device
function updateDeviceCardSelectionUI() {
    try {
        const sel = window.getSelectedDevice && window.getSelectedDevice();
        const selValue = sel && (sel.ip || sel.host);
        const cards = document.querySelectorAll('.device-card[data-ip]');
        cards.forEach(card => {
            const ip = card.getAttribute('data-ip');

            // Ensure there is a Select button (do not duplicate)
            let selectBtn = card.querySelector('.select-device-btn');
            if (!selectBtn) {
                // Prefer to append into the existing button row if present
                const btnRow = card.querySelector('div[style*="margin-top: 10px"]') || card.appendChild(document.createElement('div'));
                selectBtn = document.createElement('button');
                selectBtn.className = 'btn btn-small select-device-btn';
                selectBtn.textContent = 'Select';
                selectBtn.style.marginLeft = '6px';
                selectBtn.addEventListener('click', () => {
                    const name = card.querySelector('strong') ? card.querySelector('strong').textContent.trim() : '';
                    const deviceObj = { name: name || ('Device ' + ip), ip: ip };
                    if (window.setSelectedDevice) {
                        window.setSelectedDevice(deviceObj);
                    } else {
                        // fallback - use NVS-style storage
                        try {
                            localStorage.setItem(`${SELECTED_KEY}_id`, deviceObj.id || '');
                            localStorage.setItem(`${SELECTED_KEY}_name`, deviceObj.name || '');
                            localStorage.setItem(`${SELECTED_KEY}_ip`, deviceObj.ip || '');
                            localStorage.setItem(`${SELECTED_KEY}_port`, deviceObj.port || '');
                            localStorage.setItem(`${SELECTED_KEY}_description`, deviceObj.description || '');
                        } catch(_){}
                        window.dispatchEvent(new CustomEvent('oepl:selected-device-changed', { detail: deviceObj }));
                    }
                    // update UI immediately
                    updateDeviceCardSelectionUI();
                });
                btnRow.appendChild(selectBtn);
            }

            // Highlight selected card and add/remove badge
            const existingBadge = card.querySelector('.selected-badge');
            if (selValue && ip === selValue) {
                card.style.border = '1px solid rgba(16,185,129,0.35)';
                card.style.boxShadow = '0 4px 12px rgba(16,185,129,0.06)';
                if (!existingBadge) {
                    const titleRow = card.querySelector('.device-status') || card;
                    const b = document.createElement('span');
                    b.className = 'selected-badge';
                    b.textContent = 'SELECTED';
                    b.style.display = 'inline-block';
                    b.style.marginLeft = '8px';
                    b.style.padding = '4px 6px';
                    b.style.borderRadius = '6px';
                    b.style.fontSize = '12px';
                    b.style.background = 'rgba(16,185,129,0.06)';
                    b.style.color = '#10b981';
                    if (titleRow) titleRow.appendChild(b);
                }
            } else {
                // reset styles
                card.style.border = '1px solid #112335';
                card.style.boxShadow = 'none';
                if (existingBadge) existingBadge.remove();
            }
        });
    } catch (e) {
        console.warn('updateDeviceCardSelectionUI error', e);
    }
}

// Wire up events to keep the device cards in sync with selection changes
document.addEventListener('DOMContentLoaded', () => {
    // initial run
    updateDeviceCardSelectionUI();

    // When selection changes via API, update cards
    window.addEventListener('oepl:selected-device-changed', () => updateDeviceCardSelectionUI());

    // When other tabs change localStorage
    window.addEventListener('storage', (ev) => {
        if (ev.key === 'oepl_selected_device') updateDeviceCardSelectionUI();
    });

    // Observe dynamic changes to the device grid (e.g., devices added/removed)
    const grid = document.getElementById('device-grid');
    if (grid && window.MutationObserver) {
        const mo = new MutationObserver(() => updateDeviceCardSelectionUI());
        mo.observe(grid, { childList: true, subtree: false });
    }
});
