
#include <Arduino.h>
#include <WiFi.h>
#include <esp_task_wdt.h>  // For watchdog configuration
#include <nvs_flash.h>
#include <time.h>
#ifdef ETHERNET_CLK_MODE
#include <ETH.h>
#endif

// Core utilities - consolidated
#include "core_utilities.h"
#include "json_config.h"  // Modern unified configuration system

// Main application modules
#include "contentmanager.h"
#include "flasher.h"
#include "serial_commands.h"
#include "serialap.h"
#include "settings.h"
#include "storage.h"
#include "system.h"
#include "tag_db.h"
#include "tagdata.h"
#include "wifi_utils.h"

// Optional hardware modules
#ifdef HAS_EXT_FLASHER
#include "webflasher.h"
#endif

#if defined HAS_USB || defined HAS_EXT_FLASHER
#include "usbflasher.h"
#endif

#include "language.h"
#include "leds.h"
#include "udp.h"
#include "util.h"
#include "web.h"

#ifdef HAS_BLE_WRITER
#include "ble_writer.h"
#endif

#ifdef HAS_IR_REMOTE
#include "ir_interface.h"
#endif

#ifdef HAS_RC522
#include "rc522_interface.h"
#endif

util::Timer intervalContentRunner(seconds(1));
util::Timer intervalSysinfo(seconds(5));
util::Timer intervalVars(seconds(10));
util::Timer intervalSaveDB(minutes(5));

SET_LOOP_TASK_STACK_SIZE(32 * 1024);  // Increased from 16KB to 32KB to prevent stack overflow

void delayedStart(void* parameter) {
    // Basic delayed start function
    vTaskDelay(pdMS_TO_TICKS(5000));  // Wait 5 seconds

    Serial.println("✅ Delayed start completed");

    vTaskDelete(NULL);  // Delete this task
}

void delayedContentStart(void* parameter) {
    // Optimized delayed start with better logging
    CoreUtils::safeDelay(30000);

    if (config.runStatus != RUNSTATUS_RUN) {
        LogUtils::logInfo("Content generation ready - use manual start button");
        wsLog("System Ready: Content generation is ready for manual activation");
    }

    vTaskDelay(pdMS_TO_TICKS(10));
    vTaskDelete(NULL);
}

bool initializeStorageSystem() {
    LogUtils::logInfo("Initializing storage system...");

    // Initialize boot count tracking
    int bootCount = StorageManager::getInt("system", "bootCount", 0);
    StorageManager::setInt("system", "bootCount", bootCount + 1);

    // Set device info if not already set
    if (StorageManager::getString("system", "deviceName", "").isEmpty()) {
        StorageManager::setString("system", "deviceName", "ESP32-AP-Flasher");
        StorageManager::setString("system", "version", "2.0.0-optimized");
        StorageManager::setBool("system", "firstBoot", true);
        LogUtils::logInfo("First boot detected, initializing default settings");
    }

    // Print storage health
    StorageManager::printStatistics();

    LogUtils::logInfo("Storage system initialized - Boot count: " + String(bootCount + 1));
    return true;
}

void setup() {
    // Configure watchdog for longer timeout during setup
    esp_task_wdt_deinit();         // Disable default watchdog
    esp_task_wdt_init(30, false);  // 30 second timeout, no panic

    // Initialize serial communication
#ifdef UART_LOGGING_TX_ONLY_PIN
    Serial.begin(115200, SERIAL_8N1, -1, UART_LOGGING_TX_ONLY_PIN);
    gpio_set_drive_capability((gpio_num_t)FLASHER_AP_RXD, GPIO_DRIVE_CAP_0);
#else
    Serial.begin(115200);
#endif
#if ARDUINO_USB_CDC_ON_BOOT == 1
    Serial.setTxTimeoutMs(0);  // workaround bug in USB CDC that slows down serial output when no usb connected
#endif

    Serial.print(">\r\n");
    Serial.flush();
    delay(100);  // Give serial time to initialize

    LogUtils::logInfo("=== ESP32 AP-Flasher Starting ===");
    LogUtils::logInfo("Build: " + String(__DATE__) + " " + String(__TIME__));
    LogUtils::logInfo("Free heap: " + String(ESP.getFreeHeap()) + " bytes");

    // Initialize core utilities first
    if (!CoreUtils::initialize()) {
        LogUtils::logError("Failed to initialize core utilities - system halted");
        while (1) {
            CoreUtils::safeDelay(1000);
        }
    }

#ifdef HAS_TFT
    extern void yellow_ap_display_init(void);
    yellow_ap_display_init();
#endif

    // Start LED task with increased stack size and error checking
    TaskHandle_t ledTaskHandle;
    BaseType_t result = xTaskCreate(ledTask, "ledhandler", 4096, NULL, 2, &ledTaskHandle);
    if (result != pdPASS) {
        LogUtils::logError("Failed to create LED task");
    } else {
        CoreUtils::safeDelay(100);  // Give task time to initialize
    }

#if defined(OPENEPAPERLINK_MINI_AP_PCB) || defined(OPENEPAPERLINK_NANO_AP_PCB)
    APEnterEarlyReset();
    LogUtils::logInfo("Early reset mode - 3 seconds to connect terminal");
    CoreUtils::safeDelay(3000);
#ifdef DEBUG_VERSION
    Serial0.begin(115200, SERIAL_8N1, 38, 37);
    Serial0.printf("Started debug output...\r\n");
    Serial0.setDebugOutput(true);
#endif
#endif

#ifdef BOARD_HAS_PSRAM
    if (!psramInit()) {
        LogUtils::logError("PSRAM expected but not found - system halted");
#ifdef HAS_RGB_LED
        showColorPattern(CRGB::Yellow, CRGB::Red, CRGB::Red);
#endif
        while (1) {
            CoreUtils::safeDelay(1000);
        }
    }
    heap_caps_malloc_extmem_enable(64);
    LogUtils::logInfo("PSRAM initialized successfully");
#endif

    // Initialize storage system (includes NVS and file systems)
    if (!FileSystemManager::initialize()) {
        LogUtils::logError("Failed to initialize file system - system halted");
        while (1) {
            CoreUtils::safeDelay(1000);
        }
    }

    // Initialize new configuration management system
    if (!CONFIG.initialize()) {
        LogUtils::logError("Failed to initialize configuration system - system halted");
        while (1) {
            CoreUtils::safeDelay(1000);
        }
    }

    LogUtils::logInfo("Storage and configuration systems initialized successfully");

    // Initialize legacy storage for backward compatibility
    Storage.begin();

    /*
    LogUtils::logInfo("##################################");
    LogUtils::logInfo("Internal Total heap " + String(ESP.getHeapSize()) + ", internal Free Heap " + String(ESP.getFreeHeap()));
    LogUtils::logInfo("SPIRam Total heap " + String(ESP.getPsramSize()) + ", SPIRam Free Heap " + String(ESP.getFreePsram()));
    LogUtils::logInfo("ChipRevision " + String(ESP.getChipRevision()) + ", Cpu Freq " + String(ESP.getCpuFreqMHz()) + ", SDK Version " + String(ESP.getSdkVersion()));
    LogUtils::logInfo("Flash Size " + String(ESP.getFlashChipSize()) + ", Flash Speed " + String(ESP.getFlashChipSpeed()));
    LogUtils::logInfo("##################################");

    LogUtils::logInfo("Total heap: " + String(ESP.getHeapSize()));
    LogUtils::logInfo("Free heap: " + String(ESP.getFreeHeap()));
    LogUtils::logInfo("Total PSRAM: " + String(ESP.getPsramSize()));
    LogUtils::logInfo("Free PSRAM: " + String(ESP.getFreePsram()));

    LogUtils::logInfo("ESP32 Partition table:");
    LogUtils::logInfo("| Type | Sub |  Offset  |   Size   |       Label      |");
    LogUtils::logInfo("| ---- | --- | -------- | -------- | ---------------- |");
    esp_partition_iterator_t pi = esp_partition_find(ESP_PARTITION_TYPE_ANY, ESP_PARTITION_SUBTYPE_ANY, NULL);
    if (pi != NULL) {
        do {
            const esp_partition_t* p = esp_partition_get(pi);
            char partitionInfo[100];
            snprintf(partitionInfo, sizeof(partitionInfo), "|  %02x  | %02x  | 0x%06X | 0x%06X | %-16s |",
                     p->type, p->subtype, p->address, p->size, p->label);
            LogUtils::logInfo(String(partitionInfo));
        } while (pi = (esp_partition_next(pi)));
    }
    */

    wifiUtils.initEth();
    initAPconfig();

    updateLanguageFromConfig();
    updateBrightnessFromConfig();

    config.runStatus = RUNSTATUS_INIT;
    init_web();
    xTaskCreate(initTime, "init time", 8000, NULL, 2, NULL);

#ifdef HAS_RGB_LED
    rgbIdle();
#endif

    // Load TagData parsers with basic error handling
    Serial.println("[MAIN] Loading TagData parsers...");
    TagData::loadParsers("/parsers.json");
    Serial.println("[MAIN] TagData parsers loading completed");

    if (!loadDB("/current/tagDB.json")) {
        Serial.println("unable to load tagDB, reverting to backup");
        loadDB("/current/tagDB.json.bak");
    } else {
        cleanupCurrent();
    }
    // Increased stack size for AP Task to prevent stack overflow
    xTaskCreate(APTask, "AP Process", 8000, NULL, 5, NULL);
    vTaskDelay(10 / portTICK_PERIOD_MS);

#ifdef HAS_BLE_WRITER
    if (config.ble) {
        // Increased stack size for BLE task due to large buffer usage
        xTaskCreate(BLETask, "BLE Writer", 16000, NULL, 5, NULL);
    }
#endif

#ifdef HAS_IR_REMOTE
    // Initialize IR interface
    if (irInterface.begin()) {
        Serial.println("✅ IR Remote interface started");
    } else {
        Serial.println("❌ Failed to start IR Remote interface");
    }
#endif

    // Temporarily disable RC522 until IR is working
    // #ifdef HAS_RC522
    //     // Initialize RC522 RFID interface
    //     if (rc522Interface.begin()) {
    //         Serial.println("✅ RC522 RFID interface started");
    //         rc522Interface.startMonitoring(); // Start automatic card detection
    //     } else {
    //         Serial.println("❌ Failed to start RC522 RFID interface");
    //     }
    // #endif

#ifdef HAS_USB
    // We'll need to start the 'usbflasher' task for boards with a second (USB) port. This can be used as a 'flasher' interface, using a python script on the host
    // Increased stack size for USB flasher task due to large buffer usage
    xTaskCreate(usbFlasherTask, "usbflasher", 12000, NULL, 5, NULL);
#else

#ifdef ETHERNET_CLK_MODE
    if (!(ETHERNET_CLK_MODE == ETH_CLOCK_GPIO0_IN || ETHERNET_CLK_MODE == ETH_CLOCK_GPIO0_OUT))
#endif
        pinMode(0, INPUT_PULLUP);

#endif

#ifdef HAS_EXT_FLASHER
    // Increased stack size for web flasher task due to buffer usage
    xTaskCreate(webFlasherTask, "webflasher", 10000, NULL, 3, NULL);
#endif

    esp_reset_reason_t resetReason = esp_reset_reason();
    if (resetReason == ESP_RST_PANIC) {
        Serial.println("Panic! Pausing content generation for 30 seconds");
        config.runStatus = RUNSTATUS_PAUSE;
    }

    xTaskCreate(delayedStart, "delaystart", 5000, NULL, 2, NULL);

    // Wait a bit before initializing serial command handler to ensure system is stable
    vTaskDelay(pdMS_TO_TICKS(500));

    // Initialize serial command handler
    SerialCommandHandler& serialCmdHandler = SerialCommandHandler::getInstance();
    serialCmdHandler.initialize();
    Serial.println("✅ Serial command handler initialized");

    wsSendSysteminfo();
    util::printHeap();
}

void loop() {
    // Feed the watchdog to prevent resets
    yield();

    // Check available heap memory and log warnings if low
    static unsigned long lastMemCheck = 0;
    if (millis() - lastMemCheck > 30000) {  // Check every 30 seconds
        size_t freeHeap = ESP.getFreeHeap();
        size_t minFreeHeap = ESP.getMinFreeHeap();
        if (freeHeap < 20000) {  // Warn if less than 20KB free
            LogUtils::logWarning("[WARNING] Low heap memory: " + String(freeHeap) + " bytes free, min was " + String(minFreeHeap));
        }
        lastMemCheck = millis();
    }

    ws.cleanupClients();
    wifiUtils.poll();

    // Process serial commands
    SerialCommandHandler& serialCmdHandler = SerialCommandHandler::getInstance();
    serialCmdHandler.processSerialInput();

    if (intervalSysinfo.doRun()) {
        wsSendSysteminfo();
    }
    if (intervalVars.doRun() && config.runStatus != RUNSTATUS_STOP) {
#ifndef USE_DUMMY_CONTENT_MANAGER
        checkVars();
#endif
    }
    if (intervalSaveDB.doRun() && config.runStatus != RUNSTATUS_STOP) {
        saveDB("/current/tagDB.json");
    }
    if (intervalContentRunner.doRun() && (apInfo.state == AP_STATE_ONLINE || apInfo.state == AP_STATE_NORADIO)) {
#ifndef USE_DUMMY_CONTENT_MANAGER
        contentRunner();
#endif
    }

#ifdef HAS_TFT
    extern void yellow_ap_display_loop(void);
    yellow_ap_display_loop();
#endif

    vTaskDelay(100 / portTICK_PERIOD_MS);
}
