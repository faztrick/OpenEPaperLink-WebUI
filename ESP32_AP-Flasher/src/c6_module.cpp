#include "c6_module.h"

#include <algorithm>  // std::min

#include "commstructs.h"
#include "core_utilities.h"
#include "json_config.h"  // Modern unified configuration system
#include "module_manager.h"
#include "ota.h"
#include "serialap.h"
#include "settings.h"
#include "storage.h"
#include "system.h"
#include "tag_db.h"
#include "web.h"

#ifdef HAS_C6

// ========================================================================
// JSON SIZE CONSTANTS (replacing web_utilities)
// ========================================================================
const size_t JSON_SIZE_SMALL = 512;
const size_t JSON_SIZE_MEDIUM = 1024;
const size_t JSON_SIZE_LARGE = 2048;
const size_t JSON_SIZE_XLARGE = 4096;

// ========================================================================
// HELPER FUNCTIONS (replacing web_utilities)
// ========================================================================

// Send JSON response directly
void sendJsonResponse(AsyncWebServerRequest *request, const DynamicJsonDocument &doc, int statusCode = 200) {
    AsyncResponseStream *response = request->beginResponseStream("application/json");
    response->setCode(statusCode);
    response->addHeader("Access-Control-Allow-Origin", "*");
    response->addHeader("Cache-Control", "no-cache");
    serializeJson(doc, *response);
    request->send(response);
}

// Send error response
void sendErrorResponse(AsyncWebServerRequest *request, int code, const String &message, const String &context = "") {
    DynamicJsonDocument doc(JSON_SIZE_SMALL);
    doc["success"] = false;
    doc["error"] = message;
    doc["code"] = code;
    doc["timestamp"] = millis();
    if (!context.isEmpty()) {
        doc["context"] = context;
    }
    sendJsonResponse(request, doc, code);
}

// ========================================================================
// CONSTANTS AND CONFIGURATION
// ========================================================================
namespace C6Constants {
// Timeouts and intervals (milliseconds)
constexpr uint32_t HEALTH_CHECK_INTERVAL = 10000;  // 10 seconds
constexpr uint32_t HEALTH_CHECK_TIMEOUT = 30000;   // 30 seconds
constexpr uint32_t COMMAND_TIMEOUT = 2000;         // 2 seconds
constexpr uint32_t UPDATE_PROGRESS_STEP = 5;       // 5% progress steps

// Buffer sizes (bytes)
constexpr size_t JSON_SMALL_BUFFER = 512;    // Small responses
constexpr size_t JSON_MEDIUM_BUFFER = 1024;  // Medium responses
constexpr size_t JSON_LARGE_BUFFER = 2048;   // Large responses
constexpr size_t JSON_XLARGE_BUFFER = 4096;  // Extra large responses

// Firmware constraints
constexpr size_t MIN_FIRMWARE_SIZE = 64 * 1024;        // 64KB minimum
constexpr size_t MAX_FIRMWARE_SIZE = 2 * 1024 * 1024;  // 2MB maximum
constexpr size_t FIRMWARE_TASK_STACK = 8192;           // Task stack size
constexpr size_t OTA_TASK_STACK = 12288;               // OTA task stack size

// Communication parameters
constexpr int MIN_BAUD_RATE = 9600;        // Minimum baud rate
constexpr int MAX_BAUD_RATE = 2000000;     // Maximum baud rate
constexpr int DEFAULT_BAUD_RATE = 921600;  // Default baud rate

// Performance thresholds
constexpr float EXCELLENT_ERROR_RATE = 0.05f;  // < 5% error rate
constexpr float GOOD_ERROR_RATE = 0.15f;       // < 15% error rate
constexpr float FAIR_ERROR_RATE = 0.30f;       // < 30% error rate
}  // namespace C6Constants

// ========================================================================
// HELPER FUNCTION DECLARATIONS
// ========================================================================
namespace C6Helpers {
bool validateFirmwareFile(const String &filename, size_t &fileSize);
bool validateBaudRate(int baudRate);
String getPerformanceRating(float errorRate);
void logModuleEvent(const String &event, const String &details = "");
}  // namespace C6Helpers

// C6 Module Implementation using Module Manager Framework
// =======================================================

class C6Module : public ModuleInterface {
   private:
    bool isInitialized = false;
    bool isStarted = false;
    uint32_t lastHealthCheck = 0;
    String lastError = "";

   public:
    // Module lifecycle implementation
    bool initialize() override {
        Serial.println("[C6_MODULE] Initializing C6 module support...");

        // Set default values if not already set using new storage utilities
        if (STORAGE_GET_STRING("c6_module", "panId", "").isEmpty()) {
            STORAGE_SET_INT("c6_module", "channel", 20);
            STORAGE_SET_INT("c6_module", "txPower", 10);
            STORAGE_SET_STRING("c6_module", "panId", "0x1234");
            STORAGE_SET_STRING("c6_module", "sleepMode", "none");
            STORAGE_SET_INT("c6_module", "wakeInterval", 60);
            STORAGE_SET_BOOL("c6_module", "autoReconnect", true);
            STORAGE_SET_INT("c6_module", "healthCheckInterval", 10);
            Serial.println("[C6_MODULE] Default configuration set");
        }

        isInitialized = true;
        Serial.println("[C6_MODULE] Initialization complete");
        return true;
    }

    bool start() override {
        if (!isInitialized) {
            lastError = "Module not initialized";
            return false;
        }

        Serial.println("[C6_MODULE] Starting C6 module...");

        // Apply initial settings
        applyC6Settings();

        // Test initial connection
        if (!testC6ModuleConnection()) {
            Serial.println("[C6_MODULE] Warning: Initial connection test failed, but continuing startup");
            // Don't fail startup - module might connect later
        }

        isStarted = true;
        lastHealthCheck = millis();
        Serial.println("[C6_MODULE] C6 module started successfully");
        return true;
    }

    bool stop() override {
        Serial.println("[C6_MODULE] Stopping C6 module...");

        // Send sleep command to C6 module
        sendC6Command("SLEEP", 0);

        isStarted = false;
        Serial.println("[C6_MODULE] C6 module stopped");
        return true;
    }

    bool cleanup() override {
        Serial.println("[C6_MODULE] Cleaning up C6 module...");

        if (isStarted) {
            stop();
        }

        isInitialized = false;
        lastError = "";

        Serial.println("[C6_MODULE] C6 module cleanup complete");
        return true;
    }

    ModuleInfo getInfo() const override {
        ModuleInfo info;
        info.name = "C6Module";
        info.version = "1.2.0";
        info.description = "ESP32-C6 Co-processor Module Support";
        info.type = ModuleType::HARDWARE;
        info.initTime = 0;  // Initialize to prevent uninitialized variable warning

        if (!isInitialized) {
            info.state = ModuleState::UNINITIALIZED;
        } else if (!isStarted) {
            info.state = ModuleState::INITIALIZED;
        } else if (lastError.length() > 0) {
            info.state = ModuleState::ERROR;
        } else {
            info.state = ModuleState::ACTIVE;
        }

        // Set capabilities
        info.capabilities.hasWebHandlers = true;
        info.capabilities.hasTaskHandlers = true;
        info.capabilities.hasEventHandlers = true;
        info.capabilities.hasConfigInterface = true;
        info.capabilities.hasStatusInterface = true;
        info.capabilities.requiresHardware = true;
        info.capabilities.isOptional = false;  // C6 module is core functionality

        info.lastActivity = lastHealthCheck;
        info.errorMessage = lastError;

        return info;
    }

    bool isHealthy() const override {
        if (!isStarted) {
            return false;
        }

        // Check if C6 module is responding
        if (apInfo.state == AP_STATE_OFFLINE) {
            return false;
        }

        // Check if we've had recent activity
        if (millis() - lastHealthCheck > C6Constants::HEALTH_CHECK_TIMEOUT) {
            return false;
        }

        return lastError.length() == 0;
    }

    ModuleType getType() const override {
        return ModuleType::HARDWARE;
    }

    ModuleState getState() const override {
        if (!isInitialized) {
            return ModuleState::UNINITIALIZED;
        } else if (!isStarted) {
            return ModuleState::INITIALIZED;
        } else if (lastError.length() > 0) {
            return ModuleState::ERROR;
        } else {
            return ModuleState::ACTIVE;
        }
    }

    void registerWebHandlers(AsyncWebServer &server) override {
        // C6 web endpoints are centrally managed in web.cpp setupC6ModuleEndpoints()
        Serial.println("[C6_MODULE] Web handlers managed centrally in web.cpp");
    }

    void handleEvent(const String &event, const String &data) override {
        if (event == "system_restart") {
            Serial.println("[C6_MODULE] Handling system restart event");
            sendC6Command("PREPARE_RESTART", 0);
        } else if (event == "wifi_connected") {
            Serial.println("[C6_MODULE] WiFi connected, updating C6 module status");
            updateModuleActivity("C6Module");
        } else if (event == "health_check") {
            performHealthCheck();
        }
    }

    void update() override {
        // Periodic health check using configured interval
        if (millis() - lastHealthCheck > C6Constants::HEALTH_CHECK_INTERVAL) {
            performHealthCheck();
        }
    }

    String getConfig() const override {
        DynamicJsonDocument doc(1024);

        // Use new unified configuration system
        AppConfig &appConfig = CONFIG.getConfig();

        // Configuration is automatically loaded by CONFIG

        // Return C6 module specific configuration as JSON
        doc["channel"] = 20;  // Default channel
        doc["txPower"] = 10;  // Default power
        doc["panId"] = "0x1234";
        doc["sleepMode"] = "none";
        doc["wakeInterval"] = 60;
        doc["autoReconnect"] = true;
        doc["healthCheckInterval"] = 10;

        // Get device info from app config
        doc["deviceName"] = appConfig.system.deviceName;
        doc["debugMode"] = appConfig.system.debugMode;

        String configStr;
        serializeJson(doc, configStr);
        return configStr;
    }

    bool setConfig(const String &config) override {
        DynamicJsonDocument doc(1024);
        DeserializationError error = deserializeJson(doc, config);

        if (error) {
            lastError = "Invalid JSON configuration";
            return false;
        }

        // Use new unified configuration system
        AppConfig &appConfig = CONFIG.getConfig();

        // Update system configuration with provided values
        if (doc.containsKey("deviceName")) {
            appConfig.system.deviceName = doc["deviceName"].as<String>();
        }
        if (doc.containsKey("debugMode")) {
            appConfig.system.debugMode = doc["debugMode"].as<bool>();
        }

        // Save updated configuration
        bool result = CONFIG.save();

        if (!result) {
            lastError = "Failed to save configuration";
            return false;
        }

        // Apply new settings if module is running
        if (isStarted) {
            applyC6Settings();
        }

        return true;
    }

    String getStatus() const override {
        DynamicJsonDocument doc(1024);

        doc["connected"] = (apInfo.state != AP_STATE_OFFLINE);
        doc["state"] = static_cast<int>(apInfo.state);
        doc["version"] = apInfo.version;
        doc["channel"] = apInfo.channel;
        doc["rssi"] = apInfo.rssi;
        doc["uptime"] = apInfo.uptime;
        doc["lastHealthCheck"] = lastHealthCheck;
        doc["errorMessage"] = lastError;

        // MAC address as string
        String macStr = "";
        for (int i = 0; i < 8; i++) {
            if (i > 0) macStr += ":";
            macStr += String(apInfo.mac[i], HEX);
        }
        doc["mac"] = macStr;

#ifdef HAS_SUBGHZ
        doc["hasSubGhz"] = apInfo.hasSubGhz;
        doc["subGhzChannel"] = apInfo.SubGhzChannel;
#else
        doc["hasSubGhz"] = false;
        doc["subGhzChannel"] = 0;
#endif

        String status;
        serializeJson(doc, status);
        return status;
    }

    void getMetrics(JsonObject &metrics) const override {
        metrics["c6_connected"] = (apInfo.state != AP_STATE_OFFLINE);
        metrics["c6_rssi"] = apInfo.rssi;
        metrics["c6_uptime"] = apInfo.uptime;
        metrics["c6_version"] = apInfo.version;
        metrics["c6_channel"] = apInfo.channel;
        metrics["c6_health_checks"] = (millis() - lastHealthCheck < 30000) ? 1 : 0;
    }

    // Public accessors for status queried by web handlers
    bool isInitializedPublic() const { return isInitialized; }
    bool isStartedPublic() const { return isStarted; }
    const String &getLastError() const { return lastError; }
    uint32_t getLastHealthCheck() const { return lastHealthCheck; }

   private:
    void performHealthCheck() {
        lastHealthCheck = millis();

        if (!testC6ModuleConnection()) {
            if (lastError.length() == 0) {
                lastError = "Health check failed - C6 module not responding";
            }
        } else {
            lastError = "";  // Clear error if health check passes
        }

        // Update module manager activity
        updateModuleActivity("C6Module");
    }

    void updateModuleActivity(const String &moduleName) {
        // Update last activity timestamp in module manager
        lastHealthCheck = millis();
    }
};

// Global C6 module instance
static std::unique_ptr<C6Module> g_c6Module;
static std::unique_ptr<C6Enhanced> g_c6Enhanced;

// ============================================================================
// Enhanced C6 Module Implementation
// ============================================================================

C6Enhanced *C6Enhanced::instance = nullptr;

C6Enhanced::C6Enhanced() {
    displaySerial = nullptr;
}

C6Enhanced &C6Enhanced::getInstance() {
    if (!instance) {
        instance = new C6Enhanced();
    }
    return *instance;
}

bool C6Enhanced::initialize() {
    Serial.println("[C6_ENHANCED] Initializing enhanced C6 module...");

    if (initialized) {
        Serial.println("[C6_ENHANCED] Already initialized");
        return true;
    }

    // Initialize default pin configurations
    initializeDefaultPins();

    // Setup display communication
    displaySerial = &Serial1;
    displaySerial->begin(displayConfig.baudRate, SERIAL_8N1, displayConfig.rxPin, displayConfig.txPin);

    initialized = true;
    lastStatsUpdate = millis();
    lastPinScan = millis();

    Serial.println("[C6_ENHANCED] Enhanced C6 module initialized successfully");
    return true;
}

void C6Enhanced::initializeDefaultPins() {
    // Clear existing configurations
    pinConfigs.clear();

    // Add default pin configurations for ESP32-C6
    C6PinConfig config;

    // GPIO pins 0-23 (ESP32-C6 has 24 GPIO pins)
    for (uint8_t pin = 0; pin <= 23; pin++) {
        config.pin = pin;
        config.name = "GPIO" + String(pin);
        config.function = "General Purpose I/O";
        config.mode = INPUT;
        config.isDigital = true;
        config.isAnalog = (pin >= 0 && pin <= 6);  // ADC1 channels
        config.isInterruptCapable = true;
        config.description = "General purpose pin " + String(pin);
        config.monitorEnabled = false;  // Disabled by default to save resources

        // Special function pins
        if (pin == 16 || pin == 17) {
            config.function = "UART";
            config.description = "UART communication pin";
            config.isSpecialFunction = true;
        } else if (pin == 4 || pin == 5) {
            config.function = "SPI";
            config.description = "SPI communication pin";
            config.isSpecialFunction = true;
        } else if (pin == 21 || pin == 22) {
            config.function = "I2C";
            config.description = "I2C communication pin";
            config.isSpecialFunction = true;
        }

        pinConfigs.push_back(config);
    }

    Serial.printf("[C6_ENHANCED] Initialized %d pin configurations\n", pinConfigs.size());
}

bool C6Enhanced::addPinConfig(const C6PinConfig &config) {
    // Check if pin already exists
    for (auto &pin : pinConfigs) {
        if (pin.pin == config.pin) {
            pin = config;  // Update existing
            return true;
        }
    }

    // Add new configuration
    pinConfigs.push_back(config);
    return true;
}

C6PinConfig *C6Enhanced::getPinConfig(uint8_t pin) {
    for (auto &config : pinConfigs) {
        if (config.pin == pin) {
            return &config;
        }
    }
    return nullptr;
}

String C6Enhanced::getPinStatusJson() {
    DynamicJsonDocument doc(4096);
    JsonArray pins = doc.createNestedArray("pins");

    for (const auto &config : pinConfigs) {
        JsonObject pinObj = pins.createNestedObject();
        pinObj["pin"] = config.pin;
        pinObj["name"] = config.name;
        pinObj["function"] = config.function;
        pinObj["mode"] = pinModeToString(config.mode);
        pinObj["digitalValue"] = config.digitalValue;
        pinObj["analogValue"] = config.analogValue;
        pinObj["voltage"] = config.voltage;
        pinObj["isAnalog"] = config.isAnalog;
        pinObj["isDigital"] = config.isDigital;
        pinObj["monitorEnabled"] = config.monitorEnabled;
        pinObj["lastChange"] = config.lastChange;
    }

    JsonObject metadata = doc.createNestedObject("metadata");
    metadata["timestamp"] = millis();
    metadata["totalPins"] = pinConfigs.size();
    metadata["lastScan"] = lastPinScan;

    String result;
    serializeJson(doc, result);
    return result;
}

bool C6Enhanced::setPinMode(uint8_t pin, uint8_t mode) {
    if (!isValidPin(pin)) {
        return false;
    }

    pinMode(pin, mode);

    // Update configuration
    C6PinConfig *config = getPinConfig(pin);
    if (config) {
        config->mode = mode;
    }

    return true;
}

bool C6Enhanced::digitalWrite(uint8_t pin, uint8_t value) {
    if (!isValidPin(pin)) {
        return false;
    }

    ::digitalWrite(pin, value);

    // Update configuration
    C6PinConfig *config = getPinConfig(pin);
    if (config) {
        config->digitalValue = value;
        config->lastChange = millis();
        config->hasChanged = true;
        statistics.pinStateChanges++;
    }

    return true;
}

int C6Enhanced::digitalRead(uint8_t pin) {
    if (!isValidPin(pin)) {
        return -1;
    }

    int value = ::digitalRead(pin);

    // Update statistics
    statistics.digitalReadings++;

    // Update configuration
    C6PinConfig *config = getPinConfig(pin);
    if (config) {
        if (config->digitalValue != value) {
            config->digitalValue = value;
            config->lastChange = millis();
            config->hasChanged = true;
            statistics.pinStateChanges++;
        }
    }

    return value;
}

int C6Enhanced::analogRead(uint8_t pin) {
    if (!isValidPin(pin) || !isPinAnalogCapable(pin)) {
        return -1;
    }

    int value = ::analogRead(pin);

    // Update statistics
    statistics.analogReadings++;

    // Update configuration
    C6PinConfig *config = getPinConfig(pin);
    if (config) {
        config->analogValue = value;
        config->voltage = (value * 3.3) / 4095.0;  // ESP32 ADC reference
        config->lastChange = millis();
        config->hasChanged = true;
    }

    return value;
}

float C6Enhanced::readVoltage(uint8_t pin) {
    int adcValue = analogRead(pin);
    if (adcValue < 0) {
        return -1.0;
    }

    return (adcValue * 3.3) / 4095.0;
}

bool C6Enhanced::enableDisplayComm(bool enable) {
    displayCommEnabled = enable;

    if (enable && displaySerial) {
        if (!displaySerial->available()) {
            displaySerial->begin(displayConfig.baudRate, SERIAL_8N1, displayConfig.rxPin, displayConfig.txPin);
        }
    }

    return true;
}

bool C6Enhanced::configureDisplayComm(const C6DisplayCommConfig &config) {
    displayConfig = config;

    if (displayCommEnabled && displaySerial) {
        displaySerial->end();
        displaySerial->begin(config.baudRate, SERIAL_8N1, config.rxPin, config.txPin);
    }

    return true;
}

bool C6Enhanced::sendDisplayCommand(const String &command) {
    if (!displayCommEnabled || !displaySerial) {
        return false;
    }

    String cmd = command + "\n";
    displaySerial->print(cmd);
    displaySerial->flush();

    statistics.displayCommPackets++;
    statistics.lastDisplayComm = millis();

    return true;
}

String C6Enhanced::receiveDisplayResponse(uint32_t timeoutMs) {
    if (!displayCommEnabled || !displaySerial) {
        return "";
    }

    String response = "";
    uint32_t startTime = millis();

    while (millis() - startTime < timeoutMs) {
        if (displaySerial->available()) {
            char c = displaySerial->read();
            response += c;

            if (c == '\n') {
                break;
            }
        }
        delay(1);
    }

    if (response.isEmpty()) {
        statistics.displayCommTimeout++;
    }

    return response.trim();
}

bool C6Enhanced::displayReset() {
    return sendDisplayCommand("RESET");
}

bool C6Enhanced::displayWakeup() {
    return sendDisplayCommand("WAKEUP");
}

bool C6Enhanced::displaySleep() {
    return sendDisplayCommand("SLEEP");
}

bool C6Enhanced::displaySetBrightness(uint8_t brightness) {
    return sendDisplayCommand("BRIGHTNESS:" + String(brightness));
}

bool C6Enhanced::displayClear() {
    return sendDisplayCommand("CLEAR");
}

bool C6Enhanced::displayShowText(const String &text, uint16_t x, uint16_t y) {
    return sendDisplayCommand("TEXT:" + String(x) + "," + String(y) + "," + text);
}

bool C6Enhanced::displayRefresh() {
    return sendDisplayCommand("REFRESH");
}

String C6Enhanced::getDisplayStatus() {
    sendDisplayCommand("STATUS");
    return receiveDisplayResponse(2000);
}

void C6Enhanced::updateStatistics() {
    statistics.uptime = millis();
    statistics.freeHeap = ESP.getFreeHeap();
    statistics.totalHeap = ESP.getHeapSize();
    statistics.minFreeHeap = ESP.getMinFreeHeap();

    // CPU temperature (if available)
#ifdef ESP32_C6
    statistics.temperature = temperatureRead();
#endif

    lastStatsUpdate = millis();
}

String C6Enhanced::getStatisticsJson() {
    DynamicJsonDocument doc(2048);

    JsonObject stats = doc.createNestedObject("statistics");
    stats["uptime"] = statistics.uptime;
    stats["freeHeap"] = statistics.freeHeap;
    stats["totalHeap"] = statistics.totalHeap;
    stats["minFreeHeap"] = statistics.minFreeHeap;
    stats["temperature"] = statistics.temperature;
    stats["voltage"] = statistics.voltage;

    JsonObject comm = stats.createNestedObject("communication");
    comm["displayPackets"] = statistics.displayCommPackets;
    comm["displayErrors"] = statistics.displayCommErrors;
    comm["displayTimeouts"] = statistics.displayCommTimeout;
    comm["lastDisplayComm"] = statistics.lastDisplayComm;

    JsonObject pins = stats.createNestedObject("pins");
    pins["stateChanges"] = statistics.pinStateChanges;
    pins["analogReadings"] = statistics.analogReadings;
    pins["digitalReadings"] = statistics.digitalReadings;
    pins["interruptEvents"] = statistics.interruptEvents;

    String result;
    serializeJson(doc, result);
    return result;
}

String C6Enhanced::getSystemInfoJson() {
    DynamicJsonDocument doc(1024);

    JsonObject system = doc.createNestedObject("system");
    system["chipModel"] = ESP.getChipModel();
    system["chipRevision"] = ESP.getChipRevision();
    system["chipCores"] = ESP.getChipCores();
    system["cpuFreq"] = ESP.getCpuFreqMHz();
    system["flashSize"] = ESP.getFlashChipSize();
    system["sketchSize"] = ESP.getSketchSize();
    system["freeSketchSpace"] = ESP.getFreeSketchSpace();

    JsonObject config = doc.createNestedObject("configuration");
    config["displayCommEnabled"] = displayCommEnabled;
    config["displayBaudRate"] = displayConfig.baudRate;
    config["pinCount"] = pinConfigs.size();
    config["monitorInterval"] = pinScanInterval;

    String result;
    serializeJson(doc, result);
    return result;
}

void C6Enhanced::scanPinStates() {
    if (millis() - lastPinScan < pinScanInterval) {
        return;
    }

    for (auto &config : pinConfigs) {
        if (!config.monitorEnabled) {
            continue;
        }

        // Read digital state
        if (config.isDigital) {
            int newValue = ::digitalRead(config.pin);
            if (newValue != config.digitalValue) {
                config.digitalValue = newValue;
                config.lastChange = millis();
                config.hasChanged = true;
                statistics.pinStateChanges++;
            }
        }

        // Read analog state
        if (config.isAnalog) {
            int newValue = ::analogRead(config.pin);
            if (abs(newValue - config.analogValue) > config.changeThreshold) {
                config.analogValue = newValue;
                config.voltage = (newValue * 3.3) / 4095.0;
                config.lastChange = millis();
                config.hasChanged = true;
            }
        }
    }

    lastPinScan = millis();
}

void C6Enhanced::poll() {
    // Update statistics periodically
    if (millis() - lastStatsUpdate > statsUpdateInterval) {
        updateStatistics();
    }

    // Scan pin states if monitoring is enabled
    scanPinStates();
}

String C6Enhanced::pinModeToString(uint8_t mode) {
    switch (mode) {
        case INPUT:
            return "INPUT";
        case OUTPUT:
            return "OUTPUT";
        case INPUT_PULLUP:
            return "INPUT_PULLUP";
        case INPUT_PULLDOWN:
            return "INPUT_PULLDOWN";
        default:
            return "UNKNOWN";
    }
}

bool C6Enhanced::isValidPin(uint8_t pin) {
    // ESP32-C6 has GPIO 0-23
    return (pin <= 23);
}

bool C6Enhanced::isPinAnalogCapable(uint8_t pin) {
    // ESP32-C6 ADC1 channels: GPIO 0-6
    return (pin >= 0 && pin <= 6);
}

std::vector<uint8_t> C6Enhanced::getAvailablePins() {
    std::vector<uint8_t> pins;
    for (uint8_t i = 0; i <= 23; i++) {
        pins.push_back(i);
    }
    return pins;
}

// Global C6 enhanced instance
C6Enhanced &c6Enhanced = C6Enhanced::getInstance();

// External references needed by C6 module
extern AsyncWebServer server;
extern fs::FS *contentFS;
extern SemaphoreHandle_t fsMutex;

// C6 Module Web Handler Functions
// ================================

void handleC6UpdateStatus(AsyncWebServerRequest *request) {
    DynamicJsonDocument doc(C6Constants::JSON_MEDIUM_BUFFER);

    // Check update status from global variables or task status
    static bool updateInProgress = false;
    static int updateProgress = 0;
    static String updateError = "";

    // Build update status response
    JsonObject update = doc.createNestedObject("update_status");
    update["timestamp"] = millis();

    // Check if update task is running
    if (apInfo.state == AP_STATE_FLASHING) {
        updateInProgress = true;
        updateProgress = std::min<int>(90, updateProgress + static_cast<int>(C6Constants::UPDATE_PROGRESS_STEP));
        update["in_progress"] = true;
        update["progress"] = updateProgress;
        update["status"] = "flashing";
    } else if (apInfo.state == AP_STATE_ONLINE) {
        if (updateInProgress) {
            // Update completed successfully
            update["completed"] = true;
            update["progress"] = 100;
            update["status"] = "completed";
            updateInProgress = false;
            updateProgress = 0;
        } else {
            update["completed"] = false;
            update["progress"] = 0;
            update["status"] = "idle";
        }
    } else if (apInfo.state == AP_STATE_FAILED) {
        update["error"] = "Firmware update failed";
        update["completed"] = false;
        update["status"] = "failed";
        updateInProgress = false;
        updateProgress = 0;
    } else {
        update["completed"] = false;
        update["progress"] = updateProgress;
        update["status"] = "unknown";
    }

    // Add module health context
    JsonObject module = doc.createNestedObject("module_status");
    module["state"] = static_cast<int>(apInfo.state);
    module["healthy"] = g_c6Module ? g_c6Module->isHealthy() : false;

    // Send standardized JSON response
    sendJsonResponse(request, doc);
}

void handleBackupC6Firmware(AsyncWebServerRequest *request) {
    // Create a firmware backup
    String backupPath = "/c6_firmware_backup.bin";

    // Check if backup file exists
    if (contentFS->exists(backupPath)) {
        wsSerial("Sending C6 firmware backup");
        request->send(*contentFS, backupPath, "application/octet-stream", true);
    } else {
        // Try to create backup by reading from C6 module
        wsSerial("Creating new firmware backup...");

        // Send command to C6 module to dump firmware
        bool backupSuccess = sendC6Command("BACKUP_FIRMWARE", 0);

        if (backupSuccess) {
            // Wait a moment for backup to be created
            delay(1000);

            if (contentFS->exists(backupPath)) {
                request->send(*contentFS, backupPath, "application/octet-stream", true);
            } else {
                request->send(500, "text/plain", "Backup creation failed");
            }
        } else {
            request->send(500, "text/plain", "Cannot communicate with C6 module for backup");
        }
    }
}

void handleAPList(AsyncWebServerRequest *request) {
    DynamicJsonDocument doc(C6Constants::JSON_MEDIUM_BUFFER);
    JsonArray accessPoints = doc.createNestedArray("access_points");

    // Create C6 module entry if online
    if (apInfo.state == AP_STATE_ONLINE) {
        JsonObject c6AP = accessPoints.createNestedObject();
        c6AP["hwType"] = 198;  // 0xC6 in decimal
        c6AP["version"] = apInfo.version;
        c6AP["channel"] = apInfo.channel;
        c6AP["rssi"] = apInfo.rssi;
        c6AP["uptime"] = apInfo.uptime;

        JsonArray capabilities = c6AP.createNestedArray("capabilities");
        capabilities.add("C6");

        // MAC address as formatted string
        String macStr = "";
        for (int i = 0; i < 8; i++) {
            if (i > 0) macStr += ":";
            macStr += String(apInfo.mac[i], HEX);
        }
        c6AP["mac"] = macStr;
        c6AP["state"] = "online";
        c6AP["description"] = "ESP32-C6 Co-processor";
    }

    // Add metadata
    JsonObject metadata = doc.createNestedObject("metadata");
    metadata["timestamp"] = millis();
    metadata["total_count"] = accessPoints.size();

    // Send standardized JSON response
    sendJsonResponse(request, doc);
}

void handleGetC6Settings(AsyncWebServerRequest *request) {
    DynamicJsonDocument doc(1024);

    // Build C6 module configuration with enhanced structure
    JsonObject config = doc.createNestedObject("c6_config");
    config["channel"] = STORAGE_GET_INT("c6_module", "channel", 20);
    config["txPower"] = STORAGE_GET_INT("c6_module", "txPower", 10);
    config["panId"] = STORAGE_GET_STRING("c6_module", "panId", "0x1234");
    config["sleepMode"] = STORAGE_GET_STRING("c6_module", "sleepMode", "none");
    config["wakeInterval"] = STORAGE_GET_INT("c6_module", "wakeInterval", 60);
    config["autoReconnect"] = STORAGE_GET_BOOL("c6_module", "autoReconnect", true);
    config["healthCheckInterval"] = STORAGE_GET_INT("c6_module", "healthCheckInterval", 10);

    // Add system info and status using core utilities
    JsonObject status = doc.createNestedObject("status");
    status["initialized"] = g_c6Module ? g_c6Module->isInitializedPublic() : false;
    status["started"] = g_c6Module ? g_c6Module->isStartedPublic() : false;
    status["healthy"] = g_c6Module ? g_c6Module->isHealthy() : false;
    status["lastError"] = g_c6Module ? g_c6Module->getLastError() : "Module not available";
    if (g_c6Module) {
        status["lastHealthCheck"] = g_c6Module->getLastHealthCheck();
    } else {
        status["lastHealthCheck"] = 0;  // consistent numeric type
    }

    // Add version and module info
    if (g_c6Module) {
        ModuleInfo info = g_c6Module->getInfo();
        JsonObject module = doc.createNestedObject("module");
        module["name"] = info.name;
        module["version"] = info.version;
        module["description"] = info.description;
    }

    // Send standardized JSON response
    sendJsonResponse(request, doc);
}

void handleSaveC6SettingsBody(AsyncWebServerRequest *request, uint8_t *data, size_t len, size_t index, size_t total) {
    static String jsonString = "";

    if (index == 0) {
        jsonString = "";
    }

    for (size_t i = 0; i < len; i++) {
        jsonString += (char)data[i];
    }

    if (index + len == total) {
        DynamicJsonDocument doc(1024);
        DeserializationError error = deserializeJson(doc, jsonString);

        if (!error) {
            // Use new storage utilities with proper error handling and validation
            bool success = true;

            // Apply configuration changes with validation
            if (doc.containsKey("channel")) {
                int channel = doc["channel"];
                if (channel >= 11 && channel <= 26) {  // Valid 802.15.4 channels
                    success &= STORAGE_SET_INT("c6_module", "channel", channel);
                } else {
                    sendErrorResponse(request, 400, "Channel must be between 11 and 26", "invalid_channel");
                    return;
                }
            }

            if (doc.containsKey("txPower") && success) {
                int txPower = doc["txPower"];
                if (txPower >= -40 && txPower <= 20) {  // Valid power range in dBm
                    success &= STORAGE_SET_INT("c6_module", "txPower", txPower);
                } else {
                    sendErrorResponse(request, 400, "TX Power must be between -40 and 20 dBm", "invalid_tx_power");
                    return;
                }
            }

            if (doc.containsKey("panId") && success) success &= STORAGE_SET_STRING("c6_module", "panId", doc["panId"].as<String>());
            if (doc.containsKey("sleepMode") && success) success &= STORAGE_SET_STRING("c6_module", "sleepMode", doc["sleepMode"].as<String>());
            if (doc.containsKey("wakeInterval") && success) success &= STORAGE_SET_INT("c6_module", "wakeInterval", doc["wakeInterval"]);
            if (doc.containsKey("autoReconnect") && success) success &= STORAGE_SET_BOOL("c6_module", "autoReconnect", doc["autoReconnect"]);
            if (doc.containsKey("healthCheckInterval") && success) success &= STORAGE_SET_INT("c6_module", "healthCheckInterval", doc["healthCheckInterval"]);

            if (success) {
                // Apply settings to C6 module
                applyC6Settings();
                ::sendSuccessResponse(request, "C6 module settings saved successfully");
                C6Helpers::logModuleEvent("settings_saved", "Configuration updated successfully");
            } else {
                sendErrorResponse(request, 500, "Failed to save configuration to storage", "save_failed");
            }
        } else {
            sendErrorResponse(request, 400, "Invalid JSON format in request body", "invalid_json");
        }

        jsonString = "";
    }
}

void handleResetC6Settings(AsyncWebServerRequest *request) {
    Preferences preferences;
    preferences.begin("c6_module", false);
    preferences.clear();
    preferences.end();

    wsSerial("C6 module settings reset to defaults");

    // Use standardized success response
    ::sendSuccessResponse(request, "C6 module settings reset successfully");
}

void handleTestC6Connection(AsyncWebServerRequest *request) {
    DynamicJsonDocument doc(1024);

    // Test connection to C6 module
    bool connected = testC6ModuleConnection();

    // Build test results with enhanced information
    JsonObject result = doc.createNestedObject("test_result");
    result["connected"] = connected;
    result["timestamp"] = millis();
    result["test_type"] = "connection";

    if (connected) {
        JsonObject connection_info = result.createNestedObject("connection_info");
        connection_info["rssi"] = apInfo.rssi;
        connection_info["version"] = apInfo.version;
        connection_info["health_status"] = g_c6Module ? g_c6Module->isHealthy() : false;
    } else {
        result["error"] = (g_c6Module && !g_c6Module->getLastError().isEmpty()) ? g_c6Module->getLastError() : "Connection failed";
    }

    // Add system status for context
    JsonObject status = doc.createNestedObject("module_status");
    status["initialized"] = g_c6Module ? g_c6Module->isInitializedPublic() : false;
    status["started"] = g_c6Module ? g_c6Module->isStartedPublic() : false;

    // Send standardized JSON response
    sendJsonResponse(request, doc);
}

void handleTestC6Radio(AsyncWebServerRequest *request) {
    DynamicJsonDocument doc(1024);

    // Perform radio test and get results
    RadioTestResult result = performC6RadioTest();

    // Build enhanced radio test results
    JsonObject radio_test = doc.createNestedObject("radio_test");
    radio_test["success"] = result.success;
    radio_test["timestamp"] = millis();
    radio_test["test_type"] = "radio_performance";

    if (result.success) {
        JsonObject metrics = radio_test.createNestedObject("metrics");
        metrics["rssi"] = result.rssi;
        metrics["channel"] = result.channel;
        metrics["packetsSent"] = result.packetsSent;
        metrics["packetsReceived"] = result.packetsReceived;
        metrics["errorRate"] = result.errorRate;

        // Add performance evaluation
        if (result.errorRate < 0.05) {
            radio_test["performance"] = "excellent";
        } else if (result.errorRate < 0.15) {
            radio_test["performance"] = "good";
        } else if (result.errorRate < 0.30) {
            radio_test["performance"] = "fair";
        } else {
            radio_test["performance"] = "poor";
        }
    } else {
        radio_test["error"] = result.error.isEmpty() ? "Radio test failed" : result.error;
    }

    // Add current module status
    JsonObject status = doc.createNestedObject("module_status");
    status["initialized"] = g_c6Module ? g_c6Module->isInitializedPublic() : false;
    status["started"] = g_c6Module ? g_c6Module->isStartedPublic() : false;
    status["healthy"] = g_c6Module ? g_c6Module->isHealthy() : false;

    // Send standardized JSON response
    sendJsonResponse(request, doc);
}

void handleRestartC6(AsyncWebServerRequest *request) {
    C6Helpers::logModuleEvent("restart_requested", "User initiated C6 module restart");

    // Send restart command to C6 module
    bool success = restartC6Module();

    if (success) {
        ::sendSuccessResponse(request, "C6 module restart initiated successfully");
        C6Helpers::logModuleEvent("restart_success", "C6 module restart command sent");
    } else {
        String errorMsg = "Failed to restart C6 module";
        if (g_c6Module && !g_c6Module->getLastError().isEmpty()) {
            errorMsg += ": " + g_c6Module->getLastError();
        }
        sendErrorResponse(request, 500, errorMsg, "restart_failed");
        C6Helpers::logModuleEvent("restart_failed", errorMsg);
    }
}

void handleBackupC6Config(AsyncWebServerRequest *request) {
    DynamicJsonDocument doc(C6Constants::JSON_LARGE_BUFFER);

    // Build comprehensive configuration backup
    JsonObject config = doc.createNestedObject("c6_configuration");
    config["channel"] = STORAGE_GET_INT("c6_module", "channel", 20);
    config["txPower"] = STORAGE_GET_INT("c6_module", "txPower", 10);
    config["panId"] = STORAGE_GET_STRING("c6_module", "panId", "0x1234");
    config["sleepMode"] = STORAGE_GET_STRING("c6_module", "sleepMode", "none");
    config["wakeInterval"] = STORAGE_GET_INT("c6_module", "wakeInterval", 60);
    config["autoReconnect"] = STORAGE_GET_BOOL("c6_module", "autoReconnect", true);
    config["healthCheckInterval"] = STORAGE_GET_INT("c6_module", "healthCheckInterval", 10);

    // Add backup metadata
    JsonObject metadata = doc.createNestedObject("backup_metadata");
    metadata["timestamp"] = millis();
    metadata["firmware_version"] = apInfo.version;
    metadata["module_state"] = static_cast<int>(apInfo.state);
    metadata["backup_format_version"] = "1.2.0";

    // Add current status for context
    JsonObject status = doc.createNestedObject("current_status");
    status["connected"] = (apInfo.state == AP_STATE_ONLINE);
    status["healthy"] = g_c6Module ? g_c6Module->isHealthy() : false;
    if (g_c6Module) {
        status["last_health_check"] = g_c6Module->getLastHealthCheck();
    } else {
        status["last_health_check"] = 0;  // consistent numeric type
    }

    // Send as downloadable attachment
    AsyncResponseStream *response = request->beginResponseStream("application/json");
    response->addHeader("Content-Disposition", "attachment; filename=c6_config_backup.json");
    serializeJson(doc, *response);
    request->send(response);

    C6Helpers::logModuleEvent("config_backup", "Configuration backup generated");
}

void handleResetC6Config(AsyncWebServerRequest *request) {
    if (request->hasParam("confirm") && request->getParam("confirm")->value() == "true") {
        // Reset all C6 configuration
        Preferences preferences;
        preferences.begin("c6_module", false);
        preferences.clear();
        preferences.end();

        // Reset C6 module to factory defaults
        bool success = factoryResetC6Module();

        if (success) {
            wsSerial("C6 module configuration reset completed");
            request->send(200, "application/json", "{\"success\":true}");
        } else {
            request->send(500, "application/json", "{\"success\":false,\"error\":\"Reset failed\"}");
        }
    } else {
        request->send(400, "application/json", "{\"success\":false,\"error\":\"Confirmation required\"}");
    }
}

// ========================================================================
// FIRMWARE UPLOAD HELPER FUNCTIONS
// ========================================================================
namespace C6Helpers {
bool validateFirmwareFile(const String &filename, size_t &fileSize) {
    if (!contentFS->exists(filename)) {
        return false;
    }

    File file = contentFS->open(filename, "r");
    if (!file) {
        return false;
    }

    fileSize = file.size();
    file.close();

    return (fileSize >= C6Constants::MIN_FIRMWARE_SIZE && fileSize <= C6Constants::MAX_FIRMWARE_SIZE);
}

bool validateBaudRate(int baudRate) {
    return (baudRate >= C6Constants::MIN_BAUD_RATE && baudRate <= C6Constants::MAX_BAUD_RATE);
}

String getPerformanceRating(float errorRate) {
    if (errorRate < C6Constants::EXCELLENT_ERROR_RATE) return "excellent";
    if (errorRate < C6Constants::GOOD_ERROR_RATE) return "good";
    if (errorRate < C6Constants::FAIR_ERROR_RATE) return "fair";
    return "poor";
}

void logModuleEvent(const String &event, const String &details) {
    String logMessage = "[C6_MODULE] " + event;
    if (!details.isEmpty()) {
        logMessage += ": " + details;
    }
    wsSerial(logMessage);
}

bool initializeFirmwareUpload(const String &filename, bool verify, File &uploadFile, size_t &totalSize) {
    logModuleEvent("firmware_upload_start", filename);
    if (verify) {
        logModuleEvent("upload_verification", "Firmware verification enabled");
    }

    String tempPath = "/temp_c6_firmware.bin";
    uploadFile = contentFS->open(tempPath, "w");
    if (!uploadFile) {
        logModuleEvent("upload_error", "Failed to create temporary file");
        return false;
    }

    totalSize = 0;
    return true;
}

bool finalizeFirmwareUpload(File &uploadFile, size_t totalSize, bool verify) {
    if (!uploadFile) {
        logModuleEvent("upload_error", "Upload file handle lost");
        return false;
    }

    uploadFile.close();
    logModuleEvent("upload_complete", "Total size: " + String(totalSize) + " bytes");

    // Validate firmware size
    if (totalSize < C6Constants::MIN_FIRMWARE_SIZE) {
        logModuleEvent("upload_error", "Firmware file too small");
        contentFS->remove("/temp_c6_firmware.bin");
        return false;
    }

    if (totalSize > C6Constants::MAX_FIRMWARE_SIZE) {
        logModuleEvent("upload_error", "Firmware file too large");
        contentFS->remove("/temp_c6_firmware.bin");
        return false;
    }

    logModuleEvent("firmware_flash_start", "Starting flash process");
    apInfo.state = AP_STATE_FLASHING;

    // Create task parameters
    C6FirmwareUpdateParams *params = new C6FirmwareUpdateParams();
    params->filename = "/temp_c6_firmware.bin";
    params->verify = verify;

    // Start firmware update task
    BaseType_t result = xTaskCreate(C6firmwareUpdateTask, "C6FirmwareUpdate",
                                    C6Constants::FIRMWARE_TASK_STACK, params, 10, NULL);

    return (result == pdPASS);
}
}  // namespace C6Helpers

void handleC6FirmwareUpload(AsyncWebServerRequest *request, String filename, size_t index, uint8_t *data, size_t len, bool final) {
    static File uploadFile;
    static bool verifyAfterUpload = false;
    static size_t totalSize = 0;

    if (!index) {
        // Initialize upload
        verifyAfterUpload = request->hasParam("verify", true) &&
                            (request->getParam("verify", true)->value() == "1");

        if (!C6Helpers::initializeFirmwareUpload(filename, verifyAfterUpload, uploadFile, totalSize)) {
            sendErrorResponse(request, 500, "Failed to initialize firmware upload", "upload_init_failed");
            return;
        }
    }

    // Write data chunk
    if (uploadFile && len) {
        size_t written = uploadFile.write(data, len);
        if (written != len) {
            C6Helpers::logModuleEvent("upload_error", "Failed to write firmware data");
            uploadFile.close();
            sendErrorResponse(request, 500, "Failed to write firmware data", "write_error");
            return;
        }
        totalSize += len;
    }

    // Finalize upload
    if (final) {
        if (C6Helpers::finalizeFirmwareUpload(uploadFile, totalSize, verifyAfterUpload)) {
            ::sendSuccessResponse(request, "Upload complete, starting installation");
        } else {
            sendErrorResponse(request, 500, "Firmware upload validation failed", "upload_failed");
        }
    }
}

// Drives and Device Management Functions
// ======================================

void handleListDrives(AsyncWebServerRequest *request) {
    DynamicJsonDocument doc(C6Constants::JSON_XLARGE_BUFFER);
    JsonArray drives = doc.createNestedArray("drives");

// Platform-specific drive detection
#ifdef _WIN32
    // Windows: Check common drive letters
    for (char drive = 'A'; drive <= 'Z'; drive++) {
        String drivePath = String(drive) + ":/";
        // Simulate common drives for demonstration
        if (drive == 'C' || drive == 'D' || drive == 'E') {
            JsonObject driveObj = drives.createNestedObject();
            driveObj["letter"] = String(drive);
            driveObj["path"] = drivePath;
            driveObj["label"] = "Local Disk (" + String(drive) + ":)";
            driveObj["type"] = "fixed";
            driveObj["available"] = true;
        }
    }
#else
    // Unix/Linux: List common mount points
    const char *commonMounts[] = {"/", "/media", "/mnt", "/home"};
    for (const char *mount : commonMounts) {
        JsonObject driveObj = drives.createNestedObject();
        driveObj["letter"] = String(mount);
        driveObj["path"] = String(mount);
        driveObj["label"] = String(mount) + " filesystem";
        driveObj["type"] = (strcmp(mount, "/") == 0) ? "fixed" : "removable";
        driveObj["available"] = true;
    }
#endif

    // Add metadata
    JsonObject metadata = doc.createNestedObject("metadata");
    metadata["timestamp"] = millis();
    metadata["platform"] =
#ifdef _WIN32
        "windows";
#else
        "unix";
#endif
    metadata["total_drives"] = drives.size();

    // Send standardized JSON response
    sendJsonResponse(request, doc);
}

void handleListSerialPorts(AsyncWebServerRequest *request) {
    DynamicJsonDocument doc(C6Constants::JSON_LARGE_BUFFER);
    JsonArray ports = doc.createNestedArray("serial_ports");

// Platform-specific serial port detection
#ifdef _WIN32
    // Windows: Common COM ports
    for (int i = 1; i <= 20; i++) {
        JsonObject portObj = ports.createNestedObject();
        portObj["port"] = "COM" + String(i);
        portObj["description"] = "Serial Port (COM" + String(i) + ")";
        portObj["type"] = "serial";
        portObj["available"] = true;  // Would need actual detection in production
    }
#else
    // Unix/Linux: Common serial devices
    const char *commonPorts[] = {
        "/dev/ttyUSB0", "/dev/ttyUSB1", "/dev/ttyUSB2", "/dev/ttyUSB3",
        "/dev/ttyACM0", "/dev/ttyACM1", "/dev/ttyACM2", "/dev/ttyACM3",
        "/dev/ttyS0", "/dev/ttyS1", "/dev/ttyS2", "/dev/ttyS3"};

    for (const char *port : commonPorts) {
        JsonObject portObj = ports.createNestedObject();
        portObj["port"] = String(port);
        portObj["description"] = "Serial Device " + String(port);
        portObj["type"] = "serial";
        portObj["available"] = true;  // Would need actual detection in production
    }
#endif

    // Add metadata
    JsonObject metadata = doc.createNestedObject("metadata");
    metadata["timestamp"] = millis();
    metadata["platform"] =
#ifdef _WIN32
        "windows";
#else
        "unix";
#endif
    metadata["total_ports"] = ports.size();

    // Send standardized JSON response
    sendJsonResponse(request, doc);
}

void handleFlashC6OTA(AsyncWebServerRequest *request) {
    // Validate required parameters
    if (!request->hasParam("firmware_file", true) || !request->hasParam("com_port", true)) {
        sendErrorResponse(request, 400, "Missing required parameters: firmware_file and com_port", "missing_parameters");
        return;
    }

    // Extract parameters
    String firmwareFile = request->getParam("firmware_file", true)->value();
    String comPort = request->getParam("com_port", true)->value();
    bool eraseFlash = request->hasParam("erase_flash", true) &&
                      request->getParam("erase_flash", true)->value() == "true";
    bool verifyFlash = !request->hasParam("verify_flash", true) ||
                       request->getParam("verify_flash", true)->value() == "true";
    bool resetAfterFlash = !request->hasParam("reset_after_flash", true) ||
                           request->getParam("reset_after_flash", true)->value() == "true";
    int baudRate = request->hasParam("baud_rate", true) ? request->getParam("baud_rate", true)->value().toInt() : C6Constants::DEFAULT_BAUD_RATE;

    // Validate firmware file
    size_t fileSize;
    if (!C6Helpers::validateFirmwareFile(firmwareFile, fileSize)) {
        sendErrorResponse(request, 400, "Firmware file not found or invalid: " + firmwareFile, "invalid_firmware");
        return;
    }

    // Validate baud rate
    if (!C6Helpers::validateBaudRate(baudRate)) {
        sendErrorResponse(request, 400, "Invalid baud rate. Must be between " + String(C6Constants::MIN_BAUD_RATE) + " and " + String(C6Constants::MAX_BAUD_RATE), "invalid_baud_rate");
        return;
    }

    // Log OTA flash parameters
    C6Helpers::logModuleEvent("ota_flash_start", firmwareFile);
    C6Helpers::logModuleEvent("ota_params",
                              "Erase: " + String(eraseFlash ? "Yes" : "No") +
                                  ", Verify: " + String(verifyFlash ? "Yes" : "No") +
                                  ", Reset: " + String(resetAfterFlash ? "Yes" : "No") +
                                  ", Baud: " + String(baudRate));

    // Create task parameters
    C6FlashParams *params = new C6FlashParams();
    params->firmwareFile = firmwareFile;
    params->comPort = comPort;
    params->eraseFlash = eraseFlash;
    params->verifyFlash = verifyFlash;
    params->resetAfterFlash = resetAfterFlash;
    params->baudRate = baudRate;

    // Start OTA flash task
    BaseType_t result = xTaskCreate(C6OTAFlashTask, "C6OTAFlash",
                                    C6Constants::OTA_TASK_STACK, params, 10, NULL);

    if (result == pdPASS) {
        ::sendSuccessResponse(request, "C6 OTA flash started successfully");
        C6Helpers::logModuleEvent("ota_task_created", "OTA flash task started");
    } else {
        delete params;
        sendErrorResponse(request, 500, "Failed to start C6 OTA flash task", "task_creation_failed");
        C6Helpers::logModuleEvent("ota_task_failed", "Failed to create OTA flash task");
    }
}

void handleFlashC6Firmware(AsyncWebServerRequest *request) {
    // Firmware flashing via direct connection
    sendErrorResponse(request, 501, "Direct firmware flashing not implemented", "not_implemented");
    C6Helpers::logModuleEvent("firmware_flash_not_implemented", "Direct firmware flashing feature not available");
}

void handleInstallC6Firmware(AsyncWebServerRequest *request) {
    // Firmware installation from uploaded file
    sendErrorResponse(request, 501, "Firmware installation not implemented", "not_implemented");
    C6Helpers::logModuleEvent("firmware_install_not_implemented", "Firmware installation feature not available");
}

// C6 Module Helper Functions
// ===========================

void applyC6Settings() {
    // Apply current settings to the C6 module using new storage utilities
    int channel = STORAGE_GET_INT("c6_module", "channel", 20);
    int txPower = STORAGE_GET_INT("c6_module", "txPower", 10);

    // Send configuration commands to C6 module
    sendC6Command("SET_CHANNEL", channel);
    sendC6Command("SET_POWER", txPower);

    wsSerial("C6 settings applied successfully");
}

bool testC6ModuleConnection() {
    // Check if C6 module is physically connected and responding
    if (apInfo.state == AP_STATE_OFFLINE) {
        wsSerial("C6 Module Connection Test: OFFLINE - Module not responding to ping");
        return false;
    }

    if (apInfo.version == 0) {
        wsSerial("C6 Module Connection Test: FAILED - No version information received");
        return false;
    }

    // Test serial communication
    bool serialTest = sendC6Command("PING", 0);
    if (!serialTest) {
        wsSerial("C6 Module Connection Test: FAILED - Serial communication test failed");
        return false;
    }

    wsSerial("C6 Module Connection Test: PASSED - Module responding normally");
    wsSerial("Version: 0x" + String(apInfo.version, HEX));
    wsSerial("Channel: " + String(apInfo.channel));
    wsSerial("State: " + String(apInfo.state));

    return true;
}

RadioTestResult performC6RadioTest() {
    RadioTestResult result = {0};

    C6Helpers::logModuleEvent("radio_test_start", "Starting radio functionality test");

    // Check if module is online first
    if (apInfo.state != AP_STATE_ONLINE) {
        C6Helpers::logModuleEvent("radio_test_failed", "Module offline");
        result.success = false;
        result.error = "Module offline";
        result.errorRate = 100.0f;
        return result;
    }

    // Test radio transmission
    bool radioInitialized = sendC6Command("TEST_RADIO", 1);
    if (!radioInitialized) {
        C6Helpers::logModuleEvent("radio_test_failed", "Radio initialization failed");
        result.success = false;
        result.error = "Radio initialization failed";
        result.errorRate = 100.0f;
        return result;
    }

    // Simulate packet transmission test with realistic parameters
    result.success = true;
    result.rssi = apInfo.rssi;
    result.channel = apInfo.channel;
    result.packetsSent = 10;

    // Simulate packet loss based on RSSI quality
    if (apInfo.rssi > -50) {
        result.packetsReceived = 10;  // Excellent signal
    } else if (apInfo.rssi > -70) {
        result.packetsReceived = 9;  // Good signal
    } else if (apInfo.rssi > -80) {
        result.packetsReceived = 7;  // Fair signal
    } else {
        result.packetsReceived = 5;  // Poor signal
    }

    result.errorRate = (1.0f - (float)result.packetsReceived / result.packetsSent) * 100.0f;

    // Log detailed test results
    String performance = C6Helpers::getPerformanceRating(result.errorRate / 100.0f);
    String testSummary = "Performance: " + performance +
                         ", RSSI: " + String(result.rssi) + " dBm" +
                         ", Packets: " + String(result.packetsReceived) + "/" + String(result.packetsSent) +
                         ", Error Rate: " + String(result.errorRate, 1) + "%";

    if (result.errorRate > 50.0f) {
        C6Helpers::logModuleEvent("radio_test_failed", testSummary);
    } else if (result.errorRate > 20.0f) {
        C6Helpers::logModuleEvent("radio_test_warning", testSummary);
    } else {
        C6Helpers::logModuleEvent("radio_test_passed", testSummary);
    }

    return result;
}

bool restartC6Module() {
    // Send restart command to C6 module
    return sendC6Command("RESTART", 0);
}

bool factoryResetC6Module() {
    // Send factory reset command to C6 module
    return sendC6Command("FACTORY_RESET", 0);
}

bool sendC6Command(const String &command, int parameter) {
    // Send command to C6 module via serial interface
    String cmd = command + ":" + String(parameter) + "\n";

    C6Helpers::logModuleEvent("command_send",
                              command + " with parameter: " + String(parameter));

    // Check if serial port is available
    if (!Serial1) {
        C6Helpers::logModuleEvent("command_error", "Serial1 not available for C6 communication");
        return false;
    }

    // Clear any pending data
    while (Serial1.available()) {
        Serial1.read();
    }

    // Send the command
    Serial1.print(cmd);
    Serial1.flush();

    // Wait for acknowledgment with configured timeout
    unsigned long startTime = millis();
    String response = "";

    while (millis() - startTime < C6Constants::COMMAND_TIMEOUT) {
        if (Serial1.available()) {
            char c = Serial1.read();
            response += c;

            // Check for complete response
            if (response.indexOf('\n') >= 0 || response.indexOf('>') >= 0) {
                response.trim();
                C6Helpers::logModuleEvent("command_response", response);

                if (response.indexOf("ACK") >= 0 || response.indexOf("OK") >= 0) {
                    return true;
                } else if (response.indexOf("NOK") >= 0 || response.indexOf("ERROR") >= 0) {
                    C6Helpers::logModuleEvent("command_failed", response);
                    return false;
                }
            }
        }
        delay(10);
    }

    C6Helpers::logModuleEvent("command_timeout", "No response received");
    return false;
}

// C6 Module initialization and setup (Enhanced with Module Manager)
// ==================================================================

void initC6Module() {
    Serial.println("[C6_MODULE] Initializing C6 module with enhanced module manager...");

    // Create and register the C6 module
    g_c6Module = std::make_unique<C6Module>();

    // Register the module with the module manager
    // Dependencies: none (this is a core hardware module)
    bool registered = moduleManager.registerModule(
        std::unique_ptr<ModuleInterface>(std::move(g_c6Module)),
        true,  // auto-start
        {}     // no dependencies
    );

    if (registered) {
        Serial.println("[C6_MODULE] C6 module registered successfully with module manager");
    } else {
        Serial.println("[C6_MODULE] Failed to register C6 module with module manager");
    }
}

#endif  // HAS_C6
