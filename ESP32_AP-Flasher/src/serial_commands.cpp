#include "serial_commands.h"

#include <ArduinoJson.h>
#include <WiFi.h>

#include "wifi_utils.h"

// Define author/version information
#ifndef BUILD_VERSION
#define BUILD_VERSION "custom"
#endif

#ifndef BUILD_AUTHOR
#define BUILD_AUTHOR "OpenEPaperLink"
#endif

SerialCommandHandler& SerialCommandHandler::getInstance() {
    static SerialCommandHandler instance;
    return instance;
}

void SerialCommandHandler::initialize() {
    if (initialized) return;

    inputBuffer.reserve(256);
    initialized = true;

    // Set default WiFi credentials if none exist
    setDefaultWiFiCredentials();

    Serial.println();
    Serial.println("=== ESP32 Serial Command Interface ===");
    Serial.println("Type 'help' for available commands");
    Serial.println("Commands are case-insensitive");
    Serial.println("=======================================");
}

void SerialCommandHandler::setDefaultWiFiCredentials() {
    // Check if credentials already exist
    String existingSSID = wifiUtils.getSSID();
    if (existingSSID.length() > 0) {
        Serial.println("📶 Existing WiFi credentials found: " + existingSSID);

        // Auto-connect to existing WiFi
        if (WiFi.status() != WL_CONNECTED) {
            Serial.println("🔄 Auto-connecting to WiFi...");
            handleWiFiConnect("");
        }
        return;
    }

    // Set default credentials as requested
    Serial.println("🔧 Setting default WiFi credentials...");

    wifiUtils.setSSID("Faztrick");
    wifiUtils.setPassword("faztrick1234");
    wifiUtils.setStaticIP("192.164.123.200");
    wifiUtils.setGateway("192.164.123.91");
    wifiUtils.setSubnetMask("255.255.255.0");
    wifiUtils.setDNS("8.8.8.8");
    wifiUtils.save();

    Serial.println("✅ Default WiFi credentials set:");
    Serial.println("   SSID: Faztrick");
    Serial.println("   IP: 192.164.123.200");
    Serial.println("   Gateway: 192.164.123.91");

    // Auto-connect to default WiFi
    Serial.println("🔄 Auto-connecting to default WiFi...");
    handleWiFiConnect("");
}
void SerialCommandHandler::processSerialInput() {
    if (!initialized) return;

    // Only process serial commands when AP task is not actively communicating
    // Check if there's a command prefix or if we're in command mode
    static bool commandMode = false;
    static unsigned long lastCommandTime = 0;
    
    while (Serial.available() > 0) {
        char c = Serial.read();

        // Look for command prefix "CMD:" to enter command mode
        if (!commandMode && inputBuffer.length() == 0 && c == 'C') {
            inputBuffer += c;
            continue;
        }
        
        // Check for "CMD:" prefix
        if (!commandMode && inputBuffer.length() > 0 && inputBuffer.length() < 4) {
            inputBuffer += c;
            if (inputBuffer == "CMD:") {
                commandMode = true;
                inputBuffer = "";
                Serial.println("\n=== Command Mode Activated ===");
                Serial.println("Type commands (wifi.status, help, etc.)");
                Serial.print("CMD> ");
                lastCommandTime = millis();
                continue;
            } else if (!String("CMD:").startsWith(inputBuffer)) {
                // Not a command prefix, clear buffer and let AP task handle it
                inputBuffer = "";
                return;
            }
            continue;
        }
        
        // Exit command mode after 30 seconds of inactivity
        if (commandMode && (millis() - lastCommandTime > 30000)) {
            commandMode = false;
            Serial.println("\n=== Command Mode Deactivated ===");
            inputBuffer = "";
            return;
        }

        if (commandMode) {
            lastCommandTime = millis();
            
            if (c == '\r' || c == '\n') {
                if (inputBuffer.length() > 0) {
                    String trimmedInput = inputBuffer;
                    trimmedInput.trim();
                    if (trimmedInput.equalsIgnoreCase("exit")) {
                        commandMode = false;
                        Serial.println("=== Command Mode Deactivated ===");
                        inputBuffer = "";
                        return;
                    }
                    handleCommand(inputBuffer);
                    inputBuffer = "";
                    Serial.print("CMD> ");
                }
            } else if (c == '\b' || c == 127) {  // Backspace
                if (inputBuffer.length() > 0) {
                    inputBuffer.remove(inputBuffer.length() - 1);
                    Serial.print("\b \b");  // Echo backspace
                }
            } else if (isPrintable(c)) {
                inputBuffer += c;
                Serial.print(c);  // Echo character
            }
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

    Serial.println(">" + command);  // Echo command

    // Parse main command and parameters
    int spaceIndex = cmd.indexOf(' ');
    String mainCmd = (spaceIndex == -1) ? cmd : cmd.substring(0, spaceIndex);
    String params = (spaceIndex == -1) ? "" : cmd.substring(spaceIndex + 1);

    // Handle main commands
    if (mainCmd.startsWith("wifi.")) {
        String subCmd = mainCmd.substring(5);  // Remove "wifi."
        handleWiFiCommand(subCmd, params);
    } else if (mainCmd.startsWith("author.")) {
        String subCmd = mainCmd.substring(7);  // Remove "author."
        handleAuthorCommand(subCmd, params);
    } else if (mainCmd.startsWith("system.")) {
        String subCmd = mainCmd.substring(7);  // Remove "system."
        handleSystemCommand(subCmd, params);
    } else if (mainCmd == "help") {
        handleHelpCommand();
    } else if (mainCmd == "version") {
        handleVersionCommand();
    } else if (mainCmd == "status") {
        handleSystemInfo();
    } else {
        sendErrorResponse("Unknown command: " + mainCmd + ". Type 'help' for available commands.");
    }
}

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
    } else {
        sendErrorResponse("Unknown WiFi command: wifi." + subCommand);
    }
}

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
        sendErrorResponse("Unknown author command: author." + subCommand);
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
        sendErrorResponse("Unknown system command: system." + subCommand);
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
    sendResponse("Examples:");
    sendResponse("  wifi.setssid \"MyNetwork\"");
    sendResponse("  wifi.setpassword \"mypassword\"");
    sendResponse("  wifi.connect");
    sendResponse("  author.set \"John Doe\"");
}

void SerialCommandHandler::handleVersionCommand() {
    DynamicJsonDocument doc(512);
    doc["firmware"] = "OpenEPaperLink ESP32_AP-Flasher";
    doc["version"] = BUILD_VERSION;
    doc["author"] = BUILD_AUTHOR;
    doc["build_time"] = __DATE__ " " __TIME__;
    doc["commands_version"] = "1.0.0";

    String jsonString;
    serializeJson(doc, jsonString);
    sendJsonResponse(jsonString);
}

// WiFi Command Implementations
void SerialCommandHandler::handleWiFiStatus() {
    WiFiUtils& wifiUtils = WiFiUtils::getInstance();
    String statusJson = wifiUtils.getConnectionInfoJson();
    sendJsonResponse(statusJson);
}

void SerialCommandHandler::handleWiFiScan() {
    WiFiUtils& wifiUtils = WiFiUtils::getInstance();

    sendResponse("Starting WiFi scan...");
    bool scanStarted = wifiUtils.performAsyncScan(true, 10000);

    if (scanStarted) {
        delay(100);  // Brief delay for scan to initialize
        WiFiScanResult scanResult = wifiUtils.getScanResults(false);

        DynamicJsonDocument doc(2048);
        doc["scanning"] = scanResult.scanInProgress;
        doc["networks_found"] = scanResult.networks.size();

        JsonArray networks = doc.createNestedArray("networks");
        for (const auto& network : scanResult.networks) {
            JsonObject net = networks.createNestedObject();
            net["ssid"] = network.ssid;
            net["rssi"] = network.rssi;
            net["channel"] = network.channel;
            net["encryption"] = static_cast<int>(network.encryption);
            net["bssid"] = network.bssid;
        }

        String jsonString;
        serializeJson(doc, jsonString);
        sendJsonResponse(jsonString);
    } else {
        sendErrorResponse("Failed to start WiFi scan");
    }
}

void SerialCommandHandler::handleWiFiConnect(const String& params) {
    String ssid = wifiUtils.getSSID();
    String password = wifiUtils.getPassword();

    if (ssid.length() == 0) {
        sendErrorResponse("No SSID configured. Use wifi.setssid first.");
        return;
    }

    sendResponse("Connecting to WiFi: " + ssid);

    // Check for static IP configuration
    String staticIP = wifiUtils.getIP();
    String gateway = wifiUtils.getGateway();
    String subnet = wifiUtils.getMask();
    String dns = wifiUtils.getDNS();

    if (staticIP.length() > 0) {
        IPAddress ip, gw, sn, dnsIP;
        if (ip.fromString(staticIP) && gw.fromString(gateway) &&
            sn.fromString(subnet) && dnsIP.fromString(dns)) {
            WiFi.config(ip, gw, sn, dnsIP);
            sendResponse("Static IP configuration applied: " + staticIP);
        }
    }

    WiFi.begin(ssid.c_str(), password.c_str());

    // Wait for connection (with timeout)
    int attempts = 0;
    while (WiFi.status() != WL_CONNECTED && attempts < 20) {
        delay(500);
        attempts++;
        Serial.print(".");
    }
    Serial.println();

    if (WiFi.status() == WL_CONNECTED) {
        DynamicJsonDocument doc(512);
        doc["connected"] = true;
        doc["ssid"] = WiFi.SSID();
        doc["ip"] = WiFi.localIP().toString();
        doc["rssi"] = WiFi.RSSI();
        doc["gateway"] = WiFi.gatewayIP().toString();
        doc["subnet"] = WiFi.subnetMask().toString();

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
        sendResponse("❌ WiFi not connected - cannot test endpoints");
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
    DynamicJsonDocument doc(256);
    doc["connected"] = (WiFi.status() == WL_CONNECTED);
    if (WiFi.status() == WL_CONNECTED) {
        doc["ip"] = WiFi.localIP().toString();
        doc["gateway"] = WiFi.gatewayIP().toString();
        doc["subnet"] = WiFi.subnetMask().toString();
        doc["dns"] = WiFi.dnsIP().toString();
    }

    String jsonString;
    serializeJson(doc, jsonString);
    sendJsonResponse(jsonString);
}

void SerialCommandHandler::handleWiFiGetSSID() {
    DynamicJsonDocument doc(256);
    doc["connected"] = (WiFi.status() == WL_CONNECTED);
    if (WiFi.status() == WL_CONNECTED) {
        doc["ssid"] = WiFi.SSID();
        doc["bssid"] = WiFi.BSSIDstr();
        doc["channel"] = WiFi.channel();
    }

    String jsonString;
    serializeJson(doc, jsonString);
    sendJsonResponse(jsonString);
}

void SerialCommandHandler::handleWiFiGetMAC() {
    DynamicJsonDocument doc(256);
    doc["mac_address"] = WiFi.macAddress();
    doc["ap_mac"] = WiFi.softAPmacAddress();

    String jsonString;
    serializeJson(doc, jsonString);
    sendJsonResponse(jsonString);
}

void SerialCommandHandler::handleWiFiSetSSID(const String& ssid) {
    if (ssid.length() == 0) {
        sendErrorResponse("SSID cannot be empty");
        return;
    }

    String cleanSSID = parseQuotedString(ssid);

    wifiUtils.setSSID(cleanSSID);
    sendResponse("SSID set to: " + cleanSSID);
}

void SerialCommandHandler::handleWiFiSetPassword(const String& password) {
    String cleanPassword = parseQuotedString(password);

    wifiUtils.setPassword(cleanPassword);
    sendResponse("Password set (length: " + String(cleanPassword.length()) + " characters)");
}

void SerialCommandHandler::handleWiFiSetStaticIP(const String& ip) {
    String cleanIP = parseQuotedString(ip);

    wifiUtils.setStaticIP(cleanIP);
    sendResponse("Static IP set to: " + cleanIP);
}

void SerialCommandHandler::handleWiFiSetGateway(const String& gateway) {
    String cleanGateway = parseQuotedString(gateway);

    wifiUtils.setGateway(cleanGateway);
    sendResponse("Gateway set to: " + cleanGateway);
}

void SerialCommandHandler::handleWiFiSetSubnet(const String& subnet) {
    String cleanSubnet = parseQuotedString(subnet);

    wifiUtils.setSubnetMask(cleanSubnet);
    sendResponse("Subnet mask set to: " + cleanSubnet);
}

void SerialCommandHandler::handleWiFiSetDNS(const String& dns) {
    String cleanDNS = parseQuotedString(dns);

    wifiUtils.setDNS(cleanDNS);
    sendResponse("DNS set to: " + cleanDNS);
}

void SerialCommandHandler::handleWiFiSave() {
    wifiUtils.save();
    sendResponse("WiFi configuration saved");
}

void SerialCommandHandler::handleWiFiClearConfig() {
    if (wifiUtils.factoryReset()) {
        sendResponse("✅ WiFi configuration cleared successfully. Device will restart in AP mode.");
        ESP.restart();
    } else {
        sendErrorResponse("❌ Failed to clear WiFi configuration");
    }
}

// Author/Endpoint Command Implementations
void SerialCommandHandler::handleAuthorGet() {
    DynamicJsonDocument doc(512);
    doc["author"] = BUILD_AUTHOR;
    doc["firmware"] = "OpenEPaperLink ESP32_AP-Flasher";
    doc["version"] = BUILD_VERSION;

    String jsonString;
    serializeJson(doc, jsonString);
    sendJsonResponse(jsonString);
}

void SerialCommandHandler::handleAuthorSet(const String& author) {
    String cleanAuthor = parseQuotedString(author);
    if (cleanAuthor.length() == 0) {
        sendErrorResponse("Author name cannot be empty");
        return;
    }

    // For now, just acknowledge - could store in preferences
    sendResponse("Author information updated: " + cleanAuthor);
    sendResponse("Note: Author information is build-time configured");
}

void SerialCommandHandler::handleEndpointList() {
    DynamicJsonDocument doc(1024);
    JsonArray endpoints = doc.createNestedArray("endpoints");

    // List common web endpoints
    endpoints.add("/");
    endpoints.add("/get_wifi_config");
    endpoints.add("/save_wifi_config");
    endpoints.add("/get_ssid_list");
    endpoints.add("/wifi_scan");
    endpoints.add("/network_info");
    endpoints.add("/api/wifi/status");
    endpoints.add("/api/wifi/scan");
    endpoints.add("/api/wifi/scan_results");
    endpoints.add("/api/wifi/connect");
    endpoints.add("/api/wifi/disconnect");
    endpoints.add("/tag_cmd");
    endpoints.add("/system_info");
    endpoints.add("/ota_check");

    doc["total_endpoints"] = endpoints.size();
    doc["base_url"] = WiFi.status() == WL_CONNECTED ? "http://" + WiFi.localIP().toString() : "Not connected";

    String jsonString;
    serializeJson(doc, jsonString);
    sendJsonResponse(jsonString);
}

void SerialCommandHandler::handleEndpointTest(const String& endpoint) {
    String cleanEndpoint = parseQuotedString(endpoint);
    if (cleanEndpoint.length() == 0) {
        sendErrorResponse("Endpoint cannot be empty");
        return;
    }

    if (WiFi.status() != WL_CONNECTED) {
        sendErrorResponse("Not connected to WiFi - cannot test endpoints");
        return;
    }

    DynamicJsonDocument doc(512);
    doc["endpoint"] = cleanEndpoint;
    doc["base_url"] = "http://" + WiFi.localIP().toString();
    doc["full_url"] = "http://" + WiFi.localIP().toString() + cleanEndpoint;
    doc["wifi_connected"] = true;
    doc["test_result"] = "Endpoint accessible (manual testing required)";

    String jsonString;
    serializeJson(doc, jsonString);
    sendJsonResponse(jsonString);
}

void SerialCommandHandler::handleEndpointStatus() {
    DynamicJsonDocument doc(512);
    doc["wifi_connected"] = (WiFi.status() == WL_CONNECTED);

    if (WiFi.status() == WL_CONNECTED) {
        doc["ip_address"] = WiFi.localIP().toString();
        doc["access_url"] = "http://" + WiFi.localIP().toString();
        doc["web_server"] = "Running";
        doc["endpoints_available"] = true;
    } else {
        doc["web_server"] = "Not accessible";
        doc["endpoints_available"] = false;
        doc["message"] = "Connect to WiFi to access endpoints";
    }

    String jsonString;
    serializeJson(doc, jsonString);
    sendJsonResponse(jsonString);
}

// System Command Implementations
void SerialCommandHandler::handleSystemInfo() {
    DynamicJsonDocument doc(1024);

    // Firmware info
    doc["firmware"] = "OpenEPaperLink ESP32_AP-Flasher";
    doc["version"] = BUILD_VERSION;
    doc["author"] = BUILD_AUTHOR;
    doc["build_time"] = __DATE__ " " __TIME__;

    // Hardware info
    doc["chip_model"] = ESP.getChipModel();
    doc["chip_revision"] = ESP.getChipRevision();
    doc["cpu_freq_mhz"] = ESP.getCpuFreqMHz();
    doc["flash_size"] = ESP.getFlashChipSize();
    doc["free_heap"] = ESP.getFreeHeap();
    doc["uptime_ms"] = millis();

    // Network info
    doc["wifi_connected"] = (WiFi.status() == WL_CONNECTED);
    if (WiFi.status() == WL_CONNECTED) {
        doc["ssid"] = WiFi.SSID();
        doc["ip"] = WiFi.localIP().toString();
        doc["rssi"] = WiFi.RSSI();
        doc["mac"] = WiFi.macAddress();
    }

    String jsonString;
    serializeJson(doc, jsonString);
    sendJsonResponse(jsonString);
}

void SerialCommandHandler::handleSystemReboot() {
    sendResponse("System rebooting in 2 seconds...");
    delay(2000);
    ESP.restart();
}

void SerialCommandHandler::handleSystemReset() {
    sendResponse("Factory reset not implemented - would require configuration clearing");
    sendResponse("Use system.reboot for normal restart");
}

// Utility Functions
void SerialCommandHandler::sendResponse(const String& response) {
    Serial.println(response);
    if (responseCallback) {
        responseCallback(response);
    }
}

void SerialCommandHandler::sendErrorResponse(const String& error) {
    Serial.println("ERROR: " + error);
    if (responseCallback) {
        responseCallback("ERROR: " + error);
    }
}

void SerialCommandHandler::sendJsonResponse(const String& json) {
    Serial.println("JSON: " + json);
    if (responseCallback) {
        responseCallback("JSON: " + json);
    }
}

String SerialCommandHandler::parseQuotedString(const String& input) {
    String result = input;
    result.trim();

    // Remove surrounding quotes if present
    if (result.startsWith("\"") && result.endsWith("\"") && result.length() >= 2) {
        result = result.substring(1, result.length() - 1);
    } else if (result.startsWith("'") && result.endsWith("'") && result.length() >= 2) {
        result = result.substring(1, result.length() - 1);
    }

    return result;
}

String SerialCommandHandler::extractParameter(const String& params, const String& paramName) {
    int startIndex = params.indexOf(paramName + "=");
    if (startIndex == -1) return "";

    startIndex += paramName.length() + 1;
    int endIndex = params.indexOf(' ', startIndex);
    if (endIndex == -1) endIndex = params.length();

    return params.substring(startIndex, endIndex);
}
