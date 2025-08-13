/**
 * @file core_utilities.cpp
 * @brief Consolidated core utility functions for ESP32_AP-Flasher
 *
 * This file consolidates and optimizes utility functions from:
 * - common_utils.cpp
 * - system_utilities.cpp
 * - storage_utils.cpp
 * - data_utilities.cpp
 *
 * @author OpenEPaperLink Contributors
 * @version Optimized Consolidated Implementation
 */

#include "core_utilities.h"

#include <Arduino.h>
#include <Preferences.h>
#include <WiFi.h>
#include <esp_system.h>
#include <nvs_flash.h>

#include "build_constants.h"

// ============================================================================
// Global Variables and Mutexes
// ============================================================================
static SemaphoreHandle_t g_coreMutex = nullptr;
static bool g_coreInitialized = false;

// ============================================================================
// Core System Utilities
// ============================================================================
namespace CoreUtils {

bool initialize() {
    if (g_coreInitialized) return true;

    g_coreMutex = xSemaphoreCreateMutex();
    if (!g_coreMutex) {
        Serial.println("[CORE_UTILS] Failed to create mutex");
        return false;
    }

    // Initialize NVS if not already done
    esp_err_t ret = nvs_flash_init();
    if (ret == ESP_ERR_NVS_NO_FREE_PAGES || ret == ESP_ERR_NVS_NEW_VERSION_FOUND) {
        ESP_ERROR_CHECK(nvs_flash_erase());
        ret = nvs_flash_init();
    }

    g_coreInitialized = (ret == ESP_OK);

    if (g_coreInitialized) {
        Serial.println("[CORE_UTILS] Core utilities initialized successfully");
    } else {
        Serial.println("[CORE_UTILS] Failed to initialize core utilities");
    }

    return g_coreInitialized;
}

void cleanup() {
    if (g_coreMutex) {
        vSemaphoreDelete(g_coreMutex);
        g_coreMutex = nullptr;
    }
    g_coreInitialized = false;
}

bool isInitialized() {
    return g_coreInitialized;
}

String formatUptime(unsigned long milliseconds) {
    unsigned long seconds = milliseconds / 1000;
    unsigned long minutes = seconds / 60;
    unsigned long hours = minutes / 60;
    unsigned long days = hours / 24;

    if (days > 0) {
        return String(days) + "d " + String(hours % 24) + "h " + String(minutes % 60) + "m";
    } else if (hours > 0) {
        return String(hours) + "h " + String(minutes % 60) + "m " + String(seconds % 60) + "s";
    } else if (minutes > 0) {
        return String(minutes) + "m " + String(seconds % 60) + "s";
    } else {
        return String(seconds) + "s";
    }
}

String formatBytes(size_t bytes) {
    if (bytes < 1024)
        return String(bytes) + " B";
    else if (bytes < 1024 * 1024)
        return String(bytes / 1024.0, 1) + " KB";
    else if (bytes < 1024 * 1024 * 1024)
        return String(bytes / (1024.0 * 1024.0), 1) + " MB";
    else
        return String(bytes / (1024.0 * 1024.0 * 1024.0), 1) + " GB";
}

void safeDelay(unsigned long ms) {
    unsigned long start = millis();
    while (millis() - start < ms) {
        yield();
        vTaskDelay(pdMS_TO_TICKS(1));
    }
}

bool safeTakeMutex(SemaphoreHandle_t mutex, TickType_t timeout) {
    return mutex && (xSemaphoreTake(mutex, timeout) == pdTRUE);
}

void safeGiveMutex(SemaphoreHandle_t mutex) {
    if (mutex) {
        xSemaphoreGive(mutex);
    }
}

String sanitizeString(const String& input, size_t maxLength) {
    String result = input;
    result.trim();

    // Remove control characters
    for (int i = 0; i < result.length(); i++) {
        if (result[i] < 32 || result[i] > 126) {
            result.remove(i, 1);
            i--;
        }
    }

    if (result.length() > maxLength) {
        result = result.substring(0, maxLength);
    }

    return result;
}

}  // namespace CoreUtils

// ============================================================================
// Validation Utilities
// ============================================================================
namespace ValidationUtils {

bool isValidIP(const String& ip) {
    IPAddress addr;
    return addr.fromString(ip);
}

bool isValidSSID(const String& ssid) {
    return ssid.length() > 0 && ssid.length() <= 32;
}

bool isValidPassword(const String& password) {
    // Allow empty password for open networks, otherwise min 8 chars for WPA
    return password.length() == 0 || (password.length() >= 8 && password.length() <= 63);
}

bool isValidHostname(const String& hostname) {
    if (hostname.length() == 0 || hostname.length() > 63) return false;

    for (int i = 0; i < hostname.length(); i++) {
        char c = hostname[i];
        if (!((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') ||
              (c >= '0' && c <= '9') || c == '-')) {
            return false;
        }
        if (i == 0 || i == hostname.length() - 1) {
            if (c == '-') return false;  // Cannot start or end with hyphen
        }
    }
    return true;
}

bool isValidMacAddress(const String& mac) {
    if (mac.length() != 17) return false;  // Format: XX:XX:XX:XX:XX:XX

    for (int i = 0; i < 17; i++) {
        if (i % 3 == 2) {
            if (mac[i] != ':') return false;
        } else {
            char c = mac[i];
            if (!((c >= '0' && c <= '9') || (c >= 'A' && c <= 'F') || (c >= 'a' && c <= 'f'))) {
                return false;
            }
        }
    }
    return true;
}

String parseQuotedString(const String& input) {
    String trimmed = input;
    trimmed.trim();

    if (trimmed.startsWith("\"") && trimmed.endsWith("\"") && trimmed.length() >= 2) {
        return trimmed.substring(1, trimmed.length() - 1);
    }

    return trimmed;
}

}  // namespace ValidationUtils

// ============================================================================
// Storage Management System
// ============================================================================
namespace StorageManager {

// Internal storage statistics
struct StorageStats {
    uint32_t totalReads = 0;
    uint32_t totalWrites = 0;
    uint32_t failedReads = 0;
    uint32_t failedWrites = 0;
    uint32_t lastOperationTime = 0;
    bool isHealthy = true;
    String lastError = "";
};

static StorageStats g_stats;

bool openNamespace(Preferences& prefs, const String& nameSpace, bool readOnly) {
    return prefs.begin(nameSpace.c_str(), readOnly);
}

void updateStats(bool success, bool isWrite) {
    if (!CoreUtils::safeTakeMutex(g_coreMutex, pdMS_TO_TICKS(100))) return;

    if (isWrite) {
        g_stats.totalWrites++;
        if (!success) g_stats.failedWrites++;
    } else {
        g_stats.totalReads++;
        if (!success) g_stats.failedReads++;
    }
    g_stats.lastOperationTime = millis();
    g_stats.isHealthy = (g_stats.failedReads + g_stats.failedWrites) < 10;

    CoreUtils::safeGiveMutex(g_coreMutex);
}

Result setString(const String& nameSpace, const String& key, const String& value) {
    if (!ValidationUtils::isValidHostname(nameSpace) || key.isEmpty()) {
        return Result::VALIDATION_ERROR;
    }

    Preferences prefs;
    if (!openNamespace(prefs, nameSpace, false)) {
        updateStats(false, true);
        g_stats.lastError = "Failed to open namespace: " + nameSpace;
        return Result::NAMESPACE_ERROR;
    }

    size_t bytesWritten = prefs.putString(key.c_str(), value);
    prefs.end();

    bool success = (bytesWritten > 0);
    updateStats(success, true);

    return success ? Result::SUCCESS : Result::WRITE_ERROR;
}

String getString(const String& nameSpace, const String& key, const String& defaultValue) {
    if (!ValidationUtils::isValidHostname(nameSpace) || key.isEmpty()) {
        updateStats(false, false);
        return defaultValue;
    }

    Preferences prefs;
    if (!openNamespace(prefs, nameSpace, true)) {
        updateStats(false, false);
        g_stats.lastError = "Failed to open namespace: " + nameSpace;
        return defaultValue;
    }

    String value = prefs.getString(key.c_str(), defaultValue);
    prefs.end();

    updateStats(true, false);
    return value;
}

Result setInt(const String& nameSpace, const String& key, int32_t value) {
    if (!ValidationUtils::isValidHostname(nameSpace) || key.isEmpty()) {
        return Result::VALIDATION_ERROR;
    }

    Preferences prefs;
    if (!openNamespace(prefs, nameSpace, false)) {
        updateStats(false, true);
        g_stats.lastError = "Failed to open namespace: " + nameSpace;
        return Result::NAMESPACE_ERROR;
    }

    size_t bytesWritten = prefs.putInt(key.c_str(), value);
    prefs.end();

    bool success = (bytesWritten > 0);
    updateStats(success, true);

    return success ? Result::SUCCESS : Result::WRITE_ERROR;
}

int32_t getInt(const String& nameSpace, const String& key, int32_t defaultValue) {
    if (!ValidationUtils::isValidHostname(nameSpace) || key.isEmpty()) {
        updateStats(false, false);
        return defaultValue;
    }

    Preferences prefs;
    if (!openNamespace(prefs, nameSpace, true)) {
        updateStats(false, false);
        g_stats.lastError = "Failed to open namespace: " + nameSpace;
        return defaultValue;
    }

    int32_t value = prefs.getInt(key.c_str(), defaultValue);
    prefs.end();

    updateStats(true, false);
    return value;
}

Result setBool(const String& nameSpace, const String& key, bool value) {
    if (!ValidationUtils::isValidHostname(nameSpace) || key.isEmpty()) {
        return Result::VALIDATION_ERROR;
    }

    Preferences prefs;
    if (!openNamespace(prefs, nameSpace, false)) {
        updateStats(false, true);
        g_stats.lastError = "Failed to open namespace: " + nameSpace;
        return Result::NAMESPACE_ERROR;
    }

    size_t bytesWritten = prefs.putBool(key.c_str(), value);
    prefs.end();

    bool success = (bytesWritten > 0);
    updateStats(success, true);

    return success ? Result::SUCCESS : Result::WRITE_ERROR;
}

bool getBool(const String& nameSpace, const String& key, bool defaultValue) {
    if (!ValidationUtils::isValidHostname(nameSpace) || key.isEmpty()) {
        updateStats(false, false);
        return defaultValue;
    }

    Preferences prefs;
    if (!openNamespace(prefs, nameSpace, true)) {
        updateStats(false, false);
        g_stats.lastError = "Failed to open namespace: " + nameSpace;
        return defaultValue;
    }

    bool value = prefs.getBool(key.c_str(), defaultValue);
    prefs.end();

    updateStats(true, false);
    return value;
}

void printStatistics() {
    if (!CoreUtils::safeTakeMutex(g_coreMutex, pdMS_TO_TICKS(100))) return;

    LogUtils::logInfo("=== Storage Manager Statistics ===");
    LogUtils::logInfo("Total Reads: " + String(g_stats.totalReads));
    LogUtils::logInfo("Total Writes: " + String(g_stats.totalWrites));
    LogUtils::logInfo("Failed Reads: " + String(g_stats.failedReads));
    LogUtils::logInfo("Failed Writes: " + String(g_stats.failedWrites));
    LogUtils::logInfo("Health Status: " + String(g_stats.isHealthy ? "HEALTHY" : "UNHEALTHY"));
    if (!g_stats.lastError.isEmpty()) {
        LogUtils::logInfo("Last Error: " + g_stats.lastError);
    }
    LogUtils::logInfo("=================================");

    CoreUtils::safeGiveMutex(g_coreMutex);
}

void resetStatistics() {
    if (!CoreUtils::safeTakeMutex(g_coreMutex, pdMS_TO_TICKS(100))) return;
    g_stats = StorageStats();
    CoreUtils::safeGiveMutex(g_coreMutex);
}

}  // namespace StorageManager

// ============================================================================
// System Information Utilities
// ============================================================================
namespace SystemInfo {

JsonObject buildSystemInfo(JsonDocument& doc) {
    JsonObject sys = doc["system"].to<JsonObject>();

    // Basic system info
    sys["chipModel"] = ESP.getChipModel();
    sys["chipRevision"] = ESP.getChipRevision();
    sys["cpuFreq"] = ESP.getCpuFreqMHz();
    sys["freeHeap"] = ESP.getFreeHeap();
    sys["totalHeap"] = ESP.getHeapSize();
    sys["minFreeHeap"] = ESP.getMinFreeHeap();
    sys["maxAllocHeap"] = ESP.getMaxAllocHeap();
    sys["heapUsage"] = 100 - ((ESP.getFreeHeap() * 100) / ESP.getHeapSize());
    sys["uptime"] = CoreUtils::formatUptime(millis());
    sys["uptimeMs"] = millis();
    sys["timestamp"] = millis();

    // Flash info
    sys["flashSize"] = CoreUtils::formatBytes(ESP.getFlashChipSize());
    sys["flashSizeBytes"] = ESP.getFlashChipSize();
    sys["flashSpeed"] = ESP.getFlashChipSpeed();
    sys["sketchSize"] = CoreUtils::formatBytes(ESP.getSketchSize());
    sys["sketchSizeBytes"] = ESP.getSketchSize();
    sys["freeSketchSpace"] = CoreUtils::formatBytes(ESP.getFreeSketchSpace());
    sys["freeSketchSpaceBytes"] = ESP.getFreeSketchSpace();

    // Temperature if available
    sys["temperature"] = temperatureRead();

    // Build info
    sys["firmware"] = "OpenEPaperLink ESP32_AP-Flasher";
    sys["version"] = BUILD_VERSION;
    sys["author"] = BUILD_AUTHOR;
    sys["buildTime"] = __DATE__ " " __TIME__;

    return sys;
}

JsonObject buildMemoryInfo(JsonDocument& doc) {
    JsonObject memory = doc["memory"].to<JsonObject>();

    size_t freeHeap = ESP.getFreeHeap();
    size_t totalHeap = ESP.getHeapSize();

    memory["freeHeap"] = CoreUtils::formatBytes(freeHeap);
    memory["freeHeapBytes"] = freeHeap;
    memory["totalHeap"] = CoreUtils::formatBytes(totalHeap);
    memory["totalHeapBytes"] = totalHeap;
    memory["minFreeHeap"] = CoreUtils::formatBytes(ESP.getMinFreeHeap());
    memory["minFreeHeapBytes"] = ESP.getMinFreeHeap();
    memory["maxAllocHeap"] = CoreUtils::formatBytes(ESP.getMaxAllocHeap());
    memory["maxAllocHeapBytes"] = ESP.getMaxAllocHeap();
    memory["heapUsagePercent"] = 100 - ((freeHeap * 100) / totalHeap);

    return memory;
}

JsonObject buildHardwareInfo(JsonDocument& doc) {
    JsonObject hw = doc["hardware"].to<JsonObject>();

    // Feature flags - set to false by default, then enable based on compile flags
    hw["HAS_RGB_LED"] = false;
    hw["HAS_TFT"] = false;
    hw["HAS_BLE_WRITER"] = false;
    hw["HAS_SUBGHZ"] = false;
    hw["HAS_C6"] = false;
    hw["HAS_IR_REMOTE"] = false;
    hw["HAS_RC522_RFID"] = false;
    hw["HAS_EXT_FLASHER"] = false;
    hw["HAS_USB"] = false;

#ifdef HAS_RGB_LED
    hw["HAS_RGB_LED"] = true;
#endif
#ifdef HAS_TFT
    hw["HAS_TFT"] = true;
#endif
#ifdef HAS_BLE_WRITER
    hw["HAS_BLE_WRITER"] = true;
#endif
#ifdef HAS_SUBGHZ
    hw["HAS_SUBGHZ"] = true;
#endif
#ifdef HAS_C6
    hw["HAS_C6"] = true;
#endif
#ifdef HAS_IR_REMOTE
    hw["HAS_IR_REMOTE"] = true;
#endif
#ifdef HAS_RC522_RFID
    hw["HAS_RC522_RFID"] = true;
#endif
#ifdef HAS_EXT_FLASHER
    hw["HAS_EXT_FLASHER"] = true;
#endif
#ifdef HAS_USB
    hw["HAS_USB"] = true;
#endif

    return hw;
}

}  // namespace SystemInfo

// ============================================================================
// WiFi Helper Utilities
// ============================================================================
namespace WiFiHelpers {

String authModeToString(wifi_auth_mode_t authMode) {
    switch (authMode) {
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

int authModeToInt(wifi_auth_mode_t authMode) {
    switch (authMode) {
        case WIFI_AUTH_OPEN:
            return 0;
        case WIFI_AUTH_WEP:
            return 1;
        case WIFI_AUTH_WPA_PSK:
            return 2;
        case WIFI_AUTH_WPA2_PSK:
            return 3;
        case WIFI_AUTH_WPA_WPA2_PSK:
            return 4;
        case WIFI_AUTH_WPA2_ENTERPRISE:
            return 5;
        case WIFI_AUTH_WPA3_PSK:
            return 6;
        case WIFI_AUTH_WPA2_WPA3_PSK:
            return 7;
        case WIFI_AUTH_WAPI_PSK:
            return 8;
        default:
            return 0;
    }
}

int calculateSignalQuality(int rssi) {
    if (rssi >= -50) return 100;
    if (rssi >= -60) return 75;
    if (rssi >= -70) return 50;
    if (rssi >= -80) return 25;
    return 0;
}

String getStatusString(wl_status_t status) {
    switch (status) {
        case WL_IDLE_STATUS:
            return "Idle";
        case WL_NO_SSID_AVAIL:
            return "No SSID Available";
        case WL_SCAN_COMPLETED:
            return "Scan Completed";
        case WL_CONNECTED:
            return "Connected";
        case WL_CONNECT_FAILED:
            return "Connection Failed";
        case WL_CONNECTION_LOST:
            return "Connection Lost";
        case WL_DISCONNECTED:
            return "Disconnected";
        default:
            return "Unknown";
    }
}

String buildHostname(const String& prefix) {
    uint8_t mac[6];
    esp_read_mac(mac, ESP_MAC_WIFI_STA);
    char suffix[5];
    snprintf(suffix, sizeof(suffix), "%02X%02X", mac[4], mac[5]);
    return prefix + "-" + String(suffix);
}

JsonObject buildWiFiInfo(JsonDocument& doc) {
    JsonObject wifi = doc["wifi"].to<JsonObject>();

    // Connection status
    wifi["connected"] = WiFi.isConnected();
    wifi["status"] = getStatusString(WiFi.status());

    if (WiFi.isConnected()) {
        wifi["ssid"] = WiFi.SSID();
        wifi["ip"] = WiFi.localIP().toString();
        wifi["gateway"] = WiFi.gatewayIP().toString();
        wifi["subnet"] = WiFi.subnetMask().toString();
        wifi["dns"] = WiFi.dnsIP().toString();
        wifi["rssi"] = WiFi.RSSI();
        wifi["signalQuality"] = calculateSignalQuality(WiFi.RSSI());
        wifi["channel"] = WiFi.channel();
        wifi["bssid"] = WiFi.BSSIDstr();
    }

    wifi["mac"] = WiFi.macAddress();
    wifi["hostname"] = WiFi.getHostname();
    wifi["mode"] = (WiFi.getMode() == WIFI_STA) ? "STA" : (WiFi.getMode() == WIFI_AP)   ? "AP"
                                                      : (WiFi.getMode() == WIFI_AP_STA) ? "AP+STA"
                                                                                        : "OFF";

    // AP info
    wifi["apEnabled"] = (WiFi.getMode() == WIFI_AP || WiFi.getMode() == WIFI_AP_STA);
    if (wifi["apEnabled"]) {
        wifi["apClients"] = WiFi.softAPgetStationNum();
        wifi["apIP"] = WiFi.softAPIP().toString();
        wifi["apSSID"] = WiFi.softAPSSID();
    }

    return wifi;
}

}  // namespace WiFiHelpers

// ============================================================================
// Logging Utilities
// ============================================================================
namespace LogUtils {

void safePrint(const String& message, bool newline) {
    if (!CoreUtils::safeTakeMutex(g_coreMutex, pdMS_TO_TICKS(100))) {
        // Fallback if mutex is not available
        Serial.print(message);
        if (newline) Serial.println();
        return;
    }

    Serial.print(message);
    if (newline) Serial.println();

    CoreUtils::safeGiveMutex(g_coreMutex);
}

void logWithTimestamp(const String& level, const String& message) {
    String timestamp = String(millis());
    String logMessage = "[" + timestamp + "] [" + level + "] " + message;
    safePrint(logMessage);
}

void logError(const String& message) {
    logWithTimestamp("ERROR", message);
}

void logWarning(const String& message) {
    logWithTimestamp("WARN", message);
}

void logInfo(const String& message) {
    logWithTimestamp("INFO", message);
}

void logDebug(const String& message) {
#ifdef DEBUG
    logWithTimestamp("DEBUG", message);
#endif
}

}  // namespace LogUtils

// ============================================================================
// Serial Utilities Implementation
// ============================================================================
namespace SerialUtils {

bool isSerialSafe() {
    return CoreUtils::isInitialized() && Serial;
}

void sendResponse(const String& response, std::function<void(const String&)> callback) {
    if (isSerialSafe()) {
        Serial.println(response);
    }
    if (callback) callback(response);
}

void sendErrorResponse(const String& error, std::function<void(const String&)> callback) {
    String errorMsg = "ERROR: " + error;
    if (isSerialSafe()) {
        Serial.println(errorMsg);
    }
    if (callback) callback(errorMsg);
}

void sendJsonResponse(const String& json, std::function<void(const String&)> callback) {
    if (isSerialSafe()) {
        Serial.println(json);
    }
    if (callback) callback(json);
}

}  // namespace SerialUtils

// ============================================================================
// Common Utilities Implementation
// ============================================================================
namespace CommonUtils {

void initialize() {
    // Initialize common utilities
    CoreUtils::initialize();
}

}  // namespace CommonUtils

// ============================================================================
// WiFi Helper Utilities Implementation
// ============================================================================
namespace WiFiHelpers {

// Function already implemented above in line 555

}  // namespace WiFiHelpers
