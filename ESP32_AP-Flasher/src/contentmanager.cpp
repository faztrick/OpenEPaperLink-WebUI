// contentmanager.cpp
// Minimal stub implementation: provide no-op functions for the contentmanager API so
// the rest of the project can build while the full module is removed.

#include "contentmanager.h"

#include <ArduinoJson.h>

// Keep this file intentionally small. Do not add large implementations here.

void contentRunner() {}
void checkVars() {}
void drawNew(const uint8_t mac[8], tagRecord *&taginfo) {
    (void)mac;
    (void)taginfo;
}
bool updateTagImage(String &filename, const uint8_t *dst, uint16_t nextCheckin, tagRecord *&taginfo, imgParam &imageParams) {
    (void)filename;
    (void)dst;
    (void)nextCheckin;
    (void)taginfo;
    (void)imageParams;
    return true;
}
int getImgURL(String &filename, String URL, time_t fetched, imgParam &imageParams, String MAC) {
    (void)filename;
    (void)URL;
    (void)fetched;
    (void)imageParams;
    (void)MAC;
    return 304;
}
bool getDayAheadFeed(String &filename, JsonObject &cfgobj, tagRecord *&taginfo, imgParam &imageParams) {
    (void)filename;
    (void)cfgobj;
    (void)taginfo;
    (void)imageParams;
    return false;
}
void prepareConfigFile(const uint8_t *dst, const JsonObject &config) {
    (void)dst;
    (void)config;
}
bool getJsonTemplateFile(String &filename, String jsonfile, tagRecord *&taginfo, imgParam &imageParams) {
    (void)filename;
    (void)jsonfile;
    (void)taginfo;
    (void)imageParams;
    return false;
}
bool getJsonTemplateFileExtractVariables(String &filename, String jsonfile, JsonDocument &variables, tagRecord *&taginfo, imgParam &imageParams) {
    (void)filename;
    (void)jsonfile;
    (void)variables;
    (void)taginfo;
    (void)imageParams;
    return false;
}
int getJsonTemplateUrl(String &filename, String URL, time_t fetched, String MAC, tagRecord *&taginfo, imgParam &imageParams) {
    (void)filename;
    (void)URL;
    (void)fetched;
    (void)MAC;
    (void)taginfo;
    (void)imageParams;
    return 304;
}
void drawJsonStream(Stream &stream, String &filename, tagRecord *&taginfo, imgParam &imageParams) {
    (void)stream;
    (void)filename;
    (void)taginfo;
    (void)imageParams;
}
void getTemplate(JsonDocument &json, const uint8_t id, const uint8_t hwtype) {
    (void)json;
    (void)id;
    (void)hwtype;
}

#ifdef HAS_TFT
void drawString(TFT_eSprite &spr, String content, int16_t posx, int16_t posy, String font, byte align, uint16_t color, uint16_t size, uint16_t bgcolor) {
    (void)spr;
    (void)content;
    (void)posx;
    (void)posy;
    (void)font;
    (void)align;
    (void)color;
    (void)size;
    (void)bgcolor;
}
void drawTextBox(TFT_eSprite &spr, String &content, int16_t &posx, int16_t &posy, int16_t boxwidth, int16_t boxheight, String font, uint16_t color, uint16_t bgcolor, float lineheight, byte align) {
    (void)spr;
    (void)content;
    (void)posx;
    (void)posy;
    (void)boxwidth;
    (void)boxheight;
    (void)font;
    (void)color;
    (void)bgcolor;
    (void)lineheight;
    (void)align;
}
void initSprite(TFT_eSprite &spr, int w, int h, imgParam &imageParams) {
    (void)spr;
    (void)w;
    (void)h;
    (void)imageParams;
}
void rotateBuffer(uint8_t rotation, uint8_t &currentOrientation, TFT_eSprite &spr, imgParam &imageParams) {
    (void)rotation;
    (void)currentOrientation;
    (void)spr;
    (void)imageParams;
}
void drawElement(const JsonObject &element, TFT_eSprite &spr, imgParam &imageParams, uint8_t &currentOrientation) {
    (void)element;
    (void)spr;
    (void)imageParams;
    (void)currentOrientation;
}
#endif

uint16_t getColor(const String &color) {
    (void)color;
    return 0;
}
char *formatHttpDate(const time_t t) {
    (void)t;
    static char buf[40] = "";
    return buf;
}
String urlEncode(const char *msg) {
    (void)msg;
    return String("");
}
int windSpeedToBeaufort(const float windSpeed) {
    (void)windSpeed;
    return 0;
}
String windDirectionIcon(const int degrees) {
    (void)degrees;
    return String("");
}
void getLocation(JsonObject &cfgobj) { (void)cfgobj; }
void prepareNFCReq(const uint8_t *dst, const char *url) {
    (void)dst;
    (void)url;
}
void prepareLUTreq(const uint8_t *dst, const String &input) {
    (void)dst;
    (void)input;
}
void prepareTIME_RAW(const uint8_t *dst, time_t now) {
    (void)dst;
    (void)now;
}

// Keep the stub simple — no global/static data and no heavy includes.
