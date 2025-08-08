# Unified WiFi Architecture

## Overview

This document describes the unified WiFi management system that merges functionality from three previously separate WiFi implementations:

1. **`wifi_utils.cpp/h`** - Centralized WiFi utilities (singleton pattern)
2. **`wifi_module.cpp/h`** - Module-based WiFi management
3. **`wifimanager.cpp/h`** - Legacy WiFi manager (ESP32-S3 optimized)

## Architecture

### 1. WiFiUtils (Core Utilities Layer)
**File:** `include/wifi_utils.h`, `src/wifi_utils.cpp`

Provides centralized, thread-safe WiFi utilities using singleton pattern:

```cpp
class WiFiUtils {
public:
    static WiFiUtils& getInstance();

    // Thread-safe scanning with rate limiting
    bool performAsyncScan(bool showHidden = true, uint32_t maxWaitMs = 1000);
    WiFiScanResult getScanResults(bool clearAfter = true);
    String buildScanResultsJson(bool clearAfter = true);

    // Connection information
    WiFiConnectionInfo getConnectionInfo();
    String getConnectionInfoJson();

    // Static utility functions
    static String getEncryptionString(wifi_auth_mode_t encryption);
    static int calculateSignalQuality(int rssi);

    // State management
    bool isScanning();
    void cleanup();
};
```

**Key Features:**
- ✅ Thread-safe with semaphore protection
- ✅ Rate limiting (max 1 scan per 25 seconds)
- ✅ Centralized JSON generation
- ✅ Signal quality calculation
- ✅ Encryption type conversion

### 2. WiFiModule (Module System Layer)
**File:** `include/wifi_module.h`, `src/wifi_module.cpp`

Implements modular WiFi management that uses WiFiUtils:

```cpp
class WiFiModule : public ModuleInterface {
public:
    // Module lifecycle
    bool initialize() override;
    bool start() override;
    bool stop() override;

    // Web API endpoints
    void registerWebHandlers(AsyncWebServer& server) override;

    // Status and configuration
    String getStatus() const override;
    bool setConfig(const String& config) override;
};
```

**Integration with WiFiUtils:**
```cpp
// Uses centralized scanning
server.on("/api/wifi/scan", HTTP_GET, [this](AsyncWebServerRequest *request) {
    WiFiUtils& wifiUtils = WiFiUtils::getInstance();
    bool scanStarted = wifiUtils.performAsyncScan(true, 1000);
    // ... handle response
});

// Uses centralized status reporting
String WiFiModule::getStatus() const {
    WiFiConnectionInfo info = WiFiUtils::getInstance().getConnectionInfo();
    // ... add module-specific data
}
```

### 3. WifiManager (Legacy Connection Layer)
**File:** `include/wifimanager.h`, `src/wifimanager.cpp`

Maintains ESP32-S3 optimized connection management while using WiFiUtils for scanning:

```cpp
class WifiManager {
public:
    bool connectToWifi();
    bool connectToWifi(String ssid, String pass, bool save);
    void startManagementServer();
    // ... other connection management
};

// Enhanced Improv protocol scanning
void getAvailableWifiNetworks() {
    WiFiUtils& wifiUtils = WiFiUtils::getInstance();
    bool scanStarted = wifiUtils.performAsyncScan(true, 5000);
    WiFiScanResult scanResult = wifiUtils.getScanResults(false);
    // ... process results for Improv protocol
}
```

## Unified Function Mapping

### Before Merge (Duplicated Functions)

| Function | wifi_utils.cpp | wifi_module.cpp | wifimanager.cpp |
|----------|---------------|----------------|-----------------|
| WiFi Scanning | `performAsyncScan()` | `performWiFiScan()` | `getAvailableWifiNetworks()` |
| Signal Quality | `calculateSignalQuality()` | ❌ | ❌ |
| Encryption String | `getEncryptionString()` | ❌ | Manual conversion |
| JSON Generation | `buildScanResultsJson()` | Manual JSON | Manual JSON |

### After Merge (Unified Functions)

| Function | Implementation | Used By |
|----------|---------------|---------|
| WiFi Scanning | `WiFiUtils::performAsyncScan()` | All modules |
| Signal Quality | `WiFiUtils::calculateSignalQuality()` | All modules |
| Encryption String | `WiFiUtils::getEncryptionString()` | All modules |
| JSON Generation | `WiFiUtils::buildScanResultsJson()` | Web APIs |
| Connection Info | `WiFiUtils::getConnectionInfo()` | Status reporting |

## Benefits Achieved

### 1. Code Reduction
- **~200 lines of duplicated code eliminated**
- **Single source of truth for WiFi utilities**
- **Consistent behavior across all WiFi operations**

### 2. Thread Safety
- **Semaphore-protected scanning operations**
- **Rate limiting prevents WiFi stack overload**
- **Safe concurrent access from multiple modules**

### 3. Consistency
- **Unified JSON response format**
- **Standardized signal quality calculation**
- **Consistent encryption type handling**

### 4. Maintainability
- **Single place to fix WiFi-related bugs**
- **Easier to add new features**
- **Clear separation of concerns**

## API Endpoints

### Unified WiFi APIs

| Endpoint | Handler | Description |
|----------|---------|-------------|
| `GET /api/wifi/status` | WiFiModule | Uses `WiFiUtils::getConnectionInfoJson()` |
| `GET /api/wifi/scan` | WiFiModule | Uses `WiFiUtils::performAsyncScan()` |
| `GET /api/wifi/scan_results` | WiFiModule | Uses `WiFiUtils::buildScanResultsJson()` |
| `POST /api/wifi/connect` | WiFiModule | Triggers WifiManager connection |
| `POST /api/wifi/disconnect` | WiFiModule | Disconnects WiFi |

### Response Format Examples

**WiFi Status:**
```json
{
  "connected": true,
  "ssid": "MyNetwork",
  "ip": "192.168.1.100",
  "rssi": -45,
  "signalQuality": 75,
  "encryption": "WPA2",
  "moduleVersion": "2.1.0",
  "reconnectAttempts": 0
}
```

**Scan Results:**
```json
{
  "success": true,
  "scanInProgress": false,
  "networksFound": 3,
  "networks": [
    {
      "ssid": "StrongNetwork",
      "rssi": -35,
      "quality": 100,
      "encryption": "WPA3",
      "channel": 6
    }
  ]
}
```

## Migration Guide

### For New Code
```cpp
// Use centralized utilities
WiFiUtils& wifiUtils = WiFiUtils::getInstance();

// Start scan
wifiUtils.performAsyncScan();

// Get results
WiFiScanResult results = wifiUtils.getScanResults();

// Get connection info
WiFiConnectionInfo info = wifiUtils.getConnectionInfo();
```

### For Existing Code
- Replace direct WiFi.scanNetworks() calls with WiFiUtils::performAsyncScan()
- Replace manual RSSI quality calculation with WiFiUtils::calculateSignalQuality()
- Replace manual encryption type conversion with WiFiUtils::getEncryptionString()
- Use WiFiUtils::getConnectionInfo() instead of multiple WiFi.localIP(), WiFi.RSSI(), etc. calls

## Future Enhancements

1. **Connection Management Unification**
   - Move WifiManager connection logic into WiFiUtils
   - Unified connection state management

2. **Event System Integration**
   - WiFi events broadcast through centralized system
   - Module coordination through events

3. **Configuration Persistence**
   - Unified WiFi configuration storage
   - Consistent preference management

4. **Performance Monitoring**
   - Centralized WiFi performance metrics
   - Connection quality tracking
