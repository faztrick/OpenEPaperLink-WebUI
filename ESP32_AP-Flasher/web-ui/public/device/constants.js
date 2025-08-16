// OpenEPL ESP32 - Constants and Configuration
// Contains all constants, enums, and configuration data

// DOM utility
const $ = document.querySelector.bind(document);

// Wakeup reason constants
const WAKEUP_REASONS = {
    TIMED: 0,
    BOOT: 1,
    GPIO: 2,
    NFC: 3,
    BUTTON1: 4,
    BUTTON2: 5,
    BUTTON3: 6,
    FAILED_OTA_FW: 0xE0,
    FIRSTBOOT: 0xFC,
    NETWORK_SCAN: 0xFD,
    WDT_RESET: 0xFE
};

// Access Point states
const AP_STATES = [
    { state: "offline, please wait...", color: "orange", icon: "warning" },
    { state: "online", color: "green", icon: "check_circle" },
    { state: "flashing", color: "orange", icon: "flash_on" },
    { state: "wait for reset", color: "blue", icon: "hourglass" },
    { state: "AP requires reboot", color: "purple", icon: "refresh" },
    { state: "failed", color: "red", icon: "error" },
    { state: "coming online...", color: "orange", icon: "hourglass" },
    { state: "AP without radio", color: "green", icon: "wifi_off" }
];

// Run states
const RUN_STATES = [
    { state: "⏹︎ stopped" },
    { state: "⏸ pause" },
    { state: "" }, // hide running
    { state: "⏳︎ init" }
];

// Tag capabilities and types
const TAG_CAPABILITIES = {
    1: 0,   // 1.54" BWR
    2: 0,   // 2.13" BWR  
    3: 0,   // 2.9" BWR
    4: 0,   // 4.2" BWR
    5: 0,   // 7.5" BWR
    6: 0,   // 2.13" BW
    7: 0,   // 2.9" BW
    8: 0,   // 4.2" BW
    9: 0,   // 7.5" BW
    10: 0   // 1.54" BW
};

// Tag type descriptions
const TAG_TYPES = {
    1: "1.54\" BWR (152x152)",
    2: "2.13\" BWR (212x104)",
    3: "2.9\" BWR (296x128)",
    4: "4.2\" BWR (400x300)",
    5: "7.5\" BWR (800x480)",
    6: "2.13\" BW (212x104)",
    7: "2.9\" BW (296x128)",
    8: "4.2\" BW (400x300)",
    9: "7.5\" BW (800x480)",
    10: "1.54\" BW (152x152)"
};

// API endpoints
const API_ENDPOINTS = {
    GET_TAGS: '/gettags',
    GET_CONFIG: '/config',
    GET_SYSINFO: '/sysinfo',
    GET_WIFI_CONFIG: '/get_wifi_config',
    LITTLEFS_PUT: '/littlefs_put',
    CONTENT_CARDS: '/content_cards.json'
};

// Export constants for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        $,
        WAKEUP_REASONS,
        AP_STATES,
        RUN_STATES,
        TAG_CAPABILITIES,
        TAG_TYPES,
        API_ENDPOINTS
    };
}
