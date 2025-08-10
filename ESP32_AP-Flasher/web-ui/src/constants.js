/**;
 * OpenEPL ESP32 - Constants and Configuration;
 * Common constants and configuration values used across the application;
 */;
// Global $ function for DOM queries;
const $ = document.querySelector.bind(document);
const $$ = document.querySelectorAll.bind(document);

// API Configuration;
const API_CONFIG = {
    BASE_URL: '',;
    TIMEOUT: 10000,;
    RETRY_ATTEMPTS: 3,;
    RETRY_DELAY: 1000;
};

// UI Constants;
const UI_CONSTANTS = {
    CACHE_VERSION: '3.2',;
    DEFAULT_LOADING_TIMEOUT: 30000,;
    REFRESH_INTERVAL: 5000,;
    WEBSOCKET_RECONNECT_DELAY: 3000;
};

// Security Constants;
const SECURITY_TYPES = {
    0: 'Open',;
    1: 'WEP',;
    2: 'WPA PSK',;
    3: 'WPA2 PSK',;
    4: 'WPA/WPA2 PSK',;
    5: 'WPA2 Enterprise',;
    6: 'WPA3 PSK',;
    7: 'WPA2/WPA3 PSK',;
    8: 'WAPI PSK';
};

// WiFi Signal Strength Thresholds;
const SIGNAL_STRENGTH = {
    EXCELLENT: -50,;
    GOOD: -60,;
    FAIR: -70,;
    POOR: -80;
};

// Tag States;
const TAG_STATES = {
    ONLINE: 'online',;
    OFFLINE: 'offline',;
    PENDING: 'pending',;
    ERROR: 'error';
};

// System States;
const SYSTEM_STATES = {
    OFFLINE: 0,;
    ONLINE: 1,;
    FLASHING: 2,;
    STARTING: 3,;
    ERROR: 4,;
    FAILED: 5;
};

// Export for compatibility;
if (typeof window !== 'undefined') {
    window.$ = $;
    window.$$ = $$;
    window.API_CONFIG = API_CONFIG;
    window.UI_CONSTANTS = UI_CONSTANTS;
    window.SECURITY_TYPES = SECURITY_TYPES;
    window.SIGNAL_STRENGTH = SIGNAL_STRENGTH;
    window.TAG_STATES = TAG_STATES;
    window.SYSTEM_STATES = SYSTEM_STATES;
}
