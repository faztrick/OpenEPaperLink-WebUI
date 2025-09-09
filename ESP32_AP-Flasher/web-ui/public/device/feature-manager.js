// OpenEPL ESP32 - Enhanced Feature Detection and Management
// This module provides comprehensive feature detection and UI integration

class FeatureManager {
    constructor() {
        this.features = {};
        this.supportedFeatures = [
            'HAS_TFT', 'HAS_RGB_LED', 'HAS_BLE_WRITER', 'HAS_SUBGHZ',
            'HAS_EXT_FLASHER', 'C6_OTA_FLASHING', 'TAG_LED_CONTROL',
            'TAG_BATTERY_MONITOR', 'TAG_SIGNAL_MONITOR', 'FIND_MY_TAG',
            'WEB_UI_ENHANCED', 'HAS_USB', 'HAS_SDCARD', 'HAS_IR_REMOTE', 'HAS_RC522_RFID'
        ];
        this.init();
    }

    async init() {
        try {
            await this.detectFeatures();
            this.updateUI();
            this.setupFeatureHandlers();
        } catch (error) {
            console.error('Feature detection failed:', error);
            this.fallbackMode();
        }
    }

    async detectFeatures() {
        try {
            // Get feature status from the ESP32
            const response = await fetch('/api/features');
            if (response.ok) {
                const data = await response.json();
                this.features = data;
            } else {
                // Fallback: try individual endpoints
                await this.detectFeaturesIndividually();
            }
        } catch (error) {
            console.warn('Feature detection error:', error);
            await this.detectFeaturesIndividually();
        }
    }

    async detectFeaturesIndividually() {
        // Try to detect features individually through existing endpoints
        const detectionPromises = [
            this.checkFeature('HAS_RGB_LED', '/led_control'),
            this.checkFeature('HAS_TFT', '/tft_status'),
            this.checkFeature('HAS_BLE_WRITER', '/ble_status'),
            this.checkFeature('HAS_SUBGHZ', '/subghz_status'),
            this.checkFeature('C6_OTA_FLASHING', '/c6_status'),
            this.checkFeature('HAS_IR_REMOTE', '/ir/status'),
            this.checkFeature('HAS_RC522_RFID', '/rfid/status'),
            this.checkFeature('HAS_EXT_FLASHER', '/flasher_status')
        ];

        const results = await Promise.allSettled(detectionPromises);
        results.forEach((result, index) => {
            if (result.status === 'fulfilled') {
                console.log(`Feature detection ${index}: ${result.value}`);
            }
        });
    }

    async checkFeature(featureName, endpoint) {
        try {
            const response = await fetch(endpoint, { method: 'HEAD' });
            this.features[featureName] = response.ok;
            return `${featureName}: ${response.ok}`;
        } catch (error) {
            this.features[featureName] = false;
            return `${featureName}: false (${error.message})`;
        }
    }

    updateUI() {
        // Update navigation menu based on available features
        this.updateMenuVisibility();

        // Update feature-specific UI elements
        this.updateFeatureCards();

        // Update status indicators
        this.updateStatusIndicators();
    }

    updateMenuVisibility() {
        const menuItems = {
            'c6_module.html': this.features.C6_OTA_FLASHING,
            'nrf52_swd.html': this.features.HAS_EXT_FLASHER,
            'tag_control_panel.html': this.features.TAG_LED_CONTROL,
            'ir_remote.html': this.features.HAS_IR_REMOTE,
            'rfid_control.html': this.features.HAS_RC522_RFID
        };

        Object.entries(menuItems).forEach(([href, enabled]) => {
            const menuItem = document.querySelector(`a[href="${href}"]`);
            if (menuItem) {
                if (enabled) {
                    menuItem.style.display = '';
                    menuItem.classList.remove('disabled');
                } else {
                    menuItem.style.opacity = '0.5';
                    menuItem.classList.add('disabled');
                    menuItem.title = 'Feature not available on this device';
                }
            }
        });
    }

    updateFeatureCards() {
        // Update main page feature cards
        const featureCards = document.querySelectorAll('.module-card');
        featureCards.forEach(card => {
            const href = card.getAttribute('href');
            if (href) {
                const featureEnabled = this.isFeaturePageEnabled(href);
                if (!featureEnabled) {
                    card.classList.add('feature-disabled');
                    card.style.opacity = '0.6';
                    const badge = document.createElement('span');
                    badge.className = 'feature-badge unavailable';
                    badge.textContent = 'N/A';
                    badge.style.cssText = 'position: absolute; top: 5px; right: 5px; background: #ff6b6b; color: white; padding: 2px 6px; border-radius: 10px; font-size: 10px;';
                    card.style.position = 'relative';
                    card.appendChild(badge);
                }
            }
        });
    }

    updateStatusIndicators() {
        // Add feature status to header
        const statusContainer = document.querySelector('.header-status');
        if (statusContainer && this.features) {
            const enabledFeatures = Object.entries(this.features)
                .filter(([_, enabled]) => enabled)
                .length;

            const totalFeatures = this.supportedFeatures.length;

            const featureStatus = document.createElement('div');
            featureStatus.className = 'status-item';
            featureStatus.innerHTML = `
                <span class="material-symbols-outlined" style="font-size: 12px;">tune</span>
                <span>${enabledFeatures}/${totalFeatures} Features</span>
            `;
            featureStatus.title = 'Active Features: ' + Object.entries(this.features)
                .filter(([_, enabled]) => enabled)
                .map(([name, _]) => name)
                .join(', ');

            statusContainer.appendChild(featureStatus);
        }
    }

    isFeaturePageEnabled(href) {
        switch (href) {
            case 'c6_module.html':
                return this.features.C6_OTA_FLASHING;
            case 'nrf52_swd.html':
                return this.features.HAS_EXT_FLASHER;
            case 'tag_control_panel.html':
                return this.features.TAG_LED_CONTROL || this.features.TAG_BATTERY_MONITOR;
            case 'ir_remote.html':
                return this.features.HAS_IR_REMOTE;
            case 'rfid_control.html':
                return this.features.HAS_RC522_RFID;
            case 'flasher.html':
                return true; // Always available
            case 'dashboard.html':
            case 'tags.html':
            case 'settings.html':
                return true; // Core features always available
            default:
                return true;
        }
    }

    setupFeatureHandlers() {
        // RGB LED Control
        if (this.features.HAS_RGB_LED) {
            this.setupRGBLEDHandlers();
        }

        // Tag LED Control
        if (this.features.TAG_LED_CONTROL) {
            this.setupTagLEDHandlers();
        }

        // TFT Display
        if (this.features.HAS_TFT) {
            this.setupTFTHandlers();
        }

        // Battery/Signal Monitoring
        if (this.features.TAG_BATTERY_MONITOR || this.features.TAG_SIGNAL_MONITOR) {
            this.setupMonitoringHandlers();
        }
    }

    setupRGBLEDHandlers() {
        // Enhanced RGB LED control
        window.setRGBColor = async (color) => {
            try {
                const response = await fetch('/led_control', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: `action=setColor&color=${encodeURIComponent(color)}`
                });
                const result = await response.text();
                console.log('RGB LED color set:', result);
                return result;
            } catch (error) {
                console.error('RGB LED control failed:', error);
                throw error;
            }
        };

        window.rgbBlink = async (duration = 3) => {
            try {
                const response = await fetch('/led_control', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: `action=blink&duration=${duration * 500}`
                });
                const result = await response.text();
                console.log('RGB LED blink:', result);
                return result;
            } catch (error) {
                console.error('RGB LED blink failed:', error);
                throw error;
            }
        };
    }

    setupTagLEDHandlers() {
        // Enhanced tag LED control
        window.flashTagLED = async (mac, pattern = 'default') => {
            try {
                const formData = new FormData();
                formData.append('mac', mac);
                formData.append('cmd', 'ledflash');

                const response = await fetch('/tag_cmd', {
                    method: 'POST',
                    body: formData
                });
                const result = await response.text();
                console.log(`Tag LED flash (${mac}):`, result);
                return result;
            } catch (error) {
                console.error('Tag LED flash failed:', error);
                throw error;
            }
        };

        window.bulkFlashTags = async (macs) => {
            const promises = macs.map(mac => window.flashTagLED(mac));
            const results = await Promise.allSettled(promises);
            const successful = results.filter(r => r.status === 'fulfilled').length;
            console.log(`Bulk flash: ${successful}/${macs.length} successful`);
            return { successful, total: macs.length };
        };
    }

    setupTFTHandlers() {
        // TFT display status and control
        window.updateTFTDisplay = async (message, color = 'white') => {
            try {
                const response = await fetch('/tft_display', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: `message=${encodeURIComponent(message)}&color=${color}`
                });
                if (response.ok) {
                    console.log('TFT display updated:', message);
                }
            } catch (error) {
                console.error('TFT display update failed:', error);
            }
        };
    }

    setupMonitoringHandlers() {
        // Enhanced monitoring capabilities
        window.getTagMetrics = async (mac) => {
            try {
                const response = await fetch(`/tag_metrics?mac=${mac}`);
                if (response.ok) {
                    const metrics = await response.json();
                    return metrics;
                }
            } catch (error) {
                console.error('Tag metrics fetch failed:', error);
            }
            return null;
        };

        window.getBatteryLevels = async () => {
            try {
                const response = await fetch('/battery_levels');
                if (response.ok) {
                    const levels = await response.json();
                    return levels;
                }
            } catch (error) {
                console.error('Battery levels fetch failed:', error);
            }
            return {};
        };
    }

    fallbackMode() {
        console.warn('Running in fallback mode - some features may be limited');
        // Set conservative defaults
        this.features = {
            HAS_TFT: true,
            HAS_RGB_LED: true,
            TAG_LED_CONTROL: true,
            HAS_EXT_FLASHER: true
        };
        this.updateUI();
    }

    // Public API
    hasFeature(featureName) {
        return !!this.features[featureName];
    }

    getFeatures() {
        return { ...this.features };
    }

    async refreshFeatures() {
        await this.detectFeatures();
        this.updateUI();
    }
}

// Initialize feature manager
window.featureManager = new FeatureManager();

// Make it available globally
window.addEventListener('DOMContentLoaded', () => {
    if (!window.featureManager) {
        window.featureManager = new FeatureManager();
    }
});

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = FeatureManager;
}

// Best-effort mapping of feature keys to friendly names and GPIOs.
// Sources: platformio.ini and compile flags (build-time). These values
// are informational only; runtime pins may differ. Consider exposing
// a /api/pins endpoint for authoritative runtime values.
window.featurePinMap = {
    'HAS_TFT': {
        label: 'TFT Display (ST7789)',
        pins: { MOSI: 13, SCLK: 12, CS: 10, DC: 11, RST: 1 },
        source: 'build-time'
    },
    'HAS_RGB_LED': {
        label: 'Flasher RGB LED (WS2812)',
        pin: 38,
        source: 'build-time'
    },
    'HAS_EXT_FLASHER': {
        label: 'Flasher LED (PWM)',
        pin: 21,
        source: 'build-time'
    },
    'HAS_RC522_RFID': {
        label: 'RC522 RFID (SS / RST)',
        pins: { SS: 22, RST: 4 },
        source: 'platformio (example)'
    },
    'HAS_SUBGHZ': {
        label: 'Sub-GHz (CC1101)',
        pin: null,
        note: 'pins vary by board / driver',
        source: 'driver'
    },
    'C6_OTA_FLASHING': {
        label: 'ESP32-C6 Module',
        note: 'chip variant present',
        source: 'build-time'
    },
    'HAS_IR_REMOTE': {
        label: 'IR Receiver/Emitter',
        pin: null,
        note: 'pin not found in build flags',
        source: 'driver'
    }
};

// Global helper to fetch mapping for a feature key
window.getFeaturePinInfo = function(featureKey) {
    return window.featurePinMap && window.featurePinMap[featureKey] ? window.featurePinMap[featureKey] : null;
};
