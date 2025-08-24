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

Before running actions from the web UI or automation, check the repository `PROJECT_STATUS.md` for current status, blockers, and device list and update its `Last updated` timestamp if you change the state. Use PowerShell `Get-Date -Format o` when logging command timestamps.

## Unified Navigation & Device Card (shared-nav.js)

The Web UI now uses a single consolidated navigation/header injected by `shared-nav.js` across all modern pages under `web-ui/public/device/`.

Key points:

1. One Header Everywhere: Legacy per‑page `<header class="advanced-header">` blocks and `universal-menu.js` are being deprecated. New pages should not include them.
2. Automatic Injection: Include `<script src="shared-nav.js" defer></script>` in the `<head>` (before other page‑specific scripts is fine). The script injects the nav bar at the start of `<body>` along with dynamic status pills (current comms method & target).
3. Device Card Centralization: Device/method selection is owned by the shared nav + device card logic (see `device-card.js`). Do not duplicate selector widgets inside individual pages.
4. Link Set Source of Truth: Modify the `LINKS` array inside `shared-nav.js` to add/remove global pages. Avoid hard‑coding nav links in individual HTML files.
5. Exclusive Communication Method: Only one communication method (e.g., serial, network) should be active at a time—coordination logic lives in shared scripts; pages should read state rather than re‑implement toggles.
6. Styling: Shared nav injects its own scoped styles. Page CSS should not rely on the old `.advanced-header` class. If leftover CSS definitions exist they will be removed after full deprecation.
7. Migration Pattern: To migrate an old page: (a) remove the legacy header & any `<script src="universal-menu.js">`, (b) add `shared-nav.js`, (c) optionally insert a marker comment `<!-- Header replaced by shared-nav.js injection -->` for clarity.
8. Deprecation Notice: `universal-menu.js` will be replaced by a lightweight stub (or removed) once remaining test/demo pages are migrated. Do not add new dependencies on it.

Adding a New Page Checklist:

- Create the HTML file under `web-ui/public/device/`.
- Add core shared scripts you need (e.g., `constants.js`, `utils.js`, `app-core.js`, `main.js`).
- Add `<script src="shared-nav.js" defer></script>`.
- Implement page content inside a top‑level `<div class="container">` (consistent layout spacing).
- Avoid redefining global state or device selection controls.
- If the page needs periodic status display, read from existing localStorage keys or reuse helper functions instead of polling endpoints redundantly.

Troubleshooting:

- Nav Missing? Ensure `shared-nav.js` loaded (network tab) and no JavaScript error before DOMContentLoaded.
- Duplicate Headers? Remove any leftover static `<header>` markup from the file.
- Link Not Highlighted? The active link match uses `window.location.pathname` – ensure the file name matches the link href exactly (case sensitive on some hosts).

This section supersedes any older documentation referring to `universal-menu.js` or multiple per‑page headers.

## Global Selected Device Sidebar

All development pages (dashboard, wifi, flash, device, AI, AP list, build, development, logs, files, esp32c6, settings, peers, debug console) can display a consistent Selected Device card via `device-sidebar.js`. It reuses the existing device state managed by `app.js` (class `ESP32DevUI`).

Usage:

1. Include the script after `app.js` in the page:
  `<script src="device-sidebar.js"></script>`
2. If the page has an element with class `sidebar`, the Selected Device panel is prepended there. Otherwise a lightweight sidebar container is created automatically at the top of the main layout.
3. The card shows: name, IP, COM/Port, current communication mode (Serial/WiFi) with toggle buttons, and an LED Off action.
4. It listens to WebSocket events (`device-list`, `device-selected`, `device-removed`) and also performs a periodic refresh every 8s to capture local‑only changes.

Notes:

- No additional markup is required; a placeholder can optionally be added but is not necessary.
- Styling is scoped; it will not override existing device cards on the Devices page.
- The LED Off button calls the unified backend endpoint `/api/device/:id/led/off` which routes based on mode.
- Mode changes propagate through `setDeviceMode` ensuring backend persistence and UI re-render.

If you later introduce a global layout refactor (e.g., a universal left nav), the sidebar wrapper can be relocated without modifying the component logic—only placement code would change.
