#include <Arduino.h>

#ifdef USE_DUMMY_LEDS
// Dummy LED functions for simulation - no FastLED dependency
inline void ledTask(void* parameter) {}
inline void setBrightness(int brightness) {}
inline void updateBrightnessFromConfig() {}
inline void ledcSet(uint8_t channel, uint8_t brightness) {}
inline void quickBlink(uint8_t repeat) {}
inline void addFadeMono(uint8_t value) {}
// Dummy CRGB struct for compatibility
struct CRGB_dummy {
    uint8_t r, g, b;
    CRGB_dummy(uint8_t red = 0, uint8_t green = 0, uint8_t blue = 0) : r(red), g(green), b(blue) {}
    
    // Color constants for compatibility
    static const CRGB_dummy Red;
    static const CRGB_dummy Green;
    static const CRGB_dummy Blue;
    static const CRGB_dummy Yellow;
    static const CRGB_dummy White;
    static const CRGB_dummy Black;
};

// Define color constants
inline const CRGB_dummy CRGB_dummy::Red(255, 0, 0);
inline const CRGB_dummy CRGB_dummy::Green(0, 255, 0);
inline const CRGB_dummy CRGB_dummy::Blue(0, 0, 255);
inline const CRGB_dummy CRGB_dummy::Yellow(255, 255, 0);
inline const CRGB_dummy CRGB_dummy::White(255, 255, 255);
inline const CRGB_dummy CRGB_dummy::Black(0, 0, 0);

#define CRGB CRGB_dummy
inline void shortBlink(CRGB cname) {}
inline void showColorPattern(CRGB colorone, CRGB colortwo, CRGB colorthree) {}
inline void rgbIdle() {}
inline void addFadeColor(CRGB cname) {}
#else

#ifdef HAS_RGB_LED
#define FASTLED_INTERNAL
#include <FastLED.h>
#endif

const uint8_t PROGMEM gamma8[] = {
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1,
    1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 2,
    2, 3, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 5, 5, 5,
    5, 6, 6, 6, 6, 7, 7, 7, 7, 8, 8, 8, 9, 9, 9, 10,
    10, 10, 11, 11, 11, 12, 12, 13, 13, 13, 14, 14, 15, 15, 16, 16,
    17, 17, 18, 18, 19, 19, 20, 20, 21, 21, 22, 22, 23, 24, 24, 25,
    25, 26, 27, 27, 28, 29, 29, 30, 31, 32, 32, 33, 34, 35, 35, 36,
    37, 38, 39, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 50,
    51, 52, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 66, 67, 68,
    69, 70, 72, 73, 74, 75, 77, 78, 79, 81, 82, 83, 85, 86, 87, 89,
    90, 92, 93, 95, 96, 98, 99, 101, 102, 104, 105, 107, 109, 110, 112, 114,
    115, 117, 119, 120, 122, 124, 126, 127, 129, 131, 133, 135, 137, 138, 140, 142,
    144, 146, 148, 150, 152, 154, 156, 158, 160, 162, 164, 167, 169, 171, 173, 175,
    177, 180, 182, 184, 186, 189, 191, 193, 196, 198, 200, 203, 205, 208, 210, 213,
    215, 218, 220, 223, 225, 228, 231, 233, 236, 239, 241, 244, 247, 249, 252, 255};

void ledTask(void* parameter);
void setBrightness(int brightness);
void updateBrightnessFromConfig();
void ledcSet(uint8_t channel, uint8_t brightness);

#ifdef HAS_RGB_LED
extern CRGB rgbIdleColor;
extern uint16_t rgbIdlePeriod;
void shortBlink(CRGB cname);
void showColorPattern(CRGB colorone, CRGB colortwo, CRGB colorthree);
void rgbIdle();
void addFadeColor(CRGB cname);
#endif

void quickBlink(uint8_t repeat);
void addFadeMono(uint8_t value);

#endif
