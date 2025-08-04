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
        
        // API endpoint configurations
        this.endpoints = {
            // System endpoints
            config: { url: 'get_ap_config', cache: 10000, retry: true },
            sysinfo: { url: 'sysinfo', cache: 5000, retry: true },
            version: { url: 'version.txt', cache: 60000, retry: false },
            
            // Tag management
            tagDB: { url: 'get_db', cache: 2000, retry: true },
            tagCmd: { url: 'tag_cmd', cache: false, retry: true },
            tagConfig: { url: 'save_tagconfig', cache: false, retry: true },
            
            // WiFi and network
            wifiConfig: { url: 'get_wifi_config', cache: 30000, retry: true },
            wifiSave: { url: 'save_wifi_config', cache: false, retry: true },
            ssidList: { url: 'get_ssid_list', cache: 10000, retry: true },
            
            // Content and updates
            contentCards: { url: 'content_cards.json', cache: 60000, retry: false },
            updateActions: { url: 'update_actions', cache: false, retry: true },
            updateOTA: { url: 'update_ota', cache: false, retry: false },
            
            // File operations
            littlefsPut: { url: 'littlefs_put', cache: false, retry: true },
            backup: { url: 'backup_db', cache: false, retry: false },
            
            // System actions
            reboot: { url: 'reboot', cache: false, retry: false },
            rollback: { url: 'rollback', cache: false, retry: false }
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
     * Send tag command
     */
    async sendTagCommand(mac, command, data = {}) {
        const formData = new FormData();
        formData.append('mac', mac);
        formData.append('cmd', command);
        
        Object.keys(data).forEach(key => {
            formData.append(key, data[key]);
        });

        return this.fetch('tagCmd', {
            method: 'POST',
            body: formData
        });
    }

    /**
     * Save system configuration
     */
    async saveConfig(config) {
        const formData = new FormData();
        Object.keys(config).forEach(key => {
            formData.append(key, config[key]);
        });

        return this.fetch('config', {
            method: 'POST',
            body: formData
        });
    }

    /**
     * Upload file to LittleFS
     */
    async uploadFile(filename, content) {
        const formData = new FormData();
        formData.append('filename', filename);
        formData.append('content', content);

        return this.fetch('littlefsPut', {
            method: 'POST',
            body: formData
        });
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
