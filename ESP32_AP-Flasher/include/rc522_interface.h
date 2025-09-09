#ifndef RC522_INTERFACE_H
#define RC522_INTERFACE_H

#include <Arduino.h>

#ifdef HAS_RC522

#include <SPI.h>
#include <MFRC522.h>

// Card types
enum RC522CardType {
    CARD_TYPE_UNKNOWN = 0,
    CARD_TYPE_MIFARE_MINI,
    CARD_TYPE_MIFARE_1K,
    CARD_TYPE_MIFARE_4K,
    CARD_TYPE_MIFARE_UL,
    CARD_TYPE_MIFARE_PLUS,
    CARD_TYPE_MIFARE_DESFIRE,
    CARD_TYPE_TNP3XXX,
    CARD_TYPE_ISO_14443_4,
    CARD_TYPE_ISO_18092,
    CARD_TYPE_MIFARE_CLASSIC
};

// Card access modes
enum RC522AccessMode {
    ACCESS_READ_ONLY = 0,
    ACCESS_READ_WRITE,
    ACCESS_WRITE_ONLY
};

// RFID card information structure
struct RFIDCardInfo {
    String uid;
    String uidHex;
    uint8_t uidBytes[10];
    uint8_t uidSize;
    RC522CardType type;
    String typeName;
    uint16_t blockCount;
    uint16_t sectorCount;
    bool isPresent;
    unsigned long lastSeen;
    String data;
};

// RFID operation result
struct RFIDResult {
    bool success;
    String message;
    String data;
    uint8_t errorCode;
};

// Access key structure
struct RFIDKey {
    uint8_t keyA[6];
    uint8_t keyB[6];
    String name;
    String description;
};

class RC522Interface {
public:
    RC522Interface();
    ~RC522Interface();
    
    // Initialization
    bool begin();
    void end();
    bool isEnabled() const { return enabled; }
    
    // Card detection
    bool isCardPresent();
    bool readCard();
    RFIDCardInfo getCardInfo() const { return currentCard; }
    void clearCard();
    
    // Card operations
    RFIDResult readBlock(uint8_t blockNumber, uint8_t* buffer, uint8_t bufferSize);
    RFIDResult writeBlock(uint8_t blockNumber, const uint8_t* data, uint8_t dataSize);
    RFIDResult readSector(uint8_t sector, String& data);
    RFIDResult writeSector(uint8_t sector, const String& data);
    
    // Authentication
    RFIDResult authenticateBlock(uint8_t blockNumber, const RFIDKey& key, bool useKeyA = true);
    bool setDefaultKeys();
    void addKey(const RFIDKey& key);
    std::vector<RFIDKey> getKeys() const { return keys; }
    
    // Data operations
    RFIDResult readAllSectors(String& data);
    RFIDResult writeText(const String& text, uint8_t startSector = 1);
    RFIDResult readText(String& text);
    RFIDResult formatCard();
    
    // Card management
    RFIDResult cloneCard(const RFIDCardInfo& sourceCard);
    RFIDResult backupCard(String& backupData);
    RFIDResult restoreCard(const String& backupData);
    
    // Access control
    RFIDResult changeKey(uint8_t sector, const RFIDKey& oldKey, const RFIDKey& newKey);
    RFIDResult setAccessBits(uint8_t sector, uint8_t accessBits[4]);
    
    // Monitoring and logging
    void startMonitoring();
    void stopMonitoring();
    bool isMonitoring() const { return monitoring; }
    std::vector<RFIDCardInfo> getDetectedCards() const { return detectedCards; }
    void clearDetectedCards();
    
    // Configuration
    void setReadTimeout(unsigned long timeout) { readTimeout = timeout; }
    void setDebugMode(bool enable) { debugMode = enable; }
    void setAutoRead(bool enable) { autoRead = enable; }
    
    // Hardware control
    void setAntennaGain(uint8_t gain);
    uint8_t getAntennaGain();
    void softReset();
    void hardReset();
    
    // Status and diagnostics
    String getStatusJSON();
    
    // Helper functions
    String getCardTypeName(RC522CardType type);
    void printCardInfo();
    void printSystemInfo();
    bool selfTest();
    
private:
    MFRC522* mfrc522;
    SPIClass* spiInterface;
    
    bool enabled;
    bool monitoring;
    bool autoRead;
    bool debugMode;
    
    uint8_t rstPin;
    uint8_t ssPin;
    uint8_t sckPin;
    uint8_t misoPin;
    uint8_t mosiPin;
    
    unsigned long readTimeout;
    unsigned long lastCardCheck;
    
    RFIDCardInfo currentCard;
    std::vector<RFIDCardInfo> detectedCards;
    std::vector<RFIDKey> keys;
    
    // Internal functions
    void initializeDefaultKeys();
    RC522CardType getCardType(MFRC522::PICC_Type piccType);
    String getCardTypeName(RC522CardType type);
    String bytesToHex(uint8_t* buffer, uint8_t bufferSize);
    void hexToBytes(const String& hex, uint8_t* buffer, uint8_t bufferSize);
    bool isValidUID(uint8_t* uid, uint8_t uidSize);
    void logOperation(const String& operation, bool success, const String& details = "");
    uint8_t calculateBlockNumber(uint8_t sector, uint8_t block);
    bool authenticateWithAvailableKeys(uint8_t blockNumber);
    void updateCardDatabase(const RFIDCardInfo& card);
    void saveCardsToStorage();
    void loadCardsFromStorage();
};

// Global RC522 interface instance
extern RC522Interface rc522Interface;

// Helper functions
String rc522CardTypeToString(RC522CardType type);
RC522CardType stringToRC522CardType(const String& str);
String rc522AccessModeToString(RC522AccessMode mode);
RC522AccessMode stringToRC522AccessMode(const String& str);

// Utility functions
String generateCardFingerprint(const RFIDCardInfo& card);
bool compareCards(const RFIDCardInfo& card1, const RFIDCardInfo& card2);
String encryptCardData(const String& data, const String& key);
String decryptCardData(const String& encryptedData, const String& key);

#endif // HAS_RC522

#endif // RC522_INTERFACE_H
