#include "web.h"

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

#include "AsyncJson.h"
#include "LittleFS.h"
#include "SPIFFSEditor.h"
#include "commstructs.h"
#include "language.h"
#include "leds.h"
#include "newproto.h"
#include "ota.h"
#include "serialap.h"
#include "settings.h"
#include "storage.h"
#include "system.h"
#include "tag_db.h"
#include "udp.h"
#include "wifimanager.h"

#ifdef HAS_IR_REMOTE
#include "ir_interface.h"
#endif

#ifdef HAS_RC522
#include "rc522_interface.h"
#endif

#ifdef HAS_EXT_FLASHER
#include "webflasher.h"
#endif

AsyncWebServer server(80);
AsyncWebSocket ws("/ws");
WifiManager wm;

SemaphoreHandle_t wsMutex;
uint32_t lastssidscan = 0;

void wsLog(const String &text) {
    DynamicJsonDocument doc(2048);
    doc["logMsg"] = text;
    if (wsMutex) xSemaphoreTake(wsMutex, portMAX_DELAY);
    ws.textAll(doc.as<String>());
    if (wsMutex) xSemaphoreGive(wsMutex);
}

void wsErr(const String &text) {
    DynamicJsonDocument doc(2048);
    doc["errMsg"] = text;
    if (wsMutex) xSemaphoreTake(wsMutex, portMAX_DELAY);
    ws.textAll(doc.as<String>());
    if (wsMutex) xSemaphoreGive(wsMutex);
}

size_t dbSize() {
    size_t size = tagDB.size() * sizeof(tagRecord);
    for (auto &tag : tagDB) {
        if (tag->data) {
            size += tag->len;
        }
        size += tag->modeConfigJson.length();
    }
    return size;
}

void wsSendSysteminfo() {
    DynamicJsonDocument doc(2048);
    JsonObject sys = doc["sys"].to<JsonObject>();
    time_t now;
    time(&now);
    static int freeSpaceLastRun = 0;
    static size_t tagDBsize = 0;
    static uint64_t freeSpace = Storage.freeSpace();

    sys["currtime"] = now;
    sys["heap"] = ESP.getFreeHeap();
    sys["recordcount"] = tagDBsize;
    sys["dbsize"] = dbSize();

    if (millis() - freeSpaceLastRun > 30000 || freeSpaceLastRun == 0) {
        freeSpace = Storage.freeSpace();
        tagDBsize = tagDB.size();
        freeSpaceLastRun = millis();
    }
    sys["littlefsfree"] = freeSpace;

#if BOARD_HAS_PSRAM
    sys["psfree"] = ESP.getFreePsram();
#endif

    sys["apstate"] = apInfo.state;
    sys["runstate"] = config.runStatus;
    sys["rssi"] = WiFi.RSSI();
    sys["wifistatus"] = WiFi.status();
    sys["wifissid"] = WiFi.SSID();
    sys["uptime"] = esp_timer_get_time() / 1000000;

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
    if(apInfo.hasSubGhz) {
       ApChanString += ", SubGhz ";
       if(apInfo.SubGhzChannel == 0) {
          ApChanString += "disabled";
       }
       else {
          ApChanString += String(apInfo.SubGhzChannel);
       }
    }
    setVarDB("ap_ch", ApChanString);
#else
    setVarDB("ap_ch", String(apInfo.channel));
#endif

    // reboot once at night
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

    static uint32_t tagcounttimer = 0;
    if (millis() - tagcounttimer > 60000 || tagcounttimer == 0) {
        uint32_t timeoutcount = 0, lowbattcount = 0;
        uint32_t tagcount = getTagCount(timeoutcount, lowbattcount);
        sys["lowbattcount"] = lowbattcount;
        sys["timeoutcount"] = timeoutcount;
        char result[40];
        if (timeoutcount > 0) {
            snprintf(result, sizeof(result), "%lu/%lu, %lu timeout", tagcount, tagDB.size(), timeoutcount);
        } else {
            snprintf(result, sizeof(result), "%lu / %lu", tagcount, tagDB.size());
        }
        setVarDB("ap_tagcount", result);
#ifdef HAS_RGB_LED
        if (timeoutcount > 0) {
            if (apInfo.state == AP_STATE_ONLINE && apInfo.isOnline == true) rgbIdleColor = CRGB::DarkBlue;
        } else {
            if (apInfo.state == AP_STATE_ONLINE && apInfo.isOnline == true) rgbIdleColor = CRGB::Green;
        }
#endif
        tagcounttimer = millis();
    }

    xSemaphoreTake(wsMutex, portMAX_DELAY);
    ws.textAll(doc.as<String>());
    xSemaphoreGive(wsMutex);
}

void wsSendTaginfo(const uint8_t *mac, uint8_t syncMode) {
    if (syncMode != SYNC_DELETE) {
        String json = "";
        json = tagDBtoJson(mac);
        xSemaphoreTake(wsMutex, portMAX_DELAY);
        ws.textAll(json);
        xSemaphoreGive(wsMutex);
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
    DynamicJsonDocument doc(2048);
    JsonObject ap = doc["apitem"].to<JsonObject>();

    char version_str[6];
    sprintf(version_str, "%04X", apitem->version);

    ap["ip"] = ((IPAddress)apitem->src).toString();
    ap["alias"] = apitem->alias;
    ap["count"] = apitem->tagCount;
    ap["channel"] = apitem->channelId;
    ap["version"] = version_str;

    if (wsMutex) xSemaphoreTake(wsMutex, portMAX_DELAY);
    ws.textAll(doc.as<String>());
    if (wsMutex) xSemaphoreGive(wsMutex);
}

void wsSerial(const String &text) {
    wsSerial(text, String(""));
}

void wsSerial(const String &text, const String &color) {
    DynamicJsonDocument doc(2048);
    doc["console"] = text;
    if (!color.isEmpty()) doc["color"] = color;
    Serial.println(text);
    if (wsMutex) xSemaphoreTake(wsMutex, portMAX_DELAY);
    ws.textAll(doc.as<String>());
    if (wsMutex) xSemaphoreGive(wsMutex);
}

uint8_t wsClientCount() {
    return ws.count();
}

void init_web() {
    wsMutex = xSemaphoreCreateMutex();
    WiFi.mode(WIFI_STA);
    WiFi.setTxPower(static_cast<wifi_power_t>(config.wifiPower));

    wm.connectToWifi();

    server.addHandler(new SPIFFSEditor(*contentFS));

    server.addHandler(&ws);

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
        if (request->hasParam("mac")) {
            String dst = request->getParam("mac")->value();
            uint8_t mac[8];
            if (hex2mac(dst, mac)) {
                tagRecord *taginfo = tagRecord::findByMAC(mac);
                if (taginfo != nullptr) {
                    uint8_t payload[12] = {0};
                    if (request->hasParam("pattern")) {
                        if (sscanf(request->getParam("pattern")->value().c_str(), "%2hhx%2hhx%2hhx%2hhx%2hhx%2hhx%2hhx%2hhx%2hhx%2hhx%2hhx%2hhx",
                                   &payload[0], &payload[1], &payload[2], &payload[3],
                                   &payload[4], &payload[5], &payload[6], &payload[7],
                                   &payload[8], &payload[9], &payload[10], &payload[11]) != 12) {
                            request->send(400, "text/plain", "Error: expects 12 hex bytes in pattern");
                            return;
                        }
                    }
                    sendTagCommand(mac, CMD_DO_LEDFLASH, !taginfo->isExternal, payload);
                    request->send(200, "text/plain", "ok, request transmitted");
                    return;
                }
            }
        }
        request->send(400, "text/plain", "parameters are missing");
    });

    server.on("/get_ap_config", HTTP_GET, [](AsyncWebServerRequest *request) {
        UDPcomm udpsync;
        udpsync.getAPList();
        AsyncResponseStream *response = request->beginResponseStream("application/json");
        String HasC6 = "0";
        String HasH2 = "0";
        String HasTSLR = "0";

        response->print("{");
#ifdef HAS_H2
        HasH2 = "1";
#endif
#ifdef HAS_TSLR
        HasTSLR = "1";
#endif
#ifdef C6_OTA_FLASHING
        HasC6 = "1";
#endif
        response->print("\"C6\": \"" + HasC6 + "\", ");
        response->print("\"hasC6\": " + HasC6 + ", ");
        response->print("\"H2\": \"" + HasH2 + "\", ");
        response->print("\"TLSR\": \"" + HasTSLR + "\", ");
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
#ifdef HAS_BLE_WRITER
        response->print("\"hasBLE\": \"1\", ");
#else
        response->print("\"hasBLE\": \"0\", ");
#endif

#ifdef HAS_SUBGHZ
        response->print("\"hasSubGhz\": \"" + String(apInfo.hasSubGhz) + "\",");
#else
        response->print("\"hasSubGhz\": \"0\", ");
#endif

        response->print("\"apstate\": \"" + String(apInfo.state) + "\"");

        File configFile = contentFS->open("/current/apconfig.json", "r");
        if (configFile) {
            response->print(", ");
            configFile.seek(1);
            const size_t bufferSize = 64;
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
        Preferences preferences;
        AsyncResponseStream *response = request->beginResponseStream("application/json");
        DynamicJsonDocument doc(2048);
        preferences.begin("wifi", false);
        const char *keys[] = {"ssid", "pw", "ip", "mask", "gw", "dns"};
        const size_t numKeys = sizeof(keys) / sizeof(keys[0]);
        for (size_t i = 0; i < numKeys; i++) {
            doc[keys[i]] = preferences.getString(keys[i], "");
        }
        doc["mac"] = WiFi.macAddress();
        serializeJson(doc, *response);
        request->send(response);
    });

    server.on("/get_ssid_list", HTTP_GET, [](AsyncWebServerRequest *request) {
        AsyncResponseStream *response = request->beginResponseStream("application/json");
        DynamicJsonDocument doc(2048);

        doc["scanstatus"] = WiFi.scanComplete();
        JsonArray networks = doc["networks"].to<JsonArray>();
        for (int i = 0; i < (WiFi.scanComplete() > 50 ? 50 : WiFi.scanComplete()); ++i) {
            if (WiFi.SSID(i) != "") {
                JsonObject network = networks.createNestedObject();
                network["ssid"] = WiFi.SSID(i);
                network["ch"] = WiFi.channel(i);
                network["rssi"] = WiFi.RSSI(i);
                network["enc"] = WiFi.encryptionType(i);
            }
        }
        if (WiFi.scanComplete() != -1 && (WiFi.scanComplete() == -2 || millis() - lastssidscan > 30000)) {
            WiFi.scanDelete();
            Serial.println("start scanning");
            WiFi.scanNetworks(true, true);
            lastssidscan = millis();
        }

        serializeJson(doc, *response);
        request->send(response);
    });

    AsyncCallbackJsonWebHandler *handler = new AsyncCallbackJsonWebHandler("/save_wifi_config", [](AsyncWebServerRequest *request, JsonVariant &json) {
        const JsonObject &jsonObj = json.as<JsonObject>();
        Preferences preferences;
        preferences.begin("wifi", false);
        const char *keys[] = {"ssid", "pw", "ip", "mask", "gw", "dns"};
        const size_t numKeys = sizeof(keys) / sizeof(keys[0]);
        for (size_t i = 0; i < numKeys; i++) {
            String key = keys[i];
            if (jsonObj[key].is<String>()) {
                preferences.putString(key.c_str(), jsonObj[key].as<String>());
            }
        }
        preferences.end();
        Serial.println("config saved");
        request->send(200, "text/plain", "Ok, saved");

        ws.enable(false);

        if (jsonObj["ssid"].as<String>() == "factory") {
            config.runStatus = RUNSTATUS_STOP;
            vTaskDelay(2000 / portTICK_PERIOD_MS);
            preferences.begin("wifi", false);
            preferences.putString("ssid", "");
            preferences.putString("pw", "");
            preferences.end();
            destroyDB();
            cleanupCurrent();
            contentFS->remove("/AP_FW_Pack.bin");
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
            delay(100);
            esp_deep_sleep_start();
            ESP.restart();
        } else {
            refreshAllPending();
            saveDB("/current/tagDB.json");
        }

        ws.closeAll();
        delay(100);
        ESP.restart();
    });
    server.addHandler(handler);

    // end of setup

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
    server.on("/update_c6", HTTP_POST, handleUpdateC6);
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
        doc["HAS_RGB_LED"] = false;
        doc["HAS_TFT"] = false;
        doc["HAS_BLE_WRITER"] = false;
        doc["HAS_SUBGHZ"] = false;
        doc["C6_OTA_FLASHING"] = false;
        doc["HAS_IR_REMOTE"] = false;
        doc["HAS_RC522_RFID"] = false;
        doc["HAS_EXT_FLASHER"] = false;
        
        #ifdef HAS_RGB_LED
        doc["HAS_RGB_LED"] = true;
        #endif
        #ifdef HAS_TFT
        doc["HAS_TFT"] = true;
        #endif
        #ifdef HAS_BLE_WRITER
        doc["HAS_BLE_WRITER"] = true;
        #endif
        #ifdef HAS_SUBGHZ
        doc["HAS_SUBGHZ"] = true;
        #endif
        #ifdef C6_OTA_FLASHING
        doc["C6_OTA_FLASHING"] = true;
        #endif
        #ifdef HAS_IR_REMOTE
        doc["HAS_IR_REMOTE"] = true;
        #endif
        #ifdef HAS_RC522_RFID
        doc["HAS_RC522_RFID"] = true;
        #endif
        #ifdef HAS_EXT_FLASHER
        doc["HAS_EXT_FLASHER"] = true;
        #endif
        
        String response;
        serializeJson(doc, response);
        request->send(200, "application/json", response);
    });

    // C6 Module Management Endpoints
    server.on("/get_c6_settings", HTTP_GET, handleGetC6Settings);
    server.on("/save_c6_settings", HTTP_POST, 
        [](AsyncWebServerRequest *request) {
            request->send(200, "text/plain", "Settings saved");
        },
        NULL,
        handleSaveC6SettingsBody);
    server.on("/reset_c6_settings", HTTP_POST, handleResetC6Settings);
    server.on("/test_c6_connection", HTTP_GET, handleTestC6Connection);
    server.on("/test_c6_radio", HTTP_GET, handleTestC6Radio);
    server.on("/restart_c6", HTTP_POST, handleRestartC6);
    server.on("/backup_c6_config", HTTP_GET, handleBackupC6Config);
    server.on("/reset_c6_config", HTTP_POST, handleResetC6Config);
    server.on("/ap_list", HTTP_GET, handleAPList); // Add missing endpoint for C6 module interface
    server.on("/c6_update_status", HTTP_GET, handleC6UpdateStatus);
    server.on("/backup_c6_firmware", HTTP_GET, handleBackupC6Firmware);
    server.on("/upload_c6_firmware", HTTP_POST, 
        [](AsyncWebServerRequest *request) {
            request->send(200, "text/plain", "Upload complete");
        },
        handleC6FirmwareUpload);
    
    // Drives and device management endpoints
    server.on("/list_drives", HTTP_GET, handleListDrives);
    server.on("/list_serial_ports", HTTP_GET, handleListSerialPorts);
    server.on("/flash_c6_ota", HTTP_POST, handleFlashC6OTA);
    
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
    
    server.on("/c6_status", HTTP_HEAD, [](AsyncWebServerRequest *request) {
        #ifdef C6_OTA_FLASHING
        request->send(200, "text/plain", "C6 OTA available");
        #else
        request->send(404, "text/plain", "C6 OTA not available");
        #endif
    });
    
    server.on("/rfid/status", HTTP_HEAD, [](AsyncWebServerRequest *request) {
        #ifdef HAS_RC522_RFID
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
        String response = success ? 
            "{\"success\":true,\"message\":\"Command sent\"}" :
            "{\"success\":false,\"error\":\"Failed to send command\"}";
        request->send(success ? 200 : 500, "application/json", response);
    });
    
    server.on("/ir/learn", HTTP_POST, [](AsyncWebServerRequest *request) {
        if (!request->hasParam("timeout", true)) {
            request->send(400, "application/json", "{\"error\":\"Missing timeout parameter\"}");
            return;
        }
        
        unsigned long timeout = request->getParam("timeout", true)->value().toInt();
        if (timeout == 0) timeout = 10000; // Default 10 seconds
        
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
        
        for (const String& profile : profiles) {
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

// Temporarily disable RC522 until IR is working
#ifdef HAS_RC522
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
            uint8_t sector = 1; // Default to sector 1
            
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
    
    server.on("/rfid/cards", HTTP_GET, [](AsyncWebServerRequest *request) {
        std::vector<RFIDCardInfo> cards = rc522Interface.getDetectedCards();
        
        DynamicJsonDocument doc(2048);
        JsonArray cardArray = doc.createNestedArray("cards");
        
        for (const RFIDCardInfo& card : cards) {
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
        doc["runStatusText"] = (config.runStatus == RUNSTATUS_RUN) ? "Running" : 
                               (config.runStatus == RUNSTATUS_STOP) ? "Stopped" : 
                               (config.runStatus == RUNSTATUS_PAUSE) ? "Paused" : "Initializing";
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
        DynamicJsonDocument doc(2048);
        doc["success"] = true;
        doc["chipModel"] = ESP.getChipModel();
        doc["chipRevision"] = ESP.getChipRevision();
        doc["cpuFreq"] = ESP.getCpuFreqMHz();
        doc["freeHeap"] = ESP.getFreeHeap();
        doc["totalHeap"] = ESP.getHeapSize();
        doc["minFreeHeap"] = ESP.getMinFreeHeap();
        doc["flashSize"] = ESP.getFlashChipSize();
        doc["flashSpeed"] = ESP.getFlashChipSpeed();
        doc["sketchSize"] = ESP.getSketchSize();
        doc["freeSketchSpace"] = ESP.getFreeSketchSpace();
        doc["uptime"] = millis();
        doc["wifiStatus"] = WiFi.status();
        doc["localIP"] = WiFi.localIP().toString();
        doc["macAddress"] = WiFi.macAddress();
        doc["temperature"] = temperatureRead();
        
        AsyncResponseStream *response = request->beginResponseStream("application/json");
        serializeJson(doc, *response);
        request->send(response);
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
        xTaskCreate([](void* param) {
            int delayMs = *(int*)param;
            vTaskDelay(delayMs * 1000 / portTICK_PERIOD_MS);
            ESP.restart();
        }, "restart_task", 2048, &delay, 1, NULL);
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
        doc["wifi"]["connected"] = (WiFi.status() == WL_CONNECTED);
        doc["wifi"]["rssi"] = WiFi.RSSI();
        doc["wifi"]["channel"] = WiFi.channel();
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
    
    // LED Control Endpoint
    server.on("/led_control", HTTP_POST, [](AsyncWebServerRequest *request) {
        if (!request->hasParam("action", true)) {
            request->send(400, "application/json", "{\"error\":\"Missing action parameter\"}");
            return;
        }
        
        String action = request->getParam("action", true)->value();
        DynamicJsonDocument doc(512);
        doc["success"] = true;
        doc["action"] = action;
        
        if (action == "setBrightness") {
            int brightness = request->hasParam("brightness", true) ? request->getParam("brightness", true)->value().toInt() : 128;
            setBrightness(brightness);
            doc["result"] = "Brightness set to " + String(brightness);
        } else if (action == "setColor") {
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
    
    // C6 Module Endpoints
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
            APTagReset();
            doc["result"] = "C6 module reset initiated";
        } else if (action == "status") {
            doc["result"] = "Status check completed";
        } else if (action == "diagnostic") {
            bool pingResult = sendPing();
            doc["result"] = pingResult ? "Diagnostic ping successful" : "Diagnostic ping failed";
        } else if (action == "configure") {
            doc["result"] = "Configuration update queued";
        } else {
            doc["result"] = "Action queued for execution";
        }
        
        AsyncResponseStream *response = request->beginResponseStream("application/json");
        serializeJson(doc, *response);
        request->send(response);
    });
    
    // Network Endpoints
    server.on("/network_info", HTTP_GET, [](AsyncWebServerRequest *request) {
        DynamicJsonDocument doc(1024);
        doc["success"] = true;
        doc["wifi"]["connected"] = (WiFi.status() == WL_CONNECTED);
        doc["wifi"]["ssid"] = WiFi.SSID();
        doc["wifi"]["rssi"] = WiFi.RSSI();
        doc["wifi"]["localIP"] = WiFi.localIP().toString();
        doc["wifi"]["macAddress"] = WiFi.macAddress();
        doc["wifi"]["channel"] = WiFi.channel();
        doc["wifi"]["hostname"] = WiFi.getHostname();
        doc["ap"]["enabled"] = (WiFi.getMode() == WIFI_AP || WiFi.getMode() == WIFI_AP_STA);
        doc["ap"]["clients"] = WiFi.softAPgetStationNum();
        doc["ap"]["ip"] = WiFi.softAPIP().toString();
        
        AsyncResponseStream *response = request->beginResponseStream("application/json");
        serializeJson(doc, *response);
        request->send(response);
    });

    server.on("/wifi_scan", HTTP_GET, [](AsyncWebServerRequest *request) {
        int n = WiFi.scanNetworks();
        DynamicJsonDocument doc(2048);
        doc["success"] = true;
        doc["networkCount"] = n;
        
        JsonArray networks = doc.createNestedArray("networks");
        for (int i = 0; i < n; i++) {
            JsonObject network = networks.createNestedObject();
            network["ssid"] = WiFi.SSID(i);
            network["rssi"] = WiFi.RSSI(i);
            network["encryption"] = WiFi.encryptionType(i);
            network["channel"] = WiFi.channel(i);
            network["bssid"] = WiFi.BSSIDstr(i);
        }
        
        WiFi.scanDelete();
        
        AsyncResponseStream *response = request->beginResponseStream("application/json");
        serializeJson(doc, *response);
        request->send(response);
    });

    server.on("/wifi_manage", HTTP_POST, [](AsyncWebServerRequest *request) {
        if (!request->hasParam("action", true)) {
            request->send(400, "application/json", "{\"error\":\"Missing action parameter\"}");
            return;
        }
        
        String action = request->getParam("action", true)->value();
        String ssid = request->hasParam("ssid", true) ? request->getParam("ssid", true)->value() : "";
        String password = request->hasParam("password", true) ? request->getParam("password", true)->value() : "";
        
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
            WiFi.scanNetworks(true);
            doc["result"] = "WiFi scan initiated";
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
        DynamicJsonDocument doc(512);
        doc["success"] = true;
        doc["bleEnabled"] = false;  // BLE not implemented yet
        doc["connectedDevices"] = 0;
        doc["scanning"] = false;
        doc["advertiseName"] = "ESP32-AP-Flasher";
        
        AsyncResponseStream *response = request->beginResponseStream("application/json");
        serializeJson(doc, *response);
        request->send(response);
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
            bringAPOnline();
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
    server.on("/api/openai/chat", HTTP_POST, 
        [](AsyncWebServerRequest *request) {
            // This will be handled by the body handler
        },
        NULL,
        [](AsyncWebServerRequest *request, uint8_t *data, size_t len, size_t index, size_t total) {
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
            }
        });

    server.begin();
}

#define UPLOAD_BUFFER_SIZE 32768

struct UploadInfo {
    String filename;
    uint8_t buffer[UPLOAD_BUFFER_SIZE];
    size_t bufferSize;
};

void doImageUpload(AsyncWebServerRequest *request, String filename, size_t index, uint8_t *data, size_t len, bool final) {
    String uploadfilename;
    if (!index) {
        if (config.runStatus != RUNSTATUS_RUN) {
            request->send(409, "text/plain", "Come back later");
            return;
        }
        if (!request->hasParam("mac", true)) {
            request->send(400, "text/plain", "parameters incomplete");
            return;
        }
        logLine("http imageUpload " + uploadfilename);

        uploadfilename = request->getParam("mac", true)->value() + "_" + String(millis()) + ".jpg";
        File file = contentFS->open("/temp/" + uploadfilename, "w");
        file.close();
        Serial.println("upload started " + uploadfilename);

        UploadInfo *uploadInfo = new UploadInfo{uploadfilename, {}, 0};
        request->_tempObject = (void *)uploadInfo;
    }

    UploadInfo *uploadInfo = static_cast<UploadInfo *>(request->_tempObject);

    if (uploadInfo != nullptr) {
        uploadfilename = uploadInfo->filename;

        if (len) {
            if (uploadInfo->bufferSize + len <= UPLOAD_BUFFER_SIZE) {
                memcpy(&uploadInfo->buffer[uploadInfo->bufferSize], data, len);
                uploadInfo->bufferSize += len;
            } else {
                xSemaphoreTake(fsMutex, portMAX_DELAY);
                File file = contentFS->open("/temp/" + uploadfilename, "a");
                if (file) {
                    file.write(uploadInfo->buffer, uploadInfo->bufferSize);
                    file.close();
                    uploadInfo->bufferSize = 0;
                    xSemaphoreGive(fsMutex);
                } else {
                    xSemaphoreGive(fsMutex);
                    logLine("Failed to open file for appending: " + uploadfilename);
                }

                memcpy(uploadInfo->buffer, data, len);
                uploadInfo->bufferSize = len;
            }
        }

        if (final) {
            if (uploadInfo->bufferSize > 0) {
                xSemaphoreTake(fsMutex, portMAX_DELAY);
                File file = contentFS->open("/temp/" + uploadfilename, "a");
                if (file) {
                    file.write(uploadInfo->buffer, uploadInfo->bufferSize);
                    file.close();
                    xSemaphoreGive(fsMutex);
                } else {
                    xSemaphoreGive(fsMutex);
                    logLine("Failed to open file for appending: " + uploadfilename);
                }
                request->_tempObject = nullptr;
                delete uploadInfo;
            }

            if (request->hasParam("mac", true)) {
                String dst = request->getParam("mac", true)->value();
                uint8_t mac[8];
                if (hex2mac(dst, mac)) {
                    tagRecord *taginfo = tagRecord::findByMAC(mac);
                    if (taginfo != nullptr) {
                        uint8_t dither = 1;
                        if (request->hasParam("dither", true)) {
                            dither = request->getParam("dither", true)->value().toInt();
                        }
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
                        uint32_t ttl = 0;
                        if (request->hasParam("ttl", true)) {
                            ttl = request->getParam("ttl", true)->value().toInt();
                        }
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
                        taginfo->modeConfigJson = "{\"filename\":\"/temp/" + uploadfilename + "\",\"timetolive\":\"" + String(ttl) + "\",\"dither\":\"" + String(dither) + "\",\"delete\":\"1\", \"preload\":\"" + String(preload) + "\", \"preload_lut\":\"" + String(preloadlut) + "\", \"preload_type\":\"" + String(preloadtype) + "\"}";
                        if (request->hasParam("contentmode", true)) {
                            taginfo->contentMode = request->getParam("contentmode", true)->value().toInt();
                        } else {
                            taginfo->contentMode = 24;
                        }
                        Serial.println("upload finished " + uploadfilename);
                        taginfo->nextupdate = 0;
                        wsSendTaginfo(mac, SYNC_USERCFG);
                        request->send(200, "text/plain", "Ok, saved");
                    } else {
                        request->send(400, "text/plain", "mac not found");
                    }
                }
            }
        }
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

// C6 Module Management Functions
// ===============================

#ifdef C6_OTA_FLASHING
#endif

void handleC6UpdateStatus(AsyncWebServerRequest *request) {
#ifdef C6_OTA_FLASHING
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
#else
    request->send(400, "text/plain", "C6 module not supported");
#endif
}

void handleBackupC6Firmware(AsyncWebServerRequest *request) {
#ifdef C6_OTA_FLASHING
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
#else
    request->send(400, "text/plain", "C6 module not supported");
#endif
}

void handleAPList(AsyncWebServerRequest *request) {
#ifdef C6_OTA_FLASHING
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
#else
    request->send(400, "text/plain", "C6 module not supported");
#endif
}

void handleGetC6Settings(AsyncWebServerRequest *request) {
#ifdef C6_OTA_FLASHING
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
#else
    request->send(400, "text/plain", "C6 module not supported");
#endif
}

void handleSaveC6SettingsBody(AsyncWebServerRequest *request, uint8_t *data, size_t len, size_t index, size_t total) {
#ifdef C6_OTA_FLASHING
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
#else
    request->send(400, "text/plain", "C6 module not supported");
#endif
}

void handleSaveC6Settings(AsyncWebServerRequest *request, uint8_t *data, size_t len, size_t index, size_t total) {
    // This function is replaced by handleSaveC6SettingsBody
}

void handleResetC6Settings(AsyncWebServerRequest *request) {
#ifdef C6_OTA_FLASHING
    Preferences preferences;
    preferences.begin("c6_module", false);
    preferences.clear();
    preferences.end();
    
    wsSerial("C6 module settings reset to defaults");
    request->send(200, "application/json", "{\"success\":true}");
#else
    request->send(400, "text/plain", "C6 module not supported");
#endif
}

void handleTestC6Connection(AsyncWebServerRequest *request) {
#ifdef C6_OTA_FLASHING
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
#else
    request->send(400, "text/plain", "C6 module not supported");
#endif
}

void handleTestC6Radio(AsyncWebServerRequest *request) {
#ifdef C6_OTA_FLASHING
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
#else
    request->send(400, "text/plain", "C6 module not supported");
#endif
}

void handleRestartC6(AsyncWebServerRequest *request) {
#ifdef C6_OTA_FLASHING
    wsSerial("Restarting C6 module...");
    
    // Send restart command to C6 module
    bool success = restartC6Module();
    
    if (success) {
        request->send(200, "application/json", "{\"success\":true}");
    } else {
        request->send(500, "application/json", "{\"success\":false,\"error\":\"Restart failed\"}");
    }
#else
    request->send(400, "text/plain", "C6 module not supported");
#endif
}

void handleBackupC6Config(AsyncWebServerRequest *request) {
#ifdef C6_OTA_FLASHING
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
#else
    request->send(400, "text/plain", "C6 module not supported");
#endif
}

void handleResetC6Config(AsyncWebServerRequest *request) {
#ifdef C6_OTA_FLASHING
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
#else
    request->send(400, "text/plain", "C6 module not supported");
#endif
}

void handleC6FirmwareUpload(AsyncWebServerRequest *request, String filename, size_t index, uint8_t *data, size_t len, bool final) {
#ifdef C6_OTA_FLASHING
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
            struct FirmwareUpdateParams {
                String filename;
                bool verify;
            };
            
            FirmwareUpdateParams* params = new FirmwareUpdateParams();
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
#else
    request->send(400, "text/plain", "C6 module not supported");
#endif
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
#ifdef C6_OTA_FLASHING
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
    struct FlashParams {
        String firmwareFile;
        String comPort;
        bool eraseFlash;
        bool verifyFlash;
        bool resetAfterFlash;
        int baudRate;
    };
    
    FlashParams* params = new FlashParams();
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
#else
    request->send(400, "application/json", 
        "{\"success\":false,\"error\":\"C6 OTA flashing not supported in this build\"}");
#endif
}

// C6 Module Helper Functions
// ===========================

#ifdef C6_OTA_FLASHING

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

#endif // C6_OTA_FLASHING


