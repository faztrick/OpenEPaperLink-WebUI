/**
 * OpenEPL ESP32 - API Integration Examples
 * Demonstrates optimized API usage patterns
 */

// Example: Optimized tag management
class TagManager {
    constructor(apiManager) {
        this.api = apiManager;
        this.cache = new Map();
        this.batchSize = 50;
    }

    async getAllTags() {
        try {
            const tags = [];
            let pos = 0;
            let hasMore = true;

            while (hasMore) {
                const batch = await this.api.getTagDB(pos, this.batchSize);
                if (batch.tags && batch.tags.length > 0) {
                    tags.push(...batch.tags);
                    pos = batch.continu || pos + this.batchSize;
                    hasMore = batch.continu > pos;
                } else {
                    hasMore = false;
                }
            }

            return tags;
        } catch (error) {
            console.error('Failed to load tags:', error);
            return [];
        }
    }

    async sendBulkCommands(commands) {
        const results = await Promise.allSettled(
            commands.map(({ mac, command, data }) => 
                this.api.sendTagCommand(mac, command, data)
            )
        );

        return results.map((result, index) => ({
            command: commands[index],
            success: result.status === 'fulfilled',
            result: result.value || result.reason
        }));
    }

    async updateTagConfig(mac, config) {
        const formData = new FormData();
        formData.append('mac', mac);
        Object.keys(config).forEach(key => {
            formData.append(key, config[key]);
        });

        return this.api.fetch('tagConfig', {
            method: 'POST',
            body: formData
        });
    }
}

// Example: System monitoring with optimized updates
class SystemMonitor {
    constructor(apiManager) {
        this.api = apiManager;
        this.metrics = {
            memory: { used: 0, total: 0 },
            storage: { used: 0, total: 0 },
            network: { connected: false, signal: 0 },
            tags: { total: 0, online: 0, offline: 0 }
        };

        this.setupMonitoring();
    }

    setupMonitoring() {
        // Update system metrics every 5 seconds
        setInterval(() => this.updateSystemMetrics(), 5000);
        
        // Update tag metrics every 10 seconds  
        setInterval(() => this.updateTagMetrics(), 10000);

        // Listen for real-time updates
        this.api.on('system:update', (data) => {
            this.handleSystemUpdate(data);
        });
    }

    async updateSystemMetrics() {
        try {
            const sysInfo = await this.api.fetch('sysinfo');
            
            if (sysInfo.memory) {
                this.metrics.memory = sysInfo.memory;
                this.updateUI('memory', sysInfo.memory);
            }
            
            if (sysInfo.storage) {
                this.metrics.storage = sysInfo.storage;
                this.updateUI('storage', sysInfo.storage);
            }
            
            if (sysInfo.network) {
                this.metrics.network = sysInfo.network;
                this.updateUI('network', sysInfo.network);
            }
            
        } catch (error) {
            console.warn('System metrics update failed:', error);
        }
    }

    async updateTagMetrics() {
        try {
            const tags = Object.values(window.tagDB || {});
            const currentTime = Date.now();
            
            this.metrics.tags = {
                total: tags.length,
                online: tags.filter(tag => 
                    tag.lastseen && (currentTime - tag.lastseen * 1000) < 300000
                ).length,
                offline: tags.filter(tag => 
                    !tag.lastseen || (currentTime - tag.lastseen * 1000) >= 300000
                ).length
            };
            
            this.updateUI('tags', this.metrics.tags);
            
        } catch (error) {
            console.warn('Tag metrics update failed:', error);
        }
    }

    handleSystemUpdate(data) {
        Object.keys(data).forEach(key => {
            if (this.metrics[key]) {
                this.metrics[key] = { ...this.metrics[key], ...data[key] };
                this.updateUI(key, this.metrics[key]);
            }
        });
    }

    updateUI(type, data) {
        switch (type) {
            case 'memory':
                this.updateProgressBar('memory-usage', data.used);
                this.updateText('memory-text', `${data.used}%`);
                break;
            
            case 'storage':
                this.updateProgressBar('storage-usage', data.used);
                this.updateText('storage-text', `${data.used}%`);
                break;
                
            case 'network':
                this.updateText('network-signal', data.connected ? 'Connected' : 'Disconnected');
                break;
                
            case 'tags':
                this.updateText('dash-total-tags', data.total);
                this.updateText('dash-online-tags', data.online);
                this.updateText('dash-offline-tags', data.offline);
                break;
        }
    }

    updateProgressBar(id, percentage) {
        const element = document.getElementById(id);
        if (element) {
            element.style.width = `${percentage}%`;
            
            // Update color based on usage
            if (percentage > 90) element.style.backgroundColor = '#ef4444';
            else if (percentage > 75) element.style.backgroundColor = '#f59e0b';
            else element.style.backgroundColor = '#10b981';
        }
    }

    updateText(id, text) {
        const element = document.getElementById(id);
        if (element && element.textContent !== String(text)) {
            element.textContent = text;
        }
    }

    getMetrics() {
        return { ...this.metrics };
    }
}

// Example: Configuration management with validation
class ConfigManager {
    constructor(apiManager) {
        this.api = apiManager;
        this.config = {};
        this.validators = new Map();
        
        this.setupValidators();
    }

    setupValidators() {
        this.validators.set('alias', (value) => {
            return value && value.length > 0 && value.length <= 32;
        });

        this.validators.set('channel', (value) => {
            const validChannels = [0, 11, 15, 20, 25, 26, 27];
            return validChannels.includes(parseInt(value));
        });

        this.validators.set('ledbrightness', (value) => {
            const brightness = parseInt(value);
            return brightness >= 0 && brightness <= 255;
        });
    }

    async loadConfig() {
        try {
            this.config = await this.api.getConfig();
            return this.config;
        } catch (error) {
            console.error('Failed to load config:', error);
            return {};
        }
    }

    async saveConfig(updates) {
        try {
            // Validate all updates
            const errors = this.validateConfig(updates);
            if (errors.length > 0) {
                throw new Error(`Validation errors: ${errors.join(', ')}`);
            }

            // Merge with existing config
            const newConfig = { ...this.config, ...updates };
            
            // Save to server
            await this.api.saveConfig(newConfig);
            
            // Update local config
            this.config = newConfig;
            
            return { success: true };
            
        } catch (error) {
            console.error('Failed to save config:', error);
            return { success: false, error: error.message };
        }
    }

    validateConfig(config) {
        const errors = [];
        
        Object.keys(config).forEach(key => {
            const validator = this.validators.get(key);
            if (validator && !validator(config[key])) {
                errors.push(`Invalid value for ${key}: ${config[key]}`);
            }
        });
        
        return errors;
    }

    async resetToDefaults() {
        const defaults = {
            alias: 'OpenEPL ESP32',
            channel: 0,
            ledbrightness: 127,
            tftbrightness: 255,
            language: 0
        };

        return this.saveConfig(defaults);
    }
}

// Example: File upload with progress
class FileManager {
    constructor(apiManager) {
        this.api = apiManager;
        this.uploadQueue = [];
        this.maxConcurrent = 3;
        this.activeUploads = 0;
    }

    async uploadFile(file, filename) {
        return new Promise((resolve, reject) => {
            this.uploadQueue.push({
                file,
                filename,
                resolve,
                reject,
                progress: 0
            });

            this.processQueue();
        });
    }

    async processQueue() {
        if (this.activeUploads >= this.maxConcurrent || this.uploadQueue.length === 0) {
            return;
        }

        const upload = this.uploadQueue.shift();
        this.activeUploads++;

        try {
            const result = await this.performUpload(upload);
            upload.resolve(result);
        } catch (error) {
            upload.reject(error);
        } finally {
            this.activeUploads--;
            this.processQueue(); // Process next item
        }
    }

    async performUpload(upload) {
        const { file, filename } = upload;
        
        // Read file content
        const content = await this.readFile(file);
        
        // Upload to server
        const result = await this.api.uploadFile(filename, content);
        
        // Update progress
        upload.progress = 100;
        
        return result;
    }

    readFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsText(file);
        });
    }

    async uploadMultiple(files) {
        const uploads = Object.keys(files).map(filename => 
            this.uploadFile(files[filename], filename)
        );

        return Promise.allSettled(uploads);
    }
}

// Initialize managers when API is ready
document.addEventListener('DOMContentLoaded', () => {
    // Wait for API manager to be available
    const initializeManagers = () => {
        if (window.apiManager) {
            window.tagManager = new TagManager(window.apiManager);
            window.systemMonitor = new SystemMonitor(window.apiManager);
            window.configManager = new ConfigManager(window.apiManager);
            window.fileManager = new FileManager(window.apiManager);
            
            console.log('API integration managers initialized');
        } else {
            setTimeout(initializeManagers, 100);
        }
    };
    
    initializeManagers();
});

// Export for module use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        TagManager,
        SystemMonitor,
        ConfigManager,
        FileManager
    };
}
