/**
 * Module Loader - Handles loading and initialization of web UI modules
 * Provides dependency management and proper loading order
 */

class ModuleLoader {
    constructor() {
        this.modules = new Map();
        this.loaded = new Set();
        this.loading = new Set();
        this.failed = new Set();
        this.baseURL = './src/';
        this.initialized = false;
    }

    /**
     * Register a module with its dependencies
     * @param {string} name - Module name
     * @param {string} path - Module path relative to baseURL
     * @param {Array<string>} dependencies - Module dependencies
     * @param {boolean} critical - Whether module is critical for app
     */
    register(name, path, dependencies = [], critical = false) {
        this.modules.set(name, {
            name,
            path,
            dependencies,
            critical,
            loaded: false,
            failed: false
        });
    }

    /**
     * Load a specific module
     * @param {string} name - Module name
     * @returns {Promise<boolean>}
     */
    async load(name) {
        if (this.loaded.has(name)) {
            return true;
        }

        if (this.failed.has(name)) {
            console.warn(`ModuleLoader: Module ${name} previously failed to load`);
            return false;
        }

        if (this.loading.has(name)) {
            // Module is already being loaded, wait for it
            return new Promise((resolve) => {
                const checkInterval = setInterval(() => {
                    if (this.loaded.has(name) || this.failed.has(name)) {
                        clearInterval(checkInterval);
                        resolve(this.loaded.has(name));
                    }
                }, 50);
            });
        }

        const module = this.modules.get(name);
        if (!module) {
            console.error(`ModuleLoader: Module ${name} not registered`);
            return false;
        }

        this.loading.add(name);

        try {
            // Load dependencies first
            for (const dep of module.dependencies) {
                const depLoaded = await this.load(dep);
                if (!depLoaded) {
                    throw new Error(`Dependency ${dep} failed to load`);
                }
            }

            // Load the module
            await this.loadScript(module.path);
            
            this.loaded.add(name);
            this.loading.delete(name);
            module.loaded = true;
            
            console.log(`ModuleLoader: Module ${name} loaded successfully`);
            return true;

        } catch (error) {
            console.error(`ModuleLoader: Failed to load module ${name}:`, error);
            this.failed.add(name);
            this.loading.delete(name);
            module.failed = true;
            return false;
        }
    }

    /**
     * Load multiple modules
     * @param {Array<string>} names - Module names
     * @returns {Promise<Object>}
     */
    async loadMultiple(names) {
        const results = {};
        
        for (const name of names) {
            results[name] = await this.load(name);
        }

        return results;
    }

    /**
     * Load all registered modules
     * @returns {Promise<Object>}
     */
    async loadAll() {
        const names = Array.from(this.modules.keys());
        return this.loadMultiple(names);
    }

    /**
     * Load a JavaScript file
     * @param {string} path - Script path
     * @returns {Promise<void>}
     */
    loadScript(path) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = this.baseURL + path;
            script.async = true;
            
            script.onload = () => {
                document.head.removeChild(script);
                resolve();
            };
            
            script.onerror = () => {
                document.head.removeChild(script);
                reject(new Error(`Failed to load script: ${path}`));
            };
            
            document.head.appendChild(script);
        });
    }

    /**
     * Initialize the module system
     * @returns {Promise<boolean>}
     */
    async init() {
        if (this.initialized) {
            console.log('ModuleLoader: Already initialized');
            return true;
        }

        console.log('ModuleLoader: Initializing...');

        try {
            // Register all modules
            this.registerCoreModules();

            // Load critical modules first
            const criticalModules = Array.from(this.modules.values())
                .filter(m => m.critical)
                .map(m => m.name);

            console.log('ModuleLoader: Loading critical modules:', criticalModules);
            const criticalResults = await this.loadMultiple(criticalModules);

            // Check if any critical modules failed
            const criticalFailed = Object.entries(criticalResults)
                .filter(([name, success]) => !success)
                .map(([name]) => name);

            if (criticalFailed.length > 0) {
                console.error('ModuleLoader: Critical modules failed:', criticalFailed);
                return false;
            }

            // Load non-critical modules
            const nonCriticalModules = Array.from(this.modules.values())
                .filter(m => !m.critical)
                .map(m => m.name);

            console.log('ModuleLoader: Loading non-critical modules:', nonCriticalModules);
            await this.loadMultiple(nonCriticalModules);

            this.initialized = true;
            console.log('ModuleLoader: Initialization complete');

            // Dispatch initialization event
            window.dispatchEvent(new CustomEvent('modulesLoaded', {
                detail: { 
                    loaded: Array.from(this.loaded),
                    failed: Array.from(this.failed)
                }
            }));

            return true;

        } catch (error) {
            console.error('ModuleLoader: Initialization failed:', error);
            return false;
        }
    }

    /**
     * Register core modules with their dependencies
     */
    registerCoreModules() {
        // Utilities (no dependencies)
        this.register('common-utils', 'utils/common-utils.js', [], true);
        
        // API layer (depends on utils)
        this.register('api-manager', 'api/api-manager.js', ['common-utils'], true);
        
        // Configuration management (depends on utils)
        this.register('config-manager', 'config/config-manager.js', ['common-utils'], true);
        
        // Core functionality (depends on API and utils)
        this.register('endpoint-fix', 'endpoint-fix.js', ['common-utils', 'api-manager'], true);
        this.register('main-app', 'main-app.js', ['common-utils', 'api-manager', 'endpoint-fix', 'config-manager'], true);
        
        // UI Components (depends on core modules)
        this.register('main-app-controller', 'components/main-app-controller.js', ['common-utils', 'api-manager', 'config-manager', 'main-app'], false);
        this.register('device-manager', 'components/device-manager.js', ['common-utils'], false);
        
        // Diagnostics and testing (non-critical)
        this.register('diagnostics', 'diagnostics.js', ['common-utils', 'api-manager'], false);
        this.register('backend-connectivity-test', 'backend-connectivity-test.js', ['common-utils', 'api-manager'], false);
    }

    /**
     * Get module status
     * @returns {Object}
     */
    getStatus() {
        return {
            initialized: this.initialized,
            registered: this.modules.size,
            loaded: this.loaded.size,
            failed: this.failed.size,
            loading: this.loading.size,
            modules: Array.from(this.modules.entries()).map(([name, module]) => ({
                name,
                loaded: this.loaded.has(name),
                failed: this.failed.has(name),
                loading: this.loading.has(name),
                critical: module.critical
            }))
        };
    }

    /**
     * Reload a failed module
     * @param {string} name - Module name
     * @returns {Promise<boolean>}
     */
    async reload(name) {
        this.failed.delete(name);
        this.loaded.delete(name);
        
        if (this.modules.has(name)) {
            this.modules.get(name).failed = false;
            this.modules.get(name).loaded = false;
        }

        return this.load(name);
    }
}

// Create global instance
window.moduleLoader = new ModuleLoader();

// Auto-initialize when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    console.log('ModuleLoader: DOM ready, starting initialization...');
    
    window.moduleLoader.init().then(success => {
        if (success) {
            console.log('ModuleLoader: All modules loaded successfully');
        } else {
            console.error('ModuleLoader: Module loading failed');
        }
    });
});

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ModuleLoader;
}