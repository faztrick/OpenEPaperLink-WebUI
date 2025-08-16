// Development Tools JavaScript
class DevelopmentTools {
    constructor() {
        this.socket = io();
        this.devices = new Map();
        this.debugLevel = 'INFO';
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.connectSocket();
        this.refreshDeviceStatus();
        this.startPeriodicUpdates();
    }

    setupEventListeners() {
        // Build controls
        document.getElementById('quick-build').addEventListener('click', () => this.quickBuild());
        document.getElementById('build-upload').addEventListener('click', () => this.buildAndUpload());
        document.getElementById('analyze-build').addEventListener('click', () => this.analyzeBuild());

        // Debug console
        document.getElementById('debug-command').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.sendDebugCommand();
            }
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
    window.open('/monitor', '_blank');
}

function resetDevice() {
    devTools.addDebugLog('Resetting device...', 'WARN');
    devTools.socket.emit('device-command', { action: 'reset' });
}

function eraseFlash() {
    if (confirm('Are you sure you want to erase the flash memory? This will remove all data on the device.')) {
        devTools.addDebugLog('Erasing flash memory...', 'WARN');
        devTools.socket.emit('device-command', { action: 'erase-flash' });
    }
}

function uploadFilesystem() {
    devTools.addDebugLog('Uploading filesystem...', 'INFO');
    devTools.socket.emit('device-command', { action: 'upload-fs' });
}

// New endpoint helpers called from new UI buttons
function callWebApi() {
    devTools.addDebugLog('Calling sample Web API /api/status...', 'INFO');
    fetch('/api/status')
        .then(r => r.json())
        .then(json => {
            devTools.addDebugLog(`API /api/status response: ${JSON.stringify(json)}`, 'INFO');
        })
        .catch(err => devTools.addDebugLog(`Web API call failed: ${err.message}`, 'ERROR'));
}

function serialEndpoints() {
    devTools.addDebugLog('Querying serial ports (/api/serial/list)...', 'INFO');
    fetch('/api/serial/list')
        .then(r => r.json())
        .then(json => {
            devTools.addDebugLog(`/api/serial/list: ${JSON.stringify(json)}`, 'INFO');
            // If ports present, try a quick com check on the first one (safe, will error if not available)
            if (json.ports && json.ports.length > 0) {
                const p = json.ports[0].path || json.ports[0].comName || json.ports[0];
                devTools.addDebugLog(`Performing quick COM check on ${p}...`, 'INFO');
                fetch('/api/com/check', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: p, timeout: 500 }) })
                    .then(r => r.json()).then(rj => devTools.addDebugLog(`/api/com/check: ${JSON.stringify(rj)}`, 'INFO'))
                    .catch(e => devTools.addDebugLog(`/api/com/check failed: ${e.message}`, 'ERROR'));
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

        // Render route list
        el.innerHTML = '';
        json.routes.forEach(r => {
            const entry = document.createElement('div');
            entry.style.padding = '4px 0';
            entry.textContent = `${r.method}	${r.path}` + (r.description ? `	// ${r.description}` : '');
            el.appendChild(entry);
        });
        devTools.addDebugLog(`Loaded ${json.routes.length} API routes`, 'INFO');
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

function openDeviceWebUI(ip) {
    window.open(`http://${ip}`, '_blank');
}

function pingDevice(ip) {
    devTools.addDebugLog(`Pinging device at ${ip}...`, 'INFO');
    devTools.socket.emit('ping-device', { ip });
}

function reconnectDevice(ip) {
    devTools.addDebugLog(`Attempting to reconnect to ${ip}...`, 'INFO');
    devTools.socket.emit('reconnect-device', { ip });
}

// Global instance
let devTools;

// Initialize when page loads
document.addEventListener('DOMContentLoaded', () => {
    devTools = new DevelopmentTools();
});
