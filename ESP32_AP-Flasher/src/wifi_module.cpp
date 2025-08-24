// Consolidated WiFiModule implementation
#include "wifi_module.h"

#include <ArduinoJson.h>
#include "storage.h"
#include "compat_wifi_modes.h"
// (Optionally) include web/udp helpers if available
#ifdef ARDUINO_ARCH_ESP32
#include "web.h"
#endif

// Forward declarations for AP config save helpers
static void saveAPconfig_compat(const JsonDocument &apCfg);
// Renamed to avoid confusion with existing legacy saveAPconfig() in tag_db.cpp
static void saveAPconfigFromDoc(const JsonDocument &apCfg);

// Optional LED/state hook weak definitions (can be overridden elsewhere)
extern "C" __attribute__((weak)) void wifiLedOnConnected() {}
extern "C" __attribute__((weak)) void wifiLedOnDisconnected() {}
extern "C" __attribute__((weak)) void wifiLedOnApStarted() {}

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
    // Set a default hostname if none configured later
    String currentHost = WiFi.getHostname() ? String(WiFi.getHostname()) : String();
    if (currentHost.length() == 0)
    {
        WiFi.setHostname(buildDefaultHostname().c_str());
    }
    // Register WiFi event callbacks for detailed logging
    registerWiFiEvents();
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
    // Unified STA config loading
    JsonDocument staDoc;
    StaConfig staCfg;
    std::vector<std::pair<String, String>> candidateSingles; // for ranking
    if (loadStaConfig(staDoc, staCfg))
    {
        // Extended flags
        managementAP = staDoc["managementAP"].is<bool>() ? staDoc["managementAP"].as<bool>() : false;
        scanVerbose = staDoc["scanVerbose"].is<bool>() ? staDoc["scanVerbose"].as<bool>() : false;
        if (staCfg.networks.isNull() && !staCfg.primarySsid.isEmpty())
        {
            candidateSingles.emplace_back(staCfg.primarySsid, staCfg.primaryPassword);
        }
        else if (!staCfg.networks.isNull())
        {
            for (JsonObject n : staCfg.networks)
            {
                if (n["ssid"].is<String>())
                {
                    candidateSingles.emplace_back(n["ssid"].as<String>(), n["password"].is<String>() ? n["password"].as<String>() : String());
                }
            }
        }
    }

    // Load multi-network list for WiFiMulti support
    savedNetworkCount = 0;
    loadSavedNetworks();
    useWiFiMulti = (savedNetworkCount > 0);

    // If we only have singles and not using WiFiMulti yet, rank them
    if (!useWiFiMulti && candidateSingles.size() > 1)
    {
        rankCandidateNetworks(candidateSingles);
    }

    // Apply static IP settings if any
    applyStaticIpFrom(staCfg);

    String ssid = candidateSingles.empty() ? String() : candidateSingles.front().first;
    String password = candidateSingles.empty() ? String() : candidateSingles.front().second;

    // If management AP is requested, bring it up early (always-on) but still proceed with STA attempts if creds exist
    if (managementAP)
    {
        maybeStartManagementAP();
        suppressAPAutoStop = true;
    }

    if (ssid.isEmpty() && !useWiFiMulti)
    {
        Serial.println("[WIFI_MODULE] No WiFi credentials configured, starting in AP mode");
        WiFi.mode(WIFI_AP);
        // Load AP config for customization (channel, hidden, etc.)
        JsonDocument apCfg;
        loadApConfig(apCfg);
        String apSsid = apCfg["ssid"].is<String>() ? apCfg["ssid"].as<String>() : String("OpenEPaperLink");
        int channel = apCfg["channel"].is<int>() ? apCfg["channel"].as<int>() : 1;
        bool hidden = apCfg["hidden"].is<bool>() ? apCfg["hidden"].as<bool>() : false;
        int maxClients = apCfg["max_clients"].is<int>() ? apCfg["max_clients"].as<int>() : 4;
        if (channel < 1 || channel > 13)
            channel = 1;
        if (maxClients < 1)
            maxClients = 1;
        else if (maxClients > 10)
            maxClients = 10;
        WiFi.softAP(apSsid.c_str(), "", channel, hidden, maxClients);
        apStarted = true;
    }
    else
    {
        WiFi.mode(WIFI_STA);
        // Apply performance tweaks (TX power) prior to connect
        WiFi.setTxPower(WIFI_POWER_19_5dBm);
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
            while (status != WL_CONNECTED && attempts < 40)
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
            while (WiFi.status() != WL_CONNECTED && attempts < 40)
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
        bool staConnected = (WiFi.status() == WL_CONNECTED);
        doc["connected"] = staConnected;
        doc["ssid"] = WiFi.SSID();
        doc["ip"] = WiFi.localIP().toString();
        doc["hostname"] = WiFi.getHostname();
        doc["rssi"] = WiFi.RSSI();
        doc["channel"] = WiFi.channel();
        doc["mac"] = WiFi.macAddress();
        wifi_mode_t mode = WiFi.getMode();
        doc["mode"] = (int)mode;
        doc["apMode"] = (mode == WIFI_AP || mode == WIFI_AP_STA);
        doc["apClients"] = WiFi.softAPgetStationNum();
        doc["apIp"] = WiFi.softAPIP().toString();
        doc["reconnectAttempts"] = reconnectAttempts;
        doc["useWiFiMulti"] = useWiFiMulti;
        doc["savedNetworkCount"] = savedNetworkCount;
        doc["lastScan"] = lastScanTime;
        doc["scanRunning"] = scanInProgress && WiFi.scanComplete() == -1; // -1 means still running
        // Attempt to derive gateway/dns if static; else leave blank (can be enriched later)
        doc["gw"] = staticGw;
        doc["dns"] = staticDns;
// TX power (dBm) - ESP32 API gives set/get max; if unavailable returns 0
#ifdef ESP32
        doc["txPowerDbm"] = (int)WiFi.getTxPower();
#endif
        doc["healthy"] = isHealthy();
        doc["error"] = lastError;
        // Last event (if any)
        if (!eventHistory.empty()) {
            const auto &last = eventHistory.back();
            JsonObject le = doc["lastEvent"].to<JsonObject>();
            le["ts"] = last.ts;
            le["name"] = last.name;
            if (last.data.length()) le["data"] = last.data;
        }
        AsyncResponseStream *response = request->beginResponseStream("application/json");
        serializeJson(doc, *response);
        request->send(response); });

    // WiFi scan endpoint (initiates scan). Results retrieved via /api/wifi/scan/results
    server.on("/api/wifi/scan", HTTP_GET, [this](AsyncWebServerRequest *request)
              {
        if (request->hasParam("verbose")) {
            String v = request->getParam("verbose")->value();
            scanVerbose = (v == "1" || v.equalsIgnoreCase("true"));
        }
        if (scanInProgress && WiFi.scanComplete() == -1) {
            request->send(429, "application/json", "{\"error\":\"scan already running\"}");
            return;
        }
        ModuleManager::getInstance().broadcastEvent("wifi_scan_start", scanVerbose ? "sync" : "async");
        scanInProgress = true;
        int16_t n = -1;
        if (scanVerbose) {
            n = WiFi.scanNetworks(false, true); // sync scan
            cacheScanResults(n);
            scanInProgress = false;
            ModuleManager::getInstance().broadcastEvent("wifi_scan_complete", String(n));
        } else {
            WiFi.scanDelete();
            WiFi.scanNetworks(true, true); // async
            lastScanTime = millis();
        }
        JsonDocument doc;
        doc["success"] = true;
        doc["initiated"] = true;
        if (n >= 0) {
            doc["completed"] = true;
            doc["count"] = n;
        } else {
            doc["completed"] = false;
        }
        AsyncResponseStream *response = request->beginResponseStream("application/json");
        serializeJson(doc, *response);
        request->send(response); });

    // WiFi scan results endpoint
    server.on("/api/wifi/scan/results", HTTP_GET, [this](AsyncWebServerRequest *request)
              {
        int scanState = WiFi.scanComplete();
        if (scanInProgress && scanState >= 0) {
            cacheScanResults(scanState);
            WiFi.scanDelete();
            scanInProgress = false;
            ModuleManager::getInstance().broadcastEvent("wifi_scan_complete", String(scanState));
        }
        JsonDocument doc;
        doc["timestamp"] = lastScanTime;
        doc["count"] = (int)lastScanResults.size();
        doc["running"] = scanInProgress && (WiFi.scanComplete() == -1);
        JsonArray arr = doc["networks"].to<JsonArray>();
        for (auto &r : lastScanResults) {
            JsonObject o = arr.add<JsonObject>();
            o["ssid"] = r.ssid;
            o["rssi"] = r.rssi;
            o["channel"] = r.channel;
            o["enc"] = r.encryption;
            o["bssid"] = r.bssid;
        }
        AsyncResponseStream *response = request->beginResponseStream("application/json");
        serializeJson(doc, *response);
        request->send(response); });

    // Combined summary endpoint (status + ap) for single-call dashboard usage
    server.on("/api/wifi/summary", HTTP_GET, [this](AsyncWebServerRequest *request)
              {
        AsyncResponseStream *response = request->beginResponseStream("application/json");
        JsonDocument doc;
        // Reuse logic by invoking status/ap handlers conceptually (duplication kept minimal)
        JsonObject status = doc["status"].to<JsonObject>();
        bool staConnected = (WiFi.status() == WL_CONNECTED);
        status["connected"] = staConnected;
        status["ssid"] = WiFi.SSID();
        status["ip"] = WiFi.localIP().toString();
        status["hostname"] = WiFi.getHostname();
        status["rssi"] = WiFi.RSSI();
        status["channel"] = WiFi.channel();
        status["mac"] = WiFi.macAddress();
        wifi_mode_t mode = WiFi.getMode();
        status["mode"] = (int)mode;
        status["apMode"] = (mode == WIFI_AP || mode == WIFI_AP_STA);
        status["apClients"] = WiFi.softAPgetStationNum();
        status["apIp"] = WiFi.softAPIP().toString();
        status["reconnectAttempts"] = reconnectAttempts;
        status["useWiFiMulti"] = useWiFiMulti;
        status["savedNetworkCount"] = savedNetworkCount;
        status["lastScan"] = lastScanTime;
        status["scanRunning"] = scanInProgress && WiFi.scanComplete() == -1;
        status["gw"] = staticGw;
        status["dns"] = staticDns;
#ifdef ESP32
        status["txPowerDbm"] = (int)WiFi.getTxPower();
#endif
        status["healthy"] = isHealthy();
        status["error"] = lastError;
        if (!eventHistory.empty()) {
            const auto &last = eventHistory.back();
            JsonObject le = status["lastEvent"].to<JsonObject>();
            le["ts"] = last.ts;
            le["name"] = last.name;
            if (last.data.length()) le["data"] = last.data;
        }
        JsonObject ap = doc["ap"].to<JsonObject>();
        ap["apActive"] = (mode == WIFI_AP || mode == WIFI_AP_STA);
        ap["apClients"] = WiFi.softAPgetStationNum();
        ap["apIP"] = WiFi.softAPIP().toString();
        ap["apStarted"] = apStarted;
        ap["managementAP"] = managementAP;
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
            File f = contentFS->open("/current/staconfig.json", "w");
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

    // Credential wipe endpoint
    server.on("/api/wifi/clear", HTTP_POST, [this](AsyncWebServerRequest *request)
              {
        bool ok = wipeStaCredentials();
        JsonDocument doc; doc["success"] = ok; doc["message"] = ok ? "Credentials cleared" : "Clear failed";
        AsyncResponseStream *response = request->beginResponseStream("application/json");
        serializeJson(doc, *response);
        request->send(response);
        if (ok) {
            Serial.println("[WIFI_MODULE] Credentials cleared via API; restarting in 500ms");
            delay(500);
            ESP.restart();
        } });

    // Recent WiFi/system events (captured from broadcast event bus)
    server.on("/api/wifi/events", HTTP_GET, [this](AsyncWebServerRequest *request)
              {
        JsonDocument doc;
        JsonArray arr = doc["events"].to<JsonArray>();
        for (const auto &rec : eventHistory) {
            JsonObject o = arr.add<JsonObject>();
            o["ts"] = rec.ts;
            o["event"] = rec.name;
            if (rec.data.length()) o["data"] = rec.data;
        }
        doc["count"] = eventHistory.size();
        AsyncResponseStream *response = request->beginResponseStream("application/json");
        serializeJson(doc, *response);
        request->send(response); });

    // AP configuration/state endpoint
    server.on("/api/wifi/ap", HTTP_GET, [this](AsyncWebServerRequest *request)
              {
        JsonDocument doc;
        wifi_mode_t m = WiFi.getMode();
        doc["mode"] = (int)m;
        doc["apActive"] = (m == WIFI_AP || m == WIFI_AP_STA);
        doc["apClients"] = WiFi.softAPgetStationNum();
        doc["apIP"] = WiFi.softAPIP().toString();
        doc["apStarted"] = apStarted;
        doc["managementAP"] = managementAP;
        JsonDocument apCfg; JsonDocument loaded;
        loadApConfig(loaded);
        if (!loaded.isNull()) {
            for (auto kv : loaded.as<JsonObject>()) doc["config"][kv.key().c_str()] = kv.value();
        }
        AsyncResponseStream *response = request->beginResponseStream("application/json");
        serializeJson(doc, *response);
        request->send(response); });

    server.on("/api/wifi/ap", HTTP_POST, [this](AsyncWebServerRequest *request)
              {
        // Control AP: action=start|stop|restart, optional channel, ssid, hidden, max_clients
        String action = request->hasParam("action", true) ? request->getParam("action", true)->value() : "";
        JsonDocument doc; bool ok = true;
        if (action == "start") {
            wifi_mode_t m = WiFi.getMode();
            if (!(m == WIFI_AP || m == WIFI_AP_STA)) {
                WiFi.mode(WIFI_AP_STA); // keep STA capability
            }
            JsonDocument apCfg; loadApConfig(apCfg);
            if (request->hasParam("ssid", true)) apCfg["ssid"] = request->getParam("ssid", true)->value();
            if (request->hasParam("channel", true)) apCfg["channel"] = request->getParam("channel", true)->value().toInt();
            if (request->hasParam("hidden", true)) apCfg["hidden"] = (request->getParam("hidden", true)->value() == "1");
            if (request->hasParam("max_clients", true)) apCfg["max_clients"] = request->getParam("max_clients", true)->value().toInt();
            // Apply start
            String ssid = apCfg["ssid"].is<String>() ? apCfg["ssid"].as<String>() : String("OpenEPaperLink");
            int channel = apCfg["channel"].is<int>() ? apCfg["channel"].as<int>() : 1;
            bool hidden = apCfg["hidden"].is<bool>() ? apCfg["hidden"].as<bool>() : false;
            int maxc = apCfg["max_clients"].is<int>() ? apCfg["max_clients"].as<int>() : 4;
            if (channel < 1 || channel > 13) channel = 1;
            if (maxc < 1) maxc = 1; else if (maxc > 10) maxc = 10;
            WiFi.softAP(ssid.c_str(), "", channel, hidden, maxc);
            apStarted = true;
            suppressAPAutoStop = true; // treat as management until changed
            ModuleManager::getInstance().broadcastEvent("wifi_ap_started", "manual");
            saveAPconfigFromDoc(apCfg);
            doc["result"] = "AP started";
        } else if (action == "stop") {
            WiFi.softAPdisconnect(true);
            if (WiFi.getMode() == WIFI_AP_STA) WiFi.mode(WIFI_STA);
            apStarted = false;
            suppressAPAutoStop = false;
            ModuleManager::getInstance().broadcastEvent("wifi_ap_stopped", "manual");
            doc["result"] = "AP stopped";
        } else if (action == "restart") {
            WiFi.softAPdisconnect(true);
            delay(100);
            WiFi.mode(WIFI_AP_STA);
            JsonDocument apCfg; loadApConfig(apCfg);
            String ssid = apCfg["ssid"].is<String>() ? apCfg["ssid"].as<String>() : String("OpenEPaperLink");
            int channel = apCfg["channel"].is<int>() ? apCfg["channel"].as<int>() : 1;
            bool hidden = apCfg["hidden"].is<bool>() ? apCfg["hidden"].as<bool>() : false;
            int maxc = apCfg["max_clients"].is<int>() ? apCfg["max_clients"].as<int>() : 4;
            WiFi.softAP(ssid.c_str(), "", channel, hidden, maxc);
            apStarted = true;
            ModuleManager::getInstance().broadcastEvent("wifi_ap_started", "restart");
            doc["result"] = "AP restarted";
        } else {
            ok = false; doc["error"] = "Unknown or missing action";
        }
        doc["success"] = ok;
        AsyncResponseStream *response = request->beginResponseStream("application/json");
        serializeJson(doc, *response);
        request->send(response); });
}

void WiFiModule::handleEvent(const String &event, const String &data)
{
    // Capture interesting events for diagnostics
    if (event.startsWith("wifi_") || event.startsWith("system_"))
    {
        appendEvent(event, data);
    }
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

void WiFiModule::cacheScanResults(int16_t count)
{
    lastScanResults.clear();
    if (count <= 0)
    {
        lastScanTime = millis();
        return;
    }
    lastScanTime = millis();
    for (int i = 0; i < count; ++i)
    {
        ScanResultItem item;
        item.ssid = WiFi.SSID(i);
        item.rssi = WiFi.RSSI(i);
        item.channel = WiFi.channel(i);
        item.bssid = WiFi.BSSIDstr(i);
        wifi_auth_mode_t auth = WiFi.encryptionType(i);
        switch (auth)
        {
        case WIFI_AUTH_OPEN:
            item.encryption = "open";
            break;
        case WIFI_AUTH_WEP:
            item.encryption = "wep";
            break;
        case WIFI_AUTH_WPA_PSK:
            item.encryption = "wpa";
            break;
        case WIFI_AUTH_WPA2_PSK:
            item.encryption = "wpa2";
            break;
        case WIFI_AUTH_WPA_WPA2_PSK:
            item.encryption = "wpa+wpa2";
            break;
        case WIFI_AUTH_WPA2_ENTERPRISE:
            item.encryption = "wpa2e";
            break;
        case WIFI_AUTH_WPA3_PSK:
            item.encryption = "wpa3";
            break;
        case WIFI_AUTH_WPA2_WPA3_PSK:
            item.encryption = "wpa2+wpa3";
            break;
        default:
            item.encryption = "?";
            break;
        }
        lastScanResults.push_back(item);
    }
}

void WiFiModule::update()
{
    if (!isStarted)
        return;
    // Check for credential reset button long-press
    handleGpioResetCheck();
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
    // Read current settings from filesystem (include multi-network + IP/static settings)
    if (contentFS)
    {
        File f = contentFS->open("/current/staconfig.json", "r");
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
                doc["ip"] = cfg["ip"].as<String>();
                doc["mask"] = cfg["mask"].as<String>();
                doc["gw"] = cfg["gw"].as<String>();
                doc["dns"] = cfg["dns"].as<String>();
                doc["managementAP"] = cfg["managementAP"].is<bool>() ? cfg["managementAP"].as<bool>() : false;
                doc["scanVerbose"] = cfg["scanVerbose"].is<bool>() ? cfg["scanVerbose"].as<bool>() : false;
                // networks array
                if (cfg["networks"].is<JsonArray>())
                {
                    JsonArray outN = doc["networks"].to<JsonArray>();
                    for (JsonObject n : cfg["networks"].as<JsonArray>())
                    {
                        JsonObject dn = outN.add<JsonObject>();
                        dn["ssid"] = n["ssid"].as<String>();
                        dn["password"] = n["password"].as<String>();
                    }
                }
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

    // Write config to filesystem (merge)
    if (contentFS)
    {
        // Merge into existing file if present
        JsonDocument cfg;
        {
            File r = contentFS->open("/current/staconfig.json", "r");
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
        for (const char *k : {"ip", "mask", "gw", "dns"})
            if (doc[k].is<String>())
                cfg[k] = doc[k].as<String>();
        if (doc["networks"].is<JsonArray>())
            cfg["networks"] = doc["networks"]; // replace whole array
        if (doc["managementAP"].is<bool>())
            cfg["managementAP"] = doc["managementAP"].as<bool>();
        if (doc["scanVerbose"].is<bool>())
            cfg["scanVerbose"] = doc["scanVerbose"].as<bool>();
        xSemaphoreTake(fsMutex, portMAX_DELAY);
        File w = contentFS->open("/current/staconfig.json", "w");
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
    if (scanVerbose)
    {
        int16_t n = WiFi.scanNetworks(false, true);
        lastScanTime = millis();
        if (n < 0)
        {
            Serial.println("[WIFI_MODULE] Scan failed");
            return;
        }
        Serial.printf("[WIFI_MODULE] Scan complete: %d networks\n", n);
        for (int i = 0; i < n; ++i)
        {
            Serial.printf("  %02d: %-32s RSSI=%4d CH=%2d ENC=%d\n", i, WiFi.SSID(i).c_str(), WiFi.RSSI(i), WiFi.channel(i), WiFi.encryptionType(i));
        }
        WiFi.scanDelete();
    }
    else
    {
        WiFi.scanNetworks(true); // Async
        lastScanTime = millis();
    }
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
        File f = contentFS->open("/current/staconfig.json", "r");
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
    File f = contentFS->open("/current/staconfig.json", "r");
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

    if (suppressAPAutoStop)
        return; // management AP stays up

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
void WiFiModule::applyStaticIpIfConfigured()
{
    if (!contentFS)
        return;
    File f = contentFS->open("/current/staconfig.json", "r");
    if (!f)
        return;
    JsonDocument cfg;
    if (deserializeJson(cfg, f) != DeserializationError::Ok)
    {
        f.close();
        return;
    }
    f.close();
    if (cfg["ip"].is<String>() && cfg["mask"].is<String>() && cfg["gw"].is<String>())
    {
        IPAddress ip, mask, gw, dns;
        if (ip.fromString(cfg["ip"].as<String>()) && mask.fromString(cfg["mask"].as<String>()) && gw.fromString(cfg["gw"].as<String>()))
        {
            if (cfg["dns"].is<String>() && dns.fromString(cfg["dns"].as<String>()))
                WiFi.config(ip, gw, mask, dns);
            else
                WiFi.config(ip, gw, mask, IPAddress(208, 67, 222, 222));
        }
    }
}

void WiFiModule::rankCandidateNetworks(std::vector<std::pair<String, String>> &candidates)
{
    if (candidates.size() <= 1)
        return;
    // Ensure STA or AP_STA for scanning
    wifi_mode_t mode;
    if (esp_wifi_get_mode(&mode) == ESP_OK)
    {
        if (mode == WIFI_MODE_AP)
            WiFi.mode(WIFI_AP_STA);
    }
    Serial.println("[WIFI_MODULE] Scanning networks to rank candidates...");
    int16_t found = WiFi.scanNetworks(false, true);
    if (found < 0)
    {
        Serial.println("[WIFI_MODULE] Scan failed; keeping original order");
        WiFi.scanDelete();
        return;
    }
    struct Ranked
    {
        String ssid;
        String pass;
        int rssi;
        bool present;
    };
    std::vector<Ranked> ranked;
    ranked.reserve(candidates.size());
    for (auto &p : candidates)
    {
        int best = -300;
        bool present = false;
        for (int i = 0; i < found; ++i)
        {
            if (WiFi.SSID(i) == p.first)
            {
                int r = WiFi.RSSI(i);
                if (r > best)
                {
                    best = r;
                    present = true;
                }
            }
        }
        ranked.push_back({p.first, p.second, best, present});
    }
    std::stable_sort(ranked.begin(), ranked.end(), [](const Ranked &a, const Ranked &b)
                     {
        if (a.present != b.present) return a.present && !b.present;
        if (a.present && b.present) return a.rssi > b.rssi;
        return false; });
    candidates.clear();
    for (auto &r : ranked)
    {
        candidates.emplace_back(r.ssid, r.pass);
        if (r.present)
            Serial.printf("[WIFI_MODULE] Candidate '%s' RSSI %d dBm\n", r.ssid.c_str(), r.rssi);
        else
            Serial.printf("[WIFI_MODULE] Candidate '%s' not visible\n", r.ssid.c_str());
    }
    WiFi.scanDelete();
}

void WiFiModule::loadApConfig(JsonDocument &outApCfg)
{
    if (!contentFS)
        return;
    File f = contentFS->open("/current/apconfig.json", "r");
    if (!f)
        return;
    JsonDocument cfg;
    if (deserializeJson(cfg, f) == DeserializationError::Ok)
    {
        if (cfg["ap"].is<JsonObject>())
        {
            for (auto kv : cfg["ap"].as<JsonObject>())
                outApCfg[kv.key().c_str()] = kv.value();
        }
        else
        {
            for (const char *k : {"ssid", "password", "channel", "hidden", "max_clients", "ip", "mask", "gw"})
            {
                String legacyKey = String("ap_") + k;
                if (cfg[legacyKey])
                    outApCfg[k] = cfg[legacyKey];
                if (cfg[k])
                    outApCfg[k] = cfg[k];
            }
        }
    }
    f.close();
}

// Persist AP configuration (AP ssid/channel/hidden/max_clients etc.)
// Merges provided keys into existing /current/apconfig.json structure while keeping other fields.
static void saveAPconfig_compat(const JsonDocument &apCfg)
{
    if (!contentFS)
        return;
    xSemaphoreTake(fsMutex, portMAX_DELAY);
    JsonDocument existing;
    if (contentFS->exists("/current/apconfig.json"))
    {
        File r = contentFS->open("/current/apconfig.json", "r");
        if (r)
        {
            deserializeJson(existing, r);
            r.close();
        }
    }
    // Store in legacy flat format for backward compatibility
    for (const char *k : {"ssid", "password", "channel", "hidden", "max_clients", "ip", "mask", "gw"})
    {
        if (apCfg[k].is<JsonVariant>())
            existing[k] = apCfg[k];
    }
    File w = contentFS->open("/current/apconfig.json", "w");
    if (w)
    {
        serializeJson(existing, w);
        w.close();
    }
    xSemaphoreGive(fsMutex);
}

// Persist AP config from a provided JsonDocument (wrapper around legacy compat saver)
static void saveAPconfigFromDoc(const JsonDocument &apCfg) { saveAPconfig_compat(apCfg); }

void registerWiFiModule()
{
    Serial.println("[WIFI_MODULE] Registering WiFi module with module manager...");
    auto mod = std::make_unique<WiFiModule>();
    if (ModuleManager::getInstance().registerModule(std::move(mod), true, {}))
        Serial.println("[WIFI_MODULE] WiFi module registered successfully");
    else
        Serial.println("[WIFI_MODULE] ERROR: WiFi module registration failed");
}

bool WiFiModule::loadStaConfig(JsonDocument &doc, StaConfig &outCfg)
{
    if (!contentFS)
        return false;
    File f = contentFS->open("/current/staconfig.json", "r");
    if (!f)
        return false;
    DeserializationError err = deserializeJson(doc, f);
    f.close();
    if (err)
        return false;
    if (doc["ssid"].is<String>())
        outCfg.primarySsid = doc["ssid"].as<String>();
    if (doc["password"].is<String>())
        outCfg.primaryPassword = doc["password"].as<String>();
    if (doc["hostname"].is<String>())
        outCfg.hostname = doc["hostname"].as<String>();
    outCfg.powerSave = doc["powerSave"].is<bool>() ? doc["powerSave"].as<bool>() : false;
    for (const char *k : {"ip", "mask", "gw", "dns"})
    {
        if (doc[k].is<String>())
        {
            if (strcmp(k, "ip") == 0)
                outCfg.ip = doc[k].as<String>();
            else if (strcmp(k, "mask") == 0)
                outCfg.mask = doc[k].as<String>();
            else if (strcmp(k, "gw") == 0)
                outCfg.gw = doc[k].as<String>();
            else if (strcmp(k, "dns") == 0)
                outCfg.dns = doc[k].as<String>();
        }
    }
    if (doc["networks"].is<JsonArray>())
        outCfg.networks = doc["networks"].as<JsonArray>();
    return true;
}

void WiFiModule::applyStaticIpFrom(const StaConfig &cfg)
{
    if (cfg.ip.isEmpty() || cfg.mask.isEmpty() || cfg.gw.isEmpty())
        return; // nothing to apply
    IPAddress ip, mask, gw, dns;
    if (!ip.fromString(cfg.ip) || !mask.fromString(cfg.mask) || !gw.fromString(cfg.gw))
        return;
    if (!cfg.dns.isEmpty() && dns.fromString(cfg.dns))
        WiFi.config(ip, gw, mask, dns);
    else
        WiFi.config(ip, gw, mask, IPAddress(208, 67, 222, 222));
}

// Helper implementations (ensuring single definitions)
void WiFiModule::registerWiFiEvents()
{
    if (wifiEventHandlerId != 0)
        return;
    wifiEventHandlerId = WiFi.onEvent([this](WiFiEvent_t event, WiFiEventInfo_t info)
                                      {
        switch(event) {
            case ARDUINO_EVENT_WIFI_STA_GOT_IP:
                Serial.printf("[WIFI_MODULE][EVENT] GOT_IP: %s\n", WiFi.localIP().toString().c_str());
                lastError = ""; wifiLedOnConnected(); break;
            case ARDUINO_EVENT_WIFI_STA_DISCONNECTED:
                logDisconnectReason(info.wifi_sta_disconnected.reason); wifiLedOnDisconnected(); break;
            case ARDUINO_EVENT_WIFI_AP_START:
                Serial.println("[WIFI_MODULE][EVENT] AP_START"); wifiLedOnApStarted(); break;
            case ARDUINO_EVENT_WIFI_AP_STACONNECTED:
                Serial.println("[WIFI_MODULE][EVENT] AP_STACONNECTED"); break;
            case ARDUINO_EVENT_WIFI_AP_STADISCONNECTED:
                Serial.println("[WIFI_MODULE][EVENT] AP_STADISCONNECTED"); break;
            default: break; } });
}

void WiFiModule::logDisconnectReason(uint8_t reason)
{
    static struct
    {
        uint8_t code;
        const char *msg;
    } reasons[] = {
        {WIFI_REASON_UNSPECIFIED, "Unspecified"},
        {WIFI_REASON_AUTH_EXPIRE, "Auth expire"},
        {WIFI_REASON_AUTH_LEAVE, "Auth leave"},
        {WIFI_REASON_ASSOC_EXPIRE, "Assoc expire"},
        {WIFI_REASON_ASSOC_TOOMANY, "Assoc too many"},
        {WIFI_REASON_NOT_AUTHED, "Not authed"},
        {WIFI_REASON_NOT_ASSOCED, "Not assoc"},
        {WIFI_REASON_ASSOC_LEAVE, "Assoc leave"},
        {WIFI_REASON_BEACON_TIMEOUT, "Beacon timeout"},
        {WIFI_REASON_NO_AP_FOUND, "No AP found"},
        {WIFI_REASON_AUTH_FAIL, "Auth fail"},
        {WIFI_REASON_ASSOC_FAIL, "Assoc fail"},
        {WIFI_REASON_HANDSHAKE_TIMEOUT, "Handshake timeout"}};
    const char *msg = "Unknown";
    for (auto &r : reasons)
        if (r.code == reason)
        {
            msg = r.msg;
            break;
        }
    Serial.printf("[WIFI_MODULE][EVENT] DISCONNECTED reason=%u (%s)\n", reason, msg);
    lastError = String("Disconnect: ") + msg;
}

void WiFiModule::maybeStartManagementAP()
{
    if (apStarted)
        return;
    JsonDocument apCfg;
    loadApConfig(apCfg);
    String apSsid = apCfg["ssid"].is<String>() ? apCfg["ssid"].as<String>() : String("OpenEPaperLink");
    int channel = apCfg["channel"].is<int>() ? apCfg["channel"].as<int>() : 1;
    bool hidden = apCfg["hidden"].is<bool>() ? apCfg["hidden"].as<bool>() : false;
    int maxClients = apCfg["max_clients"].is<int>() ? apCfg["max_clients"].as<int>() : 4;
    if (channel < 1 || channel > 13)
        channel = 1;
    if (maxClients < 1)
        maxClients = 1;
    else if (maxClients > 10)
        maxClients = 10;
    WiFi.mode(WIFI_AP_STA);
    WiFi.softAP(apSsid.c_str(), "", channel, hidden, maxClients);
    apStarted = true;
    Serial.printf("[WIFI_MODULE] Management AP started (SSID=%s)\n", apSsid.c_str());
}

void WiFiModule::handleGpioResetCheck()
{
#ifndef HAS_USB
    pinMode(0, INPUT_PULLUP);
    if (digitalRead(0) == LOW)
    {
        if (!gpioResetArmed)
        {
            gpioResetArmed = true;
            gpioResetStart = millis();
        }
        else if (millis() - gpioResetStart > 5000)
        {
            Serial.println("[WIFI_MODULE] Long press detected on GPIO0: wiping WiFi credentials");
            if (wipeStaCredentials())
            {
                Serial.println("[WIFI_MODULE] Credentials wiped; restarting...");
                delay(200);
                ESP.restart();
            }
            gpioResetStart = millis() + 60000; // prevent repeat
        }
    }
    else
    {
        gpioResetArmed = false;
    }
#endif
}

bool WiFiModule::wipeStaCredentials()
{
    if (!contentFS)
        return false;
    xSemaphoreTake(fsMutex, portMAX_DELAY);
    bool ok = contentFS->remove("/current/staconfig.json");
    xSemaphoreGive(fsMutex);
    return ok;
}

String WiFiModule::buildDefaultHostname() const
{
    uint8_t mac[6];
    esp_wifi_get_mac(WIFI_IF_STA, mac);
    char host[24];
    snprintf(host, sizeof(host), "OpenEPaperLink-%02X%02X", mac[4], mac[5]);
    return String(host);
}

void WiFiModule::appendEvent(const String &name, const String &data)
{
    WifiEventRecord rec{millis(), name, data};
    eventHistory.push_back(std::move(rec));
    if (eventHistory.size() > kMaxEventHistory)
    {
        // Trim oldest entries
        eventHistory.erase(eventHistory.begin(), eventHistory.begin() + (eventHistory.size() - kMaxEventHistory));
    }
}
