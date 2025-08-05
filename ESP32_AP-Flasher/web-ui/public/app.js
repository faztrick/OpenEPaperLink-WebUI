class ESP32DevUI {
    constructor() {
        this.socket = null;
        this.connected = false;
        this.currentProcess = null;
        this.aiAvailable = false;
        this.aiConfig = null;
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

    initSocket() {
        this.socket = io();

        this.socket.on('connect', () => {
            this.connected = true;
            this.updateConnectionStatus();
            this.log('Connected to server', 'success');
        });

        this.socket.on('disconnect', () => {
            this.connected = false;
            this.updateConnectionStatus();
            this.log('Disconnected from server', 'error');
        });

        this.socket.on('output', (data) => {
            this.log(data.data, data.type || 'stdout');
        });

        this.socket.on('process_complete', (data) => {
            this.currentProcess = null;
            this.updateButtons();
            this.hideProgress();

            if (data.success) {
                this.log(`Process completed successfully (exit code: ${data.code})`, 'success');
            } else {
                this.log(`Process failed with exit code: ${data.code}`, 'error');
            }
        });

        this.socket.on('com_ports', (ports) => {
            this.updateComPorts(ports);
        });

        this.socket.on('config_loaded', (config) => {
            this.config = { ...this.config, ...config };
            this.updateConfigUI();
        });

        this.socket.on('config_saved', () => {
            this.log('Configuration saved', 'success');
        });

        // AI-specific socket handlers
        this.socket.on('ai-status', (data) => {
            this.aiAvailable = data.available;
            this.aiConfig = data.config;
            this.updateAIStatus();
        });

        this.socket.on('ai-analysis', (data) => {
            this.showAIAnalysis(data);
        });

        this.socket.on('ai-response', (data) => {
            this.addAIMessage(data.response, 'assistant');
        });

        this.socket.on('ai-error', (data) => {
            this.addAIMessage(`Error: ${data.error}`, 'error');
        });

        this.socket.on('ai-project-analysis', (data) => {
            this.showProjectAnalysis(data);
        });
    }

    bindEvents() {
        // Action buttons
        document.getElementById('btn-compile').addEventListener('click', () => this.compile());
        document.getElementById('btn-fast-compile').addEventListener('click', () => this.fastCompile());
        document.getElementById('btn-flash').addEventListener('click', () => this.flash());
        document.getElementById('btn-monitor').addEventListener('click', () => this.monitor());
        document.getElementById('btn-build-fs').addEventListener('click', () => this.buildFS());
        document.getElementById('btn-flash-fs').addEventListener('click', () => this.flashFS());
        document.getElementById('btn-clean').addEventListener('click', () => this.clean());
        document.getElementById('btn-erase').addEventListener('click', () => this.eraseFlash());
        document.getElementById('btn-wifi-config').addEventListener('click', () => this.wifiConfig());
        document.getElementById('btn-ota-update').addEventListener('click', () => this.otaUpdate());
        document.getElementById('btn-test-network').addEventListener('click', () => this.testNetwork());
        document.getElementById('btn-validate-config').addEventListener('click', () => this.validateConfig());

        // Console controls
        document.getElementById('btn-clear-console').addEventListener('click', () => this.clearConsole());
        document.getElementById('btn-stop-process').addEventListener('click', () => this.stopProcess());

        // Configuration
        document.getElementById('com-port').addEventListener('change', (e) => this.updateConfig('comPort', e.target.value));
        document.getElementById('wifi-ssid').addEventListener('input', (e) => this.updateConfig('wifiSSID', e.target.value));
        document.getElementById('wifi-password').addEventListener('input', (e) => this.updateConfig('wifiPassword', e.target.value));
        document.getElementById('fast-compile').addEventListener('change', (e) => this.updateConfig('fastCompile', e.target.checked));
        document.getElementById('verbose-output').addEventListener('change', (e) => this.updateConfig('verboseOutput', e.target.checked));
        document.getElementById('clean-build').addEventListener('change', (e) => this.updateConfig('cleanBuild', e.target.checked));

        // Refresh COM ports
        document.getElementById('refresh-ports').addEventListener('click', () => this.refreshComPorts());

        // AI event handlers
        document.getElementById('ai-analyze-project').addEventListener('click', () => this.analyzeProject());
        document.getElementById('ai-chat-toggle').addEventListener('click', () => this.toggleAIChat());
        document.getElementById('ai-suggestions').addEventListener('click', () => this.getAISuggestions());
        document.getElementById('ai-config').addEventListener('click', () => this.showAIConfig());
        document.getElementById('ai-send').addEventListener('click', () => this.sendAIMessage());
        document.getElementById('ai-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.sendAIMessage();
        });
        document.getElementById('save-ai-config').addEventListener('click', () => this.saveAIConfig());
        document.getElementById('test-ai-connection').addEventListener('click', () => this.testAIConnection());

        // Remote server event handlers
        document.getElementById('use-remote').addEventListener('change', (e) => this.toggleRemoteServer(e.target.checked));
        document.getElementById('test-connection').addEventListener('click', () => this.testRemoteConnection());
        document.getElementById('remote-host').addEventListener('change', (e) => this.updateRemoteConfig('host', e.target.value));
        document.getElementById('remote-port').addEventListener('change', (e) => this.updateRemoteConfig('port', e.target.value));
        document.getElementById('remote-user').addEventListener('change', (e) => this.updateRemoteConfig('user', e.target.value));

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
    }

    updateConnectionStatus() {
        const statusDot = document.querySelector('.status-dot');
        const statusText = document.querySelector('.status-indicator span');

        if (this.connected) {
            statusDot.className = 'status-dot connected';
            statusText.textContent = 'Connected';
        } else {
            statusDot.className = 'status-dot disconnected';
            statusText.textContent = 'Disconnected';
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
        const stopBtn = document.getElementById('btn-stop-process');
        stopBtn.disabled = !this.currentProcess;
    }

    updateComPorts(ports) {
        const select = document.getElementById('com-port');
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

    updateConfigUI() {
        document.getElementById('com-port').value = this.config.comPort;
        document.getElementById('wifi-ssid').value = this.config.wifiSSID;
        document.getElementById('wifi-password').value = this.config.wifiPassword;
        document.getElementById('fast-compile').checked = this.config.fastCompile;
        document.getElementById('verbose-output').checked = this.config.verboseOutput;
        document.getElementById('clean-build').checked = this.config.cleanBuild;
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

    updateUI() {
        this.updateConnectionStatus();
        this.updateButtons();
        this.refreshComPorts();
    }

    // Build and Flash Operations
    compile() {
        if (this.currentProcess) return;

        this.log('Starting compilation...', 'info');
        this.showProgress('Compiling...');
        this.currentProcess = 'compile';
        this.updateButtons();

        const script = this.config.fastCompile ? 'fast_compile.ps1' : 'compile.ps1';
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

        this.socket.emit('run_script', { script: 'fast_compile.ps1', args: [] });
    }

    flash() {
        if (this.currentProcess) return;

        this.log(`Flashing to ${this.config.comPort}...`, 'info');
        this.showProgress('Flashing...');
        this.currentProcess = 'flash';
        this.updateButtons();

        this.socket.emit('run_script', {
            script: 'compile.ps1',
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
            script: 'configure_wifi.ps1',
            args: ['-SSID', this.config.wifiSSID, '-Password', this.config.wifiPassword]
        });
    }

    otaUpdate() {
        if (this.currentProcess) return;

        this.log('Starting OTA update...', 'info');
        this.showProgress('OTA updating...');
        this.currentProcess = 'ota';
        this.updateButtons();

        this.socket.emit('run_script', { script: 'simple_upload.ps1', args: [] });
    }

    testNetwork() {
        if (this.currentProcess) return;

        this.log('Testing network connectivity...', 'info');
        this.showProgress('Testing network...');
        this.currentProcess = 'test_network';
        this.updateButtons();

        this.socket.emit('run_script', { script: 'test_network_connectivity.ps1', args: [] });
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

    // Remote server methods
    toggleRemoteServer(enabled) {
        this.remoteConfig.enabled = enabled;
        const remoteOptions = document.getElementById('remote-options');
        remoteOptions.style.display = enabled ? 'block' : 'none';
        
        if (enabled) {
            this.testRemoteConnection();
        } else {
            this.updateRemoteStatus('Not Connected', false);
        }
    },

    updateRemoteConfig(key, value) {
        this.remoteConfig[key] = value;
        console.log(`Remote config updated: ${key} = ${value}`);
    },

    async testRemoteConnection() {
        const statusEl = document.getElementById('remote-status');
        const button = document.getElementById('test-connection');
        
        button.disabled = true;
        button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Testing...';
        
        try {
            const response = await fetch('/api/remote/test-connection', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    host: this.remoteConfig.host,
                    port: this.remoteConfig.port,
                    user: this.remoteConfig.user
                })
            });

            const result = await response.json();
            
            if (result.success) {
                this.updateRemoteStatus('Connected', true);
                this.remoteConfig.connected = true;
            } else {
                this.updateRemoteStatus(`Error: ${result.error}`, false);
                this.remoteConfig.connected = false;
            }
        } catch (error) {
            this.updateRemoteStatus(`Connection failed: ${error.message}`, false);
            this.remoteConfig.connected = false;
        } finally {
            button.disabled = false;
            button.innerHTML = '<i class="fas fa-plug"></i> Test Connection';
        }
    },

    updateRemoteStatus(text, connected) {
        const statusEl = document.getElementById('remote-status');
        const textEl = statusEl.querySelector('.status-text');
        textEl.textContent = text;
        
        statusEl.className = `status-indicator ${connected ? 'connected' : 'disconnected'}`;
    },

    isUsingRemoteServer() {
        return this.remoteConfig.enabled && this.remoteConfig.connected;
    }
};

// Modal control functions
function closeAIChat() {
    document.getElementById('ai-chat-modal').style.display = 'none';
}

function closeAIConfig() {
    document.getElementById('ai-config-modal').style.display = 'none';
}

function openBuildFolder() {
    // This would need to be implemented on the server side
    alert('Build folder opening functionality would be implemented server-side');
}