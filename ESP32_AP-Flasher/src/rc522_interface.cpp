#include "rc522_interface.h"

#ifdef HAS_RC522

#include <ArduinoJson.h>

#include "enum_string_utils.h"
#include "settings.h"
#include "storage.h"

// RC522 Card Type String Converter
static const EnumStringConverter<RC522CardType>::EnumMapping rc522CardMappings[] = {
    {CARD_TYPE_MIFARE_MINI, "MIFARE Mini"},
    {CARD_TYPE_MIFARE_1K, "MIFARE 1K"},
    {CARD_TYPE_MIFARE_4K, "MIFARE 4K"},
    {CARD_TYPE_MIFARE_UL, "MIFARE Ultralight"},
    {CARD_TYPE_MIFARE_PLUS, "MIFARE Plus"},
    {CARD_TYPE_MIFARE_DESFIRE, "MIFARE DESFire"},
    {CARD_TYPE_TNP3XXX, "TNP3XXX"},
    {CARD_TYPE_ISO_14443_4, "ISO 14443-4"},
    {CARD_TYPE_ISO_18092, "ISO 18092"},
    {CARD_TYPE_MIFARE_CLASSIC, "MIFARE Classic"}};

static const EnumStringConverter<RC522CardType> rc522CardConverter(
    rc522CardMappings,
    sizeof(rc522CardMappings) / sizeof(rc522CardMappings[0]),
    CARD_TYPE_UNKNOWN);

// Global instance
RC522Interface rc522Interface;

RC522Interface::RC522Interface() : mfrc522(nullptr),
                                   spiInterface(nullptr),
                                   enabled(false),
                                   monitoring(false),
                                   autoRead(true),
                                   debugMode(false),
                                   rstPin(RC522_RST_PIN),
                                   ssPin(RC522_SS_PIN),
                                   sckPin(RC522_SCK_PIN),
                                   misoPin(RC522_MISO_PIN),
                                   mosiPin(RC522_MOSI_PIN),
                                   readTimeout(1000),
                                   lastCardCheck(0) {
    // Initialize empty card info
    currentCard = {};
}

RC522Interface::~RC522Interface() {
    end();
}

bool RC522Interface::begin() {
    if (enabled) return true;

    Serial.println("🔷 Initializing RC522 RFID Interface...");

    // Initialize SPI interface for MFRC522
    spiInterface = &SPI;
    spiInterface->begin(sckPin, misoPin, mosiPin, ssPin);

    // Initialize MFRC522 (pin, reset pin)
    mfrc522 = new MFRC522(ssPin, rstPin);
    if (!mfrc522) {
        Serial.println("❌ Failed to create MFRC522 instance");
        return false;
    }

    // Initialize the MFRC522 with our SPI interface
    mfrc522->PCD_Init();

    // Perform self-test
    if (!selfTest()) {
        Serial.println("❌ RC522 self-test failed");
        delete mfrc522;
        mfrc522 = nullptr;
        return false;
    }

    // Initialize default keys
    initializeDefaultKeys();

    // Load saved cards
    loadCardsFromStorage();

    enabled = true;

    Serial.printf("✅ RC522 RFID Interface initialized (SS: %d, RST: %d)\n", ssPin, rstPin);
    return true;
}

void RC522Interface::end() {
    if (!enabled) return;

    stopMonitoring();

    if (mfrc522) {
        mfrc522->PCD_SoftPowerDown();
        delete mfrc522;
        mfrc522 = nullptr;
    }

    enabled = false;
    Serial.println("RC522 Interface stopped");
}

bool RC522Interface::isCardPresent() {
    if (!enabled || !mfrc522) return false;

    // Check if a new card is present
    if (!mfrc522->PICC_IsNewCardPresent()) {
        return false;
    }

    // Select the card
    if (!mfrc522->PICC_ReadCardSerial()) {
        return false;
    }

    return true;
}

bool RC522Interface::readCard() {
    if (!enabled || !mfrc522) return false;

    if (!isCardPresent()) {
        currentCard.isPresent = false;
        return false;
    }

    // Read card information
    currentCard.uidSize = mfrc522->uid.size;
    memcpy(currentCard.uidBytes, mfrc522->uid.uidByte, currentCard.uidSize);

    // Convert UID to string formats
    currentCard.uid = "";
    currentCard.uidHex = "";
    for (uint8_t i = 0; i < currentCard.uidSize; i++) {
        if (i > 0) {
            currentCard.uid += ":";
            currentCard.uidHex += " ";
        }
        currentCard.uid += String(currentCard.uidBytes[i], HEX);
        currentCard.uidHex += String(currentCard.uidBytes[i] < 16 ? "0" : "") + String(currentCard.uidBytes[i], HEX);
    }
    currentCard.uid.toUpperCase();
    currentCard.uidHex.toUpperCase();

    // Determine card type
    currentCard.type = getCardType(mfrc522->PICC_GetType(mfrc522->uid.sak));
    currentCard.typeName = getCardTypeName(currentCard.type);

    // Calculate block and sector counts based on card type
    switch (currentCard.type) {
        case CARD_TYPE_MIFARE_MINI:
            currentCard.blockCount = 20;
            currentCard.sectorCount = 5;
            break;
        case CARD_TYPE_MIFARE_1K:
            currentCard.blockCount = 64;
            currentCard.sectorCount = 16;
            break;
        case CARD_TYPE_MIFARE_4K:
            currentCard.blockCount = 256;
            currentCard.sectorCount = 40;
            break;
        default:
            currentCard.blockCount = 64;  // Default assumption
            currentCard.sectorCount = 16;
            break;
    }

    currentCard.isPresent = true;
    currentCard.lastSeen = millis();

    if (debugMode) {
        printCardInfo();
    }

    // Add to detected cards if monitoring
    if (monitoring) {
        updateCardDatabase(currentCard);
    }

    // Halt card communication
    mfrc522->PICC_HaltA();
    mfrc522->PCD_StopCrypto1();

    return true;
}

void RC522Interface::clearCard() {
    currentCard = {};
}

RFIDResult RC522Interface::readBlock(uint8_t blockNumber, uint8_t* buffer, uint8_t bufferSize) {
    RFIDResult result = {false, "", "", 0};

    if (!enabled || !mfrc522) {
        result.message = "RC522 not initialized";
        return result;
    }

    if (!isCardPresent()) {
        result.message = "No card present";
        return result;
    }

    // Authenticate before reading
    if (!authenticateWithAvailableKeys(blockNumber)) {
        result.message = "Authentication failed";
        result.errorCode = 1;
        return result;
    }

    // Read the block
    MFRC522::StatusCode status = mfrc522->MIFARE_Read(blockNumber, buffer, &bufferSize);

    if (status == MFRC522::STATUS_OK) {
        result.success = true;
        result.message = "Block read successfully";
        result.data = bytesToHex(buffer, bufferSize);
    } else {
        result.message = "Read failed: " + String(mfrc522->GetStatusCodeName(status));
        result.errorCode = status;
    }

    logOperation("ReadBlock", result.success, "Block " + String(blockNumber));
    return result;
}

RFIDResult RC522Interface::writeBlock(uint8_t blockNumber, const uint8_t* data, uint8_t dataSize) {
    RFIDResult result = {false, "", "", 0};

    if (!enabled || !mfrc522) {
        result.message = "RC522 not initialized";
        return result;
    }

    if (!isCardPresent()) {
        result.message = "No card present";
        return result;
    }

    if (dataSize != 16) {
        result.message = "Data must be exactly 16 bytes";
        return result;
    }

    // Authenticate before writing
    if (!authenticateWithAvailableKeys(blockNumber)) {
        result.message = "Authentication failed";
        result.errorCode = 1;
        return result;
    }

    // Write the block
    MFRC522::StatusCode status = mfrc522->MIFARE_Write(blockNumber, (uint8_t*)data, dataSize);

    if (status == MFRC522::STATUS_OK) {
        result.success = true;
        result.message = "Block written successfully";
    } else {
        result.message = "Write failed: " + String(mfrc522->GetStatusCodeName(status));
        result.errorCode = status;
    }

    logOperation("WriteBlock", result.success, "Block " + String(blockNumber));
    return result;
}

RFIDResult RC522Interface::readText(String& text) {
    RFIDResult result = {false, "", "", 0};
    text = "";

    if (!isCardPresent()) {
        result.message = "No card present";
        return result;
    }

    // Read sectors 1-15 (sector 0 contains manufacturing data)
    for (uint8_t sector = 1; sector < currentCard.sectorCount; sector++) {
        String sectorData;
        RFIDResult sectorResult = readSector(sector, sectorData);

        if (sectorResult.success) {
            text += sectorData;
        } else {
            // Stop on first failed sector
            break;
        }
    }

    // Remove trailing null characters and clean up
    while (text.length() > 0 && (text.charAt(text.length() - 1) == '\0' || text.charAt(text.length() - 1) == ' ')) {
        text.remove(text.length() - 1);
    }

    if (text.length() > 0) {
        result.success = true;
        result.message = "Text read successfully";
        result.data = text;
    } else {
        result.message = "No readable text found";
    }

    return result;
}

RFIDResult RC522Interface::writeText(const String& text, uint8_t startSector) {
    RFIDResult result = {false, "", "", 0};

    if (!isCardPresent()) {
        result.message = "No card present";
        return result;
    }

    if (startSector == 0) {
        result.message = "Cannot write to sector 0 (manufacturer block)";
        return result;
    }

    // Convert text to bytes
    uint8_t textBytes[text.length() + 1];
    text.getBytes(textBytes, sizeof(textBytes));

    uint16_t bytesWritten = 0;
    uint16_t totalBytes = text.length();
    uint8_t sector = startSector;

    while (bytesWritten < totalBytes && sector < currentCard.sectorCount) {
        // Write to first 3 blocks of each sector (4th block is trailer)
        for (uint8_t block = 0; block < 3 && bytesWritten < totalBytes; block++) {
            uint8_t blockNumber = calculateBlockNumber(sector, block);
            uint8_t blockData[16] = {0};

            // Copy up to 16 bytes
            uint8_t copyBytes = min(16, totalBytes - bytesWritten);
            memcpy(blockData, &textBytes[bytesWritten], copyBytes);

            RFIDResult writeResult = writeBlock(blockNumber, blockData, 16);
            if (!writeResult.success) {
                result.message = "Write failed at sector " + String(sector) + ", block " + String(block);
                return result;
            }

            bytesWritten += copyBytes;
        }
        sector++;
    }

    result.success = true;
    result.message = "Text written successfully";
    result.data = String(bytesWritten) + " bytes written";

    return result;
}

void RC522Interface::startMonitoring() {
    if (!enabled) return;

    monitoring = true;
    Serial.println("📡 RC522 monitoring started");
}

void RC522Interface::stopMonitoring() {
    monitoring = false;
    Serial.println("📡 RC522 monitoring stopped");
}

bool RC522Interface::selfTest() {
    if (!mfrc522) return false;

    // Perform RC522 self-test
    bool result = mfrc522->PCD_PerformSelfTest();

    if (result) {
        Serial.println("✅ RC522 self-test passed");
    } else {
        Serial.println("❌ RC522 self-test failed");
    }

    // Re-initialize after self-test
    mfrc522->PCD_Init();

    return result;
}

void RC522Interface::initializeDefaultKeys() {
    // Default MIFARE keys
    RFIDKey defaultKeyA = {};
    defaultKeyA.name = "Default Key A";
    defaultKeyA.description = "Factory default key A (FF FF FF FF FF FF)";
    memset(defaultKeyA.keyA, 0xFF, 6);
    memset(defaultKeyA.keyB, 0xFF, 6);

    RFIDKey defaultKeyB = {};
    defaultKeyB.name = "Default Key B";
    defaultKeyB.description = "Factory default key B (FF FF FF FF FF FF)";
    memset(defaultKeyB.keyA, 0xFF, 6);
    memset(defaultKeyB.keyB, 0xFF, 6);

    RFIDKey transportKey = {};
    transportKey.name = "Transport Key";
    transportKey.description = "NFC Forum transport key (D3 F7 D3 F7 D3 F7)";
    uint8_t transportKeyBytes[] = {0xD3, 0xF7, 0xD3, 0xF7, 0xD3, 0xF7};
    memcpy(transportKey.keyA, transportKeyBytes, 6);
    memcpy(transportKey.keyB, transportKeyBytes, 6);

    keys.clear();
    keys.push_back(defaultKeyA);
    keys.push_back(defaultKeyB);
    keys.push_back(transportKey);
}

RC522CardType RC522Interface::getCardType(MFRC522::PICC_Type piccType) {
    switch (piccType) {
        case MFRC522::PICC_TYPE_MIFARE_MINI:
            return CARD_TYPE_MIFARE_MINI;
        case MFRC522::PICC_TYPE_MIFARE_1K:
            return CARD_TYPE_MIFARE_1K;
        case MFRC522::PICC_TYPE_MIFARE_4K:
            return CARD_TYPE_MIFARE_4K;
        case MFRC522::PICC_TYPE_MIFARE_UL:
            return CARD_TYPE_MIFARE_UL;
        case MFRC522::PICC_TYPE_MIFARE_PLUS:
            return CARD_TYPE_MIFARE_PLUS;
        case MFRC522::PICC_TYPE_MIFARE_DESFIRE:
            return CARD_TYPE_MIFARE_DESFIRE;
        case MFRC522::PICC_TYPE_TNP3XXX:
            return CARD_TYPE_TNP3XXX;
        case MFRC522::PICC_TYPE_ISO_14443_4:
            return CARD_TYPE_ISO_14443_4;
        case MFRC522::PICC_TYPE_ISO_18092:
            return CARD_TYPE_ISO_18092;
        default:
            return CARD_TYPE_UNKNOWN;
    }
}

String RC522Interface::getCardTypeName(RC522CardType type) {
    switch (type) {
        case CARD_TYPE_MIFARE_MINI:
            return "MIFARE Mini";
        case CARD_TYPE_MIFARE_1K:
            return "MIFARE 1K";
        case CARD_TYPE_MIFARE_4K:
            return "MIFARE 4K";
        case CARD_TYPE_MIFARE_UL:
            return "MIFARE Ultralight";
        case CARD_TYPE_MIFARE_PLUS:
            return "MIFARE Plus";
        case CARD_TYPE_MIFARE_DESFIRE:
            return "MIFARE DESFire";
        case CARD_TYPE_TNP3XXX:
            return "TNP3XXX";
        case CARD_TYPE_ISO_14443_4:
            return "ISO 14443-4";
        case CARD_TYPE_ISO_18092:
            return "ISO 18092";
        case CARD_TYPE_MIFARE_CLASSIC:
            return "MIFARE Classic";
        default:
            return "Unknown";
    }
}

String RC522Interface::bytesToHex(uint8_t* buffer, uint8_t bufferSize) {
    String hex = "";
    for (uint8_t i = 0; i < bufferSize; i++) {
        if (i > 0) hex += " ";
        if (buffer[i] < 16) hex += "0";
        hex += String(buffer[i], HEX);
    }
    hex.toUpperCase();
    return hex;
}

bool RC522Interface::authenticateWithAvailableKeys(uint8_t blockNumber) {
    if (!mfrc522) return false;

    // Calculate which sector this block is in
    uint8_t sector = blockNumber / 4;

    // Try all available keys
    for (const RFIDKey& key : keys) {
        MFRC522::MIFARE_Key mifareKey;
        memcpy(mifareKey.keyByte, key.keyA, 6);

        // Try Key A
        MFRC522::StatusCode status = mfrc522->PCD_Authenticate(
            MFRC522::PICC_CMD_MF_AUTH_KEY_A,
            blockNumber,
            &mifareKey,
            &(mfrc522->uid));

        if (status == MFRC522::STATUS_OK) {
            if (debugMode) {
                Serial.printf("🔑 Authenticated block %d with key: %s\n", blockNumber, key.name.c_str());
            }
            return true;
        }

        // Try Key B
        memcpy(mifareKey.keyByte, key.keyB, 6);
        status = mfrc522->PCD_Authenticate(
            MFRC522::PICC_CMD_MF_AUTH_KEY_B,
            blockNumber,
            &mifareKey,
            &(mfrc522->uid));

        if (status == MFRC522::STATUS_OK) {
            if (debugMode) {
                Serial.printf("🔑 Authenticated block %d with key: %s (Key B)\n", blockNumber, key.name.c_str());
            }
            return true;
        }
    }

    if (debugMode) {
        Serial.printf("❌ Failed to authenticate block %d with any available key\n", blockNumber);
    }
    return false;
}

uint8_t RC522Interface::calculateBlockNumber(uint8_t sector, uint8_t block) {
    if (sector < 32) {
        return sector * 4 + block;
    } else {
        return 128 + (sector - 32) * 16 + block;
    }
}

void RC522Interface::updateCardDatabase(const RFIDCardInfo& card) {
    // Check if card already exists in database
    for (auto& existing : detectedCards) {
        if (existing.uid == card.uid) {
            existing.lastSeen = card.lastSeen;
            return;
        }
    }

    // Add new card
    detectedCards.push_back(card);

    // Limit database size
    if (detectedCards.size() > 100) {
        detectedCards.erase(detectedCards.begin());
    }
}

void RC522Interface::logOperation(const String& operation, bool success, const String& details) {
    if (debugMode) {
        String status = success ? "✅" : "❌";
        Serial.printf("%s RC522 %s: %s\n", status.c_str(), operation.c_str(), details.c_str());
    }
}

String RC522Interface::getStatusJSON() {
    DynamicJsonDocument doc(1024);

    doc["enabled"] = enabled;
    doc["monitoring"] = monitoring;
    doc["autoRead"] = autoRead;
    doc["debugMode"] = debugMode;
    doc["ssPin"] = ssPin;
    doc["rstPin"] = rstPin;
    doc["cardPresent"] = currentCard.isPresent;
    doc["detectedCardsCount"] = detectedCards.size();
    doc["keysCount"] = keys.size();

    if (currentCard.isPresent) {
        JsonObject cardObj = doc.createNestedObject("currentCard");
        cardObj["uid"] = currentCard.uid;
        cardObj["type"] = currentCard.typeName;
        cardObj["blockCount"] = currentCard.blockCount;
        cardObj["sectorCount"] = currentCard.sectorCount;
    }

    String json;
    serializeJson(doc, json);
    return json;
}

void RC522Interface::printCardInfo() {
    if (!currentCard.isPresent) {
        Serial.println("No card present");
        return;
    }

    Serial.println("📧 RFID Card Information:");
    Serial.printf("  UID: %s\n", currentCard.uid.c_str());
    Serial.printf("  Type: %s\n", currentCard.typeName.c_str());
    Serial.printf("  Blocks: %d\n", currentCard.blockCount);
    Serial.printf("  Sectors: %d\n", currentCard.sectorCount);
    Serial.printf("  Last seen: %lu ms ago\n", millis() - currentCard.lastSeen);
}

RFIDResult RC522Interface::readSector(uint8_t sector, String& data) {
    RFIDResult result = {false, "", "", 0};
    data = "";

    // Read first 3 blocks of the sector (4th block is trailer)
    for (uint8_t block = 0; block < 3; block++) {
        uint8_t blockNumber = calculateBlockNumber(sector, block);
        uint8_t buffer[18];
        uint8_t bufferSize = sizeof(buffer);

        RFIDResult blockResult = readBlock(blockNumber, buffer, bufferSize);
        if (blockResult.success) {
            // Convert bytes to string, stopping at null terminator
            for (uint8_t i = 0; i < 16; i++) {
                if (buffer[i] == 0) break;
                if (buffer[i] >= 32 && buffer[i] <= 126) {  // Printable ASCII
                    data += (char)buffer[i];
                }
            }
        } else {
            result.message = "Failed to read sector " + String(sector) + ", block " + String(block);
            return result;
        }
    }

    result.success = true;
    result.message = "Sector read successfully";
    result.data = data;
    return result;
}

void RC522Interface::saveCardsToStorage() {
    // Implementation would save to LittleFS/SPIFFS
    Serial.printf("💾 Saving %d RFID cards to storage\n", detectedCards.size());
}

void RC522Interface::loadCardsFromStorage() {
    // Implementation would load from LittleFS/SPIFFS
    Serial.println("📂 Loading RFID cards from storage");
}

// Helper functions
String rc522CardTypeToString(RC522CardType type) {
    return rc522CardConverter.toString(type);
}

RC522CardType stringToRC522CardType(const String& str) {
    return rc522CardConverter.fromString(str);
}

String generateCardFingerprint(const RFIDCardInfo& card) {
    return card.uid + "_" + card.typeName + "_" + String(card.blockCount);
}

bool compareCards(const RFIDCardInfo& card1, const RFIDCardInfo& card2) {
    return card1.uid == card2.uid;
}

#endif  // HAS_RC522
