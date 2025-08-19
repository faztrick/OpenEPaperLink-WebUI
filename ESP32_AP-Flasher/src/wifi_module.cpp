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
    apStarted = false;
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
    // Load credentials from filesystem JSON (single) and prepare WiFiMulti (multiple)
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
                if (cfg["ssid"].is<String>())
                    ssid = cfg["ssid"].as<String>();
                if (cfg["password"].is<String>())
                    password = cfg["password"].as<String>();
            }
            f.close();
        }
    }

    // Load additional saved networks (if any)
    savedNetworkCount = 0;
    loadSavedNetworks();
    useWiFiMulti = (savedNetworkCount > 0);

    if (ssid.isEmpty() && !useWiFiMulti)
    {
        Serial.println("[WIFI_MODULE] No WiFi credentials configured, starting in AP mode");
        WiFi.mode(WIFI_AP);
        // Open AP (no password)
        WiFi.softAP("ESP32-AP-Flasher", "");
        apStarted = true;
    }
    else
    {
        WiFi.mode(WIFI_STA);
        wl_status_t status = WL_DISCONNECTED;
        int attempts = 0;
        Serial.println("[WIFI_MODULE] Connecting to WiFi...");

        if (useWiFiMulti)
        {
            // If single ssid/password present, include it as well
            if (!ssid.isEmpty())
            {
                wifiMulti.addAP(ssid.c_str(), password.c_str());
            }
            while (status != WL_CONNECTED && attempts < 20)
            {
                status = static_cast<wl_status_t>(wifiMulti.run());
                if (status == WL_CONNECTED)
                    break;
                delay(500);
                attempts++;
                Serial.print(".");
            }
        }
        else
        {
            Serial.printf("[WIFI_MODULE] Connecting to WiFi: %s\n", ssid.c_str());
            WiFi.begin(ssid.c_str(), password.c_str());
            while (WiFi.status() != WL_CONNECTED && attempts < 20)
            {
                delay(500);
                attempts++;
                Serial.print(".");
            }
            status = WiFi.status();
        }

        if (status == WL_CONNECTED)
        {
            Serial.printf("\n[WIFI_MODULE] Connected to WiFi. IP: %s\n", WiFi.localIP().toString().c_str());
            optimizeWiFiSettings();
            apStarted = false;
        }
        else
        {
            Serial.println("\n[WIFI_MODULE] Failed to connect to WiFi, starting AP mode");
            WiFi.mode(WIFI_AP_STA);
            // Open AP (no password)
            WiFi.softAP("ESP32-AP-Flasher", "");
            apStarted = true;
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
    apStarted = false;
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
    apStarted = false;
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

    // Check WiFi connection status or AP client presence
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
    doc["useWiFiMulti"] = useWiFiMulti;
    doc["savedNetworkCount"] = savedNetworkCount;
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

    // WiFi connection endpoint (supports single or multiple networks)
    server.on("/api/wifi/connect", HTTP_POST, [this](AsyncWebServerRequest *request)
              {
        // If body contains JSON with networks array, prefer that (but Async callbacks here don't give body easily). Fallback to form params.
        // We support repeated fields as ssid1/password1, ssid2/password2 ... or a single ssid/password.
    JsonDocument cfg;
    // Ensure networks is a JSON array
    JsonArray networksArr = cfg["networks"].to<JsonArray>();

    int count = 0;
        // Gather up to 5 entries
        for (int i = 1; i <= 5; ++i) {
            String ks = (i == 1) ? "ssid" : String("ssid") + String(i);
            String kp = (i == 1) ? "password" : String("password") + String(i);
            if (request->hasParam(ks, true)) {
                String ssid = request->getParam(ks, true)->value();
                String pwd = request->hasParam(kp, true) ? request->getParam(kp, true)->value() : "";
                JsonObject n = networksArr.add<JsonObject>();
                n["ssid"] = ssid;
                n["password"] = pwd;
                count++;
            }
        }

        if (count == 0) {
            request->send(400, "application/json", "{\"error\":\"Missing SSID\"}");
            return;
        }

        // Persist networks to config
        if (contentFS) {
            xSemaphoreTake(fsMutex, portMAX_DELAY);
            File f = contentFS->open("/current/apconfig.json", "w");
            if (f) { serializeJson(cfg, f); f.close(); }
            xSemaphoreGive(fsMutex);
        }

        // Seed WiFiMulti and try first connection quickly
        wifiMulti = WiFiMulti();
        savedNetworkCount = 0;
        for (JsonObject n : cfg["networks"].as<JsonArray>()) {
            wifiMulti.addAP(n["ssid"].as<const char*>(), n["password"].as<const char*>());
            savedNetworkCount++;
        }
        useWiFiMulti = (savedNetworkCount > 0);
        if (useWiFiMulti) {
            WiFi.mode(WIFI_STA);
            wifiMulti.run();
        }

        JsonDocument doc;
        doc["success"] = true;
        doc["message"] = "WiFi connection initiated";
        doc["savedNetworks"] = savedNetworkCount;

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
    // If connected, consider stopping AP if it's idle (no clients)
    if (WiFi.status() == WL_CONNECTED)
    {
        stopFallbackAPIfIdle();
        return;
    }

    // Not connected: try to reconnect a few times
    if (reconnectAttempts < 5)
    {
        if (now - lastStatusCheck > 10000)
        {
            attemptReconnection();
        }
    }
    else
    {
        // After several failed attempts, ensure fallback AP is running
        if (!apStarted)
        {
            startFallbackAP();
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
                doc["autoReconnect"] = cfg["autoReconnect"].is<bool>() ? cfg["autoReconnect"].as<bool>() : true;
                doc["powerSave"] = cfg["powerSave"].is<bool>() ? cfg["powerSave"].as<bool>() : false;
                doc["channel"] = cfg["channel"].is<int>() ? cfg["channel"].as<int>() : 0;
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
        if (doc["autoReconnect"].is<bool>())
            cfg["autoReconnect"] = doc["autoReconnect"].as<bool>();
        if (doc["powerSave"].is<bool>())
            cfg["powerSave"] = doc["powerSave"].as<bool>();
        if (doc["channel"].is<int>())
            cfg["channel"] = doc["channel"].as<int>();
        if (doc["hostname"].is<String>())
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
        // If we're not connected and we've failed several attempts, ensure AP is running
        if (reconnectAttempts >= 5 && !apStarted)
        {
            startFallbackAP();
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
        // Connected: stop AP if it's idle (no clients)
        stopFallbackAPIfIdle();
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
    if (useWiFiMulti)
    {
        wl_status_t s = static_cast<wl_status_t>(wifiMulti.run());
        if (s != WL_CONNECTED)
        {
            // brief wait to avoid tight loop
            delay(250);
        }
    }
    else
    {
        WiFi.reconnect();
    }
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
                powerSave = cfg["powerSave"].is<bool>() ? cfg["powerSave"].as<bool>() : false;
                if (cfg["hostname"].is<String>())
                    hostname = cfg["hostname"].as<String>();
            }
            f.close();
        }
    }
    WiFi.setSleep(powerSave ? WIFI_PS_MIN_MODEM : WIFI_PS_NONE);
    WiFi.setHostname(hostname.c_str());
    Serial.println("[WIFI_MODULE] WiFi optimization complete");
}

void WiFiModule::loadSavedNetworks()
{
    if (!contentFS)
        return;

    xSemaphoreTake(fsMutex, portMAX_DELAY);
    File f = contentFS->open("/current/apconfig.json", "r");
    if (!f)
    {
        xSemaphoreGive(fsMutex);
        return;
    }
    JsonDocument cfg;
    DeserializationError err = deserializeJson(cfg, f);
    f.close();
    xSemaphoreGive(fsMutex);
    if (err)
        return;

    // Support formats:
    // 1) { "networks": [ {"ssid":"A","password":"p"}, ... ] }
    // 2) { "wifi": {"networks": [ ... ] } }
    // 3) Single fields already handled in start(); also consider additional ssid2/password2 pairs if present
    JsonArray arr;
    if (cfg["networks"].is<JsonArray>())
    {
        arr = cfg["networks"].as<JsonArray>();
    }
    else if (cfg["wifi"]["networks"].is<JsonArray>())
    {
        arr = cfg["wifi"]["networks"].as<JsonArray>();
    }

    if (!arr.isNull())
    {
        for (JsonObject net : arr)
        {
            if (net["ssid"].is<String>())
            {
                const char *s = net["ssid"];
                const char *p = net["password"].is<String>() ? net["password"].as<const char *>() : "";
                wifiMulti.addAP(s, p);
                savedNetworkCount++;
            }
        }
    }

    // Backward-compat: optional ssid2/password2, ssid3/password3 ... (up to 5)
    for (int i = 2; i <= 5; ++i)
    {
        String keySsid = String("ssid") + String(i);
        String keyPwd = String("password") + String(i);
        if (cfg[keySsid].is<String>())
        {
            const char *s = cfg[keySsid];
            const char *p = cfg[keyPwd].is<String>() ? cfg[keyPwd].as<const char *>() : "";
            wifiMulti.addAP(s, p);
            savedNetworkCount++;
        }
    }
}

void WiFiModule::startFallbackAP()
{
    Serial.println("[WIFI_MODULE] Starting fallback AP due to connection issues...");
    // Keep STA active to allow reconnect attempts while AP is up
    if (WiFi.getMode() != WIFI_AP_STA)
    {
        WiFi.mode(WIFI_AP_STA);
    }
    // Start or reconfigure AP; if already up this is idempotent
    if (WiFi.softAPgetStationNum() == 0)
    {
        // Open AP (no password)
        WiFi.softAP("ESP32-AP-Flasher", "");
    }
    apStarted = true;
    ModuleManager::getInstance().broadcastEvent("wifi_ap_started", "");
    Serial.printf("[WIFI_MODULE] Fallback AP IP: %s\n", WiFi.softAPIP().toString().c_str());
}

void WiFiModule::stopFallbackAPIfIdle()
{
    if (!apStarted)
        return;

    // Only stop AP if no clients are connected
    if (WiFi.softAPgetStationNum() == 0)
    {
        Serial.println("[WIFI_MODULE] Stopping fallback AP (idle, STA connected)");
        WiFi.softAPdisconnect(true);
        // Return to STA-only for efficiency
        if (WiFi.getMode() == WIFI_AP_STA)
        {
            WiFi.mode(WIFI_STA);
        }
        apStarted = false;
        ModuleManager::getInstance().broadcastEvent("wifi_ap_stopped", "");
    }
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
