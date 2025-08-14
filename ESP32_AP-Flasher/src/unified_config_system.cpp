/**
 * @file unified_config_system.cpp
 * @brief Implementation of Unified Configuration System
 *
 * Consolidates and replaces:
 * - json_config.cpp ConfigManager and AppConfig
 * - CentralizedConfigManager functionality
 * - core_utilities.cpp StorageManager
 * - Various scattered configuration management
 */

#include "unified_config_system.h"

#include <FS.h>
#include <LittleFS.h>

#include <algorithm>

// ============================================================================
// Static Instance Management
// ============================================================================

UnifiedConfigSystem* UnifiedConfigSystem::_instance = nullptr;
UnifiedConfigSystem& unifiedConfig = UnifiedConfigSystem::getInstance();

// ============================================================================
// Validation Rule Implementation
// ============================================================================

bool ConfigValidationRule::validate(const String& value, ConfigValueType type) const {
    // Check required
    if (required && value.isEmpty()) {
        return false;
    }

    // Skip validation for empty optional values
    if (!required && value.isEmpty()) {
        return true;
    }

    // Type-specific validation
    switch (type) {
        case ConfigValueType::STRING:
            if (!pattern.isEmpty()) {
                // TODO: Implement regex validation
                // For now, just check basic patterns
                if (pattern == "^[a-zA-Z0-9_-]+$") {
                    for (int i = 0; i < value.length(); i++) {
                        char c = value.charAt(i);
                        if (!isalnum(c) && c != '_' && c != '-') {
                            return false;
                        }
                    }
                }
            }
            break;

        case ConfigValueType::INTEGER: {
            char* endptr;
            long val = strtol(value.c_str(), &endptr, 10);
            if (*endptr != '\0') return false;  // Not a valid integer

            if (!minValue.isEmpty()) {
                long min = strtol(minValue.c_str(), nullptr, 10);
                if (val < min) return false;
            }
            if (!maxValue.isEmpty()) {
                long max = strtol(maxValue.c_str(), nullptr, 10);
                if (val > max) return false;
            }
            break;
        }

        case ConfigValueType::FLOAT: {
            char* endptr;
            float val = strtof(value.c_str(), &endptr);
            if (*endptr != '\0') return false;  // Not a valid float

            if (!minValue.isEmpty()) {
                float min = strtof(minValue.c_str(), nullptr);
                if (val < min) return false;
            }
            if (!maxValue.isEmpty()) {
                float max = strtof(maxValue.c_str(), nullptr);
                if (val > max) return false;
            }
            break;
        }

        case ConfigValueType::BOOLEAN:
            return (value == "true" || value == "false" || value == "1" || value == "0");

        case ConfigValueType::IP_ADDRESS: {
            IPAddress ip;
            return ip.fromString(value);
        }

        case ConfigValueType::MAC_ADDRESS: {
            if (value.length() != 17) return false;
            for (int i = 0; i < 17; i++) {
                if (i % 3 == 2) {
                    if (value.charAt(i) != ':') return false;
                } else {
                    char c = value.charAt(i);
                    if (!isxdigit(c)) return false;
                }
            }
            break;
        }

        case ConfigValueType::PIN_NUMBER: {
            int pin = value.toInt();
            return (pin >= -1 && pin <= 48);  // ESP32 pin range
        }

        case ConfigValueType::ENUM:
            if (enumValues.empty()) return true;
            return std::find(enumValues.begin(), enumValues.end(), value) != enumValues.end();

        case ConfigValueType::JSON_OBJECT: {
            DynamicJsonDocument doc(512);
            return deserializeJson(doc, value) == DeserializationError::Ok;
        }

        default:
            break;
    }

    // Custom validator
    if (customValidator) {
        return customValidator(value);
    }

    return true;
}

// ============================================================================
// Config Section Implementation
// ============================================================================

const ConfigParameterDefinition* ConfigSectionDefinition::getParameter(const String& name) const {
    for (const auto& param : parameters) {
        if (param.name == name) {
            return &param;
        }
    }
    return nullptr;
}

String ConfigSectionDefinition::toJson() const {
    DynamicJsonDocument doc(Framework::JSON_LARGE_BUFFER);

    doc["name"] = name;
    doc["description"] = description;
    doc["icon"] = icon;
    doc["visible"] = visible;
    doc["enabled"] = enabled;
    doc["displayOrder"] = displayOrder;

    JsonArray paramArray = doc.createNestedArray("parameters");
    for (const auto& param : parameters) {
        JsonObject paramObj = paramArray.createNestedObject();
        paramObj["name"] = param.name;
        paramObj["description"] = param.description;
        paramObj["type"] = static_cast<int>(param.type);
        paramObj["defaultValue"] = param.defaultValue;
        paramObj["group"] = param.group;
        paramObj["helpText"] = param.helpText;
        paramObj["placeholder"] = param.placeholder;
        paramObj["sensitive"] = param.sensitive;
        paramObj["displayOrder"] = param.displayOrder;

        // Validation rules
        JsonObject validation = paramObj.createNestedObject("validation");
        validation["pattern"] = param.validation.pattern;
        validation["minValue"] = param.validation.minValue;
        validation["maxValue"] = param.validation.maxValue;
        validation["required"] = param.validation.required;
        validation["readOnly"] = param.validation.readOnly;

        if (!param.validation.enumValues.empty()) {
            JsonArray enumArray = validation.createNestedArray("enumValues");
            for (const auto& enumVal : param.validation.enumValues) {
                enumArray.add(enumVal);
            }
        }
    }

    String result;
    serializeJson(doc, result);
    return result;
}

bool ConfigSectionDefinition::fromJson(const String& json) {
    DynamicJsonDocument doc(Framework::JSON_LARGE_BUFFER);
    if (deserializeJson(doc, json) != DeserializationError::Ok) {
        return false;
    }

    name = doc["name"] | name;
    description = doc["description"] | description;
    icon = doc["icon"] | icon;
    visible = doc["visible"] | visible;
    enabled = doc["enabled"] | enabled;
    displayOrder = doc["displayOrder"] | displayOrder;

    parameters.clear();
    JsonArray paramArray = doc["parameters"];
    for (JsonObject paramObj : paramArray) {
        ConfigParameterDefinition param;
        param.name = paramObj["name"];
        param.description = paramObj["description"];
        param.type = static_cast<ConfigValueType>(paramObj["type"].as<int>());
        param.defaultValue = paramObj["defaultValue"];
        param.group = paramObj["group"];
        param.helpText = paramObj["helpText"];
        param.placeholder = paramObj["placeholder"];
        param.sensitive = paramObj["sensitive"];
        param.displayOrder = paramObj["displayOrder"];

        JsonObject validation = paramObj["validation"];
        param.validation.pattern = validation["pattern"];
        param.validation.minValue = validation["minValue"];
        param.validation.maxValue = validation["maxValue"];
        param.validation.required = validation["required"];
        param.validation.readOnly = validation["readOnly"];

        JsonArray enumArray = validation["enumValues"];
        for (JsonVariant enumVal : enumArray) {
            param.validation.enumValues.push_back(enumVal.as<String>());
        }

        parameters.push_back(param);
    }

    return true;
}

bool ConfigSectionDefinition::validate() const {
    for (const auto& param : parameters) {
        if (!param.validate(param.defaultValue)) {
            return false;
        }
    }
    return true;
}

// ============================================================================
// Module Config Implementation
// ============================================================================

const ConfigSectionDefinition* ModuleConfigDefinition::getSection(const String& name) const {
    for (const auto& section : sections) {
        if (section.name == name) {
            return &section;
        }
    }
    return nullptr;
}

const ConfigParameterDefinition* ModuleConfigDefinition::getParameter(const String& sectionName, const String& paramName) const {
    const auto* section = getSection(sectionName);
    if (!section) return nullptr;

    return section->getParameter(paramName);
}

String ModuleConfigDefinition::toJson() const {
    DynamicJsonDocument doc(Framework::JSON_EXTRA_LARGE_BUFFER);

    doc["moduleName"] = moduleName;
    doc["moduleVersion"] = moduleVersion;
    doc["description"] = description;

    JsonArray sectionsArray = doc.createNestedArray("sections");
    for (const auto& section : sections) {
        DynamicJsonDocument sectionDoc(Framework::JSON_LARGE_BUFFER);
        deserializeJson(sectionDoc, section.toJson());
        sectionsArray.add(sectionDoc);
    }

    String result;
    serializeJson(doc, result);
    return result;
}

bool ModuleConfigDefinition::fromJson(const String& json) {
    DynamicJsonDocument doc(Framework::JSON_EXTRA_LARGE_BUFFER);
    if (deserializeJson(doc, json) != DeserializationError::Ok) {
        return false;
    }

    moduleName = doc["moduleName"];
    moduleVersion = doc["moduleVersion"];
    description = doc["description"];

    sections.clear();
    JsonArray sectionsArray = doc["sections"];
    for (JsonVariant sectionVar : sectionsArray) {
        ConfigSectionDefinition section;
        String sectionJson;
        serializeJson(sectionVar, sectionJson);
        if (section.fromJson(sectionJson)) {
            sections.push_back(section);
        }
    }

    return true;
}

bool ModuleConfigDefinition::validate() const {
    for (const auto& section : sections) {
        if (!section.validate()) {
            return false;
        }
    }
    return true;
}

// ============================================================================
// Legacy Configuration Implementations
// ============================================================================

namespace LegacyConfig {

String SystemConfig::toJson() const {
    DynamicJsonDocument doc(Framework::JSON_MEDIUM_BUFFER);
    doc["deviceName"] = deviceName;
    doc["firmwareVersion"] = firmwareVersion;
    doc["bootCount"] = bootCount;
    doc["debugMode"] = debugMode;
    doc["logLevel"] = logLevel;
    doc["heartbeatInterval"] = heartbeatInterval;
    doc["timezone"] = timezone;
    doc["nightlyReboot"] = nightlyReboot;
    doc["maxSleep"] = maxSleep;

    String result;
    serializeJson(doc, result);
    return result;
}

bool SystemConfig::fromJson(const String& json) {
    DynamicJsonDocument doc(Framework::JSON_MEDIUM_BUFFER);
    if (deserializeJson(doc, json) != DeserializationError::Ok) {
        return false;
    }

    deviceName = doc["deviceName"] | deviceName;
    firmwareVersion = doc["firmwareVersion"] | firmwareVersion;
    bootCount = doc["bootCount"] | bootCount;
    debugMode = doc["debugMode"] | debugMode;
    logLevel = doc["logLevel"] | logLevel;
    heartbeatInterval = doc["heartbeatInterval"] | heartbeatInterval;
    timezone = doc["timezone"] | timezone;
    nightlyReboot = doc["nightlyReboot"] | nightlyReboot;
    maxSleep = doc["maxSleep"] | maxSleep;

    return validate();
}

bool SystemConfig::validate() const {
    return !deviceName.isEmpty() &&
           !firmwareVersion.isEmpty() &&
           logLevel <= 4 &&
           heartbeatInterval >= 1000 &&
           maxSleep >= 60;
}

String SecurityConfig::toJson() const {
    DynamicJsonDocument doc(Framework::JSON_SMALL_BUFFER);
    doc["enableOTA"] = enableOTA;
    doc["otaPassword"] = otaPassword;
    doc["enableAuth"] = enableAuth;
    doc["webUsername"] = webUsername;
    doc["webPassword"] = webPassword;

    String result;
    serializeJson(doc, result);
    return result;
}

bool SecurityConfig::fromJson(const String& json) {
    DynamicJsonDocument doc(Framework::JSON_SMALL_BUFFER);
    if (deserializeJson(doc, json) != DeserializationError::Ok) {
        return false;
    }

    enableOTA = doc["enableOTA"] | enableOTA;
    otaPassword = doc["otaPassword"] | otaPassword;
    enableAuth = doc["enableAuth"] | enableAuth;
    webUsername = doc["webUsername"] | webUsername;
    webPassword = doc["webPassword"] | webPassword;

    return validate();
}

bool SecurityConfig::validate() const {
    if (enableAuth && webUsername.isEmpty()) return false;
    if (enableOTA && !otaPassword.isEmpty() && otaPassword.length() < 8) return false;
    return true;
}

String WiFiConfig::toJson() const {
    DynamicJsonDocument doc(Framework::JSON_MEDIUM_BUFFER);
    doc["ssid"] = ssid;
    doc["password"] = password;
    doc["hostname"] = hostname;
    doc["useStaticIP"] = useStaticIP;
    doc["staticIP"] = staticIP;
    doc["gateway"] = gateway;
    doc["subnet"] = subnet;
    doc["dns1"] = dns1;
    doc["dns2"] = dns2;
    doc["enableAP"] = enableAP;
    doc["apSSID"] = apSSID;
    doc["apPassword"] = apPassword;
    doc["channel"] = channel;
    doc["autoReconnect"] = autoReconnect;
    doc["powerSave"] = powerSave;

    String result;
    serializeJson(doc, result);
    return result;
}

bool WiFiConfig::fromJson(const String& json) {
    DynamicJsonDocument doc(Framework::JSON_MEDIUM_BUFFER);
    if (deserializeJson(doc, json) != DeserializationError::Ok) {
        return false;
    }

    ssid = doc["ssid"] | ssid;
    password = doc["password"] | password;
    hostname = doc["hostname"] | hostname;
    useStaticIP = doc["useStaticIP"] | useStaticIP;
    staticIP = doc["staticIP"] | staticIP;
    gateway = doc["gateway"] | gateway;
    subnet = doc["subnet"] | subnet;
    dns1 = doc["dns1"] | dns1;
    dns2 = doc["dns2"] | dns2;
    enableAP = doc["enableAP"] | enableAP;
    apSSID = doc["apSSID"] | apSSID;
    apPassword = doc["apPassword"] | apPassword;
    channel = doc["channel"] | channel;
    autoReconnect = doc["autoReconnect"] | autoReconnect;
    powerSave = doc["powerSave"] | powerSave;

    return validate();
}

bool WiFiConfig::validate() const {
    if (!hostname.isEmpty() && hostname.length() > 32) return false;
    if (channel < 1 || channel > 13) return false;
    if (useStaticIP) {
        IPAddress ip;
        if (!ip.fromString(staticIP) || !ip.fromString(gateway) || !ip.fromString(subnet)) {
            return false;
        }
    }
    return true;
}

String HardwareConfig::toJson() const {
    DynamicJsonDocument doc(Framework::JSON_SMALL_BUFFER);
    doc["hasSD"] = hasSD;
    doc["hasTFT"] = hasTFT;
    doc["hasRGB"] = hasRGB;
    doc["hasRC522"] = hasRC522;
    doc["hasIR"] = hasIR;
    doc["ledEnabled"] = ledEnabled;
    doc["tftEnabled"] = tftEnabled;
    doc["language"] = language;

    String result;
    serializeJson(doc, result);
    return result;
}

bool HardwareConfig::fromJson(const String& json) {
    DynamicJsonDocument doc(Framework::JSON_SMALL_BUFFER);
    if (deserializeJson(doc, json) != DeserializationError::Ok) {
        return false;
    }

    hasSD = doc["hasSD"] | hasSD;
    hasTFT = doc["hasTFT"] | hasTFT;
    hasRGB = doc["hasRGB"] | hasRGB;
    hasRC522 = doc["hasRC522"] | hasRC522;
    hasIR = doc["hasIR"] | hasIR;
    ledEnabled = doc["ledEnabled"] | ledEnabled;
    tftEnabled = doc["tftEnabled"] | tftEnabled;
    language = doc["language"] | language;

    return validate();
}

bool HardwareConfig::validate() const {
    return language <= 255;  // Basic validation
}

String TagConfig::toJson() const {
    DynamicJsonDocument doc(Framework::JSON_SMALL_BUFFER);
    doc["maxTags"] = maxTags;
    doc["defaultUpdateInterval"] = defaultUpdateInterval;
    doc["autoDiscovery"] = autoDiscovery;
    doc["enableBattery"] = enableBattery;
    doc["rssiThreshold"] = rssiThreshold;

    String result;
    serializeJson(doc, result);
    return result;
}

bool TagConfig::fromJson(const String& json) {
    DynamicJsonDocument doc(Framework::JSON_SMALL_BUFFER);
    if (deserializeJson(doc, json) != DeserializationError::Ok) {
        return false;
    }

    maxTags = doc["maxTags"] | maxTags;
    defaultUpdateInterval = doc["defaultUpdateInterval"] | defaultUpdateInterval;
    autoDiscovery = doc["autoDiscovery"] | autoDiscovery;
    enableBattery = doc["enableBattery"] | enableBattery;
    rssiThreshold = doc["rssiThreshold"] | rssiThreshold;

    return validate();
}

bool TagConfig::validate() const {
    return maxTags > 0 && maxTags <= 1000 &&
           defaultUpdateInterval >= 10 &&
           rssiThreshold >= -120 && rssiThreshold <= 0;
}

String ApplicationConfig::toJson() const {
    DynamicJsonDocument doc(Framework::JSON_EXTRA_LARGE_BUFFER);

    DynamicJsonDocument systemDoc(Framework::JSON_MEDIUM_BUFFER);
    deserializeJson(systemDoc, system.toJson());
    doc["system"] = systemDoc;

    DynamicJsonDocument securityDoc(Framework::JSON_SMALL_BUFFER);
    deserializeJson(securityDoc, security.toJson());
    doc["security"] = securityDoc;

    DynamicJsonDocument wifiDoc(Framework::JSON_MEDIUM_BUFFER);
    deserializeJson(wifiDoc, wifi.toJson());
    doc["wifi"] = wifiDoc;

    DynamicJsonDocument hardwareDoc(Framework::JSON_SMALL_BUFFER);
    deserializeJson(hardwareDoc, hardware.toJson());
    doc["hardware"] = hardwareDoc;

    DynamicJsonDocument tagsDoc(Framework::JSON_SMALL_BUFFER);
    deserializeJson(tagsDoc, tags.toJson());
    doc["tags"] = tagsDoc;

    String result;
    serializeJson(doc, result);
    return result;
}

bool ApplicationConfig::fromJson(const String& json) {
    DynamicJsonDocument doc(Framework::JSON_EXTRA_LARGE_BUFFER);
    if (deserializeJson(doc, json) != DeserializationError::Ok) {
        return false;
    }

    if (doc.containsKey("system")) {
        String systemJson;
        serializeJson(doc["system"], systemJson);
        system.fromJson(systemJson);
    }

    if (doc.containsKey("security")) {
        String securityJson;
        serializeJson(doc["security"], securityJson);
        security.fromJson(securityJson);
    }

    if (doc.containsKey("wifi")) {
        String wifiJson;
        serializeJson(doc["wifi"], wifiJson);
        wifi.fromJson(wifiJson);
    }

    if (doc.containsKey("hardware")) {
        String hardwareJson;
        serializeJson(doc["hardware"], hardwareJson);
        hardware.fromJson(hardwareJson);
    }

    if (doc.containsKey("tags")) {
        String tagsJson;
        serializeJson(doc["tags"], tagsJson);
        tags.fromJson(tagsJson);
    }

    return validate();
}

bool ApplicationConfig::validate() const {
    return system.validate() && security.validate() &&
           wifi.validate() && hardware.validate() && tags.validate();
}

void ApplicationConfig::setDefaults() {
    // Reset all to defaults by reconstructing
    system = SystemConfig{};
    security = SecurityConfig{};
    wifi = WiFiConfig{};
    hardware = HardwareConfig{};
    tags = TagConfig{};
}

bool ApplicationConfig::saveToFile(const String& path) const {
    File file = LittleFS.open(path, "w");
    if (!file) {
        return false;
    }

    String json = toJson();
    size_t written = file.print(json);
    file.close();

    return written == json.length();
}

bool ApplicationConfig::loadFromFile(const String& path) {
    if (!LittleFS.exists(path)) {
        setDefaults();
        return false;
    }

    File file = LittleFS.open(path, "r");
    if (!file) {
        return false;
    }

    String json = file.readString();
    file.close();

    if (json.isEmpty()) {
        setDefaults();
        return false;
    }

    return fromJson(json);
}

}  // namespace LegacyConfig

// ============================================================================
// UnifiedConfigSystem Implementation
// ============================================================================

UnifiedConfigSystem::UnifiedConfigSystem()
    : _fileSystem(nullptr), _configBasePath("/config"), _autoSaveInterval(30000), _lastAutoSave(0), _autoSaveEnabled(false), _initialized(false) {
    _mutex = xSemaphoreCreateMutex();
    _legacyConfig.setDefaults();
}

UnifiedConfigSystem::~UnifiedConfigSystem() {
    cleanup();
    if (_mutex) {
        vSemaphoreDelete(_mutex);
    }
}

UnifiedConfigSystem& UnifiedConfigSystem::getInstance() {
    if (!_instance) {
        _instance = new UnifiedConfigSystem();
    }
    return *_instance;
}

bool UnifiedConfigSystem::initialize(fs::FS* fileSystem, const String& basePath) {
    if (_initialized) {
        return true;
    }

    if (xSemaphoreTake(_mutex, pdMS_TO_TICKS(1000)) != pdTRUE) {
        return false;
    }

    // Initialize file system
    if (fileSystem) {
        _fileSystem = fileSystem;
    } else {
        if (!LittleFS.begin()) {
            xSemaphoreGive(_mutex);
            return false;
        }
        _fileSystem = &LittleFS;
    }

    _configBasePath = basePath;

    // Initialize NVS
    _preferences.begin("unified_config", false);

    // Create directory structure
    if (!_fileSystem->exists(_configBasePath)) {
        _fileSystem->mkdir(_configBasePath);
    }

    if (!_fileSystem->exists(_configBasePath + "/modules")) {
        _fileSystem->mkdir(_configBasePath + "/modules");
    }

    if (!_fileSystem->exists(_configBasePath + "/tags")) {
        _fileSystem->mkdir(_configBasePath + "/tags");
    }

    // Load configurations
    loadAllConfigurations();

    _initialized = true;
    xSemaphoreGive(_mutex);

    return true;
}

void UnifiedConfigSystem::cleanup() {
    if (!_initialized) return;

    if (xSemaphoreTake(_mutex, pdMS_TO_TICKS(1000)) == pdTRUE) {
        // Save any unsaved changes
        if (hasUnsavedChanges()) {
            saveAllConfigurations();
        }

        _preferences.end();
        _moduleSchemas.clear();
        _configValues.clear();
        _tagConfigs.clear();
        _changeCallbacks.clear();
        _dirtyModules.clear();

        _initialized = false;
        xSemaphoreGive(_mutex);
    }
}

void UnifiedConfigSystem::update() {
    if (!_initialized || !_autoSaveEnabled) return;

    uint32_t now = millis();
    if (now - _lastAutoSave >= _autoSaveInterval) {
        if (hasUnsavedChanges()) {
            saveAllConfigurations();
        }
        _lastAutoSave = now;
    }
}

// ========================================================================
// Module Schema Management
// ========================================================================

bool UnifiedConfigSystem::registerModuleSchema(const ModuleConfigDefinition& schema) {
    if (!_initialized || schema.moduleName.isEmpty()) {
        return false;
    }

    if (xSemaphoreTake(_mutex, pdMS_TO_TICKS(1000)) != pdTRUE) {
        return false;
    }

    if (!schema.validate()) {
        xSemaphoreGive(_mutex);
        return false;
    }

    _moduleSchemas[schema.moduleName] = schema;

    // Initialize default values for new module
    for (const auto& section : schema.sections) {
        for (const auto& param : section.parameters) {
            String currentValue = getConfigValue(schema.moduleName, section.name, param.name);
            if (currentValue.isEmpty()) {
                _configValues[schema.moduleName][section.name][param.name] = param.defaultValue;
            }
        }
    }

    // Save schema to file
    String schemaPath = _configBasePath + "/modules/" + schema.moduleName + "_schema.json";
    saveToFile(schemaPath, schema.toJson());

    xSemaphoreGive(_mutex);
    return true;
}

bool UnifiedConfigSystem::unregisterModule(const String& moduleName) {
    if (!_initialized || moduleName.isEmpty()) {
        return false;
    }

    if (xSemaphoreTake(_mutex, pdMS_TO_TICKS(1000)) != pdTRUE) {
        return false;
    }

    _moduleSchemas.erase(moduleName);
    _configValues.erase(moduleName);
    _changeCallbacks.erase(moduleName);
    _dirtyModules.erase(moduleName);

    // Remove schema file
    String schemaPath = _configBasePath + "/modules/" + moduleName + "_schema.json";
    if (_fileSystem->exists(schemaPath)) {
        _fileSystem->remove(schemaPath);
    }

    // Remove config file
    String configPath = _configBasePath + "/modules/" + moduleName + ".json";
    if (_fileSystem->exists(configPath)) {
        _fileSystem->remove(configPath);
    }

    xSemaphoreGive(_mutex);
    return true;
}

std::vector<String> UnifiedConfigSystem::getRegisteredModules() const {
    std::vector<String> modules;

    if (xSemaphoreTake(_mutex, pdMS_TO_TICKS(1000)) == pdTRUE) {
        for (const auto& pair : _moduleSchemas) {
            modules.push_back(pair.first);
        }
        xSemaphoreGive(_mutex);
    }

    return modules;
}

const ModuleConfigDefinition* UnifiedConfigSystem::getModuleSchema(const String& moduleName) const {
    if (!_initialized) return nullptr;

    if (xSemaphoreTake(_mutex, pdMS_TO_TICKS(1000)) == pdTRUE) {
        auto it = _moduleSchemas.find(moduleName);
        const ModuleConfigDefinition* result = (it != _moduleSchemas.end()) ? &it->second : nullptr;
        xSemaphoreGive(_mutex);
        return result;
    }

    return nullptr;
}

// ========================================================================
// Configuration Value Access
// ========================================================================

String UnifiedConfigSystem::getConfigValue(const String& moduleName, const String& section, const String& parameter, const String& defaultValue) const {
    if (!_initialized) return defaultValue;

    if (xSemaphoreTake(_mutex, pdMS_TO_TICKS(1000)) == pdTRUE) {
        auto moduleIt = _configValues.find(moduleName);
        if (moduleIt != _configValues.end()) {
            auto sectionIt = moduleIt->second.find(section);
            if (sectionIt != moduleIt->second.end()) {
                auto paramIt = sectionIt->second.find(parameter);
                if (paramIt != sectionIt->second.end() && !paramIt->second.isEmpty()) {
                    String result = paramIt->second;
                    xSemaphoreGive(_mutex);
                    _stats.configReads++;
                    return result;
                }
            }
        }
        xSemaphoreGive(_mutex);
    }

    _stats.configReads++;
    return defaultValue;
}

bool UnifiedConfigSystem::setConfigValue(const String& moduleName, const String& section, const String& parameter, const String& value) {
    if (!_initialized) return false;

    if (xSemaphoreTake(_mutex, pdMS_TO_TICKS(1000)) != pdTRUE) {
        return false;
    }

    // Validate against schema if available
    auto schemaIt = _moduleSchemas.find(moduleName);
    if (schemaIt != _moduleSchemas.end()) {
        const auto* paramDef = schemaIt->second.getParameter(section, parameter);
        if (paramDef) {
            if (paramDef->validation.readOnly) {
                xSemaphoreGive(_mutex);
                return false;
            }

            if (!paramDef->validate(value)) {
                xSemaphoreGive(_mutex);
                _stats.validationErrors++;
                return false;
            }
        }
    }

    // Get current value for change detection
    String currentValue = _configValues[moduleName][section][parameter];

    // Set new value
    _configValues[moduleName][section][parameter] = value;
    _dirtyModules.insert(moduleName);
    _stats.configWrites++;
    _stats.lastActivity = millis();

    xSemaphoreGive(_mutex);

    // Notify change if value actually changed
    if (currentValue != value) {
        notifyConfigurationChanged(moduleName, section, parameter, value);
    }

    return true;
}

int UnifiedConfigSystem::getConfigInt(const String& moduleName, const String& section, const String& parameter, int defaultValue) const {
    String value = getConfigValue(moduleName, section, parameter, String(defaultValue));
    return value.toInt();
}

float UnifiedConfigSystem::getConfigFloat(const String& moduleName, const String& section, const String& parameter, float defaultValue) const {
    String value = getConfigValue(moduleName, section, parameter, String(defaultValue));
    return value.toFloat();
}

bool UnifiedConfigSystem::getConfigBool(const String& moduleName, const String& section, const String& parameter, bool defaultValue) const {
    String value = getConfigValue(moduleName, section, parameter, defaultValue ? "true" : "false");
    return (value == "true" || value == "1");
}

bool UnifiedConfigSystem::setConfigInt(const String& moduleName, const String& section, const String& parameter, int value) {
    return setConfigValue(moduleName, section, parameter, String(value));
}

bool UnifiedConfigSystem::setConfigFloat(const String& moduleName, const String& section, const String& parameter, float value) {
    return setConfigValue(moduleName, section, parameter, String(value));
}

bool UnifiedConfigSystem::setConfigBool(const String& moduleName, const String& section, const String& parameter, bool value) {
    return setConfigValue(moduleName, section, parameter, value ? "true" : "false");
}

// ========================================================================
// Module Configuration Management
// ========================================================================

String UnifiedConfigSystem::getModuleConfig(const String& moduleName) const {
    if (!_initialized) return "{}";

    DynamicJsonDocument doc(Framework::JSON_LARGE_BUFFER);

    if (xSemaphoreTake(_mutex, pdMS_TO_TICKS(1000)) == pdTRUE) {
        auto moduleIt = _configValues.find(moduleName);
        if (moduleIt != _configValues.end()) {
            for (const auto& sectionPair : moduleIt->second) {
                JsonObject sectionObj = doc.createNestedObject(sectionPair.first);
                for (const auto& paramPair : sectionPair.second) {
                    sectionObj[paramPair.first] = paramPair.second;
                }
            }
        }
        xSemaphoreGive(_mutex);
    }

    String result;
    serializeJson(doc, result);
    return result;
}

bool UnifiedConfigSystem::setModuleConfig(const String& moduleName, const String& configJson) {
    if (!_initialized) return false;

    DynamicJsonDocument doc(Framework::JSON_LARGE_BUFFER);
    if (deserializeJson(doc, configJson) != DeserializationError::Ok) {
        return false;
    }

    bool success = true;

    for (JsonPair sectionPair : doc.as<JsonObject>()) {
        String sectionName = sectionPair.key().c_str();
        JsonObject sectionObj = sectionPair.value();

        for (JsonPair paramPair : sectionObj) {
            String paramName = paramPair.key().c_str();
            String paramValue = paramPair.value().as<String>();

            if (!setConfigValue(moduleName, sectionName, paramName, paramValue)) {
                success = false;
            }
        }
    }

    return success;
}

String UnifiedConfigSystem::getSectionConfig(const String& moduleName, const String& section) const {
    if (!_initialized) return "{}";

    DynamicJsonDocument doc(Framework::JSON_MEDIUM_BUFFER);

    if (xSemaphoreTake(_mutex, pdMS_TO_TICKS(1000)) == pdTRUE) {
        auto moduleIt = _configValues.find(moduleName);
        if (moduleIt != _configValues.end()) {
            auto sectionIt = moduleIt->second.find(section);
            if (sectionIt != moduleIt->second.end()) {
                for (const auto& paramPair : sectionIt->second) {
                    doc[paramPair.first] = paramPair.second;
                }
            }
        }
        xSemaphoreGive(_mutex);
    }

    String result;
    serializeJson(doc, result);
    return result;
}

bool UnifiedConfigSystem::setSectionConfig(const String& moduleName, const String& section, const String& configJson) {
    if (!_initialized) return false;

    DynamicJsonDocument doc(Framework::JSON_MEDIUM_BUFFER);
    if (deserializeJson(doc, configJson) != DeserializationError::Ok) {
        return false;
    }

    bool success = true;

    for (JsonPair paramPair : doc.as<JsonObject>()) {
        String paramName = paramPair.key().c_str();
        String paramValue = paramPair.value().as<String>();

        if (!setConfigValue(moduleName, section, paramName, paramValue)) {
            success = false;
        }
    }

    return success;
}

bool UnifiedConfigSystem::resetModuleToDefaults(const String& moduleName) {
    if (!_initialized) return false;

    auto schemaIt = _moduleSchemas.find(moduleName);
    if (schemaIt == _moduleSchemas.end()) {
        return false;
    }

    bool success = true;

    for (const auto& section : schemaIt->second.sections) {
        for (const auto& param : section.parameters) {
            if (!setConfigValue(moduleName, section.name, param.name, param.defaultValue)) {
                success = false;
            }
        }
    }

    return success;
}

bool UnifiedConfigSystem::resetAllToDefaults() {
    if (!_initialized) return false;

    bool success = true;

    for (const auto& schemaPair : _moduleSchemas) {
        if (!resetModuleToDefaults(schemaPair.first)) {
            success = false;
        }
    }

    // Reset legacy configuration
    _legacyConfig.setDefaults();

    return success;
}

// ========================================================================
// Legacy Configuration Support
// ========================================================================

bool UnifiedConfigSystem::setLegacyConfig(const LegacyConfig::ApplicationConfig& config) {
    if (!_initialized) return false;

    if (xSemaphoreTake(_mutex, pdMS_TO_TICKS(1000)) != pdTRUE) {
        return false;
    }

    if (!config.validate()) {
        xSemaphoreGive(_mutex);
        return false;
    }

    _legacyConfig = config;
    _dirtyModules.insert("legacy");

    xSemaphoreGive(_mutex);
    return true;
}

bool UnifiedConfigSystem::loadLegacyConfig() {
    if (!_initialized) return false;

    String configPath = _configBasePath + "/app.json";
    return _legacyConfig.loadFromFile(configPath);
}

bool UnifiedConfigSystem::saveLegacyConfig() {
    if (!_initialized) return false;

    String configPath = _configBasePath + "/app.json";
    return _legacyConfig.saveToFile(configPath);
}

bool UnifiedConfigSystem::saveTagConfig(const LegacyConfig::TagInstanceConfig& tag) {
    if (!_initialized || !tag.validate()) return false;

    if (xSemaphoreTake(_mutex, pdMS_TO_TICKS(1000)) != pdTRUE) {
        return false;
    }

    _tagConfigs[tag.mac] = tag;

    xSemaphoreGive(_mutex);

    // Save to file
    String tagPath = getTagConfigPath(tag.mac);
    return tag.saveToFile(tagPath);
}

bool UnifiedConfigSystem::loadTagConfig(const String& mac, LegacyConfig::TagInstanceConfig& tag) {
    if (!_initialized || mac.isEmpty()) return false;

    // Try cache first
    if (xSemaphoreTake(_mutex, pdMS_TO_TICKS(1000)) == pdTRUE) {
        auto it = _tagConfigs.find(mac);
        if (it != _tagConfigs.end()) {
            tag = it->second;
            xSemaphoreGive(_mutex);
            return true;
        }
        xSemaphoreGive(_mutex);
    }

    // Load from file
    String tagPath = getTagConfigPath(mac);
    if (tag.loadFromFile(tagPath)) {
        // Cache the result
        if (xSemaphoreTake(_mutex, pdMS_TO_TICKS(1000)) == pdTRUE) {
            _tagConfigs[mac] = tag;
            xSemaphoreGive(_mutex);
        }
        return true;
    }

    return false;
}

bool UnifiedConfigSystem::removeTagConfig(const String& mac) {
    if (!_initialized || mac.isEmpty()) return false;

    if (xSemaphoreTake(_mutex, pdMS_TO_TICKS(1000)) != pdTRUE) {
        return false;
    }

    _tagConfigs.erase(mac);

    xSemaphoreGive(_mutex);

    // Remove file
    String tagPath = getTagConfigPath(mac);
    if (_fileSystem->exists(tagPath)) {
        return _fileSystem->remove(tagPath);
    }

    return true;
}

bool UnifiedConfigSystem::tagExists(const String& mac) {
    if (!_initialized || mac.isEmpty()) return false;

    // Check cache first
    if (xSemaphoreTake(_mutex, pdMS_TO_TICKS(1000)) == pdTRUE) {
        bool exists = _tagConfigs.find(mac) != _tagConfigs.end();
        xSemaphoreGive(_mutex);
        if (exists) return true;
    }

    // Check file system
    String tagPath = getTagConfigPath(mac);
    return _fileSystem->exists(tagPath);
}

std::vector<LegacyConfig::TagInstanceConfig> UnifiedConfigSystem::getAllTags() {
    std::vector<LegacyConfig::TagInstanceConfig> tags;

    if (!_initialized) return tags;

    if (xSemaphoreTake(_mutex, pdMS_TO_TICKS(1000)) == pdTRUE) {
        for (const auto& pair : _tagConfigs) {
            tags.push_back(pair.second);
        }
        xSemaphoreGive(_mutex);
    }

    return tags;
}

std::vector<String> UnifiedConfigSystem::getTagMacs() {
    std::vector<String> macs;

    if (!_initialized) return macs;

    if (xSemaphoreTake(_mutex, pdMS_TO_TICKS(1000)) == pdTRUE) {
        for (const auto& pair : _tagConfigs) {
            macs.push_back(pair.first);
        }
        xSemaphoreGive(_mutex);
    }

    return macs;
}

bool UnifiedConfigSystem::clearAllTags() {
    if (!_initialized) return false;

    if (xSemaphoreTake(_mutex, pdMS_TO_TICKS(1000)) != pdTRUE) {
        return false;
    }

    _tagConfigs.clear();

    xSemaphoreGive(_mutex);

    // Remove all tag files
    String tagsDir = _configBasePath + "/tags";
    File dir = _fileSystem->open(tagsDir);
    if (dir && dir.isDirectory()) {
        File file = dir.openNextFile();
        while (file) {
            if (!file.isDirectory()) {
                _fileSystem->remove(tagsDir + "/" + file.name());
            }
            file = dir.openNextFile();
        }
    }

    return true;
}

// ========================================================================
// NVS/Preferences Storage (legacy support)
// ========================================================================

String UnifiedConfigSystem::getNVSString(const String& nameSpace, const String& key, const String& defaultValue) {
    if (!_initialized) return defaultValue;

    if (_preferences.begin(nameSpace.c_str(), true)) {
        String value = _preferences.getString(key.c_str(), defaultValue);
        _preferences.end();
        return value;
    }

    return defaultValue;
}

bool UnifiedConfigSystem::setNVSString(const String& nameSpace, const String& key, const String& value) {
    if (!_initialized) return false;

    if (_preferences.begin(nameSpace.c_str(), false)) {
        size_t written = _preferences.putString(key.c_str(), value);
        _preferences.end();
        return written > 0;
    }

    return false;
}

int32_t UnifiedConfigSystem::getNVSInt(const String& nameSpace, const String& key, int32_t defaultValue) {
    if (!_initialized) return defaultValue;

    if (_preferences.begin(nameSpace.c_str(), true)) {
        int32_t value = _preferences.getInt(key.c_str(), defaultValue);
        _preferences.end();
        return value;
    }

    return defaultValue;
}

bool UnifiedConfigSystem::setNVSInt(const String& nameSpace, const String& key, int32_t value) {
    if (!_initialized) return false;

    if (_preferences.begin(nameSpace.c_str(), false)) {
        size_t written = _preferences.putInt(key.c_str(), value);
        _preferences.end();
        return written > 0;
    }

    return false;
}

bool UnifiedConfigSystem::getNVSBool(const String& nameSpace, const String& key, bool defaultValue) {
    if (!_initialized) return defaultValue;

    if (_preferences.begin(nameSpace.c_str(), true)) {
        bool value = _preferences.getBool(key.c_str(), defaultValue);
        _preferences.end();
        return value;
    }

    return defaultValue;
}

bool UnifiedConfigSystem::setNVSBool(const String& nameSpace, const String& key, bool value) {
    if (!_initialized) return false;

    if (_preferences.begin(nameSpace.c_str(), false)) {
        size_t written = _preferences.putBool(key.c_str(), value);
        _preferences.end();
        return written > 0;
    }

    return false;
}

// ========================================================================
// Internal Helper Methods
// ========================================================================

void UnifiedConfigSystem::notifyConfigurationChanged(const String& moduleName, const String& section, const String& parameter, const String& newValue) {
    auto callbackIt = _changeCallbacks.find(moduleName);
    if (callbackIt != _changeCallbacks.end() && callbackIt->second) {
        callbackIt->second(section, parameter, newValue);
    }
}

String UnifiedConfigSystem::getStorageKey(const String& moduleName, const String& section, const String& parameter) const {
    if (!section.isEmpty() && !parameter.isEmpty()) {
        return moduleName + "." + section + "." + parameter;
    } else if (!section.isEmpty()) {
        return moduleName + "." + section;
    } else {
        return moduleName;
    }
}

String UnifiedConfigSystem::getConfigPath(const String& moduleName, const String& filename) const {
    String path = _configBasePath + "/modules/" + moduleName;
    if (!filename.isEmpty()) {
        path += "/" + filename;
    } else {
        path += ".json";
    }
    return path;
}

String UnifiedConfigSystem::getTagConfigPath(const String& mac) const {
    return _configBasePath + "/tags/" + mac + ".json";
}

bool UnifiedConfigSystem::saveToFile(const String& path, const String& content) const {
    if (!_fileSystem) return false;

    File file = _fileSystem->open(path, "w");
    if (!file) {
        return false;
    }

    size_t written = file.print(content);
    file.close();

    return written == content.length();
}

String UnifiedConfigSystem::loadFromFile(const String& path, const String& defaultValue) const {
    if (!_fileSystem || !_fileSystem->exists(path)) {
        return defaultValue;
    }

    File file = _fileSystem->open(path, "r");
    if (!file) {
        return defaultValue;
    }

    String content = file.readString();
    file.close();

    return content.isEmpty() ? defaultValue : content;
}

bool UnifiedConfigSystem::saveToNVS(const String& nameSpace, const String& key, const String& value) {
    return setNVSString(nameSpace, key, value);
}

String UnifiedConfigSystem::loadFromNVS(const String& nameSpace, const String& key, const String& defaultValue) const {
    return getNVSString(nameSpace, key, defaultValue);
}

// ========================================================================
// Configuration Persistence
// ========================================================================

bool UnifiedConfigSystem::saveAllConfigurations() {
    if (!_initialized) return false;

    bool success = true;

    // Save legacy configuration
    if (!saveLegacyConfig()) {
        success = false;
    }

    // Save module configurations
    for (const auto& moduleName : _dirtyModules) {
        if (!saveModuleConfiguration(moduleName)) {
            success = false;
        }
    }

    if (success) {
        _dirtyModules.clear();
        _stats.saveOperations++;
    }

    return success;
}

bool UnifiedConfigSystem::loadAllConfigurations() {
    if (!_initialized) return false;

    bool success = true;

    // Load legacy configuration
    if (!loadLegacyConfig()) {
        success = false;
    }

    // Load module configurations
    for (const auto& schemaPair : _moduleSchemas) {
        if (!loadModuleConfiguration(schemaPair.first)) {
            success = false;
        }
    }

    if (success) {
        _stats.loadOperations++;
    }

    return success;
}

bool UnifiedConfigSystem::saveModuleConfiguration(const String& moduleName) {
    if (!_initialized) return false;

    String configJson = getModuleConfig(moduleName);
    String configPath = getConfigPath(moduleName);

    return saveToFile(configPath, configJson);
}

bool UnifiedConfigSystem::loadModuleConfiguration(const String& moduleName) {
    if (!_initialized) return false;

    String configPath = getConfigPath(moduleName);
    String configJson = loadFromFile(configPath);

    if (configJson.isEmpty() || configJson == "{}") {
        // Initialize with defaults
        return resetModuleToDefaults(moduleName);
    }

    return setModuleConfig(moduleName, configJson);
}

bool UnifiedConfigSystem::hasUnsavedChanges() const {
    if (xSemaphoreTake(_mutex, pdMS_TO_TICKS(100)) == pdTRUE) {
        bool dirty = !_dirtyModules.empty();
        xSemaphoreGive(_mutex);
        return dirty;
    }
    return false;
}

std::vector<String> UnifiedConfigSystem::getChangedModules() const {
    std::vector<String> modules;

    if (xSemaphoreTake(_mutex, pdMS_TO_TICKS(100)) == pdTRUE) {
        for (const auto& module : _dirtyModules) {
            modules.push_back(module);
        }
        xSemaphoreGive(_mutex);
    }

    return modules;
}

void UnifiedConfigSystem::setAutoSave(bool enabled, uint32_t intervalMs) {
    _autoSaveEnabled = enabled;
    _autoSaveInterval = intervalMs;
    _lastAutoSave = millis();
}

void UnifiedConfigSystem::onConfigurationChanged(const String& moduleName,
                                                 std::function<void(const String& section, const String& parameter, const String& newValue)> callback) {
    if (xSemaphoreTake(_mutex, pdMS_TO_TICKS(1000)) == pdTRUE) {
        _changeCallbacks[moduleName] = callback;
        xSemaphoreGive(_mutex);
    }
}

void UnifiedConfigSystem::removeConfigurationCallback(const String& moduleName) {
    if (xSemaphoreTake(_mutex, pdMS_TO_TICKS(1000)) == pdTRUE) {
        _changeCallbacks.erase(moduleName);
        xSemaphoreGive(_mutex);
    }
}

// ========================================================================
// Utility Methods
// ========================================================================

String UnifiedConfigSystem::getStatsJson() const {
    DynamicJsonDocument doc(Framework::JSON_SMALL_BUFFER);

    doc["configReads"] = _stats.configReads;
    doc["configWrites"] = _stats.configWrites;
    doc["validationErrors"] = _stats.validationErrors;
    doc["saveOperations"] = _stats.saveOperations;
    doc["loadOperations"] = _stats.loadOperations;
    doc["lastActivity"] = _stats.lastActivity;
    doc["registeredModules"] = _moduleSchemas.size();
    doc["dirtyModules"] = _dirtyModules.size();
    doc["cachedTags"] = _tagConfigs.size();
    doc["autoSaveEnabled"] = _autoSaveEnabled;
    doc["autoSaveInterval"] = _autoSaveInterval;

    String result;
    serializeJson(doc, result);
    return result;
}

uint64_t UnifiedConfigSystem::getFreeSpace() const {
    if (!_fileSystem) return 0;

    // This is implementation specific - LittleFS doesn't have a direct method
    // We'll use a basic estimation
    return 1024 * 1024;  // 1MB estimate
}

uint64_t UnifiedConfigSystem::getTotalSpace() const {
    if (!_fileSystem) return 0;

    // This is implementation specific
    return 4 * 1024 * 1024;  // 4MB estimate
}

bool UnifiedConfigSystem::isHealthy() const {
    return _initialized && _fileSystem != nullptr;
}

// ========================================================================
// Configuration Schema Builder Implementation
// ========================================================================

ConfigSchemaBuilder::ConfigSchemaBuilder(const String& moduleName, const String& version, const String& description)
    : _currentSection(nullptr), _currentParameter(nullptr) {
    _schema.moduleName = moduleName;
    _schema.moduleVersion = version;
    _schema.description = description;
}

ConfigSchemaBuilder& ConfigSchemaBuilder::beginSection(const String& name, const String& description, const String& icon) {
    if (_currentSection) {
        endSection();
    }

    ConfigSectionDefinition section;
    section.name = name;
    section.description = description;
    section.icon = icon;
    section.displayOrder = _schema.sections.size();

    _schema.sections.push_back(section);
    _currentSection = &_schema.sections.back();

    return *this;
}

ConfigSchemaBuilder& ConfigSchemaBuilder::endSection() {
    _currentSection = nullptr;
    _currentParameter = nullptr;
    return *this;
}

ConfigSchemaBuilder& ConfigSchemaBuilder::addString(const String& name, const String& defaultValue, const String& description) {
    if (!_currentSection) return *this;

    ConfigParameterDefinition param;
    param.name = name;
    param.description = description;
    param.type = ConfigValueType::STRING;
    param.defaultValue = defaultValue;
    param.displayOrder = _currentSection->parameters.size();

    _currentSection->parameters.push_back(param);
    _currentParameter = &_currentSection->parameters.back();

    return *this;
}

ConfigSchemaBuilder& ConfigSchemaBuilder::addInteger(const String& name, int defaultValue, const String& description) {
    if (!_currentSection) return *this;

    ConfigParameterDefinition param;
    param.name = name;
    param.description = description;
    param.type = ConfigValueType::INTEGER;
    param.defaultValue = String(defaultValue);
    param.displayOrder = _currentSection->parameters.size();

    _currentSection->parameters.push_back(param);
    _currentParameter = &_currentSection->parameters.back();

    return *this;
}

ConfigSchemaBuilder& ConfigSchemaBuilder::addBoolean(const String& name, bool defaultValue, const String& description) {
    if (!_currentSection) return *this;

    ConfigParameterDefinition param;
    param.name = name;
    param.description = description;
    param.type = ConfigValueType::BOOLEAN;
    param.defaultValue = defaultValue ? "true" : "false";
    param.displayOrder = _currentSection->parameters.size();

    _currentSection->parameters.push_back(param);
    _currentParameter = &_currentSection->parameters.back();

    return *this;
}

ConfigSchemaBuilder& ConfigSchemaBuilder::addEnum(const String& name, const std::vector<String>& options, const String& defaultValue, const String& description) {
    if (!_currentSection) return *this;

    ConfigParameterDefinition param;
    param.name = name;
    param.description = description;
    param.type = ConfigValueType::ENUM;
    param.defaultValue = defaultValue.isEmpty() && !options.empty() ? options[0] : defaultValue;
    param.validation.enumValues = options;
    param.displayOrder = _currentSection->parameters.size();

    _currentSection->parameters.push_back(param);
    _currentParameter = &_currentSection->parameters.back();

    return *this;
}

ConfigSchemaBuilder& ConfigSchemaBuilder::required(bool isRequired) {
    if (_currentParameter) {
        _currentParameter->validation.required = isRequired;
    }
    return *this;
}

ConfigSchemaBuilder& ConfigSchemaBuilder::readOnly(bool isReadOnly) {
    if (_currentParameter) {
        _currentParameter->validation.readOnly = isReadOnly;
    }
    return *this;
}

ConfigSchemaBuilder& ConfigSchemaBuilder::range(const String& minValue, const String& maxValue) {
    if (_currentParameter) {
        _currentParameter->validation.minValue = minValue;
        _currentParameter->validation.maxValue = maxValue;
    }
    return *this;
}

ConfigSchemaBuilder& ConfigSchemaBuilder::help(const String& helpText) {
    if (_currentParameter) {
        _currentParameter->helpText = helpText;
    }
    return *this;
}

ModuleConfigDefinition ConfigSchemaBuilder::build() {
    endSection();  // Ensure last section is properly finalized
    return _schema;
}
