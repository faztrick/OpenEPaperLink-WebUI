/**
 * @file web_utilities.cpp
 * @brief Consolidated web response and communication utilities
 *
 * This file consolidates and optimizes web-related utility functions from:
 * - json_response_utils.cpp
 * - web_response_utils.cpp
 * - websocket_utils.cpp
 *
 * @author OpenEPaperLink Contributors
 * @version Optimized Consolidated Implementation
 */

#include "web_utilities.h"

#include <ArduinoJson.h>
#include <ESPAsyncWebServer.h>

#include "core_utilities.h"

// ============================================================================
// Global Variables
// ============================================================================
static AsyncWebSocket* g_wsInstance = nullptr;
static SemaphoreHandle_t g_webMutex = nullptr;
static bool g_webUtilsInitialized = false;

// ============================================================================
// JSON Size Constants
// ============================================================================
namespace JsonSizes {
const size_t SMALL = 512;
const size_t MEDIUM = 1024;
const size_t LARGE = 2048;
const size_t EXTRA_LARGE = 4096;
}  // namespace JsonSizes

// ============================================================================
// Core Web Utilities
// ============================================================================
namespace WebUtils {

// ============================================================================
// Core Web Utilities Implementation
// ============================================================================
// Note: Some functions may be marked as unused by static analysis but are part
// of the public API and may be used by external modules or future features

bool initialize(AsyncWebSocket* ws) {
    if (g_webUtilsInitialized) return true;

    if (!CoreUtils::isInitialized()) {
        LogUtils::logError("Core utilities must be initialized first");
        return false;
    }

    g_webMutex = xSemaphoreCreateMutex();
    if (!g_webMutex) {
        LogUtils::logError("Failed to create web utilities mutex");
        return false;
    }

    if (ws) {
        g_wsInstance = ws;
        ws->onEvent(WebSocketManager::onEvent);
    }

    g_webUtilsInitialized = true;
    LogUtils::logInfo("Web utilities initialized successfully");
    return true;
}

void cleanup() {
    if (g_wsInstance) {
        g_wsInstance->closeAll();
        g_wsInstance = nullptr;
    }

    if (g_webMutex) {
        vSemaphoreDelete(g_webMutex);
        g_webMutex = nullptr;
    }

    g_webUtilsInitialized = false;
}

bool isInitialized() {
    return g_webUtilsInitialized;
}

String getContentTypeFromExtension(const String& filename) {
    String lowerFile = filename;
    lowerFile.toLowerCase();

    if (lowerFile.endsWith(".html") || lowerFile.endsWith(".htm")) return "text/html";
    if (lowerFile.endsWith(".css")) return "text/css";
    if (lowerFile.endsWith(".js")) return "application/javascript";
    if (lowerFile.endsWith(".json")) return "application/json";
    if (lowerFile.endsWith(".png")) return "image/png";
    if (lowerFile.endsWith(".jpg") || lowerFile.endsWith(".jpeg")) return "image/jpeg";
    if (lowerFile.endsWith(".gif")) return "image/gif";
    if (lowerFile.endsWith(".svg")) return "image/svg+xml";
    if (lowerFile.endsWith(".ico")) return "image/x-icon";
    if (lowerFile.endsWith(".xml")) return "application/xml";
    if (lowerFile.endsWith(".pdf")) return "application/pdf";
    if (lowerFile.endsWith(".zip")) return "application/zip";
    if (lowerFile.endsWith(".txt")) return "text/plain";
    if (lowerFile.endsWith(".gz")) return "application/gzip";
    if (lowerFile.endsWith(".woff")) return "font/woff";
    if (lowerFile.endsWith(".woff2")) return "font/woff2";
    if (lowerFile.endsWith(".ttf")) return "font/ttf";
    if (lowerFile.endsWith(".eot")) return "application/vnd.ms-fontobject";

    return "application/octet-stream";
}

bool isJsonRequest(AsyncWebServerRequest* request) {
    if (request->hasHeader("Content-Type")) {
        String contentType = request->header("Content-Type");
        return contentType.indexOf("application/json") >= 0;
    }
    return false;
}

bool acceptsJson(AsyncWebServerRequest* request) {
    if (request->hasHeader("Accept")) {
        String accept = request->header("Accept");
        return accept.indexOf("application/json") >= 0 || accept.indexOf("*/*") >= 0;
    }

    // Default to JSON for API endpoints
    String url = request->url();
    return url.startsWith("/api/") ||
           url.endsWith(".json") ||
           url.indexOf("_status") >= 0 ||
           url.indexOf("_info") >= 0;
}

void addStandardHeaders(AsyncWebServerResponse* response) {
    response->addHeader("Access-Control-Allow-Origin", "*");
    response->addHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    response->addHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    response->addHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    response->addHeader("Pragma", "no-cache");
    response->addHeader("Expires", "0");
}

void addStandardHeaders(AsyncResponseStream* response) {
    response->addHeader("Access-Control-Allow-Origin", "*");
    response->addHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    response->addHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    response->addHeader("Cache-Control", "no-cache, no-store, must-revalidate");
}

}  // namespace WebUtils

// ============================================================================
// JSON Response Manager
// ============================================================================
namespace JsonResponseManager {

DynamicJsonDocument createBaseResponse(bool success, const String& message) {
    DynamicJsonDocument doc(JsonSizes::MEDIUM);
    doc["success"] = success;
    doc["message"] = message;
    doc["timestamp"] = millis();
    return doc;
}

String createErrorResponse(const String& error, const String& context, int code) {
    DynamicJsonDocument doc(JsonSizes::SMALL);
    doc["success"] = false;
    doc["error"] = error;
    doc["timestamp"] = millis();

    if (!context.isEmpty()) {
        doc["context"] = context;
    }

    if (code > 0) {
        doc["code"] = code;
    }

    String response;
    serializeJson(doc, response);
    return response;
}

String createSuccessResponse(const String& message, const JsonObject& data) {
    DynamicJsonDocument doc(JsonSizes::MEDIUM);
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

void sendJsonResponse(AsyncWebServerRequest* request, const JsonDocument& doc, int statusCode) {
    AsyncResponseStream* response = request->beginResponseStream("application/json");
    response->setCode(statusCode);
    WebUtils::addStandardHeaders(response);
    serializeJson(doc, *response);
    request->send(response);
}

void sendErrorResponse(AsyncWebServerRequest* request, int code, const String& message, const String& context) {
    DynamicJsonDocument doc(JsonSizes::SMALL);
    doc["success"] = false;
    doc["error"] = message;
    doc["code"] = code;
    doc["timestamp"] = millis();

    if (!context.isEmpty()) {
        doc["context"] = context;
    }

    sendJsonResponse(request, doc, code);
}

void sendSuccessResponse(AsyncWebServerRequest* request, const String& message, const JsonObject& data) {
    DynamicJsonDocument doc(JsonSizes::MEDIUM);
    doc["success"] = true;
    doc["message"] = message;
    doc["timestamp"] = millis();

    if (!data.isNull()) {
        doc["data"] = data;
    }

    sendJsonResponse(request, doc, 200);
}

void sendSystemInfoResponse(AsyncWebServerRequest* request) {
    DynamicJsonDocument doc(JsonSizes::LARGE);

    SystemInfo::buildSystemInfo(doc);
    SystemInfo::buildMemoryInfo(doc);
    SystemInfo::buildHardwareInfo(doc);
    WiFiHelpers::buildWiFiInfo(doc);

    doc["success"] = true;
    doc["message"] = "System information retrieved";
    doc["timestamp"] = millis();

    sendJsonResponse(request, doc, 200);
}

void sendFeatureStatusResponse(AsyncWebServerRequest* request, const String& feature, bool enabled) {
    DynamicJsonDocument doc(JsonSizes::SMALL);
    JsonObject data = doc["data"].to<JsonObject>();
    data["feature"] = feature;
    data["enabled"] = enabled;
    data["available"] = enabled;

    sendSuccessResponse(request, "Feature status retrieved", data);
}

bool validateRequiredParams(AsyncWebServerRequest* request, const std::vector<String>& params, bool isPost) {
    for (const String& param : params) {
        if (!request->hasParam(param.c_str(), isPost)) {
            sendErrorResponse(request, 400, "Missing required parameter: " + param);
            return false;
        }
    }
    return true;
}

String getParamSafe(AsyncWebServerRequest* request, const String& name, const String& defaultValue, bool isPost) {
    if (request->hasParam(name.c_str(), isPost)) {
        return request->getParam(name.c_str(), isPost)->value();
    }
    return defaultValue;
}

void sendModuleResponse(AsyncWebServerRequest* request, const String& module, const String& action, bool success, const String& message) {
    DynamicJsonDocument doc = createBaseResponse(success, message.isEmpty() ? (success ? "Operation completed" : "Operation failed") : message);
    doc["module"] = module;
    doc["action"] = action;
    sendJsonResponse(request, doc, success ? 200 : 500);
}

void sendSystemResponse(AsyncWebServerRequest* request) {
    DynamicJsonDocument doc(2048);
    doc["success"] = true;
    doc["uptime"] = millis();
    doc["freeHeap"] = ESP.getFreeHeap();
    doc["chipModel"] = ESP.getChipModel();
    doc["version"] = "2.0.0";
    sendJsonResponse(request, doc, 200);
}

void sendTagResponse(AsyncWebServerRequest* request, const String& mac, bool success, const String& message) {
    DynamicJsonDocument doc = createBaseResponse(success, message);
    doc["mac"] = mac;
    sendJsonResponse(request, doc, success ? 200 : 404);
}

void sendInvalidParamError(AsyncWebServerRequest* request, const String& param, const String& message) {
    sendErrorResponse(request, 400, "Invalid parameter: " + param, message);
}

void sendMissingParamError(AsyncWebServerRequest* request, const String& param) {
    sendErrorResponse(request, 400, "Missing required parameter: " + param);
}

void sendFileResponse(AsyncWebServerRequest* request, const String& path, const String& contentType, bool download) {
    ResponseBuilder::sendFileResponse(request, path, contentType, download);
}

}  // namespace JsonResponseManager

// ============================================================================
// WebSocket Manager
// ============================================================================
namespace WebSocketManager {

bool sendMessage(const JsonDocument& doc, uint32_t timeout_ms) {
    if (!g_wsInstance || !g_webMutex || !hasClients()) return false;

    if (!CoreUtils::safeTakeMutex(g_webMutex, pdMS_TO_TICKS(timeout_ms))) {
        return false;
    }

    String message;
    size_t serializedSize = serializeJson(doc, message);
    if (serializedSize > 0) {
        g_wsInstance->textAll(message);
    }

    CoreUtils::safeGiveMutex(g_webMutex);
    return serializedSize > 0;
}

bool sendMessage(const String& message, uint32_t timeout_ms) {
    if (!g_wsInstance || !g_webMutex || !hasClients() || message.isEmpty()) {
        return false;
    }

    if (!CoreUtils::safeTakeMutex(g_webMutex, pdMS_TO_TICKS(timeout_ms))) {
        return false;
    }

    g_wsInstance->textAll(message);
    CoreUtils::safeGiveMutex(g_webMutex);
    return true;
}

void sendLogMessage(const String& text, const String& level) {
    if (text.isEmpty() || !hasClients()) return;

    DynamicJsonDocument doc(JsonSizes::SMALL);
    doc["type"] = "log";
    doc["level"] = level;
    doc["message"] = text;
    doc["timestamp"] = millis();

    sendMessage(doc);
}

void sendErrorMessage(const String& text) {
    if (text.isEmpty() || !hasClients()) return;

    DynamicJsonDocument doc(JsonSizes::SMALL);
    doc["type"] = "error";
    doc["message"] = text;
    doc["timestamp"] = millis();

    sendMessage(doc);
}

void sendSystemInfo() {
    if (!hasClients()) return;

    DynamicJsonDocument doc(JsonSizes::LARGE);
    doc["type"] = "systemInfo";

    SystemInfo::buildSystemInfo(doc);
    SystemInfo::buildMemoryInfo(doc);
    SystemInfo::buildHardwareInfo(doc);
    WiFiHelpers::buildWiFiInfo(doc);

    doc["websocket"]["clients"] = getClientCount();
    doc["websocket"]["healthy"] = isHealthy();
    doc["timestamp"] = millis();

    sendMessage(doc);
}

void sendSerialOutput(const String& text, const String& color) {
    if (text.isEmpty()) return;

    DynamicJsonDocument doc(JsonSizes::MEDIUM);
    doc["type"] = "console";
    doc["message"] = text;
    doc["timestamp"] = millis();

    if (!color.isEmpty()) {
        doc["color"] = color;
    }

    // Also send to Serial for debugging
    Serial.println(text);

    if (hasClients()) {
        sendMessage(doc);
    }
}

void sendNotification(const String& title, const String& message, const String& type, const String& level) {
    if (title.isEmpty() && message.isEmpty()) return;

    DynamicJsonDocument doc(JsonSizes::MEDIUM);
    doc["type"] = "notification";
    doc["title"] = title;
    doc["message"] = message;
    doc["notificationType"] = type.isEmpty() ? "info" : type;
    doc["level"] = level.isEmpty() ? "info" : level;
    doc["timestamp"] = millis();

    if (hasClients()) {
        sendMessage(doc);
    }
}

uint8_t getClientCount() {
    return g_wsInstance ? g_wsInstance->count() : 0;
}

bool hasClients() {
    return getClientCount() > 0;
}

bool isHealthy() {
    return g_wsInstance != nullptr && g_webMutex != nullptr && g_webUtilsInitialized;
}

void onEvent(AsyncWebSocket* server, AsyncWebSocketClient* client, AwsEventType type, void* arg, uint8_t* data, size_t len) {
    switch (type) {
        case WS_EVT_CONNECT:
            LogUtils::logInfo("WebSocket client " + String(client->id()) + " connected from " + client->remoteIP().toString());
            // Send initial system info to new client
            sendSystemInfo();
            break;

        case WS_EVT_DISCONNECT:
            LogUtils::logInfo("WebSocket client " + String(client->id()) + " disconnected");
            break;

        case WS_EVT_ERROR:
            LogUtils::logError("WebSocket client " + String(client->id()) + " error: " + String(reinterpret_cast<char*>(data)));
            break;

        case WS_EVT_DATA: {
            AwsFrameInfo* info = reinterpret_cast<AwsFrameInfo*>(arg);
            if (info->final && info->index == 0 && info->len == len && info->opcode == WS_TEXT) {
                data[len] = 0;  // Null terminate
                String message = reinterpret_cast<char*>(data);

                LogUtils::logDebug("WebSocket received from client " + String(client->id()) + ": " + message);

                // Parse and handle incoming JSON commands
                DynamicJsonDocument doc(JsonSizes::MEDIUM);
                DeserializationError error = deserializeJson(doc, message);

                if (!error) {
                    handleWebSocketCommand(doc, client);
                } else {
                    LogUtils::logWarning("Invalid JSON received from WebSocket client " + String(client->id()));
                }
            }
            break;
        }

        case WS_EVT_PONG:
            LogUtils::logDebug("WebSocket client " + String(client->id()) + " pong received");
            break;

        default:
            break;
    }
}

void handleWebSocketCommand(const JsonDocument& doc, AsyncWebSocketClient* client) {
    if (!doc.containsKey("type")) return;

    String type = doc["type"];

    if (type == "ping") {
        DynamicJsonDocument response(JsonSizes::SMALL);
        response["type"] = "pong";
        response["timestamp"] = millis();

        String responseStr;
        serializeJson(response, responseStr);
        client->text(responseStr);
    } else if (type == "getSystemInfo") {
        sendSystemInfo();
    } else if (type == "subscribe") {
        // Handle subscription requests for specific data types
        if (doc.containsKey("channel")) {
            String channel = doc["channel"];
            LogUtils::logInfo("Client " + String(client->id()) + " subscribed to " + channel);
            // Add subscription logic here
        }
    } else {
        LogUtils::logWarning("Unknown WebSocket command type: " + type);
    }
}

}  // namespace WebSocketManager

// ============================================================================
// Response Builder Utilities
// ============================================================================
namespace ResponseBuilder {

void sendFileResponse(AsyncWebServerRequest* request, const String& path, const String& contentType, bool download) {
    // This would need access to the filesystem - implementation depends on your FS setup
    // For now, send a placeholder response
    JsonResponseManager::sendErrorResponse(request, 501, "File serving not implemented in consolidated utilities");
}

void sendPlainResponse(AsyncWebServerRequest* request, int statusCode, const String& message, const String& contentType) {
    AsyncWebServerResponse* response = request->beginResponse(statusCode, contentType, message);
    WebUtils::addStandardHeaders(response);
    request->send(response);
}

void sendTagResponse(AsyncWebServerRequest* request, const String& mac, bool success, const String& message) {
    DynamicJsonDocument doc(JsonSizes::SMALL);
    JsonObject data = doc["data"].to<JsonObject>();
    data["mac"] = mac;

    if (success) {
        JsonResponseManager::sendSuccessResponse(request, message.isEmpty() ? "Tag operation completed" : message, data);
    } else {
        JsonResponseManager::sendErrorResponse(request, 500, message.isEmpty() ? "Tag operation failed" : message);
    }
}

void sendBulkOperationResponse(AsyncWebServerRequest* request, const String& operation, int totalItems, int successCount, int failureCount) {
    DynamicJsonDocument doc(JsonSizes::SMALL);
    JsonObject data = doc["data"].to<JsonObject>();
    data["operation"] = operation;
    data["total"] = totalItems;
    data["success"] = successCount;
    data["failed"] = failureCount;
    data["successRate"] = totalItems > 0 ? (float)successCount / totalItems * 100 : 0;

    bool overallSuccess = (failureCount == 0);
    String message = operation + " completed: " + String(successCount) + "/" + String(totalItems) + " successful";

    if (overallSuccess) {
        JsonResponseManager::sendSuccessResponse(request, message, data);
    } else {
        JsonResponseManager::sendErrorResponse(request, 500, message);
    }
}

void sendModuleResponse(AsyncWebServerRequest* request, const String& module, const String& action, bool success, const String& message) {
    DynamicJsonDocument doc(JsonSizes::SMALL);
    JsonObject data = doc["data"].to<JsonObject>();
    data["module"] = module;
    data["action"] = action;

    String responseMessage = message.isEmpty() ? (module + " " + action + (success ? " completed" : " failed")) : message;

    if (success) {
        JsonResponseManager::sendSuccessResponse(request, responseMessage, data);
    } else {
        JsonResponseManager::sendErrorResponse(request, 500, responseMessage);
    }
}

}  // namespace ResponseBuilder
