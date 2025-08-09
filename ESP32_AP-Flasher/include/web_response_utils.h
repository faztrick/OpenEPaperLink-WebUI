#pragma once

#include <ArduinoJson.h>
#include <ESPAsyncWebServer.h>

#include "json_response_utils.h"

// Enhanced centralized web response utilities
// ===========================================

class WebResponseUtils {
   public:
    // Standard response types
    enum ResponseType {
        SUCCESS,
        ERROR,
        NOT_FOUND,
        BAD_REQUEST,
        UNAUTHORIZED,
        FORBIDDEN,
        CONFLICT,
        SERVER_ERROR,
        SERVICE_UNAVAILABLE
    };

    // Common HTTP status codes
    static const int HTTP_OK = 200;
    static const int HTTP_BAD_REQUEST = 400;
    static const int HTTP_UNAUTHORIZED = 401;
    static const int HTTP_FORBIDDEN = 403;
    static const int HTTP_NOT_FOUND = 404;
    static const int HTTP_CONFLICT = 409;
    static const int HTTP_SERVER_ERROR = 500;
    static const int HTTP_SERVICE_UNAVAILABLE = 503;

    // Enhanced response builders
    static void sendResponse(AsyncWebServerRequest* request, ResponseType type,
                             const String& message = "", const JsonObject& data = JsonObject());

    static void sendPlainResponse(AsyncWebServerRequest* request, int statusCode,
                                  const String& message, const String& contentType = "text/plain");

    static void sendFileResponse(AsyncWebServerRequest* request, const String& path,
                                 const String& contentType = "", bool download = false);

    // Parameter validation and extraction
    static bool validateAndRespond(AsyncWebServerRequest* request,
                                   const std::vector<String>& requiredParams,
                                   bool isPost = false);

    static String getParamSafe(AsyncWebServerRequest* request, const String& name,
                               const String& defaultValue = "", bool isPost = false);

    // Common response patterns
    static void sendTagResponse(AsyncWebServerRequest* request, const String& mac,
                                bool success, const String& message = "");

    static void sendSystemResponse(AsyncWebServerRequest* request);
    static void sendWiFiResponse(AsyncWebServerRequest* request);
    static void sendFeatureStatusResponse(AsyncWebServerRequest* request, const String& feature);

    // File operation responses
    static void sendFileOperationResponse(AsyncWebServerRequest* request, bool success,
                                          const String& operation, const String& filename = "");

    // Module operation responses
    static void sendModuleResponse(AsyncWebServerRequest* request, const String& module,
                                   const String& action, bool success, const String& message = "");

    // Bulk operation responses
    static void sendBulkOperationResponse(AsyncWebServerRequest* request,
                                          const String& operation,
                                          int totalItems, int successCount, int failureCount);

    // Enhanced error handling
    static void sendMissingParamError(AsyncWebServerRequest* request, const String& param);
    static void sendInvalidParamError(AsyncWebServerRequest* request, const String& param, const String& reason = "");
    static void sendServiceUnavailableError(AsyncWebServerRequest* request, const String& service = "");
    static void sendNotImplementedError(AsyncWebServerRequest* request, const String& feature = "");

    // Content type helpers
    static String getContentTypeFromExtension(const String& filename);
    static bool isJsonRequest(AsyncWebServerRequest* request);
    static bool acceptsJson(AsyncWebServerRequest* request);

    // Response helpers with automatic JSON/plain text selection
    static void sendAdaptiveResponse(AsyncWebServerRequest* request, bool success,
                                     const String& message, const JsonObject& data = JsonObject());

   private:
    static int getStatusCodeForType(ResponseType type);
    static String getDefaultMessageForType(ResponseType type);
    static void addStandardHeaders(AsyncResponseStream* response);
    static void addStandardHeaders(AsyncWebServerResponse* response);
};

// Convenience macros for common responses
#define SEND_SUCCESS(req, msg) WebResponseUtils::sendResponse(req, WebResponseUtils::SUCCESS, msg)
#define SEND_ERROR(req, msg) WebResponseUtils::sendResponse(req, WebResponseUtils::ERROR, msg)
#define SEND_BAD_REQUEST(req, msg) WebResponseUtils::sendResponse(req, WebResponseUtils::BAD_REQUEST, msg)
#define SEND_NOT_FOUND(req, msg) WebResponseUtils::sendResponse(req, WebResponseUtils::NOT_FOUND, msg)
#define SEND_SERVICE_UNAVAILABLE(req, msg) WebResponseUtils::sendResponse(req, WebResponseUtils::SERVICE_UNAVAILABLE, msg)

// Parameter validation macro
#define VALIDATE_PARAMS(req, params, isPost) \
    if (!WebResponseUtils::validateAndRespond(req, params, isPost)) return

// Safe parameter extraction macro
#define GET_PARAM(req, name, defaultVal, isPost) \
    WebResponseUtils::getParamSafe(req, name, defaultVal, isPost)

// JSON response with validation macro
#define SEND_JSON_IF_VALID(req, validation, successMsg, errorMsg) \
    do {                                                          \
        if (validation) {                                         \
            SEND_SUCCESS(req, successMsg);                        \
        } else {                                                  \
            SEND_ERROR(req, errorMsg);                            \
        }                                                         \
    } while (0)
