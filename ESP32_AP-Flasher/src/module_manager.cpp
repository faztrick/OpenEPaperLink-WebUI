#include "module_manager.h"
#include "module_utils.h"

#include <ArduinoJson.h>
#include "storage.h"

// Global module manager instance
ModuleManager moduleManager;

// ModuleManager Implementation
// ============================

bool ModuleManager::registerModule(std::unique_ptr<ModuleInterface> module,
                                   bool autoStart,
                                   const std::vector<String> &dependencies)
{
    using namespace ModuleUtils;

    if (!module)
    {
        LogUtils::logError("[MODULE_MANAGER] Cannot register null module");
        return false;
    }

    ModuleInfo info = module->getInfo();

    // Validate module information
    if (!ValidationUtils::isValidModuleName(info.name))
    {
        LogUtils::logError("[MODULE_MANAGER] Invalid module name: " + info.name);
        return false;
    }

    if (!ValidationUtils::isValidVersion(info.version))
    {
        LogUtils::logError("[MODULE_MANAGER] Invalid module version: " + info.version);
        return false;
    }

    // Check for duplicate module names using optimized search
    if (findModule(info.name) != modules.end())
    {
        LogUtils::logError("[MODULE_MANAGER] Module '" + info.name + "' already registered");
        return false;
    }

    // Check memory availability for the module
    if (!MemoryUtils::hasEnoughMemory(1024))
    { // Assume 1KB minimum per module
        LogUtils::logError("[MODULE_MANAGER] Insufficient memory to register module: " + info.name);
        return false;
    }

    RegisteredModule regModule;
    regModule.instance = std::move(module);
    regModule.info = info;
    regModule.autoStart = autoStart;
    regModule.dependencies = dependencies;

    modules.push_back(std::move(regModule));

    LogUtils::logInfo("[MODULE_MANAGER] Registered module '" + info.name + "' v" + info.version);
    MemoryUtils::logMemoryUsage("After module registration");

    return true;
}

bool ModuleManager::initializeAll()
{
    using namespace ModuleUtils;

    if (initialized)
    {
        LogUtils::logWarning("[MODULE_MANAGER] Already initialized");
        return true;
    }

    startTime = millis();
    LogUtils::logInfo("[MODULE_MANAGER] Initializing all modules...");

    // Check system resources before initialization
    if (!MemoryUtils::hasEnoughMemory(4096))
    { // Minimum 4KB for initialization
        LogUtils::logError("[MODULE_MANAGER] Insufficient memory for initialization");
        return false;
    }

    // Resolve dependencies first
    if (!resolveDependencies())
    {
        LogUtils::logError("[MODULE_MANAGER] Dependency resolution failed");
        return false;
    }

    bool allSuccess = true;
    uint32_t successCount = 0;
    uint32_t totalCount = 0;

    // Initialize modules in dependency order
    for (auto &regModule : modules)
    {
        if (regModule.info.state == ModuleState::UNINITIALIZED)
        {
            totalCount++;
            LogUtils::logInfo("[MODULE_MANAGER] Initializing module: " + regModule.info.name);

            regModule.info.state = ModuleState::INITIALIZING;

            uint32_t initStart = millis();

            try
            {
                bool success = regModule.instance->initialize();
                regModule.info.initTime = millis() - initStart;

                if (success)
                {
                    regModule.info.state = ModuleState::INITIALIZED;
                    regModule.info.lastActivity = millis();
                    successCount++;
                    LogUtils::logInfo("[MODULE_MANAGER] Module '" + regModule.info.name +
                                      "' initialized in " + String(regModule.info.initTime) + "ms");
                }
                else
                {
                    regModule.info.state = ModuleState::ERROR;
                    regModule.info.errorMessage = "Initialization failed";
                    LogUtils::logModuleError(regModule.info.name, "Initialization failed");

                    // Check if this is a critical module
                    if (!regModule.info.capabilities.isOptional)
                    {
                        allSuccess = false;
                        LogUtils::logError("[MODULE_MANAGER] Critical module failed: " + regModule.info.name);
                    }
                }
            }
            catch (const std::exception &e)
            {
                regModule.info.state = ModuleState::ERROR;
                regModule.info.errorMessage = String("Exception: ") + e.what();
                LogUtils::logModuleError(regModule.info.name, "Exception during initialization: " + String(e.what()));

                if (!regModule.info.capabilities.isOptional)
                {
                    allSuccess = false;
                }
            }
            catch (...)
            {
                regModule.info.state = ModuleState::ERROR;
                regModule.info.errorMessage = "Unknown exception during initialization";
                LogUtils::logModuleError(regModule.info.name, "Unknown exception during initialization");

                if (!regModule.info.capabilities.isOptional)
                {
                    allSuccess = false;
                }
            }

            // Small delay to allow system to breathe
            delay(10);
        }
    }

    uint32_t totalTime = millis() - startTime;

    if (allSuccess)
    {
        initialized = true;
        LogUtils::logInfo("[MODULE_MANAGER] All modules initialized successfully: " +
                          String(successCount) + "/" + String(totalCount) +
                          " in " + String(totalTime) + "ms");
    }
    else
    {
        LogUtils::logError("[MODULE_MANAGER] Module initialization failed: " +
                           String(successCount) + "/" + String(totalCount) + " successful");
    }

    MemoryUtils::logMemoryUsage("After module initialization");

    return allSuccess;
}

bool ModuleManager::startAll()
{
    if (!initialized)
    {
        Serial.println("[MODULE_MANAGER] Must initialize before starting");
        return false;
    }

    Serial.println("[MODULE_MANAGER] Starting all auto-start modules...");

    bool allSuccess = true;

    for (auto &regModule : modules)
    {
        if (regModule.autoStart && regModule.info.state == ModuleState::INITIALIZED)
        {
            Serial.printf("[MODULE_MANAGER] Starting module '%s'\n",
                          regModule.info.name.c_str());

            bool success = regModule.instance->start();
            if (success)
            {
                regModule.info.state = ModuleState::ACTIVE;
                regModule.info.lastActivity = millis();
                Serial.printf("[MODULE_MANAGER] Module '%s' started successfully\n",
                              regModule.info.name.c_str());
            }
            else
            {
                regModule.info.state = ModuleState::ERROR;
                regModule.info.errorMessage = "Start failed";
                Serial.printf("[MODULE_MANAGER] Module '%s' start failed\n",
                              regModule.info.name.c_str());
                allSuccess = false;
            }
        }
    }

    return allSuccess;
}

bool ModuleManager::startModule(const String &name)
{
    auto it = findModule(name);
    if (it == modules.end())
    {
        Serial.printf("[MODULE_MANAGER] Module '%s' not found\n", name.c_str());
        return false;
    }

    if (it->info.state != ModuleState::INITIALIZED && it->info.state != ModuleState::SUSPENDED)
    {
        Serial.printf("[MODULE_MANAGER] Module '%s' not in startable state (current: %d)\n",
                      name.c_str(), static_cast<int>(it->info.state));
        return false;
    }

    Serial.printf("[MODULE_MANAGER] Starting module '%s'\n", name.c_str());

    bool success = it->instance->start();
    if (success)
    {
        it->info.state = ModuleState::ACTIVE;
        it->info.lastActivity = millis();
        it->info.errorMessage = "";
        logModuleEvent(name, "STARTED");
    }
    else
    {
        it->info.state = ModuleState::ERROR;
        it->info.errorMessage = "Manual start failed";
        logModuleEvent(name, "START_FAILED");
    }

    return success;
}

bool ModuleManager::stopModule(const String &name)
{
    auto it = findModule(name);
    if (it == modules.end())
    {
        return false;
    }

    if (it->info.state != ModuleState::ACTIVE)
    {
        return false;
    }

    Serial.printf("[MODULE_MANAGER] Stopping module '%s'\n", name.c_str());

    bool success = it->instance->stop();
    if (success)
    {
        it->info.state = ModuleState::INITIALIZED;
        logModuleEvent(name, "STOPPED");
    }
    else
    {
        it->info.state = ModuleState::ERROR;
        it->info.errorMessage = "Stop failed";
        logModuleEvent(name, "STOP_FAILED");
    }

    return success;
}

bool ModuleManager::restartModule(const String &name)
{
    return stopModule(name) && startModule(name);
}

void ModuleManager::registerAllWebHandlers(AsyncWebServer &server)
{
    Serial.println("[MODULE_MANAGER] Registering web handlers for all modules...");

    for (auto &regModule : modules)
    {
        if (regModule.info.capabilities.hasWebHandlers &&
            regModule.info.state == ModuleState::ACTIVE)
        {
            Serial.printf("[MODULE_MANAGER] Registering web handlers for '%s'\n",
                          regModule.info.name.c_str());

            regModule.instance->registerWebHandlers(server);
        }
    }

    // Setup module management API
    setupModuleManagementAPI(server);
}

void ModuleManager::setupModuleManagementAPI(AsyncWebServer &server)
{
    // Module list endpoint
    server.on("/api/modules", HTTP_GET, [this](AsyncWebServerRequest *request)
              {
        JsonDocument doc;
        JsonArray moduleArray = doc["modules"].to<JsonArray>();

        for (const auto& regModule : modules) {
            JsonObject moduleObj = moduleArray.add<JsonObject>();
            moduleObj["name"] = regModule.info.name;
            moduleObj["version"] = regModule.info.version;
            moduleObj["description"] = regModule.info.description;
            moduleObj["type"] = static_cast<int>(regModule.info.type);
            moduleObj["state"] = static_cast<int>(regModule.info.state);
            moduleObj["healthy"] = regModule.instance->isHealthy();
            moduleObj["autoStart"] = regModule.autoStart;
            moduleObj["initTime"] = regModule.info.initTime;
            moduleObj["lastActivity"] = regModule.info.lastActivity;
            moduleObj["errorMessage"] = regModule.info.errorMessage;

            JsonObject capsObj = moduleObj["capabilities"].to<JsonObject>();
            capsObj["hasWebHandlers"] = regModule.info.capabilities.hasWebHandlers;
            capsObj["hasTaskHandlers"] = regModule.info.capabilities.hasTaskHandlers;
            capsObj["hasEventHandlers"] = regModule.info.capabilities.hasEventHandlers;
            capsObj["hasConfigInterface"] = regModule.info.capabilities.hasConfigInterface;
            capsObj["hasStatusInterface"] = regModule.info.capabilities.hasStatusInterface;
            capsObj["requiresHardware"] = regModule.info.capabilities.requiresHardware;
            capsObj["isOptional"] = regModule.info.capabilities.isOptional;
        }

        doc["totalModules"] = modules.size();
        doc["activeModules"] = getActiveModuleCount();
        doc["uptime"] = getUptime();

        AsyncResponseStream* response = request->beginResponseStream("application/json");
        serializeJson(doc, *response);
        request->send(response); });

    // Module control endpoint
    server.on("/api/modules/control", HTTP_POST, [this](AsyncWebServerRequest *request)
              {
        if (!request->hasParam("module", true) || !request->hasParam("action", true)) {
            request->send(400, "application/json",
                          "{\"success\":false,\"error\":\"Missing module or action parameter\"}");
            return;
        }

        String moduleName = request->getParam("module", true)->value();
        String action = request->getParam("action", true)->value();

        bool success = false;
        String message = "";

        if (action == "start") {
            success = startModule(moduleName);
            message = success ? "Module started" : "Failed to start module";
        } else if (action == "stop") {
            success = stopModule(moduleName);
            message = success ? "Module stopped" : "Failed to stop module";
        } else if (action == "restart") {
            success = restartModule(moduleName);
            message = success ? "Module restarted" : "Failed to restart module";
        } else {
            request->send(400, "application/json",
                          "{\"success\":false,\"error\":\"Invalid action\"}");
            return;
        }

        JsonDocument doc;
        doc["success"] = success;
        doc["message"] = message;
        doc["module"] = moduleName;
        doc["action"] = action;

        AsyncResponseStream* response = request->beginResponseStream("application/json");
        serializeJson(doc, *response);
        request->send(response); });

    // Module status endpoint
    server.on("/api/modules/status", HTTP_GET, [this](AsyncWebServerRequest *request)
              {
        String moduleName = "";
        if (request->hasParam("module")) {
            moduleName = request->getParam("module")->value();
        }

        JsonDocument doc;

        if (moduleName.length() > 0) {
            // Get specific module status
            auto it = findModule(moduleName);
            if (it != modules.end()) {
                doc["name"] = it->info.name;
                doc["state"] = static_cast<int>(it->info.state);
                doc["healthy"] = it->instance->isHealthy();
                doc["status"] = it->instance->getStatus();
                doc["lastActivity"] = it->info.lastActivity;
            } else {
                doc["error"] = "Module not found";
            }
        } else {
            // Get system-wide status
            doc["systemHealthy"] = getUnhealthyModules().size() == 0;
            doc["totalModules"] = modules.size();
            doc["activeModules"] = getActiveModuleCount();
            doc["uptime"] = getUptime();
            doc["diagnostics"] = getDiagnostics();

            JsonArray unhealthyArray = doc["unhealthyModules"].to<JsonArray>();
            auto unhealthy = getUnhealthyModules();
            for (const String& name : unhealthy) {
                unhealthyArray.add(name);
            }
        }
        AsyncResponseStream* response = request->beginResponseStream("application/json");
        serializeJson(doc, *response);
        request->send(response); });

    // Module configuration (autoStart) - get current persisted config
    server.on("/api/modules/config", HTTP_GET, [this](AsyncWebServerRequest *request)
              {
        String cfg = getSystemConfig();
        AsyncResponseStream* response = request->beginResponseStream("application/json");
        response->print(cfg);
        request->send(response); });

    // Module configuration save (accepts JSON body)
    server.on("/api/modules/config", HTTP_POST, [this](AsyncWebServerRequest *request)
              {
        // onRequest callback required by AsyncWebServer signature; body handled in the next parameter
        // send an interim response if no body is provided
        if (request->contentLength() == 0) {
            request->send(400, "application/json", "{\"success\":false,\"error\":\"Empty body\"}");
        } }, nullptr, [this](AsyncWebServerRequest *request, uint8_t *data, size_t len, size_t index, size_t total)
              {
        static String body = "";
        if (index == 0) body = "";
        for (size_t i = 0; i < len; i++) body += (char)data[i];
        if (index + len == total) {
            bool ok = setSystemConfig(body) && saveConfig();
            if (ok) {
                request->send(200, "application/json", "{\"success\":true}");
            } else {
                request->send(400, "application/json", "{\"success\":false,\"error\":\"Invalid config\"}");
            }
            body = "";
        } });

    // Toggle autoStart for a single module - POST /api/modules/autoStart
    server.on("/api/modules/autoStart", HTTP_POST, [this](AsyncWebServerRequest *request)
              {
        if (!request->hasParam("module", true) || !request->hasParam("autoStart", true)) {
            request->send(400, "application/json", "{\"success\":false,\"error\":\"Missing parameters\"}");
            return;
        }

        String moduleName = request->getParam("module", true)->value();
        String val = request->getParam("autoStart", true)->value();
        bool autoStart = (val == "1" || val.equalsIgnoreCase("true"));

        auto it = findModule(moduleName);
        if (it == modules.end()) {
            request->send(404, "application/json", "{\"success\":false,\"error\":\"Module not found\"}");
            return;
        }

        it->autoStart = autoStart;
        bool ok = saveConfig();

        if (ok) {
            request->send(200, "application/json", "{\"success\":true}");
        } else {
            request->send(500, "application/json", "{\"success\":false,\"error\":\"Failed to persist config\"}");
        } });

    // Clear persisted module config (factory reset for module prefs) - POST /api/modules/clearConfig
    server.on("/api/modules/clearConfig", HTTP_POST, [this](AsyncWebServerRequest *request)
              {
        // Remove JSON file holding module config (no NVS used)
        xSemaphoreTake(fsMutex, portMAX_DELAY);
        bool removed = false;
        if (contentFS) {
            removed = contentFS->remove("/current/modules_config.json");
        }
        xSemaphoreGive(fsMutex);

        // Apply sensible in-memory defaults now so the change takes effect without reboot
        const char* defaults = "{\"modules\":[{\"name\":\"WiFiModule\",\"autoStart\":true},{\"name\":\"C6Module\",\"autoStart\":true}]}";
        this->setSystemConfig(String(defaults));

        JsonDocument doc;
        doc["success"] = true;
        doc["message"] = removed ? "Module config file removed and defaults applied" : "Module config defaults applied (file missing)";

        AsyncResponseStream* response = request->beginResponseStream("application/json");
        serializeJson(doc, *response);
        request->send(response); });
}

void ModuleManager::updateAll()
{
    for (auto &regModule : modules)
    {
        if (regModule.info.state == ModuleState::ACTIVE)
        {
            regModule.instance->update();
            updateModuleActivity(regModule.info.name);
        }
    }
}

std::vector<String> ModuleManager::getUnhealthyModules() const
{
    std::vector<String> unhealthy;

    for (const auto &regModule : modules)
    {
        if (!regModule.instance->isHealthy() || regModule.info.state == ModuleState::ERROR)
        {
            unhealthy.push_back(regModule.info.name);
        }
    }

    return unhealthy;
}

String ModuleManager::getDiagnostics() const
{
    JsonDocument doc;

    doc["uptime"] = getUptime();
    doc["totalModules"] = modules.size();
    doc["activeModules"] = getActiveModuleCount();

    JsonArray moduleStates = doc["moduleStates"].to<JsonArray>();
    for (const auto &regModule : modules)
    {
        JsonObject moduleObj = moduleStates.add<JsonObject>();
        moduleObj["name"] = regModule.info.name;
        moduleObj["state"] = static_cast<int>(regModule.info.state);
        moduleObj["healthy"] = regModule.instance->isHealthy();
        moduleObj["lastActivity"] = regModule.info.lastActivity;
    }

    String result;
    serializeJson(doc, result);
    return result;
}

// Private helper methods
std::vector<ModuleManager::RegisteredModule>::iterator
ModuleManager::findModule(const String &name)
{
    return std::find_if(modules.begin(), modules.end(),
                        [&name](const RegisteredModule &module)
                        {
                            return module.info.name == name;
                        });
}

std::vector<ModuleManager::RegisteredModule>::const_iterator
ModuleManager::findModule(const String &name) const
{
    return std::find_if(modules.cbegin(), modules.cend(),
                        [&name](const RegisteredModule &module)
                        {
                            return module.info.name == name;
                        });
}

bool ModuleManager::resolveDependencies()
{
    // Simple dependency resolution - just ensure dependencies are initialized first
    // This could be enhanced with proper topological sorting

    bool changed = true;
    int iterations = 0;
    const int maxIterations = modules.size() * 2; // Prevent infinite loops

    while (changed && iterations < maxIterations)
    {
        changed = false;
        iterations++;

        for (size_t i = 0; i < modules.size(); i++)
        {
            for (const String &dep : modules[i].dependencies)
            {
                auto depIt = findModule(dep);
                if (depIt != modules.end())
                {
                    // Find dependency index
                    size_t depIndex = std::distance(modules.begin(), depIt);

                    // If dependency comes after this module, swap them
                    if (depIndex > i)
                    {
                        std::swap(modules[i], modules[depIndex]);
                        changed = true;
                        break;
                    }
                }
                else
                {
                    Serial.printf("[MODULE_MANAGER] Warning: Module '%s' depends on unknown module '%s'\n",
                                  modules[i].info.name.c_str(), dep.c_str());
                }
            }
            if (changed)
                break;
        }
    }

    if (iterations >= maxIterations)
    {
        Serial.println("[MODULE_MANAGER] Warning: Dependency resolution may have circular dependencies");
    }

    return true;
}

void ModuleManager::updateModuleActivity(const String &name)
{
    auto it = findModule(name);
    if (it != modules.end())
    {
        it->info.lastActivity = millis();
    }
}

void ModuleManager::logModuleEvent(const String &name, const String &event, const String &details)
{
    if (details.length() > 0)
    {
        Serial.printf("[MODULE:%s] %s - %s\n", name.c_str(), event.c_str(), details.c_str());
    }
    else
    {
        Serial.printf("[MODULE:%s] %s\n", name.c_str(), event.c_str());
    }
}

uint32_t ModuleManager::getUptime() const
{
    return initialized ? (millis() - startTime) : 0;
}

size_t ModuleManager::getModuleCount() const
{
    return modules.size();
}

size_t ModuleManager::getActiveModuleCount() const
{
    size_t count = 0;
    for (const auto &regModule : modules)
    {
        if (regModule.info.state == ModuleState::ACTIVE)
        {
            count++;
        }
    }
    return count;
}

ModuleInterface *ModuleManager::getModuleInstance(const String &name) const
{
    auto it = findModule(name);
    if (it != modules.end())
    {
        return it->instance.get();
    }
    return nullptr;
}

bool ModuleManager::isSystemHealthy() const
{
    for (const auto &regModule : modules)
    {
        if (!regModule.instance->isHealthy())
        {
            return false;
        }
    }
    return true;
}

ModuleInfo ModuleManager::getModuleInfo(const String &name) const
{
    auto it = findModule(name);
    if (it != modules.end())
    {
        return it->info;
    }

    // Return empty module info if not found
    ModuleInfo emptyInfo;
    emptyInfo.name = "";
    emptyInfo.version = "";
    emptyInfo.description = "";
    emptyInfo.type = ModuleType::CORE;
    emptyInfo.state = ModuleState::ERROR;
    emptyInfo.initTime = 0;
    emptyInfo.lastActivity = 0;
    emptyInfo.errorMessage = "Module not found";
    return emptyInfo;
}

bool ModuleManager::isModuleHealthy(const String &name) const
{
    auto it = findModule(name);
    if (it != modules.end())
    {
        return it->instance->isHealthy() && it->info.state != ModuleState::ERROR;
    }
    return false;
}

// -----------------------------
// System configuration methods
// -----------------------------

String ModuleManager::getSystemConfig() const
{
    JsonDocument doc;
    JsonArray modulesArr = doc["modules"].to<JsonArray>();

    for (const auto &m : modules)
    {
        JsonObject mo = modulesArr.add<JsonObject>();
        mo["name"] = m.info.name;
        mo["autoStart"] = m.autoStart;
    }

    String out;
    serializeJson(doc, out);
    return out;
}

bool ModuleManager::setSystemConfig(const String &config)
{
    JsonDocument doc;
    DeserializationError err = deserializeJson(doc, config);
    if (err)
    {
        Serial.printf("[MODULE_MANAGER] Invalid system config JSON: %s\n", err.c_str());
        return false;
    }

    if (!doc["modules"].is<JsonArray>())
        return false;

    JsonArray arr = doc["modules"].to<JsonArray>();
    for (JsonVariant v : arr)
    {
        if (v["name"].isNull())
            continue;
        String name = v["name"].as<String>();
        if (v["autoStart"].isNull())
            continue;
        bool autoStart = v["autoStart"].as<bool>();
        auto it = findModule(name);
        if (it != modules.end())
        {
            it->autoStart = autoStart;
        }
    }

    return true;
}

bool ModuleManager::saveConfig() const
{
    if (!contentFS)
        return false;
    JsonDocument doc;
    JsonArray modulesArr = doc["modules"].to<JsonArray>();
    for (const auto &m : modules)
    {
        JsonObject mo = modulesArr.add<JsonObject>();
        mo["name"] = m.info.name;
        mo["autoStart"] = m.autoStart;
    }
    xSemaphoreTake(fsMutex, portMAX_DELAY);
    File w = contentFS->open("/current/modules_config.json", "w");
    if (!w)
    {
        xSemaphoreGive(fsMutex);
        return false;
    }
    serializeJson(doc, w);
    w.close();
    xSemaphoreGive(fsMutex);
    return true;
}

bool ModuleManager::loadConfig()
{
    if (!contentFS)
        return false;
    File r = contentFS->open("/current/modules_config.json", "r");
    if (!r)
        return false;
    String json = r.readString();
    r.close();
    if (json.length() == 0)
        return false;
    return setSystemConfig(json);
}

// -----------------------------
// Event system
// -----------------------------
void ModuleManager::broadcastEvent(const String &event, const String &data)
{
    // Simple fan-out to all modules that declare event handling capability
    // Note: We intentionally do not stop if one module throws; we catch and continue.
    for (auto &regModule : modules)
    {
        if (regModule.info.state == ModuleState::ACTIVE && regModule.info.capabilities.hasEventHandlers)
        {
// Protect against exceptions (if compiled with exceptions enabled)
#if defined(__EXCEPTIONS)
            try
            {
                regModule.instance->handleEvent(event, data);
            }
            catch (...)
            {
                Serial.printf("[MODULE_MANAGER] Exception delivering event '%s' to module '%s'\n",
                              event.c_str(), regModule.info.name.c_str());
            }
#else
            regModule.instance->handleEvent(event, data);
#endif
        }
    }
}
