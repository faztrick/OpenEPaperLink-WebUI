#include "wifi_utils.h"

#include <ArduinoJson.h>
#include <WiFi.h>

// Centralized WiFi utilities to eliminate duplicate code
// ====================================================

WiFiUtils* WiFiUtils::instance = nullptr;
SemaphoreHandle_t WiFiUtils::scanMutex = nullptr;
uint32_t WiFiUtils::lastScanTime = 0;
bool WiFiUtils::scanInProgress = false;

WiFiUtils& WiFiUtils::getInstance() {
    if (!instance) {
        instance = new WiFiUtils();
    }
    return *instance;
}

WiFiUtils::WiFiUtils() {
    if (!scanMutex) {
        scanMutex = xSemaphoreCreateMutex();
    }
}

bool WiFiUtils::performAsyncScan(bool showHidden, uint32_t maxWaitMs) {
    if (!scanMutex) return false;

    // Prevent concurrent scans
    if (xSemaphoreTake(scanMutex, pdMS_TO_TICKS(100)) != pdTRUE) {
        return false;
    }

    // Rate limiting - don't scan more than once every 25 seconds
    uint32_t now = millis();
    if (now - lastScanTime < 25000 && lastScanTime > 0) {
        xSemaphoreGive(scanMutex);
        return false;
    }

    // Ensure WiFi is in correct mode for scanning
    wifi_mode_t currentMode = WiFi.getMode();
    if (currentMode == WIFI_OFF) {
        WiFi.mode(WIFI_STA);
        delay(100);
    } else if (currentMode == WIFI_AP) {
        WiFi.mode(WIFI_AP_STA);
        delay(100);
    }

    // Clear previous results and start new scan
    WiFi.scanDelete();
    int16_t result = WiFi.scanNetworks(true, showHidden);  // Async scan

    if (result == WIFI_SCAN_RUNNING) {
        scanInProgress = true;
        lastScanTime = now;
        xSemaphoreGive(scanMutex);
        return true;
    }

    xSemaphoreGive(scanMutex);
    return false;
}

WiFiScanResult WiFiUtils::getScanResults(bool clearAfter) {
    WiFiScanResult result;
    result.success = false;
    result.scanInProgress = false;
    result.networksFound = 0;

    int16_t scanResult = WiFi.scanComplete();
    result.scanInProgress = (scanResult == WIFI_SCAN_RUNNING);

    if (scanResult > 0) {
        result.success = true;
        result.networksFound = scanResult;

        // Build networks array
        for (int i = 0; i < scanResult && i < MAX_WIFI_NETWORKS; i++) {
            WiFiNetworkInfo network;
            network.ssid = WiFi.SSID(i);
            network.rssi = WiFi.RSSI(i);
            network.channel = WiFi.channel(i);
            network.encryption = WiFi.encryptionType(i);
            network.bssid = WiFi.BSSIDstr(i);
            result.networks.push_back(network);
        }

        // Sort by signal strength (strongest first)
        std::sort(result.networks.begin(), result.networks.end(),
                  [](const WiFiNetworkInfo& a, const WiFiNetworkInfo& b) {
                      return a.rssi > b.rssi;
                  });

        if (clearAfter) {
            WiFi.scanDelete();
            scanInProgress = false;
        }
    } else if (scanResult == WIFI_SCAN_FAILED) {
        result.success = false;
        result.errorMessage = "Scan failed";
        scanInProgress = false;
    }

    return result;
}

String WiFiUtils::buildScanResultsJson(bool clearAfter) {
    WiFiScanResult scanResult = getScanResults(clearAfter);

    DynamicJsonDocument doc(4096);
    doc["success"] = scanResult.success;
    doc["scanInProgress"] = scanResult.scanInProgress;
    doc["networksFound"] = scanResult.networksFound;
    doc["lastScanTime"] = lastScanTime;

    if (!scanResult.errorMessage.isEmpty()) {
        doc["error"] = scanResult.errorMessage;
    }

    JsonArray networks = doc["networks"].to<JsonArray>();
    for (const auto& network : scanResult.networks) {
        JsonObject net = networks.createNestedObject();
        net["ssid"] = network.ssid;
        net["rssi"] = network.rssi;
        net["channel"] = network.channel;
        net["encryption"] = getEncryptionString(network.encryption);
        net["bssid"] = network.bssid;
        net["quality"] = calculateSignalQuality(network.rssi);
    }

    String json;
    serializeJson(doc, json);
    return json;
}

String WiFiUtils::getEncryptionString(wifi_auth_mode_t encryption) {
    switch (encryption) {
        case WIFI_AUTH_OPEN:
            return "Open";
        case WIFI_AUTH_WEP:
            return "WEP";
        case WIFI_AUTH_WPA_PSK:
            return "WPA";
        case WIFI_AUTH_WPA2_PSK:
            return "WPA2";
        case WIFI_AUTH_WPA_WPA2_PSK:
            return "WPA/WPA2";
        case WIFI_AUTH_WPA2_ENTERPRISE:
            return "WPA2-Enterprise";
        case WIFI_AUTH_WPA3_PSK:
            return "WPA3";
        case WIFI_AUTH_WPA2_WPA3_PSK:
            return "WPA2/WPA3";
        case WIFI_AUTH_WAPI_PSK:
            return "WAPI";
        default:
            return "Unknown";
    }
}

int WiFiUtils::calculateSignalQuality(int rssi) {
    if (rssi >= -50) return 100;
    if (rssi >= -60) return 75;
    if (rssi >= -70) return 50;
    if (rssi >= -80) return 25;
    return 0;
}

WiFiConnectionInfo WiFiUtils::getConnectionInfo() {
    WiFiConnectionInfo info;
    info.connected = (WiFi.status() == WL_CONNECTED);
    info.ssid = WiFi.SSID();
    info.ip = WiFi.localIP().toString();
    info.gateway = WiFi.gatewayIP().toString();
    info.dns = WiFi.dnsIP().toString();
    info.rssi = WiFi.RSSI();
    info.channel = WiFi.channel();
    info.mac = WiFi.macAddress();
    info.hostname = WiFi.getHostname();
    info.mode = WiFi.getMode();
    info.apEnabled = (WiFi.getMode() == WIFI_AP || WiFi.getMode() == WIFI_AP_STA);
    info.apClients = WiFi.softAPgetStationNum();
    info.apIP = WiFi.softAPIP().toString();
    return info;
}

String WiFiUtils::getConnectionInfoJson() {
    WiFiConnectionInfo info = getConnectionInfo();

    DynamicJsonDocument doc(1024);
    doc["connected"] = info.connected;
    doc["ssid"] = info.ssid;
    doc["ip"] = info.ip;
    doc["gateway"] = info.gateway;
    doc["dns"] = info.dns;
    doc["rssi"] = info.rssi;
    doc["channel"] = info.channel;
    doc["mac"] = info.mac;
    doc["hostname"] = info.hostname;
    doc["mode"] = info.mode;
    doc["apEnabled"] = info.apEnabled;
    doc["apClients"] = info.apClients;
    doc["apIP"] = info.apIP;
    doc["quality"] = calculateSignalQuality(info.rssi);

    String json;
    serializeJson(doc, json);
    return json;
}

bool WiFiUtils::isScanning() {
    return scanInProgress || (WiFi.scanComplete() == WIFI_SCAN_RUNNING);
}

void WiFiUtils::cleanup() {
    if (scanMutex) {
        if (xSemaphoreTake(scanMutex, pdMS_TO_TICKS(1000)) == pdTRUE) {
            WiFi.scanDelete();
            scanInProgress = false;
            xSemaphoreGive(scanMutex);
        }
    }
}
