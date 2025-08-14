/**
 * @file wifi_unified_module.cpp
 * @brief Implementation of Unified WiFi Module
 *
 * This replaces and consolidates:
 * - wifi_utils.cpp functionality
 * - wifi_advanced.cpp (if it existed)
 * - WiFi-related configuration management
 */

#include "wifi_unified_module.h"

#include <esp_wifi.h>

#include "centralized_config.h"

// ============================================================================
// Static Initialization
// ============================================================================

UnifiedWiFiModule* UnifiedWiFiModule::_instance = nullptr;
WiFiUnifiedManager* WiFiUnifiedManager::instance = nullptr;

// Global instances
WiFiUnifiedManager& wifiUnified = WiFiUnifiedManager::getInstance();
WiFiLegacyAdapter WiFiCompat;

// ============================================================================
// UnifiedWiFiConfig Implementation
// ============================================================================

String UnifiedWiFiConfig::toJson() const {
    DynamicJsonDocument doc(Framework::JSON_LARGE_BUFFER);

    // Station configuration
    JsonObject station = doc.createNestedObject("station");
    station["ssid"] = ssid;
    station["password"] = password;
    station["hostname"] = hostname;
    station["useStaticIP"] = useStaticIP;
    station["staticIP"] = staticIP;
    station["gateway"] = gateway;
    station["subnet"] = subnet;
    station["dns1"] = dns1;
    station["dns2"] = dns2;

    // Access Point configuration
    JsonObject ap = doc.createNestedObject("accessPoint");
    ap["enabled"] = enableAP;
    ap["ssid"] = apSSID;
    ap["password"] = apPassword;
    ap["channel"] = channel;
    ap["hidden"] = apHidden;
    ap["maxConnections"] = maxConnections;

    // Advanced settings
    JsonObject advanced = doc.createNestedObject("advanced");
    advanced["autoReconnect"] = autoReconnect;
    advanced["powerSave"] = powerSave;
    advanced["connectionTimeout"] = connectionTimeout;
    advanced["reconnectInterval"] = reconnectInterval;
    advanced["txPower"] = txPower;
    advanced["enableImprov"] = enableImprov;

    // Monitoring
    JsonObject monitoring = doc.createNestedObject("monitoring");
    monitoring["enabled"] = enableMonitoring;
    monitoring["scanInterval"] = scanInterval;
    monitoring["channelAnalysis"] = enableChannelAnalysis;

    String result;
    serializeJson(doc, result);
    return result;
}

bool UnifiedWiFiConfig::fromJson(const String& json) {
    DynamicJsonDocument doc(Framework::JSON_LARGE_BUFFER);
    if (deserializeJson(doc, json) != DeserializationError::Ok) {
        return false;
    }

    // Station configuration
    if (doc.containsKey("station")) {
        JsonObject station = doc["station"];
        ssid = station["ssid"].as<String>();
        password = station["password"].as<String>();
        hostname = station["hostname"] | hostname;
        useStaticIP = station["useStaticIP"] | useStaticIP;
        staticIP = station["staticIP"] | staticIP;
        gateway = station["gateway"] | gateway;
        subnet = station["subnet"] | subnet;
        dns1 = station["dns1"] | dns1;
        dns2 = station["dns2"] | dns2;
    }

    // Access Point configuration
    if (doc.containsKey("accessPoint")) {
        JsonObject ap = doc["accessPoint"];
        enableAP = ap["enabled"] | enableAP;
        apSSID = ap["ssid"] | apSSID;
        apPassword = ap["password"] | apPassword;
        channel = ap["channel"] | channel;
        apHidden = ap["hidden"] | apHidden;
        maxConnections = ap["maxConnections"] | maxConnections;
    }

    // Advanced settings
    if (doc.containsKey("advanced")) {
        JsonObject advanced = doc["advanced"];
        autoReconnect = advanced["autoReconnect"] | autoReconnect;
        powerSave = advanced["powerSave"] | powerSave;
        connectionTimeout = advanced["connectionTimeout"] | connectionTimeout;
        reconnectInterval = advanced["reconnectInterval"] | reconnectInterval;
        txPower = advanced["txPower"] | txPower;
        enableImprov = advanced["enableImprov"] | enableImprov;
    }

    // Monitoring
    if (doc.containsKey("monitoring")) {
        JsonObject monitoring = doc["monitoring"];
        enableMonitoring = monitoring["enabled"] | enableMonitoring;
        scanInterval = monitoring["scanInterval"] | scanInterval;
        enableChannelAnalysis = monitoring["channelAnalysis"] | enableChannelAnalysis;
    }

    return validate();
}

bool UnifiedWiFiConfig::validate() const {
    // Validate SSID
    if (!ssid.isEmpty() && !ValidationUtils::isValidSSID(ssid)) {
        return false;
    }

    // Validate AP SSID
    if (enableAP && !ValidationUtils::isValidSSID(apSSID)) {
        return false;
    }

    // Validate passwords
    if (!password.isEmpty() && !ValidationUtils::isValidPassword(password)) {
        return false;
    }

    if (enableAP && !apPassword.isEmpty() && !ValidationUtils::isValidPassword(apPassword)) {
        return false;
    }

    // Validate static IP configuration
    if (useStaticIP) {
        if (!ValidationUtils::isValidIP(staticIP) ||
            !ValidationUtils::isValidIP(gateway) ||
            !ValidationUtils::isValidIP(subnet)) {
            return false;
        }
    }

    // Validate hostname
    if (!ValidationUtils::isValidHostname(hostname)) {
        return false;
    }

    // Validate channel
    if (channel < 1 || channel > 13) {
        return false;
    }

    // Validate connection limits
    if (maxConnections > 8 || maxConnections < 1) {
        return false;
    }

    return true;
}

void UnifiedWiFiConfig::setDefaults() {
    ssid = "";
    password = "";
    hostname = "esp32-ap";
    useStaticIP = false;
    staticIP = "";
    gateway = "";
    subnet = "";
    dns1 = "";
    dns2 = "";

    enableAP = true;
    apSSID = "OpenEPaperLink-AP";
    apPassword = "";
    channel = 1;
    apHidden = false;
    maxConnections = 4;

    autoReconnect = true;
    powerSave = false;
    connectionTimeout = 10000;
    reconnectInterval = 30000;
    txPower = 20;
    enableImprov = true;

    enableMonitoring = true;
    scanInterval = 30000;
    enableChannelAnalysis = false;
}

// ============================================================================
// Network Info Implementations
// ============================================================================

String NetworkInfo::toJson() const {
    DynamicJsonDocument doc(Framework::JSON_SMALL_BUFFER);
    doc["ssid"] = ssid;
    doc["rssi"] = rssi;
    doc["authMode"] = static_cast<int>(authMode);
    doc["authModeString"] = authModeString;
    doc["channel"] = channel;
    doc["bssid"] = bssid;
    doc["hidden"] = isHidden;
    doc["secure"] = isSecure;
    doc["signalQuality"] = signalQuality;
    doc["signalStrength"] = signalStrength;
    doc["lastSeen"] = lastSeen;

    String result;
    serializeJson(doc, result);
    return result;
}

String ConnectionInfo::toJson() const {
    DynamicJsonDocument doc(Framework::JSON_SMALL_BUFFER);
    doc["connected"] = isConnected;
    doc["ssid"] = ssid;
    doc["localIP"] = localIP;
    doc["gatewayIP"] = gatewayIP;
    doc["subnetMask"] = subnetMask;
    doc["dnsIP"] = dnsIP;
    doc["rssi"] = rssi;
    doc["channel"] = channel;
    doc["mac"] = mac;
    doc["connectionTime"] = connectionTime;
    doc["status"] = status;

    String result;
    serializeJson(doc, result);
    return result;
}

String APInfo::toJson() const {
    DynamicJsonDocument doc(Framework::JSON_SMALL_BUFFER);
    doc["enabled"] = isEnabled;
    doc["ssid"] = ssid;
    doc["ip"] = ip;
    doc["channel"] = channel;
    doc["clientCount"] = clientCount;

    JsonArray clients = doc.createNestedArray("clients");
    for (const auto& client : connectedClients) {
        clients.add(client);
    }

    String result;
    serializeJson(doc, result);
    return result;
}

// ============================================================================
// UnifiedWiFiModule Implementation
// ============================================================================

UnifiedWiFiModule::UnifiedWiFiModule()
    : EnhancedModuleBase("WiFiUnified", "1.0.0", "Unified WiFi Management Module", ModuleType::COMMUNICATION),
      CommunicationBase(Framework::DEFAULT_TIMEOUT_MS),
      _stationConnected(false),
      _apEnabled(false),
      _lastConnectionAttempt(0),
      _connectionAttempts(0),
      _lastScan(0),
      _monitorTask(nullptr),
      _scanInProgress(false) {
    _instance = this;

    // Set module capabilities
    _capabilities.supportsConfiguration = true;
    _capabilities.supportsRemoteControl = true;
    _capabilities.supportsStatusReporting = true;
    _capabilities.supportsMetrics = true;
    _capabilities.requiresNetwork = false;    // This module provides network
    _capabilities.requiresFileSystem = true;  // For configuration storage

    // Initialize configuration with defaults
    _config.setDefaults();
}

UnifiedWiFiModule::~UnifiedWiFiModule() {
    cleanup();
    _instance = nullptr;
}

bool UnifiedWiFiModule::doInitialize() {
    logInfo("Initializing unified WiFi module");

    // Load configuration
    if (!loadConfiguration()) {
        logWarning("Failed to load WiFi configuration, using defaults");
        _config.setDefaults();
    }

    // Initialize WiFi
    WiFi.mode(WIFI_OFF);
    delay(100);

    // Set hostname
    if (!_config.hostname.isEmpty()) {
        WiFi.setHostname(_config.hostname.c_str());
    }

    // Register event handlers
    WiFi.onEvent(onWiFiEvent);

    // Initialize WiFiMulti for better connection management
    _wifiMulti.addAP(_config.ssid.c_str(), _config.password.c_str());

    logInfo("WiFi module initialized successfully");
    return true;
}

bool UnifiedWiFiModule::doStart() {
    logInfo("Starting unified WiFi module");

    // Start monitoring task
    if (_config.enableMonitoring) {
        startMonitorTask();
    }

    // Start AP if enabled
    if (_config.enableAP) {
        startAccessPoint();
    }

    // Connect to station if configured
    if (!_config.ssid.isEmpty()) {
        connectToSavedNetwork();
    }

    logInfo("WiFi module started successfully");
    return true;
}

bool UnifiedWiFiModule::doStop() {
    logInfo("Stopping unified WiFi module");

    // Stop monitoring
    stopMonitorTask();

    // Disconnect and stop services
    disconnectStation();
    stopAccessPoint();

    logInfo("WiFi module stopped");
    return true;
}

void UnifiedWiFiModule::doUpdate() {
    updateConnectionState();
    updateAPState();

    // Periodic network scan
    if (_config.enableMonitoring &&
        (millis() - _lastScan) > _config.scanInterval &&
        !_scanInProgress) {
        performNetworkScan();
    }

    // Auto-reconnect logic
    if (_config.autoReconnect && !_stationConnected &&
        !_config.ssid.isEmpty() &&
        (millis() - _lastConnectionAttempt) > _config.reconnectInterval) {
        connectToSavedNetwork();
    }
}

void UnifiedWiFiModule::doHandleEvent(const String& event, const String& data) {
    if (event == "wifi.connect") {
        // Handle external connection requests
        DynamicJsonDocument doc(Framework::JSON_SMALL_BUFFER);
        if (deserializeJson(doc, data) == DeserializationError::Ok) {
            String ssid = doc["ssid"];
            String password = doc["password"];
            connectToNetwork(ssid, password);
        }
    } else if (event == "wifi.disconnect") {
        disconnectStation();
    } else if (event == "wifi.scan") {
        performNetworkScan();
    } else if (event == "config.changed") {
        loadConfiguration();
    }
}

// ============================================================================
// WiFi Management API Implementation
// ============================================================================

bool UnifiedWiFiModule::connectToNetwork(const String& ssid, const String& password, uint32_t timeout) {
    if (ssid.isEmpty()) {
        setError("SSID cannot be empty");
        return false;
    }

    logInfo("Connecting to network: " + ssid);

    _lastConnectionAttempt = millis();
    _connectionAttempts++;
    _stats.connectionAttempts++;

    // Stop any existing connection
    WiFi.disconnect();
    delay(100);

    // Set mode to station
    WiFi.mode(WIFI_STA);

    // Apply static IP if configured
    if (_config.useStaticIP && !_config.staticIP.isEmpty()) {
        IPAddress localIP, gateway, subnet, dns1, dns2;
        localIP.fromString(_config.staticIP);
        gateway.fromString(_config.gateway);
        subnet.fromString(_config.subnet);

        if (!_config.dns1.isEmpty()) dns1.fromString(_config.dns1);
        if (!_config.dns2.isEmpty()) dns2.fromString(_config.dns2);

        if (!WiFi.config(localIP, gateway, subnet, dns1, dns2)) {
            setError("Failed to configure static IP");
            return false;
        }
    }

    // Start connection
    WiFi.begin(ssid.c_str(), password.c_str());

    // Wait for connection
    uint32_t startTime = millis();
    uint32_t connectionTimeout = timeout > 0 ? timeout : _config.connectionTimeout;

    while (WiFi.status() != WL_CONNECTED &&
           (millis() - startTime) < connectionTimeout) {
        delay(500);
        updateActivity();
    }

    if (WiFi.status() == WL_CONNECTED) {
        handleConnectionSuccess();

        // Update configuration if this was a new network
        if (_config.ssid != ssid) {
            _config.ssid = ssid;
            _config.password = password;
            saveConfiguration();
        }

        logInfo("Successfully connected to: " + ssid);
        PUBLISH_MODULE_EVENT(_name, "connected", ssid);
        return true;
    } else {
        handleConnectionFailed();
        setError("Connection timeout to: " + ssid);
        PUBLISH_MODULE_EVENT(_name, "connection_failed", ssid);
        return false;
    }
}

bool UnifiedWiFiModule::connectToSavedNetwork() {
    if (_config.ssid.isEmpty()) {
        return false;
    }

    return connectToNetwork(_config.ssid, _config.password);
}

bool UnifiedWiFiModule::startAccessPoint(const String& ssid, const String& password, uint8_t channel) {
    String apSSID = ssid.isEmpty() ? _config.apSSID : ssid;
    String apPassword = password.isEmpty() ? _config.apPassword : password;
    uint8_t apChannel = (channel == 0) ? _config.channel : channel;

    logInfo("Starting access point: " + apSSID);

    // Set AP mode
    WiFi.mode(_stationConnected ? WIFI_AP_STA : WIFI_AP);

    // Configure and start AP
    bool success;
    if (apPassword.isEmpty()) {
        success = WiFi.softAP(apSSID.c_str(), nullptr, apChannel, _config.apHidden, _config.maxConnections);
    } else {
        success = WiFi.softAP(apSSID.c_str(), apPassword.c_str(), apChannel, _config.apHidden, _config.maxConnections);
    }

    if (success) {
        _apEnabled = true;
        logInfo("Access point started successfully");
        logInfo("AP IP: " + WiFi.softAPIP().toString());
        PUBLISH_MODULE_EVENT(_name, "ap_started", apSSID);
        return true;
    } else {
        setError("Failed to start access point");
        PUBLISH_MODULE_EVENT(_name, "ap_failed", apSSID);
        return false;
    }
}

bool UnifiedWiFiModule::stopAccessPoint() {
    if (!_apEnabled) {
        return true;
    }

    logInfo("Stopping access point");

    WiFi.softAPdisconnect(true);
    _apEnabled = false;

    // Set mode to station if connected, otherwise turn off
    WiFi.mode(_stationConnected ? WIFI_STA : WIFI_OFF);

    logInfo("Access point stopped");
    PUBLISH_MODULE_EVENT(_name, "ap_stopped", "");
    return true;
}

void UnifiedWiFiModule::disconnect() {
    disconnectStation();
}

bool UnifiedWiFiModule::disconnectStation() {
    if (!_stationConnected) {
        return true;
    }

    logInfo("Disconnecting from WiFi network");

    WiFi.disconnect();
    _stationConnected = false;
    _stats.disconnections++;

    // Set mode to AP if enabled, otherwise turn off
    WiFi.mode(_apEnabled ? WIFI_AP : WIFI_OFF);

    logInfo("Disconnected from WiFi network");
    PUBLISH_MODULE_EVENT(_name, "disconnected", "");
    return true;
}

// ============================================================================
// Network Information Methods
// ============================================================================

ConnectionInfo UnifiedWiFiModule::getConnectionInfo() const {
    ConnectionInfo info;

    info.isConnected = _stationConnected;
    if (_stationConnected) {
        info.ssid = WiFi.SSID();
        info.localIP = WiFi.localIP().toString();
        info.gatewayIP = WiFi.gatewayIP().toString();
        info.subnetMask = WiFi.subnetMask().toString();
        info.dnsIP = WiFi.dnsIP().toString();
        info.rssi = WiFi.RSSI();
        info.channel = WiFi.channel();
        info.mac = WiFi.macAddress();
        info.connectionTime = millis() - _stats.connectionUptime;
        info.status = getWiFiStatusString(WiFi.status());
    } else {
        info.status = "Disconnected";
    }

    return info;
}

APInfo UnifiedWiFiModule::getAPInfo() const {
    APInfo info;

    info.isEnabled = _apEnabled;
    if (_apEnabled) {
        info.ssid = WiFi.softAPSSID();
        info.ip = WiFi.softAPIP().toString();
        info.channel = _config.channel;
        info.clientCount = WiFi.softAPgetStationNum();

        // Get connected clients (implementation depends on ESP32 capabilities)
        wifi_sta_list_t stationList;
        esp_wifi_ap_get_sta_list(&stationList);

        for (int i = 0; i < stationList.num; i++) {
            char macStr[18];
            snprintf(macStr, sizeof(macStr), "%02X:%02X:%02X:%02X:%02X:%02X",
                     stationList.sta[i].mac[0], stationList.sta[i].mac[1],
                     stationList.sta[i].mac[2], stationList.sta[i].mac[3],
                     stationList.sta[i].mac[4], stationList.sta[i].mac[5]);
            info.connectedClients.push_back(String(macStr));
        }
    }

    return info;
}

std::vector<NetworkInfo> UnifiedWiFiModule::scanNetworks(bool force) {
    if (force || _availableNetworks.empty()) {
        performNetworkScan();
    }
    return _availableNetworks;
}

String UnifiedWiFiModule::getStatsJson() const {
    DynamicJsonDocument doc(Framework::JSON_MEDIUM_BUFFER);

    doc["connectionAttempts"] = _stats.connectionAttempts;
    doc["successfulConnections"] = _stats.successfulConnections;
    doc["disconnections"] = _stats.disconnections;
    doc["apClientConnections"] = _stats.apClientConnections;
    doc["scanCount"] = _stats.scanCount;
    doc["totalUptime"] = _stats.totalUptime;
    doc["connectionUptime"] = _stats.connectionUptime;
    doc["dataTransferred"] = _stats.dataTransferred;

    // Calculate success rate
    float successRate = _stats.connectionAttempts > 0 ? (float)_stats.successfulConnections / _stats.connectionAttempts * 100.0 : 0.0;
    doc["successRate"] = successRate;

    String result;
    serializeJson(doc, result);
    return result;
}

// ============================================================================
// Configuration Management
// ============================================================================

bool UnifiedWiFiModule::setConfiguration(const UnifiedWiFiConfig& config) {
    if (!config.validate()) {
        setError("Invalid configuration");
        return false;
    }

    _config = config;
    return saveConfiguration();
}

bool UnifiedWiFiModule::saveConfiguration() {
    String configJson = _config.toJson();
    return setConfigValue("config", configJson);
}

bool UnifiedWiFiModule::loadConfiguration() {
    String configJson = getConfigValue("config", "");
    if (configJson.isEmpty()) {
        _config.setDefaults();
        return saveConfiguration();
    }

    if (_config.fromJson(configJson)) {
        return true;
    } else {
        logError("Failed to parse configuration, using defaults");
        _config.setDefaults();
        return saveConfiguration();
    }
}

// ============================================================================
// Event Handlers
// ============================================================================

void UnifiedWiFiModule::onWiFiEvent(WiFiEvent_t event, WiFiEventInfo_t info) {
    if (!_instance) return;

    switch (event) {
        case ARDUINO_EVENT_WIFI_STA_CONNECTED:
            _instance->logInfo("WiFi connected to: " + String((char*)info.wifi_sta_connected.ssid));
            break;

        case ARDUINO_EVENT_WIFI_STA_GOT_IP:
            _instance->handleConnectionSuccess();
            break;

        case ARDUINO_EVENT_WIFI_STA_DISCONNECTED:
            _instance->handleDisconnection();
            break;

        case ARDUINO_EVENT_WIFI_AP_STACONNECTED:
            _instance->handleAPClientConnected(info.wifi_ap_staconnected);
            break;

        case ARDUINO_EVENT_WIFI_AP_STADISCONNECTED:
            _instance->handleAPClientDisconnected(info.wifi_ap_stadisconnected);
            break;

        default:
            break;
    }
}

void UnifiedWiFiModule::handleConnectionSuccess() {
    _stationConnected = true;
    _stats.successfulConnections++;
    _stats.connectionUptime = millis();
    clearError();
    updateActivity();
}

void UnifiedWiFiModule::handleConnectionFailed() {
    _stationConnected = false;
    incrementErrorCount();
}

void UnifiedWiFiModule::handleDisconnection() {
    _stationConnected = false;
    _stats.disconnections++;
    logWarning("WiFi disconnected");
}

void UnifiedWiFiModule::handleAPClientConnected(const WiFiEventSoftAPModeStationConnected& event) {
    _stats.apClientConnections++;
    String mac = formatMacAddress(event.mac);
    logInfo("AP client connected: " + mac);
    PUBLISH_MODULE_EVENT(_name, "ap_client_connected", mac);
}

void UnifiedWiFiModule::handleAPClientDisconnected(const WiFiEventSoftAPModeStationDisconnected& event) {
    String mac = formatMacAddress(event.mac);
    logInfo("AP client disconnected: " + mac);
    PUBLISH_MODULE_EVENT(_name, "ap_client_disconnected", mac);
}

// ============================================================================
// Static Utility Methods
// ============================================================================

String UnifiedWiFiModule::authModeToString(wifi_auth_mode_t authMode) {
    switch (authMode) {
        case WIFI_AUTH_OPEN:
            return "Open";
        case WIFI_AUTH_WEP:
            return "WEP";
        case WIFI_AUTH_WPA_PSK:
            return "WPA";
        case WIFI_AUTH_WPA2_PSK:
            return "WPA2";
        case WIFI_AUTH_WPA_WPA2_PSK:
            return "WPA/WPA2";
        case WIFI_AUTH_WPA2_ENTERPRISE:
            return "WPA2 Enterprise";
        case WIFI_AUTH_WPA3_PSK:
            return "WPA3";
        case WIFI_AUTH_WPA2_WPA3_PSK:
            return "WPA2/WPA3";
        default:
            return "Unknown";
    }
}

int UnifiedWiFiModule::calculateSignalQuality(int8_t rssi) {
    if (rssi <= -100) return 0;
    if (rssi >= -50) return 100;
    return 2 * (rssi + 100);
}

String UnifiedWiFiModule::formatMacAddress(const uint8_t* mac) {
    char macStr[18];
    snprintf(macStr, sizeof(macStr), "%02X:%02X:%02X:%02X:%02X:%02X",
             mac[0], mac[1], mac[2], mac[3], mac[4], mac[5]);
    return String(macStr);
}

String UnifiedWiFiModule::getWiFiStatusString(wl_status_t status) {
    switch (status) {
        case WL_IDLE_STATUS:
            return "Idle";
        case WL_NO_SSID_AVAIL:
            return "No SSID Available";
        case WL_SCAN_COMPLETED:
            return "Scan Completed";
        case WL_CONNECTED:
            return "Connected";
        case WL_CONNECT_FAILED:
            return "Connection Failed";
        case WL_CONNECTION_LOST:
            return "Connection Lost";
        case WL_DISCONNECTED:
            return "Disconnected";
        default:
            return "Unknown";
    }
}

// ============================================================================
// WiFiUnifiedManager Implementation
// ============================================================================

WiFiUnifiedManager& WiFiUnifiedManager::getInstance() {
    if (!instance) {
        instance = new WiFiUnifiedManager();
    }
    return *instance;
}

bool WiFiUnifiedManager::initialize() {
    if (!_module) {
        _module = new UnifiedWiFiModule();

        // Register with module manager
        ModuleManager::getInstance().registerModule(
            std::unique_ptr<ModuleInterface>(_module), true, {});
    }

    return _module->initialize();
}

void WiFiUnifiedManager::cleanup() {
    if (_module) {
        _module->cleanup();
        _module = nullptr;
    }
}

bool WiFiUnifiedManager::isConnected() const {
    return _module ? _module->isConnected() : false;
}

String WiFiUnifiedManager::getSSID() const {
    if (_module && _module->isConnected()) {
        return _module->getConnectionInfo().ssid;
    }
    return "";
}

String WiFiUnifiedManager::getIP() const {
    if (_module && _module->isConnected()) {
        return _module->getConnectionInfo().localIP;
    }
    return "";
}

int8_t WiFiUnifiedManager::getRSSI() const {
    if (_module && _module->isConnected()) {
        return _module->getConnectionInfo().rssi;
    }
    return 0;
}

bool WiFiUnifiedManager::quickConnect(const String& ssid, const String& password) {
    return _module ? _module->connectToNetwork(ssid, password) : false;
}

bool WiFiUnifiedManager::quickAP(const String& ssid, const String& password) {
    return _module ? _module->startAccessPoint(ssid, password) : false;
}

// ============================================================================
// Legacy Compatibility Layer
// ============================================================================

bool WiFiLegacyAdapter::begin() {
    return wifiUnified.initialize();
}

bool WiFiLegacyAdapter::connect(const String& ssid, const String& password) {
    return wifiUnified.quickConnect(ssid, password);
}

bool WiFiLegacyAdapter::startAP(const String& ssid, const String& password) {
    return wifiUnified.quickAP(ssid, password);
}

bool WiFiLegacyAdapter::isConnected() {
    return wifiUnified.isConnected();
}

String WiFiLegacyAdapter::getIP() {
    return wifiUnified.getIP();
}

String WiFiLegacyAdapter::getSSID() {
    return wifiUnified.getSSID();
}

int WiFiLegacyAdapter::getRSSI() {
    return wifiUnified.getRSSI();
}

void WiFiLegacyAdapter::disconnect() {
    if (auto* module = wifiUnified.getModule()) {
        module->disconnect();
    }
}

String WiFiLegacyAdapter::getConfig() {
    if (auto* module = wifiUnified.getModule()) {
        return module->getConfiguration().toJson();
    }
    return "{}";
}

bool WiFiLegacyAdapter::setConfig(const String& json) {
    if (auto* module = wifiUnified.getModule()) {
        UnifiedWiFiConfig config;
        if (config.fromJson(json)) {
            return module->setConfiguration(config);
        }
    }
    return false;
}

void WiFiLegacyAdapter::WiFiEvent(WiFiEvent_t event) {
    // Event handling is now managed by the unified module
    // This is kept for compatibility but doesn't need implementation
}
