#include "websocket_utils.h"

#include <WiFi.h>

#include "json_response_utils.h"
#include "tag_db.h"

// Forward declarations for external functions
extern void refreshAllPending();
extern void saveDB(const String& path);

// Static member definitions
AsyncWebSocket* WebSocketUtils::wsInstance = nullptr;
SemaphoreHandle_t WebSocketUtils::wsMutex = nullptr;

bool WebSocketUtils::initialize(AsyncWebSocket* ws) {
    if (!ws) return false;

    wsInstance = ws;

    if (!wsMutex) {
        wsMutex = xSemaphoreCreateMutex();
    }

    // Set up event handler
    ws->onEvent(onEvent);

    Serial.println("[WS_UTILS] WebSocket utilities initialized");
    return true;
}

void WebSocketUtils::cleanup() {
    if (wsInstance) {
        wsInstance->closeAll();
        wsInstance = nullptr;
    }

    if (wsMutex) {
        vSemaphoreDelete(wsMutex);
        wsMutex = nullptr;
    }
}

bool WebSocketUtils::sendMessage(const JsonDocument& doc, uint32_t timeout_ms) {
    if (!wsInstance || !wsMutex || !hasClients()) return false;

    if (xSemaphoreTake(wsMutex, pdMS_TO_TICKS(timeout_ms)) == pdTRUE) {
        String message;
        size_t serializedSize = serializeJson(doc, message);
        if (serializedSize > 0) {
            wsInstance->textAll(message);
        }
        xSemaphoreGive(wsMutex);
        return serializedSize > 0;
    }
    return false;
}

bool WebSocketUtils::sendMessage(const String& message, uint32_t timeout_ms) {
    if (!wsInstance || !wsMutex || !hasClients() || message.isEmpty()) return false;

    if (xSemaphoreTake(wsMutex, pdMS_TO_TICKS(timeout_ms)) == pdTRUE) {
        wsInstance->textAll(message);
        xSemaphoreGive(wsMutex);
        return true;
    }
    return false;
}

bool WebSocketUtils::broadcastMessage(const JsonDocument& doc, uint32_t timeout_ms) {
    return sendMessage(doc, timeout_ms);
}

bool WebSocketUtils::broadcastMessage(const String& message, uint32_t timeout_ms) {
    return sendMessage(message, timeout_ms);
}

void WebSocketUtils::sendLogMessage(const String& text, const String& level) {
    if (text.isEmpty() || !hasClients()) return;

    String message = JsonResponseUtils::buildWSLogMessage(text, level);
    sendMessage(message);
}

void WebSocketUtils::sendErrorMessage(const String& text) {
    if (text.isEmpty() || !hasClients()) return;

    String message = JsonResponseUtils::buildWSErrorMessage(text);
    sendMessage(message);
}

void WebSocketUtils::sendSystemInfo() {
    if (!hasClients()) return;

    DynamicJsonDocument doc(JsonResponseUtils::LARGE_JSON_SIZE);

    // Build comprehensive system info
    JsonResponseUtils::buildSystemInfo(doc);
    JsonResponseUtils::buildWiFiInfo(doc);
    JsonResponseUtils::buildHardwareInfo(doc);

    // Add WebSocket specific info
    doc["ws"]["clients"] = getClientCount();
    doc["ws"]["healthy"] = isHealthy();

    sendMessage(doc);
}

void WebSocketUtils::sendTagInfo(const uint8_t* mac, uint8_t syncMode) {
    if (!mac || !hasClients()) return;

    // This function depends on external tag database functions
    // In a real implementation, this would be refactored to use dependency injection
    String json = tagDBtoJson(mac);
    if (!json.isEmpty()) {
        sendMessage(json);
    }
}

void WebSocketUtils::sendAPInfo(APlist* apitem) {
    if (!apitem || !hasClients()) return;

    DynamicJsonDocument doc(JsonResponseUtils::MEDIUM_JSON_SIZE);
    JsonObject ap = doc["apitem"].to<JsonObject>();

    char version_str[6];
    sprintf(version_str, "%04X", apitem->version);

    ap["ip"] = ((IPAddress)apitem->src).toString();
    ap["alias"] = apitem->alias;
    ap["count"] = apitem->tagCount;
    ap["channel"] = apitem->channelId;
    ap["version"] = version_str;

    sendMessage(doc);
}

void WebSocketUtils::sendSerialOutput(const String& text, const String& color) {
    if (text.isEmpty()) return;

    DynamicJsonDocument doc(JsonResponseUtils::MEDIUM_JSON_SIZE);
    doc["console"] = text;
    if (!color.isEmpty()) {
        doc["color"] = color;
    }
    doc["timestamp"] = millis();

    // Also send to Serial for debugging
    Serial.println(text);

    if (hasClients()) {
        sendMessage(doc);
    }
}

uint8_t WebSocketUtils::getClientCount() {
    return wsInstance ? wsInstance->count() : 0;
}

bool WebSocketUtils::hasClients() {
    return getClientCount() > 0;
}

bool WebSocketUtils::isHealthy() {
    return wsInstance != nullptr && wsMutex != nullptr;
}

String WebSocketUtils::buildStatusMessage(const String& status, const JsonObject& data) {
    DynamicJsonDocument doc(JsonResponseUtils::MEDIUM_JSON_SIZE);
    doc["status"] = status;
    doc["timestamp"] = millis();

    if (!data.isNull()) {
        doc["data"] = data;
    }

    String message;
    serializeJson(doc, message);
    return message;
}

String WebSocketUtils::buildNotification(const String& title, const String& message, const String& type) {
    DynamicJsonDocument doc(JsonResponseUtils::MEDIUM_JSON_SIZE);
    doc["notification"]["title"] = title;
    doc["notification"]["message"] = message;
    doc["notification"]["type"] = type;
    doc["notification"]["timestamp"] = millis();

    String json;
    serializeJson(doc, json);
    return json;
}

void WebSocketUtils::onEvent(AsyncWebSocket* server, AsyncWebSocketClient* client, AwsEventType type, void* arg, uint8_t* data, size_t len) {
    switch (type) {
        case WS_EVT_CONNECT:
            Serial.printf("[WS_UTILS] Client %u connected from %s\n", client->id(), client->remoteIP().toString().c_str());
            break;

        case WS_EVT_DISCONNECT:
            Serial.printf("[WS_UTILS] Client %u disconnected\n", client->id());
            break;

        case WS_EVT_ERROR:
            Serial.printf("[WS_UTILS] Client %u error(%u): %s\n", client->id(), *((uint16_t*)arg), (char*)data);
            break;

        case WS_EVT_DATA: {
            AwsFrameInfo* info = (AwsFrameInfo*)arg;
            if (info->final && info->index == 0 && info->len == len && info->opcode == WS_TEXT) {
                data[len] = 0;  // Null terminate
                String message = (char*)data;
                Serial.printf("[WS_UTILS] Received message from client %u: %s\n", client->id(), message.c_str());

                // Handle incoming messages if needed
                // This could be extended to parse JSON commands
            }
            break;
        }

        case WS_EVT_PONG:
            Serial.printf("[WS_UTILS] Client %u pong\n", client->id());
            break;

        default:
            break;
    }
}
