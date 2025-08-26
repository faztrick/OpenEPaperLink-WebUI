/**
 * Optimized Main Application Component
 * Refactored from original main.js with improved organization and reduced complexity
 */

class MainApplicationController {
    constructor() {
        this.tagTypes = {};
        this.apConfig = {};
        this.tagDB = {};
        this.batteryChart = null;
        this.previewWindows = [];
        this.socket = null;
        this.finishedInitialLoading = false;
        this.serverTimeDiff = 0;
        this.imageQueue = [];
        this.isProcessing = false;
        
        // UI state
        this.activeTab = '';
        this.previousTab = '';
        
        // Constants
        this.apStates = [
            { state: "offline, please wait...", color: "orange", icon: "warning" },
            { state: "online", color: "green", icon: "check_circle" },
            { state: "flashing", color: "orange", icon: "flash_on" },
            { state: "wait for reset", color: "blue", icon: "hourglass" },
            { state: "AP requires reboot", color: "purple", icon: "refresh" },
            { state: "failed", color: "red", icon: "error" },
            { state: "coming online...", color: "orange", icon: "hourglass" },
            { state: "AP without radio", color: "green", icon: "wifi_off" }
        ];
        
        this.runStates = [
            { state: "⏹︎ stopped" },
            { state: "⏸ pause" },
            { state: "" }, // hide running
            { state: "⏳︎ init" }
        ];
        
        // Bind methods
        this.init = this.init.bind(this);
        this.connectWebSocket = this.connectWebSocket.bind(this);
        this.handleWebSocketMessage = this.handleWebSocketMessage.bind(this);
    }

    /**
     * Initialize the main application
     */
    async init() {
        console.log('MainApplicationController: Initializing...');

        try {
            // Wait for other modules to load
            if (window.moduleLoader && !window.moduleLoader.initialized) {
                await new Promise(resolve => {
                    window.addEventListener('modulesLoaded', resolve, { once: true });
                });
            }

            // Initialize UI components
            this.initializeTabs();
            this.initializeEventListeners();
            
            // Load initial data
            await this.loadInitialData();
            
            // Connect WebSocket
            this.connectWebSocket();
            
            // Initialize AI if available
            this.initializeAI();
            
            // Start periodic updates
            this.startPeriodicUpdates();
            
            console.log('MainApplicationController: Initialization complete');
            
        } catch (error) {
            console.error('MainApplicationController: Initialization failed:', error);
            this.showNotification('Application initialization failed', 'error');
        }
    }

    /**
     * Load initial application data
     */
    async loadInitialData() {
        try {
            if (window.apiManager) {
                // Use the centralized API manager
                this.apConfig = await window.apiManager.getAPConfig();
                
                // Load tags using optimized app if available
                if (window.app && window.app.tagDB) {
                    this.tagDB = window.app.tagDB;
                } else {
                    await this.loadTags(0);
                }
                
                this.finishedInitialLoading = true;
                this.updateUI();
                
            } else {
                // Fallback to direct API calls
                await this.loadConfigFallback();
            }
            
        } catch (error) {
            console.error('MainApplicationController: Failed to load initial data:', error);
            this.showNotification('Failed to load application data', 'error');
        }
    }

    /**
     * Fallback data loading method
     */
    async loadConfigFallback() {
        try {
            const [configResponse, dbResponse] = await Promise.all([
                fetch('get_ap_config'),
                fetch('get_db?pos=0')
            ]);
            
            this.apConfig = await configResponse.json();
            const dbData = await dbResponse.json();
            
            this.processTags(dbData.tags);
            
            if (dbData.continu) {
                await this.loadTags(dbData.continu);
            }
            
        } catch (error) {
            console.error('MainApplicationController: Fallback loading failed:', error);
            throw error;
        }
    }

    /**
     * Load tags from database
     */
    async loadTags(pos = 0) {
        try {
            const response = await fetch(`get_db?pos=${pos}`);
            const data = await response.json();
            
            this.processTags(data.tags);
            
            if (data.continu && data.continu > pos) {
                return this.loadTags(data.continu);
            }
            
        } catch (error) {
            console.error('MainApplicationController: Failed to load tags:', error);
            throw error;
        }
    }

    /**
     * Process loaded tags
     */
    processTags(tags) {
        if (!tags || !Array.isArray(tags)) return;
        
        tags.forEach(tag => {
            if (tag && tag.mac) {
                this.tagDB[tag.mac] = tag;
            }
        });
        
        this.updateDashboardStats();
    }

    /**
     * Initialize tab system
     */
    initializeTabs() {
        const tabLinks = document.querySelectorAll(".tablinks");
        const tabContents = document.querySelectorAll(".tabcontent");

        tabLinks.forEach(tabLink => {
            tabLink.addEventListener("click", (event) => {
                event.preventDefault();
                const targetId = tabLink.getAttribute("data-target");
                this.switchTab(targetId, tabLinks, tabContents);
            });
        });

        // Activate first tab
        if (tabLinks.length > 0) {
            tabLinks[0].click();
        }
    }

    /**
     * Switch to a specific tab
     */
    switchTab(targetId, tabLinks, tabContents) {
        this.previousTab = this.activeTab;
        this.activeTab = targetId;

        // Dispatch custom event
        const loadTabEvent = new CustomEvent('loadTab', { detail: targetId });
        document.dispatchEvent(loadTabEvent);

        // Hide all tabs
        tabContents.forEach(tabContent => {
            tabContent.style.display = "none";
        });

        // Remove active class from all links
        tabLinks.forEach(link => {
            link.classList.remove("active");
        });

        // Show target tab
        const targetElement = document.getElementById(targetId);
        if (targetElement) {
            targetElement.style.display = "block";
            
            // Special handling for log tab
            if (targetId === "logtab") {
                targetElement.scrollTop = 0;
            }
        }

        // Add active class to clicked link
        const activeLink = document.querySelector(`[data-target="${targetId}"]`);
        if (activeLink) {
            activeLink.classList.add("active");
        }
    }

    /**
     * Initialize event listeners
     */
    initializeEventListeners() {
        // Listen for optimized app events
        window.addEventListener('appDataLoaded', (event) => {
            if (event.detail.tagDB) {
                this.tagDB = event.detail.tagDB;
                this.updateDashboardStats();
            }
            if (event.detail.apConfig) {
                this.apConfig = event.detail.apConfig;
                this.updateUI();
            }
        });

        window.addEventListener('tagsUpdated', (event) => {
            if (event.detail.tagDB) {
                this.tagDB = event.detail.tagDB;
                this.updateDashboardStats();
            }
        });

        window.addEventListener('configUpdated', (event) => {
            if (event.detail.apConfig) {
                this.apConfig = event.detail.apConfig;
                this.updateUI();
            }
        });

        // Handle window resize
        window.addEventListener('resize', this.handleResize.bind(this));
        
        // Handle visibility changes
        document.addEventListener('visibilitychange', this.handleVisibilityChange.bind(this));
    }

    /**
     * Connect to WebSocket
     */
    connectWebSocket() {
        if (window.app && window.app.websocket) {
            // Use the optimized app's WebSocket
            this.socket = window.app.websocket;
            return;
        }

        const protocol = location.protocol === "https:" ? "wss://" : "ws://";
        this.socket = new WebSocket(protocol + location.host + "/ws");

        // Expose socket globally for compatibility
        window.socket = this.socket;

        this.socket.addEventListener("open", () => {
            this.showMessage("WebSocket connected");
            console.log('MainApplicationController: WebSocket connected');
        });

        this.socket.addEventListener("message", this.handleWebSocketMessage);

        this.socket.addEventListener("close", () => {
            this.showMessage("WebSocket disconnected");
            console.log('MainApplicationController: WebSocket disconnected');
            
            // Attempt reconnection
            setTimeout(() => {
                this.connectWebSocket();
            }, 5000);
        });

        this.socket.addEventListener("error", (error) => {
            console.error('MainApplicationController: WebSocket error:', error);
        });
    }

    /**
     * Handle WebSocket messages
     */
    handleWebSocketMessage(event) {
        try {
            const data = JSON.parse(event.data);
            
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
                case 'system_status':
                    this.handleSystemStatus(data);
                    break;
                default:
                    console.log('MainApplicationController: Unknown message type:', data.type);
            }
            
        } catch (error) {
            console.error('MainApplicationController: WebSocket message parsing error:', error);
        }
    }

    /**
     * Handle tag updates from WebSocket
     */
    handleTagUpdate(data) {
        if (data.tag && data.tag.mac) {
            this.tagDB[data.tag.mac] = data.tag;
            this.updateDashboardStats();
            
            // Update UI if tag is currently displayed
            this.updateTagDisplay(data.tag);
        }
    }

    /**
     * Handle configuration updates
     */
    handleConfigUpdate(data) {
        if (data.config) {
            Object.assign(this.apConfig, data.config);
            this.updateUI();
        }
    }

    /**
     * Handle log messages
     */
    handleLogMessage(data) {
        if (data.message) {
            this.appendToLog(data.message, data.level || 'info');
        }
    }

    /**
     * Handle system status updates
     */
    handleSystemStatus(data) {
        this.updateSystemStatus(data);
    }

    /**
     * Initialize AI assistant if available
     */
    initializeAI() {
        try {
            if (window.openAIAgent && typeof window.openAIAgent.loadConfiguration === 'function') {
                window.openAIAgent.loadConfiguration().then(() => {
                    this.showNotification('AI Assistant ready', 'success', 2000);
                }).catch((error) => {
                    console.warn('AI configuration load failed:', error);
                    this.showNotification('AI settings loaded from local storage', 'warning');
                });
            } else {
                // Try again after a delay
                setTimeout(() => {
                    if (window.openAIAgent) {
                        this.initializeAI();
                    }
                }, 3000);
            }
        } catch (error) {
            console.error('Error initializing AI settings:', error);
            this.showNotification('AI settings initialization failed', 'error');
        }
    }

    /**
     * Start periodic updates
     */
    startPeriodicUpdates() {
        // Update every 30 seconds
        setInterval(() => {
            if (!document.hidden) {
                this.periodicUpdate();
            }
        }, 30000);
    }

    /**
     * Perform periodic updates
     */
    async periodicUpdate() {
        try {
            // Update system status
            if (window.apiManager) {
                const status = await window.apiManager.getSystemStatus();
                this.updateSystemStatus(status);
            }
        } catch (error) {
            console.warn('MainApplicationController: Periodic update failed:', error);
        }
    }

    /**
     * Update dashboard statistics
     */
    updateDashboardStats() {
        const tagCount = Object.keys(this.tagDB).length;
        const onlineTags = Object.values(this.tagDB).filter(tag => tag.lastseen && Date.now() - tag.lastseen < 300000).length;
        
        // Update UI elements
        this.updateElement('tag-count', tagCount);
        this.updateElement('online-tags', onlineTags);
        
        // Update battery chart if available
        this.updateBatteryChart();
    }

    /**
     * Update UI element safely
     */
    updateElement(id, value) {
        const element = document.getElementById(id);
        if (element) {
            element.textContent = value;
        }
    }

    /**
     * Update battery chart
     */
    updateBatteryChart() {
        // Battery chart implementation would go here
        // This is a placeholder for chart updates
        if (this.batteryChart && Object.keys(this.tagDB).length > 0) {
            // Update chart data
            console.log('MainApplicationController: Updating battery chart');
        }
    }

    /**
     * Update general UI
     */
    updateUI() {
        // Update AP status
        if (this.apConfig.state !== undefined) {
            this.updateAPStatus(this.apConfig.state);
        }
        
        // Update other UI elements based on config
        if (this.apConfig.version) {
            this.updateElement('version', this.apConfig.version);
        }
        
        if (this.apConfig.uptime) {
            this.updateElement('uptime', this.formatUptime(this.apConfig.uptime));
        }
    }

    /**
     * Update AP status display
     */
    updateAPStatus(state) {
        const stateInfo = this.apStates[state] || this.apStates[0];
        
        const statusElement = document.getElementById('ap-status');
        if (statusElement) {
            statusElement.textContent = stateInfo.state;
            statusElement.className = `status ${stateInfo.color}`;
        }
        
        const iconElement = document.getElementById('ap-icon');
        if (iconElement) {
            iconElement.textContent = stateInfo.icon;
        }
    }

    /**
     * Format uptime seconds to readable string
     */
    formatUptime(seconds) {
        const days = Math.floor(seconds / (24 * 60 * 60));
        const hours = Math.floor((seconds % (24 * 60 * 60)) / (60 * 60));
        const minutes = Math.floor((seconds % (60 * 60)) / 60);
        const remainingSeconds = seconds % 60;

        const components = [
            { value: days, label: 'd' },
            { value: hours, label: 'h' },
            { value: minutes, label: 'm' },
            { value: remainingSeconds, label: 's' }
        ];

        return components
            .filter(({ value }, index, arr) => value > 0 || arr.slice(0, index).some(c => c.value > 0))
            .map(({ value, label }) => `${value}${label}`)
            .join(' ') || '0s';
    }

    /**
     * Show notification message
     */
    showNotification(message, type = 'info', duration = 5000) {
        if (window.Utils && window.Utils.Notification) {
            window.Utils.Notification.show(message, type, duration);
        } else if (typeof showNotification === 'function') {
            showNotification(message, type, duration);
        } else {
            console.log(`Notification [${type}]: ${message}`);
        }
    }

    /**
     * Show status message
     */
    showMessage(message) {
        console.log(`MainApplicationController: ${message}`);
        
        const statusElement = document.getElementById('status-message');
        if (statusElement) {
            statusElement.textContent = message;
            setTimeout(() => {
                statusElement.textContent = '';
            }, 3000);
        }
    }

    /**
     * Handle window resize
     */
    handleResize() {
        // Responsive adjustments
        if (this.batteryChart) {
            this.batteryChart.resize();
        }
    }

    /**
     * Handle visibility change (tab switching)
     */
    handleVisibilityChange() {
        if (document.hidden) {
            // Page is hidden, reduce activity
            console.log('MainApplicationController: Page hidden, reducing activity');
        } else {
            // Page is visible, resume normal activity
            console.log('MainApplicationController: Page visible, resuming activity');
            this.periodicUpdate();
        }
    }

    /**
     * Clean up resources
     */
    destroy() {
        if (this.socket) {
            this.socket.close();
        }
        
        // Clean up any intervals or timeouts
        console.log('MainApplicationController: Destroyed');
    }
}

// Create global instance for compatibility
window.mainApp = new MainApplicationController();

// Auto-initialize when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    window.mainApp.init();
});

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = MainApplicationController;
}