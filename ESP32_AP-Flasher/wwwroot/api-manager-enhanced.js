// OpenEPL ESP32 - Enhanced API Manager
// Provides comprehensive API management with feature detection

class APIManager {
    constructor() {
        this.baseURL = '';
        this.endpoints = {};
        this.featureEndpoints = {};
        this.retryCount = 3;
        this.timeout = 10000;
        this.init();
    }

    init() {
        this.setupStandardEndpoints();
        this.setupFeatureEndpoints();
        this.setupErrorHandling();
    }

    setupStandardEndpoints() {
        this.endpoints = {
            // Core System
            status: '/api/status',
            config: '/api/config',
            reboot: '/api/reboot',
            
            // Tag Management
            tagDB: '/get_db',
            tagInfo: '/get_tag',
            tagCommand: '/tag_cmd',
            
            // WiFi & Network
            wifiScan: '/scan',
            wifiConnect: '/connect',
            wifiStatus: '/status',
            
            // System Info
            systemInfo: 'get_ap_config',
            memory: '/heap',
            uptime: '/uptime',
            
            // File Operations
            upload: '/upload',
            download: '/download',
            list: '/list'
        };
    }

    setupFeatureEndpoints() {
        this.featureEndpoints = {
            // RGB LED Control (HAS_RGB_LED)
            'HAS_RGB_LED': {
                control: '/led_control',
                status: '/led_status',
                pattern: '/led_pattern',
                brightness: '/led_brightness'
            },
            
            // TFT Display (HAS_TFT)
            'HAS_TFT': {
                display: '/tft_display',
                clear: '/tft_clear',
                status: '/tft_status',
                brightness: '/tft_brightness'
            },
            
            // External Flasher (HAS_EXT_FLASHER)
            'HAS_EXT_FLASHER': {
                flash: '/ext_flash',
                status: '/flasher_status',
                reset: '/flasher_reset',
                power: '/flasher_power'
            },
            
            // C6 Module (C6_OTA_FLASHING)
            'C6_OTA_FLASHING': {
                flash: '/c6_flash',
                status: '/c6_status',
                reboot: '/c6_reboot',
                config: '/c6_config'
            },
            
            // BLE Writer (HAS_BLE_WRITER)
            'HAS_BLE_WRITER': {
                scan: '/ble_scan',
                connect: '/ble_connect',
                write: '/ble_write',
                status: '/ble_status'
            },
            
            // SubGHz (HAS_SUBGHZ)
            'HAS_SUBGHZ': {
                scan: '/subghz_scan',
                transmit: '/subghz_tx',
                status: '/subghz_status',
                config: '/subghz_config'
            },
            
            // Tag Features
            'TAG_LED_CONTROL': {
                flash: '/tag_led_flash',
                pattern: '/tag_led_pattern',
                bulk: '/tag_bulk_led'
            },
            
            'TAG_BATTERY_MONITOR': {
                levels: '/battery_levels',
                alerts: '/battery_alerts',
                history: '/battery_history'
            },
            
            'TAG_SIGNAL_MONITOR': {
                strength: '/signal_strength',
                quality: '/signal_quality',
                history: '/signal_history'
            },
            
            'FIND_MY_TAG': {
                locate: '/find_tag',
                stop: '/stop_find',
                bulk_find: '/bulk_find'
            }
        };
    }

    setupErrorHandling() {
        // Global error handler for API requests
        window.addEventListener('unhandledrejection', (event) => {
            if (event.reason && event.reason.name === 'APIError') {
                console.error('API Error:', event.reason.message);
                this.showAPIError(event.reason.message);
                event.preventDefault();
            }
        });
    }

    // Core API methods
    async request(endpoint, options = {}) {
        const config = {
            timeout: this.timeout,
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            },
            ...options
        };

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), config.timeout);
            
            const response = await fetch(this.baseURL + endpoint, {
                ...config,
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            if (!response.ok) {
                throw new APIError(`HTTP ${response.status}: ${response.statusText}`, response.status);
            }
            
            const contentType = response.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
                return await response.json();
            } else {
                return await response.text();
            }
        } catch (error) {
            if (error.name === 'AbortError') {
                throw new APIError('Request timeout', 408);
            }
            throw error;
        }
    }

    async get(endpoint, params = {}) {
        const url = new URL(this.baseURL + endpoint, window.location.origin);
        Object.entries(params).forEach(([key, value]) => {
            url.searchParams.append(key, value);
        });
        
        return this.request(url.pathname + url.search, { method: 'GET' });
    }

    async post(endpoint, data = {}, isFormData = false) {
        const options = { method: 'POST' };
        
        if (isFormData) {
            options.body = data;
            // Don't set Content-Type for FormData, let browser set it
            options.headers = {};
        } else {
            options.body = JSON.stringify(data);
            options.headers = { 'Content-Type': 'application/json' };
        }
        
        return this.request(endpoint, options);
    }

    // Feature-specific API methods
    async callFeatureAPI(feature, action, data = {}) {
        if (!this.featureEndpoints[feature]) {
            throw new APIError(`Feature ${feature} not supported`, 400);
        }
        
        const endpoint = this.featureEndpoints[feature][action];
        if (!endpoint) {
            throw new APIError(`Action ${action} not available for feature ${feature}`, 400);
        }
        
        // Check if feature is available (if feature manager is loaded)
        if (window.featureManager && !window.featureManager.hasFeature(feature)) {
            throw new APIError(`Feature ${feature} not available on this device`, 503);
        }
        
        return this.post(endpoint, data);
    }

    // Convenience methods for common operations
    async getSystemStatus() {
        return this.get(this.endpoints.status);
    }

    async getTagDatabase(position = 0) {
        return this.get(this.endpoints.tagDB, { pos: position });
    }

    async sendTagCommand(mac, command, data = {}) {
        const formData = new FormData();
        formData.append('mac', mac);
        formData.append('cmd', command);
        
        Object.entries(data).forEach(([key, value]) => {
            formData.append(key, value);
        });
        
        return this.post(this.endpoints.tagCommand, formData, true);
    }

    // RGB LED Control
    async setRGBColor(color) {
        return this.callFeatureAPI('HAS_RGB_LED', 'control', { action: 'setColor', color });
    }

    async setRGBBrightness(brightness) {
        return this.callFeatureAPI('HAS_RGB_LED', 'brightness', { brightness });
    }

    async rgbBlink(duration = 3) {
        return this.callFeatureAPI('HAS_RGB_LED', 'control', { action: 'blink', duration: duration * 500 });
    }

    // TFT Display Control
    async updateTFTDisplay(message, color = 'white') {
        return this.callFeatureAPI('HAS_TFT', 'display', { message, color });
    }

    async clearTFTDisplay() {
        return this.callFeatureAPI('HAS_TFT', 'clear');
    }

    // Tag LED Control
    async flashTagLED(mac, pattern = 'default') {
        return this.sendTagCommand(mac, 'ledflash', { pattern });
    }

    async bulkFlashTags(macs) {
        const promises = macs.map(mac => this.flashTagLED(mac));
        const results = await Promise.allSettled(promises);
        return {
            successful: results.filter(r => r.status === 'fulfilled').length,
            total: macs.length,
            results
        };
    }

    // Tag Monitoring
    async getBatteryLevels() {
        return this.callFeatureAPI('TAG_BATTERY_MONITOR', 'levels');
    }

    async getSignalStrength() {
        return this.callFeatureAPI('TAG_SIGNAL_MONITOR', 'strength');
    }

    async findTag(mac) {
        return this.callFeatureAPI('FIND_MY_TAG', 'locate', { mac });
    }

    // External Flasher
    async flashExternalDevice(data) {
        return this.callFeatureAPI('HAS_EXT_FLASHER', 'flash', data);
    }

    async getFlasherStatus() {
        return this.callFeatureAPI('HAS_EXT_FLASHER', 'status');
    }

    // C6 Module Control
    async flashC6Module(firmware) {
        return this.callFeatureAPI('C6_OTA_FLASHING', 'flash', { firmware });
    }

    async getC6Status() {
        return this.callFeatureAPI('C6_OTA_FLASHING', 'status');
    }

    // Error handling
    showAPIError(message) {
        // Show user-friendly error notification
        if (window.showNotification) {
            window.showNotification(`API Error: ${message}`, 'error');
        } else {
            console.error('API Error:', message);
        }
    }

    // Retry mechanism
    async retryRequest(requestFn, maxRetries = this.retryCount) {
        let lastError;
        
        for (let i = 0; i <= maxRetries; i++) {
            try {
                return await requestFn();
            } catch (error) {
                lastError = error;
                if (i < maxRetries) {
                    const delay = Math.pow(2, i) * 1000; // Exponential backoff
                    console.warn(`Request failed, retrying in ${delay}ms...`, error);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        }
        
        throw lastError;
    }

    // Health check
    async healthCheck() {
        try {
            await this.get('/ping');
            return true;
        } catch (error) {
            console.error('Health check failed:', error);
            return false;
        }
    }
}

// Custom error class
class APIError extends Error {
    constructor(message, status = 500) {
        super(message);
        this.name = 'APIError';
        this.status = status;
    }
}

// Initialize API manager
window.apiManager = new APIManager();

// Make it available globally
window.addEventListener('DOMContentLoaded', () => {
    if (!window.apiManager) {
        window.apiManager = new APIManager();
    }
});

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { APIManager, APIError };
}
