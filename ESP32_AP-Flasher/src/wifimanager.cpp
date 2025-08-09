/*
 * WifiManager.cpp - Optimized WiFi management for ESP32-S3
 *
 * Key optimizations implemented:
 * - Enhanced error handling with detailed disconnect reasons
 * - Improved NVS storage management with proper error checking
 * - ESP32-S3 specific power and performance optimizations
 * - Better memory management in WiFi scanning
 * - Optimized connection timeouts and retry logic
 * - Proper WiFi configuration validation
 * - Enhanced AP mode with better client handling
 * - Improved serial interface polling
 *
 * ESP32-S3 specific features:
 * - WIFI_PS_NONE for better performance
 * - WIFI_POWER_19_5dBm optimal power setting
 * - PMF (Protected Management Frames) capability
 * - Optimized scan parameters for faster network discovery
 * - Enhanced bandwidth configuration for AP mode
 */

#include "wifimanager.h"

#include <ETH.h>
#include <Preferences.h>
#include <WiFi.h>
#include <esp_wifi.h>
#include <esp_wifi_types.h>

#include "storage_utils.cpp"  // Include new storage utilities
#include "wifi_utils.h"       // Use centralized WiFi utilities

#ifdef HAS_IPS_DISPLAY
#include "ips_display.h"
#endif
#include "newproto.h"
#include "system.h"
#include "tag_db.h"
#include "udp.h"
#include "web.h"

// Stub function if not compiled with display support
#ifdef HAS_TFT
extern void TFTLog(String text);
#else
void TFTLogStub(String text) {
    // Stub implementation
    Serial.println("TFTLog: " + text);
}
#endif

uint8_t WifiManager::apClients = 0;
uint8_t x_buffer[100];
uint8_t x_position = 0;

// Global WifiManager instance
WifiManager wm;

#if defined(ETHERNET_PHY_POWER) && defined(ETHERNET_PHY_MDC) && defined(ETHERNET_PHY_MDIO) && defined(ETHERNET_PHY_TYPE) && defined(ETHERNET_CLK_MODE)
static bool eth_init = false;
static bool eth_connected = false;
static bool eth_ip_ok = false;
static long eth_timeout = 0;
#endif

WifiManager::WifiManager() {
    _reconnectIntervalCheck = 5000;
    _retryIntervalCheck = 5 * 60000;
    _connectionTimeout = 20000;  // Increased timeout for ESP32-S3

    _nextReconnectCheck = 0;
    _connected = false;
    _savewhensuccessfull = false;

    // Initialize buffer to prevent undefined behavior
    memset(serialBuffer, 0, sizeof(serialBuffer));
    _ssid = "";
    _APstarted = false;
    wifiStatus = NOINIT;

    WiFi.onEvent(WiFiEvent);
    WiFiEventId_t eventID = WiFi.onEvent([](WiFiEvent_t event, WiFiEventInfo_t info) {
        Serial.printf("WiFi lost connection. Reason: %d - ", info.wifi_sta_disconnected.reason);
        // Print human-readable disconnect reason
        switch (info.wifi_sta_disconnected.reason) {
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
                Serial.println("Not authenticated");
                break;
            case WIFI_REASON_NOT_ASSOCED:
                Serial.println("Not associated");
                break;
            case WIFI_REASON_ASSOC_LEAVE:
                Serial.println("Association leave");
                break;
            case WIFI_REASON_BEACON_TIMEOUT:
                Serial.println("Beacon timeout");
                break;
            case WIFI_REASON_NO_AP_FOUND:
                Serial.println("No AP found");
                break;
            case WIFI_REASON_AUTH_FAIL:
                Serial.println("Auth failed");
                break;
            case WIFI_REASON_ASSOC_FAIL:
                Serial.println("Association failed");
                break;
            case WIFI_REASON_HANDSHAKE_TIMEOUT:
                Serial.println("Handshake timeout");
                break;
            default:
                Serial.printf("Unknown reason: %d\n", info.wifi_sta_disconnected.reason);
                break;
        }
    },
                                         WiFiEvent_t::ARDUINO_EVENT_WIFI_STA_DISCONNECTED);
}

void WifiManager::terminalLog(String text) {
    Serial.println(text);
#ifdef HAS_TFT
#ifdef HAS_TFT
    TFTLog(text);
#else
    TFTLogStub(text);
#endif
#endif
}

void WifiManager::poll() {
#if defined(ETHERNET_PHY_POWER) && defined(ETHERNET_PHY_MDC) && defined(ETHERNET_PHY_MDIO) && defined(ETHERNET_PHY_TYPE) && defined(ETHERNET_CLK_MODE)

    if (eth_connected) {
        wifiStatus = ETHERNET;
        if (!eth_ip_ok && eth_timeout != 0 && millis() - eth_timeout > 2000) {
            eth_timeout = 0;
            eth_connected = false;
        }
    } else if (!eth_connected && wifiStatus == ETHERNET) {
        wifiStatus = NOINIT;
        _APstarted = false;
        WiFi.mode(WIFI_STA);
        connectToWifi();
    }

#endif

    // Optimized WiFi reconnection logic
    if (wifiStatus == AP && millis() > _nextReconnectCheck && !_ssid.isEmpty()) {
        if (apClients == 0) {
            terminalLog("Attempting to reconnect to WiFi (no AP clients).");
            logLine("Attempting to reconnect to WiFi.");
            _APstarted = false;
            wifiStatus = NOINIT;
            connectToWifi();
        } else {
            // Extend retry interval when clients are connected
            _nextReconnectCheck = millis() + _retryIntervalCheck;
        }
    }

    // Enhanced connection monitoring
    if (wifiStatus == CONNECTED && millis() > _nextReconnectCheck) {
        wl_status_t wifiStatus = WiFi.status();
        if (wifiStatus != WL_CONNECTED) {
            _connected = false;
            Serial.printf("WiFi connection lost (status: %d). Attempting to reconnect.\n", wifiStatus);
            terminalLog("WiFi connection lost. Attempting to reconnect.");
            logLine("WiFi connection lost. Attempting to reconnect.");

            // Use WiFi.reconnect() first, then full reconnect if needed
            WiFi.reconnect();
            _connected = waitForConnection();

            if (!_connected) {
                Serial.println("Reconnect failed, trying full connection process");
                connectToWifi();
            }
        } else {
            _nextReconnectCheck = millis() + _reconnectIntervalCheck;
        }
    }

#ifndef HAS_USB

#ifdef ETHERNET_CLK_MODE
    if (!(ETHERNET_CLK_MODE == ETH_CLOCK_GPIO0_IN || ETHERNET_CLK_MODE == ETH_CLOCK_GPIO0_OUT)) {
#endif
        // Handle GPIO0 reset functionality
        if (digitalRead(0) == LOW) {
            Serial.println("GPIO0 LOW detected");
            unsigned long starttime = millis();
            while (digitalRead(0) == LOW && millis() - starttime < 5000) {
                vTaskDelay(pdMS_TO_TICKS(10));  // Small delay to prevent tight loop
            }
            if (digitalRead(0) == LOW) {
                Serial.println("Resetting WiFi settings...");

                // Use new WiFi storage manager for factory reset
                WiFiStorageManager &wifiStorage = WIFI_STORAGE;
                StorageUtils::Result result = wifiStorage.factoryReset();

                if (result == StorageUtils::SUCCESS) {
                    Serial.println("✅ WiFi settings cleared successfully");
                } else {
                    Serial.println("❌ Failed to clear WiFi settings");
                }

                // Clear ESP32 WiFi config
                wifi_init_config_t cfg = WIFI_INIT_CONFIG_DEFAULT();
                esp_err_t ret = esp_wifi_init(&cfg);
                if (ret == ESP_OK || ret == ESP_ERR_WIFI_NOT_INIT) {
                    vTaskDelay(pdMS_TO_TICKS(2000));

                    ret = esp_wifi_restore();
                    if (ret != ESP_OK) {
                        Serial.printf("WiFi restore failed: %s\n", esp_err_to_name(ret));
                    } else {
                        Serial.println("✅ WiFi configurations cleared!");
                    }
                } else {
                    Serial.printf("WiFi init failed: %s\n", esp_err_to_name(ret));
                }

                vTaskDelay(pdMS_TO_TICKS(100));
                ESP.restart();
            }
        }
#ifdef ETHERNET_CLK_MODE
    }
#endif

#endif

    pollSerial();
}

void WifiManager::initEth() {
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

bool WifiManager::connectToWifi() {
#if defined(ETHERNET_PHY_POWER) && defined(ETHERNET_PHY_MDC) && defined(ETHERNET_PHY_MDIO) && defined(ETHERNET_PHY_TYPE) && defined(ETHERNET_CLK_MODE)
    if (wifiStatus == ETHERNET || eth_connected)
        return true;
#endif

    // Use new WiFi storage manager for configuration
    WiFiStorageManager &wifiStorage = WIFI_STORAGE;
    WiFiStorageManager::WiFiConfig config = wifiStorage.loadConfig();

    _ssid = config.ssid.isEmpty() ? WiFi_SSID() : config.ssid;
    _pass = config.password.isEmpty() ? WiFi_psk() : config.password;

    // ESP32-S3 specific debug information
    Serial.printf("WiFi Config - SSID: '%s', Password length: %d\n", _ssid.c_str(), _pass.length());

    if (_ssid.isEmpty()) {
        terminalLog("No connection info saved");
        logLine("No connection information saved");
        startManagementServer();
        return false;
    }
    terminalLog("ssid: " + String(_ssid));

    // Configure static IP if available
    if (wifiStorage.hasStaticIP()) {
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

    _connected = connectToWifi(_ssid, _pass, false);
    return _connected;
}

bool WifiManager::connectToWifi(String ssid, String pass, bool savewhensuccessfull) {
#if defined(ETHERNET_PHY_POWER) && defined(ETHERNET_PHY_MDC) && defined(ETHERNET_PHY_MDIO) && defined(ETHERNET_PHY_TYPE) && defined(ETHERNET_CLK_MODE)
    if (wifiStatus == ETHERNET)
        return true;
#endif

    if (ssid.isEmpty()) {
        Serial.println("ERROR: Empty SSID provided");
        return false;
    }

    _ssid = ssid;
    _pass = pass;
    _savewhensuccessfull = savewhensuccessfull;

    _APstarted = false;

    // Proper WiFi disconnect and reset sequence
    WiFi.disconnect(true, true);
    vTaskDelay(pdMS_TO_TICKS(500));  // Allow time for disconnect
    WiFi.mode(WIFI_MODE_NULL);
    vTaskDelay(pdMS_TO_TICKS(200));

    // Set hostname before connecting
    String hostname = buildHostname(ESP_MAC_WIFI_STA);
    if (!WiFi.setHostname(hostname.c_str())) {
        Serial.printf("WARNING: Failed to set hostname: %s\n", hostname.c_str());
    }

    WiFi.mode(WIFI_STA);

    // ESP32-S3 Performance optimizations
    esp_err_t ret = esp_wifi_set_ps(WIFI_PS_NONE);  // Disable power saving for faster connection
    if (ret != ESP_OK) {
        Serial.printf("WARNING: Failed to set power save mode: %s\n", esp_err_to_name(ret));
    }

    ret = WiFi.setTxPower(WIFI_POWER_19_5dBm);  // Optimal power for ESP32-S3
    if (!ret) {
        Serial.println("WARNING: Failed to set TX power");
    }

    // Initialize WiFi with optimized configuration
    wifi_init_config_t wifi_init_cfg = WIFI_INIT_CONFIG_DEFAULT();
    wifi_init_cfg.nvs_enable = 1;  // Enable NVS storage
    ret = esp_wifi_init(&wifi_init_cfg);
    if (ret != ESP_OK && ret != ESP_ERR_WIFI_NOT_INIT) {
        Serial.printf("ERROR: WiFi init failed: %s\n", esp_err_to_name(ret));
        return false;
    }

    // Set WiFi storage to flash for persistence
    ret = esp_wifi_set_storage(WIFI_STORAGE_FLASH);
    if (ret != ESP_OK) {
        Serial.printf("WARNING: Failed to set WiFi storage: %s\n", esp_err_to_name(ret));
    }

    Serial.printf("WiFi optimizations applied for ESP32-S3 - SSID: %s\n", ssid.c_str());

    // Configure WiFi connection parameters
    wifi_config_t wifi_config;
    memset(&wifi_config, 0, sizeof(wifi_config));

    // Safely copy SSID and password
    strncpy((char *)wifi_config.sta.ssid, ssid.c_str(), sizeof(wifi_config.sta.ssid) - 1);
    wifi_config.sta.ssid[sizeof(wifi_config.sta.ssid) - 1] = '\0';

    strncpy((char *)wifi_config.sta.password, pass.c_str(), sizeof(wifi_config.sta.password) - 1);
    wifi_config.sta.password[sizeof(wifi_config.sta.password) - 1] = '\0';

    // Optimized scan and connection settings
    wifi_config.sta.scan_method = WIFI_FAST_SCAN;             // Fast scan method
    wifi_config.sta.sort_method = WIFI_CONNECT_AP_BY_SIGNAL;  // Connect to strongest signal
    wifi_config.sta.threshold.rssi = -127;                    // Accept any signal strength
    wifi_config.sta.threshold.authmode = WIFI_AUTH_OPEN;      // Accept any auth mode initially
    wifi_config.sta.pmf_cfg.capable = true;                   // Enable PMF capability
    wifi_config.sta.pmf_cfg.required = false;                 // But don't require it

    terminalLog("Connecting to WiFi with optimized settings...");
    WiFi.persistent(savewhensuccessfull);

    // Apply configuration and connect
    ret = esp_wifi_set_config(WIFI_IF_STA, &wifi_config);
    if (ret != ESP_OK) {
        Serial.printf("ERROR: Failed to set WiFi config: %s\n", esp_err_to_name(ret));
        return false;
    }

    ret = esp_wifi_connect();
    if (ret != ESP_OK) {
        Serial.printf("ERROR: WiFi connect failed: %s\n", esp_err_to_name(ret));
        return false;
    }

    _connected = waitForConnection();
    return _connected;
}

bool WifiManager::waitForConnection() {
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
            Serial.printf("WiFi connection timeout. Final status: %d\n", currentStatus);

            // Provide more detailed error information
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

            logLine("Unable to connect to WiFi");
            startManagementServer();
            return false;
        }

        // Log status changes for debugging
        wl_status_t currentStatus = WiFi.status();
        if (currentStatus != lastStatus) {
            Serial.printf("WiFi status changed: %d -> %d\n", lastStatus, currentStatus);
            lastStatus = currentStatus;
        }

        vTaskDelay(pdMS_TO_TICKS(250));
    }

    // Save credentials if requested
    if (_savewhensuccessfull) {
        // Use new WiFi storage manager for credential saving
        WiFiStorageManager &wifiStorage = WIFI_STORAGE;
        Serial.printf("Saving WiFi credentials - SSID: '%s'\n", _ssid.c_str());

        StorageUtils::Result ssidResult = wifiStorage.setSSID(_ssid);
        StorageUtils::Result passResult = wifiStorage.setPassword(_pass);

        if (ssidResult == StorageUtils::SUCCESS && passResult == StorageUtils::SUCCESS) {
            Serial.println("✅ WiFi credentials saved successfully");
        } else {
            Serial.println("❌ ERROR: Failed to save WiFi credentials");
        }
        _savewhensuccessfull = false;
    }

    // Configure WiFi for optimal performance
    WiFi.setAutoReconnect(true);
    WiFi.persistent(true);

    // Use centralized WiFi utilities for connection info
    WiFiConnectionInfo connectedInfo = WiFiUtils::getInstance().getConnectionInfo();
    terminalLog("✅ Connected! IP: " + connectedInfo.ip);
    Serial.printf("WiFi connected successfully - IP: %s, RSSI: %d dBm\n",
                  connectedInfo.ip.c_str(), connectedInfo.rssi);

    _nextReconnectCheck = millis() + _reconnectIntervalCheck;
    wifiStatus = CONNECTED;
    return true;
}

void WifiManager::startManagementServer() {
    if (!_APstarted && wifiStatus != ETHERNET) {
        terminalLog("Starting config AP, ssid: OpenEPaperLink");
        logLine("Starting configuration AP, ssid OpenEPaperLink");

        // Proper disconnect sequence
        WiFi.disconnect(true, true);
        vTaskDelay(pdMS_TO_TICKS(200));

        // Optimized WiFi settings for ESP32-S3 AP mode
        WiFi.mode(WIFI_AP_STA);  // Use dual mode to allow scanning while in AP mode

        // Configure WiFi performance settings
        esp_err_t ret = esp_wifi_set_ps(WIFI_PS_NONE);  // Disable power saving for better performance
        if (ret != ESP_OK) {
            Serial.printf("WARNING: Failed to set AP power save mode: %s\n", esp_err_to_name(ret));
        }

        if (!WiFi.setTxPower(WIFI_POWER_19_5dBm)) {  // Set optimal power for ESP32-S3
            Serial.println("WARNING: Failed to set AP TX power");
        }

        // Pre-configure scan settings for when users request WiFi networks
        wifi_scan_config_t scanConf;
        memset(&scanConf, 0, sizeof(scanConf));
        scanConf.ssid = NULL;
        scanConf.bssid = NULL;
        scanConf.channel = 0;
        scanConf.show_hidden = true;
        scanConf.scan_type = WIFI_SCAN_TYPE_ACTIVE;
        scanConf.scan_time.active.min = 100;  // Faster scan timing
        scanConf.scan_time.active.max = 300;

        // Start AP with optimized settings
        if (!WiFi.softAP("OpenEPaperLink", "", 1, false, 8)) {  // Allow up to 8 connections
            Serial.println("ERROR: Failed to start WiFi AP");
            return;
        }

        if (!WiFi.softAPsetHostname("OpenEPaperLink")) {
            Serial.println("WARNING: Failed to set AP hostname");
        }

        // Set optimal bandwidth for AP mode
        ret = esp_wifi_set_bandwidth(WIFI_IF_AP, WIFI_BW_HT20);
        if (ret != ESP_OK) {
            Serial.printf("WARNING: Failed to set AP bandwidth: %s\n", esp_err_to_name(ret));
        }

        IPAddress IP = WiFi.softAPIP();
        terminalLog("✅ AP Started! Connect to it, visit http://" + String(IP.toString().c_str()) + "/setup");
        Serial.printf("AP Mode: IP=%s, MAC=%s\n", IP.toString().c_str(), WiFi.softAPmacAddress().c_str());

        _APstarted = true;
        _nextReconnectCheck = millis() + _retryIntervalCheck;
        wifiStatus = AP;
    }
}

String WifiManager::buildHostname(esp_mac_type_t mac_type) {
    char hostname[32] = "OpenEpaperLink-";
    uint8_t mac[6];
    esp_read_mac(mac, mac_type);
    char lastTwoBytes[5];
    snprintf(lastTwoBytes, sizeof(lastTwoBytes), "%02X%02X", mac[4], mac[5]);

    // Use safe string concatenation with bounds checking
    size_t currentLen = strlen(hostname);
    size_t remaining = sizeof(hostname) - currentLen - 1;
    if (strlen(lastTwoBytes) <= remaining) {
        strncat(hostname, lastTwoBytes, remaining);
    }

    if (config.alias[0] != '\0') {
        // Reset hostname to use alias instead
        memset(hostname, 0, sizeof(hostname));
        int len = strlen(config.alias);
        int j = 0;
        for (int i = 0; i < len && j < (int)(sizeof(hostname) - 1); i++) {
            char c = config.alias[i];
            if ((c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c == '-') {
                hostname[j] = c;
                j++;
            }
        }
        hostname[j] = '\0';
    }
    return String(hostname);
}

IPAddress WifiManager::localIP() {
    if (wifiStatus == ETHERNET) {
        return ETH.localIP();
    } else {
        return WiFi.localIP();
    }
}

String WifiManager::WiFi_SSID() {
    wifi_config_t conf;
    esp_wifi_get_config(WIFI_IF_STA, &conf);
    return String(reinterpret_cast<const char *>(conf.sta.ssid));
}

String WifiManager::WiFi_psk() {
    if (WiFiGenericClass::getMode() == WIFI_MODE_NULL) {
        return String();
    }
    wifi_config_t conf;
    esp_wifi_get_config(WIFI_IF_STA, &conf);
    return String(reinterpret_cast<char *>(conf.sta.password));
}

void WifiManager::pollSerial() {
    while (Serial.available() > 0) {
        char receivedChar = Serial.read();

        if (parse_improv_serial_byte(x_position, receivedChar, x_buffer, onCommandCallback, onErrorCallback)) {
            x_buffer[x_position++] = receivedChar;
            if (x_position > 100) {
                x_position = 0;
                Serial.println("buffer full!");
            }
        } else {
            x_position = 0;
        }
    }
}

void WifiManager::WiFiEvent(WiFiEvent_t event) {
    Serial.printf("[WiFi-event %d] ", event);
    String eventname = "";

    switch (event) {
        case ARDUINO_EVENT_WIFI_STA_CONNECTED:
            eventname = "Connected to access point";
            break;
        case ARDUINO_EVENT_WIFI_STA_DISCONNECTED:
            // eventname = "Disconnected from WiFi access point";
            break;
        case ARDUINO_EVENT_WIFI_STA_AUTHMODE_CHANGE:
            eventname = "Authentication mode of access point has changed";
            break;
        case ARDUINO_EVENT_WIFI_STA_GOT_IP: {
            // Use centralized WiFi utilities for IP info in events
            WiFiConnectionInfo eventInfo = WiFiUtils::getInstance().getConnectionInfo();
            eventname = "Obtained IP address: " + eventInfo.ip;
            init_udp();
            break;
        }
        case ARDUINO_EVENT_WIFI_STA_LOST_IP:
            eventname = "Lost IP address and IP address is reset to 0";
            break;

        case ARDUINO_EVENT_WIFI_AP_START:
            // eventname = "WiFi access point started";
            break;
        case ARDUINO_EVENT_WIFI_AP_STOP:
            // eventname = "WiFi access point stopped";
            break;
        case ARDUINO_EVENT_WIFI_AP_STACONNECTED:
            apClients++;
            // eventname = "Client connected";
            break;
        case ARDUINO_EVENT_WIFI_AP_STADISCONNECTED:
            apClients--;
            // eventname = "Client disconnected";
            break;
        case ARDUINO_EVENT_WIFI_AP_STAIPASSIGNED:
            // eventname = "Assigned IP address to client";
            break;

#if defined(ETHERNET_PHY_POWER) && defined(ETHERNET_PHY_MDC) && defined(ETHERNET_PHY_MDIO) && defined(ETHERNET_PHY_TYPE) && defined(ETHERNET_CLK_MODE)

        case ARDUINO_EVENT_ETH_START:
            eventname = "ETH Started";
            // set eth hostname here
            ETH.setHostname(buildHostname(ESP_MAC_ETH).c_str());
            eth_timeout = 0;
            break;
        case ARDUINO_EVENT_ETH_CONNECTED:
            eventname = "ETH Connected";
            WiFi.mode(WIFI_MODE_NULL);
            WiFi.disconnect();
            eth_connected = true;
            eth_timeout = millis();
            break;
        case ARDUINO_EVENT_ETH_GOT_IP:
            if (ETH.fullDuplex()) {
                eventname = "ETH MAC: " + ETH.macAddress() + ", IPv4: " + ETH.localIP().toString() + ", FULL_DUPLEX, " + ETH.linkSpeed() + "Mbps";
            } else {
                eventname = "ETH MAC: " + ETH.macAddress() + ", IPv4: " + ETH.localIP().toString() + ", " + ETH.linkSpeed() + "Mbps";
            }
            eth_ip_ok = true;
            init_udp();
            eth_timeout = 0;
            break;
        case ARDUINO_EVENT_ETH_DISCONNECTED:
            eventname = "ETH Disconnected";
            eth_connected = false;
            eth_ip_ok = false;
            eth_timeout = 0;
            break;
        case ARDUINO_EVENT_ETH_STOP:
            eventname = "ETH Stopped";
            eth_connected = false;
            eth_ip_ok = false;
            eth_timeout = 0;
            break;

#endif

        default:
            break;
    }
    if (eventname) terminalLog(eventname);
    // logLine("WiFi event [" + String(event) + "]: " + eventname);
}

// *** Improv
// https :  // github.com/jnthas/improv-wifi-demo

#define STR_IMPL(x) #x
#define STR(x) STR_IMPL(x)

#ifndef BUILD_ENV_NAME
#define BUILD_ENV_NAME unknown
#endif
#ifndef BUILD_TIME
#define BUILD_TIME 0
#endif
#ifndef BUILD_VERSION
#define BUILD_VERSION custom
#endif

std::vector<std::string> getLocalUrl() {
    // Use centralized WiFi utilities for IP info
    WiFiConnectionInfo urlInfo = WiFiUtils::getInstance().getConnectionInfo();
    return {String("http://" + urlInfo.ip).c_str()};
}

void onErrorCallback(improv::Error err) {
}

bool onCommandCallback(improv::ImprovCommand cmd) {
    switch (cmd.command) {
        case improv::Command::GET_CURRENT_STATE: {
            if ((WiFi.status() == WL_CONNECTED)) {
                set_state(improv::State::STATE_PROVISIONED);
                std::vector<uint8_t> data = improv::build_rpc_response(improv::GET_CURRENT_STATE, getLocalUrl(), false);
                send_response(data);
            } else {
                set_state(improv::State::STATE_AUTHORIZED);
            }
            break;
        }

        case improv::Command::WIFI_SETTINGS: {
            if (cmd.ssid.length() == 0) {
                set_error(improv::Error::ERROR_INVALID_RPC);
                break;
            }

            set_state(improv::STATE_PROVISIONING);

            ws.enable(false);
            refreshAllPending();
            saveDB("/current/tagDB.json");
            ws.closeAll();
            delay(100);
            if (wm.connectToWifi(String(cmd.ssid.c_str()), String(cmd.password.c_str()), true)) {
                // Use new WiFi storage manager for improv credentials
                WiFiStorageManager &wifiStorage = WIFI_STORAGE;
                wifiStorage.setSSID(cmd.ssid.c_str());
                wifiStorage.setPassword(cmd.password.c_str());
                ws.enable(true);

                set_state(improv::STATE_PROVISIONED);
                std::vector<uint8_t> data = improv::build_rpc_response(improv::WIFI_SETTINGS, getLocalUrl(), false);
                send_response(data);
            } else {
                set_state(improv::STATE_STOPPED);
                set_error(improv::Error::ERROR_UNABLE_TO_CONNECT);
            }

            break;
        }

        case improv::Command::GET_DEVICE_INFO: {
            std::vector<std::string> infos = {
                // Firmware name
                "OpenEPaperLink",
                // Firmware version
                STR(BUILD_VERSION),
                // Hardware chip/variant
                STR(BUILD_ENV_NAME),
                // Device name
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

void getAvailableWifiNetworks() {
    Serial.println("Starting WiFi network scan for Improv protocol...");

    // Use centralized WiFi utilities for consistent scanning
    WiFiUtils &wifiUtils = WiFiUtils::getInstance();

    // Start async scan
    bool scanStarted = wifiUtils.performAsyncScan(true, 5000);
    if (!scanStarted) {
        Serial.println("ERROR: Failed to start WiFi scan");
        std::vector<uint8_t> data = improv::build_rpc_response(improv::GET_WIFI_NETWORKS, std::vector<std::string>{}, false);
        send_response(data);
        return;
    }

    // Wait for scan completion with timeout
    uint32_t startTime = millis();
    const uint32_t maxWaitTime = 10000;  // 10 seconds max wait

    while (wifiUtils.isScanning() && (millis() - startTime) < maxWaitTime) {
        vTaskDelay(pdMS_TO_TICKS(100));
    }

    // Get scan results
    WiFiScanResult scanResult = wifiUtils.getScanResults(false);

    if (scanResult.success && scanResult.networksFound > 0) {
        Serial.printf("WiFi scan completed: %d networks found\n", scanResult.networksFound);

        // Send sorted results (WiFiUtils already sorts by signal strength)
        int maxNetworks = std::min(scanResult.networksFound, 30);
        for (int i = 0; i < maxNetworks && i < scanResult.networks.size(); i++) {
            const WiFiNetworkInfo &network = scanResult.networks[i];

            if (network.ssid.length() == 0 || network.ssid.length() > 32) continue;

            // Use centralized encryption string conversion
            String authStatus = (network.encryption == WIFI_AUTH_OPEN) ? "NO" : "YES";

            // Build response with enhanced info
            std::vector<uint8_t> data = improv::build_rpc_response(
                improv::GET_WIFI_NETWORKS,
                {network.ssid, String(network.rssi), authStatus},
                false);
            send_response(data);

            // Small delay to prevent overwhelming the serial interface
            vTaskDelay(pdMS_TO_TICKS(2));
        }
    } else {
        Serial.println("No WiFi networks found during scan or scan failed");
    }

    // Send final empty response to indicate scan completion
    std::vector<uint8_t> data = improv::build_rpc_response(improv::GET_WIFI_NETWORKS, std::vector<std::string>{}, false);
    send_response(data);

    Serial.println("WiFi network scan completed for Improv protocol");
}

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

void send_response(std::vector<uint8_t> &response) {
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

// **** improv ****

namespace improv {

ImprovCommand parse_improv_data(const std::vector<uint8_t> &data, bool check_checksum) {
    return parse_improv_data(data.data(), data.size(), check_checksum);
}

ImprovCommand parse_improv_data(const uint8_t *data, size_t length, bool check_checksum) {
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
        return {.command = command, .ssid = ssid, .password = password};
    }

    improv_command.command = command;
    return improv_command;
}

bool parse_improv_serial_byte(size_t position, uint8_t byte, const uint8_t *buffer,
                              std::function<bool(ImprovCommand)> &&callback, std::function<void(Error)> &&on_error) {
    if (position == 0)
        return byte == 'I';
    if (position == 1)
        return byte == 'M';
    if (position == 2)
        return byte == 'P';
    if (position == 3)
        return byte == 'R';
    if (position == 4)
        return byte == 'O';
    if (position == 5)
        return byte == 'V';

    if (position == 6)
        return byte == IMPROV_SERIAL_VERSION;

    if (position <= 8)
        return true;

    uint8_t type = buffer[7];
    uint8_t data_len = buffer[8];

    if (position <= 8 + data_len)
        return true;

    if (position == 8 + data_len + 1) {
        uint8_t checksum = 0x00;
        for (size_t i = 0; i < position; i++)
            checksum += buffer[i];

        if (checksum != byte) {
            on_error(ERROR_INVALID_RPC);
            return false;
        }

        if (type == TYPE_RPC) {
            auto command = parse_improv_data(&buffer[9], data_len, false);
            return callback(command);
        }
    }

    return false;
}

std::vector<uint8_t> build_rpc_response(Command command, const std::vector<std::string> &datum, bool add_checksum) {
    std::vector<uint8_t> out;
    uint32_t length = 0;
    out.push_back(command);
    for (const auto &str : datum) {
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

std::vector<uint8_t> build_rpc_response(Command command, const std::vector<String> &datum, bool add_checksum) {
    std::vector<uint8_t> out;
    uint32_t length = 0;
    out.push_back(command);
    for (const auto &str : datum) {
        uint8_t len = str.length();
        length += len;
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

}  // namespace improv
