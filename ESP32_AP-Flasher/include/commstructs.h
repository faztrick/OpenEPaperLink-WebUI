#ifndef NEWPROTO_H
#define NEWPROTO_H

#include <Arduino.h>
#pragma pack(push, 1)

#include "../../oepl-definitions.h"
#include "../../oepl-proto.h"
// Include ESP-specific protocol definitions (espXferComplete etc.)
#include "../../oepl-esp-ap-proto.h"

#ifndef BLOCK_DATA_SIZE
#define BLOCK_DATA_SIZE 512
#endif

#define BLOCK_XFER_BUFFER_SIZE (BLOCK_DATA_SIZE + sizeof(struct blockData))

#define PKT_XFER_TIMEOUT 0xED

// Packet type definitions used on the UDP control channel
#define PKT_AVAIL_DATA_INFO 0x83
#define PKT_XFER_COMPLETE 0x84
#define PKT_AVAIL_DATA_REQ 0x85

#define PKT_APLIST_REQ 0x80
#define PKT_APLIST_REPLY 0x81
#define PKT_TAGINFO 0x82

struct APlist
{
    uint32_t src;
    char alias[32];
    uint8_t channelId;
    uint8_t tagCount;
    uint16_t version;
} __packed;

#define SYNC_NOSYNC 0
#define SYNC_USERCFG 1
#define SYNC_TAGSTATUS 2
#define SYNC_DELETE 3
#define SYNC_VERSION 0xAA01

struct TagInfo
{
    uint16_t structVersion = SYNC_VERSION;
    uint8_t mac[8];
    uint8_t syncMode;
    char alias[32];
    uint32_t lastseen;
    uint32_t nextupdate;
    uint16_t pendingCount;
    uint32_t expectedNextCheckin;
    uint8_t hwType;
    uint8_t wakeupReason;
    uint8_t capabilities;
    uint16_t pendingIdle;
    uint8_t contentMode;
    uint8_t reserved[8];
} __packed;

// Information about available data for a tag
#pragma pack(push, 1)
struct AvailDataInfo
{
    uint8_t checksum;         // checksum / crc stored in first byte when serialized
    uint8_t dataType;         // DATATYPE_*
    uint8_t dataTypeArgument; // optional argument for some data types
    uint16_t nextCheckIn;     // next check-in (may include high-bit flags)
    uint64_t dataVer;         // 8-byte version (MD5/hash prefix)
    uint32_t dataSize;        // size of available data
} __packed;

// Pending data packet sent internally / over the network
struct pendingData
{
    struct AvailDataInfo availdatainfo;
    uint8_t targetMac[8]; // destination MAC (8 bytes)
    uint8_t attemptsLeft; // remaining retries
    uint8_t _reserved[3]; // padding/reserved for future use / alignment
} __packed;
#pragma pack(pop)

#pragma pack(pop)

#endif // NEWPROTO_H
