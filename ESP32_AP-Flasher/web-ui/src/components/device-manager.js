/**
 * Device Management Component
 * Refactored and optimized device management functionality
 * Replaces the large development.js file with better organization
 */

class DeviceManager {
    constructor() {
        this.devices = [];
        this.selectedDevice = null;
        this.storagePrefix = 'oepl_';
        this.devicesKey = this.storagePrefix + 'devices';
        this.selectedKey = this.storagePrefix + 'selected_device';
        this.initialized = false;
        
        // Bind methods
        this.loadDevices = this.loadDevices.bind(this);
        this.saveDevices = this.saveDevices.bind(this);
        this.selectDevice = this.selectDevice.bind(this);
    }

    /**
     * Initialize device manager
     */
    async init() {
        if (this.initialized) {
            console.log('DeviceManager: Already initialized');
            return true;
        }

        console.log('DeviceManager: Initializing...');

        try {
            // Load devices from storage
            this.loadDevices();
            
            // Load selected device
            this.loadSelectedDevice();
            
            // Initialize UI
            this.initializeUI();
            
            this.initialized = true;
            console.log('DeviceManager: Initialization complete');
            
            return true;
            
        } catch (error) {
            console.error('DeviceManager: Initialization failed:', error);
            return false;
        }
    }

    /**
     * Load devices from localStorage using NVS-style storage
     */
    loadDevices() {
        try {
            this.devices = [];
            let index = 0;
            
            while (true) {
                const name = localStorage.getItem(`${this.devicesKey}_${index}_name`);
                if (!name) break;

                const device = {
                    id: localStorage.getItem(`${this.devicesKey}_${index}_id`) || this.generateDeviceId(index),
                    name: name,
                    ip: localStorage.getItem(`${this.devicesKey}_${index}_ip`) || '',
                    port: localStorage.getItem(`${this.devicesKey}_${index}_port`) || '',
                    description: localStorage.getItem(`${this.devicesKey}_${index}_description`) || ''
                };
                
                this.devices.push(device);
                index++;
            }
            
            console.log(`DeviceManager: Loaded ${this.devices.length} devices`);
            
        } catch (error) {
            console.warn('DeviceManager: Failed to load devices:', error);
            this.devices = [];
        }
    }

    /**
     * Save devices to localStorage using NVS-style storage
     */
    saveDevices() {
        try {
            // Clear existing devices
            this.clearDeviceStorage();

            // Save filtered and validated devices
            const validDevices = this.devices.filter(d => d && d.name && d.ip);
            
            validDevices.forEach((device, index) => {
                device.id = device.id || this.generateDeviceId(index);
                
                localStorage.setItem(`${this.devicesKey}_${index}_id`, device.id);
                localStorage.setItem(`${this.devicesKey}_${index}_name`, device.name);
                localStorage.setItem(`${this.devicesKey}_${index}_ip`, device.ip);
                localStorage.setItem(`${this.devicesKey}_${index}_port`, device.port || '');
                localStorage.setItem(`${this.devicesKey}_${index}_description`, device.description || '');
            });

            console.log(`DeviceManager: Saved ${validDevices.length} devices`);
            
        } catch (error) {
            console.error('DeviceManager: Failed to save devices:', error);
        }
    }

    /**
     * Clear device storage
     */
    clearDeviceStorage() {
        try {
            const keys = Object.keys(localStorage);
            const deviceKeys = keys.filter(key => key.startsWith(this.devicesKey + '_'));
            
            deviceKeys.forEach(key => localStorage.removeItem(key));
            
        } catch (error) {
            console.warn('DeviceManager: Failed to clear device storage:', error);
        }
    }

    /**
     * Load selected device from localStorage
     */
    loadSelectedDevice() {
        try {
            const selectedId = localStorage.getItem(`${this.selectedKey}_id`);
            const selectedName = localStorage.getItem(`${this.selectedKey}_name`);
            const selectedIP = localStorage.getItem(`${this.selectedKey}_ip`);
            const selectedPort = localStorage.getItem(`${this.selectedKey}_port`);
            const selectedDescription = localStorage.getItem(`${this.selectedKey}_description`);

            if (selectedName && selectedIP) {
                this.selectedDevice = {
                    id: selectedId || this.generateDeviceId(),
                    name: selectedName,
                    ip: selectedIP,
                    port: selectedPort || '',
                    description: selectedDescription || ''
                };
                
                console.log('DeviceManager: Selected device loaded:', this.selectedDevice.name);
            }
            
        } catch (error) {
            console.warn('DeviceManager: Failed to load selected device:', error);
        }
    }

    /**
     * Save selected device to localStorage
     */
    saveSelectedDevice() {
        try {
            if (this.selectedDevice) {
                localStorage.setItem(`${this.selectedKey}_id`, this.selectedDevice.id);
                localStorage.setItem(`${this.selectedKey}_name`, this.selectedDevice.name);
                localStorage.setItem(`${this.selectedKey}_ip`, this.selectedDevice.ip);
                localStorage.setItem(`${this.selectedKey}_port`, this.selectedDevice.port || '');
                localStorage.setItem(`${this.selectedKey}_description`, this.selectedDevice.description || '');
                
                console.log('DeviceManager: Selected device saved:', this.selectedDevice.name);
            } else {
                this.clearSelectedDevice();
            }
            
        } catch (error) {
            console.error('DeviceManager: Failed to save selected device:', error);
        }
    }

    /**
     * Clear selected device from localStorage
     */
    clearSelectedDevice() {
        try {
            const keys = Object.keys(localStorage);
            const selectedKeys = keys.filter(key => key.startsWith(this.selectedKey + '_'));
            
            selectedKeys.forEach(key => localStorage.removeItem(key));
            this.selectedDevice = null;
            
        } catch (error) {
            console.warn('DeviceManager: Failed to clear selected device:', error);
        }
    }

    /**
     * Add a new device
     */
    addDevice(deviceData) {
        try {
            // Validate required fields
            if (!deviceData.name || !deviceData.ip) {
                throw new Error('Device name and IP are required');
            }

            // Validate IP format
            if (!this.isValidIP(deviceData.ip)) {
                throw new Error('Invalid IP address format');
            }

            // Validate port if provided
            if (deviceData.port && !this.isValidPort(deviceData.port)) {
                throw new Error('Invalid port number');
            }

            const device = {
                id: this.generateDeviceId(),
                name: deviceData.name.trim(),
                ip: deviceData.ip.trim(),
                port: deviceData.port ? deviceData.port.trim() : '',
                description: deviceData.description ? deviceData.description.trim() : ''
            };

            // Check for duplicates
            const exists = this.devices.some(d => d.name === device.name || d.ip === device.ip);
            if (exists) {
                throw new Error('Device with this name or IP already exists');
            }

            this.devices.push(device);
            this.saveDevices();
            this.updateDeviceList();

            console.log('DeviceManager: Device added:', device.name);
            return device;

        } catch (error) {
            console.error('DeviceManager: Failed to add device:', error);
            throw error;
        }
    }

    /**
     * Update an existing device
     */
    updateDevice(deviceId, deviceData) {
        try {
            const deviceIndex = this.devices.findIndex(d => d.id === deviceId);
            if (deviceIndex === -1) {
                throw new Error('Device not found');
            }

            // Validate data
            if (!deviceData.name || !deviceData.ip) {
                throw new Error('Device name and IP are required');
            }

            if (!this.isValidIP(deviceData.ip)) {
                throw new Error('Invalid IP address format');
            }

            if (deviceData.port && !this.isValidPort(deviceData.port)) {
                throw new Error('Invalid port number');
            }

            // Check for duplicates (excluding current device)
            const exists = this.devices.some((d, index) => 
                index !== deviceIndex && (d.name === deviceData.name || d.ip === deviceData.ip)
            );
            if (exists) {
                throw new Error('Device with this name or IP already exists');
            }

            // Update device
            this.devices[deviceIndex] = {
                ...this.devices[deviceIndex],
                name: deviceData.name.trim(),
                ip: deviceData.ip.trim(),
                port: deviceData.port ? deviceData.port.trim() : '',
                description: deviceData.description ? deviceData.description.trim() : ''
            };

            this.saveDevices();
            this.updateDeviceList();

            // Update selected device if it was the one being edited
            if (this.selectedDevice && this.selectedDevice.id === deviceId) {
                this.selectedDevice = { ...this.devices[deviceIndex] };
                this.saveSelectedDevice();
            }

            console.log('DeviceManager: Device updated:', this.devices[deviceIndex].name);
            return this.devices[deviceIndex];

        } catch (error) {
            console.error('DeviceManager: Failed to update device:', error);
            throw error;
        }
    }

    /**
     * Remove a device
     */
    removeDevice(deviceId) {
        try {
            const deviceIndex = this.devices.findIndex(d => d.id === deviceId);
            if (deviceIndex === -1) {
                throw new Error('Device not found');
            }

            const device = this.devices[deviceIndex];
            this.devices.splice(deviceIndex, 1);
            this.saveDevices();
            this.updateDeviceList();

            // Clear selected device if it was the one being removed
            if (this.selectedDevice && this.selectedDevice.id === deviceId) {
                this.clearSelectedDevice();
                this.updateSelectedDeviceDisplay();
            }

            console.log('DeviceManager: Device removed:', device.name);
            return true;

        } catch (error) {
            console.error('DeviceManager: Failed to remove device:', error);
            throw error;
        }
    }

    /**
     * Select a device
     */
    selectDevice(deviceId) {
        try {
            const device = this.devices.find(d => d.id === deviceId);
            if (!device) {
                throw new Error('Device not found');
            }

            this.selectedDevice = { ...device };
            this.saveSelectedDevice();
            this.updateSelectedDeviceDisplay();

            // Dispatch custom event
            window.dispatchEvent(new CustomEvent('deviceSelected', {
                detail: { device: this.selectedDevice }
            }));

            console.log('DeviceManager: Device selected:', device.name);
            return this.selectedDevice;

        } catch (error) {
            console.error('DeviceManager: Failed to select device:', error);
            throw error;
        }
    }

    /**
     * Initialize UI components
     */
    initializeUI() {
        this.updateDeviceList();
        this.updateSelectedDeviceDisplay();
        this.setupEventListeners();
    }

    /**
     * Update device list UI
     */
    updateDeviceList() {
        const deviceListElement = document.getElementById('device-list');
        if (!deviceListElement) return;

        deviceListElement.innerHTML = '';

        if (this.devices.length === 0) {
            deviceListElement.innerHTML = '<p class="no-devices">No devices configured</p>';
            return;
        }

        this.devices.forEach(device => {
            const deviceElement = this.createDeviceElement(device);
            deviceListElement.appendChild(deviceElement);
        });
    }

    /**
     * Create device list item element
     */
    createDeviceElement(device) {
        const element = document.createElement('div');
        element.className = 'device-item';
        element.dataset.deviceId = device.id;

        const isSelected = this.selectedDevice && this.selectedDevice.id === device.id;
        if (isSelected) {
            element.classList.add('selected');
        }

        element.innerHTML = `
            <div class="device-info">
                <div class="device-name">${this.escapeHtml(device.name)}</div>
                <div class="device-ip">${this.escapeHtml(device.ip)}${device.port ? ':' + this.escapeHtml(device.port) : ''}</div>
                ${device.description ? `<div class="device-description">${this.escapeHtml(device.description)}</div>` : ''}
            </div>
            <div class="device-actions">
                <button type="button" class="btn-select" ${isSelected ? 'disabled' : ''}>
                    ${isSelected ? 'Selected' : 'Select'}
                </button>
                <button type="button" class="btn-edit">Edit</button>
                <button type="button" class="btn-remove">Remove</button>
            </div>
        `;

        // Add event listeners
        const selectBtn = element.querySelector('.btn-select');
        const editBtn = element.querySelector('.btn-edit');
        const removeBtn = element.querySelector('.btn-remove');

        selectBtn.addEventListener('click', () => this.selectDevice(device.id));
        editBtn.addEventListener('click', () => this.editDevice(device.id));
        removeBtn.addEventListener('click', () => this.confirmRemoveDevice(device.id));

        return element;
    }

    /**
     * Update selected device display
     */
    updateSelectedDeviceDisplay() {
        const selectedDeviceElement = document.getElementById('selected-device');
        if (!selectedDeviceElement) return;

        if (this.selectedDevice) {
            selectedDeviceElement.innerHTML = `
                <div class="selected-device-info">
                    <div class="device-name">${this.escapeHtml(this.selectedDevice.name)}</div>
                    <div class="device-ip">${this.escapeHtml(this.selectedDevice.ip)}${this.selectedDevice.port ? ':' + this.escapeHtml(this.selectedDevice.port) : ''}</div>
                    ${this.selectedDevice.description ? `<div class="device-description">${this.escapeHtml(this.selectedDevice.description)}</div>` : ''}
                </div>
                <button type="button" class="btn-clear-selection">Clear Selection</button>
            `;

            const clearBtn = selectedDeviceElement.querySelector('.btn-clear-selection');
            clearBtn.addEventListener('click', () => {
                this.clearSelectedDevice();
                this.updateSelectedDeviceDisplay();
                this.updateDeviceList();
            });
        } else {
            selectedDeviceElement.innerHTML = '<p class="no-selection">No device selected</p>';
        }
    }

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        // Add device form
        const addDeviceForm = document.getElementById('add-device-form');
        if (addDeviceForm) {
            addDeviceForm.addEventListener('submit', (event) => {
                event.preventDefault();
                this.handleAddDevice(addDeviceForm);
            });
        }

        // Import/Export buttons
        const exportBtn = document.getElementById('export-devices');
        if (exportBtn) {
            exportBtn.addEventListener('click', () => this.exportDevices());
        }

        const importBtn = document.getElementById('import-devices');
        if (importBtn) {
            importBtn.addEventListener('click', () => this.importDevices());
        }
    }

    /**
     * Handle add device form submission
     */
    handleAddDevice(form) {
        try {
            const formData = new FormData(form);
            const deviceData = {
                name: formData.get('name'),
                ip: formData.get('ip'),
                port: formData.get('port'),
                description: formData.get('description')
            };

            this.addDevice(deviceData);
            form.reset();

            if (window.Utils && window.Utils.Notification) {
                window.Utils.Notification.show('Device added successfully', 'success');
            }

        } catch (error) {
            if (window.Utils && window.Utils.Notification) {
                window.Utils.Notification.show(error.message, 'error');
            } else {
                alert(error.message);
            }
        }
    }

    /**
     * Utility methods
     */
    generateDeviceId(index = null) {
        const timestamp = Date.now();
        const random = Math.random().toString(36).substr(2, 9);
        return `device_${index !== null ? index + '_' : ''}${timestamp}_${random}`;
    }

    isValidIP(ip) {
        const pattern = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
        return pattern.test(ip);
    }

    isValidPort(port) {
        const num = parseInt(port, 10);
        return !isNaN(num) && num >= 1 && num <= 65535;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Get device manager status
     */
    getStatus() {
        return {
            initialized: this.initialized,
            deviceCount: this.devices.length,
            hasSelectedDevice: !!this.selectedDevice,
            selectedDevice: this.selectedDevice ? this.selectedDevice.name : null
        };
    }

    /**
     * Export devices for backup
     */
    exportDevices() {
        const data = {
            devices: this.devices,
            selectedDevice: this.selectedDevice,
            timestamp: new Date().toISOString(),
            version: '1.0'
        };

        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `oepl-devices-${Date.now()}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        console.log('DeviceManager: Devices exported');
    }

    /**
     * Import devices from backup
     */
    importDevices() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        
        input.addEventListener('change', (event) => {
            const file = event.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = JSON.parse(e.target.result);
                    
                    if (data.devices && Array.isArray(data.devices)) {
                        this.devices = data.devices;
                        this.saveDevices();
                        
                        if (data.selectedDevice) {
                            this.selectedDevice = data.selectedDevice;
                            this.saveSelectedDevice();
                        }
                        
                        this.updateDeviceList();
                        this.updateSelectedDeviceDisplay();
                        
                        console.log('DeviceManager: Devices imported');
                        
                        if (window.Utils && window.Utils.Notification) {
                            window.Utils.Notification.show('Devices imported successfully', 'success');
                        }
                    } else {
                        throw new Error('Invalid file format');
                    }
                    
                } catch (error) {
                    console.error('DeviceManager: Import failed:', error);
                    
                    if (window.Utils && window.Utils.Notification) {
                        window.Utils.Notification.show('Import failed: ' + error.message, 'error');
                    }
                }
            };
            
            reader.readAsText(file);
        });
        
        input.click();
    }

    // Additional methods would be implemented for edit, remove confirmation, etc.
}

// Create global instance
window.deviceManager = new DeviceManager();

// Auto-initialize when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    window.deviceManager.init();
});

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = DeviceManager;
}