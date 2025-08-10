/**
 * @file system_utilities.cpp
 * @brief Consolidated system, power management, and language utilities
 * 
 * This file consolidates various system-level utilities that were previously
 * in separate small files for better organization and maintainability.
 * 
 * @author OpenEPaperLink Contributors
 * @version Consolidated implementation
 */

#include "language.h"
#include "leds.h"
#include "powermgt.h"
#include "settings.h"
#include "soc/rtc_cntl_reg.h"
#include "soc/soc.h"
#include "storage.h"
#include "system.h"
#include "tag_db.h"
#include "wifi_utils.h"
#include <Arduino.h>
#include <ArduinoJson.h>
#include <FS.h>
#include <Preferences.h>
#include <esp_sntp.h>

// ============================================================================

// Content from system.cpp

// ============================================================================

void timeSyncCallback(struct timeval* tv) {
    Serial.println("time succesfully synced");
}

void initTime(void* parameter) {
    if (!(WiFi.status() == WL_CONNECTED || wifiUtils.getWifiStatus() == ETHERNET)) {
        vTaskDelay(500 / portTICK_PERIOD_MS);
    }
    sntp_set_time_sync_notification_cb(timeSyncCallback);
    sntp_set_sync_interval(300 * 1000);
    configTzTime(config.timeZone, "time.cloudflare.com", "pool.ntp.org", "time.nist.gov");
    logStartUp();
    struct tm timeinfo;
    while (millis() < 30000) {
        if (!getLocalTime(&timeinfo)) {
            Serial.println("Waiting for valid time from NTP-server");
            vTaskDelay(1000 / portTICK_PERIOD_MS);
        } else {
            break;
        }
    }
    if (config.runStatus == RUNSTATUS_INIT) {
        config.runStatus = RUNSTATUS_RUN;
    }
    vTaskDelay(10 / portTICK_PERIOD_MS);
    vTaskDelete(NULL);
}

void logLine(const char* buffer) {
    logLine(String(buffer));
}

void logLine(const String& text) {
    time_t now;
    time(&now);

    char timeStr[24];
    const char* format = (now < (time_t)1672531200) ? "           %H:%M:%S " : "%Y-%m-%d %H:%M:%S ";
    strftime(timeStr, sizeof(timeStr), format, localtime(&now));

    xSemaphoreTake(fsMutex, portMAX_DELAY);
    File logFile = contentFS->open("/log.txt", "a");
    if (logFile) {
        if (logFile.size() >= 10 * 1024) {
            logFile.close();
            contentFS->remove("/logold.txt");
            contentFS->rename("/log.txt", "/logold.txt");
            logFile = contentFS->open("/log.txt", "a");
            if (!logFile) {
                xSemaphoreGive(fsMutex);
                return;
            }
        }

        logFile.print(timeStr);
        logFile.println(text);
        logFile.close();
    }
    xSemaphoreGive(fsMutex);
}

void logStartUp() {
    esp_reset_reason_t resetReason = esp_reset_reason();

    String logEntry = "Reboot. Reason: ";
    switch (resetReason) {
        case ESP_RST_POWERON:
            logEntry += "Power-on";
            break;
        case ESP_RST_EXT:
            logEntry += "External";
            break;
        case ESP_RST_SW:
            logEntry += "Software";
            break;
        case ESP_RST_PANIC:
            logEntry += "Panic";
            break;
        case ESP_RST_INT_WDT:
            logEntry += "Watchdog";
            break;
        case ESP_RST_TASK_WDT:
            logEntry += "Task Watchdog";
            break;
        case ESP_RST_WDT:
            logEntry += "Other Watchdog";
            break;
        case ESP_RST_DEEPSLEEP:
            logEntry += "Deep Sleep";
            break;
        case ESP_RST_BROWNOUT:
            logEntry += "Brownout";
            break;
        case ESP_RST_SDIO:
            logEntry += "SDIO";
            break;
        default:
            logEntry += "Unknown";
            break;
    }

    logLine(logEntry);
}


// ============================================================================

// Content from powermgt.cpp

// ============================================================================

#ifdef HAS_EXT_FLASHER
#include "soc/rtc_cntl_reg.h"
#include "soc/soc.h"
#endif

void simpleAPPower(uint8_t* pin, uint8_t pincount, bool state) {
    for (uint8_t c = 0; c < pincount; c++) {
        pinMode(pin[c], INPUT);
    }
    for (uint8_t c = 0; c < pincount; c++) {
#ifdef POWER_HIGH_SIDE_DRIVER
        digitalWrite(pin[c], !state);
#else
        digitalWrite(pin[c], state);
#endif
    }
    for (uint8_t c = 0; c < pincount; c++) {
        pinMode(pin[c], OUTPUT);
    }
}

#ifdef POWER_RAMPING
// On the OpenEPaperLink board, there is no in-rush current limiting. The tags that can be connected to the board can have significant capacity, which,
// when drained if the board applies power, will cause the 3v3 rail to sag enough to reset the ESP32. This is obviously not great. To prevent this from happening,
// we ramp up/down the voltage with PWM. Ramping down really is unnecessary, as the board has a resistor to dump the charge into.
void rampTagPower(uint8_t* pin, bool up) {
#ifdef HAS_EXT_FLASHER
    WRITE_PERI_REG(RTC_CNTL_BROWN_OUT_REG, 0);
#endif
    if (up) {
#if ESP_ARDUINO_VERSION_MAJOR == 2
        ledcSetup(0, 50000, 8);
        ledcWrite(0, 254);
        vTaskDelay(1 / portTICK_PERIOD_MS);
        pinMode(pin[0], OUTPUT);
        ledcAttachPin(pin[0], 0);
#else
        ledcWriteChannel(0, 254);
        ledcAttachChannel(pin[0], 50000, 8, 0);
#endif
        pinMode(FLASHER_EXT_RESET, OUTPUT);
        digitalWrite(FLASHER_EXT_RESET, LOW);
        vTaskDelay(10 / portTICK_PERIOD_MS);
        for (uint8_t c = 254; c != 0xFF; c--) {
            ledcSet(0, c);
            delayMicroseconds(700);
        }
        digitalWrite(pin[0], LOW);
        ledcDetachPin(pin[0]);
        digitalWrite(pin[0], LOW);
        digitalWrite(FLASHER_EXT_RESET, INPUT_PULLUP);
    } else {
        ledcSetup(0, 50000, 8);
        ledcSet(0, 0);
        vTaskDelay(1 / portTICK_PERIOD_MS);
        pinMode(pin[0], OUTPUT);
        pinMode(FLASHER_EXT_RESET, INPUT_PULLDOWN);
        ledcAttachPin(pin[0], 0);
        vTaskDelay(10 / portTICK_PERIOD_MS);
        for (uint8_t c = 0; c < 0xFF; c++) {
            ledcSet(0, c);
            if (c > 250) {
                vTaskDelay(2 / portTICK_PERIOD_MS);
            } else {
                delayMicroseconds(500);
            }
        }
        digitalWrite(pin[0], HIGH);
        ledcDetachPin(pin[0]);
        digitalWrite(pin[0], HIGH);
    }
#ifdef HAS_EXT_FLASHER
    WRITE_PERI_REG(RTC_CNTL_BROWN_OUT_REG, 1);
#endif
}
#endif

void powerControl(bool powerState, uint8_t* pin, uint8_t pincount) {
    if (pincount == 0) return;
    if (pin == nullptr) return;

    static bool currentState = false;
    if (currentState == powerState) return;
    currentState = powerState;

#ifdef POWER_RAMPING
    if (powerState == true) {
#ifdef POWER_HIGH_SIDE_DRIVER
        rampTagPower(pin, true);
#else
        rampTagPower(pin, false);
#endif
    } else {
/*
        pinMode(pin[0], OUTPUT);
#ifdef POWER_HIGH_SIDE_DRIVER
        digitalWrite(pin[0], HIGH);
#else
        digitalWrite(pin[0], LOW);
#endif
*/
#ifdef POWER_HIGH_SIDE_DRIVER
        rampTagPower(pin, false);
#else
        rampTagPower(pin, true);
#endif
    }
#else
    simpleAPPower(pin, pincount, powerState);
    delay(500);
    // simpleAPPower(pin, pincount, true);
#endif
    }

// ============================================================================

// Content from language.cpp

// ============================================================================

String languageDaysShort[7];
String languageDays[7];
String languageMonth[12];
String languageDateFormat[5];

int currentLanguage = 0;

void updateLanguageFromConfig() {
    int tempLang = config.language;
    if (tempLang < 0 || tempLang > 11) {
        Serial.println("Language not supported");
        return;
    }
    currentLanguage = tempLang;

    File file = contentFS->open("/languages.json", "r");
    if (!file) {
        Serial.println("Failed to open languages.json file");
        return;
    }

    DynamicJsonDocument doc(2048);
    DynamicJsonDocument filter(2048);
    filter[String(currentLanguage)] = true;
    const DeserializationError error = deserializeJson(doc, file, DeserializationOption::Filter(filter));
    file.close();
    if (error) {
        Serial.print("Failed to parse JSON: ");
        Serial.println(error.c_str());
        return;
    }
    JsonObject languageObject = doc[String(currentLanguage)];
    for (int i = 0; i < 7; ++i) {
        languageDaysShort[i] = languageObject["daysShort"][i].as<String>();
        languageDays[i] = languageObject["days"][i].as<String>();
    }
    for (int i = 0; i < 12; ++i) {
        languageMonth[i] = languageObject["months"][i].as<String>();
    }
    for (int i = 0; i < languageObject["date_format"].size(); i++) {
        languageDateFormat[i] = languageObject["date_format"][i].as<String>();
    }
}




