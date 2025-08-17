#include <Arduino.h>

#if defined(ENABLE_UDP_LOG_RECEIVER)

#include <WiFi.h>
#include <WiFiUdp.h>

#ifdef HAS_TFT
#include "ips_display.h"
#endif

#ifndef LOG_UDP_PORT
#define LOG_UDP_PORT 15100
#endif

// Multicast group for inter-device log streaming (C6/C3 -> S3)
#ifndef LOG_UDP_GROUP
#define LOG_UDP_GROUP IPAddress(239, 1, 2, 3)
#endif

static WiFiUDP s_logUdp;
static bool s_udpReady = false;

void startUdpLogReceiver()
{
  if (s_udpReady)
    return;
  // Prefer joining the multicast group so we can receive logs broadcast by peers
  // Arduino-ESP32 3.x has beginMulticast(group, port); 2.x had beginMulticast(localIP, group, port)
#if defined(ESP_ARDUINO_VERSION_MAJOR) && (ESP_ARDUINO_VERSION_MAJOR >= 3)
  if (s_logUdp.beginMulticast(LOG_UDP_GROUP, LOG_UDP_PORT))
#else
  if (s_logUdp.beginMulticast(WiFi.localIP(), LOG_UDP_GROUP, LOG_UDP_PORT))
#endif
  {
    s_udpReady = true;
    Serial.printf("[UDP-LOG] Joined mcast %s:%u\n", LOG_UDP_GROUP.toString().c_str(), (unsigned)LOG_UDP_PORT);
  }
  else
  {
    // Fallback: bind to unicast/broadcast if multicast join fails
    if (s_logUdp.begin(LOG_UDP_PORT))
    {
      s_udpReady = true;
      Serial.printf("[UDP-LOG] Listening on %u (no mcast)\n", (unsigned)LOG_UDP_PORT);
    }
    else
    {
      Serial.printf("[UDP-LOG] Failed to open UDP port %u\n", (unsigned)LOG_UDP_PORT);
    }
  }
}

void pollUdpLogReceiver()
{
  if (!s_udpReady)
    return;
  int psize = s_logUdp.parsePacket();
  if (psize <= 0)
    return;

  static char buf[512];
  int len = s_logUdp.read((uint8_t *)buf, sizeof(buf) - 1);
  if (len <= 0)
    return;
  buf[len] = '\0';

  // Payload format (from sender): either plain text or "color|message"
  const char *msg = buf;
  const char *sep = strchr(buf, '|');
  if (sep && sep - buf < 16)
  { // color is short token
    msg = sep + 1;
  }

  Serial.printf("[UDP-LOG] %s\n", msg);
#ifdef HAS_TFT
  TFTLog(String(msg));
#endif
}

#endif // ENABLE_UDP_LOG_RECEIVER
