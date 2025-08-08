#pragma once

#include <ArduinoJson.h>
#include <ESPAsyncWebServer.h>

#include "commstructs.h"

// Centralized WebSocket utilities to eliminate duplicate code
// ===========================================================

class WebSocketUtils {
   private:
    static AsyncWebSocket* wsInstance;
    static SemaphoreHandle_t wsMutex;
    static const uint32_t WS_TIMEOUT_MS = 1000;
    static const size_t WS_BUFFER_SIZE = 2048;

   public:
    // Initialize WebSocket utilities
    static bool initialize(AsyncWebSocket* ws);
    static void cleanup();

    // Core messaging functions
    static bool sendMessage(const JsonDocument& doc, uint32_t timeout_ms = WS_TIMEOUT_MS);
    static bool sendMessage(const String& message, uint32_t timeout_ms = WS_TIMEOUT_MS);
    static bool broadcastMessage(const JsonDocument& doc, uint32_t timeout_ms = WS_TIMEOUT_MS);
    static bool broadcastMessage(const String& message, uint32_t timeout_ms = WS_TIMEOUT_MS);

    // Specialized message types
    static void sendLogMessage(const String& text, const String& level = "info");
    static void sendErrorMessage(const String& text);
    static void sendSystemInfo();
    static void sendTagInfo(const uint8_t* mac, uint8_t syncMode);
    static void sendAPInfo(APlist* apitem);

    // Console/Serial output
    static void sendSerialOutput(const String& text, const String& color = "");

    // Client management
    static uint8_t getClientCount();
    static bool hasClients();

    // Status and health
    static bool isHealthy();

    // Utility functions
    static String buildStatusMessage(const String& status, const JsonObject& data = JsonObject());
    static String buildNotification(const String& title, const String& message, const String& type = "info");

    // Event handlers
    static void onEvent(AsyncWebSocket* server, AsyncWebSocketClient* client, AwsEventType type, void* arg, uint8_t* data, size_t len);
};
