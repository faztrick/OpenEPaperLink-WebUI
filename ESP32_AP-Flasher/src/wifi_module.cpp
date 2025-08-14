#include "wifi_module.h"

#include <ArduinoJson.h>
#include <Preferences.h>

#include "JsonDocumentz.h"

// WiFi Module Implementation
// ==========================

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
    Preferences prefs;
    prefs.begin("wifi", true);
    String ssid = prefs.getString("ssid", "");
    String password = prefs.getString("password", "");
    prefs.end();

    if (ssid.isEmpty()) {
        Serial.println("[WIFI_MODULE] No WiFi credentials configured, starting in AP mode");
        WiFi.softAP("ESP32-AP-Flasher", "password123");
    } else {
        Serial.printf("[WIFI_MODULE] Connecting to WiFi: %s\n", ssid.c_str());
        WiFi.begin(ssid.c_str(), password.c_str());
        int attempts = 0;
        while (WiFi.status() != WL_CONNECTED && attempts < 20) {
            delay(500);
            attempts++;
            Serial.print(".");
        }
        if (WiFi.status() == WL_CONNECTED) {
            Serial.printf("\n[WIFI_MODULE] Connected to WiFi. IP: %s\n", WiFi.localIP().toString().c_str());
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
        JsonDocumentz doc;

        doc["connected"] = (WiFi.status() == WL_CONNECTED);
        doc["ssid"] = WiFi.SSID();
        doc["ip"] = WiFi.localIP().toString();
        doc["rssi"] = WiFi.RSSI();
        doc["channel"] = WiFi.channel();
        doc["mac"] = WiFi.macAddress();
        doc["apMode"] = (WiFi.getMode() == WIFI_AP || WiFi.getMode() == WIFI_AP_STA);
        doc["apClients"] = WiFi.softAPgetStationNum();
        doc["reconnectAttempts"] = reconnectAttempts;
        doc["lastScan"] = lastScanTime;
        doc["healthy"] = isHealthy();
        doc["error"] = lastError;

        AsyncResponseStream *response = request->beginResponseStream("application/json");
        serializeJson(doc, *response);
        request->send(response);
    });

    // WiFi scan endpoint
    server.on("/api/wifi/scan", HTTP_GET, [this](AsyncWebServerRequest *request) {
        performWiFiScan();

        JsonDocumentz doc;
        doc["success"] = true;
        doc["scanning"] = true;
        doc["message"] = "WiFi scan initiated";

        AsyncResponseStream *response = request->beginResponseStream("application/json");
        serializeJson(doc, *response);
        request->send(response);
    });

    // WiFi connection endpoint
    server.on("/api/wifi/connect", HTTP_POST, [this](AsyncWebServerRequest *request) {
        if (!request->hasParam("ssid", true)) {
            request->send(400, "application/json", "{\"error\":\"Missing SSID\"}");
            return;
        }

        String ssid = request->getParam("ssid", true)->value();
        String password = request->hasParam("password", true) ? request->getParam("password", true)->value() : "";

        // Save credentials
        Preferences prefs;
        prefs.begin("wifi", false);
        prefs.putString("ssid", ssid);
        prefs.putString("password", password);
        prefs.end();

        // Attempt connection
        WiFi.begin(ssid.c_str(), password.c_str());

        JsonDocumentz doc;
        doc["success"] = true;
        doc["message"] = "WiFi connection initiated";
        doc["ssid"] = ssid;

        AsyncResponseStream *response = request->beginResponseStream("application/json");
        serializeJson(doc, *response);
        request->send(response);
    });

    // WiFi disconnect endpoint
    server.on("/api/wifi/disconnect", HTTP_POST, [this](AsyncWebServerRequest *request) {
        WiFi.disconnect();

        JsonDocumentz doc;
        doc["success"] = true;
        doc["message"] = "WiFi disconnected";

        AsyncResponseStream *response = request->beginResponseStream("application/json");
        serializeJson(doc, *response);
        request->send(response);
    });
}

void WiFiModule::handleEvent(const String &event, const String &data) {
    if (event == "wifi_scan_requested") {
        performWiFiScan();
    } else if (event == "system_restart") {
        Serial.println("[WIFI_MODULE] Preparing for system restart");
        // Gracefully disconnect
        WiFi.disconnect();
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
    JsonDocumentz doc;

    Preferences prefs;
    prefs.begin("wifi", true);

    doc["ssid"] = prefs.getString("ssid", "");
    doc["autoReconnect"] = prefs.getBool("autoReconnect", true);
    doc["powerSave"] = prefs.getBool("powerSave", false);
    doc["channel"] = prefs.getInt("channel", 0);
    doc["hostname"] = prefs.getString("hostname", "esp32-ap-flasher");

    prefs.end();

    String config;
    serializeJson(doc, config);
    return config;
}

bool WiFiModule::setConfig(const String &config) {
    JsonDocumentz doc;
    DeserializationError error = deserializeJson(doc, config);

    if (error) {
        lastError = "Invalid JSON configuration";
        return false;
    }

    Preferences prefs;
    prefs.begin("wifi", false);

    if (doc["autoReconnect"].is<bool>()) prefs.putBool("autoReconnect", doc["autoReconnect"]);
    if (doc["powerSave"].is<bool>()) prefs.putBool("powerSave", doc["powerSave"]);
    if (doc["channel"].is<int>()) prefs.putInt("channel", doc["channel"]);
    if (doc["hostname"].is<const char *>()) prefs.putString("hostname", doc["hostname"].as<String>());

    prefs.end();

    // Apply settings if module is running
    if (isStarted) {
        optimizeWiFiSettings();
    }

    return true;
}

String WiFiModule::getStatus() const {
    JsonDocumentz doc;

    doc["status"] = WiFi.status();
    doc["connected"] = (WiFi.status() == WL_CONNECTED);
    doc["ssid"] = WiFi.SSID();
    doc["ip"] = WiFi.localIP().toString();
    doc["gateway"] = WiFi.gatewayIP().toString();
    doc["dns"] = WiFi.dnsIP().toString();
    doc["rssi"] = WiFi.RSSI();
    doc["channel"] = WiFi.channel();
    doc["mac"] = WiFi.macAddress();
    doc["apMode"] = (WiFi.getMode() == WIFI_AP || WiFi.getMode() == WIFI_AP_STA);
    doc["apIP"] = WiFi.softAPIP().toString();
    doc["apClients"] = WiFi.softAPgetStationNum();
    doc["reconnectAttempts"] = reconnectAttempts;
    doc["lastScan"] = lastScanTime;
    doc["lastStatusCheck"] = lastStatusCheck;
    doc["error"] = lastError;

    String status;
    serializeJson(doc, status);
    return status;
}

void WiFiModule::getMetrics(JsonObject &metrics) const {
    metrics["wifi_connected"] = (WiFi.status() == WL_CONNECTED) ? 1 : 0;
    metrics["wifi_rssi"] = WiFi.RSSI();
    metrics["wifi_channel"] = WiFi.channel();
    metrics["wifi_ap_clients"] = WiFi.softAPgetStationNum();
    metrics["wifi_reconnect_attempts"] = reconnectAttempts;
}

// Private methods
void WiFiModule::performWiFiScan() {
    Serial.println("[WIFI_MODULE] Starting WiFi scan...");
    WiFi.scanNetworks(true);  // Async scan
    lastScanTime = millis();
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
    Preferences prefs;
    prefs.begin("wifi", true);
    bool powerSave = prefs.getBool("powerSave", false);
    String hostname = prefs.getString("hostname", "esp32-ap-flasher");
    prefs.end();
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
