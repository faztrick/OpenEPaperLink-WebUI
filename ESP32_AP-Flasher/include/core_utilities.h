/**
 * @file core_utilities.h
 * @brief Header for consolidated core utility functions
 */

#pragma once

#include <Arduino.h>
#include <ArduinoJson.h>
#include <WiFi.h>
#include <freertos/FreeRTOS.h>
#include <freertos/semphr.h>

// ============================================================================
// Constants and Definitions
// ============================================================================
#define CORE_UTILS_MUTEX_TIMEOUT_MS 100
#define MAX_STRING_LENGTH 255
#define MAX_NAMESPACE_LENGTH 15
#define MAX_KEY_LENGTH 31

// ============================================================================
// Enumerations
// ============================================================================
enum class Result {
    SUCCESS = 0,
    VALIDATION_ERROR,
    NAMESPACE_ERROR,
    WRITE_ERROR,
    READ_ERROR,
    MEMORY_ERROR,
    KEY_NOT_FOUND,
    NAMESPACE_NOT_FOUND
};

// ============================================================================
// Core System Utilities
// ============================================================================
namespace CoreUtils {
bool initialize();
void cleanup();
bool isInitialized();

String formatUptime(unsigned long milliseconds);
String formatBytes(size_t bytes);
void safeDelay(unsigned long ms);
bool safeTakeMutex(SemaphoreHandle_t mutex, TickType_t timeout);
void safeGiveMutex(SemaphoreHandle_t mutex);
String sanitizeString(const String& input, size_t maxLength = MAX_STRING_LENGTH);
}  // namespace CoreUtils

// ============================================================================
// Validation Utilities
// ============================================================================
namespace ValidationUtils {
bool isValidIP(const String& ip);
bool isValidSSID(const String& ssid);
bool isValidPassword(const String& password);
bool isValidHostname(const String& hostname);
bool isValidMacAddress(const String& mac);
String parseQuotedString(const String& input);
}  // namespace ValidationUtils

// ============================================================================
// Storage Management System
// ============================================================================
namespace StorageManager {
Result setString(const String& nameSpace, const String& key, const String& value);
String getString(const String& nameSpace, const String& key, const String& defaultValue = "");
Result setInt(const String& nameSpace, const String& key, int32_t value);
int32_t getInt(const String& nameSpace, const String& key, int32_t defaultValue = 0);
Result setBool(const String& nameSpace, const String& key, bool value);
bool getBool(const String& nameSpace, const String& key, bool defaultValue = false);

void printStatistics();
void resetStatistics();
}  // namespace StorageManager

// ============================================================================
// System Information Utilities
// ============================================================================
namespace SystemInfo {
JsonObject buildSystemInfo(JsonDocument& doc);
JsonObject buildMemoryInfo(JsonDocument& doc);
JsonObject buildHardwareInfo(JsonDocument& doc);
}  // namespace SystemInfo

// ============================================================================
// WiFi Helper Utilities
// ============================================================================
namespace WiFiHelpers {
String authModeToString(wifi_auth_mode_t authMode);
int authModeToInt(wifi_auth_mode_t authMode);
int calculateSignalQuality(int rssi);
String getStatusString(wl_status_t status);
String buildHostname(const String& prefix);
JsonObject buildWiFiInfo(JsonDocument& doc);
}  // namespace WiFiHelpers

// ============================================================================
// Logging Utilities
// ============================================================================
namespace LogUtils {
void safePrint(const String& message, bool newline = true);
void logWithTimestamp(const String& level, const String& message);
void logError(const String& message);
void logWarning(const String& message);
void logInfo(const String& message);
void logDebug(const String& message);
}  // namespace LogUtils

// ============================================================================
// Serial Utilities
// ============================================================================
namespace SerialUtils {
bool isSerialSafe();
void sendResponse(const String& response, std::function<void(const String&)> callback = nullptr);
void sendErrorResponse(const String& error, std::function<void(const String&)> callback = nullptr);
void sendJsonResponse(const String& json, std::function<void(const String&)> callback = nullptr);
}  // namespace SerialUtils

// ============================================================================
// Common Utilities
// ============================================================================
namespace CommonUtils {
void initialize();
}  // namespace CommonUtils

// ============================================================================
// WiFi Helper Utilities
// ============================================================================
namespace WiFiHelpers {
int calculateSignalQuality(int rssi);
}  // namespace WiFiHelpers
