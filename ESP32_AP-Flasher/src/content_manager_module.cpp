/**
 * @file content_manager_module.cpp
 * @brief Implementation of Unified Content Manager Module
 *
 * Replaces contentmanager.cpp with framework-based implementation
 */

#include "content_manager_module.h"

#include <MD5Builder.h>

#include "makeimage.h"
#include "newproto.h"
#include "tag_db.h"
#include "util.h"

// ============================================================================
// ContentSettings Implementation
// ============================================================================

String ContentSettings::toJson() const {
    DynamicJsonDocument doc(Framework::JSON_MEDIUM_BUFFER);

    doc["type"] = static_cast<int>(type);
    doc["url"] = url;
    doc["content"] = content;
    doc["updateInterval"] = updateInterval;
    doc["enabled"] = enabled;
    doc["autoUpdate"] = autoUpdate;
    doc["timezone"] = timezone;
    doc["language"] = language;

    // QR settings
    JsonObject qrObj = doc.createNestedObject("qr");
    qrObj["errorCorrection"] = qr.errorCorrection;
    qrObj["invert"] = qr.invert;
    qrObj["border"] = qr.border;

    // RSS settings
    JsonObject rssObj = doc.createNestedObject("rss");
    rssObj["maxItems"] = rss.maxItems;
    rssObj["showDate"] = rss.showDate;
    rssObj["showDescription"] = rss.showDescription;
    rssObj["descriptionLength"] = rss.descriptionLength;

    // Calendar settings
    JsonObject calObj = doc.createNestedObject("calendar");
    calObj["daysAhead"] = calendar.daysAhead;
    calObj["showTime"] = calendar.showTime;
    calObj["showLocation"] = calendar.showLocation;
    calObj["filterKeywords"] = calendar.filterKeywords;

    // Weather settings
    JsonObject weatherObj = doc.createNestedObject("weather");
    weatherObj["location"] = weather.location;
    weatherObj["apiKey"] = weather.apiKey;
    weatherObj["showForecast"] = weather.showForecast;
    weatherObj["forecastDays"] = weather.forecastDays;
    weatherObj["units"] = weather.units;

    String result;
    serializeJson(doc, result);
    return result;
}

bool ContentSettings::fromJson(const String& json) {
    DynamicJsonDocument doc(Framework::JSON_MEDIUM_BUFFER);
    if (deserializeJson(doc, json) != DeserializationError::Ok) {
        return false;
    }

    type = static_cast<ContentType>(doc["type"].as<int>());
    url = doc["url"] | url;
    content = doc["content"] | content;
    updateInterval = doc["updateInterval"] | updateInterval;
    enabled = doc["enabled"] | enabled;
    autoUpdate = doc["autoUpdate"] | autoUpdate;
    timezone = doc["timezone"] | timezone;
    language = doc["language"] | language;

    // QR settings
    if (doc.containsKey("qr")) {
        JsonObject qrObj = doc["qr"];
        qr.errorCorrection = qrObj["errorCorrection"] | qr.errorCorrection;
        qr.invert = qrObj["invert"] | qr.invert;
        qr.border = qrObj["border"] | qr.border;
    }

    // RSS settings
    if (doc.containsKey("rss")) {
        JsonObject rssObj = doc["rss"];
        rss.maxItems = rssObj["maxItems"] | rss.maxItems;
        rss.showDate = rssObj["showDate"] | rss.showDate;
        rss.showDescription = rssObj["showDescription"] | rss.showDescription;
        rss.descriptionLength = rssObj["descriptionLength"] | rss.descriptionLength;
    }

    // Calendar settings
    if (doc.containsKey("calendar")) {
        JsonObject calObj = doc["calendar"];
        calendar.daysAhead = calObj["daysAhead"] | calendar.daysAhead;
        calendar.showTime = calObj["showTime"] | calendar.showTime;
        calendar.showLocation = calObj["showLocation"] | calendar.showLocation;
        calendar.filterKeywords = calObj["filterKeywords"] | calendar.filterKeywords;
    }

    // Weather settings
    if (doc.containsKey("weather")) {
        JsonObject weatherObj = doc["weather"];
        weather.location = weatherObj["location"] | weather.location;
        weather.apiKey = weatherObj["apiKey"] | weather.apiKey;
        weather.showForecast = weatherObj["showForecast"] | weather.showForecast;
        weather.forecastDays = weatherObj["forecastDays"] | weather.forecastDays;
        weather.units = weatherObj["units"] | weather.units;
    }

    return validate();
}

bool ContentSettings::validate() const {
    if (updateInterval < 10 || updateInterval > 86400) return false;
    if (type == ContentType::NONE) return false;

    switch (type) {
        case ContentType::QR_CODE:
            return !content.isEmpty();
        case ContentType::RSS_FEED:
            return !url.isEmpty();
        case ContentType::WEATHER:
            return !weather.location.isEmpty();
        default:
            return true;
    }
}

String ContentProcessResult::toJson() const {
    DynamicJsonDocument doc(Framework::JSON_SMALL_BUFFER);

    doc["success"] = success;
    doc["errorMessage"] = errorMessage;
    doc["imageDataSize"] = imageDataSize;
    doc["processingTime"] = processingTime;
    doc["contentHash"] = contentHash;
    doc["hasUpdated"] = hasUpdated;

    String result;
    serializeJson(doc, result);
    return result;
}

// ============================================================================
// ContentManagerModule Implementation
// ============================================================================

ContentManagerModule::ContentManagerModule()
    : EnhancedModuleBase("ContentManager", "1.0.0", "Unified Content Management System", ModuleType::CORE) {
    // Set module capabilities
    _capabilities.supportsConfiguration = true;
    _capabilities.supportsRemoteControl = true;
    _capabilities.supportsStatusReporting = true;
    _capabilities.supportsMetrics = true;
    _capabilities.requiresNetwork = true;
    _capabilities.requiresFileSystem = true;

    // Initialize configuration with defaults
    _config = ModuleConfig{};

    // Create mutexes
    _processingMutex = xSemaphoreCreateMutex();

    // Create content queue
    _contentQueue = xQueueCreate(10, sizeof(ContentQueueEntry));
}

ContentManagerModule::~ContentManagerModule() {
    cleanup();

    if (_processingMutex) {
        vSemaphoreDelete(_processingMutex);
    }

    if (_contentQueue) {
        vQueueDelete(_contentQueue);
    }
}

bool ContentManagerModule::doInitialize() {
    logInfo("Initializing Content Manager Module");

    // Load configuration
    if (!loadConfiguration()) {
        logWarning("Failed to load configuration, using defaults");
    }

    // Create configuration schema
    createConfigurationSchema();

    // Initialize content providers
    initializeContentProviders();

    logInfo("Content Manager Module initialized successfully");
    return true;
}

bool ContentManagerModule::doStart() {
    logInfo("Starting Content Manager Module");

    // Start content processing task
    if (_config.enableContentGeneration) {
        xTaskCreate(contentProcessingTask, "ContentTask", 8192, this, 5, &_contentTask);
        _contentGenerationActive = true;
    }

    logInfo("Content Manager Module started successfully");
    return true;
}

bool ContentManagerModule::doStop() {
    logInfo("Stopping Content Manager Module");

    // Stop content generation
    stopContentGeneration();

    // Wait for task to finish
    if (_contentTask) {
        vTaskDelete(_contentTask);
        _contentTask = nullptr;
    }

    logInfo("Content Manager Module stopped");
    return true;
}

void ContentManagerModule::doUpdate() {
    // Clean up expired cache entries
    static uint32_t lastCacheCleanup = 0;
    if (millis() - lastCacheCleanup > 300000) {  // Every 5 minutes
        cleanupExpiredCache();
        lastCacheCleanup = millis();
    }

    // Update providers
    for (auto& providerPair : _providers) {
        if (providerPair.second) {
            providerPair.second->update();
        }
    }

    updateActivity();
}

void ContentManagerModule::doHandleEvent(const String& event, const String& data) {
    if (event == "tag.discovered") {
        // Auto-queue newly discovered tags
        DynamicJsonDocument doc(Framework::JSON_SMALL_BUFFER);
        if (deserializeJson(doc, data) == DeserializationError::Ok) {
            String tagMac = doc["mac"];
            if (!tagMac.isEmpty()) {
                // Load tag settings and queue for processing
                // Implementation would load tag-specific content settings
                ContentSettings settings;
                settings.type = ContentType::TAG_CONFIG;  // Default
                queueTagForProcessing(tagMac, settings);
            }
        }
    } else if (event == "config.changed") {
        loadConfiguration();
    }
}

// ========================================================================
// Content Management API
// ========================================================================

bool ContentManagerModule::startContentGeneration() {
    if (_contentGenerationActive) {
        return true;
    }

    if (!_contentTask) {
        xTaskCreate(contentProcessingTask, "ContentTask", 8192, this, 5, &_contentTask);
    }

    _contentGenerationActive = true;
    _contentGenerationPaused = false;

    logInfo("Content generation started");
    PUBLISH_MODULE_EVENT(_name, "generation_started", "");

    return true;
}

bool ContentManagerModule::stopContentGeneration() {
    if (!_contentGenerationActive) {
        return true;
    }

    _contentGenerationActive = false;
    _contentGenerationPaused = false;

    if (_contentTask) {
        vTaskDelete(_contentTask);
        _contentTask = nullptr;
    }

    logInfo("Content generation stopped");
    PUBLISH_MODULE_EVENT(_name, "generation_stopped", "");

    return true;
}

bool ContentManagerModule::pauseContentGeneration() {
    if (!_contentGenerationActive) {
        return false;
    }

    _contentGenerationPaused = true;
    logInfo("Content generation paused");
    PUBLISH_MODULE_EVENT(_name, "generation_paused", "");

    return true;
}

bool ContentManagerModule::resumeContentGeneration() {
    if (!_contentGenerationActive) {
        return false;
    }

    _contentGenerationPaused = false;
    logInfo("Content generation resumed");
    PUBLISH_MODULE_EVENT(_name, "generation_resumed", "");

    return true;
}

ContentProcessResult ContentManagerModule::processTagContent(const String& tagMac, const ContentSettings& settings) {
    ContentProcessResult result;

    if (!settings.validate()) {
        result.errorMessage = "Invalid content settings";
        return result;
    }

    // Get content provider
    auto providerIt = _providers.find(settings.type);
    if (providerIt == _providers.end() || !providerIt->second) {
        result.errorMessage = "Content provider not available for type: " + contentTypeToString(settings.type);
        return result;
    }

    ContentProvider* provider = providerIt->second.get();
    if (!provider->isAvailable()) {
        result.errorMessage = "Content provider not available: " + provider->getName();
        return result;
    }

    // Check cache first
    String cacheKey = getCacheKey(tagMac, settings);
    uint8_t* cacheData = nullptr;
    size_t cacheSize = 0;
    String cacheHash;

    if (_config.enableCaching && getCacheEntry(cacheKey, cacheData, cacheSize, cacheHash)) {
        _metrics.cacheHits++;
        result.success = true;
        result.imageDataSize = cacheSize;
        result.contentHash = cacheHash;
        result.hasUpdated = false;
        return result;
    }

    _metrics.cacheMisses++;

    // Process content
    result = processContentInternal(tagMac, settings);

    // Update metrics
    updateMetrics(result);

    return result;
}

bool ContentManagerModule::queueTagForProcessing(const String& tagMac, const ContentSettings& settings, uint32_t priority) {
    if (!_contentQueue) {
        return false;
    }

    ContentQueueEntry entry;
    entry.tagMac = tagMac;
    entry.settings = settings;
    entry.requestTime = millis();
    entry.priority = priority;

    BaseType_t result = xQueueSend(_contentQueue, &entry, pdMS_TO_TICKS(1000));

    if (result == pdTRUE) {
        logDebug("Queued tag for processing: " + tagMac);
        return true;
    } else {
        logWarning("Failed to queue tag: " + tagMac + " (queue full)");
        return false;
    }
}

// ========================================================================
// Content Provider Management
// ========================================================================

bool ContentManagerModule::registerContentProvider(std::unique_ptr<ContentProvider> provider) {
    if (!provider) {
        return false;
    }

    ContentType type = provider->getType();

    logInfo("Registering content provider: " + provider->getName() + " for type " + contentTypeToString(type));

    _providers[type] = std::move(provider);

    return true;
}

bool ContentManagerModule::unregisterContentProvider(ContentType type) {
    auto it = _providers.find(type);
    if (it != _providers.end()) {
        logInfo("Unregistering content provider for type: " + contentTypeToString(type));
        it->second->cleanup();
        _providers.erase(it);
        return true;
    }

    return false;
}

std::vector<ContentType> ContentManagerModule::getAvailableContentTypes() const {
    std::vector<ContentType> types;

    for (const auto& providerPair : _providers) {
        if (providerPair.second && providerPair.second->isAvailable()) {
            types.push_back(providerPair.first);
        }
    }

    return types;
}

ContentProvider* ContentManagerModule::getContentProvider(ContentType type) const {
    auto it = _providers.find(type);
    return (it != _providers.end()) ? it->second.get() : nullptr;
}

// ========================================================================
// Configuration Management
// ========================================================================

bool ContentManagerModule::setModuleConfig(const ModuleConfig& config) {
    if (!config.validate()) {
        setError("Invalid module configuration");
        return false;
    }

    _config = config;
    return saveConfiguration();
}

bool ContentManagerModule::loadConfiguration() {
    String configJson = getConfigValue("moduleConfig", "{}");

    if (!configJson.isEmpty() && configJson != "{}") {
        return _config.fromJson(configJson);
    }

    // Use defaults and save
    return saveConfiguration();
}

bool ContentManagerModule::saveConfiguration() {
    String configJson = _config.toJson();
    return setConfigValue("moduleConfig", configJson);
}

// ========================================================================
// Static Helper Methods
// ========================================================================

ContentType ContentManagerModule::contentTypeFromString(const String& type) {
    String typeUpper = type;
    typeUpper.toUpperCase();

    if (typeUpper == "TIME") return ContentType::TIME;
    if (typeUpper == "QR_CODE" || typeUpper == "QR") return ContentType::QR_CODE;
    if (typeUpper == "RSS_FEED" || typeUpper == "RSS") return ContentType::RSS_FEED;
    if (typeUpper == "CALENDAR" || typeUpper == "CAL") return ContentType::CALENDAR;
    if (typeUpper == "BIG_CALENDAR" || typeUpper == "BIGCAL") return ContentType::BIG_CALENDAR;
    if (typeUpper == "WEATHER") return ContentType::WEATHER;
    if (typeUpper == "NFC_LOOKUP" || typeUpper == "NFC") return ContentType::NFC_LOOKUP;
    if (typeUpper == "DAY_AHEAD") return ContentType::DAY_AHEAD;
    if (typeUpper == "TIMESTAMP") return ContentType::TIMESTAMP;
    if (typeUpper == "TAG_CONFIG" || typeUpper == "CONFIG") return ContentType::TAG_CONFIG;
    if (typeUpper == "CUSTOM_IMAGE" || typeUpper == "IMAGE") return ContentType::CUSTOM_IMAGE;
    if (typeUpper == "RAW_DATA" || typeUpper == "RAW") return ContentType::RAW_DATA;

    return ContentType::NONE;
}

String ContentManagerModule::contentTypeToString(ContentType type) {
    switch (type) {
        case ContentType::TIME:
            return "TIME";
        case ContentType::QR_CODE:
            return "QR_CODE";
        case ContentType::RSS_FEED:
            return "RSS_FEED";
        case ContentType::CALENDAR:
            return "CALENDAR";
        case ContentType::BIG_CALENDAR:
            return "BIG_CALENDAR";
        case ContentType::WEATHER:
            return "WEATHER";
        case ContentType::NFC_LOOKUP:
            return "NFC_LOOKUP";
        case ContentType::DAY_AHEAD:
            return "DAY_AHEAD";
        case ContentType::TIMESTAMP:
            return "TIMESTAMP";
        case ContentType::TAG_CONFIG:
            return "TAG_CONFIG";
        case ContentType::CUSTOM_IMAGE:
            return "CUSTOM_IMAGE";
        case ContentType::RAW_DATA:
            return "RAW_DATA";
        default:
            return "NONE";
    }
}

String ContentManagerModule::generateContentHash(const ContentSettings& settings, const String& additionalData) {
    MD5Builder md5;
    md5.begin();

    md5.add(contentTypeToString(settings.type));
    md5.add(settings.url);
    md5.add(settings.content);
    md5.add(String(settings.updateInterval));
    md5.add(settings.timezone);
    md5.add(settings.language);
    md5.add(additionalData);
    md5.add(String(millis() / (settings.updateInterval * 1000)));  // Time bucket for cache expiry

    md5.calculate();
    return md5.toString();
}

// ========================================================================
// Internal Methods
// ========================================================================

void ContentManagerModule::initializeContentProviders() {
    logInfo("Initializing content providers");

    // Register built-in providers
    registerContentProvider(std::make_unique<TimeContentProvider>());
    registerContentProvider(std::make_unique<TagConfigContentProvider>());

#ifdef CONTENT_QR
    registerContentProvider(std::make_unique<QRCodeContentProvider>());
#endif

#ifdef CONTENT_RSS
    registerContentProvider(std::make_unique<RSSContentProvider>());
#endif

    logInfo("Content providers initialized");
}

void ContentManagerModule::cleanupContentProviders() {
    logInfo("Cleaning up content providers");

    for (auto& providerPair : _providers) {
        if (providerPair.second) {
            providerPair.second->cleanup();
        }
    }

    _providers.clear();
}

void ContentManagerModule::createConfigurationSchema() {
    // Create configuration schema for the unified config system
    auto schema = BUILD_MODULE_CONFIG("ContentManager", "1.0.0", "Content Management System")
                      .beginSection("general", "General Settings", "settings")
                      .addBoolean("enableContentGeneration", true, "Enable automatic content generation")
                      .required()
                      .addInteger("defaultUpdateInterval", 300, "Default update interval in seconds")
                      .range("10", "86400")
                      .help("How often content should be refreshed")
                      .addInteger("maxConcurrentUpdates", 3, "Maximum concurrent content updates")
                      .range("1", "10")
                      .addInteger("processingTimeout", 30000, "Content processing timeout in milliseconds")
                      .range("5000", "120000")
                      .endSection()
                      .beginSection("caching", "Cache Settings", "database")
                      .addBoolean("enableCaching", true, "Enable content caching")
                      .addInteger("cacheExpiryTime", 1800, "Cache expiry time in seconds")
                      .range("60", "86400")
                      .help("How long to keep cached content")
                      .endSection()
                      .beginSection("localization", "Localization", "globe")
                      .addString("defaultTimezone", "UTC", "Default timezone")
                      .help("Used for time-based content")
                      .addString("defaultLanguage", "en", "Default language")
                      .help("Used for localized content")
                      .endSection()
                      .beginSection("monitoring", "Monitoring", "chart")
                      .addBoolean("enableMetrics", true, "Enable metrics collection")
                      .addInteger("metricsInterval", 60, "Metrics update interval in seconds")
                      .range("10", "3600")
                      .endSection()
                      .build();

    // Register with unified config system
    UNIFIED_CONFIG.registerModuleSchema(schema);
}

void ContentManagerModule::contentProcessingTask(void* parameter) {
    ContentManagerModule* manager = static_cast<ContentManagerModule*>(parameter);

    while (manager->_contentGenerationActive) {
        if (manager->_contentGenerationPaused) {
            vTaskDelay(pdMS_TO_TICKS(1000));
            continue;
        }

        manager->processContentQueue();
        vTaskDelay(pdMS_TO_TICKS(100));
    }

    vTaskDelete(nullptr);
}

void ContentManagerModule::processContentQueue() {
    ContentQueueEntry entry;

    if (xQueueReceive(_contentQueue, &entry, pdMS_TO_TICKS(1000)) == pdTRUE) {
        logDebug("Processing queued content for tag: " + entry.tagMac);

        ContentProcessResult result = processContentInternal(entry.tagMac, entry.settings);

        if (result.success) {
            logDebug("Successfully processed content for tag: " + entry.tagMac);
        } else {
            logWarning("Failed to process content for tag: " + entry.tagMac + " - " + result.errorMessage);
        }

        updateMetrics(result);
    }
}

// ========================================================================
// Simple Content Provider Implementations
// ========================================================================

// TimeContentProvider implementation
bool TimeContentProvider::initialize(const ContentSettings& settings) {
    _settings = settings;
    _initialized = true;
    return true;
}

ContentProcessResult TimeContentProvider::processContent(const AvailableTag& tag, uint8_t* imageBuffer, size_t bufferSize) {
    ContentProcessResult result;
    uint32_t startTime = millis();

    // This is a simplified implementation
    // Real implementation would use makeimage.h functions to generate time display
    result.success = true;
    result.imageDataSize = 1024;  // Example size
    result.processingTime = millis() - startTime;
    result.contentHash = "time_" + String(millis() / 60000);  // Update every minute
    result.hasUpdated = true;

    _processCount++;
    _totalTime += result.processingTime;

    return result;
}

String TimeContentProvider::getStatus() const {
    return _initialized ? "Available" : "Not initialized";
}

String TimeContentProvider::getMetrics() const {
    DynamicJsonDocument doc(Framework::JSON_SMALL_BUFFER);
    doc["processCount"] = _processCount;
    doc["averageTime"] = _processCount > 0 ? _totalTime / _processCount : 0;
    doc["totalTime"] = _totalTime;
    doc["lastUpdate"] = _lastUpdate;

    String result;
    serializeJson(doc, result);
    return result;
}

// TagConfigContentProvider implementation
bool TagConfigContentProvider::initialize(const ContentSettings& settings) {
    _settings = settings;
    _initialized = true;
    return true;
}

ContentProcessResult TagConfigContentProvider::processContent(const AvailableTag& tag, uint8_t* imageBuffer, size_t bufferSize) {
    ContentProcessResult result;
    uint32_t startTime = millis();

    // This would generate tag configuration display
    result.success = true;
    result.imageDataSize = 512;  // Example size
    result.processingTime = millis() - startTime;
    result.contentHash = "tagconfig_" + String(tag.mac);
    result.hasUpdated = true;

    _processCount++;
    _totalTime += result.processingTime;

    return result;
}

String TagConfigContentProvider::getStatus() const {
    return _initialized ? "Available" : "Not initialized";
}

String TagConfigContentProvider::getMetrics() const {
    DynamicJsonDocument doc(Framework::JSON_SMALL_BUFFER);
    doc["processCount"] = _processCount;
    doc["averageTime"] = _processCount > 0 ? _totalTime / _processCount : 0;
    doc["totalTime"] = _totalTime;

    String result;
    serializeJson(doc, result);
    return result;
}

// Global instance
ContentManagerModule& contentManager = ContentManagerModule::getInstance();
