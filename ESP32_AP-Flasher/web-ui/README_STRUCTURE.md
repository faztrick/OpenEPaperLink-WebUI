# Web UI Structure

This project now has a organized separation between essential firmware files and the main web application.

## Directory Structure

### `wwwroot/` - Essential Firmware Files
Contains files that the ESP32 firmware needs to serve directly:
- `setup.html` & `setup.js` - Initial device setup interface
- `esp32_endpoint_checker.html` - Endpoint testing tool
- `logs.html` - System logs viewer
- `wifi_test.html` - WiFi connectivity testing
- `network-test.html` - Network diagnostic tools
- Essential APIs and utilities needed by firmware

### `web-ui/src/` - Main Application UI
Contains the full web application interface:
- `index.html` - Main application entry point
- `dashboard.html` - System dashboard
- `settings.html` - Configuration interface
- `tags.html` & `edit.html` - Tag management
- `flasher.html` - Firmware flashing interface
- All JavaScript modules and CSS files for the main UI

### `web-ui/dist/compressed/` - Compiled UI Files
Contains gzipped versions of the main UI files for serving.

## Build Process

Run `python gzip_wwwfiles.py` to:
1. Compress essential firmware files from `wwwroot/` to `data/www/`
2. Compress main UI files from `web-ui/src/` to `web-ui/dist/compressed/`

## Development Workflow

1. **Firmware essentials**: Edit files directly in `wwwroot/`
2. **Main UI**: Edit files in `web-ui/src/`
3. **Build**: Run `python gzip_wwwfiles.py` to compress all files
4. **Deploy**: ESP32 firmware serves from both locations as needed

## File Categories

### Keep in wwwroot/ (Firmware Essential)
- Device setup and configuration
- System diagnostics and testing
- Basic logs and monitoring
- Network connectivity tools
- Essential APIs for device management

### Move to web-ui/src/ (Main Application)
- User interface components
- Tag management features
- Advanced configuration
- Dashboard and analytics
- Complex JavaScript applications
