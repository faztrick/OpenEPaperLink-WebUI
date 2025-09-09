// OpenEPL ESP32 - Application Core
// Main application initialization and coordination

/**
 * Main Application Class
 * Coordinates all modules and handles application lifecycle
 */
class OptimizedApp {
    constructor() {
        this.version = '2.0.0';
        this.modules = new Map();
        this.isInitialized = false;
        this.currentPage = 'dashboard';
        this.eventBus = new EventTarget();
        
        // Module instances will be set during initialization
        this.tagManager = null;
        this.canvasRenderer = null;
        this.uiComponents = null;
        this.performanceMonitor = null;
        
        this.initializeApp();
    }

       /**
     * Check if this is a standalone page that doesn't need full app initialization
     */
    isStandalonePage() {
        const path = window.location.pathname;
        const standalonePaths = [
            '/setup.html',
            '/setup',
            '/edit.html',
            '/edit',
            '/jsontemplate-demo-v2.html',
            '/upload-demo.html',
            '/variables-demo.html',
            '/test-'
        ];
        
        return standalonePaths.some(p => path.includes(p)) || 
               document.title.includes('setup') || 
               document.title.includes('demo') ||
               document.title.includes('test');
    }

    /**
     * Get application status and health information
     */
    getStatus() {
        return {
            version: this.version,
            initialized: this.isInitialized,
            currentPage: this.currentPage,
            modules: Array.from(this.modules.keys()),
            performance: this.performanceMonitor?.generateReport()
        };
    }

    /**
     * Initialize the application
     */
    async initializeApp() {
        try {
            console.log(`Initializing OpenEPL ESP32 Application v${this.version}`);
            
            // Check if this is a standalone page that doesn't need full app initialization
            if (this.isStandalonePage()) {
                console.log('Standalone page detected, skipping full app initialization');
                return;
            }
            // Initialize core modules
            await this.initializeModules();
            
            // Set up global event handlers
            this.setupGlobalEventHandlers();
            
            // Initialize page routing
            this.initializeRouting();
            
            // Load initial data
            await this.loadInitialData();
            
            // Start periodic updates
            this.startPeriodicUpdates();
            
            this.isInitialized = true;
            this.emit('app:initialized');
            
            console.log('Application initialized successfully');
            
        } catch (error) {
            console.error('Failed to initialize application:', error);
            this.handleInitializationError(error);
        }
    }

    /**
     * Initialize all application modules
     */
    async initializeModules() {
        // Wait for DOM to be ready
        if (document.readyState === 'loading') {
            await new Promise(resolve => {
                document.addEventListener('DOMContentLoaded', resolve);
            });
        }

        // Initialize modules in dependency order with safety checks
        try {
            this.modules.set('performance', window.performanceMonitor || 
                (typeof PerformanceMonitor !== 'undefined' ? new PerformanceMonitor() : null));
            this.modules.set('uiComponents', window.uiComponents || 
                (typeof UIComponents !== 'undefined' ? new UIComponents() : null));
            this.modules.set('canvasRenderer', window.canvasRenderer || 
                (typeof CanvasRenderer !== 'undefined' ? new CanvasRenderer() : null));
            this.modules.set('tagManager', window.tagManager || 
                (typeof TagManager !== 'undefined' ? new TagManager() : null));
        } catch (error) {
            console.warn('Some modules failed to initialize:', error);
        }
        
        // Store references for easy access
        this.performanceMonitor = this.modules.get('performance');
        this.uiComponents = this.modules.get('uiComponents');
        this.canvasRenderer = this.modules.get('canvasRenderer');
        this.tagManager = this.modules.get('tagManager');
        
        // Initialize page-specific modules based on current page
        await this.initializePageModules();
    }

    /**
     * Initialize modules specific to current page
     */
    async initializePageModules() {
        const currentPage = this.getCurrentPage();
        
        switch (currentPage) {
            case 'tags':
                await this.initializeTagsPage();
                break;
            case 'dashboard':
                await this.initializeDashboardPage();
                break;
            case 'settings':
                await this.initializeSettingsPage();
                break;
            case 'logs':
                await this.initializeLogsPage();
                break;
        }
    }

    /**
     * Initialize tags page
     */
    async initializeTagsPage() {
        try {
            // Load content cards configuration
            await this.tagManager.loadContentCards();
            
            // Load tags data
            await this.tagManager.loadTags(0);
            
            // Initialize tag-specific UI components
            this.initializeTagsUI();
            
        } catch (error) {
            console.error('Error initializing tags page:', error);
        }
    }

    /**
     * Initialize dashboard page
     */
    async initializeDashboardPage() {
        try {
            // Load system info
            await this.loadSystemInfo();
            
            // Initialize dashboard widgets
            this.initializeDashboardWidgets();
            
        } catch (error) {
            console.error('Error initializing dashboard page:', error);
        }
    }

    /**
     * Initialize settings page
     */
    async initializeSettingsPage() {
        try {
            // Load current settings
            await this.loadSettings();
            
            // Initialize settings forms
            this.initializeSettingsForms();
            
        } catch (error) {
            console.error('Error initializing settings page:', error);
        }
    }

    /**
     * Initialize logs page
     */
    async initializeLogsPage() {
        try {
            // Load recent logs
            await this.loadLogs();
            
            // Initialize log viewer
            this.initializeLogViewer();
            
        } catch (error) {
            console.error('Error initializing logs page:', error);
        }
    }

    /**
     * Get current page from URL or location
     */
    getCurrentPage() {
        const path = window.location.pathname;
        const page = path.split('/').pop().replace('.html', '') || 'dashboard';
        return page;
    }

    /**
     * Set up global event handlers
     */
    setupGlobalEventHandlers() {
        // Handle page navigation
        window.addEventListener('popstate', (event) => {
            this.handlePageChange(event.state?.page || this.getCurrentPage());
        });

        // Handle online/offline status
        window.addEventListener('online', () => {
            this.handleConnectivityChange(true);
        });

        window.addEventListener('offline', () => {
            this.handleConnectivityChange(false);
        });

        // Handle visibility changes (tab focus/blur)
        document.addEventListener('visibilitychange', () => {
            this.handleVisibilityChange(!document.hidden);
        });

        // Handle beforeunload for cleanup
        window.addEventListener('beforeunload', () => {
            this.cleanup();
        });

        // Global error handler
        window.addEventListener('error', (event) => {
            this.handleGlobalError(event.error, event);
        });

        // Handle unhandled promise rejections
        window.addEventListener('unhandledrejection', (event) => {
            this.handleGlobalError(event.reason, event);
        });
    }

    /**
     * Initialize routing system
     */
    initializeRouting() {
        // Simple hash-based routing for SPA behavior
        const handleHashChange = () => {
            const hash = window.location.hash.slice(1);
            if (hash && hash !== this.currentPage) {
                this.navigateToPage(hash);
            }
        };

        window.addEventListener('hashchange', handleHashChange);
        
        // Handle initial hash
        if (window.location.hash) {
            handleHashChange();
        }
    }

    /**
     * Navigate to a specific page
     */
    navigateToPage(page) {
        if (page === this.currentPage) return;
        
        this.emit('page:beforechange', { from: this.currentPage, to: page });
        
        const previousPage = this.currentPage;
        this.currentPage = page;
        
        // Update page visibility
        this.updatePageVisibility(page, previousPage);
        
        // Initialize page-specific modules
        this.initializePageModules();
        
        this.emit('page:changed', { from: previousPage, to: page });
    }

    /**
     * Update page visibility
     */
    updatePageVisibility(activePage, previousPage) {
        // Hide previous page content
        if (previousPage) {
            const prevElement = document.querySelector(`[data-page="${previousPage}"]`);
            if (prevElement) {
                prevElement.style.display = 'none';
            }
        }

        // Show active page content
        const activeElement = document.querySelector(`[data-page="${activePage}"]`);
        if (activeElement) {
            activeElement.style.display = 'block';
        }

        // Update navigation active state
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.toggle('active', item.dataset.page === activePage);
        });
    }

    /**
     * Load initial application data
     */
    async loadInitialData() {
        const loadPromises = [
            this.loadSystemInfo(),
            this.loadSettings()
        ];

        // Load page-specific data
        if (this.currentPage === 'tags') {
            loadPromises.push(this.tagManager.loadContentCards());
        }

        await Promise.allSettled(loadPromises);
    }

    /**
     * Start periodic updates
     */
    startPeriodicUpdates() {
        // Update system status every 30 seconds
        setInterval(() => {
            if (document.visibilityState === 'visible') {
                this.updateSystemStatus();
            }
        }, 30000);

        // Update tag data every 60 seconds
        setInterval(() => {
            if (document.visibilityState === 'visible' && this.currentPage === 'tags') {
                this.tagManager.loadTags(0);
            }
        }, 60000);

        // Performance monitoring
        if (this.performanceMonitor) {
            this.performanceMonitor.startMonitoring();
        }
    }

    /**
     * Load system information
     */
    async loadSystemInfo() {
        try {
            // Use get_ap_config instead of sysinfo as it's the working endpoint
            const response = await fetch('get_ap_config');
            const sysInfo = await response.json();
            
            this.updateSystemDisplay(sysInfo);
            this.emit('system:loaded', sysInfo);
            
        } catch (error) {
            console.error('Failed to load system info:', error);
        }
    }

    /**
     * Load application settings
     */
    async loadSettings() {
        try {
            // Use the correct endpoint from web.cpp: /get_ap_config
            const response = await fetch('/get_ap_config');
            const settings = await response.json();
            
            this.applySettings(settings);
            this.emit('settings:loaded', settings);
            
        } catch (error) {
            console.error('Failed to load settings:', error);
        }
    }

    /**
     * Load application logs
     */
    async loadLogs() {
        try {
            // Try log.txt first, then fallback to empty logs
            let response;
            try {
                response = await fetch('/log.txt');
                if (!response.ok) {
                    throw new Error('Log file not found');
                }
                const logs = await response.text();
                this.displayLogs(logs);
                this.emit('logs:loaded', logs);
            } catch (error) {
                // Fallback - logs might be displayed via WebSocket or other means
                console.log('Log file not available, logs may be displayed via WebSocket');
                this.displayLogs('Logs are displayed in real-time via WebSocket connection.');
            }
            
        } catch (error) {
            console.error('Failed to load logs:', error);
            this.displayLogs('Error loading logs: ' + error.message);
        }
    }

    /**
     * Update system status display
     */
    updateSystemDisplay(sysInfo) {
        updateElement('systemUptime', formatUptime(sysInfo.uptime));
        updateElement('systemFreeHeap', convertSize(sysInfo.freeHeap));
        updateElement('systemChipModel', sysInfo.chipModel);
        updateElement('systemMacAddress', sysInfo.macAddress);
        
        if (sysInfo.wifiStatus) {
            updateElement('wifiSSID', sysInfo.wifiStatus.ssid);
            updateElement('wifiSignal', `${sysInfo.wifiStatus.rssi} dBm`);
        }
    }

    /**
     * Apply settings to application
     */
    applySettings(settings) {
        // Apply theme settings
        if (settings.theme) {
            document.body.className = `theme-${settings.theme}`;
        }

        // Apply language settings
        if (settings.language) {
            this.setLanguage(settings.language);
        }

        // Apply other settings
        if (settings.updateInterval) {
            this.updateInterval = settings.updateInterval;
        }
    }

    /**
     * Display logs in the UI
     */
    displayLogs(logs) {
        const logContainer = document.getElementById('logContainer');
        if (logContainer) {
            logContainer.innerHTML = `<pre>${escapeHtml(logs)}</pre>`;
        }
    }

    /**
     * Handle page change
     */
    handlePageChange(newPage) {
        this.navigateToPage(newPage);
    }

    /**
     * Handle connectivity changes
     */
    handleConnectivityChange(isOnline) {
        const status = isOnline ? 'Connected' : 'Disconnected';
        showStatusMessage(`Network ${status}`, isOnline ? 'success' : 'warning');
        
        this.emit('connectivity:changed', { online: isOnline });
        
        // Pause/resume updates based on connectivity
        if (!isOnline) {
            clearInterval(this.updateInterval);
        } else {
            this.startPeriodicUpdates();
        }
    }

    /**
     * Handle visibility changes
     */
    handleVisibilityChange(isVisible) {
        this.emit('visibility:changed', { visible: isVisible });
        
        // Pause/resume performance monitoring
        if (this.performanceMonitor) {
            if (isVisible) {
                this.performanceMonitor.startMonitoring();
            } else {
                this.performanceMonitor.stopMonitoring();
            }
        }
    }

    /**
     * Handle global errors
     */
    handleGlobalError(error, event) {
        console.error('Global error:', error);
        
        // Record error for analytics
        if (this.performanceMonitor) {
            this.performanceMonitor.recordMetric('error', {
                message: error.message || error,
                stack: error.stack,
                timestamp: Date.now(),
                page: this.currentPage
            });
        }

        // Show user-friendly error message
        showStatusMessage('An unexpected error occurred', 'error');
        
        this.emit('error:global', { error, event });
    }

    /**
     * Handle initialization errors
     */
    handleInitializationError(error) {
        document.body.innerHTML = `
            <div class="error-container">
                <h1>Application Error</h1>
                <p>Failed to initialize the application. Please refresh the page.</p>
                <button onclick="location.reload()">Refresh Page</button>
            </div>
        `;
    }

    /**
     * Initialize tags page UI components
     */
    initializeTagsUI() {
        // Add tooltip to tag elements
        document.querySelectorAll('.tagcard').forEach(card => {
            if (this.uiComponents) {
                this.uiComponents.createTooltip({
                    target: card,
                    content: `MAC: ${card.dataset.mac}<br>Type: ${card.dataset.hwtype}`,
                    position: 'top'
                });
            }
        });
    }

    /**
     * Initialize dashboard widgets
     */
    initializeDashboardWidgets() {
        // Create system monitoring widgets
        this.createSystemWidgets();
        
        // Create tag overview widgets
        this.createTagWidgets();
    }

    /**
     * Create system monitoring widgets
     */
    createSystemWidgets() {
        // Memory usage chart
        const memoryWidget = document.getElementById('memoryWidget');
        if (memoryWidget && this.uiComponents) {
            const progressBar = this.uiComponents.createComponent('progressBar', {
                value: 0,
                showLabel: true,
                animated: true,
                color: 'info'
            });
            memoryWidget.appendChild(progressBar);
        }
    }

    /**
     * Create tag overview widgets
     */
    createTagWidgets() {
        // Tag status summary
        const tagSummaryWidget = document.getElementById('tagSummaryWidget');
        if (tagSummaryWidget) {
            // This would create a summary of tag statuses
        }
    }

    /**
     * Initialize settings forms
     */
    initializeSettingsForms() {
        const settingsForm = document.getElementById('settingsForm');
        if (settingsForm) {
            settingsForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.saveSettings(new FormData(settingsForm));
            });
        }
    }

    /**
     * Save application settings
     */
    async saveSettings(formData) {
        try {
            const settings = Object.fromEntries(formData);
            
            // Use the correct endpoint from web.cpp: /save_apcfg
            const response = await fetch('/save_apcfg', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: new URLSearchParams(settings).toString()
            });

            if (response.ok) {
                showStatusMessage('Settings saved successfully', 'success');
                this.applySettings(settings);
            } else {
                throw new Error('Failed to save settings');
            }
        } catch (error) {
            console.error('Error saving settings:', error);
            showStatusMessage('Failed to save settings', 'error');
        }
    }

    /**
     * Initialize log viewer
     */
    initializeLogViewer() {
        const logViewer = document.getElementById('logViewer');
        if (logViewer) {
            // Add auto-refresh toggle
            const refreshToggle = document.createElement('button');
            refreshToggle.textContent = 'Auto Refresh';
            refreshToggle.onclick = () => this.toggleLogAutoRefresh();
            logViewer.prepend(refreshToggle);
        }
    }

    /**
     * Toggle log auto-refresh
     */
    toggleLogAutoRefresh() {
        if (this.logRefreshInterval) {
            clearInterval(this.logRefreshInterval);
            this.logRefreshInterval = null;
        } else {
            this.logRefreshInterval = setInterval(() => {
                this.loadLogs();
            }, 10000);
        }
    }

    /**
     * Update system status
     */
    async updateSystemStatus() {
        try {
            await this.loadSystemInfo();
        } catch (error) {
            console.error('Failed to update system status:', error);
        }
    }

    /**
     * Set application language
     */
    setLanguage(language) {
        document.documentElement.lang = language;
        // This would trigger internationalization updates
        this.emit('language:changed', { language });
    }

    /**
     * Emit custom event
     */
    emit(eventName, data = {}) {
        this.eventBus.dispatchEvent(new CustomEvent(eventName, { detail: data }));
    }

    /**
     * Listen to custom events
     */
    on(eventName, handler) {
        this.eventBus.addEventListener(eventName, handler);
    }

    /**
     * Remove event listener
     */
    off(eventName, handler) {
        this.eventBus.removeEventListener(eventName, handler);
    }

    /**
     * Get module instance
     */
    getModule(name) {
        return this.modules.get(name);
    }

    /**
     * Cleanup application resources
     */
    cleanup() {
        // Stop monitoring
        if (this.performanceMonitor) {
            this.performanceMonitor.stopMonitoring();
        }

        // Clear intervals
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
        }
        
        if (this.logRefreshInterval) {
            clearInterval(this.logRefreshInterval);
        }

        // Clear caches
        if (this.canvasRenderer) {
            this.canvasRenderer.clearCaches();
        }

        this.emit('app:cleanup');
    }

    /**
     * Get application status
     */
    getStatus() {
        return {
            version: this.version,
            initialized: this.isInitialized,
            currentPage: this.currentPage,
            modules: Array.from(this.modules.keys()),
            performance: this.performanceMonitor?.generateReport()
        };
    }
}

// Initialize application when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    try {
        // Check if we should initialize the full application
        const path = window.location.pathname;
        const standalonePaths = ['/setup.html', '/setup', '/edit.html', '/edit'];
        
        if (standalonePaths.some(p => path.includes(p))) {
            console.log('Standalone page detected, skipping OptimizedApp initialization');
            return;
        }
        
        window.app = new OptimizedApp();
    } catch (error) {
        console.error('Failed to initialize application:', error);
        
        // Show user-friendly error message
        const errorDiv = document.createElement('div');
        errorDiv.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: #f8d7da;
            color: #721c24;
            padding: 20px;
            border: 1px solid #f5c6cb;
            border-radius: 8px;
            z-index: 9999;
            max-width: 400px;
            text-align: center;
        `;
        errorDiv.innerHTML = `
            <h3>Application Error</h3>
            <p>Failed to initialize the application. Please refresh the page.</p>
            <button onclick="window.location.reload()" style="margin-top: 10px; padding: 8px 16px; background: #721c24; color: white; border: none; border-radius: 4px; cursor: pointer;">
                Refresh Page
            </button>
        `;
        document.body.appendChild(errorDiv);
    }
});

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = OptimizedApp;
}
