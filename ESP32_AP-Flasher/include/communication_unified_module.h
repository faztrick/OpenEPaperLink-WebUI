/**
 * @file communication_unified_module.h
 * @brief Unified Communication Module
 *
 * Consolidates serialap.cpp, newproto.cpp, and udp.h into a single
 * framework-based module for all AP/tag communication operations.
 */

#pragma once

#include <HardwareSerial.h>

#include <map>
#include <mutex>
#include <queue>
#include <vector>

#include "AsyncUDP.h"
#include "common_framework.h"
#include "commstructs.h"
#include "tag_db.h"
#include "unified_config_system.h"

// Forward declarations
class AsyncWebServer;
class AsyncWebSocket;

namespace Framework {

/**
 * @brief Communication Protocol Types
 */
enum class CommProtocolType : uint8_t {
    SERIAL_AP = 0,     // Serial communication with AP
    UDP_NETWORK = 1,   // UDP network communication
    NEW_PROTOCOL = 2,  // New protocol over network
    TAG_DIRECT = 3     // Direct tag communication
};

/**
 * @brief Communication Message Types
 */
enum class CommMessageType : uint8_t {
    BLOCK_REQUEST = 0x01,    // RQB
    AVAIL_DATA_REQ = 0x02,   // ADR
    XFER_COMPLETE = 0x03,    // XFC
    XFER_TIMEOUT = 0x04,     // XTO
    READY = 0x05,            // RDY
    RESET = 0x06,            // RSET
    TAG_RETURN_DATA = 0x07,  // TRD
    PING = 0x08,             // Ping/heartbeat
    STATUS = 0x09,           // Status request
    CONFIG = 0x0A            // Configuration
};

/**
 * @brief AP Serial State
 */
enum class ApSerialState : uint8_t {
    STOPPED = 0,
    INIT = 1,
    RUNNING = 2,
    ERROR = 3,
    RESET = 4,
    WAIT_BOOT = 5,
    READY = 6
};

/**
 * @brief Communication Statistics
 */
struct CommStats {
    uint32_t totalPacketsSent = 0;
    uint32_t totalPacketsReceived = 0;
    uint32_t packetsDropped = 0;
    uint32_t crcErrors = 0;
    uint32_t timeouts = 0;
    uint32_t apResets = 0;
    uint32_t successfulTransmissions = 0;
    uint32_t failedTransmissions = 0;
    uint32_t averageResponseTime = 0;
    uint32_t lastActivityTime = 0;

    void reset();
    void updateStats(bool success, uint32_t responseTime = 0);
    String toJson() const;
    double getSuccessRate() const;
};

/**
 * @brief Pending Queue Item
 */
struct PendingItem {
    uint8_t targetMac[8];
    CommMessageType messageType;
    std::vector<uint8_t> data;
    uint32_t timestamp;
    uint8_t attemptsLeft;
    uint8_t priority;
    uint32_t timeout;

    bool isExpired(uint32_t currentTime) const;
    String toJson() const;
};

/**
 * @brief Communication Command
 */
struct CommCommand {
    CommMessageType type;
    uint8_t targetMac[8];
    std::vector<uint8_t> payload;
    uint32_t timeout = 5000;
    bool expectReply = true;

    String toJson() const;
    bool fromJson(const String& json);
    bool validate() const;
};

/**
 * @brief Communication Result
 */
struct CommResult {
    bool success = false;
    String errorMessage;
    std::vector<uint8_t> responseData;
    uint32_t responseTime = 0;
    uint8_t sourceMac[8] = {0};

    String toJson() const;
    bool fromJson(const String& json);
};

/**
 * @brief AP Information
 */
struct APInfo {
    String version;
    String macAddress;
    uint8_t channel = 11;
    int8_t power = 10;
    uint32_t uptime = 0;
    uint32_t totalTags = 0;
    uint32_t activeTags = 0;
    bool isOnline = false;
    uint32_t lastSeen = 0;
    ApSerialState state = ApSerialState::STOPPED;

    String toJson() const;
    bool fromJson(const String& json);
    void updateFromResponse(const uint8_t* data, size_t length);
};

/**
 * @brief Communication Configuration
 */
struct CommModuleConfig {
    // Serial AP settings
    bool enableSerialAP = true;
    uint32_t serialBaudRate = 115200;
    uint32_t serialTimeout = 5000;
    uint8_t maxRetries = 5;
    uint32_t cmdReplyTimeout = 200;
    uint32_t apBootTimeout = 10000;
    uint32_t apActivityTimeout = 30000;

    // UDP Network settings
    bool enableUDPComm = true;
    uint16_t udpPort = 4240;
    bool enableBroadcast = true;
    uint32_t udpTimeout = 3000;
    uint32_t networkScanInterval = 60000;

    // Protocol settings
    bool enableNewProtocol = true;
    uint32_t protocolTimeout = 10000;
    uint8_t maxPendingItems = 50;
    uint32_t pendingItemTimeout = 300000;  // 5 minutes
    bool enableAutoRetry = true;

    // Power management
    bool enablePowerManagement = false;
    uint32_t powerOffDelay = 300;
    uint32_t powerOnDelay = 300;
    uint32_t resetDelay = 50;

    // Channel configuration
    uint8_t defaultChannel = 11;
    int8_t defaultPower = 10;
    std::vector<uint8_t> channelList = {11, 15, 20, 25, 26};

    // Queue management
    uint32_t maxQueueSize = 100;
    uint32_t queueCleanupInterval = 60000;
    bool enablePriorityQueue = true;

    bool validate() const;
    String toJson() const;
    bool fromJson(const String& json);
};

/**
 * @brief Command Reply Handler
 */
class CommandReplyHandler {
   public:
    CommandReplyHandler() = default;
    ~CommandReplyHandler() = default;

    bool waitForReply(uint32_t timeoutMs = 5000);
    void setReply(uint8_t replyType, const uint8_t* data = nullptr, size_t dataLen = 0);
    void clearReply();

    uint8_t getReplyType() const { return _replyType; }
    const std::vector<uint8_t>& getReplyData() const { return _replyData; }

   private:
    volatile uint8_t _replyType = 0;
    std::vector<uint8_t> _replyData;
    SemaphoreHandle_t _replySemaphore = nullptr;
    bool _initialized = false;

    void initialize();
};

/**
 * @brief Serial Communication Handler
 */
class SerialCommHandler {
   public:
    SerialCommHandler();
    ~SerialCommHandler();

    bool initialize(uint32_t baudRate = 115200);
    void cleanup();

    bool sendCommand(const CommCommand& cmd, CommResult& result);
    bool isAPConnected() const;
    bool resetAP();
    bool powerCycleAP();
    APInfo getAPInfo() const { return _apInfo; }

    void startReceiveTask();
    void stopReceiveTask();

   private:
    HardwareSerial* _serial = nullptr;
    CommandReplyHandler _replyHandler;
    APInfo _apInfo;
    TaskHandle_t _receiveTask = nullptr;
    QueueHandle_t _rxQueue = nullptr;
    SemaphoreHandle_t _txMutex = nullptr;
    ApSerialState _state = ApSerialState::STOPPED;

    bool sendRawData(const uint8_t* data, size_t length);
    bool receivePacket(uint8_t* buffer, size_t& length, uint32_t timeoutMs);
    void processReceivedPacket(const uint8_t* data, size_t length);

    static void receiveTaskFunction(void* parameter);
    void handleReceiveTask();

    bool validatePacket(const uint8_t* data, size_t length) const;
    void updateAPInfo(const uint8_t* data, size_t length);
};

/**
 * @brief UDP Communication Handler
 */
class UDPCommHandler {
   public:
    UDPCommHandler();
    ~UDPCommHandler();

    bool initialize(uint16_t port = 4240);
    void cleanup();

    bool sendCommand(const CommCommand& cmd, CommResult& result);
    bool broadcastCommand(const CommCommand& cmd);

    void startListening();
    void stopListening();

    std::vector<IPAddress> getDiscoveredAPs() const { return _discoveredAPs; }
    void discoverAPs();

   private:
    AsyncUDP _udp;
    uint16_t _port = 4240;
    bool _listening = false;
    std::vector<IPAddress> _discoveredAPs;
    std::map<IPAddress, uint32_t> _apLastSeen;

    void handlePacket(AsyncUDPPacket packet);
    bool sendUDPPacket(const uint8_t* data, size_t length, IPAddress targetIP);
    void processDiscoveryResponse(const uint8_t* data, size_t length, IPAddress sourceIP);
};

/**
 * @brief Protocol Handler for New Protocol
 */
class NewProtocolHandler {
   public:
    NewProtocolHandler();
    ~NewProtocolHandler();

    bool initialize();
    void cleanup();

    // Data availability and transfer
    bool sendDataAvail(const struct pendingData* pending);
    bool sendCancelPending(const struct pendingData* pending);
    bool prepareIdleReq(const uint8_t* dst, uint16_t nextCheckin);
    bool prepareDataAvail(const uint8_t* dst);
    bool prepareCancelPending(const uint8_t* dst);

    // Queue management
    bool enqueueItem(const PendingItem& item);
    bool dequeueItem(const uint8_t* targetMac);
    uint32_t countQueueItem(const uint8_t* targetMac) const;
    void clearQueue(const uint8_t* targetMac);
    std::vector<PendingItem> getQueueForMac(const uint8_t* targetMac) const;

    // Protocol operations
    bool processDataRequest(struct espAvailDataReq* eadr);
    bool processXferComplete(struct espXferComplete* xfc);
    bool processXferTimeout(struct espXferComplete* xfc);

    void startQueueProcessor();
    void stopQueueProcessor();

   private:
    std::vector<PendingItem> _pendingQueue;
    std::mutex _queueMutex;
    TaskHandle_t _queueTask = nullptr;
    bool _processingActive = false;

    static void queueProcessorTaskFunction(void* parameter);
    void handleQueueProcessor();

    void cleanupExpiredItems();
    bool validateMacAddress(const uint8_t* mac) const;
    uint8_t calculateCRC(const void* data, uint8_t length) const;
    bool verifyCRC(const void* data, uint8_t length) const;
};

/**
 * @brief Unified Communication Module
 *
 * Consolidates all communication functionality:
 * - Serial AP communication (replaces serialap.cpp)
 * - UDP network communication (replaces udp.h)
 * - New protocol handling (replaces newproto.cpp)
 */
class CommunicationUnifiedModule : public EnhancedModuleBase {
   public:
    // Singleton access
    static CommunicationUnifiedModule& getInstance() {
        static CommunicationUnifiedModule instance;
        return instance;
    }

    // Core communication operations
    CommResult sendCommand(const CommCommand& cmd, CommProtocolType protocol = CommProtocolType::SERIAL_AP);
    CommResult broadcastCommand(const CommCommand& cmd);
    bool sendToTag(const uint8_t* targetMac, CommMessageType msgType, const uint8_t* data, size_t dataLen);

    // AP Management
    bool connectToAP();
    bool disconnectFromAP();
    bool resetAP();
    bool powerCycleAP();
    APInfo getAPInfo() const;
    bool isAPOnline() const;

    // Network Discovery
    void discoverNetworkAPs();
    std::vector<IPAddress> getDiscoveredAPs() const;
    bool connectToNetworkAP(IPAddress ip);

    // Queue Management
    bool enqueueMessage(const uint8_t* targetMac, CommMessageType msgType, const uint8_t* data, size_t dataLen, uint8_t priority = 5);
    bool dequeueMessage(const uint8_t* targetMac);
    uint32_t getPendingMessageCount(const uint8_t* targetMac = nullptr) const;
    void clearPendingMessages(const uint8_t* targetMac = nullptr);
    std::vector<PendingItem> getPendingMessages(const uint8_t* targetMac = nullptr) const;

    // Protocol Operations
    bool sendDataAvailable(const uint8_t* targetMac, const struct availableDataInfo* dataInfo);
    bool sendCancelPending(const uint8_t* targetMac);
    bool requestTagData(const uint8_t* targetMac);
    bool processTagResponse(const uint8_t* data, size_t length);

    // Channel and Power Management
    bool setChannel(uint8_t channel);
    bool setPower(int8_t power);
    uint8_t getCurrentChannel() const;
    int8_t getCurrentPower() const;
    std::vector<uint8_t> getAvailableChannels() const;

    // Configuration
    bool setModuleConfig(const CommModuleConfig& config);
    CommModuleConfig getModuleConfig() const { return _config; }

    // Statistics and monitoring
    CommStats getStatistics(CommProtocolType protocol = CommProtocolType::SERIAL_AP) const;
    void resetStatistics(CommProtocolType protocol = CommProtocolType::SERIAL_AP);
    String getDetailedStatus() const override;
    String getMetrics() const override;

    // Legacy API compatibility
    bool init_udp();
    void getAPList();
    void netProcessDataReq(struct espAvailDataReq* eadr);
    void netProcessXferComplete(struct espXferComplete* xfc);
    void netProcessXferTimeout(struct espXferComplete* xfc);
    void netSendDataAvail(struct pendingData* pending);
    void netTaginfo(struct TagInfo* taginfoitem);
    uint16_t sendBlock(const void* data, const uint16_t len);

    // Protocol handlers access
    SerialCommHandler& getSerialHandler() { return _serialHandler; }
    UDPCommHandler& getUDPHandler() { return _udpHandler; }
    NewProtocolHandler& getProtocolHandler() { return _protocolHandler; }

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
    CommunicationUnifiedModule();
    ~CommunicationUnifiedModule();

    // Delete copy constructor and assignment operator
    CommunicationUnifiedModule(const CommunicationUnifiedModule&) = delete;
    CommunicationUnifiedModule& operator=(const CommunicationUnifiedModule&) = delete;

    // Configuration and handlers
    CommModuleConfig _config;
    SerialCommHandler _serialHandler;
    UDPCommHandler _udpHandler;
    NewProtocolHandler _protocolHandler;

    // Statistics
    std::map<CommProtocolType, CommStats> _protocolStats;

    // State management
    bool _apConnected = false;
    uint32_t _lastAPActivity = 0;

    // Tasks and synchronization
    TaskHandle_t _monitoringTask = nullptr;
    SemaphoreHandle_t _statsMutex = nullptr;

    // Internal methods
    bool loadConfiguration();
    bool saveConfiguration();
    void createConfigurationSchema();

    void updateProtocolStats(CommProtocolType protocol, bool success, uint32_t responseTime = 0);
    void startMonitoringTask();
    void stopMonitoringTask();

    static void monitoringTaskFunction(void* parameter);
    void handleMonitoringTask();

    // Utility methods
    String formatMacAddress(const uint8_t* mac) const;
    bool parseMacAddress(const String& macStr, uint8_t* mac) const;
    String protocolTypeToString(CommProtocolType type) const;
    String messageTypeToString(CommMessageType type) const;

    // Event handling
    void handleTagDiscovered(const String& data);
    void handleAPStateChange(ApSerialState newState);
    void handleNetworkChange(const String& data);
};

}  // namespace Framework

// Global access macros
#define COMM_MODULE Framework::CommunicationUnifiedModule::getInstance()
#define COMM_SEND(mac, type, data, len) COMM_MODULE.sendToTag(mac, type, data, len)

// Legacy compatibility
extern Framework::CommunicationUnifiedModule& commModule;

// Legacy class aliases for compatibility
using UDPcomm = Framework::UDPCommHandler;
