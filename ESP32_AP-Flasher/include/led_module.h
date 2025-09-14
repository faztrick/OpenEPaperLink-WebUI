// led_module.h - Modular LED control (mono or RGB) for toolkit
#pragma once

#include <Arduino.h>
#include <ArduinoJson.h>
#include "module_manager.h"
#include "leds.h"

class LEDModule : public ModuleInterface {
private:
    bool initialized = false;
    bool started = false;
    uint8_t r=0,g=0,b=0; // cached color (for RGB)
    uint8_t brightness = 128;
    bool rgbAvailable = false;
    uint32_t startMillis = 0;
    String lastError;
public:
    bool initialize() override;
    bool start() override;
    bool stop() override;
    bool cleanup() override;

    ModuleInfo getInfo() const override;
    ModuleType getType() const override { return ModuleType::HARDWARE; }
    ModuleState getState() const override;
    bool isHealthy() const override { return initialized && lastError.isEmpty(); }

    void registerWebHandlers(AsyncWebServer &server) override;
    void update() override { /* future animation */ }
    String getStatus() const override;
    String getConfig() const override { return getStatus(); }
    bool setConfig(const String &cfg) override; // accepts same JSON as set endpoint
    void getMetrics(JsonObject &m) const override;

    // Direct control helpers
    void apply(uint8_t nr, uint8_t ng, uint8_t nb, uint8_t br, bool persist);
};

void registerLEDModule();
