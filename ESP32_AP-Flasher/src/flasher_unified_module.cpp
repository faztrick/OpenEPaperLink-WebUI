/**
 * @file flasher_unified_module.cpp
 * @brief Implementation of Unified Flasher Module
 *
 * Consolidates flasher.cpp, espflasher.cpp, webflasher.h, and usbflasher.h
 */

#include "flasher_unified_module.h"

#include <LittleFS.h>
#include <MD5Builder.h>
#include <WiFi.h>

#include "esp32_port.h"
#include "leds.h"
#include "makeimage.h"
#include "settings.h"
#include "storage.h"
#include "tag_db.h"
#include "util.h"

using namespace Framework;

// ============================================================================
// FlashResult Implementation
// ============================================================================

String FlashResult::toJson() const {
    DynamicJsonDocument doc(Framework::JSON_MEDIUM_BUFFER);

    doc["success"] = success;
    doc["errorMessage"] = errorMessage;
    doc["bytesFlashed"] = bytesFlashed;
    doc["flashTime"] = flashTime;
    doc["targetMAC"] = targetMAC;
    doc["firmwareMD5"] = firmwareMD5;
    doc["tagType"] = tagType;

    String result;
    serializeJson(doc, result);
    return result;
}

bool FlashResult::fromJson(const String& json) {
    DynamicJsonDocument doc(Framework::JSON_MEDIUM_BUFFER);
    if (deserializeJson(doc, json) != DeserializationError::Ok) {
        return false;
    }

    success = doc["success"] | success;
    errorMessage = doc["errorMessage"] | errorMessage;
    bytesFlashed = doc["bytesFlashed"] | bytesFlashed;
    flashTime = doc["flashTime"] | flashTime;
    targetMAC = doc["targetMAC"] | targetMAC;
    firmwareMD5 = doc["firmwareMD5"] | firmwareMD5;
    tagType = doc["tagType"] | tagType;

    return true;
}

// ============================================================================
// FlashConfig Implementation
// ============================================================================

String FlashConfig::toJson() const {
    DynamicJsonDocument doc(Framework::JSON_MEDIUM_BUFFER);

    doc["targetType"] = static_cast<int>(targetType);
    doc["port"] = static_cast<int>(port);
    doc["firmwareFile"] = firmwareFile;
    doc["address"] = address;
    doc["includeInfoBlock"] = includeInfoBlock;
    doc["verifyAfterFlash"] = verifyAfterFlash;
    doc["autoDetectTag"] = autoDetectTag;
    doc["timeout"] = timeout;
    doc["baudRate"] = baudRate;
    doc["targetMAC"] = targetMAC;

    String result;
    serializeJson(doc, result);
    return result;
}

bool FlashConfig::fromJson(const String& json) {
    DynamicJsonDocument doc(Framework::JSON_MEDIUM_BUFFER);
    if (deserializeJson(doc, json) != DeserializationError::Ok) {
        return false;
    }

    targetType = static_cast<FlashTargetType>(doc["targetType"].as<int>());
    port = static_cast<FlashPort>(doc["port"].as<int>());
    firmwareFile = doc["firmwareFile"] | firmwareFile;
    address = doc["address"] | address;
    includeInfoBlock = doc["includeInfoBlock"] | includeInfoBlock;
    verifyAfterFlash = doc["verifyAfterFlash"] | verifyAfterFlash;
    autoDetectTag = doc["autoDetectTag"] | autoDetectTag;
    timeout = doc["timeout"] | timeout;
    baudRate = doc["baudRate"] | baudRate;
    targetMAC = doc["targetMAC"] | targetMAC;

    return validate();
}

bool FlashConfig::validate() const {
    if (firmwareFile.isEmpty() && targetType != FlashTargetType::INFO_BLOCK) {
        return false;
    }
    if (timeout < 5000 || timeout > 300000) return false;
    if (baudRate < 9600 || baudRate > 2000000) return false;
    return true;
}

// ============================================================================
// PortConfig Implementation
// ============================================================================

bool PortConfig::isValid() const {
    return (ss_pin >= 0 && clk_pin >= 0 && mosi_pin >= 0 && miso_pin >= 0 && reset_pin >= 0);
}

String PortConfig::toJson() const {
    DynamicJsonDocument doc(Framework::JSON_MEDIUM_BUFFER);

    doc["ss_pin"] = ss_pin;
    doc["clk_pin"] = clk_pin;
    doc["mosi_pin"] = mosi_pin;
    doc["miso_pin"] = miso_pin;
    doc["reset_pin"] = reset_pin;
    doc["rxd_pin"] = rxd_pin;
    doc["txd_pin"] = txd_pin;
    doc["test_pin"] = test_pin;
    doc["speed"] = speed;

    JsonArray powerArray = doc.createNestedArray("power_pins");
    for (int8_t pin : power_pins) {
        powerArray.add(pin);
    }

    String result;
    serializeJson(doc, result);
    return result;
}

bool PortConfig::fromJson(const String& json) {
    DynamicJsonDocument doc(Framework::JSON_MEDIUM_BUFFER);
    if (deserializeJson(doc, json) != DeserializationError::Ok) {
        return false;
    }

    ss_pin = doc["ss_pin"] | ss_pin;
    clk_pin = doc["clk_pin"] | clk_pin;
    mosi_pin = doc["mosi_pin"] | mosi_pin;
    miso_pin = doc["miso_pin"] | miso_pin;
    reset_pin = doc["reset_pin"] | reset_pin;
    rxd_pin = doc["rxd_pin"] | rxd_pin;
    txd_pin = doc["txd_pin"] | txd_pin;
    test_pin = doc["test_pin"] | test_pin;
    speed = doc["speed"] | speed;

    power_pins.clear();
    if (doc.containsKey("power_pins")) {
        JsonArray powerArray = doc["power_pins"];
        for (JsonVariant pin : powerArray) {
            power_pins.push_back(pin.as<int8_t>());
        }
    }

    return isValid();
}

// ============================================================================
// FlasherStats Implementation
// ============================================================================

void FlasherStats::reset() {
    totalFlashes = 0;
    successfulFlashes = 0;
    failedFlashes = 0;
    totalBytesFlashed = 0;
    averageFlashTime = 0;
    lastFlashTime = 0;
    flashCountByType.clear();
}

void FlasherStats::updateStats(const FlashResult& result) {
    totalFlashes++;
    if (result.success) {
        successfulFlashes++;
    } else {
        failedFlashes++;
    }

    totalBytesFlashed += result.bytesFlashed;

    // Update average flash time
    if (result.flashTime > 0) {
        averageFlashTime = (averageFlashTime * (totalFlashes - 1) + result.flashTime) / totalFlashes;
        lastFlashTime = result.flashTime;
    }

    // Update flash count by type
    String typeKey = "tag_type_" + String(result.tagType);
    flashCountByType[typeKey]++;
}

String FlasherStats::toJson() const {
    DynamicJsonDocument doc(Framework::JSON_MEDIUM_BUFFER);

    doc["totalFlashes"] = totalFlashes;
    doc["successfulFlashes"] = successfulFlashes;
    doc["failedFlashes"] = failedFlashes;
    doc["successRate"] = getSuccessRate();
    doc["totalBytesFlashed"] = totalBytesFlashed;
    doc["averageFlashTime"] = averageFlashTime;
    doc["lastFlashTime"] = lastFlashTime;

    JsonObject typeCountObj = doc.createNestedObject("flashCountByType");
    for (const auto& pair : flashCountByType) {
        typeCountObj[pair.first] = pair.second;
    }

    String result;
    serializeJson(doc, result);
    return result;
}

double FlasherStats::getSuccessRate() const {
    return totalFlashes > 0 ? (double(successfulFlashes) / double(totalFlashes)) * 100.0 : 0.0;
}

// ============================================================================
// FlasherModuleConfig Implementation
// ============================================================================

bool FlasherModuleConfig::validate() const {
    if (defaultTimeout < 5000 || defaultTimeout > 300000) return false;
    if (maxConcurrentFlashes < 1 || maxConcurrentFlashes > 10) return false;
    if (esp32BaudRate < 9600 || esp32BaudRate > 2000000) return false;
    return true;
}

String FlasherModuleConfig::toJson() const {
    DynamicJsonDocument doc(Framework::JSON_LARGE_BUFFER);

    // General settings
    doc["enableAutoFlash"] = enableAutoFlash;
    doc["enableWebFlasher"] = enableWebFlasher;
    doc["enableUSBFlasher"] = enableUSBFlasher;
    doc["defaultTimeout"] = defaultTimeout;
    doc["maxConcurrentFlashes"] = maxConcurrentFlashes;

    // Port configurations
    doc["apPort"] = serialized(apPort.toJson());
    doc["extPort"] = serialized(extPort.toJson());
    doc["altPort"] = serialized(altPort.toJson());
    doc["usbPort"] = serialized(usbPort.toJson());

    // ESP32 settings
    doc["esp32BaudRate"] = esp32BaudRate;
    doc["esp32HigherBaudRate"] = esp32HigherBaudRate;
    doc["esp32AutoChangeBaud"] = esp32AutoChangeBaud;

    // Tag settings
    doc["autoDetectTagType"] = autoDetectTagType;
    doc["includeInfoBlockByDefault"] = includeInfoBlockByDefault;
    doc["verifyAfterFlash"] = verifyAfterFlash;
    doc["backupBeforeFlash"] = backupBeforeFlash;

    // Web settings
    doc["enableWebSocketFlasher"] = enableWebSocketFlasher;
    doc["enableRESTAPI"] = enableRESTAPI;
    doc["webSocketPort"] = webSocketPort;

    String result;
    serializeJson(doc, result);
    return result;
}

bool FlasherModuleConfig::fromJson(const String& json) {
    DynamicJsonDocument doc(Framework::JSON_LARGE_BUFFER);
    if (deserializeJson(doc, json) != DeserializationError::Ok) {
        return false;
    }

    // General settings
    enableAutoFlash = doc["enableAutoFlash"] | enableAutoFlash;
    enableWebFlasher = doc["enableWebFlasher"] | enableWebFlasher;
    enableUSBFlasher = doc["enableUSBFlasher"] | enableUSBFlasher;
    defaultTimeout = doc["defaultTimeout"] | defaultTimeout;
    maxConcurrentFlashes = doc["maxConcurrentFlashes"] | maxConcurrentFlashes;

    // Port configurations
    if (doc.containsKey("apPort")) {
        apPort.fromJson(doc["apPort"]);
    }
    if (doc.containsKey("extPort")) {
        extPort.fromJson(doc["extPort"]);
    }
    if (doc.containsKey("altPort")) {
        altPort.fromJson(doc["altPort"]);
    }
    if (doc.containsKey("usbPort")) {
        usbPort.fromJson(doc["usbPort"]);
    }

    // ESP32 settings
    esp32BaudRate = doc["esp32BaudRate"] | esp32BaudRate;
    esp32HigherBaudRate = doc["esp32HigherBaudRate"] | esp32HigherBaudRate;
    esp32AutoChangeBaud = doc["esp32AutoChangeBaud"] | esp32AutoChangeBaud;

    // Tag settings
    autoDetectTagType = doc["autoDetectTagType"] | autoDetectTagType;
    includeInfoBlockByDefault = doc["includeInfoBlockByDefault"] | includeInfoBlockByDefault;
    verifyAfterFlash = doc["verifyAfterFlash"] | verifyAfterFlash;
    backupBeforeFlash = doc["backupBeforeFlash"] | backupBeforeFlash;

    // Web settings
    enableWebSocketFlasher = doc["enableWebSocketFlasher"] | enableWebSocketFlasher;
    enableRESTAPI = doc["enableRESTAPI"] | enableRESTAPI;
    webSocketPort = doc["webSocketPort"] | webSocketPort;

    return validate();
}

// ============================================================================
// FlashSession Implementation
// ============================================================================

FlashSession::FlashSession(const String& id, const FlashConfig& cfg)
    : sessionId(id), config(cfg) {
}

void FlashSession::start() {
    startTime = millis();
    active = true;
}

void FlashSession::complete(const FlashResult& res) {
    result = res;
    endTime = millis();
    active = false;
}

void FlashSession::fail(const String& error) {
    result.success = false;
    result.errorMessage = error;
    endTime = millis();
    active = false;
}

bool FlashSession::isExpired(uint32_t timeoutMs) const {
    if (!active) return false;
    return (millis() - startTime) > timeoutMs;
}

String FlashSession::getProgress() const {
    if (!active) {
        return result.success ? "Completed" : "Failed";
    }

    uint32_t elapsed = millis() - startTime;
    return "Running (" + String(elapsed / 1000) + "s)";
}

String FlashSession::toJson() const {
    DynamicJsonDocument doc(Framework::JSON_MEDIUM_BUFFER);

    doc["sessionId"] = sessionId;
    doc["active"] = active;
    doc["startTime"] = startTime;
    doc["endTime"] = endTime;
    doc["transport"] = static_cast<int>(transport);
    doc["progress"] = getProgress();
    doc["config"] = serialized(config.toJson());
    doc["result"] = serialized(result.toJson());

    String output;
    serializeJson(doc, output);
    return output;
}

// ============================================================================
// FlasherLogger Implementation
// ============================================================================

FlasherLogger::FlasherLogger() {
    _logMutex = xSemaphoreCreateMutex();
    _logHistory.reserve(_maxHistoryLines);
}

void FlasherLogger::log(const String& message, const String& level) {
    String timestamp = String(millis());
    String logEntry = "[" + timestamp + "] [" + level + "] " + message;

    addToHistory(logEntry);

    // Send to serial
    Serial.println(logEntry);

    // Send to WebSocket if enabled
    if (_webSocketLogging) {
        sendToWebSocket(logEntry);
    }
}

void FlasherLogger::logDebug(const String& message) {
    if (_logLevel == "DEBUG") {
        log(message, "DEBUG");
    }
}

void FlasherLogger::logInfo(const String& message) {
    log(message, "INFO");
}

void FlasherLogger::logWarning(const String& message) {
    log(message, "WARN");
}

void FlasherLogger::logError(const String& message) {
    log(message, "ERROR");
}

void FlasherLogger::addToHistory(const String& entry) {
    if (xSemaphoreTake(_logMutex, pdMS_TO_TICKS(100)) == pdTRUE) {
        _logHistory.push_back(entry);

        if (_logHistory.size() > _maxHistoryLines) {
            _logHistory.erase(_logHistory.begin());
        }

        xSemaphoreGive(_logMutex);
    }
}

String FlasherLogger::getLogHistory(uint32_t maxLines) const {
    String history;

    if (xSemaphoreTake(_logMutex, pdMS_TO_TICKS(100)) == pdTRUE) {
        uint32_t startIndex = (_logHistory.size() > maxLines) ? _logHistory.size() - maxLines : 0;

        for (uint32_t i = startIndex; i < _logHistory.size(); i++) {
            history += _logHistory[i] + "\n";
        }

        xSemaphoreGive(_logMutex);
    }

    return history;
}

void FlasherLogger::sendToWebSocket(const String& message) {
    // This would be implemented to send to WebSocket clients
    // For now, just a placeholder
}

// ============================================================================
// FlasherUnifiedModule Implementation
// ============================================================================

FlasherUnifiedModule::FlasherUnifiedModule()
    : EnhancedModuleBase("FlasherUnified", "1.0.0", "Unified Tag and ESP32 Flasher", ModuleType::HARDWARE) {
    // Set module capabilities
    _capabilities.supportsConfiguration = true;
    _capabilities.supportsRemoteControl = true;
    _capabilities.supportsStatusReporting = true;
    _capabilities.supportsMetrics = true;
    _capabilities.requiresNetwork = false;
    _capabilities.requiresFileSystem = true;

    // Create mutexes
    _flashMutex = xSemaphoreCreateMutex();
    _sessionMutex = xSemaphoreCreateMutex();

    // Initialize legacy flasher
    _legacyFlasher = std::make_unique<LegacyFlasher>(this);

    // Initialize port configurations
    initializePortConfigurations();
}

FlasherUnifiedModule::~FlasherUnifiedModule() {
    cleanup();

    if (_flashMutex) {
        vSemaphoreDelete(_flashMutex);
    }

    if (_sessionMutex) {
        vSemaphoreDelete(_sessionMutex);
    }
}

bool FlasherUnifiedModule::doInitialize() {
    logInfo("Initializing Unified Flasher Module");

    // Load configuration
    if (!loadConfiguration()) {
        logWarning("Failed to load configuration, using defaults");
    }

    // Create configuration schema
    createConfigurationSchema();

    // Initialize ZBS interfaces for available ports
    for (auto& portPair : _portConfigs) {
        FlashPort port = portPair.first;
        if (portPair.second.isValid()) {
            if (initializeZBSInterface(port)) {
                logInfo("Initialized ZBS interface for port: " + String(static_cast<int>(port)));
            } else {
                logWarning("Failed to initialize ZBS interface for port: " + String(static_cast<int>(port)));
            }
        }
    }

    logInfo("Unified Flasher Module initialized successfully");
    return true;
}

bool FlasherUnifiedModule::doStart() {
    logInfo("Starting Unified Flasher Module");

    // Start session manager task
    xTaskCreate(sessionManagerTaskFunction, "FlasherSessionMgr", 4096, this, 5, &_sessionManagerTask);

    // Start web flasher task if enabled
    if (_config.enableWebFlasher) {
        xTaskCreate(webFlasherTaskFunction, "WebFlasher", 8192, this, 5, &_webFlasherTask);
    }

// Start USB flasher task if enabled
#ifdef HAS_USB
    if (_config.enableUSBFlasher) {
        xTaskCreate(usbFlasherTaskFunction, "USBFlasher", 4096, this, 5, &_usbFlasherTask);
    }
#endif

    logInfo("Unified Flasher Module started successfully");
    return true;
}

bool FlasherUnifiedModule::doStop() {
    logInfo("Stopping Unified Flasher Module");

    // Stop tasks
    if (_sessionManagerTask) {
        vTaskDelete(_sessionManagerTask);
        _sessionManagerTask = nullptr;
    }

    if (_webFlasherTask) {
        vTaskDelete(_webFlasherTask);
        _webFlasherTask = nullptr;
    }

    if (_usbFlasherTask) {
        vTaskDelete(_usbFlasherTask);
        _usbFlasherTask = nullptr;
    }

    // Cancel all active sessions
    if (xSemaphoreTake(_sessionMutex, pdMS_TO_TICKS(1000)) == pdTRUE) {
        for (auto& sessionPair : _activeSessions) {
            if (sessionPair.second && sessionPair.second->active) {
                sessionPair.second->fail("Module stopped");
            }
        }
        _activeSessions.clear();
        xSemaphoreGive(_sessionMutex);
    }

    logInfo("Unified Flasher Module stopped");
    return true;
}

void FlasherUnifiedModule::doUpdate() {
    // Clean up expired sessions
    static uint32_t lastSessionCleanup = 0;
    if (millis() - lastSessionCleanup > 60000) {  // Every minute
        cleanupExpiredSessions();
        lastSessionCleanup = millis();
    }

    updateActivity();
}

void FlasherUnifiedModule::doHandleEvent(const String& event, const String& data) {
    if (event == "tag.discovered") {
        // Auto-flash newly discovered tags if enabled
        if (_config.enableAutoFlash) {
            DynamicJsonDocument doc(Framework::JSON_SMALL_BUFFER);
            if (deserializeJson(doc, data) == DeserializationError::Ok) {
                String tagMac = doc["mac"];
                uint8_t tagType = doc["type"];

                if (!tagMac.isEmpty()) {
                    FlashConfig config;
                    config.targetType = FlashTargetType::ZBS_TAG;
                    config.port = FlashPort::PORT_AP;  // Default port
                    config.autoDetectTag = true;
                    config.targetMAC = tagMac;

                    // Queue for flashing
                    String sessionId = createFlashSession(config, FlashTransportType::SERIAL);
                    logInfo("Auto-queued tag for flashing: " + tagMac + " (session: " + sessionId + ")");
                }
            }
        }
    } else if (event == "config.changed") {
        loadConfiguration();
    }
}

// ========================================================================
// Core Flasher Operations
// ========================================================================

FlashResult FlasherUnifiedModule::flashTag(const FlashConfig& config) {
    FlashResult result;

    if (!config.validate()) {
        result.errorMessage = "Invalid flash configuration";
        return result;
    }

    if (xSemaphoreTake(_flashMutex, pdMS_TO_TICKS(config.timeout)) != pdTRUE) {
        result.errorMessage = "Flash operation timeout - device busy";
        return result;
    }

    result = flashTagInternal(config);

    xSemaphoreGive(_flashMutex);

    updateStatistics(result);
    addToFlashHistory(result);

    return result;
}

FlashResult FlasherUnifiedModule::flashESP32(const FlashConfig& config) {
    FlashResult result;

    if (!config.validate()) {
        result.errorMessage = "Invalid flash configuration";
        return result;
    }

    if (xSemaphoreTake(_flashMutex, pdMS_TO_TICKS(config.timeout)) != pdTRUE) {
        result.errorMessage = "Flash operation timeout - device busy";
        return result;
    }

    result = flashESP32Internal(config);

    xSemaphoreGive(_flashMutex);

    updateStatistics(result);
    addToFlashHistory(result);

    return result;
}

// ========================================================================
// Session Management
// ========================================================================

String FlasherUnifiedModule::createFlashSession(const FlashConfig& config, FlashTransportType transport) {
    if (!config.validate()) {
        return "";
    }

    String sessionId = generateSessionId();

    if (xSemaphoreTake(_sessionMutex, pdMS_TO_TICKS(1000)) == pdTRUE) {
        auto session = std::make_unique<FlashSession>(sessionId, config);
        session->transport = transport;
        _activeSessions[sessionId] = std::move(session);
        xSemaphoreGive(_sessionMutex);

        logInfo("Created flash session: " + sessionId);
        return sessionId;
    }

    return "";
}

FlashResult FlasherUnifiedModule::executeFlashSession(const String& sessionId) {
    FlashResult result;

    FlashSession* session = getSession(sessionId);
    if (!session) {
        result.errorMessage = "Session not found: " + sessionId;
        return result;
    }

    if (session->active) {
        result.errorMessage = "Session already active: " + sessionId;
        return result;
    }

    session->start();

    // Execute based on target type
    switch (session->config.targetType) {
        case FlashTargetType::ZBS_TAG:
            result = flashTag(session->config);
            break;
        case FlashTargetType::ESP32_TARGET:
            result = flashESP32(session->config);
            break;
        case FlashTargetType::AP_FIRMWARE:
            result = flashAPFirmware();
            break;
        default:
            result.errorMessage = "Unsupported target type";
            break;
    }

    session->complete(result);

    return result;
}

// ========================================================================
// Configuration Management
// ========================================================================

bool FlasherUnifiedModule::loadConfiguration() {
    String configJson = getConfigValue("flasherConfig", "{}");

    if (!configJson.isEmpty() && configJson != "{}") {
        return _config.fromJson(configJson);
    }

    // Use defaults and save
    return saveConfiguration();
}

bool FlasherUnifiedModule::saveConfiguration() {
    String configJson = _config.toJson();
    return setConfigValue("flasherConfig", configJson);
}

void FlasherUnifiedModule::createConfigurationSchema() {
    // Create configuration schema for the unified config system
    auto schema = BUILD_MODULE_CONFIG("FlasherUnified", "1.0.0", "Unified Flasher System")
                      .beginSection("general", "General Settings", "flash")
                      .addBoolean("enableAutoFlash", true, "Enable automatic tag flashing")
                      .required()
                      .addBoolean("enableWebFlasher", true, "Enable web-based flasher interface")
                      .addBoolean("enableUSBFlasher", false, "Enable USB flasher interface")
                      .addInteger("defaultTimeout", 30000, "Default flash timeout in milliseconds")
                      .range("5000", "300000")
                      .addInteger("maxConcurrentFlashes", 2, "Maximum concurrent flash operations")
                      .range("1", "10")
                      .endSection()
                      .beginSection("esp32", "ESP32 Target Settings", "chip")
                      .addInteger("esp32BaudRate", 115200, "ESP32 initial baud rate")
                      .range("9600", "2000000")
                      .addInteger("esp32HigherBaudRate", 921600, "ESP32 higher baud rate")
                      .range("115200", "2000000")
                      .addBoolean("esp32AutoChangeBaud", true, "Automatically change to higher baud rate")
                      .endSection()
                      .beginSection("tags", "Tag Flash Settings", "tag")
                      .addBoolean("autoDetectTagType", true, "Automatically detect tag type")
                      .addBoolean("includeInfoBlockByDefault", false, "Include info block by default")
                      .addBoolean("verifyAfterFlash", true, "Verify flash after writing")
                      .addBoolean("backupBeforeFlash", false, "Backup flash before writing")
                      .endSection()
                      .beginSection("web", "Web Interface", "globe")
                      .addBoolean("enableWebSocketFlasher", true, "Enable WebSocket flasher")
                      .addBoolean("enableRESTAPI", true, "Enable REST API")
                      .addInteger("webSocketPort", 81, "WebSocket port")
                      .range("1024", "65535")
                      .endSection()
                      .build();

    // Register with unified config system
    UNIFIED_CONFIG.registerModuleSchema(schema);
}

// ========================================================================
// Internal Methods
// ========================================================================

void FlasherUnifiedModule::initializePortConfigurations() {
    // Initialize default port configurations based on build flags

    // AP Port configuration
    PortConfig apConfig;
#ifdef FLASHER_AP_SS
    apConfig.ss_pin = FLASHER_AP_SS;
#endif
#ifdef FLASHER_AP_CLK
    apConfig.clk_pin = FLASHER_AP_CLK;
#endif
#ifdef FLASHER_AP_MOSI
    apConfig.mosi_pin = FLASHER_AP_MOSI;
#endif
#ifdef FLASHER_AP_MISO
    apConfig.miso_pin = FLASHER_AP_MISO;
#endif
#ifdef FLASHER_AP_RESET
    apConfig.reset_pin = FLASHER_AP_RESET;
#endif
#ifdef FLASHER_AP_SPEED
    apConfig.speed = FLASHER_AP_SPEED;
#endif
    _portConfigs[FlashPort::PORT_AP] = apConfig;
    _config.apPort = apConfig;

#ifdef HAS_EXT_FLASHER
    // External Port configuration
    PortConfig extConfig;
#ifdef FLASHER_EXT_SS
    extConfig.ss_pin = FLASHER_EXT_SS;
#endif
#ifdef FLASHER_EXT_CLK
    extConfig.clk_pin = FLASHER_EXT_CLK;
#endif
    // ... add other external pins
    _portConfigs[FlashPort::PORT_EXT] = extConfig;
    _config.extPort = extConfig;
#endif
}

ZBS_interface* FlasherUnifiedModule::getZBSInterface(FlashPort port) {
    auto it = _zbsInterfaces.find(port);
    return (it != _zbsInterfaces.end()) ? it->second.get() : nullptr;
}

bool FlasherUnifiedModule::initializeZBSInterface(FlashPort port) {
    auto configIt = _portConfigs.find(port);
    if (configIt == _portConfigs.end() || !configIt->second.isValid()) {
        return false;
    }

    const PortConfig& config = configIt->second;

    auto zbs = std::make_unique<ZBS_interface>();

    // Convert power pins vector to array for ZBS interface
    uint8_t powerPinsArray[10];
    uint8_t powerPinCount = std::min(static_cast<size_t>(10), config.power_pins.size());
    for (uint8_t i = 0; i < powerPinCount; i++) {
        powerPinsArray[i] = config.power_pins[i];
    }

    bool success = zbs->begin(
        config.ss_pin,
        config.clk_pin,
        config.mosi_pin,
        config.miso_pin,
        config.reset_pin,
        powerPinsArray,
        powerPinCount,
        config.speed);

    if (success) {
        _zbsInterfaces[port] = std::move(zbs);
        return true;
    }

    return false;
}

// Global instance
FlasherUnifiedModule& flasherModule = FlasherUnifiedModule::getInstance();
