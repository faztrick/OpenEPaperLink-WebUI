# ESP32 Serial Commands Documentation

## Overview

The ESP32_AP-Flasher now includes a comprehensive serial command interface that allows control of WiFi settings and access to author/endpoint information directly via the serial console.

## Getting Started

### Hardware Requirements
- ESP32_AP-Flasher device connected via USB
- Serial terminal or the provided PowerShell scripts

### Serial Settings
- **Baud Rate**: 115200
- **Data Bits**: 8
- **Parity**: None
- **Stop Bits**: 1

## Command Categories

### WiFi Commands

| Command | Description | Example |
|---------|-------------|---------|
| `wifi.status` | Get current WiFi connection status | `wifi.status` |
| `wifi.scan` | Scan for available WiFi networks | `wifi.scan` |
| `wifi.connect` | Connect using saved credentials | `wifi.connect` |
| `wifi.disconnect` | Disconnect from WiFi | `wifi.disconnect` |
| `wifi.getip` | Get current IP address information | `wifi.getip` |
| `wifi.getssid` | Get current SSID information | `wifi.getssid` |
| `wifi.getmac` | Get MAC address information | `wifi.getmac` |
| `wifi.setssid <ssid>` | Set WiFi SSID | `wifi.setssid "MyNetwork"` |
| `wifi.setpassword <password>` | Set WiFi password | `wifi.setpassword "mypassword"` |
| `wifi.setstaticip <ip>` | Set static IP address | `wifi.setstaticip "192.168.1.100"` |
| `wifi.setgateway <gateway>` | Set gateway address | `wifi.setgateway "192.168.1.1"` |
| `wifi.setsubnet <mask>` | Set subnet mask | `wifi.setsubnet "255.255.255.0"` |
| `wifi.setdns <dns>` | Set DNS server | `wifi.setdns "8.8.8.8"` |
| `wifi.save` | Save WiFi configuration | `wifi.save` |

### Author/Endpoint Commands

| Command | Description | Example |
|---------|-------------|---------|
| `author.get` | Get current author information | `author.get` |
| `author.set <name>` | Set author name | `author.set "John Developer"` |
| `author.endpoints` | List all available web endpoints | `author.endpoints` |
| `author.status` | Get endpoint access status | `author.status` |
| `author.test <endpoint>` | Test specific endpoint | `author.test "/api/wifi/status"` |

### System Commands

| Command | Description | Example |
|---------|-------------|---------|
| `system.info` | Get comprehensive system information | `system.info` |
| `system.reboot` | Reboot the system | `system.reboot` |
| `system.reset` | Factory reset (configuration only) | `system.reset` |
| `version` | Get firmware version information | `version` |
| `status` | Get overall system status | `status` |
| `help` | Show all available commands | `help` |

## PowerShell Scripts

### wifi_serial_commander.ps1

Enhanced WiFi management script with new command support.

**Usage Examples:**
```powershell
# Interactive mode with new commands
.\wifi_serial_commander.ps1 -Interactive

# Auto-scan for devices
.\wifi_serial_commander.ps1 -AutoScan

# Configure WiFi
.\wifi_serial_commander.ps1 -SSID "MyNetwork" -Password "mypassword"
```

### author_serial_commander.ps1 (NEW)

Dedicated script for author and endpoint management.

**Usage Examples:**
```powershell
# Interactive mode
.\author_serial_commander.ps1 -Interactive

# Set author name
.\author_serial_commander.ps1 -AuthorName "John Developer"

# List all available endpoints
.\author_serial_commander.ps1 -ListEndpoints

# Test all common endpoints
.\author_serial_commander.ps1 -TestEndpoints

# Test specific endpoint
.\author_serial_commander.ps1 -TestEndpoint "/api/wifi/status"
```

**Parameters:**
- `-ComPort`: Serial port (default: COM10)
- `-BaudRate`: Baud rate (default: 115200)
- `-AuthorName`: Author name to set
- `-ListEndpoints`: List available endpoints
- `-TestEndpoints`: Test all common endpoints
- `-TestEndpoint`: Test specific endpoint
- `-Interactive`: Enter interactive mode

## Command Examples

### WiFi Configuration Workflow
```
wifi.setssid "MyHomeWiFi"
wifi.setpassword "mySecurePassword123"
wifi.setstaticip "192.168.1.100"
wifi.setgateway "192.168.1.1"
wifi.save
wifi.connect
wifi.status
```

### Author Information Management
```
author.get
author.set "Jane Developer"
author.endpoints
author.status
```

### Endpoint Testing
```
author.test "/"
author.test "/api/wifi/status"
author.test "/get_wifi_config"
author.test "/system_info"
```

### System Information
```
version
system.info
status
```

## Response Formats

### JSON Responses
Most commands return JSON-formatted responses for easy parsing:

```json
{
  "connected": true,
  "ssid": "MyNetwork",
  "ip": "192.168.1.100",
  "rssi": -45
}
```

### Error Responses
Error responses are prefixed with "ERROR:":
```
ERROR: SSID cannot be empty
```

### Success Responses
Success responses provide confirmation:
```
WiFi configuration saved
SSID set to: MyNetwork
```

## Available Web Endpoints

When WiFi is connected, the following endpoints are accessible:

### Core Endpoints
- `/` - Main web interface
- `/get_wifi_config` - WiFi configuration
- `/save_wifi_config` - Save WiFi settings
- `/network_info` - Network information

### WiFi API Endpoints
- `/api/wifi/status` - WiFi status API
- `/api/wifi/scan` - WiFi scan API
- `/api/wifi/scan_results` - Scan results
- `/api/wifi/connect` - Connect API
- `/api/wifi/disconnect` - Disconnect API

### System Endpoints
- `/system_info` - System information
- `/ota_check` - OTA update check
- `/tag_cmd` - Tag commands

### Legacy Endpoints
- `/get_ssid_list` - Legacy WiFi scan
- `/wifi_scan` - Legacy WiFi scan

## Integration Notes

### Firmware Integration
The serial command handler is integrated into the main firmware loop and processes commands alongside the existing Improv WiFi protocol.

### Storage Integration
Commands use the unified WiFi storage manager for consistent configuration handling.

### Response Callbacks
The system supports response callbacks for integration with external monitoring systems.

## Troubleshooting

### Common Issues

1. **No Response to Commands**
   - Check serial port and baud rate
   - Ensure device is powered and running
   - Try `help` command first

2. **WiFi Commands Failing**
   - Check if WiFi storage is properly initialized
   - Verify SSID and password are set correctly
   - Use `wifi.status` to check current state

3. **Endpoint Tests Failing**
   - Ensure WiFi is connected first
   - Check if web server is running
   - Verify endpoint URLs are correct

### Debug Commands
- `system.info` - Comprehensive system status
- `wifi.status` - Current WiFi state
- `author.status` - Endpoint accessibility
- `version` - Firmware version and build info

## Future Enhancements

Planned improvements include:
- Tag management commands
- Configuration backup/restore
- Network diagnostic tools
- Remote logging capabilities
- Extended endpoint testing with HTTP status codes
