#include "wifi_module.h"

#include <ArduinoJson.h>
#include "storage.h"

// WiFi Module Implementation
// ==========================

bool WiFiModule::initialize()
{
    Serial.println("[WIFI_MODULE] Initializing WiFi module...");
    WiFi.mode(WIFI_STA);
    WiFi.setAutoReconnect(true);
    // Avoid storing WiFi config in NVS; we manage credentials in LittleFS
    WiFi.persistent(false);
    WiFi.setSleep(WIFI_PS_NONE);
    isInitialized = true;
    lastStatusCheck = millis();
    lastError = "";
    Serial.println("[WIFI_MODULE] WiFi module initialized successfully");
    return true;
}

bool WiFiModule::start()
{
    if (!isInitialized)
    {
        lastError = "Module not initialized";
        return false;
    }
    Serial.println("[WIFI_MODULE] Starting WiFi module...");
    // Load credentials from filesystem JSON
    String ssid = "";
    String password = "";
    if (contentFS)
    {
        File f = contentFS->open("/current/apconfig.json", "r");
        if (f)
        {
            JsonDocument cfg;
            DeserializationError err = deserializeJson(cfg, f);
            if (!err)
            {
                ssid = cfg["ssid"].as<String>();
                password = cfg["password"].as<String>();
            }
            f.close();
        }
    }

    if (ssid.isEmpty())
    {
        Serial.println("[WIFI_MODULE] No WiFi credentials configured, starting in AP mode");
        WiFi.softAP("ESP32-AP-Flasher", "password123");
    }
    else
    {
        Serial.printf("[WIFI_MODULE] Connecting to WiFi: %s\n", ssid.c_str());
        WiFi.begin(ssid.c_str(), password.c_str());
        int attempts = 0;
        while (WiFi.status() != WL_CONNECTED && attempts < 20)
        {
            delay(500);
            attempts++;
            Serial.print(".");
        }
        if (WiFi.status() == WL_CONNECTED)
        {
            Serial.printf("\n[WIFI_MODULE] Connected to WiFi. IP: %s\n", WiFi.localIP().toString().c_str());
            optimizeWiFiSettings();
        }
        else
        {
            Serial.println("\n[WIFI_MODULE] Failed to connect to WiFi, starting AP mode");
            WiFi.softAP("ESP32-AP-Flasher", "password123");
        }
    }
    isStarted = true;
    reconnectAttempts = 0;
    lastError = "";
    return true;
}

bool WiFiModule::stop()
{
    Serial.println("[WIFI_MODULE] Stopping WiFi module...");
    WiFi.disconnect(true);
    WiFi.softAPdisconnect(true);
    isStarted = false;
    lastError = "";
    return true;
}

bool WiFiModule::cleanup()
{
    Serial.println("[WIFI_MODULE] Cleaning up WiFi module...");
    if (isStarted)
        stop();
    WiFi.mode(WIFI_OFF);
    isInitialized = false;
    lastError = "";
    return true;
}

ModuleInfo WiFiModule::getInfo() const
{
    ModuleInfo info;
    info.name = "WiFiModule";
    info.version = "2.1.0";
    info.description = "Enhanced WiFi Management with Auto-reconnection and Optimization";
    info.type = ModuleType::COMMUNICATION;
    info.initTime = 0; // Initialize to prevent uninitialized variable warning

    if (!isInitialized)
    {
        info.state = ModuleState::UNINITIALIZED;
    }
    else if (!isStarted)
    {
        info.state = ModuleState::INITIALIZED;
    }
    else if (lastError.length() > 0)
    {
        info.state = ModuleState::ERROR;
    }
    else
    {
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

bool WiFiModule::isHealthy() const
{
    if (!isStarted)
    {
        return false;
    }

    // Check WiFi connection status
    if (WiFi.status() != WL_CONNECTED && WiFi.softAPgetStationNum() == 0)
    {
        return false; // Neither STA nor AP mode has connections
    }

    // Check if we've had recent activity
    if (millis() - lastStatusCheck > 30000)
    {
        return false;
    }

    return lastError.length() == 0;
}

void WiFiModule::registerWebHandlers(AsyncWebServer &server)
{
    Serial.println("[WIFI_MODULE] Registering enhanced WiFi web handlers...");

    // WiFi status endpoint
    server.on("/api/wifi/status", HTTP_GET, [this](AsyncWebServerRequest *request)
              {
        JsonDocument doc;

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
        request->send(response); });

    // WiFi scan endpoint
    server.on("/api/wifi/scan", HTTP_GET, [this](AsyncWebServerRequest *request)
              {
        performWiFiScan();

        JsonDocument doc;
        doc["success"] = true;
        doc["scanning"] = true;
        doc["message"] = "WiFi scan initiated";

        AsyncResponseStream *response = request->beginResponseStream("application/json");
        serializeJson(doc, *response);
        request->send(response); });

    // WiFi connection endpoint
    server.on("/api/wifi/connect", HTTP_POST, [this](AsyncWebServerRequest *request)
              {
        if (!request->hasParam("ssid", true)) {
            request->send(400, "application/json", "{\"error\":\"Missing SSID\"}");
            return;
        }

        String ssid = request->getParam("ssid", true)->value();
        String password = request->hasParam("password", true) ? request->getParam("password", true)->value() : "";

        // Save credentials to filesystem for persistence
        if (contentFS) {
            JsonDocument cfg;
            cfg["ssid"] = ssid;
            cfg["password"] = password;
            xSemaphoreTake(fsMutex, portMAX_DELAY);
            File f = contentFS->open("/current/apconfig.json", "w");
            if (f) { serializeJson(cfg, f); f.close(); }
            xSemaphoreGive(fsMutex);
        }

        // Attempt connection
        WiFi.begin(ssid.c_str(), password.c_str());

        JsonDocument doc;
        doc["success"] = true;
        doc["message"] = "WiFi connection initiated";
        doc["ssid"] = ssid;

        AsyncResponseStream *response = request->beginResponseStream("application/json");
        serializeJson(doc, *response);
        request->send(response); });

    // WiFi disconnect endpoint
    server.on("/api/wifi/disconnect", HTTP_POST, [this](AsyncWebServerRequest *request)
              {
        WiFi.disconnect();

        JsonDocument doc;
        doc["success"] = true;
        doc["message"] = "WiFi disconnected";

        AsyncResponseStream *response = request->beginResponseStream("application/json");
        serializeJson(doc, *response);
        request->send(response); });
}

void WiFiModule::handleEvent(const String &event, const String &data)
{
    if (event == "wifi_scan_requested")
    {
        performWiFiScan();
    }
    else if (event == "system_restart")
    {
        Serial.println("[WIFI_MODULE] Preparing for system restart");
        // Gracefully disconnect
        WiFi.disconnect();
    }
    else if (event == "network_check")
    {
        checkConnectionStatus();
    }
}

void WiFiModule::update()
{
    if (!isStarted)
        return;
    unsigned long now = millis();
    if (now - lastStatusCheck > 5000)
    {
        checkConnectionStatus();
    }
    if (WiFi.status() != WL_CONNECTED && reconnectAttempts < 5)
    {
        if (now - lastStatusCheck > 10000)
        {
            attemptReconnection();
        }
    }
}

String WiFiModule::getConfig() const
{
    JsonDocument doc;
    // Read current settings from filesystem
    if (contentFS)
    {
        File f = contentFS->open("/current/apconfig.json", "r");
        if (f)
        {
            JsonDocument cfg;
            if (deserializeJson(cfg, f) == DeserializationError::Ok)
            {
                doc["ssid"] = cfg["ssid"].as<String>();
                doc["hostname"] = cfg["hostname"].as<String>();
                doc["autoReconnect"] = cfg.containsKey("autoReconnect") ? cfg["autoReconnect"].as<bool>() : true;
                doc["powerSave"] = cfg.containsKey("powerSave") ? cfg["powerSave"].as<bool>() : false;
                doc["channel"] = cfg.containsKey("channel") ? cfg["channel"].as<int>() : 0;
            }
            f.close();
        }
    }

    String config;
    serializeJson(doc, config);
    return config;
}

bool WiFiModule::setConfig(const String &config)
{
    JsonDocument doc;
    DeserializationError error = deserializeJson(doc, config);

    if (error)
    {
        lastError = "Invalid JSON configuration";
        return false;
    }

    // Write config to filesystem
    if (contentFS)
    {
        // Merge into existing file if present
        JsonDocument cfg;
        {
            File r = contentFS->open("/current/apconfig.json", "r");
            if (r)
            {
                deserializeJson(cfg, r);
                r.close();
            }
        }
        if (doc.containsKey("autoReconnect"))
            cfg["autoReconnect"] = doc["autoReconnect"].as<bool>();
        if (doc.containsKey("powerSave"))
            cfg["powerSave"] = doc["powerSave"].as<bool>();
        if (doc.containsKey("channel"))
            cfg["channel"] = doc["channel"].as<int>();
        if (doc.containsKey("hostname"))
            cfg["hostname"] = doc["hostname"].as<String>();
        xSemaphoreTake(fsMutex, portMAX_DELAY);
        File w = contentFS->open("/current/apconfig.json", "w");
        if (w)
        {
            serializeJson(cfg, w);
            w.close();
        }
        xSemaphoreGive(fsMutex);
    }

    // Apply settings if module is running
    if (isStarted)
    {
        optimizeWiFiSettings();
    }

    return true;
}

String WiFiModule::getStatus() const
{
    JsonDocument doc;

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

void WiFiModule::getMetrics(JsonObject &metrics) const
{
    metrics["wifi_connected"] = (WiFi.status() == WL_CONNECTED) ? 1 : 0;
    metrics["wifi_rssi"] = WiFi.RSSI();
    metrics["wifi_channel"] = WiFi.channel();
    metrics["wifi_ap_clients"] = WiFi.softAPgetStationNum();
    metrics["wifi_reconnect_attempts"] = reconnectAttempts;
}

// Private methods
void WiFiModule::performWiFiScan()
{
    Serial.println("[WIFI_MODULE] Starting WiFi scan...");
    WiFi.scanNetworks(true); // Async scan
    lastScanTime = millis();
}

void WiFiModule::checkConnectionStatus()
{
    lastStatusCheck = millis();
    wl_status_t status = WiFi.status();
    if (status != WL_CONNECTED)
    {
        if (lastError.isEmpty())
        {
            lastError = "WiFi connection lost";
            Serial.println("[WIFI_MODULE] WiFi connection lost");
        }
    }
    else
    {
        if (lastError == "WiFi connection lost")
        {
            lastError = "";
            Serial.println("[WIFI_MODULE] WiFi connection restored");
            reconnectAttempts = 0;
        }
    }
}

void WiFiModule::handleDisconnection()
{
    Serial.println("[WIFI_MODULE] Handling WiFi disconnection");
    lastError = "WiFi disconnected";

    // Broadcast disconnect event
    ModuleManager::getInstance().broadcastEvent("wifi_disconnected", "");
}

bool WiFiModule::attemptReconnection()
{
    Serial.printf("[WIFI_MODULE] Attempting WiFi reconnection (attempt %d)\n", reconnectAttempts + 1);
    WiFi.reconnect();
    reconnectAttempts++;
    lastStatusCheck = millis();
    return WiFi.status() == WL_CONNECTED;
}

void WiFiModule::optimizeWiFiSettings()
{
    Serial.println("[WIFI_MODULE] Optimizing WiFi settings...");
    bool powerSave = false;
    String hostname = "esp32-ap-flasher";
    if (contentFS)
    {
        File f = contentFS->open("/current/apconfig.json", "r");
        if (f)
        {
            JsonDocument cfg;
            if (deserializeJson(cfg, f) == DeserializationError::Ok)
            {
                powerSave = cfg.containsKey("powerSave") ? cfg["powerSave"].as<bool>() : false;
                if (cfg.containsKey("hostname"))
                    hostname = cfg["hostname"].as<String>();
            }
            f.close();
        }
    }
    WiFi.setSleep(powerSave ? WIFI_PS_MIN_MODEM : WIFI_PS_NONE);
    WiFi.setHostname(hostname.c_str());
    Serial.println("[WIFI_MODULE] WiFi optimization complete");
}

// Required interface methods
ModuleType WiFiModule::getType() const
{
    return ModuleType::COMMUNICATION;
}

ModuleState WiFiModule::getState() const
{
    if (!isInitialized)
        return ModuleState::MODULE_DISABLED;
    if (!isStarted)
        return ModuleState::INITIALIZED;
    if (!isHealthy())
        return ModuleState::ERROR;
    return ModuleState::ACTIVE;
}

// Module registration function
void registerWiFiModule()
{
    Serial.println("[WIFI_MODULE] Registering WiFi module with module manager...");
    auto wifiModule = std::make_unique<WiFiModule>();
    bool registered = ModuleManager::getInstance().registerModule(
        std::move(wifiModule), true, {});
    if (registered)
    {
        Serial.println("[WIFI_MODULE] WiFi module registered successfully");
    }
    else
    {
        Serial.println("[WIFI_MODULE] Failed to register WiFi module");
    }
}
