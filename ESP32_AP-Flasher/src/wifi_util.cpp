// Implementation of WiFi helper utilities.
#include "wifi_util.h"
#include <WiFi.h>
#include <esp_wifi.h>

void rankCandidateNetworks(std::vector<std::pair<String, String>> &candidates)
{
  if (candidates.size() <= 1)
    return;
  wifi_mode_t mode;
  if (esp_wifi_get_mode(&mode) == ESP_OK)
  {
    if (mode == WIFI_MODE_AP)
      WiFi.mode(WIFI_AP_STA); // ensure scan possible
  }
  int16_t found = WiFi.scanNetworks(false, true);
  if (found < 0)
  {
    Serial.println("[wifi_util] Scan failed; keeping original order");
    WiFi.scanDelete();
    return;
  }
  struct Ranked
  {
    String ssid;
    String pass;
    int rssi;
    bool present;
  };
  std::vector<Ranked> ranked;
  ranked.reserve(candidates.size());
  for (auto &p : candidates)
  {
    int best = -300;
    bool present = false;
    for (int i = 0; i < found; ++i)
    {
      if (WiFi.SSID(i) == p.first)
      {
        int r = WiFi.RSSI(i);
        if (r > best)
        {
          best = r;
          present = true;
        }
      }
    }
    ranked.push_back({p.first, p.second, best, present});
  }
  std::stable_sort(ranked.begin(), ranked.end(), [](const Ranked &a, const Ranked &b)
                   {
        if (a.present != b.present) return a.present && !b.present;
        if (a.present && b.present) return a.rssi > b.rssi;
        return false; });
  candidates.clear();
  for (auto &r : ranked)
  {
    candidates.emplace_back(r.ssid, r.pass);
    if (r.present)
      Serial.printf("[wifi_util] Candidate '%s' RSSI %d dBm\n", r.ssid.c_str(), r.rssi);
    else
      Serial.printf("[wifi_util] Candidate '%s' not visible\n", r.ssid.c_str());
  }
  WiFi.scanDelete();
}

const char *wifiDisconnectReasonToString(uint8_t reason)
{
  switch (reason)
  {
  case WIFI_REASON_UNSPECIFIED:
    return "Unspecified";
  case WIFI_REASON_AUTH_EXPIRE:
    return "Auth expire";
  case WIFI_REASON_AUTH_LEAVE:
    return "Auth leave";
  case WIFI_REASON_ASSOC_EXPIRE:
    return "Assoc expire";
  case WIFI_REASON_ASSOC_TOOMANY:
    return "Assoc too many";
  case WIFI_REASON_NOT_AUTHED:
    return "Not authed";
  case WIFI_REASON_NOT_ASSOCED:
    return "Not assoc";
  case WIFI_REASON_ASSOC_LEAVE:
    return "Assoc leave";
  case WIFI_REASON_BEACON_TIMEOUT:
    return "Beacon timeout";
  case WIFI_REASON_NO_AP_FOUND:
    return "No AP found";
  case WIFI_REASON_AUTH_FAIL:
    return "Auth fail";
  case WIFI_REASON_ASSOC_FAIL:
    return "Assoc fail";
  case WIFI_REASON_HANDSHAKE_TIMEOUT:
    return "Handshake timeout";
  default:
    return "Unknown";
  }
}
