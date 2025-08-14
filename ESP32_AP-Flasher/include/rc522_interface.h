#ifndef RC522_INTERFACE_H
#define RC522_INTERFACE_H

#include <Arduino.h>
#include <ArduinoJson.h>

#include <functional>
#include <map>
#include <vector>

#if HAS_RC522

#include <MFRC522.h>
#include <SPI.h>

// Pin definitions from platformio.ini
#ifndef RC522_SS_PIN
#define RC522_SS_PIN 10
#endif

#ifndef RC522_RST_PIN
#define RC522_RST_PIN 9
#endif

#ifndef RC522_MISO_PIN
#define RC522_MISO_PIN 18
#endif

#ifndef RC522_MOSI_PIN
#define RC522_MOSI_PIN 19
#endif

#ifndef RC522_SCK_PIN
#define RC522_SCK_PIN 20
#endif

// Enhanced Card types with ESP32-C6 support
enum RC522CardType {
    CARD_TYPE_UNKNOWN = 0,
    CARD_TYPE_MIFARE_MINI,
    CARD_TYPE_MIFARE_1K,
    CARD_TYPE_MIFARE_4K,
    CARD_TYPE_MIFARE_UL,
    CARD_TYPE_MIFARE_UL_C,
    CARD_TYPE_MIFARE_PLUS,
    CARD_TYPE_MIFARE_DESFIRE,
    CARD_TYPE_TNP3XXX,
    CARD_TYPE_ISO_14443_4,
    CARD_TYPE_ISO_18092,
    CARD_TYPE_MIFARE_CLASSIC,
    CARD_TYPE_NTAG213,
    CARD_TYPE_NTAG215,
    CARD_TYPE_NTAG216,
    CARD_TYPE_CUSTOM
};

// Enhanced card access modes
enum RC522AccessMode {
    ACCESS_READ_ONLY = 0,
    ACCESS_READ_WRITE,
    ACCESS_WRITE_ONLY,
    ACCESS_ADMIN_ONLY,
    ACCESS_LOCKED
};

// Access levels for security
enum AccessLevel {
    ACCESS_NONE = 0,
    ACCESS_GUEST = 1,
    ACCESS_USER = 2,
    ACCESS_ADMIN = 3,
    ACCESS_MASTER = 4
};

// Enhanced RFID card information structure
struct RFIDCardInfo {
    String uid;
    String uidHex;
    uint8_t uidBytes[10];
    uint8_t uidSize;
    RC522CardType type;
    String typeName;
    String name;
    String description;
    uint16_t blockCount;
    uint16_t sectorCount;
    bool isPresent;

    // Timestamps and usage tracking
    unsigned long firstSeen;
    unsigned long lastSeen;
    uint32_t readCount = 0;
    uint32_t writeCount = 0;

    // Access control
    bool authorized = false;
    AccessLevel accessLevel = ACCESS_NONE;
    uint32_t accessExpiry = 0;  // Unix timestamp
    bool enabled = true;

    // Security
    bool encrypted = false;
    uint32_t lastAuthAttempt = 0;
    uint32_t failedAuthCount = 0;

    // Data storage
    String data;
    std::vector<uint8_t> rawData;
    String category = "General";
    std::map<String, String> metadata;

    // System fields
    uint32_t created = 0;
    uint32_t lastModified = 0;
    String createdBy = "System";
};

// Enhanced RFID operation result
struct RFIDResult {
    bool success;
    String message;
    String data;
    uint8_t errorCode;
    uint32_t operationTime = 0;  // milliseconds
    String errorDetails;
    int32_t bytesProcessed = 0;
};

// Enhanced access key structure
struct RFIDKey {
    uint8_t keyA[6];
    uint8_t keyB[6];
    String name;
    String description;
    bool isDefault = false;
    bool enabled = true;
    uint32_t created = 0;
    uint32_t lastUsed = 0;
    uint32_t useCount = 0;
};

// Reader statistics
struct RFIDStatistics {
    uint32_t cardsDetected = 0;
    uint32_t uniqueCards = 0;
    uint32_t readOperations = 0;
    uint32_t writeOperations = 0;
    uint32_t authenticationAttempts = 0;
    uint32_t authenticationFailures = 0;
    uint32_t readErrors = 0;
    uint32_t writeErrors = 0;
    uint32_t communicationErrors = 0;
    uint32_t lastActivity = 0;
    String lastCardUID;
    uint32_t sessionStartTime = 0;
    float averageReadTime = 0.0;
    float averageWriteTime = 0.0;
    std::map<String, uint32_t> cardTypeCount;
    std::map<String, uint32_t> accessLevelCount;
};

// Reader configuration
struct RFIDReaderConfig {
    uint8_t ssPin = RC522_SS_PIN;
    uint8_t rstPin = RC522_RST_PIN;
    uint8_t sckPin = RC522_SCK_PIN;
    uint8_t misoPin = RC522_MISO_PIN;
    uint8_t mosiPin = RC522_MOSI_PIN;
    uint32_t spiFreq = 1000000;  // 1MHz
    uint8_t antennaGain = 0x04;
    uint32_t scanInterval = 500;  // ms
    uint32_t cardTimeout = 5000;  // ms
    bool autoDetect = true;
    bool requireAuth = false;
    uint8_t maxRetries = 3;
    uint32_t retryDelay = 100;  // ms
};

class RC522Interface {
   public:
    RC522Interface();
    ~RC522Interface();

    // Initialization and Configuration
    bool begin();
    bool initialize();
    bool configure(const RFIDReaderConfig& config);
    bool configure(const JsonObject& config);
    void end();
    void shutdown();
    bool isEnabled() const { return enabled; }

    // Reader Control
    bool enableReader(bool enable = true);
    bool resetReader();
    bool testReader();
    bool calibrateReader();
    String getReaderStatus();
    String getReaderDiagnostics();

    // Enhanced Card detection
    bool isCardPresent();
    bool readCard();
    bool waitForCard(uint32_t timeoutMs = 10000);
    bool waitForCardRemoval(uint32_t timeoutMs = 10000);
    RFIDCardInfo getCardInfo() const { return currentCard; }
    RC522CardType detectCardType();
    void clearCard();

    // Enhanced Card operations
    RFIDResult readBlock(uint8_t blockNumber, uint8_t* buffer, uint8_t bufferSize);
    RFIDResult writeBlock(uint8_t blockNumber, const uint8_t* data, uint8_t dataSize);
    RFIDResult readSector(uint8_t sector, String& data);
    RFIDResult writeSector(uint8_t sector, const String& data);
    RFIDResult readAllSectors(String& data);
    RFIDResult readCardData(std::vector<uint8_t>& data);
    RFIDResult writeCardData(const std::vector<uint8_t>& data);

    // Enhanced Authentication
    RFIDResult authenticateBlock(uint8_t blockNumber, const RFIDKey& key, bool useKeyA = true);
    RFIDResult authenticateCard(const String& uid);
    bool setDefaultKeys();
    void addKey(const RFIDKey& key);
    bool removeKey(const String& keyName);
    bool updateKey(const String& keyName, const RFIDKey& key);
    std::vector<RFIDKey> getKeys() const { return keys; }
    bool authenticateWithAvailableKeys(uint8_t blockNumber);

    // Card Management
    bool addCard(const RFIDCardInfo& card);
    bool removeCard(const String& uid);
    bool updateCard(const String& uid, const RFIDCardInfo& card);
    RFIDCardInfo* getCard(const String& uid);
    std::vector<RFIDCardInfo> getAllCards();
    std::vector<RFIDCardInfo> getAuthorizedCards();
    std::vector<RFIDCardInfo> getCardsByType(RC522CardType type);
    std::vector<String> getCardUIDs();
    uint32_t getCardCount();

    // Access Control
    bool isCardAuthorized(const String& uid);
    bool authorizeCard(const String& uid, AccessLevel level = ACCESS_USER);
    bool revokeCard(const String& uid);
    bool setCardAccessLevel(const String& uid, AccessLevel level);
    AccessLevel getCardAccessLevel(const String& uid);
    bool setCardExpiry(const String& uid, uint32_t expiryTimestamp);
    bool isCardExpired(const String& uid);
    bool enableCard(const String& uid, bool enable = true);

    // Enhanced Data operations
    RFIDResult writeText(const String& text, uint8_t startSector = 1);
    RFIDResult readText(String& text);
    RFIDResult formatCard();
    RFIDResult eraseCard();
    RFIDResult writeCustomData(const String& uid, const std::vector<uint8_t>& data);
    RFIDResult readCustomData(const String& uid, std::vector<uint8_t>& data);

    // Advanced Card operations
    RFIDResult cloneCard(const RFIDCardInfo& sourceCard);
    RFIDResult backupCard(String& backupData);
    RFIDResult restoreCard(const String& backupData);
    RFIDResult exportCard(const String& uid, String& jsonData);
    RFIDResult importCard(const String& jsonData);

    // Security Features
    RFIDResult changeKey(uint8_t sector, const RFIDKey& oldKey, const RFIDKey& newKey);
    RFIDResult setAccessBits(uint8_t sector, uint8_t accessBits[4]);
    bool encryptCardData(const String& uid, const String& password);
    bool decryptCardData(const String& uid, const String& password);
    uint32_t getFailedAuthCount(const String& uid);
    bool resetFailedAuthCount(const String& uid);

    // Enhanced Monitoring and logging
    void startMonitoring();
    void stopMonitoring();
    bool isMonitoring() const { return monitoring; }
    std::vector<RFIDCardInfo> getDetectedCards() const { return detectedCards; }
    void clearDetectedCards();
    void enableAutoDetect(bool enable = true) { config.autoDetect = enable; }

    // Bulk Operations
    bool authorizeMultipleCards(const std::vector<String>& uids, AccessLevel level);
    bool revokeMultipleCards(const std::vector<String>& uids);
    bool exportMultipleCards(const std::vector<String>& uids, const String& filename);
    bool importMultipleCards(const String& filename);
    uint32_t cleanupExpiredCards();

    // Statistics and Monitoring
    RFIDStatistics getStatistics() const { return statistics; }
    String getStatisticsJson();
    void resetStatistics();
    String getUsageReport();
    std::vector<String> getMostUsedCards(uint8_t count = 10);
    float getReadSuccessRate();
    float getWriteSuccessRate();
    float getAuthSuccessRate();

    // Enhanced Configuration
    void setReadTimeout(unsigned long timeout) { readTimeout = timeout; }
    void setDebugMode(bool enable) { debugMode = enable; }
    void setAutoRead(bool enable) { autoRead = enable; }
    void setScanInterval(uint32_t intervalMs) { config.scanInterval = intervalMs; }
    void setMaxRetries(uint8_t retries) { config.maxRetries = retries; }
    void setRetryDelay(uint32_t delayMs) { config.retryDelay = delayMs; }

    // Hardware control
    void setAntennaGain(uint8_t gain);
    uint8_t getAntennaGain();
    void softReset();
    void hardReset();
    bool setSPIFrequency(uint32_t frequency);
    uint32_t getSPIFrequency();

    // Configuration Management
    bool saveConfiguration(const String& filename = "/rfid_config.json");
    bool loadConfiguration(const String& filename = "/rfid_config.json");
    String exportConfiguration();
    bool importConfiguration(const String& jsonConfig);

    // Card Database Management
    bool saveCards(const String& filename = "/rfid_cards.json");
    bool loadCards(const String& filename = "/rfid_cards.json");
    String exportCards();
    bool importCards(const String& jsonData);

    // Event Callbacks
    void setCardDetectedCallback(std::function<void(const RFIDCardInfo&)> callback);
    void setCardRemovedCallback(std::function<void(const String&)> callback);
    void setAccessGrantedCallback(std::function<void(const RFIDCardInfo&)> callback);
    void setAccessDeniedCallback(std::function<void(const String&, const String&)> callback);
    void setErrorCallback(std::function<void(const String&)> callback);

    // Diagnostics and Testing
    bool performSelfTest();
    String getDiagnosticsReport();
    std::vector<String> getSystemWarnings();
    bool testCardRead(const String& uid);
    bool testCardWrite(const String& uid);
    String getHardwareInfo();

    // Status and diagnostics
    String getStatusJSON();
    String getSystemStatus();

    // Helper functions
    String getCardTypeName(RC522CardType type);
    void printCardInfo();
    void printSystemInfo();
    bool selfTest();

    // Real-time Control
    void poll();
    void handleEvents();

    // Utility Functions
    static String uidToString(const uint8_t* uid, uint8_t size);
    static void stringToUID(const String& uidString, uint8_t* uid, uint8_t& size);
    static String accessLevelToString(AccessLevel level);
    static AccessLevel stringToAccessLevel(const String& levelString);
    static bool isValidUID(const String& uid);
    static String generateCardName(const String& uid);

   private:
    MFRC522* mfrc522;
    SPIClass* spiInterface;

    bool enabled;
    bool monitoring;
    bool autoRead;
    bool debugMode;

    // Configuration
    RFIDReaderConfig config;
    unsigned long readTimeout;
    unsigned long lastCardCheck;

    // State management
    bool initialized = false;
    bool cardPresent = false;
    String currentCardUID;
    uint32_t lastScan = 0;

    // Data structures
    RFIDCardInfo currentCard;
    std::vector<RFIDCardInfo> detectedCards;
    std::vector<RFIDCardInfo> knownCards;
    std::vector<RFIDKey> keys;
    RFIDStatistics statistics;

    // Security
    bool securityEnabled = true;
    uint32_t maxFailedAttempts = 5;
    uint32_t lockoutDuration = 300000;  // 5 minutes

    // Callback functions
    std::function<void(const RFIDCardInfo&)> cardDetectedCallback = nullptr;
    std::function<void(const String&)> cardRemovedCallback = nullptr;
    std::function<void(const RFIDCardInfo&)> accessGrantedCallback = nullptr;
    std::function<void(const String&, const String&)> accessDeniedCallback = nullptr;
    std::function<void(const String&)> errorCallback = nullptr;

    // Internal functions
    void initializeDefaultKeys();
    RC522CardType getCardType(MFRC522::PICC_Type piccType);
    String getCardTypeName(RC522CardType type);
    String bytesToHex(uint8_t* buffer, uint8_t bufferSize);
    void hexToBytes(const String& hex, uint8_t* buffer, uint8_t bufferSize);
    bool isValidUID(uint8_t* uid, uint8_t uidSize);
    void logOperation(const String& operation, bool success, const String& details = "");
    uint8_t calculateBlockNumber(uint8_t sector, uint8_t block);
    void updateCardDatabase(const RFIDCardInfo& card);
    void saveCardsToStorage();
    void loadCardsFromStorage();
    RFIDCardInfo* findCard(const String& uid);
    void updateStatistics(const String& operation, bool success = true);
    void logRFIDActivity(const String& activity, const String& details = "");
    bool isCardExpired(const RFIDCardInfo& card);
    bool isCardLocked(const RFIDCardInfo& card);
    void scanForCards();
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

#endif  // HAS_RC522

#endif  // RC522_INTERFACE_H
