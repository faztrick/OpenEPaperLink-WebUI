# AI Coding Assistant Instructions for OpenEPaperLink ESP32 AP-Flasher

## Project Overview
This is an ESP32-S3/C6 based wireless access point and tag flasher for the OpenEPaperLink ecosystem. The firmware provides web interfaces, tag programming capabilities, WiFi management, and modular hardware interfaces (IR, RFID, displays).

## Architecture & Framework

### Modular Framework Architecture
- **Base Classes**: All modules inherit from `ModuleInterface` in `include/module_manager.h` or `EnhancedModuleBase` in `include/common_framework.h`
- **Lifecycle**: `initialize()` → `start()` → `stop()` → `cleanup()` with health monitoring
- **Module Types**: CORE, HARDWARE, COMMUNICATION, UI, UTILITY, EXTENSION
- **Registration**: Use `ModuleManager::getInstance().registerModule()` with dependency resolution

### Core Utilities Framework
- **Namespaced utilities** in `include/core_utilities.h`: `CoreUtils`, `ValidationUtils`, `StorageManager`, `SystemInfo`, `WiFiHelpers`, `LogUtils`
- **Configuration**: Use `CONFIG` global object with JSON persistence and validation
- **Threading**: FreeRTOS tasks with `TaskManager` for lifecycle management
- **Events**: Pub/sub system via `EventSystem` singleton

### Configuration Management
- **Centralized config**: Use `CentralizedConfigManager` with schema validation
- **Module configs**: `MODULE_CONFIG_GET/SET` macros for type-safe access
- **Storage**: NVS + LittleFS with automatic backup/restore
- **Web interface**: Schema-based auto-generated configuration UI

## Build System & Environments

### PlatformIO Configuration
- **Primary target**: `OutdoorAP` (ESP32-S3, 32MB flash, PSRAM)
- **Secondary target**: `ESP32_C6` (ESP32-C6, WiFi6, Thread/Zigbee ready)
- **Build command**: `pio run -e OutdoorAP` or use PowerShell scripts

### Build Scripts (PowerShell)
- **`compile.ps1`**: Full build + upload with optimizations (use `-FastBuild` for incremental)
- **`fast_compile.ps1`**: Fastest incremental builds
- **`upload_www_files.ps1`**: Web assets only
- **Key parameters**: `-ComPort COM10 -Environment OutdoorAP -FilesystemOnly -Monitor`

### File Structure
```
src/main.cpp          # Entry point with module initialization
include/              # Headers with framework and module definitions
src/                  # Implementation files
data/www/             # Web UI assets (auto-gzipped)
web-ui/               # Node.js development interface
espbinaries/          # Compiled firmware outputs
```

## Key Development Patterns

### Module Development
1. **Template**: Use `include/module_template.h` as starting point
2. **Configuration**: Define schema with `ConfigSchemaBuilder`
3. **Web API**: Register handlers in `registerWebHandlers(AsyncWebServer* server)`
4. **Events**: Subscribe with `eventSystem.subscribe()`, publish with `PUBLISH_MODULE_EVENT`
5. **Logging**: Use `MODULE_LOG_INFO/WARNING/ERROR` macros

### Hardware Interface Modules
- **Pin Management**: Use `PinManager::getInstance()` for centralized pin allocation
- **Communication**: Inherit from `CommunicationBase` for WiFi/IR/RFID interfaces
- **Statistics**: Built-in performance monitoring with `getMetrics()`

### Web Development
- **API Standards**: Use `WebAPI` namespace helpers for consistent JSON responses
- **CORS/Security**: Automatic headers via `addStandardHeaders()` and `addCorsHeaders()`
- **Rate Limiting**: Built-in with `checkRateLimit()`
- **Frontend**: React-based UI in `web-ui/` with Socket.IO for real-time updates

## Critical Development Workflows

### Local Development
```powershell
# Fast incremental build and upload
.\fast_compile.ps1 -ComPort COM10 -Monitor

# Web UI development server
cd web-ui && npm start

# Filesystem-only update (for web changes)
.\compile.ps1 -FilesystemOnly -ComPort COM10
```

### Debugging
- **Serial Monitor**: `pio device monitor -p COM10`
- **Web logs**: Real-time via WebSocket at `ws://device-ip/ws`
- **Stack traces**: ESP32 exception decoder enabled
- **Memory**: Built-in heap monitoring with warnings

### Module Integration
1. Create module class inheriting from `EnhancedModuleBase`
2. Register configuration schema with `CentralizedConfigManager`
3. Register module: `ModuleManager::getInstance().registerModule(std::move(module))`
4. Add web handlers and event subscriptions
5. Update `platformio.ini` build flags if hardware-specific

## Project-Specific Conventions

### Memory Management
- **Stack sizes**: Increased for all tasks (LED: 4KB, AP: 8KB, BLE: 16KB)
- **PSRAM usage**: Enabled with `heap_caps_malloc_extmem_enable(64)`
- **Watchdog**: 30-second timeout during setup, feed with `yield()`

### Pin Configuration
- **Environment-specific**: Defined in `platformio.ini` build flags
- **IR pins**: `IR_SEND_PIN=4, IR_RECEIVE_PIN=5` (ESP32-C6)
- **RFID pins**: `RC522_SS_PIN=10, RC522_RST_PIN=9` (ESP32-C6)
- **Flasher pins**: UART-based with reset control

### Network & Communication
- **WiFi**: Dual-mode AP+STA with automatic reconnection
- **Web server**: AsyncWebServer on port 80 with WebSocket
- **API endpoints**: RESTful with `/api/module/action` pattern
- **OTA updates**: ElegantOTA integration for firmware updates

## External Dependencies & Integration

### Hardware Libraries
- **FastLED**: RGB LED control with optimized patterns
- **IRremote**: Infrared communication with protocol support
- **MFRC522**: RFID/NFC card reader interface
- **AsyncWebServer**: Non-blocking web server with WebSocket

### Web Technologies
- **Frontend**: React + Socket.IO for real-time UI
- **Build tools**: Python scripts for web asset compression
- **Development**: Node.js server with hot reload

### File Systems
- **LittleFS**: Primary file system for web assets and configuration
- **NVS**: Non-volatile storage for system settings
- **Automatic backup**: Configuration backup/restore functionality

## Common Pitfalls & Solutions

### Memory Issues
- **Stack overflow**: Increase task stack sizes in `xTaskCreate()` calls
- **Heap fragmentation**: Use PSRAM for large allocations
- **Memory leaks**: Always use RAII patterns and smart pointers

### Build Issues
- **Cache problems**: Use `pio run -t clean` or `compile.ps1 -Clean`
- **COM port errors**: Check device manager, try different baud rates
- **Web asset issues**: Run `python gzip_wwwfiles.py` manually

### Module Development
- **Initialization order**: Declare dependencies in module registration
- **Configuration conflicts**: Use unique namespaces for each module
- **Event loops**: Avoid blocking operations in event handlers

Use these patterns consistently for maintainable, scalable code that integrates seamlessly with the existing framework.
