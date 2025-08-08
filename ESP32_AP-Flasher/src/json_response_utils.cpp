#include "json_response_utils.h"

#include <WiFi.h>
#include <esp_system.h>

// Centralized JSON response utilities implementation
// ===================================================

void JsonResponseUtils::sendSuccessResponse(AsyncWebServerRequest* request, const String& message) {
    DynamicJsonDocument doc(SMALL_JSON_SIZE);
    doc["success"] = true;
    doc["message"] = message;
    sendJsonResponse(request, doc);
}

void JsonResponseUtils::sendErrorResponse(AsyncWebServerRequest* request, int code, const String& message) {
    DynamicJsonDocument doc(SMALL_JSON_SIZE);
    doc["success"] = false;
    doc["error"] = message;
    doc["code"] = code;

    AsyncResponseStream* response = request->beginResponseStream("application/json");
    response->setCode(code);
    serializeJson(doc, *response);
    request->send(response);
}

void JsonResponseUtils::sendJsonResponse(AsyncWebServerRequest* request, const JsonDocument& doc) {
    AsyncResponseStream* response = request->beginResponseStream("application/json");
    addCORSHeaders(request);
    serializeJson(doc, *response);
    request->send(response);
}

void JsonResponseUtils::sendJsonResponse(AsyncWebServerRequest* request, const String& json) {
    AsyncResponseStream* response = request->beginResponseStream("application/json");
    addCORSHeaders(request);
    response->print(json);
    request->send(response);
}

void JsonResponseUtils::sendStatusResponse(AsyncWebServerRequest* request, bool success, const String& message, const JsonObject& data) {
    DynamicJsonDocument doc(MEDIUM_JSON_SIZE);
    doc["success"] = success;
    doc["message"] = message;
    doc["timestamp"] = millis();

    if (!data.isNull()) {
        doc["data"] = data;
    }

    sendJsonResponse(request, doc);
}

void JsonResponseUtils::sendFeatureResponse(AsyncWebServerRequest* request, const String& feature, bool enabled) {
    DynamicJsonDocument doc(SMALL_JSON_SIZE);
    doc["feature"] = feature;
    doc["enabled"] = enabled;
    doc["available"] = enabled;
    sendJsonResponse(request, doc);
}

void JsonResponseUtils::sendModuleStatusResponse(AsyncWebServerRequest* request, const String& module, const String& status, const JsonObject& details) {
    DynamicJsonDocument doc(MEDIUM_JSON_SIZE);
    doc["module"] = module;
    doc["status"] = status;
    doc["timestamp"] = millis();

    if (!details.isNull()) {
        doc["details"] = details;
    }

    sendJsonResponse(request, doc);
}

String JsonResponseUtils::buildWSMessage(const String& type, const JsonObject& data) {
    DynamicJsonDocument doc(MEDIUM_JSON_SIZE);
    doc["type"] = type;
    doc["timestamp"] = millis();

    if (!data.isNull()) {
        doc["data"] = data;
    }

    String message;
    serializeJson(doc, message);
    return message;
}

String JsonResponseUtils::buildWSLogMessage(const String& message, const String& level) {
    DynamicJsonDocument doc(SMALL_JSON_SIZE);
    doc["logMsg"] = message;
    doc["level"] = level;
    doc["timestamp"] = millis();

    String json;
    serializeJson(doc, json);
    return json;
}

String JsonResponseUtils::buildWSErrorMessage(const String& error) {
    DynamicJsonDocument doc(SMALL_JSON_SIZE);
    doc["errMsg"] = error;
    doc["level"] = "error";
    doc["timestamp"] = millis();

    String json;
    serializeJson(doc, json);
    return json;
}

JsonObject JsonResponseUtils::buildSystemInfo(JsonDocument& doc) {
    JsonObject sys = doc["system"].to<JsonObject>();

    // Basic system info
    sys["chipModel"] = ESP.getChipModel();
    sys["chipRevision"] = ESP.getChipRevision();
    sys["cpuFreq"] = ESP.getCpuFreqMHz();
    sys["freeHeap"] = ESP.getFreeHeap();
    sys["totalHeap"] = ESP.getHeapSize();
    sys["minFreeHeap"] = ESP.getMinFreeHeap();
    sys["uptime"] = millis();
    sys["timestamp"] = millis();

    // Flash info
    sys["flashSize"] = ESP.getFlashChipSize();
    sys["flashSpeed"] = ESP.getFlashChipSpeed();
    sys["sketchSize"] = ESP.getSketchSize();
    sys["freeSketchSpace"] = ESP.getFreeSketchSpace();

    // Temperature if available
    sys["temperature"] = temperatureRead();

    return sys;
}

JsonObject JsonResponseUtils::buildWiFiInfo(JsonDocument& doc) {
    JsonObject wifi = doc["wifi"].to<JsonObject>();

    wifi["connected"] = (WiFi.status() == WL_CONNECTED);
    wifi["ssid"] = WiFi.SSID();
    wifi["ip"] = WiFi.localIP().toString();
    wifi["rssi"] = WiFi.RSSI();
    wifi["channel"] = WiFi.channel();
    wifi["mac"] = WiFi.macAddress();
    wifi["hostname"] = WiFi.getHostname();
    wifi["mode"] = WiFi.getMode();

    // AP info
    wifi["apEnabled"] = (WiFi.getMode() == WIFI_AP || WiFi.getMode() == WIFI_AP_STA);
    wifi["apClients"] = WiFi.softAPgetStationNum();
    wifi["apIP"] = WiFi.softAPIP().toString();

    return wifi;
}

JsonObject JsonResponseUtils::buildHardwareInfo(JsonDocument& doc) {
    JsonObject hw = doc["hardware"].to<JsonObject>();

    // Feature flags
    hw["HAS_RGB_LED"] = false;
    hw["HAS_TFT"] = false;
    hw["HAS_BLE_WRITER"] = false;
    hw["HAS_SUBGHZ"] = false;
    hw["C6_OTA_FLASHING"] = false;
    hw["HAS_IR_REMOTE"] = false;
    hw["HAS_RC522_RFID"] = false;
    hw["HAS_EXT_FLASHER"] = false;

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
#ifdef C6_OTA_FLASHING
    hw["C6_OTA_FLASHING"] = true;
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

    return hw;
}

bool JsonResponseUtils::validateRequiredParams(AsyncWebServerRequest* request, const std::vector<String>& params, bool isPost) {
    for (const String& param : params) {
        if (!request->hasParam(param.c_str(), isPost)) {
            sendErrorResponse(request, 400, "Missing required parameter: " + param);
            return false;
        }
    }
    return true;
}

String JsonResponseUtils::getParam(AsyncWebServerRequest* request, const String& name, const String& defaultValue, bool isPost) {
    if (request->hasParam(name.c_str(), isPost)) {
        return request->getParam(name.c_str(), isPost)->value();
    }
    return defaultValue;
}

void JsonResponseUtils::addCacheHeaders(AsyncWebServerRequest* request, uint32_t maxAge) {
    if (maxAge > 0) {
        // Note: ESPAsyncWebServer addInterestingHeader only takes header name, not value
        // We would need to use a different approach for cache headers
        addNoStoreHeaders(request);
    } else {
        addNoStoreHeaders(request);
    }
}

void JsonResponseUtils::addCORSHeaders(AsyncWebServerRequest* request) {
    // Note: ESPAsyncWebServer addInterestingHeader only takes header name, not value
    // CORS headers would need to be added differently, possibly through response headers
    request->addInterestingHeader("Access-Control-Allow-Origin");
    request->addInterestingHeader("Access-Control-Allow-Headers");
    request->addInterestingHeader("Access-Control-Allow-Methods");
}

void JsonResponseUtils::addNoStoreHeaders(AsyncWebServerRequest* request) {
    // Note: ESPAsyncWebServer addInterestingHeader only takes header name, not value
    // Cache control headers would need to be added differently
    request->addInterestingHeader("Cache-Control");
    request->addInterestingHeader("Pragma");
    request->addInterestingHeader("Expires");
}
