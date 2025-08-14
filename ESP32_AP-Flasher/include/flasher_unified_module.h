/**
 * @file flasher_unified_module.h
 * @brief Unified Flasher Module
 *
 * Consolidates flasher.cpp, espflasher.cpp, webflasher.h, and usbflasher.h
 * into a single framework-based module for tag and ESP32 flashing operations.
 */

#pragma once

#include <map>
#include <vector>

#include "common_framework.h"
#include "esp_loader.h"
#include "unified_config_system.h"
#include "zbs_interface.h"

// Forward declarations
class AsyncWebServer;
class AsyncWebSocket;
class AsyncWebSocketClient;

namespace Framework {

/**
 * @brief Flash Transport Types
 */
enum class FlashTransportType : uint8_t {
    USB = 0,
    TCP = 1,
    WEBSOCKET = 2,
    SERIAL = 3
};

/**
 * @brief Flash Target Types
 */
enum class FlashTargetType : uint8_t {
    ZBS_TAG = 0,
    ESP32_TARGET = 1,
    AP_FIRMWARE = 2,
    INFO_BLOCK = 3
};

/**
 * @brief Flash Port Configuration
 */
enum class FlashPort : uint8_t {
    PORT_AP = 0,   // Main AP flasher port
    PORT_EXT = 1,  // External flasher port
    PORT_ALT = 2,  // Alternative flasher port
    PORT_USB = 3   // USB flasher port
};

/**
 * @brief Flash Operation Result
 */
struct FlashResult {
    bool success = false;
    String errorMessage;
    uint32_t bytesFlashed = 0;
    uint32_t flashTime = 0;
    String targetMAC;
    String firmwareMD5;
    uint8_t tagType = 0;

    String toJson() const;
    bool fromJson(const String& json);
};

/**
 * @brief Flash Operation Configuration
 */
struct FlashConfig {
    FlashTargetType targetType = FlashTargetType::ZBS_TAG;
    FlashPort port = FlashPort::PORT_AP;
    String firmwareFile;
    uint32_t address = 0;
    bool includeInfoBlock = false;
    bool verifyAfterFlash = true;
    bool autoDetectTag = true;
    uint32_t timeout = 30000;
    uint32_t baudRate = 115200;
    String targetMAC;

    String toJson() const;
    bool fromJson(const String& json);
    bool validate() const;
};

/**
 * @brief Flasher Command Structure
 */
struct FlasherCommand {
    uint8_t command;
    uint8_t port;
    uint32_t address;
    uint16_t length;
    uint8_t data[1024];

    String toJson() const;
    bool fromJson(const String& json);
};

/**
 * @brief Port Configuration
 */
struct PortConfig {
    int8_t ss_pin = -1;
    int8_t clk_pin = -1;
    int8_t mosi_pin = -1;
    int8_t miso_pin = -1;
    int8_t reset_pin = -1;
    int8_t rxd_pin = -1;
    int8_t txd_pin = -1;
    int8_t test_pin = -1;
    std::vector<int8_t> power_pins;
    uint32_t speed = 4000000;

    bool isValid() const;
    String toJson() const;
    bool fromJson(const String& json);
};

/**
 * @brief Flasher Statistics
 */
struct FlasherStats {
    uint32_t totalFlashes = 0;
    uint32_t successfulFlashes = 0;
    uint32_t failedFlashes = 0;
    uint32_t totalBytesFlashed = 0;
    uint32_t averageFlashTime = 0;
    uint32_t lastFlashTime = 0;
    std::map<String, uint32_t> flashCountByType;

    void reset();
    void updateStats(const FlashResult& result);
    String toJson() const;
    double getSuccessRate() const;
};

/**
 * @brief Module Configuration
 */
struct FlasherModuleConfig {
    // General settings
    bool enableAutoFlash = true;
    bool enableWebFlasher = true;
    bool enableUSBFlasher = false;
    uint32_t defaultTimeout = 30000;
    uint32_t maxConcurrentFlashes = 2;

    // Port configurations
    PortConfig apPort;
    PortConfig extPort;
    PortConfig altPort;
    PortConfig usbPort;

    // ESP32 flasher settings
    uint32_t esp32BaudRate = 115200;
    uint32_t esp32HigherBaudRate = 921600;
    bool esp32AutoChangeBaud = true;

    // Tag flasher settings
    bool autoDetectTagType = true;
    bool includeInfoBlockByDefault = false;
    bool verifyAfterFlash = true;
    bool backupBeforeFlash = false;

    // Web interface settings
    bool enableWebSocketFlasher = true;
    bool enableRESTAPI = true;
    uint16_t webSocketPort = 81;

    // Validation and JSON serialization
    bool validate() const;
    String toJson() const;
    bool fromJson(const String& json);
};

/**
 * @brief Flash Session Management
 */
class FlashSession {
   public:
    String sessionId;
    FlashConfig config;
    FlashResult result;
    uint32_t startTime = 0;
    uint32_t endTime = 0;
    bool active = false;
    FlashTransportType transport = FlashTransportType::WEBSOCKET;

    FlashSession(const String& id, const FlashConfig& cfg);
    ~FlashSession() = default;

    void start();
    void complete(const FlashResult& res);
    void fail(const String& error);
    bool isExpired(uint32_t timeoutMs = 300000) const;  // 5 minute default
    String getProgress() const;
    String toJson() const;
};

/**
 * @brief Logger for Flasher Operations
 */
class FlasherLogger {
   public:
    FlasherLogger();
    ~FlasherLogger() = default;

    void log(const String& message, const String& level = "INFO");
    void logDebug(const String& message);
    void logInfo(const String& message);
    void logWarning(const String& message);
    void logError(const String& message);

    void enableWebSocketLogging(bool enable);
    void setLogLevel(const String& level);
    String getLogHistory(uint32_t maxLines = 100) const;
    void clearHistory();

   private:
    std::vector<String> _logHistory;
    String _logLevel = "INFO";
    bool _webSocketLogging = false;
    uint32_t _maxHistoryLines = 1000;
    SemaphoreHandle_t _logMutex = nullptr;

    void addToHistory(const String& entry);
    void sendToWebSocket(const String& message);
};

/**
 * @brief Unified Flasher Module
 *
 * Consolidates all flashing functionality:
 * - ZBS Tag flashing (replaces flasher.cpp)
 * - ESP32 target flashing (replaces espflasher.cpp)
 * - Web-based flashing interface (replaces webflasher.h)
 * - USB flashing interface (replaces usbflasher.h)
 */
class FlasherUnifiedModule : public EnhancedModuleBase {
   public:
    // Singleton access
    static FlasherUnifiedModule& getInstance() {
        static FlasherUnifiedModule instance;
        return instance;
    }

    // Core flasher operations
    FlashResult flashTag(const FlashConfig& config);
    FlashResult flashESP32(const FlashConfig& config);
    FlashResult flashAPFirmware(uint8_t type = 0);
    FlashResult updateAPFirmware(uint8_t type = 0);

    // Session management
    String createFlashSession(const FlashConfig& config, FlashTransportType transport = FlashTransportType::WEBSOCKET);
    FlashResult executeFlashSession(const String& sessionId);
    bool cancelFlashSession(const String& sessionId);
    std::vector<String> getActiveSessions() const;
    FlashSession* getSession(const String& sessionId);

    // Tag detection and analysis
    bool connectTag(FlashPort port);
    bool detectTagType(FlashPort port, uint8_t& tagType);
    bool readTagMAC(FlashPort port, String& mac);
    bool readTagMD5(FlashPort port, String& md5);
    bool readInfoBlock(FlashPort port, uint8_t* buffer, size_t bufferSize);
    bool writeInfoBlock(FlashPort port, const uint8_t* buffer, size_t size);

    // ESP32 target operations
    esp_loader_error_t connectESP32Target(uint32_t baudRate = 115200);
    esp_loader_error_t flashESP32Binary(const String& filePath, uint32_t address);
    esp_loader_error_t verifyESP32Flash(const String& filePath, uint32_t address);

    // Port management
    bool isPortAvailable(FlashPort port) const;
    bool configurePort(FlashPort port, const PortConfig& config);
    PortConfig getPortConfig(FlashPort port) const;
    std::vector<FlashPort> getAvailablePorts() const;

    // Configuration management
    bool setModuleConfig(const FlasherModuleConfig& config);
    FlasherModuleConfig getModuleConfig() const { return _config; }

    // Statistics and monitoring
    FlasherStats getStatistics() const { return _stats; }
    void resetStatistics();
    std::vector<FlashResult> getFlashHistory(uint32_t maxResults = 50) const;

    // Web interface integration
    void registerWebHandlers(AsyncWebServer* server) override;
    void registerWebSocketHandlers(AsyncWebSocket* ws);
    void handleWebSocketMessage(const String& message, AsyncWebSocketClient* client);

    // Legacy API compatibility
    bool doAPFlash();
    bool doAPUpdate(uint8_t type);
    bool doTagFlash();
    bool extTagConnected();
    uint16_t getAPUpdateVersion(uint8_t type);
    bool checkForcedAPFlash();
    bool doForcedAPFlash();
    void flashCountDown(uint8_t c);

    // Logger access
    FlasherLogger& getLogger() { return _logger; }

    // Module status
    String getDetailedStatus() const override;
    String getMetrics() const override;

   protected:
    // EnhancedModuleBase implementation
    bool doInitialize() override;
    bool doStart() override;
    bool doStop() override;
    void doUpdate() override;
    void doCleanup() override;
    void doHandleEvent(const String& event, const String& data) override;

   private:
    // Private constructor for singleton
    FlasherUnifiedModule();
    ~FlasherUnifiedModule();

    // Delete copy constructor and assignment operator
    FlasherUnifiedModule(const FlasherUnifiedModule&) = delete;
    FlasherUnifiedModule& operator=(const FlasherUnifiedModule&) = delete;

    // Configuration and state
    FlasherModuleConfig _config;
    FlasherStats _stats;
    FlasherLogger _logger;

    // ZBS interface management
    std::map<FlashPort, std::unique_ptr<ZBS_interface>> _zbsInterfaces;
    SemaphoreHandle_t _flashMutex = nullptr;

    // Session management
    std::map<String, std::unique_ptr<FlashSession>> _activeSessions;
    SemaphoreHandle_t _sessionMutex = nullptr;
    uint32_t _nextSessionId = 1;

    // Port configurations
    std::map<FlashPort, PortConfig> _portConfigs;

    // Flash history
    std::vector<FlashResult> _flashHistory;
    uint32_t _maxHistoryEntries = 100;

    // Task handles
    TaskHandle_t _webFlasherTask = nullptr;
    TaskHandle_t _usbFlasherTask = nullptr;
    TaskHandle_t _sessionManagerTask = nullptr;

    // WebSocket integration
    AsyncWebSocket* _webSocket = nullptr;

    // Internal methods
    bool loadConfiguration();
    bool saveConfiguration();
    void createConfigurationSchema();

    // ZBS interface management
    ZBS_interface* getZBSInterface(FlashPort port);
    bool initializeZBSInterface(FlashPort port);
    void cleanupZBSInterfaces();

    // Internal flash operations
    FlashResult flashTagInternal(const FlashConfig& config);
    FlashResult flashESP32Internal(const FlashConfig& config);
    bool writeFlashFromPack(const String& filename, uint8_t type, FlashPort port);
    bool backupTagFlash(FlashPort port, const String& backupPath);

    // Session management
    void cleanupExpiredSessions();
    String generateSessionId();

    // Port configuration
    void initializePortConfigurations();
    bool validatePortConfig(const PortConfig& config) const;

    // Legacy flasher support
    class LegacyFlasher {
       public:
        LegacyFlasher(FlasherUnifiedModule* parent) : _parent(parent) {}

        // Legacy methods that delegate to unified module
        bool connectTag(uint8_t port);
        bool getFirmwareMD5();
        bool getFirmwareMac();
        bool findTagByMD5();
        bool findTagByType(uint8_t type);
        bool writeFlash(uint8_t* flashbuffer, uint16_t size);
        bool writeFlashFromPack(String filename, uint8_t type);
        bool readBlock(uint16_t offset, uint8_t* data, uint16_t len, bool infopage);
        bool writeBlock(uint16_t offset, uint8_t* data, uint16_t len, bool infopage);
        bool readInfoBlock();
        bool writeInfoBlock();
        bool backupFlash();

        // Legacy data members (for compatibility)
        uint8_t md5[16] = {0};
        char md5char[34];
        uint8_t tagtype = 0;
        uint8_t* infoblock = nullptr;
        bool includeInfoBlock = false;
        uint8_t mac[8] = {0};
        uint8_t mac_format = 0;
        uint16_t mac_suffix = 0;
        uint16_t mac_offset = 0;

       private:
        FlasherUnifiedModule* _parent;
    };

    std::unique_ptr<LegacyFlasher> _legacyFlasher;

    // Static task functions
    static void webFlasherTaskFunction(void* parameter);
    static void usbFlasherTaskFunction(void* parameter);
    static void sessionManagerTaskFunction(void* parameter);

    // Internal utility methods
    void updateStatistics(const FlashResult& result);
    void addToFlashHistory(const FlashResult& result);
    String formatMAC(const uint8_t* mac, uint8_t length) const;
    String calculateFileMD5(const String& filePath) const;
    bool validateFirmwareFile(const String& filePath, FlashTargetType targetType) const;

    // WebSocket helpers
    void broadcastToWebSockets(const String& message);
    void sendSessionUpdate(const String& sessionId);

    // Command handlers
    void handleFlasherCommand(const FlasherCommand& cmd, FlashTransportType transport);
    void processFlasherCommand(const FlasherCommand& cmd, FlashTransportType transport);
    void handleWebSocketData(const uint8_t* data, size_t len, AsyncWebSocketClient* client);
    void sendDataToClient(const uint8_t* data, size_t len, AsyncWebSocketClient* client = nullptr);

    // ESP32 flasher helpers
    esp_loader_error_t connectToESP32Target(uint32_t higherTransmissionRate);
    esp_loader_error_t flashBinaryToESP32(const String& filePath, size_t address);

    // Utility methods
    void dump(const uint8_t* data, uint16_t length) const;
    uint8_t validatePowerPinCount(const std::vector<int8_t>& powerPins) const;
};

}  // namespace Framework

// Global access macros
#define FLASHER_MODULE Framework::FlasherUnifiedModule::getInstance()
#define FLASHER_LOG(msg) FLASHER_MODULE.getLogger().log(msg)

// Legacy compatibility
extern Framework::FlasherUnifiedModule& flasherModule;

// Legacy class alias for compatibility
using flasher = Framework::FlasherUnifiedModule::LegacyFlasher;
