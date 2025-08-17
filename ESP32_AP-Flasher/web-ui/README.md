# ESP32 Web Development UI Setup

This guide will help you set up and run the modern web-based development interface for your ESP32 project.

## Prerequisites

- Node.js (version 14 or higher)
- npm (usually comes with Node.js)
- PowerShell (for Windows)
- PlatformIO installed and configured

## Quick Setup

1. **Install Node.js dependencies:**
   ```powershell
   cd web-ui
   npm install
   ```

2. **Start the development server:**
   ```powershell
   npm start
   ```

3. **Open your browser:**
   Navigate to `http://localhost:3000`

## Manual Setup Steps

### 1. Navigate to the web-ui directory
```powershell
cd "d:\projects\esp\OpenEPaperLink\ESP32_AP-Flasher\web-ui"
```

### 2. Install dependencies
```powershell
npm install
```

This will install:
- Express.js (web server)
- Socket.IO (real-time communication)
- CORS (cross-origin requests)
- multer (file uploads)
- node-pty (terminal interface)

### 3. Start the server
```powershell
node server.js
```

Or using npm:
```powershell
npm start
```

### 4. Access the interface
Open your web browser and go to:
```
http://localhost:3000
```

## Features

### Build & Flash Operations
- **Compile**: Standard compilation with options
- **Fast Compile**: Optimized compilation using parallel processing
- **Flash**: Upload firmware to ESP32
- **Monitor**: Serial port monitoring
- **Build FS**: Build filesystem image
- **Flash FS**: Upload filesystem to ESP32

### Configuration
- **COM Port Selection**: Automatic detection of available ports
- **WiFi Configuration**: Set SSID and password
- **Build Options**: Fast compile, verbose output, clean build
- **Real-time Settings**: Changes are saved automatically

### Development Tools
- **Clean Build**: Remove build artifacts
- **Erase Flash**: Complete flash memory erase
- **OTA Update**: Over-the-air firmware updates
- **Network Testing**: Connectivity validation
- **Config Validation**: Project configuration check

### Real-time Console
- Live output from all operations
- Color-coded messages (info, success, warning, error)
- Process control (start/stop operations)
- Console history and clearing

## Keyboard Shortcuts

- `Ctrl + B`: Compile
- `Ctrl + F`: Flash
- `Ctrl + M`: Monitor
- `Ctrl + L`: Clear console

## Configuration Files

The web interface automatically saves configuration to:
- `config.json` - Main configuration file
- Browser localStorage - UI preferences

## Troubleshooting

### Server won't start
- Check if Node.js is installed: `node --version`
- Ensure port 3000 is available
- Check for error messages in PowerShell

### COM ports not detected
- Ensure ESP32 is connected
- Check Windows Device Manager
- Try refreshing the port list in the interface

### Build operations fail
- Verify PlatformIO is installed and in PATH
- Check project configuration
- Ensure all dependencies are available

### Can't access web interface
- Verify server is running on port 3000
- Check firewall settings
- Try accessing via `127.0.0.1:3000` instead

## Advanced Usage

### Custom Scripts
The interface can run any PowerShell script from the project directory. Add new scripts by:
1. Creating the script in the project root
2. Adding a button in the web interface
3. Configuring the script call in `server.js`

### Real-time Monitoring
The interface uses WebSockets for real-time communication:
- Process output is streamed live
- Configuration changes are synchronized
- Multiple browser tabs stay in sync

### File Operations
Future versions will support:
- File upload/download
- Code editing
- Log file viewing
- Project management

## Development

### Server Structure
- `server.js`: Main Express server with Socket.IO
- `public/index.html`: Web interface
- `public/styles.css`: Modern CSS styling
- `public/app.js`: Client-side JavaScript
- `package.json`: Node.js dependencies

### Adding Features
1. Add UI elements to `index.html`
2. Style with `styles.css`
3. Implement functionality in `app.js`
4. Add server-side handlers in `server.js`

# OpenEPaperLink Web UI: S3 ↔ C6 Flash and Log Test

This short guide covers flashing the ESP32‑S3 (OutdoorAP) first using the Web UI, then flashing the ESP32‑C6 (OutdoorAP_C6), and verifying wireless log streaming from C6 to S3 (shown on S3 TFT and mirrored in the Web UI).

## Prereqs
- Connect boards to your PC:
  - ESP32‑S3 on COM10 (per your setup)
  - ESP32‑C6 on COM13 (per your setup)
- Start the Web UI server (PM2 or `node server.js`). It serves from `ESP32_AP-Flasher/web-ui` on http://localhost:3000

## Flash ESP32‑S3 first (OutdoorAP)
1. Open the Web UI in your browser: http://localhost:3000
2. In the header COM dropdown, select COM10.
3. Environment: OutdoorAP.
4. Click Build + Upload.
5. When done, click Monitor to watch S3 serial.

## Flash ESP32‑C6 (OutdoorAP_C6)
1. Switch Environment to OutdoorAP_C6.
2. Select COM13 in the header COM dropdown.
3. Click Build + Upload.
4. Click Monitor to watch C6 serial.

## Verify wireless UDP logs
- The C6 broadcasts logs to 239.1.2.3:15100; the S3 joins this multicast and displays messages on its TFT.
- You should see messages like: `C6|heartbeat ok` on the S3 TFT and in the Web UI console.
- If Wi‑Fi isn’t configured, the C6 starts a fallback AP `OEPL-C6-Logger` (password `oepl1234`). Connect the S3 to the same network or configure Wi‑Fi via the Web UI device commands.

## Tips
- COM list refresh: click the refresh icon next to the header COM select or the Device section refresh.
- Logs in the Web UI: open the Console on the main page or use the Logs page to tail `serial` or `process-out`.
- If you change firmware, rebuild both environments.

## Troubleshooting
- If S3 doesn’t show UDP logs, ensure both devices are on the same L2 network and multicast isn’t blocked by your Wi‑Fi AP/router.
- Serial monitor busy: close one monitor before opening another on the same COM.
- Reset boards after flashing if you don’t see expected output.

## Security Notes

- The web interface runs on localhost only
- No external access by default
- Consider firewall rules for network access
- Configuration files may contain sensitive data

## Performance

- Real-time output streaming
- Efficient WebSocket communication
- Responsive design for mobile devices
- Optimized for development workflows

## Support

For issues or questions:
1. Check the console output for errors
2. Verify all prerequisites are installed
3. Test with a simple compile operation first
4. Check network connectivity if using remote access

## AI Assistant Widget

A lightweight floating AI assistant widget has been added to the main site header. It provides a quick access panel (icon in the bottom-right) that can show canned help responses and integrates with the full AI page at `/ai-agent.html` when available.

Files:
- `wwwroot/ai-agent-widget.css` — styles for the floating assistant
- `wwwroot/ai-agent-widget.js` — client logic that initializes the widget

To disable the widget, remove or comment out the include of `ai-agent-widget.js` from `wwwroot/universal-header.html`.
