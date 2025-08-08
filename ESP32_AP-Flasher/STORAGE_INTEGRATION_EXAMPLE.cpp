// Example of integrating the new storage utilities into your existing web.cpp

// Add this include at the top of web.cpp (after existing includes)
#include "storage_utils.cpp"

// Example of replacing existing WiFi config endpoints with the new storage utilities

// Replace the existing /get_wifi_config endpoint:
void setupNewWiFiConfigEndpoint(AsyncWebServer& server) {
    server.on("/get_wifi_config", HTTP_GET, [](AsyncWebServerRequest* request) {
        // NEW WAY: Use centralized WiFi storage
        WiFiStorageManager& wifiStorage = WIFI_STORAGE;

        // Get configuration as JSON with built-in validation and structure
        DynamicJsonDocument doc = wifiStorage.toJson();
        doc["mac"] = WiFi.macAddress();

        // Add cache headers and send response
        AsyncResponseStream* response = request->beginResponseStream("application/json");
        serializeJson(doc, *response);
        request->send(response);
    });

    // Replace the existing /save_wifi_config endpoint:
    AsyncCallbackJsonWebHandler* handler = new AsyncCallbackJsonWebHandler("/save_wifi_config",
                                                                           [](AsyncWebServerRequest* request, JsonVariant& json) {
                                                                               Serial.println("[NEW_STORAGE] WiFi config save request received");

                                                                               // Validate JSON input
                                                                               if (!json.is<JsonObject>()) {
                                                                                   Serial.println("[NEW_STORAGE] ERROR: Invalid JSON received");
                                                                                   request->send(400, "application/json", "{\"error\":\"Invalid JSON\"}");
                                                                                   return;
                                                                               }

                                                                               const JsonObject& jsonObj = json.as<JsonObject>();
                                                                               WiFiStorageManager& wifiStorage = WIFI_STORAGE;

                                                                               // NEW WAY: Use structured configuration with validation
                                                                               WiFiStorageManager::WiFiConfig config;

                                                                               // Extract values from JSON
                                                                               if (jsonObj.containsKey("ssid")) config.ssid = jsonObj["ssid"].as<String>();
                                                                               if (jsonObj.containsKey("pw")) config.password = jsonObj["pw"].as<String>();
                                                                               if (jsonObj.containsKey("ip")) config.ip = jsonObj["ip"].as<String>();
                                                                               if (jsonObj.containsKey("mask")) config.mask = jsonObj["mask"].as<String>();
                                                                               if (jsonObj.containsKey("gw")) config.gateway = jsonObj["gw"].as<String>();
                                                                               if (jsonObj.containsKey("dns")) config.dns = jsonObj["dns"].as<String>();
                                                                               if (jsonObj.containsKey("hostname")) config.hostname = jsonObj["hostname"].as<String>();

                                                                               // Save with built-in validation and error handling
                                                                               StorageUtils::Result result = wifiStorage.saveConfig(config);

                                                                               if (result == StorageUtils::SUCCESS) {
                                                                                   Serial.println("[NEW_STORAGE] WiFi config saved successfully");
                                                                                   request->send(200, "application/json", "{\"success\":true,\"message\":\"Configuration saved\"}");

                                                                                   // Handle factory reset
                                                                                   if (config.ssid == "factory") {
                                                                                       Serial.println("[NEW_STORAGE] Factory reset initiated");
                                                                                       wifiStorage.factoryReset();
                                                                                       // ... rest of factory reset logic
                                                                                       ESP.restart();
                                                                                   } else {
                                                                                       ESP.restart();
                                                                                   }
                                                                               } else {
                                                                                   Serial.printf("[NEW_STORAGE] Failed to save config: %s\n",
                                                                                                 StorageUtils::getInstance().resultToString(result).c_str());
                                                                                   request->send(500, "application/json", "{\"error\":\"Failed to save configuration\"}");
                                                                               }
                                                                           });

    server.addHandler(handler);
}

// Example of using the storage utilities for system settings
void setupSystemConfigEndpoint(AsyncWebServer& server) {
    server.on("/get_system_info", HTTP_GET, [](AsyncWebServerRequest* request) {
        StorageUtils& storage = StorageUtils::getInstance();
        DynamicJsonDocument doc(1024);

        // Use the clean storage interface
        doc["deviceName"] = STORAGE_GET_STRING("system", "deviceName", "ESP32-AP-Flasher");
        doc["bootCount"] = STORAGE_GET_INT("system", "bootCount", 0);
        doc["debugMode"] = STORAGE_GET_BOOL("system", "debugMode", false);
        doc["uptime"] = millis() / 1000;

        // Add storage health information
        StorageUtils::StorageStats stats = storage.getStats();
        doc["storage"]["healthy"] = stats.isHealthy;
        doc["storage"]["totalOperations"] = stats.totalReads + stats.totalWrites;
        doc["storage"]["errorRate"] = stats.totalWrites > 0 ? (float)(stats.failedWrites * 100) / stats.totalWrites : 0.0f;

        String response;
        serializeJson(doc, response);
        request->send(200, "application/json", response);
    });

    server.on("/increment_boot_count", HTTP_POST, [](AsyncWebServerRequest* request) {
        StorageUtils& storage = StorageUtils::getInstance();

        int currentBoots = STORAGE_GET_INT("system", "bootCount", 0);
        StorageUtils::Result result = STORAGE_SET_INT("system", "bootCount", currentBoots + 1);

        if (result == StorageUtils::SUCCESS) {
            request->send(200, "application/json",
                          String("{\"bootCount\":" + String(currentBoots + 1) + "}"));
        } else {
            request->send(500, "application/json", "{\"error\":\"Failed to update boot count\"}");
        }
    });
}

// Example of bulk operations for efficiency
void setupBulkConfigEndpoint(AsyncWebServer& server) {
    server.on("/bulk_config_save", HTTP_POST, [](AsyncWebServerRequest* request) {
        StorageUtils& storage = StorageUtils::getInstance();

        // Save multiple settings efficiently in one operation
        const String keys[] = {"lastUpdate", "version", "updateChannel"};
        const String values[] = {String(millis()), "1.0.0", "stable"};

        StorageUtils::Result result = storage.setMultipleStrings("app", keys, values, 3);

        if (result == StorageUtils::SUCCESS) {
            request->send(200, "application/json", "{\"message\":\"Bulk settings saved\"}");
        } else {
            String error = "{\"error\":\"" + storage.getLastError() + "\"}";
            request->send(500, "application/json", error);
        }
    });
}

// Example of storage debugging endpoint
void setupStorageDebugEndpoint(AsyncWebServer& server) {
    server.on("/storage_debug", HTTP_GET, [](AsyncWebServerRequest* request) {
        StorageUtils& storage = StorageUtils::getInstance();
        StorageUtils::StorageStats stats = storage.getStats();

        DynamicJsonDocument doc(1024);
        doc["totalReads"] = stats.totalReads;
        doc["totalWrites"] = stats.totalWrites;
        doc["failedReads"] = stats.failedReads;
        doc["failedWrites"] = stats.failedWrites;
        doc["isHealthy"] = stats.isHealthy;
        doc["lastError"] = stats.lastError;

        // Add namespace information
        WiFiStorageManager& wifiStorage = WIFI_STORAGE;
        doc["wifi"]["hasCredentials"] = wifiStorage.hasCredentials();
        doc["wifi"]["hasStaticIP"] = wifiStorage.hasStaticIP();
        doc["wifi"]["ssid"] = wifiStorage.getSSID();
        doc["wifi"]["hostname"] = wifiStorage.getHostname();

        String response;
        serializeJson(doc, response);
        request->send(200, "application/json", response);
    });

    server.on("/storage_reset_stats", HTTP_POST, [](AsyncWebServerRequest* request) {
        StorageUtils::getInstance().resetStats();
        request->send(200, "application/json", "{\"message\":\"Statistics reset\"}");
    });
}

// How to initialize the new storage system
void initializeStorageSystem() {
    StorageUtils& storage = StorageUtils::getInstance();

    // Enable debug logging during development
    storage.enableDebugLogging(true);

    // Initialize boot count tracking
    int bootCount = STORAGE_GET_INT("system", "bootCount", 0);
    STORAGE_SET_INT("system", "bootCount", bootCount + 1);

    // Set device info if not already set
    if (STORAGE_GET_STRING("system", "deviceName", "").isEmpty()) {
        STORAGE_SET_STRING("system", "deviceName", "ESP32-AP-Flasher");
        STORAGE_SET_STRING("system", "version", "1.0.0");
        STORAGE_SET_BOOL("system", "firstBoot", true);
    }

    // Print storage health
    storage.printStorageInfo();

    Serial.println("[STORAGE] Storage system initialized successfully");
}

/*
To integrate this into your existing web.cpp:

1. Add the include at the top:
   #include "storage_utils.cpp"

2. Call initializeStorageSystem() in your setup() function

3. Replace existing Preferences-based endpoints with the new functions:
   - setupNewWiFiConfigEndpoint(server);
   - setupSystemConfigEndpoint(server);
   - setupBulkConfigEndpoint(server);
   - setupStorageDebugEndpoint(server);

4. Replace scattered Preferences usage with:
   - STORAGE_GET_STRING(), STORAGE_SET_STRING() macros
   - WiFiStorageManager for WiFi configuration
   - Structured error handling

Benefits:
- Clean, consistent API
- Built-in validation and error handling
- Storage health monitoring
- Bulk operations for performance
- Debugging capabilities
- Type safety with structured configs
*/
