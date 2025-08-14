/**
 * @file wifi_advanced.cpp
 * @brief Advanced WiFi Management Implementation
 */

#include "wifi_advanced.h"

#include <LittleFS.h>
#include <esp_event.h>
#include <esp_wifi.h>

#include "core_utilities.h"
#include "json_config.h"

// ============================================================================
// WiFiAdvanced Implementation
// ============================================================================

WiFiAdvanced* WiFiAdvanced::instance = nullptr;
WiFiAdvanced& wifiAdvanced = WiFiAdvanced::getInstance();

WiFiAdvanced::WiFiAdvanced() {
    // Initialize diagnostics
    diagnostics = {};

    // Set up event handlers
    WiFi.onEvent([this](WiFiEvent_t event, WiFiEventInfo_t info) {
        this->handleConnectionEvent(event);
    });
}

WiFiAdvanced& WiFiAdvanced::getInstance() {
    if (!instance) {
        instance = new WiFiAdvanced();
    }
    return *instance;
}

// ============================================================================
// Profile Management
// ============================================================================

bool WiFiAdvanced::addNetworkProfile(const WiFiNetworkProfile& profile) {
    // Check if profile already exists
    for (auto& existing : networkProfiles) {
        if (existing.ssid == profile.ssid) {
            existing = profile;  // Update existing
            return saveProfilesToFile();
        }
    }

    networkProfiles.push_back(profile);
    sortProfilesByPriority();
    return saveProfilesToFile();
}

bool WiFiAdvanced::removeNetworkProfile(const String& ssid) {
    auto it = std::remove_if(networkProfiles.begin(), networkProfiles.end(),
                             [&ssid](const WiFiNetworkProfile& profile) {
                                 return profile.ssid == ssid;
                             });

    if (it != networkProfiles.end()) {
        networkProfiles.erase(it, networkProfiles.end());
        return saveProfilesToFile();
    }
    return false;
}

WiFiNetworkProfile* WiFiAdvanced::getNetworkProfile(const String& ssid) {
    for (auto& profile : networkProfiles) {
        if (profile.ssid == ssid) {
            return &profile;
        }
    }
    return nullptr;
}

void WiFiAdvanced::sortProfilesByPriority() {
    std::sort(networkProfiles.begin(), networkProfiles.end(),
              [](const WiFiNetworkProfile& a, const WiFiNetworkProfile& b) {
                  return a.priority > b.priority;
              });
}

// ============================================================================
// Connection Management
// ============================================================================

bool WiFiAdvanced::connectToBestNetwork() {
    if (networkProfiles.empty()) {
        return false;
    }

    // Perform network scan
    WiFi.scanNetworks(false, false, false, 300);

    // Find best available network
    for (const auto& profile : networkProfiles) {
        if (!profile.autoConnect) continue;

        int networkIndex = WiFi.scanComplete();
        for (int i = 0; i < networkIndex; i++) {
            if (WiFi.SSID(i) == profile.ssid) {
                int32_t rssi = WiFi.RSSI(i);
                if (rssi >= profile.minRSSI) {
                    return connectToNetwork(profile.ssid, true);
                }
            }
        }
    }

    return false;
}

bool WiFiAdvanced::connectToNetwork(const String& ssid, bool updateStats) {
    WiFiNetworkProfile* profile = getNetworkProfile(ssid);
    if (!profile) {
        return false;
    }

    connectionInProgress = true;
    connectionStartTime = millis();
    currentSSID = ssid;

    if (updateStats) {
        profile->failedConnections++;  // Will be decremented on success
        diagnostics.connectAttempts++;
    }

    WiFi.begin(profile->ssid.c_str(), profile->password.c_str());
    return true;
}

void WiFiAdvanced::handleConnectionEvent(WiFiEvent_t event) {
    uint32_t now = millis();

    switch (event) {
        case ARDUINO_EVENT_WIFI_STA_CONNECTED:
            if (connectionInProgress) {
                uint32_t connectTime = now - connectionStartTime;
                updateConnectionStats(true, connectTime);
                connectionInProgress = false;

                WiFiNetworkProfile* profile = getNetworkProfile(currentSSID);
                if (profile) {
                    profile->successfulConnections++;
                    profile->failedConnections--;  // Undo the increment from connectToNetwork
                    profile->lastUsed = now;
                    profile->totalConnectTime += connectTime;
                }
            }
            diagnostics.lastConnectTime = now;
            break;

        case ARDUINO_EVENT_WIFI_STA_DISCONNECTED:
            if (connectionInProgress) {
                updateConnectionStats(false);
                connectionInProgress = false;
            }
            diagnostics.disconnectionCount++;
            diagnostics.lastDisconnectTime = now;
            break;

        case ARDUINO_EVENT_WIFI_STA_AUTHMODE_CHANGE:
            diagnostics.authFailures++;
            break;

        default:
            break;
    }
}

// ============================================================================
// Diagnostics and Monitoring
// ============================================================================

void WiFiAdvanced::updateDiagnostics() {
    if (!monitoringEnabled) return;

    uint32_t now = millis();
    if (now - lastDiagnosticsUpdate < diagnosticsInterval) return;

    lastDiagnosticsUpdate = now;

    if (WiFi.isConnected()) {
        updateSignalMetrics();
        calculateNetworkQuality();

        if (autoOptimizeEnabled) {
            optimizeConnection();
        }
    }

    // Update uptime
    if (WiFi.isConnected() && diagnostics.lastConnectTime > 0) {
        diagnostics.totalUptime = (now - diagnostics.lastConnectTime) / 1000;
    }

    cleanupOldData();
}

void WiFiAdvanced::updateSignalMetrics() {
    diagnostics.rssi = WiFi.RSSI();
    diagnostics.signalQuality = calculateSignalQuality(diagnostics.rssi);

    // Update current network profile statistics
    WiFiNetworkProfile* profile = getNetworkProfile(WiFi.SSID());
    if (profile) {
        // Update running average RSSI
        if (profile->avgRSSI == 0) {
            profile->avgRSSI = diagnostics.rssi;
        } else {
            profile->avgRSSI = (profile->avgRSSI * 3 + diagnostics.rssi) / 4;  // Weighted average
        }
        profile->avgQuality = calculateSignalQuality(profile->avgRSSI);
    }
}

void WiFiAdvanced::updateConnectionStats(bool success, uint32_t connectTime) {
    if (success) {
        diagnostics.successfulConnects++;

        if (connectTime > 0) {
            diagnostics.maxConnectTime = max(diagnostics.maxConnectTime, connectTime);
            diagnostics.minConnectTime = min(diagnostics.minConnectTime, connectTime);

            // Update running average
            if (diagnostics.avgConnectTime == 0) {
                diagnostics.avgConnectTime = connectTime;
            } else {
                diagnostics.avgConnectTime = (diagnostics.avgConnectTime * 3 + connectTime) / 4;
            }
        }
    } else {
        diagnostics.timeoutFailures++;
    }
}

String WiFiAdvanced::getDiagnosticsJson() {
    JsonDocument doc;

    doc["rssi"] = diagnostics.rssi;
    doc["signalQuality"] = diagnostics.signalQuality;
    doc["connectAttempts"] = diagnostics.connectAttempts;
    doc["successfulConnects"] = diagnostics.successfulConnects;
    doc["disconnectionCount"] = diagnostics.disconnectionCount;
    doc["authFailures"] = diagnostics.authFailures;
    doc["timeoutFailures"] = diagnostics.timeoutFailures;
    doc["avgConnectTime"] = diagnostics.avgConnectTime;
    doc["maxConnectTime"] = diagnostics.maxConnectTime;
    doc["minConnectTime"] = diagnostics.minConnectTime;
    doc["totalUptime"] = diagnostics.totalUptime;
    doc["channelUtilization"] = diagnostics.channelUtilization;
    doc["interferenceLevel"] = diagnostics.interferenceLevel;

    if (!diagnostics.lastError.isEmpty()) {
        doc["lastError"] = diagnostics.lastError;
        doc["errorTimestamp"] = diagnostics.errorTimestamp;
    }

    String result;
    serializeJson(doc, result);
    return result;
}

// ============================================================================
// Channel Analysis
// ============================================================================

void WiFiAdvanced::performChannelScan() {
    uint32_t now = millis();
    if (now - lastChannelScan < channelScanInterval) return;

    lastChannelScan = now;
    channelAnalysis.clear();

    // Initialize channel info for 2.4GHz channels (1-13)
    for (uint8_t ch = 1; ch <= 13; ch++) {
        WiFiChannelInfo info;
        info.channel = ch;
        channelAnalysis.push_back(info);
    }

    // Scan networks and analyze channels
    int networkCount = WiFi.scanNetworks(false, false, false, 300);

    for (int i = 0; i < networkCount; i++) {
        uint8_t channel = WiFi.channel(i);
        int32_t rssi = WiFi.RSSI(i);
        String ssid = WiFi.SSID(i);

        // Find channel info
        for (auto& chInfo : channelAnalysis) {
            if (chInfo.channel == channel) {
                chInfo.networkCount++;
                chInfo.maxRSSI = max(chInfo.maxRSSI, rssi);
                chInfo.networks.push_back(ssid);

                // Calculate utilization based on signal strength and network count
                chInfo.utilization = min(100u, chInfo.networkCount * 10 + max(0, (rssi + 50) / 2));
                break;
            }
        }
    }

    // Mark recommended channels (least crowded)
    uint32_t minUtilization = 100;
    for (const auto& chInfo : channelAnalysis) {
        minUtilization = min(minUtilization, chInfo.utilization);
    }

    for (auto& chInfo : channelAnalysis) {
        chInfo.recommended = (chInfo.utilization <= minUtilization + 10);
    }
}

uint8_t WiFiAdvanced::recommendBestChannel() {
    if (channelAnalysis.empty()) {
        performChannelScan();
    }

    uint8_t bestChannel = 1;
    uint32_t lowestUtilization = 100;

    for (const auto& chInfo : channelAnalysis) {
        if (chInfo.utilization < lowestUtilization) {
            lowestUtilization = chInfo.utilization;
            bestChannel = chInfo.channel;
        }
    }

    return bestChannel;
}

String WiFiAdvanced::getChannelAnalysisJson() {
    JsonDocument doc;
    JsonArray channels = doc["channels"].to<JsonArray>();

    for (const auto& chInfo : channelAnalysis) {
        JsonObject ch = channels.add<JsonObject>();
        ch["channel"] = chInfo.channel;
        ch["networkCount"] = chInfo.networkCount;
        ch["maxRSSI"] = chInfo.maxRSSI;
        ch["utilization"] = chInfo.utilization;
        ch["recommended"] = chInfo.recommended;

        JsonArray networks = ch["networks"].to<JsonArray>();
        for (const auto& network : chInfo.networks) {
            networks.add(network);
        }
    }

    doc["recommendedChannel"] = recommendBestChannel();
    doc["lastScan"] = lastChannelScan;

    String result;
    serializeJson(doc, result);
    return result;
}

// ============================================================================
// Network Quality Assessment
// ============================================================================

uint8_t WiFiAdvanced::assessNetworkQuality(const String& ssid) {
    String targetSSID = ssid.isEmpty() ? WiFi.SSID() : ssid;
    WiFiNetworkProfile* profile = getNetworkProfile(targetSSID);

    if (!profile) return 0;

    uint8_t quality = 100;

    // Signal quality (40% weight)
    quality = (quality * 60 + profile->avgQuality * 40) / 100;

    // Connection stability (30% weight)
    if (profile->successfulConnections > 0) {
        uint8_t successRate = (profile->successfulConnections * 100) /
                              (profile->successfulConnections + profile->failedConnections);
        quality = (quality * 70 + successRate * 30) / 100;
    }

    // Stability score (30% weight)
    quality = (quality * 70 + profile->stabilityScore * 30) / 100;

    return quality;
}

bool WiFiAdvanced::isNetworkStable(const String& ssid) {
    String targetSSID = ssid.isEmpty() ? WiFi.SSID() : ssid;
    WiFiNetworkProfile* profile = getNetworkProfile(targetSSID);

    if (!profile) return false;

    // Consider stable if:
    // - Success rate > 80%
    // - Stability score > 70
    // - Average signal quality > 50%

    uint8_t successRate = 100;
    if (profile->successfulConnections + profile->failedConnections > 0) {
        successRate = (profile->successfulConnections * 100) /
                      (profile->successfulConnections + profile->failedConnections);
    }

    return successRate > 80 && profile->stabilityScore > 70 && profile->avgQuality > 50;
}

// ============================================================================
// Persistence
// ============================================================================

bool WiFiAdvanced::saveProfilesToFile(const String& filename) {
    JsonDocument doc;
    JsonArray profiles = doc["profiles"].to<JsonArray>();

    for (const auto& profile : networkProfiles) {
        JsonObject p = profiles.add<JsonObject>();
        p["ssid"] = profile.ssid;
        p["password"] = profile.password;
        p["priority"] = profile.priority;
        p["autoConnect"] = profile.autoConnect;
        p["preferredChannel"] = profile.preferredChannel;
        p["minRSSI"] = profile.minRSSI;
        p["use5GHz"] = profile.use5GHz;
        p["successfulConnections"] = profile.successfulConnections;
        p["failedConnections"] = profile.failedConnections;
        p["avgRSSI"] = profile.avgRSSI;
        p["avgQuality"] = profile.avgQuality;
        p["stabilityScore"] = profile.stabilityScore;
    }

    File file = LittleFS.open(filename, "w");
    if (!file) return false;

    size_t bytesWritten = serializeJson(doc, file);
    file.close();

    return bytesWritten > 0;
}

bool WiFiAdvanced::loadProfilesFromFile(const String& filename) {
    if (!LittleFS.exists(filename)) return false;

    File file = LittleFS.open(filename, "r");
    if (!file) return false;

    JsonDocument doc;
    DeserializationError error = deserializeJson(doc, file);
    file.close();

    if (error) return false;

    networkProfiles.clear();
    JsonArray profiles = doc["profiles"];

    for (JsonObject p : profiles) {
        WiFiNetworkProfile profile;
        profile.ssid = p["ssid"].as<String>();
        profile.password = p["password"].as<String>();
        profile.priority = p["priority"] | 5;
        profile.autoConnect = p["autoConnect"] | true;
        profile.preferredChannel = p["preferredChannel"] | 0;
        profile.minRSSI = p["minRSSI"] | -80;
        profile.use5GHz = p["use5GHz"] | false;
        profile.successfulConnections = p["successfulConnections"] | 0;
        profile.failedConnections = p["failedConnections"] | 0;
        profile.avgRSSI = p["avgRSSI"] | 0;
        profile.avgQuality = p["avgQuality"] | 0;
        profile.stabilityScore = p["stabilityScore"] | 100;

        networkProfiles.push_back(profile);
    }

    sortProfilesByPriority();
    return true;
}

// ============================================================================
// Utility Functions
// ============================================================================

uint8_t WiFiAdvanced::calculateSignalQuality(int32_t rssi) {
    if (rssi <= -100) return 0;
    if (rssi >= -50) return 100;
    return 2 * (rssi + 100);
}

String WiFiAdvanced::authModeToString(wifi_auth_mode_t authMode) {
    switch (authMode) {
        case WIFI_AUTH_OPEN:
            return "Open";
        case WIFI_AUTH_WEP:
            return "WEP";
        case WIFI_AUTH_WPA_PSK:
            return "WPA";
        case WIFI_AUTH_WPA2_PSK:
            return "WPA2";
        case WIFI_AUTH_WPA_WPA2_PSK:
            return "WPA/WPA2";
        case WIFI_AUTH_WPA2_ENTERPRISE:
            return "WPA2-Enterprise";
        case WIFI_AUTH_WPA3_PSK:
            return "WPA3";
        case WIFI_AUTH_WPA2_WPA3_PSK:
            return "WPA2/WPA3";
        default:
            return "Unknown";
    }
}

void WiFiAdvanced::poll() {
    updateDiagnostics();

    // Periodic channel analysis
    if (millis() - lastChannelScan > channelScanInterval) {
        performChannelScan();
    }
}

void WiFiAdvanced::cleanup() {
    saveProfilesToFile();
}

// ============================================================================
// FileManager Implementation
// ============================================================================

FileManager* FileManager::instance = nullptr;
FileManager& fileManager = FileManager::getInstance();

FileManager::FileManager() {
    updateStorageInfo();
}

FileManager& FileManager::getInstance() {
    if (!instance) {
        instance = new FileManager();
    }
    return *instance;
}

// ============================================================================
// File Operations
// ============================================================================

bool FileManager::fileExists(const String& path) {
    return LittleFS.exists(path);
}

FileInfo FileManager::getFileInfo(const String& path) {
    FileInfo info;
    info.path = path;
    info.name = path.substring(path.lastIndexOf('/') + 1);

    if (!LittleFS.exists(path)) {
        return info;
    }

    File file = LittleFS.open(path, "r");
    if (file) {
        info.size = file.size();
        info.isDirectory = file.isDirectory();
        info.lastModified = file.getLastWrite();
        info.mimeType = detectMimeType(info.name);
        info.type = getFileExtension(info.name);
        file.close();

        if (enableChecksums && !info.isDirectory) {
            info.checksum = calculateMD5(path);
        }
    }

    return info;
}

std::vector<FileInfo> FileManager::listDirectory(const String& path, bool recursive) {
    std::vector<FileInfo> files;

    File root = LittleFS.open(path, "r");
    if (!root || !root.isDirectory()) {
        return files;
    }

    File file = root.openNextFile();
    while (file) {
        FileInfo info = getFileInfo(file.path());
        files.push_back(info);

        if (recursive && info.isDirectory) {
            auto subFiles = listDirectory(file.path(), true);
            files.insert(files.end(), subFiles.begin(), subFiles.end());
        }

        file = root.openNextFile();
    }

    return files;
}

bool FileManager::createDirectory(const String& path) {
    return LittleFS.mkdir(path);
}

bool FileManager::deleteFile(const String& path) {
    storageInfo.deleteOperations++;
    return LittleFS.remove(path);
}

String FileManager::readFile(const String& path) {
    File file = LittleFS.open(path, "r");
    if (!file) return "";

    uint32_t startTime = micros();
    String content = file.readString();
    uint32_t readTime = micros() - startTime;

    file.close();

    // Update statistics
    storageInfo.readOperations++;
    if (storageInfo.avgReadTime == 0) {
        storageInfo.avgReadTime = readTime;
    } else {
        storageInfo.avgReadTime = (storageInfo.avgReadTime * 3 + readTime) / 4;
    }

    return content;
}

bool FileManager::writeFile(const String& path, const String& content) {
    File file = LittleFS.open(path, "w");
    if (!file) return false;

    uint32_t startTime = micros();
    size_t bytesWritten = file.print(content);
    uint32_t writeTime = micros() - startTime;

    file.close();

    // Update statistics
    storageInfo.writeOperations++;
    if (storageInfo.avgWriteTime == 0) {
        storageInfo.avgWriteTime = writeTime;
    } else {
        storageInfo.avgWriteTime = (storageInfo.avgWriteTime * 3 + writeTime) / 4;
    }

    updateStorageInfo();
    return bytesWritten > 0;
}

// ============================================================================
// Storage Management
// ============================================================================

void FileManager::updateStorageInfo() {
    storageInfo.totalBytes = LittleFS.totalBytes();
    storageInfo.usedBytes = LittleFS.usedBytes();
    storageInfo.freeBytes = storageInfo.totalBytes - storageInfo.usedBytes;

    // Count files and directories
    auto files = listDirectory("/", true);
    storageInfo.totalFiles = 0;
    storageInfo.totalDirectories = 0;

    for (const auto& file : files) {
        if (file.isDirectory) {
            storageInfo.totalDirectories++;
        } else {
            storageInfo.totalFiles++;
        }
    }

    // Calculate fragmentation level (simplified)
    storageInfo.fragmentationLevel = (float)storageInfo.usedBytes / storageInfo.totalBytes * 100;
    storageInfo.healthy = storageInfo.fragmentationLevel < 90.0;
}

StorageInfo FileManager::getStorageInfo() {
    updateStorageInfo();
    return storageInfo;
}

String FileManager::getStorageInfoJson() {
    updateStorageInfo();

    JsonDocument doc;
    doc["totalBytes"] = storageInfo.totalBytes;
    doc["usedBytes"] = storageInfo.usedBytes;
    doc["freeBytes"] = storageInfo.freeBytes;
    doc["totalFiles"] = storageInfo.totalFiles;
    doc["totalDirectories"] = storageInfo.totalDirectories;
    doc["fragmentationLevel"] = storageInfo.fragmentationLevel;
    doc["healthy"] = storageInfo.healthy;
    doc["readOperations"] = storageInfo.readOperations;
    doc["writeOperations"] = storageInfo.writeOperations;
    doc["deleteOperations"] = storageInfo.deleteOperations;
    doc["avgReadTime"] = storageInfo.avgReadTime;
    doc["avgWriteTime"] = storageInfo.avgWriteTime;

    String result;
    serializeJson(doc, result);
    return result;
}

// ============================================================================
// Utility Functions
// ============================================================================

String FileManager::calculateMD5(const String& filePath) {
    // Simplified MD5 calculation - would need proper implementation
    return String(filePath.length() * 31, HEX);  // Placeholder
}

String FileManager::detectMimeType(const String& filename) {
    String ext = getFileExtension(filename).toLowerCase();

    if (ext == ".html" || ext == ".htm") return "text/html";
    if (ext == ".css") return "text/css";
    if (ext == ".js") return "application/javascript";
    if (ext == ".json") return "application/json";
    if (ext == ".jpg" || ext == ".jpeg") return "image/jpeg";
    if (ext == ".png") return "image/png";
    if (ext == ".gif") return "image/gif";
    if (ext == ".txt") return "text/plain";
    if (ext == ".bin") return "application/octet-stream";

    return "application/octet-stream";
}

String FileManager::getFileExtension(const String& filename) {
    int dotIndex = filename.lastIndexOf('.');
    if (dotIndex == -1) return "";
    return filename.substring(dotIndex);
}

String FileManager::formatBytes(size_t bytes) {
    if (bytes < 1024) return String(bytes) + " B";
    if (bytes < 1024 * 1024) return String(bytes / 1024.0, 1) + " KB";
    if (bytes < 1024 * 1024 * 1024) return String(bytes / (1024.0 * 1024), 1) + " MB";
    return String(bytes / (1024.0 * 1024 * 1024), 1) + " GB";
}

bool FileManager::isFileAllowed(const String& filename) {
    String ext = getFileExtension(filename).toLowerCase();

    // Check blocked extensions first
    for (const auto& blocked : blockedExtensions) {
        if (ext == blocked) return false;
    }

    // Check allowed extensions
    for (const auto& allowed : allowedExtensions) {
        if (ext == allowed) return true;
    }

    return false;  // Default deny
}

void FileManager::performMaintenance() {
    updateStorageInfo();
    cleanupOldUploads();

    // Defragment if needed
    if (storageInfo.fragmentationLevel > 85.0) {
        defragmentStorage();
    }
}

bool FileManager::defragmentStorage() {
    // Placeholder for defragmentation logic
    return true;
}

void FileManager::cleanupOldUploads() {
    uint32_t now = millis();

    auto it = std::remove_if(activeUploads.begin(), activeUploads.end(),
                             [now](const UploadProgress& upload) {
                                 return (now - upload.startTime) > 600000;  // 10 minutes timeout
                             });

    activeUploads.erase(it, activeUploads.end());
}
