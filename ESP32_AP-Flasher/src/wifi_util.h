// Shared WiFi helper utilities extracted from wifi_module.cpp to reduce duplication.
// Provides network candidate ranking and disconnect reason string mapping.
#pragma once

#include <vector>
#include <Arduino.h>

// Rank candidate (ssid,password) pairs in-place based on current scan RSSI.
// Keeps original order for ties; prefers visible networks and stronger RSSI.
void rankCandidateNetworks(std::vector<std::pair<String, String>> &candidates);

// Convert an ESP32 WiFi disconnect reason code to a short human readable label.
const char *wifiDisconnectReasonToString(uint8_t reason);
