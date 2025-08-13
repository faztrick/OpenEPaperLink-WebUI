/**
 * @file json_config.h
 * @brief Optimized JSON Configuration System
 *
 * Modern storage system with direct JSON serialization:
 * - Unified configuration structure with clear sections
 * - Pure JSON file-based storage with atomic operations
 * - Thread-safe operations with mutex protection
 * - Memory-efficient design with proper buffer management
 * - Clean API with robust error handling
 *
 * @version 5.0 - Refactored & Optimized
 */

#ifndef JSON_CONFIG_H
#define JSON_CONFIG_H

#include <Arduino.h>
#include <ArduinoJson.h>
#include <FS.h>

#include <memory>
#include <vector>

#ifndef SD_CARD_ONLY
#include "LittleFS.h"
#endif

#ifdef HAS_SDCARD
#ifdef SD_CARD_SDMMC
#include "SD_MMC.h"
#else
#include "SD.h"
#include "SPI.h"
#endif
#endif

// ============================================================================
// Forward Declarations & Global References
// ============================================================================
extern fs::FS* contentFS;
extern SemaphoreHandle_t fsMutex;

// ============================================================================
// Unified Application Configuration Structure
// ============================================================================

struct AppConfig {
    // System Configuration
    struct SystemSection {
        String deviceName = "ESP32-AP-Flasher";
        String firmwareVersion = "2.0.0";
        uint32_t bootCount = 0;
        bool debugMode = false;
        uint8_t logLevel = 2;
        uint32_t heartbeatInterval = 60000;
        String timezone = "UTC";
        bool nightlyReboot = false;
        uint32_t maxSleep = 3600;
    } system;

    // Security & OTA Configuration
    struct SecuritySection {
        bool enableOTA = true;
        String otaPassword;
        bool enableAuth = false;
        String webUsername = "admin";
        String webPassword;
    } security;

    // WiFi Configuration
    struct WiFiSection {
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
        String apSSID = "ESP32-AP";
        String apPassword = "12345678";
        uint8_t channel = 1;
        bool autoReconnect = true;
        bool powerSave = false;
    } wifi;

    // Hardware Configuration
    struct HardwareSection {
        bool hasSD = false;
        bool hasTFT = false;
        bool hasRGB = false;
        bool hasRC522 = false;
        bool hasIR = false;
        bool ledEnabled = true;
        bool tftEnabled = false;
        uint8_t language = 0;
    } hardware;

    // Tag Management Configuration
    struct TagSection {
        uint16_t maxTags = 100;
        uint16_t defaultUpdateInterval = 300;
        bool autoDiscovery = true;
        bool enableBattery = true;
        int8_t rssiThreshold = -80;
    } tags;

    // Serialization methods
    bool saveToFile(const String& path = "/config/app.json") const;
    bool loadFromFile(const String& path = "/config/app.json");
    String toJson() const;
    bool fromJson(const String& json);
    bool isValid() const;
    void setDefaults();
    void updateBootCount();
};

// ============================================================================
// Tag Configuration Structure
// ============================================================================

struct TagConfig {
    String mac;
    String alias;
    uint8_t channel = 11;
    uint16_t updateInterval = 300;
    bool enabled = true;
    String contentType = "image";
    uint64_t lastUpdate = 0;
    uint8_t batteryLevel = 255;
    int8_t rssi = -128;
    bool invert = false;
    uint8_t tagType = 0;
    uint16_t xRes = 200;
    uint16_t yRes = 200;

    // Additional fields for enhanced functionality
    uint64_t lastSeen = 0;
    uint32_t errorCount = 0;
    bool isOnline = false;

    // Serialization methods
    bool saveToFile(const String& path) const;
    bool loadFromFile(const String& path);
    String toJson() const;
    bool fromJson(const String& json);
    bool isValid() const;
    void updateActivity();
    bool isExpired(uint32_t timeoutMs = 300000) const;  // 5 min default
};

// ============================================================================
// Modern File System Manager with Thread Safety
// ============================================================================

class FileManager {
   public:
    // Core file operations with atomic writes
    static bool saveJson(const String& path, const JsonDocument& doc);
    static bool loadJson(const String& path, JsonDocument& doc);
    static bool writeText(const String& path, const String& content);
    static String readText(const String& path);

    // File management
    static bool exists(const String& path);
    static bool remove(const String& path);
    static bool copy(const String& srcPath, const String& dstPath);
    static uint64_t getFileSize(const String& path);

    // Directory operations
    static bool createPath(const String& path);
    static bool removePath(const String& path);
    static std::vector<String> listFiles(const String& path, const String& extension = "");

    // Backup and recovery
    static bool createBackup(const String& path);
    static bool restoreBackup(const String& path);

   private:
    static bool writeAtomic(const String& path, const String& content);
    static String generateBackupPath(const String& originalPath);
};

// ============================================================================
// Configuration Manager - Thread-Safe Singleton
// ============================================================================

class ConfigManager {
   public:
    static ConfigManager& getInstance();

    // Configuration access
    AppConfig& getConfig() { return config_; }
    const AppConfig& getConfig() const { return config_; }

    // Configuration persistence
    bool save();
    bool load();
    bool reset();
    bool backup();
    bool restore();

    // Legacy compatibility methods for STORAGE_* macros
    String getString(const String& key, const String& defaultValue = "");
    bool setString(const String& key, const String& value);
    int getInt(const String& key, int defaultValue = 0);
    bool setInt(const String& key, int value);
    bool getBool(const String& key, bool defaultValue = false);
    bool setBool(const String& key, bool value);

    // Tag management with caching for performance
    bool saveTag(const TagConfig& tag);
    bool loadTag(const String& mac, TagConfig& tag);
    bool removeTag(const String& mac);
    bool tagExists(const String& mac);
    std::vector<TagConfig> getAllTags();
    std::vector<String> getTagMacs();
    size_t getTagCount();
    bool clearAllTags();
    void refreshTagCache();

    // System management
    bool initialize();
    bool isHealthy() const;
    uint64_t getFreeSpace() const;
    uint64_t getTotalSpace() const;
    void cleanup();

    // Statistics and monitoring
    struct Stats {
        uint32_t configSaves = 0;
        uint32_t configLoads = 0;
        uint32_t tagOperations = 0;
        uint32_t errors = 0;
        uint64_t lastActivity = 0;
    };
    const Stats& getStats() const { return stats_; }
    void resetStats() { stats_ = {}; }

    // Utility functions
    static String formatMacAddress(const String& mac);
    static bool isValidMacAddress(const String& mac);
    static bool isValidIPAddress(const String& ip);
    static String sanitizeFilename(const String& filename);

   private:
    ConfigManager() = default;
    ~ConfigManager() = default;
    ConfigManager(const ConfigManager&) = delete;
    ConfigManager& operator=(const ConfigManager&) = delete;

    AppConfig config_;
    std::vector<TagConfig> tagCache_;
    bool initialized_ = false;
    bool cacheValid_ = false;
    Stats stats_;
    mutable SemaphoreHandle_t mutex_ = nullptr;

    String getTagPath(const String& mac) const;
    void updateStats(bool isError = false);
    bool ensureInitialized() const;

    static constexpr const char* CONFIG_PATH = "/config/app.json";
    static constexpr const char* CONFIG_BACKUP_PATH = "/config/app.json.bak";
    static constexpr const char* TAGS_DIR = "/config/tags";
};

// ============================================================================
// File System Manager with Auto-Detection
// ============================================================================

class FileSystemManager {
   public:
    static bool initialize();
    static void cleanup();
    static fs::FS* getActiveFS() { return activeFS_; }
    static bool isSDCardAvailable() { return useSDCard_ && activeFS_; }
    static bool switchToSDCard();
    static bool switchToLittleFS();
    static uint64_t getFreeSpace();
    static uint64_t getTotalSpace();
    static String getFileSystemType();
    static bool format();

   private:
    static bool initialized_;
    static bool useSDCard_;
    static fs::FS* activeFS_;

    static bool initLittleFS();
    static bool initSDCard();
    static bool createBaseDirectories();
};

// ============================================================================
// Convenience Macros for Easy Access
// ============================================================================

#define CONFIG ConfigManager::getInstance()
#define APP_CONFIG ConfigManager::getInstance().getConfig()

// Section access macros for cleaner code
#define SYSTEM_CONFIG APP_CONFIG.system
#define WIFI_CONFIG APP_CONFIG.wifi
#define HARDWARE_CONFIG APP_CONFIG.hardware
#define SECURITY_CONFIG APP_CONFIG.security
#define TAG_CONFIG APP_CONFIG.tags

// Legacy storage compatibility macros
#define STORAGE_GET_STRING(ns, key, def) CONFIG.getString(ns "_" key, def)
#define STORAGE_SET_STRING(ns, key, val) CONFIG.setString(ns "_" key, val)
#define STORAGE_GET_INT(ns, key, def) CONFIG.getInt(ns "_" key, def)
#define STORAGE_SET_INT(ns, key, val) CONFIG.setInt(ns "_" key, val)
#define STORAGE_GET_BOOL(ns, key, def) CONFIG.getBool(ns "_" key, def)
#define STORAGE_SET_BOOL(ns, key, val) CONFIG.setBool(ns "_" key, val)

// ============================================================================
// Validation Utilities
// ============================================================================

namespace ValidationUtils {
bool isValidMacAddress(const String& mac);
bool isValidIPAddress(const String& ip);
bool isValidHostname(const String& hostname);
bool isValidSSID(const String& ssid);
bool isValidPassword(const String& password, uint8_t minLength = 8);
String formatMacAddress(const String& mac);
String sanitizeString(const String& input, uint16_t maxLength = 64);
}  // namespace ValidationUtils

#endif  // JSON_CONFIG_H
