/**
 * @file web_utilities.h
 * @brief Header for consolidated web response and communication utilities
 */

#pragma once

#include <Arduino.h>
#include <ESPAsyncWebServer.h>

#include <vector>

#include "json_compat.h"

// Forward declarations
class AsyncWebSocket;
class AsyncWebSocketClient;

// ============================================================================
// JSON Size Constants
// ============================================================================
namespace JsonSizes {
extern const size_t SMALL;
extern const size_t MEDIUM;
extern const size_t LARGE;
extern const size_t EXTRA_LARGE;
}  // namespace JsonSizes

// ============================================================================
// Core Web Utilities
// ============================================================================
namespace WebUtils {
bool initialize(AsyncWebSocket* ws = nullptr);
void cleanup();
bool isInitialized();

String getContentTypeFromExtension(const String& filename);
bool isJsonRequest(AsyncWebServerRequest* request);
bool acceptsJson(AsyncWebServerRequest* request);
void addStandardHeaders(AsyncWebServerResponse* response);
void addStandardHeaders(AsyncResponseStream* response);
}  // namespace WebUtils

// ============================================================================
// JSON Response Manager
// ============================================================================
namespace JsonResponseManager {
CompatJsonDocument createBaseResponse(bool success, const String& message);
String createErrorResponse(const String& error, const String& context = "", int code = 0);
String createSuccessResponse(const String& message, const JsonObject& data = JsonObject());

void sendJsonResponse(AsyncWebServerRequest* request, const JsonDocument& doc, int statusCode = 200);
void sendErrorResponse(AsyncWebServerRequest* request, int code, const String& message, const String& context = "");
void sendSuccessResponse(AsyncWebServerRequest* request, const String& message, const JsonObject& data = JsonObject());
void sendSystemInfoResponse(AsyncWebServerRequest* request);
void sendFeatureStatusResponse(AsyncWebServerRequest* request, const String& feature, bool enabled);

bool validateRequiredParams(AsyncWebServerRequest* request, const std::vector<String>& params, bool isPost = true);
String getParamSafe(AsyncWebServerRequest* request, const String& name, const String& defaultValue = "", bool isPost = true);

// Additional specialized functions for web utilities
void sendSystemResponse(AsyncWebServerRequest* request);
void sendTagResponse(AsyncWebServerRequest* request, const String& mac, bool success, const String& message = "");
void sendInvalidParamError(AsyncWebServerRequest* request, const String& param, const String& message);
void sendMissingParamError(AsyncWebServerRequest* request, const String& param);
void sendFileResponse(AsyncWebServerRequest* request, const String& path, const String& contentType = "", bool download = false);
}  // namespace JsonResponseManager

// ============================================================================
// WebSocket Manager
// ============================================================================
namespace WebSocketManager {
bool sendMessage(const JsonDocument& doc, uint32_t timeout_ms = 100);
bool sendMessage(const String& message, uint32_t timeout_ms = 100);

void sendLogMessage(const String& text, const String& level = "info");
void sendErrorMessage(const String& text);
void sendSystemInfo();
void sendSerialOutput(const String& text, const String& color = "");
void sendNotification(const String& title, const String& message, const String& type = "info", const String& level = "info");

uint8_t getClientCount();
bool hasClients();
bool isHealthy();

void onEvent(AsyncWebSocket* server, AsyncWebSocketClient* client, AwsEventType type, void* arg, uint8_t* data, size_t len);
void handleWebSocketCommand(const JsonDocument& doc, AsyncWebSocketClient* client);
}  // namespace WebSocketManager

// ============================================================================
// Response Builder Utilities
// ============================================================================
namespace ResponseBuilder {
void sendFileResponse(AsyncWebServerRequest* request, const String& path, const String& contentType = "", bool download = false);
void sendPlainResponse(AsyncWebServerRequest* request, int statusCode, const String& message, const String& contentType = "text/plain");
void sendTagResponse(AsyncWebServerRequest* request, const String& mac, bool success, const String& message = "");
void sendBulkOperationResponse(AsyncWebServerRequest* request, const String& operation, int totalItems, int successCount, int failureCount);
void sendModuleResponse(AsyncWebServerRequest* request, const String& module, const String& action, bool success, const String& message = "");
}  // namespace ResponseBuilder

// ============================================================================
// Web Utility Macros for Legacy Compatibility
// ============================================================================

// Parameter validation and extraction macros
#define VALIDATE_PARAMS(request, params, isPost) \
    if (!JsonResponseManager::validateRequiredParams(request, params, isPost)) return

#define GET_PARAM(request, name, defaultValue, isPost) \
    JsonResponseManager::getParamSafe(request, name, defaultValue, isPost)

// Response sending macros
#define SEND_SUCCESS(request, message) \
    JsonResponseManager::sendSuccessResponse(request, message)

#define SEND_SERVICE_UNAVAILABLE(request, message) \
    JsonResponseManager::sendErrorResponse(request, 503, message, "Service Unavailable")

// Web response utilities namespace alias
namespace WebResponseUtils = JsonResponseManager;
