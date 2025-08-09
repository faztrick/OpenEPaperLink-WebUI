
#include <Arduino.h>
#include <WiFi.h>
#include <nvs_flash.h>  // ESP32-S3 NVS initialization
#include <time.h>
#ifdef ETHERNET_CLK_MODE
#include <ETH.h>
#endif

#include "contentmanager.h"
#include "flasher.h"
#include "serial_commands.h"  // Include serial command handler
#include "serialap.h"
#include "settings.h"
#include "storage.h"
#include "storage_utils.cpp"  // Include new storage utilities
#include "system.h"
#include "tag_db.h"
#include "tagdata.h"
#include "wifi_utils.h"

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

SET_LOOP_TASK_STACK_SIZE(16 * 1024);

void delayedStart(void* parameter) {
    // Changed: No longer auto-starts content generation
    // Content generation now requires manual start via web interface
    vTaskDelay(30000 / portTICK_PERIOD_MS);

    // Just log the availability without auto-starting
    if (config.runStatus != RUNSTATUS_RUN) {
        wsLog("Content generation ready - use manual start button");
    }

    vTaskDelay(10 / portTICK_PERIOD_MS);
    vTaskDelete(NULL);
}

// Initialize the new storage system
void initializeStorageSystem() {
    StorageUtils& storage = StorageUtils::getInstance();

    // Enable debug logging during development
    storage.enableDebugLogging(true);

    // Initialize boot count tracking
    int bootCount = STORAGE_GET_INT("system", "bootCount", 0);
    STORAGE_SET_INT("system", "bootCount", bootCount + 1);

    // Set device info if not already set
    if (STORAGE_GET_STRING("system", "deviceName", "").isEmpty()) {
        STORAGE_SET_STRING("system", "deviceName", "ESP32-AP-Flasher");
        STORAGE_SET_STRING("system", "version", "2.0.0");
        STORAGE_SET_BOOL("system", "firstBoot", true);
        Serial.println("[STORAGE] First boot detected, initializing default settings");
    }

    // Print storage health
    storage.printStorageInfo();

    Serial.printf("[STORAGE] Storage system initialized - Boot count: %d\n", bootCount + 1);
}

void setup() {
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
#ifdef HAS_TFT
    extern void yellow_ap_display_init(void);
    yellow_ap_display_init();
#endif

    xTaskCreate(ledTask, "ledhandler", 2000, NULL, 2, NULL);
    vTaskDelay(10 / portTICK_PERIOD_MS);

#if defined(OPENEPAPERLINK_MINI_AP_PCB) || defined(OPENEPAPERLINK_NANO_AP_PCB)
    APEnterEarlyReset();
    // this allows us to view the booting process. After the device showing up, you have 3 seconds to open a terminal on the COM port
    vTaskDelay(3000 / portTICK_PERIOD_MS);
#ifdef DEBUG_VERSION
    // Specifically for the Mini-version (using an ESP32-S2), use another serial port for debug output. Makes it possible to see core dumps
    Serial0.begin(115200, SERIAL_8N1, 38, 37);
    Serial0.printf("Started debug output...\r\n");
    Serial0.setDebugOutput(true);
#endif
#endif

#ifdef BOARD_HAS_PSRAM
    if (!psramInit()) {
        Serial.printf("This build of the AP expects PSRAM, but we couldn't find/init any. Something is terribly wrong here! System halted.");
#ifdef HAS_RGB_LED
        showColorPattern(CRGB::Yellow, CRGB::Red, CRGB::Red);
#endif
        while (1) {
            vTaskDelay(1000 / portTICK_PERIOD_MS);
        }
    };
    heap_caps_malloc_extmem_enable(64);
#endif

    // Initialize NVS for ESP32-S3 compatibility
    esp_err_t ret = nvs_flash_init();
    if (ret == ESP_ERR_NVS_NO_FREE_PAGES || ret == ESP_ERR_NVS_NEW_VERSION_FOUND) {
        Serial.println("NVS partition was truncated or found a newer version, erasing...");
        ESP_ERROR_CHECK(nvs_flash_erase());
        ret = nvs_flash_init();
    }
    if (ret == ESP_OK) {
        Serial.println("✅ NVS Flash initialized successfully");
    } else {
        Serial.printf("❌ NVS Flash initialization failed: %s\n", esp_err_to_name(ret));
    }

    // Initialize new centralized storage system
    initializeStorageSystem();

    Storage.begin();

    /*
    Serial.println("\n\n##################################");
    Serial.printf("Internal Total heap %d, internal Free Heap %d\n", ESP.getHeapSize(), ESP.getFreeHeap());
    Serial.printf("SPIRam Total heap %d, SPIRam Free Heap %d\n", ESP.getPsramSize(), ESP.getFreePsram());
    Serial.printf("ChipRevision %d, Cpu Freq %d, SDK Version %s\n", ESP.getChipRevision(), ESP.getCpuFreqMHz(), ESP.getSdkVersion());
    Serial.printf("Flash Size %d, Flash Speed %d\n", ESP.getFlashChipSize(), ESP.getFlashChipSpeed());
    Serial.println("##################################\n\n");

    Serial.printf("Total heap: %d\n", ESP.getHeapSize());
    Serial.printf("Free heap: %d\n", ESP.getFreeHeap());
    Serial.printf("Total PSRAM: %d\n", ESP.getPsramSize());
    Serial.printf("Free PSRAM: %d\n\n", ESP.getFreePsram());

    Serial.printf("ESP32 Partition table:\n");
    Serial.printf("| Type | Sub |  Offset  |   Size   |       Label      |\n");
    Serial.printf("| ---- | --- | -------- | -------- | ---------------- |\n");
    esp_partition_iterator_t pi = esp_partition_find(ESP_PARTITION_TYPE_ANY, ESP_PARTITION_SUBTYPE_ANY, NULL);
    if (pi != NULL) {
        do {
            const esp_partition_t* p = esp_partition_get(pi);
            Serial.printf("|  %02x  | %02x  | 0x%06X | 0x%06X | %-16s |\r\n",
                          p->type, p->subtype, p->address, p->size, p->label);
        } while (pi = (esp_partition_next(pi)));
    }
    */

    wifiUtils.initEth();
    initAPconfig();

    updateLanguageFromConfig();
    updateBrightnessFromConfig();

    config.runStatus = RUNSTATUS_INIT;
    init_web();
    xTaskCreate(initTime, "init time", 5000, NULL, 2, NULL);

#ifdef HAS_RGB_LED
    rgbIdle();
#endif

#ifndef SAVE_SPACE
    TagData::loadParsers("/parsers.json");
#endif

    if (!loadDB("/current/tagDB.json")) {
        Serial.println("unable to load tagDB, reverting to backup");
        loadDB("/current/tagDB.json.bak");
    } else {
        cleanupCurrent();
    }
    xTaskCreate(APTask, "AP Process", 6000, NULL, 5, NULL);
    vTaskDelay(10 / portTICK_PERIOD_MS);

#ifdef HAS_BLE_WRITER
    if (config.ble) {
        xTaskCreate(BLETask, "BLE Writer", 12000, NULL, 5, NULL);
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
    xTaskCreate(usbFlasherTask, "usbflasher", 10000, NULL, 5, NULL);
#else

#ifdef ETHERNET_CLK_MODE
    if (!(ETHERNET_CLK_MODE == ETH_CLOCK_GPIO0_IN || ETHERNET_CLK_MODE == ETH_CLOCK_GPIO0_OUT))
#endif
        pinMode(0, INPUT_PULLUP);

#endif

#ifdef HAS_EXT_FLASHER
    xTaskCreate(webFlasherTask, "webflasher", 8000, NULL, 3, NULL);
#endif

    esp_reset_reason_t resetReason = esp_reset_reason();
    if (resetReason == ESP_RST_PANIC) {
        Serial.println("Panic! Pausing content generation for 30 seconds");
        config.runStatus = RUNSTATUS_PAUSE;
    }

    xTaskCreate(delayedStart, "delaystart", 5000, NULL, 2, NULL);

    // Initialize serial command handler
    SerialCommandHandler& serialCmdHandler = SerialCommandHandler::getInstance();
    serialCmdHandler.initialize();
    Serial.println("✅ Serial command handler initialized");

    wsSendSysteminfo();
    util::printHeap();
}

void loop() {
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
