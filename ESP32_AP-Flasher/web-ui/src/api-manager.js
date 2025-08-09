/**
 * OpenEPL ESP32 - Optimized API Management System
 * Handles all API interactions with caching, retry logic, and performance optimization
 */

class APIManager {
    constructor() {
        this.baseURL = '';
        this.cache = new Map();
        this.requestQueue = [];
        this.isProcessing = false;
        this.retryAttempts = 3;
        this.retryDelay = 1000;
        this.cacheTimeout = 30000; // 30 seconds default
        this.requestTimeouts = new Map();

        // API endpoint configurations - aligned with C++ backend
        this.endpoints = {
            // System endpoints
            config: { url: 'get_ap_config', cache: 10000, retry: true },
            sysinfo: { url: 'sysinfo', cache: 5000, retry: true },
            sysinfoJson: { url: 'sysinfo.json', cache: 5000, retry: true },
            version: { url: 'version.txt', cache: 60000, retry: false },

            // Tag management endpoints
            tagDB: { url: 'get_db', cache: 2000, retry: true },
            tagCmd: { url: 'tag_cmd', cache: false, retry: true },
            tagConfig: { url: 'save_cfg', cache: false, retry: true },
            tagStatus: { url: 'tag_status', cache: false, retry: true },
            ledFlash: { url: 'led_flash', cache: false, retry: true },

            // WiFi and network endpoints
            wifiConfig: { url: 'get_wifi_config', cache: 30000, retry: true },
            wifiSave: { url: 'save_wifi_config', cache: false, retry: true },
            ssidList: { url: 'get_ssid_list', cache: 10000, retry: true },
            wifiScan: { url: 'wifi_scan', cache: 5000, retry: true },
            networkInfo: { url: 'network_info', cache: 10000, retry: true },

            // Configuration endpoints
            apConfig: { url: 'get_ap_config', cache: 10000, retry: true },
            saveApConfig: { url: 'save_apcfg', cache: false, retry: true },
            setVar: { url: 'set_var', cache: false, retry: true },
            setVars: { url: 'set_vars', cache: false, retry: true },

            // File management endpoints
            getdata: { url: 'getdata', cache: false, retry: true },
            imgUpload: { url: 'imgupload', cache: false, retry: false },
            jsonUpload: { url: 'jsonupload', cache: false, retry: true },
            littlefsPut: { url: 'littlefs_put', cache: false, retry: true },
            checkFile: { url: 'check_file', cache: false, retry: true },

            // System control endpoints
            reboot: { url: 'reboot', cache: false, retry: false },
            rollback: { url: 'rollback', cache: false, retry: false },
            updateActions: { url: 'update_actions', cache: false, retry: true },
            updateOTA: { url: 'update_ota', cache: false, retry: false },

            // Database operations
            backup: { url: 'backup_db', cache: false, retry: false },
            restoreDB: { url: 'restore_db', cache: false, retry: false },

            // API endpoints
            features: { url: 'api/features', cache: 60000, retry: true },
            errorReport: { url: 'api/error_report', cache: false, retry: true },
            modules: { url: 'api/modules', cache: 30000, retry: true },

            // Enhanced system endpoints
            systemInfo: { url: 'system_info', cache: 10000, retry: true },
            restartSystem: { url: 'restart_system', cache: false, retry: false },
            systemDiagnostic: { url: 'system_diagnostic', cache: false, retry: true },
            functionStatus: { url: 'get_function_status', cache: 5000, retry: true },

            // Content generation endpoints
            startContent: { url: 'start_content_generation', cache: false, retry: true },
            stopContent: { url: 'stop_content_generation', cache: false, retry: true },
            pauseContent: { url: 'pause_content_generation', cache: false, retry: true },

            // Hardware feature endpoints
            ledControl: { url: 'led_control', cache: false, retry: true },
            bleStatus: { url: 'ble_status', cache: 10000, retry: true },
            bleControl: { url: 'ble_control', cache: false, retry: true },

            // Setup endpoint
            setup: { url: 'setup', cache: 60000, retry: false }
        };

        this.initializeWebSocket();
    }

    /**
     * Initialize WebSocket connection with automatic reconnection
     */
    initializeWebSocket() {
        if (this.socket) {
            this.socket.close();
        }

        const protocol = location.protocol === "https:" ? "wss://" : "ws://";
        this.socket = new WebSocket(protocol + location.host + "/ws");

        this.socket.addEventListener("open", () => {
            console.log("WebSocket connected");
            this.emit('websocket:connected');
        });

        this.socket.addEventListener("message", (event) => {
            try {
                const data = JSON.parse(event.data);
                this.handleWebSocketMessage(data);
            } catch (error) {
                console.error("WebSocket message parse error:", error);
            }
        });

        this.socket.addEventListener("close", () => {
            console.log("WebSocket disconnected, attempting to reconnect...");
            setTimeout(() => this.initializeWebSocket(), 5000);
        });

        this.socket.addEventListener("error", (error) => {
            console.error("WebSocket error:", error);
        });
    }

    /**
     * Handle incoming WebSocket messages
     */
    handleWebSocketMessage(data) {
        if (data.logMsg) {
            this.emit('log:message', data);
        }
        if (data.tagDB) {
            this.invalidateCache('tagDB');
            this.emit('tagDB:update', data);
        }
        if (data.apConfig) {
            this.invalidateCache('config');
            this.emit('config:update', data);
        }
        if (data.sysUpdate) {
            this.emit('system:update', data);
        }
    }

    /**
     * Generic fetch method with caching, retry logic, and optimization
     */
    async fetch(endpointName, options = {}) {
        const endpoint = this.endpoints[endpointName];
        if (!endpoint) {
            throw new Error(`Unknown endpoint: ${endpointName}`);
        }

        const cacheKey = this.getCacheKey(endpointName, options);

        // Check cache first
        if (endpoint.cache && this.cache.has(cacheKey)) {
            const cached = this.cache.get(cacheKey);
            if (Date.now() - cached.timestamp < endpoint.cache) {
                return cached.data;
            }
        }

        // Build request options
        const requestOptions = {
            method: options.method || 'GET',
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            },
            ...options
        };

        if (options.body && typeof options.body === 'object') {
            if (requestOptions.method === 'POST' && !(options.body instanceof FormData)) {
                requestOptions.body = JSON.stringify(options.body);
            } else {
                requestOptions.body = options.body;
            }
        }

        let lastError;
        let attempts = endpoint.retry ? this.retryAttempts : 1;

        for (let attempt = 0; attempt < attempts; attempt++) {
            try {
                const response = await this.makeRequest(endpoint.url, requestOptions);

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }

                let data;
                const contentType = response.headers.get('content-type');

                if (contentType && contentType.includes('application/json')) {
                    data = await response.json();
                } else {
                    data = await response.text();
                }

                // Cache successful responses
                if (endpoint.cache) {
                    this.cache.set(cacheKey, {
                        data,
                        timestamp: Date.now()
                    });
                }

                return data;

            } catch (error) {
                lastError = error;
                console.warn(`Request attempt ${attempt + 1} failed for ${endpointName}:`, error.message);

                if (attempt < attempts - 1) {
                    await this.delay(this.retryDelay * Math.pow(2, attempt));
                }
            }
        }

        throw lastError;
    }

    /**
     * Make HTTP request with timeout
     */
    async makeRequest(url, options) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

        try {
            const response = await fetch(url, {
                ...options,
                signal: controller.signal
            });
            return response;
        } finally {
            clearTimeout(timeoutId);
        }
    }

    /**
     * Batch multiple API requests
     */
    async batch(requests) {
        const promises = requests.map(({ endpoint, options }) =>
            this.fetch(endpoint, options).catch(error => ({ error, endpoint }))
        );

        return Promise.all(promises);
    }

    /**
     * Get system configuration with caching
     */
    async getConfig() {
        return this.fetch('config');
    }

    /**
     * Get tag database with pagination support
     */
    async getTagDB(pos = 0, limit = 50) {
        const options = {
            method: 'GET',
            params: { pos, limit }
        };

        if (options.params) {
            const url = new URL(this.endpoints.tagDB.url, window.location.origin);
            Object.keys(options.params).forEach(key =>
                url.searchParams.append(key, options.params[key])
            );
            return this.makeRequest(url.toString(), options);
        }

        return this.fetch('tagDB', options);
    }

    /**
     * Send tag command with proper error handling
     */
    async sendTagCommand(mac, command, data = {}) {
        try {
            const formData = new FormData();
            formData.append('mac', mac);
            formData.append('cmd', command);

            // Add additional data fields
            Object.keys(data).forEach(key => {
                formData.append(key, data[key]);
            });

            const response = await this.fetch('tagCmd', {
                method: 'POST',
                body: formData
            });

            return {
                success: true,
                data: response,
                message: 'Command sent successfully'
            };
        } catch (error) {
            console.error('Tag command error:', error);
            return {
                success: false,
                error: error.message,
                message: 'Failed to send tag command'
            };
        }
    }

    /**
     * Save tag configuration with enhanced error handling
     */
    async saveTagConfig(mac, config) {
        try {
            const formData = new FormData();
            formData.append('mac', mac);

            // Add all configuration fields
            Object.keys(config).forEach(key => {
                formData.append(key, config[key]);
            });

            const response = await this.fetch('tagConfig', {
                method: 'POST',
                body: formData
            });

            return {
                success: true,
                data: response,
                message: 'Configuration saved successfully'
            };
        } catch (error) {
            console.error('Tag config save error:', error);
            return {
                success: false,
                error: error.message,
                message: 'Failed to save tag configuration'
            };
        }
    }

    /**
     * Save system configuration with proper validation
     */
    async saveConfig(config) {
        try {
            const formData = new FormData();
            Object.keys(config).forEach(key => {
                formData.append(key, config[key]);
            });

            const response = await this.fetch('saveApConfig', {
                method: 'POST',
                body: formData
            });

            return {
                success: true,
                data: response,
                message: 'System configuration saved successfully'
            };
        } catch (error) {
            console.error('System config save error:', error);
            return {
                success: false,
                error: error.message,
                message: 'Failed to save system configuration'
            };
        }
    }

    /**
     * Enhanced WiFi configuration save with JSON payload
     */
    async saveWifiConfig(config) {
        try {
            const response = await this.fetch('wifiSave', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(config)
            });

            return {
                success: true,
                data: response,
                message: 'WiFi configuration saved successfully'
            };
        } catch (error) {
            console.error('WiFi config save error:', error);
            return {
                success: false,
                error: error.message,
                message: 'Failed to save WiFi configuration'
            };
        }
    }

    /**
     * Upload file to LittleFS with enhanced error handling
     */
    async uploadFile(filename, content) {
        try {
            // Support both FormData and JSON payload
            if (typeof content === 'string') {
                // JSON payload for text content
                const response = await this.fetch('littlefsPut', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        filename: filename,
                        content: content
                    })
                });

                return {
                    success: true,
                    data: response,
                    message: 'File uploaded successfully'
                };
            } else {
                // FormData for binary content
                const formData = new FormData();
                formData.append('filename', filename);
                formData.append('content', content);

                const response = await this.fetch('littlefsPut', {
                    method: 'POST',
                    body: formData
                });

                return {
                    success: true,
                    data: response,
                    message: 'File uploaded successfully'
                };
            }
        } catch (error) {
            console.error('File upload error:', error);
            return {
                success: false,
                error: error.message,
                message: 'Failed to upload file'
            };
        }
    }

    /**
     * Enhanced system reboot with confirmation
     */
    async systemReboot(force = false) {
        try {
            if (!force && !confirm('Are you sure you want to reboot the system?')) {
                return {
                    success: false,
                    message: 'Reboot cancelled by user'
                };
            }

            const response = await this.fetch('reboot', {
                method: 'POST'
            });

            return {
                success: true,
                data: response,
                message: 'System reboot initiated'
            };
        } catch (error) {
            console.error('System reboot error:', error);
            return {
                success: false,
                error: error.message,
                message: 'Failed to initiate system reboot'
            };
        }
    }

    /**
     * Get system features with caching
     */
    async getFeatures() {
        try {
            const response = await this.fetch('features');
            return {
                success: true,
                data: response,
                message: 'Features retrieved successfully'
            };
        } catch (error) {
            console.error('Features retrieval error:', error);
            return {
                success: false,
                error: error.message,
                message: 'Failed to retrieve system features'
            };
        }
    }

    /**
     * Enhanced LED flash command with pattern support
     */
    async ledFlash(mac, pattern = null) {
        try {
            const params = new URLSearchParams();
            params.append('mac', mac);

            if (pattern) {
                params.append('pattern', pattern);
            }

            const response = await this.fetch('ledFlash', {
                method: 'GET'
            });

            return {
                success: true,
                data: response,
                message: 'LED flash command sent'
            };
        } catch (error) {
            console.error('LED flash error:', error);
            return {
                success: false,
                error: error.message,
                message: 'Failed to send LED flash command'
            };
        }
    }

    /**
     * Enhanced error reporting to backend
     */
    async reportError(error, url, lineNumber = null, context = null) {
        try {
            const errorData = {
                error: error.toString(),
                url: url,
                timestamp: new Date().toISOString(),
                userAgent: navigator.userAgent
            };

            if (lineNumber) {
                errorData.lineNumber = lineNumber;
            }

            if (context) {
                errorData.context = context;
            }

            await this.fetch('errorReport', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(errorData)
            });

            console.log('Error reported to backend');
        } catch (reportError) {
            console.error('Failed to report error to backend:', reportError);
        }
    }

    /**
     * Invalidate cache for specific endpoint
     */
    invalidateCache(endpointName) {
        const keysToDelete = [];
        for (const [key] of this.cache) {
            if (key.startsWith(endpointName)) {
                keysToDelete.push(key);
            }
        }
        keysToDelete.forEach(key => this.cache.delete(key));
    }

    /**
     * Clear all cache
     */
    clearCache() {
        this.cache.clear();
    }

    /**
     * Generate cache key
     */
    getCacheKey(endpoint, options) {
        const keyParts = [endpoint];
        if (options.params) {
            keyParts.push(JSON.stringify(options.params));
        }
        if (options.body && typeof options.body === 'string') {
            keyParts.push(options.body);
        }
        return keyParts.join('|');
    }

    /**
     * Delay utility
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Simple event emitter
     */
    emit(event, data) {
        if (this.listeners && this.listeners[event]) {
            this.listeners[event].forEach(callback => callback(data));
        }
    }

    /**
     * Add event listener
     */
    on(event, callback) {
        if (!this.listeners) this.listeners = {};
        if (!this.listeners[event]) this.listeners[event] = [];
        this.listeners[event].push(callback);
    }

    /**
     * Remove event listener
     */
    off(event, callback) {
        if (!this.listeners || !this.listeners[event]) return;
        const index = this.listeners[event].indexOf(callback);
        if (index > -1) {
            this.listeners[event].splice(index, 1);
        }
    }

    /**
     * Get cache statistics
     */
    getCacheStats() {
        return {
            size: this.cache.size,
            entries: Array.from(this.cache.keys())
        };
    }

    /**
     * Get connection status
     */
    getConnectionStatus() {
        return {
            websocket: this.socket ? this.socket.readyState : WebSocket.CLOSED,
            cache: this.cache.size
        };
    }
}

// Create global API instance
window.apiManager = new APIManager();

// Export for module use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = APIManager;
}
