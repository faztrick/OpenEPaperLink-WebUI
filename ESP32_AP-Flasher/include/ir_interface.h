#ifndef IR_INTERFACE_H
#define IR_INTERFACE_H

#include <Arduino.h>
#include <ArduinoJson.h>

#ifdef HAS_IR_REMOTE

#include <IRrecv.h>   // IRremoteESP8266 receive library
#include <IRsend.h>   // IRremoteESP8266 send library
#include <IRutils.h>  // IRremoteESP8266 utilities

#include <functional>
#include <map>
#include <vector>

// Pin definitions from platformio.ini
#ifndef IR_SEND_PIN
#define IR_SEND_PIN 4
#endif

#ifndef IR_RECEIVE_PIN
#define IR_RECEIVE_PIN 5
#endif

#ifndef IR_LED_PIN
#define IR_LED_PIN 6
#endif

// IR Command types
enum IRCommandType {
    IR_CMD_UNKNOWN = 0,
    IR_CMD_POWER,
    IR_CMD_VOLUME_UP,
    IR_CMD_VOLUME_DOWN,
    IR_CMD_CHANNEL_UP,
    IR_CMD_CHANNEL_DOWN,
    IR_CMD_MUTE,
    IR_CMD_MENU,
    IR_CMD_OK,
    IR_CMD_BACK,
    IR_CMD_HOME,
    IR_CMD_UP,
    IR_CMD_DOWN,
    IR_CMD_LEFT,
    IR_CMD_RIGHT,
    IR_CMD_CUSTOM
};

// Enhanced IR Protocol types with ESP32-C6 support
enum IRProtocolType {
    IR_PROTOCOL_UNKNOWN = 0,
    IR_PROTOCOL_NEC,
    IR_PROTOCOL_SAMSUNG,
    IR_PROTOCOL_SONY,
    IR_PROTOCOL_LG,
    IR_PROTOCOL_RC5,
    IR_PROTOCOL_RC6,
    IR_PROTOCOL_PANASONIC,
    IR_PROTOCOL_JVC,
    IR_PROTOCOL_DENON,
    IR_PROTOCOL_SHARP,
    IR_PROTOCOL_RAW,
    IR_PROTOCOL_CUSTOM
};

// Enhanced IR Remote profile structure
struct IRRemoteProfile {
    String name;
    String deviceType;  // TV, AC, Audio, etc.
    String manufacturer;
    String model;
    IRProtocolType protocol;
    std::map<String, uint32_t> commands;  // Enhanced command mapping
    String description;
    bool enabled = true;
    uint32_t frequency = 38000;
    uint8_t bits = 32;
    uint32_t created = 0;
    uint32_t lastUsed = 0;
    uint32_t useCount = 0;
};

// Enhanced IR command structure
struct IRCommand {
    String name;
    IRProtocolType protocol;
    uint32_t address = 0;
    uint32_t command = 0;
    uint32_t data = 0;
    uint16_t bits = 32;
    uint32_t frequency = 38000;
    String description;
    IRCommandType type = IR_CMD_CUSTOM;
    unsigned long timestamp = 0;
    bool repeatable = true;
    uint32_t repeatDelay = 100;
    float signalQuality = 0.0;
    uint32_t rawLength = 0;
    uint16_t* rawData = nullptr;
};

// Learning session structure
struct IRLearningSession {
    String commandName;
    String profileName;
    uint32_t startTime = 0;
    uint32_t timeout = 30000;
    bool active = false;
    uint32_t attempts = 0;
    uint32_t maxAttempts = 5;
    IRCommand learnedCommand;
    bool success = false;
    String errorMessage;
};

// Statistics structure
struct IRStatistics {
    uint32_t commandsSent = 0;
    uint32_t commandsReceived = 0;
    uint32_t learningAttempts = 0;
    uint32_t successfulLearning = 0;
    uint32_t failedLearning = 0;
    uint32_t protocolErrors = 0;
    uint32_t transmissionErrors = 0;
    uint32_t lastActivity = 0;
    String lastCommand;
    String lastProfile;
    float averageSignalQuality = 0.0;
    std::map<String, uint32_t> protocolUsage;
    std::map<String, uint32_t> commandUsage;
};

class IRInterface {
   public:
    IRInterface();
    ~IRInterface();

    // Initialization and Configuration
    bool begin();
    bool initialize();
    bool configure(const JsonObject& config);
    void end();
    void shutdown();
    bool isEnabled() const { return enabled; }

    // Pin Configuration
    bool configurePins(uint8_t sendPin, uint8_t receivePin, uint8_t ledPin = 255);
    void setReceivePin(uint8_t pin);
    void setSendPin(uint8_t pin);
    void setLedPin(uint8_t pin);

    // Enable/Disable Features
    void enable(bool enabled = true) { this->enabled = enabled; }
    void enableTransmitter(bool enable = true);
    void enableReceiver(bool enable = true);
    bool isTransmitterEnabled() const { return transmitterEnabled; }
    bool isReceiverEnabled() const { return receiverEnabled; }

    // Enhanced Sending functions
    bool sendCommand(IRProtocolType protocol, uint32_t code, uint16_t bits = 32);
    bool sendCommand(const IRCommand& command);
    bool sendCommand(const String& profileName, const String& commandName, uint8_t repeatCount = 1);
    bool sendRaw(uint16_t* rawData, uint16_t length, uint16_t frequency = 38000);
    bool sendCustomSignal(IRProtocolType protocol, uint32_t address, uint32_t data, uint8_t bits = 32);
    bool repeatLastCommand(uint8_t count = 1);

    // Enhanced Receiving functions
    bool hasReceivedCommand();
    IRCommand getLastCommand();
    IRCommand receiveCommand();
    void clearReceiveBuffer();
    std::vector<IRCommand> getRecentCommands(uint32_t timeWindowMs = 60000);
    bool isSignalAvailable();

    // Learning Functions
    bool startLearning(const String& profileName, const String& commandName, uint32_t timeoutMs = 30000);
    bool stopLearning();
    bool isLearning() const { return learningMode; }
    IRLearningSession getCurrentLearningSession() const { return currentLearning; }
    IRCommand learnCommand(unsigned long timeoutMs = 10000);
    IRCommand getLearnedCommand();
    bool saveLearnedCommand();
    String getLearningStatusJson();

    // Enhanced Profile management
    bool addProfile(const IRRemoteProfile& profile);
    bool loadProfile(const String& profileName);
    bool saveProfile(const IRRemoteProfile& profile);
    bool removeProfile(const String& profileName);
    bool updateProfile(const String& profileName, const IRRemoteProfile& profile);
    IRRemoteProfile* getProfile(const String& profileName);
    std::vector<String> getProfileNames();
    std::vector<IRRemoteProfile> getAllProfiles();
    String getProfilesJson();
    IRRemoteProfile getCurrentProfile() const { return currentProfile; }

    // Command Management
    bool addCommand(const String& profileName, const String& commandName, const IRCommand& command);
    bool removeCommand(const String& profileName, const String& commandName);
    bool updateCommand(const String& profileName, const String& commandName, const IRCommand& command);
    IRCommand* getCommand(const String& profileName, const String& commandName);
    std::vector<String> getCommandNames(const String& profileName);
    String getCommandsJson(const String& profileName);

    // Enhanced Command mapping
    bool sendProfileCommand(IRCommandType commandType);
    bool sendProfileCommand(const String& commandName);
    String getCommandName(IRCommandType commandType);
    IRCommandType identifyCommand(uint32_t code);

    // Macro Functions
    bool createMacro(const String& macroName, const std::vector<String>& commandSequence, const std::vector<uint32_t>& delays);
    bool executeMacro(const String& macroName);
    bool removeMacro(const String& macroName);
    std::vector<String> getMacroNames();

    // Advanced Features
    bool copyCommand(const String& sourceProfile, const String& sourceCommand, const String& targetProfile, const String& targetCommand);
    bool cloneProfile(const String& sourceProfile, const String& targetProfile);
    float analyzeSignalQuality();
    String getSignalDiagnostics();
    bool calibrateTransmitter();
    bool testTransmission(const String& testPattern = "default");
    bool testReception(uint32_t timeoutMs = 10000);

    // Device-Specific Profiles
    bool loadTVProfile(const String& brand = "Samsung");
    bool loadAirConProfile(const String& brand = "LG");
    bool loadAudioProfile(const String& brand = "Sony");
    std::vector<String> getBuiltInProfiles();

    // Statistics and Monitoring
    IRStatistics getStatistics() const { return statistics; }
    String getStatisticsJson();
    void resetStatistics();
    String getUsageReport();
    std::vector<String> getMostUsedCommands(uint8_t count = 10);
    std::vector<String> getMostUsedProfiles(uint8_t count = 5);

    // Status and diagnostics
    void printLastCommand();
    void printProfile();
    String getStatusJSON();
    String getSystemStatus();
    bool performSelfTest();
    String getDiagnosticsReport();
    std::vector<String> getSystemWarnings();

    // Configuration Management
    bool saveConfiguration(const String& filename = "/ir_config.json");
    bool loadConfiguration(const String& filename = "/ir_config.json");
    String exportConfiguration();
    bool importConfiguration(const String& jsonConfig);
    bool exportProfile(const String& profileName, const String& filename);
    bool importProfile(const String& filename);
    bool exportAllProfiles(const String& filename = "/ir_profiles.json");
    bool importProfiles(const String& filename = "/ir_profiles.json");

    // Debug and Control
    void setDebugMode(bool enable) { debugMode = enable; }
    bool isDebugMode() const { return debugMode; }

    // Real-time Control
    void poll();
    void handleEvents();

    // Callback Management
    void setCommandReceivedCallback(std::function<void(const IRCommand&)> callback);
    void setLearningCompleteCallback(std::function<void(bool, const IRCommand&)> callback);
    void setTransmissionCompleteCallback(std::function<void(bool)> callback);
    void setErrorCallback(std::function<void(const String&)> callback);

    // Helper functions
    String protocolToString(IRProtocolType protocol);
    IRProtocolType stringToProtocol(const String& protocolStr);
    static String commandToHex(const IRCommand& command);
    static IRCommand hexToCommand(const String& hexString);

   private:
    bool enabled;
    bool transmitterEnabled;
    bool receiverEnabled;
    bool learningMode;
    bool debugMode;

    uint8_t irSendPin;
    uint8_t irRecvPin;
    uint8_t irLedPin;

    // IRremoteESP8266 objects
    IRsend* irSender;
    IRrecv* irReceiver;
    decode_results results;

    // Enhanced data structures
    IRRemoteProfile currentProfile;
    std::vector<IRRemoteProfile> profiles;
    std::vector<IRCommand> receivedCommands;
    IRLearningSession currentLearning;
    IRStatistics statistics;
    std::map<String, std::vector<String>> macros;
    std::map<String, std::vector<uint32_t>> macroDelays;

    // Timing and control
    uint32_t lastTransmission = 0;
    uint32_t transmissionCooldown = 100;
    uint32_t defaultTimeout = 30000;

    // Callback functions
    std::function<void(const IRCommand&)> commandReceivedCallback = nullptr;
    std::function<void(bool, const IRCommand&)> learningCompleteCallback = nullptr;
    std::function<void(bool)> transmissionCompleteCallback = nullptr;
    std::function<void(const String&)> errorCallback = nullptr;

    // Internal functions
    void initializeDefaultProfiles();
    void setupTransmitter();
    void setupReceiver();
    void processReceivedSignal();
    IRProtocolType decodeTypeToProtocol(decode_type_t type);
    decode_type_t protocolToDecodeType(IRProtocolType protocol);
    IRProtocolType detectProtocol(uint32_t protocolCode);
    bool validateCommand(const IRCommand& command);
    void updateStatistics(const String& operation, bool success = true);
    void logCommand(const IRCommand& command);
    void logIRActivity(const String& activity, const String& details = "");
    void saveProfilesToStorage();
    void loadProfilesFromStorage();
};  // Global IR interface instance
extern IRInterface irInterface;

// Helper functions
String irCommandTypeToString(IRCommandType type);
IRCommandType stringToIRCommandType(const String& str);
String irProtocolTypeToString(IRProtocolType protocol);
IRProtocolType stringToIRProtocolType(const String& str);

#endif  // HAS_IR_REMOTE

#ifndef HAS_IR_REMOTE
// Stub class when IR is not enabled
class IRInterface {
   public:
    IRInterface() {}
    ~IRInterface() {}
    bool begin() { return false; }
    void end() {}
    bool isEnabled() const { return false; }
};

// Global IR interface instance (stub)
extern IRInterface irInterface;
#endif  // HAS_IR_REMOTE

#endif  // IR_INTERFACE_H
