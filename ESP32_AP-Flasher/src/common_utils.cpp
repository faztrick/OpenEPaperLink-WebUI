#include "common_utils.h"

#include <Preferences.h>

#include "serialap.h"

// ============================================================================
// Global Variables
// ============================================================================
SemaphoreHandle_t g_logMutex = nullptr;

// ============================================================================
// JSON Response Utilities Implementation
// ============================================================================
namespace ResponseUtils {

String createErrorResponse(const String& error, const String& context) {
    DynamicJsonDocument doc(SMALL_JSON_SIZE);
    doc["success"] = false;
    doc["error"] = error;
    if (!context.isEmpty()) {
        doc["context"] = context;
    }
    doc["timestamp"] = millis();

    String response;
    serializeJson(doc, response);
    return response;
}

String createSuccessResponse(const String& message, const JsonObject& data) {
    DynamicJsonDocument doc(MEDIUM_JSON_SIZE);
    doc["success"] = true;
    doc["message"] = message;
    doc["timestamp"] = millis();

    if (!data.isNull()) {
        doc["data"] = data;
    }

    String response;
    serializeJson(doc, response);
    return response;
}

String createStatusResponse(bool success, const String& message, const JsonObject& data) {
    if (success) {
        return createSuccessResponse(message, data);
    } else {
        return createErrorResponse(message);
    }
}

String parseQuotedString(const String& input) {
    String trimmed = input;
    trimmed.trim();

    if (trimmed.startsWith("\"") && trimmed.endsWith("\"") && trimmed.length() >= 2) {
        return trimmed.substring(1, trimmed.length() - 1);
    }

    return trimmed;
}

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

JsonObject getMemoryInfo(DynamicJsonDocument& doc) {
    JsonObject memory = doc["memory"].to<JsonObject>();
    memory["free_heap"] = ESP.getFreeHeap();
    memory["total_heap"] = ESP.getHeapSize();
    memory["min_free_heap"] = ESP.getMinFreeHeap();
    memory["max_alloc_heap"] = ESP.getMaxAllocHeap();
    memory["heap_usage_percent"] = 100 - ((ESP.getFreeHeap() * 100) / ESP.getHeapSize());
    return memory;
}

JsonObject getSystemInfo(DynamicJsonDocument& doc) {
    JsonObject system = doc["system"].to<JsonObject>();
    system["firmware"] = "OpenEPaperLink ESP32_AP-Flasher";
    system["version"] = BUILD_VERSION;
    system["author"] = BUILD_AUTHOR;
    system["build_time"] = __DATE__ " " __TIME__;
    system["chip_model"] = ESP.getChipModel();
    system["chip_revision"] = ESP.getChipRevision();
    system["cpu_freq_mhz"] = ESP.getCpuFreqMHz();
    system["flash_size"] = ESP.getFlashChipSize();
    system["uptime"] = formatUptime(millis());
    system["uptime_ms"] = millis();
    return system;
}
}  // namespace ResponseUtils

// ============================================================================
// WiFi Utilities Implementation
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

bool validateConfig(const String& ssid, const String& password, const String& ip) {
    if (!ResponseUtils::isValidSSID(ssid)) {
        return false;
    }

    if (!ResponseUtils::isValidPassword(password)) {
        return false;
    }

    if (!ip.isEmpty() && !ResponseUtils::isValidIP(ip)) {
        return false;
    }

    return true;
}
}  // namespace WiFiHelpers

// ============================================================================
// Serial Communication Utilities Implementation
// ============================================================================
namespace SerialUtils {

void sendResponse(const String& response, std::function<void(const String&)> callback) {
    if (callback) {
        callback(response);
    } else {
        Serial.println(response);
    }
}

void sendErrorResponse(const String& error, std::function<void(const String&)> callback) {
    sendResponse("ERROR: " + error, callback);
}

void sendJsonResponse(const String& json, std::function<void(const String&)> callback) {
    sendResponse("JSON: " + json, callback);
}

bool isSerialSafe() {
    // Check AP state - this would need to be implemented based on your system
    extern volatile ApSerialState gSerialTaskState;
    return (gSerialTaskState == SERIAL_STATE_RUNNING || gSerialTaskState == SERIAL_STATE_INITIALIZED);
}
}  // namespace SerialUtils

// ============================================================================
// Configuration Utilities Implementation
// ============================================================================
namespace ConfigUtils {

template <typename T>
bool loadConfig(const String& namespace_name, const String& key, T& value) {
    Preferences prefs;
    if (prefs.begin(namespace_name.c_str(), true)) {
        value = prefs.getBytes(key.c_str(), &value, sizeof(T));
        prefs.end();
        return true;
    }
    return false;
}

template <typename T>
bool saveConfig(const String& namespace_name, const String& key, const T& value) {
    Preferences prefs;
    if (prefs.begin(namespace_name.c_str(), false)) {
        size_t written = prefs.putBytes(key.c_str(), &value, sizeof(T));
        prefs.end();
        return written == sizeof(T);
    }
    return false;
}

bool clearConfig(const String& namespace_name) {
    Preferences prefs;
    if (prefs.begin(namespace_name.c_str(), false)) {
        prefs.clear();
        prefs.end();
        return true;
    }
    return false;
}
}  // namespace ConfigUtils

// ============================================================================
// Initialization Implementation
// ============================================================================
namespace CommonUtils {

void initialize() {
    if (!g_logMutex) {
        g_logMutex = xSemaphoreCreateMutex();
    }
}

void cleanup() {
    if (g_logMutex) {
        vSemaphoreDelete(g_logMutex);
        g_logMutex = nullptr;
    }
}
}  // namespace CommonUtils
