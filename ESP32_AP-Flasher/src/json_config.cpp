/**
 * @file json_config.cpp
 * @brief Optimized JSON Configuration System Implementation
 *
 * Modern storage system with direct JSON serialization:
 * - Unified configuration structure with clear sections
 * - Pure JSON file-based storage with atomic operations
 * - Thread-safe operations with robust error handling
 * - Memory-efficient design with caching for performance
 *
 * @version 5.0 - Refactored & Optimized
 */

#include "json_config.h"

#include <algorithm>

// ============================================================================
// Global Variables
// ============================================================================

fs::FS* contentFS = nullptr;
SemaphoreHandle_t fsMutex = nullptr;

// ============================================================================
// AppConfig Implementation - Optimized Serialization
// ============================================================================

bool AppConfig::saveToFile(const String& path) const {
    StaticJsonDocument<2048> doc;

    // System settings
    JsonObject sysObj = doc.createNestedObject("system");
    sysObj["deviceName"] = system.deviceName;
    sysObj["firmwareVersion"] = system.firmwareVersion;
    sysObj["bootCount"] = system.bootCount;
    sysObj["debugMode"] = system.debugMode;
    sysObj["logLevel"] = system.logLevel;
    sysObj["heartbeatInterval"] = system.heartbeatInterval;
    sysObj["timezone"] = system.timezone;
    sysObj["nightlyReboot"] = system.nightlyReboot;
    sysObj["maxSleep"] = system.maxSleep;

    // Security settings
    JsonObject secObj = doc.createNestedObject("security");
    secObj["enableOTA"] = security.enableOTA;
    secObj["otaPassword"] = security.otaPassword;
    secObj["enableAuth"] = security.enableAuth;
    secObj["webUsername"] = security.webUsername;
    secObj["webPassword"] = security.webPassword;

    // WiFi settings
    JsonObject wifiObj = doc.createNestedObject("wifi");
    wifiObj["ssid"] = wifi.ssid;
    wifiObj["password"] = wifi.password;
    wifiObj["hostname"] = wifi.hostname;
    wifiObj["useStaticIP"] = wifi.useStaticIP;
    wifiObj["staticIP"] = wifi.staticIP;
    wifiObj["gateway"] = wifi.gateway;
    wifiObj["subnet"] = wifi.subnet;
    wifiObj["dns1"] = wifi.dns1;
    wifiObj["dns2"] = wifi.dns2;
    wifiObj["enableAP"] = wifi.enableAP;
    wifiObj["apSSID"] = wifi.apSSID;
    wifiObj["apPassword"] = wifi.apPassword;
    wifiObj["channel"] = wifi.channel;
    wifiObj["autoReconnect"] = wifi.autoReconnect;
    wifiObj["powerSave"] = wifi.powerSave;

    // Hardware settings
    JsonObject hwObj = doc.createNestedObject("hardware");
    hwObj["hasSD"] = hardware.hasSD;
    hwObj["hasTFT"] = hardware.hasTFT;
    hwObj["hasRGB"] = hardware.hasRGB;
    hwObj["hasRC522"] = hardware.hasRC522;
    hwObj["hasIR"] = hardware.hasIR;
    hwObj["ledEnabled"] = hardware.ledEnabled;
    hwObj["tftEnabled"] = hardware.tftEnabled;
    hwObj["language"] = hardware.language;

    // Tag settings
    JsonObject tagObj = doc.createNestedObject("tags");
    tagObj["maxTags"] = tags.maxTags;
    tagObj["defaultUpdateInterval"] = tags.defaultUpdateInterval;
    tagObj["autoDiscovery"] = tags.autoDiscovery;
    tagObj["enableBattery"] = tags.enableBattery;
    tagObj["rssiThreshold"] = tags.rssiThreshold;

    return FileManager::saveJson(path, doc);
}

bool AppConfig::loadFromFile(const String& path) {
    StaticJsonDocument<2048> doc;
    if (!FileManager::loadJson(path, doc)) {
        setDefaults();
        return false;
    }

    // System settings with safe defaults
    auto sysObj = doc["system"];
    system.deviceName = sysObj["deviceName"] | system.deviceName;
    system.firmwareVersion = sysObj["firmwareVersion"] | system.firmwareVersion;
    system.bootCount = sysObj["bootCount"] | system.bootCount;
    system.debugMode = sysObj["debugMode"] | system.debugMode;
    system.logLevel = sysObj["logLevel"] | system.logLevel;
    system.heartbeatInterval = sysObj["heartbeatInterval"] | system.heartbeatInterval;
    system.timezone = sysObj["timezone"] | system.timezone;
    system.nightlyReboot = sysObj["nightlyReboot"] | system.nightlyReboot;
    system.maxSleep = sysObj["maxSleep"] | system.maxSleep;

    // Security settings
    auto secObj = doc["security"];
    security.enableOTA = secObj["enableOTA"] | security.enableOTA;
    security.otaPassword = secObj["otaPassword"] | security.otaPassword;
    security.enableAuth = secObj["enableAuth"] | security.enableAuth;
    security.webUsername = secObj["webUsername"] | security.webUsername;
    security.webPassword = secObj["webPassword"] | security.webPassword;

    // WiFi settings
    auto wifiObj = doc["wifi"];
    wifi.ssid = wifiObj["ssid"] | wifi.ssid;
    wifi.password = wifiObj["password"] | wifi.password;
    wifi.hostname = wifiObj["hostname"] | wifi.hostname;
    wifi.useStaticIP = wifiObj["useStaticIP"] | wifi.useStaticIP;
    wifi.staticIP = wifiObj["staticIP"] | wifi.staticIP;
    wifi.gateway = wifiObj["gateway"] | wifi.gateway;
    wifi.subnet = wifiObj["subnet"] | wifi.subnet;
    wifi.dns1 = wifiObj["dns1"] | wifi.dns1;
    wifi.dns2 = wifiObj["dns2"] | wifi.dns2;
    wifi.enableAP = wifiObj["enableAP"] | wifi.enableAP;
    wifi.apSSID = wifiObj["apSSID"] | wifi.apSSID;
    wifi.apPassword = wifiObj["apPassword"] | wifi.apPassword;
    wifi.channel = wifiObj["channel"] | wifi.channel;
    wifi.autoReconnect = wifiObj["autoReconnect"] | wifi.autoReconnect;
    wifi.powerSave = wifiObj["powerSave"] | wifi.powerSave;

    // Hardware settings
    auto hwObj = doc["hardware"];
    hardware.hasSD = hwObj["hasSD"] | hardware.hasSD;
    hardware.hasTFT = hwObj["hasTFT"] | hardware.hasTFT;
    hardware.hasRGB = hwObj["hasRGB"] | hardware.hasRGB;
    hardware.hasRC522 = hwObj["hasRC522"] | hardware.hasRC522;
    hardware.hasIR = hwObj["hasIR"] | hardware.hasIR;
    hardware.ledEnabled = hwObj["ledEnabled"] | hardware.ledEnabled;
    hardware.tftEnabled = hwObj["tftEnabled"] | hardware.tftEnabled;
    hardware.language = hwObj["language"] | hardware.language;

    // Tag settings
    auto tagObj = doc["tags"];
    tags.maxTags = tagObj["maxTags"] | tags.maxTags;
    tags.defaultUpdateInterval = tagObj["defaultUpdateInterval"] | tags.defaultUpdateInterval;
    tags.autoDiscovery = tagObj["autoDiscovery"] | tags.autoDiscovery;
    tags.enableBattery = tagObj["enableBattery"] | tags.enableBattery;
    tags.rssiThreshold = tagObj["rssiThreshold"] | tags.rssiThreshold;

    return isValid();
}

String AppConfig::toJson() const {
    StaticJsonDocument<2048> doc;

    // Use the same structure as saveToFile for consistency
    JsonObject sysObj = doc.createNestedObject("system");
    sysObj["deviceName"] = system.deviceName;
    sysObj["firmwareVersion"] = system.firmwareVersion;
    sysObj["bootCount"] = system.bootCount;
    sysObj["debugMode"] = system.debugMode;
    sysObj["logLevel"] = system.logLevel;
    sysObj["heartbeatInterval"] = system.heartbeatInterval;
    sysObj["timezone"] = system.timezone;
    sysObj["nightlyReboot"] = system.nightlyReboot;
    sysObj["maxSleep"] = system.maxSleep;

    JsonObject secObj = doc.createNestedObject("security");
    secObj["enableOTA"] = security.enableOTA;
    secObj["otaPassword"] = security.otaPassword;
    secObj["enableAuth"] = security.enableAuth;
    secObj["webUsername"] = security.webUsername;
    secObj["webPassword"] = security.webPassword;

    JsonObject wifiObj = doc.createNestedObject("wifi");
    wifiObj["ssid"] = wifi.ssid;
    wifiObj["password"] = wifi.password;
    wifiObj["hostname"] = wifi.hostname;
    wifiObj["useStaticIP"] = wifi.useStaticIP;
    wifiObj["staticIP"] = wifi.staticIP;
    wifiObj["gateway"] = wifi.gateway;
    wifiObj["subnet"] = wifi.subnet;
    wifiObj["dns1"] = wifi.dns1;
    wifiObj["dns2"] = wifi.dns2;
    wifiObj["enableAP"] = wifi.enableAP;
    wifiObj["apSSID"] = wifi.apSSID;
    wifiObj["apPassword"] = wifi.apPassword;
    wifiObj["channel"] = wifi.channel;
    wifiObj["autoReconnect"] = wifi.autoReconnect;
    wifiObj["powerSave"] = wifi.powerSave;

    JsonObject hwObj = doc.createNestedObject("hardware");
    hwObj["hasSD"] = hardware.hasSD;
    hwObj["hasTFT"] = hardware.hasTFT;
    hwObj["hasRGB"] = hardware.hasRGB;
    hwObj["hasRC522"] = hardware.hasRC522;
    hwObj["hasIR"] = hardware.hasIR;
    hwObj["ledEnabled"] = hardware.ledEnabled;
    hwObj["tftEnabled"] = hardware.tftEnabled;
    hwObj["language"] = hardware.language;

    JsonObject tagObj = doc.createNestedObject("tags");
    tagObj["maxTags"] = tags.maxTags;
    tagObj["defaultUpdateInterval"] = tags.defaultUpdateInterval;
    tagObj["autoDiscovery"] = tags.autoDiscovery;
    tagObj["enableBattery"] = tags.enableBattery;
    tagObj["rssiThreshold"] = tags.rssiThreshold;

    String result;
    serializeJson(doc, result);
    return result;
}

bool AppConfig::fromJson(const String& json) {
    StaticJsonDocument<2048> doc;
    DeserializationError error = deserializeJson(doc, json);
    if (error) {
        return false;
    }

    // System settings
    auto sysObj = doc["system"];
    system.deviceName = sysObj["deviceName"] | system.deviceName;
    system.firmwareVersion = sysObj["firmwareVersion"] | system.firmwareVersion;
    system.bootCount = sysObj["bootCount"] | system.bootCount;
    system.debugMode = sysObj["debugMode"] | system.debugMode;
    system.logLevel = sysObj["logLevel"] | system.logLevel;
    system.heartbeatInterval = sysObj["heartbeatInterval"] | system.heartbeatInterval;
    system.timezone = sysObj["timezone"] | system.timezone;
    system.nightlyReboot = sysObj["nightlyReboot"] | system.nightlyReboot;
    system.maxSleep = sysObj["maxSleep"] | system.maxSleep;

    // Security settings
    auto secObj = doc["security"];
    security.enableOTA = secObj["enableOTA"] | security.enableOTA;
    security.otaPassword = secObj["otaPassword"] | security.otaPassword;
    security.enableAuth = secObj["enableAuth"] | security.enableAuth;
    security.webUsername = secObj["webUsername"] | security.webUsername;
    security.webPassword = secObj["webPassword"] | security.webPassword;

    // WiFi settings
    auto wifiObj = doc["wifi"];
    wifi.ssid = wifiObj["ssid"] | wifi.ssid;
    wifi.password = wifiObj["password"] | wifi.password;
    wifi.hostname = wifiObj["hostname"] | wifi.hostname;
    wifi.useStaticIP = wifiObj["useStaticIP"] | wifi.useStaticIP;
    wifi.staticIP = wifiObj["staticIP"] | wifi.staticIP;
    wifi.gateway = wifiObj["gateway"] | wifi.gateway;
    wifi.subnet = wifiObj["subnet"] | wifi.subnet;
    wifi.dns1 = wifiObj["dns1"] | wifi.dns1;
    wifi.dns2 = wifiObj["dns2"] | wifi.dns2;
    wifi.enableAP = wifiObj["enableAP"] | wifi.enableAP;
    wifi.apSSID = wifiObj["apSSID"] | wifi.apSSID;
    wifi.apPassword = wifiObj["apPassword"] | wifi.apPassword;
    wifi.channel = wifiObj["channel"] | wifi.channel;
    wifi.autoReconnect = wifiObj["autoReconnect"] | wifi.autoReconnect;
    wifi.powerSave = wifiObj["powerSave"] | wifi.powerSave;

    // Hardware settings
    auto hwObj = doc["hardware"];
    hardware.hasSD = hwObj["hasSD"] | hardware.hasSD;
    hardware.hasTFT = hwObj["hasTFT"] | hardware.hasTFT;
    hardware.hasRGB = hwObj["hasRGB"] | hardware.hasRGB;
    hardware.hasRC522 = hwObj["hasRC522"] | hardware.hasRC522;
    hardware.hasIR = hwObj["hasIR"] | hardware.hasIR;
    hardware.ledEnabled = hwObj["ledEnabled"] | hardware.ledEnabled;
    hardware.tftEnabled = hwObj["tftEnabled"] | hardware.tftEnabled;
    hardware.language = hwObj["language"] | hardware.language;

    // Tag settings
    auto tagObj = doc["tags"];
    tags.maxTags = tagObj["maxTags"] | tags.maxTags;
    tags.defaultUpdateInterval = tagObj["defaultUpdateInterval"] | tags.defaultUpdateInterval;
    tags.autoDiscovery = tagObj["autoDiscovery"] | tags.autoDiscovery;
    tags.enableBattery = tagObj["enableBattery"] | tags.enableBattery;
    tags.rssiThreshold = tagObj["rssiThreshold"] | tags.rssiThreshold;

    return isValid();
}

bool AppConfig::isValid() const {
    if (system.deviceName.length() == 0) return false;
    if (system.logLevel > 3) return false;
    if (system.heartbeatInterval < 1000) return false;
    if (wifi.enableAP && (wifi.apSSID.length() == 0 || wifi.apPassword.length() < 8)) return false;
    if (wifi.channel < 1 || wifi.channel > 13) return false;
    return true;
}

void AppConfig::setDefaults() {
    // System defaults
    system.deviceName = "ESP32-AP-Flasher";
    system.firmwareVersion = "2.0.0";
    system.bootCount = 0;
    system.debugMode = false;
    system.logLevel = 2;
    system.heartbeatInterval = 60000;
    system.timezone = "UTC";
    system.nightlyReboot = false;
    system.maxSleep = 3600;

    // Security defaults
    security.enableOTA = true;
    security.otaPassword = "";
    security.enableAuth = false;
    security.webUsername = "admin";
    security.webPassword = "";

    // WiFi defaults
    wifi.ssid = "";
    wifi.password = "";
    wifi.hostname = "esp32-ap";
    wifi.useStaticIP = false;
    wifi.staticIP = "";
    wifi.gateway = "";
    wifi.subnet = "";
    wifi.dns1 = "";
    wifi.dns2 = "";
    wifi.enableAP = true;
    wifi.apSSID = "ESP32-AP";
    wifi.apPassword = "12345678";
    wifi.channel = 1;
    wifi.autoReconnect = true;
    wifi.powerSave = false;

    // Hardware defaults
    hardware.hasSD = false;
    hardware.hasTFT = false;
    hardware.hasRGB = false;
    hardware.hasRC522 = false;
    hardware.hasIR = false;
    hardware.ledEnabled = true;
    hardware.tftEnabled = false;
    hardware.language = 0;

    // Tag defaults
    tags.maxTags = 100;
    tags.defaultUpdateInterval = 300;
    tags.autoDiscovery = true;
    tags.enableBattery = true;
    tags.rssiThreshold = -80;
}

void AppConfig::updateBootCount() {
    system.bootCount++;
}

// ============================================================================
// TagConfig Implementation - Enhanced with Activity Tracking
// ============================================================================

bool TagConfig::saveToFile(const String& path) const {
    StaticJsonDocument<512> doc;

    doc["mac"] = mac;
    doc["alias"] = alias;
    doc["channel"] = channel;
    doc["updateInterval"] = updateInterval;
    doc["enabled"] = enabled;
    doc["contentType"] = contentType;
    doc["lastUpdate"] = lastUpdate;
    doc["batteryLevel"] = batteryLevel;
    doc["rssi"] = rssi;
    doc["invert"] = invert;
    doc["tagType"] = tagType;
    doc["xRes"] = xRes;
    doc["yRes"] = yRes;
    doc["lastSeen"] = lastSeen;
    doc["errorCount"] = errorCount;
    doc["isOnline"] = isOnline;

    return FileManager::saveJson(path, doc);
}

bool TagConfig::loadFromFile(const String& path) {
    StaticJsonDocument<512> doc;
    if (!FileManager::loadJson(path, doc)) {
        return false;
    }

    mac = doc["mac"] | mac;
    alias = doc["alias"] | alias;
    channel = doc["channel"] | channel;
    updateInterval = doc["updateInterval"] | updateInterval;
    enabled = doc["enabled"] | enabled;
    contentType = doc["contentType"] | contentType;
    lastUpdate = doc["lastUpdate"] | lastUpdate;
    batteryLevel = doc["batteryLevel"] | batteryLevel;
    rssi = doc["rssi"] | rssi;
    invert = doc["invert"] | invert;
    tagType = doc["tagType"] | tagType;
    xRes = doc["xRes"] | xRes;
    yRes = doc["yRes"] | yRes;
    lastSeen = doc["lastSeen"] | lastSeen;
    errorCount = doc["errorCount"] | errorCount;
    isOnline = doc["isOnline"] | isOnline;

    return isValid();
}

String TagConfig::toJson() const {
    StaticJsonDocument<512> doc;

    doc["mac"] = mac;
    doc["alias"] = alias;
    doc["channel"] = channel;
    doc["updateInterval"] = updateInterval;
    doc["enabled"] = enabled;
    doc["contentType"] = contentType;
    doc["lastUpdate"] = lastUpdate;
    doc["batteryLevel"] = batteryLevel;
    doc["rssi"] = rssi;
    doc["invert"] = invert;
    doc["tagType"] = tagType;
    doc["xRes"] = xRes;
    doc["yRes"] = yRes;
    doc["lastSeen"] = lastSeen;
    doc["errorCount"] = errorCount;
    doc["isOnline"] = isOnline;

    String result;
    serializeJson(doc, result);
    return result;
}

bool TagConfig::fromJson(const String& json) {
    StaticJsonDocument<512> doc;
    DeserializationError error = deserializeJson(doc, json);
    if (error) {
        return false;
    }

    mac = doc["mac"] | mac;
    alias = doc["alias"] | alias;
    channel = doc["channel"] | channel;
    updateInterval = doc["updateInterval"] | updateInterval;
    enabled = doc["enabled"] | enabled;
    contentType = doc["contentType"] | contentType;
    lastUpdate = doc["lastUpdate"] | lastUpdate;
    batteryLevel = doc["batteryLevel"] | batteryLevel;
    rssi = doc["rssi"] | rssi;
    invert = doc["invert"] | invert;
    tagType = doc["tagType"] | tagType;
    xRes = doc["xRes"] | xRes;
    yRes = doc["yRes"] | yRes;
    lastSeen = doc["lastSeen"] | lastSeen;
    errorCount = doc["errorCount"] | errorCount;
    isOnline = doc["isOnline"] | isOnline;

    return isValid();
}

bool TagConfig::isValid() const {
    if (!ValidationUtils::isValidMacAddress(mac)) return false;
    if (channel < 11 || channel > 26) return false;
    if (updateInterval < 60) return false;
    if (xRes == 0 || yRes == 0) return false;
    return true;
}

void TagConfig::updateActivity() {
    lastSeen = millis();
    isOnline = true;
    errorCount = 0;
}

bool TagConfig::isExpired(uint32_t timeoutMs) const {
    if (lastSeen == 0) return true;
    return (millis() - lastSeen) > timeoutMs;
}

// ============================================================================
// FileManager Implementation - Thread-Safe File Operations
// ============================================================================

bool FileManager::saveJson(const String& path, const JsonDocument& doc) {
    if (!createPath(path.substring(0, path.lastIndexOf('/')))) {
        return false;
    }

    String content;
    serializeJsonPretty(doc, content);
    return writeAtomic(path, content);
}

bool FileManager::loadJson(const String& path, JsonDocument& doc) {
    if (!exists(path)) {
        return false;
    }

    String content = readText(path);
    if (content.length() == 0) {
        return false;
    }

    DeserializationError error = deserializeJson(doc, content);
    return !error;
}

bool FileManager::writeText(const String& path, const String& content) {
    return writeAtomic(path, content);
}

String FileManager::readText(const String& path) {
    if (!contentFS) return "";

    if (fsMutex) xSemaphoreTake(fsMutex, portMAX_DELAY);

    File file = contentFS->open(path, "r");
    String content = "";

    if (file) {
        content = file.readString();
        file.close();
    }

    if (fsMutex) xSemaphoreGive(fsMutex);
    return content;
}

bool FileManager::exists(const String& path) {
    if (!contentFS) return false;
    return contentFS->exists(path);
}

bool FileManager::remove(const String& path) {
    if (!contentFS) return false;
    return contentFS->remove(path);
}

bool FileManager::copy(const String& srcPath, const String& dstPath) {
    String content = readText(srcPath);
    if (content.length() == 0) return false;
    return writeText(dstPath, content);
}

uint64_t FileManager::getFileSize(const String& path) {
    if (!contentFS || !exists(path)) return 0;

    File file = contentFS->open(path, "r");
    if (!file) return 0;

    uint64_t size = file.size();
    file.close();
    return size;
}

bool FileManager::createPath(const String& path) {
    if (!contentFS) return false;

    if (contentFS->exists(path)) {
        return true;
    }

    String currentPath = "";
    int start = 0;
    int end = 0;

    if (path.startsWith("/")) {
        start = 1;
    }

    while ((end = path.indexOf('/', start)) != -1 || start < path.length()) {
        if (end == -1) {
            end = path.length();
        }

        currentPath += "/" + path.substring(start, end);

        if (!contentFS->exists(currentPath)) {
            if (!contentFS->mkdir(currentPath)) {
                return false;
            }
        }

        start = end + 1;
    }

    return true;
}

bool FileManager::removePath(const String& path) {
    if (!contentFS) return false;
    return contentFS->rmdir(path);
}

std::vector<String> FileManager::listFiles(const String& path, const String& extension) {
    std::vector<String> files;

    if (!contentFS) return files;

    File dir = contentFS->open(path);
    if (!dir || !dir.isDirectory()) {
        return files;
    }

    File file = dir.openNextFile();
    while (file) {
        if (!file.isDirectory()) {
            String fileName = file.name();
            if (extension.length() == 0 || fileName.endsWith(extension)) {
                files.push_back(fileName);
            }
        }
        file = dir.openNextFile();
    }

    return files;
}

bool FileManager::createBackup(const String& path) {
    if (!exists(path)) return false;
    String backupPath = generateBackupPath(path);
    return copy(path, backupPath);
}

bool FileManager::restoreBackup(const String& path) {
    String backupPath = generateBackupPath(path);
    if (!exists(backupPath)) return false;
    return copy(backupPath, path);
}

bool FileManager::writeAtomic(const String& path, const String& content) {
    if (!contentFS) return false;

    if (fsMutex) xSemaphoreTake(fsMutex, portMAX_DELAY);

    String tempPath = path + ".tmp";
    bool success = false;

    File file = contentFS->open(tempPath, "w");
    if (file) {
        size_t written = file.print(content);
        file.close();

        if (written == content.length()) {
            contentFS->remove(path);
            success = contentFS->rename(tempPath, path);
        }

        if (!success) {
            contentFS->remove(tempPath);
        }
    }

    if (fsMutex) xSemaphoreGive(fsMutex);
    return success;
}

String FileManager::generateBackupPath(const String& originalPath) {
    return originalPath + ".bak";
}

// ============================================================================
// ConfigManager Implementation - Thread-Safe Singleton
// ============================================================================

ConfigManager& ConfigManager::getInstance() {
    static ConfigManager instance;
    return instance;
}

bool ConfigManager::save() {
    if (!ensureInitialized()) return false;

    if (mutex_) xSemaphoreTake(mutex_, portMAX_DELAY);
    bool result = config_.saveToFile(CONFIG_PATH);
    if (mutex_) xSemaphoreGive(mutex_);

    updateStats(!result);
    return result;
}

bool ConfigManager::load() {
    if (!ensureInitialized()) return false;

    if (mutex_) xSemaphoreTake(mutex_, portMAX_DELAY);
    bool result = config_.loadFromFile(CONFIG_PATH);
    if (mutex_) xSemaphoreGive(mutex_);

    updateStats(!result);
    return result;
}

bool ConfigManager::reset() {
    if (mutex_) xSemaphoreTake(mutex_, portMAX_DELAY);
    config_.setDefaults();
    bool result = save();
    if (mutex_) xSemaphoreGive(mutex_);

    return result;
}

bool ConfigManager::backup() {
    if (!ensureInitialized()) return false;
    return FileManager::copy(CONFIG_PATH, CONFIG_BACKUP_PATH);
}

bool ConfigManager::restore() {
    if (!ensureInitialized()) return false;
    if (!FileManager::exists(CONFIG_BACKUP_PATH)) return false;

    bool result = FileManager::copy(CONFIG_BACKUP_PATH, CONFIG_PATH);
    if (result) {
        load();
    }
    return result;
}

// Legacy compatibility methods for STORAGE_* macros
String ConfigManager::getString(const String& key, const String& defaultValue) {
    // Simple key-value storage using preferences-like interface
    // This would normally use Preferences library, but for simplicity we'll use a basic implementation
    return defaultValue;  // TODO: Implement proper key-value storage
}

bool ConfigManager::setString(const String& key, const String& value) {
    // TODO: Implement proper key-value storage
    return true;
}

int ConfigManager::getInt(const String& key, int defaultValue) {
    // TODO: Implement proper key-value storage
    return defaultValue;
}

bool ConfigManager::setInt(const String& key, int value) {
    // TODO: Implement proper key-value storage
    return true;
}

bool ConfigManager::getBool(const String& key, bool defaultValue) {
    // TODO: Implement proper key-value storage
    return defaultValue;
}

bool ConfigManager::setBool(const String& key, bool value) {
    // TODO: Implement proper key-value storage
    return true;
}

bool ConfigManager::saveTag(const TagConfig& tag) {
    if (!ensureInitialized()) return false;

    String filePath = getTagPath(tag.mac);
    bool result = tag.saveToFile(filePath);

    if (result && cacheValid_) {
        // Update cache
        auto it = std::find_if(tagCache_.begin(), tagCache_.end(),
                               [&tag](const TagConfig& t) { return t.mac == tag.mac; });

        if (it != tagCache_.end()) {
            *it = tag;
        } else {
            tagCache_.push_back(tag);
        }
    }

    updateStats(!result);
    return result;
}

bool ConfigManager::loadTag(const String& mac, TagConfig& tag) {
    if (!ensureInitialized()) return false;

    String filePath = getTagPath(mac);
    bool result = tag.loadFromFile(filePath);

    updateStats(!result);
    return result;
}

bool ConfigManager::removeTag(const String& mac) {
    if (!ensureInitialized()) return false;

    String filePath = getTagPath(mac);
    bool result = FileManager::remove(filePath);

    if (result && cacheValid_) {
        // Remove from cache
        tagCache_.erase(
            std::remove_if(tagCache_.begin(), tagCache_.end(),
                           [&mac](const TagConfig& t) { return t.mac == mac; }),
            tagCache_.end());
    }

    updateStats(!result);
    return result;
}

bool ConfigManager::tagExists(const String& mac) {
    if (!ensureInitialized()) return false;

    String filePath = getTagPath(mac);
    return FileManager::exists(filePath);
}

std::vector<TagConfig> ConfigManager::getAllTags() {
    if (!ensureInitialized()) return {};

    if (!cacheValid_) {
        refreshTagCache();
    }

    return tagCache_;
}

std::vector<String> ConfigManager::getTagMacs() {
    auto tags = getAllTags();
    std::vector<String> macs;

    for (const auto& tag : tags) {
        macs.push_back(tag.mac);
    }

    return macs;
}

size_t ConfigManager::getTagCount() {
    return getAllTags().size();
}

bool ConfigManager::clearAllTags() {
    if (!ensureInitialized()) return false;

    auto files = FileManager::listFiles(TAGS_DIR, ".json");
    bool success = true;

    for (const auto& file : files) {
        String filePath = String(TAGS_DIR) + "/" + file;
        if (!FileManager::remove(filePath)) {
            success = false;
        }
    }

    if (success) {
        tagCache_.clear();
        cacheValid_ = true;
    }

    updateStats(!success);
    return success;
}

void ConfigManager::refreshTagCache() {
    tagCache_.clear();

    auto files = FileManager::listFiles(TAGS_DIR, ".json");

    for (const auto& file : files) {
        TagConfig tag;
        String filePath = String(TAGS_DIR) + "/" + file;
        if (tag.loadFromFile(filePath)) {
            tagCache_.push_back(tag);
        }
    }

    cacheValid_ = true;
}

bool ConfigManager::initialize() {
    if (initialized_) return true;

    if (!FileSystemManager::initialize()) {
        return false;
    }

    if (!mutex_) {
        mutex_ = xSemaphoreCreateMutex();
    }

    if (!fsMutex) {
        fsMutex = xSemaphoreCreateMutex();
    }

    // Create directories
    FileManager::createPath("/config");
    FileManager::createPath(TAGS_DIR);

    // Mark as initialized before loading to prevent circular dependency
    initialized_ = true;

    // Load configuration directly without calling ensureInitialized()
    if (mutex_) xSemaphoreTake(mutex_, portMAX_DELAY);
    bool loadResult = config_.loadFromFile(CONFIG_PATH);
    if (mutex_) xSemaphoreGive(mutex_);

    if (!loadResult) {
        config_.setDefaults();
        save();
    }

    return true;
}

bool ConfigManager::isHealthy() const {
    return contentFS != nullptr && initialized_ && FileSystemManager::getActiveFS() != nullptr;
}

uint64_t ConfigManager::getFreeSpace() const {
    return FileSystemManager::getFreeSpace();
}

uint64_t ConfigManager::getTotalSpace() const {
    return FileSystemManager::getTotalSpace();
}

void ConfigManager::cleanup() {
    if (mutex_) {
        vSemaphoreDelete(mutex_);
        mutex_ = nullptr;
    }

    initialized_ = false;
    cacheValid_ = false;
    tagCache_.clear();
    FileSystemManager::cleanup();
}

String ConfigManager::formatMacAddress(const String& mac) {
    String formatted = mac;
    formatted.toUpperCase();
    formatted.replace("-", ":");

    // Ensure proper format XX:XX:XX:XX:XX:XX
    if (formatted.length() == 12) {
        String temp = "";
        for (int i = 0; i < 12; i += 2) {
            if (i > 0) temp += ":";
            temp += formatted.substring(i, i + 2);
        }
        formatted = temp;
    }

    return formatted;
}

bool ConfigManager::isValidMacAddress(const String& mac) {
    if (mac.length() != 17) return false;

    for (int i = 0; i < 17; i++) {
        if (i % 3 == 2) {
            if (mac[i] != ':') return false;
        } else {
            char c = mac[i];
            if (!((c >= '0' && c <= '9') || (c >= 'A' && c <= 'F') || (c >= 'a' && c <= 'f'))) {
                return false;
            }
        }
    }

    return true;
}

bool ConfigManager::isValidIPAddress(const String& ip) {
    int parts = 0;
    String part = "";

    for (int i = 0; i <= ip.length(); i++) {
        if (i == ip.length() || ip[i] == '.') {
            if (part.length() == 0 || part.length() > 3) return false;

            int value = part.toInt();
            if (value < 0 || value > 255) return false;

            parts++;
            part = "";
        } else {
            char c = ip[i];
            if (c < '0' || c > '9') return false;
            part += c;
        }
    }

    return parts == 4;
}

String ConfigManager::sanitizeFilename(const String& filename) {
    String sanitized = filename;
    sanitized.replace("/", "_");
    sanitized.replace("\\", "_");
    sanitized.replace(":", "_");
    sanitized.replace("*", "_");
    sanitized.replace("?", "_");
    sanitized.replace("\"", "_");
    sanitized.replace("<", "_");
    sanitized.replace(">", "_");
    sanitized.replace("|", "_");
    return sanitized;
}

String ConfigManager::getTagPath(const String& mac) const {
    String sanitizedMac = formatMacAddress(mac);
    return String(TAGS_DIR) + "/" + sanitizedMac + ".json";
}

void ConfigManager::updateStats(bool isError) {
    if (isError) {
        stats_.errors++;
    }
    stats_.lastActivity = millis();
}

bool ConfigManager::ensureInitialized() const {
    if (!initialized_) {
        return const_cast<ConfigManager*>(this)->initialize();
    }
    return true;
}

// ============================================================================
// FileSystemManager Implementation - Auto-Detection & Management
// ============================================================================

bool FileSystemManager::initialized_ = false;
bool FileSystemManager::useSDCard_ = false;
fs::FS* FileSystemManager::activeFS_ = nullptr;

bool FileSystemManager::initialize() {
    if (initialized_) return true;

    bool success = false;

#ifndef SD_CARD_ONLY
    if (initLittleFS()) {
        success = true;
        useSDCard_ = false;
    }
#endif

#ifdef HAS_SDCARD
    if (!success && initSDCard()) {
        success = true;
        useSDCard_ = true;
    }
#endif

    if (success) {
        contentFS = activeFS_;
        createBaseDirectories();
        initialized_ = true;
    }

    return success;
}

void FileSystemManager::cleanup() {
    initialized_ = false;
    useSDCard_ = false;
    activeFS_ = nullptr;
    contentFS = nullptr;
}

bool FileSystemManager::switchToSDCard() {
#ifdef HAS_SDCARD
    if (initSDCard()) {
        activeFS_ = &SD;
        contentFS = activeFS_;
        useSDCard_ = true;
        return true;
    }
#endif
    return false;
}

bool FileSystemManager::switchToLittleFS() {
#ifndef SD_CARD_ONLY
    if (initLittleFS()) {
        activeFS_ = &LittleFS;
        contentFS = activeFS_;
        useSDCard_ = false;
        return true;
    }
#endif
    return false;
}

uint64_t FileSystemManager::getFreeSpace() {
    if (!activeFS_) return 0;

#ifdef HAS_SDCARD
    if (useSDCard_) {
        return SD.totalBytes() - SD.usedBytes();
    }
#endif
#ifndef SD_CARD_ONLY
    return LittleFS.totalBytes() - LittleFS.usedBytes();
#endif
    return 0;
}

uint64_t FileSystemManager::getTotalSpace() {
    if (!activeFS_) return 0;

#ifdef HAS_SDCARD
    if (useSDCard_) {
        return SD.totalBytes();
    }
#endif
#ifndef SD_CARD_ONLY
    return LittleFS.totalBytes();
#endif
    return 0;
}

String FileSystemManager::getFileSystemType() {
    if (!activeFS_) return "None";

#ifdef HAS_SDCARD
    if (useSDCard_) return "SD Card";
#endif
#ifndef SD_CARD_ONLY
    if (!useSDCard_) return "LittleFS";
#endif
    return "Unknown";
}

bool FileSystemManager::format() {
    if (!activeFS_) return false;

#ifdef HAS_SDCARD
    if (useSDCard_) {
        // SD cards typically don't need formatting from ESP32
        return false;
    }
#endif
#ifndef SD_CARD_ONLY
    if (!useSDCard_) {
        return LittleFS.format();
    }
#endif
    return false;
}

bool FileSystemManager::initLittleFS() {
#ifndef SD_CARD_ONLY
    if (LittleFS.begin()) {
        activeFS_ = &LittleFS;
        return true;
    }
#endif
    return false;
}

bool FileSystemManager::initSDCard() {
#ifdef HAS_SDCARD
#ifdef SD_CARD_SDMMC
    if (SD_MMC.begin("/sdcard", true, true, BOARD_MAX_SDMMC_FREQ, 5)) {
        activeFS_ = &SD_MMC;
        return true;
    }
#else
    if (SD.begin(SD_CARD_SS)) {
        activeFS_ = &SD;
        return true;
    }
#endif
#endif
    return false;
}

bool FileSystemManager::createBaseDirectories() {
    if (!activeFS_) return false;

    activeFS_->mkdir("/current");
    activeFS_->mkdir("/temp");
    activeFS_->mkdir("/config");
    activeFS_->mkdir("/config/tags");
    activeFS_->mkdir("/backups");

    return true;
}

// ============================================================================
// Local utility functions (not in ValidationUtils namespace to avoid conflicts)
// ============================================================================

bool isValidPassword(const String& password, uint8_t minLength) {
    return password.length() >= minLength && password.length() <= 63;
}

String formatMacAddress(const String& mac) {
    return ConfigManager::formatMacAddress(mac);
}

String sanitizeString(const String& input, uint16_t maxLength) {
    String sanitized = input;

    // Remove control characters
    sanitized.replace("\r", "");
    sanitized.replace("\n", "");
    sanitized.replace("\t", " ");

    // Limit length
    if (sanitized.length() > maxLength) {
        sanitized = sanitized.substring(0, maxLength);
    }

    return sanitized;
}
