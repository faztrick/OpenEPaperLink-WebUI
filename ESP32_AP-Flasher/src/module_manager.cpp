#include "module_manager.h"

#include <ArduinoJson.h>
#include <Preferences.h>

#include "core_utilities.h"

// Global module manager instance
ModuleManager moduleManager;

// ModuleManager Implementation
// ============================

bool ModuleManager::registerModule(std::unique_ptr<ModuleInterface> module,
                                   bool autoStart,
                                   const std::vector<String>& dependencies) {
    if (!module) {
        Serial.println("[MODULE_MANAGER] Cannot register null module");
        return false;
    }

    ModuleInfo info = module->getInfo();

    // Check for duplicate module names
    if (findModule(info.name) != modules.end()) {
        LogUtils::logWarning("[MODULE_MANAGER] Module '" + info.name + "' already registered");
        return false;
    }

    RegisteredModule regModule;
    regModule.instance = std::move(module);
    regModule.info = info;
    regModule.autoStart = autoStart;
    regModule.dependencies = dependencies;

    modules.push_back(std::move(regModule));

    LogUtils::logInfo("[MODULE_MANAGER] Registered module '" + info.name + "' v" + info.version);

    return true;
}

bool ModuleManager::initializeAll() {
    if (initialized) {
        Serial.println("[MODULE_MANAGER] Already initialized");
        return true;
    }

    startTime = millis();
    Serial.println("[MODULE_MANAGER] Initializing all modules...");

    // Resolve dependencies first
    if (!resolveDependencies()) {
        Serial.println("[MODULE_MANAGER] Dependency resolution failed");
        return false;
    }

    bool allSuccess = true;

    // Initialize modules in dependency order
    for (auto& regModule : modules) {
        if (regModule.info.state == ModuleState::UNINITIALIZED) {
            LogUtils::logInfo("[MODULE_MANAGER] Initializing module '" + regModule.info.name + "'");

            regModule.info.state = ModuleState::INITIALIZING;

            uint32_t initStart = millis();
            bool success = regModule.instance->initialize();
            regModule.info.initTime = millis() - initStart;

            if (success) {
                regModule.info.state = ModuleState::INITIALIZED;
                regModule.info.lastActivity = millis();
                LogUtils::logInfo("[MODULE_MANAGER] Module '" + regModule.info.name + "' initialized in " + String(regModule.info.initTime) + "ms");
            } else {
                regModule.info.state = ModuleState::ERROR;
                regModule.info.errorMessage = "Initialization failed";
                LogUtils::logError("[MODULE_MANAGER] Module '" + regModule.info.name + "' initialization failed");
                allSuccess = false;
            }
        }
    }

    if (allSuccess) {
        initialized = true;
        LogUtils::logInfo("[MODULE_MANAGER] All modules initialized successfully in " + String(millis() - startTime) + "ms");
    } else {
        Serial.println("[MODULE_MANAGER] Some modules failed to initialize");
    }

    return allSuccess;
}

bool ModuleManager::startAll() {
    if (!initialized) {
        Serial.println("[MODULE_MANAGER] Must initialize before starting");
        return false;
    }

    Serial.println("[MODULE_MANAGER] Starting all auto-start modules...");

    bool allSuccess = true;

    for (auto& regModule : modules) {
        if (regModule.autoStart && regModule.info.state == ModuleState::INITIALIZED) {
            LogUtils::logInfo("[MODULE_MANAGER] Starting module '" + regModule.info.name + "'");

            bool success = regModule.instance->start();
            if (success) {
                regModule.info.state = ModuleState::ACTIVE;
                regModule.info.lastActivity = millis();
                LogUtils::logInfo("[MODULE_MANAGER] Module '" + regModule.info.name + "' started successfully");
            } else {
                regModule.info.state = ModuleState::ERROR;
                regModule.info.errorMessage = "Start failed";
                LogUtils::logError("[MODULE_MANAGER] Module '" + regModule.info.name + "' start failed");
                allSuccess = false;
            }
        }
    }

    return allSuccess;
}

bool ModuleManager::startModule(const String& name) {
    auto it = findModule(name);
    if (it == modules.end()) {
        LogUtils::logError("[MODULE_MANAGER] Module '" + name + "' not found");
        return false;
    }

    if (it->info.state != ModuleState::INITIALIZED && it->info.state != ModuleState::SUSPENDED) {
        LogUtils::logError("[MODULE_MANAGER] Module '" + name + "' not in startable state (current: " + String(static_cast<int>(it->info.state)) + ")");
        return false;
    }

    LogUtils::logInfo("[MODULE_MANAGER] Starting module '" + name + "'");

    bool success = it->instance->start();
    if (success) {
        it->info.state = ModuleState::ACTIVE;
        it->info.lastActivity = millis();
        it->info.errorMessage = "";
        logModuleEvent(name, "STARTED");
    } else {
        it->info.state = ModuleState::ERROR;
        it->info.errorMessage = "Manual start failed";
        logModuleEvent(name, "START_FAILED");
    }

    return success;
}

bool ModuleManager::stopModule(const String& name) {
    auto it = findModule(name);
    if (it == modules.end()) {
        return false;
    }

    if (it->info.state != ModuleState::ACTIVE) {
        return false;
    }

    LogUtils::logInfo("[MODULE_MANAGER] Stopping module '" + name + "'");

    bool success = it->instance->stop();
    if (success) {
        it->info.state = ModuleState::INITIALIZED;
        logModuleEvent(name, "STOPPED");
    } else {
        it->info.state = ModuleState::ERROR;
        it->info.errorMessage = "Stop failed";
        logModuleEvent(name, "STOP_FAILED");
    }

    return success;
}

bool ModuleManager::restartModule(const String& name) {
    return stopModule(name) && startModule(name);
}

void ModuleManager::registerAllWebHandlers(AsyncWebServer& server) {
    LogUtils::logInfo("[MODULE_MANAGER] Registering web handlers for all modules...");

    for (auto& regModule : modules) {
        if (regModule.info.capabilities.hasWebHandlers &&
            regModule.info.state == ModuleState::ACTIVE) {
            LogUtils::logInfo("[MODULE_MANAGER] Registering web handlers for '" + regModule.info.name + "'");

            regModule.instance->registerWebHandlers(server);
        }
    }

    // Setup module management API
    setupModuleManagementAPI(server);
}

void ModuleManager::setupModuleManagementAPI(AsyncWebServer& server) {
    // Module list endpoint
    server.on("/api/modules", HTTP_GET, [this](AsyncWebServerRequest* request) {
        DynamicJsonDocument doc(4096);
        JsonArray moduleArray = doc.createNestedArray("modules");

        for (const auto& regModule : modules) {
            JsonObject moduleObj = moduleArray.createNestedObject();
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

            JsonObject capsObj = moduleObj.createNestedObject("capabilities");
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
        request->send(response);
    });

    // Module control endpoint
    server.on("/api/modules/control", HTTP_POST, [this](AsyncWebServerRequest* request) {
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

        DynamicJsonDocument doc(512);
        doc["success"] = success;
        doc["message"] = message;
        doc["module"] = moduleName;
        doc["action"] = action;

        AsyncResponseStream* response = request->beginResponseStream("application/json");
        serializeJson(doc, *response);
        request->send(response);
    });

    // Module status endpoint
    server.on("/api/modules/status", HTTP_GET, [this](AsyncWebServerRequest* request) {
        String moduleName = "";
        if (request->hasParam("module")) {
            moduleName = request->getParam("module")->value();
        }

        DynamicJsonDocument doc(2048);

        if (moduleName.length() > 0) {
            // Get specific module status
            auto it = findModule(moduleName);
            if (it != modules.end()) {
                doc["name"] = it->info.name;
                doc["state"] = static_cast<int>(it->info.state);
                doc["healthy"] = it->instance->isHealthy();
                doc["status"] = it->instance->getStatus();
                doc["lastActivity"] = it->info.lastActivity;
                doc["errorMessage"] = it->info.errorMessage;
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

            JsonArray unhealthyArray = doc.createNestedArray("unhealthyModules");
            auto unhealthy = getUnhealthyModules();
            for (const String& name : unhealthy) {
                unhealthyArray.add(name);
            }
        }

        AsyncResponseStream* response = request->beginResponseStream("application/json");
        serializeJson(doc, *response);
        request->send(response);
    });
}

void ModuleManager::updateAll() {
    for (auto& regModule : modules) {
        if (regModule.info.state == ModuleState::ACTIVE) {
            regModule.instance->update();
            updateModuleActivity(regModule.info.name);
        }
    }
}

std::vector<String> ModuleManager::getUnhealthyModules() const {
    std::vector<String> unhealthy;

    for (const auto& regModule : modules) {
        if (!regModule.instance->isHealthy() || regModule.info.state == ModuleState::ERROR) {
            unhealthy.push_back(regModule.info.name);
        }
    }

    return unhealthy;
}

String ModuleManager::getDiagnostics() const {
    DynamicJsonDocument doc(2048);

    doc["uptime"] = getUptime();
    doc["totalModules"] = modules.size();
    doc["activeModules"] = getActiveModuleCount();

    JsonArray moduleStates = doc.createNestedArray("moduleStates");
    for (const auto& regModule : modules) {
        JsonObject moduleObj = moduleStates.createNestedObject();
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
ModuleManager::findModule(const String& name) {
    return std::find_if(modules.begin(), modules.end(),
                        [&name](const RegisteredModule& module) {
                            return module.info.name == name;
                        });
}

std::vector<ModuleManager::RegisteredModule>::const_iterator
ModuleManager::findModule(const String& name) const {
    return std::find_if(modules.begin(), modules.end(),
                        [&name](const RegisteredModule& module) {
                            return module.info.name == name;
                        });
}

bool ModuleManager::resolveDependencies() {
    // Simple dependency resolution - just ensure dependencies are initialized first
    // This could be enhanced with proper topological sorting

    bool changed = true;
    int iterations = 0;
    const int maxIterations = modules.size() * 2;  // Prevent infinite loops

    while (changed && iterations < maxIterations) {
        changed = false;
        iterations++;

        for (size_t i = 0; i < modules.size(); i++) {
            for (const String& dep : modules[i].dependencies) {
                auto depIt = findModule(dep);
                if (depIt != modules.end()) {
                    // Find dependency index
                    size_t depIndex = std::distance(modules.begin(), depIt);

                    // If dependency comes after this module, swap them
                    if (depIndex > i) {
                        std::swap(modules[i], modules[depIndex]);
                        changed = true;
                        break;
                    }
                } else {
                    LogUtils::logWarning("[MODULE_MANAGER] Warning: Module '" + modules[i].info.name + "' depends on unknown module '" + dep + "'");
                }
            }
            if (changed) break;
        }
    }

    if (iterations >= maxIterations) {
        Serial.println("[MODULE_MANAGER] Warning: Dependency resolution may have circular dependencies");
    }

    return true;
}

void ModuleManager::updateModuleActivity(const String& name) {
    auto it = findModule(name);
    if (it != modules.end()) {
        it->info.lastActivity = millis();
    }
}

void ModuleManager::logModuleEvent(const String& name, const String& event, const String& details) {
    if (details.length() > 0) {
        LogUtils::logInfo("[MODULE:" + name + "] " + event + " - " + details);
    } else {
        LogUtils::logInfo("[MODULE:" + name + "] " + event);
    }
}

uint32_t ModuleManager::getUptime() const {
    return initialized ? (millis() - startTime) : 0;
}

size_t ModuleManager::getModuleCount() const {
    return modules.size();
}

size_t ModuleManager::getActiveModuleCount() const {
    size_t count = 0;
    for (const auto& regModule : modules) {
        if (regModule.info.state == ModuleState::ACTIVE) {
            count++;
        }
    }
    return count;
}

ModuleInterface* ModuleManager::getModuleInstance(const String& name) const {
    auto it = findModule(name);
    if (it != modules.end()) {
        return it->instance.get();
    }
    return nullptr;
}

bool ModuleManager::isSystemHealthy() const {
    for (const auto& regModule : modules) {
        if (!regModule.instance->isHealthy()) {
            return false;
        }
    }
    return true;
}

ModuleInfo ModuleManager::getModuleInfo(const String& name) const {
    auto it = findModule(name);
    if (it != modules.end()) {
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

bool ModuleManager::isModuleHealthy(const String& name) const {
    auto it = findModule(name);
    if (it != modules.end()) {
        return it->instance->isHealthy() && it->info.state != ModuleState::ERROR;
    }
    return false;
}
