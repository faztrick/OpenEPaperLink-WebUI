/**
 * @file communication_unified_module.cpp
 * @brief Implementation of Unified Communication Module
 *
 * Consolidates serialap.cpp, newproto.cpp, and udp.h functionality
 */

#include "communication_unified_module.h"

#include <algorithm>
#include <cstring>

#include "leds.h"
#include "powermgt.h"
#include "system.h"
#include "util.h"
#include "web.h"

using namespace Framework;

// ============================================================================
// CommStats Implementation
// ============================================================================

void CommStats::reset() {
    totalPacketsSent = 0;
    totalPacketsReceived = 0;
    packetsDropped = 0;
    crcErrors = 0;
    timeouts = 0;
    apResets = 0;
    successfulTransmissions = 0;
    failedTransmissions = 0;
    averageResponseTime = 0;
    lastActivityTime = 0;
}

void CommStats::updateStats(bool success, uint32_t responseTime) {
    if (success) {
        successfulTransmissions++;
    } else {
        failedTransmissions++;
    }

    if (responseTime > 0) {
        uint32_t total = successfulTransmissions + failedTransmissions;
        averageResponseTime = (averageResponseTime * (total - 1) + responseTime) / total;
    }

    lastActivityTime = millis();
}

String CommStats::toJson() const {
    DynamicJsonDocument doc(Framework::JSON_MEDIUM_BUFFER);

    doc["totalPacketsSent"] = totalPacketsSent;
    doc["totalPacketsReceived"] = totalPacketsReceived;
    doc["packetsDropped"] = packetsDropped;
    doc["crcErrors"] = crcErrors;
    doc["timeouts"] = timeouts;
    doc["apResets"] = apResets;
    doc["successfulTransmissions"] = successfulTransmissions;
    doc["failedTransmissions"] = failedTransmissions;
    doc["successRate"] = getSuccessRate();
    doc["averageResponseTime"] = averageResponseTime;
    doc["lastActivityTime"] = lastActivityTime;

    String result;
    serializeJson(doc, result);
    return result;
}

double CommStats::getSuccessRate() const {
    uint32_t total = successfulTransmissions + failedTransmissions;
    return total > 0 ? (double(successfulTransmissions) / double(total)) * 100.0 : 0.0;
}

// ============================================================================
// PendingItem Implementation
// ============================================================================

bool PendingItem::isExpired(uint32_t currentTime) const {
    return (currentTime - timestamp) > timeout;
}

String PendingItem::toJson() const {
    DynamicJsonDocument doc(Framework::JSON_SMALL_BUFFER);

    char macStr[25];
    snprintf(macStr, sizeof(macStr), "%02X%02X%02X%02X%02X%02X%02X%02X",
             targetMac[7], targetMac[6], targetMac[5], targetMac[4],
             targetMac[3], targetMac[2], targetMac[1], targetMac[0]);

    doc["targetMac"] = macStr;
    doc["messageType"] = static_cast<int>(messageType);
    doc["dataSize"] = data.size();
    doc["timestamp"] = timestamp;
    doc["attemptsLeft"] = attemptsLeft;
    doc["priority"] = priority;
    doc["timeout"] = timeout;

    String result;
    serializeJson(doc, result);
    return result;
}

// ============================================================================
// CommCommand Implementation
// ============================================================================

String CommCommand::toJson() const {
    DynamicJsonDocument doc(Framework::JSON_MEDIUM_BUFFER);

    doc["type"] = static_cast<int>(type);

    char macStr[25];
    snprintf(macStr, sizeof(macStr), "%02X%02X%02X%02X%02X%02X%02X%02X",
             targetMac[7], targetMac[6], targetMac[5], targetMac[4],
             targetMac[3], targetMac[2], targetMac[1], targetMac[0]);
    doc["targetMac"] = macStr;

    doc["payloadSize"] = payload.size();
    doc["timeout"] = timeout;
    doc["expectReply"] = expectReply;

    String result;
    serializeJson(doc, result);
    return result;
}

bool CommCommand::fromJson(const String& json) {
    DynamicJsonDocument doc(Framework::JSON_MEDIUM_BUFFER);
    if (deserializeJson(doc, json) != DeserializationError::Ok) {
        return false;
    }

    type = static_cast<CommMessageType>(doc["type"].as<int>());

    String macStr = doc["targetMac"] | "";
    if (macStr.length() == 16) {
        // Parse MAC address
        for (int i = 0; i < 8; i++) {
            String byteStr = macStr.substring(i * 2, i * 2 + 2);
            targetMac[7 - i] = strtol(byteStr.c_str(), nullptr, 16);
        }
    }

    timeout = doc["timeout"] | timeout;
    expectReply = doc["expectReply"] | expectReply;

    return validate();
}

bool CommCommand::validate() const {
    if (timeout < 100 || timeout > 60000) return false;
    if (payload.size() > 1024) return false;
    return true;
}

// ============================================================================
// CommResult Implementation
// ============================================================================

String CommResult::toJson() const {
    DynamicJsonDocument doc(Framework::JSON_MEDIUM_BUFFER);

    doc["success"] = success;
    doc["errorMessage"] = errorMessage;
    doc["responseDataSize"] = responseData.size();
    doc["responseTime"] = responseTime;

    char macStr[25];
    snprintf(macStr, sizeof(macStr), "%02X%02X%02X%02X%02X%02X%02X%02X",
             sourceMac[7], sourceMac[6], sourceMac[5], sourceMac[4],
             sourceMac[3], sourceMac[2], sourceMac[1], sourceMac[0]);
    doc["sourceMac"] = macStr;

    String result;
    serializeJson(doc, result);
    return result;
}

// ============================================================================
// APInfo Implementation
// ============================================================================

String APInfo::toJson() const {
    DynamicJsonDocument doc(Framework::JSON_MEDIUM_BUFFER);

    doc["version"] = version;
    doc["macAddress"] = macAddress;
    doc["channel"] = channel;
    doc["power"] = power;
    doc["uptime"] = uptime;
    doc["totalTags"] = totalTags;
    doc["activeTags"] = activeTags;
    doc["isOnline"] = isOnline;
    doc["lastSeen"] = lastSeen;
    doc["state"] = static_cast<int>(state);

    String result;
    serializeJson(doc, result);
    return result;
}

bool APInfo::fromJson(const String& json) {
    DynamicJsonDocument doc(Framework::JSON_MEDIUM_BUFFER);
    if (deserializeJson(doc, json) != DeserializationError::Ok) {
        return false;
    }

    version = doc["version"] | version;
    macAddress = doc["macAddress"] | macAddress;
    channel = doc["channel"] | channel;
    power = doc["power"] | power;
    uptime = doc["uptime"] | uptime;
    totalTags = doc["totalTags"] | totalTags;
    activeTags = doc["activeTags"] | activeTags;
    isOnline = doc["isOnline"] | isOnline;
    lastSeen = doc["lastSeen"] | lastSeen;
    state = static_cast<ApSerialState>(doc["state"].as<int>());

    return true;
}

void APInfo::updateFromResponse(const uint8_t* data, size_t length) {
    // This would parse AP response data and update the info
    // Implementation depends on the specific protocol
    lastSeen = millis();
    isOnline = true;
}

// ============================================================================
// CommModuleConfig Implementation
// ============================================================================

bool CommModuleConfig::validate() const {
    if (serialBaudRate < 9600 || serialBaudRate > 2000000) return false;
    if (serialTimeout < 100 || serialTimeout > 60000) return false;
    if (maxRetries < 1 || maxRetries > 20) return false;
    if (udpPort < 1024 || udpPort > 65535) return false;
    if (maxPendingItems < 1 || maxPendingItems > 200) return false;
    if (defaultChannel < 1 || defaultChannel > 26) return false;
    if (defaultPower < -20 || defaultPower > 20) return false;
    return true;
}

String CommModuleConfig::toJson() const {
    DynamicJsonDocument doc(Framework::JSON_LARGE_BUFFER);

    // Serial AP settings
    doc["enableSerialAP"] = enableSerialAP;
    doc["serialBaudRate"] = serialBaudRate;
    doc["serialTimeout"] = serialTimeout;
    doc["maxRetries"] = maxRetries;
    doc["cmdReplyTimeout"] = cmdReplyTimeout;
    doc["apBootTimeout"] = apBootTimeout;
    doc["apActivityTimeout"] = apActivityTimeout;

    // UDP settings
    doc["enableUDPComm"] = enableUDPComm;
    doc["udpPort"] = udpPort;
    doc["enableBroadcast"] = enableBroadcast;
    doc["udpTimeout"] = udpTimeout;
    doc["networkScanInterval"] = networkScanInterval;

    // Protocol settings
    doc["enableNewProtocol"] = enableNewProtocol;
    doc["protocolTimeout"] = protocolTimeout;
    doc["maxPendingItems"] = maxPendingItems;
    doc["pendingItemTimeout"] = pendingItemTimeout;
    doc["enableAutoRetry"] = enableAutoRetry;

    // Power management
    doc["enablePowerManagement"] = enablePowerManagement;
    doc["powerOffDelay"] = powerOffDelay;
    doc["powerOnDelay"] = powerOnDelay;
    doc["resetDelay"] = resetDelay;

    // Channel configuration
    doc["defaultChannel"] = defaultChannel;
    doc["defaultPower"] = defaultPower;

    JsonArray channelArray = doc.createNestedArray("channelList");
    for (uint8_t channel : channelList) {
        channelArray.add(channel);
    }

    // Queue management
    doc["maxQueueSize"] = maxQueueSize;
    doc["queueCleanupInterval"] = queueCleanupInterval;
    doc["enablePriorityQueue"] = enablePriorityQueue;

    String result;
    serializeJson(doc, result);
    return result;
}

bool CommModuleConfig::fromJson(const String& json) {
    DynamicJsonDocument doc(Framework::JSON_LARGE_BUFFER);
    if (deserializeJson(doc, json) != DeserializationError::Ok) {
        return false;
    }

    // Serial AP settings
    enableSerialAP = doc["enableSerialAP"] | enableSerialAP;
    serialBaudRate = doc["serialBaudRate"] | serialBaudRate;
    serialTimeout = doc["serialTimeout"] | serialTimeout;
    maxRetries = doc["maxRetries"] | maxRetries;
    cmdReplyTimeout = doc["cmdReplyTimeout"] | cmdReplyTimeout;
    apBootTimeout = doc["apBootTimeout"] | apBootTimeout;
    apActivityTimeout = doc["apActivityTimeout"] | apActivityTimeout;

    // UDP settings
    enableUDPComm = doc["enableUDPComm"] | enableUDPComm;
    udpPort = doc["udpPort"] | udpPort;
    enableBroadcast = doc["enableBroadcast"] | enableBroadcast;
    udpTimeout = doc["udpTimeout"] | udpTimeout;
    networkScanInterval = doc["networkScanInterval"] | networkScanInterval;

    // Protocol settings
    enableNewProtocol = doc["enableNewProtocol"] | enableNewProtocol;
    protocolTimeout = doc["protocolTimeout"] | protocolTimeout;
    maxPendingItems = doc["maxPendingItems"] | maxPendingItems;
    pendingItemTimeout = doc["pendingItemTimeout"] | pendingItemTimeout;
    enableAutoRetry = doc["enableAutoRetry"] | enableAutoRetry;

    // Power management
    enablePowerManagement = doc["enablePowerManagement"] | enablePowerManagement;
    powerOffDelay = doc["powerOffDelay"] | powerOffDelay;
    powerOnDelay = doc["powerOnDelay"] | powerOnDelay;
    resetDelay = doc["resetDelay"] | resetDelay;

    // Channel configuration
    defaultChannel = doc["defaultChannel"] | defaultChannel;
    defaultPower = doc["defaultPower"] | defaultPower;

    channelList.clear();
    if (doc.containsKey("channelList")) {
        JsonArray channelArray = doc["channelList"];
        for (JsonVariant channel : channelArray) {
            channelList.push_back(channel.as<uint8_t>());
        }
    }

    // Queue management
    maxQueueSize = doc["maxQueueSize"] | maxQueueSize;
    queueCleanupInterval = doc["queueCleanupInterval"] | queueCleanupInterval;
    enablePriorityQueue = doc["enablePriorityQueue"] | enablePriorityQueue;

    return validate();
}

// ============================================================================
// SerialCommHandler Implementation
// ============================================================================

SerialCommHandler::SerialCommHandler() {
    _serial = &Serial1;  // Default to Serial1 for AP communication
    _txMutex = xSemaphoreCreateMutex();
    _rxQueue = xQueueCreate(10, sizeof(struct rxCmd));
}

SerialCommHandler::~SerialCommHandler() {
    cleanup();

    if (_txMutex) {
        vSemaphoreDelete(_txMutex);
    }

    if (_rxQueue) {
        vQueueDelete(_rxQueue);
    }
}

bool SerialCommHandler::initialize(uint32_t baudRate) {
    if (_serial) {
        _serial->begin(baudRate);
        _serial->setTimeout(1000);

        _state = ApSerialState::INIT;
        return true;
    }

    return false;
}

void SerialCommHandler::cleanup() {
    stopReceiveTask();

    if (_serial) {
        _serial->end();
    }

    _state = ApSerialState::STOPPED;
}

bool SerialCommHandler::sendCommand(const CommCommand& cmd, CommResult& result) {
    if (!_serial || _state != ApSerialState::READY) {
        result.errorMessage = "Serial not ready";
        return false;
    }

    if (xSemaphoreTake(_txMutex, pdMS_TO_TICKS(1000)) != pdTRUE) {
        result.errorMessage = "Serial busy";
        return false;
    }

    uint32_t startTime = millis();
    bool success = false;

    // Send command data
    if (sendRawData(cmd.payload.data(), cmd.payload.size())) {
        if (cmd.expectReply) {
            // Wait for reply
            success = _replyHandler.waitForReply(cmd.timeout);
            if (success) {
                result.responseData = _replyHandler.getReplyData();
            } else {
                result.errorMessage = "Command timeout";
            }
        } else {
            success = true;
        }
    } else {
        result.errorMessage = "Send failed";
    }

    result.success = success;
    result.responseTime = millis() - startTime;

    xSemaphoreGive(_txMutex);

    return success;
}

bool SerialCommHandler::isAPConnected() const {
    return _state == ApSerialState::READY && _apInfo.isOnline;
}

bool SerialCommHandler::resetAP() {
    // Implementation for AP reset
    _state = ApSerialState::RESET;

    // Reset logic would go here
    vTaskDelay(pdMS_TO_TICKS(100));

    _state = ApSerialState::WAIT_BOOT;

    // Wait for boot
    uint32_t bootStart = millis();
    while (millis() - bootStart < 10000) {
        if (_apInfo.isOnline) {
            _state = ApSerialState::READY;
            return true;
        }
        vTaskDelay(pdMS_TO_TICKS(100));
    }

    _state = ApSerialState::ERROR;
    return false;
}

void SerialCommHandler::startReceiveTask() {
    if (!_receiveTask) {
        xTaskCreate(receiveTaskFunction, "SerialRx", 4096, this, 5, &_receiveTask);
    }
}

void SerialCommHandler::stopReceiveTask() {
    if (_receiveTask) {
        vTaskDelete(_receiveTask);
        _receiveTask = nullptr;
    }
}

void SerialCommHandler::receiveTaskFunction(void* parameter) {
    SerialCommHandler* handler = static_cast<SerialCommHandler*>(parameter);
    handler->handleReceiveTask();
}

void SerialCommHandler::handleReceiveTask() {
    uint8_t buffer[256];
    size_t length;

    while (true) {
        if (receivePacket(buffer, length, 100)) {
            processReceivedPacket(buffer, length);
        }

        vTaskDelay(pdMS_TO_TICKS(1));
    }
}

bool SerialCommHandler::sendRawData(const uint8_t* data, size_t length) {
    if (!_serial || !data || length == 0) {
        return false;
    }

    size_t written = _serial->write(data, length);
    _serial->flush();

    return written == length;
}

// ============================================================================
// CommunicationUnifiedModule Implementation
// ============================================================================

CommunicationUnifiedModule::CommunicationUnifiedModule()
    : EnhancedModuleBase("CommunicationUnified", "1.0.0", "Unified Communication System", ModuleType::COMMUNICATION) {
    // Set module capabilities
    _capabilities.supportsConfiguration = true;
    _capabilities.supportsRemoteControl = true;
    _capabilities.supportsStatusReporting = true;
    _capabilities.supportsMetrics = true;
    _capabilities.requiresNetwork = false;  // Network is optional
    _capabilities.requiresFileSystem = false;

    // Create mutexes
    _statsMutex = xSemaphoreCreateMutex();

    // Initialize protocol statistics
    _protocolStats[CommProtocolType::SERIAL_AP] = CommStats{};
    _protocolStats[CommProtocolType::UDP_NETWORK] = CommStats{};
    _protocolStats[CommProtocolType::NEW_PROTOCOL] = CommStats{};
}

CommunicationUnifiedModule::~CommunicationUnifiedModule() {
    cleanup();

    if (_statsMutex) {
        vSemaphoreDelete(_statsMutex);
    }
}

bool CommunicationUnifiedModule::doInitialize() {
    logInfo("Initializing Unified Communication Module");

    // Load configuration
    if (!loadConfiguration()) {
        logWarning("Failed to load configuration, using defaults");
    }

    // Create configuration schema
    createConfigurationSchema();

    // Initialize handlers
    if (_config.enableSerialAP) {
        if (_serialHandler.initialize(_config.serialBaudRate)) {
            logInfo("Serial AP handler initialized");
        } else {
            logWarning("Failed to initialize Serial AP handler");
        }
    }

    if (_config.enableUDPComm) {
        if (_udpHandler.initialize(_config.udpPort)) {
            logInfo("UDP handler initialized");
        } else {
            logWarning("Failed to initialize UDP handler");
        }
    }

    if (_config.enableNewProtocol) {
        if (_protocolHandler.initialize()) {
            logInfo("Protocol handler initialized");
        } else {
            logWarning("Failed to initialize Protocol handler");
        }
    }

    logInfo("Unified Communication Module initialized successfully");
    return true;
}

bool CommunicationUnifiedModule::doStart() {
    logInfo("Starting Unified Communication Module");

    // Start handlers
    if (_config.enableSerialAP) {
        _serialHandler.startReceiveTask();
    }

    if (_config.enableUDPComm) {
        _udpHandler.startListening();
    }

    if (_config.enableNewProtocol) {
        _protocolHandler.startQueueProcessor();
    }

    // Start monitoring task
    startMonitoringTask();

    logInfo("Unified Communication Module started successfully");
    return true;
}

bool CommunicationUnifiedModule::doStop() {
    logInfo("Stopping Unified Communication Module");

    // Stop monitoring task
    stopMonitoringTask();

    // Stop handlers
    _serialHandler.stopReceiveTask();
    _udpHandler.stopListening();
    _protocolHandler.stopQueueProcessor();

    logInfo("Unified Communication Module stopped");
    return true;
}

void CommunicationUnifiedModule::doUpdate() {
    // Update AP connection status
    static uint32_t lastAPCheck = 0;
    if (millis() - lastAPCheck > 5000) {
        _apConnected = _serialHandler.isAPConnected();
        lastAPCheck = millis();
    }

    // Update activity
    updateActivity();
}

void CommunicationUnifiedModule::doHandleEvent(const String& event, const String& data) {
    if (event == "tag.discovered") {
        handleTagDiscovered(data);
    } else if (event == "network.changed") {
        handleNetworkChange(data);
    } else if (event == "config.changed") {
        loadConfiguration();
    }
}

// ========================================================================
// Core Communication Operations
// ========================================================================

CommResult CommunicationUnifiedModule::sendCommand(const CommCommand& cmd, CommProtocolType protocol) {
    CommResult result;
    uint32_t startTime = millis();

    switch (protocol) {
        case CommProtocolType::SERIAL_AP:
            if (_config.enableSerialAP) {
                result.success = _serialHandler.sendCommand(cmd, result);
            } else {
                result.errorMessage = "Serial AP disabled";
            }
            break;
        case CommProtocolType::UDP_NETWORK:
            if (_config.enableUDPComm) {
                result.success = _udpHandler.sendCommand(cmd, result);
            } else {
                result.errorMessage = "UDP communication disabled";
            }
            break;
        default:
            result.errorMessage = "Unsupported protocol";
            break;
    }

    uint32_t responseTime = millis() - startTime;
    updateProtocolStats(protocol, result.success, responseTime);

    return result;
}

bool CommunicationUnifiedModule::sendToTag(const uint8_t* targetMac, CommMessageType msgType, const uint8_t* data, size_t dataLen) {
    if (!targetMac || !data || dataLen == 0) {
        return false;
    }

    CommCommand cmd;
    cmd.type = msgType;
    memcpy(cmd.targetMac, targetMac, 8);
    cmd.payload.assign(data, data + dataLen);
    cmd.timeout = _config.protocolTimeout;

    CommResult result = sendCommand(cmd, CommProtocolType::SERIAL_AP);
    return result.success;
}

// ========================================================================
// Configuration Management
// ========================================================================

bool CommunicationUnifiedModule::loadConfiguration() {
    String configJson = getConfigValue("commConfig", "{}");

    if (!configJson.isEmpty() && configJson != "{}") {
        return _config.fromJson(configJson);
    }

    // Use defaults and save
    return saveConfiguration();
}

bool CommunicationUnifiedModule::saveConfiguration() {
    String configJson = _config.toJson();
    return setConfigValue("commConfig", configJson);
}

void CommunicationUnifiedModule::createConfigurationSchema() {
    // Create configuration schema for the unified config system
    auto schema = BUILD_MODULE_CONFIG("CommunicationUnified", "1.0.0", "Unified Communication System")
                      .beginSection("serial", "Serial AP Settings", "serial-port")
                      .addBoolean("enableSerialAP", true, "Enable Serial AP communication")
                      .required()
                      .addInteger("serialBaudRate", 115200, "Serial baud rate")
                      .range("9600", "2000000")
                      .addInteger("serialTimeout", 5000, "Serial timeout in milliseconds")
                      .range("100", "60000")
                      .addInteger("maxRetries", 5, "Maximum retry attempts")
                      .range("1", "20")
                      .endSection()
                      .beginSection("network", "Network Settings", "network-wired")
                      .addBoolean("enableUDPComm", true, "Enable UDP communication")
                      .addInteger("udpPort", 4240, "UDP port")
                      .range("1024", "65535")
                      .addBoolean("enableBroadcast", true, "Enable broadcast discovery")
                      .addInteger("udpTimeout", 3000, "UDP timeout in milliseconds")
                      .range("100", "30000")
                      .endSection()
                      .beginSection("protocol", "Protocol Settings", "code")
                      .addBoolean("enableNewProtocol", true, "Enable new protocol handling")
                      .addInteger("protocolTimeout", 10000, "Protocol timeout in milliseconds")
                      .range("1000", "60000")
                      .addInteger("maxPendingItems", 50, "Maximum pending queue items")
                      .range("1", "200")
                      .addBoolean("enableAutoRetry", true, "Enable automatic retry")
                      .endSection()
                      .beginSection("power", "Power Management", "power")
                      .addBoolean("enablePowerManagement", false, "Enable power management")
                      .addInteger("powerOffDelay", 300, "Power off delay in milliseconds")
                      .range("10", "5000")
                      .addInteger("powerOnDelay", 300, "Power on delay in milliseconds")
                      .range("10", "5000")
                      .endSection()
                      .build();

    // Register with unified config system
    UNIFIED_CONFIG.registerModuleSchema(schema);
}

// ========================================================================
// Internal Methods
// ========================================================================

void CommunicationUnifiedModule::updateProtocolStats(CommProtocolType protocol, bool success, uint32_t responseTime) {
    if (xSemaphoreTake(_statsMutex, pdMS_TO_TICKS(100)) == pdTRUE) {
        auto it = _protocolStats.find(protocol);
        if (it != _protocolStats.end()) {
            it->second.updateStats(success, responseTime);
        }
        xSemaphoreGive(_statsMutex);
    }
}

void CommunicationUnifiedModule::startMonitoringTask() {
    if (!_monitoringTask) {
        xTaskCreate(monitoringTaskFunction, "CommMonitor", 4096, this, 3, &_monitoringTask);
    }
}

void CommunicationUnifiedModule::stopMonitoringTask() {
    if (_monitoringTask) {
        vTaskDelete(_monitoringTask);
        _monitoringTask = nullptr;
    }
}

void CommunicationUnifiedModule::monitoringTaskFunction(void* parameter) {
    CommunicationUnifiedModule* module = static_cast<CommunicationUnifiedModule*>(parameter);
    module->handleMonitoringTask();
}

void CommunicationUnifiedModule::handleMonitoringTask() {
    while (true) {
        // Check AP status
        if (_config.enableSerialAP && !_serialHandler.isAPConnected()) {
            // Try to reconnect
            _serialHandler.resetAP();
        }

        // Clean up expired pending items
        if (_config.enableNewProtocol) {
            // This would clean up the protocol handler queue
        }

        vTaskDelay(pdMS_TO_TICKS(5000));
    }
}

String CommunicationUnifiedModule::getDetailedStatus() const {
    DynamicJsonDocument doc(Framework::JSON_LARGE_BUFFER);

    doc["apConnected"] = _apConnected;
    doc["lastAPActivity"] = _lastAPActivity;

    // AP Info
    APInfo apInfo = _serialHandler.getAPInfo();
    doc["apInfo"] = serialized(apInfo.toJson());

    // Protocol statistics
    JsonObject statsObj = doc.createNestedObject("protocolStats");
    for (const auto& statsPair : _protocolStats) {
        String protocolName = protocolTypeToString(statsPair.first);
        statsObj[protocolName] = serialized(statsPair.second.toJson());
    }

    String result;
    serializeJson(doc, result);
    return result;
}

String CommunicationUnifiedModule::getMetrics() const {
    DynamicJsonDocument doc(Framework::JSON_MEDIUM_BUFFER);

    // Overall metrics
    uint32_t totalSent = 0, totalReceived = 0, totalSuccess = 0, totalFailed = 0;

    for (const auto& statsPair : _protocolStats) {
        totalSent += statsPair.second.totalPacketsSent;
        totalReceived += statsPair.second.totalPacketsReceived;
        totalSuccess += statsPair.second.successfulTransmissions;
        totalFailed += statsPair.second.failedTransmissions;
    }

    doc["totalPacketsSent"] = totalSent;
    doc["totalPacketsReceived"] = totalReceived;
    doc["successfulTransmissions"] = totalSuccess;
    doc["failedTransmissions"] = totalFailed;
    doc["overallSuccessRate"] = (totalSuccess + totalFailed) > 0 ? (double(totalSuccess) / double(totalSuccess + totalFailed)) * 100.0 : 0.0;
    doc["apConnected"] = _apConnected;

    String result;
    serializeJson(doc, result);
    return result;
}

String CommunicationUnifiedModule::protocolTypeToString(CommProtocolType type) const {
    switch (type) {
        case CommProtocolType::SERIAL_AP:
            return "SerialAP";
        case CommProtocolType::UDP_NETWORK:
            return "UDPNetwork";
        case CommProtocolType::NEW_PROTOCOL:
            return "NewProtocol";
        case CommProtocolType::TAG_DIRECT:
            return "TagDirect";
        default:
            return "Unknown";
    }
}

String CommunicationUnifiedModule::messageTypeToString(CommMessageType type) const {
    switch (type) {
        case CommMessageType::BLOCK_REQUEST:
            return "BlockRequest";
        case CommMessageType::AVAIL_DATA_REQ:
            return "AvailDataReq";
        case CommMessageType::XFER_COMPLETE:
            return "XferComplete";
        case CommMessageType::XFER_TIMEOUT:
            return "XferTimeout";
        case CommMessageType::READY:
            return "Ready";
        case CommMessageType::RESET:
            return "Reset";
        case CommMessageType::TAG_RETURN_DATA:
            return "TagReturnData";
        case CommMessageType::PING:
            return "Ping";
        case CommMessageType::STATUS:
            return "Status";
        case CommMessageType::CONFIG:
            return "Config";
        default:
            return "Unknown";
    }
}

// Global instance
CommunicationUnifiedModule& commModule = CommunicationUnifiedModule::getInstance();
