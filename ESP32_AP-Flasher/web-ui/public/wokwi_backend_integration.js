// Enhanced Wokwi Configuration Tool with Backend Integration
// This script extends the original Wokwi tool with Web UI integration

// Override the original tool's methods to integrate with the Web UI backend
(function () {
    'use strict';

    // Wait for the original WokwiConfigTool to be available
    function waitForWokwiTool() {
        if (typeof WokwiConfigTool !== 'undefined') {
            enhanceWokwiTool();
        } else {
            setTimeout(waitForWokwiTool, 100);
        }
    }

    function enhanceWokwiTool() {
        // Store original methods
        const originalGenerateConfigs = WokwiConfigTool.prototype.generateConfigs;
        const originalLoadExisting = WokwiConfigTool.prototype.loadExisting;
        const originalDownloadConfigs = WokwiConfigTool.prototype.downloadConfigs;

        // Override generateConfigs to auto-save to backend
        WokwiConfigTool.prototype.generateConfigs = function () {
            originalGenerateConfigs.call(this);

            // Auto-save to backend if connected to parent window
            if (window.parent && window.parent !== window) {
                this.saveToBackend();
            }
        };

        // Override loadExisting to load from backend
        WokwiConfigTool.prototype.loadExisting = function () {
            if (window.parent && window.parent !== window) {
                this.loadFromBackend();
            } else {
                originalLoadExisting.call(this);
            }
        };

        // Override downloadConfigs to also save to backend
        WokwiConfigTool.prototype.downloadConfigs = function () {
            originalDownloadConfigs.call(this);

            // Also save to backend
            if (window.parent && window.parent !== window) {
                this.saveToBackend();
            }
        };

        // Add new backend integration methods
        WokwiConfigTool.prototype.saveToBackend = async function () {
            try {
                const config = {
                    wokwiConfig: this.currentConfig.wokwi,
                    diagramConfig: this.currentConfig.diagram
                };

                const response = await fetch('/api/wokwi/config', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(config)
                });

                const data = await response.json();

                if (data.success) {
                    this.showStatus('Configuration saved to backend successfully!', 'success');
                } else {
                    this.showStatus('Failed to save to backend: ' + data.error, 'error');
                }
            } catch (error) {
                console.error('Backend save error:', error);
                this.showStatus('Backend connection error: ' + error.message, 'error');
            }
        };

        WokwiConfigTool.prototype.loadFromBackend = async function () {
            try {
                const response = await fetch('/api/wokwi/config');
                const data = await response.json();

                if (data.success && data.config) {
                    // Load wokwi configuration
                    if (data.config.wokwi) {
                        this.loadWokwiConfigFromString(data.config.wokwi);
                    }

                    // Load diagram configuration
                    if (data.config.diagram) {
                        this.loadDiagramConfig(data.config.diagram);
                    }

                    this.generateConfigs();
                    this.showStatus('Configuration loaded from backend successfully!', 'success');
                } else {
                    this.showStatus('No configuration found in backend', 'warning');
                }
            } catch (error) {
                console.error('Backend load error:', error);
                this.showStatus('Backend connection error: ' + error.message, 'error');
                // Fallback to original method
                originalLoadExisting.call(this);
            }
        };

        WokwiConfigTool.prototype.validateWithBackend = async function () {
            try {
                const response = await fetch('/api/wokwi/validate');
                const data = await response.json();

                if (data.success) {
                    const { validation } = data;
                    let message = 'Backend Validation Results:\n';

                    if (validation.wokwi.exists) {
                        message += validation.wokwi.valid ?
                            '✓ wokwi.toml is valid\n' :
                            `✗ wokwi.toml errors: ${validation.wokwi.errors.join(', ')}\n`;
                    } else {
                        message += '⚠ wokwi.toml not found in backend\n';
                    }

                    if (validation.diagram.exists) {
                        message += validation.diagram.valid ?
                            '✓ diagram.json is valid\n' :
                            `✗ diagram.json errors: ${validation.diagram.errors.join(', ')}\n`;
                    } else {
                        message += '⚠ diagram.json not found in backend\n';
                    }

                    this.showStatus(message, validation.wokwi.valid && validation.diagram.valid ? 'success' : 'warning');
                    return validation;
                }
            } catch (error) {
                console.error('Backend validation error:', error);
                this.showStatus('Backend validation failed: ' + error.message, 'error');
            }

            return null;
        };

        // Add validate button to the existing interface
        WokwiConfigTool.prototype.addValidateButton = function () {
            const buttonGroup = document.querySelector('.button-group');
            if (buttonGroup) {
                const validateBtn = document.createElement('button');
                validateBtn.className = 'btn btn-warning';
                validateBtn.textContent = 'Validate Backend';
                validateBtn.onclick = () => this.validateWithBackend();
                buttonGroup.appendChild(validateBtn);
            }
        };

        // Listen for messages from parent window
        window.addEventListener('message', function (event) {
            if (event.data && event.data.type === 'load-config') {
                if (window.wokwiTool && event.data.config) {
                    // Load configuration sent from parent
                    if (event.data.config.wokwi) {
                        window.wokwiTool.loadWokwiConfigFromString(event.data.config.wokwi);
                    }

                    if (event.data.config.diagram) {
                        window.wokwiTool.loadDiagramConfig(event.data.config.diagram);
                    }

                    window.wokwiTool.generateConfigs();
                }
            }
        });

        // Auto-load from backend when tool initializes
        setTimeout(() => {
            if (window.wokwiTool) {
                window.wokwiTool.addValidateButton();

                // Auto-load existing configuration
                if (window.parent && window.parent !== window) {
                    window.wokwiTool.loadFromBackend();
                }
            }
        }, 1000);
    }

    // Start enhancement process
    waitForWokwiTool();
})();

// Socket.io integration for real-time updates
if (typeof io !== 'undefined') {
    const socket = io();

    socket.on('wokwi-config-updated', (data) => {
        if (window.wokwiTool) {
            // Reload configuration when updated from another client
            window.wokwiTool.loadFromBackend();
        }
    });

    socket.on('connect', () => {
        console.log('Wokwi tool connected to backend via Socket.io');
    });

    socket.on('disconnect', () => {
        console.log('Wokwi tool disconnected from backend');
    });
}

// Export functions for parent window communication
window.wokwiBackendIntegration = {
    saveConfig: function (config) {
        if (window.wokwiTool) {
            return window.wokwiTool.saveToBackend();
        }
    },

    loadConfig: function () {
        if (window.wokwiTool) {
            return window.wokwiTool.loadFromBackend();
        }
    },

    validateConfig: function () {
        if (window.wokwiTool) {
            return window.wokwiTool.validateWithBackend();
        }
    },

    getCurrentConfig: function () {
        if (window.wokwiTool) {
            return window.wokwiTool.currentConfig;
        }
        return null;
    }
};
