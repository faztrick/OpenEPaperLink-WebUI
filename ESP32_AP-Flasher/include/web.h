
#ifndef WEB_H
#define WEB_H

#include <Arduino.h>
#include <AsyncTCP.h>
#include <ESPAsyncWebServer.h>
#include "c6_module.h"

// Forward declarations
struct APlist;

// Core web functions
void init_web();
void doImageUpload(AsyncWebServerRequest *request, String filename, size_t index, uint8_t *data, size_t len, bool final);
void doJsonUpload(AsyncWebServerRequest *request);
void dotagDBUpload(AsyncWebServerRequest *request, String filename, size_t index, uint8_t *data, size_t len, bool final);

// Missing function declarations for OTA handlers
void handleSysinfoRequest(AsyncWebServerRequest *request);
void handleCheckFile(AsyncWebServerRequest *request);
void handleRollback(AsyncWebServerRequest *request);
void handleUpdateC6(AsyncWebServerRequest *request);
void handleUpdateActions(AsyncWebServerRequest *request);
void handleUpdateOTA(AsyncWebServerRequest *request);
void handleLittleFSUpload(AsyncWebServerRequest *request, String filename, size_t index, uint8_t *data, size_t len, bool final);

// WebSocket functions
void wsLog(const String &text);
void wsErr(const String &text);
void wsSendTaginfo(const uint8_t *mac, uint8_t syncMode);
void wsSendSysteminfo();
void wsSendAPitem(struct APlist *apitem);
void wsSerial(const String &text);
void wsSerial(const String &text, const String &color);
uint8_t wsClientCount();

extern AsyncWebSocket ws;
extern SemaphoreHandle_t wsMutex;

#endif // WEB_H
