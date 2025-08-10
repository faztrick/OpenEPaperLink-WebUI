/**
 * @file wifi_utils.cpp
 * @brief Optimized WiFi utilities for OpenEPaperLink ESP32 AP-Flasher
 *
 * This file provides centralized WiFi functionality without duplicate serial command handling.
 * Serial commands are handled by SerialCommandHandler which uses this class for WiFi operations.
 *
 * Key Features:
 * - Thread-safe WiFi scanning with mutex protection
 * - Async WiFi operations with rate limiting
 * - Unified connection management and configuration
 * - Optimized memory usage and performance
 * - Improv protocol support for WiFi provisioning
 *
 * @author OpenEPaperLink Contributors
 * @version Optimized and restructured implementation
 */

#include <ArduinoJson.h>
#include <ETH.h>
#include <Preferences.h>
#include <WiFi.h>
#include <esp_wifi.h>
#include <esp_wifi_types.h>

#include "common_utils.h"
#include "storage_utils.h"
#include "wifi_utils.h"

// Include project dependencies
#ifdef HAS_IPS_DISPLAY
#include "ips_display.h"
#endif
#include "newproto.h"
#include "serialap.h"  // Include for AP state checking
#include "system.h"
#include "tag_db.h"
#include "udp.h"
#include "web.h"

// ============================================================================
// Static Variables and Global Instance
// ============================================================================
WiFiUtils* WiFiUtils::instance = nullptr;
SemaphoreHandle_t WiFiUtils::scanMutex = nullptr;
uint32_t WiFiUtils::lastScanTime = 0;
bool WiFiUtils::scanInProgress = false;
uint8_t WiFiUtils::apClients = 0;

// Global instance for compatibility
WiFiUtils& wifiUtils = WiFiUtils::getInstance();

// External buffers for improv protocol
uint8_t x_buffer[100];
uint8_t x_position = 0;

// Disconnect tracking for spam prevention
static uint32_t lastDisconnectTime = 0;
static uint8_t disconnectReason = 0;
static uint8_t consecutiveAuthFailures = 0;

#if defined(ETHERNET_PHY_POWER) && defined(ETHERNET_PHY_MDC) && defined(ETHERNET_PHY_MDIO) && defined(ETHERNET_PHY_TYPE) && defined(ETHERNET_CLK_MODE)
static bool eth_init = false;
static bool eth_connected = false;
static bool eth_ip_ok = false;
static long eth_timeout = 0;
#endif

// ============================================================================
// Display Support Functions
// ============================================================================
#ifdef HAS_TFT
extern void TFTLog(String text);
#else
// Stub function if not compiled with display support
inline void TFTLog(String text) {
    // Stub implementation - could be disabled for performance
    // Serial.println("TFTLog: " + text);
}
#endif

// ============================================================================
// Singleton Pattern Implementation
// ============================================================================
WiFiUtils& WiFiUtils::getInstance() {
    if (!instance) {
        instance = new WiFiUtils();
    }
    return *instance;
}

// ============================================================================
// Constructor and Initialization
// ============================================================================
WiFiUtils::WiFiUtils() {
    if (!scanMutex) {
        scanMutex = xSemaphoreCreateMutex();
    }

    // Initialize connection management variables
    _reconnectIntervalCheck = 5000;
    _retryIntervalCheck = 5 * 60000;
    _connectionTimeout = WIFI_CONNECT_TIMEOUT_MS;

    _nextReconnectCheck = 0;
    _connected = false;
    _savewhensuccessfull = false;
    _initialized = false;

    // Initialize buffer to prevent undefined behavior
    memset(serialBuffer, 0, sizeof(serialBuffer));
    serialIndex = 0;
    _ssid = "";
    _APstarted = false;
    wifiStatus = NOINIT;

    WiFi.onEvent(WiFiEvent);
    setupDisconnectHandler();
}

void WiFiUtils::setupDisconnectHandler() {
    WiFiEventId_t eventID = WiFi.onEvent([](WiFiEvent_t event, WiFiEventInfo_t info) {
        uint32_t now = millis();
        uint8_t reason = info.wifi_sta_disconnected.reason;

        // Rate limit disconnect messages - only log if different reason or enough time passed
        if (reason != disconnectReason || (now - lastDisconnectTime) > DISCONNECT_RATE_LIMIT_MS) {
            SAFE_LOG("WiFi lost connection. Reason: %d - ", reason);

            // Print human-readable disconnect reason and handle auto-recovery
            switch (reason) {
                case WIFI_REASON_AUTH_EXPIRE:
                    Serial.println("Auth expired");
                    break;
                case WIFI_REASON_AUTH_LEAVE:
                    Serial.println("Auth leave");
                    break;
                case WIFI_REASON_ASSOC_EXPIRE:
                    Serial.println("Assoc expired");
                    break;
                case WIFI_REASON_ASSOC_TOOMANY:
                    Serial.println("Too many associations");
                    break;
                case WIFI_REASON_NOT_AUTHED:
                    consecutiveAuthFailures++;
                    Serial.println("Not authenticated");
                    if (consecutiveAuthFailures >= MAX_AUTH_FAILURES) {
                        Serial.println("❌ Too many auth failures - starting AP mode");
                        WiFiUtils::getInstance().startManagementServer();
                        consecutiveAuthFailures = 0;
                    }
                    break;
                case WIFI_REASON_NOT_ASSOCED:
                    Serial.println("Not associated");
                    break;
                case WIFI_REASON_BEACON_TIMEOUT:
                    Serial.println("Beacon timeout");
                    break;
                case WIFI_REASON_HANDSHAKE_TIMEOUT:
                    Serial.println("Handshake timeout");
                    break;
                case WIFI_REASON_4WAY_HANDSHAKE_TIMEOUT:
                    consecutiveAuthFailures++;
                    Serial.println("4-way handshake timeout (WPA/WPA2 authentication failed)");
                    if (consecutiveAuthFailures >= MAX_HANDSHAKE_FAILURES) {
                        Serial.println("❌ Repeated handshake failures - starting AP mode");
                        WiFiUtils::getInstance().startManagementServer();
                        consecutiveAuthFailures = 0;
                    }
                    break;
                case 201:
                    Serial.println("Authentication failure (check password)");
                    consecutiveAuthFailures++;
                    break;
                default:
                    Serial.println("Unknown reason");
                    consecutiveAuthFailures++;
                    Serial.println(reason);
                    if (consecutiveAuthFailures >= MAX_AUTH_FAILURES) {
                        Serial.println("❌ Too many failures - starting AP mode");
                        WiFiUtils::getInstance().startManagementServer();
                        consecutiveAuthFailures = 0;
                    }
                    break;
            }

            lastDisconnectTime = now;
            disconnectReason = reason;
        }

        // Reset consecutive counter if different error type (but keep counting auth and handshake failures)
        if (reason != WIFI_REASON_NOT_AUTHED && reason != WIFI_REASON_4WAY_HANDSHAKE_TIMEOUT && reason != 201) {
            consecutiveAuthFailures = 0;
        }
    },
                                         WiFiEvent_t::ARDUINO_EVENT_WIFI_STA_DISCONNECTED);
}

// ========================================================================
// OPTIMIZED WIFI SCANNING
// ========================================================================

bool WiFiUtils::performAsyncScan(bool showHidden, uint32_t maxWaitMs) {
    if (!scanMutex) return false;

    // Prevent concurrent scans
    if (xSemaphoreTake(scanMutex, pdMS_TO_TICKS(100)) != pdTRUE) {
        return false;
    }

    // Rate limiting - don't scan more than once every 25 seconds
    uint32_t now = millis();
    if (now - lastScanTime < SCAN_RATE_LIMIT_MS && lastScanTime > 0) {
        xSemaphoreGive(scanMutex);
        return false;
    }

    // Ensure WiFi is in correct mode for scanning
    wifi_mode_t currentMode = WiFi.getMode();
    if (currentMode == WIFI_OFF) {
        WiFi.mode(WIFI_STA);
        delay(100);
    } else if (currentMode == WIFI_AP) {
        WiFi.mode(WIFI_AP_STA);
        delay(100);
    }

    // Clear previous results and start new scan
    WiFi.scanDelete();
    int16_t result = WiFi.scanNetworks(true, showHidden);  // Async scan

    if (result == WIFI_SCAN_RUNNING) {
        scanInProgress = true;
        lastScanTime = now;
        xSemaphoreGive(scanMutex);
        return true;
    }

    xSemaphoreGive(scanMutex);
    return false;
}

WiFiScanResult WiFiUtils::getScanResults(bool clearAfter) {
    WiFiScanResult result;
    result.success = false;
    result.scanInProgress = false;
    result.networksFound = 0;

    int16_t scanResult = WiFi.scanComplete();
    result.scanInProgress = (scanResult == WIFI_SCAN_RUNNING);

    if (scanResult > 0) {
        result.success = true;
        result.networksFound = scanResult;

        // Build networks array
        for (int i = 0; i < scanResult && i < MAX_WIFI_NETWORKS; i++) {
            WiFiNetworkInfo network;
            network.ssid = WiFi.SSID(i);
            network.rssi = WiFi.RSSI(i);
            network.channel = WiFi.channel(i);
            network.encryption = WiFi.encryptionType(i);
            network.bssid = WiFi.BSSIDstr(i);
            result.networks.push_back(network);
        }

        // Sort by signal strength (strongest first)
        std::sort(result.networks.begin(), result.networks.end(),
                  [](const WiFiNetworkInfo& a, const WiFiNetworkInfo& b) {
                      return a.rssi > b.rssi;
                  });

        if (clearAfter) {
            WiFi.scanDelete();
            scanInProgress = false;
        }
    } else if (scanResult == WIFI_SCAN_FAILED) {
        result.success = false;
        result.errorMessage = "Scan failed";
        scanInProgress = false;
    }

    return result;
}

String WiFiUtils::buildScanResultsJson(bool clearAfter) {
    WiFiScanResult scanResult = getScanResults(clearAfter);

    DynamicJsonDocument doc(4096);
    doc["success"] = scanResult.success;
    doc["scanInProgress"] = scanResult.scanInProgress;
    doc["networksFound"] = scanResult.networksFound;
    doc["lastScanTime"] = lastScanTime;

    // Add scanstatus for frontend compatibility (-1 = scanning, 0+ = complete)
    doc["scanstatus"] = scanResult.scanInProgress ? -1 : scanResult.networksFound;

    if (!scanResult.errorMessage.isEmpty()) {
        doc["error"] = scanResult.errorMessage;
    }

    JsonArray networks = doc["networks"].to<JsonArray>();
    for (const auto& network : scanResult.networks) {
        JsonObject net = networks.createNestedObject();
        net["ssid"] = network.ssid;
        net["rssi"] = network.rssi;
        net["channel"] = network.channel;
        net["encryption"] = WiFiHelpers::authModeToString(network.encryption);
        net["enc"] = WiFiHelpers::authModeToInt(network.encryption);  // Numeric for frontend compatibility
        net["bssid"] = network.bssid;
        net["quality"] = WiFiHelpers::calculateSignalQuality(network.rssi);
    }

    String json;
    serializeJson(doc, json);
    return json;
}

WiFiConnectionInfo WiFiUtils::getConnectionInfo() {
    WiFiConnectionInfo info;
    info.connected = (WiFi.status() == WL_CONNECTED);
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
    info.apClients = WiFi.softAPgetStationNum();
    info.apIP = WiFi.softAPIP().toString();
    return info;
}

String WiFiUtils::getConnectionInfoJson() {
    WiFiConnectionInfo info = getConnectionInfo();

    DynamicJsonDocument doc(1024);
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
    doc["apClients"] = info.apClients;
    doc["apIP"] = info.apIP;
    doc["quality"] = WiFiHelpers::calculateSignalQuality(info.rssi);

    String json;
    serializeJson(doc, json);
    return json;
}

bool WiFiUtils::isScanning() {
    return scanInProgress || (WiFi.scanComplete() == WIFI_SCAN_RUNNING);
}

void WiFiUtils::cleanup() {
    if (scanMutex) {
        if (xSemaphoreTake(scanMutex, pdMS_TO_TICKS(1000)) == pdTRUE) {
            WiFi.scanDelete();
            scanInProgress = false;
            xSemaphoreGive(scanMutex);
        }
    }
}

// ========================================================================
// CONNECTION MANAGEMENT
// ========================================================================

bool WiFiUtils::connectToWifi() {
#if defined(ETHERNET_PHY_POWER) && defined(ETHERNET_PHY_MDC) && defined(ETHERNET_PHY_MDIO) && defined(ETHERNET_PHY_TYPE) && defined(ETHERNET_CLK_MODE)
    if (wifiStatus == ETHERNET || eth_connected)
        return true;
#endif

    WiFiConfig config = loadConfig();
    _ssid = config.ssid;
    _pass = config.password;

    SAFE_LOG("WiFi Config - SSID: '%s', Password length: %d\n", _ssid.c_str(), _pass.length());

    if (_ssid.isEmpty()) {
        terminalLog("No connection info saved");
        startManagementServer();
        return false;
    }
    terminalLog("ssid: " + String(_ssid));

    // Configure static IP if available
    if (config.hasStaticIP) {
        IPAddress staticIP, subnetMask, gatewayIP, dnsIP;
        if (staticIP.fromString(config.ip) && subnetMask.fromString(config.mask) && gatewayIP.fromString(config.gateway)) {
            if (!config.dns.isEmpty() && dnsIP.fromString(config.dns)) {
                WiFi.config(staticIP, gatewayIP, subnetMask, dnsIP);
            } else {
                WiFi.config(staticIP, gatewayIP, subnetMask);
            }
            terminalLog("Setting static IP: " + config.ip);
        } else {
            Serial.println("WARNING: Invalid static IP configuration, using DHCP");
        }
    }

    // Set hostname
    String hostname = config.hostname.isEmpty() ? WiFiHelpers::buildHostname("OpenEpaperLink") : config.hostname;
    WiFi.setHostname(hostname.c_str());
    WiFi.mode(WIFI_STA);

    // ESP32-S3 WiFi optimizations
    esp_err_t ret = esp_wifi_set_ps(WIFI_PS_NONE);  // Disable power saving for better performance
    if (ret != ESP_OK) {
        SAFE_LOG("WARNING: Failed to set WiFi power save mode: %s\n", esp_err_to_name(ret));
    }

    if (!WiFi.setTxPower(WIFI_POWER_19_5dBm)) {  // Set optimal power for ESP32-S3
        Serial.println("WARNING: Failed to set WiFi TX power");
    }

    WiFi.begin(_ssid.c_str(), _pass.c_str());
    terminalLog("Connecting to " + _ssid);

    _connected = waitForConnection();
    return _connected;
}

bool WiFiUtils::connectToWifi(String ssid, String pass, bool savewhensuccessfull) {
    _ssid = ssid;
    _pass = pass;
    _savewhensuccessfull = savewhensuccessfull;

    WiFi.disconnect();
    delay(100);

    String hostname = WiFiHelpers::buildHostname("OpenEpaperLink");
    WiFi.setHostname(hostname.c_str());
    WiFi.mode(WIFI_STA);
    WiFi.begin(_ssid.c_str(), _pass.c_str());

    terminalLog("Connecting to " + _ssid);

    _connected = waitForConnection();
    return _connected;
}

bool WiFiUtils::waitForConnection() {
#if defined(ETHERNET_PHY_POWER) && defined(ETHERNET_PHY_MDC) && defined(ETHERNET_PHY_MDIO) && defined(ETHERNET_PHY_TYPE) && defined(ETHERNET_CLK_MODE)
    if (wifiStatus == ETHERNET)
        return true;
#endif

    unsigned long timeout = millis() + _connectionTimeout;
    wifiStatus = WAIT_CONNECTING;
    wl_status_t lastStatus = WL_IDLE_STATUS;

    while (WiFi.status() != WL_CONNECTED) {
        if (millis() > timeout) {
            wl_status_t currentStatus = WiFi.status();
            SAFE_LOG("WiFi connection timeout. Final status: %d\n", currentStatus);

            switch (currentStatus) {
                case WL_NO_SSID_AVAIL:
                    terminalLog("!WiFi Error: SSID not found");
                    break;
                case WL_CONNECT_FAILED:
                    terminalLog("!WiFi Error: Connection failed (wrong password?)");
                    break;
                case WL_CONNECTION_LOST:
                    terminalLog("!WiFi Error: Connection lost during handshake");
                    break;
                case WL_DISCONNECTED:
                    terminalLog("!WiFi Error: Disconnected");
                    break;
                default:
                    terminalLog("!Unable to connect to WiFi - timeout");
                    break;
            }

            startManagementServer();
            return false;
        }

        wl_status_t currentStatus = WiFi.status();
        if (currentStatus != lastStatus) {
            SAFE_LOG("WiFi status changed: %d -> %d\n", lastStatus, currentStatus);
            lastStatus = currentStatus;
        }

        vTaskDelay(pdMS_TO_TICKS(250));
    }

    // Save credentials if requested
    if (_savewhensuccessfull) {
        WiFiConfig config;
        config.ssid = _ssid;
        config.password = _pass;
        config.hostname = WiFi.getHostname();

        if (saveConfig(config)) {
            Serial.println("✅ WiFi credentials saved successfully");
        } else {
            Serial.println("❌ ERROR: Failed to save WiFi credentials");
        }
        _savewhensuccessfull = false;
    }

    // Configure WiFi for optimal performance
    WiFi.setAutoReconnect(true);
    WiFi.persistent(true);

    WiFiConnectionInfo connectedInfo = getConnectionInfo();
    terminalLog("✅ Connected! IP: " + connectedInfo.ip);
    SAFE_LOG("WiFi connected successfully - IP: %s, RSSI: %d dBm\n",
             connectedInfo.ip.c_str(), connectedInfo.rssi);

    _nextReconnectCheck = millis() + _reconnectIntervalCheck;
    wifiStatus = CONNECTED;
    return true;
}

void WiFiUtils::startManagementServer() {
    if (!_APstarted && wifiStatus != ETHERNET) {
        terminalLog("Starting config AP, ssid: OpenEPaperLink");

        // Disable auto-reconnect to prevent interference with AP mode
        WiFi.setAutoReconnect(false);
        WiFi.disconnect(true, true);
        vTaskDelay(pdMS_TO_TICKS(500));

        WiFi.mode(WIFI_AP_STA);

        esp_err_t ret = esp_wifi_set_ps(WIFI_PS_NONE);
        if (ret != ESP_OK) {
            SAFE_LOG("WARNING: Failed to set AP power save mode: %s\n", esp_err_to_name(ret));
        }

        if (!WiFi.setTxPower(WIFI_POWER_19_5dBm)) {
            Serial.println("WARNING: Failed to set AP TX power");
        }

        if (!WiFi.softAP("OpenEPaperLink", "", 1, false, 8)) {
            Serial.println("ERROR: Failed to start WiFi AP");
            return;
        }

        if (!WiFi.softAPsetHostname("OpenEPaperLink")) {
            Serial.println("WARNING: Failed to set AP hostname");
        }

        ret = esp_wifi_set_bandwidth(WIFI_IF_AP, WIFI_BW_HT20);
        if (ret != ESP_OK) {
            SAFE_LOG("WARNING: Failed to set AP bandwidth: %s\n", esp_err_to_name(ret));
        }

        IPAddress IP = WiFi.softAPIP();
        terminalLog("✅ AP Started! Connect to it, visit http://" + String(IP.toString().c_str()) + "/setup");
        SAFE_LOG("AP Mode: IP=%s, MAC=%s\n", IP.toString().c_str(), WiFi.softAPmacAddress().c_str());

        _APstarted = true;
        _nextReconnectCheck = millis() + _retryIntervalCheck;
        wifiStatus = AP;
    }
}

void WiFiUtils::poll() {
    // Handle GPIO0 reset functionality
    if (digitalRead(0) == LOW) {
        Serial.println("GPIO0 LOW detected");
        unsigned long starttime = millis();
        while (digitalRead(0) == LOW && millis() - starttime < 5000) {
            vTaskDelay(pdMS_TO_TICKS(10));
        }
        if (digitalRead(0) == LOW) {
            Serial.println("Resetting WiFi settings...");

            if (factoryReset()) {
                Serial.println("✅ WiFi settings cleared successfully");
            } else {
                Serial.println("❌ Failed to clear WiFi settings");
            }

            wifi_init_config_t cfg = WIFI_INIT_CONFIG_DEFAULT();
            esp_err_t ret = esp_wifi_init(&cfg);
            if (ret == ESP_OK || ret == ESP_ERR_WIFI_NOT_INIT) {
                vTaskDelay(pdMS_TO_TICKS(2000));
                ret = esp_wifi_restore();
                if (ret != ESP_OK) {
                    SAFE_LOG("WiFi restore failed: %s\n", esp_err_to_name(ret));
                } else {
                    Serial.println("✅ WiFi configurations cleared!");
                }
            } else {
                SAFE_LOG("WiFi init failed: %s\n", esp_err_to_name(ret));
            }

            vTaskDelay(pdMS_TO_TICKS(100));
            ESP.restart();
        }
    }

    pollSerial();
}

void WiFiUtils::initEth() {
#if defined(ETHERNET_PHY_POWER) && defined(ETHERNET_PHY_MDC) && defined(ETHERNET_PHY_MDIO) && defined(ETHERNET_PHY_TYPE) && defined(ETHERNET_CLK_MODE)
    if (!eth_init) {
        eth_init = true;
        ETH.begin(
            ETH_PHY_ADDR,
            ETHERNET_PHY_POWER,
            ETHERNET_PHY_MDC,
            ETHERNET_PHY_MDIO,
            ETHERNET_PHY_TYPE,
            ETHERNET_CLK_MODE,
            false);
    }
#endif
}

IPAddress WiFiUtils::localIP() {
    if (wifiStatus == ETHERNET) {
        return ETH.localIP();
    } else {
        return WiFi.localIP();
    }
}

// ========================================================================
// CONFIGURATION MANAGEMENT
// ========================================================================

WiFiConfig WiFiUtils::loadConfig() {
    WiFiConfig config;
    Preferences prefs;

    if (prefs.begin("wifi", true)) {
        config.ssid = prefs.getString("ssid", "");
        config.password = prefs.getString("password", "");
        config.hostname = prefs.getString("hostname", "OpenEPaperLink-AP");
        config.ip = prefs.getString("ip", "");
        config.mask = prefs.getString("mask", "255.255.255.0");
        config.gateway = prefs.getString("gateway", "");
        config.dns = prefs.getString("dns", "8.8.8.8");
        config.hasStaticIP = !config.ip.isEmpty();
        prefs.end();
    }

    return config;
}

bool WiFiUtils::saveConfig(const WiFiConfig& config) {
    Preferences prefs;

    if (prefs.begin("wifi", false)) {
        prefs.putString("ssid", config.ssid);
        prefs.putString("password", config.password);
        prefs.putString("hostname", config.hostname);

        if (config.hasStaticIP && !config.ip.isEmpty()) {
            prefs.putString("ip", config.ip);
            prefs.putString("mask", config.mask);
            prefs.putString("gateway", config.gateway);
            prefs.putString("dns", config.dns);
        } else {
            prefs.remove("ip");
            prefs.remove("mask");
            prefs.remove("gateway");
            prefs.remove("dns");
        }

        prefs.end();
        return true;
    }

    return false;
}

bool WiFiUtils::factoryReset() {
    Preferences prefs;

    if (prefs.begin("wifi", false)) {
        prefs.clear();
        prefs.end();
        return true;
    }

    return false;
}

bool WiFiUtils::hasStaticIP() {
    Preferences prefs;
    bool hasStatic = false;
    if (prefs.begin("wifi", true)) {
        hasStatic = prefs.getBool("hasStaticIP", false);
        prefs.end();
    }
    return hasStatic;
}

bool WiFiUtils::save() {
    WiFiConfig config = loadConfig();
    return saveConfig(config);
}

// ========================================================================
// JSON Configuration Methods
// ========================================================================

String WiFiUtils::getConfigAsJson() const {
    // Use StorageUtils to generate JSON configuration
    DynamicJsonDocument configDoc = WIFI_STORAGE.toJson();
    String jsonString;
    serializeJson(configDoc, jsonString);
    return jsonString;
}

bool WiFiUtils::loadConfigFromJson(const String& json) {
    DynamicJsonDocument doc(1024);
    DeserializationError error = deserializeJson(doc, json);

    if (error) {
        SAFE_LOG("Failed to parse JSON config: %s\n", error.c_str());
        return false;
    }

    // Use StorageUtils for configuration management
    StorageUtils::Result result = WIFI_STORAGE.fromJson(doc.as<JsonObject>());

    if (result == StorageUtils::Result::SUCCESS) {
        SAFE_LOG("Configuration loaded from JSON successfully\n");
        return true;
    } else {
        SAFE_LOG("Failed to save JSON configuration: %s\n",
                 StorageUtils::getInstance().resultToString(result).c_str());
        return false;
    }
}

bool WiFiUtils::saveConfigAsJson() {
    // Use StorageUtils to generate JSON configuration
    DynamicJsonDocument configDoc = WIFI_STORAGE.toJson();
    String jsonConfig;
    serializeJson(configDoc, jsonConfig);

    SAFE_LOG("Configuration exported as JSON: %s\n", jsonConfig.c_str());
    return true;
}

// ========================================================================
// PRIVATE HELPER METHODS
// ========================================================================

void WiFiUtils::terminalLog(String text) {
    Serial.println("WiFi: " + text);
#ifdef HAS_TFT
    TFTLog(text);
#else
    TFTLog(text);
#endif
}

void WiFiUtils::pollSerial() {
    // Improv WiFi serial protocol handling would go here
    // This is a simplified version - full implementation would handle the protocol
}

void WiFiUtils::WiFiEvent(WiFiEvent_t event) {
    switch (event) {
        case ARDUINO_EVENT_WIFI_STA_GOT_IP:
            SAFE_LOG("WiFi connected! IP: %s\n", WiFi.localIP().toString().c_str());
            apClients = 0;
            break;
        case ARDUINO_EVENT_WIFI_STA_DISCONNECTED:
            Serial.println("WiFi disconnected!");
            break;
        case ARDUINO_EVENT_WIFI_AP_STACONNECTED:
            apClients++;
            SAFE_LOG("AP client connected. Total clients: %d\n", apClients);
            break;
        case ARDUINO_EVENT_WIFI_AP_STADISCONNECTED:
            if (apClients > 0) apClients--;
            SAFE_LOG("AP client disconnected. Total clients: %d\n", apClients);
            break;
        default:
            break;
    }
}

// ========================================================================
// IMPROV PROTOCOL IMPLEMENTATION (simplified)
// ========================================================================

void set_state(improv::State state) {
    std::vector<uint8_t> data = {'I', 'M', 'P', 'R', 'O', 'V'};
    data.resize(11);
    data[6] = improv::IMPROV_SERIAL_VERSION;
    data[7] = improv::TYPE_CURRENT_STATE;
    data[8] = 1;
    data[9] = state;

    uint8_t checksum = 0x00;
    for (uint8_t d : data)
        checksum += d;
    data[10] = checksum;

    Serial.write(data.data(), data.size());
}

void send_response(std::vector<uint8_t>& response) {
    std::vector<uint8_t> data = {'I', 'M', 'P', 'R', 'O', 'V'};
    data.resize(9);
    data[6] = improv::IMPROV_SERIAL_VERSION;
    data[7] = improv::TYPE_RPC_RESPONSE;
    data[8] = response.size();
    data.insert(data.end(), response.begin(), response.end());

    uint8_t checksum = 0x00;
    for (uint8_t d : data)
        checksum += d;
    data.push_back(checksum);

    Serial.write(data.data(), data.size());
}

void set_error(improv::Error error) {
    std::vector<uint8_t> data = {'I', 'M', 'P', 'R', 'O', 'V'};
    data.resize(11);
    data[6] = improv::IMPROV_SERIAL_VERSION;
    data[7] = improv::TYPE_ERROR_STATE;
    data[8] = 1;
    data[9] = error;

    uint8_t checksum = 0x00;
    for (uint8_t d : data)
        checksum += d;
    data[10] = checksum;

    Serial.write(data.data(), data.size());
}

void getAvailableWifiNetworks() {
    Serial.println("Starting WiFi network scan for Improv protocol...");
    WiFiUtils& wifiUtils = WiFiUtils::getInstance();

    bool scanStarted = wifiUtils.performAsyncScan(true, 5000);
    if (!scanStarted) {
        Serial.println("ERROR: Failed to start WiFi scan");
        std::vector<uint8_t> data = improv::build_rpc_response(improv::GET_WIFI_NETWORKS, std::vector<std::string>{}, false);
        send_response(data);
        return;
    }

    uint32_t startTime = millis();
    const uint32_t maxWaitTime = 10000;

    while (wifiUtils.isScanning() && (millis() - startTime) < maxWaitTime) {
        vTaskDelay(pdMS_TO_TICKS(100));
    }

    WiFiScanResult scanResult = wifiUtils.getScanResults(false);

    if (scanResult.success && scanResult.networksFound > 0) {
        SAFE_LOG("WiFi scan completed: %d networks found\n", scanResult.networksFound);

        int maxNetworks = std::min(scanResult.networksFound, 30);
        for (int i = 0; i < maxNetworks && i < scanResult.networks.size(); i++) {
            const WiFiNetworkInfo& network = scanResult.networks[i];

            if (network.ssid.length() == 0 || network.ssid.length() > 32) continue;

            String authStatus = (network.encryption == WIFI_AUTH_OPEN) ? "NO" : "YES";

            std::vector<uint8_t> data = improv::build_rpc_response(
                improv::GET_WIFI_NETWORKS,
                {network.ssid, String(network.rssi), authStatus},
                false);
            send_response(data);

            vTaskDelay(pdMS_TO_TICKS(2));
        }
    } else {
        Serial.println("No WiFi networks found during scan or scan failed");
    }

    std::vector<uint8_t> data = improv::build_rpc_response(improv::GET_WIFI_NETWORKS, std::vector<std::string>{}, false);
    send_response(data);

    Serial.println("WiFi network scan completed for Improv protocol");
}

bool onCommandCallback(improv::ImprovCommand cmd) {
    switch (cmd.command) {
        case improv::Command::WIFI_SETTINGS: {
            if (cmd.ssid.empty() || cmd.password.empty()) {
                set_error(improv::ERROR_INVALID_RPC);
                return false;
            }

            set_state(improv::STATE_PROVISIONING);

            WiFiUtils& wifiUtils = WiFiUtils::getInstance();
            if (wifiUtils.connectToWifi(String(cmd.ssid.c_str()), String(cmd.password.c_str()), true)) {
                set_state(improv::STATE_PROVISIONED);
                std::vector<uint8_t> data = improv::build_rpc_response(improv::WIFI_SETTINGS, std::vector<std::string>{"http://192.168.1.1"}, false);
                send_response(data);
            } else {
                set_state(improv::STATE_STOPPED);
                set_error(improv::Error::ERROR_UNABLE_TO_CONNECT);
            }
            break;
        }

        case improv::Command::GET_DEVICE_INFO: {
            std::vector<std::string> infos = {
                "OpenEPaperLink",
                BUILD_VERSION,
                "ESP32_AP-Flasher",
                "Access Point"};
            std::vector<uint8_t> data = improv::build_rpc_response(improv::GET_DEVICE_INFO, infos, false);
            send_response(data);
            break;
        }

        case improv::Command::GET_WIFI_NETWORKS: {
            getAvailableWifiNetworks();
            break;
        }

        default: {
            set_error(improv::ERROR_UNKNOWN_RPC);
            return false;
        }
    }

    return true;
}

void onErrorCallback(improv::Error err) {
    set_error(err);
}

// ========================================================================
// IMPROV PROTOCOL PARSING (simplified implementation)
// ========================================================================

namespace improv {

ImprovCommand parse_improv_data(const std::vector<uint8_t>& data, bool check_checksum) {
    return parse_improv_data(data.data(), data.size(), check_checksum);
}

ImprovCommand parse_improv_data(const uint8_t* data, size_t length, bool check_checksum) {
    ImprovCommand improv_command;
    Command command = (Command)data[0];
    uint8_t data_length = data[1];

    if (data_length != length - 2 - check_checksum) {
        improv_command.command = UNKNOWN;
        return improv_command;
    }

    if (check_checksum) {
        uint8_t checksum = data[length - 1];
        uint32_t calculated_checksum = 0;
        for (uint8_t i = 0; i < length - 1; i++) {
            calculated_checksum += data[i];
        }

        if ((uint8_t)calculated_checksum != checksum) {
            improv_command.command = BAD_CHECKSUM;
            return improv_command;
        }
    }

    if (command == WIFI_SETTINGS) {
        uint8_t ssid_length = data[2];
        uint8_t ssid_start = 3;
        size_t ssid_end = ssid_start + ssid_length;

        uint8_t pass_length = data[ssid_end];
        size_t pass_start = ssid_end + 1;
        size_t pass_end = pass_start + pass_length;

        std::string ssid(data + ssid_start, data + ssid_end);
        std::string password(data + pass_start, data + pass_end);
        return {WIFI_SETTINGS, ssid, password};
    }

    improv_command.command = command;
    return improv_command;
}

std::vector<uint8_t> build_rpc_response(Command command, const std::vector<std::string>& datum, bool add_checksum) {
    std::vector<uint8_t> out;
    uint32_t length = 0;
    out.push_back(command);
    for (auto str : datum) {
        uint8_t len = str.length();
        length += len + 1;
        out.push_back(len);
        out.insert(out.end(), str.begin(), str.end());
    }
    out.insert(out.begin() + 1, length);

    if (add_checksum) {
        uint32_t calculated_checksum = 0;
        for (uint8_t byte : out) {
            calculated_checksum += byte;
        }
        out.push_back(calculated_checksum);
    }
    return out;
}

std::vector<uint8_t> build_rpc_response(Command command, const std::vector<String>& datum, bool add_checksum) {
    std::vector<std::string> string_vec;
    for (auto str : datum) {
        string_vec.push_back(str.c_str());
    }
    return build_rpc_response(command, string_vec, add_checksum);
}

}  // namespace improv
