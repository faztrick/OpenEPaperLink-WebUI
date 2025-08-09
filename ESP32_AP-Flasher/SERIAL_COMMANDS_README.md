# Serial Commands for WiFi and Author Endpoints

This update adds comprehensive serial command support to the ESP32_AP-Flasher firmware, enabling direct control of WiFi settings and access to author/endpoint information via the serial console.

## What's New

### 🔧 Firmware Changes

1. **New Serial Command Handler** (`src/serial_commands.cpp` + `include/serial_commands.h`)
   - Comprehensive command parsing and execution
   - JSON response formatting
   - Integration with existing WiFi utilities
   - Author and endpoint management

2. **Main System Integration** (`src/main.cpp`)
   - Serial command processing in main loop
   - Initialization in setup function
   - Works alongside existing Improv WiFi protocol

### 📟 Available Commands

#### WiFi Commands
- `wifi.status` - Get WiFi connection status
- `wifi.scan` - Scan for networks
- `wifi.connect` / `wifi.disconnect` - Connection control
- `wifi.getip` / `wifi.getssid` / `wifi.getmac` - Information retrieval
- `wifi.setssid` / `wifi.setpassword` - Credential configuration
- `wifi.setstaticip` / `wifi.setgateway` / `wifi.setsubnet` / `wifi.setdns` - Network configuration
- `wifi.save` - Save configuration

#### Author/Endpoint Commands
- `author.get` / `author.set` - Author information management
- `author.endpoints` - List available web endpoints
- `author.status` - Endpoint accessibility status
- `author.test <endpoint>` - Test specific endpoints

#### System Commands
- `system.info` - Comprehensive system information
- `system.reboot` / `system.reset` - System control
- `version` / `status` / `help` - Information and help

### 🛠️ PowerShell Scripts

#### Enhanced `wifi_serial_commander.ps1`
- Updated to use new command format
- Added author and endpoint functionality
- Improved interactive mode with more commands

#### New `author_serial_commander.ps1`
- Dedicated author and endpoint management
- Interactive mode for testing
- Comprehensive endpoint testing capabilities

#### New `test_serial_commands.ps1`
- Quick test script to verify functionality
- Validates serial connection and command responses

## Usage Examples

### Quick Start
```powershell
# Test if serial commands are working
.\test_serial_commands.ps1

# Interactive WiFi management
.\wifi_serial_commander.ps1 -Interactive

# Interactive author/endpoint management
.\author_serial_commander.ps1 -Interactive
```

### WiFi Configuration
```powershell
# Configure WiFi via serial
.\wifi_serial_commander.ps1 -SSID "MyNetwork" -Password "mypassword"

# Or manually via serial console:
wifi.setssid "MyNetwork"
wifi.setpassword "mypassword"
wifi.save
wifi.connect
```

### Author & Endpoint Management
```powershell
# Set author information
.\author_serial_commander.ps1 -AuthorName "John Developer"

# List and test endpoints
.\author_serial_commander.ps1 -ListEndpoints -TestEndpoints

# Test specific endpoint
.\author_serial_commander.ps1 -TestEndpoint "/api/wifi/status"
```

### Manual Serial Console
Connect at 115200 baud and try:
```
help
version
wifi.status
author.get
author.endpoints
system.info
```

## Integration Details

### Storage Integration
- Uses existing `WiFiStorageManager` for consistent configuration
- Leverages `WiFiUtils` for network operations
- JSON responses for easy parsing

### Response Format
Commands return structured responses:
- **JSON responses**: `JSON: {...}`
- **Success messages**: Plain text confirmation
- **Error messages**: `ERROR: description`

### Available Endpoints
When WiFi is connected, these endpoints are accessible:
- `/` - Main interface
- `/api/wifi/*` - WiFi API endpoints
- `/get_wifi_config` - WiFi configuration
- `/system_info` - System information
- And many more (see `author.endpoints` command)

## Files Added/Modified

### New Files
- `include/serial_commands.h` - Serial command handler header
- `src/serial_commands.cpp` - Serial command implementation
- `author_serial_commander.ps1` - Author/endpoint management script
- `test_serial_commands.ps1` - Quick test script
- `docs/SERIAL_COMMANDS_GUIDE.md` - Comprehensive documentation

### Modified Files
- `src/main.cpp` - Added serial command processing
- `wifi_serial_commander.ps1` - Enhanced with new commands

## Building and Testing

### Prerequisites
- ESP32 development environment
- PlatformIO or Arduino IDE
- PowerShell (for scripts)

### Build Process
1. Ensure all new files are included in build
2. Compile and flash firmware
3. Test with `test_serial_commands.ps1`

### Troubleshooting
- Check serial port and baud rate (115200)
- Verify firmware includes new command handler
- Use `help` command to see available commands
- Check `docs/SERIAL_COMMANDS_GUIDE.md` for detailed help

## Future Enhancements

Planned improvements:
- Tag management commands
- Configuration backup/restore
- Network diagnostic tools
- Extended endpoint testing with HTTP status codes
- Remote logging capabilities

## Compatibility

- ✅ Works alongside existing Improv WiFi protocol
- ✅ Compatible with existing web interface
- ✅ Uses existing storage systems
- ✅ Maintains all current functionality

The serial command interface provides a powerful new way to interact with the ESP32_AP-Flasher while maintaining full compatibility with existing features.
