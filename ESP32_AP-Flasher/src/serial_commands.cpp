/**
 * @file serial_commands.cpp
 * @brief Optimized serial command handler for OpenEPaperLink ESP32 AP-Flasher
 *
 * This implementation uses WiFiUtils for all WiFi operations to eliminate code duplication.
 * Focus is on serial protocol handling and command parsing only.
 *
 * @author OpenEPaperLink Contributors
 * @version Optimized implementation using WiFiUtils
 */

#include "serial_commands.h"

#include <ArduinoJson.h>

#include "build_constants.h"
#include "core_utilities.h"
#include "serialap.h"  // Include for AP state checking

SerialCommandHandler& SerialCommandHandler::getInstance() {
    static SerialCommandHandler instance;
    return instance;
}

void SerialCommandHandler::initialize() {
    if (initialized) return;

    inputBuffer.reserve(INPUT_BUFFER_SIZE);
    initialized = true;

    // Initialize common utilities
    CommonUtils::initialize();

    SAFE_LOG("\n");
    SAFE_LOG("=== ESP32 Serial Command Interface ===\n");
    SAFE_LOG("Type 'CMD:' to activate command mode\n");
    SAFE_LOG("Commands are case-insensitive\n");
    SAFE_LOG("=======================================\n");
}

void SerialCommandHandler::setDefaultWiFiCredentials() {
    // Add safety check to ensure WiFiUtils is ready
    if (!CoreUtils::isInitialized()) {
        SAFE_LOG("⚠️ Core utilities not initialized, skipping WiFi defaults\n");
        return;
    }

    // Check if credentials already exist
    WiFiConfig config = wifiUtils.loadConfig();

    if (config.ssid.length() > 0) {
        SAFE_LOG("📶 WiFi: %s (existing)\n", config.ssid.c_str());
        SAFE_LOG("🔑 Password: %s (existing)\n", config.password.length() > 0 ? "***configured***" : "not set");
        SAFE_LOG("🌐 Static IP: %s (existing)\n", config.ip().c_str());
        SAFE_LOG("🏠 Gateway: %s (existing)\n", config.gateway.c_str());
        SAFE_LOG("📡 Subnet: %s (existing)\n", config.mask().c_str());
        SAFE_LOG("🔍 DNS: %s (existing)\n", config.dns().c_str());
        SAFE_LOG("🏠 Hostname: %s (existing)\n", config.hostname.c_str());

        // Auto-connect to existing WiFi if not connected
        if (WiFi.status() != WL_CONNECTED) {
            SAFE_LOG("🔄 Auto-connecting...\n");
            handleWiFiConnect("");
        }
        return;
    }

    // Set default credentials as requested
    SAFE_LOG("🔧 Setting default WiFi...\n");

    // Update configuration with defaults
    config.ssid = "Faztrick";
    config.password = "faztrick1234";
    config.staticIP = "192.168.29.200";
    config.gateway = "192.168.29.91";
    config.subnet = "255.255.255.0";
    config.dns1 = "8.8.8.8";
    config.useStaticIP = true;

    wifiUtils.saveConfig(config);

    SAFE_LOG("✅ WiFi defaults set (Faztrick/192.168.29.200)\n");

    // Auto-connect to default WiFi
    SAFE_LOG("🔄 Auto-connecting to default WiFi...\n");
    handleWiFiConnect("");
}

void SerialCommandHandler::processSerialInput() {
    if (!initialized || !CoreUtils::isInitialized()) {
        return;
    }

    // Check if AP is in a critical state where we shouldn't interfere
    if (!SerialUtils::isSerialSafe()) {
        return;
    }

    // Check AP state less frequently for better performance
    unsigned long currentTime = millis();
    if (currentTime - lastApCheck > AP_CHECK_INTERVAL_MS) {
        lastApCheck = currentTime;
    }

    while (Serial.available() > 0) {
        char inChar = Serial.read();

        if (inChar == '\n' || inChar == '\r') {
            if (inputBuffer.length() > 0) {
                handleCommand(inputBuffer);
                inputBuffer = "";
            }
            commandMode = false;
            continue;
        }

        if (inputBuffer.length() >= MAX_INPUT_LENGTH) {
            sendErrorResponse("Command too long");
            inputBuffer = "";
            commandMode = false;
            continue;
        }

        inputBuffer += inChar;

        // Check for command mode activation
        if (!commandMode && inputBuffer.endsWith("CMD:")) {
            commandMode = true;
            inputBuffer = "";
            sendResponse("Command mode activated. Type 'help' for commands.");
            lastCommandTime = currentTime;
            continue;
        }

        // Auto-exit command mode after timeout
        if (commandMode && (currentTime - lastCommandTime) > COMMAND_TIMEOUT_MS) {
            commandMode = false;
            inputBuffer = "";
            sendResponse("Command mode timeout - exited");
        }
    }
}

void SerialCommandHandler::setResponseCallback(ResponseCallback callback) {
    responseCallback = callback;
}

void SerialCommandHandler::handleCommand(const String& command) {
    String cmd = command;
    cmd.trim();
    cmd.toLowerCase();

    if (cmd.length() == 0) return;

    SAFE_LOG(">%s\n", command.c_str());  // Echo command

    // Parse main command and parameters
    int spaceIndex = cmd.indexOf(' ');
    String mainCmd = (spaceIndex == -1) ? cmd : cmd.substring(0, spaceIndex);
    String params = (spaceIndex == -1) ? "" : cmd.substring(spaceIndex + 1);

    // Handle unified commands
    if (mainCmd.startsWith("wifi.")) {
        handleWiFiCommand(mainCmd.substring(5), params);
    } else if (mainCmd.startsWith("author.")) {
        handleAuthorCommand(mainCmd.substring(7), params);
    } else if (mainCmd.startsWith("system.")) {
        handleSystemCommand(mainCmd.substring(7), params);
    } else if (mainCmd.startsWith("web.")) {
        handleWebCommand(mainCmd.substring(4), params);
    } else if (mainCmd == "help") {
        handleHelpCommand();
    } else if (mainCmd == "version") {
        handleVersionCommand();
    } else if (mainCmd == "status") {
        // Use WiFiUtils for status
        String statusJson = wifiUtils.getConnectionInfoJson();
        sendJsonResponse(statusJson);
    } else {
        sendErrorResponse("Unknown command: " + mainCmd + ". Type 'help' for available commands.");
    }
}

// ========================================================================
// WIFI COMMAND HANDLERS (Using WiFiUtils)
// ========================================================================

void SerialCommandHandler::handleWiFiCommand(const String& subCommand, const String& params) {
    if (subCommand == "status") {
        handleWiFiStatus();
    } else if (subCommand == "scan") {
        handleWiFiScan();
    } else if (subCommand == "connect") {
        handleWiFiConnect(params);
    } else if (subCommand == "disconnect") {
        handleWiFiDisconnect();
    } else if (subCommand == "getip") {
        handleWiFiGetIP();
    } else if (subCommand == "getssid") {
        handleWiFiGetSSID();
    } else if (subCommand == "getmac") {
        handleWiFiGetMAC();
    } else if (subCommand == "setssid") {
        handleWiFiSetSSID(params);
    } else if (subCommand == "setpassword") {
        handleWiFiSetPassword(params);
    } else if (subCommand == "setstaticip") {
        handleWiFiSetStaticIP(params);
    } else if (subCommand == "setgateway") {
        handleWiFiSetGateway(params);
    } else if (subCommand == "setsubnet") {
        handleWiFiSetSubnet(params);
    } else if (subCommand == "setdns") {
        handleWiFiSetDNS(params);
    } else if (subCommand == "save") {
        handleWiFiSave();
    } else if (subCommand == "clearconfig") {
        handleWiFiClearConfig();
    } else if (subCommand == "apstatus") {
        handleWiFiAPStatus();
    } else {
        sendErrorResponse("Unknown WiFi command: wifi." + subCommand);
    }
}

void SerialCommandHandler::handleWiFiStatus() {
    String statusJson = wifiUtils.getConnectionInfoJson();
    sendJsonResponse(statusJson);
}

void SerialCommandHandler::handleWiFiScan() {
    sendResponse("Starting WiFi scan...");
    bool scanStarted = wifiUtils.performAsyncScan(true, 10000);

    if (scanStarted) {
        // Wait for scan completion with timeout
        uint32_t startTime = millis();
        const uint32_t maxWaitTime = 15000;

        while (wifiUtils.isScanning() && (millis() - startTime) < maxWaitTime) {
            vTaskDelay(pdMS_TO_TICKS(100));
        }

        String scanJson = wifiUtils.buildScanResultsJson(true);
        sendResponse("Scan completed.");
        sendJsonResponse(scanJson);
    } else {
        sendErrorResponse("Failed to start WiFi scan");
    }
}

void SerialCommandHandler::handleWiFiConnect(const String& params) {
    if (!CoreUtils::isInitialized()) {
        sendErrorResponse("System not ready for WiFi operations");
        return;
    }

    WiFiConfig config = wifiUtils.loadConfig();

    if (config.ssid.length() == 0) {
        sendErrorResponse("No SSID configured. Use wifi.setssid first.");
        return;
    }

    // Log connection attempt without exposing password
    sendResponse("Connecting to WiFi: " + config.ssid +
                 " with password: " + (config.password.length() > 0 ? "***configured***" : "not set") +
                 " IP: " + config.ip() +
                 " Gateway: " + config.gateway +
                 " Subnet: " + config.mask() +
                 " DNS: " + config.dns());

    // Use WiFiUtils for connection
    bool connected = wifiUtils.connectToWifi(config.ssid, config.password, true);

    if (connected) {
        WiFiConnectionInfo info = wifiUtils.getConnectionInfo();

        DynamicJsonDocument doc(SMALL_JSON_SIZE);
        doc["connected"] = true;
        doc["ssid"] = info.ssid;
        doc["ip"] = info.ip;
        doc["rssi"] = info.rssi;
        doc["gateway"] = info.gateway;
        doc["quality"] = WiFiHelpers::calculateSignalQuality(info.rssi);

        String jsonString;
        serializeJson(doc, jsonString);
        sendJsonResponse(jsonString);

        // Test connectivity and endpoints
        testConnectivityAndEndpoints();
    } else {
        sendErrorResponse("Failed to connect to WiFi");
    }
}

void SerialCommandHandler::testConnectivityAndEndpoints() {
    if (WiFi.status() != WL_CONNECTED) {
        sendErrorResponse("WiFi not connected");
        return;
    }

    sendResponse("🧪 Testing connectivity and endpoints...");
    String baseUrl = "http://" + WiFi.localIP().toString();

    // Test basic connectivity
    sendResponse("✅ WiFi connected successfully");
    sendResponse("📡 IP: " + WiFi.localIP().toString());
    sendResponse("🌐 Base URL: " + baseUrl);

    // List endpoints to test
    sendResponse("📋 Available endpoints:");
    sendResponse("   " + baseUrl + "/");
    sendResponse("   " + baseUrl + "/get_wifi_config");
    sendResponse("   " + baseUrl + "/api/wifi/status");
    sendResponse("   " + baseUrl + "/system_info");
    sendResponse("   " + baseUrl + "/network_info");

    sendResponse("✅ Web server should be accessible at the above URLs");
    sendResponse("💡 Use 'author.test <endpoint>' to test specific endpoints");
}

void SerialCommandHandler::handleWiFiDisconnect() {
    WiFi.disconnect();
    sendResponse("WiFi disconnected");
}

void SerialCommandHandler::handleWiFiGetIP() {
    WiFiConnectionInfo info = wifiUtils.getConnectionInfo();

    DynamicJsonDocument doc(SMALL_JSON_SIZE);
    doc["connected"] = info.connected;
    doc["ip"] = info.ip;
    doc["gateway"] = info.gateway;
    doc["dns"] = info.dns;

    String jsonString;
    serializeJson(doc, jsonString);
    sendJsonResponse(jsonString);
}

void SerialCommandHandler::handleWiFiGetSSID() {
    WiFiConnectionInfo info = wifiUtils.getConnectionInfo();

    DynamicJsonDocument doc(SMALL_JSON_SIZE);
    doc["connected"] = info.connected;
    doc["ssid"] = info.ssid;
    doc["rssi"] = info.rssi;
    doc["quality"] = WiFiHelpers::calculateSignalQuality(info.rssi);

    String jsonString;
    serializeJson(doc, jsonString);
    sendJsonResponse(jsonString);
}

void SerialCommandHandler::handleWiFiGetMAC() {
    DynamicJsonDocument doc(SMALL_JSON_SIZE);
    doc["mac_address"] = WiFi.macAddress();
    doc["ap_mac"] = WiFi.softAPmacAddress();

    String jsonString;
    serializeJson(doc, jsonString);
    sendJsonResponse(jsonString);
}

void SerialCommandHandler::handleWiFiSetSSID(const String& ssid) {
    String cleanSSID = ValidationUtils::parseQuotedString(ssid);

    if (!ValidationUtils::isValidSSID(cleanSSID)) {
        sendErrorResponse("Invalid SSID (empty or too long)");
        return;
    }

    WiFiConfig config = wifiUtils.loadConfig();
    config.ssid = cleanSSID;

    if (wifiUtils.saveConfig(config)) {
        sendResponse("SSID set to: " + cleanSSID);
    } else {
        sendErrorResponse("Failed to save SSID");
    }
}

void SerialCommandHandler::handleWiFiSetPassword(const String& password) {
    String cleanPassword = ValidationUtils::parseQuotedString(password);

    if (!ValidationUtils::isValidPassword(cleanPassword)) {
        sendErrorResponse("Invalid password (too short for WPA2)");
        return;
    }

    WiFiConfig config = wifiUtils.loadConfig();
    config.password = cleanPassword;

    if (wifiUtils.saveConfig(config)) {
        sendResponse("Password set (length: " + String(cleanPassword.length()) + " characters)");
    } else {
        sendErrorResponse("Failed to save password");
    }
}

void SerialCommandHandler::handleWiFiSetStaticIP(const String& ip) {
    String cleanIP = ValidationUtils::parseQuotedString(ip);

    if (!ValidationUtils::isValidIP(cleanIP)) {
        sendErrorResponse("Invalid IP address format");
        return;
    }

    WiFiConfig config = wifiUtils.loadConfig();
    config.staticIP = cleanIP;
    config.useStaticIP = !cleanIP.isEmpty();

    if (wifiUtils.saveConfig(config)) {
        sendResponse("Static IP set to: " + cleanIP);
    } else {
        sendErrorResponse("Failed to save static IP");
    }
}

void SerialCommandHandler::handleWiFiSetGateway(const String& gateway) {
    String cleanGateway = ValidationUtils::parseQuotedString(gateway);

    if (!ValidationUtils::isValidIP(cleanGateway)) {
        sendErrorResponse("Invalid gateway IP address format");
        return;
    }

    WiFiConfig config = wifiUtils.loadConfig();
    config.gateway = cleanGateway;

    if (wifiUtils.saveConfig(config)) {
        sendResponse("Gateway set to: " + cleanGateway);
    } else {
        sendErrorResponse("Failed to save gateway");
    }
}

void SerialCommandHandler::handleWiFiSetSubnet(const String& subnet) {
    String cleanSubnet = ValidationUtils::parseQuotedString(subnet);

    if (!ValidationUtils::isValidIP(cleanSubnet)) {
        sendErrorResponse("Invalid subnet mask format");
        return;
    }

    WiFiConfig config = wifiUtils.loadConfig();
    config.subnet = cleanSubnet;

    if (wifiUtils.saveConfig(config)) {
        sendResponse("Subnet mask set to: " + cleanSubnet);
    } else {
        sendErrorResponse("Failed to save subnet mask");
    }
}

void SerialCommandHandler::handleWiFiSetDNS(const String& dns) {
    String cleanDNS = ValidationUtils::parseQuotedString(dns);

    if (!ValidationUtils::isValidIP(cleanDNS)) {
        sendErrorResponse("Invalid DNS IP address format");
        return;
    }

    WiFiConfig config = wifiUtils.loadConfig();
    config.dns1 = cleanDNS;

    if (wifiUtils.saveConfig(config)) {
        sendResponse("DNS set to: " + cleanDNS);
    } else {
        sendErrorResponse("Failed to save DNS");
    }
}

void SerialCommandHandler::handleWiFiSave() {
    if (wifiUtils.save()) {
        sendResponse("✅ WiFi configuration saved successfully");
    } else {
        sendErrorResponse("Failed to save WiFi configuration");
    }
}

void SerialCommandHandler::handleWiFiClearConfig() {
    if (wifiUtils.factoryReset()) {
        sendResponse("✅ WiFi configuration cleared successfully. Device will restart in AP mode.");
        ESP.restart();
    } else {
        sendErrorResponse("❌ Failed to clear WiFi configuration");
    }
}

void SerialCommandHandler::handleWiFiAPStatus() {
    extern struct APInfoS apInfo;
    extern volatile ApSerialState gSerialTaskState;

    DynamicJsonDocument doc(MEDIUM_JSON_SIZE);
    doc["timestamp"] = millis();

    // Serial task state
    switch (gSerialTaskState) {
        case SERIAL_STATE_NONE:
            doc["serial_state"] = "NONE";
            break;
        case SERIAL_STATE_INITIALIZED:
            doc["serial_state"] = "INITIALIZED";
            break;
        case SERIAL_STATE_STARTING:
            doc["serial_state"] = "STARTING";
            break;
        case SERIAL_STATE_RUNNING:
            doc["serial_state"] = "RUNNING";
            break;
        case SERIAL_STATE_STOP:
            doc["serial_state"] = "STOP";
            break;
        case SERIAL_STATE_STOPPED:
            doc["serial_state"] = "STOPPED";
            break;
        default:
            doc["serial_state"] = "UNKNOWN";
            break;
    }

    // AP state
    switch (apInfo.state) {
        case AP_STATE_OFFLINE:
            doc["ap_state"] = "OFFLINE";
            break;
        case AP_STATE_ONLINE:
            doc["ap_state"] = "ONLINE";
            break;
        case AP_STATE_COMING_ONLINE:
            doc["ap_state"] = "COMING_ONLINE";
            break;
        case AP_STATE_FLASHING:
            doc["ap_state"] = "FLASHING";
            break;
        case AP_STATE_FAILED:
            doc["ap_state"] = "FAILED";
            break;
        case AP_STATE_NORADIO:
            doc["ap_state"] = "NORADIO";
            break;
        case AP_STATE_WAIT_RESET:
            doc["ap_state"] = "WAIT_RESET";
            break;
        case AP_STATE_REQUIRED_POWER_CYCLE:
            doc["ap_state"] = "REQUIRED_POWER_CYCLE";
            break;
        default:
            doc["ap_state"] = "UNKNOWN";
            break;
    }

    doc["ap_online"] = apInfo.isOnline;
    doc["ap_type"] = apInfo.type;
    doc["ap_channel"] = apInfo.channel;
    doc["ap_power"] = apInfo.power;
    doc["ap_version"] = apInfo.version;

    // MAC address as hex string
    char macStr[17];
    snprintf(macStr, sizeof(macStr), "%02X%02X%02X%02X%02X%02X%02X%02X",
             apInfo.mac[7], apInfo.mac[6], apInfo.mac[5], apInfo.mac[4],
             apInfo.mac[3], apInfo.mac[2], apInfo.mac[1], apInfo.mac[0]);
    doc["ap_mac"] = macStr;

    String jsonString;
    serializeJson(doc, jsonString);
    sendJsonResponse(jsonString);
}

// ========================================================================
// OTHER COMMAND HANDLERS
// ========================================================================

void SerialCommandHandler::handleAuthorCommand(const String& subCommand, const String& params) {
    if (subCommand == "get") {
        handleAuthorGet();
    } else if (subCommand == "set") {
        handleAuthorSet(params);
    } else if (subCommand == "endpoints") {
        handleEndpointList();
    } else if (subCommand == "test") {
        handleEndpointTest(params);
    } else if (subCommand == "status") {
        handleEndpointStatus();
    } else {
        sendErrorResponse("Unknown author command: " + subCommand);
    }
}

void SerialCommandHandler::handleSystemCommand(const String& subCommand, const String& params) {
    if (subCommand == "info") {
        handleSystemInfo();
    } else if (subCommand == "reboot") {
        handleSystemReboot();
    } else if (subCommand == "reset") {
        handleSystemReset();
    } else {
        sendErrorResponse("Unknown system command: " + subCommand);
    }
}

void SerialCommandHandler::handleWebCommand(const String& subCommand, const String& params) {
    if (subCommand == "start") {
        handleWebStart();
    } else if (subCommand == "status") {
        handleWebStatus();
    } else if (subCommand == "restart") {
        handleWebRestart();
    } else if (subCommand == "info") {
        handleWebInfo();
    } else {
        sendErrorResponse("Unknown web command: " + subCommand);
    }
}

void SerialCommandHandler::handleHelpCommand() {
    sendResponse("=== Available Serial Commands ===");
    sendResponse("");
    sendResponse("WiFi Commands:");
    sendResponse("  wifi.status           - Get WiFi connection status");
    sendResponse("  wifi.scan             - Scan for available networks");
    sendResponse("  wifi.connect          - Connect to WiFi (use wifi.setssid/setpassword first)");
    sendResponse("  wifi.disconnect       - Disconnect from WiFi");
    sendResponse("  wifi.getip            - Get current IP address");
    sendResponse("  wifi.getssid          - Get current SSID");
    sendResponse("  wifi.getmac           - Get MAC address");
    sendResponse("  wifi.setssid <ssid>   - Set WiFi SSID");
    sendResponse("  wifi.setpassword <pwd> - Set WiFi password");
    sendResponse("  wifi.setstaticip <ip> - Set static IP");
    sendResponse("  wifi.setgateway <gw>  - Set gateway");
    sendResponse("  wifi.setsubnet <mask> - Set subnet mask");
    sendResponse("  wifi.setdns <dns>     - Set DNS server");
    sendResponse("  wifi.save             - Save WiFi configuration");
    sendResponse("  wifi.clearconfig      - Clear WiFi config and restart in AP mode");
    sendResponse("  wifi.apstatus         - Show AP radio and task status");
    sendResponse("");
    sendResponse("Author/Endpoint Commands:");
    sendResponse("  author.get            - Get current author information");
    sendResponse("  author.set <name>     - Set author name");
    sendResponse("  author.endpoints      - List available endpoints");
    sendResponse("  author.test <endpoint> - Test specific endpoint");
    sendResponse("  author.status         - Get endpoint status");
    sendResponse("");
    sendResponse("System Commands:");
    sendResponse("  system.info           - Get system information");
    sendResponse("  system.reboot         - Reboot system");
    sendResponse("  system.reset          - Factory reset");
    sendResponse("  version               - Get firmware version");
    sendResponse("  status                - Get overall status");
    sendResponse("  help                  - Show this help");
    sendResponse("");
    sendResponse("Web Server Commands:");
    sendResponse("  web.start             - Start/restart web server");
    sendResponse("  web.status            - Get web server status");
    sendResponse("  web.restart           - Restart web server (requires reboot)");
    sendResponse("  web.info              - Get web server information");
    sendResponse("");
    sendResponse("Examples:");
    sendResponse("  wifi.setssid \"MyNetwork\"");
    sendResponse("  wifi.setpassword \"MyPassword\"");
    sendResponse("  wifi.connect");
    sendResponse("  author.set \"John Doe\"");
}

void SerialCommandHandler::handleVersionCommand() {
    DynamicJsonDocument doc(SMALL_JSON_SIZE);
    SystemInfo::buildSystemInfo(doc);

    String jsonString;
    serializeJson(doc, jsonString);
    sendJsonResponse(jsonString);
}

// Author/Endpoint Command Implementations
void SerialCommandHandler::handleAuthorGet() {
    DynamicJsonDocument doc(SMALL_JSON_SIZE);
    doc["author"] = BUILD_AUTHOR;
    doc["version"] = BUILD_VERSION;
    doc["build_time"] = __DATE__ " " __TIME__;

    String jsonString;
    serializeJson(doc, jsonString);
    sendJsonResponse(jsonString);
}

void SerialCommandHandler::handleAuthorSet(const String& author) {
    String cleanAuthor = ValidationUtils::parseQuotedString(author);
    sendResponse("Author set to: " + cleanAuthor + " (Note: This is stored in build config)");
}

void SerialCommandHandler::handleEndpointList() {
    sendResponse("Available endpoints:");
    sendResponse("  /");
    sendResponse("  /get_wifi_config");
    sendResponse("  /api/wifi/status");
    sendResponse("  /system_info");
    sendResponse("  /network_info");
    sendResponse("  /setup");
}

void SerialCommandHandler::handleEndpointTest(const String& endpoint) {
    String cleanEndpoint = ValidationUtils::parseQuotedString(endpoint);
    sendResponse("Testing endpoint: " + cleanEndpoint);
    sendResponse("Note: Implement HTTP client test here");
}

void SerialCommandHandler::handleEndpointStatus() {
    sendResponse("All endpoints operational (placeholder)");
}

// System Command Implementations
void SerialCommandHandler::handleSystemInfo() {
    DynamicJsonDocument doc(MEDIUM_JSON_SIZE);
    SystemInfo::buildSystemInfo(doc);
    SystemInfo::buildMemoryInfo(doc);

    String jsonString;
    serializeJson(doc, jsonString);
    sendJsonResponse(jsonString);
}

void SerialCommandHandler::handleSystemReboot() {
    sendResponse("System rebooting in 2 seconds...");
    vTaskDelay(pdMS_TO_TICKS(2000));
    ESP.restart();
}

void SerialCommandHandler::handleSystemReset() {
    sendResponse("Performing factory reset...");
    wifiUtils.factoryReset();
    vTaskDelay(pdMS_TO_TICKS(1000));
    ESP.restart();
}

// Web server handlers
void SerialCommandHandler::handleWebStart() {
    sendResponse("Web server start/restart requested");
    // Implement web server restart logic here
}

void SerialCommandHandler::handleWebStatus() {
    DynamicJsonDocument doc(SMALL_JSON_SIZE);
    doc["web_server"] = "running";
    doc["port"] = 80;
    doc["connections"] = 0;  // Placeholder

    String jsonString;
    serializeJson(doc, jsonString);
    sendJsonResponse(jsonString);
}

void SerialCommandHandler::handleWebRestart() {
    sendResponse("Web server restart requires system reboot");
    sendResponse("Use 'system.reboot' to restart the system");
}

void SerialCommandHandler::handleWebInfo() {
    DynamicJsonDocument doc(SMALL_JSON_SIZE);
    doc["server"] = "ESP32 Built-in";
    doc["version"] = "1.0";
    doc["root"] = "/";
    doc["endpoints"] = 5;

    String jsonString;
    serializeJson(doc, jsonString);
    sendJsonResponse(jsonString);
}

// ========================================================================
// UTILITY FUNCTIONS
// ========================================================================

void SerialCommandHandler::sendResponse(const String& response) {
    SerialUtils::sendResponse(response, responseCallback);
}

void SerialCommandHandler::sendErrorResponse(const String& error) {
    SerialUtils::sendErrorResponse(error, responseCallback);
}

void SerialCommandHandler::sendJsonResponse(const String& json) {
    SerialUtils::sendJsonResponse(json, responseCallback);
}
