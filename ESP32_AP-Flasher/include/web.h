
#ifndef WEB_H
#define WEB_H

#include <Arduino.h>
#include <AsyncTCP.h>
#include <ESPAsyncWebServer.h>

void init_web();
void doImageUpload(AsyncWebServerRequest *request, String filename, size_t index, uint8_t *data, size_t len, bool final);
void doJsonUpload(AsyncWebServerRequest *request);
void dotagDBUpload(AsyncWebServerRequest *request, String filename, size_t index, uint8_t *data, size_t len, bool final);

// C6 Module Management Functions
void handleAPList(AsyncWebServerRequest *request);
void handleGetC6Settings(AsyncWebServerRequest *request);
void handleSaveC6SettingsBody(AsyncWebServerRequest *request, uint8_t *data, size_t len, size_t index, size_t total);
void handleSaveC6Settings(AsyncWebServerRequest *request, uint8_t *data, size_t len, size_t index, size_t total);
void handleResetC6Settings(AsyncWebServerRequest *request);
void handleTestC6Connection(AsyncWebServerRequest *request);
void handleTestC6Radio(AsyncWebServerRequest *request);
void handleRestartC6(AsyncWebServerRequest *request);
void handleBackupC6Config(AsyncWebServerRequest *request);
void handleResetC6Config(AsyncWebServerRequest *request);
void handleC6FirmwareUpload(AsyncWebServerRequest *request, String filename, size_t index, uint8_t *data, size_t len, bool final);
void handleC6UpdateStatus(AsyncWebServerRequest *request);
void handleBackupC6Firmware(AsyncWebServerRequest *request);
void handleListDrives(AsyncWebServerRequest *request);
void handleListSerialPorts(AsyncWebServerRequest *request);
void handleFlashC6OTA(AsyncWebServerRequest *request);

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

void applyC6Settings();
bool testC6ModuleConnection();
RadioTestResult performC6RadioTest();
bool restartC6Module();
bool factoryResetC6Module();
bool sendC6Command(const String& command, int parameter);
#endif

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
