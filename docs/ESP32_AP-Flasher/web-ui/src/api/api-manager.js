/**
 * API Manager - Centralized API handling for OpenEPL ESP32
 * Provides consistent error handling, caching, and request management
 */

class APIManager {
    constructor(baseURL = '') {
        this.baseURL = baseURL;
        this.cache = new Map();
        this.pendingRequests = new Map();
        this.retryAttempts = 3;
        this.timeout = 15000;
        this.rateLimitDelay = 100;
        this.lastRequestTime = 0;
    }

    // Enhanced fetch with retry logic and caching
    async safeFetch(endpoint, options = {}) {
        const url = this.baseURL + endpoint;
        const requestKey = `${options.method || 'GET'}-${url}`;

        // Rate limiting
        const now = Date.now();
        const timeSinceLastRequest = now - this.lastRequestTime;
        if (timeSinceLastRequest < this.rateLimitDelay) {
            await this.delay(this.rateLimitDelay - timeSinceLastRequest);
        }
        this.lastRequestTime = Date.now();

        // Check for pending identical requests
        if (this.pendingRequests.has(requestKey)) {
            return this.pendingRequests.get(requestKey);
        }

        // Check cache for GET requests
        if ((!options.method || options.method === 'GET') && this.cache.has(url)) {
            const cached = this.cache.get(url);
            if (Date.now() - cached.timestamp < 30000) { // 30 second cache
                return cached.response;
            }
        }

        // Create request with timeout
        const requestPromise = this.executeRequest(url, options);
        this.pendingRequests.set(requestKey, requestPromise);

        try {
            const response = await requestPromise;
            
            // Cache successful GET responses
            if ((!options.method || options.method === 'GET') && response.ok) {
                this.cache.set(url, {
                    response: response.clone(),
                    timestamp: Date.now()
                });
            }

            return response;
        } finally {
            this.pendingRequests.delete(requestKey);
        }
    }

    async executeRequest(url, options) {
        let lastError;

        for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), this.timeout);

                const response = await fetch(url, {
                    ...options,
                    signal: controller.signal,
                    headers: {
                        'Content-Type': 'application/json',
                        ...options.headers
                    }
                });

                clearTimeout(timeoutId);

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }

                return response;

            } catch (error) {
                lastError = error;
                console.warn(`Request attempt ${attempt} failed for ${url}:`, error.message);

                if (attempt < this.retryAttempts) {
                    await this.delay(1000 * attempt); // Exponential backoff
                }
            }
        }

        throw lastError;
    }

    // Specialized API methods
    async getAPConfig() {
        try {
            const response = await this.safeFetch('get_ap_config');
            return await response.json();
        } catch (error) {
            console.error('Failed to get AP config:', error);
            throw error;
        }
    }

    async getTagDatabase(pos = 0) {
        try {
            const response = await this.safeFetch(`get_db?pos=${pos}`);
            return await response.json();
        } catch (error) {
            console.error('Failed to get tag database:', error);
            throw error;
        }
    }

    async getWiFiConfig() {
        try {
            const response = await this.safeFetch('get_wifi_config');
            return await response.json();
        } catch (error) {
            console.error('Failed to get WiFi config:', error);
            throw error;
        }
    }

    async saveWiFiConfig(config) {
        try {
            const response = await this.safeFetch('save_wifi_config', {
                method: 'POST',
                body: JSON.stringify(config)
            });
            return await response.json();
        } catch (error) {
            console.error('Failed to save WiFi config:', error);
            throw error;
        }
    }

    async sendTagCommand(command, params = {}) {
        try {
            const response = await this.safeFetch('tag_cmd', {
                method: 'POST',
                body: JSON.stringify({ command, ...params })
            });
            return await response.json();
        } catch (error) {
            console.error('Failed to send tag command:', error);
            throw error;
        }
    }

    async uploadFile(file, endpoint = 'upload') {
        try {
            const formData = new FormData();
            formData.append('file', file);

            const response = await this.safeFetch(endpoint, {
                method: 'POST',
                body: formData,
                headers: {} // Don't set Content-Type for FormData
            });
            return await response.json();
        } catch (error) {
            console.error('Failed to upload file:', error);
            throw error;
        }
    }

    async getSystemStatus() {
        try {
            const response = await this.safeFetch('status');
            return await response.json();
        } catch (error) {
            console.error('Failed to get system status:', error);
            throw error;
        }
    }

    async rebootSystem() {
        try {
            const response = await this.safeFetch('reboot', { method: 'POST' });
            return await response.json();
        } catch (error) {
            console.error('Failed to reboot system:', error);
            throw error;
        }
    }

    // Utility methods
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    clearCache() {
        this.cache.clear();
        console.log('API cache cleared');
    }

    // Error reporting
    reportError(error, context, line, type = 'javascript') {
        const errorData = {
            message: error.message || String(error),
            stack: error.stack || '',
            context: context || '',
            line: line || 0,
            type,
            timestamp: new Date().toISOString(),
            userAgent: navigator.userAgent,
            url: window.location.href
        };

        // Try to send error to backend
        this.safeFetch('api/error', {
            method: 'POST',
            body: JSON.stringify(errorData)
        }).catch(() => {
            // Silently fail if error reporting fails
            console.warn('Failed to report error to backend');
        });
    }

    // Health check
    async healthCheck() {
        try {
            const response = await fetch('get_ap_config', { method: 'HEAD' });
            return response.ok;
        } catch (error) {
            return false;
        }
    }
}

// Create global instance
window.apiManager = new APIManager();

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = APIManager;
}