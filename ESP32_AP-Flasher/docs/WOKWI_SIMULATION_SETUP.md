# Wokwi Simulation Setup for OpenEPaperLink ESP32-S3

## Overview
This document summarizes the setup and configuration for running the OpenEPaperLink ESP32 Access Point firmware in Wokwi simulation environment.

## Session Summary
- **Objective**: Set up Wokwi CLI simulation for ESP32-S3 OpenEPaperLink firmware
- **Date**: August 8, 2025
- **Status**: Partial completion - CLI installed and configured, custom build environment created

## What Was Accomplished

### 1. Wokwi CLI Installation
- **Version**: v0.17.1
- **Installation Method**: Downloaded from GitHub releases (not available via npm)
- **Location**: `C:\Users\faztrick\bin\wokwi-cli.exe`
- **Authentication**: Configured with token `wok_3trX0ypRNCjXWQKlmyMBiNvVduSMSSq482d33e74`

### 2. Wokwi Configuration Files
Created simulation configuration files:

#### `wokwi/wokwi.toml`
```toml
[wokwi]
version = 1
firmware = "../.pio/build/WokwiAP/firmware.elf"
elf = "../.pio/build/WokwiAP/firmware.elf"

[[wokwi.files]]
name = "../.pio/build/WokwiAP/firmware.bin"
```

#### `wokwi/diagram.json`
- ESP32-S3 DevKit configuration
- 32MB Flash, 8MB PSRAM (OPI OPI mode)
- QIO flash mode initially, later switched to DIO
- GPIO pin mappings for SPI display simulation
- USB CDC enabled for serial communication

### 3. Custom PlatformIO Environment
Created `WokwiAP` environment in `platformio.ini` with:

#### Key Features
- **Board**: `esp32-s3-devkitc-1`
- **Flash Mode**: DIO (for Wokwi compatibility)
- **Partitions**: 32MB partition table
- **Dependencies**: Minimal set (ESPAsyncWebServer, ArduinoJson)

#### Hardware Exclusions
Disabled hardware features not needed for simulation:
- TFT/OLED displays (`HAS_TFT=0`, `HAS_OLED=0`)
- LED drivers (`HAS_LED_DRIVER=0`, `HAS_LEDS=0`)
- Sensors (`HAS_TEMP_SENSOR=0`, `HAS_CURRENT_SENSOR=0`, etc.)
- Communication modules (`HAS_BLE=0`, `HAS_SUBGHZ=0`)
- Hardware interfaces (`HAS_RC522=0`, `HAS_IR_REMOTE=0`)
- External modules (`HAS_C6_MODULE=0`, `HAS_SD_CARD=0`)
- Power management (`HAS_POWER_MANAGEMENT=0`)
- Flasher functionality (`HAS_FLASHER=0`)

#### Source File Exclusions
Excluded hardware-dependent source files:
```ini
build_src_filter =
    +<*>
    -<c6_module.cpp>
    -<ble_*.cpp>
    -<rc522_*.cpp>
    -<ir_*.cpp>
    -<ips_display.cpp>
    -<powermgt.cpp>
    -<espflasher.cpp>
    -<flasher.cpp>
    -<serialap.cpp>
    -<leds.cpp>
    -<swd.cpp>
    -<usbflasher.cpp>
    -<webflasher.cpp>
    -<makeimage.cpp>
    -<contentmanager.cpp>
```

### 4. Header File Modifications
Created dummy header implementations to avoid hardware dependencies:

#### `include/leds.h`
- Added `USE_DUMMY_LEDS` preprocessor directive
- Dummy CRGB struct and LED functions when in simulation mode
- Avoids FastLED.h dependency

#### `include/contentmanager.h`
- Added `USE_DUMMY_CONTENT_MANAGER` preprocessor directive
- Dummy content management functions when in simulation mode
- Avoids TFT_eSPI.h dependency

### 5. Simulation Optimizations
Added Wokwi-specific build flags:
```cpp
-D WOKWI_SIMULATION=1
-D DISABLE_WATCHDOG=1
-D CONFIG_ESP_TASK_WDT_EN=0
-D CONFIG_ESP_INT_WDT_EN=0
-D CONFIG_ESP_BROWNOUT_DET=0
-D USE_DUMMY_LEDS=1
-D USE_DUMMY_CONTENT_MANAGER=1
```

## Issues Encountered

### 1. Initial Problems
- **Wokwi CLI Not in npm**: Had to download directly from GitHub releases
- **Authentication Required**: Needed API token for Wokwi cloud services
- **Boot Loop**: Original firmware had persistent boot loops in simulation

### 2. Build Dependencies
- **FastLED Library**: Caused compilation errors, resolved with dummy headers
- **TFT_eSPI Library**: Display library conflicts, resolved with conditional compilation
- **Hardware-specific Code**: Multiple files required exclusion from build

### 3. Library Conflicts
- **AsyncTCP Package**: Some dependency resolution issues with specific versions
- **ArduinoJson Deprecation**: Multiple warnings about deprecated API usage

## Current Status

### ✅ Completed
- Wokwi CLI installation and configuration
- Authentication setup
- Basic configuration files created
- Custom PlatformIO environment with hardware exclusions
- Dummy header implementations for simulation compatibility

### ⚠️ Partially Complete
- **WokwiAP Build**: Environment created but may have remaining compilation issues
- **Library Dependencies**: Some conflicts resolved, others may remain

### ❌ Pending
- **Successful Build**: Complete compilation of WokwiAP environment
- **Simulation Testing**: Actual firmware testing in Wokwi environment
- **Boot Loop Resolution**: Verification that DIO mode fixes boot issues

## Next Steps

1. **Complete Build Fix**: Resolve any remaining compilation errors in WokwiAP environment
2. **Test Simulation**: Run `pio run -e WokwiAP` and verify successful build
3. **Launch Wokwi**: Test with `wokwi-cli --diagram wokwi/diagram.json --elf .pio/build/WokwiAP/firmware.elf`
4. **Verify Boot**: Confirm firmware boots successfully without boot loops
5. **Test Core Features**: Verify WiFi AP mode and web interface work in simulation

## Usage Commands

### Build for Simulation
```bash
pio run -e WokwiAP
```

### Run Wokwi Simulation
```bash
cd wokwi
wokwi-cli --diagram diagram.json --elf ../.pio/build/WokwiAP/firmware.elf
```

### Alternative: Direct ELF Launch
```bash
wokwi-cli --elf .pio/build/WokwiAP/firmware.elf
```

## Configuration Notes

- **Flash Mode**: DIO mode used for Wokwi compatibility (QIO caused boot issues)
- **Memory**: 32MB flash partition table for adequate space
- **Libraries**: Minimal dependency set to reduce compilation complexity
- **Hardware Simulation**: Only basic RGB LED and WiFi functionality enabled

## Troubleshooting

### Boot Loops
- Ensure DIO flash mode in both `wokwi.toml` and `diagram.json`
- Verify hardware exclusion flags are properly set
- Check that excluded source files don't contain required functionality

### Compilation Errors
- Review `build_src_filter` for missing exclusions
- Check dummy header implementations for missing functions
- Verify library dependency versions in `lib_deps`

### Wokwi Connection Issues
- Confirm `WOKWI_CLI_TOKEN` environment variable is set
- Check internet connectivity for cloud-based simulation
- Verify diagram.json format and pin configurations

---

**Created**: August 8, 2025
**Project**: OpenEPaperLink ESP32 Access Point
**Environment**: ESP32-S3 Wokwi Simulation
**Status**: Development/Configuration Phase
