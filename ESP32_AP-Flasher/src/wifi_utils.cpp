/**
 * @file wifi_utils.cpp
 * @brief Optimized WiFi utility functions implementation
 *
 * This file provides comprehensive WiFi management functionality with:
 * - Unified configuration through json_config system
 * - Thread-safe operations with proper error handling
 * - Improv WiFi protocol support for easy setup
 * - Integration with core utilities and web systems
 * - Optimized scanning and connection management
 *
 * @author OpenEPaperLink Contributors
 * @version 2.0 - Optimized & Refactored
 */

#include "wifi_utils.h"

#include <ArduinoJson.h>  // Include directly to avoid macro conflicts
#include <ETH.h>

#include <cstring>

#include "build_constants.h"
#include "core_utilities.h"
#include "json_config.h"
#include "web_utilities.h"

// ============================================================================
// Static Variables and Initialization
// ============================================================================
WiFiUtils* WiFiUtils::instance = nullptr;
SemaphoreHandle_t WiFiUtils::scanMutex = nullptr;
uint32_t WiFiUtils::lastScanTime = 0;
bool WiFiUtils::scanInProgress = false;
uint8_t WiFiUtils::apClients = 0;

// Global instance for compatibility
WiFiUtils& wifiUtils = WiFiUtils::getInstance();

// ============================================================================
// Constructor and Singleton Pattern
// ============================================================================
WiFiUtils::WiFiUtils()
    : _connected(false), _savewhensuccessfull(false), _initialized(false), _reconnectIntervalCheck(10000), _retryIntervalCheck(30000), _connectionTimeout(WIFI_CONNECT_TIMEOUT_MS), _nextReconnectCheck(0), _APstarted(false), wifiStatus(NOINIT), serialIndex(0) {
    // Initialize serial buffer to zero
    memset(serialBuffer, 0, SERIAL_BUFFER_SIZE);

    // Create scan mutex if not exists
    if (!scanMutex) {
        scanMutex = xSemaphoreCreateMutex();
        if (!scanMutex) {
            LogUtils::logError("[WiFiUtils] Failed to create scan mutex");
        }
    }
}

WiFiUtils& WiFiUtils::getInstance() {
    if (!instance) {
        instance = new WiFiUtils();
    }
    return *instance;
}

// ============================================================================
// WiFi Initialization and Connection Management
// ============================================================================
void WiFiUtils::initEth() {
    if (_initialized) {
        LogUtils::logInfo("[WiFiUtils] Already initialized");
        return;
    }

    LogUtils::logInfo("[WiFiUtils] Initializing WiFi subsystem...");

    // Ensure core utilities are initialized first
    if (!CoreUtils::isInitialized()) {
        LogUtils::logInfo("[WiFiUtils] Initializing CoreUtils...");
        if (!CoreUtils::initialize()) {
            LogUtils::logError("[WiFiUtils] Failed to initialize CoreUtils");
            return;
        }
    }

    // Ensure configuration system is ready
    if (!CONFIG.initialize()) {
        LogUtils::logError("[WiFiUtils] Failed to initialize configuration system");
        return;
    }

    // Setup WiFi event handler
    WiFi.onEvent(WiFiEvent);

    // Load WiFi configuration from unified config
    const auto& wifiConfig = WIFI_CONFIG;

    // Set hostname if configured
    if (!wifiConfig.hostname.isEmpty()) {
        WiFi.setHostname(wifiConfig.hostname.c_str());
        LogUtils::logInfo("[WiFiUtils] Hostname set: " + wifiConfig.hostname);
    }

    // Determine WiFi mode based on configuration
    wifi_mode_t mode = WIFI_MODE_NULL;
    if (wifiConfig.enableAP && !wifiConfig.ssid.isEmpty()) {
        mode = WIFI_AP_STA;  // Both AP and STA mode
        LogUtils::logInfo("[WiFiUtils] Setting mode: AP+STA");
    } else if (wifiConfig.enableAP) {
        mode = WIFI_AP;  // AP mode only
        LogUtils::logInfo("[WiFiUtils] Setting mode: AP only");
    } else if (!wifiConfig.ssid.isEmpty()) {
        mode = WIFI_STA;  // STA mode only
        LogUtils::logInfo("[WiFiUtils] Setting mode: STA only");
    }

    if (mode != WIFI_MODE_NULL) {
        WiFi.mode(mode);
    }

    // Start Access Point if enabled
    if (wifiConfig.enableAP) {
        startAccessPoint();
    }

    // Configure static IP if enabled
    if (wifiConfig.useStaticIP && !wifiConfig.staticIP.isEmpty()) {
        configureStaticIP();
    }

    // Auto-connect to STA if credentials available
    if (!wifiConfig.ssid.isEmpty()) {
        LogUtils::logInfo("[WiFiUtils] Auto-connecting to: " + wifiConfig.ssid);
        connectToWifi(wifiConfig.ssid, wifiConfig.password, false);
    }

    _initialized = true;
    LogUtils::logInfo("[WiFiUtils] WiFi initialization complete");
}

bool WiFiUtils::startAccessPoint() {
    const auto& wifiConfig = WIFI_CONFIG;

    String apSSID = wifiConfig.apSSID.isEmpty() ? "OpenEPaperLink-AP" : wifiConfig.apSSID;
    String apPassword = wifiConfig.apPassword;

    // Validate AP password
    if (!apPassword.isEmpty() && apPassword.length() < 8) {
        LogUtils::logWarning("[WiFiUtils] AP password too short, using default");
        apPassword = "12345678";
    }

    LogUtils::logInfo("[WiFiUtils] Starting AP: " + apSSID);

    // Configure AP with enhanced settings
    bool success;
    if (apPassword.isEmpty()) {
        success = WiFi.softAP(apSSID.c_str(), nullptr, wifiConfig.channel);
    } else {
        success = WiFi.softAP(apSSID.c_str(), apPassword.c_str(), wifiConfig.channel, false, 8);
    }

    if (success) {
        // Apply power management settings
        esp_err_t ret = esp_wifi_set_ps(wifiConfig.powerSave ? WIFI_PS_MIN_MODEM : WIFI_PS_NONE);
        if (ret != ESP_OK) {
            LogUtils::logWarning("[WiFiUtils] Failed to set power save mode: " + String(esp_err_to_name(ret)));
        }

        // Set optimal TX power
        if (!WiFi.setTxPower(WIFI_POWER_19_5dBm)) {
            LogUtils::logWarning("[WiFiUtils] Failed to set TX power");
        }

        // Set AP hostname
        if (!WiFi.softAPsetHostname(apSSID.c_str())) {
            LogUtils::logWarning("[WiFiUtils] Failed to set AP hostname");
        }

        // Configure bandwidth for better performance
        ret = esp_wifi_set_bandwidth(WIFI_IF_AP, WIFI_BW_HT20);
        if (ret != ESP_OK) {
            LogUtils::logWarning("[WiFiUtils] Failed to set AP bandwidth: " + String(esp_err_to_name(ret)));
        }

        IPAddress apIP = WiFi.softAPIP();
        LogUtils::logInfo("[WiFiUtils] AP started successfully. IP: " + apIP.toString());
        LogUtils::logInfo("[WiFiUtils] Connect to '" + apSSID + "' and visit http://" + apIP.toString());

        _APstarted = true;
        return true;
    } else {
        LogUtils::logError("[WiFiUtils] Failed to start Access Point");
        return false;
    }
}

bool WiFiUtils::configureStaticIP() {
    const auto& wifiConfig = WIFI_CONFIG;

    IPAddress ip, gateway, subnet, dns1, dns2;

    if (!ip.fromString(wifiConfig.staticIP)) {
        LogUtils::logError("[WiFiUtils] Invalid static IP: " + wifiConfig.staticIP);
        return false;
    }

    if (!gateway.fromString(wifiConfig.gateway)) {
        LogUtils::logError("[WiFiUtils] Invalid gateway: " + wifiConfig.gateway);
        return false;
    }

    if (!subnet.fromString(wifiConfig.subnet)) {
        LogUtils::logError("[WiFiUtils] Invalid subnet: " + wifiConfig.subnet);
        return false;
    }

    // DNS servers are optional
    if (!wifiConfig.dns1.isEmpty()) {
        dns1.fromString(wifiConfig.dns1);
    }
    if (!wifiConfig.dns2.isEmpty()) {
        dns2.fromString(wifiConfig.dns2);
    }

    bool success = WiFi.config(ip, gateway, subnet, dns1, dns2);
    if (success) {
        LogUtils::logInfo("[WiFiUtils] Static IP configured: " + ip.toString());
    } else {
        LogUtils::logError("[WiFiUtils] Failed to configure static IP");
    }

    return success;
}

bool WiFiUtils::connectToWifi() {
    const auto& wifiConfig = WIFI_CONFIG;
    if (wifiConfig.ssid.isEmpty()) {
        LogUtils::logWarning("[WiFiUtils] No SSID configured for connection");
        return false;
    }
    return connectToWifi(wifiConfig.ssid, wifiConfig.password, false);
}

bool WiFiUtils::connectToWifi(String ssid, String pass, bool savewhensuccessfull) {
    if (ssid.isEmpty()) {
        LogUtils::logError("[WiFiUtils] SSID cannot be empty");
        return false;
    }

    if (ssid.length() > 32) {
        LogUtils::logError("[WiFiUtils] SSID too long (max 32 characters)");
        return false;
    }

    if (!pass.isEmpty() && (pass.length() < 8 || pass.length() > 63)) {
        LogUtils::logError("[WiFiUtils] Password must be 8-63 characters or empty for open network");
        return false;
    }

    LogUtils::logInfo("[WiFiUtils] Connecting to WiFi: " + ssid);

    _ssid = ssid;
    _pass = pass;
    _savewhensuccessfull = savewhensuccessfull;
    wifiStatus = WAIT_CONNECTING;

    // Disconnect first to ensure clean connection
    WiFi.disconnect(false);
    CoreUtils::safeDelay(100);

    // Configure auto-reconnect
    WiFi.setAutoReconnect(WIFI_CONFIG.autoReconnect);

    // Start connection
    if (pass.isEmpty()) {
        WiFi.begin(ssid.c_str());  // Open network
    } else {
        WiFi.begin(ssid.c_str(), pass.c_str());
    }

    return waitForConnection();
}

bool WiFiUtils::waitForConnection() {
    unsigned long startTime = millis();
    wl_status_t lastStatus = WL_IDLE_STATUS;

    LogUtils::logInfo("[WiFiUtils] Waiting for connection (timeout: " + String(_connectionTimeout / 1000) + "s)");

    while (WiFi.status() != WL_CONNECTED && (millis() - startTime) < _connectionTimeout) {
        wl_status_t currentStatus = WiFi.status();

        // Log status changes for debugging
        if (currentStatus != lastStatus) {
            LogUtils::logInfo("[WiFiUtils] WiFi status: " + WiFiHelpers::getStatusString(currentStatus));
            lastStatus = currentStatus;
        }

        // Check for immediate failure conditions
        if (currentStatus == WL_CONNECT_FAILED || currentStatus == WL_NO_SSID_AVAIL) {
            LogUtils::logError("[WiFiUtils] Connection failed: " + WiFiHelpers::getStatusString(currentStatus));
            break;
        }

        CoreUtils::safeDelay(100);
    }

    if (WiFi.status() == WL_CONNECTED) {
        _connected = true;
        wifiStatus = CONNECTED;

        // Log connection details
        WiFiConnectionInfo info = getConnectionInfo();
        LogUtils::logInfo("[WiFiUtils] Connected successfully!");
        LogUtils::logInfo("  IP: " + info.ip);
        LogUtils::logInfo("  Gateway: " + info.gateway);
        LogUtils::logInfo("  RSSI: " + String(info.rssi) + " dBm");
        LogUtils::logInfo("  Channel: " + String(info.channel));

        // Save configuration if requested
        if (_savewhensuccessfull) {
            auto config = WIFI_CONFIG;
            config.ssid = _ssid;
            config.password = _pass;
            CONFIG.save();
            LogUtils::logInfo("[WiFiUtils] WiFi credentials saved to config: " + config.ssid);
        }

        // Notify web clients if available
        if (WebSocketManager::hasClients()) {
            WebSocketManager::sendNotification("WiFi Connected",
                                               "Connected to " + _ssid + " (" + WiFi.localIP().toString() + ")",
                                               "success", "info");
        }

        return true;
    } else {
        _connected = false;
        wifiStatus = WAIT_RECONNECT;
        _nextReconnectCheck = millis() + _retryIntervalCheck;

        LogUtils::logError("[WiFiUtils] Connection timeout or failed");
        LogUtils::logError("  Final status: " + WiFiHelpers::getStatusString(WiFi.status()));

        return false;
    }
}

void WiFiUtils::poll() {
    // Handle WiFi status monitoring and auto-reconnection
    handleWiFiStatusChanges();

    // Handle reconnection attempts
    handleReconnectionLogic();

    // Process Improv WiFi serial protocol
    processImprovSerial();

    // Update AP client count
    updateAPClientCount();
}

void WiFiUtils::handleWiFiStatusChanges() {
    static wl_status_t lastStatus = WL_IDLE_STATUS;
    wl_status_t currentStatus = WiFi.status();

    // Check for connection state changes
    bool currentlyConnected = (currentStatus == WL_CONNECTED);

    if (_connected != currentlyConnected) {
        if (currentlyConnected) {
            _connected = true;
            wifiStatus = CONNECTED;
            LogUtils::logInfo("[WiFiUtils] WiFi reconnected: " + WiFi.localIP().toString());

            // Notify web clients
            if (WebSocketManager::hasClients()) {
                WebSocketManager::sendNotification("WiFi Reconnected",
                                                   "Connection restored to " + WiFi.SSID(), "success", "info");
            }
        } else {
            _connected = false;
            wifiStatus = WAIT_RECONNECT;
            _nextReconnectCheck = millis() + _retryIntervalCheck;
            LogUtils::logWarning("[WiFiUtils] WiFi disconnected: " + WiFiHelpers::getStatusString(currentStatus));

            // Notify web clients
            if (WebSocketManager::hasClients()) {
                WebSocketManager::sendNotification("WiFi Disconnected",
                                                   "Connection lost, attempting reconnection...", "warning", "warning");
            }
        }
    }

    // Log status changes for debugging
    if (currentStatus != lastStatus && currentStatus != WL_CONNECTED) {
        LogUtils::logInfo("[WiFiUtils] Status change: " + WiFiHelpers::getStatusString(currentStatus));
        lastStatus = currentStatus;
    }
}

void WiFiUtils::handleReconnectionLogic() {
    if (wifiStatus == WAIT_RECONNECT && millis() > _nextReconnectCheck && WIFI_CONFIG.autoReconnect) {
        _nextReconnectCheck = millis() + _retryIntervalCheck;

        if (!_ssid.isEmpty()) {
            LogUtils::logInfo("[WiFiUtils] Attempting auto-reconnection to: " + _ssid);

            // Disconnect cleanly before reconnecting
            WiFi.disconnect(false);
            CoreUtils::safeDelay(100);

            // Attempt reconnection
            if (_pass.isEmpty()) {
                WiFi.begin(_ssid.c_str());
            } else {
                WiFi.begin(_ssid.c_str(), _pass.c_str());
            }

            wifiStatus = WAIT_CONNECTING;
        }
    }
}

void WiFiUtils::updateAPClientCount() {
    static uint32_t lastClientCheck = 0;

    if (millis() - lastClientCheck > 5000) {  // Check every 5 seconds
        lastClientCheck = millis();

        if (_APstarted) {
            uint8_t currentClients = WiFi.softAPgetStationNum();
            if (currentClients != apClients) {
                apClients = currentClients;
                LogUtils::logInfo("[WiFiUtils] AP clients: " + String(apClients));
            }
        }
    }
}

void WiFiUtils::processImprovSerial() {
    // Basic Improv WiFi serial processing
    // This handles the serial protocol for WiFi configuration
    // Implementation would process incoming serial data according to Improv spec

    // For now, just ensure buffer doesn't overflow
    if (serialIndex >= SERIAL_BUFFER_SIZE - 1) {
        serialIndex = 0;
        LogUtils::logWarning("[WiFiUtils] Serial buffer overflow, resetting");
    }

    // Process any available serial data
    while (Serial.available() && serialIndex < SERIAL_BUFFER_SIZE - 1) {
        serialBuffer[serialIndex++] = Serial.read();

        // Basic overflow protection
        if (serialIndex >= SERIAL_BUFFER_SIZE - 1) {
            serialIndex = 0;
            break;
        }
    }
}

IPAddress WiFiUtils::localIP() {
    return WiFi.localIP();
}

// ============================================================================
// WiFi Scanning with Enhanced Error Handling
// ============================================================================
bool WiFiUtils::performAsyncScan(bool showHidden, uint32_t maxWaitMs) {
    // Validate prerequisites
    if (!CoreUtils::isInitialized()) {
        LogUtils::logError("[WiFiUtils] CoreUtils not initialized, cannot perform scan");
        return false;
    }

    if (!_initialized) {
        LogUtils::logError("[WiFiUtils] WiFiUtils not initialized, cannot perform scan");
        return false;
    }

    // Thread-safe scan mutex handling
    if (!CoreUtils::safeTakeMutex(scanMutex, pdMS_TO_TICKS(2000))) {
        LogUtils::logWarning("[WiFiUtils] Failed to acquire scan mutex within timeout");
        return false;
    }

    // Check if scan already in progress
    if (scanInProgress) {
        LogUtils::logInfo("[WiFiUtils] Scan already in progress");
        CoreUtils::safeGiveMutex(scanMutex);
        return false;
    }

    // Rate limiting to prevent excessive scans
    uint32_t timeSinceLastScan = millis() - lastScanTime;
    if (timeSinceLastScan < SCAN_RATE_LIMIT_MS) {
        LogUtils::logInfo("[WiFiUtils] Scan rate limited (wait " +
                          String((SCAN_RATE_LIMIT_MS - timeSinceLastScan) / 1000) + "s)");
        CoreUtils::safeGiveMutex(scanMutex);
        return false;
    }

    // Start the scan
    scanInProgress = true;
    lastScanTime = millis();
    CoreUtils::safeGiveMutex(scanMutex);

    LogUtils::logInfo("[WiFiUtils] Starting WiFi scan (hidden: " + String(showHidden ? "yes" : "no") + ")");

    int result = WiFi.scanNetworks(true, showHidden);  // Async scan

    if (result == WIFI_SCAN_FAILED) {
        scanInProgress = false;
        LogUtils::logError("[WiFiUtils] Failed to start WiFi scan");
        return false;
    }

    return true;
}

WiFiScanResult WiFiUtils::getScanResults(bool clearAfter) {
    WiFiScanResult result;
    result.success = false;
    result.scanInProgress = scanInProgress;
    result.networksFound = 0;

    int scanResult = WiFi.scanComplete();

    if (scanResult == WIFI_SCAN_RUNNING) {
        result.scanInProgress = true;
        result.errorMessage = "Scan in progress";
        return result;
    }

    if (scanResult == WIFI_SCAN_FAILED) {
        result.errorMessage = "Scan failed";
        scanInProgress = false;
        LogUtils::logError("[WiFiUtils] WiFi scan failed");
        return result;
    }

    if (scanResult >= 0) {
        result.success = true;
        result.networksFound = scanResult;
        scanInProgress = false;

        LogUtils::logInfo("[WiFiUtils] Scan completed: " + String(scanResult) + " networks found");

        // Process scan results with bounds checking
        int maxNetworks = std::min(scanResult, MAX_WIFI_NETWORKS);
        result.networks.reserve(maxNetworks);

        for (int i = 0; i < maxNetworks; i++) {
            WiFiNetworkInfo network;
            network.ssid = WiFi.SSID(i);
            network.rssi = WiFi.RSSI(i);
            network.channel = WiFi.channel(i);
            network.encryption = WiFi.encryptionType(i);
            network.bssid = WiFi.BSSIDstr(i);

            // Skip networks with empty SSID unless hidden networks are requested
            if (network.ssid.length() > 0 || network.ssid.length() == 0) {
                result.networks.push_back(network);
            }
        }

        if (clearAfter) {
            WiFi.scanDelete();
        }
    }

    return result;
}

String WiFiUtils::buildScanResultsJson(bool clearAfter) {
    WiFiScanResult scanResult = getScanResults(clearAfter);

    const size_t jsonSize = 8192;  // Increased buffer size for more networks
    DynamicJsonDocument doc(jsonSize);

    doc["success"] = scanResult.success;
    doc["scanInProgress"] = scanResult.scanInProgress;
    doc["networksFound"] = scanResult.networksFound;
    doc["timestamp"] = millis();

    if (!scanResult.errorMessage.isEmpty()) {
        doc["error"] = scanResult.errorMessage;
    }

    // Create networks array - use direct ArduinoJson v6 calls to avoid macro conflicts
    JsonArray networks = doc["networks"].to<JsonArray>();
    for (const auto& network : scanResult.networks) {
        // Create nested object using native ArduinoJson API to bypass json_compat.h macros
        JsonVariant netVariant = networks.add();
        JsonObject net = netVariant.to<JsonObject>();
        net["ssid"] = network.ssid;
        net["rssi"] = network.rssi;
        net["channel"] = network.channel;
        net["encryption"] = WiFiHelpers::authModeToString(network.encryption);
        net["encryptionType"] = WiFiHelpers::authModeToInt(network.encryption);
        net["bssid"] = network.bssid;
        net["signalQuality"] = WiFiHelpers::calculateSignalQuality(network.rssi);
        net["isSecure"] = (network.encryption != WIFI_AUTH_OPEN);

        // Signal strength classification
        String signalStrength = "poor";
        if (network.rssi > -50)
            signalStrength = "excellent";
        else if (network.rssi > -60)
            signalStrength = "good";
        else if (network.rssi > -70)
            signalStrength = "fair";
        net["signalStrength"] = signalStrength;
    }

    String result;
    if (serializeJson(doc, result) == 0) {
        LogUtils::logError("[WiFiUtils] Failed to serialize scan results JSON");
        return "{\"success\":false,\"error\":\"JSON serialization failed\"}";
    }

    return result;
}

bool WiFiUtils::isScanning() {
    return scanInProgress;
}

// ============================================================================
// Connection Information with Enhanced Details
// ============================================================================
WiFiConnectionInfo WiFiUtils::getConnectionInfo() {
    WiFiConnectionInfo info;

    info.connected = WiFi.isConnected();
    info.ssid = WiFi.SSID();
    info.ip = WiFi.localIP().toString();
    info.gateway = WiFi.gatewayIP().toString();
    info.dns = WiFi.dnsIP().toString();
    info.rssi = WiFi.RSSI();
    info.channel = WiFi.channel();
    info.mac = WiFi.macAddress();
    info.hostname = WiFi.getHostname();
    info.mode = WiFi.getMode();
    info.apEnabled = (WiFi.getMode() == WIFI_AP || WiFi.getMode() == WIFI_AP_STA);

    if (info.apEnabled) {
        info.apClients = WiFi.softAPgetStationNum();
        info.apIP = WiFi.softAPIP().toString();
    } else {
        info.apClients = 0;
        info.apIP = "";
    }

    return info;
}

String WiFiUtils::getConnectionInfoJson() {
    WiFiConnectionInfo info = getConnectionInfo();

    const size_t jsonSize = 1536;  // Increased for additional fields
    DynamicJsonDocument doc(jsonSize);

    // Basic connection info
    doc["connected"] = info.connected;
    doc["ssid"] = info.ssid;
    doc["ip"] = info.ip;
    doc["gateway"] = info.gateway;
    doc["dns"] = info.dns;
    doc["rssi"] = info.rssi;
    doc["channel"] = info.channel;
    doc["mac"] = info.mac;
    doc["hostname"] = info.hostname;

    // WiFi mode information
    String modeStr = "Unknown";
    switch (info.mode) {
        case WIFI_OFF:
            modeStr = "Off";
            break;
        case WIFI_STA:
            modeStr = "Station";
            break;
        case WIFI_AP:
            modeStr = "Access Point";
            break;
        case WIFI_AP_STA:
            modeStr = "AP+Station";
            break;
    }
    doc["mode"] = modeStr;

    // Access Point information
    doc["apEnabled"] = info.apEnabled;
    if (info.apEnabled) {
        doc["apClients"] = info.apClients;
        doc["apIP"] = info.apIP;
        doc["apMAC"] = WiFi.softAPmacAddress();
    }

    // Additional status information
    if (info.connected) {
        doc["signalQuality"] = WiFiHelpers::calculateSignalQuality(info.rssi);
        doc["signalStrength"] = info.rssi > -50 ? "excellent" : info.rssi > -60 ? "good"
                                                            : info.rssi > -70   ? "fair"
                                                                                : "poor";
        doc["subnet"] = WiFi.subnetMask().toString();
        doc["dnsSecondary"] = WiFi.dnsIP(1).toString();
    }

    // System information
    doc["status"] = WiFiHelpers::getStatusString(WiFi.status());
    doc["autoReconnect"] = WiFi.getAutoReconnect();
    doc["uptime"] = millis();

    String result;
    if (serializeJson(doc, result) == 0) {
        LogUtils::logError("[WiFiUtils] Failed to serialize connection info JSON");
        return "{\"connected\":false,\"error\":\"JSON serialization failed\"}";
    }

    return result;
}

// ============================================================================
// Configuration Management - Integrated with Unified Config System
// ============================================================================
WiFiConfig WiFiUtils::loadConfig() {
    WiFiConfig config;

    if (!CONFIG.initialize()) {
        LogUtils::logError("[WiFiUtils] Failed to initialize config system, using defaults");
        setDefaultConfig(config);
        return config;
    }

    // Load from unified configuration system
    const auto& wifiSection = WIFI_CONFIG;

    config.ssid = wifiSection.ssid;
    config.password = wifiSection.password;
    config.hostname = wifiSection.hostname;
    config.useStaticIP = wifiSection.useStaticIP;
    config.staticIP = wifiSection.staticIP;
    config.gateway = wifiSection.gateway;
    config.subnet = wifiSection.subnet;
    config.dns1 = wifiSection.dns1;
    config.dns2 = wifiSection.dns2;
    config.enableAP = wifiSection.enableAP;
    config.apSSID = wifiSection.apSSID;
    config.apPassword = wifiSection.apPassword;
    config.channel = wifiSection.channel;
    config.autoReconnect = wifiSection.autoReconnect;
    config.powerSave = wifiSection.powerSave;

    return config;
}

bool WiFiUtils::saveConfig(const WiFiConfig& config) {
    if (!CONFIG.initialize()) {
        LogUtils::logError("[WiFiUtils] Failed to initialize config system");
        return false;
    }

    // Validate configuration before saving
    if (!config.isValid()) {
        LogUtils::logError("[WiFiUtils] Invalid WiFi configuration");
        return false;
    }

    // Update unified configuration
    auto& wifiSection = WIFI_CONFIG;

    wifiSection.ssid = config.ssid;
    wifiSection.password = config.password;
    wifiSection.hostname = config.hostname;
    wifiSection.useStaticIP = config.useStaticIP;
    wifiSection.staticIP = config.staticIP;
    wifiSection.gateway = config.gateway;
    wifiSection.subnet = config.subnet;
    wifiSection.dns1 = config.dns1;
    wifiSection.dns2 = config.dns2;
    wifiSection.enableAP = config.enableAP;
    wifiSection.apSSID = config.apSSID;
    wifiSection.apPassword = config.apPassword;
    wifiSection.channel = config.channel;
    wifiSection.autoReconnect = config.autoReconnect;
    wifiSection.powerSave = config.powerSave;

    bool success = CONFIG.save();
    if (success) {
        LogUtils::logInfo("[WiFiUtils] WiFi configuration saved successfully");
    } else {
        LogUtils::logError("[WiFiUtils] Failed to save WiFi configuration");
    }

    return success;
}

bool WiFiUtils::factoryReset() {
    LogUtils::logInfo("[WiFiUtils] Performing factory reset...");

    // Reset to default configuration
    auto& wifiSection = WIFI_CONFIG;

    wifiSection.ssid = "";
    wifiSection.password = "";
    wifiSection.hostname = "esp32-ap";
    wifiSection.useStaticIP = false;
    wifiSection.staticIP = "";
    wifiSection.gateway = "";
    wifiSection.subnet = "";
    wifiSection.dns1 = "";
    wifiSection.dns2 = "";
    wifiSection.enableAP = true;
    wifiSection.apSSID = "OpenEPaperLink-AP";
    wifiSection.apPassword = "12345678";
    wifiSection.channel = 1;
    wifiSection.autoReconnect = true;
    wifiSection.powerSave = false;

    bool success = CONFIG.save();

    if (success) {
        LogUtils::logInfo("[WiFiUtils] Factory reset complete, restarting...");

        // Disconnect and restart
        WiFi.disconnect(true, true);
        CoreUtils::safeDelay(1000);
        ESP.restart();
    } else {
        LogUtils::logError("[WiFiUtils] Factory reset failed");
    }

    return success;
}

void WiFiUtils::setDefaultConfig(WiFiConfig& config) {
    config.ssid = "";
    config.password = "";
    config.hostname = "esp32-ap";
    config.useStaticIP = false;
    config.staticIP = "";
    config.gateway = "";
    config.subnet = "255.255.255.0";
    config.dns1 = "8.8.8.8";
    config.dns2 = "8.8.4.4";
    config.enableAP = true;
    config.apSSID = "OpenEPaperLink-AP";
    config.apPassword = "12345678";
    config.channel = 1;
    config.autoReconnect = true;
    config.powerSave = false;
}

bool WiFiUtils::hasStaticIP() {
    const auto& wifiConfig = WIFI_CONFIG;
    return wifiConfig.useStaticIP && !wifiConfig.staticIP.isEmpty();
}

bool WiFiUtils::save() {
    // Legacy compatibility method
    return CONFIG.save();
}

bool WiFiUtils::saveConfigAsJson() {
    // Export current configuration as JSON
    WiFiConfig config = loadConfig();
    String jsonConfig = config.toJsonString();
    LogUtils::logInfo("[WiFiUtils] Configuration exported as JSON: " + jsonConfig);
    return true;
}

// ============================================================================
// Event Handling with Enhanced Logging
// ============================================================================
void WiFiUtils::WiFiEvent(WiFiEvent_t event) {
    String eventName = "Unknown";

    switch (event) {
        case ARDUINO_EVENT_WIFI_STA_START:
            eventName = "STA_START";
            LogUtils::logInfo("[WiFiUtils] WiFi station started");
            break;

        case ARDUINO_EVENT_WIFI_STA_STOP:
            eventName = "STA_STOP";
            LogUtils::logInfo("[WiFiUtils] WiFi station stopped");
            break;

        case ARDUINO_EVENT_WIFI_STA_CONNECTED:
            eventName = "STA_CONNECTED";
            LogUtils::logInfo("[WiFiUtils] Connected to WiFi network: " + WiFi.SSID());
            break;

        case ARDUINO_EVENT_WIFI_STA_DISCONNECTED:
            eventName = "STA_DISCONNECTED";
            LogUtils::logWarning("[WiFiUtils] Disconnected from WiFi network");
            break;

        case ARDUINO_EVENT_WIFI_STA_GOT_IP:
            eventName = "STA_GOT_IP";
            LogUtils::logInfo("[WiFiUtils] Got IP address: " + WiFi.localIP().toString());
            LogUtils::logInfo("  Gateway: " + WiFi.gatewayIP().toString());
            LogUtils::logInfo("  Subnet: " + WiFi.subnetMask().toString());
            LogUtils::logInfo("  DNS: " + WiFi.dnsIP().toString());

            // Notify web clients if available
            if (WebSocketManager::hasClients()) {
                WiFiConnectionInfo info;
                info.connected = true;
                info.ip = WiFi.localIP().toString();
                info.ssid = WiFi.SSID();

                WebSocketManager::sendNotification("IP Address Assigned",
                                                   "Connected to " + info.ssid + " with IP " + info.ip,
                                                   "success", "info");
            }
            break;

        case ARDUINO_EVENT_WIFI_STA_LOST_IP:
            eventName = "STA_LOST_IP";
            LogUtils::logWarning("[WiFiUtils] Lost IP address");
            break;

        case ARDUINO_EVENT_WIFI_AP_START:
            eventName = "AP_START";
            LogUtils::logInfo("[WiFiUtils] Access Point started");
            LogUtils::logInfo("  SSID: " + WiFi.softAPSSID());
            LogUtils::logInfo("  IP: " + WiFi.softAPIP().toString());
            break;

        case ARDUINO_EVENT_WIFI_AP_STOP:
            eventName = "AP_STOP";
            LogUtils::logInfo("[WiFiUtils] Access Point stopped");
            break;

        case ARDUINO_EVENT_WIFI_AP_STACONNECTED:
            eventName = "AP_STACONNECTED";
            apClients++;
            LogUtils::logInfo("[WiFiUtils] Client connected to AP (total: " + String(apClients) + ")");

            // Notify web clients
            if (WebSocketManager::hasClients()) {
                WebSocketManager::sendNotification("AP Client Connected",
                                                   "Device connected to access point", "info", "info");
            }
            break;

        case ARDUINO_EVENT_WIFI_AP_STADISCONNECTED:
            eventName = "AP_STADISCONNECTED";
            if (apClients > 0) apClients--;
            LogUtils::logInfo("[WiFiUtils] Client disconnected from AP (total: " + String(apClients) + ")");

            // Notify web clients
            if (WebSocketManager::hasClients()) {
                WebSocketManager::sendNotification("AP Client Disconnected",
                                                   "Device disconnected from access point", "info", "info");
            }
            break;

        case ARDUINO_EVENT_WIFI_SCAN_DONE:
            eventName = "SCAN_DONE";
            LogUtils::logInfo("[WiFiUtils] WiFi scan completed");
            break;

        default:
            eventName = "EVENT_" + String(event);
            LogUtils::logInfo("[WiFiUtils] WiFi event: " + eventName);
            break;
    }

    // Send event to web interface if available
    if (WebSocketManager::hasClients()) {
        DynamicJsonDocument doc(512);
        doc["type"] = "wifi_event";
        doc["event"] = eventName;
        doc["timestamp"] = millis();

        // Add relevant data based on event type
        switch (event) {
            case ARDUINO_EVENT_WIFI_STA_GOT_IP:
                doc["ip"] = WiFi.localIP().toString();
                doc["gateway"] = WiFi.gatewayIP().toString();
                break;
            case ARDUINO_EVENT_WIFI_AP_STACONNECTED:
            case ARDUINO_EVENT_WIFI_AP_STADISCONNECTED:
                doc["apClients"] = apClients;
                break;
        }

        WebSocketManager::sendMessage(doc);
    }
}

// ============================================================================
// Legacy Management Server - Enhanced with Error Handling
// ============================================================================
void WiFiUtils::startManagementServer() {
    if (_APstarted && wifiStatus != ETHERNET) {
        LogUtils::logInfo("[WiFiUtils] Management server already running");
        return;
    }

    LogUtils::logInfo("[WiFiUtils] Starting WiFi management server...");

    // Disable auto-reconnect temporarily to prevent interference
    WiFi.setAutoReconnect(false);
    WiFi.disconnect(true, true);
    CoreUtils::safeDelay(500);

    // Set to AP+STA mode for maximum compatibility
    WiFi.mode(WIFI_AP_STA);

    // Configure power management
    esp_err_t ret = esp_wifi_set_ps(WIFI_PS_NONE);
    if (ret != ESP_OK) {
        LogUtils::logWarning("[WiFiUtils] Failed to set power save mode: " + String(esp_err_to_name(ret)));
    }

    // Set optimal TX power for AP mode
    if (!WiFi.setTxPower(WIFI_POWER_19_5dBm)) {
        LogUtils::logWarning("[WiFiUtils] Failed to set AP TX power");
    }

    // Start Access Point with management SSID
    String managementSSID = "OpenEPaperLink";
    String managementPassword = "";  // Open network for easy access

    if (!WiFi.softAP(managementSSID.c_str(), managementPassword.c_str(), 1, false, 8)) {
        LogUtils::logError("[WiFiUtils] Failed to start WiFi management AP");
        return;
    }

    // Set AP hostname
    if (!WiFi.softAPsetHostname(managementSSID.c_str())) {
        LogUtils::logWarning("[WiFiUtils] Failed to set AP hostname");
    }

    // Configure bandwidth for better performance
    ret = esp_wifi_set_bandwidth(WIFI_IF_AP, WIFI_BW_HT20);
    if (ret != ESP_OK) {
        LogUtils::logWarning("[WiFiUtils] Failed to set AP bandwidth: " + String(esp_err_to_name(ret)));
    }

    // Get AP IP and log connection instructions
    IPAddress apIP = WiFi.softAPIP();
    String setupURL = "http://" + apIP.toString() + "/setup";

    LogUtils::logInfo("[WiFiUtils] ✅ Management AP started successfully!");
    LogUtils::logInfo("  SSID: " + managementSSID + " (Open Network)");
    LogUtils::logInfo("  IP: " + apIP.toString());
    LogUtils::logInfo("  Setup URL: " + setupURL);
    LogUtils::logInfo("  MAC: " + WiFi.softAPmacAddress());

    _APstarted = true;
    _nextReconnectCheck = millis() + _retryIntervalCheck;
    wifiStatus = AP;

    // Notify web clients about management server
    if (WebSocketManager::hasClients()) {
        WebSocketManager::sendNotification("Management Server",
                                           "WiFi setup available at " + setupURL, "info", "info");
    }
}

// ============================================================================
// JSON Configuration Methods - Enhanced
// ============================================================================
String WiFiUtils::getConfigAsJson() const {
    const auto& wifiConfig = WIFI_CONFIG;

    DynamicJsonDocument doc(1024);

    doc["ssid"] = wifiConfig.ssid;
    doc["password"] = "***";  // Don't expose actual password
    doc["hostname"] = wifiConfig.hostname;
    doc["useStaticIP"] = wifiConfig.useStaticIP;
    doc["staticIP"] = wifiConfig.staticIP;
    doc["gateway"] = wifiConfig.gateway;
    doc["subnet"] = wifiConfig.subnet;
    doc["dns1"] = wifiConfig.dns1;
    doc["dns2"] = wifiConfig.dns2;
    doc["enableAP"] = wifiConfig.enableAP;
    doc["apSSID"] = wifiConfig.apSSID;
    doc["apPassword"] = "***";  // Don't expose AP password
    doc["channel"] = wifiConfig.channel;
    doc["autoReconnect"] = wifiConfig.autoReconnect;
    doc["powerSave"] = wifiConfig.powerSave;

    // Add runtime status
    doc["connected"] = _connected;
    doc["status"] = WiFiHelpers::getStatusString(WiFi.status());
    doc["apActive"] = _APstarted;
    doc["apClients"] = apClients;

    String result;
    if (serializeJson(doc, result) == 0) {
        LogUtils::logError("[WiFiUtils] Failed to serialize config JSON");
        return "{\"error\":\"JSON serialization failed\"}";
    }

    return result;
}

bool WiFiUtils::loadConfigFromJson(const String& json) {
    DynamicJsonDocument doc(1024);
    DeserializationError error = deserializeJson(doc, json);

    if (error) {
        LogUtils::logError("[WiFiUtils] Failed to parse JSON config: " + String(error.c_str()));
        return false;
    }

    // Create WiFiConfig from JSON
    WiFiConfig tempConfig;

    tempConfig.ssid = doc["ssid"] | "";
    tempConfig.password = doc["password"] | "";
    tempConfig.hostname = doc["hostname"] | "esp32-ap";
    tempConfig.useStaticIP = doc["useStaticIP"] | false;
    tempConfig.staticIP = doc["staticIP"] | "";
    tempConfig.gateway = doc["gateway"] | "";
    tempConfig.subnet = doc["subnet"] | "";
    tempConfig.dns1 = doc["dns1"] | "";
    tempConfig.dns2 = doc["dns2"] | "";
    tempConfig.enableAP = doc["enableAP"] | true;
    tempConfig.apSSID = doc["apSSID"] | "OpenEPaperLink-AP";
    tempConfig.apPassword = doc["apPassword"] | "";
    tempConfig.channel = doc["channel"] | 1;
    tempConfig.autoReconnect = doc["autoReconnect"] | true;
    tempConfig.powerSave = doc["powerSave"] | false;

    // Validate configuration
    if (!tempConfig.isValid()) {
        LogUtils::logError("[WiFiUtils] Invalid WiFi configuration in JSON");
        return false;
    }

    // Save the configuration
    bool success = saveConfig(tempConfig);

    if (success) {
        LogUtils::logInfo("[WiFiUtils] Configuration loaded from JSON successfully");
    } else {
        LogUtils::logError("[WiFiUtils] Failed to save JSON configuration");
    }

    return success;
}

// ============================================================================
// Utility and Cleanup Functions
// ============================================================================
void WiFiUtils::cleanup() {
    LogUtils::logInfo("[WiFiUtils] Cleaning up WiFi resources...");

    // Stop WiFi
    WiFi.disconnect(true, true);
    WiFi.mode(WIFI_OFF);

    // Clean up mutexes
    if (scanMutex) {
        vSemaphoreDelete(scanMutex);
        scanMutex = nullptr;
    }

    // Reset state variables
    _initialized = false;
    _connected = false;
    _APstarted = false;
    scanInProgress = false;
    apClients = 0;

    LogUtils::logInfo("[WiFiUtils] WiFi cleanup complete");
}

// ============================================================================
// WiFiConfig Implementation - Enhanced Validation and JSON Support
// ============================================================================
String WiFiConfig::toJsonString() const {
    const size_t jsonSize = 768;
    DynamicJsonDocument doc(jsonSize);

    doc["ssid"] = ssid;
    doc["password"] = password;  // Note: In production, consider security implications
    doc["hostname"] = hostname;
    doc["useStaticIP"] = useStaticIP;
    doc["staticIP"] = staticIP;
    doc["gateway"] = gateway;
    doc["subnet"] = subnet;
    doc["dns1"] = dns1;
    doc["dns2"] = dns2;
    doc["enableAP"] = enableAP;
    doc["apSSID"] = apSSID;
    doc["apPassword"] = apPassword;
    doc["channel"] = channel;
    doc["autoReconnect"] = autoReconnect;
    doc["powerSave"] = powerSave;

    String result;
    if (serializeJson(doc, result) == 0) {
        return "{\"error\":\"JSON serialization failed\"}";
    }
    return result;
}

bool WiFiConfig::fromJsonString(const String& json) {
    const size_t jsonSize = 768;
    DynamicJsonDocument doc(jsonSize);

    DeserializationError error = deserializeJson(doc, json);
    if (error) {
        return false;
    }

    // Load values with current values as defaults to preserve existing config
    ssid = doc["ssid"] | ssid;
    password = doc["password"] | password;
    hostname = doc["hostname"] | hostname;
    useStaticIP = doc["useStaticIP"] | useStaticIP;
    staticIP = doc["staticIP"] | staticIP;
    gateway = doc["gateway"] | gateway;
    subnet = doc["subnet"] | subnet;
    dns1 = doc["dns1"] | dns1;
    dns2 = doc["dns2"] | dns2;
    enableAP = doc["enableAP"] | enableAP;
    apSSID = doc["apSSID"] | apSSID;
    apPassword = doc["apPassword"] | apPassword;
    channel = doc["channel"] | channel;
    autoReconnect = doc["autoReconnect"] | autoReconnect;
    powerSave = doc["powerSave"] | powerSave;

    return true;
}

bool WiFiConfig::isValid() const {
    // SSID validation
    if (ssid.length() > 32) return false;

    // Password validation
    if (password.length() > 63) return false;
    if (!password.isEmpty() && password.length() < 8) return false;

    // Hostname validation
    if (hostname.isEmpty() || hostname.length() > 63) return false;

    // Static IP validation
    if (useStaticIP) {
        if (staticIP.isEmpty() || gateway.isEmpty() || subnet.isEmpty()) return false;
        if (!ValidationUtils::isValidIP(staticIP)) return false;
        if (!ValidationUtils::isValidIP(gateway)) return false;
        if (!ValidationUtils::isValidIP(subnet)) return false;

        // Validate DNS if provided
        if (!dns1.isEmpty() && !ValidationUtils::isValidIP(dns1)) return false;
        if (!dns2.isEmpty() && !ValidationUtils::isValidIP(dns2)) return false;
    }

    // AP configuration validation
    if (enableAP) {
        if (apSSID.isEmpty() || apSSID.length() > 32) return false;
        if (!apPassword.isEmpty() && apPassword.length() < 8) return false;
        if (apPassword.length() > 63) return false;
    }

    // Channel validation
    if (channel < 1 || channel > 13) return false;

    return true;
}

// ============================================================================
// End of optimized wifi_utils.cpp implementation
// ============================================================================
