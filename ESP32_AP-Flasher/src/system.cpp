#include "system.h"

#include <Arduino.h>
#include <FS.h>
#include <esp_sntp.h>

#include "core_utilities.h"
#include "json_config.h"
#include "wifi_unified_module.h"

void timeSyncCallback(struct timeval* tv) {
    LogUtils::logInfo("Time successfully synced");
}

void initTime(void* parameter) {
    if (!(WiFi.status() == WL_CONNECTED || wifiUtils.getWifiStatus() == ETHERNET)) {
        vTaskDelay(500 / portTICK_PERIOD_MS);
    }
    sntp_set_time_sync_notification_cb(timeSyncCallback);
    sntp_set_sync_interval(300 * 1000);

    // Use the new configuration system
    AppConfig& config = CONFIG.getConfig();
    configTzTime(config.system.timezone.c_str(), "time.cloudflare.com", "pool.ntp.org", "time.nist.gov");

    // Log startup using the new logging system
    logSystemStartup();

    struct tm timeinfo;
    while (millis() < 30000) {
        if (!getLocalTime(&timeinfo)) {
            LogUtils::logInfo("Waiting for valid time from NTP-server");
            vTaskDelay(1000 / portTICK_PERIOD_MS);
        } else {
            break;
        }
    }

    vTaskDelay(10 / portTICK_PERIOD_MS);
    vTaskDelete(NULL);
}

void logSystemStartup() {
    esp_reset_reason_t resetReason = esp_reset_reason();

    String logEntry = "System boot - Reset reason: ";
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

    // Use the new logging system
    LogUtils::logInfo(logEntry);

    // Update boot count in new config system
    AppConfig& config = CONFIG.getConfig();
    config.system.bootCount++;
    CONFIG.save();
}

bool isWifiConnected() {
    // Check both general WiFi status and the unified module's status
    return (WiFi.status() == WL_CONNECTED) || wifiUnified.isConnected();
}
