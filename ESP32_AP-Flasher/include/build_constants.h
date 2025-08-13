#pragma once

// Build information constants
#define BUILD_VERSION "1.0.0"
#define BUILD_AUTHOR "ESP32-AP-Flasher"
#ifndef BUILD_TIME
#define BUILD_TIME __DATE__ " " __TIME__
#endif

// Configuration constants
#define INPUT_BUFFER_SIZE 256
#define MAX_INPUT_LENGTH 200
#define AP_CHECK_INTERVAL_MS 5000
#define COMMAND_TIMEOUT_MS 30000

// JSON buffer sizes
#define SMALL_JSON_SIZE 512
#define MEDIUM_JSON_SIZE 1024
#define LARGE_JSON_SIZE 2048

// Logging macro
#define SAFE_LOG(fmt, ...) Serial.printf(fmt, ##__VA_ARGS__)
