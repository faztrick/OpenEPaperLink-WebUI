#include "websocket.h"
#include "webflasher.h" // for handleWSdata
#include "web.h"        // ws helpers and globals

// Define the global websocket if not already defined elsewhere
AsyncWebSocket ws("/ws");

void init_websocket(AsyncWebServer &server) {
  // Attach event handler(s)
#ifdef HAS_EXT_FLASHER
  ws.onEvent([](AsyncWebSocket *server, AsyncWebSocketClient *client, AwsEventType type, void *arg, uint8_t *data, size_t len) {
    if (type == WS_EVT_DATA) handleWSdata(data, len, client);
  });
#endif

  // Note: ESPAsyncWebServer websockets do not require server.addHandler(&ws) when declared globally.
  // If needed, the implementation can add the handler here.
}
