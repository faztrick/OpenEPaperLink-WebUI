// Compatibility wrapper to include ArduinoJson while silencing deprecation warnings
// coming from ArduinoJson's compatibility typedefs (StaticJsonDocument marked deprecated).
// This avoids a large, risky refactor to DynamicJsonDocument across the codebase.
#pragma once

#if defined(__clang__) || defined(__GNUC__)
#pragma GCC diagnostic push
#pragma GCC diagnostic ignored "-Wdeprecated-declarations"
#endif

#include <ArduinoJson.h>

#if defined(__clang__) || defined(__GNUC__)
#pragma GCC diagnostic pop
#endif
