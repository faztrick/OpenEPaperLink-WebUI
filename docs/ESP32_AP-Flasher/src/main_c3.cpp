#include <Arduino.h>
#include <WiFi.h>
#include <WiFiUdp.h>

#ifndef LOG_UDP_PORT
#define LOG_UDP_PORT 15100
#endif

// Forward decls from udp_log_receiver.cpp (receiver optional on C3)
void startUdpLogReceiver();
void pollUdpLogReceiver();

// Simple UDP multicast logger to mirror C3 logs to peers (e.g. S3)
static WiFiUDP s_logTx;
static bool s_txReady = false;
static IPAddress s_mcast(239, 1, 2, 3); // administratively scoped multicast

static void logUdp(const char *msg)
{
  if (!s_txReady)
    return;
  // Prefix with module tag to help S3 annotate
  s_logTx.beginPacket(s_mcast, LOG_UDP_PORT);
  s_logTx.print("C3|");
  s_logTx.print(msg);
  s_logTx.endPacket();
}

static void ensureWiFi()
{
  if (WiFi.getMode() == WIFI_MODE_NULL)
  {
    WiFi.mode(WIFI_STA);
  }
  if (WiFi.status() != WL_CONNECTED)
  {
    WiFi.begin();
    unsigned long start = millis();
    while (WiFi.status() != WL_CONNECTED && millis() - start < 10000)
    {
      delay(100);
    }
    if (WiFi.status() != WL_CONNECTED)
    {
      WiFi.mode(WIFI_AP);
      WiFi.softAP("OEPL-C3-Logger", "oepl1234");
      Serial.printf("[C3] Started fallback AP at %s\r\n", WiFi.softAPIP().toString().c_str());
      return;
    }
  }
  Serial.printf("[C3] WiFi connected: %s\r\n", WiFi.localIP().toString().c_str());
}

void setup()
{
  Serial.begin(115200);
  delay(50);
  Serial.println("\r\n[C3] Minimal UDP Log Sender booting...");
  ensureWiFi();
#if defined(ESP_ARDUINO_VERSION_MAJOR) && (ESP_ARDUINO_VERSION_MAJOR >= 3)
  if (s_logTx.beginMulticast(s_mcast, LOG_UDP_PORT))
#else
  if (s_logTx.beginMulticast(WiFi.localIP(), s_mcast, LOG_UDP_PORT))
#endif
  {
    s_txReady = true;
    Serial.println("[C3] UDP TX ready");
  }
  startUdpLogReceiver();
}

void loop()
{
  pollUdpLogReceiver();
  static unsigned long lastBeat = 0;
  if (millis() - lastBeat > 2000)
  {
    lastBeat = millis();
    logUdp("heartbeat ok");
  }
  delay(5);
}
