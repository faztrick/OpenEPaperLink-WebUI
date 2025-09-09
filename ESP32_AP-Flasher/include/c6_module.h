#ifndef C6_MODULE_H
#define C6_MODULE_H

#include <Arduino.h>
#include <AsyncTCP.h>
#include <ESPAsyncWebServer.h>
#include <Preferences.h>
#include <ArduinoJson.h>

#ifdef C6_OTA_FLASHING

// C6 Module structures and types
struct RadioTestResult {
    bool success;
    String error;
    int rssi;
    int channel;
    int packetsSent;
    int packetsReceived;
    float errorRate;
};

struct C6FirmwareUpdateParams {
    String filename;
    bool verify;
};

// C6FlashParams is already defined in ota.h

// Web handler functions for C6 module
void handleC6UpdateStatus(AsyncWebServerRequest *request);
void handleBackupC6Firmware(AsyncWebServerRequest *request);
void handleAPList(AsyncWebServerRequest *request);
void handleGetC6Settings(AsyncWebServerRequest *request);
void handleSaveC6SettingsBody(AsyncWebServerRequest *request, uint8_t *data, size_t len, size_t index, size_t total);
void handleResetC6Settings(AsyncWebServerRequest *request);
void handleTestC6Connection(AsyncWebServerRequest *request);
void handleTestC6Radio(AsyncWebServerRequest *request);
void handleRestartC6(AsyncWebServerRequest *request);
void handleBackupC6Config(AsyncWebServerRequest *request);
void handleResetC6Config(AsyncWebServerRequest *request);
void handleC6FirmwareUpload(AsyncWebServerRequest *request, String filename, size_t index, uint8_t *data, size_t len, bool final);
void handleListDrives(AsyncWebServerRequest *request);
void handleListSerialPorts(AsyncWebServerRequest *request);
void handleFlashC6OTA(AsyncWebServerRequest *request);

// C6 Module helper functions
void applyC6Settings();
bool testC6ModuleConnection();
RadioTestResult performC6RadioTest();
bool restartC6Module();
bool factoryResetC6Module();
bool sendC6Command(const String& command, int parameter);

// C6 Module initialization and setup
void initC6Module();
void registerC6WebHandlers(AsyncWebServer& server);

// Task functions (declared here but implemented in ota.cpp)
void C6firmwareUpdateTask(void* parameter);
void C6OTAFlashTask(void* parameter);

#endif // C6_OTA_FLASHING

#endif // C6_MODULE_H
