/**
 * Main Application Controller
 * Handles the core application logic, data management, and UI coordination
 */

class OptimizedApp {
    constructor() {
        this.tagDB = {};
        this.apConfig = {};
        this.lastUpdate = null;
        this.websocket = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.updateInterval = null;
        this.isInitialized = false;
    }

    async init() {
        if (this.isInitialized) {
            console.log('OptimizedApp: Already initialized');
            return;
        }

        console.log('OptimizedApp: Initializing...');

        try {
            // Load initial data
            await this.loadInitialData();

            // Initialize WebSocket connection
            this.initWebSocket();

            // Setup periodic updates
            this.setupPeriodicUpdates();

            // Notify that data is loaded
            this.notifyDataLoaded();

            this.isInitialized = true;
            console.log('OptimizedApp: Initialization complete');
        } catch (error) {
            console.error('OptimizedApp: Initialization failed:', error);
            if (window.apiErrorHandler) {
                window.apiErrorHandler(error, 'OptimizedApp', 'init');
            }
        }
    }

    async loadInitialData() {
        console.log('OptimizedApp: Loading initial data...');

        try {
            // Load AP configuration
            const apConfigResponse = await window.safeFetch('get_ap_config');
            this.apConfig = await apConfigResponse.json();
            console.log('OptimizedApp: AP config loaded');

            // Load tag database
            await this.loadTagDatabase();
            console.log('OptimizedApp: Tag database loaded');

            this.lastUpdate = new Date();
        } catch (error) {
            console.error('OptimizedApp: Failed to load initial data:', error);
            throw error;
        }
    }

    async loadTagDatabase(pos = 0) {
        try {
            const response = await window.safeFetch(`get_db?pos=${pos}`);
            const data = await response.json();

            if (data.tags) {
                data.tags.forEach(tag => {
                    this.tagDB[tag.mac] = tag;
                });

                console.log(`OptimizedApp: Loaded ${data.tags.length} tags`);

                // Continue loading if there are more
                if (data.continu) {
                    await this.loadTagDatabase(data.continu);
                }
            }
        } catch (error) {
            console.error('OptimizedApp: Failed to load tag database:', error);
            throw error;
        }
    }

    initWebSocket() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws`;

        console.log('OptimizedApp: Connecting to WebSocket:', wsUrl);

        try {
            this.websocket = new WebSocket(wsUrl);

            this.websocket.onopen = () => {
                console.log('OptimizedApp: WebSocket connected');
                this.reconnectAttempts = 0;
            };

            this.websocket.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    this.handleWebSocketMessage(data);
                } catch (error) {
                    console.error('OptimizedApp: WebSocket message parsing error:', error);
                }
            };

            this.websocket.onclose = () => {
                console.log('OptimizedApp: WebSocket disconnected');
                this.reconnectWebSocket();
            };

            this.websocket.onerror = (error) => {
                console.error('OptimizedApp: WebSocket error:', error);
            };

        } catch (error) {
            console.error('OptimizedApp: WebSocket initialization failed:', error);
        }
    }

    reconnectWebSocket() {
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
            
            console.log(`OptimizedApp: Reconnecting WebSocket in ${delay}ms (attempt ${this.reconnectAttempts})`);
            
            setTimeout(() => {
                this.initWebSocket();
            }, delay);
        } else {
            console.error('OptimizedApp: Max WebSocket reconnection attempts reached');
        }
    }

    handleWebSocketMessage(data) {
        switch (data.type) {
            case 'tag_update':
                this.handleTagUpdate(data);
                break;
            case 'config_update':
                this.handleConfigUpdate(data);
                break;
            case 'log_message':
                this.handleLogMessage(data);
                break;
            case 'system_update':
                this.handleSystemUpdate(data);
                break;
            default:
                console.log('OptimizedApp: Unknown WebSocket message type:', data.type);
        }
    }

    handleTagUpdate(data) {
        if (data.tag && data.tag.mac) {
            this.tagDB[data.tag.mac] = data.tag;
            console.log('OptimizedApp: Tag updated:', data.tag.mac);
            this.notifyTagsUpdated();
        }
    }

    handleConfigUpdate(data) {
        if (data.config) {
            this.apConfig = { ...this.apConfig, ...data.config };
            console.log('OptimizedApp: Config updated');
            this.notifyConfigUpdated();
        }
    }

    handleLogMessage(data) {
        if (data.message) {
            console.log(`OptimizedApp: Log [${data.level || 'info'}]:`, data.message);
        }
    }

    handleSystemUpdate(data) {
        console.log('OptimizedApp: System update:', data);
        this.notifySystemUpdated(data);
    }

    setupPeriodicUpdates() {
        // Setup periodic data refresh every 30 seconds
        this.updateInterval = setInterval(() => {
            this.periodicUpdate();
        }, 30000);

        console.log('OptimizedApp: Periodic updates scheduled');
    }

    async periodicUpdate() {
        try {
            // Refresh tag database incrementally
            const lastMac = Object.keys(this.tagDB).sort().pop();
            if (lastMac) {
                await this.loadTagDatabase(0);
            }

            this.lastUpdate = new Date();
            console.log('OptimizedApp: Periodic update completed');
        } catch (error) {
            console.error('OptimizedApp: Periodic update failed:', error);
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
        try {
            await this.loadInitialData();
            this.notifyDataLoaded();
            return true;
        } catch (error) {
            console.error('OptimizedApp: Data refresh failed:', error);
            return false;
        }
    }

    getTagCount() {
        return Object.keys(this.tagDB).length;
    }

    getTag(mac) {
        return this.tagDB[mac] || null;
    }

    getAllTags() {
        return Object.values(this.tagDB);
    }

    getConfig() {
        return this.apConfig;
    }

    // Cleanup method
    destroy() {
        if (this.websocket) {
            this.websocket.close();
            this.websocket = null;
        }

        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }

        this.isInitialized = false;
        console.log('OptimizedApp: Destroyed');
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
            throw error;
        });
}

// Auto-initialize when DOM is ready
document.addEventListener('DOMContentLoaded', function () {
    console.log('OptimizedApp: DOM ready, initializing...');
    
    // Create global app instance
    window.app = new OptimizedApp();
    
    // Initialize the app
    window.app.init().catch(error => {
        console.error('OptimizedApp: Auto-initialization failed:', error);
    });
});

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = OptimizedApp;
}