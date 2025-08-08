#pragma once

#include <ArduinoJson.h>
#include <WiFi.h>

#include <algorithm>
#include <vector>

// Centralized WiFi utilities to eliminate duplicate code
// ======================================================

#define MAX_WIFI_NETWORKS 50

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

class WiFiUtils {
   private:
    static WiFiUtils* instance;
    static SemaphoreHandle_t scanMutex;
    static uint32_t lastScanTime;
    static bool scanInProgress;

    WiFiUtils();

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

    // Utility functions
    static String getEncryptionString(wifi_auth_mode_t encryption);
    static int calculateSignalQuality(int rssi);

    // Cleanup
    void cleanup();
};
