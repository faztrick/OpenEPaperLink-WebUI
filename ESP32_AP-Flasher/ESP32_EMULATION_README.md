# ESP32 Emulation Integration Guide

This document describes the ESP32 emulation capabilities integrated into the OpenEPaperLink ESP32_AP-Flasher project using VS Code API and various emulation tools.

## Overview

The ESP32 emulation integration provides multiple debugging and simulation options:

1. **Hardware Debugging** - Debug on real ESP32-S3 hardware
2. **QEMU Emulation** - Full system emulation using QEMU
3. **Wokwi Simulation** - Web-based ESP32 simulation with virtual hardware
4. **GDB Integration** - Advanced debugging with ESP32-specific GDB

## Prerequisites

### Required Tools

- **VS Code** with the following extensions:
  - PlatformIO IDE (`platformio.platformio-ide`)
  - C/C++ Tools (`ms-vscode.cpptools`)
  - Cortex-Debug (`marus25.cortex-debug`)

### Optional Tools (for enhanced emulation)

- **Wokwi VS Code Extension** (`wokwi.wokwi-vscode`) - For web-based simulation
- **QEMU with ESP32 support** - For system-level emulation
- **Wokwi CLI** - For command-line simulation control

## Quick Start

### 1. Setup Environment

```powershell
# Run the setup script
.\emulation_setup.ps1 setup
```

This script will:
- Check for required tools and dependencies
- Verify ESP32 toolchain installation
- Set up Wokwi simulation directory
- Configure VS Code settings

### 2. Build Firmware

```powershell
# Build firmware for emulation
.\emulation_setup.ps1 build
```

Or use VS Code:
- Press `Ctrl+Shift+P`
- Run `PlatformIO: Build`

### 3. Start Debugging

#### Option A: VS Code Debug Panel
1. Open VS Code (`F1` > `Debug: Open launch.json`)
2. Select one of the debug configurations:
   - **PIO Debug (Hardware)** - Real hardware debugging
   - **ESP32 QEMU Emulation** - QEMU-based emulation
   - **Wokwi ESP32 Simulator** - Web-based simulation
3. Press `F5` to start debugging

#### Option B: Command Line
```powershell
# Start Wokwi simulation
.\emulation_setup.ps1 wokwi

# Start QEMU emulation  
.\emulation_setup.ps1 qemu

# Open VS Code for debugging
.\emulation_setup.ps1 debug
```

## Debug Configurations

### Hardware Debugging (`PIO Debug (Hardware)`)
- **Target**: Real ESP32-S3 hardware
- **Connection**: USB/UART
- **Features**: Full hardware functionality, real-time execution
- **Use Case**: Final testing, hardware-specific debugging

### QEMU Emulation (`ESP32 QEMU Emulation`)
- **Target**: QEMU ESP32 emulator
- **Connection**: GDB on localhost:3333
- **Features**: Full system emulation, deterministic execution
- **Use Case**: Low-level debugging, system behavior analysis

### Wokwi Simulation (`Wokwi ESP32 Simulator`)
- **Target**: Wokwi web-based simulator
- **Connection**: GDB on localhost:3334
- **Features**: Visual hardware simulation, interactive components
- **Use Case**: UI development, hardware interaction testing

## File Structure

```
.vscode/
├── launch.json          # Debug configurations
├── tasks.json           # Build and emulation tasks
├── settings.json        # VS Code settings for ESP32 development
├── extensions.json      # Recommended extensions
└── gdbinit             # GDB initialization script

wokwi/
├── diagram.json         # Wokwi hardware diagram
└── wokwi.toml          # Wokwi project configuration

emulation_setup.ps1     # Emulation management script
```

## Hardware Simulation (Wokwi)

The Wokwi configuration (`wokwi/diagram.json`) simulates:

- **ESP32-S3 DevKit-C-1** with 32MB flash, 8MB PSRAM
- **ST7789 TFT Display** (240x320) connected via SPI
- **WS2812B RGB LED** (NeoPixel) on GPIO38
- **Status LED** on GPIO21
- **UART connections** for flasher interface

### Pin Mapping
```
GPIO13 → TFT MOSI
GPIO12 → TFT SCLK  
GPIO10 → TFT CS
GPIO11 → TFT DC
GPIO1  → TFT RST
GPIO38 → RGB LED (WS2812B)
GPIO21 → Status LED
GPIO17 → Flasher TXD
GPIO18 → Flasher RXD
GPIO47 → Flasher Reset
```

## GDB Commands

The project includes ESP32-specific GDB commands in `.vscode/gdbinit`:

```gdb
# Connect to QEMU
connect-qemu

# Connect to Wokwi  
connect-wokwi

# ESP32 reset and break at main
esp32-reset

# Set common ESP32 breakpoints
esp32-common-breaks

# Show ESP32 memory layout
esp32-flash-info

# Show all thread backtraces
esp32-bt-all
```

## Troubleshooting

### Common Issues

1. **GDB Connection Failed**
   - Ensure emulator is running before starting debug session
   - Check if ports 3333 (QEMU) or 3334 (Wokwi) are available
   - Verify ESP32 GDB toolchain is installed

2. **Build Errors**
   - Run `.\emulation_setup.ps1 clean` to clean build artifacts
   - Check PlatformIO environment configuration
   - Verify ESP32-S3 toolchain installation

3. **Wokwi Simulation Issues**
   - Install Wokwi VS Code extension
   - Check `wokwi/diagram.json` for syntax errors
   - Ensure firmware.elf is built successfully

4. **QEMU Emulation Issues**
   - Install QEMU with ESP32 support
   - Check QEMU is in system PATH
   - Verify ESP32 QEMU machine support

### Debug Logs

Enable verbose logging in VS Code settings:
```json
{
    "debug.console.closeOnEnd": false,
    "debug.console.historySuggestions": true,
    "debug.openDebug": "openOnDebugBreak"
}
```

## VS Code API Integration

The integration uses several VS Code APIs:

- **Debug Adapter Protocol** - For ESP32 debugging
- **Task Provider API** - For build and emulation tasks  
- **Configuration Provider** - For debug configurations
- **Terminal API** - For emulator control
- **Extension API** - For tool integration

### Custom Debug Adapter

The integration extends VS Code's debugging capabilities with:
- ESP32-specific memory views
- Xtensa architecture support
- Custom GDB command integration
- Emulator lifecycle management

## Performance Optimization

### Build Optimization
- Uses ESP32-S3 optimized compilation flags
- Enables hardware-specific optimizations
- Configures for 32MB flash, 8MB PSRAM

### Debug Optimization  
- Selective symbol loading for faster startup
- Optimized GDB configuration for ESP32
- Efficient breakpoint management

## Advanced Features

### Memory Analysis
- Real-time heap monitoring
- Stack overflow detection
- PSRAM usage tracking
- Flash wear leveling analysis

### Peripheral Simulation
- SPI interface simulation (TFT display)
- GPIO state monitoring
- UART communication emulation
- Timer and interrupt simulation

### Code Coverage
- Enable coverage analysis in emulation
- Export coverage reports
- Integration with VS Code coverage extensions

## Contributing

To extend the emulation integration:

1. **Add New Debug Configuration**
   - Edit `.vscode/launch.json`
   - Add corresponding task in `tasks.json`
   - Update documentation

2. **Enhance Wokwi Simulation**
   - Modify `wokwi/diagram.json` for new components
   - Update pin mappings in `wokwi.toml`
   - Test component interactions

3. **Extend GDB Commands**
   - Add commands to `.vscode/gdbinit`
   - Document new debugging workflows
   - Test with different emulation targets

## References

- [PlatformIO Debugging](https://docs.platformio.org/en/latest/plus/debugging.html)
- [VS Code Debug API](https://code.visualstudio.com/api/extension-guides/debugger-extension)
- [Wokwi Documentation](https://docs.wokwi.com/)
- [ESP32-S3 Technical Reference](https://www.espressif.com/sites/default/files/documentation/esp32-s3_technical_reference_manual_en.pdf)
- [QEMU ESP32 Documentation](https://github.com/espressif/qemu)

## License

This emulation integration follows the same license as the OpenEPaperLink project.
