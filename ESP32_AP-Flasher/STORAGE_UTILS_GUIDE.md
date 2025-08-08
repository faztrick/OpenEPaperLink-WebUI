# Sane Storage Functions for ESP32

I've created a centralized storage utility system that provides clean, consistent storage operations for your ESP32 project. This eliminates the scattered `Preferences` usage and provides proper error handling, validation, and debugging capabilities.

## 🎯 **What Was Created**

### **1. `src/storage_utils.cpp` - Core Storage Utilities**

A complete storage management system with:
- **Type-safe operations** for strings, integers, and booleans
- **Proper error handling** with detailed error codes
- **Bulk operations** for efficiency
- **Validation and sanitization** of keys and values
- **Statistics and debugging** for monitoring storage health
- **Thread-safe operations** with consistent state management

### **2. WiFi Storage Manager**

Specialized WiFi configuration management with:
- **Structured configuration** - no more scattered key management
- **Input validation** for SSIDs, hostnames, IP addresses
- **JSON import/export** for easy configuration
- **Factory reset** capabilities
- **Credential management** with security considerations

## 🚀 **Key Benefits**

### **Before (Scattered Approach):**
```cpp
// Multiple files doing this inconsistently:
Preferences prefs;
prefs.begin("wifi", false);
String ssid = prefs.getString("ssid", "");
String password = prefs.getString("password", "");
prefs.end();

// No error handling, inconsistent patterns, memory leaks possible
```

### **After (Centralized Approach):**
```cpp
// Clean, consistent, error-handled:
WiFiStorageManager& wifiStorage = WIFI_STORAGE;
WiFiStorageManager::WiFiConfig config = wifiStorage.loadConfig();

// Or use simple macros:
String ssid = STORAGE_GET_STRING("wifi", "ssid", "");
```

## 🛠️ **Usage Examples**

### **Basic Storage Operations:**
```cpp
#include "storage_utils.cpp"  // Include in your main file

void setup() {
    StorageUtils& storage = StorageUtils::getInstance();

    // Enable debug logging
    storage.enableDebugLogging(true);

    // Store values with error checking
    if (storage.setString("settings", "deviceName", "MyESP32") == StorageUtils::SUCCESS) {
        Serial.println("Device name saved successfully");
    }

    // Retrieve values with defaults
    String deviceName = storage.getString("settings", "deviceName", "ESP32-Default");
    int bootCount = storage.getInt("system", "bootCount", 0);
    bool debugMode = storage.getBool("system", "debug", false);
}
```

### **WiFi Configuration Management:**
```cpp
void setupWiFi() {
    WiFiStorageManager& wifiStorage = WIFI_STORAGE;

    // Load existing configuration
    WiFiStorageManager::WiFiConfig config = wifiStorage.loadConfig();

    if (wifiStorage.hasCredentials()) {
        Serial.printf("Connecting to: %s\n", config.ssid.c_str());
        WiFi.begin(config.ssid.c_str(), config.password.c_str());

        // Configure static IP if available
        if (wifiStorage.hasStaticIP()) {
            IPAddress ip, mask, gateway;
            ip.fromString(config.ip);
            mask.fromString(config.mask);
            gateway.fromString(config.gateway);
            WiFi.config(ip, gateway, mask);
        }
    } else {
        Serial.println("No WiFi credentials found, starting AP mode");
        WiFi.softAP("ESP32-Setup", "password123");
    }
}

void saveNewWiFiConfig(const String& ssid, const String& password) {
    WiFiStorageManager& wifiStorage = WIFI_STORAGE;

    // Validate and save
    StorageUtils::Result result = wifiStorage.setSSID(ssid);
    if (result == StorageUtils::SUCCESS) {
        wifiStorage.setPassword(password);
        Serial.println("WiFi config saved successfully");
    } else {
        Serial.println("Invalid SSID format");
    }
}
```

### **Bulk Operations:**
```cpp
void saveBulkSettings() {
    StorageUtils& storage = StorageUtils::getInstance();

    // Save multiple settings efficiently
    const String keys[] = {"ssid", "password", "hostname"};
    const String values[] = {"MyNetwork", "mypassword", "esp32-device"};

    StorageUtils::Result result = storage.setMultipleStrings("wifi", keys, values, 3);
    if (result == StorageUtils::SUCCESS) {
        Serial.println("All WiFi settings saved");
    }
}
```

### **Storage Health Monitoring:**
```cpp
void checkStorageHealth() {
    StorageUtils& storage = StorageUtils::getInstance();

    StorageUtils::StorageStats stats = storage.getStats();
    Serial.printf("Storage Health: %s\n", stats.isHealthy ? "GOOD" : "POOR");
    Serial.printf("Total Operations: %lu reads, %lu writes\n",
                  stats.totalReads, stats.totalWrites);

    if (!stats.lastError.isEmpty()) {
        Serial.printf("Last Error: %s\n", stats.lastError.c_str());
    }

    // Print detailed statistics
    storage.printStorageInfo();
}
```

### **Easy Macros for Quick Access:**
```cpp
void quickOperations() {
    // Simple macro-based access
    STORAGE_SET_STRING("config", "version", "1.2.3");
    STORAGE_SET_INT("stats", "bootCount", 42);
    STORAGE_SET_BOOL("flags", "firstRun", false);

    String version = STORAGE_GET_STRING("config", "version", "unknown");
    int boots = STORAGE_GET_INT("stats", "bootCount", 0);
    bool isFirstRun = STORAGE_GET_BOOL("flags", "firstRun", true);
}
```

## 🔧 **Integration with Existing Code**

### **Replace Existing Patterns:**

**Before:**
```cpp
Preferences preferences;
if (preferences.begin("wifi", false)) {
    preferences.putString("ssid", ssid);
    preferences.putString("pw", password);
    preferences.end();
}
```

**After:**
```cpp
WiFiStorageManager& wifiStorage = WIFI_STORAGE;
wifiStorage.setSSID(ssid);
wifiStorage.setPassword(password);
```

### **JSON Configuration Support:**
```cpp
void handleConfigAPI(AsyncWebServerRequest* request, JsonVariant& json) {
    WiFiStorageManager& wifiStorage = WIFI_STORAGE;

    // Load from JSON with validation
    StorageUtils::Result result = wifiStorage.fromJson(json.as<JsonObject>());

    if (result == StorageUtils::SUCCESS) {
        request->send(200, "application/json", "{\"status\":\"success\"}");
    } else {
        request->send(400, "application/json", "{\"error\":\"Invalid configuration\"}");
    }
}

void getConfigAPI(AsyncWebServerRequest* request) {
    WiFiStorageManager& wifiStorage = WIFI_STORAGE;

    // Export to JSON
    DynamicJsonDocument doc = wifiStorage.toJson();

    String response;
    serializeJson(doc, response);
    request->send(200, "application/json", response);
}
```

## 📊 **Error Handling & Validation**

### **Built-in Validation:**
```cpp
void testValidation() {
    WiFiStorageManager& wifiStorage = WIFI_STORAGE;

    // Automatic validation
    StorageUtils::Result result = wifiStorage.setSSID("This_SSID_Is_Way_Too_Long_For_WiFi_Standards");
    if (result == StorageUtils::VALIDATION_ERROR) {
        Serial.println("SSID too long - rejected");
    }

    // Hostname validation
    result = wifiStorage.setHostname("invalid hostname with spaces");
    if (result == StorageUtils::VALIDATION_ERROR) {
        Serial.println("Invalid hostname format - rejected");
    }
}
```

### **Error Recovery:**
```cpp
void handleStorageErrors() {
    StorageUtils& storage = StorageUtils::getInstance();

    StorageUtils::Result result = storage.setString("test", "key", "value");
    if (result != StorageUtils::SUCCESS) {
        Serial.printf("Storage error: %s\n", storage.resultToString(result).c_str());
        Serial.printf("Details: %s\n", storage.getLastError().c_str());

        // Reset statistics and try again
        storage.resetStats();
    }
}
```

## 🎊 **Summary**

### **Improvements Delivered:**
- **✅ Centralized Storage:** Single point of access for all storage operations
- **✅ Error Handling:** Proper error codes and detailed error messages
- **✅ Type Safety:** Structured configuration objects with validation
- **✅ Performance:** Bulk operations and optimized NVS usage
- **✅ Debugging:** Statistics, logging, and health monitoring
- **✅ Consistency:** Same patterns across all storage operations
- **✅ Maintainability:** Easy to extend and modify storage logic

### **Files to Update:**
To integrate this into your existing code, update these files to use the new storage utilities:
- `src/wifi_module.cpp` - Replace scattered Preferences calls
- `src/web.cpp` - Use WiFiStorageManager for configuration APIs
- `src/wifimanager.cpp` - Simplify WiFi config management

### **Zero Breaking Changes:**
- All existing functionality is preserved
- New system provides the same data access
- Gradual migration is possible
- No changes to user-facing interfaces

Your ESP32 now has professional-grade storage management that's easy to use, debug, and maintain!
