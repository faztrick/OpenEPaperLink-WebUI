#pragma once

// Compatibility shims for WiFi mode enums across Arduino-ESP32 and ESP-IDF versions.
// Some cores expose WIFI_AP_STA/WIFI_STA/WIFI_AP macros, others use WIFI_MODE_* enums
// like WIFI_MODE_APSTA, WIFI_MODE_STA, WIFI_MODE_AP. This header normalizes both so
// the rest of the project can use either without build breaks.

#include <WiFi.h>
#include <esp_wifi.h>
#include <esp_wifi_types.h>

// Map legacy/alternative naming if missing

// Define WIFI_MODE_APSTA from base flags when not provided by framework
#ifndef WIFI_MODE_APSTA
#if defined(WIFI_MODE_AP) && defined(WIFI_MODE_STA)
#define WIFI_MODE_APSTA ((wifi_mode_t)(WIFI_MODE_AP | WIFI_MODE_STA))
#endif
#endif

// Ensure WIFI_AP_STA macro exists (prefer framework's own if present)
#ifndef WIFI_AP_STA
#ifdef WIFI_MODE_APSTA
#define WIFI_AP_STA WIFI_MODE_APSTA
#elif defined(WIFI_MODE_AP) && defined(WIFI_MODE_STA)
#define WIFI_AP_STA ((wifi_mode_t)(WIFI_MODE_AP | WIFI_MODE_STA))
#endif
#endif

// Ensure WIFI_STA/WIFI_AP convenience macros exist
#ifndef WIFI_STA
#ifdef WIFI_MODE_STA
#define WIFI_STA WIFI_MODE_STA
#endif
#endif

#ifndef WIFI_AP
#ifdef WIFI_MODE_AP
#define WIFI_AP WIFI_MODE_AP
#endif
#endif

// Some cores may not expose NAN/MAX; provide safe fallbacks to allow compiling.
#ifndef WIFI_MODE_NAN
#define WIFI_MODE_NAN ((wifi_mode_t)0)
#endif

#ifndef WIFI_MODE_MAX
// Not used programmatically here; define to known max bitmask combination for safety
#if defined(WIFI_MODE_AP) && defined(WIFI_MODE_STA)
#define WIFI_MODE_MAX ((wifi_mode_t)(WIFI_MODE_AP | WIFI_MODE_STA))
#else
#define WIFI_MODE_MAX ((wifi_mode_t)0xFF)
#endif
#endif
