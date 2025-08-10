#pragma once

// Standard includes
#include <algorithm>
#include <functional>
#include <vector>

// ESP32 includes
#include <Preferences.h>
#include <WiFi.h>
#include <esp_wifi.h>

// Third-party includes
#include <ArduinoJson.h>

// Project includes
#include "common_utils.h"

// ============================================================================
// Constants and Definitions
// ============================================================================
#define MAX_WIFI_NETWORKS 50

// ============================================================================
// Enums and Structures
// ============================================================================

enum WifiStatus {
    NOINIT,
    WAIT_CONNECTING,
    CONNECTED,
    WAIT_RECONNECT,
    AP,
    ETHERNET
};

struct WiFiNetworkInfo {
    String ssid;
    int32_t rssi;
    uint8_t channel;
    wifi_auth_mode_t encryption;
    String bssid;
};

struct WiFiScanResult {
    bool success;
    bool scanInProgress;
    int networksFound;
    String errorMessage;
    std::vector<WiFiNetworkInfo> networks;
};

struct WiFiConnectionInfo {
    bool connected;
    String ssid;
    String ip;
    String gateway;
    String dns;
    int32_t rssi;
    uint8_t channel;
    String mac;
    String hostname;
    wifi_mode_t mode;
    bool apEnabled;
    uint8_t apClients;
    String apIP;
};

struct WiFiConfig {
    String ssid;
    String password;
    String hostname;
    String ip;
    String mask;
    String gateway;
    String dns;
    bool hasStaticIP;
};

class WiFiUtils {
   private:
    static WiFiUtils* instance;
    static SemaphoreHandle_t scanMutex;
    static uint32_t lastScanTime;
    static bool scanInProgress;

    // Connection management
    bool _connected;
    bool _savewhensuccessfull;
    bool _initialized;
    int _reconnectIntervalCheck;
    int _retryIntervalCheck;
    int _connectionTimeout;
    String _ssid;
    String _pass;
    unsigned long _nextReconnectCheck;
    bool _APstarted;
    WifiStatus wifiStatus;
    static uint8_t apClients;

    // Serial buffer for Improv WiFi
    const int SERIAL_BUFFER_SIZE = 64;
    char serialBuffer[64];
    int serialIndex = 0;

    WiFiUtils();

    // Private helper methods
    bool waitForConnection();
    void pollSerial();
    String buildHostname(esp_mac_type_t mac_type);
    void terminalLog(String text);
    void setupDisconnectHandler();

   public:
    static WiFiUtils& getInstance();

    // WiFi scanning utilities
    bool performAsyncScan(bool showHidden = true, uint32_t maxWaitMs = 1000);
    WiFiScanResult getScanResults(bool clearAfter = true);
    String buildScanResultsJson(bool clearAfter = true);
    bool isScanning();

    // WiFi connection utilities
    WiFiConnectionInfo getConnectionInfo();
    String getConnectionInfoJson();

    // WiFi connection management
    bool connectToWifi();
    bool connectToWifi(String ssid, String pass, bool savewhensuccessfull = false);
    void startManagementServer();
    void poll();
    void initEth();
    IPAddress localIP();

    // Status accessors
    WifiStatus getWifiStatus() const { return wifiStatus; }

    // Configuration management
    WiFiConfig loadConfig();
    bool saveConfig(const WiFiConfig& config);
    bool factoryReset();
    bool hasStaticIP();

    // JSON configuration methods
    String getConfigAsJson() const;
    bool loadConfigFromJson(const String& json);
    bool saveConfigAsJson();

    // Storage compatibility methods
    bool save();

    // Event handling
    static void WiFiEvent(WiFiEvent_t event);

    // Utility functions
    static String getEncryptionString(wifi_auth_mode_t encryption);
    static int getEncryptionType(wifi_auth_mode_t encryption);  // Numeric value for frontend compatibility
    static int calculateSignalQuality(int rssi);

    // Cleanup
    void cleanup();
};

// Global instance
extern WiFiUtils& wifiUtils;

// **** Improv Wi-Fi ****
// https://www.improv-wifi.com/

namespace improv {

enum Error : uint8_t {
    ERROR_NONE = 0x00,
    ERROR_INVALID_RPC = 0x01,
    ERROR_UNKNOWN_RPC = 0x02,
    ERROR_UNABLE_TO_CONNECT = 0x03,
    ERROR_NOT_AUTHORIZED = 0x04,
    ERROR_UNKNOWN = 0xFF,
};

enum State : uint8_t {
    STATE_STOPPED = 0x00,
    STATE_AWAITING_AUTHORIZATION = 0x01,
    STATE_AUTHORIZED = 0x02,
    STATE_PROVISIONING = 0x03,
    STATE_PROVISIONED = 0x04,
};

enum Command : uint8_t {
    UNKNOWN = 0x00,
    WIFI_SETTINGS = 0x01,
    IDENTIFY = 0x02,
    GET_CURRENT_STATE = 0x02,
    GET_DEVICE_INFO = 0x03,
    GET_WIFI_NETWORKS = 0x04,
    BAD_CHECKSUM = 0xFF,
};

static const uint8_t CAPABILITY_IDENTIFY = 0x01;
static const uint8_t IMPROV_SERIAL_VERSION = 1;

enum ImprovSerialType : uint8_t {
    TYPE_CURRENT_STATE = 0x01,
    TYPE_ERROR_STATE = 0x02,
    TYPE_RPC = 0x03,
    TYPE_RPC_RESPONSE = 0x04
};

struct ImprovCommand {
    Command command;
    std::string ssid;
    std::string password;
};

ImprovCommand parse_improv_data(const std::vector<uint8_t>& data, bool check_checksum = true);
ImprovCommand parse_improv_data(const uint8_t* data, size_t length, bool check_checksum = true);

bool parse_improv_serial_byte(size_t position, uint8_t byte, const uint8_t* buffer,
                              std::function<bool(ImprovCommand)>&& callback, std::function<void(Error)>&& on_error);

std::vector<uint8_t> build_rpc_response(Command command, const std::vector<std::string>& datum,
                                        bool add_checksum = true);
std::vector<uint8_t> build_rpc_response(Command command, const std::vector<String>& datum, bool add_checksum = true);

}  // namespace improv

void set_state(improv::State state);
void send_response(std::vector<uint8_t>& response);
void set_error(improv::Error error);
void getAvailableWifiNetworks();
bool onCommandCallback(improv::ImprovCommand cmd);
void onErrorCallback(improv::Error err);
