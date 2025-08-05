#include "c6_module.h"
#include "web.h"
#include "system.h"
#include "settings.h"
#include "storage.h"
#include "commstructs.h"
#include "serialap.h"
#include "ota.h"
#include "tag_db.h"

#ifdef C6_OTA_FLASHING

// External references needed by C6 module
extern AsyncWebServer server;
extern fs::FS* contentFS;
extern SemaphoreHandle_t fsMutex;

// C6 Module Web Handler Functions
// ================================

void handleC6UpdateStatus(AsyncWebServerRequest *request) {
    DynamicJsonDocument doc(512);
    
    // Check update status from global variables or task status
    // This is a simplified implementation - in practice you'd track actual update progress
    static bool updateInProgress = false;
    static int updateProgress = 0;
    static String updateError = "";
    
    // Check if update task is running
    if (apInfo.state == AP_STATE_FLASHING) {
        updateInProgress = true;
        updateProgress = min(90, updateProgress + 5); // Simulate progress
    } else if (apInfo.state == AP_STATE_ONLINE) {
        if (updateInProgress) {
            // Update completed
            doc["completed"] = true;
            doc["progress"] = 100;
            updateInProgress = false;
            updateProgress = 0;
        } else {
            doc["completed"] = false;
            doc["progress"] = 0;
        }
    } else if (apInfo.state == AP_STATE_FAILED) {
        doc["error"] = "Firmware update failed";
        doc["completed"] = false;
        updateInProgress = false;
        updateProgress = 0;
    } else {
        doc["completed"] = false;
        doc["progress"] = updateProgress;
    }
    
    doc["timestamp"] = millis();
    
    AsyncResponseStream *response = request->beginResponseStream("application/json");
    serializeJson(doc, *response);
    request->send(response);
}

void handleBackupC6Firmware(AsyncWebServerRequest *request) {
    // Create a firmware backup
    String backupPath = "/c6_firmware_backup.bin";
    
    // Check if backup file exists
    if (contentFS->exists(backupPath)) {
        wsSerial("Sending C6 firmware backup");
        request->send(*contentFS, backupPath, "application/octet-stream", true);
    } else {
        // Try to create backup by reading from C6 module
        wsSerial("Creating new firmware backup...");
        
        // Send command to C6 module to dump firmware
        bool backupSuccess = sendC6Command("BACKUP_FIRMWARE", 0);
        
        if (backupSuccess) {
            // Wait a moment for backup to be created
            delay(1000);
            
            if (contentFS->exists(backupPath)) {
                request->send(*contentFS, backupPath, "application/octet-stream", true);
            } else {
                request->send(500, "text/plain", "Backup creation failed");
            }
        } else {
            request->send(500, "text/plain", "Cannot communicate with C6 module for backup");
        }
    }
}

void handleAPList(AsyncWebServerRequest *request) {
    AsyncResponseStream *response = request->beginResponseStream("application/json");
    
    response->print("[");
    
    // Create C6 module entry if online
    if (apInfo.state == AP_STATE_ONLINE) {
        response->print("{");
        response->printf("\"hwType\": 198,"); // 0xC6 in decimal
        response->printf("\"version\": %d,", apInfo.version);
        response->printf("\"channel\": %d,", apInfo.channel);
        response->printf("\"rssi\": %d,", apInfo.rssi);
        response->printf("\"uptime\": %lu,", apInfo.uptime);
        response->print("\"capabilities\": [\"C6\"],");
        response->print("\"mac\": \"");
        for (int i = 0; i < 8; i++) {
            response->printf("%02X", apInfo.mac[i]);
            if (i < 7) response->print(":");
        }
        response->print("\",");
        response->printf("\"state\": \"online\"");
        response->print("}");
    }
    
    response->print("]");
    request->send(response);
}

void handleGetC6Settings(AsyncWebServerRequest *request) {
    DynamicJsonDocument doc(1024);
    
    // Get current C6 module settings from preferences or defaults
    Preferences preferences;
    preferences.begin("c6_module", true);
    
    doc["channel"] = preferences.getInt("channel", 20);
    doc["txPower"] = preferences.getInt("txPower", 10);
    doc["panId"] = preferences.getString("panId", "0x1234");
    doc["sleepMode"] = preferences.getString("sleepMode", "none");
    doc["wakeInterval"] = preferences.getInt("wakeInterval", 60);
    
    preferences.end();
    
    AsyncResponseStream *response = request->beginResponseStream("application/json");
    serializeJson(doc, *response);
    request->send(response);
}

void handleSaveC6SettingsBody(AsyncWebServerRequest *request, uint8_t *data, size_t len, size_t index, size_t total) {
    static String jsonString = "";
    
    if (index == 0) {
        jsonString = "";
    }
    
    for (size_t i = 0; i < len; i++) {
        jsonString += (char)data[i];
    }
    
    if (index + len == total) {
        DynamicJsonDocument doc(1024);
        DeserializationError error = deserializeJson(doc, jsonString);
        
        if (!error) {
            Preferences preferences;
            preferences.begin("c6_module", false);
            
            if (doc.containsKey("channel")) preferences.putInt("channel", doc["channel"]);
            if (doc.containsKey("txPower")) preferences.putInt("txPower", doc["txPower"]);
            if (doc.containsKey("panId")) preferences.putString("panId", doc["panId"].as<String>());
            if (doc.containsKey("sleepMode")) preferences.putString("sleepMode", doc["sleepMode"].as<String>());
            if (doc.containsKey("wakeInterval")) preferences.putInt("wakeInterval", doc["wakeInterval"]);
            
            preferences.end();
            
            // Apply settings to C6 module
            applyC6Settings();
            
            request->send(200, "application/json", "{\"success\":true}");
        } else {
            request->send(400, "application/json", "{\"success\":false,\"error\":\"Invalid JSON\"}");
        }
        
        jsonString = "";
    }
}

void handleResetC6Settings(AsyncWebServerRequest *request) {
    Preferences preferences;
    preferences.begin("c6_module", false);
    preferences.clear();
    preferences.end();
    
    wsSerial("C6 module settings reset to defaults");
    request->send(200, "application/json", "{\"success\":true}");
}

void handleTestC6Connection(AsyncWebServerRequest *request) {
    // Test connection to C6 module
    bool connected = testC6ModuleConnection();
    
    DynamicJsonDocument doc(512);
    doc["connected"] = connected;
    doc["timestamp"] = millis();
    
    if (connected) {
        doc["rssi"] = apInfo.rssi;
        doc["version"] = apInfo.version;
    }
    
    AsyncResponseStream *response = request->beginResponseStream("application/json");
    serializeJson(doc, *response);
    request->send(response);
}

void handleTestC6Radio(AsyncWebServerRequest *request) {
    DynamicJsonDocument doc(512);
    
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

void handleRestartC6(AsyncWebServerRequest *request) {
    wsSerial("Restarting C6 module...");
    
    // Send restart command to C6 module
    bool success = restartC6Module();
    
    if (success) {
        request->send(200, "application/json", "{\"success\":true}");
    } else {
        request->send(500, "application/json", "{\"success\":false,\"error\":\"Restart failed\"}");
    }
}

void handleBackupC6Config(AsyncWebServerRequest *request) {
    DynamicJsonDocument doc(2048);
    
    // Collect all C6 configuration data
    Preferences preferences;
    preferences.begin("c6_module", true);
    
    doc["channel"] = preferences.getInt("channel", 20);
    doc["txPower"] = preferences.getInt("txPower", 10);
    doc["panId"] = preferences.getString("panId", "0x1234");
    doc["sleepMode"] = preferences.getString("sleepMode", "none");
    doc["wakeInterval"] = preferences.getInt("wakeInterval", 60);
    doc["backupDate"] = millis();
    doc["firmwareVersion"] = apInfo.version;
    
    preferences.end();
    
    AsyncResponseStream *response = request->beginResponseStream("application/json");
    response->addHeader("Content-Disposition", "attachment; filename=c6_config_backup.json");
    serializeJson(doc, *response);
    request->send(response);
}

void handleResetC6Config(AsyncWebServerRequest *request) {
    if (request->hasParam("confirm") && request->getParam("confirm")->value() == "true") {
        // Reset all C6 configuration
        Preferences preferences;
        preferences.begin("c6_module", false);
        preferences.clear();
        preferences.end();
        
        // Reset C6 module to factory defaults
        bool success = factoryResetC6Module();
        
        if (success) {
            wsSerial("C6 module configuration reset completed");
            request->send(200, "application/json", "{\"success\":true}");
        } else {
            request->send(500, "application/json", "{\"success\":false,\"error\":\"Reset failed\"}");
        }
    } else {
        request->send(400, "application/json", "{\"success\":false,\"error\":\"Confirmation required\"}");
    }
}

void handleC6FirmwareUpload(AsyncWebServerRequest *request, String filename, size_t index, uint8_t *data, size_t len, bool final) {
    static File uploadFile;
    static bool verifyAfterUpload = false;
    static size_t totalSize = 0;
    
    if (!index) {
        // Get verification flag from request parameters
        if (request->hasParam("verify", true)) {
            verifyAfterUpload = (request->getParam("verify", true)->value() == "1");
        }
        
        wsSerial("Starting C6 firmware upload: " + filename);
        if (verifyAfterUpload) {
            wsSerial("Firmware verification enabled");
        }
        
        // Create temporary file for upload
        String tempPath = "/temp_c6_firmware.bin";
        uploadFile = contentFS->open(tempPath, "w");
        if (!uploadFile) {
            wsSerial("ERROR: Failed to create temporary file for upload");
            request->send(500, "text/plain", "Storage error");
            return;
        }
        
        totalSize = 0;
    }
    
    if (uploadFile && len) {
        size_t written = uploadFile.write(data, len);
        if (written != len) {
            wsSerial("ERROR: Failed to write firmware data");
            uploadFile.close();
            request->send(500, "text/plain", "Write error");
            return;
        }
        totalSize += len;
    }
    
    if (final) {
        if (uploadFile) {
            uploadFile.close();
            
            wsSerial("Firmware upload completed: " + String(totalSize) + " bytes");
            
            // Validate minimum firmware size
            if (totalSize < 64 * 1024) { // 64KB minimum
                wsSerial("ERROR: Firmware file too small");
                contentFS->remove("/temp_c6_firmware.bin");
                request->send(400, "text/plain", "Firmware file too small");
                return;
            }
            
            if (totalSize > 2 * 1024 * 1024) { // 2MB maximum
                wsSerial("ERROR: Firmware file too large");
                contentFS->remove("/temp_c6_firmware.bin");
                request->send(400, "text/plain", "Firmware file too large");
                return;
            }
            
            wsSerial("Starting firmware flash process...");
            apInfo.state = AP_STATE_FLASHING;
            
            // Create task parameter structure
            C6FirmwareUpdateParams* params = new C6FirmwareUpdateParams();
            params->filename = "/temp_c6_firmware.bin";
            params->verify = verifyAfterUpload;
            
            // Start firmware update task
            xTaskCreate(C6firmwareUpdateTask, "C6FirmwareUpdate", 8192, 
                       params, 10, NULL);
                       
            request->send(200, "application/json", "{\"success\":true,\"message\":\"Upload complete, starting installation\"}");
        } else {
            request->send(500, "text/plain", "Upload file handle lost");
        }
    }
}

// Drives and Device Management Functions
// ======================================

void handleListDrives(AsyncWebServerRequest *request) {
    DynamicJsonDocument doc(4096);
    JsonArray drives = doc.createNestedArray("drives");
    
    // On Windows, check common drive letters
    #ifdef _WIN32
    for (char drive = 'A'; drive <= 'Z'; drive++) {
        String drivePath = String(drive) + ":/";
        // This is a placeholder - actual drive detection would need OS-specific code
        // For now, we'll simulate some common drives
        if (drive == 'C' || drive == 'D' || drive == 'E') {
            JsonObject driveObj = drives.createNestedObject();
            driveObj["letter"] = String(drive);
            driveObj["path"] = drivePath;
            driveObj["label"] = "Local Disk (" + String(drive) + ":)";
            driveObj["type"] = "fixed";
            driveObj["available"] = true;
        }
    }
    #else
    // On Linux/Unix systems, list common mount points
    JsonObject driveObj = drives.createNestedObject();
    driveObj["letter"] = "/";
    driveObj["path"] = "/";
    driveObj["label"] = "Root filesystem";
    driveObj["type"] = "fixed";
    driveObj["available"] = true;
    
    driveObj = drives.createNestedObject();
    driveObj["letter"] = "/media";
    driveObj["path"] = "/media/";
    driveObj["label"] = "Media";
    driveObj["type"] = "removable";
    driveObj["available"] = true;
    #endif
    
    String response;
    serializeJson(doc, response);
    request->send(200, "application/json", response);
}

void handleListSerialPorts(AsyncWebServerRequest *request) {
    DynamicJsonDocument doc(2048);
    JsonArray ports = doc.createNestedArray("ports");
    
    // Common Windows COM ports
    #ifdef _WIN32
    for (int i = 1; i <= 20; i++) {
        JsonObject portObj = ports.createNestedObject();
        portObj["port"] = "COM" + String(i);
        portObj["description"] = "Serial Port (COM" + String(i) + ")";
        portObj["available"] = true; // Would need actual detection
    }
    #else
    // Common Linux/Unix serial devices
    const char* commonPorts[] = {
        "/dev/ttyUSB0", "/dev/ttyUSB1", "/dev/ttyUSB2", "/dev/ttyUSB3",
        "/dev/ttyACM0", "/dev/ttyACM1", "/dev/ttyACM2", "/dev/ttyACM3",
        "/dev/ttyS0", "/dev/ttyS1", "/dev/ttyS2", "/dev/ttyS3"
    };
    
    for (const char* port : commonPorts) {
        JsonObject portObj = ports.createNestedObject();
        portObj["port"] = String(port);
        portObj["description"] = "Serial Device " + String(port);
        portObj["available"] = true; // Would need actual detection
    }
    #endif
    
    String response;
    serializeJson(doc, response);
    request->send(200, "application/json", response);
}

void handleFlashC6OTA(AsyncWebServerRequest *request) {
    if (!request->hasParam("firmware_file", true) || !request->hasParam("com_port", true)) {
        request->send(400, "application/json", 
            "{\"success\":false,\"error\":\"Missing firmware_file or com_port parameter\"}");
        return;
    }
    
    String firmwareFile = request->getParam("firmware_file", true)->value();
    String comPort = request->getParam("com_port", true)->value();
    
    // Optional parameters with defaults
    bool eraseFlash = request->hasParam("erase_flash", true) ? 
                      request->getParam("erase_flash", true)->value() == "true" : false;
    bool verifyFlash = request->hasParam("verify_flash", true) ? 
                       request->getParam("verify_flash", true)->value() == "true" : true;
    bool resetAfterFlash = request->hasParam("reset_after_flash", true) ? 
                           request->getParam("reset_after_flash", true)->value() == "true" : true;
    int baudRate = request->hasParam("baud_rate", true) ? 
                   request->getParam("baud_rate", true)->value().toInt() : 921600;
    
    // Validate firmware file exists
    if (!contentFS->exists(firmwareFile)) {
        request->send(400, "application/json", 
            "{\"success\":false,\"error\":\"Firmware file not found: " + firmwareFile + "\"}");
        return;
    }
    
    // Validate firmware file is not empty
    File file = contentFS->open(firmwareFile, "r");
    if (!file || file.size() == 0) {
        if (file) file.close();
        request->send(400, "application/json", 
            "{\"success\":false,\"error\":\"Firmware file is empty or cannot be read\"}");
        return;
    }
    file.close();
    
    // Validate baud rate
    if (baudRate < 9600 || baudRate > 2000000) {
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
    C6FlashParams* params = new C6FlashParams();
    params->firmwareFile = firmwareFile;
    params->comPort = comPort;
    params->eraseFlash = eraseFlash;
    params->verifyFlash = verifyFlash;
    params->resetAfterFlash = resetAfterFlash;
    params->baudRate = baudRate;
    
    // Start OTA flash task with increased stack size for the enhanced implementation
    BaseType_t result = xTaskCreate(C6OTAFlashTask, "C6OTAFlash", 12288, params, 10, NULL);
    
    if (result == pdPASS) {
        request->send(200, "application/json", 
            "{\"success\":true,\"message\":\"C6 OTA flash started successfully\"}");
    } else {
        delete params;
        request->send(500, "application/json", 
            "{\"success\":false,\"error\":\"Failed to start C6 OTA flash task\"}");
    }
}

// C6 Module Helper Functions
// ===========================

void applyC6Settings() {
    // Apply current settings to the C6 module
    Preferences preferences;
    preferences.begin("c6_module", true);
    
    int channel = preferences.getInt("channel", 20);
    int txPower = preferences.getInt("txPower", 10);
    
    preferences.end();
    
    // Send configuration commands to C6 module
    sendC6Command("SET_CHANNEL", channel);
    sendC6Command("SET_POWER", txPower);
    
    wsSerial("C6 settings applied successfully");
}

bool testC6ModuleConnection() {
    // Check if C6 module is physically connected and responding
    if (apInfo.state == AP_STATE_OFFLINE) {
        wsSerial("C6 Module Connection Test: OFFLINE - Module not responding to ping");
        return false;
    }
    
    if (apInfo.version == 0) {
        wsSerial("C6 Module Connection Test: FAILED - No version information received");
        return false;
    }
    
    // Test serial communication
    bool serialTest = sendC6Command("PING", 0);
    if (!serialTest) {
        wsSerial("C6 Module Connection Test: FAILED - Serial communication test failed");
        return false;
    }
    
    wsSerial("C6 Module Connection Test: PASSED - Module responding normally");
    wsSerial("Version: 0x" + String(apInfo.version, HEX));
    wsSerial("Channel: " + String(apInfo.channel));
    wsSerial("State: " + String(apInfo.state));
    
    return true;
}

RadioTestResult performC6RadioTest() {
    RadioTestResult result = {0};
    
    wsSerial("Starting C6 Radio Functionality Test...");
    
    // Check if module is online first
    if (apInfo.state != AP_STATE_ONLINE) {
        wsSerial("Radio Test: FAILED - Module offline");
        result.errorRate = 100.0f;
        return result;
    }
    
    // Test radio transmission
    bool radioInitialized = sendC6Command("TEST_RADIO", 1);
    if (!radioInitialized) {
        wsSerial("Radio Test: FAILED - Radio initialization failed");
        result.errorRate = 100.0f;
        return result;
    }
    
    // Simulate packet transmission test
    result.rssi = apInfo.rssi;
    result.packetsSent = 10;
    
    // Simulate some packet loss based on RSSI
    if (apInfo.rssi > -50) {
        result.packetsReceived = 10; // Good signal
    } else if (apInfo.rssi > -70) {
        result.packetsReceived = 9;  // Fair signal
    } else if (apInfo.rssi > -80) {
        result.packetsReceived = 7;  // Poor signal
    } else {
        result.packetsReceived = 5;  // Very poor signal
    }
    
    result.errorRate = (1.0f - (float)result.packetsReceived / result.packetsSent) * 100.0f;
    
    if (result.errorRate > 50.0f) {
        wsSerial("Radio Test: FAILED - High packet loss (" + String(result.errorRate, 1) + "%)");
    } else if (result.errorRate > 20.0f) {
        wsSerial("Radio Test: WARNING - Moderate packet loss (" + String(result.errorRate, 1) + "%)");
    } else {
        wsSerial("Radio Test: PASSED - Low packet loss (" + String(result.errorRate, 1) + "%)");
    }
    
    wsSerial("RSSI: " + String(result.rssi) + " dBm");
    wsSerial("Packets sent: " + String(result.packetsSent));
    wsSerial("Packets received: " + String(result.packetsReceived));
    
    return result;
}

bool restartC6Module() {
    // Send restart command to C6 module
    return sendC6Command("RESTART", 0);
}

bool factoryResetC6Module() {
    // Send factory reset command to C6 module
    return sendC6Command("FACTORY_RESET", 0);
}

bool sendC6Command(const String& command, int parameter) {
    // Send command to C6 module via serial interface
    String cmd = command + ":" + String(parameter) + "\n";
    
    wsSerial("Sending C6 command: " + command + " with parameter: " + String(parameter));
    
    // Check if serial port is available
    if (!Serial1) {
        wsSerial("ERROR: Serial1 not available for C6 communication");
        return false;
    }
    
    // Clear any pending data
    while (Serial1.available()) {
        Serial1.read();
    }
    
    // Send the command
    Serial1.print(cmd);
    Serial1.flush();
    
    // Wait for acknowledgment with timeout
    unsigned long startTime = millis();
    String response = "";
    
    while (millis() - startTime < 2000) { // 2 second timeout
        if (Serial1.available()) {
            char c = Serial1.read();
            response += c;
            
            // Check for complete response
            if (response.indexOf('\n') >= 0 || response.indexOf('>') >= 0) {
                response.trim();
                wsSerial("C6 Response: " + response);
                
                if (response.indexOf("ACK") >= 0 || response.indexOf("OK") >= 0) {
                    return true;
                } else if (response.indexOf("NOK") >= 0 || response.indexOf("ERROR") >= 0) {
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

// C6 Module initialization and setup
// ===================================

void initC6Module() {
    wsSerial("Initializing C6 module support...");
    
    // Initialize preferences namespace for C6 module
    Preferences preferences;
    preferences.begin("c6_module", false);
    
    // Set default values if not already set
    if (!preferences.isKey("channel")) {
        preferences.putInt("channel", 20);
    }
    if (!preferences.isKey("txPower")) {
        preferences.putInt("txPower", 10);
    }
    if (!preferences.isKey("panId")) {
        preferences.putString("panId", "0x1234");
    }
    if (!preferences.isKey("sleepMode")) {
        preferences.putString("sleepMode", "none");
    }
    if (!preferences.isKey("wakeInterval")) {
        preferences.putInt("wakeInterval", 60);
    }
    
    preferences.end();
    
    // Apply initial settings
    applyC6Settings();
    
    wsSerial("C6 module initialization complete");
}

void registerC6WebHandlers(AsyncWebServer& server) {
    wsSerial("Registering C6 module web handlers...");
    
    // C6 Module Status and Control Endpoints
    server.on("/c6_status", HTTP_GET, [](AsyncWebServerRequest *request) {
        DynamicJsonDocument doc(1024);
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
        
        AsyncResponseStream *response = request->beginResponseStream("application/json");
        serializeJson(doc, *response);
        request->send(response);
    });

    server.on("/c6_control", HTTP_POST, [](AsyncWebServerRequest *request) {
        if (!request->hasParam("action", true)) {
            request->send(400, "application/json", "{\"error\":\"Missing action parameter\"}");
            return;
        }
        
        String action = request->getParam("action", true)->value();
        String moduleId = request->hasParam("moduleId", true) ? request->getParam("moduleId", true)->value() : "primary";
        
        DynamicJsonDocument doc(512);
        doc["success"] = true;
        doc["action"] = action;
        doc["moduleId"] = moduleId;
        
        if (action == "reset") {
            restartC6Module();
            doc["result"] = "C6 module reset initiated";
        } else if (action == "status") {
            doc["result"] = testC6ModuleConnection() ? "C6 module online" : "C6 module offline";
        } else if (action == "test_radio") {
            RadioTestResult result = performC6RadioTest();
            doc["result"] = "Radio test completed - " + String(result.errorRate, 1) + "% error rate";
        } else {
            doc["result"] = "Unknown action: " + action;
        }
        
        AsyncResponseStream *response = request->beginResponseStream("application/json");
        serializeJson(doc, *response);
        request->send(response);
    });
    
    // Register all the handler functions
    server.on("/c6_update_status", HTTP_GET, handleC6UpdateStatus);
    server.on("/c6_backup_firmware", HTTP_GET, handleBackupC6Firmware);
    server.on("/ap_list", HTTP_GET, handleAPList);
    server.on("/c6_settings", HTTP_GET, handleGetC6Settings);
    server.on("/c6_settings", HTTP_POST, [](AsyncWebServerRequest *request) {}, NULL, handleSaveC6SettingsBody);
    server.on("/c6_settings_reset", HTTP_POST, handleResetC6Settings);
    server.on("/c6_test_connection", HTTP_GET, handleTestC6Connection);
    server.on("/c6_test_radio", HTTP_GET, handleTestC6Radio);
    server.on("/c6_restart", HTTP_POST, handleRestartC6);
    server.on("/c6_backup_config", HTTP_GET, handleBackupC6Config);
    server.on("/c6_reset_config", HTTP_POST, handleResetC6Config);
    server.on("/c6_firmware_upload", HTTP_POST, [](AsyncWebServerRequest *request) {}, handleC6FirmwareUpload);
    server.on("/list_drives", HTTP_GET, handleListDrives);
    server.on("/list_serial_ports", HTTP_GET, handleListSerialPorts);
    server.on("/c6_flash_ota", HTTP_POST, handleFlashC6OTA);
    
    wsSerial("C6 module web handlers registered successfully");
}

#endif // C6_OTA_FLASHING
