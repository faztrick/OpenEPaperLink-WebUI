
#ifndef WEB_H
#define WEB_H

#include <Arduino.h>
#include <AsyncTCP.h>
#include <ESPAsyncWebServer.h>
#include "c6_module.h"

// Project globals referenced by web handlers
#include "storage.h"
#include "serialap.h"
#include "module_manager.h"
#include "tag_db.h"
#include "newproto.h"

// Ensure Async JSON handler type is visible
#include <AsyncJson.h>

// Forward declarations
struct APlist;

// Core web functions
void init_web();
void doImageUpload(AsyncWebServerRequest *request, String filename, size_t index, uint8_t *data, size_t len, bool final);
void doJsonUpload(AsyncWebServerRequest *request);
void dotagDBUpload(AsyncWebServerRequest *request, String filename, size_t index, uint8_t *data, size_t len, bool final);

// (moved) Module management API setup is provided by ModuleManager
// Use: moduleManager.setupModuleManagementAPI(server);

// Missing function declarations for OTA handlers
void handleSysinfoRequest(AsyncWebServerRequest *request);
void handleCheckFile(AsyncWebServerRequest *request);
void handleRollback(AsyncWebServerRequest *request);
void handleUpdateC6(AsyncWebServerRequest *request);
void handleUpdateActions(AsyncWebServerRequest *request);
void handleUpdateOTA(AsyncWebServerRequest *request);
void handleLittleFSUpload(AsyncWebServerRequest *request, String filename, size_t index, uint8_t *data, size_t len, bool final);

// Common wifi and tag handlers referenced by web registrations
void handleGetWifiConfig(AsyncWebServerRequest *request);
void handleTagCommand(AsyncWebServerRequest *request);

// WebSocket functions
void wsLog(const String &text);
void wsErr(const String &text);
void wsSendTaginfo(const uint8_t *mac, uint8_t syncMode);
void wsSendSysteminfo();
void wsSendAPitem(struct APlist *apitem);
void wsSerial(const String &text);
void wsSerial(const String &text, const String &color);

// Optional UDP log mirroring configuration helpers
void wsSetLogUdpTarget(const String &ip, uint16_t port, bool enabled);
void wsGetLogUdpConfig(String &ip, uint16_t &port, bool &enabled);
uint8_t wsClientCount();

extern AsyncWebSocket ws;
extern SemaphoreHandle_t wsMutex;

// Common globals used across web handlers
extern AsyncWebServer server;
extern fs::FS *contentFS;
extern SemaphoreHandle_t fsMutex;
extern uint32_t lastssidscan;
extern std::vector<tagRecord *> tagDB;
extern std::vector<PendingItem> pendingQueue;

#endif // WEB_H
