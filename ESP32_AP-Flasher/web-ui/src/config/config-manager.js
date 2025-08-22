/**
 * Configuration Manager - Centralized configuration handling
 * Manages app settings, device configurations, and user preferences
 */

class ConfigurationManager {
    constructor() {
        this.config = {
            app: {
                name: 'OpenEPL ESP32 Web UI',
                version: '1.0.0',
                debug: false,
                updateInterval: 30000,
                retryAttempts: 3,
                timeout: 15000
            },
            api: {
                baseURL: '',
                endpoints: {
                    apConfig: 'get_ap_config',
                    tagDB: 'get_db',
                    wifiConfig: 'get_wifi_config',
                    saveWifi: 'save_wifi_config',
                    tagCmd: 'tag_cmd',
                    status: 'status',
                    reboot: 'reboot'
                }
            },
            ui: {
                theme: 'light',
                compactMode: false,
                autoRefresh: true,
                showDebugInfo: false,
                defaultPageSize: 20,
                maxPreviewWindows: 5
            },
            storage: {
                prefix: 'oepl_',
                cacheTimeout: 300000, // 5 minutes
                maxCacheSize: 100
            },
            websocket: {
                enabled: true,
                reconnectAttempts: 5,
                reconnectDelay: 1000,
                heartbeatInterval: 30000
            }
        };

        this.userPreferences = {};
        this.deviceConfig = {};
        this.loaded = false;
        this.callbacks = new Map();
    }

    /**
     * Initialize configuration manager
     * @returns {Promise<boolean>}
     */
    async init() {
        if (this.loaded) {
            console.log('ConfigurationManager: Already initialized');
            return true;
        }

        console.log('ConfigurationManager: Initializing...');

        try {
            // Load user preferences from localStorage
            this.loadUserPreferences();

            // Load device configuration
            await this.loadDeviceConfig();

            // Apply environment-specific overrides
            this.applyEnvironmentOverrides();

            this.loaded = true;
            console.log('ConfigurationManager: Initialization complete');

            // Notify listeners
            this.notifyChange('init', this.config);

            return true;

        } catch (error) {
            console.error('ConfigurationManager: Initialization failed:', error);
            return false;
        }
    }

    /**
     * Get configuration value using dot notation
     * @param {string} path - Configuration path (e.g., 'app.debug')
     * @param {any} defaultValue - Default value if not found
     * @returns {any}
     */
    get(path, defaultValue = null) {
        const keys = path.split('.');
        let current = this.config;

        for (const key of keys) {
            if (current && typeof current === 'object' && key in current) {
                current = current[key];
            } else {
                return defaultValue;
            }
        }

        return current;
    }

    /**
     * Set configuration value using dot notation
     * @param {string} path - Configuration path
     * @param {any} value - Value to set
     * @param {boolean} persist - Whether to persist to localStorage
     * @returns {boolean}
     */
    set(path, value, persist = true) {
        try {
            const keys = path.split('.');
            const lastKey = keys.pop();
            let current = this.config;

            // Navigate to the parent object
            for (const key of keys) {
                if (!(key in current) || typeof current[key] !== 'object') {
                    current[key] = {};
                }
                current = current[key];
            }

            const oldValue = current[lastKey];
            current[lastKey] = value;

            // Persist user preferences
            if (persist && path.startsWith('ui.')) {
                this.saveUserPreferences();
            }

            // Notify listeners
            this.notifyChange(path, value, oldValue);

            console.log(`ConfigurationManager: Set ${path} = ${JSON.stringify(value)}`);
            return true;

        } catch (error) {
            console.error(`ConfigurationManager: Failed to set ${path}:`, error);
            return false;
        }
    }

    /**
     * Load user preferences from localStorage
     */
    loadUserPreferences() {
        try {
            const stored = localStorage.getItem(`${this.get('storage.prefix')}preferences`);
            if (stored) {
                this.userPreferences = JSON.parse(stored);
                
                // Apply user preferences to UI config
                Object.assign(this.config.ui, this.userPreferences);
                
                console.log('ConfigurationManager: User preferences loaded');
            }
        } catch (error) {
            console.warn('ConfigurationManager: Failed to load user preferences:', error);
        }
    }

    /**
     * Save user preferences to localStorage
     */
    saveUserPreferences() {
        try {
            this.userPreferences = { ...this.config.ui };
            const serialized = JSON.stringify(this.userPreferences);
            localStorage.setItem(`${this.get('storage.prefix')}preferences`, serialized);
            console.log('ConfigurationManager: User preferences saved');
        } catch (error) {
            console.warn('ConfigurationManager: Failed to save user preferences:', error);
        }
    }

    /**
     * Load device configuration from API
     */
    async loadDeviceConfig() {
        try {
            if (window.apiManager) {
                const apConfig = await window.apiManager.getAPConfig();
                this.deviceConfig = apConfig;
                
                // Apply device-specific overrides
                if (apConfig.debug !== undefined) {
                    this.set('app.debug', apConfig.debug, false);
                }
                
                console.log('ConfigurationManager: Device configuration loaded');
            }
        } catch (error) {
            console.warn('ConfigurationManager: Failed to load device configuration:', error);
        }
    }

    /**
     * Apply environment-specific configuration overrides
     */
    applyEnvironmentOverrides() {
        // Development environment
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
            this.set('app.debug', true, false);
            this.set('ui.showDebugInfo', true, false);
            console.log('ConfigurationManager: Development overrides applied');
        }

        // Check for URL parameters
        const params = new URLSearchParams(window.location.search);
        
        if (params.has('debug')) {
            this.set('app.debug', params.get('debug') === 'true', false);
        }
        
        if (params.has('theme')) {
            this.set('ui.theme', params.get('theme'), false);
        }
    }

    /**
     * Register a configuration change callback
     * @param {string} path - Configuration path to watch (or '*' for all)
     * @param {Function} callback - Callback function
     * @returns {string} - Callback ID for removal
     */
    onChange(path, callback) {
        const id = `${path}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        if (!this.callbacks.has(path)) {
            this.callbacks.set(path, new Map());
        }
        
        this.callbacks.get(path).set(id, callback);
        
        return id;
    }

    /**
     * Remove a configuration change callback
     * @param {string} path - Configuration path
     * @param {string} id - Callback ID
     */
    offChange(path, id) {
        if (this.callbacks.has(path)) {
            this.callbacks.get(path).delete(id);
        }
    }

    /**
     * Notify configuration change listeners
     * @param {string} path - Changed path
     * @param {any} newValue - New value
     * @param {any} oldValue - Old value
     */
    notifyChange(path, newValue, oldValue = null) {
        // Notify specific path listeners
        if (this.callbacks.has(path)) {
            this.callbacks.get(path).forEach((callback) => {
                try {
                    callback(newValue, oldValue, path);
                } catch (error) {
                    console.error('ConfigurationManager: Callback error:', error);
                }
            });
        }

        // Notify global listeners
        if (this.callbacks.has('*')) {
            this.callbacks.get('*').forEach((callback) => {
                try {
                    callback(newValue, oldValue, path);
                } catch (error) {
                    console.error('ConfigurationManager: Global callback error:', error);
                }
            });
        }
    }

    /**
     * Reset configuration to defaults
     * @param {string} section - Configuration section to reset (optional)
     */
    reset(section = null) {
        if (section) {
            // Reset specific section
            if (section === 'ui') {
                this.userPreferences = {};
                localStorage.removeItem(`${this.get('storage.prefix')}preferences`);
            }
            // Reload defaults for section
            // Note: This would require storing defaults separately
            console.log(`ConfigurationManager: Reset section ${section}`);
        } else {
            // Reset all user preferences
            this.userPreferences = {};
            localStorage.removeItem(`${this.get('storage.prefix')}preferences`);
            console.log('ConfigurationManager: All user preferences reset');
        }
    }

    /**
     * Export configuration for backup
     * @returns {Object}
     */
    export() {
        return {
            userPreferences: this.userPreferences,
            timestamp: new Date().toISOString(),
            version: this.get('app.version')
        };
    }

    /**
     * Import configuration from backup
     * @param {Object} configData - Configuration data to import
     * @returns {boolean}
     */
    import(configData) {
        try {
            if (configData.userPreferences) {
                this.userPreferences = configData.userPreferences;
                Object.assign(this.config.ui, this.userPreferences);
                this.saveUserPreferences();
                
                console.log('ConfigurationManager: Configuration imported');
                this.notifyChange('import', configData);
                
                return true;
            }
            
            return false;
        } catch (error) {
            console.error('ConfigurationManager: Import failed:', error);
            return false;
        }
    }

    /**
     * Get configuration status
     * @returns {Object}
     */
    getStatus() {
        return {
            loaded: this.loaded,
            hasUserPreferences: Object.keys(this.userPreferences).length > 0,
            hasDeviceConfig: Object.keys(this.deviceConfig).length > 0,
            activeCallbacks: Array.from(this.callbacks.entries()).map(([path, callbacks]) => ({
                path,
                count: callbacks.size
            }))
        };
    }
}

// Create global instance
window.configManager = new ConfigurationManager();

// Auto-initialize when modules are loaded
window.addEventListener('modulesLoaded', function() {
    window.configManager.init();
});

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ConfigurationManager;
}