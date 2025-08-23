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

```text
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

## S3 ↔ C6 Flash and Log Test

This short guide covers flashing the ESP32‑S3 (OutdoorAP) first using the Web UI, then flashing the ESP32‑C6 (OutdoorAP_C6), and verifying wireless log streaming from C6 to S3 (shown on S3 TFT and mirrored in the Web UI).

## Prereqs

- Connect boards to your PC:
  - ESP32‑S3 on COM10 (per your setup)
  - ESP32‑C6 on COM13 (per your setup)
- Start the Web UI server (PM2 or `node server.js`). It serves from `ESP32_AP-Flasher/web-ui` on <http://localhost:3000>

## Flash ESP32‑S3 first (OutdoorAP)

1. Open the Web UI in your browser: <http://localhost:3000>
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

### Troubleshooting (S3 ↔ C6)

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

## Centralized Serial Connection (New)

The server now exposes a single, centralized serial connection managed by `serial_manager.js` instead of ad‑hoc opens in multiple routes. This removes race conditions and duplicate listeners while giving every browser tab a consistent view.

Benefits:

- Single owner of the hardware port (prevents double-open conflicts)
- Consistent enforcement of manual COM locking (if `manualComOnly` is enabled)
- Unified status reporting via `GET /api/serial/status`
- Real-time broadcast of data to all clients (`serial-data` events)
- Graceful degradation if the `serialport` module is missing (HTTP 501 returned)

Key REST endpoints:

- `GET  /api/com-ports` – filtered list of ports (respects manual mode)
- `GET  /api/serial/list` – same list wrapped with `{ success, ports }`
- `GET  /api/serial/status` – `{ available, open, path, baudRate, manualComOnly, allowedComPort, lastError, totalBytes }`
- `POST /api/serial/open` – body `{ path, baudRate? }`
- `POST /api/serial/close` – optional `{ path }` (closes current if path omitted or matches)
- `POST /api/serial/write` – `{ path, data }` must match the currently open path

Socket events (emitted to all clients):

- `serial-status` – status snapshot (also emitted on connect)
- `serial-data` – `{ port, text }` lines / chunks as received
- `serial-error` – `{ port, error }`
- `serial-opened`, `serial-closed` – legacy compatibility

Client changes:

- Front-end listens for `serial-status` and performs a one-time `/api/serial/status` fetch on load.
- Existing Open/Close/Send buttons continue to call the same REST endpoints (no action needed).

If you had any custom scripts directly importing `serialport` from within `server.js`, migrate them to call the SerialManager or the REST endpoints instead.

Troubleshooting:

- 501 responses on open/write -> install dependencies (`npm i serialport`) or rebuild native bindings
- Port stuck as open after unplug -> use `POST /api/serial/close`; the manager will reset its state on OS close/error events
- Wrong port filtered -> check `manualComOnly` / `allowedComPort` in configuration (`/api/config`)

## Centralized Device Selection (New)

Device records (name, host/IP, optional port/meta) and the currently selected device are now managed by a single `DeviceManager` on the server (`device_manager.js`). This replaces ad‑hoc JSON file writes scattered across routes and keeps every browser tab synchronized in real time.

Benefits:

- Atomic CRUD & selection with persistence in `data/devices.json`
- Socket broadcasts keep all tabs in sync (`device-list`, `device-selected`, `device-removed`)
- Backward compatible: legacy `POST /api/devices` (bulk replace) still works
- Normalized schema (each device: `{ id, name, host, port, meta }`)
- Simple extension point for future metadata (tags, lastSeen, capabilities)

Key REST endpoints:

- `GET    /api/devices` → `{ success, devices, selectedId }`
- `POST   /api/device` → body `{ name?, host?, port?, meta? }` returns `{ success, device }`
- `PUT    /api/device/:id` → body patch fields; returns updated device
- `DELETE /api/device/:id` → `{ success }`
- `POST   /api/device/select` → body `{ id }` (or `{ id: null }` to clear) returns `{ success, selected }`
- (Legacy) `POST /api/devices` → `{ devices:[...], selectedId }` bulk replace

Socket events:

- `device-list` → `{ devices:[...], selectedId }` (on connect & any list change)
- `device-selected` → `{ id, host, name, port } | null`
- `device-removed` → `{ id }`

Client changes:

- Front-end listens for the socket events and re-renders the saved devices panel automatically.
- Existing localStorage fallback remains (used only if server request fails initial load).
- Selecting a device now automatically applies COM port & host hints (updates header COM dropdown and remote test logic).

Usage examples (PowerShell / curl style):

```powershell
# Add a device
curl -X POST http://localhost:3000/api/device -H 'Content-Type: application/json' -d '{"name":"OutdoorAP S3","host":"192.168.1.50","port":"COM10"}'

# Select it
curl -X POST http://localhost:3000/api/device/select -H 'Content-Type: application/json' -d '{"id":"outdoorap-s3"}'

# Update name
curl -X PUT http://localhost:3000/api/device/outdoorap-s3 -H 'Content-Type: application/json' -d '{"name":"S3-Gateway"}'

# List
curl http://localhost:3000/api/devices
```

Troubleshooting:

- Empty list? Confirm `data/devices.json` is writable and not corrupted (delete it to reset)
- Selection not sticking? Check for multiple rapid updates (debounce client calls) or file permission issues
- Duplicate IDs? IDs are auto-generated from name/host and de-duplicated with numeric suffixes

Extending:

- To add more per-device metadata (e.g. firmware version), PATCH with a `meta` object: `{"meta":{"fw":"1.2.3"}}`.
- Hook into events by requiring `device_manager.js` in new modules and listening for `changed` / `selected`.

## WiFi Manager (New / Enhanced)

The WiFi tab now exposes a consolidated, firmware‑agnostic view of the currently selected device's WiFi state plus management actions. It normalizes multiple possible device API formats (different OEPL firmware generations / variants) into a single status schema.

The WiFi page now also includes a Saved Device dropdown (fed by the centralized DeviceManager) so you can switch the active device context without returning to the Dashboard. Selecting a device here calls the same `POST /api/device/select` endpoint used elsewhere.

### Key Features

- Unified WiFi Status panel (auto‑refresh every 10s + manual refresh)
- Normalized status fields (connected / ssid / rssi / ip / channel / mode)
- Best‑effort disconnect action (tries several known firmware endpoints)
- Existing network Scan + Connect preserved (serial & device pathways)
- Raw snapshot (for debugging) retained in the response

### New REST Endpoints

| Method | Path                          | Purpose |
|--------|-------------------------------|---------|
| GET    | `/api/device/wifi/status`     | Aggregated WiFi status for the currently selected device |
| POST   | `/api/device/wifi/disconnect` | Attempt to disconnect WiFi on the selected device |

Existing (unchanged) device endpoints for WiFi actions:

- `GET  /api/device/wifi/scan`
- `POST /api/device/wifi/connect` body: `{ ssid, password }`

Serial / Improv pathways (fallback when using serial provisioning):

- `GET  /api/serial/wifi/scan`
- `POST /api/serial/wifi/connect` body: `{ ssid, password }`

### Status Normalization

The server probes several potential device URLs and merges what it finds:

1. `/network_info`
2. `/sysinfo`
3. `/api/telemetry`
4. `/api/status`
5. `/api/ping` (fallback presence / liveness)

Returned JSON shape:

```jsonc
{
   "success": true,
   "status": {
      "connected": true,          // boolean (inferred if SSID / IP present)
      "ssid": "MyWiFi",
      "rssi": -58,                // dBm if available
      "ip": "192.168.1.123",
      "channel": 6,               // number if exposed
      "mode": "STA",             // STA / AP / Mixed / Unknown
      "lastUpdated": 1730000000000, // epoch ms (server side)
      "raw": { /* per-endpoint original fragments kept here */ }
   }
}
```

If no endpoint responds or the device is offline:

```json
{ "success": false, "error": "unreachable or no wifi data" }
```

### Disconnect Semantics

`POST /api/device/wifi/disconnect` tries a small list of known firmware routes (GET or POST forms):

- `/wifi_disconnect`
- `/disconnect_wifi`
- `/api/wifi/disconnect`

The first successful HTTP 200 response is reported. If all attempts fail you receive:

```json
{ "success": false, "error": "all disconnect attempts failed" }
```

### UI Usage

1. Select / add a device (Device panel) so the server knows which host to query.
2. Open the WiFi tab.
3. Status panel auto loads; use Refresh if you need immediate update.
4. Use Scan → select SSID → Connect to join a network.
5. Once connected, RSSI/IP/Channel populate; click Disconnect to drop the link.

### Troubleshooting WiFi

| Symptom | Suggestion |
|---------|------------|
| Status always shows Unknown | Ensure the device host/IP is reachable (ping) and firmware exposes at least one of the probed endpoints. |
| Disconnect fails | Firmware may not implement any of the known routes; check device logs or update firmware. |
| RSSI missing | Your firmware variant may not report signal strength in any of the probed endpoints. |
| Mode incorrect | Some older builds do not distinguish AP/STA; value will fall back to `Unknown`. |
| Long refresh time | Network latency or device busy; reduce polling interval only if necessary to avoid load. |

### Extending

Add additional probe endpoints or field mappings inside the server's WiFi status handler to support new firmware JSON layouts. Favor additive changes (only enrich when a field is absent) to keep backwards compatibility.

Potential future enhancements (not yet implemented):

- AP mode configuration / toggling
- Remembered network list & forget action
- Live signal quality graph (WebSocket push)
- DHCP vs static IP config UI

PRs welcome if you need any of these sooner.
