# Copilot Instructions for ESP32 AP-Flasher Project

## Project Overview

The ESP32 AP-Flasher is a comprehensive embedded IoT firmware project that manages electronic paper (e-ink) tags through wireless communication. Built on ESP32-S3/C6 platforms with the Arduino framework and PlatformIO build system, this project creates an Access Point (AP) for managing hundreds of e-paper display tags via RF communication protocols.

## Architecture Patterns

### Modular System Architecture
- **Module Manager System**: Uses `ModuleInterface` base class for pluggable components
  - Located in `include/module_manager.h` and `src/module_manager.cpp`
  - Lifecycle: `initialize()` → `start()` → `update()` → `stop()` → `cleanup()`
  - Capabilities: web handlers, task handlers, event handlers, config interface
  - Example: `C6Module` in `src/c6_module.cpp` for ESP32-C6 communication

### Hardware Abstraction
- **Feature Flags**: Extensive use of `#ifdef` blocks for optional hardware
  - Examples: `HAS_TFT`, `HAS_RGB_LED`, `HAS_C6`, `HAS_RC522`, `HAS_IR_REMOTE`
  - Check `platformio.ini` for build_flags defining hardware capabilities
- **Pin Configuration**: Hardware-specific pin mappings in platformio.ini environments

### Build System (PlatformIO)
- **Primary Environments**:
  - `OutdoorAP`: Production build with full feature set
  - `WokwiAP`: Simulation build optimized for Wokwi emulator
- **Configuration**: `platformio.ini` defines board settings, feature flags, and dependencies

## Communication Protocols

### RF Communication Stack
- **Tag Protocol**: Custom wireless protocol for e-paper tag communication
  - Core files: `src/newproto.cpp`, `src/serialap.cpp`
  - Command system: `sendTagCommand()` for tag operations (reboot, LED flash, content update)
  - Queue system: Asynchronous command processing with `addRXQueue()`

### Web Interface
- **AsyncWebServer**: Primary web framework (`src/web.cpp`)
- **WebSocket Communication**: Real-time updates via `ws` object
- **API Organization**: Grouped endpoints by functionality:
  - `setupSystemEndpoints()`: System information and control
  - `setupTagManagementEndpoints()`: Tag database and commands
  - `setupHardwareFeatureEndpoints()`: Hardware feature control
  - `setupModuleManagementAPI()`: Dynamic module control

### Frontend Architecture
- **Main Application**: `web-ui/src/main-app.js` - Central app coordination
- **API Manager**: `web-ui/src/api-manager.js` - Backend communication abstraction
- **Real-time Updates**: WebSocket integration for live tag status

## Data Management

### Tag Database System
- **Tag Records**: Central `tagDB` vector containing `tagRecord` objects
- **Storage**: Persistent storage via `storage.h` utilities
- **Content Generation**: `src/contentmanager.cpp` handles display content creation
- **Content Types**: Weather, calendars, QR codes, images, RSS feeds (mode-based switching)

### Configuration Management
- **Centralized Config**: `config` object with web-configurable parameters
- **Storage Utilities**: Recently consolidated into `StorageUtils` class
- **Validation**: Built-in parameter validation and error handling

## Recent Optimizations (Critical Context)

### Code Consolidation (60% Reduction)
Per `OPTIMIZATION_REPORT.md`, recent major refactoring:
- **Utility Consolidation**: 7 utility files → 2 optimized modules
  - `core_utilities.h/.cpp`: Thread-safe core operations with mutex protection
  - `web_utilities.h/.cpp`: Web request handling and response utilities
  - `storage_utils.h/.cpp`: Unified storage operations with validation
- **Namespace Organization**: `CoreUtils`, `WebUtils`, `StorageManager` namespaces
- **Duplicate Elimination**: Removed redundant WiFi/serial command handlers

### Module System Integration
- **Dynamic Registration**: Modules register via `ModuleManager::registerModule()`
- **Dependency Resolution**: Automatic module dependency handling
- **Health Monitoring**: Built-in module health checks and error reporting
- **Web API**: REST endpoints for module control (`/api/modules`)

## Development Guidelines

### Code Structure
```cpp
// Standard module pattern
class MyModule : public ModuleInterface {
public:
    bool initialize() override;
    bool start() override;
    ModuleInfo getInfo() const override;
    void registerWebHandlers(AsyncWebServer& server) override;
};
```

### Hardware Feature Pattern
```cpp
#ifdef HAS_NEW_FEATURE
    // Feature implementation
    server.on("/new_feature", HTTP_GET, handleNewFeature);
#endif
```

### API Endpoint Pattern
```cpp
void setupMyEndpoints(AsyncWebServer& server) {
    server.on("/api/my_endpoint", HTTP_GET, [](AsyncWebServerRequest* request) {
        DynamicJsonDocument doc(512);
        doc["success"] = true;
        // Build response
        String response;
        serializeJson(doc, response);
        request->send(200, "application/json", response);
    });
}
```

### Storage Operations
```cpp
// Use consolidated storage utilities
StorageUtils& storage = StorageUtils::getInstance();
storage.enableDebugLogging(true);
String value = STORAGE_GET_STRING("namespace", "key", "default");
STORAGE_SET_STRING("namespace", "key", "value");
```

## Testing and Simulation

### Wokwi Integration
- **Emulation Setup**: `wokwi/diagram.json` for hardware simulation
- **Build Target**: Use `WokwiAP` environment for simulation builds
- **Debug Support**: GDB debugging configuration in `.vscode/`

### Module Testing
- **Health Checks**: Use `isHealthy()` method for module status
- **Diagnostic API**: `/api/modules/status` for system health monitoring
- **Error Reporting**: Built-in error handling with detailed logging

## Key Files Reference

### Core Architecture
- `src/main.cpp`: Application entry point and main loop
- `src/module_manager.cpp`: Dynamic module system implementation
- `include/module_interface.h`: Base interface for all modules
- `platformio.ini`: Build configuration and hardware feature definitions

### Communication Layer
- `src/newproto.cpp`: RF protocol implementation for tag communication
- `src/serialap.cpp`: Access Point serial communication handling
- `src/web.cpp`: Web server and API endpoint definitions
- `web-ui/src/main-app.js`: Frontend application coordination

### Content and Data
- `src/contentmanager.cpp`: E-paper display content generation
- `src/tag_db.cpp`: Tag database management and persistence
- `data/`: Static web assets and configuration files

### Recent Optimizations
- `OPTIMIZATION_REPORT.md`: Detailed optimization documentation
- `RESTRUCTURING_SUMMARY.md`: Code consolidation summary

## Common Operations

### Adding New Hardware Features
1. Define feature flag in `platformio.ini` (e.g., `HAS_NEW_FEATURE`)
2. Add conditional compilation blocks in relevant source files
3. Create endpoint handler in appropriate setup function
4. Add frontend integration in `api-manager.js`
5. Update feature detection in `/get_ap_config` endpoint

### Adding New Modules
1. Inherit from `ModuleInterface` in `include/module_manager.h`
2. Implement required lifecycle methods
3. Register module in initialization code using `moduleManager.registerModule()`
4. Add module-specific configuration and web handlers
5. Include module in build via appropriate `#ifdef` blocks

### Debugging Communication Issues
1. Check tag database status via WebSocket messages
2. Use serial console for RF protocol debugging
3. Monitor module health via `/api/modules/status`
4. Verify hardware feature flags in build configuration

## Performance Considerations
- **Memory Management**: Use PSRAM for large operations, monitor heap usage
- **Threading**: Core operations use mutex protection for thread safety
- **Caching**: Web responses cached appropriately (static assets: 7 days, dynamic: varies)
- **Queue Management**: Asynchronous command processing prevents blocking operations

Remember: This codebase has undergone significant optimization. Always check the latest consolidated utilities before implementing new functionality to avoid reintroducing duplicate code patterns.
