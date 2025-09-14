// led_module.cpp - LEDModule implementation
#include "led_module.h"
#include "storage.h"
#include <FS.h>
#ifndef SD_CARD_ONLY
#include <LittleFS.h>
#endif
#include "web.h"

static const char *LED_CONFIG_PATH = "/current/led_config.json";

bool LEDModule::initialize()
{
#ifdef HAS_RGB_LED
    rgbAvailable = true;
#else
    rgbAvailable = false;
#endif
    // Attempt to load previous state
    if (contentFS && contentFS->exists(LED_CONFIG_PATH))
    {
        File f = contentFS->open(LED_CONFIG_PATH, "r");
        if (f)
        {
            JsonDocument doc;
            if (!deserializeJson(doc, f))
            {
                if (doc["brightness"].is<int>())
                    brightness = (uint8_t)doc["brightness"].as<int>();
                if (rgbAvailable && doc["r"].is<int>())
                {
                    r = (uint8_t)doc["r"].as<int>();
                    g = (uint8_t)doc["g"].as<int>();
                    b = (uint8_t)doc["b"].as<int>();
                }
            }
            f.close();
        }
    }
    setBrightness(brightness);
#ifdef HAS_RGB_LED
    CRGB c(r, g, b);
    showColorPattern(c, c, c); // static fill
#endif
    initialized = true;
    return true;
}

bool LEDModule::start()
{
    if (!initialized)
        return false;
    started = true;
    startMillis = millis();
    return true;
}

bool LEDModule::stop()
{
    started = false;
#ifdef HAS_RGB_LED
    showColorPattern(CRGB::Black, CRGB::Black, CRGB::Black);
#endif
    return true;
}

bool LEDModule::cleanup()
{
    started = false;
    initialized = false;
    return true;
}

ModuleInfo LEDModule::getInfo() const
{
    ModuleInfo i;
    i.name = "LEDModule";
    i.version = "0.1";
    i.description = "Hardware LED control";
    i.type = ModuleType::HARDWARE;
    i.state = getState();
    i.capabilities.hasWebHandlers = true;
    i.capabilities.hasStatusInterface = true;
    i.capabilities.hasConfigInterface = true;
    i.capabilities.requiresHardware = true;
    i.capabilities.isOptional = true;
    return i;
}

ModuleState LEDModule::getState() const
{
    if (!initialized)
        return ModuleState::UNINITIALIZED;
    if (started)
        return ModuleState::ACTIVE;
    return ModuleState::INITIALIZED;
}

String LEDModule::getStatus() const
{
    JsonDocument doc;
    doc["module"] = "LEDModule";
    doc["initialized"] = initialized;
    doc["active"] = started;
    doc["brightness"] = brightness;
    doc["rgb"] = rgbAvailable;
    doc["r"] = r;
    doc["g"] = g;
    doc["b"] = b;
    doc["uptimeMs"] = started ? (uint32_t)(millis() - startMillis) : 0;
    if (!lastError.isEmpty())
        doc["error"] = lastError;
    String out;
    serializeJson(doc, out);
    return out;
}

bool LEDModule::setConfig(const String &cfg)
{
    JsonDocument doc;
    auto err = deserializeJson(doc, cfg);
    if (err)
    {
        lastError = err.c_str();
        return false;
    }
    bool persist = doc["persist"].is<bool>() ? doc["persist"].as<bool>() : false;
    int nr = doc["r"].is<int>() ? doc["r"].as<int>() : r;
    int ng = doc["g"].is<int>() ? doc["g"].as<int>() : g;
    int nb = doc["b"].is<int>() ? doc["b"].as<int>() : b;
    int br = doc["brightness"].is<int>() ? doc["brightness"].as<int>() : brightness;
    if (br < 0 || br > 255)
    {
        lastError = "brightness range";
        return false;
    }
    if (nr < 0 || nr > 255 || ng < 0 || ng > 255 || nb < 0 || nb > 255)
    {
        lastError = "color range";
        return false;
    }
    apply((uint8_t)nr, (uint8_t)ng, (uint8_t)nb, (uint8_t)br, persist);
    return true;
}

void LEDModule::getMetrics(JsonObject &m) const
{
    m["led.brightness"] = brightness;
    m["led.active"] = started;
    if (rgbAvailable)
    {
        m["led.r"] = r;
        m["led.g"] = g;
        m["led.b"] = b;
    }
}

void LEDModule::apply(uint8_t nr, uint8_t ng, uint8_t nb, uint8_t br, bool persist)
{
    brightness = br;
    setBrightness(brightness);
    r = nr;
    g = ng;
    b = nb;
#ifdef HAS_RGB_LED
    showColorPattern(CRGB(r, g, b), CRGB(r, g, b), CRGB(r, g, b));
#else
    // Mono: approximate luminosity and map to fade value
    addFadeMono(brightness);
#endif
    if (persist && contentFS)
    {
        JsonDocument j;
        j["brightness"] = brightness;
        if (rgbAvailable)
        {
            j["r"] = r;
            j["g"] = g;
            j["b"] = b;
        }
        xSemaphoreTake(fsMutex, portMAX_DELAY);
        File f = contentFS->open(LED_CONFIG_PATH, "w");
        if (f)
        {
            serializeJson(j, f);
            f.close();
        }
        xSemaphoreGive(fsMutex);
    }
}

void LEDModule::registerWebHandlers(AsyncWebServer &server)
{
    // Versioned endpoints
    server.on("/api/v1/led/status", HTTP_GET, [this](AsyncWebServerRequest *request)
              {
        String s = getStatus();
        request->send(200, "application/json", s); });
    server.on("/api/v1/led/set", HTTP_POST,
              // onRequest
              [this](AsyncWebServerRequest *request)
              {
            if (request->contentLength() == 0) {
                request->send(400, "application/json", "{\"success\":false,\"error\":\"empty body\"}");
            } },
              // onUpload (unused)
              nullptr,
              // onBody
              [this](AsyncWebServerRequest *request, uint8_t *data, size_t len, size_t index, size_t total)
              {
            static String body;
            if (index == 0) body.clear();
            body.reserve(total);
            for (size_t i = 0; i < len; ++i) body += (char)data[i];
            if (index + len == total) {
                bool ok = setConfig(body);
                String resp;
                if (ok) {
                    resp = "{\"success\":true}";
                } else {
                    resp = "{\"success\":false,\"error\":\"" + lastError + "\"}";
                }
                request->send(ok ? 200 : 400, "application/json", resp);
                body.clear();
            } });
    // Backwards compat shortcut (non-versioned) optional
    server.on("/api/led/status", HTTP_GET, [this](AsyncWebServerRequest *request)
              { request->send(200, "application/json", getStatus()); });
    server.on("/api/led/set", HTTP_POST, [this](AsyncWebServerRequest *request)
              { request->redirect("/api/v1/led/set"); });
}

void registerLEDModule() { moduleManager.registerModule(std::unique_ptr<ModuleInterface>(new LEDModule()), true, {}); }
