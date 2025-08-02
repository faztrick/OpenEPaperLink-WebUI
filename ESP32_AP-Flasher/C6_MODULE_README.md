# ESP32-C6 Module Support

This document describes the ESP32-C6 module support added to the OpenEPaperLink ESP32_AP-Flasher project.

## Overview

The ESP32-C6 module support provides a comprehensive interface for managing and configuring ESP32-C6 wireless modules. This includes firmware updates, configuration management, diagnostics, and real-time monitoring.

## Features

### 🔧 Module Configuration UI
- **Web Interface**: Dedicated C6 module configuration page (`c6_module.html`)
- **Real-time Status**: Live monitoring of module status, version, and performance
- **Tabbed Interface**: Organized sections for Overview, Firmware, Settings, and Diagnostics

### 📡 Radio Configuration
- **Channel Selection**: Configure 2.4GHz channels (11, 15, 20, 25, 26)
- **TX Power Control**: Adjustable transmit power (0-20 dBm)
- **PAN ID Management**: Configure network PAN ID
- **Power Management**: Sleep mode configuration and wake intervals

### 🔄 Firmware Management
- **Online Updates**: Direct updates from GitHub releases
- **Local Upload**: Upload custom firmware files
- **Version Management**: View and install specific firmware versions
- **Progress Monitoring**: Real-time update progress tracking
- **Verification**: Firmware integrity checking

### 🔍 Diagnostics & Monitoring
- **System Diagnostics**: Comprehensive health checks
- **Radio Testing**: Signal strength and packet transmission tests
- **Channel Scanning**: Noise level analysis across channels
- **Live Console**: Real-time logging and monitoring
- **Performance Metrics**: Memory, CPU, and temperature monitoring

### 💾 Configuration Management
- **Settings Backup**: Export configuration as JSON
- **Factory Reset**: Reset to default settings
- **Configuration Restore**: Import saved configurations
- **Persistent Storage**: Settings saved to ESP32 preferences

## Implementation Details

### Build Configuration

The C6 module support is enabled through the `C6_OTA_FLASHING` build flag:

```ini
# In platformio.ini
build_flags = 
    -D C6_OTA_FLASHING
    # ... other flags
```

### File Structure

```
wwwroot/
├── c6_module.html          # Main C6 configuration interface
├── c6_module.js           # JavaScript functionality
└── ...

src/
├── web.cpp                # Backend API endpoints
└── ...

include/
├── web.h                  # Function declarations
└── ...
```

### API Endpoints

The following REST API endpoints are added for C6 module management:

#### Configuration
- `GET /get_c6_settings` - Retrieve current settings
- `POST /save_c6_settings` - Save configuration
- `POST /reset_c6_settings` - Reset to defaults

#### Diagnostics
- `GET /test_c6_connection` - Test module connectivity
- `GET /test_c6_radio` - Perform radio tests
- `POST /restart_c6` - Restart the module

#### Firmware
- `POST /upload_c6_firmware` - Upload firmware file
- `GET /backup_c6_config` - Download configuration backup
- `POST /reset_c6_config` - Factory reset

### Settings Storage

Settings are stored in ESP32 NVS (Non-Volatile Storage) under the `c6_module` namespace:

```cpp
Preferences preferences;
preferences.begin("c6_module", false);
preferences.putInt("channel", 20);
preferences.putInt("txPower", 10);
preferences.putString("panId", "0x1234");
// ...
preferences.end();
```

## Usage

### Accessing the Interface

1. **Automatic Detection**: The C6 module link appears in the main navigation when C6 support is detected
2. **Direct Access**: Navigate to `http://your-esp32/c6_module.html`
3. **From Updates Page**: Click the "Open C6 Module Configuration" link

### Configuration Workflow

1. **Overview Tab**: Check module status and basic information
2. **Settings Tab**: Configure radio parameters and power management
3. **Firmware Tab**: Update firmware when needed
4. **Diagnostics Tab**: Monitor performance and troubleshoot issues

### Example Configuration

```javascript
// Typical C6 module configuration
{
    "channel": 20,           // 2.4GHz channel (11-26)
    "txPower": 10,          // TX power in dBm (0-20)
    "panId": "0x1234",      // PAN ID for network
    "sleepMode": "light",   // Power management mode
    "wakeInterval": 60      // Wake interval in seconds
}
```

## Integration with Existing Code

### Module Detection

The system automatically detects C6 module support:

```cpp
#ifdef C6_OTA_FLASHING
    doc["hasC6"] = 1;       // Include in system info
#else
    doc["hasC6"] = 0;
#endif
```

### Conditional Display

UI elements are shown/hidden based on capability detection:

```javascript
if (data.hasC6 === 1 || data.C6 === "1") {
    document.getElementById('c6ModuleLink').style.display = 'inline-block';
}
```

## Build Environments

C6 module support is available in these PlatformIO environments:

- `OutdoorAP` - Outdoor access point with C6 support
- `ESP32_S3_C6_NANO_AP` - ESP32-S3 with C6 module support

## Error Handling

The system includes comprehensive error handling:

- **Connection Failures**: Graceful degradation when module is offline
- **Invalid Settings**: Validation and error messages for configuration
- **Update Failures**: Rollback capability and error reporting
- **Network Issues**: Timeout handling and retry mechanisms

## Security Considerations

- **Configuration Access**: Settings require admin access
- **Firmware Updates**: Verification of uploaded firmware
- **Factory Reset**: Confirmation required for destructive operations
- **API Security**: Proper HTTP status codes and error messages

## Future Enhancements

Potential future improvements:

1. **Advanced Radio Diagnostics**: Spectrum analysis and interference detection
2. **Mesh Configuration**: Support for mesh network topology
3. **Remote Monitoring**: Cloud-based monitoring and alerts
4. **Automated Updates**: Scheduled firmware updates
5. **Performance Analytics**: Historical performance data and trends

## Troubleshooting

### Common Issues

1. **C6 Module Not Detected**
   - Verify `C6_OTA_FLASHING` flag is set
   - Check hardware connections
   - Confirm module is powered

2. **Configuration Not Saving**
   - Check NVS partition space
   - Verify JSON format
   - Ensure stable power supply

3. **Firmware Update Fails**
   - Verify file format (.bin)
   - Check available flash space
   - Ensure stable WiFi connection

### Debug Information

Enable debug logging by monitoring the diagnostic console in the web interface or using serial output.

## Contributing

To contribute to C6 module support:

1. Test with actual C6 hardware
2. Add new diagnostic functions
3. Improve error handling
4. Enhance the user interface
5. Add more configuration options

---

This C6 module support provides a foundation for comprehensive ESP32-C6 management within the OpenEPaperLink ecosystem.
