/**
 * @file wifi_unified_module.h
 * @brief Unified WiFi Module using Common Framework
 *
 * This replaces:
 * - wifi_utils.h/cpp
 * - wifi_advanced.h
 * - Parts of json_config WiFi sections
 *
 * Provides centralized WiFi management with framework integration
 */

#pragma once

#include <WiFi.h>
#include <WiFiAP.h>
#include <WiFiMulti.h>
#include <esp_netif.h>
#include <esp_wifi.h>

#include "common_framework.h"
#include "core_utilities.h"

// ============================================================================
// Unified WiFi Configuration Structure
// ============================================================================

struct UnifiedWiFiConfig {
    // Station (Client) Configuration
    String ssid = "";
    String password = "";
    String hostname = "esp32-ap";
    bool useStaticIP = false;
    String staticIP = "";
    String gateway = "";
    String subnet = "";
    String dns1 = "";
    String dns2 = "";

    // Access Point Configuration
    bool enableAP = true;
    String apSSID = "OpenEPaperLink-AP";
    String apPassword = "";
    uint8_t channel = 1;
    bool apHidden = false;
    uint8_t maxConnections = 4;

    // Advanced Settings
    bool autoReconnect = true;
    bool powerSave = false;
    uint32_t connectionTimeout = 10000;
    uint32_t reconnectInterval = 30000;
    int8_t txPower = 20;
    bool enableImprov = true;

    // Network Monitoring
    bool enableMonitoring = true;
    uint32_t scanInterval = 30000;
    bool enableChannelAnalysis = false;

    // JSON conversion
    String toJson() const;
    bool fromJson(const String& json);
    bool validate() const;
    void setDefaults();
};

// ============================================================================
// Network Information Structures
// ============================================================================

struct NetworkInfo {
    String ssid;
    int8_t rssi;
    wifi_auth_mode_t authMode;
    uint8_t channel;
    String bssid;
    bool isHidden;
    uint32_t lastSeen;

    // Quality metrics
    int signalQuality;
    String signalStrength;
    String authModeString;
    bool isSecure;

    String toJson() const;
};

struct ConnectionInfo {
    bool isConnected;
    String ssid;
    String localIP;
    String gatewayIP;
    String subnetMask;
    String dnsIP;
    int8_t rssi;
    uint8_t channel;
    String mac;
    uint32_t connectionTime;
    String status;

    String toJson() const;
};

struct APInfo {
    bool isEnabled;
    String ssid;
    String ip;
    uint8_t channel;
    uint8_t clientCount;
    std::vector<String> connectedClients;

    String toJson() const;
};

// ============================================================================
// Unified WiFi Module Class
// ============================================================================

class UnifiedWiFiModule : public EnhancedModuleBase, public CommunicationBase {
   private:
    static constexpr const char* CONFIG_NAMESPACE = "wifi_unified";

    // WiFi Management
    WiFiMulti _wifiMulti;
    UnifiedWiFiConfig _config;

    // Connection state
    bool _stationConnected;
    bool _apEnabled;
    uint32_t _lastConnectionAttempt;
    uint32_t _connectionAttempts;
    String _lastError;

    // Network monitoring
    std::vector<NetworkInfo> _availableNetworks;
    uint32_t _lastScan;
    TaskHandle_t _monitorTask;
    bool _scanInProgress;

    // Statistics
    struct WiFiStats {
        uint32_t connectionAttempts = 0;
        uint32_t successfulConnections = 0;
        uint32_t disconnections = 0;
        uint32_t apClientConnections = 0;
        uint32_t scanCount = 0;
        uint32_t totalUptime = 0;
        uint32_t connectionUptime = 0;
        uint32_t dataTransferred = 0;
    } _stats;

    // Event callbacks
    static void onWiFiEvent(WiFiEvent_t event, WiFiEventInfo_t info);
    static UnifiedWiFiModule* _instance;

   public:
    UnifiedWiFiModule();
    virtual ~UnifiedWiFiModule();

    // Framework Interface Implementation
    bool doInitialize() override;
    bool doStart() override;
    bool doStop() override;
    void doUpdate() override;
    void doHandleEvent(const String& event, const String& data) override;

    // Communication Interface
    bool initialize() override { return doInitialize(); }
    bool isConnected() const override { return _stationConnected; }
    void disconnect() override;
    void cleanup() override;

    // ========================================================================
    // WiFi Management API
    // ========================================================================

    // Connection Management
    bool connectToNetwork(const String& ssid, const String& password, uint32_t timeout = 0);
    bool connectToSavedNetwork();
    bool disconnectStation();
    bool reconnectStation();

    // Access Point Management
    bool startAccessPoint(const String& ssid = "", const String& password = "", uint8_t channel = 1);
    bool stopAccessPoint();
    bool restartAccessPoint();

    // Dual Mode Operations
    bool startDualMode();
    bool enableStationMode(bool enable = true);
    bool enableAPMode(bool enable = true);

    // Network Discovery
    std::vector<NetworkInfo> scanNetworks(bool force = false);
    NetworkInfo getBestNetwork(const std::vector<String>& preferredSSIDs = {});
    bool isNetworkAvailable(const String& ssid);

    // Configuration Management
    bool setConfiguration(const UnifiedWiFiConfig& config);
    UnifiedWiFiConfig getConfiguration() const { return _config; }
    bool saveConfiguration();
    bool loadConfiguration();
    bool resetToDefaults();

    // Network Information
    ConnectionInfo getConnectionInfo() const;
    APInfo getAPInfo() const;
    std::vector<NetworkInfo> getAvailableNetworks() const { return _availableNetworks; }
    String getNetworkStatus() const;

    // Advanced Features
    bool setHostname(const String& hostname);
    bool setStaticIP(const String& ip, const String& gateway, const String& subnet, const String& dns1 = "", const String& dns2 = "");
    bool enablePowerSave(bool enable);
    bool setTXPower(int8_t power);

    // Diagnostics and Monitoring
    String runDiagnostics() const;
    String getSignalInfo() const;
    bool performSpeedTest();
    String getChannelAnalysis() const;

    // Client Management (AP Mode)
    std::vector<String> getConnectedClients() const;
    bool disconnectClient(const String& mac);
    void setMaxConnections(uint8_t max);

    // Statistics
    const WiFiStats& getStats() const { return _stats; }
    String getStatsJson() const;
    void resetStats();

    // Web API Registration
    void registerWebHandlers(AsyncWebServer* server) override;

    // ========================================================================
    // Static Utility Methods (for compatibility)
    // ========================================================================

    static String authModeToString(wifi_auth_mode_t authMode);
    static int calculateSignalQuality(int8_t rssi);
    static String formatMacAddress(const uint8_t* mac);
    static String getWiFiStatusString(wl_status_t status);
    static bool isValidSSID(const String& ssid);
    static bool isValidPassword(const String& password);

   private:
    // Internal methods
    void loadDefaults();
    void updateConnectionState();
    void updateAPState();
    void handleConnectionSuccess();
    void handleConnectionFailed();
    void handleDisconnection();
    void handleAPClientConnected(const WiFiEventSoftAPModeStationConnected& event);
    void handleAPClientDisconnected(const WiFiEventSoftAPModeStationDisconnected& event);

    // Background monitoring
    void startMonitorTask();
    void stopMonitorTask();
    static void monitorTaskWrapper(void* parameter);
    void monitorTaskLoop();

    // Network scanning
    void performNetworkScan();
    NetworkInfo parseNetworkInfo(int index) const;
    void updateNetworkList();

    // Configuration helpers
    bool applyNetworkConfiguration();
    bool applyAPConfiguration();
    bool validateConfiguration(const UnifiedWiFiConfig& config) const;

    // Web API handlers
    void handleGetStatus(AsyncWebServerRequest* request);
    void handleGetNetworks(AsyncWebServerRequest* request);
    void handleConnect(AsyncWebServerRequest* request);
    void handleDisconnect(AsyncWebServerRequest* request);
    void handleStartAP(AsyncWebServerRequest* request);
    void handleStopAP(AsyncWebServerRequest* request);
    void handleScanNetworks(AsyncWebServerRequest* request);
    void handleGetConfig(AsyncWebServerRequest* request);
    void handleSetConfig(AsyncWebServerRequest* request);
    void handleGetClients(AsyncWebServerRequest* request);
    void handleGetStats(AsyncWebServerRequest* request);
    void handleRunDiagnostics(AsyncWebServerRequest* request);
    void handleSpeedTest(AsyncWebServerRequest* request);
    void handleChannelAnalysis(AsyncWebServerRequest* request);
    void handleResetConfig(AsyncWebServerRequest* request);
};

// ============================================================================
// Global Instance and Manager
// ============================================================================

class WiFiUnifiedManager {
   private:
    static WiFiUnifiedManager* instance;
    UnifiedWiFiModule* _module;

   public:
    static WiFiUnifiedManager& getInstance();

    bool initialize();
    void cleanup();

    // Direct access to module
    UnifiedWiFiModule* getModule() { return _module; }
    const UnifiedWiFiModule* getModule() const { return _module; }

    // Quick access methods
    bool isConnected() const;
    String getSSID() const;
    String getIP() const;
    int8_t getRSSI() const;
    bool quickConnect(const String& ssid, const String& password);
    bool quickAP(const String& ssid, const String& password = "");
};

// Global instance for easy access
extern WiFiUnifiedManager& wifiUnified;

// ============================================================================
// Migration Macros (for compatibility with existing code)
// ============================================================================

// Replace old wifi_utils calls
#define wifiUtils wifiUnified
#define WiFiUtils UnifiedWiFiModule

// Configuration access
#define WIFI_CONFIG_GET(key, def) CENTRAL_CONFIG_GET("wifi_unified", "general", key, def)
#define WIFI_CONFIG_SET(key, val) CENTRAL_CONFIG_SET("wifi_unified", "general", key, val)

// Event publishing
#define WIFI_EVENT(event, data) PUBLISH_MODULE_EVENT("WiFiUnified", event, data)

// ============================================================================
// Configuration Schema Registration
// ============================================================================

namespace WiFiSchemas {
ModuleConfigSchema createUnifiedWiFiSchema();
void registerWithCentralConfig();
}  // namespace WiFiSchemas

// ============================================================================
// Utility Functions
// ============================================================================

namespace WiFiUnifiedUtils {
// Network validation
bool validateNetworkConfiguration(const UnifiedWiFiConfig& config);
String generateUniqueSSID(const String& prefix);
String generateSecurePassword(uint8_t length = 12);

// Signal analysis
String analyzeSignalQuality(int8_t rssi);
String getChannelRecommendation(const std::vector<NetworkInfo>& networks);
bool isChannelOptimal(uint8_t channel, const std::vector<NetworkInfo>& networks);

// Network discovery
std::vector<String> findOpenNetworks(const std::vector<NetworkInfo>& networks);
std::vector<String> findSecureNetworks(const std::vector<NetworkInfo>& networks);
NetworkInfo findBestNetwork(const std::vector<NetworkInfo>& networks, const std::vector<String>& preferred = {});

// Diagnostics
String performConnectivityTest(const String& host = "8.8.8.8");
String analyzeNetworkPerformance();
String getInterferenceAnalysis(const std::vector<NetworkInfo>& networks);
}  // namespace WiFiUnifiedUtils

// ============================================================================
// Legacy Compatibility Layer
// ============================================================================

// This allows existing code to continue working while transitioning
class WiFiLegacyAdapter {
   public:
    // Adapter methods that forward to UnifiedWiFiModule
    static bool begin();
    static bool connect(const String& ssid, const String& password);
    static bool startAP(const String& ssid, const String& password = "");
    static bool isConnected();
    static String getIP();
    static String getSSID();
    static int getRSSI();
    static void disconnect();
    static String getConfig();
    static bool setConfig(const String& json);

    // Legacy event handling
    static void WiFiEvent(WiFiEvent_t event);
};

// Make legacy adapter available globally
extern WiFiLegacyAdapter WiFiCompat;
