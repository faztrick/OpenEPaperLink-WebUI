#pragma once

#include <ArduinoJson.h>

// ArduinoJson compatibility layer for v6 vs v7
#if ARDUINOJSON_VERSION_MAJOR >= 7
// ArduinoJson v7 compatibility
using CompatJsonDocument = JsonDocument;

// Helper functions for v7 syntax
inline JsonArray createNestedArray(JsonDocument& doc, const char* key) {
    return doc[key].to<JsonArray>();
}

inline JsonObject createNestedObject(JsonArray& arr) {
    return arr.add<JsonObject>();
}

inline JsonObject createNestedObject(JsonDocument& doc, const char* key) {
    return doc[key].to<JsonObject>();
}

#define COMPAT_JSON_DOCUMENT(name, size) JsonDocument name

#else
// ArduinoJson v6 compatibility
using CompatJsonDocument = DynamicJsonDocument;

// Use native v6 functions
#define createNestedArray(doc, key) doc.createNestedArray(key)
#define createNestedObject(doc, key) doc.createNestedObject(key)

#define COMPAT_JSON_DOCUMENT(name, size) DynamicJsonDocument name(size)

#endif
