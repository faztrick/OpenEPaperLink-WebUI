#pragma once

#include <ArduinoJson.h>
#include <ESPAsyncWebServer.h>

// Centralized JSON response utilities to eliminate duplicate code
// ===============================================================

class JsonResponseUtils {
   public:
    // Standard JSON response sizes
    static const size_t SMALL_JSON_SIZE = 512;
    static const size_t MEDIUM_JSON_SIZE = 1024;
    static const size_t LARGE_JSON_SIZE = 2048;
    static const size_t XLARGE_JSON_SIZE = 4096;

    // Success/Error response builders
    static void sendSuccessResponse(AsyncWebServerRequest* request, const String& message = "Success");
    static void sendErrorResponse(AsyncWebServerRequest* request, int code, const String& message);
    static void sendJsonResponse(AsyncWebServerRequest* request, const JsonDocument& doc);
    static void sendJsonResponse(AsyncWebServerRequest* request, const String& json);

    // Common response patterns
    static void sendStatusResponse(AsyncWebServerRequest* request, bool success, const String& message, const JsonObject& data = JsonObject());
    static void sendFeatureResponse(AsyncWebServerRequest* request, const String& feature, bool enabled);
    static void sendModuleStatusResponse(AsyncWebServerRequest* request, const String& module, const String& status, const JsonObject& details = JsonObject());

    // WebSocket response utilities
    static String buildWSMessage(const String& type, const JsonObject& data);
    static String buildWSLogMessage(const String& message, const String& level = "info");
    static String buildWSErrorMessage(const String& error);

    // System info response builders
    static JsonObject buildSystemInfo(JsonDocument& doc);
    static JsonObject buildWiFiInfo(JsonDocument& doc);
    static JsonObject buildHardwareInfo(JsonDocument& doc);

    // Validation utilities
    static bool validateRequiredParams(AsyncWebServerRequest* request, const std::vector<String>& params, bool isPost = false);
    static String getParam(AsyncWebServerRequest* request, const String& name, const String& defaultValue = "", bool isPost = false);

    // Response headers
    static void addCacheHeaders(AsyncWebServerRequest* request, uint32_t maxAge = 0);
    static void addCORSHeaders(AsyncWebServerRequest* request);
    static void addNoStoreHeaders(AsyncWebServerRequest* request);
};
