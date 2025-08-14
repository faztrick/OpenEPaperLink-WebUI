/**
 * @file centralized_config.h
 * @brief Centralized Configuration Management for All Modules
 *
 * This provides a unified interface for managing all module configurations
 * in one place, with validation, backup/restore, and web interface.
 */

#pragma once

#include <functional>
#include <map>

#include "common_framework.h"

// ============================================================================
// Configuration Schema Definition
// ============================================================================

enum class ConfigParameterType {
    STRING,
    INTEGER,
    FLOAT,
    BOOLEAN,
    ENUM,
    IP_ADDRESS,
    MAC_ADDRESS,
    PIN_NUMBER,
    FILE_PATH,
    JSON_OBJECT,
    ARRAY
};

struct ConfigParameter {
    String name;
    String description;
    ConfigParameterType type;
    String defaultValue;
    String currentValue;

    // Validation constraints
    String minValue;                 // For numeric types
    String maxValue;                 // For numeric types
    String pattern;                  // Regex pattern for strings
    std::vector<String> enumValues;  // For enum types
    bool required = false;
    bool readOnly = false;

    // UI hints
    String group;    // Configuration group
    String section;  // Configuration section
    int displayOrder = 0;
    String helpText;
    String placeholder;
    bool sensitive = false;  // For passwords, etc.

    // Validation function
    std::function<bool(const String&)> customValidator;

    // Conversion helpers
    bool validate(const String& value) const;
    String getDisplayValue() const;
    bool setValue(const String& value);
    bool isValid() const;
};

struct ConfigSection {
    String name;
    String description;
    String icon;
    std::vector<ConfigParameter> parameters;
    bool enabled = true;
    bool visible = true;
    int displayOrder = 0;

    // Get parameter by name
    ConfigParameter* getParameter(const String& name);
    const ConfigParameter* getParameter(const String& name) const;

    // JSON conversion
    String toJson() const;
    bool fromJson(const String& json);

    // Validation
    bool validate() const;
    std::vector<String> getValidationErrors() const;
};

struct ModuleConfigSchema {
    String moduleName;
    String moduleVersion;
    String description;
    std::vector<ConfigSection> sections;

    // Get section by name
    ConfigSection* getSection(const String& name);
    const ConfigSection* getSection(const String& name) const;

    // Get parameter by path (section.parameter)
    ConfigParameter* getParameter(const String& path);
    const ConfigParameter* getParameter(const String& path) const;

    // JSON conversion
    String toJson() const;
    bool fromJson(const String& json);

    // Validation
    bool validate() const;
    std::vector<String> getValidationErrors() const;
};

// ============================================================================
// Centralized Configuration Manager
// ============================================================================

class CentralizedConfigManager {
   private:
    static CentralizedConfigManager* instance;

    std::map<String, ModuleConfigSchema> moduleSchemas;
    std::map<String, String> configurationCache;
    mutable SemaphoreHandle_t _mutex;

    String _configBackupPath;
    uint32_t _autoSaveInterval;
    uint32_t _lastAutoSave;
    bool _autoSaveEnabled;

    // Configuration change callbacks
    std::map<String, std::function<void(const String&, const String&, const String&)>> changeCallbacks;

    CentralizedConfigManager();

   public:
    static CentralizedConfigManager& getInstance();
    ~CentralizedConfigManager();

    // ========================================================================
    // Schema Management
    // ========================================================================

    /**
     * Register a module's configuration schema
     */
    bool registerModuleSchema(const ModuleConfigSchema& schema);

    /**
     * Unregister a module's schema
     */
    bool unregisterModule(const String& moduleName);

    /**
     * Get all registered module schemas
     */
    std::vector<String> getRegisteredModules() const;

    /**
     * Get a module's schema
     */
    const ModuleConfigSchema* getModuleSchema(const String& moduleName) const;

    // ========================================================================
    // Configuration Access
    // ========================================================================

    /**
     * Get a configuration value
     */
    String getConfigValue(const String& moduleName, const String& section, const String& parameter) const;
    String getConfigValue(const String& path) const;  // module.section.parameter

    /**
     * Set a configuration value
     */
    bool setConfigValue(const String& moduleName, const String& section, const String& parameter, const String& value);
    bool setConfigValue(const String& path, const String& value);

    /**
     * Get entire module configuration
     */
    String getModuleConfig(const String& moduleName) const;

    /**
     * Set entire module configuration
     */
    bool setModuleConfig(const String& moduleName, const String& configJson);

    /**
     * Get configuration section
     */
    String getSectionConfig(const String& moduleName, const String& section) const;

    /**
     * Set configuration section
     */
    bool setSectionConfig(const String& moduleName, const String& section, const String& configJson);

    // ========================================================================
    // Validation and Integrity
    // ========================================================================

    /**
     * Validate a configuration value
     */
    bool validateValue(const String& moduleName, const String& section, const String& parameter, const String& value) const;

    /**
     * Validate entire module configuration
     */
    bool validateModuleConfig(const String& moduleName) const;

    /**
     * Get validation errors for a module
     */
    std::vector<String> getModuleValidationErrors(const String& moduleName) const;

    /**
     * Validate all configurations
     */
    bool validateAllConfigurations() const;

    /**
     * Get all validation errors
     */
    std::map<String, std::vector<String>> getAllValidationErrors() const;

    // ========================================================================
    // Backup and Restore
    // ========================================================================

    /**
     * Backup all configurations to file
     */
    bool backupConfigurations(const String& filename = "") const;

    /**
     * Restore configurations from file
     */
    bool restoreConfigurations(const String& filename);

    /**
     * Export specific module configuration
     */
    bool exportModuleConfig(const String& moduleName, const String& filename) const;

    /**
     * Import specific module configuration
     */
    bool importModuleConfig(const String& moduleName, const String& filename);

    /**
     * Get configuration as exportable JSON
     */
    String exportAllToJson() const;

    /**
     * Import configuration from JSON
     */
    bool importAllFromJson(const String& json);

    // ========================================================================
    // Change Tracking and Notifications
    // ========================================================================

    /**
     * Register for configuration change notifications
     */
    void onConfigurationChanged(const String& moduleName,
                                std::function<void(const String& section, const String& parameter, const String& newValue)> callback);

    /**
     * Unregister configuration change callback
     */
    void removeConfigurationCallback(const String& moduleName);

    /**
     * Check if configuration has changed since last save
     */
    bool hasUnsavedChanges() const;

    /**
     * Get list of changed modules
     */
    std::vector<String> getChangedModules() const;

    // ========================================================================
    // Auto-save and Persistence
    // ========================================================================

    /**
     * Enable/disable auto-save
     */
    void setAutoSave(bool enabled, uint32_t intervalMs = 30000);

    /**
     * Force save all configurations
     */
    bool saveAllConfigurations();

    /**
     * Load all configurations from storage
     */
    bool loadAllConfigurations();

    /**
     * Update method - call periodically for auto-save
     */
    void update();

    // ========================================================================
    // Web Interface
    // ========================================================================

    /**
     * Register web API handlers
     */
    void registerWebHandlers(AsyncWebServer* server);

    /**
     * Generate configuration web UI
     */
    String generateConfigWebUI() const;

    /**
     * Generate module-specific config UI
     */
    String generateModuleConfigUI(const String& moduleName) const;

    // ========================================================================
    // Utility Methods
    // ========================================================================

    /**
     * Reset module configuration to defaults
     */
    bool resetModuleToDefaults(const String& moduleName);

    /**
     * Reset all configurations to defaults
     */
    bool resetAllToDefaults();

    /**
     * Get configuration statistics
     */
    String getConfigurationStats() const;

    /**
     * Search configurations
     */
    std::vector<String> searchConfigurations(const String& query) const;

    /**
     * Get configuration dependencies
     */
    std::vector<String> getConfigurationDependencies(const String& path) const;

   private:
    // Internal methods
    void notifyConfigurationChanged(const String& moduleName, const String& section, const String& parameter, const String& newValue);
    String getStorageKey(const String& moduleName, const String& section = "", const String& parameter = "") const;
    bool saveToStorage(const String& key, const String& value);
    String loadFromStorage(const String& key, const String& defaultValue = "") const;

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
    void handleSearchConfiguration(AsyncWebServerRequest* request);
};

// Global instance
extern CentralizedConfigManager& centralizedConfig;

// ============================================================================
// Configuration Builder Helper
// ============================================================================

class ConfigSchemaBuilder {
   private:
    ModuleConfigSchema _schema;
    ConfigSection* _currentSection;

   public:
    ConfigSchemaBuilder(const String& moduleName, const String& version, const String& description);

    // Section management
    ConfigSchemaBuilder& beginSection(const String& name, const String& description = "", const String& icon = "");
    ConfigSchemaBuilder& endSection();

    // Parameter definition methods
    ConfigSchemaBuilder& addString(const String& name, const String& defaultValue = "", const String& description = "");
    ConfigSchemaBuilder& addInteger(const String& name, int defaultValue = 0, int minValue = INT_MIN, int maxValue = INT_MAX, const String& description = "");
    ConfigSchemaBuilder& addFloat(const String& name, float defaultValue = 0.0, float minValue = -FLT_MAX, float maxValue = FLT_MAX, const String& description = "");
    ConfigSchemaBuilder& addBoolean(const String& name, bool defaultValue = false, const String& description = "");
    ConfigSchemaBuilder& addEnum(const String& name, const std::vector<String>& options, const String& defaultValue = "", const String& description = "");
    ConfigSchemaBuilder& addIPAddress(const String& name, const String& defaultValue = "0.0.0.0", const String& description = "");
    ConfigSchemaBuilder& addPin(const String& name, int defaultValue = -1, const String& description = "");
    ConfigSchemaBuilder& addFilePath(const String& name, const String& defaultValue = "", const String& description = "");

    // Parameter modifiers
    ConfigSchemaBuilder& required(bool isRequired = true);
    ConfigSchemaBuilder& readOnly(bool isReadOnly = true);
    ConfigSchemaBuilder& sensitive(bool isSensitive = true);
    ConfigSchemaBuilder& pattern(const String& regexPattern);
    ConfigSchemaBuilder& help(const String& helpText);
    ConfigSchemaBuilder& placeholder(const String& placeholderText);
    ConfigSchemaBuilder& group(const String& groupName);
    ConfigSchemaBuilder& order(int displayOrder);
    ConfigSchemaBuilder& validator(std::function<bool(const String&)> validatorFunc);

    // Build the schema
    ModuleConfigSchema build();
};

// ============================================================================
// Configuration Macros for Easy Access
// ============================================================================

// Easy configuration access
#define CENTRAL_CONFIG_GET(module, section, param, def) \
    centralizedConfig.getConfigValue(module, section, param).isEmpty() ? String(def) : centralizedConfig.getConfigValue(module, section, param)

#define CENTRAL_CONFIG_SET(module, section, param, val) \
    centralizedConfig.setConfigValue(module, section, param, String(val))

#define CENTRAL_CONFIG_GET_INT(module, section, param, def) \
    CENTRAL_CONFIG_GET(module, section, param, def).toInt()

#define CENTRAL_CONFIG_GET_FLOAT(module, section, param, def) \
    CENTRAL_CONFIG_GET(module, section, param, def).toFloat()

#define CENTRAL_CONFIG_GET_BOOL(module, section, param, def)                     \
    (CENTRAL_CONFIG_GET(module, section, param, def).equalsIgnoreCase("true") || \
     CENTRAL_CONFIG_GET(module, section, param, def) == "1")

// Schema registration helper
#define REGISTER_MODULE_CONFIG(moduleName, version, description) \
    ConfigSchemaBuilder(moduleName, version, description)

// ============================================================================
// Pre-defined Configuration Schemas
// ============================================================================

namespace ConfigSchemas {
// WiFi configuration schema
ModuleConfigSchema createWiFiSchema();

// System configuration schema
ModuleConfigSchema createSystemSchema();

// IR configuration schema
ModuleConfigSchema createIRSchema();

// RFID configuration schema
ModuleConfigSchema createRFIDSchema();

// ESP32-C6 configuration schema
ModuleConfigSchema createC6Schema();

// Web server configuration schema
ModuleConfigSchema createWebServerSchema();

// Security configuration schema
ModuleConfigSchema createSecuritySchema();

// Logging configuration schema
ModuleConfigSchema createLoggingSchema();
}  // namespace ConfigSchemas

// ============================================================================
// Usage Examples
// ============================================================================

/*
USAGE EXAMPLE:

1. Define a module's configuration schema:
   ```cpp
   auto schema = REGISTER_MODULE_CONFIG("MyModule", "1.0.0", "My custom module")
       .beginSection("general", "General Settings", "settings")
           .addString("device_name", "MyDevice", "Name of the device")
               .required()
               .help("This name will be displayed in the UI")
           .addInteger("refresh_interval", 1000, 100, 60000, "Refresh interval in milliseconds")
           .addBoolean("enabled", true, "Enable this module")
       .endSection()
       .beginSection("advanced", "Advanced Settings", "tools")
           .addIPAddress("server_ip", "192.168.1.100", "Server IP address")
           .addEnum("log_level", {"DEBUG", "INFO", "WARNING", "ERROR"}, "INFO", "Logging level")
       .endSection()
       .build();

   centralizedConfig.registerModuleSchema(schema);
   ```

2. Access configuration values:
   ```cpp
   String deviceName = CENTRAL_CONFIG_GET("MyModule", "general", "device_name", "DefaultName");
   int interval = CENTRAL_CONFIG_GET_INT("MyModule", "general", "refresh_interval", 1000);
   bool enabled = CENTRAL_CONFIG_GET_BOOL("MyModule", "general", "enabled", true);
   ```

3. Set configuration values:
   ```cpp
   CENTRAL_CONFIG_SET("MyModule", "general", "device_name", "NewName");
   CENTRAL_CONFIG_SET("MyModule", "general", "refresh_interval", "5000");
   ```

4. Register for configuration changes:
   ```cpp
   centralizedConfig.onConfigurationChanged("MyModule",
       [](const String& section, const String& parameter, const String& newValue) {
           Serial.printf("Config changed: %s.%s = %s\n",
                        section.c_str(), parameter.c_str(), newValue.c_str());
       });
   ```

5. Web API usage:
   ```bash
   # Get all configurations
   curl http://device/api/config

   # Get module configuration
   curl http://device/api/config/MyModule

   # Set configuration
   curl -X PUT http://device/api/config/MyModule \
        -H "Content-Type: application/json" \
        -d '{"general":{"device_name":"NewName","enabled":true}}'

   # Backup configuration
   curl http://device/api/config/backup > config_backup.json

   # Restore configuration
   curl -X POST http://device/api/config/restore \
        -H "Content-Type: application/json" \
        -d @config_backup.json
   ```
*/
