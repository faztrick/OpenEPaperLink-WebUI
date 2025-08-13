#include "serialap.h"

#include <Arduino.h>
#include <HardwareSerial.h>
#include <system.h>

#include "commstructs.h"
#include "contentmanager.h"
#include "flasher.h"
#include "leds.h"
#include "newproto.h"
#include "powermgt.h"
#include "settings.h"
#include "storage.h"
#include "web.h"
#include "wifi_utils.h"
#include "zbs_interface.h"

#define LOG(format, ...) printf(format, ##__VA_ARGS__)

// Constants for better maintainability and performance
static const uint32_t AP_ACTIVITY_MAX_INTERVAL = 30 * 1000;
static const uint32_t CMD_REPLY_TIMEOUT_MS = 200;
static const uint32_t AP_BOOT_TIMEOUT_MS = 10 * 1000;
static const uint32_t AP_PING_RETRY_DELAY_MS = 300;
static const uint32_t AP_RESET_DELAY_MS = 50;
static const uint32_t AP_POWER_CYCLE_DELAY_MS = 300;
static const uint32_t AP_STABILIZE_DELAY_MS = 100;
static const uint32_t TASK_DELAY_MS = 1;
static const uint32_t TASK_CREATION_DELAY_MS = 500;
static const uint32_t TX_BUSY_WAIT_MS = 10;
static const uint32_t MAX_TX_WAIT_CYCLES = 1000;  // Prevent infinite waiting
static const uint8_t MAX_CMD_RETRIES = 5;
static const uint8_t MAX_PING_RETRIES = 3;
static const uint8_t MAX_RECOVERY_ATTEMPTS = 5;
static const size_t CMD_BUFFER_SIZE = 4;
static const size_t RX_STRING_BUFFER_SIZE = 100;
static const size_t DUMMY_BUFFER_SIZE = 32;
static const uint32_t SERIAL_FLOOD_THRESHOLD = 6000;  // chars per second
static const uint32_t MODEM_RESET_HOLDOFF_MS = 20000;

// Additional missing constants for AP operations
static const uint32_t AP_POWER_OFF_DELAY_MS = 300;
static const uint32_t AP_POWER_ON_DELAY_MS = 300;
static const uint32_t AP_RESET_RELEASE_DELAY_MS = 100;
static const uint32_t SEGMENTED_NOTIFICATION_DELAY = 1000;
static const uint32_t POWER_CYCLE_WAIT_INTERVAL = 5000;
static const size_t IP_DISPLAY_BUFFER_SIZE = 32;
static const uint8_t AP_STATE_MAX = 10;  // Maximum valid AP state value

// Command buffer sizes for different packet types
static const size_t BLOCK_REQUEST_SIZE = sizeof(struct espBlockRequest) + 8;
static const size_t AVAIL_DATA_REQ_SIZE = sizeof(struct espAvailDataReq) + 8;
static const size_t XFER_COMPLETE_SIZE = sizeof(struct espXferComplete) + 8;
static const size_t LOCAL_TAG_RETURN_DATA_SIZE = sizeof(struct espTagReturnData) + 8;

QueueHandle_t rxCmdQueue;
SemaphoreHandle_t txActive;

// If a command is sent, it will wait for a reply here
#define CMD_REPLY_WAIT 0x00
#define CMD_REPLY_ACK 0x01
#define CMD_REPLY_NOK 0x02
#define CMD_REPLY_NOQ 0x03
volatile uint8_t cmdReplyValue = CMD_REPLY_WAIT;

#define AP_SERIAL_PORT Serial1
#ifndef FLASHER_DEBUG_SHARED
volatile bool rxSerialStopTask2 = false;
#endif

uint8_t channelList[6];
struct espSetChannelPower curChannel = {0, 11, 10};

#define RX_CMD_RQB 0x01
#define RX_CMD_ADR 0x02
#define RX_CMD_XFC 0x03
#define RX_CMD_XTO 0x04
#define RX_CMD_RDY 0x05
#define RX_CMD_RSET 0x06
#define RX_CMD_TRD 0x07

#define AP_ACTIVITY_MAX_INTERVAL 30 * 1000
volatile uint32_t lastAPActivity = 0;
struct APInfoS apInfo;

volatile ApSerialState gSerialTaskState;

struct rxCmd {
    uint8_t* data;
    uint8_t len;
    uint8_t type;
};

#define ZBS_RX_WAIT_HEADER 0
#define ZBS_RX_WAIT_PKT_LEN 1
#define ZBS_RX_WAIT_PKT_RX 2
#define ZBS_RX_WAIT_SEP1 3
#define ZBS_RX_WAIT_SEP2 4
#define ZBS_RX_WAIT_VER 6
#define ZBS_RX_BLOCK_REQUEST 7
#define ZBS_RX_WAIT_XFERCOMPLETE 8
#define ZBS_RX_WAIT_DATA_REQ 9
#define ZBS_RX_WAIT_JOINNETWORK 10
#define ZBS_RX_WAIT_XFERTIMEOUT 11
#define ZBS_RX_WAIT_MAC 12
#define ZBS_RX_WAIT_CHANNEL 13
#define ZBS_RX_WAIT_POWER 14
#define ZBS_RX_WAIT_PENDING 15
#define ZBS_RX_WAIT_NOP 16
#define ZBS_RX_WAIT_TYPE 17
#define ZBS_RX_WAIT_TAG_RETURN_DATA 18
#define ZBS_RX_WAIT_SUBCHANNEL 19

bool txStart() {
    uint32_t attempts = 0;
    const TickType_t maxWaitTicks = pdMS_TO_TICKS(TX_BUSY_WAIT_MS);

    while (attempts < MAX_TX_WAIT_CYCLES) {
        if (xPortInIsrContext()) {
            if (xSemaphoreTakeFromISR(txActive, NULL) == pdTRUE) return true;
        } else {
            if (xSemaphoreTake(txActive, maxWaitTicks) == pdTRUE) return true;
        }

        attempts++;
        if (attempts % 10 == 0) {
            LOG("TX busy, attempt %lu/%d\n", attempts, MAX_TX_WAIT_CYCLES);
        }

        // Allow other tasks to run
        if (!xPortInIsrContext()) {
            vTaskDelay(pdMS_TO_TICKS(TASK_DELAY_MS));
        }
    }

    LOG("TX timeout after %d attempts\n", MAX_TX_WAIT_CYCLES);
    return false;
}

void txEnd() {
    if (xPortInIsrContext()) {
        BaseType_t xHigherPriorityTaskWoken = pdFALSE;
        xSemaphoreGiveFromISR(txActive, &xHigherPriorityTaskWoken);
        portYIELD_FROM_ISR(xHigherPriorityTaskWoken);
    } else {
        xSemaphoreGive(txActive);
    }
}
bool waitCmdReply() {
    const uint32_t startTime = millis();
    const TickType_t taskDelay = pdMS_TO_TICKS(TASK_DELAY_MS);

    while ((millis() - startTime) < CMD_REPLY_TIMEOUT_MS) {
        switch (cmdReplyValue) {
            case CMD_REPLY_WAIT:
                break;
            case CMD_REPLY_ACK:
                lastAPActivity = millis();
                if (apInfo.isOnline == false) {
                    setAPstate(true, AP_STATE_ONLINE);
                }
                return true;
            case CMD_REPLY_NOK:
            case CMD_REPLY_NOQ:
                lastAPActivity = millis();
                return false;
            default:
                LOG("Unexpected reply value: %d\n", cmdReplyValue);
                return false;
        }

        // Allow other tasks to run and prevent watchdog timeout
        vTaskDelay(taskDelay);
    }

    LOG("Command reply timeout after %dms\n", CMD_REPLY_TIMEOUT_MS);
    return false;
}

#if (AP_PROCESS_PORT == FLASHER_AP_PORT)
int8_t APpowerPins[] = FLASHER_AP_POWER;
#define AP_RESET_PIN FLASHER_AP_RESET
#define AP_POWER_PIN FLASHER_AP_POWER
#endif
#ifdef HAS_EXT_FLASHER
#if (AP_PROCESS_PORT == FLASHER_EXT_PORT)
int8_t APpowerPins[] = FLASHER_EXT_POWER;
#define AP_RESET_PIN FLASHER_EXT_RESET
#define AP_POWER_PIN FLASHER_EXT_POWER
#endif
#if (AP_PROCESS_PORT == FLASHER_ALTRADIO_PORT)
int8_t APpowerPins[] = FLASHER_ALT_POWER;
#define AP_RESET_PIN FLASHER_ALT_RESET
#define AP_POWER_PIN FLASHER_ALT_POWER
#endif
#endif

void APEnterEarlyReset() {
    if (AP_RESET_PIN < 0) {
        LOG("AP reset pin not configured\n");
        return;
    }

    pinMode(AP_RESET_PIN, OUTPUT);
    digitalWrite(AP_RESET_PIN, LOW);
    LOG("AP early reset triggered\n");
}

void setAPstate(bool isOnline, uint8_t state) {
    // Validate state parameter
    if (state > AP_STATE_MAX) {
        LOG("Invalid AP state: %d\n", state);
        state = AP_STATE_OFFLINE;
    }

    apInfo.isOnline = isOnline;
    apInfo.state = state;

#ifdef HAS_RGB_LED
    static const CRGB colorMap[] = {
        CRGB::Orange,       // AP_STATE_OFFLINE
        CRGB::Green,        // AP_STATE_ONLINE
        CRGB::Blue,         // AP_STATE_WAIT_RESET
        CRGB::Yellow,       // AP_STATE_FLASHING
        CRGB::Aqua,         // AP_STATE_REQUIRED_POWER_CYCLE
        CRGB::Red,          // AP_STATE_FAILED
        CRGB::YellowGreen,  // AP_STATE_NORADIO
        CRGB::Purple        // Additional state
    };

    const size_t colorMapSize = sizeof(colorMap) / sizeof(colorMap[0]);
    rgbIdleColor = colorMap[state < colorMapSize ? state : 0];

#ifdef BLE_ONLY
    rgbIdleColor = CRGB::Green;
#endif

    rgbIdlePeriod = (isOnline ? 767 : 255);
    if (isOnline) rgbIdle();
#endif

#ifdef FLASHER_DEBUG_SHARED
    // Flasher shares port with AP comms
    if (state == AP_STATE_FLASHING) {
        LOG("Shared COM port, gSerialTaskState %d\n", gSerialTaskState);
        gSerialTaskState = SERIAL_STATE_STOP;

        // Wait for serial task to stop with timeout
        for (int i = 0; i < SERIAL_STOP_TIMEOUT_MS; i++) {
            vTaskDelay(pdMS_TO_TICKS(1));
            if (gSerialTaskState == SERIAL_STATE_STOPPED) {
                gSerialTaskState = SERIAL_STATE_NONE;
                break;
            }
        }
        LOG("gSerialTaskState %d\n", gSerialTaskState);
    }
#endif

    wsSendSysteminfo();
}

// Reset the tag
void APTagReset() {
    LOG("Resetting tag\n");

    // Validate power pin configuration
    uint8_t powerPins = sizeof(APpowerPins);
    if (powerPins > 0 && APpowerPins[0] == -1) {
        powerPins = 0;
    }

#ifdef FLASHER_DEBUG_PROG
    pinMode(FLASHER_DEBUG_PROG, OUTPUT);
    digitalWrite(FLASHER_DEBUG_PROG, HIGH);
#endif

    // Validate reset pin
    if (AP_RESET_PIN < 0) {
        LOG("AP reset pin not configured\n");
        return;
    }

    // Perform reset sequence with proper timing
    pinMode(AP_RESET_PIN, OUTPUT);
    digitalWrite(AP_RESET_PIN, LOW);
    vTaskDelay(pdMS_TO_TICKS(AP_RESET_DELAY_MS));

    powerControl(false, (uint8_t*)APpowerPins, powerPins);
    vTaskDelay(pdMS_TO_TICKS(AP_POWER_OFF_DELAY_MS));

    powerControl(true, (uint8_t*)APpowerPins, powerPins);
    vTaskDelay(pdMS_TO_TICKS(AP_POWER_ON_DELAY_MS));

    digitalWrite(AP_RESET_PIN, HIGH);
    vTaskDelay(pdMS_TO_TICKS(AP_RESET_RELEASE_DELAY_MS));

    LOG("AP tag reset completed\n");
}

// Send data to the AP
uint16_t sendBlock(const void* data, const uint16_t len) {
    const uint32_t timeCanary = millis();

    // Early exit conditions
    if (apInfo.state == AP_STATE_NORADIO) return true;
    if (!apInfo.isOnline) return false;
    if (data == nullptr || len == 0) {
        LOG("Invalid data or length in sendBlock\n");
        return 0;
    }

    if (!txStart()) {
        LOG("Failed to acquire TX semaphore\n");
        return 0;
    }

    // Try sending the block command
    cmdReplyValue = CMD_REPLY_WAIT;
    AP_SERIAL_PORT.print(">D>");
    if (!waitCmdReply()) {
        LOG("Failed to get block send acknowledgment\n");
        txEnd();
        return 0;
    }

    // Prepare block data
    uint8_t blockbuffer[sizeof(struct blockData)];
    struct blockData* bd = (struct blockData*)blockbuffer;
    bd->size = len;
    bd->checksum = 0;

    // Calculate checksum
    const uint8_t* dataBytes = reinterpret_cast<const uint8_t*>(data);
    for (uint16_t c = 0; c < len; c++) {
        bd->checksum += dataBytes[c];
    }

    // Send blockData header with safer memory handling
    const size_t bufferSize = sizeof(struct blockData);
    uint8_t* modifiedHeader = static_cast<uint8_t*>(malloc(bufferSize));
    if (modifiedHeader == nullptr) {
        LOG("Failed to allocate header buffer\n");
        txEnd();
        return 0;
    }

    const uint8_t* headerBytes = reinterpret_cast<const uint8_t*>(&blockbuffer);
    for (size_t i = 0; i < bufferSize; i++) {
        modifiedHeader[i] = 0xAA ^ headerBytes[i];
    }
    AP_SERIAL_PORT.write(modifiedHeader, bufferSize);
    free(modifiedHeader);

    // Send data block with safer memory handling
    uint8_t* modifiedBuffer = static_cast<uint8_t*>(malloc(len));
    if (modifiedBuffer == nullptr) {
        LOG("Failed to allocate data buffer\n");
        txEnd();
        return 0;
    }

    for (uint16_t c = 0; c < len; c++) {
        modifiedBuffer[c] = 0xAA ^ dataBytes[c];
    }
    AP_SERIAL_PORT.write(modifiedBuffer, len);
    free(modifiedBuffer);

    // Fill remaining block space
    const size_t remainingBytes = BLOCK_DATA_SIZE - len;
    if (remainingBytes > 0) {
        uint8_t* fillBuffer = static_cast<uint8_t*>(malloc(remainingBytes));
        if (fillBuffer != nullptr) {
            memset(fillBuffer, 0x55, remainingBytes);
            AP_SERIAL_PORT.write(fillBuffer, remainingBytes);
            free(fillBuffer);
        } else {
            // Fallback: send bytes individually if allocation fails
            for (size_t i = 0; i < remainingBytes; i++) {
                AP_SERIAL_PORT.write(0x55);
            }
        }
    }

    // Send dummy bytes
    uint8_t dummyBuffer[DUMMY_BUFFER_SIZE];
    memset(dummyBuffer, 0xF5, DUMMY_BUFFER_SIZE);
    AP_SERIAL_PORT.write(dummyBuffer, DUMMY_BUFFER_SIZE);

    // Delay only for non-C6 types
    if (apInfo.type != ESP32_C6) {
        vTaskDelay(pdMS_TO_TICKS(10));
    }

    txEnd();

    const uint32_t elapsed = millis() - timeCanary;
    LOG("Sendblock complete, %lums\n", elapsed);
    return bd->checksum;
}

bool sendDataAvail(struct pendingData* pending) {
    if (apInfo.state == AP_STATE_NORADIO) return true;
    if (!apInfo.isOnline || pending == nullptr) return false;
    if (!txStart()) return false;

    addCRC(pending, sizeof(struct pendingData));

    for (uint8_t attempt = 0; attempt < MAX_CMD_RETRIES; attempt++) {
        cmdReplyValue = CMD_REPLY_WAIT;
        AP_SERIAL_PORT.print("SDA>");
        for (uint8_t c = 0; c < sizeof(struct pendingData); c++) {
            AP_SERIAL_PORT.write(((uint8_t*)pending)[c]);
        }
        if (waitCmdReply()) {
            txEnd();
            return true;
        }
        LOG("SDA send failed in attempt %d/%d\n", attempt + 1, MAX_CMD_RETRIES);
        vTaskDelay(pdMS_TO_TICKS(200));
    }
    LOG("SDA failed to send after %d attempts\n", MAX_CMD_RETRIES);
    txEnd();
    return false;
}

bool sendCancelPending(struct pendingData* pending) {
    if (apInfo.state == AP_STATE_NORADIO) return true;
    if (!apInfo.isOnline || pending == nullptr) return false;
    if (!txStart()) return false;

    addCRC(pending, sizeof(struct pendingData));

    for (uint8_t attempt = 0; attempt < MAX_CMD_RETRIES; attempt++) {
        cmdReplyValue = CMD_REPLY_WAIT;
        AP_SERIAL_PORT.print("CXD>");
        for (uint8_t c = 0; c < sizeof(struct pendingData); c++) {
            AP_SERIAL_PORT.write(((uint8_t*)pending)[c]);
        }
        if (waitCmdReply()) {
            txEnd();
            return true;
        }
        LOG("CXD send failed in attempt %d/%d\n", attempt + 1, MAX_CMD_RETRIES);
        vTaskDelay(pdMS_TO_TICKS(200));
    }
    LOG("CXD failed to send after %d attempts\n", MAX_CMD_RETRIES);
    txEnd();
    return false;
}

bool sendChannelPower(struct espSetChannelPower* scp) {
    if (apInfo.state == AP_STATE_NORADIO) return true;
    if ((apInfo.state != AP_STATE_ONLINE) && (apInfo.state != AP_STATE_COMING_ONLINE)) return false;
    if (scp == nullptr) return false;
    if (!txStart()) return false;

    addCRC(scp, sizeof(struct espSetChannelPower));

    for (uint8_t attempt = 0; attempt < MAX_CMD_RETRIES; attempt++) {
        cmdReplyValue = CMD_REPLY_WAIT;
        AP_SERIAL_PORT.print("SCP>");
        for (uint8_t c = 0; c < sizeof(struct espSetChannelPower); c++) {
            AP_SERIAL_PORT.write(((uint8_t*)scp)[c]);
        }
        if (waitCmdReply()) {
            txEnd();
            apInfo.channel = scp->channel;
            apInfo.power = scp->power;
            return true;
        }
        LOG("SCP send failed in attempt %d/%d\n", attempt + 1, MAX_CMD_RETRIES);
        vTaskDelay(pdMS_TO_TICKS(200));
    }
    LOG("SCP failed to send after %d attempts\n", MAX_CMD_RETRIES);
    txEnd();
    return false;
}
bool sendPing() {
    if (apInfo.state == AP_STATE_NORADIO) return true;
    if (apInfo.state == AP_STATE_FLASHING) return false;

    const uint32_t startTime = millis();
    LOG("ping");

    if (!txStart()) return false;

    for (uint8_t attempt = 0; attempt < MAX_PING_RETRIES; attempt++) {
        cmdReplyValue = CMD_REPLY_WAIT;
        AP_SERIAL_PORT.print("RDY?");
        if (waitCmdReply()) {
            txEnd();
            const uint32_t elapsed = millis() - startTime;
            LOG(" ok, %lums\n", elapsed);
            return true;
        }
        if (attempt < MAX_PING_RETRIES - 1) {
            vTaskDelay(pdMS_TO_TICKS(50));  // Brief delay between attempts
        }
    }

    txEnd();
    LOG(" failed after %d attempts\n", MAX_PING_RETRIES);
    return false;
}

bool sendGetInfo() {
    if (apInfo.state == AP_STATE_NORADIO) return true;
    if (!txStart()) return false;

    for (uint8_t attempt = 0; attempt < MAX_CMD_RETRIES; attempt++) {
        cmdReplyValue = CMD_REPLY_WAIT;
        AP_SERIAL_PORT.print("NFO?");
        if (waitCmdReply()) {
            txEnd();
            return true;
        }
        if (attempt < MAX_CMD_RETRIES - 1) {
            vTaskDelay(pdMS_TO_TICKS(100));  // Delay between attempts
        }
    }

    LOG("Failed to get AP info after %d attempts\n", MAX_CMD_RETRIES);
    txEnd();
    return false;
}

bool sendHighspeed() {
    if (apInfo.state == AP_STATE_NORADIO) return true;
    if (!txStart()) return false;

    for (uint8_t attempt = 0; attempt < MAX_CMD_RETRIES; attempt++) {
        cmdReplyValue = CMD_REPLY_WAIT;
        AP_SERIAL_PORT.print("HSPD");
        if (waitCmdReply()) {
            txEnd();
            return true;
        }
        if (attempt < MAX_CMD_RETRIES - 1) {
            vTaskDelay(pdMS_TO_TICKS(100));  // Delay between attempts
        }
    }

    LOG("Failed to set high speed after %d attempts\n", MAX_CMD_RETRIES);
    txEnd();
    return false;
}

// add RX'd request from the AP to the processor queue
void addRXQueue(uint8_t* data, uint8_t len, uint8_t type) {
    struct rxCmd* rxcmd = nullptr;

    // Allocate memory for the command structure
    rxcmd = static_cast<struct rxCmd*>(malloc(sizeof(struct rxCmd)));
    if (rxcmd == nullptr) {
        LOG("Failed to allocate memory for rxCmd\n");
        if (data) free(data);
        return;
    }

    rxcmd->data = data;
    rxcmd->len = len;
    rxcmd->type = type;

    BaseType_t queuestatus = xQueueSend(rxCmdQueue, &rxcmd, 0);
    if (queuestatus != pdTRUE) {
        LOG("RX queue full, dropping command type %d\n", type);
        if (data) free(data);
        free(rxcmd);
    }
}

// Asynchronous command processor
void rxCmdProcessor(void* parameter) {
    // Create queue and semaphore
    rxCmdQueue = xQueueCreate(30, sizeof(struct rxCmd*));
    if (rxCmdQueue == nullptr) {
        LOG("Failed to create RX command queue\n");
        vTaskDelete(NULL);
        return;
    }

    txActive = xSemaphoreCreateBinary();
    if (txActive == nullptr) {
        LOG("Failed to create TX semaphore\n");
        vQueueDelete(rxCmdQueue);
        vTaskDelete(NULL);
        return;
    }

    xSemaphoreGive(txActive);

    LOG("RX command processor started\n");

    while (1) {
        if (apInfo.isOnline) {
            struct rxCmd* rxcmd = nullptr;
            BaseType_t queueResult = xQueueReceive(rxCmdQueue, &rxcmd, pdMS_TO_TICKS(10));

            if (queueResult == pdTRUE && rxcmd != nullptr) {
                switch (rxcmd->type) {
                    case RX_CMD_RQB:
                        if (rxcmd->data) {
                            processBlockRequest((struct espBlockRequest*)rxcmd->data);
                            quickBlink(3);
                        }
                        break;
                    case RX_CMD_ADR:
                        if (rxcmd->data) {
                            processDataReq((struct espAvailDataReq*)rxcmd->data, true);
                            quickBlink(1);
                        }
                        break;
                    case RX_CMD_XFC:
                        if (rxcmd->data) {
                            processXferComplete((struct espXferComplete*)rxcmd->data, true);
                        }
                        break;
                    case RX_CMD_XTO:
                        if (rxcmd->data) {
                            processXferTimeout((struct espXferComplete*)rxcmd->data, true);
                        }
                        break;
                    case RX_CMD_RSET:
                        LOG("AP did reset, resending pending\n");
                        refreshAllPending();
                        sendChannelPower(&curChannel);
                        break;
                    case RX_CMD_TRD:
                        if (rxcmd->data) {
                            processTagReturnData((struct espTagReturnData*)rxcmd->data, rxcmd->len, true);
                        }
                        break;
                    default:
                        LOG("Unknown RX command type: %d\n", rxcmd->type);
                        break;
                }

                // Clean up resources
                if (rxcmd->data) {
                    free(rxcmd->data);
                    rxcmd->data = nullptr;
                }
                free(rxcmd);
            }
        }

        // Allow other tasks to run
        vTaskDelay(pdMS_TO_TICKS(TASK_DELAY_MS));
    }
}
void rxSerialTask(void* parameter) {
    static char cmdbuffer[CMD_BUFFER_SIZE] = {0};
    static uint8_t* packetp = nullptr;
    static uint8_t pktindex = 0;
    static uint8_t RXState = ZBS_RX_WAIT_HEADER;
    static char lastchar = 0;
    static uint8_t charindex = 0;

    gSerialTaskState = SERIAL_STATE_RUNNING;
    LOG("rxSerialTask starting\n");

    while (gSerialTaskState == SERIAL_STATE_RUNNING) {
        while (AP_SERIAL_PORT.available()) {
            lastchar = AP_SERIAL_PORT.read();

            switch (RXState) {
                case ZBS_RX_WAIT_HEADER:
                    // Shift characters in
                    for (uint8_t c = 0; c < CMD_BUFFER_SIZE - 1; c++) {
                        cmdbuffer[c] = cmdbuffer[c + 1];
                    }
                    cmdbuffer[CMD_BUFFER_SIZE - 1] = lastchar;

                    // Check for acknowledgment responses
                    if (strncmp(cmdbuffer, "ACK>", 4) == 0)
                        cmdReplyValue = CMD_REPLY_ACK;
                    else if (strncmp(cmdbuffer, "NOK>", 4) == 0)
                        cmdReplyValue = CMD_REPLY_NOK;
                    else if (strncmp(cmdbuffer, "NOQ>", 4) == 0)
                        cmdReplyValue = CMD_REPLY_NOQ;

                    // Handle various command headers
                    else if (strncmp(cmdbuffer, "VER>", 4) == 0) {
                        pktindex = 0;
                        RXState = ZBS_RX_WAIT_VER;
                        charindex = 0;
                        memset(cmdbuffer, 0x00, CMD_BUFFER_SIZE);
                    } else if (strncmp(cmdbuffer, "MAC>", 4) == 0) {
                        RXState = ZBS_RX_WAIT_MAC;
                        charindex = 0;
                        memset(cmdbuffer, 0x00, CMD_BUFFER_SIZE);
                    } else if (strncmp(cmdbuffer, "ZCH>", 4) == 0) {
                        RXState = ZBS_RX_WAIT_CHANNEL;
                        charindex = 0;
                        memset(cmdbuffer, 0x00, CMD_BUFFER_SIZE);
                    }
#ifdef HAS_SUBGHZ
                    else if (strncmp(cmdbuffer, "SCH>", 4) == 0) {
                        RXState = ZBS_RX_WAIT_SUBCHANNEL;
                        charindex = 0;
                        memset(cmdbuffer, 0x00, CMD_BUFFER_SIZE);
                    }
#endif
                    else if (strncmp(cmdbuffer, "ZPW>", 4) == 0) {
                        RXState = ZBS_RX_WAIT_POWER;
                        charindex = 0;
                        memset(cmdbuffer, 0x00, CMD_BUFFER_SIZE);
                    } else if (strncmp(cmdbuffer, "PEN>", 4) == 0) {
                        RXState = ZBS_RX_WAIT_PENDING;
                        charindex = 0;
                        memset(cmdbuffer, 0x00, CMD_BUFFER_SIZE);
                    } else if (strncmp(cmdbuffer, "NOP>", 4) == 0) {
                        RXState = ZBS_RX_WAIT_NOP;
                        charindex = 0;
                        memset(cmdbuffer, 0x00, CMD_BUFFER_SIZE);
                    } else if (strncmp(cmdbuffer, "TYP>", 4) == 0) {
                        RXState = ZBS_RX_WAIT_TYPE;
                        charindex = 0;
                        memset(cmdbuffer, 0x00, CMD_BUFFER_SIZE);
                    } else if (strncmp(cmdbuffer, "RES>", 4) == 0) {
                        addRXQueue(nullptr, 0, RX_CMD_RSET);
                    } else if (strncmp(cmdbuffer, "RQB>", 4) == 0) {
                        RXState = ZBS_RX_BLOCK_REQUEST;
                        charindex = 0;
                        pktindex = 0;
                        packetp = static_cast<uint8_t*>(calloc(BLOCK_REQUEST_SIZE, 1));
                        if (packetp == nullptr) {
                            LOG("Failed to allocate memory for block request\n");
                            RXState = ZBS_RX_WAIT_HEADER;
                        } else {
                            memset(cmdbuffer, 0x00, CMD_BUFFER_SIZE);
                            lastAPActivity = millis();
                        }
                    } else if (strncmp(cmdbuffer, "ADR>", 4) == 0) {
                        RXState = ZBS_RX_WAIT_DATA_REQ;
                        charindex = 0;
                        pktindex = 0;
                        packetp = static_cast<uint8_t*>(calloc(AVAIL_DATA_REQ_SIZE, 1));
                        if (packetp == nullptr) {
                            LOG("Failed to allocate memory for data request\n");
                            RXState = ZBS_RX_WAIT_HEADER;
                        } else {
                            memset(cmdbuffer, 0x00, CMD_BUFFER_SIZE);
                            lastAPActivity = millis();
                        }
                    } else if (strncmp(cmdbuffer, "XFC>", 4) == 0) {
                        RXState = ZBS_RX_WAIT_XFERCOMPLETE;
                        pktindex = 0;
                        packetp = static_cast<uint8_t*>(calloc(XFER_COMPLETE_SIZE, 1));
                        if (packetp == nullptr) {
                            LOG("Failed to allocate memory for xfer complete\n");
                            RXState = ZBS_RX_WAIT_HEADER;
                        } else {
                            memset(cmdbuffer, 0x00, CMD_BUFFER_SIZE);
                        }
                    } else if (strncmp(cmdbuffer, "XTO>", 4) == 0) {
                        RXState = ZBS_RX_WAIT_XFERTIMEOUT;
                        pktindex = 0;
                        packetp = static_cast<uint8_t*>(calloc(XFER_COMPLETE_SIZE, 1));
                        if (packetp == nullptr) {
                            LOG("Failed to allocate memory for xfer timeout\n");
                            RXState = ZBS_RX_WAIT_HEADER;
                        } else {
                            memset(cmdbuffer, 0x00, CMD_BUFFER_SIZE);
                        }
                    } else if (strncmp(cmdbuffer, "RDY>", 4) == 0) {
                        addRXQueue(nullptr, 0, RX_CMD_RDY);
                    } else if (strncmp(cmdbuffer, "TRD>", 4) == 0) {
                        RXState = ZBS_RX_WAIT_TAG_RETURN_DATA;
                        pktindex = 0;
                        packetp = static_cast<uint8_t*>(calloc(TAG_RETURN_DATA_SIZE, 1));
                        if (packetp == nullptr) {
                            LOG("Failed to allocate memory for tag return data\n");
                            RXState = ZBS_RX_WAIT_HEADER;
                        } else {
                            memset(cmdbuffer, 0x00, CMD_BUFFER_SIZE);
                            lastAPActivity = millis();
                        }
                    }
                    break;
                case ZBS_RX_BLOCK_REQUEST:
                    if (packetp != nullptr) {
                        packetp[pktindex] = lastchar;
                        pktindex++;
                        if (pktindex == sizeof(struct espBlockRequest)) {
                            addRXQueue(packetp, pktindex, RX_CMD_RQB);
                            packetp = nullptr;  // Prevent double-free
                            RXState = ZBS_RX_WAIT_HEADER;
                        }
                    } else {
                        RXState = ZBS_RX_WAIT_HEADER;
                    }
                    break;

                case ZBS_RX_WAIT_XFERCOMPLETE:
                    if (packetp != nullptr) {
                        packetp[pktindex] = lastchar;
                        pktindex++;
                        if (pktindex == sizeof(struct espXferComplete)) {
                            addRXQueue(packetp, pktindex, RX_CMD_XFC);
                            packetp = nullptr;  // Prevent double-free
                            RXState = ZBS_RX_WAIT_HEADER;
                        }
                    } else {
                        RXState = ZBS_RX_WAIT_HEADER;
                    }
                    break;

                case ZBS_RX_WAIT_XFERTIMEOUT:
                    if (packetp != nullptr) {
                        packetp[pktindex] = lastchar;
                        pktindex++;
                        if (pktindex == sizeof(struct espXferComplete)) {
                            addRXQueue(packetp, pktindex, RX_CMD_XTO);
                            packetp = nullptr;  // Prevent double-free
                            RXState = ZBS_RX_WAIT_HEADER;
                        }
                    } else {
                        RXState = ZBS_RX_WAIT_HEADER;
                    }
                    break;

                case ZBS_RX_WAIT_DATA_REQ:
                    if (packetp != nullptr) {
                        packetp[pktindex] = lastchar;
                        pktindex++;
                        if (pktindex == sizeof(struct espAvailDataReq)) {
                            addRXQueue(packetp, pktindex, RX_CMD_ADR);
                            packetp = nullptr;  // Prevent double-free
                            RXState = ZBS_RX_WAIT_HEADER;
                        }
                    } else {
                        RXState = ZBS_RX_WAIT_HEADER;
                    }
                    break;

                case ZBS_RX_WAIT_TAG_RETURN_DATA:
                    if (packetp != nullptr) {
                        packetp[pktindex] = lastchar;
                        pktindex++;
                        // Check if we have enough data and the expected length
                        if ((pktindex > 10) && (pktindex >= (packetp[9] + 10))) {
                            addRXQueue(packetp, pktindex, RX_CMD_TRD);
                            packetp = nullptr;  // Prevent double-free
                            RXState = ZBS_RX_WAIT_HEADER;
                        }
                    } else {
                        RXState = ZBS_RX_WAIT_HEADER;
                    }
                    break;
                case ZBS_RX_WAIT_VER:
                    if (charindex < CMD_BUFFER_SIZE - 1) {
                        cmdbuffer[charindex] = lastchar;
                        charindex++;
                        if (charindex == 4) {
                            cmdbuffer[4] = '\0';  // Null terminate
                            apInfo.version = (uint16_t)strtoul(cmdbuffer, nullptr, 16);
                            charindex = 0;
                            RXState = ZBS_RX_WAIT_HEADER;
                        }
                    } else {
                        // Buffer overflow protection
                        charindex = 0;
                        RXState = ZBS_RX_WAIT_HEADER;
                    }
                    break;

                case ZBS_RX_WAIT_MAC:
                    if (charindex < CMD_BUFFER_SIZE - 1) {
                        cmdbuffer[charindex] = lastchar;
                        charindex++;
                        if (charindex == 2) {
                            cmdbuffer[2] = '\0';  // Null terminate
                            if (pktindex < 8) {
                                apInfo.mac[pktindex] = (uint8_t)strtoul(cmdbuffer, nullptr, 16);
                                pktindex++;
                            }
                            charindex = 0;
                        }
                        if (pktindex == 8) {
                            RXState = ZBS_RX_WAIT_HEADER;
                            pktindex = 0;
                        }
                    } else {
                        charindex = 0;
                        RXState = ZBS_RX_WAIT_HEADER;
                    }
                    break;

                case ZBS_RX_WAIT_CHANNEL:
                    if (charindex < CMD_BUFFER_SIZE - 1) {
                        cmdbuffer[charindex] = lastchar;
                        charindex++;
                        if (charindex == 2) {
                            cmdbuffer[2] = '\0';  // Null terminate
                            apInfo.channel = (uint8_t)strtoul(cmdbuffer, nullptr, 16);
                            RXState = ZBS_RX_WAIT_HEADER;
                        }
                    } else {
                        RXState = ZBS_RX_WAIT_HEADER;
                    }
                    break;

#ifdef HAS_SUBGHZ
                case ZBS_RX_WAIT_SUBCHANNEL:
                    if (charindex < CMD_BUFFER_SIZE - 1) {
                        cmdbuffer[charindex] = lastchar;
                        charindex++;
                        if (charindex == 3) {
                            cmdbuffer[3] = '\0';  // Null terminate
                            int Channel = atoi(cmdbuffer);
                            if (Channel != NO_SUBGHZ_CHANNEL) {
                                apInfo.hasSubGhz = true;
                                apInfo.SubGhzChannel = Channel;
                            } else {
                                apInfo.hasSubGhz = false;
                                apInfo.SubGhzChannel = 0;
                            }
                            RXState = ZBS_RX_WAIT_HEADER;
                        }
                    } else {
                        RXState = ZBS_RX_WAIT_HEADER;
                    }
                    break;
#endif

                case ZBS_RX_WAIT_POWER:
                    if (charindex < CMD_BUFFER_SIZE - 1) {
                        cmdbuffer[charindex] = lastchar;
                        charindex++;
                        if (charindex == 2) {
                            cmdbuffer[2] = '\0';  // Null terminate
                            apInfo.power = (uint8_t)strtoul(cmdbuffer, nullptr, 16);
                            RXState = ZBS_RX_WAIT_HEADER;
                        }
                    } else {
                        RXState = ZBS_RX_WAIT_HEADER;
                    }
                    break;

                case ZBS_RX_WAIT_PENDING:
                    if (charindex < CMD_BUFFER_SIZE - 1) {
                        cmdbuffer[charindex] = lastchar;
                        charindex++;
                        if (charindex == 2) {
                            cmdbuffer[2] = '\0';  // Null terminate
                            apInfo.pendingBuffer = (uint8_t)strtoul(cmdbuffer, nullptr, 16);
                            RXState = ZBS_RX_WAIT_HEADER;
                        }
                    } else {
                        RXState = ZBS_RX_WAIT_HEADER;
                    }
                    break;

                case ZBS_RX_WAIT_NOP:
                    if (charindex < CMD_BUFFER_SIZE - 1) {
                        cmdbuffer[charindex] = lastchar;
                        charindex++;
                        if (charindex == 2) {
                            cmdbuffer[2] = '\0';  // Null terminate
                            apInfo.nop = (uint8_t)strtoul(cmdbuffer, nullptr, 16);
                            RXState = ZBS_RX_WAIT_HEADER;
                        }
                    } else {
                        RXState = ZBS_RX_WAIT_HEADER;
                    }
                    break;

                case ZBS_RX_WAIT_TYPE:
                    if (charindex < CMD_BUFFER_SIZE - 1) {
                        cmdbuffer[charindex] = lastchar;
                        charindex++;
                        if (charindex == 2) {
                            cmdbuffer[2] = '\0';  // Null terminate
                            apInfo.type = (uint8_t)strtoul(cmdbuffer, nullptr, 16);
                            RXState = ZBS_RX_WAIT_HEADER;
                        }
                    } else {
                        RXState = ZBS_RX_WAIT_HEADER;
                    }
                    break;

                default:
                    // Unknown state, reset to header wait
                    RXState = ZBS_RX_WAIT_HEADER;
                    if (packetp != nullptr) {
                        free(packetp);
                        packetp = nullptr;
                    }
                    break;
            }
        }

        // Allow other tasks to run and prevent watchdog timeout
        vTaskDelay(pdMS_TO_TICKS(TASK_DELAY_MS));
    }

    // Cleanup before task termination
    if (packetp != nullptr) {
        free(packetp);
        packetp = nullptr;
    }

    AP_SERIAL_PORT.end();
    gSerialTaskState = SERIAL_STATE_STOPPED;
    LOG("rxSerialTask stopped\n");
    vTaskDelete(NULL);
}

#if defined(FLASHER_DEBUG_RXD) && !defined(FLASHER_DEBUG_SHARED)
uint32_t millisDiff(uint32_t m) {
    uint32_t ms = millis();
    if (ms >= m)
        return ms - m;
    else
        return UINT32_MAX - m + ms + 1;
}

void rxSerialTask2(void* parameter) {
    char rxStr[100] = {0};
    int rxStrCount = 0;
    uint32_t modemResetHoldoff = millis();
    char lastchar = 0;
    time_t startTime = millis();
    int charCount = 0;
    Serial2.begin(115200, SERIAL_8N1, FLASHER_DEBUG_TXD, FLASHER_DEBUG_RXD);
    while (rxSerialStopTask2 == false) {
        while (Serial2.available()) {
            lastchar = Serial2.read();
            charCount++;

            // debug info
            Serial.write(lastchar);

            rxStr[rxStrCount] = lastchar;
            if (lastchar == '\n' || lastchar == '\r') {
                if (strncmp(rxStr, "receive buffer full, drop the current frame", 43) == 0 && millisDiff(modemResetHoldoff) > 20000) {
                    modemResetHoldoff = millis();
                    vTaskDelay(100 / portTICK_PERIOD_MS);
                    config.runStatus = RUNSTATUS_STOP;
                    Serial.println("IEEE802.15.4 modem stuck case detected, resetting...");
                    APTagReset();
                    vTaskDelay(1000 / portTICK_PERIOD_MS);
                    Serial.println("bringing AP online again");
                    if (bringAPOnline()) {
                        config.runStatus = RUNSTATUS_RUN;
                        Serial.println("Finished!");
                    } else {
                        Serial.println("Failed!");
                    }
                    LogUtils::logInfo("IEEE802.15.4 modem reset " + (config.runStatus == RUNSTATUS_RUN) ? ("ok") : ("failed"));
                }
                rxStrCount = 0;
                memset(rxStr, 0, sizeof(rxStr));
            } else if (rxStrCount < sizeof(rxStr) - 2) {
                rxStrCount++;
            } else {
                rxStrCount = 0;
                memset(rxStr, 0, sizeof(rxStr));
            }
        }
        vTaskDelay(1 / portTICK_PERIOD_MS);

        time_t currentTime = millis();
        if (currentTime - startTime >= 1000) {
            if (charCount > 6000) {
                rxSerialStopTask2 = true;
                Serial.println("Serial monitor stopped because of flooding (" + String(charCount) + " characters per second)");
            }
            startTime = currentTime;
            charCount = 0;
        }
    }
    Serial2.end();
    Serial.println("Exiting AP serial monitor");
    vTaskDelete(NULL);
}
#endif

void ShowAPInfo() {
    if (apInfo.type == 0 && apInfo.version == 0) {
        LOG("| AP Info - No data available |\n");
        return;
    }

    LOG("\r\n| AP Info - type %02X       |\r\n", apInfo.type);
    LOG("| Ch   |             0x%02X |\r\n", apInfo.channel);
    LOG("| Power|               %02X |\r\n", apInfo.power);
    LOG("| MAC  | %02X%02X%02X%02X%02X%02X%02X%02X |\r\n",
        apInfo.mac[7], apInfo.mac[6], apInfo.mac[5], apInfo.mac[4],
        apInfo.mac[3], apInfo.mac[2], apInfo.mac[1], apInfo.mac[0]);
    LOG("| Ver  |           0x%04X |\r\n", apInfo.version);
}

void notifySegmentedFlash() {
    if (sendAPSegmentedData(apInfo.mac, (String) "Fl     ash", 0x0800, false, true)) {
        vTaskDelay(pdMS_TO_TICKS(SEGMENTED_NOTIFICATION_DELAY));
    }

#ifdef POWER_NO_SOFT_POWER
    if (sendAPSegmentedData(apInfo.mac, (String) "If    done", 0x0800, false, true)) {
        vTaskDelay(pdMS_TO_TICKS(SEGMENTED_NOTIFICATION_DELAY));
    }
    if (sendAPSegmentedData(apInfo.mac, (String) "RE    boot", 0x0800, false, true)) {
        vTaskDelay(pdMS_TO_TICKS(1000));
    }
#endif
}
void checkWaitPowerCycle() {
    // Check if we should wait for a power cycle
#ifdef POWER_NO_SOFT_POWER
    setAPstate(false, AP_STATE_REQUIRED_POWER_CYCLE);

    // Inform user about required power cycle
    LOG("Please power-cycle your AP/device\n");

#ifdef HAS_RGB_LED
    showColorPattern(CRGB::Aqua, CRGB::Aqua, CRGB::Red);
#endif

    // Wait indefinitely for power cycle
    while (1) {
        vTaskDelay(pdMS_TO_TICKS(POWER_CYCLE_WAIT_INTERVAL));
    }
#endif
}
void segmentedShowIp() {
    IPAddress IP = wifiUtils.localIP();
    char temp[IP_DISPLAY_BUFFER_SIZE];

    vTaskDelay(pdMS_TO_TICKS(SEGMENTED_NOTIFICATION_DELAY));

    if (!sendAPSegmentedData(apInfo.mac, (String) "IP    Addr", 0x0200, true, true)) {
        LOG("Failed to send IP address header\n");
        return;
    }
    vTaskDelay(pdMS_TO_TICKS(SEGMENTED_NOTIFICATION_DELAY));

    snprintf(temp, sizeof(temp), "%03d IP %03d", IP[0], IP[1]);
    if (!sendAPSegmentedData(apInfo.mac, (String)temp, 0x0200, true, true)) {
        LOG("Failed to send IP address part 1\n");
        return;
    }
    vTaskDelay(pdMS_TO_TICKS(SEGMENTED_NOTIFICATION_DELAY));

    snprintf(temp, sizeof(temp), "%03d IP %03d", IP[2], IP[3]);
    if (!sendAPSegmentedData(apInfo.mac, (String)temp, 0x0200, true, true)) {
        LOG("Failed to send IP address part 2\n");
    }
    vTaskDelay(pdMS_TO_TICKS(SEGMENTED_NOTIFICATION_DELAY));
}

bool bringAPOnline(uint8_t newState) {
#ifdef BLE_ONLY
    apInfo.state = AP_STATE_NORADIO;
#endif
    if (apInfo.state == AP_STATE_NORADIO) return true;
    if (apInfo.state == AP_STATE_FLASHING) return false;

    // Initialize serial communication if needed
    if (gSerialTaskState != SERIAL_STATE_INITIALIZED) {
#ifdef HAS_ELECROW_ADV_2_8
        // Set GPIO45 low to connect the wireless interface to the multiplexed pins
        pinMode(45, OUTPUT);
        digitalWrite(45, LOW);
#endif

#if (AP_PROCESS_PORT == FLASHER_AP_PORT)
        AP_SERIAL_PORT.begin(115200, SERIAL_8N1, FLASHER_AP_RXD, FLASHER_AP_TXD);
#elif defined(HAS_EXT_FLASHER)
#if (AP_PROCESS_PORT == FLASHER_EXT_PORT)
        AP_SERIAL_PORT.begin(115200, SERIAL_8N1, FLASHER_EXT_RXD, FLASHER_EXT_TXD);
#elif (AP_PROCESS_PORT == FLASHER_ALTRADIO_PORT)
        AP_SERIAL_PORT.begin(115200, SERIAL_8N1, FLASHER_AP_RXD, FLASHER_AP_TXD);
#endif
#endif
        gSerialTaskState = SERIAL_STATE_INITIALIZED;
    }

    // Start RX task if not running
    if (gSerialTaskState != SERIAL_STATE_RUNNING) {
        gSerialTaskState = SERIAL_STATE_STARTING;
        xTaskCreate(rxSerialTask, "rxSerialTask", 1750, NULL, 11, NULL);
        vTaskDelay(pdMS_TO_TICKS(TASK_CREATION_DELAY_MS));
    }

    setAPstate(false, AP_STATE_OFFLINE);

    // Try without rebooting first
    AP_SERIAL_PORT.updateBaudRate(115200);
    uint32_t bootTimeout = millis();
    bool APrdy = sendPing();

    if (!APrdy) {
        if (apInfo.state == AP_STATE_FLASHING) return false;

        LOG("Initial ping failed, resetting AP\n");
        APTagReset();
        vTaskDelay(pdMS_TO_TICKS(1000));

        bootTimeout = millis();
        APrdy = false;
        uint8_t attempts = 0;

        while (!APrdy &&
               (millis() - bootTimeout < AP_BOOT_TIMEOUT_MS) &&
               (apInfo.state != AP_STATE_FLASHING)) {
            APrdy = sendPing();
            if (!APrdy) {
                vTaskDelay(pdMS_TO_TICKS(AP_PING_RETRY_DELAY_MS));
                attempts++;
                if (attempts % 10 == 0) {
                    LOG("AP boot attempt %d, elapsed: %lums\n", attempts, millis() - bootTimeout);
                }
            }
        }
    }

    if (!APrdy) {
        LOG("Failed to bring AP online after %lums\n", millis() - bootTimeout);
        return false;
    }

    // AP is responding, configure it
    setAPstate(false, AP_STATE_COMING_ONLINE);

    if (!sendChannelPower(&curChannel)) {
        LOG("Failed to set channel/power\n");
        setAPstate(false, AP_STATE_OFFLINE);
        return false;
    }

    vTaskDelay(pdMS_TO_TICKS(200));

    if (!sendGetInfo()) {
        LOG("Failed to get AP info\n");
        setAPstate(false, AP_STATE_OFFLINE);
        return false;
    }

    // Enable high speed for C6 modules
    if (apInfo.type == ESP32_C6) {
        if (sendHighspeed()) {
            AP_SERIAL_PORT.flush();
            vTaskDelay(pdMS_TO_TICKS(10));
            AP_SERIAL_PORT.updateBaudRate(2000000);
            LOG("Switched to 2000000 baud\n");
        } else {
            LOG("Failed to enable high speed mode\n");
        }
    }

    vTaskDelay(pdMS_TO_TICKS(200));
    setAPstate(newState == AP_STATE_ONLINE ? true : false, newState);
    LOG("AP brought online successfully\n");
    return true;
}

bool checkRadio() {
    // Disabled AP radio - only web server and C6 connection functionality
    return false;
}

void APTask(void* parameter) {
    if (!checkRadio()) {
        // no radio
        LOG("Working without radio.\n");
        addFadeMono(config.led);
        setAPstate(true, AP_STATE_NORADIO);
        refreshAllPending();
        vTaskDelete(NULL);
        return;
    }

    xTaskCreate(rxCmdProcessor, "rxCmdProcessor", 6000, NULL, 15, NULL);
#if defined(FLASHER_DEBUG_RXD) && !defined(FLASHER_DEBUG_SHARED)
    xTaskCreate(rxSerialTask2, "rxSerialTask2", 1850, NULL, 2, NULL);
    vTaskDelay(500 / portTICK_PERIOD_MS);
#endif
    bringAPOnline();

#ifndef HAS_C6
    if (checkForcedAPFlash() && FLASHER_AP_MOSI != -1) {
        if (apInfo.type == SOLUM_SEG_UK && apInfo.isOnline) {
            notifySegmentedFlash();
        }
        LOG("We're going to try to perform an 'AP forced flash' in\r\n");
        flashCountDown(10);
        LOG("\r\nPerforming force flash of the AP\r\n");
        setAPstate(false, AP_STATE_FLASHING);
        doForcedAPFlash();
        checkWaitPowerCycle();
        bringAPOnline();
    }
#endif

    if (apInfo.isOnline) {
        // AP works!
        ShowAPInfo();

        if (apInfo.type == SOLUM_SEG_UK) {
            setAPstate(true, AP_STATE_COMING_ONLINE);
            segmentedShowIp();
            showAPSegmentedInfo(apInfo.mac, true);
            setAPstate(true, AP_STATE_ONLINE);
            updateContent(apInfo.mac);
        }

        uint16_t fsversion;
#ifndef HAS_C6
        if (FLASHER_AP_MOSI != -1) {
            fsversion = getAPUpdateVersion(apInfo.type);
            if ((fsversion) && (apInfo.version != fsversion)) {
                LOG("Firmware version on FS: %04X\r\n", fsversion);

                LOG("We're going to try to update the AP's FW in\r\n");
                flashCountDown(30);
                LOG("\r\n");
                notifySegmentedFlash();
                setAPstate(false, AP_STATE_FLASHING);
                if (doAPUpdate(apInfo.type)) {
                    checkWaitPowerCycle();
                    LOG("Flash completed, let's try to boot the AP!\r\n");
                    if (bringAPOnline()) {
                        // AP works
                        ShowAPInfo();
                        setAPchannel();
                    } else {
                        LOG("Failed to bring up the AP after flashing seemed successful... That's not supposed to happen!\r\n");
                        LOG("This can be caused by a bad AP firmware, failed or failing hardware, or the inability to fully power-cycle the AP\r\n");
                        setAPstate(false, AP_STATE_FAILED);
#ifdef HAS_RGB_LED
                        showColorPattern(CRGB::Red, CRGB::Yellow, CRGB::Red);
#endif
                    }
                } else {
                    setAPstate(false, AP_STATE_FAILED);
                    checkWaitPowerCycle();
                    LOG("Failed to update version on the AP :(\n");
#ifdef HAS_RGB_LED
                    showColorPattern(CRGB::Red, CRGB::Red, CRGB::Red);
#endif
                }
            }
        }
#endif

        refreshAllPending();
    } else {
#ifndef FLASH_TIMEOUT
#define FLASH_TIMEOUT 30
#endif

        if (FLASHER_AP_MOSI == -1) {
            LOG("I wasn't able to connect to the AP radio. Did you flash it?\r\n");
            LOG("The build of this firmware expects an AP tag with TXD/RXD on ESP32 pins %d and %d, does this match with your wiring?\r\n", FLASHER_AP_RXD, FLASHER_AP_TXD);
#ifdef HAS_RGB_LED
            showColorPattern(CRGB::Red, CRGB::Yellow, CRGB::Red);
#endif
            if (apInfo.state != AP_STATE_FLASHING)  // In case we are flashing already we do not want to end in a failed AP
                setAPstate(false, AP_STATE_FAILED);
        } else {
#ifndef HAS_C6
            // AP unavailable, maybe time to flash?
            setAPstate(false, AP_STATE_OFFLINE);

            LOG("I wasn't able to connect to a ZBS (AP) tag.\r\n");
            LOG("This could be the first time this AP is booted and the AP-tag may be unflashed.\r\n");
            LOG("If this tag was previously flashed succesfully but this message still shows up, there's probably something wrong with the serial connections.\r\n");
            LOG("The build of this firmware expects an AP tag with TXD/RXD on ESP32 pins %d and %d, does this match with your wiring?\r\n", FLASHER_AP_RXD, FLASHER_AP_TXD);
#ifdef DISABLE_AUTO_FLASH
            LOG("Auto-flash is DISABLED by compile flag. Manual flash required.\r\n");
            LOG("To enable auto-flash, remove DISABLE_AUTO_FLASH from build_flags\r\n");
            setAPstate(false, AP_STATE_FAILED);
#else
            LOG("Performing firmware flash in about %d seconds!\r\n", FLASH_TIMEOUT);
            flashCountDown(FLASH_TIMEOUT);
            if (doAPFlash()) {
                checkWaitPowerCycle();
                if (bringAPOnline()) {
                    // AP works
                    ShowAPInfo();
                    if (apInfo.type == SOLUM_SEG_UK) {
                        segmentedShowIp();
                        showAPSegmentedInfo(apInfo.mac, true);
                    }
                    refreshAllPending();
                } else {
                    LOG("Failed to bring up the AP after successful flashing... That's not supposed to happen!\r\n");
                    LOG("This generally means that the flasher connections (MISO/MOSI/CLK/RESET/CS) are okay,\r\n");
                    LOG("but we can't (yet) talk to the AP over serial lines. Verify the pins mentioned above.\r\n\r\n");

#ifndef POWER_NO_SOFT_POWER
                    LOG("The firmware you're using expects soft power control over the AP tag; if it can't\r\n");
                    LOG("power-cycle the AP-tag using GPIO pin %d, this can cause this very same issue.\r\n", APpowerPins[0]);
#endif

#ifdef HAS_RGB_LED
                    showColorPattern(CRGB::Red, CRGB::Yellow, CRGB::Red);
#endif
                    setAPstate(false, AP_STATE_FAILED);
                }
            } else {
                // failed to flash
#ifdef HAS_RGB_LED
                showColorPattern(CRGB::Red, CRGB::Red, CRGB::Red);
#endif
                setAPstate(false, AP_STATE_FAILED);
                LOG("Failed to flash the AP :(\n");
                LOG("Seems like you're running into some issues with the wiring, or (very small chance) the tag itself\n");
                LOG("This ESP32-build expects the following pins connected to the ZBS243:\n");
                LOG("---  ZBS243 based tag              ESP32  ---\n");
                LOG("       TXD     ----------------     %02d\r\n", FLASHER_AP_RXD);
                LOG("       RXD     ----------------     %02d\r\n", FLASHER_AP_TXD);
                LOG("       CS/SS   ----------------     %02d\r\n", FLASHER_AP_SS);
                LOG("       MOSI    ----------------     %02d\r\n", FLASHER_AP_MOSI);
                LOG("       MISO    ----------------     %02d\r\n", FLASHER_AP_MISO);
                LOG("       CLK     ----------------     %02d\r\n", FLASHER_AP_CLK);
                LOG("       RSET    ----------------     %02d\r\n", FLASHER_AP_RESET);
#ifdef POWER_NO_SOFT_POWER
                LOG("Your firmware is configured without soft power control. This means you'll have to manually power-cycle the tag after flashing.\r\n");
#else
                LOG("       POWER   ----------------     %02d\r\n", APpowerPins[0]);
#endif
                LOG("Please verify your wiring and try again!\n");
            }
#endif  // DISABLE_AUTO_FLASH
#ifdef HAS_SDCARD
            if (SD_CARD_CLK == FLASHER_AP_CLK ||
                SD_CARD_MISO == FLASHER_AP_MISO ||
                SD_CARD_MOSI == FLASHER_AP_MOSI) {
                LOG("Reseting in 30 seconds to restore SPI state!\n");
                flashCountDown(30);
                ESP.restart();
            }
#endif
#endif
        }
    }

    uint8_t attempts = 0;
    while (1) {
        if (((apInfo.state == AP_STATE_ONLINE) || (apInfo.state == AP_STATE_FAILED)) && (millis() - lastAPActivity > AP_ACTIVITY_MAX_INTERVAL)) {
            bool reply = sendPing();
            if (!reply) {
                attempts++;
            } else {
                if (apInfo.isOnline == false)
                    setAPstate(true, AP_STATE_ONLINE);
                attempts = 0;
            }
            if (attempts > 5 && apInfo.state != AP_STATE_FLASHING) {
                setAPstate(false, AP_STATE_WAIT_RESET);
                if (!bringAPOnline()) {
                    // tried to reset the AP, but we failed... Maybe the AP-Tag died?
                    setAPstate(false, AP_STATE_FAILED);
#ifdef HAS_RGB_LED
                    showColorPattern(CRGB::Yellow, CRGB::Yellow, CRGB::Red);
#endif
                    lastAPActivity = millis();  // we set this to retrigger a recovery in AP_ACTIVITY_MAX_INTERVAL seconds
                } else {
                    setAPstate(true, AP_STATE_ONLINE);
                    attempts = 0;
                    refreshAllPending();
                }
            }
        }
        vTaskDelay(1000 / portTICK_PERIOD_MS);
    }
}
