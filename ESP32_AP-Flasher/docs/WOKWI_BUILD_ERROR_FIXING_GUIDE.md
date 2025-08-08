# Wokwi ESP32-S3 Simulation Build Error Fixing Guide

## Overview
This document provides a comprehensive guide for fixing compilation errors when building the ESP32 firmware for the Wokwi simulation environment. The Wokwi simulation uses specific conditional compilation flags that exclude certain hardware modules, requiring careful handling of conditional compilation directives.

## Environment Information
- **Target Platform**: ESP32-S3 Wokwi Simulation
- **Build Environment**: PlatformIO
- **Primary Configuration**: `WokwiAP` environment
- **Shell**: PowerShell (Windows)
- **Date**: August 8, 2025

## Build Command
```powershell
# Primary build command for Wokwi simulation
pio run -e WokwiAP

# Check for specific compilation errors
pio run -e WokwiAP 2>&1 | Select-String "error:" | Select-Object -Last 5

# Full build with verbose output
pio run -e WokwiAP -v
```

## Common Error Categories

### 1. Conditional Compilation Issues

#### Problem: Missing Variable Declarations
**Error Example:**
```
src/web.cpp:216:25: error: 'rgbIdleColor' was not declared in this scope
```

**Root Cause:** Variables used in simulation that are only declared when specific hardware features are enabled.

**Solution Method:**
```cpp
// Before (causing error)
rgbIdleColor = 0x000000;

// After (properly guarded)
#if defined(HAS_RGB_LED) && !defined(USE_DUMMY_LEDS)
rgbIdleColor = 0x000000;
#endif
```

**Fix Command:**
```bash
# Use replace_string_in_file tool to wrap variable usage in conditional compilation
```

#### Problem: Missing Function Declarations
**Error Example:**
```
src/web.cpp:1056:9: error: 'handleGetC6Settings' was not declared in this scope
```

**Root Cause:** Functions specific to hardware modules (like C6 module) being called when the module is not enabled in simulation.

**Solution Method:**
```cpp
// Before (causing error)
server.on("/get_c6_settings", HTTP_GET, handleGetC6Settings);

// After (properly guarded)
#ifdef HAS_C6_MODULE
server.on("/get_c6_settings", HTTP_GET, handleGetC6Settings);
server.on("/set_c6_settings", HTTP_POST, handleSetC6Settings);
// ... other C6 endpoints
#endif
```

### 2. Hardware Interface Issues

#### Problem: RC522 RFID Interface Compilation Errors
**Current Error Example:**
```
src/web.cpp:1364:30: error: request for member 'size' in 'cards', which is of non-class type 'int'
src/web.cpp:1373:9: error: 'rc522Interface' was not declared in this scope
```

**Root Cause:** RC522 RFID interface and related data structures are not available in Wokwi simulation, but web endpoints still reference them.

**Analysis Method:**
1. Check if RC522 code block is properly wrapped with `#ifdef HAS_RC522`
2. Verify that `RFIDCardInfo` struct is declared within the conditional block
3. Ensure all RC522 web endpoints are within the conditional compilation

**Current Status:** ✅ RC522 section is properly wrapped in `#ifdef HAS_RC522` (lines 1225-1393), but the issue persists due to type definitions not being available when `HAS_RC522` is undefined.

### 3. Library Integration Issues

#### Problem: IRremoteESP8266 Library Integration
**Warning Example:**
```
Library IRremoteESP8266 has been declared compatible with this framework but hasn't been tested
```

**Solution:** This is a non-blocking warning that can be safely ignored for simulation purposes.

#### Problem: ArduinoJson Deprecation Warnings
**Warning Example:**
```
ArduinoJson: deprecated feature used
```

**Solution:** These are non-blocking warnings that don't prevent compilation but should be addressed in future updates.

## Troubleshooting Methodology

### Phase 1: Identify Error Categories
1. **Run build command** to get all compilation errors
2. **Categorize errors** by type:
   - Missing variable declarations
   - Missing function declarations
   - Library compatibility issues
   - Conditional compilation boundary issues

### Phase 2: Systematic Error Resolution
1. **Start with most frequent errors** (usually missing declarations)
2. **Fix conditional compilation** by wrapping hardware-specific code
3. **Verify fixes incrementally** by rebuilding after each fix
4. **Document successful patterns** for future reference

### Phase 3: Validation
1. **Run full build** to ensure all errors are resolved
2. **Test simulation startup** to verify runtime functionality
3. **Document remaining warnings** that are non-blocking

## Specific Fix Patterns

### Pattern 1: RGB LED Variable Guarding
```cpp
// Context: LED color management in simulation
#if defined(HAS_RGB_LED) && !defined(USE_DUMMY_LEDS)
    rgbIdleColor = 0x000000;
    // Other RGB operations
#endif
```

### Pattern 2: Hardware Module Endpoint Guarding
```cpp
// Context: C6 module web endpoints
#ifdef HAS_C6_MODULE
    server.on("/get_c6_settings", HTTP_GET, handleGetC6Settings);
    server.on("/set_c6_settings", HTTP_POST, handleSetC6Settings);
    server.on("/reset_c6", HTTP_POST, handleResetC6);
    // Additional C6 endpoints...
#endif
```

### Pattern 3: Hardware Interface Guarding
```cpp
// Context: RC522 RFID interface endpoints
#ifdef HAS_RC522
    // RC522 RFID control endpoints
    server.on("/rfid/status", HTTP_GET, [](AsyncWebServerRequest *request) {
        String response = rc522Interface.getStatusJSON();
        request->send(200, "application/json", response);
    });
    // Additional RC522 endpoints...
#endif
```

## Tools and Commands Used

### File Analysis Commands
```powershell
# Search for specific patterns in code
grep_search -query "rgbIdleColor|handleGetC6Settings|rc522Interface" -isRegexp true

# Read specific file sections
read_file -filePath "path/to/file" -offset 1200 -limit 50

# Search for conditional compilation patterns
grep_search -query "#ifdef.*#endif" -isRegexp true
```

### Code Modification Commands
```powershell
# Replace code sections with conditional compilation
replace_string_in_file -filePath "src/web.cpp" -oldString "exact_code_to_replace" -newString "conditionally_wrapped_code"

# Verify changes
read_file -filePath "src/web.cpp" -offset line_number -limit 20
```

### Build and Validation Commands
```powershell
# Build specific environment
pio run -e WokwiAP

# Check for errors only
pio run -e WokwiAP 2>&1 | Select-String "error:"

# Get last few errors for quick analysis
pio run -e WokwiAP 2>&1 | Select-String "error:" | Select-Object -Last 5
```

## Current Status Summary

### ✅ Successfully Fixed Issues
1. **RGB LED Variable Declaration** - `rgbIdleColor` properly wrapped in conditional compilation
2. **C6 Module Function Declarations** - All C6 handlers properly wrapped in `#ifdef HAS_C6_MODULE`
3. **Conditional Compilation Structure** - Most hardware-specific code properly guarded

### ⚠️ Remaining Issues
1. **RC522 Interface Compilation** - Type definition issues when `HAS_RC522` is undefined
   - Error Location: `src/web.cpp` lines 1364-1388
   - Issue: `RFIDCardInfo` and `rc522Interface` not available in simulation environment
   - Status: Properly wrapped in conditional compilation but type resolution issues persist

### 📊 Progress Metrics
- **Total Errors Reduced**: From ~20 to ~5
- **Error Categories Resolved**: 2 out of 3 major categories
- **Build Progress**: Advanced significantly, only RC522 interface issues remaining

## Best Practices for Future Development

### 1. Conditional Compilation Guidelines
- Always wrap hardware-specific code in appropriate `#ifdef` blocks
- Use consistent naming for conditional compilation flags
- Group related functionality within the same conditional block
- Document which features are available in simulation vs. hardware

### 2. Error Resolution Strategy
- Fix errors in batches by category rather than individually
- Test fixes incrementally to avoid introducing new issues
- Maintain documentation of successful fix patterns
- Use version control to track working states

### 3. Simulation Environment Considerations
- Understand which hardware features are available in Wokwi simulation
- Plan conditional compilation strategy during development
- Test both hardware and simulation builds regularly
- Maintain separate configuration profiles for different environments

## References and Related Documentation
- [WOKWI_SIMULATION_SETUP.md](./WOKWI_SIMULATION_SETUP.md) - Initial simulation setup guide
- [platformio.ini](../platformio.ini) - Build environment configurations
- [src/web.cpp](../src/web.cpp) - Main web server implementation with conditional compilation

---
*Document Created: August 8, 2025*
*Last Updated: August 8, 2025*
*Status: Active troubleshooting documentation*
