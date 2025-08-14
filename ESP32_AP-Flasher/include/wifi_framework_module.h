/**
 * @file wifi_framework_module.h
 * @brief WiFi Module using Common Framework
 *
 * This demonstrates how to refactor existing WiFi functionality to use
 * the common framework utilities for consistency and reusability.
 */

#pragma once

#include <WiFi.h>
#include <WiFiAP.h>
#include <WiFiMulti.h>
#include <WiFiSTA.h>
#include <esp_netif.h>
#include <esp_wifi.h>

#include "common_framework.h"
#include "wifi_utils.h"

// ============================================================================
// WiFi Framework Module
// ============================================================================

class WiFiFrameworkModule : public EnhancedModuleBase, public CommunicationBase {
   private:
    // Configuration section name
    static constexpr const char* CONFIG_NAMESPACE = "wifi_framework";

    // WiFi Management
    WiFiMulti _wifiMulti;
    std::vector<WiFiCredentials> _savedNetworks;
    String _currentSSID;
    String _currentPassword;
    WiFiMode_t _currentMode;

    // AP Configuration
    String _apSSID;
    String _apPassword;
    IPAddress _apIP;
    IPAddress _apGateway;
    IPAddress _apSubnet;

    // Connection Management
    uint32_t _connectionTimeout;
    uint32_t _reconnectInterval;
    uint32_t _lastConnectionAttempt;
    uint32_t _connectionAttempts;
    bool _autoReconnect;

    // Monitoring
    TaskHandle_t _monitorTask;
    uint32_t _signalScanInterval;
    uint32_t _lastSignalScan;
    std::vector<WiFiNetworkInfo> _availableNetworks;

    // Statistics
    struct WiFiStats {
        uint32_t connectionAttempts = 0;
        uint32_t successfulConnections = 0;
        uint32_t disconnections = 0;
        uint32_t apClientConnections = 0;
        uint32_t apClientDisconnections = 0;
        uint32_t dataTransferred = 0;
        uint32_t signalScans = 0;
        int8_t lastRSSI = 0;
        uint32_t totalUptime = 0;
        uint32_t connectionUptime = 0;
    } _wifiStats;

   public:
    WiFiFrameworkModule();
    virtual ~WiFiFrameworkModule();

    // Enhanced Module Interface
    bool doInitialize() override;
    bool doStart() override;
    bool doStop() override;
    void doUpdate() override;
    void doHandleEvent(const String& event, const String& data) override;

    // WiFi Management API
    bool connectToNetwork(const String& ssid, const String& password, uint32_t timeout = 0);
    bool startAccessPoint(const String& ssid, const String& password = "",
                          const IPAddress& ip = IPAddress(192, 168, 4, 1));
    bool startMixedMode(const String& staSSID, const String& staPassword,
                        const String& apSSID, const String& apPassword = "");

    // Network Management
    bool addNetwork(const String& ssid, const String& password, int priority = 0);
    bool removeNetwork(const String& ssid);
    bool clearNetworks();
    std::vector<WiFiCredentials> getSavedNetworks() const;

    // Configuration Management
    bool setAutoReconnect(bool enable);
    bool setConnectionTimeout(uint32_t timeout);
    bool setReconnectInterval(uint32_t interval);
    bool setSignalScanInterval(uint32_t interval);

    // Network Information
    WiFiConnectionInfo getConnectionInfo() const;
    std::vector<WiFiNetworkInfo> getAvailableNetworks(bool forceRescan = false);
    WiFiNetworkInfo getCurrentNetwork() const;
    WiFiSignalInfo getSignalInfo() const;

    // Status and Diagnostics
    bool isConnected() const override;
    String getConnectionStatus() const;
    String getNetworkDiagnostics() const;
    WiFiNetworkDiagnostics runNetworkDiagnostics() const;

    // AP Management
    std::vector<WiFiClientInfo> getConnectedClients() const;
    int getClientCount() const;
    bool disconnectClient(const String& mac);

    // Statistics and Monitoring
    const WiFiStats& getWiFiStats() const { return _wifiStats; }
    String getStatsJson() const;
    void resetStats();

    // Web API Integration
    void registerWebHandlers(AsyncWebServer* server);

   private:
    // Internal Methods
    void loadConfiguration();
    void saveConfiguration();
    void loadSavedNetworks();
    void saveSavedNetworks();

    // Connection Management
    bool attemptConnection();
    void handleConnectionEvent(WiFiEvent_t event, WiFiEventInfo_t info);
    void startMonitorTask();
    void stopMonitorTask();
    static void monitorTaskWrapper(void* parameter);
    void monitorTaskLoop();

    // Network Scanning
    void scanNetworks();
    void updateSignalStrength();

    // Configuration Helpers
    void setDefaultConfiguration();
    WiFiNetworkInfo networkInfoFromScanResult(int index) const;

    // Event Handlers
    void onWiFiConnected();
    void onWiFiDisconnected();
    void onAPClientConnected(WiFiEventSoftAPModeStationConnected event);
    void onAPClientDisconnected(WiFiEventSoftAPModeStationDisconnected event);

    // Web API Handlers
    void handleGetStatus(AsyncWebServerRequest* request);
    void handleGetNetworks(AsyncWebServerRequest* request);
    void handleConnect(AsyncWebServerRequest* request);
    void handleDisconnect(AsyncWebServerRequest* request);
    void handleStartAP(AsyncWebServerRequest* request);
    void handleStopAP(AsyncWebServerRequest* request);
    void handleScanNetworks(AsyncWebServerRequest* request);
    void handleGetClients(AsyncWebServerRequest* request);
    void handleGetStats(AsyncWebServerRequest* request);
    void handleSetConfig(AsyncWebServerRequest* request);
    void handleRunDiagnostics(AsyncWebServerRequest* request);
};

// ============================================================================
// WiFi Manager Singleton
// ============================================================================

class WiFiManager {
   private:
    static WiFiManager* instance;
    WiFiFrameworkModule* _wifiModule;

    WiFiManager();

   public:
    static WiFiManager& getInstance();
    ~WiFiManager();

    // Module Management
    bool initialize();
    bool start();
    bool stop();
    void cleanup();

    // Direct Access
    WiFiFrameworkModule* getModule() { return _wifiModule; }
    const WiFiFrameworkModule* getModule() const { return _wifiModule; }

    // Convenience Methods
    bool isConnected() const;
    String getSSID() const;
    String getIP() const;
    int getRSSI() const;

    // Quick Configuration
    bool quickConnect(const String& ssid, const String& password);
    bool quickAP(const String& ssid, const String& password = "");

    // Event Callbacks
    using WiFiEventCallback = std::function<void(WiFiEvent_t, const String&)>;
    void setEventCallback(WiFiEventCallback callback);
};

// Global WiFi manager instance
extern WiFiManager& wifiManager;

// ============================================================================
// Utility Functions
// ============================================================================

namespace WiFiFrameworkUtils {
// Convert WiFi types to strings
String wifiModeToString(WiFiMode_t mode);
String wifiStatusToString(wl_status_t status);
String wifiEventToString(WiFiEvent_t event);
String wifiAuthModeToString(wifi_auth_mode_t authMode);
String wifiDisconnectReasonToString(uint8_t reason);

// Network validation
bool isValidSSID(const String& ssid);
bool isValidPassword(const String& password, wifi_auth_mode_t authMode);
bool isValidIP(const String& ip);
bool isValidMacAddress(const String& mac);

// Signal strength utilities
String rssiToSignalStrength(int rssi);
String rssiToDescription(int rssi);
int calculateSignalQuality(int rssi);

// Network analysis
String analyzeNetworkSecurity(wifi_auth_mode_t authMode);
String getChannelDescription(int channel);
bool isChannelOptimal(int channel, const std::vector<WiFiNetworkInfo>& networks);

// Configuration helpers
IPAddress stringToIP(const String& ipStr);
String ipToString(const IPAddress& ip);
String macToString(const uint8_t* mac);

// Performance utilities
uint32_t estimateBandwidth(int rssi, wifi_auth_mode_t authMode);
String getRecommendedSettings(const WiFiNetworkInfo& network);
}  // namespace WiFiFrameworkUtils

// ============================================================================
// Configuration Structure
// ============================================================================

struct WiFiFrameworkConfig {
    // Connection Settings
    String defaultSSID = "";
    String defaultPassword = "";
    uint32_t connectionTimeout = 10000;
    uint32_t reconnectInterval = 30000;
    bool autoReconnect = true;

    // AP Settings
    String apSSID = "OpenEPaperLink-AP";
    String apPassword = "";
    String apIP = "192.168.4.1";
    String apGateway = "192.168.4.1";
    String apSubnet = "255.255.255.0";
    int apChannel = 1;
    bool apHidden = false;
    int apMaxClients = 4;

    // Monitoring Settings
    uint32_t signalScanInterval = 30000;
    bool enableMonitoring = true;
    bool enableSignalMonitoring = true;
    bool enableNetworkScanning = true;

    // Advanced Settings
    bool enablePowerSaving = false;
    int txPower = 20;  // dBm
    bool enableHostname = true;
    String hostname = "openepaperlink";

    // Diagnostic Settings
    bool enableDiagnostics = true;
    uint32_t diagnosticsInterval = 60000;
    bool logConnectionEvents = true;

    // Performance Settings
    bool enableFastConnect = true;
    bool enableMulticast = true;
    bool enableIPv6 = false;

    // Security Settings
    bool requireWPA2 = true;
    bool allowOpenNetworks = false;
    int maxConnectionAttempts = 3;

    // Convert to/from JSON
    String toJson() const;
    bool fromJson(const String& json);

    // Validation
    bool validate() const;
    void setDefaults();
};

// ============================================================================
// Integration Macros
// ============================================================================

// Easy configuration access
#define WIFI_CONFIG_GET(key, def) MODULE_CONFIG_GET(CONFIG_NAMESPACE, key, def)
#define WIFI_CONFIG_SET(key, val) MODULE_CONFIG_SET(CONFIG_NAMESPACE, key, val)

// Event publishing
#define WIFI_PUBLISH_EVENT(event, data) PUBLISH_MODULE_EVENT("WiFiFramework", event, data)

// Logging
#define WIFI_LOG_INFO(msg) MODULE_LOG_INFO("WiFiFramework", msg)
#define WIFI_LOG_WARNING(msg) MODULE_LOG_WARNING("WiFiFramework", msg)
#define WIFI_LOG_ERROR(msg) MODULE_LOG_ERROR("WiFiFramework", msg)
#define WIFI_LOG_DEBUG(msg) MODULE_LOG_DEBUG("WiFiFramework", msg)
