#ifndef OEPL_PROTO_H
#define OEPL_PROTO_H

#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

#pragma pack(push, 1)

typedef struct {
    uint8_t type;
    uint8_t len;
    uint16_t fcs;
} MacFcs;

typedef struct {
    uint8_t opcode;
    uint8_t id;
    uint8_t tag;
} MacFrameHeader;

typedef struct {
    uint8_t opcode;
    uint8_t id;
    uint8_t tag;
    uint8_t data[0];
} MacFrame;

typedef struct {
    uint8_t opcode;
    uint8_t tagid;
    uint16_t offset;
    uint16_t length;
} AvailDataReq;

typedef struct {
    uint8_t opcode;
    uint8_t tagid;
    uint16_t block;
    uint16_t blocks;
} blockRequest;

typedef struct {
    uint8_t opcode;
    uint8_t tagid;
    uint16_t block;
    uint16_t bytes;
    uint8_t data[0];
} blockData;

typedef struct {
    uint8_t opcode;
    uint8_t tagid;
    uint8_t datatype;
    uint16_t length;
    uint8_t data[0];
} tagReturnData;

#pragma pack(pop)

#ifdef __cplusplus
}
#endif

#endif  // OEPL_PROTO_H
