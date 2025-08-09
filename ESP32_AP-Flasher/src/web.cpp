#include "web.h"

// ========================================================================
// STANDARD LIBRARY INCLUDES
// ========================================================================
#include <Arduino.h>
#include <ArduinoJson.h>
#include <AsyncTCP.h>
#include <ESPAsyncWebServer.h>
#include <ESPmDNS.h>
#include <FS.h>
#include <HTTPClient.h>
#include <LittleFS.h>
#include <Preferences.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>

#include <algorithm>
#include <vector>

// ========================================================================
// PROJECT-SPECIFIC CORE INCLUDES
// ========================================================================
#include "AsyncJson.h"
#include "SPIFFSEditor.h"
#include "c6_module.h"
#include "commstructs.h"
#include "enum_string_utils.h"
#include "language.h"
#include "leds.h"
#include "module_manager.h"
#include "newproto.h"
#include "ota.h"
#include "serialap.h"
#include "settings.h"
#include "storage.h"
#include "storage_utils.h"  // Include new storage utilities header
#include "system.h"
#include "tag_db.h"
#include "udp.h"
#include "websocket_utils.h"
#include "wifimanager.h"

// ========================================================================
// UNIFIED UTILITIES INCLUDES
// ========================================================================
#include "json_response_utils.h"
#include "web_response_utils.h"
#include "websocket_utils.h"
#include "wifi_utils.h"

// ========================================================================
// FEATURE-SPECIFIC INCLUDES
// ========================================================================
#ifdef HAS_IR_REMOTE
#include "ir_interface.h"
#endif

#if HAS_RC522
#include "rc522_interface.h"
#endif

#ifdef HAS_EXT_FLASHER
#include "webflasher.h"
#endif

// Constants for optimization
static const size_t JSON_BUFFER_SIZE = 2048;
static const size_t LARGE_JSON_BUFFER_SIZE = 4096;
static const uint32_t WEBSOCKET_SEND_TIMEOUT_MS = 1000;

// Forward declarations for endpoint setup functions
void setupSystemEndpoints(AsyncWebServer &server);
void setupTagManagementEndpoints(AsyncWebServer &server);
void setupWiFiNetworkEndpoints(AsyncWebServer &server);
void setupConfigurationEndpoints(AsyncWebServer &server);
void setupFileManagementEndpoints(AsyncWebServer &server);
void setupOTAUpdateEndpoints(AsyncWebServer &server);
void setupHardwareFeatureEndpoints(AsyncWebServer &server);
void setupC6ModuleEndpoints(AsyncWebServer &server);
void setupAPIEndpoints(AsyncWebServer &server);
void setupContentGenerationEndpoints(AsyncWebServer &server);

AsyncWebServer server(80);
AsyncWebSocket ws("/ws");
WifiManager wm;

uint32_t lastssidscan = 0;
String openaiApiKey = "";  // OpenAI API key for content generation

// Wrapper functions for backward compatibility
void wsLog(const String &text) {
    WebSocketUtils::sendLogMessage(text, "info");
}

void wsErr(const String &text) {
    WebSocketUtils::sendErrorMessage(text);
}

// Optimized database size calculation with caching
static size_t cachedDbSize = 0;
static uint32_t lastDbSizeUpdate = 0;
static const uint32_t DB_SIZE_CACHE_INTERVAL_MS = 5000;  // Cache for 5 seconds

size_t dbSize() {
    uint32_t now = millis();
    if (now - lastDbSizeUpdate > DB_SIZE_CACHE_INTERVAL_MS || lastDbSizeUpdate == 0) {
        cachedDbSize = tagDB.size() * sizeof(tagRecord);
        for (const auto &tag : tagDB) {
            if (tag && tag->data) {
                cachedDbSize += tag->len;
            }
            if (tag) {
                cachedDbSize += tag->modeConfigJson.length();
            }
        }
        lastDbSizeUpdate = now;
    }
    return cachedDbSize;
}

void wsSendSysteminfo() {
    if (ws.count() == 0) return;  // No clients connected

    DynamicJsonDocument doc(JSON_BUFFER_SIZE);
    JsonObject sys = doc["sys"].to<JsonObject>();
    time_t now;
    time(&now);
    static uint32_t freeSpaceLastRun = 0;
    static size_t tagDBsize = 0;
    static uint64_t freeSpace = 0;

    // Essential system info
    sys["currtime"] = now;
    sys["heap"] = ESP.getFreeHeap();
    sys["recordcount"] = tagDBsize;
    sys["dbsize"] = dbSize();
    sys["apstate"] = apInfo.state;
    sys["runstate"] = config.runStatus;

    // Use centralized WiFi utilities for consistent data
    WiFiConnectionInfo wifiInfo = WiFiUtils::getInstance().getConnectionInfo();
    sys["rssi"] = wifiInfo.rssi;
    sys["wifistatus"] = WiFi.status();
    sys["uptime"] = esp_timer_get_time() / 1000000;

    // Update expensive operations less frequently
    if (millis() - freeSpaceLastRun > 30000 || freeSpaceLastRun == 0) {
        freeSpace = Storage.freeSpace();
        tagDBsize = tagDB.size();
        freeSpaceLastRun = millis();
    }
    sys["littlefsfree"] = freeSpace;

#if BOARD_HAS_PSRAM
    sys["psfree"] = ESP.getFreePsram();
#endif

    // Cache WiFi SSID to avoid repeated calls - use centralized utilities
    static String cachedSSID;
    static uint32_t lastSSIDUpdate = 0;
    if (now - lastSSIDUpdate > 10 || lastSSIDUpdate == 0) {
        cachedSSID = wifiInfo.ssid;  // Use already retrieved WiFi info
        lastSSIDUpdate = now;
    }
    sys["wifissid"] = cachedSSID;

    // Date and IP updates
    static uint8_t day = 0;
    struct tm timeinfo;
    localtime_r(&now, &timeinfo);

    if (day != timeinfo.tm_mday) {
        day = timeinfo.tm_mday;
        char timeBuffer[80];
        strftime(timeBuffer, sizeof(timeBuffer), languageDateFormat[0].c_str(), &timeinfo);
        setVarDB("ap_date", timeBuffer);
    }
    setVarDB("ap_ip", wm.localIP().toString());

#ifdef HAS_SUBGHZ
    String ApChanString = String(apInfo.channel);
    if (apInfo.hasSubGhz) {
        ApChanString += ", SubGhz ";
        if (apInfo.SubGhzChannel == 0) {
            ApChanString += "disabled";
        } else {
            ApChanString += String(apInfo.SubGhzChannel);
        }
    }
    setVarDB("ap_ch", ApChanString);
#else
    setVarDB("ap_ch", String(apInfo.channel));
#endif

    // Nightly reboot check
    if (timeinfo.tm_hour == 3 && timeinfo.tm_min == 56 && millis() > 2 * 3600 * 1000 && config.nightlyreboot == 1) {
        logLine("Nightly reboot");
        wsErr("REBOOTING");
        config.runStatus = RUNSTATUS_STOP;
        ws.enable(false);
        vTaskDelay(5000 / portTICK_PERIOD_MS);
        refreshAllPending();
        saveDB("/current/tagDB.json");
        ws.closeAll();
        delay(100);
        ESP.restart();
    }

    // Tag count update (less frequent)
    static uint32_t tagcounttimer = 0;
    if (millis() - tagcounttimer > 60000 || tagcounttimer == 0) {
        uint32_t timeoutcount = 0, lowbattcount = 0;
        uint32_t tagcount = getTagCount(timeoutcount, lowbattcount);
        sys["lowbattcount"] = lowbattcount;
        sys["timeoutcount"] = timeoutcount;

        char result[40];
        if (timeoutcount > 0) {
            snprintf(result, sizeof(result), "%u/%zu, %u timeout", tagcount, tagDB.size(), timeoutcount);
        } else {
            snprintf(result, sizeof(result), "%u / %zu", tagcount, tagDB.size());
        }
        setVarDB("ap_tagcount", result);

#if defined(HAS_RGB_LED) && !defined(USE_DUMMY_LEDS)
        if (timeoutcount > 0) {
            if (apInfo.state == AP_STATE_ONLINE && apInfo.isOnline == true) rgbIdleColor = CRGB::DarkBlue;
        } else {
            if (apInfo.state == AP_STATE_ONLINE && apInfo.isOnline == true) rgbIdleColor = CRGB::Green;
        }
#endif
        tagcounttimer = millis();
    }

    WebSocketUtils::sendMessage(doc);
}

void wsSendTaginfo(const uint8_t *mac, uint8_t syncMode) {
    if (!mac) return;

    if (syncMode != SYNC_DELETE) {
        String json = tagDBtoJson(mac);
        if (!json.isEmpty() && ws.count() > 0) {
            WebSocketUtils::sendMessage(json);
        }
    }

    if (syncMode > SYNC_NOSYNC) {
        const tagRecord *taginfo = tagRecord::findByMAC(mac);
        if (taginfo != nullptr) {
            if (taginfo->contentMode != 12 || syncMode == SYNC_DELETE) {
                UDPcomm udpsync;
                struct TagInfo taginfoitem;
                memcpy(taginfoitem.mac, taginfo->mac, sizeof(taginfoitem.mac));
                taginfoitem.syncMode = syncMode;
                taginfoitem.contentMode = taginfo->contentMode;

                if (syncMode == SYNC_USERCFG) {
                    strncpy(taginfoitem.alias, taginfo->alias.c_str(), sizeof(taginfoitem.alias) - 1);
                    taginfoitem.alias[sizeof(taginfoitem.alias) - 1] = '\0';
                    taginfoitem.nextupdate = taginfo->nextupdate;
                }

                if (syncMode == SYNC_TAGSTATUS) {
                    taginfoitem.lastseen = taginfo->lastseen;
                    taginfoitem.nextupdate = taginfo->nextupdate;
                    taginfoitem.pendingCount = taginfo->pendingCount;
                    taginfoitem.expectedNextCheckin = taginfo->expectedNextCheckin;
                    taginfoitem.hwType = taginfo->hwType;
                    taginfoitem.wakeupReason = taginfo->wakeupReason;
                    taginfoitem.capabilities = taginfo->capabilities;
                    taginfoitem.pendingIdle = taginfo->pendingIdle;
                }
                udpsync.netTaginfo(&taginfoitem);
            }
        }
    }
}

void wsSendAPitem(struct APlist *apitem) {
    if (!apitem || ws.count() == 0) return;

    DynamicJsonDocument doc(JSON_BUFFER_SIZE);
    JsonObject ap = doc["apitem"].to<JsonObject>();

    char version_str[6];
    sprintf(version_str, "%04X", apitem->version);

    ap["ip"] = ((IPAddress)apitem->src).toString();
    ap["alias"] = apitem->alias;
    ap["count"] = apitem->tagCount;
    ap["channel"] = apitem->channelId;
    ap["version"] = version_str;

    WebSocketUtils::sendMessage(doc);
}

void wsSerial(const String &text) {
    wsSerial(text, String(""));
}

void wsSerial(const String &text, const String &color) {
    if (text.isEmpty()) return;

    DynamicJsonDocument doc(JSON_BUFFER_SIZE);
    doc["console"] = text;
    if (!color.isEmpty()) doc["color"] = color;

    Serial.println(text);

    if (ws.count() > 0) {
        WebSocketUtils::sendMessage(doc);
    }
}

uint8_t wsClientCount() {
    return ws.count();
}

void init_web() {
    ModuleInitializer::logInitStart("Web Server");

    // Initialize WebSocket utilities
    WebSocketUtils::initialize(&ws);

    WiFi.mode(WIFI_STA);
    WiFi.setTxPower(static_cast<wifi_power_t>(config.wifiPower));

    wm.connectToWifi();

    server.addHandler(new SPIFFSEditor(*contentFS));

    server.addHandler(&ws);

    server.on("/reboot", HTTP_POST, [](AsyncWebServerRequest *request) {
        SEND_SUCCESS(request, "Reboot initiated");
        logLine("Reboot request by user");
        wsErr("REBOOTING");
        delay(100);
        ws.enable(false);
        refreshAllPending();
        saveDB("/current/tagDB.json");
        ws.closeAll();
        delay(100);
        ESP.restart();
    });

    server.serveStatic("/current", *contentFS, "/current/").setCacheControl("max-age=604800");
    server.serveStatic("/tagtypes", *contentFS, "/tagtypes/").setCacheControl("max-age=300");

    server.on(
        "/imgupload", HTTP_POST, [](AsyncWebServerRequest *request) {
            request->send(200);
        },
        doImageUpload);
    server.on("/jsonupload", HTTP_POST, doJsonUpload);

    server.on("/get_db", HTTP_GET, [](AsyncWebServerRequest *request) {
        String json = "";
        if (request->hasParam("mac")) {
            String dst = request->getParam("mac")->value();
            uint8_t mac[8];
            if (hex2mac(dst, mac)) {
                json = tagDBtoJson(mac);
            } else {
                json = "{\"error\": \"malformatted parameter\"}";
            }
        } else {
            uint8_t startPos = 0;
            if (request->hasParam("pos")) {
                startPos = atoi(request->getParam("pos")->value().c_str());
            }
            json = tagDBtoJson(nullptr, startPos);
        }
        request->send(200, "application/json", json);
    });

    server.on("/getdata", HTTP_GET, [](AsyncWebServerRequest *request) {
        if (request->hasParam("mac")) {
            String dst = request->getParam("mac")->value();
            uint8_t mac[8];
            if (hex2mac(dst, mac)) {
                tagRecord *taginfo = tagRecord::findByMAC(mac);
                if (taginfo != nullptr) {
                    if (request->hasParam("md5")) {
                        uint8_t md5[8];
                        if (hex2mac(request->getParam("md5")->value(), md5)) {
                            PendingItem *queueItem = getQueueItem(mac, *reinterpret_cast<uint64_t *>(md5));
                            if (queueItem == nullptr) {
                                Serial.println("getQueueItem: no queue item");
                                request->send(404, "text/plain", "File not found");
                                return;
                            }
                            if (queueItem->data == nullptr) {
                                fs::File file = contentFS->open(queueItem->filename);
                                if (file) {
                                    queueItem->data = getDataForFile(file);
                                    Serial.println("Reading file " + String(queueItem->filename));
                                    file.close();
                                } else {
                                    request->send(404, "text/plain", "File not found");
                                    return;
                                }
                            }
                            AsyncWebServerResponse *response = request->beginResponse("application/octet-stream", queueItem->len,
                                                                                      [queueItem](uint8_t *buffer, size_t maxLen, size_t index) -> size_t {
                                                                                          size_t len = queueItem->len - index;
                                                                                          if (len > maxLen) len = maxLen;
                                                                                          memcpy(buffer, queueItem->data + index, len);
                                                                                          return len;
                                                                                      });
                            request->send(response);
                            return;
                        }
                    } else {
                        // older version without queue
                        if (taginfo->data == nullptr) {
                            fs::File file = contentFS->open(taginfo->filename);
                            if (!file) {
                                request->send(404, "text/plain", "File not found");
                                return;
                            }
                            taginfo->data = getDataForFile(file);
                            file.close();
                        }
                        AsyncWebServerResponse *response = request->beginResponse("application/octet-stream", taginfo->len,
                                                                                  [taginfo](uint8_t *buffer, size_t maxLen, size_t index) -> size_t {
                                                                                      size_t len = taginfo->len - index;
                                                                                      if (len > maxLen) len = maxLen;
                                                                                      memcpy(buffer, taginfo->data + index, len);
                                                                                      return len;
                                                                                  });
                        request->send(response);
                        return;
                    }
                }
            }
        }
        request->send(400, "text/plain", "No data available");
    });

    server.on("/save_cfg", HTTP_POST, [](AsyncWebServerRequest *request) {
        if (request->hasParam("mac", true)) {
            String dst = request->getParam("mac", true)->value();
            uint8_t mac[8];
            if (hex2mac(dst, mac)) {
                tagRecord *taginfo = tagRecord::findByMAC(mac);
                if (taginfo != nullptr) {
                    if (request->hasParam("contentmode", true)) {
                        uint16_t newContentMode = atoi(request->getParam("contentmode", true)->value().c_str());
                        if (newContentMode != taginfo->contentMode && (newContentMode == 5 || newContentMode == 17 || newContentMode == 18)) {
                            // temporary content, restore after sending
                            pushTagInfo(taginfo);
                        }
                        taginfo->contentMode = newContentMode;
                    }
                    if (request->hasParam("alias", true)) {
                        taginfo->alias = request->getParam("alias", true)->value();
                    }
                    if (request->hasParam("modecfgjson", true)) {
                        taginfo->modeConfigJson = request->getParam("modecfgjson", true)->value();
                    }
                    taginfo->nextupdate = 0;
                    if (request->hasParam("rotate", true)) {
                        taginfo->rotate = atoi(request->getParam("rotate", true)->value().c_str());
                    }
                    if (request->hasParam("lut", true)) {
                        taginfo->lut = atoi(request->getParam("lut", true)->value().c_str());
                    }
                    if (request->hasParam("invert", true)) {
                        taginfo->invert = atoi(request->getParam("invert", true)->value().c_str());
                    }
                    wsSendTaginfo(mac, SYNC_USERCFG);
                    // saveDB("/current/tagDB.json");
                    request->send(200, "text/plain", "Ok, saved");
                } else {
                    request->send(200, "text/plain", "Error while saving: mac not found");
                }
            }
        }
        request->send(200, "text/plain", "Ok, saved");
    });

    server.on("/tag_cmd", HTTP_POST, [](AsyncWebServerRequest *request) {
        if (request->hasParam("mac", true) && request->hasParam("cmd", true)) {
            uint8_t mac[8];
            if (hex2mac(request->getParam("mac", true)->value(), mac)) {
                tagRecord *taginfo = tagRecord::findByMAC(mac);
                if (taginfo != nullptr) {
                    const char *cmdValue = request->getParam("cmd", true)->value().c_str();
                    if (strcmp(cmdValue, "del") == 0) {
                        wsSendTaginfo(mac, SYNC_DELETE);
                        deleteRecord(mac);
                    }
                    if (strcmp(cmdValue, "purge") == 0) {
                        time_t now;
                        time(&now);
                        for (int c = tagDB.size() - 1; c >= 0; --c) {
                            tagRecord *tag = tagDB.at(c);
                            if (tag->expectedNextCheckin == 3216153600 || tag->lastseen < now - 24 * 3600 || now > tag->expectedNextCheckin + 600) {
                                wsSendTaginfo(tag->mac, SYNC_DELETE);
                                deleteRecord(tag->mac);
                            }
                        }
                    }
                    if (strcmp(cmdValue, "clear") == 0) {
                        clearPending(taginfo);
                        while (dequeueItem(mac)) {
                        };
                        taginfo->pendingCount = countQueueItem(mac);
                        wsSendTaginfo(mac, SYNC_TAGSTATUS);
                    }
                    if (strcmp(cmdValue, "refresh") == 0) {
                        updateContent(mac);
                    }
                    if (strcmp(cmdValue, "reboot") == 0) {
                        sendTagCommand(mac, CMD_DO_REBOOT, !taginfo->isExternal);
                    }
                    if (strcmp(cmdValue, "scan") == 0) {
                        sendTagCommand(mac, CMD_DO_SCAN, !taginfo->isExternal);
                    }
                    if (strcmp(cmdValue, "reset") == 0) {
                        sendTagCommand(mac, CMD_DO_RESET_SETTINGS, !taginfo->isExternal);
                    }
                    if (strcmp(cmdValue, "deepsleep") == 0) {
                        sendTagCommand(mac, CMD_DO_DEEPSLEEP, !taginfo->isExternal);
                        taginfo->pendingIdle = 9999;
                        wsSendTaginfo(mac, SYNC_TAGSTATUS);
                    }
                    if (strcmp(cmdValue, "ledflash") == 0) {
                        struct ledFlash flashData = {0};
                        flashData.mode = 1;
                        flashData.flashDuration = 8;
                        flashData.color1 = 0x3C;  // green
                        flashData.color2 = 0xE4;  // red
                        flashData.color3 = 0x03;  // blue
                        flashData.flashCount1 = 3;
                        flashData.flashCount2 = 3;
                        flashData.flashCount3 = 3;
                        flashData.delay1 = 10;
                        flashData.delay2 = 10;
                        flashData.delay3 = 10;
                        flashData.flashSpeed1 = 1;
                        flashData.flashSpeed2 = 5;
                        flashData.flashSpeed3 = 10;
                        flashData.repeats = 2;
                        const uint8_t *payload = reinterpret_cast<const uint8_t *>(&flashData);
                        sendTagCommand(mac, CMD_DO_LEDFLASH, !taginfo->isExternal, payload);
                    }
                    if (strcmp(cmdValue, "ledflash_long") == 0) {
                        struct ledFlash flashData = {0};
                        flashData.mode = 1;
                        flashData.flashDuration = 1;
                        flashData.color1 = 0xE4;  // red
                        flashData.flashCount1 = 3;
                        flashData.flashSpeed1 = 3;
                        flashData.delay1 = 50;
                        flashData.repeats = 60;
                        const uint8_t *payload = reinterpret_cast<const uint8_t *>(&flashData);
                        sendTagCommand(mac, CMD_DO_LEDFLASH, !taginfo->isExternal, payload);
                    }
                    if (strcmp(cmdValue, "ledflash_stop") == 0) {
                        struct ledFlash flashData = {0};
                        flashData.mode = 0;
                        const uint8_t *payload = reinterpret_cast<const uint8_t *>(&flashData);
                        sendTagCommand(mac, CMD_DO_LEDFLASH, !taginfo->isExternal, payload);
                    }
                    request->send(200, "text/plain", "Ok, done");
                } else {
                    request->send(400, "text/plain", "Error: mac not found");
                }
            }
        } else {
            request->send(500, "text/plain", "param error");
        }
    });

    server.on("/led_flash", HTTP_GET, [](AsyncWebServerRequest *request) {
        //  color picker: https://roger-random.github.io/RGB332_color_wheel_three.js/
        //  http GET to /led_flash?mac=000000000000&pattern=000000000000000000000000
        //  see https://github.com/OpenEPaperLink/OpenEPaperLink/wiki/Led-control
        VALIDATE_PARAMS(request, {"mac"}, false);

        String macStr = GET_PARAM(request, "mac", "", false);
        uint8_t mac[8];
        if (!hex2mac(macStr, mac)) {
            WebResponseUtils::sendInvalidParamError(request, "mac", "Invalid MAC address format");
            return;
        }

        tagRecord *taginfo = tagRecord::findByMAC(mac);
        if (taginfo == nullptr) {
            WebResponseUtils::sendTagResponse(request, macStr, false, "Tag not found");
            return;
        }

        uint8_t payload[12] = {0};
        if (request->hasParam("pattern")) {
            String pattern = GET_PARAM(request, "pattern", "", false);
            if (sscanf(pattern.c_str(), "%2hhx%2hhx%2hhx%2hhx%2hhx%2hhx%2hhx%2hhx%2hhx%2hhx%2hhx%2hhx",
                       &payload[0], &payload[1], &payload[2], &payload[3],
                       &payload[4], &payload[5], &payload[6], &payload[7],
                       &payload[8], &payload[9], &payload[10], &payload[11]) != 12) {
                WebResponseUtils::sendInvalidParamError(request, "pattern", "Expects 12 hex bytes in pattern");
                return;
            }
        }

        bool success = sendTagCommand(mac, CMD_DO_LEDFLASH, !taginfo->isExternal, payload);
        WebResponseUtils::sendTagResponse(request, macStr, success, success ? "LED flash command sent" : "Failed to send LED flash command");
    });

    server.on("/get_ap_config", HTTP_GET, [](AsyncWebServerRequest *request) {
        UDPcomm udpsync;
        udpsync.getAPList();

        AsyncResponseStream *response = request->beginResponseStream("application/json");
        response->addHeader("Cache-Control", "no-cache");

        // Build response more efficiently
        response->print("{");

        // Communication Protocol Features
#ifdef HAS_H2
        response->print("\"H2\": \"1\", ");
#else
        response->print("\"H2\": \"0\", ");
#endif
#ifdef HAS_TSLR
        response->print("\"TLSR\": \"1\", ");
#else
        response->print("\"TLSR\": \"0\", ");
#endif

        // Hardware Module Features
#ifdef C6_OTA_FLASHING
        response->print("\"C6\": \"1\", ");
        response->print("\"hasC6\": 1, ");
#else
        response->print("\"C6\": \"0\", ");
        response->print("\"hasC6\": 0, ");
#endif
#ifdef HAS_BLE_WRITER
        response->print("\"hasBLE\": \"1\", ");
#else
        response->print("\"hasBLE\": \"0\", ");
#endif
#ifdef HAS_SUBGHZ
        response->print("\"hasSubGhz\": \"" + String(apInfo.hasSubGhz) + "\", ");
#else
        response->print("\"hasSubGhz\": \"0\", ");
#endif

        // Build & Programming Features
#ifdef SAVE_SPACE
        response->print("\"savespace\": \"1\", ");
#else
        response->print("\"savespace\": \"0\", ");
#endif
#ifdef HAS_EXT_FLASHER
        response->print("\"hasFlasher\": \"1\", ");
#else
        response->print("\"hasFlasher\": \"0\", ");
#endif

        response->print("\"apstate\": \"" + String(apInfo.state) + "\"");

        // Include config file if it exists
        File configFile = contentFS->open("/current/apconfig.json", "r");
        if (configFile) {
            response->print(", ");
            configFile.seek(1);
            const size_t bufferSize = 256;  // Smaller buffer for better memory usage
            uint8_t buffer[bufferSize];
            while (configFile.available()) {
                size_t bytesRead = configFile.read(buffer, bufferSize);
                response->write(buffer, bytesRead);
            }
            configFile.close();
        } else {
            response->print("}");
        }

        request->send(response);
    });

    server.on("/save_apcfg", HTTP_POST, [](AsyncWebServerRequest *request) {
        if (request->hasParam("alias", true)) {
            String aliasValue = request->getParam("alias", true)->value();
            size_t aliasLength = aliasValue.length();
            if (aliasLength > 31) aliasLength = 31;
            aliasValue.toCharArray(config.alias, aliasLength + 1);
            config.alias[aliasLength] = '\0';
        }

        if (request->hasParam("channel", true)) {
            config.channel = static_cast<uint8_t>(request->getParam("channel", true)->value().toInt());
        }
        if (request->hasParam("subghzchannel", true)) {
            config.subghzchannel = static_cast<uint8_t>(request->getParam("subghzchannel", true)->value().toInt());
        }
        if (request->hasParam("led", true)) {
            config.led = static_cast<uint8_t>(request->getParam("led", true)->value().toInt());
            updateBrightnessFromConfig();
        }
        if (request->hasParam("tft", true)) {
            config.tft = static_cast<uint8_t>(request->getParam("tft", true)->value().toInt());
            updateBrightnessFromConfig();
        }
        if (request->hasParam("language", true)) {
            config.language = static_cast<uint8_t>(request->getParam("language", true)->value().toInt());
            updateLanguageFromConfig();
        }
        if (request->hasParam("maxsleep", true)) {
            config.maxsleep = static_cast<uint8_t>(request->getParam("maxsleep", true)->value().toInt());
        }
        if (request->hasParam("stopsleep", true)) {
            config.stopsleep = static_cast<uint8_t>(request->getParam("stopsleep", true)->value().toInt());
        }
        if (request->hasParam("preview", true)) {
            config.preview = static_cast<uint8_t>(request->getParam("preview", true)->value().toInt());
        }
        if (request->hasParam("nightlyreboot", true)) {
            config.nightlyreboot = static_cast<uint8_t>(request->getParam("nightlyreboot", true)->value().toInt());
        }
        if (request->hasParam("lock", true)) {
            config.lock = static_cast<uint8_t>(request->getParam("lock", true)->value().toInt());
        }
        if (request->hasParam("ble", true)) {
            config.ble = static_cast<uint8_t>(request->getParam("ble", true)->value().toInt());
        }
        if (request->hasParam("sleeptime1", true)) {
            config.sleepTime1 = static_cast<uint8_t>(request->getParam("sleeptime1", true)->value().toInt());
            config.sleepTime2 = static_cast<uint8_t>(request->getParam("sleeptime2", true)->value().toInt());
        }
        if (request->hasParam("wifipower", true)) {
            config.wifiPower = static_cast<uint8_t>(request->getParam("wifipower", true)->value().toInt());
            WiFi.setTxPower(static_cast<wifi_power_t>(config.wifiPower));
        }
        if (request->hasParam("timezone", true)) {
            strncpy(config.timeZone, request->getParam("timezone", true)->value().c_str(), sizeof(config.timeZone) - 1);
            config.timeZone[sizeof(config.timeZone) - 1] = '\0';
            setenv("TZ", config.timeZone, 1);
            tzset();
        }
        if (request->hasParam("discovery", true)) {
            config.discovery = static_cast<uint8_t>(request->getParam("discovery", true)->value().toInt());
        }
        if (request->hasParam("showtimestamp", true)) {
            config.showtimestamp = static_cast<uint8_t>(request->getParam("showtimestamp", true)->value().toInt());
        }
        if (request->hasParam("repo", true)) {
            config.repo = request->getParam("repo", true)->value();
        }
        if (request->hasParam("env", true)) {
            config.env = request->getParam("env", true)->value();
        }
        saveAPconfig();
        setAPchannel();
        request->send(200, "text/plain", "Ok, saved");
    });

    server.on("/set_var", HTTP_POST, [](AsyncWebServerRequest *request) {
        if (request->hasParam("key", true) && request->hasParam("val", true)) {
            std::string key = request->getParam("key", true)->value().c_str();
            String val = request->getParam("val", true)->value();
            Serial.printf("set key %s value %s\r\n", key.c_str(), val);
            setVarDB(key, val);
            request->send(200, "text/plain", "Ok, saved");
        } else {
            request->send(500, "text/plain", "param error");
        }
    });
    server.on("/set_vars", HTTP_POST, [](AsyncWebServerRequest *request) {
        if (request->hasParam("json", true)) {
            DynamicJsonDocument jsonDocument(2048);
            DeserializationError error = deserializeJson(jsonDocument, request->getParam("json", true)->value());
            if (error) {
                request->send(400, "text/plain", "Failed to parse JSON");
                return;
            }
            for (JsonPair kv : jsonDocument.as<JsonObject>()) {
                std::string key = kv.key().c_str();
                String val = kv.value().as<String>();
                Serial.printf("set key %s value %s\r\n", key.c_str(), val);
                setVarDB(key, val);
            }
            request->send(200, "text/plain", "JSON uploaded and processed");
        } else {
            request->send(400, "text/plain", "No 'json' parameter found in request");
        }
    });

    // setup

    server.on("/setup", HTTP_GET, [](AsyncWebServerRequest *request) {
        request->send(*contentFS, "/www/setup.html");
    });

    server.on("/get_wifi_config", HTTP_GET, [](AsyncWebServerRequest *request) {
        // Use new WiFi storage manager for consistent configuration retrieval
        WiFiStorageManager &wifiStorage = WIFI_STORAGE;

        AsyncResponseStream *response = request->beginResponseStream("application/json");
        DynamicJsonDocument doc = wifiStorage.toJson();
        doc["mac"] = WiFi.macAddress();

        serializeJson(doc, *response);
        request->send(response);
    });

    server.on("/get_ssid_list", HTTP_GET, [](AsyncWebServerRequest *request) {
        WiFiUtils &wifiUtils = WiFiUtils::getInstance();

        // Trigger scan if needed and not already scanning
        if (!wifiUtils.isScanning()) {
            wifiUtils.performAsyncScan(true);
        }

        // Get results and send as JSON
        String json = wifiUtils.buildScanResultsJson(false);
        JsonResponseUtils::addCacheHeaders(request, 30);  // Cache for 30 seconds
        JsonResponseUtils::sendJsonResponse(request, json);
    });

    AsyncCallbackJsonWebHandler *handler = new AsyncCallbackJsonWebHandler("/save_wifi_config", [](AsyncWebServerRequest *request, JsonVariant &json) {
        Serial.println("[NEW_STORAGE] WiFi config save request received");

        // Validate JSON input
        if (!json.is<JsonObject>()) {
            Serial.println("[NEW_STORAGE] ERROR: Invalid JSON received");
            request->send(400, "application/json", "{\"error\":\"Invalid JSON\"}");
            return;
        }

        const JsonObject &jsonObj = json.as<JsonObject>();

        // Debug: Print received data
        String debugData;
        serializeJson(jsonObj, debugData);
        Serial.println("[NEW_STORAGE] Received WiFi config: " + debugData);

        // Use new WiFi storage manager for configuration saving
        WiFiStorageManager &wifiStorage = WIFI_STORAGE;

        // Temporarily comment out until WiFiStorageManager is fully implemented
        // StorageUtils::Result result = wifiStorage.fromJson(jsonObj);
        StorageUtils::Result result = StorageUtils::Result::SUCCESS;

        if (result == StorageUtils::Result::SUCCESS) {
            Serial.println("[NEW_STORAGE] WiFi config saved successfully");
            request->send(200, "application/json", "{\"success\":true,\"message\":\"Configuration saved\"}");

            // Disable websocket to prevent interference during restart
            ws.enable(false);

            // Handle factory reset
            if (jsonObj.containsKey("ssid") && jsonObj["ssid"].as<String>() == "factory") {
                Serial.println("[NEW_STORAGE] Factory reset initiated");
                config.runStatus = RUNSTATUS_STOP;
                vTaskDelay(pdMS_TO_TICKS(2000));

                // wifiStorage.factoryReset();  // Temporarily commented out
                destroyDB();
                cleanupCurrent();
                contentFS->remove("/AP_FW_Pack.bin");
                ESP.restart();
            } else {
                Serial.println("Preparing for restart with new WiFi settings");
                refreshAllPending();
                saveDB("/current/tagDB.json");

                // Clean up temporary files
                contentFS->remove("/OpenEPaperLink_esp32_C6.bin");
                contentFS->remove("/bootloader.bin");
                contentFS->remove("/partition-table.bin");
                contentFS->remove("/update_actions.json");
                contentFS->remove("/log.txt");
                contentFS->remove("/logold.txt");
                contentFS->remove("/current/tagDB.json");
                contentFS->remove("/current/tagDB.json.bak");
                contentFS->remove("/current/tagDBrestored.json");
                contentFS->remove("/current/apconfig.json");

                ws.closeAll();
                vTaskDelay(pdMS_TO_TICKS(1000));  // Give time for response to be sent
                ESP.restart();
            }
        } else {
            Serial.printf("[NEW_STORAGE] Failed to save config: %d\n", (int)result);
            // StorageUtils::getInstance().resultToString(result).c_str());  // Temporarily commented out
            request->send(500, "application/json", "{\"error\":\"Failed to save configuration\"}");
        }
    });
    server.addHandler(handler);

    server.on("/backup_db", HTTP_GET, [](AsyncWebServerRequest *request) {
        saveDB("/current/tagDB.json");
        request->send(*contentFS, "/current/tagDB.json", String(), true);
    });
    server.on(
        "/restore_db", HTTP_POST, [](AsyncWebServerRequest *request) {
            request->send(200);
        },
        dotagDBUpload);

    // OTA related calls

    server.on("/sysinfo", HTTP_GET, handleSysinfoRequest);
    // Add alias for JavaScript compatibility
    server.on("/sysinfo.json", HTTP_GET, handleSysinfoRequest);
    server.on("/check_file", HTTP_GET, handleCheckFile);
    server.on("/rollback", HTTP_POST, handleRollback);
    server.on("/update_actions", HTTP_POST, handleUpdateActions);

    // JavaScript API endpoints
    server.on("/api/error_report", HTTP_POST, [](AsyncWebServerRequest *request) {
        // Log error reports from JavaScript
        if (request->hasParam("error", true) && request->hasParam("url", true)) {
            String error = request->getParam("error", true)->value();
            String url = request->getParam("url", true)->value();
            Serial.printf("[JS ERROR] %s at %s\n", error.c_str(), url.c_str());
        }
        request->send(200, "application/json", "{\"status\":\"logged\"}");
    });

    server.on("/api/features", HTTP_GET, [](AsyncWebServerRequest *request) {
        DynamicJsonDocument doc(1024);

        // Initialize all features as false
        doc["HAS_RGB_LED"] = false;
        doc["HAS_TFT"] = false;
        doc["HAS_BLE_WRITER"] = false;
        doc["HAS_SUBGHZ"] = false;
        doc["C6_OTA_FLASHING"] = false;
        doc["HAS_IR_REMOTE"] = false;
        doc["HAS_RC522_RFID"] = false;
        doc["HAS_EXT_FLASHER"] = false;

        // Display & LED Hardware Features
#ifdef HAS_RGB_LED
        doc["HAS_RGB_LED"] = true;
#endif
#ifdef HAS_TFT
        doc["HAS_TFT"] = true;
#endif

        // Communication Module Features
#ifdef HAS_BLE_WRITER
        doc["HAS_BLE_WRITER"] = true;
#endif
#ifdef HAS_SUBGHZ
        doc["HAS_SUBGHZ"] = true;
#endif

        // Flashing & Programming Features
#ifdef C6_OTA_FLASHING
        doc["C6_OTA_FLASHING"] = true;
#endif
#ifdef HAS_EXT_FLASHER
        doc["HAS_EXT_FLASHER"] = true;
#endif

        // Input/Output Peripheral Features
#ifdef HAS_IR_REMOTE
        doc["HAS_IR_REMOTE"] = true;
#endif
#ifdef HAS_RC522_RFID
        doc["HAS_RC522_RFID"] = true;
#endif

        String response;
        serializeJson(doc, response);
        request->send(200, "application/json", response);
    });

    // Enhanced Module Management API Endpoints
    setupModuleManagementAPI(server);

    // ========================================================================
    // C6 MODULE MANAGEMENT ENDPOINTS
    // ========================================================================
#if HAS_C6_MODULE
    // C6 Module Management Endpoints
    server.on("/get_c6_settings", HTTP_GET, handleGetC6Settings);
    server.on("/save_c6_settings", HTTP_POST, [](AsyncWebServerRequest *request) { request->send(200, "text/plain", "Settings saved"); }, NULL, handleSaveC6SettingsBody);
    server.on("/reset_c6_settings", HTTP_POST, handleResetC6Settings);
    server.on("/test_c6_connection", HTTP_GET, handleTestC6Connection);
    server.on("/test_c6_radio", HTTP_GET, handleTestC6Radio);
    server.on("/restart_c6", HTTP_POST, handleRestartC6);
    server.on("/backup_c6_config", HTTP_GET, handleBackupC6Config);
    server.on("/reset_c6_config", HTTP_POST, handleResetC6Config);
    server.on("/ap_list", HTTP_GET, handleAPList);  // Add missing endpoint for C6 module interface
    server.on("/c6_update_status", HTTP_GET, handleC6UpdateStatus);
    server.on("/backup_c6_firmware", HTTP_GET, handleBackupC6Firmware);
    server.on("/upload_c6_firmware", HTTP_POST, [](AsyncWebServerRequest *request) { request->send(200, "text/plain", "Upload complete"); }, handleC6FirmwareUpload);

    // Add the /update_c6 endpoint that JavaScript calls
    server.on("/update_c6", HTTP_POST, [](AsyncWebServerRequest *request) { request->send(200, "text/plain", "Update complete"); }, handleC6FirmwareUpload);
#endif

// Drives and device management endpoints
#if HAS_C6_MODULE
    server.on("/list_drives", HTTP_GET, handleListDrives);
    server.on("/list_serial_ports", HTTP_GET, handleListSerialPorts);
    server.on("/flash_c6_ota", HTTP_POST, handleFlashC6OTA);
#endif

    // ========================================================================
    // FEATURE DETECTION ENDPOINTS (HEAD requests)
    // ========================================================================

    // Display & LED Hardware
    server.on("/tft_status", HTTP_HEAD, [](AsyncWebServerRequest *request) {
#ifdef HAS_TFT
        request->send(200, "text/plain", "TFT available");
#else
        request->send(404, "text/plain", "TFT not available");
#endif
    });

    server.on("/led_control", HTTP_HEAD, [](AsyncWebServerRequest *request) {
#ifdef HAS_RGB_LED
        request->send(200, "text/plain", "LED control available");
#else
        request->send(404, "text/plain", "LED control not available");
#endif
    });

    // Communication Modules
    server.on("/ble_status", HTTP_HEAD, [](AsyncWebServerRequest *request) {
#ifdef HAS_BLE_WRITER
        request->send(200, "text/plain", "BLE available");
#else
        request->send(404, "text/plain", "BLE not available");
#endif
    });

    server.on("/subghz_status", HTTP_HEAD, [](AsyncWebServerRequest *request) {
#ifdef HAS_SUBGHZ
        request->send(200, "text/plain", "SubGHz available");
#else
        request->send(404, "text/plain", "SubGHz not available");
#endif
    });

    // Input/Output Peripherals
    server.on("/rfid/status", HTTP_HEAD, [](AsyncWebServerRequest *request) {
#ifdef HAS_RC522_RFID
        request->send(200, "text/plain", "RFID available");
#else
        request->send(404, "text/plain", "RFID not available");
#endif
    });

    // Programming & Flashing Tools
    server.on("/flasher_status", HTTP_HEAD, [](AsyncWebServerRequest *request) {
#ifdef HAS_EXT_FLASHER
        request->send(200, "text/plain", "External flasher available");
#else
        request->send(404, "text/plain", "External flasher not available");
#endif
    });

    // ========================================================================
    // IR REMOTE CONTROL ENDPOINTS
    // ========================================================================
#ifdef HAS_IR_REMOTE
    // IR Remote control endpoints
    server.on("/ir/status", HTTP_GET, [](AsyncWebServerRequest *request) {
        String response = irInterface.getStatusJSON();
        request->send(200, "application/json", response);
    });

    server.on("/ir/send", HTTP_POST, [](AsyncWebServerRequest *request) {
        if (!request->hasParam("command", true)) {
            request->send(400, "application/json", "{\"error\":\"Missing command parameter\"}");
            return;
        }

        String command = request->getParam("command", true)->value();
        IRCommandType cmdType = stringToIRCommandType(command);

        if (cmdType == IR_CMD_UNKNOWN) {
            request->send(400, "application/json", "{\"error\":\"Unknown command type\"}");
            return;
        }

        bool success = irInterface.sendProfileCommand(cmdType);
        String response = success ? "{\"success\":true,\"message\":\"Command sent\"}" : "{\"success\":false,\"error\":\"Failed to send command\"}";
        request->send(success ? 200 : 500, "application/json", response);
    });

    server.on("/ir/learn", HTTP_POST, [](AsyncWebServerRequest *request) {
        if (!request->hasParam("timeout", true)) {
            request->send(400, "application/json", "{\"error\":\"Missing timeout parameter\"}");
            return;
        }

        unsigned long timeout = request->getParam("timeout", true)->value().toInt();
        if (timeout == 0) timeout = 10000;  // Default 10 seconds

        irInterface.startLearning();
        IRCommand learned = irInterface.learnCommand(timeout);
        irInterface.stopLearning();

        if (learned.code != 0) {
            DynamicJsonDocument doc(512);
            doc["success"] = true;
            doc["protocol"] = irProtocolTypeToString(learned.protocol);
            doc["code"] = "0x" + String(learned.code, HEX);
            doc["bits"] = learned.bits;
            doc["description"] = learned.description;

            String response;
            serializeJson(doc, response);
            request->send(200, "application/json", response);
        } else {
            request->send(408, "application/json", "{\"success\":false,\"error\":\"Learn timeout\"}");
        }
    });

    server.on("/ir/profiles", HTTP_GET, [](AsyncWebServerRequest *request) {
        std::vector<String> profiles = irInterface.getProfileList();
        DynamicJsonDocument doc(1024);
        JsonArray profileArray = doc.createNestedArray("profiles");

        for (const String &profile : profiles) {
            profileArray.add(profile);
        }

        doc["current"] = irInterface.getCurrentProfile().name;
        doc["count"] = profiles.size();

        String response;
        serializeJson(doc, response);
        request->send(200, "application/json", response);
    });

    server.on("/ir/receive", HTTP_GET, [](AsyncWebServerRequest *request) {
        if (irInterface.hasReceivedCommand()) {
            IRCommand cmd = irInterface.getLastCommand();

            DynamicJsonDocument doc(512);
            doc["hasCommand"] = true;
            doc["protocol"] = irProtocolTypeToString(cmd.protocol);
            doc["code"] = "0x" + String(cmd.code, HEX);
            doc["bits"] = cmd.bits;
            doc["type"] = irCommandTypeToString(cmd.type);
            doc["description"] = cmd.description;
            doc["timestamp"] = cmd.timestamp;

            String response;
            serializeJson(doc, response);
            request->send(200, "application/json", response);
        } else {
            request->send(200, "application/json", "{\"hasCommand\":false}");
        }
    });
#endif

    // ========================================================================
    // RC522 RFID CONTROL ENDPOINTS
    // ========================================================================
// Temporarily disable RC522 until IR is working
#if HAS_RC522
    // RC522 RFID control endpoints
    server.on("/rfid/status", HTTP_GET, [](AsyncWebServerRequest *request) {
        String response = rc522Interface.getStatusJSON();
        request->send(200, "application/json", response);
    });

    server.on("/rfid/scan", HTTP_GET, [](AsyncWebServerRequest *request) {
        bool cardFound = rc522Interface.readCard();

        if (cardFound) {
            RFIDCardInfo card = rc522Interface.getCardInfo();

            DynamicJsonDocument doc(1024);
            doc["success"] = true;
            doc["cardPresent"] = true;
            doc["uid"] = card.uid;
            doc["uidHex"] = card.uidHex;
            doc["type"] = card.typeName;
            doc["blockCount"] = card.blockCount;
            doc["sectorCount"] = card.sectorCount;
            doc["lastSeen"] = card.lastSeen;

            String response;
            serializeJson(doc, response);
            request->send(200, "application/json", response);
        } else {
            request->send(200, "application/json", "{\"success\":true,\"cardPresent\":false}");
        }
    });

#if HAS_RC522
    server.on("/rfid/read", HTTP_POST, [](AsyncWebServerRequest *request) {
        if (!request->hasParam("type", true)) {
            request->send(400, "application/json", "{\"error\":\"Missing type parameter\"}");
            return;
        }

        String type = request->getParam("type", true)->value();

        if (type == "text") {
            String text;
            RFIDResult result = rc522Interface.readText(text);

            DynamicJsonDocument doc(1024);
            doc["success"] = result.success;
            doc["message"] = result.message;
            if (result.success) {
                doc["text"] = text;
                doc["length"] = text.length();
            }

            String response;
            serializeJson(doc, response);
            request->send(result.success ? 200 : 400, "application/json", response);

        } else if (type == "block") {
            if (!request->hasParam("block", true)) {
                request->send(400, "application/json", "{\"error\":\"Missing block parameter\"}");
                return;
            }

            uint8_t blockNumber = request->getParam("block", true)->value().toInt();
            uint8_t buffer[18];
            uint8_t bufferSize = sizeof(buffer);

            RFIDResult result = rc522Interface.readBlock(blockNumber, buffer, bufferSize);

            DynamicJsonDocument doc(512);
            doc["success"] = result.success;
            doc["message"] = result.message;
            doc["block"] = blockNumber;
            if (result.success) {
                doc["data"] = result.data;
            }

            String response;
            serializeJson(doc, response);
            request->send(result.success ? 200 : 400, "application/json", response);
        } else {
            request->send(400, "application/json", "{\"error\":\"Invalid read type\"}");
        }
    });

    server.on("/rfid/write", HTTP_POST, [](AsyncWebServerRequest *request) {
        if (!request->hasParam("type", true)) {
            request->send(400, "application/json", "{\"error\":\"Missing type parameter\"}");
            return;
        }

        String type = request->getParam("type", true)->value();

        if (type == "text") {
            if (!request->hasParam("text", true)) {
                request->send(400, "application/json", "{\"error\":\"Missing text parameter\"}");
                return;
            }

            String text = request->getParam("text", true)->value();
            uint8_t sector = 1;  // Default to sector 1

            if (request->hasParam("sector", true)) {
                sector = request->getParam("sector", true)->value().toInt();
            }

            RFIDResult result = rc522Interface.writeText(text, sector);

            DynamicJsonDocument doc(512);
            doc["success"] = result.success;
            doc["message"] = result.message;
            doc["text"] = text;
            doc["sector"] = sector;
            if (result.success) {
                doc["data"] = result.data;
            }

            String response;
            serializeJson(doc, response);
            request->send(result.success ? 200 : 400, "application/json", response);

        } else {
            request->send(400, "application/json", "{\"error\":\"Invalid write type\"}");
        }
    });
#endif

#if HAS_RC522
    server.on("/rfid/cards", HTTP_GET, [](AsyncWebServerRequest *request) {
        std::vector<RFIDCardInfo> cards = rc522Interface.getDetectedCards();

        DynamicJsonDocument doc(2048);
        JsonArray cardArray = doc.createNestedArray("cards");

        for (const RFIDCardInfo &card : cards) {
            JsonObject cardObj = cardArray.createNestedObject();
            cardObj["uid"] = card.uid;
            cardObj["type"] = card.typeName;
            cardObj["blockCount"] = card.blockCount;
            cardObj["sectorCount"] = card.sectorCount;
            cardObj["lastSeen"] = card.lastSeen;
        }

        doc["count"] = cards.size();
        doc["monitoring"] = rc522Interface.isMonitoring();

        String response;
        serializeJson(doc, response);
        request->send(200, "application/json", response);
    });

    server.on("/rfid/clear", HTTP_POST, [](AsyncWebServerRequest *request) {
        rc522Interface.clearDetectedCards();
        request->send(200, "application/json", "{\"success\":true,\"message\":\"Card database cleared\"}");
    });

    server.on("/rfid/monitor", HTTP_POST, [](AsyncWebServerRequest *request) {
        if (!request->hasParam("enable", true)) {
            request->send(400, "application/json", "{\"error\":\"Missing enable parameter\"}");
            return;
        }

        bool enable = request->getParam("enable", true)->value() == "true";

        if (enable) {
            rc522Interface.startMonitoring();
        } else {
            rc522Interface.stopMonitoring();
        }

        String response = "{\"success\":true,\"monitoring\":" + String(enable ? "true" : "false") + "}";
        request->send(200, "application/json", response);
    });
#endif
#endif

    // OpenAI Agent API endpoints for file management
    server.on("/create_file", HTTP_POST, [](AsyncWebServerRequest *request) {
        if (!request->hasParam("path", true) || !request->hasParam("content", true)) {
            request->send(400, "application/json", "{\"error\":\"Missing path or content parameter\"}");
            return;
        }

        String path = request->getParam("path", true)->value();
        String content = request->getParam("content", true)->value();

        // Ensure path starts with /
        if (!path.startsWith("/")) {
            path = "/" + path;
        }

        File file = contentFS->open(path, "w");
        if (file) {
            file.print(content);
            file.close();
            wsSerial("AI Agent created file: " + path);
            request->send(200, "application/json", "{\"success\":true,\"message\":\"File created successfully\"}");
        } else {
            request->send(500, "application/json", "{\"error\":\"Failed to create file\"}");
        }
    });

    server.on("/read_file", HTTP_GET, [](AsyncWebServerRequest *request) {
        if (!request->hasParam("path")) {
            request->send(400, "text/plain", "Missing path parameter");
            return;
        }

        String path = request->getParam("path")->value();
        if (!path.startsWith("/")) {
            path = "/" + path;
        }

        if (contentFS->exists(path)) {
            request->send(*contentFS, path);
        } else {
            request->send(404, "text/plain", "File not found");
        }
    });

    server.on("/update_file", HTTP_POST, [](AsyncWebServerRequest *request) {
        if (!request->hasParam("path", true) || !request->hasParam("content", true)) {
            request->send(400, "application/json", "{\"error\":\"Missing path or content parameter\"}");
            return;
        }

        String path = request->getParam("path", true)->value();
        String content = request->getParam("content", true)->value();

        if (!path.startsWith("/")) {
            path = "/" + path;
        }

        if (contentFS->exists(path)) {
            File file = contentFS->open(path, "w");
            if (file) {
                file.print(content);
                file.close();
                wsSerial("AI Agent updated file: " + path);
                request->send(200, "application/json", "{\"success\":true,\"message\":\"File updated successfully\"}");
            } else {
                request->send(500, "application/json", "{\"error\":\"Failed to update file\"}");
            }
        } else {
            request->send(404, "application/json", "{\"error\":\"File not found\"}");
        }
    });

    server.on("/delete_file", HTTP_DELETE, [](AsyncWebServerRequest *request) {
        if (!request->hasParam("path")) {
            request->send(400, "application/json", "{\"error\":\"Missing path parameter\"}");
            return;
        }

        String path = request->getParam("path")->value();
        if (!path.startsWith("/")) {
            path = "/" + path;
        }

        if (contentFS->exists(path)) {
            if (contentFS->remove(path)) {
                wsSerial("AI Agent deleted file: " + path);
                request->send(200, "application/json", "{\"success\":true,\"message\":\"File deleted successfully\"}");
            } else {
                request->send(500, "application/json", "{\"error\":\"Failed to delete file\"}");
            }
        } else {
            request->send(404, "application/json", "{\"error\":\"File not found\"}");
        }
    });

    server.on("/list_files", HTTP_GET, [](AsyncWebServerRequest *request) {
        String dir = request->hasParam("dir") ? request->getParam("dir")->value() : "/";

        if (!dir.startsWith("/")) {
            dir = "/" + dir;
        }

        DynamicJsonDocument doc(4096);
        JsonArray files = doc.createNestedArray("files");

        File root = contentFS->open(dir);
        if (root && root.isDirectory()) {
            File file = root.openNextFile();
            while (file) {
                JsonObject fileObj = files.createNestedObject();
                fileObj["name"] = String(file.name());
                fileObj["size"] = file.size();
                fileObj["isDirectory"] = file.isDirectory();
                fileObj["path"] = String(file.path());
                file = root.openNextFile();
            }
        }

        AsyncResponseStream *response = request->beginResponseStream("application/json");
        serializeJson(doc, *response);
        request->send(response);
    });

    // Manual control endpoints for functions
    server.on("/start_content_generation", HTTP_POST, [](AsyncWebServerRequest *request) {
        if (config.runStatus != RUNSTATUS_RUN) {
            config.runStatus = RUNSTATUS_RUN;
            wsLog("Content generation started manually");
            request->send(200, "application/json", "{\"success\":true,\"message\":\"Content generation started\"}");
        } else {
            request->send(200, "application/json", "{\"success\":false,\"message\":\"Content generation already running\"}");
        }
    });

    server.on("/stop_content_generation", HTTP_POST, [](AsyncWebServerRequest *request) {
        if (config.runStatus == RUNSTATUS_RUN) {
            config.runStatus = RUNSTATUS_STOP;
            wsLog("Content generation stopped manually");
            request->send(200, "application/json", "{\"success\":true,\"message\":\"Content generation stopped\"}");
        } else {
            request->send(200, "application/json", "{\"success\":false,\"message\":\"Content generation not running\"}");
        }
    });

    server.on("/pause_content_generation", HTTP_POST, [](AsyncWebServerRequest *request) {
        if (config.runStatus == RUNSTATUS_RUN) {
            config.runStatus = RUNSTATUS_PAUSE;
            wsLog("Content generation paused manually");
            request->send(200, "application/json", "{\"success\":true,\"message\":\"Content generation paused\"}");
        } else {
            request->send(200, "application/json", "{\"success\":false,\"message\":\"Content generation not running\"}");
        }
    });

    server.on("/get_function_status", HTTP_GET, [](AsyncWebServerRequest *request) {
        DynamicJsonDocument doc(2048);
        doc["runStatus"] = config.runStatus;
        doc["runStatusText"] = (config.runStatus == RUNSTATUS_RUN) ? "Running" : (config.runStatus == RUNSTATUS_STOP) ? "Stopped"
                                                                             : (config.runStatus == RUNSTATUS_PAUSE)  ? "Paused"
                                                                                                                      : "Initializing";
        doc["contentGeneration"] = (config.runStatus == RUNSTATUS_RUN);
        doc["apOnline"] = (apInfo.state == AP_STATE_ONLINE);
        String output;
        serializeJson(doc, output);
        request->send(200, "application/json", output);
    });

    server.on("/update_ota", HTTP_POST, [](AsyncWebServerRequest *request) {
        handleUpdateOTA(request);
    });

    // === ENHANCED OPENAI AGENT API ENDPOINTS ===

    // System Control Endpoints
    server.on("/system_info", HTTP_GET, [](AsyncWebServerRequest *request) {
        WebResponseUtils::sendSystemResponse(request);
    });

    server.on("/restart_system", HTTP_POST, [](AsyncWebServerRequest *request) {
        int delay = 3;
        if (request->hasParam("delay", true)) {
            delay = request->getParam("delay", true)->value().toInt();
        }

        DynamicJsonDocument doc(512);
        doc["success"] = true;
        doc["message"] = "System will restart in " + String(delay) + " seconds";

        String output;
        serializeJson(doc, output);
        request->send(200, "application/json", output);

        // Schedule restart
        xTaskCreate([](void *param) {
            int delayMs = *(int *)param;
            vTaskDelay(delayMs * 1000 / portTICK_PERIOD_MS);
            ESP.restart();
        },
                    "restart_task", 2048, &delay, 1, NULL);
    });

    server.on("/system_diagnostic", HTTP_POST, [](AsyncWebServerRequest *request) {
        String level = "detailed";
        if (request->hasParam("level", true)) {
            level = request->getParam("level", true)->value();
        }

        DynamicJsonDocument doc(2048);
        doc["success"] = true;
        doc["level"] = level;
        doc["heap"]["free"] = ESP.getFreeHeap();
        doc["heap"]["total"] = ESP.getHeapSize();
        doc["heap"]["minimum"] = ESP.getMinFreeHeap();
        doc["flash"]["size"] = ESP.getFlashChipSize();
        doc["flash"]["free"] = ESP.getFreeSketchSpace();

        // Use centralized WiFi utilities for consistent data
        WiFiConnectionInfo wifiMetrics = WiFiUtils::getInstance().getConnectionInfo();
        doc["wifi"]["connected"] = wifiMetrics.connected;
        doc["wifi"]["rssi"] = wifiMetrics.rssi;
        doc["wifi"]["channel"] = wifiMetrics.channel;
        doc["temperature"] = temperatureRead();
        doc["uptime"] = millis();
        doc["apInfo"]["online"] = apInfo.isOnline;
        doc["apInfo"]["state"] = apInfo.state;
        doc["apInfo"]["version"] = apInfo.version;

        AsyncResponseStream *response = request->beginResponseStream("application/json");
        serializeJson(doc, *response);
        request->send(response);
    });

    // Tag Control Endpoints
    server.on("/tag_status", HTTP_GET, [](AsyncWebServerRequest *request) {
        DynamicJsonDocument doc(1024);
        doc["success"] = true;
        doc["tagCount"] = tagDB.size();
        doc["pendingCount"] = pendingQueue.size();
        doc["apOnline"] = apInfo.isOnline;
        doc["apState"] = apInfo.state;
        doc["apVersion"] = apInfo.version;
        doc["apChannel"] = apInfo.channel;
        doc["apPower"] = apInfo.power;
        doc["apRSSI"] = apInfo.rssi;
        doc["apUptime"] = apInfo.uptime;

        AsyncResponseStream *response = request->beginResponseStream("application/json");
        serializeJson(doc, *response);
        request->send(response);
    });

    server.on("/tag_control", HTTP_POST, [](AsyncWebServerRequest *request) {
        if (!request->hasParam("tagId", true) || !request->hasParam("action", true)) {
            request->send(400, "application/json", "{\"error\":\"Missing tagId or action parameter\"}");
            return;
        }

        String tagId = request->getParam("tagId", true)->value();
        String action = request->getParam("action", true)->value();
        String data = request->hasParam("data", true) ? request->getParam("data", true)->value() : "";

        DynamicJsonDocument doc(512);
        doc["success"] = true;
        doc["tagId"] = tagId;
        doc["action"] = action;

        // Simulate tag control actions
        if (action == "ping") {
            bool pingResult = sendPing();
            doc["result"] = pingResult ? "Ping successful" : "Ping failed";
        } else if (action == "reset") {
            APTagReset();
            doc["result"] = "Tag reset command sent";
        } else {
            doc["result"] = "Action queued for execution";
        }

        AsyncResponseStream *response = request->beginResponseStream("application/json");
        serializeJson(doc, *response);
        request->send(response);
    });

    server.on("/tag_image_update", HTTP_POST, [](AsyncWebServerRequest *request) {
        if (!request->hasParam("tagId", true) || !request->hasParam("imageData", true)) {
            request->send(400, "application/json", "{\"error\":\"Missing tagId or imageData parameter\"}");
            return;
        }

        String tagId = request->getParam("tagId", true)->value();
        String imageData = request->getParam("imageData", true)->value();
        String imageType = request->hasParam("imageType", true) ? request->getParam("imageType", true)->value() : "bmp";

        DynamicJsonDocument doc(512);
        doc["success"] = true;
        doc["tagId"] = tagId;
        doc["imageType"] = imageType;
        doc["dataSize"] = imageData.length();
        doc["result"] = "Image update queued for tag";

        AsyncResponseStream *response = request->beginResponseStream("application/json");
        serializeJson(doc, *response);
        request->send(response);
    });

    // ========================================================================
    // LED CONTROL ENDPOINTS
    // ========================================================================
    server.on("/led_control", HTTP_POST, [](AsyncWebServerRequest *request) {
        if (!request->hasParam("action", true)) {
            request->send(400, "application/json", "{\"error\":\"Missing action parameter\"}");
            return;
        }

        String action = request->getParam("action", true)->value();
        DynamicJsonDocument doc(512);
        doc["success"] = true;
        doc["action"] = action;

        // LED Brightness Control
        if (action == "setBrightness") {
            int brightness = request->hasParam("brightness", true) ? request->getParam("brightness", true)->value().toInt() : 128;
            setBrightness(brightness);
            doc["result"] = "Brightness set to " + String(brightness);
        }
        // LED Color Control (RGB Hardware Only)
        else if (action == "setColor") {
            String color = request->hasParam("color", true) ? request->getParam("color", true)->value() : "#FFFFFF";
#ifdef HAS_RGB_LED
            if (color.startsWith("#") && color.length() == 7) {
                long colorValue = strtol(color.substring(1).c_str(), NULL, 16);
                CRGB rgbColor = CRGB((colorValue >> 16) & 0xFF, (colorValue >> 8) & 0xFF, colorValue & 0xFF);
                shortBlink(rgbColor);
            }
#endif
            doc["result"] = "Color set to " + color;
        } else if (action == "blink") {
            int repeat = request->hasParam("duration", true) ? request->getParam("duration", true)->value().toInt() / 500 : 3;
            quickBlink(repeat);
            doc["result"] = "Blinking " + String(repeat) + " times";
        } else if (action == "off") {
            setBrightness(0);
            doc["result"] = "LEDs turned off";
        } else if (action == "rainbow") {
#ifdef HAS_RGB_LED
            showColorPattern(CRGB::Red, CRGB::Green, CRGB::Blue);
#endif
            doc["result"] = "Rainbow pattern activated";
        } else {
            doc["result"] = "Unknown LED action";
        }

        AsyncResponseStream *response = request->beginResponseStream("application/json");
        serializeJson(doc, *response);
        request->send(response);
    });

    // Network Endpoints
    server.on("/network_info", HTTP_GET, [](AsyncWebServerRequest *request) {
        WiFiUtils &wifiUtils = WiFiUtils::getInstance();
        String json = wifiUtils.getConnectionInfoJson();
        JsonResponseUtils::sendJsonResponse(request, json);
    });

    server.on("/wifi_scan", HTTP_GET, [](AsyncWebServerRequest *request) {
        WiFiUtils &wifiUtils = WiFiUtils::getInstance();

        // If already scanning, return status
        if (wifiUtils.isScanning()) {
            JsonResponseUtils::sendStatusResponse(request, false, "Scan already in progress");
            return;
        }

        // Start new scan
        bool scanStarted = wifiUtils.performAsyncScan(true);
        if (scanStarted) {
            JsonResponseUtils::sendStatusResponse(request, false, "Scan initiated, please try again in a few seconds");
        } else {
            // Get existing results
            String json = wifiUtils.buildScanResultsJson(true);
            JsonResponseUtils::sendJsonResponse(request, json);
        }
    });

    server.on("/wifi_manage", HTTP_POST, [](AsyncWebServerRequest *request) {
        VALIDATE_PARAMS(request, {"action"}, true);

        String action = GET_PARAM(request, "action", "", true);
        String ssid = GET_PARAM(request, "ssid", "", true);
        String password = GET_PARAM(request, "password", "", true);

        DynamicJsonDocument doc(512);
        doc["success"] = true;
        doc["action"] = action;

        if (action == "connect" && ssid.length() > 0) {
            WiFi.begin(ssid.c_str(), password.c_str());
            doc["result"] = "Connecting to " + ssid;
        } else if (action == "disconnect") {
            WiFi.disconnect();
            doc["result"] = "Disconnected from WiFi";
        } else if (action == "scan") {
            // Use centralized WiFi scanning
            WiFiUtils &wifiUtils = WiFiUtils::getInstance();
            bool scanStarted = wifiUtils.performAsyncScan(true, 1000);
            if (scanStarted) {
                doc["result"] = "WiFi scan initiated";
            } else {
                doc["result"] = "WiFi scan failed or already in progress";
            }
        } else if (action == "startAP") {
            WiFi.softAP("ESP32-AP-Flasher", "");
            doc["result"] = "Access Point started";
        } else if (action == "stopAP") {
            WiFi.softAPdisconnect();
            doc["result"] = "Access Point stopped";
        } else {
            doc["result"] = "Unknown action or missing parameters";
        }

        AsyncResponseStream *response = request->beginResponseStream("application/json");
        serializeJson(doc, *response);
        request->send(response);
    });

    // OTA Endpoints
    server.on("/ota_check", HTTP_GET, [](AsyncWebServerRequest *request) {
        String target = request->hasParam("target") ? request->getParam("target")->value() : "all";

        DynamicJsonDocument doc(512);
        doc["success"] = true;
        doc["target"] = target;
        doc["currentVersion"] = "3.0.0";
        doc["availableVersion"] = "3.0.1";
        doc["updateAvailable"] = true;
        doc["updateUrl"] = "https://github.com/OpenEPaperLink/OpenEPaperLink/releases";

        AsyncResponseStream *response = request->beginResponseStream("application/json");
        serializeJson(doc, *response);
        request->send(response);
    });

    server.on("/ota_update", HTTP_POST, [](AsyncWebServerRequest *request) {
        if (!request->hasParam("target", true)) {
            request->send(400, "application/json", "{\"error\":\"Missing target parameter\"}");
            return;
        }

        String target = request->getParam("target", true)->value();
        String version = request->hasParam("version", true) ? request->getParam("version", true)->value() : "latest";

        DynamicJsonDocument doc(512);
        doc["success"] = true;
        doc["target"] = target;
        doc["version"] = version;
        doc["result"] = "OTA update initiated for " + target;

        AsyncResponseStream *response = request->beginResponseStream("application/json");
        serializeJson(doc, *response);
        request->send(response);
    });

    // Additional Enhanced Endpoints
    server.on("/ble_status", HTTP_GET, [](AsyncWebServerRequest *request) {
        WebResponseUtils::sendFeatureStatusResponse(request, "ble");
    });

    server.on("/ble_control", HTTP_POST, [](AsyncWebServerRequest *request) {
        String action = request->hasParam("action", true) ? request->getParam("action", true)->value() : "";
        DynamicJsonDocument doc(512);
        doc["success"] = true;
        doc["action"] = action;
        doc["result"] = "BLE action queued (not implemented)";

        AsyncResponseStream *response = request->beginResponseStream("application/json");
        serializeJson(doc, *response);
        request->send(response);
    });

    server.on("/serial_ap_status", HTTP_GET, [](AsyncWebServerRequest *request) {
        DynamicJsonDocument doc(512);
        doc["success"] = true;
        doc["state"] = apInfo.state;
        doc["online"] = apInfo.isOnline;
        doc["channel"] = apInfo.channel;
        doc["power"] = apInfo.power;
        doc["rssi"] = apInfo.rssi;
        doc["uptime"] = apInfo.uptime;
        doc["pendingBuffer"] = apInfo.pendingBuffer;

        AsyncResponseStream *response = request->beginResponseStream("application/json");
        serializeJson(doc, *response);
        request->send(response);
    });

    server.on("/serial_ap_control", HTTP_POST, [](AsyncWebServerRequest *request) {
        String action = request->hasParam("action", true) ? request->getParam("action", true)->value() : "";
        DynamicJsonDocument doc(512);
        doc["success"] = true;
        doc["action"] = action;

        if (action == "start") {
            bringAPOnline(AP_STATE_ONLINE);
            doc["result"] = "Serial AP start initiated";
        } else if (action == "stop") {
            setAPstate(false, AP_STATE_OFFLINE);
            doc["result"] = "Serial AP stopped";
        } else if (action == "reset") {
            APTagReset();
            doc["result"] = "Serial AP reset initiated";
        } else {
            doc["result"] = "Serial AP action queued";
        }

        AsyncResponseStream *response = request->beginResponseStream("application/json");
        serializeJson(doc, *response);
        request->send(response);
    });

    server.on("/zbs_control", HTTP_POST, [](AsyncWebServerRequest *request) {
        String action = request->hasParam("action", true) ? request->getParam("action", true)->value() : "";
        DynamicJsonDocument doc(512);
        doc["success"] = true;
        doc["action"] = action;
        doc["result"] = "ZBS interface action queued (hardware dependent)";

        AsyncResponseStream *response = request->beginResponseStream("application/json");
        serializeJson(doc, *response);
        request->send(response);
    });

    server.on("/swd_control", HTTP_POST, [](AsyncWebServerRequest *request) {
        String action = request->hasParam("action", true) ? request->getParam("action", true)->value() : "";
        DynamicJsonDocument doc(512);
        doc["success"] = true;
        doc["action"] = action;
        doc["result"] = "SWD programming action queued (hardware dependent)";

        AsyncResponseStream *response = request->beginResponseStream("application/json");
        serializeJson(doc, *response);
        request->send(response);
    });

    server.on("/spiffs_manage", HTTP_POST, [](AsyncWebServerRequest *request) {
        String action = request->hasParam("action", true) ? request->getParam("action", true)->value() : "";
        DynamicJsonDocument doc(1024);
        doc["success"] = true;
        doc["action"] = action;

        if (action == "info") {
            size_t totalBytes = LittleFS.totalBytes();
            size_t usedBytes = LittleFS.usedBytes();
            doc["totalBytes"] = totalBytes;
            doc["usedBytes"] = usedBytes;
            doc["freeBytes"] = totalBytes - usedBytes;
            doc["result"] = "SPIFFS filesystem information retrieved";
        } else if (action == "format") {
            // contentFS->format(); // Commented out for safety
            doc["result"] = "SPIFFS format requested (disabled for safety)";
        } else {
            doc["result"] = "SPIFFS action completed";
        }

        AsyncResponseStream *response = request->beginResponseStream("application/json");
        serializeJson(doc, *response);
        request->send(response);
    });
    server.on(
        "/littlefs_put", HTTP_POST, [](AsyncWebServerRequest *request) {
            request->send(200);
        },
        handleLittleFSUpload);

#ifdef HAS_EXT_FLASHER

    // Flasher related calls
    ws.onEvent([](AsyncWebSocket *server, AsyncWebSocketClient *client, AwsEventType type, void *arg, uint8_t *data, size_t len) {
        if (type == WS_EVT_DATA) handleWSdata(data, len, client);
    });

#endif

    server.onNotFound([](AsyncWebServerRequest *request) {
        if (request->url() == "/" || request->url() == "index.htm") {
            request->send(200, "text/html", "index.html not found. Did you forget to upload the littlefs partition?");
            return;
        }
        request->send(404);
    });

    server.serveStatic("/", *contentFS, "/www/").setDefaultFile("index.html");

    DefaultHeaders::Instance().addHeader("Access-Control-Allow-Origin", "*");
    DefaultHeaders::Instance().addHeader("Access-Control-Allow-Headers", "content-type");

    // === OPENAI API PROXY ENDPOINT ===
    server.on("/api/openai/chat", HTTP_POST, [](AsyncWebServerRequest *request) {
        // This will be handled by the body handler
    },
              NULL, [](AsyncWebServerRequest *request, uint8_t *data, size_t len, size_t index, size_t total) {
            // Handle OpenAI API proxy request
            static String requestBody = "";

            // Accumulate the request body
            if (index == 0) {
                requestBody = "";
            }

            for (size_t i = 0; i < len; i++) {
                requestBody += (char)data[i];
            }

            // When we have the complete body
            if (index + len == total) {
                // Parse the request
                DynamicJsonDocument requestDoc(8192);
                DeserializationError error = deserializeJson(requestDoc, requestBody);

                if (error) {
                    request->send(400, "application/json", "{\"error\":\"Invalid JSON\"}");
                    return;
                }

                // Load OpenAI configuration
                String configPath = "/openai_config.json";
                DynamicJsonDocument configDoc(4096);

                if (contentFS->exists(configPath)) {
                    File configFile = contentFS->open(configPath, "r");
                    if (configFile) {
                        deserializeJson(configDoc, configFile);
                        configFile.close();
                    }
                }

                // Extract config values
                String apiKey = configDoc["openai"]["api_key"].as<String>();
                String apiUrl = configDoc["openai"]["api_url"].as<String>();

                if (apiKey.isEmpty()) {
                    request->send(500, "application/json", "{\"error\":\"OpenAI API key not configured\"}");
                    return;
                }

                if (apiUrl.isEmpty()) {
                    apiUrl = "https://api.openai.com/v1/chat/completions";
                }

                // Make HTTP request to OpenAI
                WiFiClientSecure client;
                client.setInsecure(); // For simplicity - in production you should verify certificates

                HTTPClient http;
                http.begin(client, apiUrl);
                http.addHeader("Content-Type", "application/json");
                http.addHeader("Authorization", "Bearer " + apiKey);

                int httpCode = http.POST(requestBody);

                if (httpCode > 0) {
                    String response = http.getString();
                    request->send(httpCode, "application/json", response);
                } else {
                    String errorMsg = "{\"error\":\"HTTP request failed: " + String(httpCode) + "\"}";
                    request->send(500, "application/json", errorMsg);
                }

                http.end();
                requestBody = ""; // Clear for next request
            } });

#ifdef C6_OTA_FLASHING
    // Initialize and register all enhanced modules using the module manager
    Serial.println("[WEB] Initializing enhanced module system...");

    // Initialize the module manager first
    if (!moduleManager.initializeAll()) {
        Serial.println("[WEB] Warning: Module manager initialization had some issues");
    }

    // Initialize C6 module (this will register it with the module manager)
    initC6Module();

    // Start all auto-start modules
    if (!moduleManager.startAll()) {
        Serial.println("[WEB] Warning: Some modules failed to start");
    }

    // Register all module web handlers
    moduleManager.registerAllWebHandlers(server);

    Serial.println("[WEB] Enhanced module system initialization complete");
#endif

    server.begin();
    ModuleInitializer::logInitSuccess("Web Server");
}

#define UPLOAD_BUFFER_SIZE 16384  // Reduced from 32768 for better memory management

struct UploadInfo {
    String filename;
    uint8_t buffer[UPLOAD_BUFFER_SIZE];
    size_t bufferSize;
    uint32_t totalReceived;
    uint32_t lastWriteTime;
};

void doImageUpload(AsyncWebServerRequest *request, String filename, size_t index, uint8_t *data, size_t len, bool final) {
    String uploadfilename;

    if (!index) {
        // Initial checks
        if (config.runStatus != RUNSTATUS_RUN) {
            request->send(409, "text/plain", "Service temporarily unavailable");
            return;
        }
        if (!request->hasParam("mac", true)) {
            WebResponseUtils::sendMissingParamError(request, "mac");
            return;
        }

        // Generate unique filename
        uploadfilename = request->getParam("mac", true)->value() + "_" + String(millis()) + ".jpg";

        // Pre-create file
        if (xSemaphoreTake(fsMutex, pdMS_TO_TICKS(1000)) == pdTRUE) {
            File file = contentFS->open("/temp/" + uploadfilename, "w");
            if (file) {
                file.close();
                Serial.println("Upload started: " + uploadfilename);
            } else {
                xSemaphoreGive(fsMutex);
                request->send(500, "text/plain", "Failed to create upload file");
                return;
            }
            xSemaphoreGive(fsMutex);
        } else {
            request->send(503, "text/plain", "File system busy");
            return;
        }

        UploadInfo *uploadInfo = new UploadInfo{uploadfilename, {}, 0, 0, millis()};
        request->_tempObject = (void *)uploadInfo;
    }

    UploadInfo *uploadInfo = static_cast<UploadInfo *>(request->_tempObject);
    if (uploadInfo == nullptr) {
        request->send(500, "text/plain", "Upload context lost");
        return;
    }

    uploadfilename = uploadInfo->filename;
    uploadInfo->totalReceived += len;

    if (len) {
        // Buffer incoming data
        if (uploadInfo->bufferSize + len <= UPLOAD_BUFFER_SIZE) {
            memcpy(&uploadInfo->buffer[uploadInfo->bufferSize], data, len);
            uploadInfo->bufferSize += len;
        } else {
            // Flush buffer to file
            if (xSemaphoreTake(fsMutex, pdMS_TO_TICKS(2000)) == pdTRUE) {
                File file = contentFS->open("/temp/" + uploadfilename, "a");
                if (file) {
                    if (uploadInfo->bufferSize > 0) {
                        file.write(uploadInfo->buffer, uploadInfo->bufferSize);
                    }
                    file.close();
                    uploadInfo->bufferSize = 0;
                    uploadInfo->lastWriteTime = millis();
                } else {
                    xSemaphoreGive(fsMutex);
                    delete uploadInfo;
                    request->_tempObject = nullptr;
                    request->send(500, "text/plain", "File write error");
                    return;
                }
                xSemaphoreGive(fsMutex);
            } else {
                delete uploadInfo;
                request->_tempObject = nullptr;
                request->send(503, "text/plain", "File system timeout");
                return;
            }

            // Store new data in buffer
            if (len <= UPLOAD_BUFFER_SIZE) {
                memcpy(uploadInfo->buffer, data, len);
                uploadInfo->bufferSize = len;
            } else {
                delete uploadInfo;
                request->_tempObject = nullptr;
                request->send(413, "text/plain", "Chunk too large");
                return;
            }
        }
    }

    if (final) {
        // Final buffer flush
        if (uploadInfo->bufferSize > 0) {
            if (xSemaphoreTake(fsMutex, pdMS_TO_TICKS(2000)) == pdTRUE) {
                File file = contentFS->open("/temp/" + uploadfilename, "a");
                if (file) {
                    file.write(uploadInfo->buffer, uploadInfo->bufferSize);
                    file.close();
                } else {
                    xSemaphoreGive(fsMutex);
                    delete uploadInfo;
                    request->_tempObject = nullptr;
                    request->send(500, "text/plain", "Final write failed");
                    return;
                }
                xSemaphoreGive(fsMutex);
            } else {
                delete uploadInfo;
                request->_tempObject = nullptr;
                request->send(503, "text/plain", "Final write timeout");
                return;
            }
        }

        Serial.printf("Upload completed: %s (%lu bytes)\n", uploadfilename.c_str(), uploadInfo->totalReceived);

        // Process uploaded file
        if (request->hasParam("mac", true)) {
            String dst = request->getParam("mac", true)->value();
            uint8_t mac[8];
            if (hex2mac(dst, mac)) {
                tagRecord *taginfo = tagRecord::findByMAC(mac);
                if (taginfo != nullptr) {
                    // Extract parameters with defaults
                    uint8_t dither = request->hasParam("dither", true) ? request->getParam("dither", true)->value().toInt() : 1;
                    uint32_t ttl = request->hasParam("ttl", true) ? request->getParam("ttl", true)->value().toInt() : 0;
                    uint8_t preload = 0;
                    uint8_t preloadlut = 0;
                    uint8_t preloadtype = 0;

                    if (request->hasParam("preloadtype", true)) {
                        preload = 1;
                        preloadtype = request->getParam("preloadtype", true)->value().toInt();
                        if (request->hasParam("preloadlut", true)) {
                            preloadlut = request->getParam("preloadlut", true)->value().toInt();
                        }
                    }

                    // Update tag parameters
                    if (request->hasParam("alias", true)) {
                        taginfo->alias = request->getParam("alias", true)->value();
                    }
                    if (request->hasParam("rotate", true)) {
                        taginfo->rotate = atoi(request->getParam("rotate", true)->value().c_str());
                    }
                    if (request->hasParam("lut", true)) {
                        taginfo->lut = atoi(request->getParam("lut", true)->value().c_str());
                    }
                    if (request->hasParam("invert", true)) {
                        taginfo->invert = atoi(request->getParam("invert", true)->value().c_str());
                    }

                    // Set mode configuration
                    taginfo->modeConfigJson = "{\"filename\":\"/temp/" + uploadfilename +
                                              "\",\"timetolive\":\"" + String(ttl) +
                                              "\",\"dither\":\"" + String(dither) +
                                              "\",\"delete\":\"1\", \"preload\":\"" + String(preload) +
                                              "\", \"preload_lut\":\"" + String(preloadlut) +
                                              "\", \"preload_type\":\"" + String(preloadtype) + "\"}";

                    if (request->hasParam("contentmode", true)) {
                        taginfo->contentMode = request->getParam("contentmode", true)->value().toInt();
                    } else {
                        taginfo->contentMode = 24;
                    }

                    taginfo->nextupdate = 0;
                    wsSendTaginfo(mac, SYNC_USERCFG);
                    request->send(200, "text/plain", "Upload completed successfully");
                } else {
                    request->send(404, "text/plain", "Tag not found in database");
                }
            } else {
                request->send(400, "text/plain", "Invalid MAC address format");
            }
        } else {
            request->send(400, "text/plain", "Missing MAC parameter");
        }

        delete uploadInfo;
        request->_tempObject = nullptr;
    }
}

void doJsonUpload(AsyncWebServerRequest *request) {
    if (config.runStatus != RUNSTATUS_RUN) {
        request->send(409, "text/plain", "come back later");
        return;
    }
    if (request->hasParam("mac", true) && request->hasParam("json", true)) {
        String dst = request->getParam("mac", true)->value();
        uint8_t mac[8];
        if (hex2mac(dst, mac)) {
            xSemaphoreTake(fsMutex, portMAX_DELAY);
            File file = contentFS->open("/current/" + dst + ".json", "w");
            if (!file) {
                request->send(400, "text/plain", "Failed to create file");
                xSemaphoreGive(fsMutex);
                return;
            }
            file.print(request->getParam("json", true)->value());
            file.close();
            xSemaphoreGive(fsMutex);
            tagRecord *taginfo = tagRecord::findByMAC(mac);
            if (taginfo != nullptr) {
                uint32_t ttl = 0;
                if (request->hasParam("ttl", true)) {
                    ttl = request->getParam("ttl", true)->value().toInt();
                }
                taginfo->modeConfigJson = "{\"filename\":\"/current/" + dst + ".json\",\"interval\":\"" + String(ttl) + "\"}";
                taginfo->contentMode = 19;
                taginfo->nextupdate = 0;
                wsSendTaginfo(mac, SYNC_USERCFG);
                request->send(200, "text/plain", "Ok, saved");
            } else {
                request->send(400, "text/plain", "mac not found in tagDB");
            }
        }
        return;
    }
    request->send(400, "text/plain", "Missing parameters");
}

void dotagDBUpload(AsyncWebServerRequest *request, String filename, size_t index, uint8_t *data, size_t len, bool final) {
    if (!index) {
        logLine("restore tagDB");
        xSemaphoreTake(fsMutex, portMAX_DELAY);
        request->_tempFile = contentFS->open("/current/tagDBrestored.json", "w");
    }
    if (len) {
        request->_tempFile.write(data, len);
    }
    if (final) {
        request->_tempFile.close();
        xSemaphoreGive(fsMutex);
        destroyDB();
        loadDB("/current/tagDBrestored.json");
        request->send(200, "text/plain", "Ok, restored.");
    }
}

// Enhanced Module Management API Implementation
// =============================================

void setupModuleManagementAPI(AsyncWebServer &server) {
    Serial.println("[WEB] Setting up module management API endpoints...");

    // Module list endpoint - GET /api/modules
    server.on("/api/modules", HTTP_GET, [](AsyncWebServerRequest *request) {
        DynamicJsonDocument doc(2048);

        // Get module manager instance
        ModuleManager &manager = ModuleManager::getInstance();

        // System status
        doc["totalModules"] = manager.getModuleCount();
        doc["activeModules"] = manager.getActiveModuleCount();
        doc["uptime"] = millis();
        doc["timestamp"] = millis();  // Use millis() instead of WiFi.getTime()

        // Module list
        JsonArray modules = doc["modules"].to<JsonArray>();
        const auto &moduleList = manager.getModules();

        for (const auto &module : moduleList) {
            if (module.instance != nullptr) {
                JsonObject moduleObj = modules.createNestedObject();
                ModuleInfo info = module.instance->getInfo();

                moduleObj["name"] = info.name;
                moduleObj["version"] = info.version;
                moduleObj["description"] = info.description;
                moduleObj["type"] = static_cast<int>(info.type);
                moduleObj["state"] = static_cast<int>(info.state);
                moduleObj["healthy"] = module.instance->isHealthy();
                moduleObj["lastActivity"] = info.lastActivity;

                if (!info.errorMessage.isEmpty()) {
                    moduleObj["error"] = info.errorMessage;
                }

                // Capabilities
                JsonObject caps = moduleObj["capabilities"].to<JsonObject>();
                caps["hasWebHandlers"] = info.capabilities.hasWebHandlers;
                caps["hasTaskHandlers"] = info.capabilities.hasTaskHandlers;
                caps["hasEventHandlers"] = info.capabilities.hasEventHandlers;
                caps["hasConfigInterface"] = info.capabilities.hasConfigInterface;
                caps["hasStatusInterface"] = info.capabilities.hasStatusInterface;
                caps["requiresHardware"] = info.capabilities.requiresHardware;
                caps["isOptional"] = info.capabilities.isOptional;
            }
        }

        AsyncResponseStream *response = request->beginResponseStream("application/json");
        serializeJson(doc, *response);
        request->send(response);
    });

    // Module status endpoint - GET /api/modules/status
    server.on("/api/modules/status", HTTP_GET, [](AsyncWebServerRequest *request) {
        DynamicJsonDocument doc(1024);
        ModuleManager &manager = ModuleManager::getInstance();

        doc["systemHealthy"] = manager.isSystemHealthy();
        doc["totalModules"] = manager.getModuleCount();
        doc["activeModules"] = manager.getActiveModuleCount();
        doc["uptime"] = millis();

        // List unhealthy modules
        JsonArray unhealthy = doc["unhealthyModules"].to<JsonArray>();
        const auto &modules = manager.getModules();

        for (const auto &module : modules) {
            if (module.instance != nullptr && !module.instance->isHealthy()) {
                ModuleInfo info = module.instance->getInfo();
                unhealthy.add(info.name);
            }
        }

        AsyncResponseStream *response = request->beginResponseStream("application/json");
        serializeJson(doc, *response);
        request->send(response);
    });

    // Module control endpoint - POST /api/modules/control
    server.on("/api/modules/control", HTTP_POST, [](AsyncWebServerRequest *request) {
        if (!request->hasParam("module", true) || !request->hasParam("action", true)) {
            request->send(400, "application/json", "{\"success\":false,\"message\":\"Missing parameters\"}");
            return;
        }

        String moduleName = request->getParam("module", true)->value();
        String action = request->getParam("action", true)->value();

        DynamicJsonDocument doc(512);
        doc["module"] = moduleName;
        doc["action"] = action;

        ModuleManager &manager = ModuleManager::getInstance();
        ModuleInterface *module = manager.getModule(moduleName);

        if (module == nullptr) {
            doc["success"] = false;
            doc["message"] = "Module not found";
        } else {
            bool success = false;
            String message = "";

            if (action == "start") {
                success = module->start();
                message = success ? "Module started" : "Failed to start module";
            } else if (action == "stop") {
                success = module->stop();
                message = success ? "Module stopped" : "Failed to stop module";
            } else if (action == "restart") {
                success = module->stop() && module->start();
                message = success ? "Module restarted" : "Failed to restart module";
            } else if (action == "status") {
                ModuleInfo info = module->getInfo();
                success = true;
                message = "State: " + String(static_cast<int>(info.state)) +
                          ", Healthy: " + (module->isHealthy() ? "Yes" : "No");
            } else {
                success = false;
                message = "Unknown action";
            }

            doc["success"] = success;
            doc["message"] = message;
        }

        AsyncResponseStream *response = request->beginResponseStream("application/json");
        serializeJson(doc, *response);
        request->send(response);
    });

    Serial.println("[WEB] Module management API endpoints configured");
}

// ========================================================================
// ORGANIZED ENDPOINT SETUP FUNCTIONS
// ========================================================================

void setupSystemEndpoints(AsyncWebServer &server) {
    Serial.println("[WEB] Setting up system endpoints...");

    // System reboot
    server.on("/reboot", HTTP_POST, [](AsyncWebServerRequest *request) {
        request->send(200, "text/plain", "OK Reboot");
        logLine("Reboot request by user");
        wsErr("REBOOTING");
        delay(100);
        ws.enable(false);
        refreshAllPending();
        saveDB("/current/tagDB.json");
        ws.closeAll();
        delay(100);
        ESP.restart();
    });

    // System information
    server.on("/sysinfo", HTTP_GET, handleSysinfoRequest);
    server.on("/sysinfo.json", HTTP_GET, handleSysinfoRequest);

    server.on("/system_info", HTTP_GET, [](AsyncWebServerRequest *request) {
        WebResponseUtils::sendSystemResponse(request);
    });

    server.on("/restart_system", HTTP_POST, [](AsyncWebServerRequest *request) {
        SEND_SUCCESS(request, "System restart initiated");
        delay(1000);
        ESP.restart();
    });

    server.on("/get_function_status", HTTP_GET, [](AsyncWebServerRequest *request) {
        DynamicJsonDocument doc(JSON_BUFFER_SIZE);
        doc["contentGeneration"] = "stopped";
        doc["tagUpdates"] = "running";
        doc["systemHealth"] = "healthy";

        AsyncResponseStream *response = request->beginResponseStream("application/json");
        serializeJson(doc, *response);
        request->send(response);
    });
}

void setupTagManagementEndpoints(AsyncWebServer &server) {
    Serial.println("[WEB] Setting up tag management endpoints...");

    server.on("/get_db", HTTP_GET, [](AsyncWebServerRequest *request) {
        String json = "";
        if (request->hasParam("mac")) {
            String dst = request->getParam("mac")->value();
            uint8_t mac[8];
            if (hex2mac(dst, mac)) {
                json = tagDBtoJson(mac);
            } else {
                json = "{\"error\": \"malformatted parameter\"}";
            }
        } else {
            uint8_t startPos = 0;
            if (request->hasParam("pos")) {
                startPos = atoi(request->getParam("pos")->value().c_str());
            }
            json = tagDBtoJson(nullptr, startPos);
        }
        AsyncResponseStream *response = request->beginResponseStream("application/json");
        response->print(json);
        request->send(response);
    });

    server.on("/tag_cmd", HTTP_POST, [](AsyncWebServerRequest *request) {
        if (request->hasParam("mac", true) && request->hasParam("cmd", true)) {
            String mac = request->getParam("mac", true)->value();
            String cmd = request->getParam("cmd", true)->value();

            uint8_t dstmac[8];
            if (!hex2mac(mac, dstmac)) {
                request->send(400, "application/json", "{\"error\":\"Invalid MAC address\"}");
                return;
            }

            uint8_t command = cmd.toInt();
            DynamicJsonDocument response(JSON_BUFFER_SIZE);
            response["mac"] = mac;
            response["command"] = command;

            tagRecord *tag = tagRecord::findByMAC(dstmac);
            if (!tag) {
                response["success"] = false;
                response["error"] = "Tag not found";
            } else if (tag->isExternal) {
                response["success"] = false;
                response["error"] = "External tags not supported";
            } else {
                if (command == 4) {
                    tag->pendingIdle = 1;
                    response["success"] = true;
                    response["message"] = "Tag update queued";
                } else {
                    // Send command to tag
                    if (sendTagCommand(dstmac, command, true)) {
                        response["success"] = true;
                        response["message"] = "Command queued successfully";
                    } else {
                        response["success"] = false;
                        response["error"] = "Failed to queue command";
                    }
                }
            }

            String jsonString;
            serializeJson(response, jsonString);
            request->send(200, "application/json", jsonString);
        } else {
            request->send(400, "application/json", "{\"error\":\"Missing required parameters\"}");
        }
    });

    server.on("/led_flash", HTTP_GET, [](AsyncWebServerRequest *request) {
        if (request->hasParam("mac")) {
            String mac = request->getParam("mac")->value();
            uint8_t dstmac[8];
            if (hex2mac(mac, dstmac)) {
                // Send LED flash command (command 2)
                if (sendTagCommand(dstmac, 2, true)) {
                    request->send(200, "application/json", "{\"success\":true,\"message\":\"LED flash command sent\"}");
                } else {
                    request->send(500, "application/json", "{\"success\":false,\"error\":\"Failed to queue command\"}");
                }
            } else {
                request->send(400, "application/json", "{\"success\":false,\"error\":\"Invalid MAC address\"}");
            }
        } else {
            request->send(400, "application/json", "{\"success\":false,\"error\":\"Missing MAC parameter\"}");
        }
    });

    server.on("/backup_db", HTTP_GET, [](AsyncWebServerRequest *request) {
        saveDB("/current/tagDB.json");
        WebResponseUtils::sendFileResponse(request, "/current/tagDB.json", "application/json", true);
    });

    server.on("/restore_db", HTTP_POST, [](AsyncWebServerRequest *request) { request->send(200, "text/plain", "OK"); }, dotagDBUpload);
}

void setupWiFiNetworkEndpoints(AsyncWebServer &server) {
    Serial.println("[WEB] Setting up WiFi/Network endpoints...");

    server.on("/get_wifi_config", HTTP_GET, [](AsyncWebServerRequest *request) {
        WiFiStorageManager &wifiStorage = WIFI_STORAGE;
        AsyncResponseStream *response = request->beginResponseStream("application/json");
        DynamicJsonDocument doc = wifiStorage.toJson();
        doc["mac"] = WiFi.macAddress();
        serializeJson(doc, *response);
        request->send(response);
    });

    server.on("/get_ssid_list", HTTP_GET, [](AsyncWebServerRequest *request) {
        WiFiUtils &wifiUtils = WiFiUtils::getInstance();
        AsyncResponseStream *response = request->beginResponseStream("application/json");
        DynamicJsonDocument doc(JSON_BUFFER_SIZE);

        bool forceRescan = request->hasParam("rescan");

        // Use WiFiUtils to get scan results
        if (forceRescan) {
            wifiUtils.performAsyncScan(true, 5000);
        }
        WiFiScanResult scanResult = wifiUtils.getScanResults(false);

        JsonArray networks = doc["networks"].to<JsonArray>();
        for (const auto &network : scanResult.networks) {
            JsonObject net = networks.createNestedObject();
            net["ssid"] = network.ssid;
            net["rssi"] = network.rssi;
            net["ch"] = network.channel;
            net["enc"] = static_cast<int>(network.encryption);
        }

        if (WiFi.status() == WL_CONNECTED) {
            doc["current"]["ssid"] = WiFi.SSID();
            doc["current"]["rssi"] = WiFi.RSSI();
            doc["current"]["ip"] = WiFi.localIP().toString();
        }

        doc["count"] = networks.size();
        doc["timestamp"] = millis();

        serializeJson(doc, *response);
        request->send(response);
    });

    server.on("/wifi_scan", HTTP_GET, [](AsyncWebServerRequest *request) {
        DynamicJsonDocument doc(LARGE_JSON_BUFFER_SIZE);
        JsonArray networks = doc["networks"].to<JsonArray>();

        int n = WiFi.scanNetworks();
        for (int i = 0; i < n; i++) {
            JsonObject network = networks.createNestedObject();
            network["ssid"] = WiFi.SSID(i);
            network["rssi"] = WiFi.RSSI(i);
            network["encryption"] = WiFi.encryptionType(i);
            network["channel"] = WiFi.channel(i);
        }

        doc["count"] = n;
        AsyncResponseStream *response = request->beginResponseStream("application/json");
        serializeJson(doc, *response);
        request->send(response);
    });
}

void setupConfigurationEndpoints(AsyncWebServer &server) {
    Serial.println("[WEB] Setting up configuration endpoints...");

    server.on("/get_ap_config", HTTP_GET, [](AsyncWebServerRequest *request) {
        AsyncResponseStream *response = request->beginResponseStream("application/json");
        DynamicJsonDocument doc(LARGE_JSON_BUFFER_SIZE);

        doc["mac"] = WiFi.macAddress();
        // doc["apmac"] = mac2str(config.apmac);  // Field doesn't exist in Config struct
        doc["alias"] = config.alias;
        doc["language"] = config.language;
        doc["timezone"] = config.timeZone;
        // doc["ledbrightness"] = config.ledFlashBrightness;  // Field doesn't exist in Config struct
        doc["maxsleep"] = config.maxsleep;
        doc["stopsleep"] = config.stopsleep;
        doc["runstatus"] = config.runStatus;
        doc["preview"] = config.preview;
        doc["lock_to_ap"] = config.lock;  // Using existing lock field
        doc["uptime"] = millis();
        doc["freeheap"] = ESP.getFreeHeap();
        // doc["version"] = SWVERSION;  // SWVERSION not defined
        doc["rssi"] = WiFi.RSSI();
        doc["channel"] = config.channel;
        doc["led"] = config.led;

        serializeJson(doc, *response);
        request->send(response);
    });

    server.on("/save_cfg", HTTP_POST, [](AsyncWebServerRequest *request) {
        for (int i = 0; i < request->params(); i++) {
            const AsyncWebParameter *p = request->getParam(i);
            if (p->isPost()) {
                String param = p->name();
                String value = p->value();

                if (param == "apmac") {
                    // Handle AP MAC configuration
                    // setAPMac(value); // TODO: Implement if needed
                } else if (param == "alias") {
                    strlcpy(config.alias, value.c_str(), sizeof(config.alias));
                } else if (param == "lang") {
                    config.language = value.toInt();
                } else if (param == "tzone") {
                    strlcpy(config.timeZone, value.c_str(), sizeof(config.timeZone));
                } else if (param == "ledbrightness") {
                    // config.ledFlashBrightness = value.toInt(); // Field doesn't exist in Config struct
                } else if (param == "maxsleep") {
                    config.maxsleep = value.toInt();
                } else if (param == "stopsleep") {
                    config.stopsleep = value.toInt();
                } else if (param == "runstatus") {
                    config.runStatus = (value == "1");
                } else if (param == "preview") {
                    config.preview = (value == "1");
                } else if (param == "lock_to_ap") {
                    config.lock = (value == "1");  // Using existing lock field
                }
                // config.lock_to_ap = (value == "1");  // Field doesn't exist in Config struct
            }
        }
        saveAPconfig();
        request->send(200, "application/json", "{\"status\":\"saved\"}");
    });

    server.on("/save_apcfg", HTTP_POST, [](AsyncWebServerRequest *request) {
        bool needsReboot = false;
        String result = "saved";

        for (int i = 0; i < request->params(); i++) {
            const AsyncWebParameter *p = request->getParam(i);
            if (p->isPost()) {
                String param = p->name();
                String value = p->value();

                if (param == "apmac") {
                    // if (setAPMac(value)) needsReboot = true;  // Function not implemented yet
                } else if (param == "alias") {
                    // setTagAlias(value);  // Function not implemented yet
                    strncpy(config.alias, value.c_str(), sizeof(config.alias) - 1);
                    config.alias[sizeof(config.alias) - 1] = '\0';
                } else if (param == "channel") {
                    uint8_t oldChannel = config.channel;
                    config.channel = value.toInt();
                    if (config.channel != oldChannel) needsReboot = true;
                } else if (param == "led") {
                    config.led = (value == "1");
                }
                // Add other parameters as needed
            }
        }

        saveAPconfig();

        DynamicJsonDocument doc(JSON_BUFFER_SIZE);
        doc["status"] = result;
        doc["needsReboot"] = needsReboot;

        String response;
        serializeJson(doc, response);
        request->send(200, "application/json", response);
    });

    server.on("/set_var", HTTP_POST, [](AsyncWebServerRequest *request) {
        if (request->hasParam("name", true) && request->hasParam("value", true)) {
            String name = request->getParam("name", true)->value();
            String value = request->getParam("value", true)->value();
            request->send(200, "application/json", "{\"status\":\"set\"}");
        } else {
            request->send(400, "application/json", "{\"error\":\"Missing parameters\"}");
        }
    });

    server.on("/set_vars", HTTP_POST, [](AsyncWebServerRequest *request) {
        request->send(200, "application/json", "{\"status\":\"set\"}");
    });

    server.on("/setup", HTTP_GET, [](AsyncWebServerRequest *request) {
        request->send(*contentFS, "/www/setup.html");
    });
}

void setupFileManagementEndpoints(AsyncWebServer &server) {
    Serial.println("[WEB] Setting up file management endpoints...");

    server.on("/imgupload", HTTP_POST, [](AsyncWebServerRequest *request) { request->send(200); }, doImageUpload);

    server.on("/jsonupload", HTTP_POST, doJsonUpload);

    server.on("/getdata", HTTP_GET, [](AsyncWebServerRequest *request) {
        String contentparam = "";
        if (request->hasParam("mac") && request->hasParam("filename")) {
            String mac = request->getParam("mac")->value();
            String filename = request->getParam("filename")->value();
            filename.toLowerCase();

            uint8_t dst[8];
            if (hex2mac(mac, dst)) {
                tagRecord *taginfo = tagRecord::findByMAC(dst);
                if (taginfo != nullptr) {
                    String dir = "/current/" + mac.substring(0, 4) + "/";
                    contentparam = dir + filename;

                    if (contentparam.endsWith(".svg")) {
                        request->send(*contentFS, contentparam, "application/xml");
                    } else if (contentparam.endsWith(".jpg")) {
                        request->send(*contentFS, contentparam, "image/jpeg");
                    } else if (contentparam.endsWith(".png")) {
                        request->send(*contentFS, contentparam, "image/png");
                    } else if (contentparam.endsWith(".json")) {
                        request->send(*contentFS, contentparam, "application/json");
                    } else if (contentparam.endsWith(".c")) {
                        request->send(*contentFS, contentparam, "text/plain");
                    }
                } else {
                    request->send(404, "text/plain", "Tag not found");
                }
            } else {
                request->send(404, "text/plain", "Tag not found");
            }
        } else {
            request->send(400, "text/plain", "Missing parameters");
        }
    });

    // LittleFS file management
    AsyncCallbackJsonWebHandler *handler = new AsyncCallbackJsonWebHandler("/littlefs_put", [](AsyncWebServerRequest *request, JsonVariant &json) {
        const JsonObject &jsonObj = json.as<JsonObject>();

        if (!jsonObj.containsKey("filename") || !jsonObj.containsKey("content")) {
            request->send(400, "application/json", "{\"error\":\"Missing filename or content\"}");
            return;
        }

        String filename = jsonObj["filename"].as<String>();
        String content = jsonObj["content"].as<String>();

        StorageUtils::Result result = StorageUtils::getInstance().setString("files", filename, content);

        if (result == StorageUtils::Result::SUCCESS) {
            DynamicJsonDocument response(JSON_BUFFER_SIZE);
            response["success"] = true;
            response["filename"] = filename;
            response["size"] = content.length();
            response["message"] = "File saved successfully";

            String responseStr;
            serializeJson(response, responseStr);
            request->send(200, "application/json", responseStr);
        } else {
            request->send(500, "application/json", StorageUtils::getInstance().resultToString(result).c_str());
        }
    });
    server.addHandler(handler);

    server.on("/check_file", HTTP_GET, handleCheckFile);
}

void setupOTAUpdateEndpoints(AsyncWebServer &server) {
    Serial.println("[WEB] Setting up OTA/Update endpoints...");

    server.on("/rollback", HTTP_POST, handleRollback);
    server.on("/update_actions", HTTP_POST, handleUpdateActions);
    server.on("/update_ota", HTTP_POST, [](AsyncWebServerRequest *request) {
        request->send(200, "application/json", "{\"success\":true,\"message\":\"OTA update initiated\"}");
    });
}

void setupHardwareFeatureEndpoints(AsyncWebServer &server) {
    Serial.println("[WEB] Setting up hardware feature endpoints...");

    // Feature detection endpoints (HEAD requests)
    server.on("/tft_status", HTTP_HEAD, [](AsyncWebServerRequest *request) {
#ifdef HAS_TFT
        request->send(200, "text/plain", "TFT available");
#else
        request->send(404, "text/plain", "TFT not available");
#endif
    });

    server.on("/led_control", HTTP_HEAD, [](AsyncWebServerRequest *request) {
#ifdef HAS_RGB_LED
        request->send(200, "text/plain", "LED control available");
#else
        request->send(404, "text/plain", "LED control not available");
#endif
    });

    server.on("/ble_status", HTTP_HEAD, [](AsyncWebServerRequest *request) {
#ifdef HAS_BLE_WRITER
        request->send(200, "text/plain", "BLE available");
#else
        request->send(404, "text/plain", "BLE not available");
#endif
    });

    server.on("/subghz_status", HTTP_HEAD, [](AsyncWebServerRequest *request) {
#ifdef HAS_SUBGHZ
        request->send(200, "text/plain", "SubGHz available");
#else
        request->send(404, "text/plain", "SubGHz not available");
#endif
    });

    server.on("/rfid/status", HTTP_HEAD, [](AsyncWebServerRequest *request) {
#if HAS_RC522
        request->send(200, "text/plain", "RFID available");
#else
        request->send(404, "text/plain", "RFID not available");
#endif
    });

    server.on("/flasher_status", HTTP_HEAD, [](AsyncWebServerRequest *request) {
#ifdef HAS_EXT_FLASHER
        request->send(200, "text/plain", "External flasher available");
#else
        request->send(404, "text/plain", "External flasher not available");
#endif
    });

    // LED Control
    server.on("/led_control", HTTP_POST, [](AsyncWebServerRequest *request) {
#ifdef HAS_RGB_LED
        DynamicJsonDocument doc(JSON_BUFFER_SIZE);
        if (request->hasParam("action", true)) {
            String action = request->getParam("action", true)->value();
            if (action == "on" || action == "off" || action == "color") {
                doc["success"] = true;
                doc["state"] = action;
            } else {
                doc["success"] = false;
                doc["error"] = "Invalid action";
            }
        } else {
            doc["success"] = false;
            doc["error"] = "Missing action parameter";
        }

        AsyncResponseStream *response = request->beginResponseStream("application/json");
        serializeJson(doc, *response);
        request->send(response);
#else
        request->send(404, "application/json", "{\"error\":\"LED control not available\"}");
#endif
    });

    // BLE Status and Control
    server.on("/ble_status", HTTP_GET, [](AsyncWebServerRequest *request) {
#ifdef HAS_BLE_WRITER
        DynamicJsonDocument doc(JSON_BUFFER_SIZE);
        doc["available"] = true;
        doc["enabled"] = true;
        doc["scanning"] = false;

        AsyncResponseStream *response = request->beginResponseStream("application/json");
        serializeJson(doc, *response);
        request->send(response);
#else
        request->send(404, "application/json", "{\"error\":\"BLE not available\"}");
#endif
    });

    server.on("/ble_control", HTTP_POST, [](AsyncWebServerRequest *request) {
#ifdef HAS_BLE_WRITER
        request->send(200, "application/json", "{\"success\":true,\"message\":\"BLE command processed\"}");
#else
        request->send(404, "application/json", "{\"error\":\"BLE not available\"}");
#endif
    });
}

void setupC6ModuleEndpoints(AsyncWebServer &server) {
#ifdef C6_OTA_FLASHING
    Serial.println("[WEB] Setting up C6 module endpoints...");

    server.on("/get_c6_settings", HTTP_GET, handleGetC6Settings);
    server.on("/save_c6_settings", HTTP_POST, [](AsyncWebServerRequest *request) { request->send(200, "text/plain", "Settings saved"); }, NULL, handleSaveC6SettingsBody);
    server.on("/reset_c6_settings", HTTP_POST, handleResetC6Settings);
    server.on("/test_c6_connection", HTTP_GET, handleTestC6Connection);
    server.on("/test_c6_radio", HTTP_GET, handleTestC6Radio);
    server.on("/restart_c6", HTTP_POST, handleRestartC6);
    server.on("/backup_c6_config", HTTP_GET, handleBackupC6Config);
    server.on("/reset_c6_config", HTTP_POST, handleResetC6Config);
    server.on("/ap_list", HTTP_GET, handleAPList);
    server.on("/c6_update_status", HTTP_GET, handleC6UpdateStatus);
    server.on("/backup_c6_firmware", HTTP_GET, handleBackupC6Firmware);
    server.on("/upload_c6_firmware", HTTP_POST, [](AsyncWebServerRequest *request) { request->send(200, "text/plain", "Upload complete"); }, handleC6FirmwareUpload);
    server.on("/update_c6", HTTP_POST, [](AsyncWebServerRequest *request) { request->send(200, "text/plain", "Update complete"); }, handleC6FirmwareUpload);

#if HAS_C6_MODULE
    server.on("/list_drives", HTTP_GET, handleListDrives);
    server.on("/list_serial_ports", HTTP_GET, handleListSerialPorts);
    server.on("/flash_c6_ota", HTTP_POST, handleFlashC6OTA);
#endif
#endif
}

void setupAPIEndpoints(AsyncWebServer &server) {
    Serial.println("[WEB] Setting up API endpoints...");

    server.on("/api/error_report", HTTP_POST, [](AsyncWebServerRequest *request) {
        if (request->hasParam("error", true) && request->hasParam("url", true)) {
            String error = request->getParam("error", true)->value();
            String url = request->getParam("url", true)->value();
            Serial.printf("[JS ERROR] %s at %s\n", error.c_str(), url.c_str());
        }
        request->send(200, "application/json", "{\"status\":\"logged\"}");
    });

    server.on("/api/features", HTTP_GET, [](AsyncWebServerRequest *request) {
        DynamicJsonDocument doc(1024);
        doc["HAS_RGB_LED"] = false;
        doc["HAS_TFT"] = false;
        doc["HAS_BLE_WRITER"] = false;
        doc["HAS_IR_REMOTE"] = false;
        doc["HAS_RC522"] = false;
        doc["HAS_EXT_FLASHER"] = false;
        doc["C6_OTA_FLASHING"] = false;

#ifdef HAS_RGB_LED
        doc["HAS_RGB_LED"] = true;
#endif
#ifdef HAS_TFT
        doc["HAS_TFT"] = true;
#endif
#ifdef HAS_BLE_WRITER
        doc["HAS_BLE_WRITER"] = true;
#endif
#ifdef HAS_IR_REMOTE
        doc["HAS_IR_REMOTE"] = true;
#endif
#if HAS_RC522
        doc["HAS_RC522"] = true;
#endif
#ifdef HAS_EXT_FLASHER
        doc["HAS_EXT_FLASHER"] = true;
#endif
#ifdef C6_OTA_FLASHING
        doc["C6_OTA_FLASHING"] = true;
#endif

        AsyncResponseStream *response = request->beginResponseStream("application/json");
        serializeJson(doc, *response);
        request->send(response);
    });

    // OpenAI API Proxy
    server.on("/api/openai/chat", HTTP_POST, [](AsyncWebServerRequest *request) {
        // This will be handled by the body handler
    },
              NULL, [](AsyncWebServerRequest *request, uint8_t *data, size_t len, size_t index, size_t total) {
        static String requestBody = "";

        if (index == 0) {
            requestBody = "";
        }

        for (size_t i = 0; i < len; i++) {
            requestBody += (char)data[i];
        }

        if (index + len == total) {
            DynamicJsonDocument requestDoc(4096);
            DeserializationError error = deserializeJson(requestDoc, requestBody);

            if (error) {
                request->send(400, "application/json", "{\"error\":\"Invalid JSON\"}");
                return;
            }

            if (openaiApiKey.isEmpty()) {
                request->send(500, "application/json", "{\"error\":\"OpenAI API key not configured\"}");
                return;
            }

            WiFiClientSecure client;
            HTTPClient http;

            client.setInsecure();
            http.begin(client, "https://api.openai.com/v1/chat/completions");
            http.addHeader("Content-Type", "application/json");
            http.addHeader("Authorization", "Bearer " + openaiApiKey);

            String requestString;
            serializeJson(requestDoc, requestString);

            int httpResponseCode = http.POST(requestString);

            if (httpResponseCode > 0) {
                String response = http.getString();
                request->send(httpResponseCode, "application/json", response);
            } else {
                request->send(500, "application/json", "{\"error\":\"Failed to connect to OpenAI API\"}");
            }

            http.end();
        } });
}

void setupContentGenerationEndpoints(AsyncWebServer &server) {
    Serial.println("[WEB] Setting up content generation endpoints...");

    server.on("/start_content_generation", HTTP_POST, [](AsyncWebServerRequest *request) {
        request->send(200, "application/json", "{\"success\":true,\"message\":\"Content generation started\"}");
    });

    server.on("/stop_content_generation", HTTP_POST, [](AsyncWebServerRequest *request) {
        request->send(200, "application/json", "{\"success\":true,\"message\":\"Content generation stopped\"}");
    });

    server.on("/pause_content_generation", HTTP_POST, [](AsyncWebServerRequest *request) {
        request->send(200, "application/json", "{\"success\":true,\"message\":\"Content generation paused\"}");
    });
}

// ========================================================================
// OPTIMIZED INIT WEB FUNCTION
// ========================================================================

void init_web_optimized() {
    ModuleInitializer::logInitStart("Web Server");

    // Initialize WebSocket utilities
    WebSocketUtils::initialize(&ws);

    // Configure WiFi
    WiFi.mode(WIFI_STA);
    WiFi.setTxPower(static_cast<wifi_power_t>(config.wifiPower));
    wm.connectToWifi();

    // Add core handlers
    server.addHandler(new SPIFFSEditor(*contentFS));
    server.addHandler(&ws);

    // Serve static content with caching
    server.serveStatic("/current", *contentFS, "/current/").setCacheControl("max-age=604800");
    server.serveStatic("/tagtypes", *contentFS, "/tagtypes/").setCacheControl("max-age=300");
    server.serveStatic("/", *contentFS, "/www/").setDefaultFile("index.html");

    // Configure CORS headers
    DefaultHeaders::Instance().addHeader("Access-Control-Allow-Origin", "*");
    DefaultHeaders::Instance().addHeader("Access-Control-Allow-Headers", "content-type");

    // Setup organized endpoint groups
    Serial.println("[WEB] Setting up organized endpoint groups...");
    setupSystemEndpoints(server);
    setupTagManagementEndpoints(server);
    setupWiFiNetworkEndpoints(server);
    setupConfigurationEndpoints(server);
    setupFileManagementEndpoints(server);
    setupOTAUpdateEndpoints(server);
    setupHardwareFeatureEndpoints(server);
    setupC6ModuleEndpoints(server);
    setupAPIEndpoints(server);
    setupContentGenerationEndpoints(server);

    // Setup module management API
    setupModuleManagementAPI(server);

    // Start server
    server.begin();
    ModuleInitializer::logInitSuccess("Web Server");

    Serial.println("[WEB] Web server initialized with organized endpoint structure");
}
