# OpenEPaperLink ESP32 AP-Flasher Documentation

This directory contains the project documentation organized for easy reference.

## Main Documentation

- **[AI Agent Instructions](../.github/copilot-instructions.md)** - Comprehensive guide for AI coding agents working on this project

## Architecture Overview

The ESP32 AP-Flasher is built with a modular architecture consisting of:

### Core Components
- **Web Server** (`src/web.cpp`) - Handles HTTP/WebSocket communication
- **WiFi Manager** (`src/wifimanager.cpp`) - Manages network connectivity
- **Tag Database** (`src/tag_db.cpp`) - E-paper tag data management
- **C6 Module** (`src/c6_module.cpp`) - ESP32-C6 communication and OTA updates
- **Module Manager** (`src/module_manager.cpp`) - Extensible module system

### Build System
- **PlatformIO** configuration in `platformio.ini`
- Primary build environment: `OutdoorAP`
- Feature flags control hardware support compilation

### Security Enhancements
- Buffer overflow protection with safe string functions
- Bounds checking and null termination
- Memory management improvements

### WiFi Optimizations
- Enhanced scanning performance for ESP32-S3
- Signal strength sorting and filtering
- Asynchronous operations for better responsiveness

## Historical Documentation

See the `archive/` folder for detailed implementation summaries and change logs:

- WiFi scanning optimizations
- Security fixes and enhancements
- Module system implementation details
- C6 function analysis and fixes
- API endpoint improvements

## Development Workflows

### Building
```bash
pio run -e OutdoorAP                # Build firmware
pio run -e OutdoorAP --target upload  # Build and upload
```

### Testing
- Use Wokwi simulator for hardware testing
- QEMU ESP32 emulation for debugging
- GDB debugging support available

### Debugging
```bash
pio device monitor  # Serial monitoring
```

## Configuration

### Feature Flags
The project uses extensive preprocessor defines in `platformio.ini` to enable/disable features:
- `HAS_TFT=1` - TFT display support
- `HAS_RGB_LED=1` - RGB LED control
- `C6_OTA_FLASHING=1` - ESP32-C6 OTA capabilities

### Storage
- **LittleFS**: Web assets, configuration files
- **NVS**: WiFi credentials and persistent settings
- **JSON**: Tag database and configuration management

## API Endpoints

Key HTTP endpoints in `src/web.cpp`:
- `/wifi_scan` - Network scanning
- `/save_wifi_config` - WiFi configuration
- `/get_db` - Tag database access
- `/ws` - WebSocket real-time updates

For complete endpoint documentation, see the archived implementation summaries.
