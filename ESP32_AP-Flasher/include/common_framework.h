/**
 * @file common_framework.h
 * @brief Common Framework for Reusable Utilities and Modular Design
 *
 * This framework provides:
 * - Centralized configuration management
 * - Reusable utility functions and classes
 * - Common base classes for modules
 * - Standardized patterns and interfaces
 * - Unified error handling and logging
 * - Consistent JSON API responses
 */

#pragma once

#include <Arduino.h>
#include <ArduinoJson.h>
#include <AsyncTCP.h>
#include <ESPAsyncWebServer.h>
#include <Preferences.h>
#include <freertos/FreeRTOS.h>
#include <freertos/semphr.h>

#include <functional>
#include <map>
#include <memory>
#include <vector>

#include "core_utilities.h"
#include "module_manager.h"

// ============================================================================
// Framework Constants and Common Definitions
// ============================================================================

namespace Framework {
// Version information
constexpr const char* VERSION = "2.0.0";
constexpr const char* BUILD_DATE = __DATE__ " " __TIME__;

// Common buffer sizes
constexpr size_t JSON_SMALL_BUFFER = 512;
constexpr size_t JSON_MEDIUM_BUFFER = 1024;
constexpr size_t JSON_LARGE_BUFFER = 2048;
constexpr size_t JSON_XLARGE_BUFFER = 4096;

// Timing constants
constexpr uint32_t DEFAULT_TIMEOUT_MS = 5000;
constexpr uint32_t SHORT_TIMEOUT_MS = 1000;
constexpr uint32_t LONG_TIMEOUT_MS = 30000;
constexpr uint32_t HEALTH_CHECK_INTERVAL_MS = 10000;
constexpr uint32_t STATS_UPDATE_INTERVAL_MS = 5000;

// Common HTTP status codes
enum class HttpStatus : uint16_t {
    OK = 200,
    CREATED = 201,
    ACCEPTED = 202,
    NO_CONTENT = 204,
    BAD_REQUEST = 400,
    UNAUTHORIZED = 401,
    FORBIDDEN = 403,
    NOT_FOUND = 404,
    METHOD_NOT_ALLOWED = 405,
    CONFLICT = 409,
    INTERNAL_SERVER_ERROR = 500,
    NOT_IMPLEMENTED = 501,
    SERVICE_UNAVAILABLE = 503
};
}  // namespace Framework

// ============================================================================
// Common Result and Error Handling
// ============================================================================

template <typename T>
class FrameworkResult {
   private:
    bool _success;
    T _value;
    String _error;
    uint32_t _errorCode;

   public:
    FrameworkResult(const T& value) : _success(true), _value(value), _errorCode(0) {}
    FrameworkResult(const String& error, uint32_t code = 0) : _success(false), _error(error), _errorCode(code) {}

    bool isSuccess() const { return _success; }
    bool isError() const { return !_success; }
    const T& getValue() const { return _value; }
    const String& getError() const { return _error; }
    uint32_t getErrorCode() const { return _errorCode; }

    // Convenience operators
    operator bool() const { return _success; }
    const T& operator*() const { return _value; }
    const T* operator->() const { return &_value; }
};

// Specialized Result for operations that don't return a value
using OperationResult = FrameworkResult<bool>;

// ============================================================================
// Configuration Management Framework
// ============================================================================

class ConfigSection {
   private:
    String _namespace;
    Preferences _prefs;
    mutable SemaphoreHandle_t _mutex;

   public:
    ConfigSection(const String& ns);
    ~ConfigSection();

    // Basic getters/setters with defaults
    template <typename T>
    T get(const String& key, const T& defaultValue) const;

    template <typename T>
    bool set(const String& key, const T& value);

    // JSON operations
    String getAsJson() const;
    bool setFromJson(const String& json);

    // Bulk operations
    bool clear();
    bool remove(const String& key);
    std::vector<String> getKeys() const;
    bool exists(const String& key) const;

    // Backup/restore
    String exportToJson() const;
    bool importFromJson(const String& json);
};

class ConfigManager {
   private:
    static ConfigManager* instance;
    std::map<String, std::unique_ptr<ConfigSection>> sections;
    mutable SemaphoreHandle_t _mutex;

    ConfigManager();

   public:
    static ConfigManager& getInstance();

    // Section management
    ConfigSection& getSection(const String& namespace_);
    bool hasSection(const String& namespace_) const;

    // Global operations
    String exportAll() const;
    bool importAll(const String& json);
    bool backup(const String& filename) const;
    bool restore(const String& filename);

    // System configuration
    String getSystemInfo() const;
    void cleanup();
};

// Global configuration manager
extern ConfigManager& configManager;

// Convenience macros for configuration access
#define CONFIG_GET(ns, key, def) configManager.getSection(ns).get(key, def)
#define CONFIG_SET(ns, key, val) configManager.getSection(ns).set(key, val)
#define CONFIG_SECTION(ns) configManager.getSection(ns)

// ============================================================================
// Enhanced Module Base Class
// ============================================================================

class EnhancedModuleBase : public ModuleInterface {
   protected:
    String _name;
    String _version;
    String _description;
    ModuleType _type;
    ModuleState _state;
    ModuleCapabilities _capabilities;

    uint32_t _initTime;
    uint32_t _lastActivity;
    String _lastError;

    mutable SemaphoreHandle_t _mutex;
    ConfigSection* _config;

    // Common statistics
    struct ModuleStats {
        uint32_t operationCount = 0;
        uint32_t errorCount = 0;
        uint32_t lastOperation = 0;
        uint32_t totalUptime = 0;
        float averageResponseTime = 0.0;
    } _stats;

   public:
    EnhancedModuleBase(const String& name, const String& version, const String& description, ModuleType type);
    virtual ~EnhancedModuleBase();

    // ModuleInterface implementation
    bool initialize() override;
    bool start() override;
    bool stop() override;
    bool cleanup() override;

    ModuleInfo getInfo() const override;
    ModuleType getType() const override { return _type; }
    ModuleState getState() const override { return _state; }
    bool isHealthy() const override;

    void handleEvent(const String& event, const String& data) override;
    void update() override;

    String getConfig() const override;
    bool setConfig(const String& config) override;
    String getStatus() const override;
    void getMetrics(JsonObject& metrics) const override;

   protected:
    // Protected methods for derived classes
    virtual bool doInitialize() = 0;
    virtual bool doStart() = 0;
    virtual bool doStop() = 0;
    virtual void doUpdate() {}
    virtual void doHandleEvent(const String& event, const String& data) {}

    // Utility methods
    void setState(ModuleState state);
    void setError(const String& error);
    void clearError();
    void updateActivity();
    void incrementOperationCount();
    void incrementErrorCount();

    // Configuration helpers
    template <typename T>
    T getConfigValue(const String& key, const T& defaultValue) const;

    template <typename T>
    bool setConfigValue(const String& key, const T& value);

    // Logging helpers
    void logInfo(const String& message) const;
    void logWarning(const String& message) const;
    void logError(const String& message) const;
    void logDebug(const String& message) const;
};

// ============================================================================
// Common Communication Interface
// ============================================================================

class CommunicationBase {
   protected:
    bool _enabled;
    uint32_t _timeout;
    String _lastError;

    struct CommStats {
        uint32_t messagesSent = 0;
        uint32_t messagesReceived = 0;
        uint32_t errors = 0;
        uint32_t timeouts = 0;
        uint32_t lastActivity = 0;
        float averageResponseTime = 0.0;
    } _stats;

   public:
    CommunicationBase(uint32_t timeout = Framework::DEFAULT_TIMEOUT_MS);
    virtual ~CommunicationBase() = default;

    // Common interface
    virtual bool initialize() = 0;
    virtual bool isConnected() const = 0;
    virtual void disconnect() = 0;
    virtual void cleanup() = 0;

    // Configuration
    void setTimeout(uint32_t timeout) { _timeout = timeout; }
    uint32_t getTimeout() const { return _timeout; }
    void enable(bool enabled = true) { _enabled = enabled; }
    bool isEnabled() const { return _enabled; }

    // Error handling
    const String& getLastError() const { return _lastError; }
    void clearError() { _lastError = ""; }

    // Statistics
    const CommStats& getStats() const { return _stats; }
    String getStatsJson() const;
    void resetStats();

   protected:
    void setError(const String& error);
    void updateStats(bool sent, bool success, uint32_t responseTime = 0);
};

// ============================================================================
// Pin Management Framework
// ============================================================================

enum class PinMode : uint8_t {
    INPUT_MODE = INPUT,
    OUTPUT_MODE = OUTPUT,
    INPUT_PULLUP_MODE = INPUT_PULLUP,
    INPUT_PULLDOWN_MODE = INPUT_PULLDOWN,
    ANALOG_INPUT = 0x10,
    PWM_OUTPUT = 0x20,
    INTERRUPT_INPUT = 0x40
};

struct PinInfo {
    uint8_t pin;
    String name;
    String function;
    PinMode mode;
    bool isAnalog;
    bool isDigital;
    bool hasInterrupt;
    bool isSpecialFunction;
    String description;

    // Current state
    int digitalValue = 0;
    int analogValue = 0;
    float voltage = 0.0;
    uint32_t lastChange = 0;
    bool hasChanged = false;

    // Configuration
    bool monitorEnabled = false;
    uint32_t monitorInterval = 1000;
    bool triggerOnChange = false;
    int changeThreshold = 10;
};

class PinManager {
   private:
    static PinManager* instance;
    std::vector<PinInfo> pins;
    mutable SemaphoreHandle_t _mutex;
    uint32_t _lastScan;
    uint32_t _scanInterval;

    PinManager();

   public:
    static PinManager& getInstance();

    // Pin registration and management
    bool registerPin(const PinInfo& pinInfo);
    bool unregisterPin(uint8_t pin);
    PinInfo* getPin(uint8_t pin);
    std::vector<PinInfo> getAllPins() const;

    // Pin operations
    bool setPinMode(uint8_t pin, PinMode mode);
    bool digitalWrite(uint8_t pin, uint8_t value);
    int digitalRead(uint8_t pin);
    int analogRead(uint8_t pin);
    float readVoltage(uint8_t pin);

    // Monitoring
    void enableMonitoring(uint8_t pin, bool enable = true);
    void setScanInterval(uint32_t interval) { _scanInterval = interval; }
    void scan();

    // Status and reporting
    String getPinStatusJson() const;
    String getPinConfigJson() const;

    // Utility functions
    static bool isValidPin(uint8_t pin);
    static bool isPinAnalogCapable(uint8_t pin);
    static String pinModeToString(PinMode mode);
    static std::vector<uint8_t> getAvailablePins();
};

extern PinManager& pinManager;

// ============================================================================
// Statistics Collection Framework
// ============================================================================

class StatisticsCollector {
   private:
    static StatisticsCollector* instance;
    std::map<String, JsonObject> moduleStats;
    mutable SemaphoreHandle_t _mutex;
    uint32_t _lastUpdate;
    uint32_t _updateInterval;

    StatisticsCollector();

   public:
    static StatisticsCollector& getInstance();

    // Statistics management
    void registerModule(const String& moduleName);
    void updateModuleStats(const String& moduleName, const JsonObject& stats);
    JsonObject getModuleStats(const String& moduleName) const;
    String getAllStatsJson() const;

    // System statistics
    String getSystemStatsJson() const;
    void collectSystemStats();

    // Configuration
    void setUpdateInterval(uint32_t interval) { _updateInterval = interval; }
    void update();
    void reset();
};

extern StatisticsCollector& statsCollector;

// ============================================================================
// Web API Framework
// ============================================================================

namespace WebAPI {
// Standard response helpers
void sendJsonResponse(AsyncWebServerRequest* request, const JsonObject& json, Framework::HttpStatus status = Framework::HttpStatus::OK);
void sendJsonResponse(AsyncWebServerRequest* request, const DynamicJsonDocument& doc, Framework::HttpStatus status = Framework::HttpStatus::OK);
void sendSuccessResponse(AsyncWebServerRequest* request, const String& message = "Operation successful");
void sendErrorResponse(AsyncWebServerRequest* request, Framework::HttpStatus status, const String& message, const String& context = "");

// Request helpers
bool isJsonRequest(AsyncWebServerRequest* request);
bool hasParameter(AsyncWebServerRequest* request, const String& param);
String getParameter(AsyncWebServerRequest* request, const String& param, const String& defaultValue = "");
bool getBoolParameter(AsyncWebServerRequest* request, const String& param, bool defaultValue = false);
int getIntParameter(AsyncWebServerRequest* request, const String& param, int defaultValue = 0);

// JSON parsing helpers
FrameworkResult<DynamicJsonDocument> parseJsonBody(const String& body, size_t maxSize = Framework::JSON_LARGE_BUFFER);
bool validateJsonSchema(const JsonObject& json, const std::vector<String>& requiredFields);

// CORS and headers
void addCorsHeaders(AsyncWebServerResponse* response);
void addStandardHeaders(AsyncWebServerResponse* response);
void addCacheHeaders(AsyncWebServerResponse* response, uint32_t maxAge = 3600);

// Rate limiting
bool checkRateLimit(const String& clientIP, uint32_t maxRequests = 100, uint32_t windowSeconds = 60);

// Authentication helpers (if needed)
bool isAuthenticated(AsyncWebServerRequest* request);
String getAuthToken(AsyncWebServerRequest* request);
}  // namespace WebAPI

// ============================================================================
// Task and Threading Framework
// ============================================================================

class TaskManager {
   private:
    static TaskManager* instance;
    std::vector<TaskHandle_t> tasks;
    mutable SemaphoreHandle_t _mutex;

    TaskManager();

   public:
    static TaskManager& getInstance();

    // Task management
    bool createTask(const String& name, TaskFunction_t function, void* parameter = nullptr,
                    uint32_t stackSize = 4096, UBaseType_t priority = 1);
    bool deleteTask(const String& name);
    bool suspendTask(const String& name);
    bool resumeTask(const String& name);

    // Task information
    std::vector<String> getTaskNames() const;
    String getTaskInfo(const String& name) const;
    String getAllTasksJson() const;

    // Cleanup
    void deleteAllTasks();
};

extern TaskManager& taskManager;

// ============================================================================
// Event System Framework
// ============================================================================

using EventCallback = std::function<void(const String& event, const String& data)>;

class EventSystem {
   private:
    static EventSystem* instance;
    std::map<String, std::vector<EventCallback>> callbacks;
    mutable SemaphoreHandle_t _mutex;

    EventSystem();

   public:
    static EventSystem& getInstance();

    // Event management
    void subscribe(const String& event, EventCallback callback);
    void unsubscribe(const String& event);
    void publish(const String& event, const String& data = "");
    void publishAsync(const String& event, const String& data = "");

    // System events
    void publishSystemEvent(const String& event, const String& data = "");
    void publishModuleEvent(const String& moduleName, const String& event, const String& data = "");

    // Statistics
    String getEventStatsJson() const;
    void reset();
};

extern EventSystem& eventSystem;

// ============================================================================
// Utility Macros and Helper Functions
// ============================================================================

// Logging macros that integrate with the framework
#define FRAMEWORK_LOG_INFO(msg) LogUtils::logInfo("[FRAMEWORK] " + String(msg))
#define FRAMEWORK_LOG_WARNING(msg) LogUtils::logWarning("[FRAMEWORK] " + String(msg))
#define FRAMEWORK_LOG_ERROR(msg) LogUtils::logError("[FRAMEWORK] " + String(msg))
#define FRAMEWORK_LOG_DEBUG(msg) LogUtils::logDebug("[FRAMEWORK] " + String(msg))

// Module logging macros
#define MODULE_LOG_INFO(module, msg) LogUtils::logInfo("[" + String(module) + "] " + String(msg))
#define MODULE_LOG_WARNING(module, msg) LogUtils::logWarning("[" + String(module) + "] " + String(msg))
#define MODULE_LOG_ERROR(module, msg) LogUtils::logError("[" + String(module) + "] " + String(msg))
#define MODULE_LOG_DEBUG(module, msg) LogUtils::logDebug("[" + String(module) + "] " + String(msg))

// Configuration macros
#define MODULE_CONFIG_GET(module, key, def) CONFIG_GET(module, key, def)
#define MODULE_CONFIG_SET(module, key, val) CONFIG_SET(module, key, val)

// Event publishing macros
#define PUBLISH_EVENT(event, data) eventSystem.publish(event, data)
#define PUBLISH_MODULE_EVENT(module, event, data) eventSystem.publishModuleEvent(module, event, data)

// Common utility functions
namespace FrameworkUtils {
// String utilities
String generateUUID();
String generateShortId(uint8_t length = 8);
String sanitizeFilename(const String& filename);
String formatTimestamp(uint32_t timestamp = 0);
String formatDuration(uint32_t milliseconds);

// JSON utilities
bool mergeJsonObjects(JsonObject& target, const JsonObject& source);
String prettifyJson(const String& jsonString);
bool validateJsonString(const String& jsonString);

// Network utilities
String getClientIP(AsyncWebServerRequest* request);
String getMacAddress();
String getChipId();

// Math utilities
float calculateAverage(const std::vector<float>& values);
float calculatePercentage(uint32_t part, uint32_t total);
uint32_t calculateUptime();

// File utilities
bool isValidFilename(const String& filename);
String getFileExtension(const String& filename);
String formatFileSize(size_t bytes);
}  // namespace FrameworkUtils

// ============================================================================
// Framework Initialization
// ============================================================================

namespace Framework {
bool initialize();
void cleanup();
bool isInitialized();
String getVersion();
String getBuildDate();
String getSystemInfo();
}  // namespace Framework
