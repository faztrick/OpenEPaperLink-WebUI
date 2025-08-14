#include "ota.h"

#include <Arduino.h>
#include <ArduinoJson.h>
#include "JsonDocumentz.h"
#include <FS.h>
#include <HTTPClient.h>
#include <MD5Builder.h>
#include <Update.h>
#include <esp_loader.h>

#include "esp32_port.h"
#include "espflasher.h"
#include "flasher.h"
#include "leds.h"
#include "serialap.h"
#include "storage.h"
#include "tag_db.h"
#include "util.h"
#include "web.h"

#ifndef BUILD_ENV_NAME
#define BUILD_ENV_NAME unknown
#endif
#ifndef BUILD_TIME
#define BUILD_TIME 0
#endif
#ifndef BUILD_VERSION
#define BUILD_VERSION custom
#endif
#ifndef SHA
#define SHA 0
#endif

#define STR_IMPL(x) #x
#define STR(x) STR_IMPL(x)
#define LOG(format, ...) Serial.printf(format, ##__VA_ARGS__)

void handleSysinfoRequest(AsyncWebServerRequest* request) {
    JsonDocumentz doc(2048);
    doc["alias"] = config.alias;
    doc["env"] = STR(BUILD_ENV_NAME);
    doc["buildtime"] = STR(BUILD_TIME);
    doc["buildversion"] = STR(BUILD_VERSION);
    doc["sha"] = STR(SHA);
    doc["psramsize"] = ESP.getPsramSize();
    doc["flashsize"] = ESP.getFlashChipSize();
    doc["rollback"] = Update.canRollBack();
    doc["ap_version"] = apInfo.version;

    doc["hasC6"] = 0;
    doc["hasH2"] = 0;
    doc["hasTslr"] = 0;

#if defined HAS_H2
    doc["hasH2"] = 1;
#elif defined HAS_TSLR
    doc["hasTslr"] = 1;
#elif defined C6_OTA_FLASHING
    doc["hasC6"] = 1;
#endif

#ifdef HAS_EXT_FLASHER
    doc["hasFlasher"] = 1;
#else
    doc["hasFlasher"] = 0;
#endif
    const size_t bufferSize = measureJson(doc) + 1;
    AsyncResponseStream* response = request->beginResponseStream("application/json", bufferSize);
    serializeJson(doc, *response);
    request->send(response);
};

void handleCheckFile(AsyncWebServerRequest* request) {
    if (!request->hasParam("path")) {
        request->send(400);
        return;
    }

    const String filePath = request->getParam("path")->value();
    File file = contentFS->open(filePath, "r");
    if (!file) {
        JsonDocumentz doc(2048);
        doc["filesize"] = 0;
        doc["md5"] = "";
        String jsonResponse;
        serializeJson(doc, jsonResponse);
        request->send(200, "application/json", jsonResponse);
        return;
    }

    const size_t fileSize = file.size();

    MD5Builder md5;
    md5.begin();
    md5.addStream(file, fileSize);
    md5.calculate();
    const String md5Hash = md5.toString();

    file.close();

    JsonDocumentz doc(2048);
    doc["filesize"] = fileSize;
    doc["md5"] = md5Hash;
    String jsonResponse;
    serializeJson(doc, jsonResponse);
    request->send(200, "application/json", jsonResponse);
}

#define UPLOAD_BUFFER_SIZE 32768

struct UploadInfo {
    String filename;
    uint8_t buffer[UPLOAD_BUFFER_SIZE];
    size_t bufferSize;
};

void handleLittleFSUpload(AsyncWebServerRequest* request, String filename, size_t index, uint8_t* data, size_t len, bool final) {
    String uploadfilename;
    bool error = false;
    if (!index) {
        String path;
        if (!request->hasParam("path", true)) {
            final = true;
            error = true;
        } else {
            uploadfilename = request->getParam("path", true)->value();
            Serial.println("update " + uploadfilename);
            File file = contentFS->open(uploadfilename, "w");
            file.close();
            UploadInfo* uploadInfo = new UploadInfo{uploadfilename, {}, 0};
            request->_tempObject = (void*)uploadInfo;
        }
    }

    UploadInfo* uploadInfo = static_cast<UploadInfo*>(request->_tempObject);

    if (uploadInfo != nullptr) {
        uploadfilename = uploadInfo->filename;

        if (len) {
            if (uploadInfo->bufferSize + len <= UPLOAD_BUFFER_SIZE) {
                memcpy(&uploadInfo->buffer[uploadInfo->bufferSize], data, len);
                uploadInfo->bufferSize += len;
            } else {
                xSemaphoreTake(fsMutex, portMAX_DELAY);
                File file = contentFS->open(uploadfilename, "a");
                if (file) {
                    file.write(uploadInfo->buffer, uploadInfo->bufferSize);
                    file.close();
                    uploadInfo->bufferSize = 0;
                    xSemaphoreGive(fsMutex);
                } else {
                    xSemaphoreGive(fsMutex);
                    logLine("Failed to open file for appending: " + uploadfilename);
                    final = true;
                    error = true;
                }

                memcpy(uploadInfo->buffer, data, len);
                uploadInfo->bufferSize = len;
            }
        }
        if (final) {
            if (uploadInfo->bufferSize > 0) {
                xSemaphoreTake(fsMutex, portMAX_DELAY);
                File file = contentFS->open(uploadfilename, "a");
                if (file) {
                    file.write(uploadInfo->buffer, uploadInfo->bufferSize);
                    file.close();
                    xSemaphoreGive(fsMutex);
                } else {
                    xSemaphoreGive(fsMutex);
                    logLine("Failed to open file for appending: " + uploadfilename);
                    error = true;
                }
                request->_tempObject = nullptr;
                delete uploadInfo;
            }

            if (error) {
                request->send(507, "text/plain", "Error. Disk full?");
            } else {
                request->send(200, "text/plain", "Ok, file written");
            }
        }
    }
}

struct FirmwareUpdateParams {
    String url;
    String md5;
    size_t size;
};

void handleUpdateOTA(AsyncWebServerRequest* request) {
    if (request->hasParam("url", true) && request->hasParam("md5", true) && request->hasParam("size", true)) {
        FirmwareUpdateParams* params = new FirmwareUpdateParams;
        params->url = request->getParam("url", true)->value();
        params->md5 = request->getParam("md5", true)->value();
        params->size = request->getParam("size", true)->value().toInt();
        xTaskCreate(firmwareUpdateTask, "OTAUpdateTask", 6144, params, 10, NULL);

        request->send(200, "text/plain", "In progress");
    } else {
        request->send(400, "Bad request");
    }
}

void firmwareUpdateTask(void* parameter) {
    FirmwareUpdateParams* params = reinterpret_cast<FirmwareUpdateParams*>(parameter);

    if (ESP.getMaxAllocHeap() < 22000) {
        wsSerial("Error: Not enough memory left. Restart the esp32 and try updating again.");
        wsSerial("[reboot]");
    } else {
        const char* url = params->url.c_str();
        const char* md5 = params->md5.c_str();
        const size_t size = params->size;
        updateFirmware(url, md5, size);
    }

    delete params;
    vTaskDelete(NULL);
}

void updateFirmware(const char* url, const char* expectedMd5, const size_t size) {
    util::printHeap();

    config.runStatus = RUNSTATUS_STOP;
    vTaskDelay(3000 / portTICK_PERIOD_MS);
    saveDB("/current/tagDB.json");
    // destroyDB();

    HTTPClient httpClient;

    wsSerial("start downloading");
    wsSerial(url);

    httpClient.begin(url);
    httpClient.setFollowRedirects(HTTPC_FORCE_FOLLOW_REDIRECTS);
    util::printHeap();
    const int httpCode = httpClient.GET();
    util::printHeap();

    if (httpCode == HTTP_CODE_OK) {
        if (Update.begin(size)) {
            Update.setMD5(expectedMd5);

            unsigned long progressTimer = millis();
            Update.onProgress([&progressTimer](size_t progress, size_t total) {
                if (millis() - progressTimer > 500 || progress == total) {
                    char buffer[50];
                    sprintf(buffer, "Progress: %u%% %d %d", progress * 100 / total, progress, total);
                    wsSerial(String(buffer));
                    progressTimer = millis();
                    vTaskDelay(1 / portTICK_PERIOD_MS);
                }
            });

            const size_t written = Update.writeStream(httpClient.getStream());
            if (written == httpClient.getSize()) {
                if (Update.end(true)) {
                    wsSerial("Firmware update successful");
                    wsSerial("Reboot system now");
                    wsSerial("[reboot]");
                    vTaskDelay(1000 / portTICK_PERIOD_MS);
                } else {
                    wsSerial("Error updating firmware:");
                    wsSerial(Update.errorString());
                }
            } else {
                wsSerial("Error writing firmware data:");
                wsSerial(Update.errorString());
            }
        } else {
            wsSerial("Failed to begin firmware update");
            wsSerial(Update.errorString());
        }
    } else {
        wsSerial("Failed to download firmware file (HTTP code " + String(httpCode) + ")");
        wsSerial(httpClient.errorToString(httpCode));
    }

    httpClient.end();
    config.runStatus = RUNSTATUS_RUN;
}

void handleRollback(AsyncWebServerRequest* request) {
    if (Update.canRollBack()) {
        const bool rollbackSuccess = Update.rollBack();
        if (rollbackSuccess) {
            request->send(200, "Rollback successful");
            wsSerial("Rollback successful");
            wsSerial("Reboot system now");
            wsSerial("[reboot]");
            vTaskDelay(1000 / portTICK_PERIOD_MS);
        } else {
            wsSerial("Rollback failed");
            request->send(400, "Rollback failed");
        }
    } else {
        wsSerial("Rollback not allowed");
        request->send(400, "Rollback not allowed");
    }
}

#ifdef C6_OTA_FLASHING
void C6firmwareUpdateTask(void* parameter) {
    char* urlPtr = reinterpret_cast<char*>(parameter);

    LOG("C6firmwareUpdateTask: url '%s'\n", urlPtr);
    wsSerial("Stopping AP service");

    gSerialTaskState = SERIAL_STATE_STOP;
    config.runStatus = RUNSTATUS_STOP;
    setAPstate(false, AP_STATE_FLASHING);
#ifndef FLASHER_DEBUG_SHARED
    extern bool rxSerialStopTask2;
    rxSerialStopTask2 = true;
#endif
    vTaskDelay(500 / portTICK_PERIOD_MS);
    Serial1.end();
    setAPstate(false, AP_STATE_FLASHING);

    wsSerial(SHORT_CHIP_NAME " flash starting");

    bool result = FlashC6_H2(urlPtr);

    wsSerial(SHORT_CHIP_NAME " flash end");

    if (result) {
        setAPstate(false, AP_STATE_OFFLINE);

        wsSerial("Finishing config...");
        vTaskDelay(3000 / portTICK_PERIOD_MS);

        wsSerial("starting monitor");
        Serial1.begin(115200, SERIAL_8N1, FLASHER_AP_RXD, FLASHER_AP_TXD);
#ifndef FLASHER_DEBUG_SHARED
        rxSerialStopTask2 = false;
        xTaskCreate(rxSerialTask2, "rxSerialTask2", 1850, NULL, 2, NULL);
#endif
        vTaskDelay(1000 / portTICK_PERIOD_MS);

        apInfo.version = 0;
        wsSerial("bringing AP online");
        // if (bringAPOnline(AP_STATE_REQUIRED_POWER_CYCLE)) config.runStatus = RUNSTATUS_STOP;
        if (bringAPOnline(AP_STATE_ONLINE)) {
            config.runStatus = RUNSTATUS_RUN;
            setAPstate(true, AP_STATE_ONLINE);
        }

        // Wait for version info to arrive
        vTaskDelay(500 / portTICK_PERIOD_MS);
        if (apInfo.version == 0) {
            result = false;
        }
    }

    if (result) {
        wsSerial("Finished!");
        char buffer[50];
        snprintf(buffer, sizeof(buffer),
                 "ESP32-" SHORT_CHIP_NAME " version is now %04x", apInfo.version);
        wsSerial(String(buffer));
    } else if (apInfo.version == 0) {
        wsSerial("AP failed to come online. :-(");
    } else {
        wsSerial("Flashing failed. :-(");
    }
    // wsSerial("Reboot system now");
    // wsSerial("[reboot]");
    free(urlPtr);
    vTaskDelay(30000 / portTICK_PERIOD_MS);
    vTaskDelete(NULL);
}

void C6OTAFlashTask(void* parameter) {
    struct FlashParams {
        String firmwareFile;
        String comPort;
        bool eraseFlash;
        bool verifyFlash;
        bool resetAfterFlash;
        int baudRate;
    };

    FlashParams* params = reinterpret_cast<FlashParams*>(parameter);

    wsSerial("C6 OTA Flash Task starting");
    wsSerial("Firmware: " + params->firmwareFile);
    wsSerial("COM Port: " + params->comPort);
    wsSerial("Baud Rate: " + String(params->baudRate));

    bool flashResult = false;

    // Validate firmware file exists and is accessible
    if (!contentFS->exists(params->firmwareFile)) {
        wsSerial("Error: Firmware file not found: " + params->firmwareFile);
        delete params;
        vTaskDelete(NULL);
        return;
    }

    File firmwareFileHandle = contentFS->open(params->firmwareFile, "r");
    if (!firmwareFileHandle) {
        wsSerial("Error: Cannot open firmware file for reading");
        delete params;
        vTaskDelete(NULL);
        return;
    }

    size_t firmwareSize = firmwareFileHandle.size();
    firmwareFileHandle.close();

    if (firmwareSize == 0) {
        wsSerial("Error: Firmware file is empty");
        delete params;
        vTaskDelete(NULL);
        return;
    }

    wsSerial("Firmware size: " + String(firmwareSize) + " bytes");

    // Stop current AP services
    wsSerial("Stopping AP service for OTA flash");
    gSerialTaskState = SERIAL_STATE_STOP;
    ::config.runStatus = RUNSTATUS_STOP;
    setAPstate(false, AP_STATE_FLASHING);

#ifndef FLASHER_DEBUG_SHARED
    extern bool rxSerialStopTask2;
    rxSerialStopTask2 = true;
#endif

    vTaskDelay(500 / portTICK_PERIOD_MS);
    Serial1.end();

    wsSerial("Starting C6 external flash process");

    // Initialize hardware UART for ESP32-C6 communication
    // Using UART2 for external communication to ESP32-C6
    HardwareSerial C6Serial(2);
    C6Serial.begin(params->baudRate, SERIAL_8N1, FLASHER_DEBUG_RXD, FLASHER_DEBUG_TXD);

    // Wait for serial to be ready
    vTaskDelay(100 / portTICK_PERIOD_MS);

    // Implementation using ESP serial flasher library for ESP32-C6
    const loader_esp32_config_t loaderConfig = {
        .baud_rate = static_cast<uint32_t>(params->baudRate),
        .uart_port = 2,  // Using UART2 for C6 communication
        .uart_rx_pin = FLASHER_DEBUG_RXD,
        .uart_tx_pin = FLASHER_DEBUG_TXD,
        .reset_trigger_pin = FLASHER_DEBUG_PROG,  // Reset pin for C6
        .gpio0_trigger_pin = FLASHER_DEBUG_PROG,  // Boot pin for C6
        .rx_buffer_size = 0,                      // Use default
        .tx_buffer_size = 0,                      // Use default
        .queue_size = 0,                          // Use default
        .uart_queue = NULL                        // Not needed
    };

    wsSerial("Initializing ESP32-C6 serial connection...");

    if (loader_port_esp32_init(&loaderConfig) != ESP_LOADER_SUCCESS) {
        wsSerial("Error: Failed to initialize serial connection to ESP32-C6");
        flashResult = false;
    } else {
        wsSerial("Serial connection initialized successfully");

        // Connect to ESP32-C6
        esp_loader_connect_args_t connect_config = ESP_LOADER_CONNECT_DEFAULT();
        esp_loader_error_t err = esp_loader_connect(&connect_config);

        if (err != ESP_LOADER_SUCCESS) {
            wsSerial("Error: Cannot connect to ESP32-C6. Error code: " + String(err));
            flashResult = false;
        } else {
            wsSerial("Connected to ESP32-C6 successfully");

            // Verify chip type
            if (esp_loader_get_target() != ESP32C6_CHIP) {
                wsSerial("Error: Connected device is not ESP32-C6");
                flashResult = false;
            } else {
                wsSerial("ESP32-C6 chip detected");

                // Optionally erase flash if requested
                if (params->eraseFlash) {
                    wsSerial("Erasing ESP32-C6 flash...");
                    err = esp_loader_flash_start(0x0, firmwareSize, 1024);
                    if (err != ESP_LOADER_SUCCESS) {
                        wsSerial("Error: Flash erase failed. Error code: " + String(err));
                        flashResult = false;
                    } else {
                        wsSerial("Flash erased successfully");
                    }
                }

                if (err == ESP_LOADER_SUCCESS) {
                    // Flash the firmware
                    wsSerial("Starting firmware flash...");
                    String firmwareFileStr = params->firmwareFile;
                    err = flash_binary(firmwareFileStr, 0x0);

                    if (err == ESP_LOADER_SUCCESS) {
                        wsSerial("Firmware flashed successfully");

                        if (params->verifyFlash) {
                            wsSerial("Verifying flash...");
#if MD5_ENABLED
                            err = esp_loader_flash_verify();
                            if (err == ESP_LOADER_ERROR_UNSUPPORTED_FUNC) {
                                wsSerial("Warning: Flash verification not supported by target");
                                flashResult = true;  // Continue as success
                            } else if (err != ESP_LOADER_SUCCESS) {
                                wsSerial("Error: Flash verification failed");
                                flashResult = false;
                            } else {
                                wsSerial("Flash verification successful");
                                flashResult = true;
                            }
#else
                            wsSerial("Flash verification skipped (MD5 not enabled)");
                            flashResult = true;
#endif
                        } else {
                            flashResult = true;
                        }

                        if (flashResult && params->resetAfterFlash) {
                            wsSerial("Resetting ESP32-C6...");
                            // The reset will happen automatically when we disconnect
                        }
                    } else {
                        wsSerial("Error: Firmware flash failed. Error code: " + String(err));
                        flashResult = false;
                    }
                }
            }
        }

        // Clean up serial flasher
        loader_port_esp32_deinit();
    }

    // Close C6 serial connection
    C6Serial.end();

    if (flashResult) {
        wsSerial("✅ C6 OTA flash completed successfully!");

        // Wait for C6 to boot up
        wsSerial("Waiting for ESP32-C6 to boot...");
        vTaskDelay(3000 / portTICK_PERIOD_MS);

        // Restart services
        wsSerial("Restarting AP services");
        Serial1.begin(115200, SERIAL_8N1, FLASHER_AP_RXD, FLASHER_AP_TXD);

#ifndef FLASHER_DEBUG_SHARED
        rxSerialStopTask2 = false;
        xTaskCreate(rxSerialTask2, "rxSerialTask2", 1850, NULL, 2, NULL);
#endif

        vTaskDelay(1000 / portTICK_PERIOD_MS);

        if (bringAPOnline(AP_STATE_ONLINE)) {
            ::config.runStatus = RUNSTATUS_RUN;
            setAPstate(true, AP_STATE_ONLINE);
            wsSerial("AP back online after C6 flash");
        } else {
            wsSerial("Warning: AP failed to come back online");
            ::config.runStatus = RUNSTATUS_RUN;
        }
    } else {
        wsSerial("❌ C6 OTA flash failed!");

        // Try to restore normal operation
        wsSerial("Attempting to restore normal operation...");
        Serial1.begin(115200, SERIAL_8N1, FLASHER_AP_RXD, FLASHER_AP_TXD);

#ifndef FLASHER_DEBUG_SHARED
        rxSerialStopTask2 = false;
        xTaskCreate(rxSerialTask2, "rxSerialTask2", 1850, NULL, 2, NULL);
#endif

        ::config.runStatus = RUNSTATUS_RUN;
        setAPstate(false, AP_STATE_OFFLINE);
    }

    // Clean up
    delete params;

    vTaskDelay(5000 / portTICK_PERIOD_MS);
    vTaskDelete(NULL);
}
#endif

void handleUpdateC6(AsyncWebServerRequest* request) {
#if defined C6_OTA_FLASHING
    if (request->hasParam("url", true)) {
        const char* urlStr = request->getParam("url", true)->value().c_str();
        char* urlCopy = strdup(urlStr);
        xTaskCreate(C6firmwareUpdateTask, "OTAUpdateTask", 6400, urlCopy, 10, NULL);
        request->send(200, "Ok");
    } else {
        LOG("Sending bad request");
        request->send(400, "Bad request");
    }
#elif defined(SHORT_CHIP_NAME)
    request->send(400, SHORT_CHIP_NAME " flashing not implemented");
#else
    request->send(400, "C6/H2 flashing not implemented");
#endif
}

void handleUpdateActions(AsyncWebServerRequest* request) {
    wsSerial("Performing cleanup");
    File file = contentFS->open("/update_actions.json", "r");
    if (!file) {
        wsSerial("No update_actions.json present");
        request->send(200, "No update actions needed");
        return;
    }
    JsonDocumentz doc(2048);
    DeserializationError error = deserializeJson(doc, file);
    const JsonArray deleteFiles = doc["deletefile"].as<JsonArray>();
    for (const auto& filePath : deleteFiles) {
        if (contentFS->remove(filePath.as<const char*>())) {
            wsSerial("deleted file: " + filePath.as<String>());
        }
    }
    file.close();
    wsSerial("Cleanup finished");
    request->send(200, "Clean up finished");
    contentFS->remove("/update_actions.json");
}
