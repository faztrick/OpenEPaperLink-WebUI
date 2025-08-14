#ifndef OEPL_ESP_AP_PROTO_H
#define OEPL_ESP_AP_PROTO_H

#include <stdint.h>

#ifdef __cplusplus
extern "C"
{
#endif

#pragma pack(push, 1)

    typedef struct espBlockRequest
    {
        uint8_t src[8];
        uint32_t ver; // protocol/version field used by AP
        uint16_t reposize;
        uint16_t blockId; // Use blockId for ESP version
        uint16_t blocks;
    } espBlockRequest;

    typedef struct espXferComplete
    {
        uint8_t src[8];
        uint32_t id;
        uint16_t offset;
        uint16_t bytes;
    } espXferComplete;

    typedef struct espSetChannelPower
    {
        uint8_t src[8];
        uint8_t subghzchannel; // added for sub-GHz support
        uint8_t channel;
        uint8_t power;
    } espSetChannelPower;

    typedef struct espAvailDataReq
    {
        uint8_t src[8];
        struct
        {
            uint8_t opcode;
            uint8_t tagid;
            uint16_t offset;
            uint16_t length;
            int16_t batteryMv;  // battery in millivolts (signed to allow -1)
            int8_t temperature; // temperature in deci-degrees (or as used by code)
            uint8_t lastPacketLQI;
            // Additional fields for ESP version
            int8_t lastPacketRSSI;
            uint8_t currentChannel;
            uint8_t hwType;
            uint8_t wakeupReason;
            uint8_t capabilities;
            uint16_t tagSoftwareVersion;
            uint8_t customMode;
        } adr;
    } espAvailDataReq;

    typedef struct espTagReturnData
    {
        uint8_t src[8];
        uint8_t tagid;
        uint8_t len; // total length of this packet (used by code)
        struct
        {
            uint8_t dataType;
            uint64_t dataVer;
            uint8_t data[0];
        } returnData;
    } espTagReturnData;

#pragma pack(pop)

#ifdef __cplusplus
}
#endif

#endif // OEPL_ESP_AP_PROTO_H
