#include "wifi_module.h"

#include <ArduinoJson.h>
#include <Preferences.h>

#include "storage_utils.cpp"  // Include new storage utilities
#include "wifi_utils.h"       // Use centralized WiFi utilities

// WiFi Module Implementation - Unified with WiFiUtils
// ===================================================

bool WiFiModule::initialize() {
    Serial.println("[WIFI_MODULE] Initializing WiFi module...");
    WiFi.mode(WIFI_STA);
    WiFi.setAutoReconnect(true);
    WiFi.persistent(true);
    WiFi.setSleep(WIFI_PS_NONE);
    isInitialized = true;
    lastStatusCheck = millis();
    lastError = "";
    Serial.println("[WIFI_MODULE] WiFi module initialized successfully");
    return true;
}

bool WiFiModule::start() {
    if (!isInitialized) {
        lastError = "Module not initialized";
        return false;
    }
    Serial.println("[WIFI_MODULE] Starting WiFi module...");

    // Use new WiFi storage manager for credentials
    WiFiStorageManager &wifiStorage = WIFI_STORAGE;
    WiFiStorageManager::WiFiConfig config = wifiStorage.loadConfig();

    if (!wifiStorage.hasCredentials()) {
        Serial.println("[WIFI_MODULE] No WiFi credentials configured, starting in AP mode");
        WiFi.softAP("ESP32-AP-Flasher", "password123");
    } else {
        Serial.printf("[WIFI_MODULE] Connecting to WiFi: %s\n", config.ssid.c_str());
        WiFi.begin(config.ssid.c_str(), config.password.c_str());

        // Configure static IP if available
        if (wifiStorage.hasStaticIP()) {
            IPAddress ip, mask, gateway, dns;
            ip.fromString(config.ip);
            mask.fromString(config.mask);
            gateway.fromString(config.gateway);
            if (!config.dns.isEmpty()) {
                dns.fromString(config.dns);
                WiFi.config(ip, gateway, mask, dns);
            } else {
                WiFi.config(ip, gateway, mask);
            }
        }

        int attempts = 0;
        while (WiFi.status() != WL_CONNECTED && attempts < 20) {
            delay(500);
            attempts++;
            Serial.print(".");
        }
        if (WiFi.status() == WL_CONNECTED) {
            // Use centralized WiFi utilities for IP info
            WiFiConnectionInfo connInfo = WiFiUtils::getInstance().getConnectionInfo();
            Serial.printf("\n[WIFI_MODULE] Connected to WiFi. IP: %s\n", connInfo.ip.c_str());
            optimizeWiFiSettings();
        } else {
            Serial.println("\n[WIFI_MODULE] Failed to connect to WiFi, starting AP mode");
            WiFi.softAP("ESP32-AP-Flasher", "password123");
        }
    }
    isStarted = true;
    reconnectAttempts = 0;
    lastError = "";
    return true;
}

bool WiFiModule::stop() {
    Serial.println("[WIFI_MODULE] Stopping WiFi module...");
    WiFi.disconnect(true);
    WiFi.softAPdisconnect(true);
    isStarted = false;
    lastError = "";
    return true;
}

bool WiFiModule::cleanup() {
    Serial.println("[WIFI_MODULE] Cleaning up WiFi module...");
    if (isStarted) stop();
    WiFi.mode(WIFI_OFF);
    isInitialized = false;
    lastError = "";
    return true;
}

ModuleInfo WiFiModule::getInfo() const {
    ModuleInfo info;
    info.name = "WiFiModule";
    info.version = "2.1.0";
    info.description = "Enhanced WiFi Management with Auto-reconnection and Optimization";
    info.type = ModuleType::COMMUNICATION;
    info.initTime = 0;  // Initialize to prevent uninitialized variable warning

    if (!isInitialized) {
        info.state = ModuleState::UNINITIALIZED;
    } else if (!isStarted) {
        info.state = ModuleState::INITIALIZED;
    } else if (lastError.length() > 0) {
        info.state = ModuleState::ERROR;
    } else {
        info.state = ModuleState::ACTIVE;
    }

    info.capabilities.hasWebHandlers = true;
    info.capabilities.hasEventHandlers = true;
    info.capabilities.hasConfigInterface = true;
    info.capabilities.hasStatusInterface = true;
    info.capabilities.requiresHardware = true;
    info.capabilities.isOptional = false;

    info.lastActivity = lastStatusCheck;
    info.errorMessage = lastError;

    return info;
}

bool WiFiModule::isHealthy() const {
    if (!isStarted) {
        return false;
    }

    // Check WiFi connection status
    if (WiFi.status() != WL_CONNECTED && WiFi.softAPgetStationNum() == 0) {
        return false;  // Neither STA nor AP mode has connections
    }

    // Check if we've had recent activity
    if (millis() - lastStatusCheck > 30000) {
        return false;
    }

    return lastError.length() == 0;
}

void WiFiModule::registerWebHandlers(AsyncWebServer &server) {
    Serial.println("[WIFI_MODULE] Registering enhanced WiFi web handlers...");

    // WiFi status endpoint
    server.on("/api/wifi/status", HTTP_GET, [this](AsyncWebServerRequest *request) {
        // Use centralized WiFi utilities for consistent data
        String statusJson = WiFiUtils::getInstance().getConnectionInfoJson();

        // Add module-specific data
        DynamicJsonDocument doc(1024);
        deserializeJson(doc, statusJson);

        doc["reconnectAttempts"] = reconnectAttempts;
        doc["lastScan"] = lastScanTime;
        doc["healthy"] = isHealthy();
        doc["error"] = lastError;
        doc["moduleVersion"] = "2.1.0";

        AsyncResponseStream *response = request->beginResponseStream("application/json");
        serializeJson(doc, *response);
        request->send(response);
    });

    // WiFi scan endpoint
    server.on("/api/wifi/scan", HTTP_GET, [this](AsyncWebServerRequest *request) {
        // Use centralized WiFi scanning
        WiFiUtils &wifiUtils = WiFiUtils::getInstance();
        bool scanStarted = wifiUtils.performAsyncScan(true, 1000);

        DynamicJsonDocument doc(2048);
        if (scanStarted) {
            doc["success"] = true;
            doc["scanning"] = true;
            doc["message"] = "WiFi scan initiated";
        } else {
            doc["success"] = false;
            doc["scanning"] = wifiUtils.isScanning();
            doc["message"] = "Scan already in progress or failed to start";
        }

        AsyncResponseStream *response = request->beginResponseStream("application/json");
        serializeJson(doc, *response);
        request->send(response);
    });

    // WiFi scan results endpoint
    server.on("/api/wifi/scan_results", HTTP_GET, [this](AsyncWebServerRequest *request) {
        WiFiUtils &wifiUtils = WiFiUtils::getInstance();
        String resultsJson = wifiUtils.buildScanResultsJson(false);
        request->send(200, "application/json", resultsJson);
    });

    // WiFi connection endpoint
    server.on("/api/wifi/connect", HTTP_POST, [this](AsyncWebServerRequest *request) {
        if (!request->hasParam("ssid", true)) {
            request->send(400, "application/json", "{\"error\":\"Missing SSID\"}");
            return;
        }

        String ssid = request->getParam("ssid", true)->value();
        String password = request->hasParam("password", true) ? request->getParam("password", true)->value() : "";

        // Use new WiFi storage manager for credentials
        WiFiStorageManager &wifiStorage = WIFI_STORAGE;
        StorageUtils::Result result = wifiStorage.setSSID(ssid);

        if (result == StorageUtils::SUCCESS) {
            wifiStorage.setPassword(password);

            // Attempt connection
            WiFi.begin(ssid.c_str(), password.c_str());

            DynamicJsonDocument doc(512);
            doc["success"] = true;
            doc["message"] = "WiFi connection initiated";
            doc["ssid"] = ssid;

            AsyncResponseStream *response = request->beginResponseStream("application/json");
            serializeJson(doc, *response);
            request->send(response);
        } else {
            request->send(400, "application/json", "{\"error\":\"Invalid SSID format\"}");
        }
    });

    // WiFi disconnect endpoint
    server.on("/api/wifi/disconnect", HTTP_POST, [this](AsyncWebServerRequest *request) {
        WiFi.disconnect();

        DynamicJsonDocument doc(512);
        doc["success"] = true;
        doc["message"] = "WiFi disconnected";

        AsyncResponseStream *response = request->beginResponseStream("application/json");
        serializeJson(doc, *response);
        request->send(response);
    });
}

void WiFiModule::handleEvent(const String &event, const String &data) {
    if (event == "wifi_scan_requested") {
        // Use centralized WiFi scanning
        WiFiUtils::getInstance().performAsyncScan(true, 1000);
    } else if (event == "system_restart") {
        Serial.println("[WIFI_MODULE] Preparing for system restart");
        // Gracefully disconnect
        WiFi.disconnect();
        WiFiUtils::getInstance().cleanup();
    } else if (event == "network_check") {
        checkConnectionStatus();
    }
}

void WiFiModule::update() {
    if (!isStarted) return;
    unsigned long now = millis();
    if (now - lastStatusCheck > 5000) {
        checkConnectionStatus();
    }
    if (WiFi.status() != WL_CONNECTED && reconnectAttempts < 5) {
        if (now - lastStatusCheck > 10000) {
            attemptReconnection();
        }
    }
}

String WiFiModule::getConfig() const {
    // Use new WiFi storage manager for configuration retrieval
    WiFiStorageManager &wifiStorage = WIFI_STORAGE;
    DynamicJsonDocument doc = wifiStorage.toJson();

    // Add module-specific settings
    doc["autoReconnect"] = STORAGE_GET_BOOL("wifi", "autoReconnect", true);
    doc["powerSave"] = STORAGE_GET_BOOL("wifi", "powerSave", false);
    doc["channel"] = STORAGE_GET_INT("wifi", "channel", 0);

    String config;
    serializeJson(doc, config);
    return config;
}

bool WiFiModule::setConfig(const String &config) {
    DynamicJsonDocument doc(512);
    DeserializationError error = deserializeJson(doc, config);

    if (error) {
        lastError = "Invalid JSON configuration";
        return false;
    }

    // Use new storage utilities for configuration
    StorageUtils::Result result = StorageUtils::SUCCESS;

    if (doc.containsKey("autoReconnect")) result = STORAGE_SET_BOOL("wifi", "autoReconnect", doc["autoReconnect"]);
    if (doc.containsKey("powerSave") && result == StorageUtils::SUCCESS) result = STORAGE_SET_BOOL("wifi", "powerSave", doc["powerSave"]);
    if (doc.containsKey("channel") && result == StorageUtils::SUCCESS) result = STORAGE_SET_INT("wifi", "channel", doc["channel"]);

    // Use WiFi storage manager for WiFi-specific config
    WiFiStorageManager &wifiStorage = WIFI_STORAGE;
    if (doc.containsKey("hostname") && result == StorageUtils::SUCCESS) {
        StorageUtils::Result hostResult = wifiStorage.setHostname(doc["hostname"].as<String>());
        if (hostResult != StorageUtils::SUCCESS) result = hostResult;
    }

    if (result != StorageUtils::SUCCESS) {
        lastError = "Failed to save configuration";
        return false;
    }

    // Apply settings if module is running
    if (isStarted) {
        optimizeWiFiSettings();
    }

    return true;
}

String WiFiModule::getStatus() const {
    // Use centralized WiFi connection info as base
    WiFiConnectionInfo info = WiFiUtils::getInstance().getConnectionInfo();

    DynamicJsonDocument doc(1024);

    // Core connection info from WiFiUtils
    doc["status"] = WiFi.status();
    doc["connected"] = info.connected;
    doc["ssid"] = info.ssid;
    doc["ip"] = info.ip;
    doc["gateway"] = info.gateway;
    doc["dns"] = info.dns;
    doc["rssi"] = info.rssi;
    doc["channel"] = info.channel;
    doc["mac"] = info.mac;
    doc["hostname"] = info.hostname;
    doc["mode"] = info.mode;
    doc["apEnabled"] = info.apEnabled;
    doc["apIP"] = info.apIP;
    doc["apClients"] = info.apClients;

    // Module-specific status info
    doc["reconnectAttempts"] = reconnectAttempts;
    doc["lastScan"] = lastScanTime;
    doc["lastStatusCheck"] = lastStatusCheck;
    doc["error"] = lastError;
    doc["moduleState"] = static_cast<int>(getState());
    doc["signalQuality"] = WiFiUtils::calculateSignalQuality(info.rssi);

    String status;
    serializeJson(doc, status);
    return status;
}

void WiFiModule::getMetrics(JsonObject &metrics) const {
    // Use centralized WiFi utilities for consistent metrics
    WiFiConnectionInfo metricsInfo = WiFiUtils::getInstance().getConnectionInfo();

    metrics["wifi_connected"] = metricsInfo.connected ? 1 : 0;
    metrics["wifi_rssi"] = metricsInfo.rssi;
    metrics["wifi_channel"] = metricsInfo.channel;
    metrics["wifi_ap_clients"] = metricsInfo.apClients;
    metrics["wifi_reconnect_attempts"] = reconnectAttempts;
}

// Private methods - Now using centralized utilities where possible
void WiFiModule::performWiFiScan() {
    Serial.println("[WIFI_MODULE] Starting WiFi scan using centralized utilities...");
    WiFiUtils &wifiUtils = WiFiUtils::getInstance();
    bool scanStarted = wifiUtils.performAsyncScan(true, 1000);

    if (scanStarted) {
        lastScanTime = millis();
        Serial.println("[WIFI_MODULE] WiFi scan started successfully");
    } else {
        Serial.println("[WIFI_MODULE] WiFi scan failed to start or already in progress");
    }
}

void WiFiModule::checkConnectionStatus() {
    lastStatusCheck = millis();
    wl_status_t status = WiFi.status();
    if (status != WL_CONNECTED) {
        if (lastError.isEmpty()) {
            lastError = "WiFi connection lost";
            Serial.println("[WIFI_MODULE] WiFi connection lost");
        }
    } else {
        if (lastError == "WiFi connection lost") {
            lastError = "";
            Serial.println("[WIFI_MODULE] WiFi connection restored");
            reconnectAttempts = 0;
        }
    }
}

void WiFiModule::handleDisconnection() {
    Serial.println("[WIFI_MODULE] Handling WiFi disconnection");
    lastError = "WiFi disconnected";

    // Broadcast disconnect event
    ModuleManager::getInstance().broadcastEvent("wifi_disconnected", "");
}

bool WiFiModule::attemptReconnection() {
    Serial.printf("[WIFI_MODULE] Attempting WiFi reconnection (attempt %d)\n", reconnectAttempts + 1);
    WiFi.reconnect();
    reconnectAttempts++;
    lastStatusCheck = millis();
    return WiFi.status() == WL_CONNECTED;
}

void WiFiModule::optimizeWiFiSettings() {
    Serial.println("[WIFI_MODULE] Optimizing WiFi settings...");
    bool powerSave = STORAGE_GET_BOOL("wifi", "powerSave", false);

    WiFiStorageManager &wifiStorage = WIFI_STORAGE;
    String hostname = wifiStorage.getHostname();
    if (hostname.isEmpty()) hostname = "esp32-ap-flasher";

    WiFi.setSleep(powerSave ? WIFI_PS_MIN_MODEM : WIFI_PS_NONE);
    WiFi.setHostname(hostname.c_str());
    Serial.println("[WIFI_MODULE] WiFi optimization complete");
}

// Required interface methods
ModuleType WiFiModule::getType() const {
    return ModuleType::COMMUNICATION;
}

ModuleState WiFiModule::getState() const {
    if (!isInitialized) return ModuleState::MODULE_DISABLED;
    if (!isStarted) return ModuleState::INITIALIZED;
    if (!isHealthy()) return ModuleState::ERROR;
    return ModuleState::ACTIVE;
}

// Module registration function
void registerWiFiModule() {
    Serial.println("[WIFI_MODULE] Registering WiFi module with module manager...");
    auto wifiModule = std::make_unique<WiFiModule>();
    bool registered = ModuleManager::getInstance().registerModule(
        std::move(wifiModule), true, {});
    if (registered) {
        Serial.println("[WIFI_MODULE] WiFi module registered successfully");
    } else {
        Serial.println("[WIFI_MODULE] Failed to register WiFi module");
    }
}
