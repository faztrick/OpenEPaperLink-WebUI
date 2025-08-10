/**
 * @file storage_utils.cpp
 * @brief Implementation of StorageUtils for ESP32 NVS Management
 */

#include "storage_utils.h"

#include <Arduino.h>

// ============================================================================
// StorageUtils Implementation
// ============================================================================

StorageUtils& StorageUtils::getInstance() {
    static StorageUtils instance;
    return instance;
}

bool StorageUtils::openNamespace(Preferences& prefs, const String& nameSpace, bool readOnly) {
    return prefs.begin(nameSpace.c_str(), readOnly);
}

void StorageUtils::updateStats(bool success, bool isWrite) {
    if (isWrite) {
        stats.totalWrites++;
        if (!success) stats.failedWrites++;
    } else {
        stats.totalReads++;
        if (!success) stats.failedReads++;
    }
    stats.lastOperationTime = millis();
    stats.isHealthy = (stats.failedReads + stats.failedWrites) < 10;  // Simple health check
}

void StorageUtils::logOperation(const String& operation, const String& nameSpace, const String& key, bool success) {
    if (debugLogging) {
        Serial.printf("[StorageUtils] %s %s:%s = %s\n",
                      operation.c_str(), nameSpace.c_str(), key.c_str(),
                      success ? "OK" : "FAILED");
    }
}

StorageUtils::Result StorageUtils::validateInput(const String& nameSpace, const String& key) {
    if (!isValidNamespace(nameSpace)) return Result::NAMESPACE_ERROR;
    if (!isValidKey(key)) return Result::VALIDATION_ERROR;
    return Result::SUCCESS;
}

bool StorageUtils::isValidKey(const String& key) {
    return !key.isEmpty() && key.length() <= MAX_KEY_LENGTH;
}

bool StorageUtils::isValidNamespace(const String& nameSpace) {
    return !nameSpace.isEmpty() && nameSpace.length() <= MAX_NAMESPACE_LENGTH;
}

String StorageUtils::sanitizeKey(const String& key) {
    String sanitized = key;
    if (sanitized.length() > MAX_KEY_LENGTH) {
        sanitized = sanitized.substring(0, MAX_KEY_LENGTH);
    }
    return sanitized;
}

String StorageUtils::sanitizeNamespace(const String& nameSpace) {
    String sanitized = nameSpace;
    if (sanitized.length() > MAX_NAMESPACE_LENGTH) {
        sanitized = sanitized.substring(0, MAX_NAMESPACE_LENGTH);
    }
    return sanitized;
}

// String Operations
StorageUtils::Result StorageUtils::setString(const String& nameSpace, const String& key, const String& value) {
    Result validationResult = validateInput(nameSpace, key);
    if (validationResult != Result::SUCCESS) return validationResult;

    Preferences prefs;
    if (!openNamespace(prefs, nameSpace, false)) {
        updateStats(false, true);
        stats.lastError = "Failed to open namespace: " + nameSpace;
        return Result::NAMESPACE_ERROR;
    }

    size_t bytesWritten = prefs.putString(key.c_str(), value);
    prefs.end();

    bool success = (bytesWritten > 0);
    updateStats(success, true);
    logOperation("SET_STRING", nameSpace, key, success);

    if (!success) {
        stats.lastError = "Failed to write string: " + key;
        return Result::WRITE_ERROR;
    }

    return Result::SUCCESS;
}

String StorageUtils::getString(const String& nameSpace, const String& key, const String& defaultValue) {
    if (validateInput(nameSpace, key) != Result::SUCCESS) {
        updateStats(false, false);
        return defaultValue;
    }

    Preferences prefs;
    if (!openNamespace(prefs, nameSpace, true)) {
        updateStats(false, false);
        stats.lastError = "Failed to open namespace: " + nameSpace;
        return defaultValue;
    }

    String value = prefs.getString(key.c_str(), defaultValue);
    prefs.end();

    updateStats(true, false);
    logOperation("GET_STRING", nameSpace, key, true);

    return value;
}

// Integer Operations
StorageUtils::Result StorageUtils::setInt(const String& nameSpace, const String& key, int32_t value) {
    Result validationResult = validateInput(nameSpace, key);
    if (validationResult != Result::SUCCESS) return validationResult;

    Preferences prefs;
    if (!openNamespace(prefs, nameSpace, false)) {
        updateStats(false, true);
        stats.lastError = "Failed to open namespace: " + nameSpace;
        return Result::NAMESPACE_ERROR;
    }

    size_t bytesWritten = prefs.putInt(key.c_str(), value);
    prefs.end();

    bool success = (bytesWritten > 0);
    updateStats(success, true);
    logOperation("SET_INT", nameSpace, key, success);

    if (!success) {
        stats.lastError = "Failed to write int: " + key;
        return Result::WRITE_ERROR;
    }

    return Result::SUCCESS;
}

int32_t StorageUtils::getInt(const String& nameSpace, const String& key, int32_t defaultValue) {
    if (validateInput(nameSpace, key) != Result::SUCCESS) {
        updateStats(false, false);
        return defaultValue;
    }

    Preferences prefs;
    if (!openNamespace(prefs, nameSpace, true)) {
        updateStats(false, false);
        stats.lastError = "Failed to open namespace: " + nameSpace;
        return defaultValue;
    }

    int32_t value = prefs.getInt(key.c_str(), defaultValue);
    prefs.end();

    updateStats(true, false);
    logOperation("GET_INT", nameSpace, key, true);

    return value;
}

// Boolean Operations
StorageUtils::Result StorageUtils::setBool(const String& nameSpace, const String& key, bool value) {
    Result validationResult = validateInput(nameSpace, key);
    if (validationResult != Result::SUCCESS) return validationResult;

    Preferences prefs;
    if (!openNamespace(prefs, nameSpace, false)) {
        updateStats(false, true);
        stats.lastError = "Failed to open namespace: " + nameSpace;
        return Result::NAMESPACE_ERROR;
    }

    size_t bytesWritten = prefs.putBool(key.c_str(), value);
    prefs.end();

    bool success = (bytesWritten > 0);
    updateStats(success, true);
    logOperation("SET_BOOL", nameSpace, key, success);

    if (!success) {
        stats.lastError = "Failed to write bool: " + key;
        return Result::WRITE_ERROR;
    }

    return Result::SUCCESS;
}

bool StorageUtils::getBool(const String& nameSpace, const String& key, bool defaultValue) {
    if (validateInput(nameSpace, key) != Result::SUCCESS) {
        updateStats(false, false);
        return defaultValue;
    }

    Preferences prefs;
    if (!openNamespace(prefs, nameSpace, true)) {
        updateStats(false, false);
        stats.lastError = "Failed to open namespace: " + nameSpace;
        return defaultValue;
    }

    bool value = prefs.getBool(key.c_str(), defaultValue);
    prefs.end();

    updateStats(true, false);
    logOperation("GET_BOOL", nameSpace, key, true);

    return value;
}

// Utility Functions
String StorageUtils::resultToString(Result result) {
    switch (result) {
        case Result::SUCCESS:
            return "SUCCESS";
        case Result::NAMESPACE_ERROR:
            return "NAMESPACE_ERROR";
        case Result::WRITE_ERROR:
            return "WRITE_ERROR";
        case Result::READ_ERROR:
            return "READ_ERROR";
        case Result::VALIDATION_ERROR:
            return "VALIDATION_ERROR";
        case Result::MEMORY_ERROR:
            return "MEMORY_ERROR";
        case Result::KEY_NOT_FOUND:
            return "KEY_NOT_FOUND";
        case Result::NAMESPACE_NOT_FOUND:
            return "NAMESPACE_NOT_FOUND";
        default:
            return "UNKNOWN_ERROR";
    }
}

void StorageUtils::printStorageInfo() {
    Serial.println("=== Storage Utils Statistics ===");
    Serial.printf("Total Reads: %u\n", stats.totalReads);
    Serial.printf("Total Writes: %u\n", stats.totalWrites);
    Serial.printf("Failed Reads: %u\n", stats.failedReads);
    Serial.printf("Failed Writes: %u\n", stats.failedWrites);
    Serial.printf("Health Status: %s\n", stats.isHealthy ? "HEALTHY" : "UNHEALTHY");
    if (!stats.lastError.isEmpty()) {
        Serial.printf("Last Error: %s\n", stats.lastError.c_str());
    }
    Serial.println("================================");
}

void StorageUtils::resetStats() {
    stats = StorageStats();
}

// ============================================================================
// WiFiStorageManager Implementation (Basic)
// ============================================================================

WiFiStorageManager& WiFiStorageManager::getInstance() {
    static WiFiStorageManager instance;
    return instance;
}

DynamicJsonDocument WiFiStorageManager::toJson() const {
    DynamicJsonDocument doc(1024);

    StorageUtils& storage = StorageUtils::getInstance();

    doc["ssid"] = storage.getString(NAMESPACE, "ssid", "");
    doc["password"] = storage.getString(NAMESPACE, "password", "");
    doc["hostname"] = storage.getString(NAMESPACE, "hostname", "esp32-ap-flasher");
    doc["ip"] = storage.getString(NAMESPACE, "ip", "");
    doc["mask"] = storage.getString(NAMESPACE, "mask", "");
    doc["gateway"] = storage.getString(NAMESPACE, "gateway", "");
    doc["dns"] = storage.getString(NAMESPACE, "dns", "");
    doc["autoReconnect"] = storage.getBool(NAMESPACE, "autoReconnect", true);
    doc["powerSave"] = storage.getBool(NAMESPACE, "powerSave", false);
    doc["channel"] = storage.getInt(NAMESPACE, "channel", 0);

    return doc;
}

// ============================================================================
// SystemStorageManager Implementation (Basic)
// ============================================================================

SystemStorageManager& SystemStorageManager::getInstance() {
    static SystemStorageManager instance;
    return instance;
}
