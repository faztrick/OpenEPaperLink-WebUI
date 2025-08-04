// OpenEPL ESP32 - Debug and Error Handling System
// Provides comprehensive debugging and error reporting

class DebugSystem {
    constructor() {
        this.debugLevel = 1; // 0: Off, 1: Error, 2: Warn, 3: Info, 4: Debug
        this.maxLogEntries = 1000;
        this.logs = [];
        this.errorCount = 0;
        this.warningCount = 0;
        this.enabled = true;
        this.init();
    }

    init() {
        this.setupConsoleOverride();
        this.setupErrorHandlers();
        this.setupDebugUI();
        this.startPerformanceMonitoring();
    }

    setupConsoleOverride() {
        // Store original console methods
        this.originalConsole = {
            log: console.log,
            warn: console.warn,
            error: console.error,
            info: console.info,
            debug: console.debug
        };

        // Override console methods to capture logs
        console.log = (...args) => {
            this.addLog('INFO', args.join(' '));
            this.originalConsole.log(...args);
        };

        console.warn = (...args) => {
            this.addLog('WARN', args.join(' '));
            this.warningCount++;
            this.originalConsole.warn(...args);
        };

        console.error = (...args) => {
            this.addLog('ERROR', args.join(' '));
            this.errorCount++;
            this.originalConsole.error(...args);
        };

        console.info = (...args) => {
            this.addLog('INFO', args.join(' '));
            this.originalConsole.info(...args);
        };

        console.debug = (...args) => {
            this.addLog('DEBUG', args.join(' '));
            this.originalConsole.debug(...args);
        };
    }

    setupErrorHandlers() {
        // Global error handler
        window.addEventListener('error', (event) => {
            this.addLog('ERROR', `Global Error: ${event.message} at ${event.filename}:${event.lineno}:${event.colno}`);
            this.reportError({
                type: 'JavaScript Error',
                message: event.message,
                filename: event.filename,
                line: event.lineno,
                column: event.colno,
                stack: event.error ? event.error.stack : 'No stack trace'
            });
        });

        // Unhandled promise rejection handler
        window.addEventListener('unhandledrejection', (event) => {
            this.addLog('ERROR', `Unhandled Promise Rejection: ${event.reason}`);
            this.reportError({
                type: 'Promise Rejection',
                message: event.reason.toString(),
                stack: event.reason.stack || 'No stack trace'
            });
        });

        // Resource loading errors
        window.addEventListener('error', (event) => {
            if (event.target !== window) {
                this.addLog('ERROR', `Resource Error: Failed to load ${event.target.src || event.target.href}`);
            }
        }, true);
    }

    setupDebugUI() {
        // Create debug panel
        const debugPanel = document.createElement('div');
        debugPanel.id = 'debug-panel';
        debugPanel.style.cssText = `
            position: fixed;
            top: 10px;
            right: 10px;
            width: 300px;
            max-height: 400px;
            background: rgba(0, 0, 0, 0.9);
            color: white;
            border-radius: 8px;
            padding: 10px;
            font-family: monospace;
            font-size: 12px;
            z-index: 10000;
            display: none;
            overflow: auto;
        `;

        debugPanel.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                <strong>Debug Console</strong>
                <button onclick="window.debugSystem.togglePanel()" style="background: #333; color: white; border: none; padding: 2px 6px; border-radius: 4px; cursor: pointer;">✕</button>
            </div>
            <div id="debug-stats" style="margin-bottom: 10px; font-size: 10px; color: #ccc;"></div>
            <div id="debug-logs" style="max-height: 300px; overflow-y: auto;"></div>
            <div style="margin-top: 10px;">
                <button onclick="window.debugSystem.clearLogs()" style="background: #666; color: white; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer; margin-right: 5px;">Clear</button>
                <button onclick="window.debugSystem.exportLogs()" style="background: #666; color: white; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer;">Export</button>
            </div>
        `;

        document.body.appendChild(debugPanel);
        this.debugPanel = debugPanel;

        // Add debug toggle key (Ctrl+Shift+D)
        document.addEventListener('keydown', (event) => {
            if (event.ctrlKey && event.shiftKey && event.key === 'D') {
                this.togglePanel();
            }
        });

        // Add debug button to header if available
        this.addDebugButton();
    }

    addDebugButton() {
        setTimeout(() => {
            const headerStatus = document.querySelector('.header-status');
            if (headerStatus) {
                const debugBtn = document.createElement('div');
                debugBtn.className = 'status-item';
                debugBtn.style.cursor = 'pointer';
                debugBtn.innerHTML = `
                    <span class="material-symbols-outlined" style="font-size: 12px;">bug_report</span>
                    <span>Debug</span>
                `;
                debugBtn.onclick = () => this.togglePanel();
                headerStatus.appendChild(debugBtn);
            }
        }, 1000);
    }

    startPerformanceMonitoring() {
        setInterval(() => {
            this.updatePerformanceStats();
        }, 5000);
    }

    addLog(level, message) {
        if (!this.enabled) return;

        const timestamp = new Date().toISOString();
        const logEntry = {
            timestamp,
            level,
            message,
            id: this.logs.length
        };

        this.logs.push(logEntry);

        // Limit log entries
        if (this.logs.length > this.maxLogEntries) {
            this.logs = this.logs.slice(-this.maxLogEntries);
        }

        this.updateDebugUI();
    }

    updateDebugUI() {
        if (!this.debugPanel) return;

        const logsContainer = document.getElementById('debug-logs');
        const statsContainer = document.getElementById('debug-stats');

        if (logsContainer) {
            // Show last 50 logs
            const recentLogs = this.logs.slice(-50);
            logsContainer.innerHTML = recentLogs.map(log => {
                const color = this.getLogColor(log.level);
                return `<div style="color: ${color}; margin-bottom: 2px;">
                    <span style="color: #888;">[${log.timestamp.split('T')[1].slice(0, 8)}]</span>
                    <span style="color: ${color};">[${log.level}]</span>
                    ${log.message}
                </div>`;
            }).join('');
            
            // Auto-scroll to bottom
            logsContainer.scrollTop = logsContainer.scrollHeight;
        }

        if (statsContainer) {
            statsContainer.innerHTML = `
                Errors: ${this.errorCount} | Warnings: ${this.warningCount} | 
                Total Logs: ${this.logs.length} | 
                Memory: ${this.getMemoryUsage()}
            `;
        }
    }

    getLogColor(level) {
        switch (level) {
            case 'ERROR': return '#ff6b6b';
            case 'WARN': return '#ffa500';
            case 'INFO': return '#74c0fc';
            case 'DEBUG': return '#51cf66';
            default: return '#fff';
        }
    }

    getMemoryUsage() {
        if (performance.memory) {
            const used = Math.round(performance.memory.usedJSHeapSize / 1024 / 1024);
            const total = Math.round(performance.memory.totalJSHeapSize / 1024 / 1024);
            return `${used}/${total}MB`;
        }
        return 'N/A';
    }

    updatePerformanceStats() {
        // Check for performance issues
        const timing = performance.timing;
        const loadTime = timing.loadEventEnd - timing.navigationStart;
        
        if (loadTime > 5000) {
            this.addLog('WARN', `Slow page load detected: ${loadTime}ms`);
        }

        // Check memory usage
        if (performance.memory && performance.memory.usedJSHeapSize > 50 * 1024 * 1024) {
            this.addLog('WARN', `High memory usage: ${this.getMemoryUsage()}`);
        }
    }

    reportError(errorInfo) {
        // Send error report to server (if endpoint available)
        if (window.apiManager) {
            window.apiManager.post('/api/error_report', {
                timestamp: new Date().toISOString(),
                userAgent: navigator.userAgent,
                url: window.location.href,
                ...errorInfo
            }).catch(err => {
                this.originalConsole.warn('Failed to send error report:', err);
            });
        }
    }

    // Public methods
    togglePanel() {
        if (this.debugPanel) {
            const isVisible = this.debugPanel.style.display !== 'none';
            this.debugPanel.style.display = isVisible ? 'none' : 'block';
            
            if (!isVisible) {
                this.updateDebugUI();
            }
        }
    }

    clearLogs() {
        this.logs = [];
        this.errorCount = 0;
        this.warningCount = 0;
        this.updateDebugUI();
    }

    exportLogs() {
        const logData = {
            timestamp: new Date().toISOString(),
            userAgent: navigator.userAgent,
            url: window.location.href,
            stats: {
                errors: this.errorCount,
                warnings: this.warningCount,
                totalLogs: this.logs.length
            },
            logs: this.logs
        };

        const blob = new Blob([JSON.stringify(logData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `openel-debug-${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }

    setDebugLevel(level) {
        this.debugLevel = level;
        this.addLog('INFO', `Debug level set to ${level}`);
    }

    enable() {
        this.enabled = true;
        this.addLog('INFO', 'Debug system enabled');
    }

    disable() {
        this.enabled = false;
    }

    // Feature testing helpers
    testFeature(featureName, testFn) {
        this.addLog('INFO', `Testing feature: ${featureName}`);
        try {
            const result = testFn();
            if (result instanceof Promise) {
                return result.then(res => {
                    this.addLog('INFO', `Feature test passed: ${featureName}`);
                    return res;
                }).catch(err => {
                    this.addLog('ERROR', `Feature test failed: ${featureName} - ${err.message}`);
                    throw err;
                });
            } else {
                this.addLog('INFO', `Feature test passed: ${featureName}`);
                return result;
            }
        } catch (error) {
            this.addLog('ERROR', `Feature test failed: ${featureName} - ${error.message}`);
            throw error;
        }
    }

    // System diagnostics
    async runDiagnostics() {
        this.addLog('INFO', 'Starting system diagnostics...');
        
        const diagnostics = {
            timestamp: new Date().toISOString(),
            browser: navigator.userAgent,
            screen: `${screen.width}x${screen.height}`,
            memory: this.getMemoryUsage(),
            features: {},
            apis: {}
        };

        // Test feature manager
        if (window.featureManager) {
            diagnostics.features = window.featureManager.getFeatures();
        }

        // Test API endpoints
        if (window.apiManager) {
            try {
                const healthy = await window.apiManager.healthCheck();
                diagnostics.apis.healthCheck = healthy;
            } catch (error) {
                diagnostics.apis.healthCheck = false;
                diagnostics.apis.error = error.message;
            }
        }

        this.addLog('INFO', 'Diagnostics completed');
        console.log('System Diagnostics:', diagnostics);
        return diagnostics;
    }
}

// Initialize debug system
window.debugSystem = new DebugSystem();

// Make it available globally
window.addEventListener('DOMContentLoaded', () => {
    if (!window.debugSystem) {
        window.debugSystem = new DebugSystem();
    }
});

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = DebugSystem;
}
