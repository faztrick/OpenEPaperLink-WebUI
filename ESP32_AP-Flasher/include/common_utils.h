#pragma once

#include <ArduinoJson.h>
#include <WiFi.h>

// ============================================================================
// Shared Constants
// ============================================================================
static const size_t INPUT_BUFFER_SIZE = 256;
static const size_t MAX_INPUT_LENGTH = 200;
static const unsigned long COMMAND_TIMEOUT_MS = 30000;
static const unsigned long AP_CHECK_INTERVAL_MS = 250;
static const unsigned long WIFI_CONNECT_TIMEOUT_MS = 20000;
static const unsigned long WIFI_RETRY_INTERVAL_MS = 500;
static const int MAX_WIFI_ATTEMPTS = WIFI_CONNECT_TIMEOUT_MS / WIFI_RETRY_INTERVAL_MS;
static const size_t SMALL_JSON_SIZE = 512;
static const size_t MEDIUM_JSON_SIZE = 1024;
static const size_t LARGE_JSON_SIZE = 2048;
static const uint32_t SCAN_RATE_LIMIT_MS = 25000;
static const uint32_t ETHERNET_CHECK_INTERVAL_MS = 1000;
static const uint32_t DISCONNECT_RATE_LIMIT_MS = 5000;
static const uint8_t MAX_AUTH_FAILURES = 10;
static const uint8_t MAX_HANDSHAKE_FAILURES = 5;

// ============================================================================
// Build Information
// ============================================================================
#ifndef BUILD_VERSION
#define BUILD_VERSION "custom"
#endif

#ifndef BUILD_AUTHOR
#define BUILD_AUTHOR "OpenEPaperLink"
#endif

// ============================================================================
// Logging Utilities
// ============================================================================
extern SemaphoreHandle_t g_logMutex;

#define SAFE_LOG(format, ...)                                                         \
    do {                                                                              \
        if (g_logMutex && xSemaphoreTake(g_logMutex, pdMS_TO_TICKS(100)) == pdTRUE) { \
            printf(format, ##__VA_ARGS__);                                            \
            xSemaphoreGive(g_logMutex);                                               \
        } else {                                                                      \
            printf(format, ##__VA_ARGS__);                                            \
        }                                                                             \
    } while (0)

// ============================================================================
// JSON Response Utilities
// ============================================================================
namespace ResponseUtils {

/**
 * Create a standardized error response
 */
String createErrorResponse(const String& error, const String& context = "");

/**
 * Create a standardized success response
 */
String createSuccessResponse(const String& message, const JsonObject& data = JsonObject());

/**
 * Create a standardized status response
 */
String createStatusResponse(bool success, const String& message, const JsonObject& data = JsonObject());

/**
 * Parse a quoted string parameter from command input
 */
String parseQuotedString(const String& input);

/**
 * Validate IP address format
 */
bool isValidIP(const String& ip);

/**
 * Validate SSID format and length
 */
bool isValidSSID(const String& ssid);

/**
 * Validate WiFi password format and length
 */
bool isValidPassword(const String& password);

/**
 * Format system uptime as human-readable string
 */
String formatUptime(unsigned long milliseconds);

/**
 * Get memory usage information as JSON
 */
JsonObject getMemoryInfo(DynamicJsonDocument& doc);

/**
 * Get system information as JSON
 */
JsonObject getSystemInfo(DynamicJsonDocument& doc);
}  // namespace ResponseUtils

// ============================================================================
// WiFi Utilities
// ============================================================================
namespace WiFiHelpers {

/**
 * Convert WiFi auth mode to human-readable string
 */
String authModeToString(wifi_auth_mode_t authMode);

/**
 * Convert WiFi auth mode to numeric value for frontend compatibility
 */
int authModeToInt(wifi_auth_mode_t authMode);

/**
 * Calculate signal quality percentage from RSSI
 */
int calculateSignalQuality(int rssi);

/**
 * Get WiFi status as human-readable string
 */
String getStatusString(wl_status_t status);

/**
 * Build hostname with MAC address suffix
 */
String buildHostname(const String& prefix = "OpenEpaperLink");

/**
 * Validate WiFi configuration
 */
bool validateConfig(const String& ssid, const String& password, const String& ip = "");
}  // namespace WiFiHelpers

// ============================================================================
// Serial Communication Utilities
// ============================================================================
namespace SerialUtils {

/**
 * Send response with consistent formatting
 */
void sendResponse(const String& response, std::function<void(const String&)> callback = nullptr);

/**
 * Send error response with consistent formatting
 */
void sendErrorResponse(const String& error, std::function<void(const String&)> callback = nullptr);

/**
 * Send JSON response with consistent formatting
 */
void sendJsonResponse(const String& json, std::function<void(const String&)> callback = nullptr);

/**
 * Check if AP is in a state where serial communication is safe
 */
bool isSerialSafe();
}  // namespace SerialUtils

// ============================================================================
// Configuration Utilities
// ============================================================================
namespace ConfigUtils {

/**
 * Load configuration from storage with error handling
 */
template <typename T>
bool loadConfig(const String& namespace_name, const String& key, T& value);

/**
 * Save configuration to storage with error handling
 */
template <typename T>
bool saveConfig(const String& namespace_name, const String& key, const T& value);

/**
 * Clear configuration namespace
 */
bool clearConfig(const String& namespace_name);
}  // namespace ConfigUtils

// ============================================================================
// Initialization
// ============================================================================
namespace CommonUtils {
/**
 * Initialize common utilities (mutexes, etc.)
 */
void initialize();

/**
 * Cleanup common utilities
 */
void cleanup();
}  // namespace CommonUtils
