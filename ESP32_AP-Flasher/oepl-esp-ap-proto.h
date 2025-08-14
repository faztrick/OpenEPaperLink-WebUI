#ifndef OEPL_ESP_AP_PROTO_H
#define OEPL_ESP_AP_PROTO_H

#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

#pragma pack(push, 1)

typedef struct {
    uint8_t src[8];
    uint16_t reposize;
    uint16_t blockId;  // Use blockId for ESP version
    uint16_t blocks;
} espBlockRequest;

typedef struct {
    uint8_t src[8];
    uint32_t id;
    uint16_t offset;
    uint16_t bytes;
} espXferComplete;

typedef struct {
    uint8_t src[8];
    uint8_t channel;
    uint8_t power;
} espSetChannelPower;

typedef struct {
    uint8_t src[8];
    uint8_t tag_id;
    uint8_t reserved;
} espAvailDataReq;

typedef struct {
    uint8_t src[8];
    uint8_t tagid;
    uint8_t datatype;
    uint16_t length;
    // followed by data
} espTagReturnData;

#pragma pack(pop)

#ifdef __cplusplus
}
#endif

#endif  // OEPL_ESP_AP_PROTO_H
