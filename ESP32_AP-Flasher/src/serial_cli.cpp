// serial_cli.cpp - implementation of lightweight developer CLI

#include "serial_cli.h"
#include <WiFi.h>
#include <esp_system.h>
#include <esp_wifi.h>
#include <esp_timer.h>
#include "storage.h"
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
    // Trim CR/LF
    while (*line && (*line == '\r' || *line == '\n'))
        ++line;
    size_t L = strlen(line);
    while (L && (line[L - 1] == '\r' || line[L - 1] == '\n'))
        line[--L] = 0;
    if (L == 0)
    {
        serial_cli_print_prompt();
        return;
    }
    if (strcmp(line, "help") == 0)
    {
        cliPrint("Commands: help, sysinfo, tasks, reboot, fsinfo, fsmount, fstest, fsformat");
    }
    else if (strcmp(line, "sysinfo") == 0)
    {
        handleSysinfo();
    }
    else if (strcmp(line, "tasks") == 0)
    {
        handleTasks();
    }
    else if (strcmp(line, "reboot") == 0)
    {
        handleReboot();
        return; // no prompt (reset imminent)
    }
    else if (strcmp(line, "fsinfo") == 0)
    {
        if (!contentFS)
        {
            cliPrint("[fsinfo] contentFS = null (not mounted)");
        }
        else
        {
#ifndef SD_CARD_ONLY
            if (contentFS == &LittleFS)
            {
                uint64_t total = LittleFS.totalBytes();
                uint64_t used = LittleFS.usedBytes();
                Serial.printf("[fsinfo] Active FS: LittleFS used %llu / %llu bytes (free %llu)\n",
                              (unsigned long long)used,
                              (unsigned long long)total,
                              (unsigned long long)(total - used));
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
    else if (strcmp(line, "fsmount") == 0)
    {
        cliPrint("[fsmount] Forcing Storage.begin() remount attempt...");
        Storage.begin();
        cliPrint("[fsmount] Remount attempt complete (see fsinfo for status)");
    }
    else if (strcmp(line, "fstest") == 0)
    {
        if (!contentFS)
        {
            cliPrint("[fstest] No filesystem mounted");
        }
        else
        {
            const char *testPath = "/current/.fstest.tmp";
            File f = contentFS->open(testPath, "w");
            if (!f)
            {
                cliPrint("[fstest] FAILED: open for write");
            }
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
                    {
                        cliPrint("[fstest] PASS (write/read)");
                    }
                    else
                    {
                        cliPrint("[fstest] FAIL: readback mismatch");
                    }
                }
                else
                {
                    cliPrint("[fstest] FAIL: reopen for read");
                }
                contentFS->remove(testPath);
            }
        }
    }
    else if (strcmp(line, "fsformat") == 0)
    {
#ifndef SD_CARD_ONLY
        if (contentFS != &LittleFS)
        {
            cliPrint("[fsformat] Active FS is not LittleFS (format not supported)");
        }
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
            {
                cliPrint("[fsformat] Format FAILED");
            }
        }
#else
        cliPrint("[fsformat] Not available (SD_CARD_ONLY build)");
#endif
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
