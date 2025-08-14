#include "ir_interface.h"

#ifdef HAS_IR_REMOTE

#include <ArduinoJson.h>

#include "settings.h"
#include "storage.h"

// Global instance
IRInterface irInterface;

IRInterface::IRInterface() : enabled(false),
                             receiverEnabled(false),
                             learningMode(false),
                             debugMode(false),
                             irSendPin(IR_SEND_PIN),
                             irRecvPin(IR_RECV_PIN) {
    // Initialize empty profile
    currentProfile = {};
}

IRInterface::~IRInterface() {
    end();
}

bool IRInterface::begin() {
    if (enabled) return true;

    Serial.println("🔴 Initializing IR Interface...");

    // Initialize IR sender with the correct API for IRremote 4.x
    IrSender.begin(irSendPin);

    // Initialize IR receiver with the correct API for IRremote 4.x
    IrReceiver.begin(irRecvPin);

    // Load profiles from storage
    loadProfilesFromStorage();

    // Initialize default profiles if none exist
    if (profiles.empty()) {
        initializeDefaultProfiles();
        saveProfilesToStorage();
    }

    // Load default profile
    if (!profiles.empty()) {
        currentProfile = profiles[0];
    }

    enabled = true;
    enableReceiver(true);

    Serial.printf("✅ IR Interface initialized (Send: %d, Recv: %d)\n", irSendPin, irRecvPin);
    return true;
}

void IRInterface::end() {
    if (!enabled) return;

    enableReceiver(false);
    IrReceiver.stop();
    // Note: IrSender doesn't have a stop() method in IRremote 4.x

    enabled = false;
    Serial.println("IR Interface stopped");
}

bool IRInterface::sendCommand(IRProtocolType protocol, uint32_t code, uint16_t bits) {
    if (!enabled) return false;

    if (debugMode) {
        Serial.printf("📤 Sending IR: Protocol=%s, Code=0x%X, Bits=%d\n",
                      protocolToString(protocol).c_str(), code, bits);
    }

    bool success = false;

    switch (protocol) {
        case IR_PROTOCOL_NEC:
            // For IRremote 4.x, use address and command format
            IrSender.sendNEC((code >> 16) & 0xFFFF, code & 0xFFFF, 0);
            success = true;
            break;
        case IR_PROTOCOL_SAMSUNG:
            // Samsung protocol expects address and command
            IrSender.sendSamsung((code >> 16) & 0xFFFF, code & 0xFFFF, 0);
            success = true;
            break;
        case IR_PROTOCOL_SONY:
            // Sony uses address and command format
            IrSender.sendSony((code >> 8) & 0xFF, code & 0xFF, 0, bits);
            success = true;
            break;
        case IR_PROTOCOL_LG:
            // LG uses address and command format
            IrSender.sendLG((code >> 8) & 0xFF, code & 0xFF, 0);
            success = true;
            break;
        case IR_PROTOCOL_RC5:
            IrSender.sendRC5((code >> 6) & 0x1F, code & 0x3F, 0, true);
            success = true;
            break;
        case IR_PROTOCOL_RC6:
            IrSender.sendRC6Raw(code, bits);
            success = true;
            break;
        case IR_PROTOCOL_PANASONIC:
            // Panasonic uses address and command format
            IrSender.sendPanasonic((code >> 8) & 0xFF, code & 0xFF, 0);
            success = true;
            break;
        default:
            Serial.println("❌ Unsupported IR protocol");
            return false;
    }

    delay(50);  // Small delay between commands
    return success;
}

bool IRInterface::sendCommand(const IRCommand& command) {
    return sendCommand(command.protocol, command.code, command.bits);
}

bool IRInterface::sendRaw(uint16_t* rawData, uint16_t length, uint16_t frequency) {
    if (!enabled) return false;

    if (debugMode) {
        Serial.printf("📤 Sending raw IR: Length=%d, Freq=%d\n", length, frequency);
    }

    IrSender.sendRaw(rawData, length, frequency);
    return true;
}

bool IRInterface::hasReceivedCommand() {
    if (!enabled || !receiverEnabled) return false;

    return IrReceiver.decode();
}

IRCommand IRInterface::getLastCommand() {
    IRCommand command = {};

    if (!IrReceiver.decodedIRData.protocol || IrReceiver.decodedIRData.protocol == UNKNOWN) {
        return command;
    }

    command.protocol = decodeTypeToProtocol(IrReceiver.decodedIRData.protocol);
    command.code = IrReceiver.decodedIRData.command;
    command.rawCode = IrReceiver.decodedIRData.decodedRawData;
    command.bits = IrReceiver.decodedIRData.numberOfBits;
    command.type = identifyCommand(command.code);
    command.description = getCommandName(command.type);
    command.timestamp = millis();

    // Resume receiving
    IrReceiver.resume();

    if (debugMode) {
        logCommand(command);
    }

    return command;
}

void IRInterface::enableReceiver(bool enable) {
    if (!enabled) return;

    if (enable && !receiverEnabled) {
        IrReceiver.start();
        receiverEnabled = true;
        if (debugMode) Serial.println("📡 IR Receiver enabled");
    } else if (!enable && receiverEnabled) {
        IrReceiver.stop();
        receiverEnabled = false;
        if (debugMode) Serial.println("📡 IR Receiver disabled");
    }
}

void IRInterface::clearReceiveBuffer() {
    if (receiverEnabled) {
        IrReceiver.resume();
    }
    receivedCommands.clear();
}

bool IRInterface::sendProfileCommand(IRCommandType commandType) {
    if (currentProfile.name.isEmpty()) {
        Serial.println("❌ No profile loaded");
        return false;
    }

    uint32_t code = 0;

    switch (commandType) {
        case IR_CMD_POWER:
            code = currentProfile.powerCode;
            break;
        case IR_CMD_VOLUME_UP:
            code = currentProfile.volumeUpCode;
            break;
        case IR_CMD_VOLUME_DOWN:
            code = currentProfile.volumeDownCode;
            break;
        case IR_CMD_CHANNEL_UP:
            code = currentProfile.channelUpCode;
            break;
        case IR_CMD_CHANNEL_DOWN:
            code = currentProfile.channelDownCode;
            break;
        case IR_CMD_MUTE:
            code = currentProfile.muteCode;
            break;
        case IR_CMD_MENU:
            code = currentProfile.menuCode;
            break;
        case IR_CMD_OK:
            code = currentProfile.okCode;
            break;
        case IR_CMD_BACK:
            code = currentProfile.backCode;
            break;
        case IR_CMD_HOME:
            code = currentProfile.homeCode;
            break;
        case IR_CMD_UP:
            code = currentProfile.upCode;
            break;
        case IR_CMD_DOWN:
            code = currentProfile.downCode;
            break;
        case IR_CMD_LEFT:
            code = currentProfile.leftCode;
            break;
        case IR_CMD_RIGHT:
            code = currentProfile.rightCode;
            break;
        default:
            Serial.println("❌ Unknown command type");
            return false;
    }

    if (code == 0) {
        Serial.printf("❌ Command %s not configured in profile\n", getCommandName(commandType).c_str());
        return false;
    }

    return sendCommand(currentProfile.protocol, code);
}

bool IRInterface::startLearning() {
    if (!enabled) return false;

    learningMode = true;
    enableReceiver(true);
    clearReceiveBuffer();

    Serial.println("🎓 IR Learning mode started");
    return true;
}

bool IRInterface::stopLearning() {
    learningMode = false;
    Serial.println("🎓 IR Learning mode stopped");
    return true;
}

IRCommand IRInterface::learnCommand(unsigned long timeoutMs) {
    if (!learningMode) {
        Serial.println("❌ Not in learning mode");
        return {};
    }

    Serial.printf("🎓 Learning command... (timeout: %lums)\n", timeoutMs);

    unsigned long startTime = millis();

    while (millis() - startTime < timeoutMs) {
        if (hasReceivedCommand()) {
            IRCommand command = getLastCommand();
            Serial.printf("✅ Learned command: Protocol=%s, Code=0x%X\n",
                          protocolToString(command.protocol).c_str(), command.code);
            return command;
        }
        delay(10);
    }

    Serial.println("⏰ Learning timeout");
    return {};
}

void IRInterface::initializeDefaultProfiles() {
    // Generic TV Profile
    IRRemoteProfile tvProfile = {};
    tvProfile.name = "Generic TV";
    tvProfile.protocol = IR_PROTOCOL_NEC;
    tvProfile.powerCode = 0xFF02FD;
    tvProfile.volumeUpCode = 0xFF906F;
    tvProfile.volumeDownCode = 0xFFE01F;
    tvProfile.channelUpCode = 0xFF609F;
    tvProfile.channelDownCode = 0xFFA05F;
    tvProfile.muteCode = 0xFF10EF;
    tvProfile.menuCode = 0xFF50AF;
    tvProfile.okCode = 0xFF38C7;
    tvProfile.backCode = 0xFF6897;
    tvProfile.homeCode = 0xFF42BD;
    tvProfile.upCode = 0xFF18E7;
    tvProfile.downCode = 0xFF4AB5;
    tvProfile.leftCode = 0xFF08F7;
    tvProfile.rightCode = 0xFF5AA5;

    profiles.push_back(tvProfile);

    // Samsung TV Profile
    IRRemoteProfile samsungProfile = {};
    samsungProfile.name = "Samsung TV";
    samsungProfile.protocol = IR_PROTOCOL_SAMSUNG;
    samsungProfile.powerCode = 0xE0E040BF;
    samsungProfile.volumeUpCode = 0xE0E0E01F;
    samsungProfile.volumeDownCode = 0xE0E0D02F;
    samsungProfile.channelUpCode = 0xE0E048B7;
    samsungProfile.channelDownCode = 0xE0E008F7;
    samsungProfile.muteCode = 0xE0E0F00F;
    samsungProfile.menuCode = 0xE0E058A7;
    samsungProfile.okCode = 0xE0E016E9;
    samsungProfile.backCode = 0xE0E01AE5;
    samsungProfile.homeCode = 0xE0E079B6;
    samsungProfile.upCode = 0xE0E006F9;
    samsungProfile.downCode = 0xE0E08679;
    samsungProfile.leftCode = 0xE0E0A659;
    samsungProfile.rightCode = 0xE0E046B9;

    profiles.push_back(samsungProfile);
}

IRProtocolType IRInterface::decodeTypeToProtocol(decode_type_t type) {
    switch (type) {
        case NEC:
            return IR_PROTOCOL_NEC;
        case SAMSUNG:
            return IR_PROTOCOL_SAMSUNG;
        case SONY:
            return IR_PROTOCOL_SONY;
        case LG:
            return IR_PROTOCOL_LG;
        case RC5:
            return IR_PROTOCOL_RC5;
        case RC6:
            return IR_PROTOCOL_RC6;
        case PANASONIC:
            return IR_PROTOCOL_PANASONIC;
        default:
            return IR_PROTOCOL_UNKNOWN;
    }
}

decode_type_t IRInterface::protocolToDecodeType(IRProtocolType protocol) {
    switch (protocol) {
        case IR_PROTOCOL_NEC:
            return NEC;
        case IR_PROTOCOL_SAMSUNG:
            return SAMSUNG;
        case IR_PROTOCOL_SONY:
            return SONY;
        case IR_PROTOCOL_LG:
            return LG;
        case IR_PROTOCOL_RC5:
            return RC5;
        case IR_PROTOCOL_RC6:
            return RC6;
        case IR_PROTOCOL_PANASONIC:
            return PANASONIC;
        default:
            return UNKNOWN;
    }
}

String IRInterface::protocolToString(IRProtocolType protocol) {
    switch (protocol) {
        case IR_PROTOCOL_NEC:
            return "NEC";
        case IR_PROTOCOL_SAMSUNG:
            return "Samsung";
        case IR_PROTOCOL_SONY:
            return "Sony";
        case IR_PROTOCOL_LG:
            return "LG";
        case IR_PROTOCOL_RC5:
            return "RC5";
        case IR_PROTOCOL_RC6:
            return "RC6";
        case IR_PROTOCOL_PANASONIC:
            return "Panasonic";
        case IR_PROTOCOL_RAW:
            return "Raw";
        default:
            return "Unknown";
    }
}

String IRInterface::getCommandName(IRCommandType commandType) {
    switch (commandType) {
        case IR_CMD_POWER:
            return "Power";
        case IR_CMD_VOLUME_UP:
            return "Volume Up";
        case IR_CMD_VOLUME_DOWN:
            return "Volume Down";
        case IR_CMD_CHANNEL_UP:
            return "Channel Up";
        case IR_CMD_CHANNEL_DOWN:
            return "Channel Down";
        case IR_CMD_MUTE:
            return "Mute";
        case IR_CMD_MENU:
            return "Menu";
        case IR_CMD_OK:
            return "OK";
        case IR_CMD_BACK:
            return "Back";
        case IR_CMD_HOME:
            return "Home";
        case IR_CMD_UP:
            return "Up";
        case IR_CMD_DOWN:
            return "Down";
        case IR_CMD_LEFT:
            return "Left";
        case IR_CMD_RIGHT:
            return "Right";
        case IR_CMD_CUSTOM:
            return "Custom";
        default:
            return "Unknown";
    }
}

IRCommandType IRInterface::identifyCommand(uint32_t code) {
    // Check against current profile
    if (code == currentProfile.powerCode) return IR_CMD_POWER;
    if (code == currentProfile.volumeUpCode) return IR_CMD_VOLUME_UP;
    if (code == currentProfile.volumeDownCode) return IR_CMD_VOLUME_DOWN;
    if (code == currentProfile.channelUpCode) return IR_CMD_CHANNEL_UP;
    if (code == currentProfile.channelDownCode) return IR_CMD_CHANNEL_DOWN;
    if (code == currentProfile.muteCode) return IR_CMD_MUTE;
    if (code == currentProfile.menuCode) return IR_CMD_MENU;
    if (code == currentProfile.okCode) return IR_CMD_OK;
    if (code == currentProfile.backCode) return IR_CMD_BACK;
    if (code == currentProfile.homeCode) return IR_CMD_HOME;
    if (code == currentProfile.upCode) return IR_CMD_UP;
    if (code == currentProfile.downCode) return IR_CMD_DOWN;
    if (code == currentProfile.leftCode) return IR_CMD_LEFT;
    if (code == currentProfile.rightCode) return IR_CMD_RIGHT;

    return IR_CMD_UNKNOWN;
}

void IRInterface::logCommand(const IRCommand& command) {
    Serial.printf("📡 IR Received: %s (0x%X) - %s\n",
                  protocolToString(command.protocol).c_str(),
                  command.code,
                  command.description.c_str());
}

String IRInterface::getStatusJSON() {
    DynamicJsonDocument doc(1024);

    doc["enabled"] = enabled;
    doc["receiverEnabled"] = receiverEnabled;
    doc["learningMode"] = learningMode;
    doc["sendPin"] = irSendPin;
    doc["recvPin"] = irRecvPin;
    doc["currentProfile"] = currentProfile.name;
    doc["profileCount"] = profiles.size();

    String json;
    serializeJson(doc, json);
    return json;
}

void IRInterface::saveProfilesToStorage() {
    // Implementation would save to LittleFS/SPIFFS
    // For now, just log
    Serial.printf("💾 Saving %d IR profiles to storage\n", profiles.size());
}

void IRInterface::loadProfilesFromStorage() {
    // Implementation would load from LittleFS/SPIFFS
    // For now, just log
    Serial.println("📂 Loading IR profiles from storage");
}

void IRInterface::setReceivePin(uint8_t pin) {
    irRecvPin = pin;
}

void IRInterface::setSendPin(uint8_t pin) {
    irSendPin = pin;
}

// Helper functions
String irCommandTypeToString(IRCommandType type) {
    return irInterface.getCommandName(type);
}

IRCommandType stringToIRCommandType(const String& str) {
    if (str == "Power") return IR_CMD_POWER;
    if (str == "Volume Up") return IR_CMD_VOLUME_UP;
    if (str == "Volume Down") return IR_CMD_VOLUME_DOWN;
    if (str == "Channel Up") return IR_CMD_CHANNEL_UP;
    if (str == "Channel Down") return IR_CMD_CHANNEL_DOWN;
    if (str == "Mute") return IR_CMD_MUTE;
    if (str == "Menu") return IR_CMD_MENU;
    if (str == "OK") return IR_CMD_OK;
    if (str == "Back") return IR_CMD_BACK;
    if (str == "Home") return IR_CMD_HOME;
    if (str == "Up") return IR_CMD_UP;
    if (str == "Down") return IR_CMD_DOWN;
    if (str == "Left") return IR_CMD_LEFT;
    if (str == "Right") return IR_CMD_RIGHT;
    if (str == "Custom") return IR_CMD_CUSTOM;
    return IR_CMD_UNKNOWN;
}

String irProtocolTypeToString(IRProtocolType protocol) {
    return irInterface.protocolToString(protocol);
}

IRProtocolType stringToIRProtocolType(const String& str) {
    if (str == "NEC") return IR_PROTOCOL_NEC;
    if (str == "Samsung") return IR_PROTOCOL_SAMSUNG;
    if (str == "Sony") return IR_PROTOCOL_SONY;
    if (str == "LG") return IR_PROTOCOL_LG;
    if (str == "RC5") return IR_PROTOCOL_RC5;
    if (str == "RC6") return IR_PROTOCOL_RC6;
    if (str == "Panasonic") return IR_PROTOCOL_PANASONIC;
    if (str == "Raw") return IR_PROTOCOL_RAW;
    return IR_PROTOCOL_UNKNOWN;
}

#endif  // HAS_IR_REMOTE
