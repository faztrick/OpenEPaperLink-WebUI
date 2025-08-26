#ifndef WEBSOCKET_H
#define WEBSOCKET_H

#include <Arduino.h>
#include <ESPAsyncWebServer.h>

// Expose the global websocket and an init helper
extern AsyncWebSocket ws;
void init_websocket(AsyncWebServer &server);

#endif // WEBSOCKET_H
