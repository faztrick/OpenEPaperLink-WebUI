// WiFi LED behavior hooks
// Implements requested scheme:
//  - STA connecting: blue breathing (faster) / blink
//  - STA connected: solid blue (slow breathing off for clarity)
//  - AP active (no STA): purple (red+blue) breathing
//  - AP + STA both active: alternate between solid blue and purple every few seconds
// These override the weak symbols declared in wifi_module.cpp

#include <Arduino.h>
#include <WiFi.h>
#ifdef HAS_RGB_LED
#include <FastLED.h>
#endif

#include "wifi_module.h"
// leds.cpp exports these
#ifdef HAS_RGB_LED
extern CRGB rgbIdleColor;
extern uint16_t rgbIdlePeriod; // breathing period
#endif

// Feature flag (can be disabled at compile time if needed)
#ifndef ENABLE_ADV_WIFI_LED
#define ENABLE_ADV_WIFI_LED 1
#endif

#if ENABLE_ADV_WIFI_LED && defined(HAS_RGB_LED)

// Internal state
static bool gStaConnected = false;
static bool gApActive = false;
static uint32_t gLastModeToggle = 0; // for AP+STA alternating
static bool gAltPhase = false;

static void applyScheme()
{
  if (!gStaConnected && !gApActive)
  {
    // Idle / disconnected: faster blue breathing to indicate searching
    rgbIdleColor = CRGB::Blue;
    rgbIdlePeriod = 180; // faster pulse
    return;
  }
  if (gStaConnected && !gApActive)
  {
    // Solid blue (very slow breathing to look almost solid)
    rgbIdleColor = CRGB::Blue;
    rgbIdlePeriod = 1200;
    return;
  }
  if (!gStaConnected && gApActive)
  {
    // Purple breathing indicates AP available
    rgbIdleColor = CRGB(128, 0, 128); // purple
    rgbIdlePeriod = 600;
    return;
  }
  // Both STA + AP
  uint32_t now = millis();
  if (now - gLastModeToggle > 4000)
  {
    gLastModeToggle = now;
    gAltPhase = !gAltPhase;
  }
  if (gAltPhase)
  {
    // show purple phase
    rgbIdleColor = CRGB(128, 0, 128);
    rgbIdlePeriod = 600;
  }
  else
  {
    // show blue phase
    rgbIdleColor = CRGB::Blue;
    rgbIdlePeriod = 600;
  }
}

extern "C" void wifiLedOnConnected()
{
  gStaConnected = true;
  applyScheme();
}

extern "C" void wifiLedOnDisconnected()
{
  gStaConnected = false;
  applyScheme();
}

extern "C" void wifiLedOnApStarted()
{
  gApActive = true;
  applyScheme();
}

// Helper to be called periodically from loop() if we want dynamic alternation
void wifi_led_poll()
{
  if (gStaConnected && gApActive)
    applyScheme();
}

#else
// Stubs when feature disabled or no RGB LED
extern "C" void wifiLedOnConnected() {}
extern "C" void wifiLedOnDisconnected() {}
extern "C" void wifiLedOnApStarted() {}
void wifi_led_poll() {}
#endif
