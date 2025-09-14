#include "tag_db.h"

#include <Arduino.h>
#include <ArduinoJson.h>
#include <FS.h>
#ifndef SD_CARD_ONLY
#include <LittleFS.h>
#endif

#include <unordered_map>
#include <vector>

#include "language.h"
#include "storage.h"
#include "util.h"

#define STR_IMPL(x) #x
#define STR(x) STR_IMPL(x)

std::vector<tagRecord *> tagDB;
std::unordered_map<std::string, varStruct> varDB;
std::unordered_map<int, HwType> hwdata = {};

Config config;

tagRecord *tagRecord::findByMAC(const uint8_t mac[8])
{
    for (tagRecord *tag : tagDB)
    {
        if (memcmp(tag->mac, mac, 8) == 0 && tag->version == 0)
        {
            return tag;
        }
    }
    return nullptr;
}

bool deleteRecord(const uint8_t mac[8], bool allVersions)
{
    for (uint32_t c = 0; c < tagDB.size(); c++)
    {
        tagRecord *tag = tagDB.at(c);
        if (memcmp(tag->mac, mac, 8) == 0 && (allVersions || tag->version == 0))
        {
            if (tag->data != nullptr)
            {
                free(tag->data);
            }
            tag->data = nullptr;
            delete tagDB[c];
            tagDB.erase(tagDB.begin() + c);
            return true;
        }
    }
    return false;
}

void mac2hex(const uint8_t *mac, char *hexBuffer)
{
    // hexBuffer must have space for 16 hex chars + NUL (caller provides 17).
    // Use snprintf for safety.
    snprintf(hexBuffer, 17, "%02X%02X%02X%02X%02X%02X%02X%02X",
             mac[7], mac[6], mac[5], mac[4], mac[3], mac[2], mac[1], mac[0]);
}

bool hex2mac(const String &hexString, uint8_t *mac)
{
    size_t hexLength = hexString.length();
    if (hexLength != 12 && hexLength != 16)
    {
        return false;
    }
    if (hexLength / 2 == 6)
    {
        mac[6] = 0;
        mac[7] = 0;
        return (sscanf(hexString.c_str(), "%02hhX%02hhX%02hhX%02hhX%02hhX%02hhX",
                       &mac[5], &mac[4], &mac[3], &mac[2], &mac[1], &mac[0]) == 6);
    }
    else
    {
        return (sscanf(hexString.c_str(), "%02hhX%02hhX%02hhX%02hhX%02hhX%02hhX%02hhX%02hhX",
                       &mac[7], &mac[6], &mac[5], &mac[4], &mac[3], &mac[2], &mac[1], &mac[0]) == 8);
    }
}

String tagDBtoJson(const uint8_t mac[8], uint8_t startPos)
{
    JsonDocument doc;
    JsonArray tags = doc["tags"].to<ArduinoJson::JsonArray>();

    for (uint32_t c = startPos; c < tagDB.size(); ++c)
    {
        const tagRecord *taginfo = tagDB.at(c);

        const bool select = !mac || memcmp(taginfo->mac, mac, 8) == 0;
        if (select && taginfo->version == 0)
        {
            JsonObject tag = tags.add<ArduinoJson::JsonObject>();
            fillNode(tag, taginfo);
            if (measureJson(doc) > 5000)
            {
                doc["continu"] = c + 1;
                break;
            }
            if (mac)
            {
                break;
            }
        }
    }

    return doc.as<String>();
}

void fillNode(JsonObject &tag, const tagRecord *taginfo)
{
    char hexmac[17];
    mac2hex(taginfo->mac, hexmac);
    tag["mac"] = String(hexmac);
    char hex[33];
    for (uint8_t i = 0; i < 16; i++)
    {
        snprintf(hex + (i * 2), 3, "%02x", taginfo->md5[i]);
    }
    tag["hash"] = (String)hex;
    tag["lastseen"] = taginfo->lastseen;
    tag["nextupdate"] = taginfo->nextupdate;
    tag["nextcheckin"] = taginfo->expectedNextCheckin;
    tag["pending"] = taginfo->pendingCount;
    tag["alias"] = taginfo->alias;
    tag["contentMode"] = taginfo->contentMode;
    tag["LQI"] = taginfo->LQI;
    tag["RSSI"] = taginfo->RSSI;
    tag["temperature"] = taginfo->temperature;
    tag["batteryMv"] = taginfo->batteryMv;
    tag["hwType"] = taginfo->hwType;
    tag["wakeupReason"] = taginfo->wakeupReason;
    tag["capabilities"] = taginfo->capabilities;
    tag["modecfgjson"] = taginfo->modeConfigJson;
    tag["isexternal"] = taginfo->isExternal;
    tag["apip"] = taginfo->apIp.toString();
    tag["rotate"] = taginfo->rotate;
    tag["lut"] = taginfo->lut;
    tag["invert"] = taginfo->invert;
    tag["updatecount"] = taginfo->updateCount;
    tag["updatelast"] = taginfo->updateLast;
    tag["ch"] = taginfo->currentChannel;
    tag["ver"] = taginfo->tagSoftwareVersion;
}

void saveDB(const String &filename)
{
    JsonDocument doc;

    const long t = millis();

    // Basic sanity check before taking the mutex – if contentFS not yet assigned try to (re)initialize.
    if (!contentFS)
    {
        Serial.println("[FS][WARN] contentFS is null at start of saveDB – attempting Storage.begin() remount");
        Storage.begin();
        if (!contentFS)
        {
            Serial.println("[FS][ERROR] Remount attempt failed (contentFS still null) – aborting saveDB");
            return;
        }
    }

    xSemaphoreTake(fsMutex, portMAX_DELAY);

    fs::File existingFile = contentFS->open(filename, "r");
    if (existingFile)
    {
        existingFile.close();
        vTaskDelay(pdMS_TO_TICKS(100));
        String backupFilename = filename + ".bak";
        if (!contentFS->rename(filename.c_str(), backupFilename.c_str()))
        {
            xSemaphoreGive(fsMutex);
            logLine("error renaming tagDB to .bak");
            wsErr("error renaming tagDB to .bak");
            xSemaphoreTake(fsMutex, portMAX_DELAY);
        }
    }

    fs::File file = contentFS->open(filename, "w");
    if (!file)
    {
        Serial.println("[FS][WARN] saveDB first open() failed – checking mount status and free space");
#ifdef HAS_SDCARD
        Serial.printf("[FS] SD mounted? %s\n", (contentFS == &SD) ? "yes" : "no");
#endif
#ifndef SD_CARD_ONLY
        Serial.printf("[FS] LittleFS mounted? %s\n", (contentFS == &LittleFS) ? "yes" : "no");
#endif
#ifndef SD_CARD_ONLY
        uint64_t lfTotal = 0, lfUsed = 0;
        if (contentFS == &LittleFS)
        {
            lfTotal = LittleFS.totalBytes();
            lfUsed = LittleFS.usedBytes();
            Serial.printf("[FS] LittleFS usage: %llu / %llu bytes (free %llu)\n",
                          (unsigned long long)lfUsed,
                          (unsigned long long)lfTotal,
                          (unsigned long long)(lfTotal - lfUsed));
        }
#endif
        xSemaphoreGive(fsMutex);
        // Attempt a one‑time remount & retry outside mutex to avoid deadlocks
        Serial.println("[FS] Attempting one-time Storage.begin() then retrying saveDB open");
        Storage.begin();
        xSemaphoreTake(fsMutex, portMAX_DELAY);
        file = contentFS->open(filename, "w");
        if (!file)
        {
            Serial.println("saveDB: Failed to open file for writing after retry – aborting");
            xSemaphoreGive(fsMutex);
            return;
        }
        else
        {
            Serial.println("[FS] saveDB retry succeeded");
        }
    }

    file.write('[');
    for (size_t c = 0; c < tagDB.size(); c++)
    {
        const tagRecord *taginfo = tagDB.at(c);
        doc.clear();

        if (taginfo->version == 0)
        {
            JsonObject tag = doc.to<ArduinoJson::JsonObject>();
            fillNode(tag, taginfo);
            if (c > 0)
            {
                file.write(',');
            }
            serializeJsonPretty(doc, file);
        }
    }
    file.write(']');

    file.close();
    xSemaphoreGive(fsMutex);
    Serial.println("DB saved " + String(millis() - t) + "ms");
}

bool loadDB(const String &filename)
{
    Serial.println("reading DB from " + String(filename));
    const long t = millis();

    fs::File readfile = contentFS->open(filename, "r");
    if (!readfile)
    {
        Serial.println("loadDB: Failed to open file");
        return false;
    }

    time_t now;
    time(&now);

    // Seek to the beginning of the array
    if (!readfile.find("["))
    {
        readfile.close();
        return false;
    }

    // Helper to skip whitespace
    auto skipWs = [&readfile]()
    {
        int c = readfile.peek();
        while (c >= 0 && (c == ' ' || c == '\t' || c == '\r' || c == '\n'))
        {
            readfile.read();
            c = readfile.peek();
        }
        return c;
    };

    // Handle empty array case: next non-space char is ']'
    int c = skipWs();
    if (c == ']')
    {
        // consume ']'
        readfile.read();
        readfile.close();
        Serial.println("loadDB: empty database []");
        Serial.println("loadDB took " + String(millis() - t) + "ms");
        return true;
    }

    // Parse objects until we hit ']'
    while (true)
    {
        JsonDocument doc;
        DeserializationError err = deserializeJson(doc, readfile);
        if (err)
        {
            Serial.print(F("deserializeJson() failed: "));
            Serial.println(err.c_str());
            readfile.close();
            return false;
        }

        JsonObject tag = doc.as<JsonObject>();
        if (!tag.isNull())
        {
            String dst = tag["mac"].as<String>();
            uint8_t mac[8];
            if (hex2mac(dst, mac))
            {
                tagRecord *taginfo = tagRecord::findByMAC(mac);
                if (taginfo == nullptr)
                {
                    taginfo = new tagRecord;
                    memcpy(taginfo->mac, mac, sizeof(taginfo->mac));
                    tagDB.push_back(taginfo);
                }
                String md5 = tag["hash"].as<String>();
                if (md5.length() >= 32)
                {
                    for (uint8_t i = 0; i < 16; i++)
                    {
                        taginfo->md5[i] = strtoul(md5.substring(i * 2, i * 2 + 2).c_str(), NULL, 16);
                    }
                }
                taginfo->lastseen = (uint32_t)tag["lastseen"];
                taginfo->nextupdate = (uint32_t)tag["nextupdate"];
                taginfo->expectedNextCheckin = (uint32_t)tag["nextcheckin"];
                if (taginfo->expectedNextCheckin < now)
                {
                    taginfo->expectedNextCheckin = now + 60;
                }
                taginfo->pendingCount = 0;
                taginfo->alias = tag["alias"].as<String>();
                taginfo->contentMode = tag["contentMode"];
                taginfo->LQI = tag["LQI"];
                taginfo->RSSI = tag["RSSI"];
                taginfo->temperature = tag["temperature"];
                taginfo->batteryMv = tag["batteryMv"];
                taginfo->hwType = (uint8_t)tag["hwType"];
                taginfo->wakeupReason = tag["wakeupReason"];
                taginfo->capabilities = tag["capabilities"];
                taginfo->modeConfigJson = tag["modecfgjson"].as<String>();
                taginfo->isExternal = tag["isexternal"].as<bool>();
                taginfo->apIp.fromString(tag["apip"].as<String>());
                taginfo->rotate = tag["rotate"] | 0;
                taginfo->lut = tag["lut"] | 0;
                taginfo->invert = tag["invert"] | 0;
                taginfo->updateCount = tag["updatecount"] | 0;
                taginfo->updateLast = tag["updatelast"] | 0;
                taginfo->currentChannel = tag["ch"] | 0;
                taginfo->tagSoftwareVersion = tag["ver"] | 0;
            }
        }

        // After an object, skip whitespace and check for ',' or ']'
        c = skipWs();
        if (c == ',')
        {
            readfile.read(); // consume comma and continue to next element
            c = skipWs();
            if (c == ']')
            {
                // Trailing comma not allowed in strict JSON, but if encountered, treat as end safely
                readfile.read();
                break;
            }
            continue;
        }
        else if (c == ']')
        {
            readfile.read(); // consume ']'
            break;
        }
        else if (c < 0)
        {
            // EOF reached unexpectedly; treat as finished
            break;
        }
        else
        {
            // Unexpected char; attempt to search for next separator or end
            if (!readfile.find(",") && !readfile.find("]"))
            {
                break;
            }
            // If we found ']' the next iteration will catch it
            c = skipWs();
            if (c == ']')
            {
                readfile.read();
                break;
            }
        }
    }

    readfile.close();
    Serial.println("loadDB took " + String(millis() - t) + "ms");
    return true;
}

void destroyDB()
{
    Serial.println("destroying DB");
    util::printHeap();
    for (tagRecord *&tag : tagDB)
    {
        if (tag->data != nullptr)
        {
            free(tag->data);
        }
        tag->data = nullptr;
        delete tag;
    }
    tagDB.clear();
    util::printHeap();
}

uint32_t getTagCount()
{
    uint32_t temp = 0;
    return getTagCount(temp, temp);
}

uint32_t getTagCount(uint32_t &timeoutcount, uint32_t &lowbattcount)
{
    uint32_t tagcount = 0;
    time_t now;
    time(&now);
    for (const tagRecord *taginfo : tagDB)
    {
        if (!taginfo->isExternal)
            tagcount++;
        const int32_t timeout = now - taginfo->lastseen;
        if (taginfo->expectedNextCheckin < 3600)
        {
            // not initialised, timeout if not seen last 5 minutes
            if (timeout > config.maxsleep * 60 + 300)
                timeoutcount++;
        }
        else if (now - static_cast<time_t>(taginfo->expectedNextCheckin) > 600)
        {
            // expected checkin is behind, timeout if not seen last 5 minutes
            if (timeout > config.maxsleep * 60 + 300)
                timeoutcount++;
        }
        if (taginfo->batteryMv < 2400 && taginfo->batteryMv != 0 && taginfo->batteryMv != 1337)
            lowbattcount++;
    }
    return tagcount;
}

void clearPending(tagRecord *taginfo)
{
    taginfo->filename = String();
    if (taginfo->data != nullptr)
    {
        // check if this is the last copy of the buffer
        int datacount = 0;
        for (const tagRecord *tag : tagDB)
        {
            if (tag->data == taginfo->data)
            {
                datacount++;
            }
        }
        if (datacount == 1)
        {
            free(taginfo->data);
        }
        taginfo->data = nullptr;
    }
}

void initAPconfig()
{
    JsonDocument APconfig;
    File configFile = contentFS->open("/current/apconfig.json", "r");
    if (configFile)
    {
        DeserializationError error = deserializeJson(APconfig, configFile);
        if (error)
        {
            configFile.close();
            Serial.println("failed to read apconfig.json. Using default config");
            Serial.println(error.c_str());
        }
        configFile.close();
    }
    config.channel = APconfig["channel"].is<uint8_t>() ? APconfig["channel"] : 0;
    config.subghzchannel = APconfig["subghzchannel"].is<uint8_t>() ? APconfig["subghzchannel"] : 0;
    if (APconfig["alias"])
        strlcpy(config.alias, APconfig["alias"], sizeof(config.alias));
    // Default LED brightness to 0 (off) to prevent bright startup
    config.led = APconfig["led"].is<uint8_t>() ? APconfig["led"] : 0;
    config.tft = APconfig["tft"].is<uint8_t>() ? APconfig["tft"] : 255;
    config.language = APconfig["language"].is<uint8_t>() ? APconfig["language"] : 0;
    config.maxsleep = APconfig["maxsleep"].is<uint8_t>() ? APconfig["maxsleep"] : 10;
    config.stopsleep = APconfig["stopsleep"].is<uint8_t>() ? APconfig["stopsleep"] : 1;
    config.preview = APconfig["preview"].is<uint8_t>() ? APconfig["preview"] : 1;
    config.nightlyreboot = APconfig["nightlyreboot"].is<uint8_t>() ? APconfig["nightlyreboot"] : 1;
    config.lock = APconfig["lock"].is<uint8_t>() ? APconfig["lock"] : 0;
    config.sleepTime1 = APconfig["sleeptime1"].is<uint8_t>() ? APconfig["sleeptime1"] : 0;
    config.sleepTime2 = APconfig["sleeptime2"].is<uint8_t>() ? APconfig["sleeptime2"] : 0;
    config.ble = APconfig["ble"].is<uint8_t>() ? APconfig["ble"] : 0;
    config.discovery = APconfig["discovery"].is<uint8_t>() ? APconfig["discovery"] : 0;
    config.showtimestamp = APconfig["showtimestamp"].is<uint8_t>() ? APconfig["showtimestamp"] : 0;
    config.wifiMode = APconfig["wifimode"].is<uint8_t>() ? APconfig["wifimode"] : 0; // default Auto
#ifdef BLE_ONLY
    config.ble = true;
#endif
    // default wifi power 8.5 dbM
    // see https://github.com/espressif/arduino-esp32/blob/master/libraries/WiFi/src/WiFiGeneric.h#L111
    config.wifiPower = APconfig["wifipower"].is<uint8_t>() ? APconfig["wifipower"] : 34;
    config.repo = APconfig["repo"].is<String>() ? APconfig["repo"].as<String>() : String("OpenEPaperLink/OpenEPaperLink");
    config.env = APconfig["env"].is<String>() ? APconfig["env"].as<String>() : String(STR(BUILD_ENV_NAME));
    if (APconfig["timezone"])
    {
        strlcpy(config.timeZone, APconfig["timezone"], sizeof(config.timeZone));
    }
    else
    {
        strlcpy(config.timeZone, "CET-1CEST,M3.5.0,M10.5.0/3", sizeof(config.timeZone));
    }
}

void saveAPconfig()
{
    xSemaphoreTake(fsMutex, portMAX_DELAY);
    // Ensure the /current directory exists before creating files inside it
    const char *curDir = "/current";
    if (!contentFS->exists(curDir))
    {
        Serial.println("saveAPconfig: /current directory missing, attempting to create it");
        if (!contentFS->mkdir(curDir))
        {
            Serial.println("saveAPconfig: Failed to create /current directory — aborting saveAPconfig");
            xSemaphoreGive(fsMutex);
            return;
        }
        Serial.println("saveAPconfig: created /current directory");
    }

    fs::File configFile = contentFS->open("/current/apconfig.json", "w");
    JsonDocument APconfig;
    APconfig["channel"] = config.channel;
    APconfig["subghzchannel"] = config.subghzchannel;
    APconfig["alias"] = config.alias;
    APconfig["led"] = config.led;
    APconfig["tft"] = config.tft;
    APconfig["language"] = config.language;
    APconfig["maxsleep"] = config.maxsleep;
    APconfig["stopsleep"] = config.stopsleep;
    APconfig["preview"] = config.preview;
    APconfig["nightlyreboot"] = config.nightlyreboot;
    APconfig["lock"] = config.lock;
    APconfig["wifipower"] = config.wifiPower;
    APconfig["timezone"] = config.timeZone;
    APconfig["sleeptime1"] = config.sleepTime1;
    APconfig["sleeptime2"] = config.sleepTime2;
    APconfig["ble"] = config.ble;
    APconfig["repo"] = config.repo;
    APconfig["env"] = config.env;
    APconfig["discovery"] = config.discovery;
    APconfig["showtimestamp"] = config.showtimestamp;
    APconfig["wifimode"] = config.wifiMode;
    serializeJsonPretty(APconfig, configFile);
    configFile.close();
    xSemaphoreGive(fsMutex);
}

HwType getHwType(const uint8_t id)
{
    auto it = hwdata.find(id);
    if (it != hwdata.end())
    {
        return it->second;
    }
    else
    {
        char filename[20];
        // filename buffer sized for "/tagtypes/" + 2 hex + ".json" + NUL = 10+2+5+1=18 (20 available)
        snprintf(filename, sizeof(filename), "/tagtypes/%02X.json", id);
        Serial.printf("read %s\r\n", filename);
        File jsonFile = contentFS->open(filename, "r");

        if (jsonFile)
        {
            JsonDocument filter;
            filter["width"] = true;
            filter["height"] = true;
            filter["rotatebuffer"] = true;
            filter["bpp"] = true;
            filter["shortlut"] = true;
            filter["zlib_compression"] = true;
            filter["g5_compression"] = true;
            filter["highlight_color"] = true;
            filter["colortable"] = true;
            JsonDocument doc;
            DeserializationError error = deserializeJson(doc, jsonFile, DeserializationOption::Filter(filter));
            jsonFile.close();
            if (error)
            {
                Serial.println("json error in " + String(filename));
                Serial.println(error.c_str());
            }
            else
            {
                HwType &hwType = hwdata[id];
                hwType.id = id;
                hwType.width = doc["width"];
                hwType.height = doc["height"];
                hwType.rotatebuffer = doc["rotatebuffer"];
                hwType.bpp = doc["bpp"];
                hwType.shortlut = doc["shortlut"];
                if (doc["zlib_compression"].is<const char *>())
                {
                    hwType.zlib = strtol(doc["zlib_compression"], nullptr, 16);
                }
                else
                {
                    hwType.zlib = 0;
                }
                if (doc["g5_compression"].is<const char *>())
                {
                    hwType.g5 = strtol(doc["g5_compression"], nullptr, 16);
                }
                else
                {
                    hwType.g5 = 0;
                }
                hwType.highlightColor = doc["highlight_color"].is<uint16_t>() ? doc["highlight_color"].as<uint16_t>() : 2;
                JsonObject colorTable = doc["colortable"];
                for (auto kv : colorTable)
                {
                    JsonArray color = kv.value();
                    Color c;
                    c.r = color[0];
                    c.g = color[1];
                    c.b = color[2];
                    hwType.colortable.push_back(c);
                }
                return hwdata.at(id);
            }
        }
        return {0, 0, 0, 0, 0, 0, 0};
    }
}

bool setVarDB(const std::string &key, const String &value, const bool notify)
{
    auto it = varDB.find(key);
    if (it == varDB.end())
    {
        varStruct newVar;
        newVar.value = value;
        newVar.changed = notify;
        varDB[key] = newVar;
        return true;
    }

    if (it->second.value != value)
    {
        it->second.value = value;
        it->second.changed = notify;
        return true;
    }
    else
    {
        return false;
    }
}

String getBaseName(const String &filename)
{
    // int lastDotIndex = filename.lastIndexOf('.');
    // return lastDotIndex != -1 ? filename.substring(0, lastDotIndex) : filename;
    return filename.substring(0, 16);
}

void cleanupCurrent()
{
    // clean unknown previews
    Serial.println("Cleaning up temporary files");
    File dir = contentFS->open("/current");
    File file = dir.openNextFile();
    while (file)
    {
        String filename = file.name();
        uint8_t mac[8];
        if (hex2mac(getBaseName(filename), mac))
        {
            bool found = false;
            for (tagRecord *record : tagDB)
            {
                if (memcmp(record->mac, mac, 8) == 0)
                {
                    found = true;
                    break;
                }
            }
            if (!found || filename.endsWith(".pending"))
            {
                filename = file.path();
                file.close();
                Serial.println("remove " + filename);
                contentFS->remove(filename);
            }
        }
        file = dir.openNextFile();
    }
    dir.close();

    dir = contentFS->open("/temp");
    file = dir.openNextFile();
    while (file)
    {
        String filename = file.name();
        filename = file.path();
        file.close();
        contentFS->remove(filename);
        file = dir.openNextFile();
    }
    dir.close();
}

void pushTagInfo(tagRecord *taginfo)
{
    tagRecord *taginfo2 = new tagRecord(*taginfo);
    taginfo2->version = 1;
    tagDB.push_back(taginfo2);
}

void popTagInfo(const uint8_t mac[8])
{
    for (tagRecord *tag : tagDB)
    {
        if (memcmp(tag->mac, mac, 8) == 0 && tag->version == 1)
        {
            deleteRecord(mac, false);
            tag->version = 0;
        }
    }
}
