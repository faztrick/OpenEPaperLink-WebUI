#include "websocket.h"
#include "webflasher.h" // for handleWSdata
#include "web.h"        // ws helpers and globals

#include <WiFiUdp.h>
#include <Preferences.h>

// Define the global websocket if not already defined elsewhere
AsyncWebSocket ws("/ws");

// Optional UDP log broadcast (for wireless log mirroring to C6/C3 receivers)
static WiFiUDP g_logUdp;
static IPAddress g_logIp;
static uint16_t g_logPort = 0;
static bool g_logUdpEnabled = false;
static bool g_logUdpBegun = false;

static void loadLogUdpPrefs()
{
  Preferences p;
  if (p.begin("logcfg", true))
  {
    String ip = p.getString("ip", "");
    g_logPort = p.getUShort("port", 0);
    g_logUdpEnabled = p.getBool("enabled", false);
    p.end();
    if (ip.length() > 0)
    {
      g_logIp.fromString(ip);
    }
  }
}

static void saveLogUdpPrefs()
{
  Preferences p;
  if (p.begin("logcfg", false))
  {
    p.putString("ip", g_logIp.toString());
    p.putUShort("port", g_logPort);
    p.putBool("enabled", g_logUdpEnabled);
    p.end();
  }
}

// Strong log helpers override the weak defaults in web_stubs.cpp
void wsSerial(const String &text)
{
  // Always print to serial
  Serial.println(text);
  // Broadcast to websocket clients if any
  ws.textAll(text);
  // Optionally mirror via UDP for wireless receivers (e.g., C6/C3 with display)
  if (g_logUdpEnabled && g_logIp && g_logPort != 0)
  {
    if (!g_logUdpBegun)
    {
      // Use ephemeral source port
      g_logUdp.begin(0);
      g_logUdpBegun = true;
    }
    g_logUdp.beginPacket(g_logIp, g_logPort);
    g_logUdp.write((const uint8_t *)text.c_str(), text.length());
    g_logUdp.endPacket();
  }
}

void wsSerial(const String &text, const String &color)
{
  // Keep serial uncolored
  Serial.println(text);
  // Send as plain text to websocket to avoid breaking existing UIs
  ws.textAll(text);
  // Mirror via UDP with a simple "color|message" prefix for receivers that care
  if (g_logUdpEnabled && g_logIp && g_logPort != 0)
  {
    if (!g_logUdpBegun)
    {
      g_logUdp.begin(0);
      g_logUdpBegun = true;
    }
    String payload = color + "|" + text;
    g_logUdp.beginPacket(g_logIp, g_logPort);
    g_logUdp.write((const uint8_t *)payload.c_str(), payload.length());
    g_logUdp.endPacket();
  }
}

void wsSetLogUdpTarget(const String &ip, uint16_t port, bool enabled)
{
  if (!ip.isEmpty())
  {
    g_logIp.fromString(ip);
  }
  g_logPort = port;
  g_logUdpEnabled = enabled;
  saveLogUdpPrefs();
}

void wsGetLogUdpConfig(String &ip, uint16_t &port, bool &enabled)
{
  ip = g_logIp.toString();
  port = g_logPort;
  enabled = g_logUdpEnabled;
}

void init_websocket(AsyncWebServer &server)
{
  // Attach event handler(s)
#ifdef HAS_EXT_FLASHER
  ws.onEvent([](AsyncWebSocket *server, AsyncWebSocketClient *client, AwsEventType type, void *arg, uint8_t *data, size_t len)
             {
    if (type == WS_EVT_DATA) handleWSdata(data, len, client); });
#endif

  // Ensure the websocket is registered with the server
  server.addHandler(&ws);

  // Load persisted UDP log settings at startup
  loadLogUdpPrefs();
}
