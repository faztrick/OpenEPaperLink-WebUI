#include "web_response_utils.h"

#include <LittleFS.h>
#include <WiFi.h>

#include "settings.h"  // For contentFS
#include "storage.h"   // For contentFS extern declaration
#include "wifi_utils.h"

// Enhanced centralized web response utilities implementation
// =========================================================

void WebResponseUtils::sendResponse(AsyncWebServerRequest* request, ResponseType type,
                                    const String& message, const JsonObject& data) {
    int statusCode = getStatusCodeForType(type);
    String responseMessage = message.isEmpty() ? getDefaultMessageForType(type) : message;

    if (isJsonRequest(request) || acceptsJson(request)) {
        DynamicJsonDocument doc(JsonResponseUtils::MEDIUM_JSON_SIZE);
        doc["success"] = (type == SUCCESS);
        doc["message"] = responseMessage;
        doc["timestamp"] = millis();
        doc["status"] = statusCode;

        if (!data.isNull()) {
            doc["data"] = data;
        }

        AsyncResponseStream* response = request->beginResponseStream("application/json");
        response->setCode(statusCode);
        addStandardHeaders(response);
        serializeJson(doc, *response);
        request->send(response);
    } else {
        sendPlainResponse(request, statusCode, responseMessage);
    }
}

void WebResponseUtils::sendPlainResponse(AsyncWebServerRequest* request, int statusCode,
                                         const String& message, const String& contentType) {
    AsyncWebServerResponse* response = request->beginResponse(statusCode, contentType, message);
    addStandardHeaders(response);
    request->send(response);
}

void WebResponseUtils::sendFileResponse(AsyncWebServerRequest* request, const String& path,
                                        const String& contentType, bool download) {
    if (!contentFS->exists(path)) {
        sendResponse(request, NOT_FOUND, "File not found: " + path);
        return;
    }

    String ct = contentType.isEmpty() ? getContentTypeFromExtension(path) : contentType;
    AsyncWebServerResponse* response = request->beginResponse(*contentFS, path, ct, download);
    addStandardHeaders(response);
    request->send(response);
}

bool WebResponseUtils::validateAndRespond(AsyncWebServerRequest* request,
                                          const std::vector<String>& requiredParams,
                                          bool isPost) {
    for (const String& param : requiredParams) {
        if (!request->hasParam(param.c_str(), isPost)) {
            sendMissingParamError(request, param);
            return false;
        }
    }
    return true;
}

String WebResponseUtils::getParamSafe(AsyncWebServerRequest* request, const String& name,
                                      const String& defaultValue, bool isPost) {
    if (request->hasParam(name.c_str(), isPost)) {
        return request->getParam(name.c_str(), isPost)->value();
    }
    return defaultValue;
}

void WebResponseUtils::sendTagResponse(AsyncWebServerRequest* request, const String& mac,
                                       bool success, const String& message) {
    DynamicJsonDocument doc(JsonResponseUtils::SMALL_JSON_SIZE);
    JsonObject data = doc["data"].to<JsonObject>();
    data["mac"] = mac;

    sendResponse(request, success ? SUCCESS : ERROR,
                 message.isEmpty() ? (success ? "Tag operation completed" : "Tag operation failed") : message,
                 data);
}

void WebResponseUtils::sendSystemResponse(AsyncWebServerRequest* request) {
    DynamicJsonDocument doc(JsonResponseUtils::LARGE_JSON_SIZE);
    JsonObject sysInfo = JsonResponseUtils::buildSystemInfo(doc);
    JsonObject wifiInfo = JsonResponseUtils::buildWiFiInfo(doc);
    JsonObject hwInfo = JsonResponseUtils::buildHardwareInfo(doc);

    sendResponse(request, SUCCESS, "System information retrieved", doc.as<JsonObject>());
}

void WebResponseUtils::sendWiFiResponse(AsyncWebServerRequest* request) {
    DynamicJsonDocument doc(JsonResponseUtils::MEDIUM_JSON_SIZE);
    JsonObject wifiInfo = JsonResponseUtils::buildWiFiInfo(doc);

    sendResponse(request, SUCCESS, "WiFi information retrieved", wifiInfo);
}

void WebResponseUtils::sendFeatureStatusResponse(AsyncWebServerRequest* request, const String& feature) {
    bool enabled = false;

    // Check feature availability
    if (feature == "tft") {
#ifdef HAS_TFT
        enabled = true;
#endif
    } else if (feature == "led") {
#ifdef HAS_RGB_LED
        enabled = true;
#endif
    } else if (feature == "ble") {
#ifdef HAS_BLE_WRITER
        enabled = true;
#endif
    } else if (feature == "rfid") {
#if HAS_RC522
        enabled = true;
#endif
    } else if (feature == "flasher") {
#ifdef HAS_EXT_FLASHER
        enabled = true;
#endif
    } else if (feature == "c6") {
#ifdef C6_OTA_FLASHING
        enabled = true;
#endif
    }

    DynamicJsonDocument doc(JsonResponseUtils::SMALL_JSON_SIZE);
    JsonObject data = doc["data"].to<JsonObject>();
    data["feature"] = feature;
    data["enabled"] = enabled;
    data["available"] = enabled;

    sendResponse(request, SUCCESS, "Feature status retrieved", data);
}

void WebResponseUtils::sendFileOperationResponse(AsyncWebServerRequest* request, bool success,
                                                 const String& operation, const String& filename) {
    DynamicJsonDocument doc(JsonResponseUtils::SMALL_JSON_SIZE);
    JsonObject data = doc["data"].to<JsonObject>();
    data["operation"] = operation;

    if (!filename.isEmpty()) {
        data["filename"] = filename;
    }

    String message = operation + (success ? " completed successfully" : " failed");
    sendResponse(request, success ? SUCCESS : ERROR, message, data);
}

void WebResponseUtils::sendModuleResponse(AsyncWebServerRequest* request, const String& module,
                                          const String& action, bool success, const String& message) {
    DynamicJsonDocument doc(JsonResponseUtils::SMALL_JSON_SIZE);
    JsonObject data = doc["data"].to<JsonObject>();
    data["module"] = module;
    data["action"] = action;

    String responseMessage = message.isEmpty() ? (module + " " + action + (success ? " completed" : " failed")) : message;

    sendResponse(request, success ? SUCCESS : ERROR, responseMessage, data);
}

void WebResponseUtils::sendBulkOperationResponse(AsyncWebServerRequest* request,
                                                 const String& operation,
                                                 int totalItems, int successCount, int failureCount) {
    DynamicJsonDocument doc(JsonResponseUtils::SMALL_JSON_SIZE);
    JsonObject data = doc["data"].to<JsonObject>();
    data["operation"] = operation;
    data["total"] = totalItems;
    data["success"] = successCount;
    data["failed"] = failureCount;

    bool overallSuccess = (failureCount == 0);
    String message = operation + " completed: " + String(successCount) + "/" + String(totalItems) + " successful";

    sendResponse(request, overallSuccess ? SUCCESS : ERROR, message, data);
}

void WebResponseUtils::sendMissingParamError(AsyncWebServerRequest* request, const String& param) {
    sendResponse(request, BAD_REQUEST, "Missing required parameter: " + param);
}

void WebResponseUtils::sendInvalidParamError(AsyncWebServerRequest* request, const String& param, const String& reason) {
    String message = "Invalid parameter: " + param;
    if (!reason.isEmpty()) {
        message += " (" + reason + ")";
    }
    sendResponse(request, BAD_REQUEST, message);
}

void WebResponseUtils::sendServiceUnavailableError(AsyncWebServerRequest* request, const String& service) {
    String message = service.isEmpty() ? "Service temporarily unavailable" : (service + " service temporarily unavailable");
    sendResponse(request, SERVICE_UNAVAILABLE, message);
}

void WebResponseUtils::sendNotImplementedError(AsyncWebServerRequest* request, const String& feature) {
    String message = feature.isEmpty() ? "Feature not implemented" : (feature + " feature not implemented");
    sendResponse(request, SERVER_ERROR, message);
}

String WebResponseUtils::getContentTypeFromExtension(const String& filename) {
    if (filename.endsWith(".html") || filename.endsWith(".htm")) return "text/html";
    if (filename.endsWith(".css")) return "text/css";
    if (filename.endsWith(".js")) return "application/javascript";
    if (filename.endsWith(".json")) return "application/json";
    if (filename.endsWith(".png")) return "image/png";
    if (filename.endsWith(".jpg") || filename.endsWith(".jpeg")) return "image/jpeg";
    if (filename.endsWith(".gif")) return "image/gif";
    if (filename.endsWith(".svg")) return "image/svg+xml";
    if (filename.endsWith(".ico")) return "image/x-icon";
    if (filename.endsWith(".xml")) return "application/xml";
    if (filename.endsWith(".pdf")) return "application/pdf";
    if (filename.endsWith(".zip")) return "application/zip";
    if (filename.endsWith(".txt")) return "text/plain";
    return "application/octet-stream";
}

bool WebResponseUtils::isJsonRequest(AsyncWebServerRequest* request) {
    if (request->hasHeader("Content-Type")) {
        String contentType = request->header("Content-Type");
        return contentType.indexOf("application/json") >= 0;
    }
    return false;
}

bool WebResponseUtils::acceptsJson(AsyncWebServerRequest* request) {
    if (request->hasHeader("Accept")) {
        String accept = request->header("Accept");
        return accept.indexOf("application/json") >= 0 || accept.indexOf("*/*") >= 0;
    }
    // Default to JSON for API endpoints
    return request->url().startsWith("/api/") ||
           request->url().endsWith(".json") ||
           request->url().indexOf("_status") >= 0;
}

void WebResponseUtils::sendAdaptiveResponse(AsyncWebServerRequest* request, bool success,
                                            const String& message, const JsonObject& data) {
    sendResponse(request, success ? SUCCESS : ERROR, message, data);
}

int WebResponseUtils::getStatusCodeForType(ResponseType type) {
    switch (type) {
        case SUCCESS:
            return HTTP_OK;
        case ERROR:
            return HTTP_SERVER_ERROR;
        case NOT_FOUND:
            return HTTP_NOT_FOUND;
        case BAD_REQUEST:
            return HTTP_BAD_REQUEST;
        case UNAUTHORIZED:
            return HTTP_UNAUTHORIZED;
        case FORBIDDEN:
            return HTTP_FORBIDDEN;
        case CONFLICT:
            return HTTP_CONFLICT;
        case SERVER_ERROR:
            return HTTP_SERVER_ERROR;
        case SERVICE_UNAVAILABLE:
            return HTTP_SERVICE_UNAVAILABLE;
        default:
            return HTTP_SERVER_ERROR;
    }
}

String WebResponseUtils::getDefaultMessageForType(ResponseType type) {
    switch (type) {
        case SUCCESS:
            return "Operation completed successfully";
        case ERROR:
            return "Operation failed";
        case NOT_FOUND:
            return "Resource not found";
        case BAD_REQUEST:
            return "Bad request";
        case UNAUTHORIZED:
            return "Unauthorized";
        case FORBIDDEN:
            return "Forbidden";
        case CONFLICT:
            return "Conflict";
        case SERVER_ERROR:
            return "Internal server error";
        case SERVICE_UNAVAILABLE:
            return "Service unavailable";
        default:
            return "Unknown error";
    }
}

void WebResponseUtils::addStandardHeaders(AsyncResponseStream* response) {
    // Note: In newer versions of ESPAsyncWebServer, headers should be added differently
    // For now, we'll set up the response with the proper content type
    response->addHeader("Access-Control-Allow-Origin", "*");
    response->addHeader("Access-Control-Allow-Headers", "Content-Type");
    response->addHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
}

void WebResponseUtils::addStandardHeaders(AsyncWebServerResponse* response) {
    response->addHeader("Access-Control-Allow-Origin", "*");
    response->addHeader("Access-Control-Allow-Headers", "Content-Type");
    response->addHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
}
