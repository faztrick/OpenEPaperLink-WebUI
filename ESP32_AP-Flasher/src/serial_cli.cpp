// serial_cli.cpp - implementation of lightweight developer CLI

#include "serial_cli.h"
#include <WiFi.h>
#include <esp_system.h>
#include <esp_wifi.h>
#include <esp_timer.h>
#include "storage.h"
#include "tag_db.h" // for config.wifiMode persistence
#include "module_manager.h"
#include "led_module.h"
#ifndef SD_CARD_ONLY
#include <LittleFS.h>
#endif

#ifndef SERIAL_CLI_MAX_LINE
#define SERIAL_CLI_MAX_LINE 128
#endif

static char lineBuf[SERIAL_CLI_MAX_LINE];
static size_t lineLen = 0;
static uint64_t bootUs = 0;

void serial_cli_init()
{
    bootUs = esp_timer_get_time();
    lineLen = 0;
}

static void cliPrint(const char *s)
{
    Serial.println(s);
}

static void cliPrintNoNL(const char *s)
{
    Serial.print(s);
}

void serial_cli_print_prompt()
{
    Serial.print("> ");
}

static void handleSysinfo()
{
    uint64_t nowUs = esp_timer_get_time();
    uint32_t upMs = (nowUs - bootUs) / 1000ULL;
    cliPrint("--- sysinfo ---");
    Serial.printf("Uptime: %lu ms\n", (unsigned long)upMs);
    Serial.printf("Heap free: %u / %u\n", (unsigned)ESP.getFreeHeap(), (unsigned)ESP.getHeapSize());
#ifdef BOARD_HAS_PSRAM
    Serial.printf("PSRAM free: %u / %u\n", (unsigned)ESP.getFreePsram(), (unsigned)ESP.getPsramSize());
#endif
    wifi_mode_t mode;
    esp_wifi_get_mode(&mode);
    Serial.printf("WiFi mode: %d status: %d IP: %s\n", (int)mode, (int)WiFi.status(), WiFi.localIP().toString().c_str());
}

static void handleTasks()
{
    cliPrint("--- tasks ---");
#if (configUSE_TRACE_FACILITY == 1) && (configUSE_STATS_FORMATTING_FUNCTIONS == 1)
    // If trace facility enabled we can enumerate; otherwise just count
    const UBaseType_t numTasks = uxTaskGetNumberOfTasks();
    Serial.printf("Task count: %u\n", (unsigned)numTasks);
#else
    Serial.printf("Task count: %u (enable FreeRTOS trace for more details)\n", (unsigned)uxTaskGetNumberOfTasks());
#endif
}

static void handleReboot()
{
    cliPrint("Rebooting...");
    Serial.flush();
    delay(50);
    esp_restart();
}

static void processLine(char *line)
{
    // Trim line endings
    while (*line && (*line == '\r' || *line == '\n'))
        ++line;
    size_t L = strlen(line);
    while (L && (line[L - 1] == '\r' || line[L - 1] == '\n'))
        line[--L] = 0;
    if (!L)
    {
        serial_cli_print_prompt();
        return;
    }

    // HELP
    if (strcmp(line, "help") == 0)
    {
        cliPrint("Commands: help, sysinfo, tasks, reboot, fsinfo, fsmount, fstest, fsformat, wifiscan, wifimode, wifistatus, wificonnect, wifidisconnect, ledstatus, ledset, WIFI:*, LED:* (colon parser)");
        serial_cli_print_prompt();
        return;
    }

    // COLON PARSER
    if (strchr(line, ':'))
    {
        char tmp[128];
        strncpy(tmp, line, sizeof(tmp) - 1);
        tmp[sizeof(tmp) - 1] = 0;
        char *mod = tmp;
        char *rest = strchr(tmp, ':');
        if (rest)
        {
            *rest++ = 0;
            for (char *p = mod; *p; ++p)
                *p = toupper((unsigned char)*p);
            while (*rest == ' ' || *rest == '\t')
                ++rest;
            if (strcmp(mod, "WIFI") == 0)
            {
                if (!strncasecmp(rest, "SCAN", 4))
                {
                    int16_t n = WiFi.scanNetworks(false, true);
                    if (n < 0)
                        Serial.printf("{\"event\":\"wifiscan\",\"success\":false,\"error\":\"%d\"}\n", (int)n);
                    else
                    {
                        Serial.printf("{\"event\":\"wifiscan_summary\",\"count\":%d}\n", (int)n);
                        for (int i = 0; i < n; ++i)
                        {
                            String ssid = WiFi.SSID(i);
                            int32_t rssi = WiFi.RSSI(i);
                            int32_t channel = WiFi.channel(i);
                            wifi_auth_mode_t auth = WiFi.encryptionType(i);
                            uint8_t *bssid = WiFi.BSSID(i);
                            char bssidStr[20];
                            if (bssid)
                                sprintf(bssidStr, "%02X:%02X:%02X:%02X:%02X:%02X", bssid[0], bssid[1], bssid[2], bssid[3], bssid[4], bssid[5]);
                            else
                                strcpy(bssidStr, "00:00:00:00:00:00");
                            Serial.printf("{\"event\":\"wifinet\",\"ssid\":\"%s\",\"rssi\":%ld,\"channel\":%ld,\"enc\":%d,\"bssid\":\"%s\"}\n", ssid.c_str(), (long)rssi, (long)channel, (int)auth, bssidStr);
                        }
                    }
                }
                else if (!strncasecmp(rest, "STATUS", 6))
                {
                    wifi_mode_t wmode;
                    esp_wifi_get_mode(&wmode);
                    wl_status_t st = WiFi.status();
                    bool connected = (st == WL_CONNECTED);
                    String ssid = connected ? WiFi.SSID() : String("");
                    String ip = WiFi.localIP().toString();
                    long rssi = connected ? WiFi.RSSI() : 0;
                    int ch = 0;
#ifdef ESP_ARDUINO_VERSION
                    ch = WiFi.channel();
#endif
                    bool apMode = (wmode == WIFI_MODE_AP || wmode == WIFI_MODE_APSTA);
                    int apClients = apMode ? WiFi.softAPgetStationNum() : 0;
#ifdef ARDUINO
                    const char *hostname = WiFi.getHostname();
#else
                    const char *hostname = "";
#endif
                    Serial.printf("{\"event\":\"wifistatus\",\"connected\":%s,\"ssid\":\"%s\",\"ip\":\"%s\",\"rssi\":%ld,\"channel\":%d,\"mode\":%d,\"apMode\":%s,\"apClients\":%d,\"hostname\":\"%s\"}\n",
                                  connected ? "true" : "false", ssid.c_str(), ip.c_str(), rssi, ch, (int)wmode, apMode ? "true" : "false", apClients, hostname ? hostname : "");
                }
                else if (!strncasecmp(rest, "MODE=", 5))
                {
                    const char *val = rest + 5;
                    int newMode = -1;
                    if (val[0] >= '0' && val[0] <= '3' && val[1] == 0)
                        newMode = val[0] - '0';
                    else
                    {
                        char tmpm[16];
                        size_t vlen = strlen(val);
                        if (vlen > 15)
                            vlen = 15;
                        for (size_t i = 0; i < vlen; ++i)
                            tmpm[i] = tolower((unsigned char)val[i]);
                        tmpm[vlen] = 0;
                        if (!strcmp(tmpm, "auto"))
                            newMode = 0;
                        else if (!strcmp(tmpm, "ap"))
                            newMode = 1;
                        else if (!strcmp(tmpm, "sta"))
                            newMode = 2;
                        else if (!strcmp(tmpm, "apsta") || !strcmp(tmpm, "ap+sta") || !strcmp(tmpm, "ap_sta"))
                            newMode = 3;
                    }
                    int prior = (int)config.wifiMode;
                    if (newMode < 0 || newMode > 3)
                        Serial.println("{\"event\":\"wifimode\",\"success\":false,\"error\":\"invalid\"}");
                    else if (newMode != prior)
                    {
                        config.wifiMode = (uint8_t)newMode;
                        saveAPconfig();
                        Serial.printf("{\"event\":\"wifimode\",\"success\":true,\"changed\":true,\"mode\":%d}\n", newMode);
                    }
                    else
                        Serial.printf("{\"event\":\"wifimode\",\"success\":true,\"changed\":false,\"mode\":%d}\n", newMode);
                }
                else
                {
                    Serial.println("{\"event\":\"cli\",\"error\":\"unknown WIFI: command\"}");
                }
            }
            else if (strcmp(mod, "LED") == 0)
            {
                if (!strncasecmp(rest, "STATUS", 6))
                {
                    ModuleInterface *mi = moduleManager.getModuleInstance("LEDModule");
                    if (!mi)
                        Serial.println("{\"event\":\"ledstatus\",\"error\":\"module not loaded\"}");
                    else
                        Serial.println(mi->getStatus());
                }
                else if (!strncasecmp(rest, "SET", 3))
                {
                    ModuleInterface *mi = moduleManager.getModuleInstance("LEDModule");
                    if (!mi)
                        Serial.println("{\"event\":\"ledset\",\"success\":false,\"error\":\"module not loaded\"}");
                    else
                    {
                        uint8_t r = 0, g = 0, b = 0, br = 0;
                        bool haveBr = false, persist = false;
                        char *args = rest + 3;
                        while (*args == ' ' || *args == '\t')
                            ++args;
                        char *cursor = args;
                        while (*cursor)
                        {
                            while (*cursor == ' ' || *cursor == '\t')
                                ++cursor;
                            if (!*cursor)
                                break;
                            char *kv = cursor;
                            while (*cursor && *cursor != ' ' && *cursor != '\t')
                                ++cursor;
                            if (*cursor)
                                *cursor++ = '\0';
                            char *eq = strchr(kv, '=');
                            if (!eq)
                                continue;
                            *eq = '\0';
                            for (char *p = kv; *p; ++p)
                                *p = toupper((unsigned char)*p);
                            int val = atoi(eq + 1);
                            if (!strcmp(kv, "R") && val >= 0 && val <= 255)
                                r = val;
                            else if (!strcmp(kv, "G") && val >= 0 && val <= 255)
                                g = val;
                            else if (!strcmp(kv, "B") && val >= 0 && val <= 255)
                                b = val;
                            else if (!strcmp(kv, "BR") && val >= 0 && val <= 255)
                            {
                                br = val;
                                haveBr = true;
                            }
                            else if (!strcmp(kv, "PERSIST"))
                                persist = (val != 0);
                        }
                        if (!haveBr)
                            Serial.println("{\"event\":\"ledset\",\"success\":false,\"error\":\"BR required\"}");
                        else
                        {
                            if (r == 0 && g == 0 && b == 0)
                                r = g = b = br;
                            LEDModule *lm = (LEDModule *)mi;
                            lm->apply(r, g, b, br, persist);
                            Serial.printf("{\"event\":\"ledset\",\"success\":true,\"brightness\":%u,\"r\":%u,\"g\":%u,\"b\":%u,\"persist\":%s}\n", br, r, g, b, persist ? "true" : "false");
                        }
                    }
                }
                else
                    Serial.println("{\"event\":\"cli\",\"error\":\"unknown LED: command\"}");
            }
            else
            {
                Serial.println("{\"event\":\"cli\",\"error\":\"unknown module\"}");
            }
        }
        serial_cli_print_prompt();
        return;
    }

    // LEGACY / SIMPLE COMMANDS
    if (strcmp(line, "ledstatus") == 0)
    {
        ModuleInterface *mi = moduleManager.getModuleInstance("LEDModule");
        if (!mi)
            Serial.println("{\"event\":\"ledstatus\",\"error\":\"module not loaded\"}");
        else
            Serial.println(mi->getStatus());
    }
    else if (!strncmp(line, "ledset", 6))
    {
        ModuleInterface *mi = moduleManager.getModuleInstance("LEDModule");
        if (!mi)
            Serial.println("{\"event\":\"ledset\",\"success\":false,\"error\":\"module not loaded\"}");
        else
        {
            LEDModule *lm = (LEDModule *)mi;
            int br = -1, r = -1, g = -1, b = -1;
            char *p = line + 6;
            while (*p == ' ' || *p == '\t')
                ++p;
            if (*p)
            {
                br = atoi(p);
                while (*p && *p != ' ' && *p != '\t')
                    ++p;
            }
            while (*p == ' ' || *p == '\t')
                ++p;
            if (*p)
            {
                r = atoi(p);
                while (*p && *p != ' ' && *p != '\t')
                    ++p;
                while (*p == ' ' || *p == '\t')
                    ++p;
            }
            if (*p)
            {
                g = atoi(p);
                while (*p && *p != ' ' && *p != '\t')
                    ++p;
                while (*p == ' ' || *p == '\t')
                    ++p;
            }
            if (*p)
            {
                b = atoi(p);
            }
            if (br < 0 || br > 255)
                Serial.println("{\"event\":\"ledset\",\"success\":false,\"error\":\"brightness 0-255\"}");
            else
            {
                uint8_t cr, cg, cb;
                if (r < 0 || g < 0 || b < 0)
                {
                    cr = cg = cb = (uint8_t)br;
                }
                else
                {
                    if (r < 0 || r > 255 || g < 0 || g > 255 || b < 0 || b > 255)
                    {
                        Serial.println("{\"event\":\"ledset\",\"success\":false,\"error\":\"color 0-255\"}");
                        serial_cli_print_prompt();
                        return;
                    }
                    cr = (uint8_t)r;
                    cg = (uint8_t)g;
                    cb = (uint8_t)b;
                }
                lm->apply(cr, cg, cb, (uint8_t)br, true);
                Serial.printf("{\"event\":\"ledset\",\"success\":true,\"brightness\":%d,\"r\":%d,\"g\":%d,\"b\":%d}\n", br, cr, cg, cb);
            }
        }
    }
    else if (!strcmp(line, "sysinfo"))
    {
        handleSysinfo();
    }
    else if (!strcmp(line, "tasks"))
    {
        handleTasks();
    }
    else if (!strcmp(line, "reboot"))
    {
        handleReboot();
        return;
    }
    else if (!strcmp(line, "wifistatus"))
    {
        wifi_mode_t mode;
        esp_wifi_get_mode(&mode);
        wl_status_t st = WiFi.status();
        bool connected = (st == WL_CONNECTED);
        String ssid = connected ? WiFi.SSID() : String("");
        String ip = WiFi.localIP().toString();
        long rssi = connected ? WiFi.RSSI() : 0;
        int ch = 0;
#ifdef ESP_ARDUINO_VERSION
        ch = WiFi.channel();
#endif
        bool apMode = (mode == WIFI_MODE_AP || mode == WIFI_MODE_APSTA);
        int apClients = apMode ? WiFi.softAPgetStationNum() : 0;
#ifdef ARDUINO
        const char *hostname = WiFi.getHostname();
#else
        const char *hostname = "";
#endif
        Serial.printf("{\"event\":\"wifistatus\",\"connected\":%s,\"ssid\":\"%s\",\"ip\":\"%s\",\"rssi\":%ld,\"channel\":%d,\"mode\":%d,\"apMode\":%s,\"apClients\":%d,\"hostname\":\"%s\"}\n",
                      connected ? "true" : "false", ssid.c_str(), ip.c_str(), rssi, ch, (int)mode, apMode ? "true" : "false", apClients, hostname ? hostname : "");
    }
    else if (!strncmp(line, "wificonnect", 11))
    {
        char *p = line + 11;
        while (*p == ' ' || *p == '\t')
            ++p;
        if (!*p)
        {
            Serial.println("[wificonnect] usage: wificonnect <ssid> [password]");
        }
        else
        {
            char ssid[64] = {0};
            char pass[64] = {0};
            char *q = nullptr;
            if (*p == '"')
            {
                ++p;
                q = strchr(p, '"');
                size_t n = q ? (size_t)(q - p) : strlen(p);
                if (n > 63)
                    n = 63;
                strncpy(ssid, p, n);
                ssid[n] = 0;
                p = q ? (q + 1) : (p + n);
            }
            else
            {
                size_t n = 0;
                while (p[n] && p[n] != ' ' && p[n] != '\t')
                    ++n;
                if (n > 63)
                    n = 63;
                strncpy(ssid, p, n);
                ssid[n] = 0;
                p += n;
            }
            while (*p == ' ' || *p == '\t')
                ++p;
            if (*p)
            {
                if (*p == '"')
                {
                    ++p;
                    q = strchr(p, '"');
                    size_t n = q ? (size_t)(q - p) : strlen(p);
                    if (n > 63)
                        n = 63;
                    strncpy(pass, p, n);
                    pass[n] = 0;
                    p = q ? (q + 1) : (p + n);
                }
                else
                {
                    size_t n = 0;
                    while (p[n] && p[n] != ' ' && p[n] != '\t')
                        ++n;
                    if (n > 63)
                        n = 63;
                    strncpy(pass, p, n);
                    pass[n] = 0;
                    p += n;
                }
            }
            Serial.printf("[wificonnect] connecting to '%s'...\n", ssid);
            WiFi.mode(WIFI_AP_STA);
            if (pass[0])
                WiFi.begin(ssid, pass);
            else
                WiFi.begin(ssid);
            unsigned long start = millis();
            bool ok = false;
            while (millis() - start < 12000UL)
            {
                if (WiFi.status() == WL_CONNECTED)
                {
                    ok = true;
                    break;
                }
                delay(200);
            }
            if (ok)
                Serial.printf("{\"event\":\"wificonnect\",\"success\":true,\"ssid\":\"%s\",\"ip\":\"%s\",\"rssi\":%ld}\n", ssid, WiFi.localIP().toString().c_str(), WiFi.RSSI());
            else
                Serial.printf("{\"event\":\"wificonnect\",\"success\":false,\"ssid\":\"%s\",\"error\":\"timeout\"}\n", ssid);
        }
    }
    else if (!strcmp(line, "wifidisconnect"))
    {
        bool ok = WiFi.disconnect();
        delay(50);
        Serial.printf("{\"event\":\"wifidisconnect\",\"success\":%s,\"status\":%d}\n", ok ? "true" : "false", (int)WiFi.status());
    }
    else if (!strcmp(line, "fsinfo"))
    {
        if (!contentFS)
            cliPrint("[fsinfo] contentFS = null (not mounted)");
        else
        {
#ifndef SD_CARD_ONLY
            if (contentFS == &LittleFS)
            {
                uint64_t total = LittleFS.totalBytes();
                uint64_t used = LittleFS.usedBytes();
                Serial.printf("[fsinfo] Active FS: LittleFS used %llu / %llu bytes (free %llu)\n", (unsigned long long)used, (unsigned long long)total, (unsigned long long)(total - used));
            }
#endif
#ifdef HAS_SDCARD
            if (contentFS == &SDCARD)
            {
                Serial.println("[fsinfo] Active FS: SD Card (detailed size reporting not implemented in CLI)");
            }
#endif
        }
    }
    else if (!strcmp(line, "fsmount"))
    {
        cliPrint("[fsmount] Forcing Storage.begin() remount attempt...");
        Storage.begin();
        cliPrint("[fsmount] Remount attempt complete (see fsinfo for status)");
    }
    else if (!strcmp(line, "fstest"))
    {
        if (!contentFS)
            cliPrint("[fstest] No filesystem mounted");
        else
        {
            const char *testPath = "/current/.fstest.tmp";
            File f = contentFS->open(testPath, "w");
            if (!f)
                cliPrint("[fstest] FAILED: open for write");
            else
            {
                f.print("ok");
                f.close();
                File r = contentFS->open(testPath, "r");
                if (r)
                {
                    String s = r.readString();
                    r.close();
                    if (s == "ok")
                        cliPrint("[fstest] PASS (write/read)");
                    else
                        cliPrint("[fstest] FAIL: readback mismatch");
                }
                else
                    cliPrint("[fstest] FAIL: reopen for read");
                contentFS->remove(testPath);
            }
        }
    }
    else if (!strcmp(line, "fsformat"))
    {
#ifndef SD_CARD_ONLY
        if (contentFS != &LittleFS)
            cliPrint("[fsformat] Active FS is not LittleFS (format not supported)");
        else
        {
            cliPrint("[fsformat] Formatting LittleFS – this will erase data");
            delay(50);
            if (LittleFS.format())
            {
                cliPrint("[fsformat] Format OK, remounting");
                LittleFS.begin();
                Storage.begin();
            }
            else
                cliPrint("[fsformat] Format FAILED");
        }
#else
        cliPrint("[fsformat] Not available (SD_CARD_ONLY build)");
#endif
    }
    else if (!strcmp(line, "wifiscan") || !strcmp(line, "wifi_scan"))
    {
        // Improve robustness: handle existing async scan, ensure STA capability, and cleanup results
        cliPrint("[wifiscan] starting scan...");

        wifi_mode_t originalMode = WiFi.getMode();
        bool addedStaTemp = false;
        if (originalMode == WIFI_AP)
        {
            // Temporarily enable STA so we can scan while keeping AP active
            WiFi.mode(WIFI_AP_STA);
            addedStaTemp = true;
        }

        // If a previous async scan is running (from other subsystem), wait briefly for completion
        uint32_t waitStart = millis();
        while (WiFi.scanComplete() == WIFI_SCAN_RUNNING && (millis() - waitStart) < 4000)
        {
            delay(100);
        }

        // If previous results linger, discard to force fresh scan
        int16_t prev = WiFi.scanComplete();
        if (prev >= 0)
        {
            WiFi.scanDelete();
        }

        // Start synchronous scan (blocking) so serial user gets immediate results
        int16_t n = WiFi.scanNetworks(false, true);
        if (n == WIFI_SCAN_RUNNING)
        {
            // Fallback: rare case API returned running despite sync request – poll until complete or timeout
            uint32_t start = millis();
            while ((n = WiFi.scanComplete()) == WIFI_SCAN_RUNNING && (millis() - start) < 8000)
            {
                delay(150);
            }
        }

        if (n < 0)
        {
            Serial.printf("[wifiscan] scan failed (%d)\n", (int)n);
        }
        else
        {
            Serial.printf("{\"event\":\"wifiscan_summary\",\"count\":%d}\n", (int)n);
            for (int i = 0; i < n; ++i)
            {
                String ssid = WiFi.SSID(i);
                int32_t rssi = WiFi.RSSI(i);
                int32_t channel = WiFi.channel(i);
                wifi_auth_mode_t auth = WiFi.encryptionType(i);
                uint8_t *bssid = WiFi.BSSID(i);
                char bssidStr[20];
                if (bssid)
                    sprintf(bssidStr, "%02X:%02X:%02X:%02X:%02X:%02X", bssid[0], bssid[1], bssid[2], bssid[3], bssid[4], bssid[5]);
                else
                    strcpy(bssidStr, "00:00:00:00:00:00");
                Serial.printf("{\"event\":\"wifinet\",\"ssid\":\"%s\",\"rssi\":%ld,\"channel\":%ld,\"enc\":%d,\"bssid\":\"%s\"}\n", ssid.c_str(), (long)rssi, (long)channel, (int)auth, bssidStr);
            }
            cliPrint("[wifiscan] done");
        }

        // Free scan results buffer
        WiFi.scanDelete();

        if (addedStaTemp)
        {
            // Revert back to AP only if we elevated mode just for scanning
            WiFi.mode(WIFI_AP);
        }
    }
    else if (!strncmp(line, "wifimode", 8))
    {
        char *arg = nullptr;
        if (line[8] == ' ' || line[8] == '\t')
        {
            arg = line + 8;
            while (*arg == ' ' || *arg == '\t')
                ++arg;
            if (!*arg)
                arg = nullptr;
        }
        int prior = (int)config.wifiMode;
        bool changed = false;
        bool ok = true;
        if (arg)
        {
            int newMode = -1;
            if (arg[0] >= '0' && arg[0] <= '3' && arg[1] == '\0')
                newMode = arg[0] - '0';
            else
            {
                char tmp[16];
                size_t alen = strlen(arg);
                if (alen > 15)
                    alen = 15;
                for (size_t i = 0; i < alen; ++i)
                    tmp[i] = tolower((unsigned char)arg[i]);
                tmp[alen] = 0;
                if (!strcmp(tmp, "auto"))
                    newMode = 0;
                else if (!strcmp(tmp, "ap"))
                    newMode = 1;
                else if (!strcmp(tmp, "sta"))
                    newMode = 2;
                else if (!strcmp(tmp, "apsta") || !strcmp(tmp, "ap+sta") || !strcmp(tmp, "ap_sta"))
                    newMode = 3;
            }
            if (newMode < 0 || newMode > 3)
            {
                ok = false;
                Serial.println("[wifimode] invalid mode (use 0-3 or auto|ap|sta|apsta)");
            }
            else if (newMode != prior)
            {
                config.wifiMode = (uint8_t)newMode;
                changed = true;
                saveAPconfig();
            }
        }
        auto modeName = [](int m)
        { switch(m){ case 0: return "AUTO"; case 1: return "AP"; case 2: return "STA"; case 3: return "AP_STA"; default: return "?"; } };
        Serial.printf("{\"event\":\"wifimode\",\"success\":%s,\"mode\":%d,\"modeName\":\"%s\",\"changed\":%s,\"prior\":%d}\n", ok ? "true" : "false", (int)config.wifiMode, modeName(config.wifiMode), changed ? "true" : "false", prior);
        if (changed)
            Serial.println("[wifimode] mode updated; restart WiFi subsystem or reboot device to apply immediately");
    }
    else
    {
        Serial.print("Unknown command: ");
        Serial.println(line);
    }

    serial_cli_print_prompt();
}

void serial_cli_feed_char(char c)
{
    // Treat CR or LF as line termination.
    if (c == '\r' || c == '\n')
    {
        if (lineLen < SERIAL_CLI_MAX_LINE)
            lineBuf[lineLen++] = '\0';
        else
            lineBuf[SERIAL_CLI_MAX_LINE - 1] = '\0';
        processLine(lineBuf);
        lineLen = 0;
        return;
    }
    if (c == 0x7f || c == 0x08) // backspace
    {
        if (lineLen > 0)
        {
            lineLen--;
            // simple backspace handling: emit BS space BS to erase char in terminal
            Serial.print("\b \b");
        }
        return;
    }
    if ((unsigned char)c < 32) // ignore other control chars
        return;
    if (lineLen < SERIAL_CLI_MAX_LINE - 1)
    {
        lineBuf[lineLen++] = c;
        lineBuf[lineLen] = '\0';
        Serial.print(c); // echo
    }
    else
    {
        // line overflow -> reset
        cliPrint("\n[line too long - cleared]");
        lineLen = 0;
        serial_cli_print_prompt();
    }
}
