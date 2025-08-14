/**
 * @file module_template.h
 * @brief Template for Creating Framework-Based Modules
 *
 * This template demonstrates how to create new modules using the common framework.
 * It provides a standardized structure and all the necessary boilerplate code.
 *
 * To create a new module:
 * 1. Copy this template
 * 2. Replace "Template" with your module name
 * 3. Update the CONFIG_NAMESPACE
 * 4. Implement the required virtual methods
 * 5. Add your specific functionality
 */

#pragma once

#include "common_framework.h"

// ============================================================================
// Example Module Template
// ============================================================================

class TemplateModule : public EnhancedModuleBase {
   private:
    // Configuration section name - CHANGE THIS for your module
    static constexpr const char* CONFIG_NAMESPACE = "template_module";

    // Module-specific members
    bool _isEnabled;
    uint32_t _operationInterval;
    uint32_t _lastOperation;
    String _deviceId;

    // Module configuration structure
    struct TemplateConfig {
        bool enabled = true;
        uint32_t interval = 1000;
        String deviceId = "template_device";
        int parameter1 = 100;
        float parameter2 = 3.14;
        String parameter3 = "default_value";

        // Convert to/from JSON for easy configuration management
        String toJson() const {
            DynamicJsonDocument doc(Framework::JSON_MEDIUM_BUFFER);
            doc["enabled"] = enabled;
            doc["interval"] = interval;
            doc["device_id"] = deviceId;
            doc["parameter1"] = parameter1;
            doc["parameter2"] = parameter2;
            doc["parameter3"] = parameter3;

            String result;
            serializeJson(doc, result);
            return result;
        }

        bool fromJson(const String& json) {
            DynamicJsonDocument doc(Framework::JSON_MEDIUM_BUFFER);
            if (deserializeJson(doc, json) != DeserializationError::Ok) {
                return false;
            }

            enabled = doc["enabled"] | enabled;
            interval = doc["interval"] | interval;
            deviceId = doc["device_id"].as<String>() | deviceId;
            parameter1 = doc["parameter1"] | parameter1;
            parameter2 = doc["parameter2"] | parameter2;
            parameter3 = doc["parameter3"].as<String>() | parameter3;

            return true;
        }

        bool validate() const {
            return interval >= 100 && interval <= 60000 && !deviceId.isEmpty();
        }
    } _config;

    // Module-specific statistics
    struct TemplateStats {
        uint32_t operationsCompleted = 0;
        uint32_t operationsFailed = 0;
        float averageExecutionTime = 0.0;
        uint32_t lastOperationTime = 0;
        String lastError = "";
    } _moduleStats;

    // Task handle for background operations (if needed)
    TaskHandle_t _backgroundTask;

   public:
    TemplateModule()
        : EnhancedModuleBase("TemplateModule", "1.0.0", "Template module demonstrating framework usage", ModuleType::SENSOR),
          _isEnabled(false),
          _operationInterval(1000),
          _lastOperation(0),
          _backgroundTask(nullptr) {
        // Set module capabilities
        _capabilities.supportsConfiguration = true;
        _capabilities.supportsRemoteControl = true;
        _capabilities.supportsStatusReporting = true;
        _capabilities.supportsMetrics = true;
        _capabilities.requiresNetwork = false;     // Set to true if module needs network
        _capabilities.requiresFileSystem = false;  // Set to true if module needs filesystem
    }

    virtual ~TemplateModule() {
        cleanup();
    }

    // ========================================================================
    // Framework Interface Implementation (REQUIRED)
    // ========================================================================

   protected:
    /**
     * Initialize the module
     * This is called once when the module is first loaded
     * Load configuration, initialize hardware, allocate resources
     */
    bool doInitialize() override {
        logInfo("Initializing template module");

        // Load configuration from persistent storage
        loadConfiguration();

        // Initialize hardware (pins, sensors, etc.)
        if (!initializeHardware()) {
            setError("Failed to initialize hardware");
            return false;
        }

        // Allocate any required resources
        if (!allocateResources()) {
            setError("Failed to allocate resources");
            return false;
        }

        // Register for events if needed
        eventSystem.subscribe("system.time_update",
                              [this](const String& event, const String& data) {
                                  handleTimeUpdate(data);
                              });

        _isEnabled = _config.enabled;
        logInfo("Template module initialized successfully");
        return true;
    }

    /**
     * Start the module
     * This is called to begin normal operation
     * Start background tasks, begin monitoring, etc.
     */
    bool doStart() override {
        logInfo("Starting template module");

        if (!_isEnabled) {
            logWarning("Module is disabled, not starting");
            return true;  // Not an error, just disabled
        }

        // Start background task if needed
        if (!startBackgroundTask()) {
            setError("Failed to start background task");
            return false;
        }

        // Begin normal operations
        _lastOperation = millis();

        // Publish start event
        PUBLISH_MODULE_EVENT(_name, "started", _config.deviceId);

        logInfo("Template module started successfully");
        return true;
    }

    /**
     * Stop the module
     * This should gracefully stop all operations
     * Stop tasks, close connections, etc.
     */
    bool doStop() override {
        logInfo("Stopping template module");

        // Stop background task
        stopBackgroundTask();

        // Cleanup any active operations
        cleanupActiveOperations();

        // Publish stop event
        PUBLISH_MODULE_EVENT(_name, "stopped", "");

        logInfo("Template module stopped");
        return true;
    }

    /**
     * Update method called periodically
     * Perform regular maintenance, check status, update statistics
     */
    void doUpdate() override {
        if (!_isEnabled || getState() != ModuleState::RUNNING) {
            return;
        }

        uint32_t now = millis();

        // Perform periodic operations
        if (now - _lastOperation >= _operationInterval) {
            performPeriodicOperation();
            _lastOperation = now;
        }

        // Update statistics
        updateStatistics();
    }

    /**
     * Handle events from the event system
     * Respond to system events, module events, etc.
     */
    void doHandleEvent(const String& event, const String& data) override {
        logDebug("Received event: " + event + " with data: " + data);

        if (event == "system.time_update") {
            handleTimeUpdate(data);
        } else if (event == "system.config_changed") {
            handleConfigChanged(data);
        } else if (event.startsWith(_name + ".")) {
            handleModuleSpecificEvent(event.substring(_name.length() + 1), data);
        }
    }

    // ========================================================================
    // Public API Methods
    // ========================================================================

   public:
    /**
     * Enable or disable the module
     */
    bool setEnabled(bool enabled) {
        _config.enabled = enabled;
        _isEnabled = enabled;
        saveConfiguration();

        PUBLISH_MODULE_EVENT(_name, "config_changed", "enabled=" + String(enabled));
        return true;
    }

    bool isEnabled() const {
        return _isEnabled;
    }

    /**
     * Set operation interval
     */
    bool setOperationInterval(uint32_t interval) {
        if (interval < 100 || interval > 60000) {
            return false;  // Invalid interval
        }

        _config.interval = interval;
        _operationInterval = interval;
        saveConfiguration();
        return true;
    }

    uint32_t getOperationInterval() const {
        return _operationInterval;
    }

    /**
     * Perform a manual operation
     */
    OperationResult performOperation() {
        if (!_isEnabled || getState() != ModuleState::RUNNING) {
            return OperationResult("Module not running or disabled");
        }

        logInfo("Performing manual operation");

        uint32_t startTime = millis();
        incrementOperationCount();

        // Simulate some operation
        bool success = doPerformOperation();

        uint32_t executionTime = millis() - startTime;
        updateExecutionTime(executionTime);

        if (success) {
            _moduleStats.operationsCompleted++;
            _moduleStats.lastOperationTime = startTime;
            logInfo("Operation completed successfully in " + String(executionTime) + "ms");
            return OperationResult(true);
        } else {
            _moduleStats.operationsFailed++;
            incrementErrorCount();
            logError("Operation failed");
            return OperationResult("Operation failed");
        }
    }

    /**
     * Get module-specific configuration
     */
    String getModuleConfig() const {
        return _config.toJson();
    }

    /**
     * Set module-specific configuration
     */
    bool setModuleConfig(const String& configJson) {
        TemplateConfig newConfig = _config;
        if (!newConfig.fromJson(configJson)) {
            return false;
        }

        if (!newConfig.validate()) {
            return false;
        }

        _config = newConfig;
        applyConfiguration();
        saveConfiguration();

        PUBLISH_MODULE_EVENT(_name, "config_updated", "");
        return true;
    }

    /**
     * Get module-specific statistics
     */
    String getModuleStats() const {
        DynamicJsonDocument doc(Framework::JSON_MEDIUM_BUFFER);

        doc["operations_completed"] = _moduleStats.operationsCompleted;
        doc["operations_failed"] = _moduleStats.operationsFailed;
        doc["success_rate"] = (_moduleStats.operationsCompleted + _moduleStats.operationsFailed) > 0 ? (float)_moduleStats.operationsCompleted / (_moduleStats.operationsCompleted + _moduleStats.operationsFailed) * 100.0 : 0.0;
        doc["average_execution_time"] = _moduleStats.averageExecutionTime;
        doc["last_operation_time"] = _moduleStats.lastOperationTime;
        doc["last_error"] = _moduleStats.lastError;

        String result;
        serializeJson(doc, result);
        return result;
    }

    /**
     * Reset module statistics
     */
    void resetModuleStats() {
        _moduleStats = TemplateStats{};
        logInfo("Module statistics reset");
    }

    /**
     * Register web API handlers
     */
    void registerWebHandlers(AsyncWebServer* server) {
        if (!server) return;

        // GET /api/template/status
        server->on("/api/template/status", HTTP_GET,
                   [this](AsyncWebServerRequest* request) {
                       handleGetStatus(request);
                   });

        // POST /api/template/operation
        server->on("/api/template/operation", HTTP_POST,
                   [this](AsyncWebServerRequest* request) {
                       handlePerformOperation(request);
                   });

        // GET /api/template/config
        server->on("/api/template/config", HTTP_GET,
                   [this](AsyncWebServerRequest* request) {
                       handleGetConfig(request);
                   });

        // PUT /api/template/config
        server->on("/api/template/config", HTTP_PUT,
                   [this](AsyncWebServerRequest* request) {
                       handleSetConfig(request);
                   });

        // GET /api/template/stats
        server->on("/api/template/stats", HTTP_GET,
                   [this](AsyncWebServerRequest* request) {
                       handleGetStats(request);
                   });
    }

    // ========================================================================
    // Private Implementation Methods
    // ========================================================================

   private:
    /**
     * Load configuration from persistent storage
     */
    void loadConfiguration() {
        String configJson = getConfigValue("config", _config.toJson());
        _config.fromJson(configJson);
        applyConfiguration();
        logDebug("Configuration loaded");
    }

    /**
     * Save configuration to persistent storage
     */
    void saveConfiguration() {
        setConfigValue("config", _config.toJson());
        logDebug("Configuration saved");
    }

    /**
     * Apply loaded configuration
     */
    void applyConfiguration() {
        _isEnabled = _config.enabled;
        _operationInterval = _config.interval;
        _deviceId = _config.deviceId;
        // Apply other configuration parameters...
    }

    /**
     * Initialize hardware components
     */
    bool initializeHardware() {
        // Initialize pins, sensors, actuators, etc.
        // Example:
        // pinMode(_config.pinNumber, OUTPUT);
        return true;
    }

    /**
     * Allocate required resources
     */
    bool allocateResources() {
        // Allocate memory, create mutexes, etc.
        return true;
    }

    /**
     * Start background task
     */
    bool startBackgroundTask() {
        if (_backgroundTask) {
            return true;  // Already running
        }

        BaseType_t result = xTaskCreate(
            backgroundTaskWrapper,
            "TemplateTask",
            4096,
            this,
            1,
            &_backgroundTask);

        return result == pdPASS;
    }

    /**
     * Stop background task
     */
    void stopBackgroundTask() {
        if (_backgroundTask) {
            vTaskDelete(_backgroundTask);
            _backgroundTask = nullptr;
        }
    }

    /**
     * Background task wrapper
     */
    static void backgroundTaskWrapper(void* parameter) {
        TemplateModule* module = static_cast<TemplateModule*>(parameter);
        module->backgroundTaskLoop();
    }

    /**
     * Background task main loop
     */
    void backgroundTaskLoop() {
        while (getState() == ModuleState::RUNNING) {
            // Perform background operations
            performBackgroundOperation();

            // Sleep for a bit
            vTaskDelay(pdMS_TO_TICKS(100));
        }
    }

    /**
     * Perform the main module operation
     */
    bool doPerformOperation() {
        // Implement your module's main functionality here
        // This is just a simulation
        vTaskDelay(pdMS_TO_TICKS(10));  // Simulate work
        return random(10) > 1;          // 90% success rate for testing
    }

    /**
     * Perform periodic operations
     */
    void performPeriodicOperation() {
        performOperation();
    }

    /**
     * Perform background operations
     */
    void performBackgroundOperation() {
        // Implement background tasks here
        // Examples: monitoring, housekeeping, etc.
    }

    /**
     * Cleanup active operations
     */
    void cleanupActiveOperations() {
        // Cleanup any in-progress operations
    }

    /**
     * Update statistics
     */
    void updateStatistics() {
        // Update any real-time statistics
    }

    /**
     * Update execution time statistics
     */
    void updateExecutionTime(uint32_t executionTime) {
        if (_moduleStats.averageExecutionTime == 0.0) {
            _moduleStats.averageExecutionTime = executionTime;
        } else {
            _moduleStats.averageExecutionTime = (_moduleStats.averageExecutionTime + executionTime) / 2.0;
        }
    }

    // Event handlers
    void handleTimeUpdate(const String& data) {
        // Handle time update events
    }

    void handleConfigChanged(const String& data) {
        // Handle configuration change events
        loadConfiguration();
    }

    void handleModuleSpecificEvent(const String& event, const String& data) {
        // Handle module-specific events
        logDebug("Module event: " + event + " = " + data);
    }

    // Web API handlers
    void handleGetStatus(AsyncWebServerRequest* request) {
        DynamicJsonDocument doc(Framework::JSON_MEDIUM_BUFFER);
        doc["enabled"] = _isEnabled;
        doc["state"] = static_cast<int>(getState());
        doc["device_id"] = _deviceId;
        doc["last_operation"] = _lastOperation;

        WebAPI::sendJsonResponse(request, doc);
    }

    void handlePerformOperation(AsyncWebServerRequest* request) {
        OperationResult result = performOperation();

        if (result.isSuccess()) {
            WebAPI::sendSuccessResponse(request, "Operation completed successfully");
        } else {
            WebAPI::sendErrorResponse(request, Framework::HttpStatus::INTERNAL_SERVER_ERROR,
                                      result.getError(), "operation_failed");
        }
    }

    void handleGetConfig(AsyncWebServerRequest* request) {
        String configJson = getModuleConfig();

        DynamicJsonDocument doc(Framework::JSON_MEDIUM_BUFFER);
        deserializeJson(doc, configJson);

        WebAPI::sendJsonResponse(request, doc.as<JsonObject>());
    }

    void handleSetConfig(AsyncWebServerRequest* request) {
        if (request->hasParam("config", true)) {
            String configJson = request->getParam("config", true)->value();

            if (setModuleConfig(configJson)) {
                WebAPI::sendSuccessResponse(request, "Configuration updated successfully");
            } else {
                WebAPI::sendErrorResponse(request, Framework::HttpStatus::BAD_REQUEST,
                                          "Invalid configuration", "config_validation_failed");
            }
        } else {
            WebAPI::sendErrorResponse(request, Framework::HttpStatus::BAD_REQUEST,
                                      "Missing configuration parameter", "missing_config");
        }
    }

    void handleGetStats(AsyncWebServerRequest* request) {
        String statsJson = getModuleStats();

        DynamicJsonDocument doc(Framework::JSON_MEDIUM_BUFFER);
        deserializeJson(doc, statsJson);

        WebAPI::sendJsonResponse(request, doc.as<JsonObject>());
    }
};

// ============================================================================
// Module Manager Integration
// ============================================================================

/**
 * Register the template module with the module manager
 * Call this during system initialization
 */
inline bool registerTemplateModule() {
    auto templateModule = std::make_unique<TemplateModule>();
    return ModuleManager::getInstance().registerModule(std::move(templateModule));
}

// ============================================================================
// Usage Examples and Documentation
// ============================================================================

/*
USAGE EXAMPLE:

1. In main.cpp or during system initialization:
   ```cpp
   #include "module_template.h"

   void setup() {
       // Initialize framework
       Framework::initialize();

       // Register the template module
       registerTemplateModule();

       // Initialize and start all modules
       ModuleManager::getInstance().initializeAll();
       ModuleManager::getInstance().startAll();
   }
   ```

2. Accessing the module:
   ```cpp
   auto* templateModule = ModuleManager::getInstance().getModule<TemplateModule>("TemplateModule");
   if (templateModule) {
       templateModule->setEnabled(true);
       templateModule->performOperation();
   }
   ```

3. Configuration via web API:
   ```bash
   # Get current configuration
   curl http://device/api/template/config

   # Update configuration
   curl -X PUT http://device/api/template/config \
        -d "config={\"enabled\":true,\"interval\":5000}"

   # Get status
   curl http://device/api/template/status

   # Trigger operation
   curl -X POST http://device/api/template/operation

   # Get statistics
   curl http://device/api/template/stats
   ```

4. Event handling:
   ```cpp
   // Subscribe to module events
   eventSystem.subscribe("TemplateModule.config_changed",
       [](const String& event, const String& data) {
           Serial.println("Template module config changed: " + data);
       });
   ```

CUSTOMIZATION CHECKLIST:

□ Change class name from "TemplateModule" to your module name
□ Update CONFIG_NAMESPACE to your module's namespace
□ Modify TemplateConfig structure with your parameters
□ Implement doInitialize() with your initialization logic
□ Implement doStart() with your startup logic
□ Implement doStop() with your shutdown logic
□ Add your specific functionality in doPerformOperation()
□ Update web API endpoints (change "/api/template/" to your paths)
□ Add hardware-specific initialization in initializeHardware()
□ Implement module-specific event handling
□ Add custom statistics and metrics
□ Update module capabilities in constructor
□ Add module-specific validation in config validate()
□ Implement any communication protocols needed
□ Add error handling for your specific use cases
□ Document your module's API and configuration options
*/
