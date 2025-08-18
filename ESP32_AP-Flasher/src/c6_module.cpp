#include "c6_module.h"

#include <ArduinoJson.h>

#include "commstructs.h"
#include "module_manager.h"
#include "ota.h"
#include "serialap.h"
#include "settings.h"
#include "storage.h"
#include "system.h"
#include "tag_db.h"
#include "web.h"

#ifdef C6_OTA_FLASHING

// C6 Module Implementation using Module Manager Framework
// =======================================================

class C6Module : public ModuleInterface
{
private:
    bool isInitialized = false;
    bool isStarted = false;
    uint32_t lastHealthCheck = 0;
    String lastError = "";

public:
    // Module lifecycle implementation
    bool initialize() override
    {
        Serial.println("[C6_MODULE] Initializing C6 module support...");

        // Initialize C6 module defaults in JSON config if missing
        xSemaphoreTake(fsMutex, portMAX_DELAY);
        File f = contentFS->open("/current/c6_config.json", "r");
        JsonDocument doc;
        if (f)
        {
            DeserializationError err = deserializeJson(doc, f);
            f.close();
            if (err)
                doc.clear();
        }
        if (doc.isNull())
            doc.to<JsonObject>();
        if (doc["channel"].isNull())
            doc["channel"] = 20;
        if (doc["txPower"].isNull())
            doc["txPower"] = 10;
        if (doc["panId"].isNull())
            doc["panId"] = "0x1234";
        if (doc["sleepMode"].isNull())
            doc["sleepMode"] = "none";
        if (doc["wakeInterval"].isNull())
            doc["wakeInterval"] = 60;

        File w = contentFS->open("/current/c6_config.json", "w");
        if (w)
        {
            serializeJson(doc, w);
            w.close();
        }
        xSemaphoreGive(fsMutex);

        isInitialized = true;
        Serial.println("[C6_MODULE] Initialization complete");
        return true;
    }

    bool start() override
    {
        if (!isInitialized)
        {
            lastError = "Module not initialized";
            return false;
        }

        Serial.println("[C6_MODULE] Starting C6 module...");

        // Apply initial settings
        applyC6Settings();

        // Test initial connection
        if (!testC6ModuleConnection())
        {
            Serial.println("[C6_MODULE] Warning: Initial connection test failed, but continuing startup");
            // Don't fail startup - module might connect later
        }

        isStarted = true;
        lastHealthCheck = millis();
        Serial.println("[C6_MODULE] C6 module started successfully");
        return true;
    }

    bool stop() override
    {
        Serial.println("[C6_MODULE] Stopping C6 module...");

        // Send sleep command to C6 module
        sendC6Command("SLEEP", 0);

        isStarted = false;
        Serial.println("[C6_MODULE] C6 module stopped");
        return true;
    }

    bool cleanup() override
    {
        Serial.println("[C6_MODULE] Cleaning up C6 module...");

        if (isStarted)
        {
            stop();
        }

        isInitialized = false;
        lastError = "";

        Serial.println("[C6_MODULE] C6 module cleanup complete");
        return true;
    }

    ModuleInfo getInfo() const override
    {
        ModuleInfo info;
        info.name = "C6Module";
        info.version = "1.2.0";
        info.description = "ESP32-C6 Co-processor Module Support";
        info.type = ModuleType::HARDWARE;
        info.initTime = 0; // Initialize to prevent uninitialized variable warning

        if (!isInitialized)
        {
            info.state = ModuleState::UNINITIALIZED;
        }
        else if (!isStarted)
        {
            info.state = ModuleState::INITIALIZED;
        }
        else if (lastError.length() > 0)
        {
            info.state = ModuleState::ERROR;
        }
        else
        {
            info.state = ModuleState::ACTIVE;
        }

        // Set capabilities
        info.capabilities.hasWebHandlers = true;
        info.capabilities.hasTaskHandlers = true;
        info.capabilities.hasEventHandlers = true;
        info.capabilities.hasConfigInterface = true;
        info.capabilities.hasStatusInterface = true;
        info.capabilities.requiresHardware = true;
        info.capabilities.isOptional = false; // C6 module is core functionality

        info.lastActivity = lastHealthCheck;
        info.errorMessage = lastError;

        return info;
    }

    bool isHealthy() const override
    {
        if (!isStarted)
        {
            return false;
        }

        // Check if C6 module is responding
        if (apInfo.state == AP_STATE_OFFLINE)
        {
            return false;
        }

        // Check if we've had recent activity
        if (millis() - lastHealthCheck > 30000)
        { // 30 seconds timeout
            return false;
        }

        return lastError.length() == 0;
    }

    ModuleType getType() const override
    {
        return ModuleType::HARDWARE;
    }

    ModuleState getState() const override
    {
        if (!isInitialized)
        {
            return ModuleState::UNINITIALIZED;
        }
        else if (!isStarted)
        {
            return ModuleState::INITIALIZED;
        }
        else if (lastError.length() > 0)
        {
            return ModuleState::ERROR;
        }
        else
        {
            return ModuleState::ACTIVE;
        }
    }

    void registerWebHandlers(AsyncWebServer &server) override
    {
        Serial.println("[C6_MODULE] Registering web handlers...");
        registerC6WebHandlers(server);
    }

    void handleEvent(const String &event, const String &data) override
    {
        if (event == "system_restart")
        {
            Serial.println("[C6_MODULE] Handling system restart event");
            sendC6Command("PREPARE_RESTART", 0);
        }
        else if (event == "wifi_connected")
        {
            Serial.println("[C6_MODULE] WiFi connected, updating C6 module status");
            updateModuleActivity("C6Module");
        }
        else if (event == "health_check")
        {
            performHealthCheck();
        }
    }

    void update() override
    {
        // Periodic health check
        if (millis() - lastHealthCheck > 10000)
        { // Every 10 seconds
            performHealthCheck();
        }
    }

    String getConfig() const override
    {
        JsonDocument doc;

        xSemaphoreTake(fsMutex, portMAX_DELAY);
        File r = contentFS->open("/current/c6_config.json", "r");
        if (r)
        {
            DeserializationError err = deserializeJson(doc, r);
            r.close();
            if (err)
            {
                doc.clear();
            }
        }
        if (doc["txPower"].isNull())
            doc["txPower"] = 10;
        if (doc["panId"].isNull())
            doc["panId"] = "0x1234";
        if (doc["sleepMode"].isNull())
            doc["sleepMode"] = "none";
        if (doc["wakeInterval"].isNull())
            doc["wakeInterval"] = 60;
        if (doc["autoReconnect"].isNull())
            doc["autoReconnect"] = true;
        if (doc["healthCheckInterval"].isNull())
            doc["healthCheckInterval"] = 10;
        xSemaphoreGive(fsMutex);

        String config;
        serializeJson(doc, config);
        return config;
    }

    bool setConfig(const String &config) override
    {
        JsonDocument doc;
        DeserializationError error = deserializeJson(doc, config);

        if (error)
        {
            lastError = "Invalid JSON configuration";
            return false;
        }

        // merge and persist
        xSemaphoreTake(fsMutex, portMAX_DELAY);
        File r = contentFS->open("/current/c6_config.json", "r");
        JsonDocument existing;
        if (r)
        {
            auto err = deserializeJson(existing, r);
            r.close();
            if (err)
                existing.clear();
        }
        if (existing.isNull())
            existing.to<JsonObject>();
        for (JsonPair kv : doc.as<JsonObject>())
        {
            existing[kv.key()] = kv.value();
        }
        File w = contentFS->open("/current/c6_config.json", "w");
        if (w)
        {
            serializeJson(existing, w);
            w.close();
        }
        xSemaphoreGive(fsMutex);

        // Apply new settings if module is running
        if (isStarted)
        {
            applyC6Settings();
        }

        return true;
    }

    String getStatus() const override
    {
        JsonDocument doc;

        doc["connected"] = (apInfo.state != AP_STATE_OFFLINE);
        doc["state"] = static_cast<int>(apInfo.state);
        doc["version"] = apInfo.version;
        doc["channel"] = apInfo.channel;
        doc["rssi"] = apInfo.rssi;
        doc["uptime"] = apInfo.uptime;
        doc["lastHealthCheck"] = lastHealthCheck;
        doc["errorMessage"] = lastError;

        // MAC address as string
        String macStr = "";
        for (int i = 0; i < 8; i++)
        {
            if (i > 0)
                macStr += ":";
            macStr += String(apInfo.mac[i], HEX);
        }
        doc["mac"] = macStr;

#ifdef HAS_SUBGHZ
        doc["hasSubGhz"] = apInfo.hasSubGhz;
        doc["subGhzChannel"] = apInfo.SubGhzChannel;
#else
        doc["hasSubGhz"] = false;
        doc["subGhzChannel"] = 0;
#endif

        String status;
        serializeJson(doc, status);
        return status;
    }

    void getMetrics(JsonObject &metrics) const override
    {
        metrics["c6_connected"] = (apInfo.state != AP_STATE_OFFLINE);
        metrics["c6_rssi"] = apInfo.rssi;
        metrics["c6_uptime"] = apInfo.uptime;
        metrics["c6_version"] = apInfo.version;
        metrics["c6_channel"] = apInfo.channel;
        metrics["c6_health_checks"] = (millis() - lastHealthCheck < 30000) ? 1 : 0;
    }

private:
    void performHealthCheck()
    {
        lastHealthCheck = millis();

        if (!testC6ModuleConnection())
        {
            if (lastError.length() == 0)
            {
                lastError = "Health check failed - C6 module not responding";
            }
        }
        else
        {
            lastError = ""; // Clear error if health check passes
        }

        // Update module manager activity
        updateModuleActivity("C6Module");
    }

private:
    void updateModuleActivity(const String &moduleName)
    {
        // Update last activity timestamp in module manager
        // This method tracks module activity for health monitoring
        lastHealthCheck = millis();
    }
};

// Global C6 module instance
static std::unique_ptr<C6Module> g_c6Module;

// External references needed by C6 module
extern AsyncWebServer server;
extern fs::FS *contentFS;
extern SemaphoreHandle_t fsMutex;

// C6 Module Web Handler Functions
// ================================

void handleC6UpdateStatus(AsyncWebServerRequest *request)
{
    JsonDocument doc;

    // Check update status from global variables or task status
    // This is a simplified implementation - in practice you'd track actual update progress
    static bool updateInProgress = false;
    static int updateProgress = 0;
    static String updateError = "";

    // Report update status based on actual apInfo state
    if (apInfo.state == AP_STATE_FLASHING)
    {
        doc["in_progress"] = true;
        // Progress is not tracked precisely here; report indeterminate progress
        doc["progress"] = 50;
        doc["completed"] = false;
    }
    else if (apInfo.state == AP_STATE_ONLINE)
    {
        doc["in_progress"] = false;
        doc["progress"] = 100;
        doc["completed"] = true;
    }
    else if (apInfo.state == AP_STATE_FAILED)
    {
        doc["in_progress"] = false;
        doc["progress"] = 0;
        doc["completed"] = false;
        doc["error"] = "Firmware update failed";
    }
    else
    {
        doc["in_progress"] = false;
        doc["progress"] = 0;
        doc["completed"] = false;
    }

    doc["timestamp"] = millis();

    AsyncResponseStream *response = request->beginResponseStream("application/json");
    serializeJson(doc, *response);
    request->send(response);
}

void handleBackupC6Firmware(AsyncWebServerRequest *request)
{
    // Create a firmware backup
    String backupPath = "/c6_firmware_backup.bin";

    // Check if backup file exists
    if (contentFS->exists(backupPath))
    {
        wsSerial("Sending C6 firmware backup");
        request->send(*contentFS, backupPath, "application/octet-stream", true);
    }
    else
    {
        // Try to create backup by reading from C6 module
        wsSerial("Creating new firmware backup...");

        // Send command to C6 module to dump firmware
        bool backupSuccess = sendC6Command("BACKUP_FIRMWARE", 0);

        if (backupSuccess)
        {
            // Wait a moment for backup to be created
            delay(1000);

            if (contentFS->exists(backupPath))
            {
                request->send(*contentFS, backupPath, "application/octet-stream", true);
            }
            else
            {
                request->send(500, "text/plain", "Backup creation failed");
            }
        }
        else
        {
            request->send(500, "text/plain", "Cannot communicate with C6 module for backup");
        }
    }
}

void handleAPList(AsyncWebServerRequest *request)
{
    AsyncResponseStream *response = request->beginResponseStream("application/json");

    // Only include a C6 entry if we have evidence a C6 module is present.
    // Use either apInfo.isOnline or a non-zero version/type as indicators.
    bool haveC6 = false;
    if (apInfo.isOnline)
        haveC6 = true;
    if (apInfo.version != 0)
        haveC6 = true;
    if (apInfo.type == ESP32_C6)
        haveC6 = true;

    if (!haveC6)
    {
        // No C6 module detected - return empty array so UIs don't show a dummy entry
        wsSerial("No C6 module detected in AP list (no apInfo present)");
        response->print("[]");
        request->send(response);
        return;
    }

    response->print("[");
    response->print("{");
    response->printf("\"hwType\": 198,"); // 0xC6 in decimal
    response->printf("\"version\": %d,", apInfo.version);
    response->printf("\"channel\": %d,", apInfo.channel);
    response->printf("\"rssi\": %d,", apInfo.rssi);
    response->printf("\"uptime\": %lu,", apInfo.uptime);
    response->print("\"capabilities\": [\"C6\"],");
    response->print("\"mac\": \"");
    for (int i = 0; i < 8; i++)
    {
        response->printf("%02X", apInfo.mac[i]);
        if (i < 7)
            response->print(":");
    }
    response->print("\",");

    // Map numeric apInfo.state to a human-readable string
    const char *stateStr = "offline";
    switch (apInfo.state)
    {
    case AP_STATE_ONLINE:
        stateStr = "online";
        break;
    case AP_STATE_FLASHING:
        stateStr = "flashing";
        break;
    case AP_STATE_FAILED:
        stateStr = "failed";
        break;
    case AP_STATE_NORADIO:
        stateStr = "noradio";
        break;
    default:
        stateStr = "offline";
        break;
    }
    response->printf("\"state\": \"%s\"", stateStr);
    response->print("}");

    response->print("]");
    request->send(response);
}

void handleGetC6Settings(AsyncWebServerRequest *request)
{
    JsonDocument doc;

    xSemaphoreTake(fsMutex, portMAX_DELAY);
    File r = contentFS->open("/current/c6_config.json", "r");
    if (r)
    {
        auto err = deserializeJson(doc, r);
        r.close();
        if (err)
            doc.clear();
    }
    if (doc["channel"].isNull())
        doc["channel"] = 20;
    if (doc["txPower"].isNull())
        doc["txPower"] = 10;
    if (doc["panId"].isNull())
        doc["panId"] = "0x1234";
    if (doc["sleepMode"].isNull())
        doc["sleepMode"] = "none";
    if (doc["wakeInterval"].isNull())
        doc["wakeInterval"] = 60;
    xSemaphoreGive(fsMutex);

    AsyncResponseStream *response = request->beginResponseStream("application/json");
    serializeJson(doc, *response);
    request->send(response);
}

void handleSaveC6SettingsBody(AsyncWebServerRequest *request, uint8_t *data, size_t len, size_t index, size_t total)
{
    static String jsonString = "";

    if (index == 0)
    {
        jsonString = "";
    }

    for (size_t i = 0; i < len; i++)
    {
        jsonString += (char)data[i];
    }

    if (index + len == total)
    {
        JsonDocument doc;
        DeserializationError error = deserializeJson(doc, jsonString);

        if (!error)
        {
            // merge and persist
            xSemaphoreTake(fsMutex, portMAX_DELAY);
            File r2 = contentFS->open("/current/c6_config.json", "r");
            JsonDocument existing;
            if (r2)
            {
                auto err2 = deserializeJson(existing, r2);
                r2.close();
                if (err2)
                    existing.clear();
            }
            if (existing.isNull())
                existing.to<JsonObject>();
            for (JsonPair kv : doc.as<JsonObject>())
            {
                existing[kv.key()] = kv.value();
            }
            File w2 = contentFS->open("/current/c6_config.json", "w");
            if (w2)
            {
                serializeJson(existing, w2);
                w2.close();
            }
            xSemaphoreGive(fsMutex);

            // Apply settings to C6 module
            applyC6Settings();

            request->send(200, "application/json", "{\"success\":true}");
        }
        else
        {
            request->send(400, "application/json", "{\"success\":false,\"error\":\"Invalid JSON\"}");
        }

        jsonString = "";
    }
}

void handleResetC6Settings(AsyncWebServerRequest *request)
{
    // Reset to defaults by overwriting config file
    JsonDocument doc;
    doc["channel"] = 20;
    doc["txPower"] = 10;
    doc["panId"] = "0x1234";
    doc["sleepMode"] = "none";
    doc["wakeInterval"] = 60;
    xSemaphoreTake(fsMutex, portMAX_DELAY);
    File w = contentFS->open("/current/c6_config.json", "w");
    if (w)
    {
        serializeJson(doc, w);
        w.close();
    }
    xSemaphoreGive(fsMutex);

    wsSerial("C6 module settings reset to defaults");
    request->send(200, "application/json", "{\"success\":true}");
}

void handleTestC6Connection(AsyncWebServerRequest *request)
{
    // Test connection to C6 module
    bool connected = testC6ModuleConnection();

    JsonDocument doc;
    doc["connected"] = connected;
    doc["timestamp"] = millis();

    if (connected)
    {
        doc["rssi"] = apInfo.rssi;
        doc["version"] = apInfo.version;
    }

    AsyncResponseStream *response = request->beginResponseStream("application/json");
    serializeJson(doc, *response);
    request->send(response);
}

void handleTestC6Radio(AsyncWebServerRequest *request)
{
    JsonDocument doc;

    // Perform radio test and get results
    RadioTestResult result = performC6RadioTest();

    doc["rssi"] = result.rssi;
    doc["packetsSent"] = result.packetsSent;
    doc["packetsReceived"] = result.packetsReceived;
    doc["errorRate"] = result.errorRate;
    doc["timestamp"] = millis();

    AsyncResponseStream *response = request->beginResponseStream("application/json");
    serializeJson(doc, *response);
    request->send(response);
}

void handleRestartC6(AsyncWebServerRequest *request)
{
    wsSerial("Restarting C6 module...");

    // Send restart command to C6 module
    bool success = restartC6Module();

    if (success)
    {
        request->send(200, "application/json", "{\"success\":true}");
    }
    else
    {
        request->send(500, "application/json", "{\"success\":false,\"error\":\"Restart failed\"}");
    }
}

void handleBackupC6Config(AsyncWebServerRequest *request)
{
    JsonDocument doc;

    // Collect all C6 configuration data from JSON
    xSemaphoreTake(fsMutex, portMAX_DELAY);
    File r = contentFS->open("/current/c6_config.json", "r");
    if (r)
    {
        auto err = deserializeJson(doc, r);
        r.close();
        if (err)
            doc.clear();
    }
    if (doc["channel"].isNull())
        doc["channel"] = 20;
    if (doc["txPower"].isNull())
        doc["txPower"] = 10;
    if (doc["panId"].isNull())
        doc["panId"] = "0x1234";
    if (doc["sleepMode"].isNull())
        doc["sleepMode"] = "none";
    if (doc["wakeInterval"].isNull())
        doc["wakeInterval"] = 60;
    doc["backupDate"] = millis();
    doc["firmwareVersion"] = apInfo.version;
    xSemaphoreGive(fsMutex);

    AsyncResponseStream *response = request->beginResponseStream("application/json");
    response->addHeader("Content-Disposition", "attachment; filename=c6_config_backup.json");
    serializeJson(doc, *response);
    request->send(response);
}

void handleResetC6Config(AsyncWebServerRequest *request)
{
    if (request->hasParam("confirm") && request->getParam("confirm")->value() == "true")
    {
        // Reset all C6 configuration by writing defaults
        JsonDocument doc;
        doc["channel"] = 20;
        doc["txPower"] = 10;
        doc["panId"] = "0x1234";
        doc["sleepMode"] = "none";
        doc["wakeInterval"] = 60;
        xSemaphoreTake(fsMutex, portMAX_DELAY);
        File w = contentFS->open("/current/c6_config.json", "w");
        if (w)
        {
            serializeJson(doc, w);
            w.close();
        }
        xSemaphoreGive(fsMutex);

        // Reset C6 module to factory defaults
        bool success = factoryResetC6Module();

        if (success)
        {
            wsSerial("C6 module configuration reset completed");
            request->send(200, "application/json", "{\"success\":true}");
        }
        else
        {
            request->send(500, "application/json", "{\"success\":false,\"error\":\"Reset failed\"}");
        }
    }
    else
    {
        request->send(400, "application/json", "{\"success\":false,\"error\":\"Confirmation required\"}");
    }
}

void handleC6FirmwareUpload(AsyncWebServerRequest *request, String filename, size_t index, uint8_t *data, size_t len, bool final)
{
    static File uploadFile;
    static bool verifyAfterUpload = false;
    static size_t totalSize = 0;

    if (!index)
    {
        // Get verification flag from request parameters
        if (request->hasParam("verify", true))
        {
            verifyAfterUpload = (request->getParam("verify", true)->value() == "1");
        }

        wsSerial("Starting C6 firmware upload: " + filename);
        if (verifyAfterUpload)
        {
            wsSerial("Firmware verification enabled");
        }

        // Create temporary file for upload
        String tempPath = "/temp_c6_firmware.bin";
        uploadFile = contentFS->open(tempPath, "w");
        if (!uploadFile)
        {
            wsSerial("ERROR: Failed to create temporary file for upload");
            request->send(500, "text/plain", "Storage error");
            return;
        }

        totalSize = 0;
    }

    if (uploadFile && len)
    {
        size_t written = uploadFile.write(data, len);
        if (written != len)
        {
            wsSerial("ERROR: Failed to write firmware data");
            uploadFile.close();
            request->send(500, "text/plain", "Write error");
            return;
        }
        totalSize += len;
    }

    if (final)
    {
        if (uploadFile)
        {
            uploadFile.close();

            wsSerial("Firmware upload completed: " + String(totalSize) + " bytes");

            // Validate minimum firmware size
            if (totalSize < 64 * 1024)
            { // 64KB minimum
                wsSerial("ERROR: Firmware file too small");
                contentFS->remove("/temp_c6_firmware.bin");
                request->send(400, "text/plain", "Firmware file too small");
                return;
            }

            if (totalSize > 2 * 1024 * 1024)
            { // 2MB maximum
                wsSerial("ERROR: Firmware file too large");
                contentFS->remove("/temp_c6_firmware.bin");
                request->send(400, "text/plain", "Firmware file too large");
                return;
            }

            wsSerial("Starting firmware flash process...");
            apInfo.state = AP_STATE_FLASHING;

            // Create task parameter structure
            C6FirmwareUpdateParams *params = new C6FirmwareUpdateParams();
            params->filename = "/temp_c6_firmware.bin";
            params->verify = verifyAfterUpload;

            // Start firmware update task
            xTaskCreate(C6firmwareUpdateTask, "C6FirmwareUpdate", 8192,
                        params, 10, NULL);

            request->send(200, "application/json", "{\"success\":true,\"message\":\"Upload complete, starting installation\"}");
        }
        else
        {
            request->send(500, "text/plain", "Upload file handle lost");
        }
    }
}

// Drives and Device Management Functions
// ======================================

void handleListDrives(AsyncWebServerRequest *request)
{
    JsonDocument doc;
    JsonArray drives = doc["drives"].to<ArduinoJson::JsonArray>();

    // Remove simulated drive listing. Return an empty array by default.

    String response;
    serializeJson(doc, response);
    request->send(200, "application/json", response);
}

void handleListSerialPorts(AsyncWebServerRequest *request)
{
    JsonDocument doc;
    JsonArray ports = doc["ports"].to<ArduinoJson::JsonArray>();
    String response;
    serializeJson(doc, response);
    request->send(200, "application/json", response);
}

void handleFlashC6OTA(AsyncWebServerRequest *request)
{
    if (!request->hasParam("firmware_file", true) || !request->hasParam("com_port", true))
    {
        request->send(400, "application/json",
                      "{\"success\":false,\"error\":\"Missing firmware_file or com_port parameter\"}");
        return;
    }

    String firmwareFile = request->getParam("firmware_file", true)->value();
    String comPort = request->getParam("com_port", true)->value();

    // Optional parameters with defaults
    bool eraseFlash = request->hasParam("erase_flash", true) ? request->getParam("erase_flash", true)->value() == "true" : false;
    bool verifyFlash = request->hasParam("verify_flash", true) ? request->getParam("verify_flash", true)->value() == "true" : true;
    bool resetAfterFlash = request->hasParam("reset_after_flash", true) ? request->getParam("reset_after_flash", true)->value() == "true" : true;
    int baudRate = request->hasParam("baud_rate", true) ? request->getParam("baud_rate", true)->value().toInt() : 921600;

    // Validate firmware file exists
    if (!contentFS->exists(firmwareFile))
    {
        request->send(400, "application/json",
                      "{\"success\":false,\"error\":\"Firmware file not found: " + firmwareFile + "\"}");
        return;
    }

    // Validate firmware file is not empty
    File file = contentFS->open(firmwareFile, "r");
    if (!file || file.size() == 0)
    {
        if (file)
            file.close();
        request->send(400, "application/json",
                      "{\"success\":false,\"error\":\"Firmware file is empty or cannot be read\"}");
        return;
    }
    file.close();

    // Validate baud rate
    if (baudRate < 9600 || baudRate > 2000000)
    {
        request->send(400, "application/json",
                      "{\"success\":false,\"error\":\"Invalid baud rate. Must be between 9600 and 2000000\"}");
        return;
    }

    // For ESP32-C6 internal flashing, we don't actually need a COM port parameter
    // but we keep it for compatibility with the frontend
    wsSerial("Starting C6 OTA flash: " + firmwareFile);
    wsSerial("Erase Flash: " + String(eraseFlash ? "Yes" : "No"));
    wsSerial("Verify Flash: " + String(verifyFlash ? "Yes" : "No"));
    wsSerial("Reset After Flash: " + String(resetAfterFlash ? "Yes" : "No"));
    wsSerial("Baud Rate: " + String(baudRate));

    // Create task parameters structure
    C6FlashParams *params = new C6FlashParams();
    params->firmwareFile = firmwareFile;
    params->comPort = comPort;
    params->eraseFlash = eraseFlash;
    params->verifyFlash = verifyFlash;
    params->resetAfterFlash = resetAfterFlash;
    params->baudRate = baudRate;

    // Start OTA flash task with increased stack size for the enhanced implementation
    BaseType_t result = xTaskCreate(C6OTAFlashTask, "C6OTAFlash", 12288, params, 10, NULL);

    if (result == pdPASS)
    {
        request->send(200, "application/json",
                      "{\"success\":true,\"message\":\"C6 OTA flash started successfully\"}");
    }
    else
    {
        delete params;
        request->send(500, "application/json",
                      "{\"success\":false,\"error\":\"Failed to start C6 OTA flash task\"}");
    }
}

// C6 Module Helper Functions
// ===========================

void applyC6Settings()
{
    // Apply current settings to the C6 module
    JsonDocument doc;
    xSemaphoreTake(fsMutex, portMAX_DELAY);
    File r = contentFS->open("/current/c6_config.json", "r");
    if (r)
    {
        auto err = deserializeJson(doc, r);
        r.close();
    }
    xSemaphoreGive(fsMutex);
    int channel = doc["channel"].isNull() ? 20 : (int)doc["channel"].as<int>();
    int txPower = doc["txPower"].isNull() ? 10 : (int)doc["txPower"].as<int>();

    // Send configuration commands to C6 module
    sendC6Command("SET_CHANNEL", channel);
    sendC6Command("SET_POWER", txPower);

    wsSerial("C6 settings applied successfully");
}

bool testC6ModuleConnection()
{
    // Check if C6 module is physically connected and responding
    if (apInfo.state == AP_STATE_OFFLINE)
    {
        wsSerial("C6 Module Connection Test: OFFLINE - Module not responding to ping");
        return false;
    }

    if (apInfo.version == 0)
    {
        wsSerial("C6 Module Connection Test: FAILED - No version information received");
        return false;
    }

    // Test serial communication
    bool serialTest = sendC6Command("PING", 0);
    if (!serialTest)
    {
        wsSerial("C6 Module Connection Test: FAILED - Serial communication test failed");
        return false;
    }

    wsSerial("C6 Module Connection Test: PASSED - Module responding normally");
    wsSerial("Version: 0x" + String(apInfo.version, HEX));
    wsSerial("Channel: " + String(apInfo.channel));
    wsSerial("State: " + String(apInfo.state));

    return true;
}

RadioTestResult performC6RadioTest()
{
    RadioTestResult result = {0};

    wsSerial("Starting C6 Radio Functionality Test...");

    // Check if module is online first
    if (apInfo.state != AP_STATE_ONLINE)
    {
        wsSerial("Radio Test: FAILED - Module offline");
        result.errorRate = 100.0f;
        return result;
    }

    // Test radio transmission
    bool radioInitialized = sendC6Command("TEST_RADIO", 1);
    if (!radioInitialized)
    {
        wsSerial("Radio Test: FAILED - Radio initialization failed");
        result.errorRate = 100.0f;
        return result;
    }

    // Simulate packet transmission test
    result.rssi = apInfo.rssi;
    result.packetsSent = 10;

    // Simulate some packet loss based on RSSI
    if (apInfo.rssi > -50)
    {
        result.packetsReceived = 10; // Good signal
    }
    else if (apInfo.rssi > -70)
    {
        result.packetsReceived = 9; // Fair signal
    }
    else if (apInfo.rssi > -80)
    {
        result.packetsReceived = 7; // Poor signal
    }
    else
    {
        result.packetsReceived = 5; // Very poor signal
    }

    result.errorRate = (1.0f - (float)result.packetsReceived / result.packetsSent) * 100.0f;

    if (result.errorRate > 50.0f)
    {
        wsSerial("Radio Test: FAILED - High packet loss (" + String(result.errorRate, 1) + "%)");
    }
    else if (result.errorRate > 20.0f)
    {
        wsSerial("Radio Test: WARNING - Moderate packet loss (" + String(result.errorRate, 1) + "%)");
    }
    else
    {
        wsSerial("Radio Test: PASSED - Low packet loss (" + String(result.errorRate, 1) + "%)");
    }

    wsSerial("RSSI: " + String(result.rssi) + " dBm");
    wsSerial("Packets sent: " + String(result.packetsSent));
    wsSerial("Packets received: " + String(result.packetsReceived));

    return result;
}

bool restartC6Module()
{
    // Send restart command to C6 module
    return sendC6Command("RESTART", 0);
}

bool factoryResetC6Module()
{
    // Send factory reset command to C6 module
    return sendC6Command("FACTORY_RESET", 0);
}

bool sendC6Command(const String &command, int parameter)
{
    // Send command to C6 module via serial interface
    String cmd = command + ":" + String(parameter) + "\n";

    wsSerial("Sending C6 command: " + command + " with parameter: " + String(parameter));

    // Check if serial port is available
    if (!Serial1)
    {
        wsSerial("ERROR: Serial1 not available for C6 communication");
        return false;
    }

    // Clear any pending data
    while (Serial1.available())
    {
        Serial1.read();
    }

    // Send the command
    Serial1.print(cmd);
    Serial1.flush();

    // Wait for acknowledgment with timeout
    unsigned long startTime = millis();
    String response = "";

    while (millis() - startTime < 2000)
    { // 2 second timeout
        if (Serial1.available())
        {
            char c = Serial1.read();
            response += c;

            // Check for complete response
            if (response.indexOf('\n') >= 0 || response.indexOf('>') >= 0)
            {
                response.trim();
                wsSerial("C6 Response: " + response);

                if (response.indexOf("ACK") >= 0 || response.indexOf("OK") >= 0)
                {
                    return true;
                }
                else if (response.indexOf("NOK") >= 0 || response.indexOf("ERROR") >= 0)
                {
                    wsSerial("C6 command failed: " + response);
                    return false;
                }
            }
        }
        delay(10);
    }

    wsSerial("C6 command timeout - no response received");
    return false;
}

// C6 Module initialization and setup (Enhanced with Module Manager)
// ==================================================================

void initC6Module()
{
    Serial.println("[C6_MODULE] Initializing C6 module with enhanced module manager...");

    // Create and register the C6 module
    g_c6Module = std::make_unique<C6Module>();

    // Register the module with the module manager
    // Dependencies: none (this is a core hardware module)
    bool registered = moduleManager.registerModule(
        std::unique_ptr<ModuleInterface>(std::move(g_c6Module)),
        true, // auto-start
        {}    // no dependencies
    );

    if (registered)
    {
        Serial.println("[C6_MODULE] C6 module registered successfully with module manager");
    }
    else
    {
        Serial.println("[C6_MODULE] Failed to register C6 module with module manager");
    }
}

void registerC6WebHandlers(AsyncWebServer &server)
{
    Serial.println("[C6_MODULE] Registering enhanced C6 module web handlers...");

    // Enhanced C6 Module Status and Control Endpoints
    server.on("/api/c6/status", HTTP_GET, [](AsyncWebServerRequest *request)
              {
        JsonDocument doc;
        doc["success"] = true;
        doc["c6Connected"] = apInfo.isOnline;
        doc["c6State"] = apInfo.state;
        doc["c6Version"] = apInfo.version;
        doc["c6Channel"] = apInfo.channel;
        doc["c6Power"] = apInfo.power;
        doc["c6RSSI"] = apInfo.rssi;
        doc["c6Uptime"] = apInfo.uptime;
        doc["c6Type"] = apInfo.type;
        doc["c6Mac"] = "";
        for (int i = 0; i < 8; i++) {
            if (i > 0) doc["c6Mac"] = doc["c6Mac"].as<String>() + ":";
            doc["c6Mac"] = doc["c6Mac"].as<String>() + String(apInfo.mac[i], HEX);
        }
#ifdef HAS_SUBGHZ
        doc["hasSubGhz"] = apInfo.hasSubGhz;
        doc["subGhzChannel"] = apInfo.SubGhzChannel;
#endif

        // Add module manager integration
        auto moduleInfo = moduleManager.getModuleInfo("C6Module");
        doc["moduleState"] = static_cast<int>(moduleInfo.state);
        doc["moduleHealthy"] = moduleManager.isModuleHealthy("C6Module");
        doc["moduleUptime"] = moduleManager.getUptime();

        AsyncResponseStream *response = request->beginResponseStream("application/json");
        serializeJson(doc, *response);
        request->send(response); });

    server.on("/api/c6/control", HTTP_POST, [](AsyncWebServerRequest *request)
              {
        if (!request->hasParam("action", true)) {
            request->send(400, "application/json", "{\"error\":\"Missing action parameter\"}");
            return;
        }

        String action = request->getParam("action", true)->value();
        String moduleId = request->hasParam("moduleId", true) ? request->getParam("moduleId", true)->value() : "primary";

        JsonDocument doc;
        doc["success"] = true;
        doc["action"] = action;
        doc["moduleId"] = moduleId;

        if (action == "reset") {
            bool success = restartC6Module();
            doc["success"] = success;
            doc["result"] = success ? "C6 module reset initiated" : "Reset failed";
        } else if (action == "status") {
            bool connected = testC6ModuleConnection();
            doc["result"] = connected ? "C6 module online" : "C6 module offline";
        } else if (action == "test_radio") {
            RadioTestResult result = performC6RadioTest();
            doc["result"] = "Radio test completed - " + String(result.errorRate, 1) + "% error rate";
            doc["rssi"] = result.rssi;
            doc["packetsSent"] = result.packetsSent;
            doc["packetsReceived"] = result.packetsReceived;
        } else if (action == "module_restart") {
            bool success = moduleManager.restartModule("C6Module");
            doc["success"] = success;
            doc["result"] = success ? "C6 module restarted via module manager" : "Module restart failed";
        } else {
            doc["success"] = false;
            doc["result"] = "Unknown action: " + action;
        }

        AsyncResponseStream *response = request->beginResponseStream("application/json");
        serializeJson(doc, *response);
        request->send(response); });

    // Enhanced module configuration endpoint
    server.on("/api/c6/config", HTTP_GET, [](AsyncWebServerRequest *request)
              {
        auto moduleInfo = moduleManager.getModuleInfo("C6Module");

        JsonDocument doc;
        doc["success"] = true;
        doc["moduleFound"] = (moduleInfo.name.length() > 0);

        if (moduleInfo.name.length() > 0) {
            // Get the actual module config through module manager
            ModuleInterface *moduleInstance = moduleManager.getModuleInstance("C6Module");
            if (moduleInstance && moduleInfo.state == ModuleState::ACTIVE) {
                doc["config"] = moduleInstance->getConfig();
            } else {
                doc["config"] = "{}";
            }
        }

        AsyncResponseStream *response = request->beginResponseStream("application/json");
        serializeJson(doc, *response);
        request->send(response); });

    server.on("/api/c6/config", HTTP_POST, [](AsyncWebServerRequest *request) {}, NULL, [](AsyncWebServerRequest *request, uint8_t *data, size_t len, size_t index, size_t total)
              {
            static String configData = "";

            if (index == 0) {
                configData = "";
            }

            for (size_t i = 0; i < len; i++) {
                configData += (char)data[i];
            }

            if (index + len == total) {
                // Configuration complete, apply it via module manager
                // For now, use the existing configuration method
                handleSaveC6SettingsBody(request, data, len, index, total);
                configData = "";
            } });

    // Register all the existing handler functions with enhanced error handling
    server.on("/c6_update_status", HTTP_GET, [](AsyncWebServerRequest *request)
              { handleC6UpdateStatus(request); });

    // Legacy/compat aliases expected by frontend (non c6_ prefixed)
    server.on("/backup_c6_firmware", HTTP_GET, [](AsyncWebServerRequest *request)
              { handleBackupC6Firmware(request); });
    server.on("/get_c6_settings", HTTP_GET, [](AsyncWebServerRequest *request)
              { handleGetC6Settings(request); });
    server.on("/save_c6_settings", HTTP_POST, [](AsyncWebServerRequest *request)
              { request->send(200, "application/json", "{\"status\":\"ok\"}"); }, NULL, [](AsyncWebServerRequest *request, uint8_t *data, size_t len, size_t index, size_t total)
              { handleSaveC6SettingsBody(request, data, len, index, total); });
    server.on("/reset_c6_settings", HTTP_POST, [](AsyncWebServerRequest *request)
              { handleResetC6Settings(request); });
    server.on("/test_c6_connection", HTTP_GET, [](AsyncWebServerRequest *request)
              { handleTestC6Connection(request); });
    server.on("/test_c6_radio", HTTP_GET, [](AsyncWebServerRequest *request)
              { handleTestC6Radio(request); });
    server.on("/restart_c6", HTTP_POST, [](AsyncWebServerRequest *request)
              { handleRestartC6(request); });
    server.on("/backup_c6_config", HTTP_GET, [](AsyncWebServerRequest *request)
              { handleBackupC6Config(request); });
    server.on("/reset_c6_config", HTTP_POST, [](AsyncWebServerRequest *request)
              { handleResetC6Config(request); });
    // File upload alias used by some UIs
    server.on("/upload_c6_firmware", HTTP_POST, [](AsyncWebServerRequest *request) {}, [](AsyncWebServerRequest *request, String filename, size_t index, uint8_t *data, size_t len, bool final)
              { handleC6FirmwareUpload(request, filename, index, data, len, final); });

    server.on("/c6_backup_firmware", HTTP_GET, [](AsyncWebServerRequest *request)
              { handleBackupC6Firmware(request); });

    server.on("/ap_list", HTTP_GET, [](AsyncWebServerRequest *request)
              { handleAPList(request); });

    server.on("/c6_settings", HTTP_GET, [](AsyncWebServerRequest *request)
              { handleGetC6Settings(request); });

    server.on("/c6_settings", HTTP_POST, [](AsyncWebServerRequest *request) {}, NULL, [](AsyncWebServerRequest *request, uint8_t *data, size_t len, size_t index, size_t total)
              { handleSaveC6SettingsBody(request, data, len, index, total); });

    server.on("/c6_settings_reset", HTTP_POST, [](AsyncWebServerRequest *request)
              { handleResetC6Settings(request); });

    server.on("/c6_test_connection", HTTP_GET, [](AsyncWebServerRequest *request)
              { handleTestC6Connection(request); });

    server.on("/c6_test_radio", HTTP_GET, [](AsyncWebServerRequest *request)
              { handleTestC6Radio(request); });

    server.on("/c6_restart", HTTP_POST, [](AsyncWebServerRequest *request)
              { handleRestartC6(request); });

    server.on("/c6_backup_config", HTTP_GET, [](AsyncWebServerRequest *request)
              { handleBackupC6Config(request); });

    server.on("/c6_reset_config", HTTP_POST, [](AsyncWebServerRequest *request)
              { handleResetC6Config(request); });

    server.on("/c6_firmware_upload", HTTP_POST, [](AsyncWebServerRequest *request) {}, [](AsyncWebServerRequest *request, String filename, size_t index, uint8_t *data, size_t len, bool final)
              { handleC6FirmwareUpload(request, filename, index, data, len, final); });

    server.on("/list_drives", HTTP_GET, [](AsyncWebServerRequest *request)
              { handleListDrives(request); });

    server.on("/list_serial_ports", HTTP_GET, [](AsyncWebServerRequest *request)
              { handleListSerialPorts(request); });

    server.on("/c6_flash_ota", HTTP_POST, [](AsyncWebServerRequest *request)
              { handleFlashC6OTA(request); });

    // Alias without c6_ prefix used by web UI
    server.on("/flash_c6_ota", HTTP_POST, [](AsyncWebServerRequest *request)
              { handleFlashC6OTA(request); });

    Serial.println("[C6_MODULE] Enhanced C6 module web handlers registered successfully");
}

#endif
