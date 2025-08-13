#ifdef WOKWI_SIMULATION

// Stub implementations for missing symbols in Wokwi simulation

#include <Arduino.h>

// CRGB color constants stub
struct CRGB_dummy {
    static const uint32_t Orange = 0xFF6500;
    static const uint32_t Aqua = 0x00FFFF;
    static const uint32_t YellowGreen = 0x9ACD32;
    static const uint32_t Purple = 0x800080;
    static const uint32_t Red = 0xFF0000;
    static const uint32_t Black = 0x000000;
    static const uint32_t White = 0xFFFFFF;
    static const uint32_t Green = 0x00FF00;
    static const uint32_t Blue = 0x0000FF;
};

CRGB_dummy CRGB;

// RGB color variables stub
uint32_t rgbIdleColor = 0;
uint32_t rgbIdlePeriod = 767;

// Color pattern function stub
void showColorPattern(uint32_t color1, uint32_t color2, uint32_t color3) {
    // Simulation stub - do nothing
}

// Missing power pins stub
uint8_t powerPins2[] = {1, 2};
uint8_t powerPins3[] = {1, 2, 3};

// Send data function stub
void sendDataToClient(uint8_t* data, size_t length) {
    // Simulation stub - do nothing
}

// Content manager function stubs
void contentRunner() {
    // Simulation stub - do nothing
}

void checkVars() {
    // Simulation stub - do nothing
}

// LED function stubs
void ledTask(void* parameter) {
    // Simulation stub - do nothing
    vTaskDelete(NULL);
}

// Display function stubs
void yellow_ap_display_init() {
    // Simulation stub - do nothing
}

void yellow_ap_display_loop() {
    // Simulation stub - do nothing
}

// Config function stub
void updateBrightnessFromConfig() {
    // Simulation stub - do nothing
}

// Flasher function stub
void flash_binary(String& filename, unsigned int offset) {
    // Simulation stub - do nothing
}

// LED effects stub
void addFadeMono(unsigned char value) {
    // Simulation stub - do nothing
}

// IR Interface stub - need to include the header and provide the class stub
#include "ir_interface.h"

// Provide a stub implementation for IRInterface::getProfileList()
std::vector<String> IRInterface::getProfileList() {
    std::vector<String> emptyList;
    return emptyList;
}

#endif  // WOKWI_SIMULATION
