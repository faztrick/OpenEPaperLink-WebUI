#include <Arduino.h>
#include <ArduinoJson.h>
#include <Preferences.h>

/**
 * @brief Centralized Storage Utilities for ESP32 NVS Management
 *
 * Provides a clean, sane interface for all storage operations with proper error handling
 */
class StorageUtils {
   public:
    enum Result {
        SUCCESS = 0,
        NAMESPACE_ERROR = 1,
        WRITE_ERROR = 2,
        READ_ERROR = 3,
        VALIDATION_ERROR = 4,
        KEY_NOT_FOUND = 6
    };

    struct StorageStats {
        uint32_t totalReads;
        uint32_t totalWrites;
        uint32_t failedReads;
        uint32_t failedWrites;
        String lastError;
        bool isHealthy;

        StorageStats() : totalReads(0), totalWrites(0), failedReads(0), failedWrites(0), lastError(""), isHealthy(true) {}
    };

    static StorageUtils& getInstance() {
        static StorageUtils instance;
        return instance;
    }

    // Core String Operations
    Result setString(const String& nameSpace, const String& key, const String& value) {
        Preferences prefs;
        if (!prefs.begin(nameSpace.c_str(), false)) {
            updateStats(false, true);
            stats.lastError = "Failed to open namespace: " + nameSpace;
            return NAMESPACE_ERROR;
        }

        size_t written = prefs.putString(key.c_str(), value);
        prefs.end();

        bool success = (written > 0 || value.isEmpty());
        updateStats(success, true);

        if (!success) {
            stats.lastError = "Failed to write key: " + key;
            return WRITE_ERROR;
        }

        logOperation("setString", nameSpace, key, true);
        return SUCCESS;
    }

    String getString(const String& nameSpace, const String& key, const String& defaultValue = "") {
        Preferences prefs;
        if (!prefs.begin(nameSpace.c_str(), true)) {
            updateStats(false, false);
            stats.lastError = "Failed to open namespace: " + nameSpace;
            return defaultValue;
        }

        String result = prefs.getString(key.c_str(), defaultValue);
        prefs.end();

        updateStats(true, false);
        logOperation("getString", nameSpace, key, true);
        return result;
    }

    // Core Integer Operations
    Result setInt(const String& nameSpace, const String& key, int32_t value) {
        Preferences prefs;
        if (!prefs.begin(nameSpace.c_str(), false)) {
            updateStats(false, true);
            stats.lastError = "Failed to open namespace: " + nameSpace;
            return NAMESPACE_ERROR;
        }

        size_t written = prefs.putInt(key.c_str(), value);
        prefs.end();

        bool success = (written > 0);
        updateStats(success, true);

        if (!success) {
            stats.lastError = "Failed to write int key: " + key;
            return WRITE_ERROR;
        }

        logOperation("setInt", nameSpace, key, true);
        return SUCCESS;
    }

    int32_t getInt(const String& nameSpace, const String& key, int32_t defaultValue = 0) {
        Preferences prefs;
        if (!prefs.begin(nameSpace.c_str(), true)) {
            updateStats(false, false);
            stats.lastError = "Failed to open namespace: " + nameSpace;
            return defaultValue;
        }

        int32_t result = prefs.getInt(key.c_str(), defaultValue);
        prefs.end();

        updateStats(true, false);
        logOperation("getInt", nameSpace, key, true);
        return result;
    }

    // Core Boolean Operations
    Result setBool(const String& nameSpace, const String& key, bool value) {
        Preferences prefs;
        if (!prefs.begin(nameSpace.c_str(), false)) {
            updateStats(false, true);
            stats.lastError = "Failed to open namespace: " + nameSpace;
            return NAMESPACE_ERROR;
        }

        size_t written = prefs.putBool(key.c_str(), value);
        prefs.end();

        bool success = (written > 0);
        updateStats(success, true);

        if (!success) {
            stats.lastError = "Failed to write bool key: " + key;
            return WRITE_ERROR;
        }

        logOperation("setBool", nameSpace, key, true);
        return SUCCESS;
    }

    bool getBool(const String& nameSpace, const String& key, bool defaultValue = false) {
        Preferences prefs;
        if (!prefs.begin(nameSpace.c_str(), true)) {
            updateStats(false, false);
            stats.lastError = "Failed to open namespace: " + nameSpace;
            return defaultValue;
        }

        bool result = prefs.getBool(key.c_str(), defaultValue);
        prefs.end();

        updateStats(true, false);
        logOperation("getBool", nameSpace, key, true);
        return result;
    }

    // Bulk String Operations
    Result setMultipleStrings(const String& nameSpace, const String keys[], const String values[], size_t count) {
        Preferences prefs;
        if (!prefs.begin(nameSpace.c_str(), false)) {
            updateStats(false, true);
            stats.lastError = "Failed to open namespace: " + nameSpace;
            return NAMESPACE_ERROR;
        }

        bool allSuccess = true;
        for (size_t i = 0; i < count; i++) {
            size_t written = prefs.putString(keys[i].c_str(), values[i]);
            if (written == 0 && !values[i].isEmpty()) {
                allSuccess = false;
                stats.lastError = "Failed to write key: " + keys[i];
            }
        }

        prefs.end();
        updateStats(allSuccess, true);

        if (!allSuccess) {
            return WRITE_ERROR;
        }

        logOperation("setMultipleStrings", nameSpace, String(count) + " keys", true);
        return SUCCESS;
    }

    // Namespace Management
    Result clearNamespace(const String& nameSpace) {
        Preferences prefs;
        if (!prefs.begin(nameSpace.c_str(), false)) {
            updateStats(false, true);
            stats.lastError = "Failed to open namespace: " + nameSpace;
            return NAMESPACE_ERROR;
        }

        bool success = prefs.clear();
        prefs.end();

        updateStats(success, true);

        if (!success) {
            stats.lastError = "Failed to clear namespace: " + nameSpace;
            return WRITE_ERROR;
        }

        logOperation("clearNamespace", nameSpace, "all", true);
        return SUCCESS;
    }

    Result removeKey(const String& nameSpace, const String& key) {
        Preferences prefs;
        if (!prefs.begin(nameSpace.c_str(), false)) {
            updateStats(false, true);
            stats.lastError = "Failed to open namespace: " + nameSpace;
            return NAMESPACE_ERROR;
        }

        bool success = prefs.remove(key.c_str());
        prefs.end();

        updateStats(success, true);

        if (!success) {
            stats.lastError = "Failed to remove key: " + key;
            return WRITE_ERROR;
        }

        logOperation("removeKey", nameSpace, key, true);
        return SUCCESS;
    }

    bool hasKey(const String& nameSpace, const String& key) {
        Preferences prefs;
        if (!prefs.begin(nameSpace.c_str(), true)) {
            updateStats(false, false);
            return false;
        }

        bool exists = prefs.isKey(key.c_str());
        prefs.end();

        updateStats(true, false);
        return exists;
    }

    // Validation
    bool isValidKey(const String& key) {
        return key.length() > 0 && key.length() <= 15 && !key.startsWith(" ");
    }

    bool isValidNamespace(const String& nameSpace) {
        return nameSpace.length() > 0 && nameSpace.length() <= 15 && !nameSpace.startsWith(" ");
    }

    // Statistics
    StorageStats getStats() const { return stats; }

    void resetStats() {
        stats = StorageStats();
    }

    String getLastError() const { return stats.lastError; }

    bool isHealthy() const { return stats.isHealthy; }

    // Utility Functions
    String resultToString(Result result) {
        switch (result) {
            case SUCCESS:
                return "SUCCESS";
            case NAMESPACE_ERROR:
                return "NAMESPACE_ERROR";
            case WRITE_ERROR:
                return "WRITE_ERROR";
            case READ_ERROR:
                return "READ_ERROR";
            case VALIDATION_ERROR:
                return "VALIDATION_ERROR";
            case KEY_NOT_FOUND:
                return "KEY_NOT_FOUND";
            default:
                return "UNKNOWN_ERROR";
        }
    }

    void enableDebugLogging(bool enable) { debugLogging = enable; }

    void printStorageInfo() {
        Serial.println("=== Storage Utils Statistics ===");
        Serial.printf("Total Reads: %lu\n", stats.totalReads);
        Serial.printf("Total Writes: %lu\n", stats.totalWrites);
        Serial.printf("Failed Reads: %lu\n", stats.failedReads);
        Serial.printf("Failed Writes: %lu\n", stats.failedWrites);
        Serial.printf("Health Status: %s\n", stats.isHealthy ? "HEALTHY" : "UNHEALTHY");
        Serial.printf("Last Error: %s\n", stats.lastError.c_str());
        Serial.println("================================");
    }

   private:
    StorageUtils() = default;
    ~StorageUtils() = default;
    StorageUtils(const StorageUtils&) = delete;
    StorageUtils& operator=(const StorageUtils&) = delete;

    void updateStats(bool success, bool isWrite) {
        if (isWrite) {
            stats.totalWrites++;
            if (!success) stats.failedWrites++;
        } else {
            stats.totalReads++;
            if (!success) stats.failedReads++;
        }

        // Update health status - consider unhealthy if more than 10% operations fail
        uint32_t totalOps = stats.totalReads + stats.totalWrites;
        uint32_t totalFails = stats.failedReads + stats.failedWrites;
        stats.isHealthy = (totalOps == 0) || ((totalFails * 100 / totalOps) < 10);
    }

    void logOperation(const String& operation, const String& nameSpace, const String& key, bool success) {
        if (debugLogging) {
            Serial.printf("[STORAGE] %s %s:%s - %s\n",
                          operation.c_str(), nameSpace.c_str(), key.c_str(),
                          success ? "SUCCESS" : "FAILED");
        }
    }

    mutable StorageStats stats;
    bool debugLogging = false;
};

/**
 * @brief WiFi Storage Manager - Provides WiFi-specific storage with validation
 */
class WiFiStorageManager {
   private:
    static constexpr const char* NAMESPACE = "wifi_config";

    // Validation functions
    bool isValidSSID(const String& ssid) const {
        return ssid.length() > 0 && ssid.length() <= 32;
    }

    bool isValidHostname(const String& hostname) const {
        if (hostname.isEmpty() || hostname.length() > 63) return false;
        for (char c : hostname) {
            if (!isalnum(c) && c != '-' && c != '_') return false;
        }
        return true;
    }

    bool isValidIP(const String& ip) const {
        if (ip.isEmpty()) return true;  // Empty IP is valid (means DHCP)
        IPAddress addr;
        return addr.fromString(ip);
    }

   public:
    struct WiFiConfig {
        String ssid;
        String password;
        String ip;
        String mask;
        String gateway;
        String dns;
        String hostname;
        bool autoReconnect;
        bool powerSave;
        int channel;

        WiFiConfig() : ssid(""), password(""), ip(""), mask(""), gateway(""), dns(""), hostname("esp32-ap-flasher"), autoReconnect(true), powerSave(false), channel(0) {}
    };

    static WiFiStorageManager& getInstance() {
        static WiFiStorageManager instance;
        return instance;
    }

    StorageUtils::Result saveConfig(const WiFiConfig& config) {
        StorageUtils& storage = StorageUtils::getInstance();

        // Validate inputs
        if (!isValidSSID(config.ssid) && !config.ssid.isEmpty()) {
            return StorageUtils::Result::VALIDATION_ERROR;
        }

        if (!isValidHostname(config.hostname)) {
            return StorageUtils::Result::VALIDATION_ERROR;
        }

        // Save all config items
        const String keys[] = {"ssid", "password", "ip", "mask", "gateway", "dns", "hostname"};
        const String values[] = {config.ssid, config.password, config.ip, config.mask,
                                 config.gateway, config.dns, config.hostname};

        StorageUtils::Result result = storage.setMultipleStrings(NAMESPACE, keys, values, 7);
        if (result != StorageUtils::Result::SUCCESS) {
            return result;
        }

        // Save boolean and integer values
        storage.setBool(NAMESPACE, "autoReconnect", config.autoReconnect);
        storage.setBool(NAMESPACE, "powerSave", config.powerSave);
        storage.setInt(NAMESPACE, "channel", config.channel);

        return StorageUtils::Result::SUCCESS;
    }

    WiFiConfig loadConfig() {
        StorageUtils& storage = StorageUtils::getInstance();
        WiFiConfig config;

        config.ssid = storage.getString(NAMESPACE, "ssid", "");
        config.password = storage.getString(NAMESPACE, "password", "");
        config.ip = storage.getString(NAMESPACE, "ip", "");
        config.mask = storage.getString(NAMESPACE, "mask", "");
        config.gateway = storage.getString(NAMESPACE, "gateway", "");
        config.dns = storage.getString(NAMESPACE, "dns", "");
        config.hostname = storage.getString(NAMESPACE, "hostname", "esp32-ap-flasher");
        config.autoReconnect = storage.getBool(NAMESPACE, "autoReconnect", true);
        config.powerSave = storage.getBool(NAMESPACE, "powerSave", false);
        config.channel = storage.getInt(NAMESPACE, "channel", 0);

        return config;
    }

    StorageUtils::Result clearConfig() {
        return StorageUtils::getInstance().clearNamespace(NAMESPACE);
    }

    // Individual setters
    StorageUtils::Result setSSID(const String& ssid) {
        if (!isValidSSID(ssid) && !ssid.isEmpty()) {
            return StorageUtils::Result::VALIDATION_ERROR;
        }
        return StorageUtils::getInstance().setString(NAMESPACE, "ssid", ssid);
    }

    StorageUtils::Result setPassword(const String& password) {
        return StorageUtils::getInstance().setString(NAMESPACE, "password", password);
    }

    StorageUtils::Result setHostname(const String& hostname) {
        if (!isValidHostname(hostname)) {
            return StorageUtils::Result::VALIDATION_ERROR;
        }
        return StorageUtils::getInstance().setString(NAMESPACE, "hostname", hostname);
    }

    StorageUtils::Result setIP(const String& ip) {
        if (!ip.isEmpty() && !isValidIP(ip)) {
            return StorageUtils::Result::VALIDATION_ERROR;
        }
        return StorageUtils::getInstance().setString(NAMESPACE, "ip", ip);
    }

    StorageUtils::Result setMask(const String& mask) {
        if (!mask.isEmpty() && !isValidIP(mask)) {
            return StorageUtils::VALIDATION_ERROR;
        }
        return StorageUtils::getInstance().setString(NAMESPACE, "mask", mask);
    }

    StorageUtils::Result setGateway(const String& gateway) {
        if (!gateway.isEmpty() && !isValidIP(gateway)) {
            return StorageUtils::VALIDATION_ERROR;
        }
        return StorageUtils::getInstance().setString(NAMESPACE, "gateway", gateway);
    }

    StorageUtils::Result setDNS(const String& dns) {
        if (!dns.isEmpty() && !isValidIP(dns)) {
            return StorageUtils::VALIDATION_ERROR;
        }
        return StorageUtils::getInstance().setString(NAMESPACE, "dns", dns);
    }

    // Additional setter methods for serial command compatibility
    StorageUtils::Result setStaticIP(const String& ip) {
        return setIP(ip);
    }

    StorageUtils::Result setSubnetMask(const String& mask) {
        return setMask(mask);
    }

    StorageUtils::Result save() {
        // For NVS, data is automatically saved when set
        // This method exists for compatibility
        return StorageUtils::Result::SUCCESS;
    }

    // Individual getters
    String getSSID() const {
        return StorageUtils::getInstance().getString(NAMESPACE, "ssid", "");
    }

    String getPassword() const {
        return StorageUtils::getInstance().getString(NAMESPACE, "password", "");
    }

    String getIP() const {
        return StorageUtils::getInstance().getString(NAMESPACE, "ip", "");
    }

    String getMask() const {
        return StorageUtils::getInstance().getString(NAMESPACE, "mask", "");
    }

    String getGateway() const {
        return StorageUtils::getInstance().getString(NAMESPACE, "gateway", "");
    }

    String getDNS() const {
        return StorageUtils::getInstance().getString(NAMESPACE, "dns", "");
    }

    String getHostname() const {
        return StorageUtils::getInstance().getString(NAMESPACE, "hostname", "esp32-ap-flasher");
    }

    bool getAutoReconnect() const {
        return StorageUtils::getInstance().getBool(NAMESPACE, "autoReconnect", true);
    }

    bool getPowerSave() const {
        return StorageUtils::getInstance().getBool(NAMESPACE, "powerSave", false);
    }

    int getChannel() const {
        return StorageUtils::getInstance().getInt(NAMESPACE, "channel", 0);
    }

    // Utility functions
    bool hasCredentials() const {
        String ssid = getSSID();
        return !ssid.isEmpty();
    }

    bool hasStaticIP() const {
        String ip = StorageUtils::getInstance().getString(NAMESPACE, "ip", "");
        return !ip.isEmpty() && isValidIP(ip);
    }

    DynamicJsonDocument toJson() const {
        DynamicJsonDocument doc(1024);

        // Create a mutable reference to load config
        WiFiStorageManager* self = const_cast<WiFiStorageManager*>(this);
        WiFiConfig config = self->loadConfig();

        doc["ssid"] = config.ssid;
        doc["ip"] = config.ip;
        doc["mask"] = config.mask;
        doc["gateway"] = config.gateway;
        doc["dns"] = config.dns;
        doc["hostname"] = config.hostname;
        doc["autoReconnect"] = config.autoReconnect;
        doc["powerSave"] = config.powerSave;
        doc["channel"] = config.channel;
        doc["hasPassword"] = !config.password.isEmpty();

        return doc;
    }

    StorageUtils::Result fromJson(const JsonObject& json) {
        WiFiConfig config;
        StorageUtils::Result result = StorageUtils::SUCCESS;

        // Load existing config first
        config = loadConfig();

        // Update with new values
        if (json.containsKey("ssid")) {
            String ssid = json["ssid"].as<String>();
            result = setSSID(ssid);
            if (result != StorageUtils::SUCCESS) return result;
        }

        if (json.containsKey("pw")) {
            String password = json["pw"].as<String>();
            result = setPassword(password);
            if (result != StorageUtils::SUCCESS) return result;
        }

        if (json.containsKey("ip")) {
            String ip = json["ip"].as<String>();
            result = setIP(ip);
            if (result != StorageUtils::SUCCESS) return result;
        }

        if (json.containsKey("mask")) {
            String mask = json["mask"].as<String>();
            result = setMask(mask);
            if (result != StorageUtils::SUCCESS) return result;
        }

        if (json.containsKey("gw")) {
            String gateway = json["gw"].as<String>();
            result = setGateway(gateway);
            if (result != StorageUtils::SUCCESS) return result;
        }

        if (json.containsKey("dns")) {
            String dns = json["dns"].as<String>();
            result = setDNS(dns);
            if (result != StorageUtils::SUCCESS) return result;
        }

        if (json.containsKey("hostname")) {
            String hostname = json["hostname"].as<String>();
            result = setHostname(hostname);
            if (result != StorageUtils::SUCCESS) return result;
        }

        return result;
    }

    StorageUtils::Result factoryReset() {
        return clearConfig();
    }

   private:
    WiFiStorageManager() = default;
};

// Convenience macros
#define STORAGE_GET_STRING(ns, key, def) StorageUtils::getInstance().getString(ns, key, def)
#define STORAGE_SET_STRING(ns, key, val) StorageUtils::getInstance().setString(ns, key, val)
#define STORAGE_GET_INT(ns, key, def) StorageUtils::getInstance().getInt(ns, key, def)
#define STORAGE_SET_INT(ns, key, val) StorageUtils::getInstance().setInt(ns, key, val)
#define STORAGE_GET_BOOL(ns, key, def) StorageUtils::getInstance().getBool(ns, key, def)
#define STORAGE_SET_BOOL(ns, key, val) StorageUtils::getInstance().setBool(ns, key, val)

#define WIFI_STORAGE WiFiStorageManager::getInstance()
