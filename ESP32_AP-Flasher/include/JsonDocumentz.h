#pragma once

#include <ArduinoJson.h>

// Compatibility shim: provide JsonDocumentz that mimics the old
// DynamicJsonDocument behavior (ArduinoJson v6) while also working with
// ArduinoJson v7 where the document API changed.
//
// Goals:
// - Allow code that does `JsonDocumentz doc;` to compile with both v6 and v7.
// - Provide a few frequently-used legacy helpers (createNestedArray/createNestedObject,
//   containsKey, capacity, memoryUsage, garbageCollect, shrinkToFit) when building
//   against ArduinoJson v7 so the rest of the codebase needs minimal edits.
namespace JsonCompat {

#if defined(ARDUINOJSON_VERSION_MAJOR) && ARDUINOJSON_VERSION_MAJOR >= 7

// Use the compatibility DynamicJsonDocument when available in v7. The
// ArduinoJson v7 distribution provides a deprecated DynamicJsonDocument
// class (for backward compatibility) which accepts a size_t capacity and
// implements the older APIs used throughout this codebase.
struct JsonDocumentz : public ArduinoJson::DynamicJsonDocument {
    // Default capacity is conservative; adjust if you hit capacity errors.
    JsonDocumentz() : ArduinoJson::DynamicJsonDocument(512) {}
    using ArduinoJson::DynamicJsonDocument::DynamicJsonDocument;
};

#else  // ArduinoJson v6 (or unknown) - keep existing DynamicJsonDocument behaviour

struct JsonDocumentz : public ArduinoJson::DynamicJsonDocument {
    // Default capacity is conservative; adjust if you hit capacity errors.
    JsonDocumentz() : ArduinoJson::DynamicJsonDocument(512) {}
    // Inherit other constructors (e.g., JsonDocumentz(size_t))
    using ArduinoJson::DynamicJsonDocument::DynamicJsonDocument;
};

#endif  // ARDUINOJSON_VERSION_MAJOR

}  // namespace JsonCompat

using JsonDocumentz = JsonCompat::JsonDocumentz;
