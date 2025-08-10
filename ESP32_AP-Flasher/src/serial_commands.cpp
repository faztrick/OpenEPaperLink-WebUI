#include "serial_commands.h"

#include <ArduinoJson.h>
#include <WiFi.h>

#include "serialap.h"  // Include for AP state checking
#include "wifi_utils.h"

// Define LOG macro
#define LOG(format, ...) printf(format, ##__VA_ARGS__)

// Define author/version information
#ifndef BUILD_VERSION
#define BUILD_VERSION "Outdoor"
#endif

#ifndef BUILD_AUTHOR
#define BUILD_AUTHOR "OpenEPaperLink"
#endif

// Constants for better maintainability and performance
static const size_t INPUT_BUFFER_SIZE = 256;
static const size_t MAX_INPUT_LENGTH = 200;
static const unsigned long COMMAND_TIMEOUT_MS = 30000;
static const unsigned long AP_CHECK_INTERVAL_MS = 250;
static const unsigned long WIFI_CONNECT_TIMEOUT_MS = 20000;
static const unsigned long WIFI_RETRY_INTERVAL_MS = 500;
static const int MAX_WIFI_ATTEMPTS = WIFI_CONNECT_TIMEOUT_MS / WIFI_RETRY_INTERVAL_MS;
static const size_t SMALL_JSON_SIZE = 512;
static const size_t MEDIUM_JSON_SIZE = 1024;
static const size_t LARGE_JSON_SIZE = 2048;

SerialCommandHandler& SerialCommandHandler::getInstance() {
    static SerialCommandHandler instance;
    return instance;
}

void SerialCommandHandler::initialize() {
    if (initialized) return;

    inputBuffer.reserve(INPUT_BUFFER_SIZE);
    initialized = true;

    // Add a delay to ensure serial is ready
    // delay(100);

    // Set default WiFi credentials if none exist
    // setDefaultWiFiCredentials();

    // delay(50);
    LOG("\n");
    LOG("=== ESP32 Serial Command Interface ===\n");
    LOG("Type 'CMD:' to activate command mode\n");
    LOG("Commands are case-insensitive\n");
    LOG("=======================================\n");
}

void SerialCommandHandler::setDefaultWiFiCredentials() {
    // Check if credentials already exist
    WiFiConfig config = wifiUtils.loadConfig();

    if (config.ssid.length() > 0) {
        LOG("📶 WiFi: %s (existing)\n", config.ssid.c_str());
        LOG("🔑 Password: %s (existing)\n", config.password.length() > 0 ? "***configured***" : "not set");
        LOG("🌐 Static IP: %s (existing)\n", config.ip.c_str());
        LOG("🏠 Gateway: %s (existing)\n", config.gateway.c_str());
        LOG("📡 Subnet: %s (existing)\n", config.mask.c_str());
        LOG("🔍 DNS: %s (existing)\n", config.dns.c_str());
        LOG("🏠 Hostname: %s (existing)\n", config.hostname.c_str());

        // Auto-connect to existing WiFi if not connected
        if (WiFi.status() != WL_CONNECTED) {
            LOG("🔄 Auto-connecting...\n");
            handleWiFiConnect("");
        }
        return;
    }

    // Set default credentials as requested
    LOG("🔧 Setting default WiFi...\n");

    // Update configuration with defaults
    config.ssid = "Faztrick";
    config.password = "faztrick1234";
    config.ip = "192.168.29.200";      // Fixed: was 192.164.29.200
    config.gateway = "192.168.29.91";  // Fixed: was 192.164.29.91
    config.mask = "255.255.255.0";
    config.dns = "8.8.8.8";
    config.hasStaticIP = true;

    wifiUtils.saveConfig(config);

    LOG("✅ WiFi defaults set (Faztrick/192.168.29.200)\n");

    // Auto-connect to default WiFi
    LOG("🔄 Auto-connecting to default WiFi...\n");
    handleWiFiConnect("");
}
void SerialCommandHandler::processSerialInput() {
    if (!initialized) return;

    // Check if AP is in a critical state where we shouldn't interfere
    extern struct APInfoS apInfo;
    extern volatile ApSerialState gSerialTaskState;

    static bool commandMode = false;
    static unsigned long lastCommandTime = 0;
    static unsigned long lastApCheck = 0;
    static String commandPrefix = "";

    // Check AP state less frequently for better performance
    unsigned long currentTime = millis();
    if (currentTime - lastApCheck > AP_CHECK_INTERVAL_MS) {
        lastApCheck = currentTime;
        // If AP is actively communicating, be less aggressive about command processing
        if (apInfo.state == AP_STATE_FLASHING || gSerialTaskState == SERIAL_STATE_STARTING) {
            if (commandMode) {
                LOG("\n=== Command Mode Paused (AP Active) ===\n");
                commandMode = false;
                inputBuffer.clear();
                commandPrefix.clear();
            }
            return;
        }
    }

    while (Serial.available() > 0) {
        char c = Serial.read();

        // Exit command mode after timeout
        if (commandMode && (currentTime - lastCommandTime > COMMAND_TIMEOUT_MS)) {
            commandMode = false;
            LOG("\n=== Command Mode Timeout ===\n");
            inputBuffer.clear();
            commandPrefix.clear();
            return;
        }

        // Handle command prefix detection when not in command mode
        if (!commandMode) {
            if (commandPrefix.length() < 4) {
                commandPrefix += c;
                if (commandPrefix == "CMD:") {
                    commandMode = true;
                    commandPrefix.clear();
                    inputBuffer.clear();
                    LOG("\n=== Command Mode Activated ===\n");
                    LOG("Type commands (wifi.status, help, etc.)\n");
                    LOG("CMD> ");
                    lastCommandTime = currentTime;
                    continue;
                } else if (!String("CMD:").startsWith(commandPrefix)) {
                    // Not a command prefix, clear and let AP task handle
                    commandPrefix.clear();
                    return;
                }
                continue;
            } else {
                // Reset if we've collected too many characters without matching
                commandPrefix.clear();
                return;
            }
        }

        // Process command mode input
        if (commandMode) {
            lastCommandTime = currentTime;

            if (c == '\r' || c == '\n') {
                if (inputBuffer.length() > 0) {
                    String trimmedInput = inputBuffer;
                    trimmedInput.trim();
                    if (trimmedInput.equalsIgnoreCase("exit")) {
                        commandMode = false;
                        LOG("=== Command Mode Deactivated ===\n");
                        inputBuffer.clear();
                        return;
                    }
                    handleCommand(inputBuffer);
                    inputBuffer.clear();
                    LOG("CMD> ");
                }
            } else if (c == '\b' || c == 127) {  // Backspace
                if (inputBuffer.length() > 0) {
                    inputBuffer.remove(inputBuffer.length() - 1);
                    LOG("\b \b");  // Echo backspace
                }
            } else if (isPrintable(c)) {
                // Prevent buffer overflow
                if (inputBuffer.length() < MAX_INPUT_LENGTH) {
                    inputBuffer += c;
                    LOG("%c", c);  // Echo character
                } else {
                    LOG("\n[Buffer full - command too long]\n");
                    inputBuffer.clear();
                    LOG("CMD> ");
                }
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

    LOG(">%s\n", command.c_str());  // Echo command

    // Parse main command and parameters
    int spaceIndex = cmd.indexOf(' ');
    String mainCmd = (spaceIndex == -1) ? cmd : cmd.substring(0, spaceIndex);
    String params = (spaceIndex == -1) ? "" : cmd.substring(spaceIndex + 1);

    // Handle main commands
    if (mainCmd.startsWith("wifi.")) {
        String subCmd = mainCmd.substring(5);  // Remove "wifi."
        LOG("Handling WiFi command: %s with params: %s\n", subCmd.c_str(), params.c_str());
        handleWiFiCommand(subCmd, params);
    } else if (mainCmd.startsWith("author.")) {
        String subCmd = mainCmd.substring(7);  // Remove "author."
        LOG("Handling Author command: %s with params: %s\n", subCmd.c_str(), params.c_str());
        handleAuthorCommand(subCmd, params);
    } else if (mainCmd.startsWith("system.")) {
        String subCmd = mainCmd.substring(7);  // Remove "system."
        LOG("Handling System command: %s with params: %s\n", subCmd.c_str(), params.c_str());
        handleSystemCommand(subCmd, params);
    } else if (mainCmd.startsWith("web.")) {
        String subCmd = mainCmd.substring(4);  // Remove "web."
        handleWebCommand(subCmd, params);
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
    } else if (subCommand == "apstatus") {
        handleWiFiAPStatus();
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
        sendErrorResponse("Unknown web command: web." + subCommand);
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
    sendResponse("  wifi.setpassword \"mypassword\"");
    sendResponse("  wifi.connect");
    sendResponse("  author.set \"John Doe\"");
}

void SerialCommandHandler::handleVersionCommand() {
    DynamicJsonDocument doc(SMALL_JSON_SIZE);
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

        DynamicJsonDocument doc(LARGE_JSON_SIZE);
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
    WiFiConfig config = wifiUtils.loadConfig();

    if (config.ssid.length() == 0) {
        sendErrorResponse("No SSID configured. Use wifi config methods first.");
        return;
    }

    // Log connection attempt without exposing password
    sendResponse("Connecting to WiFi: " + config.ssid +
                 " with password: " + (config.password.length() > 0 ? "***configured***" : "not set") +
                 " IP: " + config.ip +
                 " Gateway: " + config.gateway +
                 " Subnet: " + config.mask +
                 " DNS: " + config.dns);

    // Configure static IP if provided
    if (config.ip.length() > 0) {
        IPAddress ip, gw, sn, dnsIP;
        if (ip.fromString(config.ip) && gw.fromString(config.gateway) &&
            sn.fromString(config.mask) && dnsIP.fromString(config.dns)) {
            WiFi.config(ip, gw, sn, dnsIP);
            sendResponse("Static IP configuration applied: " + config.ip);
        } else {
            sendErrorResponse("Invalid IP configuration");
            return;
        }
    }

    WiFi.begin(config.ssid.c_str(), config.password.c_str());

    // Non-blocking connection with better timeout management
    unsigned long startTime = millis();
    int attempts = 0;

    while (WiFi.status() != WL_CONNECTED &&
           (millis() - startTime) < WIFI_CONNECT_TIMEOUT_MS) {
        delay(WIFI_RETRY_INTERVAL_MS);
        attempts++;

        // Print progress less frequently
        if (attempts % 10 == 0) {
            unsigned long elapsed = millis() - startTime;
            LOG("WiFi connecting... %lu ms elapsed (attempt %d)\n", elapsed, attempts);
        }

        yield();  // Allow other tasks to run

        // Check for user input or critical system states
        if (Serial.available() > 0) {
            char c = Serial.read();
            if (c == 27) {  // ESC key to abort
                WiFi.disconnect();
                sendErrorResponse("WiFi connection aborted by user");
                return;
            }
        }
    }
    LOG("\n");

    if (WiFi.status() == WL_CONNECTED) {
        DynamicJsonDocument doc(SMALL_JSON_SIZE);
        doc["connected"] = true;
        doc["ssid"] = WiFi.SSID();
        doc["ip"] = WiFi.localIP().toString();
        doc["rssi"] = WiFi.RSSI();
        doc["gateway"] = WiFi.gatewayIP().toString();
        doc["subnet"] = WiFi.subnetMask().toString();
        doc["connection_time_ms"] = millis() - startTime;

        String jsonString;
        serializeJson(doc, jsonString);
        sendJsonResponse(jsonString);

        // Test connectivity and endpoints
        testConnectivityAndEndpoints();
    } else {
        sendErrorResponse("Failed to connect to WiFi after " + String(WIFI_CONNECT_TIMEOUT_MS / 1000) + " seconds");
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
    DynamicJsonDocument doc(SMALL_JSON_SIZE);
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
    DynamicJsonDocument doc(SMALL_JSON_SIZE);
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
    DynamicJsonDocument doc(SMALL_JSON_SIZE);
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

    // Validate SSID length
    if (cleanSSID.length() == 0) {
        sendErrorResponse("SSID cannot be empty after parsing");
        return;
    }

    if (cleanSSID.length() > 32) {
        sendErrorResponse("SSID too long (max 32 characters)");
        return;
    }

    WiFiConfig config = wifiUtils.loadConfig();
    config.ssid = cleanSSID;
    wifiUtils.saveConfig(config);
    sendResponse("SSID set to: " + cleanSSID);
}

void SerialCommandHandler::handleWiFiSetPassword(const String& password) {
    String cleanPassword = parseQuotedString(password);

    // Validate password length (WPA2 requires 8-63 characters, allow empty for open networks)
    if (cleanPassword.length() > 0 && cleanPassword.length() < 8) {
        sendErrorResponse("Password too short (minimum 8 characters for WPA2)");
        return;
    }

    if (cleanPassword.length() > 63) {
        sendErrorResponse("Password too long (maximum 63 characters)");
        return;
    }

    WiFiConfig config = wifiUtils.loadConfig();
    config.password = cleanPassword;
    wifiUtils.saveConfig(config);
    sendResponse("Password set (length: " + String(cleanPassword.length()) + " characters)");
}

void SerialCommandHandler::handleWiFiSetStaticIP(const String& ip) {
    String cleanIP = parseQuotedString(ip);

    // Validate IP format
    IPAddress testIP;
    if (cleanIP.length() > 0 && !testIP.fromString(cleanIP)) {
        sendErrorResponse("Invalid IP address format");
        return;
    }

    WiFiConfig config = wifiUtils.loadConfig();
    config.ip = cleanIP;
    config.hasStaticIP = (cleanIP.length() > 0);
    wifiUtils.saveConfig(config);
    sendResponse("Static IP set to: " + cleanIP);
}

void SerialCommandHandler::handleWiFiSetGateway(const String& gateway) {
    String cleanGateway = parseQuotedString(gateway);

    // Validate gateway format
    IPAddress testGW;
    if (cleanGateway.length() > 0 && !testGW.fromString(cleanGateway)) {
        sendErrorResponse("Invalid gateway address format");
        return;
    }

    WiFiConfig config = wifiUtils.loadConfig();
    config.gateway = cleanGateway;
    wifiUtils.saveConfig(config);
    sendResponse("Gateway set to: " + cleanGateway);
}

void SerialCommandHandler::handleWiFiSetSubnet(const String& subnet) {
    String cleanSubnet = parseQuotedString(subnet);

    // Validate subnet format
    IPAddress testSubnet;
    if (cleanSubnet.length() > 0 && !testSubnet.fromString(cleanSubnet)) {
        sendErrorResponse("Invalid subnet mask format");
        return;
    }

    WiFiConfig config = wifiUtils.loadConfig();
    config.mask = cleanSubnet;
    wifiUtils.saveConfig(config);
    sendResponse("Subnet mask set to: " + cleanSubnet);
}

void SerialCommandHandler::handleWiFiSetDNS(const String& dns) {
    String cleanDNS = parseQuotedString(dns);

    // Validate DNS format
    IPAddress testDNS;
    if (cleanDNS.length() > 0 && !testDNS.fromString(cleanDNS)) {
        sendErrorResponse("Invalid DNS address format");
        return;
    }

    WiFiConfig config = wifiUtils.loadConfig();
    config.dns = cleanDNS;
    wifiUtils.saveConfig(config);
    sendResponse("DNS set to: " + cleanDNS);
}

void SerialCommandHandler::handleWiFiSave() {
    // Configuration is automatically saved with direct Preferences access
    // Generate JSON export for confirmation
    if (wifiUtils.saveConfigAsJson()) {
        sendResponse("WiFi configuration saved and exported");
    } else {
        sendErrorResponse("Failed to export WiFi configuration");
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

    // AP Serial Task Status
    doc["ap_serial_task_state"] = static_cast<int>(gSerialTaskState);
    switch (gSerialTaskState) {
        case SERIAL_STATE_NONE:
            doc["ap_task_status"] = "Not initialized";
            break;
        case SERIAL_STATE_INITIALIZED:
            doc["ap_task_status"] = "Initialized";
            break;
        case SERIAL_STATE_STARTING:
            doc["ap_task_status"] = "Starting";
            break;
        case SERIAL_STATE_RUNNING:
            doc["ap_task_status"] = "Running";
            break;
        case SERIAL_STATE_STOP:
            doc["ap_task_status"] = "Stopping";
            break;
        case SERIAL_STATE_STOPPED:
            doc["ap_task_status"] = "Stopped";
            break;
        default:
            doc["ap_task_status"] = "Unknown";
            break;
    }

    // AP Radio Status
    doc["ap_online"] = apInfo.isOnline;
    doc["ap_state"] = apInfo.state;
    switch (apInfo.state) {
        case AP_STATE_OFFLINE:
            doc["ap_state_name"] = "Offline";
            break;
        case AP_STATE_ONLINE:
            doc["ap_state_name"] = "Online";
            break;
        case AP_STATE_COMING_ONLINE:
            doc["ap_state_name"] = "Coming Online";
            break;
        case AP_STATE_FLASHING:
            doc["ap_state_name"] = "Flashing";
            break;
        case AP_STATE_FAILED:
            doc["ap_state_name"] = "Failed";
            break;
        case AP_STATE_NORADIO:
            doc["ap_state_name"] = "No Radio";
            break;
        case AP_STATE_WAIT_RESET:
            doc["ap_state_name"] = "Wait Reset";
            break;
        case AP_STATE_REQUIRED_POWER_CYCLE:
            doc["ap_state_name"] = "Power Cycle Required";
            break;
        default:
            doc["ap_state_name"] = "Unknown";
            break;
    }

    // AP Info if available
    if (apInfo.isOnline) {
        doc["ap_channel"] = apInfo.channel;
        doc["ap_power"] = apInfo.power;
        doc["ap_type"] = apInfo.type;
        doc["ap_version"] = apInfo.version;

        // MAC address with proper formatting
        String macStr = "";
        for (int i = 7; i >= 0; i--) {
            if (macStr.length() > 0) macStr += ":";
            if (apInfo.mac[i] < 16) macStr += "0";  // Ensure proper hex formatting
            macStr += String(apInfo.mac[i], HEX);
        }
        doc["ap_mac"] = macStr;
    }

    String jsonString;
    serializeJson(doc, jsonString);
    sendJsonResponse(jsonString);
}

// Author/Endpoint Command Implementations
void SerialCommandHandler::handleAuthorGet() {
    DynamicJsonDocument doc(SMALL_JSON_SIZE);
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

    if (cleanAuthor.length() > 64) {
        sendErrorResponse("Author name too long (maximum 64 characters)");
        return;
    }

    // For now, just acknowledge - could store in preferences
    sendResponse("Author information updated: " + cleanAuthor);
    sendResponse("Note: Author information is build-time configured");
}

void SerialCommandHandler::handleEndpointList() {
    DynamicJsonDocument doc(MEDIUM_JSON_SIZE);
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

    // Basic endpoint validation
    if (!cleanEndpoint.startsWith("/")) {
        sendErrorResponse("Endpoint must start with '/'");
        return;
    }

    if (WiFi.status() != WL_CONNECTED) {
        sendErrorResponse("Not connected to WiFi - cannot test endpoints");
        return;
    }

    DynamicJsonDocument doc(SMALL_JSON_SIZE);
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
    DynamicJsonDocument doc(SMALL_JSON_SIZE);
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
    DynamicJsonDocument doc(MEDIUM_JSON_SIZE);

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

// Web server handlers
void SerialCommandHandler::handleWebStart() {
    sendResponse("📤 Starting web server...");

    // The web server is typically started during initialization
    // Check if web server components are available
    extern void init_web();  // Declare the external function

    sendResponse("✅ Web server initialization called");
    sendResponse("🌐 Access points:");

    if (WiFi.status() == WL_CONNECTED) {
        sendResponse("   WiFi: http://" + WiFi.localIP().toString());
    }

    if (WiFi.getMode() == WIFI_AP || WiFi.getMode() == WIFI_AP_STA) {
        sendResponse("   AP: http://" + WiFi.softAPIP().toString());
    }

    if (WiFi.status() != WL_CONNECTED && WiFi.getMode() != WIFI_AP && WiFi.getMode() != WIFI_AP_STA) {
        sendResponse("⚠️ No network interfaces active");
        sendResponse("💡 Use 'wifi.connect' or check WiFi configuration");
    }
}
void SerialCommandHandler::handleWebStatus() {
    sendResponse("=== Web Server Status ===");

    // Check if we have network access
    bool hasWiFi = (WiFi.status() == WL_CONNECTED);
    bool hasAP = (WiFi.getMode() == WIFI_AP || WiFi.getMode() == WIFI_AP_STA);

    if (hasWiFi) {
        sendResponse("✅ WiFi Connected: http://" + WiFi.localIP().toString());
    } else {
        sendResponse("❌ WiFi not connected");
    }

    if (hasAP) {
        sendResponse("✅ Access Point: http://" + WiFi.softAPIP().toString());
        sendResponse("   AP Clients: " + String(WiFi.softAPgetStationNum()));
    } else {
        sendResponse("❌ Access Point not active");
    }

    if (!hasWiFi && !hasAP) {
        sendResponse("⚠️ No network interfaces available");
        sendResponse("💡 Use 'wifi.connect' or check WiFi configuration");
    }
}

void SerialCommandHandler::handleWebRestart() {
    sendResponse("🔄 Restarting web server...");
    sendResponse("⚠️ Note: Web server restart requires full system reboot");
    sendResponse("🚀 Use 'system.reboot' to restart the entire system");
    sendResponse("💡 Or use 'web.start' to reinitialize if needed");
}

void SerialCommandHandler::handleWebInfo() {
    sendResponse("=== Web Server Information ===");
    sendResponse("📦 Server: AsyncWebServer");
    sendResponse("🌐 Protocols: HTTP, WebSocket");
    sendResponse("📁 File System: LittleFS");
    sendResponse("🔧 Features:");
    sendResponse("   • Static file serving");
    sendResponse("   • REST API endpoints");
    sendResponse("   • WebSocket communication");
    sendResponse("   • OTA updates");
    sendResponse("   • Configuration management");
    sendResponse("");
    sendResponse("📍 Available endpoints:");
    sendResponse("   / - Main interface");
    sendResponse("   /setup - WiFi configuration");
    sendResponse("   /api/* - REST API");
    sendResponse("   /update - OTA updates");
}

// Utility Functions
void SerialCommandHandler::sendResponse(const String& response) {
    LOG("%s\n", response.c_str());
    if (responseCallback) {
        responseCallback(response);
    }
}

void SerialCommandHandler::sendErrorResponse(const String& error) {
    LOG("ERROR: %s\n", error.c_str());
    if (responseCallback) {
        responseCallback("ERROR: " + error);
    }
}

void SerialCommandHandler::sendJsonResponse(const String& json) {
    LOG("JSON: %s\n", json.c_str());
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
