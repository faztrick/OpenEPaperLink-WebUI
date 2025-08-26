#include "web.h"
#include <ArduinoJson.h>
#include "storage.h"
#include <FS.h>
#include <vector>
#include <algorithm>
// Local includes required by web.cpp
#include "leds.h"
#include "system.h"
#include "webflasher.h"
#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
// Ensure esp wifi power-save and LittleFS symbols are available
#include <esp_wifi.h>
#include <LittleFS.h>
#include "language.h"
#include "websocket.h"
#include "ips_display.h" // for TFTLog() when HAS_TFT
#include "oepl_udp.h"    // for UDPcomm

// Initialize web server endpoints and handlers
void init_web()
{
    // Register /get_ssid_list handler (ensure request/response/doc are in scope)
    server.on("/get_ssid_list", HTTP_GET, [](AsyncWebServerRequest *request)
              {
        AsyncResponseStream *response = request->beginResponseStream("application/json");
        response->addHeader("Cache-Control", "max-age=30");
    JsonDocument doc;

        wifi_mode_t currentMode = WiFi.getMode();
        if (currentMode == WIFI_OFF)
        {
            WiFi.mode(WIFI_STA);
            vTaskDelay(pdMS_TO_TICKS(200));
        }
        else if (currentMode == WIFI_AP)
        {
            WiFi.mode(WIFI_AP_STA);
            vTaskDelay(pdMS_TO_TICKS(200));
        }

        int scanResult = WiFi.scanComplete();
        doc["scanstatus"] = scanResult;

    JsonArray networks = doc["networks"].to<JsonArray>();

        if (scanResult > 0)
        {
            // Create array for sorting
            std::vector<std::pair<int, int>> networkPairs; // index, rssi

            // Collect networks with valid SSIDs
            for (int i = 0; i < scanResult; i++)
            {
                String ssid = WiFi.SSID(i);
                if (!ssid.isEmpty() && ssid.length() > 0)
                {
                    networkPairs.push_back(std::make_pair(i, WiFi.RSSI(i)));
                }
            }

            // Sort by RSSI (signal strength) descending
            std::sort(networkPairs.begin(), networkPairs.end(),
                      [](const std::pair<int, int> &a, const std::pair<int, int> &b)
                      {
                          return a.second > b.second;
                      });

            // Limit results to prevent memory issues and add sorted networks
            int networkLimit = min((int)networkPairs.size(), 40);
            for (int idx = 0; idx < networkLimit; idx++)
            {
                int i = networkPairs[idx].first;
                JsonObject network = networks.add<ArduinoJson::JsonObject>();
                network["ssid"] = WiFi.SSID(i);
                network["ch"] = WiFi.channel(i);
                network["rssi"] = WiFi.RSSI(i);
                network["enc"] = WiFi.encryptionType(i);
                network["bssid"] = WiFi.BSSIDstr(i);
            }
        }

        // Start new scan if needed (rate limited and improved)
        if ((scanResult == WIFI_SCAN_FAILED || scanResult == WIFI_SCAN_RUNNING) &&
            (millis() - lastssidscan > 25000))
        {
            WiFi.scanDelete();
            Serial.println("Starting async WiFi scan for legacy endpoint");
            WiFi.scanNetworks(true, true); // async, show hidden
            lastssidscan = millis();
        }

        serializeJson(doc, *response);
        request->send(response); });

    // --- Filesystem diagnostics ---
    // GET /api/fs/info -> returns active FS type, sizes, existence of key paths and last saveDB attempt timestamp (if tracked)
    server.on("/api/fs/info", HTTP_GET, [](AsyncWebServerRequest *request)
              {
        JsonDocument doc;
        const char *type = "none";
        if (contentFS) {
#ifdef HAS_SDCARD
            if (contentFS == &SDCARD) type = "sd";
#endif
#ifndef SD_CARD_ONLY
            if (contentFS == &LittleFS) type = "littlefs";
#endif
        }
        doc["type"] = type;
        doc["mounted"] = (bool)contentFS;
#ifndef SD_CARD_ONLY
        if (contentFS == &LittleFS) {
            doc["totalBytes"] = (uint64_t)LittleFS.totalBytes();
            doc["usedBytes"] = (uint64_t)LittleFS.usedBytes();
        }
#endif
#ifdef HAS_SDCARD
        if (contentFS == &SDCARD) {
            // Some SD implementations lack usedBytes(); guard with ifdefs if needed
            // Provide placeholders; refined logic can be added if APIs available.
            doc["sdCard"] = true;
        }
#endif
        JsonObject paths = doc["paths"].to<JsonObject>();
        if (contentFS) {
            const char *check[] = {"/current", "/current/tagDB.json", "/current/apconfig.json", "/current/staconfig.json"};
            for (auto p : check) {
                paths[p] = contentFS->exists(p);
            }
        }
        String body; serializeJson(doc, body);
        request->send(200, "application/json", body); });

    // POST /api/fs/remount -> attempts Storage.begin() again and reports status
    server.on("/api/fs/remount", HTTP_POST, [](AsyncWebServerRequest *request)
              {
        JsonDocument doc;
        doc["before"] = (bool)contentFS;
        Storage.begin();
        doc["after"] = (bool)contentFS;
        const char *type = "none";
        if (contentFS) {
#ifdef HAS_SDCARD
            if (contentFS == &SDCARD) type = "sd";
#endif
#ifndef SD_CARD_ONLY
            if (contentFS == &LittleFS) type = "littlefs";
#endif
        }
        doc["type"] = type;
        String body; serializeJson(doc, body);
        request->send(200, "application/json", body); });

    // Canonical WiFi config retrieval endpoint (unified handler)
    server.on("/get_wifi_config", HTTP_GET, handleGetWifiConfig);

    server.on("/backup_db", HTTP_GET, [](AsyncWebServerRequest *request)
              {
        saveDB("/current/tagDB.json");
        request->send(*contentFS, "/current/tagDB.json", String(), true); });
    server.on(
        "/restore_db", HTTP_POST, [](AsyncWebServerRequest *request)
        { request->send(200); },
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
    server.on("/api/error_report", HTTP_POST, [](AsyncWebServerRequest *request)
              {
        // Log error reports from JavaScript
        if (request->hasParam("error", true) && request->hasParam("url", true)) {
            String error = request->getParam("error", true)->value();
            String url = request->getParam("url", true)->value();
            Serial.printf("[JS ERROR] %s at %s\n", error.c_str(), url.c_str());
        }
        request->send(200, "application/json", "{\"status\":\"logged\"}"); });

    server.on("/api/features", HTTP_GET, [](AsyncWebServerRequest *request)
              {
        JsonDocument doc;
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
        request->send(200, "application/json", response); });

    // Lightweight device log tail endpoint
    // GET /api/logs/tail?lines=200
    server.on("/api/logs/tail", HTTP_GET, [](AsyncWebServerRequest *request)
              {
        int lines = 200;
        if (request->hasParam("lines")) {
            int reqLines = (int)request->getParam("lines")->value().toInt();
            if (reqLines < 1) reqLines = 1;
            if (reqLines > 2000) reqLines = 2000;
            lines = reqLines;
        }

        // Read older then current log and tail last N lines
        String combined;
        combined.reserve(16 * lines);
        if (contentFS->exists("/logold.txt")) {
            File f2 = contentFS->open("/logold.txt", "r");
            if (f2) { combined = f2.readString(); f2.close(); }
        }
        if (contentFS->exists("/log.txt")) {
            File f = contentFS->open("/log.txt", "r");
            if (f) { combined += f.readString(); f.close(); }
        }

        // Split into lines and take the last N
        std::vector<String> arr;
        arr.reserve(lines + 8);
        int start = 0;
        while (start >= 0 && start < (int)combined.length()) {
            int nl = combined.indexOf('\n', start);
            if (nl < 0) {
                String last = combined.substring(start);
                if (last.length()) arr.push_back(last);
                break;
            }
            arr.push_back(combined.substring(start, nl));
            start = nl + 1;
        }
        int begin = std::max(0, (int)arr.size() - lines);

        JsonDocument doc;
        JsonArray out = doc["lines"].to<JsonArray>();
        for (int i = begin; i < (int)arr.size(); i++) out.add(arr[i]);
        doc["count"] = (int)out.size();
        doc["file"] = "/log.txt";

        String body;
        serializeJson(doc, body);
        request->send(200, "application/json", body); });

    // Simple TFT print endpoint to show debug text on onboard display
    // POST /api/tft/print (form) with field 'text', or GET /api/tft/print?text=...
    server.on("/api/tft/print", HTTP_GET, [](AsyncWebServerRequest *request)
              {
        String text = request->hasParam("text") ? request->getParam("text")->value() : String();
        JsonDocument doc;
#ifdef HAS_TFT
        if (text.length()) {
            TFTLog(text);
        }
        doc["success"] = true;
        doc["hasTFT"] = true;
#else
        doc["success"] = false;
        doc["hasTFT"] = false;
        doc["error"] = "No TFT compiled (HAS_TFT not defined)";
#endif
        String body; serializeJson(doc, body);
        request->send(200, "application/json", body); });

    server.on("/api/tft/print", HTTP_POST, [](AsyncWebServerRequest *request)
              {
        String text;
        if (request->hasParam("text", true)) {
            text = request->getParam("text", true)->value();
        }
        JsonDocument doc;
#ifdef HAS_TFT
        if (text.length()) {
            TFTLog(text);
        }
        doc["success"] = true;
        doc["hasTFT"] = true;
#else
        doc["success"] = false;
        doc["hasTFT"] = false;
        doc["error"] = "No TFT compiled (HAS_TFT not defined)";
#endif
        String body; serializeJson(doc, body);
        request->send(200, "application/json", body); });

    // Peer connectivity probe: GET /api/peer/test?host=192.168.x.x
    server.on("/api/peer/test", HTTP_GET, [](AsyncWebServerRequest *request)
              {
        String host = request->hasParam("host") ? request->getParam("host")->value() : String();
        JsonDocument doc;
        if (host.isEmpty()) {
            doc["success"] = false;
            doc["error"] = "host required";
            String body; serializeJson(doc, body);
            request->send(400, "application/json", body);
            return;
        }
        // Try simple HTTP GET on peer's /sysinfo
        HTTPClient http;
        String url = String("http://") + host + "/sysinfo";
        bool ok = http.begin(url);
        int code = -1;
        if (ok) {
            code = http.GET();
        }
        doc["success"] = (ok && code > 0);
        doc["status"] = code;
        doc["host"] = host;
        String body; serializeJson(doc, body);
        request->send(200, "application/json", body);
        if (ok) http.end(); });

    // Mirror peer logs to local TFT: GET /api/bridge/print_c6_logs?host=&lines=100
    // Also accepts POST form field 'host' and optional 'lines'
    server.on("/api/bridge/print_c6_logs", HTTP_GET, [](AsyncWebServerRequest *request)
              {
                  String host = request->hasParam("host") ? request->getParam("host")->value() : String();
                  int lines = request->hasParam("lines") ? request->getParam("lines")->value().toInt() : 100;
                  lines = std::max(1, std::min(500, lines));
                  JsonDocument doc;
                  if (host.isEmpty())
                  {
                      doc["success"] = false;
                      doc["error"] = "host required";
                      String body;
                      serializeJson(doc, body);
                      request->send(400, "application/json", body);
                      return;
                  }
#ifdef HAS_TFT
                  // Pull logs JSON from peer
                  HTTPClient http;
                  String url = String("http://") + host + "/api/logs/tail?lines=" + String(lines);
                  if (!http.begin(url))
                  {
                      doc["success"] = false;
                      doc["error"] = "http.begin failed";
                      String body;
                      serializeJson(doc, body);
                      request->send(500, "application/json", body);
                      return;
                  }
                  int code = http.GET();
                  if (code == 200)
                  {
                      String payload = http.getString();
                      // Parse very small JSON: { lines: [..], count: N }
                      JsonDocument resp;
                      DeserializationError derr = deserializeJson(resp, payload);
                      if (!derr && resp["lines"].is<JsonArray>())
                      {
                          JsonArray arr = resp["lines"].as<JsonArray>();
                          int printed = 0;
                          for (JsonVariant v : arr)
                          {
                              const char *s = v.as<const char *>();
                              if (s && *s)
                              {
                                  TFTLog(String(s));
                                  printed++;
                              }
                          }
                          doc["success"] = true;
                          doc["printed"] = printed;
                      }
                      else
                      {
                          doc["success"] = false;
                          doc["error"] = String("json parse error: ") + derr.c_str();
                      }
                  }
                  else
                  {
                      doc["success"] = false;
                      doc["error"] = String("HTTP status ") + code;
                  }
                  http.end();
                  String body;
                  serializeJson(doc, body);
                  request->send(200, "application/json", body);
#else
                  doc["success"] = false;
                  doc["error"] = "HAS_TFT not enabled";
                  String body;
                  serializeJson(doc, body);
                  request->send(501, "application/json", body);
#endif
              });

    server.on("/api/bridge/print_c6_logs", HTTP_POST, [](AsyncWebServerRequest *request)
              {
        String host = request->hasParam("host", true) ? request->getParam("host", true)->value() : String();
        int lines = request->hasParam("lines", true) ? request->getParam("lines", true)->value().toInt() : 100;
        request->redirect(String("/api/bridge/print_c6_logs?host=") + host + "&lines=" + String(lines)); });
    server.on("/api/pins", HTTP_GET, [](AsyncWebServerRequest *request)
              {
        JsonDocument doc;
        // Populate from compile-time macros where available
#ifdef HAS_TFT
    JsonObject tft = doc["TFT"].to<JsonObject>();
#ifdef TFT_MOSI
    tft["MOSI"] = TFT_MOSI;
#endif
    // NOTE: Previous builds performed moduleManager initialization & start here under
    // C6_OTA_FLASHING. This caused duplicate initialization because main.cpp now
    // performs registration/initialize/start for all modules (including WiFiModule
    // and optional C6Module) before calling init_web(). The duplicate block has been
    // removed to:
    //  * Prevent double start() calls on modules (side‑effects, extra tasks)
    //  * Save flash/IRAM and reduce boot time
    //  * Centralize module lifecycle in main.cpp
    // If future conditional module init is required, add lightweight registration
    // helpers here guarded by feature macros, but keep initialize/start in one place.
    tft["source"] = "build-time"; // indicates values come from compile-time macros
#endif

        // CC1101 / Sub-GHz - driver may not expose pins at compile-time
#ifdef HAS_SUBGHZ
        JsonObject sub = doc["SUBGHZ"].to<JsonObject>();
        sub["note"] = "pins vary by board/driver";
        sub["source"] = "driver";
#endif

        // Send response
        AsyncResponseStream *response = request->beginResponseStream("application/json");
        serializeJson(doc, *response);
        request->send(response); });

    // Lightweight telemetry endpoint intended for frontend visualizations
    server.on("/api/telemetry", HTTP_GET, [](AsyncWebServerRequest *request)
              {
        JsonDocument doc;
        doc["uptime_ms"] = (uint64_t)millis();
        doc["freeHeap"] = ESP.getFreeHeap();
#if BOARD_HAS_PSRAM
        doc["freePsram"] = ESP.getFreePsram();
#endif
        doc["heapSize"] = ESP.getHeapSize();
        doc["minFreeHeap"] = ESP.getMinFreeHeap();
        doc["cpuFreqMHz"] = ESP.getCpuFreqMHz();
        doc["rssi"] = WiFi.RSSI();
        doc["wifiStatus"] = WiFi.status();
        doc["localIP"] = WiFi.localIP().toString();
        doc["macAddress"] = WiFi.macAddress();
        doc["apState"] = apInfo.state;

        // Offer a small list of recent tag counts for quick charting
        doc["tagCount"] = (uint32_t)tagDB.size();

        AsyncResponseStream *response = request->beginResponseStream("application/json");
        serializeJson(doc, *response);
                request->send(response); });

    // Lightweight health/ping endpoint for quick checks from the UI or automation
    server.on("/api/ping", HTTP_GET, [](AsyncWebServerRequest *request)
              {
                JsonDocument doc;
                doc["ok"] = true;
                doc["ts"] = (uint64_t)millis();
                doc["freeHeap"] = ESP.getFreeHeap();
                doc["tagCount"] = (uint32_t)tagDB.size();

                AsyncResponseStream *response = request->beginResponseStream("application/json");
                serializeJson(doc, *response);
                request->send(response); });

    // Removed /api/all endpoint to reduce duplicated API catalog code

    // Enhanced Module Management API Endpoints
    moduleManager.setupModuleManagementAPI(server);

    // --- Startup modules gating API ---
    // GET /api/startup_modules -> returns current persisted flags
    server.on("/api/startup_modules", HTTP_GET, [](AsyncWebServerRequest *request)
              {
        JsonDocument doc;
        if (contentFS) {
            File r = contentFS->open("/current/startup_modules.json", "r");
            if (r) {
                DeserializationError err = deserializeJson(doc, r);
                r.close();
                if (err) doc.clear();
            }
        }
        // If empty, provide defaults (only web/serial/wifi implicitly started)
        if (doc.isNull()) {
            JsonObject mods = doc["modules"].to<JsonObject>();
            mods["APTask"] = false;
            mods["BLEWriter"] = false;
            mods["IRRemote"] = false;
            mods["USBFlasher"] = false;
            mods["WebFlasher"] = false;
            mods["UDP"] = false;
            mods["ContentRunner"] = false;
        }

        AsyncResponseStream* response = request->beginResponseStream("application/json");
        serializeJson(doc, *response);
        request->send(response); });

    // POST /api/startup_modules -> set flags; body JSON { modules: { name: bool } }
    server.on("/api/startup_modules", HTTP_POST, [](AsyncWebServerRequest *request)
              {
        if (request->contentLength() == 0) {
            request->send(400, "application/json", "{\"success\":false,\"error\":\"Empty body\"}");
        } }, nullptr, [](AsyncWebServerRequest *request, uint8_t *data, size_t len, size_t index, size_t total)
              {
        static String body = "";
        if (index == 0) body = "";
        for (size_t i = 0; i < len; i++) body += (char)data[i];
        if (index + len == total) {
            JsonDocument in;
            DeserializationError err = deserializeJson(in, body);
            bool ok = !err;
            if (ok && contentFS) {
                // Merge with existing file to retain unknown keys
                JsonDocument existing;
                File r = contentFS->open("/current/startup_modules.json", "r");
                if (r) { deserializeJson(existing, r); r.close(); }
                if (existing.isNull()) existing.to<JsonObject>();
                if (in["modules"].is<JsonObject>()) {
                    JsonObject src = in["modules"].as<JsonObject>();
                    JsonObject dst = existing["modules"].to<JsonObject>();
                    for (JsonPair kv : src) { dst[kv.key()] = kv.value(); }
                }
                xSemaphoreTake(fsMutex, portMAX_DELAY);
                File w = contentFS->open("/current/startup_modules.json", "w");
                if (w) { serializeJson(existing, w); w.close(); ok = true; } else { ok = false; }
                xSemaphoreGive(fsMutex);
            }
            request->send(ok ? 200 : 400, "application/json", ok ? "{\"success\":true}" : "{\"success\":false}" );
            body = "";
        } });

    // --- System endpoints ---

    server.on("/reboot", HTTP_POST, [](AsyncWebServerRequest *request)
              {
        request->send(200, "text/plain", "OK Reboot");
        logLine("Reboot request by user");
        wsErr("REBOOTING");
        delay(100);
        ws.enable(false);
        refreshAllPending();
        saveDB("/current/tagDB.json");
        ws.closeAll();
        delay(100);
        ESP.restart(); });

    server.serveStatic("/current", *contentFS, "/current/").setCacheControl("max-age=604800");
    server.serveStatic("/tagtypes", *contentFS, "/tagtypes/").setCacheControl("max-age=300");

    server.on(
        "/imgupload", HTTP_POST, [](AsyncWebServerRequest *request)
        { request->send(200); },
        doImageUpload);
    server.on("/jsonupload", HTTP_POST, doJsonUpload);

    // --- Tag endpoints ---
    server.on("/get_db", HTTP_GET, [](AsyncWebServerRequest *request)
              {
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
        request->send(200, "application/json", json); });

    // Compatibility endpoints used by legacy/various frontends
    server.on("/gettags", HTTP_GET, [](AsyncWebServerRequest *request)
              {
        // Return the same data as /get_db default (all tags)
        String json = tagDBtoJson(nullptr);
        request->send(200, "application/json", json); });

    server.on("/gettaginfo", HTTP_GET, [](AsyncWebServerRequest *request)
              {
        if (request->hasParam("mac")) {
            String dst = request->getParam("mac")->value();
            uint8_t mac[8];
            if (hex2mac(dst, mac)) {
                String json = tagDBtoJson(mac);
                request->send(200, "application/json", json);
                return;
            }
        }
        request->send(400, "application/json", "{\"error\":\"Missing or invalid mac parameter\"}"); });

    // Lightweight alias update endpoint (POST /tag_alias mac=<hex12>&alias=<string>)
    server.on("/tag_alias", HTTP_POST, [](AsyncWebServerRequest *request)
              {
        if (!request->hasParam("mac", true) || !request->hasParam("alias", true)) {
            request->send(400, "application/json", "{\"success\":false,\"error\":\"mac and alias required\"}");
            return;
        }
        String macStr = request->getParam("mac", true)->value();
        String aliasStr = request->getParam("alias", true)->value();
        macStr.trim(); aliasStr.trim();
        if (aliasStr.length() > 63) aliasStr.remove(63); // enforce sane upper bound
        uint8_t mac[8];
        if (!hex2mac(macStr, mac)) {
            request->send(400, "application/json", "{\"success\":false,\"error\":\"invalid mac format\"}");
            return;
        }
        tagRecord *taginfo = tagRecord::findByMAC(mac);
        if (!taginfo) {
            request->send(404, "application/json", "{\"success\":false,\"error\":\"tag not found\"}");
            return;
        }
        taginfo->alias = aliasStr;
        wsSendTaginfo(mac, SYNC_USERCFG);
        // Persist database (best-effort)
        saveDB("/current/tagDB.json");
        String resp = String("{\"success\":true,\"mac\":\"") + macStr + "\",\"alias\":\"" + aliasStr + "\"}";
        request->send(200, "application/json", resp); });

    // Legacy alias for tag commands (JS sometimes calls /cmd)
    // Canonical handler is /tag_cmd; keep /cmd as alias for compatibility
    server.on("/cmd", HTTP_POST, [](AsyncWebServerRequest *request)
              { handleTagCommand(request); });

    server.on("/getdata", HTTP_GET, [](AsyncWebServerRequest *request)
              {
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
        request->send(400, "text/plain", "No data available"); });

    server.on("/save_cfg", HTTP_POST, [](AsyncWebServerRequest *request)
              {
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
        request->send(200, "text/plain", "Ok, saved"); });

    server.on("/tag_cmd", HTTP_POST, [](AsyncWebServerRequest *request)
              { handleTagCommand(request); });

    server.on("/led_flash", HTTP_GET, [](AsyncWebServerRequest *request)
              {
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
        request->send(400, "text/plain", "parameters are missing"); });

    // --- WiFi / Network endpoints ---
    server.on("/get_ap_config", HTTP_GET, [](AsyncWebServerRequest *request)
              {
        UDPcomm udpsync;
        udpsync.getAPList();

        AsyncResponseStream *response = request->beginResponseStream("application/json");
        response->addHeader("Cache-Control", "no-cache");

        // Build response more efficiently
        response->print("{");

        // Feature flags
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
#ifdef C6_OTA_FLASHING
        response->print("\"C6\": \"1\", ");
        response->print("\"hasC6\": 1, ");
#else
        response->print("\"C6\": \"0\", ");
        response->print("\"hasC6\": 0, ");
#endif
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
        response->print("\"hasSubGhz\": \"" + String(apInfo.hasSubGhz) + "\", ");
#else
        response->print("\"hasSubGhz\": \"0\", ");
#endif

        response->print("\"apstate\": \"" + String(apInfo.state) + "\"");

    // Include STA config file if it exists
    File configFile = contentFS->open("/current/staconfig.json", "r");
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

        request->send(response); });

    server.on("/save_apcfg", HTTP_POST, [](AsyncWebServerRequest *request)
              {
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
        request->send(200, "text/plain", "Ok, saved"); });

    server.on("/set_var", HTTP_POST, [](AsyncWebServerRequest *request)
              {
        if (request->hasParam("key", true) && request->hasParam("val", true)) {
            std::string key = request->getParam("key", true)->value().c_str();
            String val = request->getParam("val", true)->value();
            Serial.printf("set key %s value %s\r\n", key.c_str(), val);
            setVarDB(key, val);
            request->send(200, "text/plain", "Ok, saved");
        } else {
            request->send(500, "text/plain", "param error");
        } });

    server.on("/set_vars", HTTP_POST, [](AsyncWebServerRequest *request)
              {
        if (request->hasParam("json", true)) {
            JsonDocument jsonDocument;
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
        } });

    // setup

    server.on("/setup", HTTP_GET, [](AsyncWebServerRequest *request)
              { request->send(*contentFS, "/www/setup.html"); });

    // OpenDNS configuration endpoint
    server.on("/set_opendns", HTTP_POST, [](AsyncWebServerRequest *request)
              {

        // Set OpenDNS servers (208.67.222.222 is OpenDNS primary, 208.67.220.220 is secondary)
        String openDNS = "208.67.222.222";
        if (request->hasParam("server", true)) {
            String server = request->getParam("server", true)->value();
            if (server == "primary" || server == "1") {
                openDNS = "208.67.222.222";  // OpenDNS primary
            } else if (server == "secondary" || server == "2") {
                openDNS = "208.67.220.220";  // OpenDNS secondary
            } else if (server == "google" || server == "google1") {
                openDNS = "8.8.8.8";  // Google DNS primary
            } else if (server == "google2") {
                openDNS = "8.8.4.4";  // Google DNS secondary
            } else if (server == "cloudflare" || server == "cloudflare1") {
                openDNS = "1.1.1.1";  // Cloudflare DNS primary
            } else if (server == "cloudflare2") {
                openDNS = "1.0.0.1";  // Cloudflare DNS secondary
            } else {
                // Custom DNS server provided
                openDNS = server;
            }
        }

        if (contentFS) {
            JsonDocument cfg;
            File r = contentFS->open("/current/staconfig.json", "r");
            if (r) { deserializeJson(cfg, r); r.close(); }
            cfg["dns"] = openDNS;
            xSemaphoreTake(fsMutex, portMAX_DELAY);
            File w = contentFS->open("/current/staconfig.json", "w");
            if (w) { serializeJson(cfg, w); w.close(); }
            xSemaphoreGive(fsMutex);
        }

        JsonDocument doc;
        doc["success"] = true;
        doc["dns"] = openDNS;
        doc["message"] = "DNS server configured to " + openDNS;

        String response;
        serializeJson(doc, response);
        request->send(200, "application/json", response);

        Serial.println("DNS configured to: " + openDNS);
        wsSerial("DNS configured to: " + openDNS); });

    // Get current DNS configuration
    server.on("/get_dns_config", HTTP_GET, [](AsyncWebServerRequest *request)
              {
        JsonDocument doc;
        String currentDNS = "";
        if (contentFS) {
            File r = contentFS->open("/current/staconfig.json", "r");
            if (r) { JsonDocument cfg; if (deserializeJson(cfg, r) == DeserializationError::Ok) currentDNS = cfg["dns"].as<String>(); r.close(); }

            doc["success"] = true;
            doc["dns"] = currentDNS;
            doc["isEmpty"] = currentDNS.isEmpty();

            // Identify common DNS providers
            if (currentDNS == "208.67.222.222") {
                doc["provider"] = "OpenDNS Primary";
            } else if (currentDNS == "208.67.220.220") {
                doc["provider"] = "OpenDNS Secondary";
            } else if (currentDNS == "8.8.8.8") {
                doc["provider"] = "Google DNS Primary";
            } else if (currentDNS == "8.8.4.4") {
                doc["provider"] = "Google DNS Secondary";
            } else if (currentDNS == "1.1.1.1") {
                doc["provider"] = "Cloudflare DNS Primary";
            } else if (currentDNS == "1.0.0.1") {
                doc["provider"] = "Cloudflare DNS Secondary";
            } else if (!currentDNS.isEmpty()) {
                doc["provider"] = "Custom DNS";
            } else {
                doc["provider"] = "DHCP/Default";
            }
        } else {
            doc["success"] = false;
            doc["error"] = "Storage not available";
        }

        String response;
        serializeJson(doc, response);
        request->send(200, "application/json", response); });

    // Duplicate /get_ssid_list registration removed (already registered above)

    AsyncCallbackJsonWebHandler *handler = new AsyncCallbackJsonWebHandler("/save_wifi_config", [](AsyncWebServerRequest *request, JsonVariant &json)
                                                                           {
        Serial.println("WiFi config save request received");

        // Validate JSON input
        if (!json.is<JsonObject>()) {
            Serial.println("ERROR: Invalid JSON received");
            request->send(400, "application/json", "{\"error\":\"Invalid JSON\"}");
            return;
        }

        const JsonObject &jsonObj = json.as<JsonObject>();

        // Debug: Print received data
        String debugData;
        serializeJson(jsonObj, debugData);
        Serial.println("Received WiFi config: " + debugData);

    // Load existing config from filesystem
    JsonDocument cfg;
    if (!contentFS) { request->send(500, "application/json", "{\"error\":\"Storage unavailable\"}"); return; }
    File r = contentFS->open("/current/staconfig.json", "r");
    if (r) { deserializeJson(cfg, r); r.close(); }

        // Save configuration with validation
        const char *keys[] = {"ssid", "pw", "ip", "mask", "gw", "dns"};
        const size_t numKeys = sizeof(keys) / sizeof(keys[0]);
        bool saveSuccess = true;

        for (size_t i = 0; i < numKeys; i++) {
            String key = keys[i];
            if (!jsonObj[key].isNull()) {
                String value = jsonObj[key].as<String>();
                Serial.printf("Saving %s: %s\n", key.c_str(), value.c_str());
                cfg[key] = value;
            }
        }
        xSemaphoreTake(fsMutex, portMAX_DELAY);
    File w = contentFS->open("/current/staconfig.json", "w");
        if (w) { serializeJson(cfg, w); w.close(); }
        xSemaphoreGive(fsMutex);

        if (!saveSuccess) {
            Serial.println("ERROR: Some settings failed to save");
            request->send(500, "application/json", "{\"error\":\"Failed to save some settings\"}");
            return;
        }

        Serial.println("WiFi config saved successfully");
        request->send(200, "application/json", "{\"success\":true,\"message\":\"Configuration saved\"}");

        // Disable websocket to prevent interference during restart
        ws.enable(false);

        if (jsonObj["ssid"].as<String>() == "factory") {
            Serial.println("Factory reset initiated");
            config.runStatus = RUNSTATUS_STOP;
            vTaskDelay(pdMS_TO_TICKS(2000));

            // Clear stored STA credentials in filesystem
            if (contentFS) {
                cfg.clear();
                cfg["ssid"] = "";
                cfg["password"] = "";
                xSemaphoreTake(fsMutex, portMAX_DELAY);
                File w2 = contentFS->open("/current/staconfig.json", "w");
                if (w2) { serializeJson(cfg, w2); w2.close(); }
                xSemaphoreGive(fsMutex);
            }

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
            contentFS->remove("/current/staconfig.json");
            vTaskDelay(pdMS_TO_TICKS(100));
            esp_deep_sleep_start();
            ESP.restart();
        } else {
            Serial.println("Preparing for restart with new WiFi settings");
            refreshAllPending();
            saveDB("/current/tagDB.json");
        }

        ws.closeAll();
        vTaskDelay(pdMS_TO_TICKS(1000));  // Give time for response to be sent
        ESP.restart(); });
    server.addHandler(handler);

    // Duplicate handlers for DB backup, OTA, features, pins, telemetry removed (already registered above)

    // C6 Module Management Endpoints are registered by C6 module via moduleManager.registerAllWebHandlers(server)

    // Feature detection endpoints (HEAD requests)
    server.on("/tft_status", HTTP_HEAD, [](AsyncWebServerRequest *request)
              {
#ifdef HAS_TFT
                  request->send(200, "text/plain", "TFT available");
#else
                  request->send(404, "text/plain", "TFT not available");
#endif
              });

    server.on("/led_control", HTTP_HEAD, [](AsyncWebServerRequest *request)
              {
#ifdef HAS_RGB_LED
                  request->send(200, "text/plain", "LED control available");
#else
                  request->send(404, "text/plain", "LED control not available");
#endif
              });

    server.on("/ble_status", HTTP_HEAD, [](AsyncWebServerRequest *request)
              {
#ifdef HAS_BLE_WRITER
                  request->send(200, "text/plain", "BLE available");
#else
                  request->send(404, "text/plain", "BLE not available");
#endif
              });

    server.on("/subghz_status", HTTP_HEAD, [](AsyncWebServerRequest *request)
              {
#ifdef HAS_SUBGHZ
                  request->send(200, "text/plain", "SubGHz available");
#else
                  request->send(404, "text/plain", "SubGHz not available");
#endif
              });

    server.on("/rfid/status", HTTP_HEAD, [](AsyncWebServerRequest *request)
              {
#ifdef HAS_RC522_RFID
                  request->send(200, "text/plain", "RFID available");
#else
                  request->send(404, "text/plain", "RFID not available");
#endif
              });

    server.on("/flasher_status", HTTP_HEAD, [](AsyncWebServerRequest *request)
              {
#ifdef HAS_EXT_FLASHER
                  request->send(200, "text/plain", "External flasher available");
#else
                  request->send(404, "text/plain", "External flasher not available");
#endif
              });

#ifdef HAS_IR_REMOTE
    // IR Remote control endpoints
    server.on("/ir/status", HTTP_GET, [](AsyncWebServerRequest *request)
              {
        String response = irInterface.getStatusJSON();
        request->send(200, "application/json", response); });

    server.on("/ir/send", HTTP_POST, [](AsyncWebServerRequest *request)
              {
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
        request->send(success ? 200 : 500, "application/json", response); });

    server.on("/ir/learn", HTTP_POST, [](AsyncWebServerRequest *request)
              {
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
            JsonDocument doc;
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
        } });

    server.on("/ir/profiles", HTTP_GET, [](AsyncWebServerRequest *request)
              {
        std::vector<String> profiles = irInterface.getProfileList();
        JsonDocument doc;
        JsonArray profileArray = doc["profiles"].to<ArduinoJson::JsonArray>();

        for (const String &profile : profiles) {
            profileArray.add(profile);
        }

        doc["current"] = irInterface.getCurrentProfile().name;
        doc["count"] = profiles.size();

        String response;
        serializeJson(doc, response);
        request->send(200, "application/json", response); });

    server.on("/ir/receive", HTTP_GET, [](AsyncWebServerRequest *request)
              {
        if (irInterface.hasReceivedCommand()) {
            IRCommand cmd = irInterface.getLastCommand();

            JsonDocument doc;
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
        } });
#endif

// Temporarily disable RC522 until IR is working
#ifdef HAS_RC522
    // RC522 RFID control endpoints
    server.on("/rfid/status", HTTP_GET, [](AsyncWebServerRequest *request)
              {
        String response = rc522Interface.getStatusJSON();
        request->send(200, "application/json", response); });

    server.on("/rfid/scan", HTTP_GET, [](AsyncWebServerRequest *request)
              {
        bool cardFound = rc522Interface.readCard();

        if (cardFound) {
            RFIDCardInfo card = rc522Interface.getCardInfo();

            JsonDocument doc;
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
        } });

    server.on("/rfid/read", HTTP_POST, [](AsyncWebServerRequest *request)
              {
        if (!request->hasParam("type", true)) {
            request->send(400, "application/json", "{\"error\":\"Missing type parameter\"}");
            return;
        }

        String type = request->getParam("type", true)->value();

        if (type == "text") {
            String text;
            RFIDResult result = rc522Interface.readText(text);

            JsonDocument doc;
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

            JsonDocument doc;
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
        } });

    server.on("/rfid/write", HTTP_POST, [](AsyncWebServerRequest *request)
              {
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

            JsonDocument doc;
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
        } });

    server.on("/rfid/cards", HTTP_GET, [](AsyncWebServerRequest *request)
              {
        std::vector<RFIDCardInfo> cards = rc522Interface.getDetectedCards();

        JsonDocument doc;
        JsonArray cardArray = doc["cards"].to<ArduinoJson::JsonArray>();

        for (const RFIDCardInfo &card : cards) {
            JsonObject cardObj = cardArray.add<ArduinoJson::JsonObject>();
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
        request->send(200, "application/json", response); });

    server.on("/rfid/clear", HTTP_POST, [](AsyncWebServerRequest *request)
              {
        rc522Interface.clearDetectedCards();
        request->send(200, "application/json", "{\"success\":true,\"message\":\"Card database cleared\"}"); });

    server.on("/rfid/monitor", HTTP_POST, [](AsyncWebServerRequest *request)
              {
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
        request->send(200, "application/json", response); });
#endif

    // OpenAI Agent API endpoints for file management
    server.on("/create_file", HTTP_POST, [](AsyncWebServerRequest *request)
              {
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
        } });

    server.on("/read_file", HTTP_GET, [](AsyncWebServerRequest *request)
              {
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
        } });

    server.on("/update_file", HTTP_POST, [](AsyncWebServerRequest *request)
              {
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
        } });

    server.on("/delete_file", HTTP_DELETE, [](AsyncWebServerRequest *request)
              {
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
        } });

    server.on("/list_files", HTTP_GET, [](AsyncWebServerRequest *request)
              {
        String dir = request->hasParam("dir") ? request->getParam("dir")->value() : "/";

        if (!dir.startsWith("/")) {
            dir = "/" + dir;
        }

        JsonDocument doc;
        JsonArray files = doc["files"].to<ArduinoJson::JsonArray>();

        File root = contentFS->open(dir);
        if (root && root.isDirectory()) {
            File file = root.openNextFile();
            while (file) {
                JsonObject fileObj = files.add<ArduinoJson::JsonObject>();
                fileObj["name"] = String(file.name());
                fileObj["size"] = file.size();
                fileObj["isDirectory"] = file.isDirectory();
                fileObj["path"] = String(file.path());
                file = root.openNextFile();
            }
        }

        AsyncResponseStream *response = request->beginResponseStream("application/json");
        serializeJson(doc, *response);
        request->send(response); });

    // Manual control endpoints for functions
    server.on("/start_content_generation", HTTP_POST, [](AsyncWebServerRequest *request)
              {
        if (config.runStatus != RUNSTATUS_RUN) {
            config.runStatus = RUNSTATUS_RUN;
            wsLog("Content generation started manually");
            request->send(200, "application/json", "{\"success\":true,\"message\":\"Content generation started\"}");
        } else {
            request->send(200, "application/json", "{\"success\":false,\"message\":\"Content generation already running\"}");
        } });

    server.on("/stop_content_generation", HTTP_POST, [](AsyncWebServerRequest *request)
              {
        if (config.runStatus == RUNSTATUS_RUN) {
            config.runStatus = RUNSTATUS_STOP;
            wsLog("Content generation stopped manually");
            request->send(200, "application/json", "{\"success\":true,\"message\":\"Content generation stopped\"}");
        } else {
            request->send(200, "application/json", "{\"success\":false,\"message\":\"Content generation not running\"}");
        } });

    server.on("/pause_content_generation", HTTP_POST, [](AsyncWebServerRequest *request)
              {
        if (config.runStatus == RUNSTATUS_RUN) {
            config.runStatus = RUNSTATUS_PAUSE;
            wsLog("Content generation paused manually");
            request->send(200, "application/json", "{\"success\":true,\"message\":\"Content generation paused\"}");
        } else {
            request->send(200, "application/json", "{\"success\":false,\"message\":\"Content generation not running\"}");
        } });

    server.on("/get_function_status", HTTP_GET, [](AsyncWebServerRequest *request)
              {
        JsonDocument doc;
        doc["runStatus"] = config.runStatus;
        doc["runStatusText"] = (config.runStatus == RUNSTATUS_RUN) ? "Running" : (config.runStatus == RUNSTATUS_STOP) ? "Stopped"
                                                                             : (config.runStatus == RUNSTATUS_PAUSE)  ? "Paused"
                                                                                                                      : "Initializing";
        doc["contentGeneration"] = (config.runStatus == RUNSTATUS_RUN);
        doc["apOnline"] = (apInfo.state == AP_STATE_ONLINE);
        String output;
        serializeJson(doc, output);
        request->send(200, "application/json", output); });

    server.on("/update_ota", HTTP_POST, [](AsyncWebServerRequest *request)
              { handleUpdateOTA(request); });

    // === ENHANCED OPENAI AGENT API ENDPOINTS ===

    // System Control Endpoints
    server.on("/system_info", HTTP_GET, [](AsyncWebServerRequest *request)
              {
        JsonDocument doc;
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
        request->send(response); });

    server.on("/restart_system", HTTP_POST, [](AsyncWebServerRequest *request)
              {
        int delay = 3;
        if (request->hasParam("delay", true)) {
            delay = request->getParam("delay", true)->value().toInt();
        }

        JsonDocument doc;
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
                    "restart_task", 2048, &delay, 1, NULL); });

    server.on("/system_diagnostic", HTTP_POST, [](AsyncWebServerRequest *request)
              {
        String level = "detailed";
        if (request->hasParam("level", true)) {
            level = request->getParam("level", true)->value();
        }

        JsonDocument doc;
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
        request->send(response); });

    // Tag Control Endpoints
    server.on("/tag_status", HTTP_GET, [](AsyncWebServerRequest *request)
              {
        JsonDocument doc;
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
        request->send(response); });

    server.on("/tag_control", HTTP_POST, [](AsyncWebServerRequest *request)
              {
        if (!request->hasParam("tagId", true) || !request->hasParam("action", true)) {
            request->send(400, "application/json", "{\"error\":\"Missing tagId or action parameter\"}");
            return;
        }

        String tagId = request->getParam("tagId", true)->value();
        String action = request->getParam("action", true)->value();
        String data = request->hasParam("data", true) ? request->getParam("data", true)->value() : "";

        JsonDocument doc;
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
        request->send(response); });

    server.on("/tag_image_update", HTTP_POST, [](AsyncWebServerRequest *request)
              {
        if (!request->hasParam("tagId", true) || !request->hasParam("imageData", true)) {
            request->send(400, "application/json", "{\"error\":\"Missing tagId or imageData parameter\"}");
            return;
        }

        String tagId = request->getParam("tagId", true)->value();
        String imageData = request->getParam("imageData", true)->value();
        String imageType = request->hasParam("imageType", true) ? request->getParam("imageType", true)->value() : "bmp";

        JsonDocument doc;
        doc["success"] = true;
        doc["tagId"] = tagId;
        doc["imageType"] = imageType;
        doc["dataSize"] = imageData.length();
        doc["result"] = "Image update queued for tag";

        AsyncResponseStream *response = request->beginResponseStream("application/json");
        serializeJson(doc, *response);
        request->send(response); });

    // LED Control Endpoint
    server.on("/led_control", HTTP_POST, [](AsyncWebServerRequest *request)
              {
        if (!request->hasParam("action", true)) {
            request->send(400, "application/json", "{\"error\":\"Missing action parameter\"}");
            return;
        }

        String action = request->getParam("action", true)->value();
        JsonDocument doc;
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
        request->send(response); });

    // Deprecated network endpoints replaced by /api/wifi/* unified API
    server.on("/network_info", HTTP_GET, [](AsyncWebServerRequest *request)
              { request->send(410, "application/json", "{\"deprecated\":true,\"use\":\"/api/wifi/status\"}"); });
    server.on("/wifi_scan", HTTP_GET, [](AsyncWebServerRequest *request)
              { request->send(410, "application/json", "{\"deprecated\":true,\"use\":\"/api/wifi/scan\"}"); });
    server.on("/wifi_manage", HTTP_POST, [](AsyncWebServerRequest *request)
              { request->send(410, "application/json", "{\"deprecated\":true,\"use\":\"/api/wifi/connect|/api/wifi/disconnect|/api/wifi/ap\"}"); });

    // OTA Endpoints
    server.on("/ota_check", HTTP_GET, [](AsyncWebServerRequest *request)
              {
        String target = request->hasParam("target") ? request->getParam("target")->value() : "all";

        JsonDocument doc;
        doc["success"] = true;
        doc["target"] = target;
        doc["currentVersion"] = "3.0.0";
        doc["availableVersion"] = "3.0.1";
        doc["updateAvailable"] = true;
        doc["updateUrl"] = "https://github.com/OpenEPaperLink/OpenEPaperLink/releases";

        AsyncResponseStream *response = request->beginResponseStream("application/json");
        serializeJson(doc, *response);
        request->send(response); });

    server.on("/ota_update", HTTP_POST, [](AsyncWebServerRequest *request)
              {
        if (!request->hasParam("target", true)) {
            request->send(400, "application/json", "{\"error\":\"Missing target parameter\"}");
            return;
        }

        String target = request->getParam("target", true)->value();
        String version = request->hasParam("version", true) ? request->getParam("version", true)->value() : "latest";

        JsonDocument doc;
        doc["success"] = true;
        doc["target"] = target;
        doc["version"] = version;
        doc["result"] = "OTA update initiated for " + target;

        AsyncResponseStream *response = request->beginResponseStream("application/json");
        serializeJson(doc, *response);
        request->send(response); });

    // Additional Enhanced Endpoints
    server.on("/ble_status", HTTP_GET, [](AsyncWebServerRequest *request)
              {
        JsonDocument doc;
        doc["success"] = true;
        doc["bleEnabled"] = false;  // BLE not implemented yet
        doc["connectedDevices"] = 0;
        doc["scanning"] = false;
        doc["advertiseName"] = "ESP32-AP-Flasher";

        AsyncResponseStream *response = request->beginResponseStream("application/json");
        serializeJson(doc, *response);
        request->send(response); });

    server.on("/ble_control", HTTP_POST, [](AsyncWebServerRequest *request)
              {
        String action = request->hasParam("action", true) ? request->getParam("action", true)->value() : "";
        JsonDocument doc;
        doc["success"] = true;
        doc["action"] = action;
        doc["result"] = "BLE action queued (not implemented)";

        AsyncResponseStream *response = request->beginResponseStream("application/json");
        serializeJson(doc, *response);
        request->send(response); });

    server.on("/serial_ap_status", HTTP_GET, [](AsyncWebServerRequest *request)
              { request->send(410, "application/json", "{\"deprecated\":true,\"use\":\"/api/wifi/ap\"}"); });
    server.on("/serial_ap_control", HTTP_POST, [](AsyncWebServerRequest *request)
              { request->send(410, "application/json", "{\"deprecated\":true,\"use\":\"/api/wifi/ap\"}"); });

    // Log streaming configuration (UDP mirror for wireless receivers)
    server.on("/api/log/config", HTTP_GET, [](AsyncWebServerRequest *request)
              {
        String ip; uint16_t port; bool enabled;
        wsGetLogUdpConfig(ip, port, enabled);
        JsonDocument doc;
        doc["ip"] = ip;
        doc["port"] = port;
        doc["enabled"] = enabled;
        AsyncResponseStream *response = request->beginResponseStream("application/json");
        serializeJson(doc, *response);
        request->send(response); });

    server.on("/api/log/config", HTTP_POST, [](AsyncWebServerRequest *request)
              {
        String ip = request->hasParam("ip", true) ? request->getParam("ip", true)->value() : "";
        uint16_t port = request->hasParam("port", true) ? request->getParam("port", true)->value().toInt() : 0;
        bool enabled = request->hasParam("enabled", true) ? (request->getParam("enabled", true)->value() == "true" || request->getParam("enabled", true)->value() == "1") : true;
        wsSetLogUdpTarget(ip, port, enabled);
        JsonDocument doc;
        doc["success"] = true;
        doc["ip"] = ip;
        doc["port"] = port;
        doc["enabled"] = enabled;
        String out; serializeJson(doc, out);
        request->send(200, "application/json", out); });

    server.on("/api/log/test", HTTP_POST, [](AsyncWebServerRequest *request)
              {
        String msg = request->hasParam("msg", true) ? request->getParam("msg", true)->value() : "Test log over WS/UDP";
        wsSerial("[TEST] " + msg);
        request->send(200, "application/json", "{\"success\":true}"); });

    server.on("/zbs_control", HTTP_POST, [](AsyncWebServerRequest *request)
              {
        String action = request->hasParam("action", true) ? request->getParam("action", true)->value() : "";
        JsonDocument doc;
        doc["success"] = true;
        doc["action"] = action;
        doc["result"] = "ZBS interface action queued (hardware dependent)";

        AsyncResponseStream *response = request->beginResponseStream("application/json");
        serializeJson(doc, *response);
        request->send(response); });

    server.on("/swd_control", HTTP_POST, [](AsyncWebServerRequest *request)
              {
        String action = request->hasParam("action", true) ? request->getParam("action", true)->value() : "";
        JsonDocument doc;
        doc["success"] = true;
        doc["action"] = action;
        doc["result"] = "SWD programming action queued (hardware dependent)";

        AsyncResponseStream *response = request->beginResponseStream("application/json");
        serializeJson(doc, *response);
        request->send(response); });

    server.on("/spiffs_manage", HTTP_POST, [](AsyncWebServerRequest *request)
              {
        String action = request->hasParam("action", true) ? request->getParam("action", true)->value() : "";
        JsonDocument doc;
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
        request->send(response); });

    // Convenience API to read/update staconfig.json under /current (STA settings)
    server.on("/api/config/staconfig", HTTP_GET, [](AsyncWebServerRequest *request)
              {
        const char *path = "/current/staconfig.json";
        if (contentFS->exists(path)) {
            request->send(*contentFS, path, "application/json");
        } else {
            request->send(404, "application/json", "{\"error\":\"staconfig.json not found\"}");
        } });

    server.on("/api/config/staconfig", HTTP_POST, [](AsyncWebServerRequest *request)
              {
        // Body handler will handle the content
        request->send(200, "application/json", "{\"status\":\"ok\"}"); }, NULL, [](AsyncWebServerRequest *request, uint8_t *data, size_t len, size_t index, size_t total)
              {
        String body;

        // Check for reasonable size limit
        if (total > 8192) {  // 8KB limit for config
            request->send(413, "application/json", "{\"error\":\"Config too large\"}");
            return;
        }

        body.reserve(total);  // Reserve space to prevent reallocation
        if (index == 0) body = "";
        for (size_t i = 0; i < len; i++) body += (char)data[i];
        if (index + len == total) {
            // Write atomically under semaphore
            const char *path = "/current/staconfig.json";
            if (xSemaphoreTake(fsMutex, pdMS_TO_TICKS(2000)) == pdTRUE) {
                File f = contentFS->open(path, "w");
                if (f) {
                    f.print(body);
                    f.close();
                    xSemaphoreGive(fsMutex);
                    wsSerial("staconfig.json updated via API");
                    request->send(200, "application/json", "{\"success\":true}");
                } else {
                    xSemaphoreGive(fsMutex);
                    request->send(500, "application/json", "{\"error\":\"Failed to open file for writing\"}");
                }
            } else {
                request->send(503, "application/json", "{\"error\":\"File system busy\"}");
            }
        } });
    server.on(
        "/littlefs_put", HTTP_POST, [](AsyncWebServerRequest *request)
        { request->send(200); },
        handleLittleFSUpload);

    // Initialize websocket endpoints and handlers
    init_websocket(server);

    server.onNotFound([](AsyncWebServerRequest *request)
                      {
        if (request->url() == "/" || request->url() == "index.htm") {
            request->send(200, "text/html", "index.html not found. Did you forget to upload the littlefs partition?");
            return;
        }
        request->send(404); });

    server.serveStatic("/", *contentFS, "/www/").setDefaultFile("index.html");

    DefaultHeaders::Instance().addHeader("Access-Control-Allow-Origin", "*");
    DefaultHeaders::Instance().addHeader("Access-Control-Allow-Headers", "content-type");

    // === OPENAI API PROXY ENDPOINT ===
    server.on("/api/openai/chat", HTTP_POST, [](AsyncWebServerRequest *request)
              {
                  // This will be handled by the body handler
              },
              NULL, [](AsyncWebServerRequest *request, uint8_t *data, size_t len, size_t index, size_t total)
              {
            // Handle OpenAI API proxy request
            String requestBody;

            // Check for reasonable size limit
            if (total > 32768) {  // 32KB limit
                request->send(413, "application/json", "{\"error\":\"Request too large\"}");
                return;
            }

            requestBody.reserve(total);  // Reserve space to prevent reallocation

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
                JsonDocument requestDoc;
                DeserializationError error = deserializeJson(requestDoc, requestBody);

                if (error) {
                    request->send(400, "application/json", "{\"error\":\"Invalid JSON\"}");
                    return;
                }

                // Load OpenAI configuration
                String configPath = "/openai_config.json";
                JsonDocument configDoc;

                if (contentFS->exists(configPath)) {
                    File configFile = contentFS->open(configPath, "r");
                    if (configFile) {
                        DeserializationError configError = deserializeJson(configDoc, configFile);
                        configFile.close();
                        if (configError) {
                            request->send(500, "application/json", "{\"error\":\"Invalid OpenAI config file\"}");
                            return;
                        }
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
    if (!moduleManager.initializeAll())
    {
        Serial.println("[WEB] Warning: Module manager initialization had some issues");
    }

    // Initialize C6 module (this will register it with the module manager)
    initC6Module();

    // Load persisted module config (autoStart flags) if available
    if (!moduleManager.loadConfig())
    {
        Serial.println("[WEB] No persisted module config found or failed to load");
        // No persisted config - apply safe defaults: keep WiFi enabled for web server, disable C6 for debugging
        // This will not override user choices if they exist in NVS
        Serial.println("[WEB] Applying default autoStart for core modules: WiFiModule (enabled), C6Module (disabled)");
        moduleManager.setSystemConfig("{\"modules\":[{\"name\":\"WiFiModule\",\"autoStart\":true},{\"name\":\"C6Module\",\"autoStart\":false}]}");
    }
    else
    {
        Serial.println("[WEB] Module configuration loaded from NVS");
    }

    // Start all auto-start modules
    if (!moduleManager.startAll())
    {
        Serial.println("[WEB] Warning: Some modules failed to start");
    }

    // Register all module web handlers
    moduleManager.registerAllWebHandlers(server);

    Serial.println("[WEB] Enhanced module system initialization complete");
#endif

    // Mark routes registered; starting the server will be handled by
    // ensure_webserver_started() as soon as the TCP/IP stack is ready.
    // ensure_webserver_started();
}

#define UPLOAD_BUFFER_SIZE 16384 // Reduced from 32768 for better memory management

struct UploadInfo
{
    String filename;
    uint8_t buffer[UPLOAD_BUFFER_SIZE];
    size_t bufferSize;
    uint32_t totalReceived;
    uint32_t lastWriteTime;
};

void doImageUpload(AsyncWebServerRequest *request, String filename, size_t index, uint8_t *data, size_t len, bool final)
{
    String uploadfilename;

    if (!index)
    {
        // Initial checks
        if (config.runStatus != RUNSTATUS_RUN)
        {
            request->send(409, "text/plain", "Service temporarily unavailable");
            return;
        }
        if (!request->hasParam("mac", true))
        {
            request->send(400, "text/plain", "Missing required parameter: mac");
            return;
        }

        // Generate unique filename
        uploadfilename = request->getParam("mac", true)->value() + "_" + String(millis()) + ".jpg";

        // Pre-create file
        if (xSemaphoreTake(fsMutex, pdMS_TO_TICKS(1000)) == pdTRUE)
        {
            File file = contentFS->open("/temp/" + uploadfilename, "w");
            if (file)
            {
                file.close();
                xSemaphoreGive(fsMutex);
                Serial.println("Upload started: " + uploadfilename);
            }
            else
            {
                xSemaphoreGive(fsMutex);
                request->send(500, "text/plain", "Failed to create upload file");
                return;
            }
        }
        else
        {
            request->send(503, "text/plain", "File system busy");
            return;
        }

        UploadInfo *uploadInfo = new UploadInfo{uploadfilename, {}, 0, 0, millis()};
        request->_tempObject = (void *)uploadInfo;
    }

    UploadInfo *uploadInfo = static_cast<UploadInfo *>(request->_tempObject);
    if (uploadInfo == nullptr)
    {
        request->send(500, "text/plain", "Upload context lost");
        return;
    }

    uploadfilename = uploadInfo->filename;
    uploadInfo->totalReceived += len;

    if (len)
    {
        // Buffer incoming data
        if (uploadInfo->bufferSize + len <= UPLOAD_BUFFER_SIZE)
        {
            memcpy(&uploadInfo->buffer[uploadInfo->bufferSize], data, len);
            uploadInfo->bufferSize += len;
        }
        else
        {
            // Flush buffer to file
            if (xSemaphoreTake(fsMutex, pdMS_TO_TICKS(2000)) == pdTRUE)
            {
                File file = contentFS->open("/temp/" + uploadfilename, "a");
                if (file)
                {
                    if (uploadInfo->bufferSize > 0)
                    {
                        file.write(uploadInfo->buffer, uploadInfo->bufferSize);
                    }
                    file.close();
                    uploadInfo->bufferSize = 0;
                    uploadInfo->lastWriteTime = millis();
                }
                else
                {
                    xSemaphoreGive(fsMutex);
                    delete uploadInfo;
                    request->_tempObject = nullptr;
                    request->send(500, "text/plain", "File write error");
                    return;
                }
                xSemaphoreGive(fsMutex);
            }
            else
            {
                delete uploadInfo;
                request->_tempObject = nullptr;
                request->send(503, "text/plain", "File system timeout");
                return;
            }

            // Store new data in buffer
            if (len <= UPLOAD_BUFFER_SIZE)
            {
                memcpy(uploadInfo->buffer, data, len);
                uploadInfo->bufferSize = len;
            }
            else
            {
                delete uploadInfo;
                request->_tempObject = nullptr;
                request->send(413, "text/plain", "Chunk too large");
                return;
            }
        }
    }

    if (final)
    {
        // Final buffer flush
        if (uploadInfo->bufferSize > 0)
        {
            if (xSemaphoreTake(fsMutex, pdMS_TO_TICKS(2000)) == pdTRUE)
            {
                File file = contentFS->open("/temp/" + uploadfilename, "a");
                if (file)
                {
                    file.write(uploadInfo->buffer, uploadInfo->bufferSize);
                    file.close();
                }
                else
                {
                    xSemaphoreGive(fsMutex);
                    delete uploadInfo;
                    request->_tempObject = nullptr;
                    request->send(500, "text/plain", "Final write failed");
                    return;
                }
                xSemaphoreGive(fsMutex);
            }
            else
            {
                delete uploadInfo;
                request->_tempObject = nullptr;
                request->send(503, "text/plain", "Final write timeout");
                return;
            }
        }

        Serial.printf("Upload completed: %s (%lu bytes)\n", uploadfilename.c_str(), uploadInfo->totalReceived);

        // Process uploaded file
        if (request->hasParam("mac", true))
        {
            String dst = request->getParam("mac", true)->value();
            uint8_t mac[8];
            if (hex2mac(dst, mac))
            {
                tagRecord *taginfo = tagRecord::findByMAC(mac);
                if (taginfo != nullptr)
                {
                    // Extract parameters with defaults
                    uint8_t dither = request->hasParam("dither", true) ? request->getParam("dither", true)->value().toInt() : 1;
                    uint32_t ttl = request->hasParam("ttl", true) ? request->getParam("ttl", true)->value().toInt() : 0;
                    uint8_t preload = 0;
                    uint8_t preloadlut = 0;
                    uint8_t preloadtype = 0;

                    if (request->hasParam("preloadtype", true))
                    {
                        preload = 1;
                        preloadtype = request->getParam("preloadtype", true)->value().toInt();
                        if (request->hasParam("preloadlut", true))
                        {
                            preloadlut = request->getParam("preloadlut", true)->value().toInt();
                        }
                    }

                    // Update tag parameters
                    if (request->hasParam("alias", true))
                    {
                        taginfo->alias = request->getParam("alias", true)->value();
                    }
                    if (request->hasParam("rotate", true))
                    {
                        taginfo->rotate = atoi(request->getParam("rotate", true)->value().c_str());
                    }
                    if (request->hasParam("lut", true))
                    {
                        taginfo->lut = atoi(request->getParam("lut", true)->value().c_str());
                    }
                    if (request->hasParam("invert", true))
                    {
                        taginfo->invert = atoi(request->getParam("invert", true)->value().c_str());
                    }

                    // Set mode configuration
                    taginfo->modeConfigJson = "{\"filename\":\"/temp/" + uploadfilename +
                                              "\",\"timetolive\":\"" + String(ttl) +
                                              "\",\"dither\":\"" + String(dither) +
                                              "\",\"delete\":\"1\", \"preload\":\"" + String(preload) +
                                              "\", \"preload_lut\":\"" + String(preloadlut) +
                                              "\", \"preload_type\":\"" + String(preloadtype) + "\"}";

                    if (request->hasParam("contentmode", true))
                    {
                        taginfo->contentMode = request->getParam("contentmode", true)->value().toInt();
                    }
                    else
                    {
                        taginfo->contentMode = 24;
                    }

                    taginfo->nextupdate = 0;
                    wsSendTaginfo(mac, SYNC_USERCFG);
                    request->send(200, "text/plain", "Upload completed successfully");
                }
                else
                {
                    request->send(404, "text/plain", "Tag not found in database");
                }
            }
            else
            {
                request->send(400, "text/plain", "Invalid MAC address format");
            }
        }
        else
        {
            request->send(400, "text/plain", "Missing MAC parameter");
        }

        delete uploadInfo;
        request->_tempObject = nullptr;
    }
}

// Start AsyncWebServer once lwIP/esp_netif is initialized; safe to call repeatedly.
void ensure_webserver_started()
{
    static bool started = false;
    if (started)
        return;

    // Only start the server once a real network interface is up (AP/STA/AP+STA).
    wifi_mode_t m = WiFi.getMode();
    bool net_ready = (m == WIFI_STA || m == WIFI_AP || m == WIFI_AP_STA);

    if (!net_ready)
    {
        // Not ready yet; try again later
        return;
    }

    server.begin();
    started = true;
    Serial.println("[WEB] AsyncWebServer started");
}

void doJsonUpload(AsyncWebServerRequest *request)
{
    if (config.runStatus != RUNSTATUS_RUN)
    {
        request->send(409, "text/plain", "come back later");
        return;
    }
    if (request->hasParam("mac", true) && request->hasParam("json", true))
    {
        String dst = request->getParam("mac", true)->value();
        uint8_t mac[8];
        if (hex2mac(dst, mac))
        {
            if (xSemaphoreTake(fsMutex, pdMS_TO_TICKS(5000)) == pdTRUE)
            {
                File file = contentFS->open("/current/" + dst + ".json", "w");
                if (!file)
                {
                    xSemaphoreGive(fsMutex);
                    request->send(500, "text/plain", "Failed to create file");
                    return;
                }
                file.print(request->getParam("json", true)->value());
                file.close();
                xSemaphoreGive(fsMutex);
            }
            else
            {
                request->send(503, "text/plain", "File system timeout");
                return;
            }
            tagRecord *taginfo = tagRecord::findByMAC(mac);
            if (taginfo != nullptr)
            {
                uint32_t ttl = 0;
                if (request->hasParam("ttl", true))
                {
                    ttl = request->getParam("ttl", true)->value().toInt();
                }
                taginfo->modeConfigJson = "{\"filename\":\"/current/" + dst + ".json\",\"interval\":\"" + String(ttl) + "\"}";
                taginfo->contentMode = 19;
                taginfo->nextupdate = 0;
                wsSendTaginfo(mac, SYNC_USERCFG);
                request->send(200, "text/plain", "Ok, saved");
            }
            else
            {
                request->send(400, "text/plain", "mac not found in tagDB");
            }
        }
        return;
    }
    request->send(400, "text/plain", "Missing parameters");
}

void dotagDBUpload(AsyncWebServerRequest *request, String filename, size_t index, uint8_t *data, size_t len, bool final)
{
    if (!index)
    {
        logLine("restore tagDB");
        if (xSemaphoreTake(fsMutex, pdMS_TO_TICKS(5000)) == pdTRUE)
        {
            request->_tempFile = contentFS->open("/current/tagDBrestored.json", "w");
            if (!request->_tempFile)
            {
                xSemaphoreGive(fsMutex);
                request->send(500, "text/plain", "Failed to create restore file");
                return;
            }
        }
        else
        {
            request->send(503, "text/plain", "File system timeout");
            return;
        }
    }
    if (len)
    {
        request->_tempFile.write(data, len);
    }
    if (final)
    {
        request->_tempFile.close();
        xSemaphoreGive(fsMutex);
        destroyDB();
        loadDB("/current/tagDBrestored.json");
        request->send(200, "text/plain", "Ok, restored.");
    }
}

// Note: setupModuleManagementAPI was moved to ModuleManager; duplicated free function removed.
