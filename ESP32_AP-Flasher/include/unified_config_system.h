/**
 * @file unified_config_system.h
 * @brief Unified Configuration System - Consolidation of All Config Management
 *
 * This consolidates and replaces:
 * - json_config.h/cpp ConfigManager and AppConfig
 * - CentralizedConfigManager for module configurations
 * - core_utilities.h StorageManager for NVS operations
 * - Various scattered configuration structures
 *
 * Provides single, consistent API for all configuration needs.
 */

#pragma once

#include <ArduinoJson.h>
#include <Preferences.h>

#include <functional>
#include <map>
#include <vector>

#include "common_framework.h"

// ============================================================================
// Forward Declarations
// ============================================================================
class UnifiedConfigSystem;
extern UnifiedConfigSystem& unifiedConfig;

// ============================================================================
// Configuration Value Types and Validation
// ============================================================================

enum class ConfigValueType {
    STRING,
    INTEGER,
    FLOAT,
    BOOLEAN,
    JSON_OBJECT,
    IP_ADDRESS,
    MAC_ADDRESS,
    PIN_NUMBER,
    ENUM,
    ARRAY
};

struct ConfigValidationRule {
    String pattern;                  // Regex pattern for strings
    String minValue;                 // Minimum value (for numbers)
    String maxValue;                 // Maximum value (for numbers)
    std::vector<String> enumValues;  // Valid enum values
    std::function<bool(const String&)> customValidator;
    bool required = false;
    bool readOnly = false;

    bool validate(const String& value, ConfigValueType type) const;
};

struct ConfigParameterDefinition {
    String name;
    String description;
    ConfigValueType type;
    String defaultValue;
    ConfigValidationRule validation;

    // UI metadata
    String group;
    String helpText;
    String placeholder;
    bool sensitive = false;  // For passwords
    int displayOrder = 0;

    bool validate(const String& value) const {
        return validation.validate(value, type);
    }
};

struct ConfigSectionDefinition {
    String name;
    String description;
    String icon;
    bool visible = true;
    bool enabled = true;
    int displayOrder = 0;
    std::vector<ConfigParameterDefinition> parameters;

    const ConfigParameterDefinition* getParameter(const String& name) const;
    String toJson() const;
    bool fromJson(const String& json);
    bool validate() const;
};

struct ModuleConfigDefinition {
    String moduleName;
    String moduleVersion;
    String description;
    std::vector<ConfigSectionDefinition> sections;

    const ConfigSectionDefinition* getSection(const String& name) const;
    const ConfigParameterDefinition* getParameter(const String& sectionName, const String& paramName) const;
    String toJson() const;
    bool fromJson(const String& json);
    bool validate() const;
};

// ============================================================================
// Legacy Configuration Structures (for backward compatibility)
// ============================================================================

namespace LegacyConfig {

struct SystemConfig {
    String deviceName = "ESP32-AP-Flasher";
    String firmwareVersion = "2.0.0";
    uint32_t bootCount = 0;
    bool debugMode = false;
    uint8_t logLevel = 2;
    uint32_t heartbeatInterval = 60000;
    String timezone = "UTC";
    bool nightlyReboot = false;
    uint32_t maxSleep = 3600;

    String toJson() const;
    bool fromJson(const String& json);
    bool validate() const;
};

struct SecurityConfig {
    bool enableOTA = true;
    String otaPassword;
    bool enableAuth = false;
    String webUsername = "admin";
    String webPassword;

    String toJson() const;
    bool fromJson(const String& json);
    bool validate() const;
};

struct WiFiConfig {
    String ssid;
    String password;
    String hostname = "esp32-ap";
    bool useStaticIP = false;
    String staticIP;
    String gateway;
    String subnet;
    String dns1;
    String dns2;
    bool enableAP = true;
    String apSSID = "OpenEPaperLink-AP";
    String apPassword;
    uint8_t channel = 1;
    bool autoReconnect = true;
    bool powerSave = false;

    String toJson() const;
    bool fromJson(const String& json);
    bool validate() const;
};

struct HardwareConfig {
    bool hasSD = false;
    bool hasTFT = false;
    bool hasRGB = false;
    bool hasRC522 = false;
    bool hasIR = false;
    bool ledEnabled = true;
    bool tftEnabled = false;
    uint8_t language = 0;

    String toJson() const;
    bool fromJson(const String& json);
    bool validate() const;
};

struct TagConfig {
    uint16_t maxTags = 100;
    uint16_t defaultUpdateInterval = 300;
    bool autoDiscovery = true;
    bool enableBattery = true;
    int8_t rssiThreshold = -80;

    String toJson() const;
    bool fromJson(const String& json);
    bool validate() const;
};

// Consolidated Application Configuration
struct ApplicationConfig {
    SystemConfig system;
    SecurityConfig security;
    WiFiConfig wifi;
    HardwareConfig hardware;
    TagConfig tags;

    String toJson() const;
    bool fromJson(const String& json);
    bool validate() const;
    void setDefaults();
    bool saveToFile(const String& path) const;
    bool loadFromFile(const String& path);
};

// Individual Tag Configuration
struct TagInstanceConfig {
    String mac;
    String alias;
    uint8_t channel = 0;
    uint16_t updateInterval = 300;
    bool enabled = true;
    String contentType;
    uint32_t lastUpdate = 0;
    uint8_t batteryLevel = 0;
    int8_t rssi = 0;
    bool invert = false;
    uint8_t tagType = 0;
    uint16_t xRes = 0;
    uint16_t yRes = 0;
    uint32_t lastSeen = 0;
    uint16_t errorCount = 0;
    bool isOnline = false;

    String toJson() const;
    bool fromJson(const String& json);
    bool validate() const;
    bool saveToFile(const String& path) const;
    bool loadFromFile(const String& path);
};

}  // namespace LegacyConfig

// ============================================================================
// Unified Configuration System
// ============================================================================

class UnifiedConfigSystem {
   private:
    static UnifiedConfigSystem* _instance;

    // Configuration storage
    std::map<String, ModuleConfigDefinition> _moduleSchemas;
    std::map<String, std::map<String, std::map<String, String>>> _configValues;  // module -> section -> param -> value

    // Legacy configuration support
    LegacyConfig::ApplicationConfig _legacyConfig;
    std::map<String, LegacyConfig::TagInstanceConfig> _tagConfigs;

    // Storage backends
    Preferences _preferences;
    fs::FS* _fileSystem;

    // Change tracking and callbacks
    std::map<String, std::function<void(const String&, const String&, const String&)>> _changeCallbacks;
    std::set<String> _dirtyModules;

    // Thread safety
    mutable SemaphoreHandle_t _mutex;

    // Configuration persistence
    String _configBasePath;
    uint32_t _autoSaveInterval;
    uint32_t _lastAutoSave;
    bool _autoSaveEnabled;
    bool _initialized;

    // Statistics
    struct Stats {
        uint32_t configReads = 0;
        uint32_t configWrites = 0;
        uint32_t validationErrors = 0;
        uint32_t saveOperations = 0;
        uint32_t loadOperations = 0;
        uint32_t lastActivity = 0;
    } _stats;

   public:
    static UnifiedConfigSystem& getInstance();
    ~UnifiedConfigSystem();

    // ========================================================================
    // Core System Management
    // ========================================================================

    bool initialize(fs::FS* fileSystem = nullptr, const String& basePath = "/config");
    void cleanup();
    bool isInitialized() const { return _initialized; }
    void update();  // Call periodically for auto-save

    // ========================================================================
    // Module Schema Management
    // ========================================================================

    /**
     * Register a module's configuration schema
     */
    bool registerModuleSchema(const ModuleConfigDefinition& schema);

    /**
     * Unregister a module's schema
     */
    bool unregisterModule(const String& moduleName);

    /**
     * Get all registered modules
     */
    std::vector<String> getRegisteredModules() const;

    /**
     * Get module schema
     */
    const ModuleConfigDefinition* getModuleSchema(const String& moduleName) const;

    // ========================================================================
    // Configuration Value Access
    // ========================================================================

    /**
     * Get configuration value with validation
     */
    String getConfigValue(const String& moduleName, const String& section, const String& parameter, const String& defaultValue = "") const;

    /**
     * Set configuration value with validation
     */
    bool setConfigValue(const String& moduleName, const String& section, const String& parameter, const String& value);

    /**
     * Typed getters
     */
    int getConfigInt(const String& moduleName, const String& section, const String& parameter, int defaultValue = 0) const;
    float getConfigFloat(const String& moduleName, const String& section, const String& parameter, float defaultValue = 0.0f) const;
    bool getConfigBool(const String& moduleName, const String& section, const String& parameter, bool defaultValue = false) const;

    /**
     * Typed setters
     */
    bool setConfigInt(const String& moduleName, const String& section, const String& parameter, int value);
    bool setConfigFloat(const String& moduleName, const String& section, const String& parameter, float value);
    bool setConfigBool(const String& moduleName, const String& section, const String& parameter, bool value);

    // ========================================================================
    // Module Configuration Management
    // ========================================================================

    /**
     * Get entire module configuration as JSON
     */
    String getModuleConfig(const String& moduleName) const;

    /**
     * Set entire module configuration from JSON
     */
    bool setModuleConfig(const String& moduleName, const String& configJson);

    /**
     * Get section configuration as JSON
     */
    String getSectionConfig(const String& moduleName, const String& section) const;

    /**
     * Set section configuration from JSON
     */
    bool setSectionConfig(const String& moduleName, const String& section, const String& configJson);

    /**
     * Reset module to default values
     */
    bool resetModuleToDefaults(const String& moduleName);

    /**
     * Reset all configurations to defaults
     */
    bool resetAllToDefaults();

    // ========================================================================
    // Legacy Configuration Support
    // ========================================================================

    /**
     * Get legacy application configuration
     */
    const LegacyConfig::ApplicationConfig& getLegacyConfig() const { return _legacyConfig; }
    LegacyConfig::ApplicationConfig& getLegacyConfig() { return _legacyConfig; }

    /**
     * Set legacy application configuration
     */
    bool setLegacyConfig(const LegacyConfig::ApplicationConfig& config);

    /**
     * Load/save legacy configuration
     */
    bool loadLegacyConfig();
    bool saveLegacyConfig();

    /**
     * Tag configuration management
     */
    bool saveTagConfig(const LegacyConfig::TagInstanceConfig& tag);
    bool loadTagConfig(const String& mac, LegacyConfig::TagInstanceConfig& tag);
    bool removeTagConfig(const String& mac);
    bool tagExists(const String& mac);
    std::vector<LegacyConfig::TagInstanceConfig> getAllTags();
    std::vector<String> getTagMacs();
    bool clearAllTags();

    // ========================================================================
    // NVS/Preferences Storage (legacy support)
    // ========================================================================

    /**
     * NVS string operations
     */
    String getNVSString(const String& nameSpace, const String& key, const String& defaultValue = "");
    bool setNVSString(const String& nameSpace, const String& key, const String& value);

    /**
     * NVS integer operations
     */
    int32_t getNVSInt(const String& nameSpace, const String& key, int32_t defaultValue = 0);
    bool setNVSInt(const String& nameSpace, const String& key, int32_t value);

    /**
     * NVS boolean operations
     */
    bool getNVSBool(const String& nameSpace, const String& key, bool defaultValue = false);
    bool setNVSBool(const String& nameSpace, const String& key, bool value);

    // ========================================================================
    // Validation and Integrity
    // ========================================================================

    /**
     * Validate configuration value
     */
    bool validateValue(const String& moduleName, const String& section, const String& parameter, const String& value) const;

    /**
     * Validate module configuration
     */
    bool validateModuleConfig(const String& moduleName) const;

    /**
     * Get validation errors
     */
    std::vector<String> getValidationErrors(const String& moduleName) const;

    /**
     * Validate all configurations
     */
    bool validateAllConfigurations() const;

    // ========================================================================
    // Backup and Restore
    // ========================================================================

    /**
     * Backup configurations
     */
    bool backupConfigurations(const String& filename = "") const;

    /**
     * Restore configurations
     */
    bool restoreConfigurations(const String& filename);

    /**
     * Export/Import specific modules
     */
    bool exportModuleConfig(const String& moduleName, const String& filename) const;
    bool importModuleConfig(const String& moduleName, const String& filename);

    /**
     * Full configuration export/import
     */
    String exportAllToJson() const;
    bool importAllFromJson(const String& json);

    // ========================================================================
    // Change Notifications
    // ========================================================================

    /**
     * Register for configuration changes
     */
    void onConfigurationChanged(const String& moduleName,
                                std::function<void(const String& section, const String& parameter, const String& newValue)> callback);

    /**
     * Remove change callback
     */
    void removeConfigurationCallback(const String& moduleName);

    /**
     * Check for unsaved changes
     */
    bool hasUnsavedChanges() const;
    std::vector<String> getChangedModules() const;

    // ========================================================================
    // Persistence Management
    // ========================================================================

    /**
     * Auto-save configuration
     */
    void setAutoSave(bool enabled, uint32_t intervalMs = 30000);

    /**
     * Manual save/load operations
     */
    bool saveAllConfigurations();
    bool loadAllConfigurations();
    bool saveModuleConfiguration(const String& moduleName);
    bool loadModuleConfiguration(const String& moduleName);

    // ========================================================================
    // Web Interface
    // ========================================================================

    /**
     * Register web API handlers
     */
    void registerWebHandlers(AsyncWebServer* server);

    /**
     * Generate web UI
     */
    String generateConfigWebUI() const;
    String generateModuleConfigUI(const String& moduleName) const;

    // ========================================================================
    // Utility and Information
    // ========================================================================

    /**
     * Get configuration statistics
     */
    String getStatsJson() const;
    const Stats& getStats() const { return _stats; }
    void resetStats() { _stats = {}; }

    /**
     * Search configurations
     */
    std::vector<String> searchConfigurations(const String& query) const;

    /**
     * File system information
     */
    uint64_t getFreeSpace() const;
    uint64_t getTotalSpace() const;
    bool isHealthy() const;

   private:
    UnifiedConfigSystem();

    // Internal methods
    void notifyConfigurationChanged(const String& moduleName, const String& section, const String& parameter, const String& newValue);
    String getStorageKey(const String& moduleName, const String& section = "", const String& parameter = "") const;
    String getConfigPath(const String& moduleName, const String& filename = "") const;
    String getTagConfigPath(const String& mac) const;

    // Storage operations
    bool saveToFile(const String& path, const String& content) const;
    String loadFromFile(const String& path, const String& defaultValue = "") const;
    bool saveToNVS(const String& nameSpace, const String& key, const String& value);
    String loadFromNVS(const String& nameSpace, const String& key, const String& defaultValue = "") const;

    // Migration support
    bool migrateFromLegacyConfig();
    bool migrateLegacyModuleConfig(const String& moduleName);

    // Web handlers
    void handleGetAllConfigurations(AsyncWebServerRequest* request);
    void handleGetModuleConfiguration(AsyncWebServerRequest* request);
    void handleSetModuleConfiguration(AsyncWebServerRequest* request);
    void handleGetConfigSchema(AsyncWebServerRequest* request);
    void handleValidateConfiguration(AsyncWebServerRequest* request);
    void handleBackupConfiguration(AsyncWebServerRequest* request);
    void handleRestoreConfiguration(AsyncWebServerRequest* request);
    void handleResetConfiguration(AsyncWebServerRequest* request);
    void handleGetConfigUI(AsyncWebServerRequest* request);
};

// ============================================================================
// Configuration Schema Builder
// ============================================================================

class ConfigSchemaBuilder {
   private:
    ModuleConfigDefinition _schema;
    ConfigSectionDefinition* _currentSection;
    ConfigParameterDefinition* _currentParameter;

   public:
    ConfigSchemaBuilder(const String& moduleName, const String& version, const String& description);

    // Section management
    ConfigSchemaBuilder& beginSection(const String& name, const String& description = "", const String& icon = "");
    ConfigSchemaBuilder& endSection();

    // Parameter definition
    ConfigSchemaBuilder& addString(const String& name, const String& defaultValue = "", const String& description = "");
    ConfigSchemaBuilder& addInteger(const String& name, int defaultValue = 0, const String& description = "");
    ConfigSchemaBuilder& addFloat(const String& name, float defaultValue = 0.0f, const String& description = "");
    ConfigSchemaBuilder& addBoolean(const String& name, bool defaultValue = false, const String& description = "");
    ConfigSchemaBuilder& addIPAddress(const String& name, const String& defaultValue = "0.0.0.0", const String& description = "");
    ConfigSchemaBuilder& addMacAddress(const String& name, const String& defaultValue = "", const String& description = "");
    ConfigSchemaBuilder& addPin(const String& name, int defaultValue = -1, const String& description = "");
    ConfigSchemaBuilder& addEnum(const String& name, const std::vector<String>& options, const String& defaultValue = "", const String& description = "");

    // Parameter modifiers
    ConfigSchemaBuilder& required(bool isRequired = true);
    ConfigSchemaBuilder& readOnly(bool isReadOnly = true);
    ConfigSchemaBuilder& sensitive(bool isSensitive = true);
    ConfigSchemaBuilder& range(const String& minValue, const String& maxValue);
    ConfigSchemaBuilder& pattern(const String& regexPattern);
    ConfigSchemaBuilder& help(const String& helpText);
    ConfigSchemaBuilder& placeholder(const String& placeholderText);
    ConfigSchemaBuilder& group(const String& groupName);
    ConfigSchemaBuilder& order(int displayOrder);
    ConfigSchemaBuilder& validator(std::function<bool(const String&)> validatorFunc);

    // Build result
    ModuleConfigDefinition build();
};

// ============================================================================
// Convenience Macros
// ============================================================================

// Access unified configuration system
#define UNIFIED_CONFIG UnifiedConfigSystem::getInstance()

// Modern configuration access
#define MODULE_CONFIG_GET(module, section, param, def) \
    UNIFIED_CONFIG.getConfigValue(module, section, param, def)

#define MODULE_CONFIG_SET(module, section, param, val) \
    UNIFIED_CONFIG.setConfigValue(module, section, param, String(val))

#define MODULE_CONFIG_GET_INT(module, section, param, def) \
    UNIFIED_CONFIG.getConfigInt(module, section, param, def)

#define MODULE_CONFIG_GET_BOOL(module, section, param, def) \
    UNIFIED_CONFIG.getConfigBool(module, section, param, def)

#define MODULE_CONFIG_GET_FLOAT(module, section, param, def) \
    UNIFIED_CONFIG.getConfigFloat(module, section, param, def)

// Legacy application configuration access
#define LEGACY_CONFIG UNIFIED_CONFIG.getLegacyConfig()
#define SYSTEM_CONFIG LEGACY_CONFIG.system
#define WIFI_CONFIG LEGACY_CONFIG.wifi
#define HARDWARE_CONFIG LEGACY_CONFIG.hardware
#define SECURITY_CONFIG LEGACY_CONFIG.security
#define TAG_CONFIG LEGACY_CONFIG.tags

// Legacy NVS/Preferences access (backward compatibility)
#define STORAGE_GET_STRING(ns, key, def) UNIFIED_CONFIG.getNVSString(ns, key, def)
#define STORAGE_SET_STRING(ns, key, val) UNIFIED_CONFIG.setNVSString(ns, key, val)
#define STORAGE_GET_INT(ns, key, def) UNIFIED_CONFIG.getNVSInt(ns, key, def)
#define STORAGE_SET_INT(ns, key, val) UNIFIED_CONFIG.setNVSInt(ns, key, val)
#define STORAGE_GET_BOOL(ns, key, def) UNIFIED_CONFIG.getNVSBool(ns, key, def)
#define STORAGE_SET_BOOL(ns, key, val) UNIFIED_CONFIG.setNVSBool(ns, key, val)

// Schema builder macro
#define BUILD_MODULE_CONFIG(moduleName, version, description) \
    ConfigSchemaBuilder(moduleName, version, description)

// ============================================================================
// Pre-defined Configuration Schemas
// ============================================================================

namespace ConfigSchemas {

/**
 * Create standard module configuration schemas
 */
ModuleConfigDefinition createSystemSchema();
ModuleConfigDefinition createWiFiSchema();
ModuleConfigDefinition createSecuritySchema();
ModuleConfigDefinition createHardwareSchema();
ModuleConfigDefinition createTagSchema();
ModuleConfigDefinition createIRSchema();
ModuleConfigDefinition createRFIDSchema();
ModuleConfigDefinition createC6Schema();
ModuleConfigDefinition createWebServerSchema();
ModuleConfigDefinition createLoggingSchema();

/**
 * Register all standard schemas
 */
void registerAllStandardSchemas();

}  // namespace ConfigSchemas

// ============================================================================
// Global Instance
// ============================================================================

// Global access to unified configuration system
extern UnifiedConfigSystem& unifiedConfig;

/**
 * Usage Examples:
 *
 * 1. Register a module schema:
 *    auto schema = BUILD_MODULE_CONFIG("MyModule", "1.0.0", "My Module")
 *        .beginSection("general", "General Settings")
 *            .addString("device_name", "MyDevice", "Device name")
 *                .required()
 *                .help("Name displayed in UI")
 *            .addInteger("interval", 1000, "Update interval in ms")
 *                .range("100", "60000")
 *        .endSection()
 *        .build();
 *    UNIFIED_CONFIG.registerModuleSchema(schema);
 *
 * 2. Access configuration:
 *    String name = MODULE_CONFIG_GET("MyModule", "general", "device_name", "Default");
 *    int interval = MODULE_CONFIG_GET_INT("MyModule", "general", "interval", 1000);
 *
 * 3. Legacy configuration access:
 *    String ssid = WIFI_CONFIG.ssid;
 *    bool debugMode = SYSTEM_CONFIG.debugMode;
 *
 * 4. NVS access:
 *    String value = STORAGE_GET_STRING("namespace", "key", "default");
 *    STORAGE_SET_BOOL("settings", "enabled", true);
 */
