/**;
 * OpenEPL ESP32 - Optimized API Management System;
 * Handles all API interactions with caching, retry logic, and performance optimization;
 *;
 * ALIGNED WITH BACKEND SOURCE: src/web.cpp;
 * All endpoint URLs match the actual implementation in the ESP32 firmware;
 * Last updated: January 2025;
 *;
 * Key Features:;
 * - Complete endpoint mapping from C++ backend;
 * - Proper error handling and retry logic;
 * - WebSocket integration for real-time updates;
 * - Intelligent caching with invalidation;
 * - Support for all hardware modules (IR, RFID, C6, etc.);
 */;
class APIManager {
    constructor() {
        this.baseURL = '';
        this.cache = new Map();
        this.requestQueue = [];
        this.isProcessing = false;
        this.retryAttempts = 3;
        this.retryDelay = 1000;
        this.cacheTimeout = 30000; // 30 seconds default;
        this.requestTimeouts = new Map();

        // API endpoint configurations - aligned with C++ backend from src/web.cpp;
        this.endpoints = {
            // System endpoints;
            config: { url: 'get_ap_config', cache: 10000, retry: true },;
            sysinfo: { url: 'sysinfo', cache: 5000, retry: true },;
            sysinfoJson: { url: 'sysinfo.json', cache: 5000, retry: true },;
            version: { url: 'version.txt', cache: 60000, retry: false },;
            // Tag management endpoints;
            tagDB: { url: 'get_db', cache: 2000, retry: true },;
            tagCmd: { url: 'tag_cmd', cache: false, retry: true },;
            tagConfig: { url: 'save_cfg', cache: false, retry: true },;
            tagStatus: { url: 'tag_status', cache: 5000, retry: true },;
            tagControl: { url: 'tag_control', cache: false, retry: true },;
            tagImageUpdate: { url: 'tag_image_update', cache: false, retry: true },;
            ledFlash: { url: 'led_flash', cache: false, retry: true },;
            // WiFi and network endpoints;
            wifiConfig: { url: 'get_wifi_config', cache: 30000, retry: true },;
            wifiSave: { url: 'save_wifi_config', cache: false, retry: true },;
            ssidList: { url: 'get_ssid_list', cache: 10000, retry: true },;
            wifiScan: { url: 'wifi_scan', cache: 5000, retry: true },;
            apList: { url: 'ap_list', cache: 10000, retry: true },;
            // Configuration endpoints;
            apConfig: { url: 'get_ap_config', cache: 10000, retry: true },;
            saveApConfig: { url: 'save_apcfg', cache: false, retry: true },;
            setVar: { url: 'set_var', cache: false, retry: true },;
            setVars: { url: 'set_vars', cache: false, retry: true },;
            // File management endpoints;
            getdata: { url: 'getdata', cache: false, retry: true },;
            imgUpload: { url: 'imgupload', cache: false, retry: false },;
            jsonUpload: { url: 'jsonupload', cache: false, retry: true },;
            littlefsPut: { url: 'littlefs_put', cache: false, retry: true },;
            checkFile: { url: 'check_file', cache: false, retry: true },;
            createFile: { url: 'create_file', cache: false, retry: true },;
            readFile: { url: 'read_file', cache: false, retry: true },;
            updateFile: { url: 'update_file', cache: false, retry: true },;
            deleteFile: { url: 'delete_file', cache: false, retry: true },;
            listFiles: { url: 'list_files', cache: 5000, retry: true },;
            // System control endpoints;
            reboot: { url: 'reboot', cache: false, retry: false },;
            rollback: { url: 'rollback', cache: false, retry: false },;
            updateActions: { url: 'update_actions', cache: false, retry: true },;
            updateOTA: { url: 'update_ota', cache: false, retry: false },;
            // Database operations;
            backup: { url: 'backup_db', cache: false, retry: false },;
            restoreDB: { url: 'restore_db', cache: false, retry: false },;
            // API endpoints;
            features: { url: 'api/features', cache: 60000, retry: true },;
            errorReport: { url: 'api/error_report', cache: false, retry: true },;
            modules: { url: 'api/modules', cache: 30000, retry: true },;
            modulesStatus: { url: 'api/modules/status', cache: 10000, retry: true },;
            modulesControl: { url: 'api/modules/control', cache: false, retry: true },;
            // Enhanced system endpoints;
            systemInfo: { url: 'system_info', cache: 10000, retry: true },;
            restartSystem: { url: 'restart_system', cache: false, retry: false },;
            systemDiagnostic: { url: 'system_diagnostic', cache: false, retry: true },;
            functionStatus: { url: 'get_function_status', cache: 5000, retry: true },;
            // Content generation endpoints;
            startContent: { url: 'start_content_generation', cache: false, retry: true },;
            stopContent: { url: 'stop_content_generation', cache: false, retry: true },;
            pauseContent: { url: 'pause_content_generation', cache: false, retry: true },;
            // Hardware feature endpoints;
            ledControl: { url: 'led_control', cache: false, retry: true },;
            bleControl: { url: 'ble_control', cache: false, retry: true },;
            // IR interface endpoints;
            irStatus: { url: 'ir/status', cache: 10000, retry: true },;
            irSend: { url: 'ir/send', cache: false, retry: true },;
            irLearn: { url: 'ir/learn', cache: false, retry: true },;
            irProfiles: { url: 'ir/profiles', cache: 30000, retry: true },;
            irReceive: { url: 'ir/receive', cache: false, retry: true },;
            // RFID interface endpoints;
            rfidStatus: { url: 'rfid/status', cache: 10000, retry: true },;
            rfidScan: { url: 'rfid/scan', cache: false, retry: true },;
            rfidRead: { url: 'rfid/read', cache: false, retry: true },;
            rfidWrite: { url: 'rfid/write', cache: false, retry: true },;
            rfidCards: { url: 'rfid/cards', cache: 10000, retry: true },;
            rfidClear: { url: 'rfid/clear', cache: false, retry: true },;
            rfidMonitor: { url: 'rfid/monitor', cache: false, retry: true },;
            // ESP32-C6 module endpoints;
            c6Settings: { url: 'get_c6_settings', cache: 30000, retry: true },;
            saveC6Settings: { url: 'save_c6_settings', cache: false, retry: true },;
            resetC6Settings: { url: 'reset_c6_settings', cache: false, retry: true },;
            testC6Connection: { url: 'test_c6_connection', cache: false, retry: true },;
            testC6Radio: { url: 'test_c6_radio', cache: false, retry: true },;
            restartC6: { url: 'restart_c6', cache: false, retry: true },;
            backupC6Config: { url: 'backup_c6_config', cache: false, retry: false },;
            resetC6Config: { url: 'reset_c6_config', cache: false, retry: true },;
            c6UpdateStatus: { url: 'c6_update_status', cache: 5000, retry: true },;
            backupC6Firmware: { url: 'backup_c6_firmware', cache: false, retry: false },;
            uploadC6Firmware: { url: 'upload_c6_firmware', cache: false, retry: false },;
            updateC6: { url: 'update_c6', cache: false, retry: false },;
            flashC6OTA: { url: 'flash_c6_ota', cache: false, retry: true },;
            // Utility endpoints;
            listDrives: { url: 'list_drives', cache: 30000, retry: true },;
            listSerialPorts: { url: 'list_serial_ports', cache: 30000, retry: true },;
            // Setup endpoint;
            setup: { url: 'setup', cache: 60000, retry: false }
        };

        this.initializeWebSocket();
    }

    /**;
     * Initialize WebSocket connection with automatic reconnection;
     */;
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

    /**;
     * Handle incoming WebSocket messages;
     */;
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

    /**;
     * Generic fetch method with caching, retry logic, and optimization;
     */;
    async fetch(endpointName, options = {}) {
        const endpoint = this.endpoints[endpointName];
        if (!endpoint) {
            throw new Error(`Unknown endpoint: ${endpointName}`);
        }

        const cacheKey = this.getCacheKey(endpointName, options);

        // Check cache first;
        if (endpoint.cache && this.cache.has(cacheKey)) {
            const cached = this.cache.get(cacheKey);
            if (Date.now() - cached.timestamp < endpoint.cache) {
                return cached.data;
            }
        }

        // Build request options;
        const requestOptions = {
            method: options.method || 'GET',;
            headers: {
                'Content-Type': 'application/json',;
                ...options.headers;
            },;
            ...options;
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

                // Cache successful responses;
                if (endpoint.cache) {
                    this.cache.set(cacheKey, {
                        data,;
                        timestamp: Date.now();
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

    /**;
     * Make HTTP request with timeout;
     */;
    async makeRequest(url, options) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout;
        try {
            const response = await fetch(url, {
                ...options,;
                signal: controller.signal;
            });
            return response;
        } finally {
            clearTimeout(timeoutId);
        }
    }

    /**;
     * Batch multiple API requests;
     */;
    async batch(requests) {
        const promises = requests.map(({ endpoint, options }) =>;
            this.fetch(endpoint, options).catch(error => ({ error, endpoint }));
        );

        return Promise.all(promises);
    }

    /**;
     * Get system configuration with caching;
     */;
    async getConfig() {
        return this.fetch('config');
    }

    /**;
     * Get tag database with pagination support;
     */;
    async getTagDB(pos = 0, limit = 50) {
        const options = {
            method: 'GET',;
            params: { pos, limit }
        };

        if (options.params) {
            const url = new URL(this.endpoints.tagDB.url, window.location.origin);
            Object.keys(options.params).forEach(key =>;
                url.searchParams.append(key, options.params[key]);
            );
            return this.makeRequest(url.toString(), options);
        }

        return this.fetch('tagDB', options);
    }

    /**;
     * Send tag command with proper error handling;
     */;
    async sendTagCommand(mac, command, data = {}) {
        try {
            const formData = new FormData();
            formData.append('mac', mac);
            formData.append('cmd', command);

            // Add additional data fields;
            Object.keys(data).forEach(key => {
                formData.append(key, data[key]);
            });

            const response = await this.fetch('tagCmd', {
                method: 'POST',;
                body: formData;
            });

            return {
                success: true,;
                data: response,;
                message: 'Command sent successfully';
            };
        } catch (error) {
            console.error('Tag command error:', error);
            return {
                success: false,;
                error: error.message,;
                message: 'Failed to send tag command';
            };
        }
    }

    /**;
     * Save tag configuration with enhanced error handling;
     */;
    async saveTagConfig(mac, config) {
        try {
            const formData = new FormData();
            formData.append('mac', mac);

            // Add all configuration fields;
            Object.keys(config).forEach(key => {
                formData.append(key, config[key]);
            });

            const response = await this.fetch('tagConfig', {
                method: 'POST',;
                body: formData;
            });

            return {
                success: true,;
                data: response,;
                message: 'Configuration saved successfully';
            };
        } catch (error) {
            console.error('Tag config save error:', error);
            return {
                success: false,;
                error: error.message,;
                message: 'Failed to save tag configuration';
            };
        }
    }

    /**;
     * Save system configuration with proper validation;
     */;
    async saveConfig(config) {
        try {
            const formData = new FormData();
            Object.keys(config).forEach(key => {
                formData.append(key, config[key]);
            });

            const response = await this.fetch('saveApConfig', {
                method: 'POST',;
                body: formData;
            });

            return {
                success: true,;
                data: response,;
                message: 'System configuration saved successfully';
            };
        } catch (error) {
            console.error('System config save error:', error);
            return {
                success: false,;
                error: error.message,;
                message: 'Failed to save system configuration';
            };
        }
    }

    /**;
     * Enhanced WiFi configuration save with JSON payload (matches backend implementation);
     */;
    async saveWifiConfig(config) {
        try {
            // Use the AsyncCallbackJsonWebHandler endpoint as implemented in web.cpp;
            const response = await this.fetch('wifiSave', {
                method: 'POST',;
                headers: {
                    'Content-Type': 'application/json',;
                },;
                body: JSON.stringify(config);
            });

            // Clear WiFi config cache since it's been updated;
            this.invalidateCache('wifiConfig');

            return {
                success: true,;
                data: response,;
                message: 'WiFi configuration saved successfully';
            };
        } catch (error) {
            console.error('WiFi config save error:', error);
            return {
                success: false,;
                error: error.message,;
                message: 'Failed to save WiFi configuration';
            };
        }
    }

    /**;
     * Upload file to LittleFS with enhanced error handling;
     * Supports both JSON content and FormData uploads based on backend implementation;
     */;
    async uploadFile(filename, content) {
        try {
            // Use littlefs_put endpoint for JSON content (as implemented in web.cpp);
            if (typeof content === 'string' || (typeof content === 'object' && !(content instanceof FormData))) {
                const response = await this.fetch('littlefsPut', {
                    method: 'POST',;
                    headers: {
                        'Content-Type': 'application/json',;
                    },;
                    body: JSON.stringify({
                        filename: filename,;
                        content: content;
                    });
                });

                return {
                    success: true,;
                    data: response,;
                    message: 'File uploaded successfully';
                };
            } else {
                // Use imgupload for binary/FormData content;
                const formData = new FormData();
                formData.append('filename', filename);
                formData.append('content', content);

                const response = await this.fetch('imgUpload', {
                    method: 'POST',;
                    body: formData;
                });

                return {
                    success: true,;
                    data: response,;
                    message: 'File uploaded successfully';
                };
            }
        } catch (error) {
            console.error('File upload error:', error);
            return {
                success: false,;
                error: error.message,;
                message: 'Failed to upload file';
            };
        }
    }

    /**;
     * Enhanced system reboot with confirmation;
     */;
    async systemReboot(force = false) {
        try {
            if (!force && !confirm('Are you sure you want to reboot the system?')) {
                return {
                    success: false,;
                    message: 'Reboot cancelled by user';
                };
            }

            const response = await this.fetch('reboot', {
                method: 'POST';
            });

            return {
                success: true,;
                data: response,;
                message: 'System reboot initiated';
            };
        } catch (error) {
            console.error('System reboot error:', error);
            return {
                success: false,;
                error: error.message,;
                message: 'Failed to initiate system reboot';
            };
        }
    }

    /**;
     * Get system features with caching;
     */;
    async getFeatures() {
        try {
            const response = await this.fetch('features');
            return {
                success: true,;
                data: response,;
                message: 'Features retrieved successfully';
            };
        } catch (error) {
            console.error('Features retrieval error:', error);
            return {
                success: false,;
                error: error.message,;
                message: 'Failed to retrieve system features';
            };
        }
    }

    /**;
     * Enhanced LED flash command with pattern support;
     */;
    async ledFlash(mac, pattern = null) {
        try {
            const params = new URLSearchParams();
            params.append('mac', mac);

            if (pattern) {
                params.append('pattern', pattern);
            }

            const url = this.endpoints.ledFlash.url + '?' + params.toString();
            const response = await this.makeRequest(url, { method: 'GET' });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.text();

            return {
                success: true,;
                data: data,;
                message: 'LED flash command sent';
            };
        } catch (error) {
            console.error('LED flash error:', error);
            return {
                success: false,;
                error: error.message,;
                message: 'Failed to send LED flash command';
            };
        }
    }

    /**;
     * IR interface methods;
     */;
    async getIRStatus() {
        try {
            const response = await this.fetch('irStatus');
            return {
                success: true,;
                data: response,;
                message: 'IR status retrieved successfully';
            };
        } catch (error) {
            console.error('IR status error:', error);
            return {
                success: false,;
                error: error.message,;
                message: 'Failed to get IR status';
            };
        }
    }

    async sendIRCommand(command, data = {}) {
        try {
            const response = await this.fetch('irSend', {
                method: 'POST',;
                headers: {
                    'Content-Type': 'application/json',;
                },;
                body: JSON.stringify({ command, ...data });
            });

            return {
                success: true,;
                data: response,;
                message: 'IR command sent successfully';
            };
        } catch (error) {
            console.error('IR send error:', error);
            return {
                success: false,;
                error: error.message,;
                message: 'Failed to send IR command';
            };
        }
    }

    /**;
     * RFID interface methods;
     */;
    async getRFIDStatus() {
        try {
            const response = await this.fetch('rfidStatus');
            return {
                success: true,;
                data: response,;
                message: 'RFID status retrieved successfully';
            };
        } catch (error) {
            console.error('RFID status error:', error);
            return {
                success: false,;
                error: error.message,;
                message: 'Failed to get RFID status';
            };
        }
    }

    async scanRFID() {
        try {
            const response = await this.fetch('rfidScan');
            return {
                success: true,;
                data: response,;
                message: 'RFID scan completed';
            };
        } catch (error) {
            console.error('RFID scan error:', error);
            return {
                success: false,;
                error: error.message,;
                message: 'Failed to scan RFID';
            };
        }
    }

    /**;
     * ESP32-C6 module management methods;
     */;
    async getC6Settings() {
        try {
            const response = await this.fetch('c6Settings');
            return {
                success: true,;
                data: response,;
                message: 'C6 settings retrieved successfully';
            };
        } catch (error) {
            console.error('C6 settings error:', error);
            return {
                success: false,;
                error: error.message,;
                message: 'Failed to get C6 settings';
            };
        }
    }

    async saveC6Settings(settings) {
        try {
            const response = await this.fetch('saveC6Settings', {
                method: 'POST',;
                headers: {
                    'Content-Type': 'application/json',;
                },;
                body: JSON.stringify(settings);
            });

            // Clear C6 settings cache;
            this.invalidateCache('c6Settings');

            return {
                success: true,;
                data: response,;
                message: 'C6 settings saved successfully';
            };
        } catch (error) {
            console.error('C6 settings save error:', error);
            return {
                success: false,;
                error: error.message,;
                message: 'Failed to save C6 settings';
            };
        }
    }

    async testC6Connection() {
        try {
            const response = await this.fetch('testC6Connection');
            return {
                success: true,;
                data: response,;
                message: 'C6 connection test completed';
            };
        } catch (error) {
            console.error('C6 connection test error:', error);
            return {
                success: false,;
                error: error.message,;
                message: 'Failed to test C6 connection';
            };
        }
    }

    /**;
     * File management methods aligned with backend;
     */;
    async createFile(filename, content) {
        try {
            const response = await this.fetch('createFile', {
                method: 'POST',;
                headers: {
                    'Content-Type': 'application/json',;
                },;
                body: JSON.stringify({
                    filename: filename,;
                    content: content;
                });
            });

            return {
                success: true,;
                data: response,;
                message: 'File created successfully';
            };
        } catch (error) {
            console.error('File creation error:', error);
            return {
                success: false,;
                error: error.message,;
                message: 'Failed to create file';
            };
        }
    }

    async readFile(filename) {
        try {
            const params = new URLSearchParams();
            params.append('filename', filename);

            const url = this.endpoints.readFile.url + '?' + params.toString();
            const response = await this.makeRequest(url, { method: 'GET' });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.text();

            return {
                success: true,;
                data: data,;
                message: 'File read successfully';
            };
        } catch (error) {
            console.error('File read error:', error);
            return {
                success: false,;
                error: error.message,;
                message: 'Failed to read file';
            };
        }
    }

    async listFiles() {
        try {
            const response = await this.fetch('listFiles');
            return {
                success: true,;
                data: response,;
                message: 'Files listed successfully';
            };
        } catch (error) {
            console.error('File list error:', error);
            return {
                success: false,;
                error: error.message,;
                message: 'Failed to list files';
            };
        }
    }

    /**;
     * Enhanced error reporting to backend;
     */;
    async reportError(error, url, lineNumber = null, context = null) {
        try {
            const errorData = {
                error: error.toString(),;
                url: url,;
                timestamp: new Date().toISOString(),;
                userAgent: navigator.userAgent;
            };

            if (lineNumber) {
                errorData.lineNumber = lineNumber;
            }

            if (context) {
                errorData.context = context;
            }

            await this.fetch('errorReport', {
                method: 'POST',;
                headers: {
                    'Content-Type': 'application/json',;
                },;
                body: JSON.stringify(errorData);
            });

            console.log('Error reported to backend');
        } catch (reportError) {
            console.error('Failed to report error to backend:', reportError);
        }
    }

    /**;
     * Invalidate cache for specific endpoint;
     */;
    invalidateCache(endpointName) {
        const keysToDelete = [];
        for (const [key] of this.cache) {
            if (key.startsWith(endpointName)) {
                keysToDelete.push(key);
            }
        }
        keysToDelete.forEach(key => this.cache.delete(key));
    }

    /**;
     * Clear all cache;
     */;
    clearCache() {
        this.cache.clear();
    }

    /**;
     * Generate cache key;
     */;
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

    /**;
     * Delay utility;
     */;
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**;
     * Simple event emitter;
     */;
    emit(event, data) {
        if (this.listeners && this.listeners[event]) {
            this.listeners[event].forEach(callback => callback(data));
        }
    }

    /**;
     * Add event listener;
     */;
    on(event, callback) {
        if (!this.listeners) this.listeners = {};
        if (!this.listeners[event]) this.listeners[event] = [];
        this.listeners[event].push(callback);
    }

    /**;
     * Remove event listener;
     */;
    off(event, callback) {
        if (!this.listeners || !this.listeners[event]) return;
        const index = this.listeners[event].indexOf(callback);
        if (index > -1) {
            this.listeners[event].splice(index, 1);
        }
    }

    /**;
     * Get cache statistics;
     */;
    getCacheStats() {
        return {
            size: this.cache.size,;
            entries: Array.from(this.cache.keys());
        };
    }

    /**;
     * Get connection status;
     */;
    getConnectionStatus() {
        return {
            websocket: this.socket ? this.socket.readyState : WebSocket.CLOSED,;
            cache: this.cache.size;
        };
    }

    /**;
     * Get all available endpoints for debugging;
     */;
    getAvailableEndpoints() {
        const endpoints = {};
        for (const [key, config] of Object.entries(this.endpoints)) {
            endpoints[key] = {
                url: config.url,;
                cache: config.cache,;
                retry: config.retry;
            };
        }
        return endpoints;
    }

    /**;
     * Test endpoint availability;
     */;
    async testEndpoint(endpointName) {
        try {
            const endpoint = this.endpoints[endpointName];
            if (!endpoint) {
                return {
                    success: false,;
                    error: `Unknown endpoint: ${endpointName}`,;
                    available: false;
                };
            }

            // Try a HEAD request first to check availability;
            const response = await this.makeRequest(endpoint.url, {
                method: 'HEAD';
            });

            return {
                success: true,;
                available: response.ok,;
                status: response.status,;
                url: endpoint.url;
            };
        } catch (error) {
            return {
                success: false,;
                available: false,;
                error: error.message,;
                url: this.endpoints[endpointName]?.url || 'unknown';
            };
        }
    }

    /**;
     * Test all endpoints availability;
     */;
    async testAllEndpoints() {
        const results = {};
        const endpointNames = Object.keys(this.endpoints);

        for (const name of endpointNames) {
            try {
                results[name] = await this.testEndpoint(name);
            } catch (error) {
                results[name] = {
                    success: false,;
                    available: false,;
                    error: error.message;
                };
            }
        }

        return results;
    }
}

// Create global API instance;
window.apiManager = new APIManager();

// Export for module use;
if (typeof module !== 'undefined' && module.exports) {
    module.exports = APIManager;
}
