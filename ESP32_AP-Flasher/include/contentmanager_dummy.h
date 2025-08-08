#pragma once
// Dummy content manager header for Wokwi simulation - excludes TFT_eSPI dependency

#include <Arduino.h>

// Dummy content manager functions
inline void initContentManager() {}
inline bool contentManagerReady() { return false; }
inline void processContentUpdates() {}
inline bool hasContentUpdate() { return false; }
