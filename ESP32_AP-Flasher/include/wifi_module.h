#ifndef WIFI_MODULE_H
#define WIFI_MODULE_H

#include <WiFi.h>
#include <ArduinoJson.h>

#include "module_manager.h"

// Enhanced WiFi Module with Module Manager Integration
class WiFiModule : public ModuleInterface
{
private:
    bool isInitialized = false;
    bool isStarted = false;
    uint32_t lastScanTime = 0;
    uint32_t lastStatusCheck = 0;
    String lastError = "";
    int reconnectAttempts = 0;

public:
    // Module lifecycle
    bool initialize() override;
    bool start() override;
    bool stop() override;
    bool cleanup() override;

    // Module information
    ModuleInfo getInfo() const override;
    ModuleType getType() const override;
    ModuleState getState() const override;
    bool isHealthy() const override;

    // Module interfaces
    void registerWebHandlers(AsyncWebServer &server) override;
    void handleEvent(const String &event, const String &data) override;
    void update() override;

    // Configuration
    String getConfig() const override;
    bool setConfig(const String &config) override;
    String getStatus() const override;
    void getMetrics(JsonObject &metrics) const override;

private:
    void performWiFiScan();
    void checkConnectionStatus();
    void handleDisconnection();
    bool attemptReconnection();
    void optimizeWiFiSettings();
};

// WiFi module registration function
void registerWiFiModule();

#endif // WIFI_MODULE_H
