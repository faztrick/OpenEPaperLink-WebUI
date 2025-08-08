#pragma once
#include <Arduino.h>

#ifndef USE_DUMMY_CONTENT_MANAGER
// Real implementation includes
#include <LittleFS.h>
#include <time.h>

#include "makeimage.h"
#include "tag_db.h"

#ifdef HAS_TFT
#include <TFT_eSPI.h>
#endif

// Real function declarations
void contentRunner();
void checkVars();
void drawNew(const uint8_t mac[8], tagRecord *&taginfo);
bool updateTagImage(String &filename, const uint8_t *dst, uint16_t nextCheckin, tagRecord *&taginfo, imgParam &imageParams);

#endif
