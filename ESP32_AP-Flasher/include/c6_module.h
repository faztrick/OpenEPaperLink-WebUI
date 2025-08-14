#ifndef C6_MODULE_H
#define C6_MODULE_H

#include <Arduino.h>
#include <ArduinoJson.h>
#include <AsyncTCP.h>
#include <ESPAsyncWebServer.h>
#include <Preferences.h>

#include <map>
#include <vector>

#ifdef ESP32_C6
#include "driver/gpio.h"
#include "esp_pm.h"
#include "esp_sleep.h"
#include "hal/gpio_hal.h"
#endif

#ifdef HAS_C6

// ============================================================================
// ESP32-C6 Pin Configuration and Monitoring Structures
// ============================================================================

struct C6PinConfig {
    uint8_t pin;
    String name;
    String function;
    uint8_t mode;  // INPUT, OUTPUT, INPUT_PULLUP, etc.
    bool isAnalog = false;
    bool isDigital = true;
    bool isInterruptCapable = false;
    bool isSpecialFunction = false;
    String description;
    uint32_t lastChange = 0;

    // Current state
    int digitalValue = 0;
    int analogValue = 0;
    float voltage = 0.0;
    bool hasChanged = false;

    // Configuration
    bool monitorEnabled = true;
    uint32_t monitorInterval = 1000;  // ms
    bool triggerOnChange = false;
    int changeThreshold = 10;  // For analog pins
};

struct C6DisplayCommConfig {
    bool enabled = true;
    uint8_t txPin = FLASHER_C6_TXD;
    uint8_t rxPin = FLASHER_C6_RXD;
    uint8_t resetPin = FLASHER_C6_RESET;
    uint8_t powerPin = FLASHER_C6_POWER;
    uint32_t baudRate = 115200;
    uint8_t dataBits = 8;
    uint8_t stopBits = 1;
    uint8_t parity = 0;       // 0=None, 1=Even, 2=Odd
    uint32_t timeout = 5000;  // ms
    bool flowControl = false;
    bool enableProtocol = true;
    String protocolVersion = "1.0";
};

struct C6Statistics {
    // System statistics
    uint32_t uptime = 0;
    uint32_t freeHeap = 0;
    uint32_t totalHeap = 0;
    uint32_t minFreeHeap = 0;
    uint8_t cpuUsage = 0;
    float temperature = 0.0;
    float voltage = 3.3;

    // Communication statistics
    uint32_t displayCommPackets = 0;
    uint32_t displayCommErrors = 0;
    uint32_t displayCommTimeout = 0;
    uint32_t lastDisplayComm = 0;

    // Pin monitoring statistics
    uint32_t pinStateChanges = 0;
    uint32_t analogReadings = 0;
    uint32_t digitalReadings = 0;
    uint32_t interruptEvents = 0;

    // Power management
    uint32_t sleepCount = 0;
    uint32_t totalSleepTime = 0;  // ms
    uint32_t wakeupCount = 0;

    // Network statistics
    uint32_t wifiPacketsRx = 0;
    uint32_t wifiPacketsTx = 0;
    uint32_t bluetoothConnections = 0;
};

// ============================================================================
// C6 Module structures and types
// ============================================================================
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
void handleFlashC6Firmware(AsyncWebServerRequest *request);
void handleInstallC6Firmware(AsyncWebServerRequest *request);

// C6 Module helper functions
void applyC6Settings();
bool testC6ModuleConnection();
RadioTestResult performC6RadioTest();
bool restartC6Module();
bool factoryResetC6Module();
bool sendC6Command(const String &command, int parameter);

// C6 Module initialization and setup
void initC6Module();
void registerC6WebHandlers(AsyncWebServer &server);

// Task functions (declared here but implemented in ota.cpp)
void C6firmwareUpdateTask(void *parameter);
void C6OTAFlashTask(void *parameter);

// ============================================================================
// Enhanced C6 Module Management Class
// ============================================================================

class C6Enhanced {
   private:
    static C6Enhanced *instance;

    // Pin configuration
    std::vector<C6PinConfig> pinConfigs;
    C6DisplayCommConfig displayConfig;
    C6Statistics statistics;

    // State management
    bool initialized = false;
    bool displayCommEnabled = true;
    uint32_t lastStatsUpdate = 0;
    uint32_t lastPinScan = 0;
    uint32_t statsUpdateInterval = 5000;  // 5 seconds
    uint32_t pinScanInterval = 1000;      // 1 second

    // Communication
    HardwareSerial *displaySerial = nullptr;

    C6Enhanced();

    // Internal methods
    void initializeDefaultPins();
    void updateSystemStatistics();
    void scanPinStates();

   public:
    static C6Enhanced &getInstance();

    // Initialization and Configuration
    bool initialize();
    bool configure(const JsonObject &config);
    void shutdown();

    // Pin Management
    bool addPinConfig(const C6PinConfig &config);
    bool removePinConfig(uint8_t pin);
    bool updatePinConfig(uint8_t pin, const C6PinConfig &config);
    C6PinConfig *getPinConfig(uint8_t pin);
    std::vector<C6PinConfig> getAllPinConfigs();
    String getPinStatusJson();

    // Pin Operations
    bool setPinMode(uint8_t pin, uint8_t mode);
    bool digitalWrite(uint8_t pin, uint8_t value);
    int digitalRead(uint8_t pin);
    int analogRead(uint8_t pin);
    float readVoltage(uint8_t pin);
    bool enablePinMonitoring(uint8_t pin, bool enable);

    // Display Communication
    bool enableDisplayComm(bool enable);
    bool configureDisplayComm(const C6DisplayCommConfig &config);
    bool sendDisplayCommand(const String &command);
    bool sendDisplayData(const uint8_t *data, size_t length);
    String receiveDisplayResponse(uint32_t timeoutMs = 5000);
    bool isDisplayCommActive();
    uint32_t getDisplayCommErrors();

    // Display Protocol Commands
    bool displayReset();
    bool displayWakeup();
    bool displaySleep();
    bool displaySetBrightness(uint8_t brightness);
    bool displayClear();
    bool displayShowText(const String &text, uint16_t x = 0, uint16_t y = 0);
    bool displayRefresh();
    String getDisplayStatus();

    // System Monitoring
    void updateStatistics();
    C6Statistics getStatistics() const { return statistics; }
    String getStatisticsJson();
    String getSystemInfoJson();
    void resetStatistics();

    // Configuration Persistence
    bool saveConfiguration(const String &filename = "/c6_config.json");
    bool loadConfiguration(const String &filename = "/c6_config.json");
    String exportConfiguration();
    bool importConfiguration(const String &jsonConfig);

    // Task Management
    void poll();
    void cleanup();

    // Utility Functions
    static String pinModeToString(uint8_t mode);
    static bool isValidPin(uint8_t pin);
    static bool isPinAnalogCapable(uint8_t pin);
    static std::vector<uint8_t> getAvailablePins();
};

// Global instance
extern C6Enhanced &c6Enhanced;

#endif  // HAS_C6

#endif  // C6_MODULE_H
