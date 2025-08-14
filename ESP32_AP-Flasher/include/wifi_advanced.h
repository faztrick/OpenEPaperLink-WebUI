/**
 * @file wifi_advanced.h
 * @brief Advanced WiFi Management and Diagnostics
 *
 * Enhanced WiFi functionality with:
 * - Real-time network monitoring and diagnostics
 * - Advanced connection management with retry logic
 * - Network quality assessment and optimization
 * - WiFi channel analysis and interference detection
 * - Power management and performance tuning
 * - Multi-network management and prioritization
 */

#pragma once

#include <Arduino.h>
#include <ArduinoJson.h>
#include <WiFi.h>
#include <esp_wifi.h>

#include <memory>
#include <vector>

// ============================================================================
// Advanced WiFi Configuration and Diagnostics
// ============================================================================

struct WiFiDiagnostics {
    // Signal Quality Metrics
    int32_t rssi = 0;
    uint8_t signalQuality = 0;  // 0-100%
    int32_t snr = 0;            // Signal-to-noise ratio
    uint32_t linkQuality = 0;   // Link quality metric

    // Connection Statistics
    uint32_t connectAttempts = 0;
    uint32_t successfulConnects = 0;
    uint32_t disconnectionCount = 0;
    uint32_t authFailures = 0;
    uint32_t timeoutFailures = 0;

    // Performance Metrics
    uint32_t avgConnectTime = 0;       // ms
    uint32_t maxConnectTime = 0;       // ms
    uint32_t minConnectTime = 999999;  // ms
    uint32_t totalUptime = 0;          // seconds
    uint32_t lastConnectTime = 0;      // timestamp
    uint32_t lastDisconnectTime = 0;   // timestamp

    // Network Analysis
    uint8_t channelUtilization = 0;  // 0-100%
    uint8_t interferenceLevel = 0;   // 0-100%
    std::vector<uint8_t> nearbyChannels;
    uint32_t beaconInterval = 0;
    uint32_t dtimPeriod = 0;

    // Error Tracking
    String lastError;
    uint32_t errorTimestamp = 0;
    std::vector<String> recentErrors;
};

struct WiFiNetworkProfile {
    String ssid;
    String password;
    uint8_t priority = 5;  // 1-10, higher = more preferred
    bool autoConnect = true;
    bool requiresAuth = true;
    wifi_auth_mode_t authMode = WIFI_AUTH_WPA2_PSK;

    // Connection preferences
    uint8_t preferredChannel = 0;  // 0 = auto
    int8_t minRSSI = -80;          // Minimum acceptable signal
    bool use5GHz = false;          // Prefer 5GHz when available

    // Statistics
    uint32_t successfulConnections = 0;
    uint32_t failedConnections = 0;
    uint32_t totalConnectTime = 0;
    uint32_t lastUsed = 0;

    // Quality tracking
    int32_t avgRSSI = 0;
    uint8_t avgQuality = 0;
    uint32_t stabilityScore = 100;  // 0-100, based on disconnect frequency
};

struct WiFiChannelInfo {
    uint8_t channel;
    int32_t maxRSSI = -100;
    uint32_t networkCount = 0;
    uint32_t utilization = 0;  // 0-100%
    bool recommended = false;
    std::vector<String> networks;
};

class WiFiAdvanced {
   private:
    static WiFiAdvanced* instance;

    // Configuration and profiles
    std::vector<WiFiNetworkProfile> networkProfiles;
    WiFiDiagnostics diagnostics;
    std::vector<WiFiChannelInfo> channelAnalysis;

    // State management
    bool monitoringEnabled = true;
    bool autoOptimizeEnabled = true;
    uint32_t lastDiagnosticsUpdate = 0;
    uint32_t lastChannelScan = 0;
    uint32_t diagnosticsInterval = 30000;   // 30 seconds
    uint32_t channelScanInterval = 300000;  // 5 minutes

    // Performance tracking
    uint32_t connectionStartTime = 0;
    bool connectionInProgress = false;
    String currentSSID;

    WiFiAdvanced();

    // Internal methods
    void updateSignalMetrics();
    void updateConnectionStats(bool success, uint32_t connectTime = 0);
    void performChannelAnalysis();
    void calculateNetworkQuality();
    void optimizeConnection();
    void cleanupOldData();

   public:
    static WiFiAdvanced& getInstance();

    // Profile Management
    bool addNetworkProfile(const WiFiNetworkProfile& profile);
    bool removeNetworkProfile(const String& ssid);
    bool updateNetworkProfile(const String& ssid, const WiFiNetworkProfile& profile);
    WiFiNetworkProfile* getNetworkProfile(const String& ssid);
    std::vector<WiFiNetworkProfile> getAllProfiles();
    void sortProfilesByPriority();

    // Connection Management
    bool connectToBestNetwork();
    bool connectToNetwork(const String& ssid, bool updateStats = true);
    void startConnectionMonitoring();
    void stopConnectionMonitoring();
    void handleConnectionEvent(WiFiEvent_t event);

    // Diagnostics and Monitoring
    void updateDiagnostics();
    WiFiDiagnostics getDiagnostics() const { return diagnostics; }
    String getDiagnosticsJson();
    void resetDiagnostics();

    // Channel Analysis
    void performChannelScan();
    std::vector<WiFiChannelInfo> getChannelAnalysis();
    uint8_t recommendBestChannel();
    String getChannelAnalysisJson();

    // Network Quality Assessment
    uint8_t assessNetworkQuality(const String& ssid = "");
    String getQualityReport();
    bool isNetworkStable(const String& ssid = "");

    // Configuration
    void setDiagnosticsInterval(uint32_t intervalMs) { diagnosticsInterval = intervalMs; }
    void setChannelScanInterval(uint32_t intervalMs) { channelScanInterval = intervalMs; }
    void enableAutoOptimization(bool enable) { autoOptimizeEnabled = enable; }
    void enableMonitoring(bool enable) { monitoringEnabled = enable; }

    // Persistence
    bool saveProfilesToFile(const String& filename = "/wifi_profiles.json");
    bool loadProfilesFromFile(const String& filename = "/wifi_profiles.json");
    bool exportDiagnostics(const String& filename = "/wifi_diagnostics.json");

    // Utility Functions
    static String authModeToString(wifi_auth_mode_t authMode);
    static String eventToString(WiFiEvent_t event);
    static uint8_t calculateSignalQuality(int32_t rssi);
    static bool isChannel5GHz(uint8_t channel);

    // Task Management
    void poll();
    void cleanup();
};

// Global instance
extern WiFiAdvanced& wifiAdvanced;

// ============================================================================
// Enhanced File Management System
// ============================================================================

struct FileInfo {
    String name;
    String path;
    size_t size = 0;
    String type;
    String mimeType;
    uint32_t lastModified = 0;
    uint32_t created = 0;
    bool isDirectory = false;
    String checksum;  // MD5 for integrity

    // Extended attributes
    bool isHidden = false;
    bool isSystem = false;
    bool isReadOnly = false;
    uint32_t permissions = 0644;
    String owner = "system";
    String group = "users";
};

struct StorageInfo {
    size_t totalBytes = 0;
    size_t usedBytes = 0;
    size_t freeBytes = 0;
    uint32_t totalFiles = 0;
    uint32_t totalDirectories = 0;
    float fragmentationLevel = 0.0;  // 0-100%
    bool healthy = true;
    String lastError;

    // Performance metrics
    uint32_t readOperations = 0;
    uint32_t writeOperations = 0;
    uint32_t deleteOperations = 0;
    uint32_t avgReadTime = 0;   // microseconds
    uint32_t avgWriteTime = 0;  // microseconds
};

struct UploadProgress {
    String filename;
    size_t totalBytes = 0;
    size_t uploadedBytes = 0;
    uint8_t percentage = 0;
    uint32_t startTime = 0;
    uint32_t estimatedTimeRemaining = 0;
    uint32_t uploadSpeed = 0;  // bytes/second
    bool completed = false;
    bool error = false;
    String errorMessage;
};

class FileManager {
   private:
    static FileManager* instance;

    StorageInfo storageInfo;
    std::vector<UploadProgress> activeUploads;

    // Configuration
    size_t maxFileSize = 16 * 1024 * 1024;  // 16MB default
    std::vector<String> allowedExtensions = {".jpg", ".png", ".gif", ".json", ".txt", ".html", ".css", ".js", ".bin"};
    std::vector<String> blockedExtensions = {".exe", ".bat", ".cmd", ".sh"};
    bool enableChecksums = true;
    bool enableCompression = false;

    FileManager();

    // Internal methods
    void updateStorageInfo();
    String calculateMD5(const String& filePath);
    String detectMimeType(const String& filename);
    bool isValidFilename(const String& filename);
    void cleanupOldUploads();

   public:
    static FileManager& getInstance();

    // File Operations
    bool fileExists(const String& path);
    FileInfo getFileInfo(const String& path);
    std::vector<FileInfo> listDirectory(const String& path = "/", bool recursive = false);
    bool createDirectory(const String& path);
    bool deleteFile(const String& path);
    bool deleteDirectory(const String& path, bool recursive = false);
    bool copyFile(const String& src, const String& dest);
    bool moveFile(const String& src, const String& dest);
    bool renameFile(const String& oldPath, const String& newPath);

    // Content Operations
    String readFile(const String& path);
    bool writeFile(const String& path, const String& content);
    bool appendToFile(const String& path, const String& content);
    size_t getFileSize(const String& path);

    // Upload Management
    String startUpload(const String& filename, size_t totalSize);
    bool updateUpload(const String& uploadId, const uint8_t* data, size_t length);
    bool completeUpload(const String& uploadId);
    bool cancelUpload(const String& uploadId);
    UploadProgress getUploadProgress(const String& uploadId);
    std::vector<UploadProgress> getActiveUploads();

    // Storage Management
    StorageInfo getStorageInfo();
    String getStorageInfoJson();
    bool defragmentStorage();
    bool checkIntegrity();
    bool optimizeStorage();

    // Security and Validation
    bool isFileAllowed(const String& filename);
    bool validateFile(const String& path);
    String getFileChecksum(const String& path);
    bool verifyChecksum(const String& path, const String& expectedChecksum);

    // Configuration
    void setMaxFileSize(size_t maxSize) { maxFileSize = maxSize; }
    void addAllowedExtension(const String& ext) { allowedExtensions.push_back(ext); }
    void removeAllowedExtension(const String& ext);
    void enableFileCompression(bool enable) { enableCompression = enable; }
    void enableChecksumValidation(bool enable) { enableChecksums = enable; }

    // Backup and Restore
    bool createBackup(const String& backupPath);
    bool restoreFromBackup(const String& backupPath);
    String exportFileList(const String& path = "/");

    // Utility Functions
    static String formatBytes(size_t bytes);
    static String getFileExtension(const String& filename);
    static bool isHiddenFile(const String& filename);

    // Maintenance
    void performMaintenance();
    void cleanup();
};

// Global instance
extern FileManager& fileManager;
