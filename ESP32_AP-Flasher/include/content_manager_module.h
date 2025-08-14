/**
 * @file content_manager_module.h
 * @brief Unified Content Manager Module - Framework-based Implementation
 *
 * This replaces and enhances contentmanager.h/cpp with:
 * - Framework-based module architecture using EnhancedModuleBase
 * - Unified configuration management
 * - Integrated web API and event handling
 * - Better error handling and metrics
 */

#pragma once

#include <ArduinoJson.h>
#include <HTTPClient.h>

#include <map>
#include <memory>

#include "common_framework.h"
#include "unified_config_system.h"

// ============================================================================
// Forward Declarations
// ============================================================================
struct AvailableTag;
struct TagInfo;
struct ImageDataStruct;

// ============================================================================
// Content Types and Configuration
// ============================================================================

enum class ContentType {
    NONE = 0,
    TIME,
    QR_CODE,
    RSS_FEED,
    CALENDAR,
    BIG_CALENDAR,
    WEATHER,
    NFC_LOOKUP,
    DAY_AHEAD,
    TIMESTAMP,
    TAG_CONFIG,
    CUSTOM_IMAGE,
    RAW_DATA
};

struct ContentSettings {
    ContentType type = ContentType::NONE;
    String url;
    String content;
    uint16_t updateInterval = 300;  // seconds
    bool enabled = true;
    bool autoUpdate = true;
    String timezone = "UTC";
    String language = "en";

    // Content-specific settings
    struct QRSettings {
        uint8_t errorCorrection = 0;
        bool invert = false;
        uint16_t border = 2;
    } qr;

    struct RSSSettings {
        uint8_t maxItems = 10;
        bool showDate = true;
        bool showDescription = true;
        uint16_t descriptionLength = 100;
    } rss;

    struct CalendarSettings {
        uint8_t daysAhead = 7;
        bool showTime = true;
        bool showLocation = false;
        String filterKeywords;
    } calendar;

    struct WeatherSettings {
        String location;
        String apiKey;
        bool showForecast = true;
        uint8_t forecastDays = 3;
        String units = "metric";  // metric, imperial, kelvin
    } weather;

    String toJson() const;
    bool fromJson(const String& json);
    bool validate() const;
};

struct ContentProcessResult {
    bool success = false;
    String errorMessage;
    size_t imageDataSize = 0;
    uint32_t processingTime = 0;
    String contentHash;
    bool hasUpdated = false;

    String toJson() const;
};

// ============================================================================
// Content Provider Interface
// ============================================================================

class ContentProvider {
   public:
    virtual ~ContentProvider() = default;

    virtual ContentType getType() const = 0;
    virtual String getName() const = 0;
    virtual String getDescription() const = 0;

    virtual bool initialize(const ContentSettings& settings) = 0;
    virtual ContentProcessResult processContent(const AvailableTag& tag, uint8_t* imageBuffer, size_t bufferSize) = 0;
    virtual bool isAvailable() const = 0;
    virtual String getStatus() const = 0;
    virtual String getMetrics() const = 0;

    virtual void cleanup() {}
    virtual void update() {}

   protected:
    ContentSettings _settings;
    bool _initialized = false;
    uint32_t _lastUpdate = 0;
    String _lastError;
};

// ============================================================================
// Content Manager Module
// ============================================================================

class ContentManagerModule : public EnhancedModuleBase {
   private:
    // Content providers
    std::map<ContentType, std::unique_ptr<ContentProvider>> _providers;

    // Content processing
    TaskHandle_t _contentTask = nullptr;
    QueueHandle_t _contentQueue = nullptr;
    SemaphoreHandle_t _processingMutex = nullptr;

    // State management
    bool _contentGenerationActive = false;
    bool _contentGenerationPaused = false;
    uint32_t _totalProcessedTags = 0;
    uint32_t _successfulUpdates = 0;
    uint32_t _failedUpdates = 0;
    uint32_t _lastProcessingTime = 0;

    // Configuration
    struct ModuleConfig {
        bool enableContentGeneration = true;
        uint16_t defaultUpdateInterval = 300;
        uint16_t maxConcurrentUpdates = 3;
        uint32_t processingTimeout = 30000;
        bool enableCaching = true;
        uint16_t cacheExpiryTime = 1800;  // 30 minutes
        String defaultTimezone = "UTC";
        String defaultLanguage = "en";
        bool enableMetrics = true;
        uint16_t metricsInterval = 60;  // seconds

        String toJson() const;
        bool fromJson(const String& json);
        bool validate() const;
    } _config;

    // Content queue entry
    struct ContentQueueEntry {
        String tagMac;
        ContentSettings settings;
        uint32_t requestTime;
        uint32_t priority;
    };

    // Cache management
    struct CacheEntry {
        String contentHash;
        uint32_t lastUpdate;
        uint32_t size;
        std::unique_ptr<uint8_t[]> data;
    };
    std::map<String, CacheEntry> _contentCache;

    // Metrics
    struct Metrics {
        uint32_t totalRequests = 0;
        uint32_t successfulRequests = 0;
        uint32_t failedRequests = 0;
        uint32_t cacheHits = 0;
        uint32_t cacheMisses = 0;
        uint32_t averageProcessingTime = 0;
        uint32_t totalProcessingTime = 0;
        uint32_t lastResetTime = 0;

        void reset() {
            totalRequests = 0;
            successfulRequests = 0;
            failedRequests = 0;
            cacheHits = 0;
            cacheMisses = 0;
            averageProcessingTime = 0;
            totalProcessingTime = 0;
            lastResetTime = millis();
        }

        String toJson() const;
    } _metrics;

   public:
    ContentManagerModule();
    virtual ~ContentManagerModule();

    // ========================================================================
    // Module Interface Implementation
    // ========================================================================

    bool doInitialize() override;
    bool doStart() override;
    bool doStop() override;
    void doUpdate() override;
    void doHandleEvent(const String& event, const String& data) override;

    // ========================================================================
    // Content Management API
    // ========================================================================

    /**
     * Start content generation for all tags
     */
    bool startContentGeneration();

    /**
     * Stop content generation
     */
    bool stopContentGeneration();

    /**
     * Pause/resume content generation
     */
    bool pauseContentGeneration();
    bool resumeContentGeneration();

    /**
     * Process content for a specific tag
     */
    ContentProcessResult processTagContent(const String& tagMac, const ContentSettings& settings);

    /**
     * Process content for all tags
     */
    bool processAllTagContent();

    /**
     * Queue tag for content processing
     */
    bool queueTagForProcessing(const String& tagMac, const ContentSettings& settings, uint32_t priority = 0);

    /**
     * Get content processing status
     */
    String getProcessingStatus() const;

    /**
     * Get content generation statistics
     */
    String getContentStats() const;

    // ========================================================================
    // Content Provider Management
    // ========================================================================

    /**
     * Register a content provider
     */
    bool registerContentProvider(std::unique_ptr<ContentProvider> provider);

    /**
     * Unregister content provider
     */
    bool unregisterContentProvider(ContentType type);

    /**
     * Get available content types
     */
    std::vector<ContentType> getAvailableContentTypes() const;

    /**
     * Get content provider
     */
    ContentProvider* getContentProvider(ContentType type) const;

    /**
     * Get content provider status
     */
    String getProviderStatus(ContentType type) const;

    // ========================================================================
    // Configuration Management
    // ========================================================================

    /**
     * Get/Set module configuration
     */
    const ModuleConfig& getModuleConfig() const { return _config; }
    bool setModuleConfig(const ModuleConfig& config);

    /**
     * Load/Save configuration
     */
    bool loadConfiguration() override;
    bool saveConfiguration() override;

    // ========================================================================
    // Cache Management
    // ========================================================================

    /**
     * Clear content cache
     */
    void clearContentCache();

    /**
     * Get cache statistics
     */
    String getCacheStats() const;

    /**
     * Set cache entry
     */
    bool setCacheEntry(const String& key, const uint8_t* data, size_t size, const String& hash);

    /**
     * Get cache entry
     */
    bool getCacheEntry(const String& key, uint8_t* data, size_t& size, String& hash) const;

    // ========================================================================
    // Utility Methods
    // ========================================================================

    /**
     * Get content type from string
     */
    static ContentType contentTypeFromString(const String& type);

    /**
     * Get string from content type
     */
    static String contentTypeToString(ContentType type);

    /**
     * Generate content hash
     */
    static String generateContentHash(const ContentSettings& settings, const String& additionalData = "");

    /**
     * Validate content settings
     */
    static bool validateContentSettings(const ContentSettings& settings);

    // ========================================================================
    // Web API Registration
    // ========================================================================

    void registerWebHandlers(AsyncWebServer* server) override;

   private:
    // Internal methods
    void initializeContentProviders();
    void cleanupContentProviders();
    void createConfigurationSchema();

    // Content processing
    static void contentProcessingTask(void* parameter);
    void processContentQueue();
    ContentProcessResult processContentInternal(const String& tagMac, const ContentSettings& settings);

    // Cache management
    void cleanupExpiredCache();
    String getCacheKey(const String& tagMac, const ContentSettings& settings) const;

    // Metrics and monitoring
    void updateMetrics(const ContentProcessResult& result);
    void resetMetrics();

    // Web handlers
    void handleGetContentStatus(AsyncWebServerRequest* request);
    void handleStartContentGeneration(AsyncWebServerRequest* request);
    void handleStopContentGeneration(AsyncWebServerRequest* request);
    void handlePauseContentGeneration(AsyncWebServerRequest* request);
    void handleResumeContentGeneration(AsyncWebServerRequest* request);
    void handleProcessTagContent(AsyncWebServerRequest* request);
    void handleGetContentProviders(AsyncWebServerRequest* request);
    void handleGetContentStats(AsyncWebServerRequest* request);
    void handleGetCacheStats(AsyncWebServerRequest* request);
    void handleClearCache(AsyncWebServerRequest* request);
    void handleGetContentTypes(AsyncWebServerRequest* request);
    void handleValidateContentSettings(AsyncWebServerRequest* request);
};

// ============================================================================
// Pre-built Content Providers
// ============================================================================

/**
 * Time/Clock content provider
 */
class TimeContentProvider : public ContentProvider {
   public:
    ContentType getType() const override { return ContentType::TIME; }
    String getName() const override { return "Time Display"; }
    String getDescription() const override { return "Displays current time and date"; }

    bool initialize(const ContentSettings& settings) override;
    ContentProcessResult processContent(const AvailableTag& tag, uint8_t* imageBuffer, size_t bufferSize) override;
    bool isAvailable() const override { return true; }
    String getStatus() const override;
    String getMetrics() const override;

   private:
    uint32_t _processCount = 0;
    uint32_t _totalTime = 0;
};

/**
 * QR Code content provider
 */
class QRCodeContentProvider : public ContentProvider {
   public:
    ContentType getType() const override { return ContentType::QR_CODE; }
    String getName() const override { return "QR Code Generator"; }
    String getDescription() const override { return "Generates QR codes from text or URLs"; }

    bool initialize(const ContentSettings& settings) override;
    ContentProcessResult processContent(const AvailableTag& tag, uint8_t* imageBuffer, size_t bufferSize) override;
    bool isAvailable() const override;
    String getStatus() const override;
    String getMetrics() const override;

   private:
    bool _qrLibraryAvailable = false;
    uint32_t _processCount = 0;
    uint32_t _totalTime = 0;
};

/**
 * RSS Feed content provider
 */
class RSSContentProvider : public ContentProvider {
   public:
    ContentType getType() const override { return ContentType::RSS_FEED; }
    String getName() const override { return "RSS Feed Reader"; }
    String getDescription() const override { return "Displays RSS feed content"; }

    bool initialize(const ContentSettings& settings) override;
    ContentProcessResult processContent(const AvailableTag& tag, uint8_t* imageBuffer, size_t bufferSize) override;
    bool isAvailable() const override;
    String getStatus() const override;
    String getMetrics() const override;

   private:
    bool _networkAvailable = false;
    String _lastFeedHash;
    uint32_t _lastFetchTime = 0;
    uint32_t _processCount = 0;
    uint32_t _totalTime = 0;

    String fetchRSSFeed(const String& url);
    bool parseRSSContent(const String& xml, JsonArray& items);
};

/**
 * Tag configuration content provider
 */
class TagConfigContentProvider : public ContentProvider {
   public:
    ContentType getType() const override { return ContentType::TAG_CONFIG; }
    String getName() const override { return "Tag Configuration"; }
    String getDescription() const override { return "Displays tag configuration and status"; }

    bool initialize(const ContentSettings& settings) override;
    ContentProcessResult processContent(const AvailableTag& tag, uint8_t* imageBuffer, size_t bufferSize) override;
    bool isAvailable() const override { return true; }
    String getStatus() const override;
    String getMetrics() const override;

   private:
    uint32_t _processCount = 0;
    uint32_t _totalTime = 0;
};

// ============================================================================
// Content Provider Factory
// ============================================================================

class ContentProviderFactory {
   public:
    /**
     * Create content provider by type
     */
    static std::unique_ptr<ContentProvider> createProvider(ContentType type);

    /**
     * Create all available providers
     */
    static std::vector<std::unique_ptr<ContentProvider>> createAllProviders();

    /**
     * Get provider capabilities
     */
    static bool isProviderAvailable(ContentType type);
    static String getProviderRequirements(ContentType type);
};

// ============================================================================
// Global Instance and Macros
// ============================================================================

// Global access to content manager
extern ContentManagerModule& contentManager;

// Convenience macros
#define CONTENT_MANAGER ContentManagerModule::getInstance()
#define QUEUE_TAG_CONTENT(mac, settings) CONTENT_MANAGER.queueTagForProcessing(mac, settings)
#define PROCESS_TAG_CONTENT(mac, settings) CONTENT_MANAGER.processTagContent(mac, settings)

// Content type conversion helpers
#define CONTENT_TYPE_FROM_STRING(str) ContentManagerModule::contentTypeFromString(str)
#define CONTENT_TYPE_TO_STRING(type) ContentManagerModule::contentTypeToString(type)

/**
 * Usage Examples:
 *
 * 1. Register the module:
 *    ModuleManager::getInstance().registerModule(
 *        std::make_unique<ContentManagerModule>(), true, {"WiFiUnified"});
 *
 * 2. Process tag content:
 *    ContentSettings settings;
 *    settings.type = ContentType::TIME;
 *    settings.updateInterval = 60;
 *    auto result = PROCESS_TAG_CONTENT("AA:BB:CC:DD:EE:FF", settings);
 *
 * 3. Queue multiple tags:
 *    for (const auto& tag : tags) {
 *        QUEUE_TAG_CONTENT(tag.mac, tag.contentSettings);
 *    }
 *
 * 4. Custom content provider:
 *    auto provider = std::make_unique<MyCustomProvider>();
 *    CONTENT_MANAGER.registerContentProvider(std::move(provider));
 *
 * 5. Get statistics:
 *    String stats = CONTENT_MANAGER.getContentStats();
 *    String status = CONTENT_MANAGER.getProcessingStatus();
 */
