#ifndef STORAGE_UTILS_H
#define STORAGE_UTILS_H

#ifdef __cplusplus

#include <Arduino.h>
#include <ArduinoJson.h>
#include <Preferences.h>

/**
 * @brief Centralized Storage Utilities for ESP32 NVS Management
 *
 * This class provides a clean, thread-safe interface for all storage operations.
 * Eliminates duplicate NVS handling code and provides consistent error handling.
 */
class StorageUtils {
   public:
    /**
     * @brief Storage operation result codes
     */
    enum class Result {
        SUCCESS = 0,
        NAMESPACE_ERROR = 1,
        WRITE_ERROR = 2,
        READ_ERROR = 3,
        VALIDATION_ERROR = 4,
        MEMORY_ERROR = 5,
        KEY_NOT_FOUND = 6,
        NAMESPACE_NOT_FOUND = 7
    };

    /**
     * @brief Storage statistics for debugging and monitoring
     */
    struct StorageStats {
        uint32_t totalReads;
        uint32_t totalWrites;
        uint32_t failedReads;
        uint32_t failedWrites;
        uint32_t lastOperationTime;
        String lastError;
        bool isHealthy;

        StorageStats() : totalReads(0), totalWrites(0), failedReads(0), failedWrites(0), lastOperationTime(0), lastError(""), isHealthy(true) {}
    };

    /**
     * @brief Key-value pair for bulk operations
     */
    struct KeyValue {
        String key;
        String value;
        KeyValue(const String& k, const String& v) : key(k), value(v) {}
        KeyValue() : key(""), value("") {}
    };

    /**
     * @brief Get singleton instance
     */
    static StorageUtils& getInstance();

    // Core String Operations
    Result setString(const String& nameSpace, const String& key, const String& value);
    String getString(const String& nameSpace, const String& key, const String& defaultValue = "");

    // Core Integer Operations
    Result setInt(const String& nameSpace, const String& key, int32_t value);
    int32_t getInt(const String& nameSpace, const String& key, int32_t defaultValue = 0);

    // Core Boolean Operations
    Result setBool(const String& nameSpace, const String& key, bool value);
    bool getBool(const String& nameSpace, const String& key, bool defaultValue = false);

    // Core Float Operations
    Result setFloat(const String& nameSpace, const String& key, float value);
    float getFloat(const String& nameSpace, const String& key, float defaultValue = 0.0f);

    // Bulk Operations for Strings
    Result setMultipleStrings(const String& nameSpace, KeyValue* keyValues, size_t count);
    Result getMultipleStrings(const String& nameSpace, const String* keys, String* values, size_t count, const String& defaultValue = "");
    Result setFromJson(const String& nameSpace, const JsonObject& json);
    DynamicJsonDocument getAsJson(const String& nameSpace, const String* keys, size_t keyCount);

    // Namespace Management
    Result clearNamespace(const String& nameSpace);
    Result removeKey(const String& nameSpace, const String& key);
    bool hasKey(const String& nameSpace, const String& key);
    size_t getNamespaceSize(const String& nameSpace);

    // Validation and Sanitization
    bool isValidKey(const String& key);
    bool isValidNamespace(const String& nameSpace);
    String sanitizeKey(const String& key);
    String sanitizeNamespace(const String& nameSpace);

    // Statistics and Debugging
    StorageStats getStats() const { return stats; }
    void resetStats();
    String getLastError() const { return stats.lastError; }
    bool isHealthy() const { return stats.isHealthy; }

    // System Operations
    void printStorageInfo();
    void performHealthCheck();

    // Utility Functions
    String resultToString(Result result);
    void enableDebugLogging(bool enable) { debugLogging = enable; }

   private:
    StorageUtils() = default;
    ~StorageUtils() = default;
    StorageUtils(const StorageUtils&) = delete;
    StorageUtils& operator=(const StorageUtils&) = delete;

    // Internal helper methods
    bool openNamespace(Preferences& prefs, const String& nameSpace, bool readOnly = false);
    void updateStats(bool success, bool isWrite);
    void logOperation(const String& operation, const String& nameSpace, const String& key, bool success);
    Result validateInput(const String& nameSpace, const String& key);

    // Member variables
    mutable StorageStats stats;
    bool debugLogging = false;
    static constexpr size_t MAX_KEY_LENGTH = 15;        // NVS limitation
    static constexpr size_t MAX_NAMESPACE_LENGTH = 15;  // NVS limitation
    static constexpr size_t MAX_STRING_LENGTH = 4000;   // Practical limit for strings
};

/**
 * @brief Specialized WiFi Storage Manager
 *
 * Provides WiFi-specific storage operations with validation and defaults
 */
class WiFiStorageManager {
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

    static WiFiStorageManager& getInstance();

    // WiFi Configuration Management
    StorageUtils::Result saveConfig(const WiFiConfig& config);
    WiFiConfig loadConfig();
    StorageUtils::Result clearConfig();

    // Configuration Management
    StorageUtils::Result setHostname(const String& hostname);
    StorageUtils::Result setAutoReconnect(bool enable);
    StorageUtils::Result setPowerSave(bool enable);
    StorageUtils::Result setChannel(int channel);
    StorageUtils::Result save();  // Save current configuration

    // Getters with validation
    String getSSID() const;
    String getPassword() const;
    String getIP() const;
    String getMask() const;
    String getGateway() const;
    String getDNS() const;
    String getHostname() const;
    bool getAutoReconnect() const;
    bool getPowerSave() const;
    int getChannel() const;

    // Utility functions
    bool hasCredentials() const;
    bool hasStaticIP() const;
    DynamicJsonDocument toJson() const;
    StorageUtils::Result fromJson(const JsonObject& json);

    // Factory reset
    StorageUtils::Result factoryReset();

   private:
    WiFiStorageManager() = default;

    // Individual Setting Management (private - used internally)
    StorageUtils::Result setSSID(const String& ssid);
    StorageUtils::Result setPassword(const String& password);
    StorageUtils::Result setStaticIP(const String& ip);
    StorageUtils::Result setStaticIP(const String& ip, const String& mask, const String& gateway, const String& dns);
    StorageUtils::Result setGateway(const String& gateway);
    StorageUtils::Result setSubnetMask(const String& mask);
    StorageUtils::Result setDNS(const String& dns);

    // Validation helpers
    bool isValidSSID(const String& ssid) const;
    bool isValidPassword(const String& password) const;
    bool isValidIP(const String& ip) const;
    bool isValidHostname(const String& hostname) const;

    static constexpr const char* NAMESPACE = "wifi";
};

/**
 * @brief System Settings Storage Manager
 *
 * Manages system-wide configuration and settings
 */
class SystemStorageManager {
   public:
    struct SystemConfig {
        String deviceName;
        String firmwareVersion;
        uint32_t bootCount;
        uint32_t uptime;
        bool firstBoot;
        bool debugMode;
        int logLevel;  // 0=None, 1=Error, 2=Warning, 3=Info, 4=Debug
        bool webEnabled;
        int webPort;
        bool serialEnabled;
        uint32_t serialBaud;

        SystemConfig() : deviceName("ESP32-AP-Flasher"), firmwareVersion("1.0.0"), bootCount(0), uptime(0), firstBoot(true), debugMode(false), logLevel(2), webEnabled(true), webPort(80), serialEnabled(true), serialBaud(115200) {}
    };

    static SystemStorageManager& getInstance();

    // System Configuration Management
    StorageUtils::Result saveConfig(const SystemConfig& config);
    SystemConfig loadConfig();  // fixed: was `SystemConfig();`
    StorageUtils::Result incrementBootCount();
    StorageUtils::Result updateUptime(uint32_t uptime);
    StorageUtils::Result setFirstBoot(bool isFirst);

    // Individual Settings
    StorageUtils::Result setDeviceName(const String& name);
    StorageUtils::Result setDebugMode(bool enable);
    StorageUtils::Result setLogLevel(int level);
    StorageUtils::Result setWebEnabled(bool enable);
    StorageUtils::Result setWebPort(int port);

    // Getters
    String getDeviceName() const;
    String getFirmwareVersion() const;
    uint32_t getBootCount() const;
    uint32_t getUptime() const;
    bool isFirstBoot() const;
    bool isDebugMode() const;
    int getLogLevel() const;
    bool isWebEnabled() const;
    int getWebPort() const;

    // Utility functions
    DynamicJsonDocument toJson() const;
    StorageUtils::Result fromJson(const JsonObject& json);
    StorageUtils::Result factoryReset();

   private:
    SystemStorageManager() = default;

    static constexpr const char* NAMESPACE = "system";
};

/**
 * @brief Convenience macros for common storage operations
 */
#define STORAGE_GET_STRING(ns, key, def) StorageUtils::getInstance().getString(ns, key, def)
#define STORAGE_SET_STRING(ns, key, val) StorageUtils::getInstance().setString(ns, key, val)
#define STORAGE_GET_INT(ns, key, def) StorageUtils::getInstance().getInt(ns, key, def)
#define STORAGE_SET_INT(ns, key, val) StorageUtils::getInstance().setInt(ns, key, val)
#define STORAGE_GET_BOOL(ns, key, def) StorageUtils::getInstance().getBool(ns, key, def)
#define STORAGE_SET_BOOL(ns, key, val) StorageUtils::getInstance().setBool(ns, key, val)

// WiFi-specific convenience macros
#define WIFI_STORAGE WiFiStorageManager::getInstance()
#define SYSTEM_STORAGE SystemStorageManager::getInstance()

#endif  // __cplusplus

#endif  // STORAGE_UTILS_H
