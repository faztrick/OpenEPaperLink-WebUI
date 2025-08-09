/**
 * Main Application Class for OpenEPaperLink ESP32
 * Provides core functionality for tag management and system control
 */

class OptimizedApp {
    constructor() {
        console.log('OptimizedApp: Initializing...');

        // Initialize application state
        this.initialized = false;
        this.tagDB = {};
        this.apConfig = {};
        this.updateInterval = null;
        this.socket = null;

        // Initialize components
        this.init();
    }

    async init() {
        try {
            console.log('OptimizedApp: Starting initialization...');

            // Load initial data
            await this.loadInitialData();

            // Initialize WebSocket connection
            this.initWebSocket();

            // Set up periodic updates
            this.setupPeriodicUpdates();

            // Mark as initialized
            this.initialized = true;
            console.log('OptimizedApp: Initialization complete');

            // Trigger initial data load for UI
            this.notifyDataLoaded();

        } catch (error) {
            console.error('OptimizedApp: Initialization failed:', error);
            // Report error to backend if API manager is available
            if (window.apiManager) {
                window.apiManager.reportError(error, window.location.href, null, 'OptimizedApp.init');
            }
        }
    }

    async loadInitialData() {
        console.log('OptimizedApp: Loading initial data...');

        try {
            // Use API manager if available, otherwise fallback to fetch
            if (window.apiManager) {
                console.log('OptimizedApp: Using API manager for data loading');

                // Load AP configuration
                const apConfigPromise = window.apiManager.getConfig().catch(error => {
                    console.warn('Failed to load AP config:', error);
                    return {};
                });

                // Load tag database
                const tagDBPromise = window.apiManager.getTagDB(0, 100).catch(error => {
                    console.warn('Failed to load tag database:', error);
                    return { tags: [] };
                });

                // Wait for both to complete
                const [apConfig, tagData] = await Promise.all([apConfigPromise, tagDBPromise]);

                // Store AP configuration
                this.apConfig = apConfig || {};
                window.apConfig = this.apConfig;

                // Process tag data
                if (tagData && tagData.tags) {
                    tagData.tags.forEach(tag => {
                        this.tagDB[tag.mac] = tag;
                    });
                    console.log(`OptimizedApp: Loaded ${tagData.tags.length} tags`);
                }

            } else {
                console.log('OptimizedApp: Using direct fetch for data loading');

                // Fallback to direct fetch calls
                const apConfigResponse = await fetch('get_ap_config').catch(() => ({ json: () => ({}) }));
                this.apConfig = await apConfigResponse.json();
                window.apConfig = this.apConfig;

                const tagResponse = await fetch('get_db?pos=0').catch(() => ({ json: () => ({ tags: [] }) }));
                const tagData = await tagResponse.json();

                if (tagData.tags) {
                    tagData.tags.forEach(tag => {
                        this.tagDB[tag.mac] = tag;
                    });
                    console.log(`OptimizedApp: Loaded ${tagData.tags.length} tags via fallback`);
                }
            }

            // Make data globally available
            window.tagDB = this.tagDB;
            console.log('OptimizedApp: Initial data loaded successfully');

        } catch (error) {
            console.error('OptimizedApp: Failed to load initial data:', error);
            // Initialize with empty data to prevent errors
            this.apConfig = {};
            this.tagDB = {};
            window.apConfig = this.apConfig;
            window.tagDB = this.tagDB;
        }
    }

    initWebSocket() {
        console.log('OptimizedApp: Initializing WebSocket...');

        // Check if API manager already handles WebSocket
        if (window.apiManager && window.apiManager.socket) {
            console.log('OptimizedApp: Using API manager WebSocket');
            this.socket = window.apiManager.socket;

            // Listen for API manager events
            window.apiManager.on('tagDB:update', (data) => {
                this.handleTagUpdate(data);
            });

            window.apiManager.on('config:update', (data) => {
                this.handleConfigUpdate(data);
            });

            return;
        }

        // Initialize our own WebSocket connection
        try {
            const protocol = location.protocol === "https:" ? "wss://" : "ws://";
            const wsUrl = protocol + location.host + "/ws";

            this.socket = new WebSocket(wsUrl);

            this.socket.addEventListener("open", () => {
                console.log("OptimizedApp: WebSocket connected");
            });

            this.socket.addEventListener("message", (event) => {
                try {
                    const data = JSON.parse(event.data);
                    this.handleWebSocketMessage(data);
                } catch (error) {
                    console.warn("OptimizedApp: WebSocket message parse error:", error);
                }
            });

            this.socket.addEventListener("close", () => {
                console.log("OptimizedApp: WebSocket disconnected, attempting to reconnect...");
                setTimeout(() => this.initWebSocket(), 5000);
            });

            this.socket.addEventListener("error", (error) => {
                console.warn("OptimizedApp: WebSocket error:", error);
            });

        } catch (error) {
            console.warn('OptimizedApp: WebSocket initialization failed:', error);
        }
    }

    handleWebSocketMessage(data) {
        if (data.logMsg) {
            this.handleLogMessage(data);
        }
        if (data.tagDB) {
            this.handleTagUpdate(data);
        }
        if (data.apConfig) {
            this.handleConfigUpdate(data);
        }
        if (data.sysUpdate) {
            this.handleSystemUpdate(data);
        }
    }

    handleTagUpdate(data) {
        console.log('OptimizedApp: Handling tag update:', data);

        if (data.tagDB && Array.isArray(data.tagDB)) {
            data.tagDB.forEach(tag => {
                if (tag.mac) {
                    this.tagDB[tag.mac] = tag;
                }
            });
        } else if (data.tags && Array.isArray(data.tags)) {
            data.tags.forEach(tag => {
                if (tag.mac) {
                    this.tagDB[tag.mac] = tag;
                }
            });
        }

        // Update global reference
        window.tagDB = this.tagDB;

        // Notify other components
        this.notifyTagsUpdated();
    }

    handleConfigUpdate(data) {
        console.log('OptimizedApp: Handling config update:', data);

        if (data.apConfig) {
            this.apConfig = { ...this.apConfig, ...data.apConfig };
        } else {
            this.apConfig = { ...this.apConfig, ...data };
        }

        // Update global reference
        window.apConfig = this.apConfig;

        // Notify other components
        this.notifyConfigUpdated();
    }

    handleLogMessage(data) {
        // Handle log messages - could be displayed in a log panel
        console.log('OptimizedApp: Log message:', data.logMsg);
    }

    handleSystemUpdate(data) {
        console.log('OptimizedApp: System update:', data);
        // Handle system updates
        this.notifySystemUpdated(data);
    }

    setupPeriodicUpdates() {
        console.log('OptimizedApp: Setting up periodic updates...');

        // Update every 30 seconds
        this.updateInterval = setInterval(() => {
            this.periodicUpdate();
        }, 30000);

        console.log('OptimizedApp: Periodic updates scheduled');
    }

    async periodicUpdate() {
        try {
            // Only update if we're still the active tab
            if (document.hidden) return;

            console.log('OptimizedApp: Performing periodic update...');

            // Update AP configuration
            if (window.apiManager) {
                const config = await window.apiManager.getConfig().catch(() => null);
                if (config) {
                    this.handleConfigUpdate(config);
                }
            } else {
                const response = await fetch('get_ap_config').catch(() => null);
                if (response && response.ok) {
                    const config = await response.json();
                    this.handleConfigUpdate(config);
                }
            }

        } catch (error) {
            console.warn('OptimizedApp: Periodic update failed:', error);
        }
    }

    // Notification methods for other components
    notifyDataLoaded() {
        // Dispatch custom event
        window.dispatchEvent(new CustomEvent('appDataLoaded', {
            detail: {
                tagDB: this.tagDB,
                apConfig: this.apConfig
            }
        }));

        // Call legacy function if it exists
        if (typeof processTags === 'function' && Object.keys(this.tagDB).length > 0) {
            try {
                processTags(Object.values(this.tagDB));
            } catch (error) {
                console.warn('OptimizedApp: processTags call failed:', error);
            }
        }
    }

    notifyTagsUpdated() {
        window.dispatchEvent(new CustomEvent('tagsUpdated', {
            detail: { tagDB: this.tagDB }
        }));

        // Update any existing UI components
        if (typeof updateDashboardStats === 'function') {
            updateDashboardStats();
        }
    }

    notifyConfigUpdated() {
        window.dispatchEvent(new CustomEvent('configUpdated', {
            detail: { apConfig: this.apConfig }
        }));
    }

    notifySystemUpdated(data) {
        window.dispatchEvent(new CustomEvent('systemUpdated', {
            detail: data
        }));
    }

    // Public API methods
    async refreshData() {
        console.log('OptimizedApp: Manual data refresh requested');
        await this.loadInitialData();
        this.notifyDataLoaded();
    }

    getTagCount() {
        return Object.keys(this.tagDB).length;
    }

    getOnlineTagCount() {
        const currentTime = Date.now();
        return Object.values(this.tagDB).filter(tag =>
            tag.lastseen && (currentTime - tag.lastseen * 1000) < 300000 // 5 minutes
        ).length;
    }

    getTagById(mac) {
        return this.tagDB[mac] || null;
    }

    getAllTags() {
        return Object.values(this.tagDB);
    }

    getConfig() {
        return this.apConfig;
    }

    isInitialized() {
        return this.initialized;
    }

    // Cleanup method
    destroy() {
        console.log('OptimizedApp: Destroying...');

        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }

        if (this.socket && this.socket !== window.apiManager?.socket) {
            this.socket.close();
            this.socket = null;
        }

        this.initialized = false;
    }
}

// Legacy function compatibility
function loadTags(pos = 0) {
    console.log('loadTags: Legacy function called with pos =', pos);

    // If OptimizedApp is available, use it
    if (window.app && window.app instanceof OptimizedApp) {
        return window.app.refreshData();
    }

    // Fallback to direct fetch
    return fetch(`get_db?pos=${pos}`)
        .then(response => response.json())
        .then(data => {
            if (!window.tagDB) window.tagDB = {};

            if (data.tags) {
                data.tags.forEach(tag => {
                    window.tagDB[tag.mac] = tag;
                });
                console.log(`loadTags: Loaded ${data.tags.length} tags`);

                // Continue loading if there are more
                if (data.continu) {
                    return loadTags(data.continu);
                }
            }

            // Notify that tags are loaded
            if (typeof processTags === 'function') {
                processTags(Object.values(window.tagDB));
            }

            return window.tagDB;
        })
        .catch(error => {
            console.error('loadTags: Failed to load tags:', error);
            return {};
        });
}

// Make classes and functions globally available
window.OptimizedApp = OptimizedApp;
window.loadTags = loadTags;

// Export for module use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { OptimizedApp, loadTags };
}

console.log('main-app.js: Classes and functions loaded');
