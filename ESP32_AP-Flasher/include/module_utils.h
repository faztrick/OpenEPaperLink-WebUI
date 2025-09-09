#ifndef MODULE_UTILS_H
#define MODULE_UTILS_H

#include <Arduino.h>
#include <ArduinoJson.h>
#include <vector>
#include <memory>
#include <functional>

/**
 * Module Utilities - Optimized helper functions and classes
 * Provides common functionality to reduce code duplication
 */

namespace ModuleUtils {

    /**
     * Fast string utilities
     */
    class StringUtils {
    public:
        // Faster string comparison for module names
        static bool equalsIgnoreCase(const String& a, const String& b) {
            if (a.length() != b.length()) return false;
            
            for (size_t i = 0; i < a.length(); i++) {
                if (tolower(a[i]) != tolower(b[i])) {
                    return false;
                }
            }
            return true;
        }

        // Fast string hash for module lookup
        static uint32_t hash(const String& str) {
            uint32_t hash = 5381;
            for (size_t i = 0; i < str.length(); i++) {
                hash = ((hash << 5) + hash) + str[i];
            }
            return hash;
        }

        // Safe string copy with bounds checking
        static void safeCopy(char* dest, const String& src, size_t maxLen) {
            size_t len = min(src.length(), maxLen - 1);
            strncpy(dest, src.c_str(), len);
            dest[len] = '\0';
        }
    };

    /**
     * Memory management utilities
     */
    class MemoryUtils {
    public:
        // Get free heap size in a safe way
        static size_t getFreeHeap() {
            return ESP.getFreeHeap();
        }

        // Get minimum free heap since boot
        static size_t getMinFreeHeap() {
            return ESP.getMinFreeHeap();
        }

        // Check if we have enough memory for operation
        static bool hasEnoughMemory(size_t required, float safetyMargin = 0.1f) {
            size_t available = getFreeHeap();
            size_t threshold = required + (required * safetyMargin);
            return available > threshold;
        }

        // Log memory usage
        static void logMemoryUsage(const String& context) {
            Serial.printf("[MEMORY] %s - Free: %u bytes, Min: %u bytes\n", 
                         context.c_str(), getFreeHeap(), getMinFreeHeap());
        }
    };

    /**
     * JSON utilities for configuration
     */
    class JsonUtils {
    public:
        // Safe JSON parsing with error handling
        static bool parseJson(const String& jsonString, JsonDocument& doc) {
            DeserializationError error = deserializeJson(doc, jsonString);
            if (error) {
                Serial.printf("[JSON] Parse error: %s\n", error.c_str());
                return false;
            }
            return true;
        }

        // Safe JSON serialization with size checking
        static bool serializeJson(const JsonDocument& doc, String& output, size_t maxSize = 4096) {
            if (doc.overflowed()) {
                Serial.println("[JSON] Document overflowed");
                return false;
            }

            size_t size = measureJson(doc);
            if (size > maxSize) {
                Serial.printf("[JSON] Document too large: %u > %u\n", size, maxSize);
                return false;
            }

            output.reserve(size + 1);
            serializeJson(doc, output);
            return true;
        }

        // Get string value with default
        static String getString(const JsonVariant& variant, const String& defaultValue = "") {
            return variant.is<String>() ? variant.as<String>() : defaultValue;
        }

        // Get integer value with default
        static int getInt(const JsonVariant& variant, int defaultValue = 0) {
            return variant.is<int>() ? variant.as<int>() : defaultValue;
        }

        // Get boolean value with default
        static bool getBool(const JsonVariant& variant, bool defaultValue = false) {
            return variant.is<bool>() ? variant.as<bool>() : defaultValue;
        }
    };

    /**
     * Logging utilities
     */
    class LogUtils {
    public:
        enum LogLevel {
            LOG_ERROR = 0,
            LOG_WARNING = 1,
            LOG_INFO = 2,
            LOG_DEBUG = 3
        };

        static LogLevel currentLevel;

        static void setLogLevel(LogLevel level) {
            currentLevel = level;
        }

        static void logError(const String& message) {
            if (currentLevel >= LOG_ERROR) {
                Serial.printf("[ERROR] %s\n", message.c_str());
            }
        }

        static void logWarning(const String& message) {
            if (currentLevel >= LOG_WARNING) {
                Serial.printf("[WARNING] %s\n", message.c_str());
            }
        }

        static void logInfo(const String& message) {
            if (currentLevel >= LOG_INFO) {
                Serial.printf("[INFO] %s\n", message.c_str());
            }
        }

        static void logDebug(const String& message) {
            if (currentLevel >= LOG_DEBUG) {
                Serial.printf("[DEBUG] %s\n", message.c_str());
            }
        }

        // Module-specific logging
        static void logModuleEvent(const String& moduleName, const String& event) {
            logInfo("Module '" + moduleName + "': " + event);
        }

        static void logModuleError(const String& moduleName, const String& error) {
            logError("Module '" + moduleName + "' error: " + error);
        }
    };

    /**
     * Performance monitoring utilities
     */
    class PerformanceUtils {
    private:
        static uint32_t startTime;
        
    public:
        // Start timing
        static void startTiming() {
            startTime = millis();
        }

        // Get elapsed time in milliseconds
        static uint32_t getElapsedMs() {
            return millis() - startTime;
        }

        // Log timing result
        static void logTiming(const String& operation) {
            uint32_t elapsed = getElapsedMs();
            LogUtils::logDebug("Performance: " + operation + " took " + String(elapsed) + "ms");
        }

        // Measure function execution time
        template<typename Func>
        static uint32_t measureFunction(Func func, const String& name = "") {
            startTiming();
            func();
            uint32_t elapsed = getElapsedMs();
            if (!name.isEmpty()) {
                LogUtils::logDebug("Function '" + name + "' took " + String(elapsed) + "ms");
            }
            return elapsed;
        }
    };

    /**
     * Configuration validation utilities
     */
    class ValidationUtils {
    public:
        // Validate module name
        static bool isValidModuleName(const String& name) {
            if (name.isEmpty() || name.length() > 32) return false;
            
            // Check for valid characters (alphanumeric and underscore)
            for (size_t i = 0; i < name.length(); i++) {
                char c = name[i];
                if (!isalnum(c) && c != '_') {
                    return false;
                }
            }
            return true;
        }

        // Validate version string
        static bool isValidVersion(const String& version) {
            if (version.isEmpty() || version.length() > 16) return false;
            
            // Simple version format validation (e.g., "1.0.0")
            int dotCount = 0;
            for (size_t i = 0; i < version.length(); i++) {
                char c = version[i];
                if (c == '.') {
                    dotCount++;
                } else if (!isdigit(c)) {
                    return false;
                }
            }
            return dotCount <= 2; // Max 2 dots for x.y.z format
        }

        // Validate JSON configuration
        static bool isValidJson(const String& json) {
            JsonDocument doc;
            return JsonUtils::parseJson(json, doc);
        }
    };

    /**
     * Error handling utilities
     */
    class ErrorUtils {
    public:
        // Standard error codes
        enum ErrorCode {
            SUCCESS = 0,
            INVALID_PARAMETER = 1,
            MODULE_NOT_FOUND = 2,
            INITIALIZATION_FAILED = 3,
            OPERATION_FAILED = 4,
            INSUFFICIENT_MEMORY = 5,
            INVALID_STATE = 6,
            TIMEOUT = 7
        };

        // Get error message for code
        static String getErrorMessage(ErrorCode code) {
            switch (code) {
                case SUCCESS: return "Success";
                case INVALID_PARAMETER: return "Invalid parameter";
                case MODULE_NOT_FOUND: return "Module not found";
                case INITIALIZATION_FAILED: return "Initialization failed";
                case OPERATION_FAILED: return "Operation failed";
                case INSUFFICIENT_MEMORY: return "Insufficient memory";
                case INVALID_STATE: return "Invalid state";
                case TIMEOUT: return "Operation timeout";
                default: return "Unknown error";
            }
        }

        // Create error response JSON
        static String createErrorResponse(ErrorCode code, const String& details = "") {
            JsonDocument doc;
            doc["success"] = false;
            doc["error"] = getErrorMessage(code);
            doc["code"] = static_cast<int>(code);
            if (!details.isEmpty()) {
                doc["details"] = details;
            }

            String response;
            JsonUtils::serializeJson(doc, response);
            return response;
        }

        // Create success response JSON
        static String createSuccessResponse(const String& message = "Success") {
            JsonDocument doc;
            doc["success"] = true;
            doc["message"] = message;

            String response;
            JsonUtils::serializeJson(doc, response);
            return response;
        }
    };

    /**
     * Task management utilities
     */
    class TaskUtils {
    public:
        // Create a task with error handling
        static bool createTask(TaskFunction_t taskFunction, const char* taskName, 
                              uint32_t stackSize, void* parameters, 
                              UBaseType_t priority, TaskHandle_t* handle = nullptr) {
            
            // Check memory availability
            if (!MemoryUtils::hasEnoughMemory(stackSize)) {
                LogUtils::logError("Insufficient memory for task: " + String(taskName));
                return false;
            }

            BaseType_t result = xTaskCreate(taskFunction, taskName, stackSize, 
                                           parameters, priority, handle);
            
            if (result != pdPASS) {
                LogUtils::logError("Failed to create task: " + String(taskName));
                return false;
            }

            LogUtils::logInfo("Task created: " + String(taskName));
            return true;
        }

        // Delete a task safely
        static void deleteTask(TaskHandle_t handle) {
            if (handle != nullptr) {
                vTaskDelete(handle);
            }
        }

        // Get current task stack high water mark
        static uint32_t getStackHighWaterMark() {
            return uxTaskGetStackHighWaterMark(nullptr);
        }
    };

} // namespace ModuleUtils

// Initialize static members
namespace ModuleUtils {
    LogUtils::LogLevel LogUtils::currentLevel = LogUtils::LOG_INFO;
    uint32_t PerformanceUtils::startTime = 0;
}

#endif // MODULE_UTILS_H