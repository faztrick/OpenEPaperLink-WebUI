// Consolidated WiFiModule (legacy WifiManager + enhanced module features)
#pragma once

#include <Arduino.h>
#include <WiFi.h>
#include <WiFiMulti.h>
#include <ArduinoJson.h>
#include <vector>
#include "module_manager.h"

class WiFiModule : public ModuleInterface
{
private:
    // Lifecycle flags
    bool isInitialized = false;
    bool isStarted = false;
    // Timers / counters
    uint32_t lastScanTime = 0;
    uint32_t lastStatusCheck = 0;
    int reconnectAttempts = 0;
    // State
    bool apStarted = false;
    bool useWiFiMulti = false;
    int savedNetworkCount = 0;
    String lastError;
    // Extended feature flags/state
    bool managementAP = false;            // always-on management AP (from config)
    bool suppressAPAutoStop = false;      // prevents auto-stop if managementAP true
    bool scanVerbose = false;             // verbose scan logging
    bool gpioResetArmed = false;          // tracking button hold
    uint32_t gpioResetStart = 0;          // timestamp for long-press
    WiFiEventId_t wifiEventHandlerId = 0; // event handler token
    // Multi network support
    WiFiMulti wifiMulti;
    // Cached static IP settings
    String staticIp, staticMask, staticGw, staticDns;

    // Event history (recent broadcast events captured for diagnostics)
    struct WifiEventRecord
    {
        uint32_t ts; // millis timestamp
        String name;
        String data;
    };
    static constexpr size_t kMaxEventHistory = 16;
    std::vector<WifiEventRecord> eventHistory;

    // Cached scan results
    struct ScanResultItem
    {
        String ssid;
        int32_t rssi = 0;
        int32_t channel = 0;
        String bssid;
        String encryption;
    };
    std::vector<ScanResultItem> lastScanResults;
    bool scanInProgress = false; // track async scan state for /api/wifi/scan/results

    struct StaConfig
    {
        String primarySsid;
        String primaryPassword;
        JsonArray networks; // view into loaded document (do not persist outside scope)
        bool powerSave = false;
        String hostname;
        String ip;
        String mask;
        String gw;
        String dns;
    };

public:
    // Module lifecycle
    bool initialize() override;
    bool start() override;
    bool stop() override;
    bool cleanup() override;

    // Module information
    ModuleInfo getInfo() const override;
    ModuleType getType() const override { return ModuleType::COMMUNICATION; }
    ModuleState getState() const override;
    bool isHealthy() const override;

    // Interfaces
    void registerWebHandlers(AsyncWebServer &server) override;
    void handleEvent(const String &event, const String &data) override;
    void update() override;
    String getConfig() const override;             // Returns combined station/AP config
    bool setConfig(const String &config) override; // Updates station/AP config
    String getStatus() const override;             // Returns runtime status JSON
    void getMetrics(JsonObject &metrics) const override;

    // Expose recent events (for API endpoint)
    void appendEvent(const String &name, const String &data);

    // Convenience accessor
    IPAddress localIP() const { return WiFi.localIP(); }

private:
    // Helpers
    void performWiFiScan();
    void checkConnectionStatus();
    bool attemptReconnection();
    void optimizeWiFiSettings();
    void loadSavedNetworks();
    void startFallbackAP();
    void stopFallbackAPIfIdle();
    void applyStaticIpIfConfigured();
    void loadApConfig(JsonDocument &outApCfg);                // loads /current/apconfig.json for AP customization
    bool loadStaConfig(JsonDocument &doc, StaConfig &outCfg); // unified loader for station JSON
    void applyStaticIpFrom(const StaConfig &cfg);
    void registerWiFiEvents();
    void logDisconnectReason(uint8_t reason);
    void maybeStartManagementAP();        // start AP early if managementAP enabled
    void handleGpioResetCheck();          // credential wipe via GPIO0 long press
    bool wipeStaCredentials();            // delete /current/staconfig.json
    String buildDefaultHostname() const;  // MAC-based hostname
    void cacheScanResults(int16_t count); // populate lastScanResults from WiFi.scan* API
};

// Registration helper
void registerWiFiModule();
