#ifndef IR_INTERFACE_H
#define IR_INTERFACE_H

#include <Arduino.h>

#ifdef HAS_IR_REMOTE

#include <IRrecv.h>   // IRremoteESP8266 receive library
#include <IRsend.h>   // IRremoteESP8266 send library
#include <IRutils.h>  // IRremoteESP8266 utilities

#include <map>
#include <vector>

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

// IR Protocol types
enum IRProtocolType {
    IR_PROTOCOL_UNKNOWN = 0,
    IR_PROTOCOL_NEC,
    IR_PROTOCOL_SAMSUNG,
    IR_PROTOCOL_SONY,
    IR_PROTOCOL_LG,
    IR_PROTOCOL_RC5,
    IR_PROTOCOL_RC6,
    IR_PROTOCOL_PANASONIC,
    IR_PROTOCOL_RAW
};

// IR Remote profile structure
struct IRRemoteProfile {
    String name;
    IRProtocolType protocol;
    uint32_t powerCode;
    uint32_t volumeUpCode;
    uint32_t volumeDownCode;
    uint32_t channelUpCode;
    uint32_t channelDownCode;
    uint32_t muteCode;
    uint32_t menuCode;
    uint32_t okCode;
    uint32_t backCode;
    uint32_t homeCode;
    uint32_t upCode;
    uint32_t downCode;
    uint32_t leftCode;
    uint32_t rightCode;
};

// IR received command structure
struct IRCommand {
    IRProtocolType protocol;
    uint32_t code;
    uint32_t rawCode;
    uint16_t bits;
    IRCommandType type;
    String description;
    unsigned long timestamp;
};

class IRInterface {
   public:
    IRInterface();
    ~IRInterface();

    // Initialization
    bool begin();
    void end();
    bool isEnabled() const { return enabled; }

    // Sending functions
    bool sendCommand(IRProtocolType protocol, uint32_t code, uint16_t bits = 32);
    bool sendCommand(const IRCommand& command);
    bool sendRaw(uint16_t* rawData, uint16_t length, uint16_t frequency = 38000);

    // Receiving functions
    bool hasReceivedCommand();
    IRCommand getLastCommand();
    void enableReceiver(bool enable = true);
    void clearReceiveBuffer();

    // Profile management
    bool loadProfile(const String& profileName);
    bool saveProfile(const IRRemoteProfile& profile);
    bool deleteProfile(const String& profileName);
    std::vector<String> getProfileList();
    IRRemoteProfile getCurrentProfile() const { return currentProfile; }

    // Command mapping
    bool sendProfileCommand(IRCommandType commandType);
    String getCommandName(IRCommandType commandType);
    IRCommandType identifyCommand(uint32_t code);

    // Learning mode
    bool startLearning();
    bool stopLearning();
    bool isLearning() const { return learningMode; }
    IRCommand learnCommand(unsigned long timeoutMs = 10000);

    // Status and diagnostics
    void printLastCommand();
    void printProfile();
    String getStatusJSON();

    // Configuration
    void setReceivePin(uint8_t pin);
    void setSendPin(uint8_t pin);
    void setDebugMode(bool enable) { debugMode = enable; }

    // Helper functions
    String protocolToString(IRProtocolType protocol);

   private:
    bool enabled;
    bool receiverEnabled;
    bool learningMode;
    bool debugMode;

    uint8_t irSendPin;
    uint8_t irRecvPin;

    // IRremoteESP8266 objects
    IRsend* irSender;
    IRrecv* irReceiver;
    decode_results results;

    IRRemoteProfile currentProfile;
    std::vector<IRRemoteProfile> profiles;
    std::vector<IRCommand> receivedCommands;

    // Internal functions
    void initializeDefaultProfiles();
    IRProtocolType decodeTypeToProtocol(decode_type_t type);
    decode_type_t protocolToDecodeType(IRProtocolType protocol);
    void logCommand(const IRCommand& command);
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
