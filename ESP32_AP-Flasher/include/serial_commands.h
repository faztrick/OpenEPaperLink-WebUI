#ifndef SERIAL_COMMANDS_H
#define SERIAL_COMMANDS_H

#include <Arduino.h>

#include <functional>

// Serial Command Handler for ESP32_AP-Flasher
// Provides custom serial commands for WiFi management and author endpoints

class SerialCommandHandler {
   public:
    static SerialCommandHandler& getInstance();

    void initialize();
    void processSerialInput();
    void handleCommand(const String& command);

    // Command response callback type
    typedef std::function<void(const String&)> ResponseCallback;
    void setResponseCallback(ResponseCallback callback);

   private:
    SerialCommandHandler() = default;
    ~SerialCommandHandler() = default;
    SerialCommandHandler(const SerialCommandHandler&) = delete;
    SerialCommandHandler& operator=(const SerialCommandHandler&) = delete;

    String inputBuffer;
    ResponseCallback responseCallback;
    bool initialized = false;

    // Initialization helper
    void setDefaultWiFiCredentials();
    void testConnectivityAndEndpoints();

    // Command handlers
    void handleWiFiCommand(const String& subCommand, const String& params);
    void handleAuthorCommand(const String& subCommand, const String& params);
    void handleSystemCommand(const String& subCommand, const String& params);
    void handleHelpCommand();
    void handleVersionCommand();

    // WiFi-specific handlers
    void handleWiFiStatus();
    void handleWiFiScan();
    void handleWiFiConnect(const String& params);
    void handleWiFiDisconnect();
    void handleWiFiGetIP();
    void handleWiFiGetSSID();
    void handleWiFiGetMAC();
    void handleWiFiSetSSID(const String& ssid);
    void handleWiFiSetPassword(const String& password);
    void handleWiFiSetStaticIP(const String& ip);
    void handleWiFiSetGateway(const String& gateway);
    void handleWiFiSetSubnet(const String& subnet);
    void handleWiFiSetDNS(const String& dns);
    void handleWiFiSave();
    void handleWiFiClearConfig();

    // Author/endpoint handlers
    void handleAuthorGet();
    void handleAuthorSet(const String& author);
    void handleEndpointList();
    void handleEndpointTest(const String& endpoint);
    void handleEndpointStatus();

    // System handlers
    void handleSystemInfo();
    void handleSystemReboot();
    void handleSystemReset();

    // Utility functions
    void sendResponse(const String& response);
    void sendErrorResponse(const String& error);
    void sendJsonResponse(const String& json);
    String parseQuotedString(const String& input);
    String extractParameter(const String& params, const String& paramName);
};

#endif  // SERIAL_COMMANDS_H
