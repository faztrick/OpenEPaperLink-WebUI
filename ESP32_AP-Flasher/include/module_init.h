#ifndef MODULE_INIT_H
#define MODULE_INIT_H

#include "module_manager.h"

// Enhanced Module System Initialization
// =====================================

void initializeModuleSystem() {
    Serial.println("[MODULE_INIT] Starting enhanced module system...");

    // Initialize the module manager
    if (!moduleManager.initializeAll()) {
        Serial.println("[MODULE_INIT] Warning: Module manager initialization had issues");
    }

#ifdef HAS_C6
    // Register C6 module
    Serial.println("[MODULE_INIT] Registering C6 module...");
    initC6Module();
#endif

#ifdef WIFI_ADVANCED_FEATURES
    // Register enhanced WiFi module
    Serial.println("[MODULE_INIT] Registering enhanced WiFi module...");
    registerWiFiModule();
#endif

    // Start all auto-start modules
    if (!moduleManager.startAll()) {
        Serial.println("[MODULE_INIT] Warning: Some modules failed to start");
    } else {
        Serial.println("[MODULE_INIT] All modules started successfully");
    }

    // Print module status
    auto moduleNames = moduleManager.getModuleNames();
    Serial.printf("[MODULE_INIT] Registered %d modules:\n", moduleNames.size());
    for (const String& name : moduleNames) {
        auto info = moduleManager.getModuleInfo(name);
        Serial.printf("  - %s v%s (%s) - State: %d\n",
                      info.name.c_str(),
                      info.version.c_str(),
                      info.description.c_str(),
                      static_cast<int>(info.state));
    }

    Serial.println("[MODULE_INIT] Module system initialization complete");
}

void startModuleWebHandlers(AsyncWebServer& server) {
    Serial.println("[MODULE_INIT] Starting module web handlers...");

    // Register all module web handlers
    moduleManager.registerAllWebHandlers(server);

    Serial.println("[MODULE_INIT] Module web handlers started");
}

void updateModuleSystem() {
    // Update all active modules
    moduleManager.updateAll();

    // Check module health periodically
    static uint32_t lastHealthCheck = 0;
    if (millis() - lastHealthCheck > 30000) {  // Every 30 seconds
        auto unhealthy = moduleManager.getUnhealthyModules();
        if (unhealthy.size() > 0) {
            Serial.printf("[MODULE_INIT] Warning: %d modules are unhealthy:\n", unhealthy.size());
            for (const String& name : unhealthy) {
                Serial.printf("  - %s\n", name.c_str());
            }
        }
        lastHealthCheck = millis();
    }
}

void shutdownModuleSystem() {
    Serial.println("[MODULE_INIT] Shutting down module system...");

    if (!moduleManager.stopAll()) {
        Serial.println("[MODULE_INIT] Warning: Some modules failed to stop cleanly");
    }

    if (!moduleManager.cleanupAll()) {
        Serial.println("[MODULE_INIT] Warning: Some modules failed to cleanup");
    }

    Serial.println("[MODULE_INIT] Module system shutdown complete");
}

#endif  // MODULE_INIT_H
