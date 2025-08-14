/**
 * @file common_framework.cpp
 * @brief Implementation of Common Framework for Reusable Utilities
 */

#include "common_framework.h"

#include <SPIFFS.h>
#include <esp_heap_caps.h>
#include <esp_log.h>
#include <esp_system.h>

// ============================================================================
// Static Instance Declarations
// ============================================================================

ConfigManager* ConfigManager::instance = nullptr;
PinManager* PinManager::instance = nullptr;
StatisticsCollector* StatisticsCollector::instance = nullptr;
TaskManager* TaskManager::instance = nullptr;
EventSystem* EventSystem::instance = nullptr;

// Global references
ConfigManager& configManager = ConfigManager::getInstance();
PinManager& pinManager = PinManager::getInstance();
StatisticsCollector& statsCollector = StatisticsCollector::getInstance();
TaskManager& taskManager = TaskManager::getInstance();
EventSystem& eventSystem = EventSystem::getInstance();

// ============================================================================
// ConfigSection Implementation
// ============================================================================

ConfigSection::ConfigSection(const String& ns) : _namespace(ns) {
    _mutex = xSemaphoreCreateMutex();
    _prefs.begin(_namespace.c_str(), false);
}

ConfigSection::~ConfigSection() {
    _prefs.end();
    if (_mutex) {
        vSemaphoreDelete(_mutex);
    }
}

template <>
String ConfigSection::get<String>(const String& key, const String& defaultValue) const {
    if (!_mutex) return defaultValue;

    xSemaphoreTake(_mutex, portMAX_DELAY);
    String result = _prefs.getString(key.c_str(), defaultValue);
    xSemaphoreGive(_mutex);
    return result;
}

template <>
bool ConfigSection::get<bool>(const String& key, const bool& defaultValue) const {
    if (!_mutex) return defaultValue;

    xSemaphoreTake(_mutex, portMAX_DELAY);
    bool result = _prefs.getBool(key.c_str(), defaultValue);
    xSemaphoreGive(_mutex);
    return result;
}

template <>
int ConfigSection::get<int>(const String& key, const int& defaultValue) const {
    if (!_mutex) return defaultValue;

    xSemaphoreTake(_mutex, portMAX_DELAY);
    int result = _prefs.getInt(key.c_str(), defaultValue);
    xSemaphoreGive(_mutex);
    return result;
}

template <>
float ConfigSection::get<float>(const String& key, const float& defaultValue) const {
    if (!_mutex) return defaultValue;

    xSemaphoreTake(_mutex, portMAX_DELAY);
    float result = _prefs.getFloat(key.c_str(), defaultValue);
    xSemaphoreGive(_mutex);
    return result;
}

template <>
bool ConfigSection::set<String>(const String& key, const String& value) {
    if (!_mutex) return false;

    xSemaphoreTake(_mutex, portMAX_DELAY);
    size_t result = _prefs.putString(key.c_str(), value);
    xSemaphoreGive(_mutex);
    return result > 0;
}

template <>
bool ConfigSection::set<bool>(const String& key, const bool& value) {
    if (!_mutex) return false;

    xSemaphoreTake(_mutex, portMAX_DELAY);
    size_t result = _prefs.putBool(key.c_str(), value);
    xSemaphoreGive(_mutex);
    return result > 0;
}

template <>
bool ConfigSection::set<int>(const String& key, const int& value) {
    if (!_mutex) return false;

    xSemaphoreTake(_mutex, portMAX_DELAY);
    size_t result = _prefs.putInt(key.c_str(), value);
    xSemaphoreGive(_mutex);
    return result > 0;
}

template <>
bool ConfigSection::set<float>(const String& key, const float& value) {
    if (!_mutex) return false;

    xSemaphoreTake(_mutex, portMAX_DELAY);
    size_t result = _prefs.putFloat(key.c_str(), value);
    xSemaphoreGive(_mutex);
    return result > 0;
}

String ConfigSection::getAsJson() const {
    DynamicJsonDocument doc(Framework::JSON_MEDIUM_BUFFER);

    if (!_mutex) return "{}";

    xSemaphoreTake(_mutex, portMAX_DELAY);

    // Get all keys and their values
    // Note: Preferences doesn't provide a direct way to enumerate keys
    // This is a simplified implementation

    xSemaphoreGive(_mutex);

    String result;
    serializeJson(doc, result);
    return result;
}

bool ConfigSection::setFromJson(const String& json) {
    DynamicJsonDocument doc(Framework::JSON_MEDIUM_BUFFER);

    if (deserializeJson(doc, json) != DeserializationError::Ok) {
        return false;
    }

    if (!_mutex) return false;

    xSemaphoreTake(_mutex, portMAX_DELAY);

    for (JsonPair kv : doc.as<JsonObject>()) {
        String key = kv.key().c_str();
        JsonVariant value = kv.value();

        if (value.is<String>()) {
            _prefs.putString(key.c_str(), value.as<String>());
        } else if (value.is<bool>()) {
            _prefs.putBool(key.c_str(), value.as<bool>());
        } else if (value.is<int>()) {
            _prefs.putInt(key.c_str(), value.as<int>());
        } else if (value.is<float>()) {
            _prefs.putFloat(key.c_str(), value.as<float>());
        }
    }

    xSemaphoreGive(_mutex);
    return true;
}

bool ConfigSection::clear() {
    if (!_mutex) return false;

    xSemaphoreTake(_mutex, portMAX_DELAY);
    bool result = _prefs.clear();
    xSemaphoreGive(_mutex);
    return result;
}

bool ConfigSection::remove(const String& key) {
    if (!_mutex) return false;

    xSemaphoreTake(_mutex, portMAX_DELAY);
    bool result = _prefs.remove(key.c_str());
    xSemaphoreGive(_mutex);
    return result;
}

// ============================================================================
// ConfigManager Implementation
// ============================================================================

ConfigManager::ConfigManager() {
    _mutex = xSemaphoreCreateMutex();
}

ConfigManager& ConfigManager::getInstance() {
    if (!instance) {
        instance = new ConfigManager();
    }
    return *instance;
}

ConfigSection& ConfigManager::getSection(const String& namespace_) {
    if (!_mutex) {
        // Fallback - create a temporary section
        static ConfigSection fallback("fallback");
        return fallback;
    }

    xSemaphoreTake(_mutex, portMAX_DELAY);

    auto it = sections.find(namespace_);
    if (it == sections.end()) {
        sections[namespace_] = std::make_unique<ConfigSection>(namespace_);
    }

    ConfigSection& section = *sections[namespace_];
    xSemaphoreGive(_mutex);
    return section;
}

bool ConfigManager::hasSection(const String& namespace_) const {
    if (!_mutex) return false;

    xSemaphoreTake(_mutex, portMAX_DELAY);
    bool result = sections.find(namespace_) != sections.end();
    xSemaphoreGive(_mutex);
    return result;
}

String ConfigManager::getSystemInfo() const {
    DynamicJsonDocument doc(Framework::JSON_LARGE_BUFFER);

    doc["framework_version"] = Framework::VERSION;
    doc["build_date"] = Framework::BUILD_DATE;
    doc["chip_model"] = ESP.getChipModel();
    doc["chip_revision"] = ESP.getChipRevision();
    doc["cpu_freq_mhz"] = ESP.getCpuFreqMHz();
    doc["flash_size"] = ESP.getFlashChipSize();
    doc["free_heap"] = ESP.getFreeHeap();
    doc["largest_free_block"] = ESP.getMaxAllocHeap();
    doc["psram_size"] = ESP.getPsramSize();
    doc["free_psram"] = ESP.getFreePsram();
    doc["sdk_version"] = ESP.getSdkVersion();

    String result;
    serializeJson(doc, result);
    return result;
}

// ============================================================================
// EnhancedModuleBase Implementation
// ============================================================================

EnhancedModuleBase::EnhancedModuleBase(const String& name, const String& version,
                                       const String& description, ModuleType type)
    : _name(name), _version(version), _description(description), _type(type), _state(ModuleState::UNINITIALIZED), _initTime(0), _lastActivity(0) {
    _mutex = xSemaphoreCreateMutex();
    _config = &configManager.getSection(_name);

    // Set default capabilities
    _capabilities.supportsConfiguration = true;
    _capabilities.supportsRemoteControl = true;
    _capabilities.supportsStatusReporting = true;
    _capabilities.supportsMetrics = true;
}

EnhancedModuleBase::~EnhancedModuleBase() {
    cleanup();
    if (_mutex) {
        vSemaphoreDelete(_mutex);
    }
}

bool EnhancedModuleBase::initialize() {
    if (!_mutex) return false;

    xSemaphoreTake(_mutex, portMAX_DELAY);

    if (_state != ModuleState::UNINITIALIZED) {
        xSemaphoreGive(_mutex);
        return _state == ModuleState::INITIALIZED || _state == ModuleState::RUNNING;
    }

    _initTime = millis();
    clearError();

    bool result = doInitialize();
    if (result) {
        setState(ModuleState::INITIALIZED);
        updateActivity();
        MODULE_LOG_INFO(_name, "Module initialized successfully");
        PUBLISH_MODULE_EVENT(_name, "initialized", "");
    } else {
        setState(ModuleState::ERROR);
        MODULE_LOG_ERROR(_name, "Module initialization failed: " + _lastError);
    }

    xSemaphoreGive(_mutex);
    return result;
}

bool EnhancedModuleBase::start() {
    if (!_mutex) return false;

    xSemaphoreTake(_mutex, portMAX_DELAY);

    if (_state != ModuleState::INITIALIZED) {
        if (_state == ModuleState::RUNNING) {
            xSemaphoreGive(_mutex);
            return true;
        }
        xSemaphoreGive(_mutex);
        return false;
    }

    bool result = doStart();
    if (result) {
        setState(ModuleState::RUNNING);
        updateActivity();
        MODULE_LOG_INFO(_name, "Module started successfully");
        PUBLISH_MODULE_EVENT(_name, "started", "");
    } else {
        setState(ModuleState::ERROR);
        MODULE_LOG_ERROR(_name, "Module start failed: " + _lastError);
    }

    xSemaphoreGive(_mutex);
    return result;
}

bool EnhancedModuleBase::stop() {
    if (!_mutex) return false;

    xSemaphoreTake(_mutex, portMAX_DELAY);

    if (_state != ModuleState::RUNNING) {
        xSemaphoreGive(_mutex);
        return true;
    }

    bool result = doStop();
    setState(ModuleState::STOPPED);
    updateActivity();

    if (result) {
        MODULE_LOG_INFO(_name, "Module stopped successfully");
        PUBLISH_MODULE_EVENT(_name, "stopped", "");
    } else {
        MODULE_LOG_WARNING(_name, "Module stop had issues: " + _lastError);
    }

    xSemaphoreGive(_mutex);
    return result;
}

bool EnhancedModuleBase::cleanup() {
    if (!_mutex) return false;

    xSemaphoreTake(_mutex, portMAX_DELAY);

    if (_state == ModuleState::RUNNING) {
        doStop();
    }

    setState(ModuleState::UNINITIALIZED);
    clearError();
    updateActivity();

    MODULE_LOG_INFO(_name, "Module cleaned up");
    PUBLISH_MODULE_EVENT(_name, "cleanup", "");

    xSemaphoreGive(_mutex);
    return true;
}

ModuleInfo EnhancedModuleBase::getInfo() const {
    ModuleInfo info;
    info.name = _name;
    info.version = _version;
    info.description = _description;
    info.type = _type;
    info.capabilities = _capabilities;
    return info;
}

bool EnhancedModuleBase::isHealthy() const {
    if (!_mutex) return false;

    xSemaphoreTake(_mutex, portMAX_DELAY);
    bool healthy = (_state == ModuleState::RUNNING || _state == ModuleState::INITIALIZED) && _lastError.isEmpty() && (millis() - _lastActivity) < 60000;  // Activity within last minute
    xSemaphoreGive(_mutex);
    return healthy;
}

void EnhancedModuleBase::handleEvent(const String& event, const String& data) {
    updateActivity();
    doHandleEvent(event, data);
}

void EnhancedModuleBase::update() {
    updateActivity();
    doUpdate();
}

String EnhancedModuleBase::getConfig() const {
    if (_config) {
        return _config->getAsJson();
    }
    return "{}";
}

bool EnhancedModuleBase::setConfig(const String& config) {
    if (_config) {
        return _config->setFromJson(config);
    }
    return false;
}

String EnhancedModuleBase::getStatus() const {
    DynamicJsonDocument doc(Framework::JSON_MEDIUM_BUFFER);

    if (_mutex) {
        xSemaphoreTake(_mutex, portMAX_DELAY);
    }

    doc["name"] = _name;
    doc["version"] = _version;
    doc["state"] = static_cast<int>(_state);
    doc["state_name"] = ModuleManager::stateToString(_state);
    doc["healthy"] = isHealthy();
    doc["init_time"] = _initTime;
    doc["last_activity"] = _lastActivity;
    doc["uptime"] = millis() - _initTime;
    doc["last_error"] = _lastError;

    doc["stats"]["operations"] = _stats.operationCount;
    doc["stats"]["errors"] = _stats.errorCount;
    doc["stats"]["last_operation"] = _stats.lastOperation;
    doc["stats"]["avg_response_time"] = _stats.averageResponseTime;

    if (_mutex) {
        xSemaphoreGive(_mutex);
    }

    String result;
    serializeJson(doc, result);
    return result;
}

void EnhancedModuleBase::getMetrics(JsonObject& metrics) const {
    if (_mutex) {
        xSemaphoreTake(_mutex, portMAX_DELAY);
    }

    metrics["operation_count"] = _stats.operationCount;
    metrics["error_count"] = _stats.errorCount;
    metrics["error_rate"] = _stats.operationCount > 0 ? (float)_stats.errorCount / _stats.operationCount * 100.0 : 0.0;
    metrics["average_response_time"] = _stats.averageResponseTime;
    metrics["uptime"] = millis() - _initTime;
    metrics["last_activity"] = _lastActivity;
    metrics["healthy"] = isHealthy();

    if (_mutex) {
        xSemaphoreGive(_mutex);
    }
}

void EnhancedModuleBase::setState(ModuleState state) {
    _state = state;
    updateActivity();
}

void EnhancedModuleBase::setError(const String& error) {
    _lastError = error;
    incrementErrorCount();
}

void EnhancedModuleBase::clearError() {
    _lastError = "";
}

void EnhancedModuleBase::updateActivity() {
    _lastActivity = millis();
}

void EnhancedModuleBase::incrementOperationCount() {
    _stats.operationCount++;
    _stats.lastOperation = millis();
    updateActivity();
}

void EnhancedModuleBase::incrementErrorCount() {
    _stats.errorCount++;
    updateActivity();
}

template <typename T>
T EnhancedModuleBase::getConfigValue(const String& key, const T& defaultValue) const {
    if (_config) {
        return _config->get(key, defaultValue);
    }
    return defaultValue;
}

template <typename T>
bool EnhancedModuleBase::setConfigValue(const String& key, const T& value) {
    if (_config) {
        return _config->set(key, value);
    }
    return false;
}

void EnhancedModuleBase::logInfo(const String& message) const {
    MODULE_LOG_INFO(_name, message);
}

void EnhancedModuleBase::logWarning(const String& message) const {
    MODULE_LOG_WARNING(_name, message);
}

void EnhancedModuleBase::logError(const String& message) const {
    MODULE_LOG_ERROR(_name, message);
}

void EnhancedModuleBase::logDebug(const String& message) const {
    MODULE_LOG_DEBUG(_name, message);
}

// ============================================================================
// CommunicationBase Implementation
// ============================================================================

CommunicationBase::CommunicationBase(uint32_t timeout)
    : _enabled(true), _timeout(timeout) {
}

void CommunicationBase::setError(const String& error) {
    _lastError = error;
    _stats.errors++;
}

void CommunicationBase::updateStats(bool sent, bool success, uint32_t responseTime) {
    if (sent) {
        _stats.messagesSent++;
    } else {
        _stats.messagesReceived++;
    }

    if (!success) {
        _stats.errors++;
    }

    if (responseTime > _timeout) {
        _stats.timeouts++;
    }

    _stats.lastActivity = millis();

    // Update average response time
    if (success && responseTime > 0) {
        _stats.averageResponseTime = (_stats.averageResponseTime + responseTime) / 2.0;
    }
}

String CommunicationBase::getStatsJson() const {
    DynamicJsonDocument doc(Framework::JSON_SMALL_BUFFER);

    doc["messages_sent"] = _stats.messagesSent;
    doc["messages_received"] = _stats.messagesReceived;
    doc["errors"] = _stats.errors;
    doc["timeouts"] = _stats.timeouts;
    doc["last_activity"] = _stats.lastActivity;
    doc["average_response_time"] = _stats.averageResponseTime;
    doc["success_rate"] = (_stats.messagesSent + _stats.messagesReceived) > 0 ? (float)((_stats.messagesSent + _stats.messagesReceived) - _stats.errors) /
                                                                                    (_stats.messagesSent + _stats.messagesReceived) * 100.0
                                                                              : 0.0;

    String result;
    serializeJson(doc, result);
    return result;
}

void CommunicationBase::resetStats() {
    _stats = CommStats{};
}

// ============================================================================
// WebAPI Implementation
// ============================================================================

namespace WebAPI {
void sendJsonResponse(AsyncWebServerRequest* request, const JsonObject& json, Framework::HttpStatus status) {
    String response;
    serializeJson(json, response);

    AsyncWebServerResponse* resp = request->beginResponse((int)status, "application/json", response);
    addStandardHeaders(resp);
    addCorsHeaders(resp);
    request->send(resp);
}

void sendJsonResponse(AsyncWebServerRequest* request, const DynamicJsonDocument& doc, Framework::HttpStatus status) {
    String response;
    serializeJson(doc, response);

    AsyncWebServerResponse* resp = request->beginResponse((int)status, "application/json", response);
    addStandardHeaders(resp);
    addCorsHeaders(resp);
    request->send(resp);
}

void sendSuccessResponse(AsyncWebServerRequest* request, const String& message) {
    DynamicJsonDocument doc(Framework::JSON_SMALL_BUFFER);
    doc["success"] = true;
    doc["message"] = message;
    doc["timestamp"] = millis();

    sendJsonResponse(request, doc, Framework::HttpStatus::OK);
}

void sendErrorResponse(AsyncWebServerRequest* request, Framework::HttpStatus status, const String& message, const String& context) {
    DynamicJsonDocument doc(Framework::JSON_SMALL_BUFFER);
    doc["success"] = false;
    doc["error"] = message;
    doc["status"] = (int)status;
    doc["timestamp"] = millis();
    if (!context.isEmpty()) {
        doc["context"] = context;
    }

    sendJsonResponse(request, doc, status);
}

bool isJsonRequest(AsyncWebServerRequest* request) {
    return request->hasHeader("Content-Type") &&
           request->header("Content-Type").indexOf("application/json") >= 0;
}

bool hasParameter(AsyncWebServerRequest* request, const String& param) {
    return request->hasParam(param.c_str());
}

String getParameter(AsyncWebServerRequest* request, const String& param, const String& defaultValue) {
    if (request->hasParam(param.c_str())) {
        return request->getParam(param.c_str())->value();
    }
    return defaultValue;
}

bool getBoolParameter(AsyncWebServerRequest* request, const String& param, bool defaultValue) {
    String value = getParameter(request, param, defaultValue ? "true" : "false");
    value.toLowerCase();
    return value == "true" || value == "1" || value == "yes" || value == "on";
}

int getIntParameter(AsyncWebServerRequest* request, const String& param, int defaultValue) {
    String value = getParameter(request, param, String(defaultValue));
    return value.toInt();
}

Result<DynamicJsonDocument> parseJsonBody(const String& body, size_t maxSize) {
    DynamicJsonDocument doc(maxSize);
    DeserializationError error = deserializeJson(doc, body);

    if (error) {
        return Result<DynamicJsonDocument>("Failed to parse JSON: " + String(error.c_str()));
    }

    return Result<DynamicJsonDocument>(doc);
}

bool validateJsonSchema(const JsonObject& json, const std::vector<String>& requiredFields) {
    for (const String& field : requiredFields) {
        if (!json.containsKey(field)) {
            return false;
        }
    }
    return true;
}

void addCorsHeaders(AsyncWebServerResponse* response) {
    response->addHeader("Access-Control-Allow-Origin", "*");
    response->addHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    response->addHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With");
    response->addHeader("Access-Control-Max-Age", "86400");
}

void addStandardHeaders(AsyncWebServerResponse* response) {
    response->addHeader("Server", "OpenEPaperLink-Framework/" + String(Framework::VERSION));
    response->addHeader("X-Content-Type-Options", "nosniff");
    response->addHeader("X-Frame-Options", "DENY");
    response->addHeader("X-XSS-Protection", "1; mode=block");
}

void addCacheHeaders(AsyncWebServerResponse* response, uint32_t maxAge) {
    response->addHeader("Cache-Control", "public, max-age=" + String(maxAge));
    response->addHeader("Expires", String(millis() + (maxAge * 1000)));
}

bool checkRateLimit(const String& clientIP, uint32_t maxRequests, uint32_t windowSeconds) {
    // Simplified rate limiting - in production, this would use a more sophisticated approach
    static std::map<String, std::pair<uint32_t, uint32_t>> rateLimitMap;  // IP -> (count, window_start)
    uint32_t now = millis() / 1000;                                       // Convert to seconds

    auto it = rateLimitMap.find(clientIP);
    if (it == rateLimitMap.end()) {
        rateLimitMap[clientIP] = {1, now};
        return true;
    }

    uint32_t& count = it->second.first;
    uint32_t& windowStart = it->second.second;

    if (now - windowStart >= windowSeconds) {
        // Reset window
        count = 1;
        windowStart = now;
        return true;
    }

    if (count >= maxRequests) {
        return false;  // Rate limit exceeded
    }

    count++;
    return true;
}

bool isAuthenticated(AsyncWebServerRequest* request) {
    // Basic authentication check - implement as needed
    return request->hasHeader("Authorization");
}

String getAuthToken(AsyncWebServerRequest* request) {
    if (request->hasHeader("Authorization")) {
        String auth = request->header("Authorization");
        if (auth.startsWith("Bearer ")) {
            return auth.substring(7);
        }
    }
    return "";
}
}  // namespace WebAPI

// ============================================================================
// FrameworkUtils Implementation
// ============================================================================

namespace FrameworkUtils {
String generateUUID() {
    // Simplified UUID generation
    String uuid = "";
    for (int i = 0; i < 32; i++) {
        if (i == 8 || i == 12 || i == 16 || i == 20) {
            uuid += "-";
        }
        uuid += String(random(16), HEX);
    }
    return uuid;
}

String generateShortId(uint8_t length) {
    String chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    String result = "";
    for (uint8_t i = 0; i < length; i++) {
        result += chars[random(chars.length())];
    }
    return result;
}

String sanitizeFilename(const String& filename) {
    String sanitized = filename;
    sanitized.replace("/", "_");
    sanitized.replace("\\", "_");
    sanitized.replace(":", "_");
    sanitized.replace("*", "_");
    sanitized.replace("?", "_");
    sanitized.replace("\"", "_");
    sanitized.replace("<", "_");
    sanitized.replace(">", "_");
    sanitized.replace("|", "_");
    return sanitized;
}

String formatTimestamp(uint32_t timestamp) {
    if (timestamp == 0) timestamp = millis();

    uint32_t seconds = timestamp / 1000;
    uint32_t minutes = seconds / 60;
    uint32_t hours = minutes / 60;
    uint32_t days = hours / 24;

    if (days > 0) {
        return String(days) + "d " + String(hours % 24) + "h " + String(minutes % 60) + "m";
    } else if (hours > 0) {
        return String(hours) + "h " + String(minutes % 60) + "m " + String(seconds % 60) + "s";
    } else if (minutes > 0) {
        return String(minutes) + "m " + String(seconds % 60) + "s";
    } else {
        return String(seconds) + "s";
    }
}

String formatDuration(uint32_t milliseconds) {
    return formatTimestamp(milliseconds);
}

bool mergeJsonObjects(JsonObject& target, const JsonObject& source) {
    for (JsonPair kv : source) {
        target[kv.key()] = kv.value();
    }
    return true;
}

String prettifyJson(const String& jsonString) {
    DynamicJsonDocument doc(Framework::JSON_LARGE_BUFFER);
    if (deserializeJson(doc, jsonString) != DeserializationError::Ok) {
        return jsonString;  // Return original if parsing fails
    }

    String result;
    serializeJsonPretty(doc, result);
    return result;
}

bool validateJsonString(const String& jsonString) {
    DynamicJsonDocument doc(Framework::JSON_SMALL_BUFFER);
    return deserializeJson(doc, jsonString) == DeserializationError::Ok;
}

String getClientIP(AsyncWebServerRequest* request) {
    // Check for forwarded IP first
    if (request->hasHeader("X-Forwarded-For")) {
        return request->header("X-Forwarded-For");
    } else if (request->hasHeader("X-Real-IP")) {
        return request->header("X-Real-IP");
    }
    return request->client()->remoteIP().toString();
}

String getMacAddress() {
    return WiFi.macAddress();
}

String getChipId() {
    return String((uint32_t)ESP.getEfuseMac(), HEX);
}

float calculateAverage(const std::vector<float>& values) {
    if (values.empty()) return 0.0;

    float sum = 0.0;
    for (float value : values) {
        sum += value;
    }
    return sum / values.size();
}

float calculatePercentage(uint32_t part, uint32_t total) {
    if (total == 0) return 0.0;
    return (float)part / total * 100.0;
}

uint32_t calculateUptime() {
    return millis();
}

bool isValidFilename(const String& filename) {
    if (filename.isEmpty() || filename.length() > 255) return false;

    // Check for invalid characters
    String invalid = "/\\:*?\"<>|";
    for (char c : invalid) {
        if (filename.indexOf(c) >= 0) return false;
    }

    return true;
}

String getFileExtension(const String& filename) {
    int lastDot = filename.lastIndexOf('.');
    if (lastDot > 0 && lastDot < filename.length() - 1) {
        return filename.substring(lastDot + 1);
    }
    return "";
}

String formatFileSize(size_t bytes) {
    if (bytes < 1024) {
        return String(bytes) + " B";
    } else if (bytes < 1024 * 1024) {
        return String(bytes / 1024.0, 1) + " KB";
    } else if (bytes < 1024 * 1024 * 1024) {
        return String(bytes / (1024.0 * 1024.0), 1) + " MB";
    } else {
        return String(bytes / (1024.0 * 1024.0 * 1024.0), 1) + " GB";
    }
}
}  // namespace FrameworkUtils

// ============================================================================
// Framework Initialization
// ============================================================================

namespace Framework {
static bool initialized = false;

bool initialize() {
    if (initialized) return true;

    FRAMEWORK_LOG_INFO("Initializing Common Framework v" + String(VERSION));

    // Initialize random seed
    randomSeed(esp_random());

    // Initialize all managers
    configManager.getInstance();
    pinManager.getInstance();
    statsCollector.getInstance();
    taskManager.getInstance();
    eventSystem.getInstance();

    // Publish framework initialization event
    eventSystem.publish("framework.initialized", getVersion());

    initialized = true;
    FRAMEWORK_LOG_INFO("Common Framework initialization complete");

    return true;
}

void cleanup() {
    if (!initialized) return;

    FRAMEWORK_LOG_INFO("Cleaning up Common Framework");

    // Publish shutdown event
    eventSystem.publish("framework.shutdown", "");

    // Cleanup managers
    taskManager.deleteAllTasks();
    configManager.cleanup();

    initialized = false;
    FRAMEWORK_LOG_INFO("Common Framework cleanup complete");
}

bool isInitialized() {
    return initialized;
}

String getVersion() {
    return VERSION;
}

String getBuildDate() {
    return BUILD_DATE;
}

String getSystemInfo() {
    return configManager.getSystemInfo();
}
}  // namespace Framework
