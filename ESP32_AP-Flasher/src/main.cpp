
#include <Arduino.h>
#include <WiFi.h>
#include <time.h>
#ifdef ETHERNET_CLK_MODE
#include <ETH.h>
#endif

#include "contentmanager.h"
#include "flasher.h"
#include "serialap.h"
#include "settings.h"
#include "storage.h"
#include "system.h"
#include "tag_db.h"
#include "tagdata.h"
#include "wifi_module.h"    // migrated unified WiFi management
#include "improv_support.h" // serial Improv provisioning
#include "serial_cli.h"     // developer serial CLI
// forward poll for advanced WiFi LED (optional)
void wifi_led_poll();

#ifdef HAS_EXT_FLASHER
#include "webflasher.h"
#endif

#if defined HAS_USB || defined HAS_EXT_FLASHER
#include "usbflasher.h"
#endif

#include "language.h"
#include "leds.h"
#include "oepl_udp.h"
#include "util.h"
#include "web.h"
#include <ArduinoJson.h>
#ifdef HAS_BLE_WRITER
#include "ble_writer.h"
#endif

#ifdef HAS_IR_REMOTE
#include "ir_interface.h"
#endif

// Temporarily disable RC522 until IR is working
// #ifdef HAS_RC522
// #include "rc522_interface.h"
// #endif

util::Timer intervalContentRunner(seconds(1));
util::Timer intervalSysinfo(seconds(5));
util::Timer intervalVars(seconds(10));
util::Timer intervalSaveDB(minutes(5));

SET_LOOP_TASK_STACK_SIZE(16 * 1024);

// --- Startup modules gating (default: only Web, Serial and WiFi auto-start) ---
// These flags can be changed via /api/startup_modules and are persisted in
// /current/startup_modules.json. If the file is missing, defaults apply (all false).
bool gStart_APTask = false;
bool gStart_BLEWriter = false;
bool gStart_IRRemote = false;
bool gStart_USBFlasher = false;
bool gStart_WebFlasher = false;
bool gStart_UDP = false;
bool gStart_ContentRunner = false;

static void loadStartupModulesConfig()
{
    // Initialize defaults
    gStart_APTask = false;
    gStart_BLEWriter = false;
    gStart_IRRemote = false;
    gStart_USBFlasher = false;
    gStart_WebFlasher = false;
    gStart_UDP = false;
    gStart_ContentRunner = false;

    if (!contentFS)
        return;

    File r = contentFS->open("/current/startup_modules.json", "r");
    if (!r)
        return;
    JsonDocument doc;
    DeserializationError err = deserializeJson(doc, r);
    r.close();
    if (err)
        return;

    // Accept either {"modules": { name: bool, ... }} or legacy array of objects
    if (doc["modules"].is<JsonObject>())
    {
        JsonObject mods = doc["modules"].as<JsonObject>();
        if (mods["APTask"].is<bool>())
            gStart_APTask = mods["APTask"].as<bool>();
        if (mods["BLEWriter"].is<bool>())
            gStart_BLEWriter = mods["BLEWriter"].as<bool>();
        if (mods["IRRemote"].is<bool>())
            gStart_IRRemote = mods["IRRemote"].as<bool>();
        if (mods["USBFlasher"].is<bool>())
            gStart_USBFlasher = mods["USBFlasher"].as<bool>();
        if (mods["WebFlasher"].is<bool>())
            gStart_WebFlasher = mods["WebFlasher"].as<bool>();
        if (mods["UDP"].is<bool>())
            gStart_UDP = mods["UDP"].as<bool>();
        if (mods["ContentRunner"].is<bool>())
            gStart_ContentRunner = mods["ContentRunner"].as<bool>();
    }
    else if (doc["modules"].is<JsonArray>())
    {
        for (JsonObject m : doc["modules"].as<JsonArray>())
        {
            String name = m["name"].as<String>();
            bool autoStart = m["autoStart"].is<bool>() ? m["autoStart"].as<bool>() : false;
            if (name == "APTask")
                gStart_APTask = autoStart;
            else if (name == "BLEWriter")
                gStart_BLEWriter = autoStart;
            else if (name == "IRRemote")
                gStart_IRRemote = autoStart;
            else if (name == "USBFlasher")
                gStart_USBFlasher = autoStart;
            else if (name == "WebFlasher")
                gStart_WebFlasher = autoStart;
            else if (name == "UDP")
                gStart_UDP = autoStart;
            else if (name == "ContentRunner")
                gStart_ContentRunner = autoStart;
        }
    }
}

void delayedStart(void *parameter)
{
    // Changed: No longer auto-starts content generation
    // Content generation now requires manual start via web interface
    vTaskDelay(30000 / portTICK_PERIOD_MS);

    // Just log the availability without auto-starting
    if (config.runStatus != RUNSTATUS_RUN)
    {
        wsLog("Content generation ready - use manual start button");
    }

    vTaskDelay(10 / portTICK_PERIOD_MS);
    vTaskDelete(NULL);
}

void setup()
{
#ifdef UART_LOGGING_TX_ONLY_PIN
    Serial.begin(115200, SERIAL_8N1, -1, UART_LOGGING_TX_ONLY_PIN);
    gpio_set_drive_capability((gpio_num_t)FLASHER_AP_RXD, GPIO_DRIVE_CAP_0);
#else
    Serial.begin(115200);
#endif
#if ARDUINO_USB_CDC_ON_BOOT == 1
    Serial.setTxTimeoutMs(0); // workaround bug in USB CDC that slows down serial output when no usb connected
#endif
    // Boot diagnostic: easy-to-search fixed message to verify Serial output early in setup
    Serial.print(">\r\n");
    Serial.println("[BOOT-TEST] Serial initialized at 115200");
    Serial.println("[BOOT-TEST] If you don't see these messages, check baud port and TX pin settings");
    serial_cli_init();
    serial_cli_print_prompt();
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
    if (!psramInit())
    {
        Serial.printf("This build of the AP expects PSRAM, but we couldn't find/init any. Something is terribly wrong here! System halted.");
#ifdef HAS_RGB_LED
        showColorPattern(CRGB::Yellow, CRGB::Red, CRGB::Red);
#endif
        while (1)
        {
            vTaskDelay(1000 / portTICK_PERIOD_MS);
        }
    };
    heap_caps_malloc_extmem_enable(64);
#endif

    // NVS explicitly not used: partition table has no NVS and WiFi persistence is disabled

    Storage.begin();
    // Load startup modules configuration (gates which subsystems auto-start)
    loadStartupModulesConfig();

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

    // Ethernet init (if any) should be handled inside WiFiModule in future; placeholder removed
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

    if (!loadDB("/current/tagDB.json"))
    {
        Serial.println("unable to load tagDB, reverting to backup");
        if (!loadDB("/current/tagDB.json.bak"))
        {
            Serial.println("both tagDB and backup invalid — creating empty database");
            // Create an empty DB file to prevent repeated parse errors
            if (xSemaphoreTake(fsMutex, pdMS_TO_TICKS(5000)) == pdTRUE)
            {
                File db = contentFS->open("/current/tagDB.json", "w");
                if (db)
                {
                    db.print("[]");
                    db.close();
                    Serial.println("wrote new empty /current/tagDB.json");
                }
                xSemaphoreGive(fsMutex);
            }
            // No entries to clean, but run cleanup for consistency
            cleanupCurrent();
        }
        else
        {
            cleanupCurrent();
        }
    }
    else
    {
        cleanupCurrent();
    }
    // Start AP processing only if enabled via config
    if (gStart_APTask)
    {
        xTaskCreate(APTask, "AP Process", 6000, NULL, 5, NULL);
    }
    vTaskDelay(10 / portTICK_PERIOD_MS);

#ifdef HAS_BLE_WRITER
    if (gStart_BLEWriter && config.ble)
    {
        xTaskCreate(BLETask, "BLE Writer", 12000, NULL, 5, NULL);
    }
#endif

#ifdef HAS_IR_REMOTE
    // Initialize IR interface
    if (gStart_IRRemote)
    {
        if (irInterface.begin())
        {
            Serial.println("✅ IR Remote interface started");
        }
        else
        {
            Serial.println("❌ Failed to start IR Remote interface");
        }
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
    if (gStart_USBFlasher)
    {
        xTaskCreate(usbFlasherTask, "usbflasher", 10000, NULL, 5, NULL);
    }
#else

#ifdef ETHERNET_CLK_MODE
    if (!(ETHERNET_CLK_MODE == ETH_CLOCK_GPIO0_IN || ETHERNET_CLK_MODE == ETH_CLOCK_GPIO0_OUT))
#endif
        pinMode(0, INPUT_PULLUP);

#endif

#ifdef HAS_EXT_FLASHER
    if (gStart_WebFlasher)
    {
        xTaskCreate(webFlasherTask, "webflasher", 8000, NULL, 3, NULL);
    }
#endif

    esp_reset_reason_t resetReason = esp_reset_reason();
    if (resetReason == ESP_RST_PANIC)
    {
        Serial.println("Panic! Pausing content generation for 30 seconds");
        config.runStatus = RUNSTATUS_PAUSE;
    }

    xTaskCreate(delayedStart, "delaystart", 5000, NULL, 2, NULL);

    wsSendSysteminfo();
    util::printHeap();

#ifdef ENABLE_UDP_LOG_RECEIVER
    if (gStart_UDP)
    {
        extern void startUdpLogReceiver();
        startUdpLogReceiver();
    }
#endif

    // Defer UDP discovery init; will complete when WiFi is ready (gated by config)
    if (gStart_UDP)
    {
        extern void init_udp();
        init_udp();
    }

    // ---- Module System Initialization ----
    // Register WiFi module (and any future auto-start modules) then initialize/start them.
    // This was missing previously which prevented WiFi from starting.
    Serial.println("[BOOT] Registering core modules (WiFiModule)...");
    registerWiFiModule();

    // Load persisted module autoStart configuration (modules_config.json) if present
    if (!moduleManager.loadConfig())
    {
        Serial.println("[BOOT] No persisted module config found; applying defaults (WiFiModule autoStart=true)");
        // Provide a minimal default system config enabling WiFiModule
        moduleManager.setSystemConfig("{\"modules\":[{\"name\":\"WiFiModule\",\"autoStart\":true}]}");
    }

    // Initialize all registered modules
    if (!moduleManager.initializeAll())
    {
        Serial.println("[BOOT][ERROR] Module initialization failed; WiFi will not start.");
    }

    // Start auto-start modules (WiFiModule expected to start here)
    if (!moduleManager.startAll())
    {
        Serial.println("[BOOT][ERROR] Some auto-start modules failed to start.");
    }
    else
    {
        Serial.println("[BOOT] Auto-start modules started successfully.");
    }

    // Register web handlers for active modules (WiFi REST endpoints)
    extern AsyncWebServer server; // declared in web.cpp
    moduleManager.registerAllWebHandlers(server);
    Serial.println("[BOOT] Module web handlers registered.");
}

void loop()
{
    ws.cleanupClients();
    // Ensure web server starts only when TCP/IP stack is ready
    ensure_webserver_started();
    // Drive module periodic updates (WiFiModule etc.)
    moduleManager.updateAll();
    // Poll Improv serial provisioning protocol
    improv_poll();
    // Advanced WiFi LED animation phase updates (if enabled)
    wifi_led_poll();

    // Opportunistically attempt starting deferred UDP subsystems when WiFi becomes ready
    if (gStart_UDP)
    {
        extern UDPcomm udpsync;
        udpsync.init();
    }

    if (intervalSysinfo.doRun())
    {
        wsSendSysteminfo();
    }
    if (intervalVars.doRun() && config.runStatus != RUNSTATUS_STOP)
    {
        checkVars();
    }
    if (intervalSaveDB.doRun() && config.runStatus != RUNSTATUS_STOP)
    {
        saveDB("/current/tagDB.json");
    }
    if (gStart_ContentRunner && intervalContentRunner.doRun() && (apInfo.state == AP_STATE_ONLINE || apInfo.state == AP_STATE_NORADIO))
    {
        contentRunner();
    }

#ifdef HAS_TFT
    extern void yellow_ap_display_loop(void);
    yellow_ap_display_loop();
#endif

#ifdef ENABLE_UDP_LOG_RECEIVER
    extern void pollUdpLogReceiver();
    pollUdpLogReceiver();
#endif

    vTaskDelay(100 / portTICK_PERIOD_MS);
}
