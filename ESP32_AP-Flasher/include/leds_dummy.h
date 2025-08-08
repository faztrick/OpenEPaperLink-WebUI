#pragma once
// Dummy LED header for Wokwi simulation - excludes FastLED dependency

// Dummy LED functions to replace leds.h functionality
inline void initLeds() {}
inline void setLedColor(int r, int g, int b) {}
inline void setLedBrightness(int brightness) {}
inline void showLeds() {}
inline void clearLeds() {}
inline void ledOff() {}
inline void ledOn() {}
inline void ledBlink(int count = 1, int delay_ms = 100) {}
inline void ledFlash(int r, int g, int b, int duration = 100) {}
inline void ledStatus(bool status) {}
