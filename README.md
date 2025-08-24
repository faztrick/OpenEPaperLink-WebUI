# OpenEPaperLink ESP32 Access Point Firmware

# OpenEPaperLink ESP32 Access Point Firmware - AI Agent Instructions

This document provides guidance for AI coding agents working on the OpenEPaperLink ESP32 Access Point firmware.

## Terminal logging guideline

When running or showing terminal commands, always include the timestamp for the command execution so logs are traceable. Use the host's shell command to print a timestamp before or after the command. Examples:

- PowerShell (Windows):
  - Get a timestamp: `Get-Date -Format o`  # ISO 8601
  - Example: `Get-Date -Format o; npm run build`  # prints timestamp then runs command

- Bash (Linux/macOS):
  - Get a timestamp: `date --iso-8601=seconds` or `date -Iseconds`
  - Example: `date --iso-8601=seconds; npm run build`

Include these timestamps in logs, and when reporting command outputs paste the timestamped output so it's clear when each operation ran.

## Project Overview

This project is an ESP32-based access point for OpenEPaperLink electronic paper displays. It manages communication with the E-Paper tags, handles content updates, and provides a web interface for configuration and management. The firmware is built using PlatformIO and the Arduino framework.

### Key Features

- **E-Paper Tag Management**: Wireless communication with electronic paper displays
- **WiFi Access Point**: Provides both STA and AP modes for connectivity
- **Web Interface**: Comprehensive web UI for configuration and monitoring
- **OTA Updates**: Over-the-air firmware updates for ESP32-C6 modules
- **Module System**: Extensible module architecture for hardware features
- **Security**: Enhanced security with buffer overflow protection and safe string handling

## Key Technologies

- **Framework:** Arduino on ESP32
- **Build System:** PlatformIO
- **Web Server:** ESPAsyncWebServer for handling web requests and WebSockets.
- **Configuration:** Stored in LittleFS and NVS (Non-Volatile Storage).
- **Communication:** WiFi (STA and AP mode), WebSockets, UDP for device discovery.

## Core Architecture

The application is structured around several key components:

- **`src/main.cpp`**: The main entry point of the application. It initializes all subsystems.
- **`src/web.cpp`**: Manages the web server, WebSocket communication, and all HTTP API endpoints. This is the primary interface for user interaction.
- **`src/wifimanager.cpp`**: Handles WiFi connectivity, including connecting to an existing network and providing an access point for initial setup.
- **`src/tag_db.cpp`**: Manages the database of E-Paper tags, storing their state, configuration, and pending updates.
- **`src/c6_module.cpp`**: Handles ESP32-C6 module communication and OTA updates.
- **`src/module_manager.cpp`**: Extensible module system for hardware features and extensions.
- **`platformio.ini`**: The central configuration file for PlatformIO. It defines build environments, library dependencies, and compiler flags. Feature flags in this file are critical for enabling/disabling hardware support and software features.

### Module System Architecture

The project uses a modular architecture with these module types:

- **CORE**: Essential system modules (WiFi, web server, tag management)
- **HARDWARE**: Hardware interface modules (TFT, LED, sensors)
- **COMMUNICATION**: Network and radio modules (WiFi, BLE, SubGHz)
- **UI**: User interface modules (web UI, TFT display)
- **UTILITY**: Helper modules (logging, file management)
- **EXTENSION**: Third-party plugins and extensions

## Developer Workflows

### Building the Firmware

The project is built using PlatformIO. The primary build environment is `OutdoorAP`.

- **Build:** `pio run -e OutdoorAP`
- **Build and Upload:** `pio run -e OutdoorAP --target upload`
- **Clean:** `pio run --target clean`

### Testing and Simulation

Available tasks for testing:

- **Build for Emulation:** `PlatformIO: Build for Emulation`
- **Start Wokwi Simulator:** Simulates ESP32 hardware for testing
- **QEMU ESP32 Emulation:** Hardware-level emulation for debugging

### Debugging

- **Serial Monitor:** `pio device monitor`
- **Logging:** The firmware uses `Serial.println` for logging. WebSocket-based logging is also available via the web interface (`wsLog`, `wsErr`).
- **GDB Debugging:** Use the ESP32 GDB Debug Server task for hardware debugging

### Web UI

The web interface source code is located in the `wwwroot` directory. It's a single-page application that communicates with the ESP32 via RESTful APIs and WebSockets.

- **Key files:** `wwwroot/index.html`, `wwwroot/setup.html`, `wwwroot/setup.js`
- **API Endpoints:** Defined in `src/web.cpp`. Key endpoints include:
  - `/wifi_scan`: Scans for available WiFi networks.
  - `/save_wifi_config`: Saves WiFi credentials.
  - `/get_db`: Retrieves the tag database.
  - `/ws`: WebSocket endpoint for real-time updates.

## Project-Specific Conventions

- **Feature Flags:** The `platformio.ini` file uses a large number of C++ preprocessor defines (e.g., `-D HAS_TFT=1`) to control which features are compiled into the firmware. When adding or modifying features, check this file to see if a flag is needed.
- **Configuration Management:**
  - **AP Configuration:** `apconfig.json` in LittleFS, managed by `config` struct.
  - **WiFi Credentials:** Stored in NVS using the `Preferences` library.
  - **Tag Database:** `tagDB.json` in LittleFS.
- **Asynchronous Operations:** The web server is fully asynchronous. Avoid using `delay()` in web request handlers; use `vTaskDelay` or non-blocking code instead.
- **Memory Management:** Pay attention to memory usage, especially when dealing with JSON and file operations. Use `JsonDocument` with appropriate sizing. For large files, use streaming responses.
- **Security Best Practices:**
  - Use `snprintf()` instead of `sprintf()` to prevent buffer overflows
  - Use `strncpy()` instead of `strcpy()` for string operations
  - Always null-terminate strings and check buffer bounds
  - Initialize arrays with `memset()` to prevent undefined behavior

## External Dependencies

- **ESPAsyncWebServer:** For the web server. Note that this project uses specific forks, as defined in `platformio.ini`.
- **ArduinoJson:** For all JSON parsing and serialization.
- **TFT_eSPI:** For devices with a TFT display.
- **LittleFS:** The primary file system for storing web assets and configuration.

When making changes, be mindful of the interactions between these components. For example, a change to a web API in `src/web.cpp` will likely require a corresponding change in the JavaScript files in `wwwroot`.

## Operational reminder for agents

- Before running actions from the web UI or automation, check the repository `PROJECT_STATUS.md` for current status, blockers, and device list and update its `Last updated` timestamp if you change the state. Use PowerShell `Get-Date -Format o` when logging command timestamps.
