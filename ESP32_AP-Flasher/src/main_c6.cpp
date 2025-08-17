#include <Arduino.h>
#include <WiFi.h>
#include <WiFiUdp.h>

#ifndef LOG_UDP_PORT
#define LOG_UDP_PORT 15100
#endif

// Forward decls from udp_log_receiver.cpp (receiver optional on C6)
void startUdpLogReceiver();
void pollUdpLogReceiver();

// Simple UDP multicast logger to mirror C6 logs to peers (e.g. S3)
static WiFiUDP s_logTx;
static bool s_txReady = false;
static IPAddress s_mcast(239, 1, 2, 3); // administratively scoped multicast

static void logUdp(const char *msg)
{
  if (!s_txReady)
    return;
  // Prefix with module tag to help S3 annotate
  s_logTx.beginPacket(s_mcast, LOG_UDP_PORT);
  s_logTx.print("C6|");
  s_logTx.print(msg);
  s_logTx.endPacket();
}

static void ensureWiFi()
{
  // If WiFi is not connected, try to connect to stored creds
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
      // Fallback to AP so the S3 can still reach us on a known IP
      WiFi.mode(WIFI_AP);
      WiFi.softAP("OEPL-C6-Logger", "oepl1234");
      Serial.printf("[C6] Started fallback AP at %s\r\n", WiFi.softAPIP().toString().c_str());
      return;
    }
  }
  Serial.printf("[C6] WiFi connected: %s\r\n", WiFi.localIP().toString().c_str());
}

void setup()
{
  Serial.begin(115200);
  delay(50);
  Serial.println("\r\n[C6] Minimal UDP Log Receiver booting...");
  ensureWiFi();
  // Start UDP TX for log broadcast
  // Join multicast group for log streaming (Arduino 3.x API takes only group + port)
  if (s_logTx.beginMulticast(s_mcast, LOG_UDP_PORT))
  {
    s_txReady = true;
    Serial.println("[C6] UDP TX ready");
  }
  startUdpLogReceiver();
}

void loop()
{
  pollUdpLogReceiver();
  // Periodically emit a heartbeat log so S3 can display on TFT
  static unsigned long lastBeat = 0;
  if (millis() - lastBeat > 2000)
  {
    lastBeat = millis();
    logUdp("heartbeat ok");
  }
  delay(5);
}
