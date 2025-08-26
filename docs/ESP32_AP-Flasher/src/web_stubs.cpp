// Minimal weak fallback implementations for web/globals to satisfy linker
// These are intentionally small and marked weak so a full implementation
// elsewhere in the project can override them.

#include <Arduino.h>
#include <ESPAsyncWebServer.h>
#include "web.h"

// WiFiModule handles all WiFi duties; this stub intentionally minimal.

// lastssidscan default
uint32_t lastssidscan = 0;

// Webserver and websocket instances (weak so they can be replaced by a stronger symbol)
__attribute__((weak)) AsyncWebServer server(80);
__attribute__((weak)) AsyncWebSocket ws("/ws");

// Mutex placeholders
SemaphoreHandle_t wsMutex = NULL;

// Minimal handler implementations
void handleGetWifiConfig(AsyncWebServerRequest *request) __attribute__((weak));
void handleGetWifiConfig(AsyncWebServerRequest *request)
{
  // Return an empty wifi config object to satisfy callers
  request->send(200, "application/json", "{}");
}

void handleTagCommand(AsyncWebServerRequest *request) __attribute__((weak));
void handleTagCommand(AsyncWebServerRequest *request)
{
  // Acknowledge the command; real implementation should parse and act
  request->send(200, "application/json", "{\"status\":\"ok\"}");
}

// Websocket / logging helpers
void wsSerial(const String &text) __attribute__((weak));
void wsSerial(const String &text) { Serial.println(text); }

void wsSerial(const String &text, const String &color) __attribute__((weak));
void wsSerial(const String &text, const String &color)
{
  (void)color;
  Serial.println(text);
}

void wsErr(const String &text) __attribute__((weak));
void wsErr(const String &text) { Serial.println(String("ERR: ") + text); }

void wsLog(const String &text) __attribute__((weak));
void wsLog(const String &text) { Serial.println(String("LOG: ") + text); }

uint8_t wsClientCount() __attribute__((weak));
uint8_t wsClientCount() { return 0; }

// No-op senders used by multiple modules
void wsSendTaginfo(const uint8_t *mac, uint8_t syncMode) __attribute__((weak));
void wsSendTaginfo(const uint8_t *mac, uint8_t syncMode)
{
  (void)mac;
  (void)syncMode;
}

void wsSendSysteminfo() __attribute__((weak));
void wsSendSysteminfo() {}

void wsSendAPitem(struct APlist *apitem) __attribute__((weak));
void wsSendAPitem(struct APlist *apitem) { (void)apitem; }
