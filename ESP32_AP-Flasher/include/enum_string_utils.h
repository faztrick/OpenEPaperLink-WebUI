#ifndef ENUM_STRING_UTILS_H
#define ENUM_STRING_UTILS_H

#include <Arduino.h>

/**
 * Generic utility for converting between enums and strings
 * Reduces code duplication across multiple enum conversion functions
 */
template <typename EnumType>
class EnumStringConverter {
   public:
    struct EnumMapping {
        EnumType enumValue;
        const char* stringValue;
    };

   private:
    const EnumMapping* mappings;
    size_t count;
    EnumType unknownValue;

   public:
    EnumStringConverter(const EnumMapping* maps, size_t cnt, EnumType unknown)
        : mappings(maps), count(cnt), unknownValue(unknown) {}

    String toString(EnumType value) const {
        for (size_t i = 0; i < count; i++) {
            if (mappings[i].enumValue == value) {
                return String(mappings[i].stringValue);
            }
        }
        return String("Unknown");
    }

    EnumType fromString(const String& str) const {
        for (size_t i = 0; i < count; i++) {
            if (str == mappings[i].stringValue) {
                return mappings[i].enumValue;
            }
        }
        return unknownValue;
    }
};

/**
 * Module initialization utilities
 * Provides consistent logging for module initialization
 */
class ModuleInitializer {
   public:
    static void logInitStart(const String& moduleName) {
        Serial.printf("[INIT] Starting %s...\n", moduleName.c_str());
    }

    static void logInitSuccess(const String& moduleName) {
        Serial.printf("[INIT] ✓ %s completed\n", moduleName.c_str());
    }

    static void logInitError(const String& moduleName, const String& error = "") {
        if (error.length() > 0) {
            Serial.printf("[INIT] ✗ %s failed: %s\n", moduleName.c_str(), error.c_str());
        } else {
            Serial.printf("[INIT] ✗ %s failed\n", moduleName.c_str());
        }
    }
};

#endif  // ENUM_STRING_UTILS_H
