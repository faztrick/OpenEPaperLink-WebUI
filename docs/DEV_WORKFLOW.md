# OpenEPaperLink WebUI & Firmware Developer Workflow

> Focus: Local dev on Windows + PowerShell, Python virtual environment, Node Web UI server, PlatformIO build/flash, serial WiFi operations, and troubleshooting (GPIO0 WiFi reset loop, missing filesystem JSON files, NTP/time sync).

---

## 1. Prerequisites

- **Python** 3.11+ (ensure on PATH)
- **Node.js** 18+ (for `web-ui/server.js`)
- **PlatformIO Core** (`pip install platformio`) – or via VS Code extension
- **Git** (branch workflow: default branch `ss`, working branch `losdt`)
- **PowerShell 7** (default shell) / Windows Terminal
- **USB / Serial driver** for ESP32-S3 board

Optional:

- VS Code extensions: *Python*, *ESLint*, *PlatformIO IDE*, *REST Client*, *GitLens*.

---

## 2. Python Virtual Environment

```pwsh
# From repo root
python -m venv .venv
. .venv/Scripts/Activate.ps1
pip install --upgrade pip
pip install -r ESP32_AP-Flasher/requirements.txt
```

Verify:

```pwsh
python -c "import serial,requests;print('deps OK')"
```

The Node server auto-detects the venv Python via `resolvePythonExecutable()`; no manual path edits needed once activated before launch.

---

## 3. Start / Debug the Web UI Server

Preferred: use VS Code launch config: **Node: Launch Web UI Server (web-ui/server.js)**.

Manual:

```pwsh
node ESP32_AP-Flasher/web-ui/server.js
```

Default behaviors:

- Serves APIs and static assets (filesystem upload, build orchestration, WiFi scan/connect via serial/Improv).
- WebSocket + SSE for logs.
- Will attempt to locate Python for helper actions (build scripts, wifi config) inside `.venv`.

Attach debugger to a running instance (if started with `--inspect=9229`) via the **Node: Attach to Running Web UI (9229)** configuration.

---

### 3.1 Static Assets Layout (Updated)

The server now looks for UI assets in this priority order:

1. `ESP32_AP-Flasher/web-ui/public/device` (new preferred path)
2. `ESP32_AP-Flasher/wwwroot` (legacy fallback)

Mounted paths:

- `/` serves the first existing directory above.
- `/device` aliases the active directory (new path, or legacy if new missing).
- `/device-legacy` explicitly serves the legacy folder when both exist (for comparison / migration).

If neither directory exists the server still starts; API endpoints remain available (404 for static files until assets are added).

---

### 3.2 API Request Logging & Graceful Shutdown (New)

All `/api` requests are logged to `ESP32_AP-Flasher/web-ui/logs/api.log` (rotated manually if needed) with two entries per call:

```text
REQ <METHOD> <path>[?query] body=<truncated-json>
RES <METHOD> <path> status=<code> durMs=<elapsed>
```

Use the new shutdown endpoint to stop the Node server before flashing:

```http
POST http://localhost:3000/api/shutdown
```

The fast build script automatically attempts this at startup. If the server is not running, it proceeds without error.

---

## 4. Build & Flash Firmware (ESP32-S3 OutdoorAP)

Fast (PowerShell script – combines config + build improvements):

```pwsh
cd ESP32_AP-Flasher
./fast_compile.ps1 -Environment OutdoorAP -ComPort COM10 -BaudRate 921600
```

PlatformIO direct:

```pwsh
pio run -e OutdoorAP
pio run -e OutdoorAP -t upload --upload-port COM10
```

Erase + full filesystem re-upload (if needed): consult existing scripts (`simple_upload.ps1`, `upload_www_files.ps1`).

VS Code tasks (Terminal > Run Task):

- `FAST: Build OutdoorAP (Turbo)`
- `FAST: Build+Upload OutdoorAP (COM10 Turbo)`
- `PIO: Upload OutdoorAP (choose port)`

### 4.1 Web UI Flasher (New Unified Page)

Navigate to `flash.html` (now SPA-ready) for an integrated flashing dashboard:

Components:

- Environment selector (auto-populates from `/api/platformio-envs` when available; falls back to OutdoorAP/IndoorAP/Debug)
- COM port selector (queried from `/api/com-ports` with graceful fallback list)
- Baud rate selector (115200 / 460800 / 921600)
- Flags:
  - FS Only: run filesystem-only upload (`-FilesystemOnly`)
  - Skip Upload: build only (`-SkipUpload`)
  - Skip Build: upload only (`-SkipBuild`)
  - Fast: convenience toggle (Python path currently uses standard scripts; dedicated fast buttons provided separately)
- Action Toolbar:
  - Build+Upload Py (compile.py)
  - Build Only Py (compile.py -SkipUpload)
  - Fast Py (fast_compile.py)
  - Build+Upload PS (compile.ps1)
  - Fast PS (fast_compile.ps1)
  - Monitor (opens `pio device monitor` with selected port & baud)
  - Clean (`pio run -e <env> -t clean`)
  - Stop (terminates current process via socket `stop_process`)
  - Clear (clears log panel)
- Firmware Upload / OTA:
  - Upload File: POST `/api/firmware/upload` (stores path for later use)
  - Trigger OTA: POST `/api/firmware/trigger` with host + uploaded path
  - Host field: target device IP/hostname for OTA
- Artifacts Meta: Attempts GET `/api/build-artifacts?env=<env>` (shows count + latest name; falls back to “(none)” if unsupported)
- Console Panel:
  - Live merged output (stdout/stderr color coded)
  - Auto trims to 1500 lines (drops oldest 10%)
  - Copy button copies all visible lines to clipboard

Process Lifecycle:

1. Button emits either `run_script` (for .py / .ps1) or `run_command` (pio monitor / clean)
2. Buttons disable & Stop enables while a process is active
3. Output channels consumed: `process-output`, `output`, `serial-data` (all timestamped)
4. On `process-finished` or `process_complete`, buttons re-enable and artifacts metadata refreshes

SPA Behavior: The script (`flash.js`) self-guards with `window.__FLASH_INIT` and re-initializes on `spa:navigated` events so navigating away and back does not double-bind handlers.

Persistence:

- LocalStorage keys: `oepl:flash:env`, `oepl:flash:port`, `oepl:flash:baud`, `oepl:flash:flags` (JSON) automatically updated on change.

Troubleshooting:

- If PowerShell scripts fail to launch ensure `pwsh` (PowerShell 7) is on PATH.
- If COM list empty, fallback entries appear; verify board enumerates in Device Manager.
- If fast scripts hang early, confirm the Web UI server is not already shutting down (fast script attempts shutdown first).
- OTA requires the device’s HTTP OTA endpoint to be reachable and powered; confirm network path and that firmware server path exists.

Future Enhancements (tracked separately): artifact selection for OTA directly, progress % parsing, integrated diff for filesystem-only uploads.

### 4.2 Shared Device Header (dev-common.js)

A central script (`dev-common.js`) now powers the device / communication controls rendered in the header of all development pages (`device.html`, `wifi.html`, `ap-list.html`, `flash.html`, `settings.html`, etc.).

Responsibilities:

`dev-common` events:

- `dev-common:devices:updated` (payload: `{ devices, selectedId }`)
- `dev-common:device:changed` (payload: `{ id }`)
- `dev-common:comm:mode` (payload: `{ mode }`)
- `dev-common:comm:port` (payload: `{ port }`)
- `dev-common:com:updated` (payload: `{ port }`)

Integration Notes:

### 4.3 Firmware Features Panel (device-features.js)

On `device.html` a new "Firmware Features" section introspects `/api/features` on the selected device. The module (`device-features.js`) listens to `dev-common:device:changed` and provides a manual Refresh button.

Behavior:

- Attempts `GET <deviceBase>/api/features` (4s timeout).
- Accepts either an object `{ featureName: true/false }` or a simple array `["FeatureA", "FeatureB"]`. Arrays are normalized to an object where each name maps to `1`.
- Renders each feature as a small card (green = enabled / present, red = missing / falsey).
- If the endpoint is missing or returns error, displays "No features reported" (status shows Error).

Extensibility Ideas:

- Link each feature to documentation, or expose action buttons (e.g. enable/disable module) if firmware adds APIs.
- Merge telemetry to show last update or version per feature.
- Add caching + diff indicator (highlight newly appeared features after a firmware update).

Troubleshooting:

- If every feature shows MISSING, verify the device firmware implements `/api/features` and that the selected IP is reachable directly from the browser (CORS is same‑origin through device host). If not available, implement a fallback mapping in the firmware.

---

## 5. Serial Monitoring

Two options:

```pwsh
# PlatformIO monitor
pio device monitor --baud 115200 --port COM10
```

Or VS Code launch config **PlatformIO: Monitor (COM10)**.

Use while booting to observe `[BOOT-TEST]` line and WiFi / filesystem diagnostics.

---

### 5.1 Enhanced Serial APIs & UI (New)

The development Web UI now provides richer serial management to quickly recover from baud mismatches or stuck ports.

Defaults:

- Firmware baseline console baud: **115200**.
- Server default `baudRate` aligns at 115200.
- `manualComOnly` mode restricts operations to a single allowed port (default `COM10`).

Endpoints:

| Method | Path | Purpose | Body / Query |
| ------ | ---- | ------- | ------------ |
| POST | `/api/serial/reopen` | Close (if needed) and open the port at a baud | `{ path:"COM10", baudRate:115200 }` |
| GET | `/api/serial/diagnose` | Report status and send a newline poke | None |
| POST | `/api/serial/write?autoNL=1` | Send data (auto adds `\n` when `autoNL=1`) | `{ path, data }` |
| POST | `/api/com/check` | One-shot health check (write + wait for bytes) | `{ path, timeout, testCmd? }` |
| GET | `/api/serial/commands` | Quick command list for dropdown | (none) |

PowerShell examples:

```pwsh
# Diagnose
Invoke-RestMethod http://localhost:3000/api/serial/diagnose

# Reopen (ensure correct baud)
Invoke-RestMethod http://localhost:3000/api/serial/reopen -Method Post -Body (@{ path='COM10'; baudRate=115200 } | ConvertTo-Json) -ContentType 'application/json'

# Send command with auto newline
Invoke-RestMethod "http://localhost:3000/api/serial/write?autoNL=1" -Method Post -Body (@{ path='COM10'; data='help' } | ConvertTo-Json) -ContentType 'application/json'

# COM health quick check (800 ms timeout)
Invoke-RestMethod http://localhost:3000/api/com/check -Method Post -Body (@{ path='COM10'; timeout=800 } | ConvertTo-Json) -ContentType 'application/json'
```

UI controls added:

- Baud selector (115200 / 460800 / 921600 / 2000000*)
- Reopen button
- Diagnose button
- Auto NL checkbox
- Quick Commands dropdown (populated from `/api/serial/commands`)

*Use very high baud values only if firmware switches and cable/driver quality are sufficient.

Recovery workflow:

1. Diagnose -> check `open=yes` and baud.
2. If closed / wrong baud: adjust + Reopen.
3. Send `help` (Auto NL). Expect a response / prompt.
4. If silent: COM Check; then verify cable / Device Manager / other process lock.
5. Still stuck: power-cycle device and Reopen.

Common errors:

| Message | Meaning | Fix |
| ------- | ------- | --- |
| Failed to fetch | Browser can’t reach server | Start server / verify port |
| port not open | Write attempted before open | Reopen first |
| Manual COM mode active | Attempted different port | Change allowed port or disable manual mode |
| Garbled chars | Baud mismatch | Select matching baud & Reopen |

Future improvements (planned): High-speed auto-detect, firmware status command integration, log verbosity toggles.

---

### 5.2 Built-in Developer Serial CLI (New)

### 5.3 WiFi LED State Legend (Advanced Scheme)

If `ENABLE_ADV_WIFI_LED` is compiled (default enabled when `wifi_led_hooks.cpp` present), the single RGB status LED encodes WiFi state:

| State | Color / Pattern | Meaning |
|-------|-----------------|---------|
| Disconnected (STA idle / trying) | Fast breathing Blue | STA searching / not associated |
| STA Connected only | Very slow breathing Blue (appears solid) | STA up, AP not running |
| AP only (no STA) | Breathing Purple | Management / fallback AP active, no STA link |
| STA + AP both active | Alternating 4s Blue / 4s Purple | STA connected while AP kept available |

Notes:

- “Breathing” speed controlled by `rgbIdlePeriod`: lower = faster.
- Purple = RGB(128,0,128) (balanced brightness). Adjust in `wifi_led_hooks.cpp` if your LED has color bias.
- To disable this scheme, define `ENABLE_ADV_WIFI_LED=0` (compile flag) or remove the `wifi_led_hooks.cpp` file.
- The original weak hooks remain if the feature is disabled (no color changes by WiFi events).

---

The firmware now includes a minimal line-oriented serial CLI intended for quick diagnostics without flashing a dedicated shell. It coexists with the Improv provisioning protocol by only consuming ASCII text that does not match a valid Improv frame.

Current commands:

| Command | Description |
| ------- | ----------- |
| `help` | List available commands |
| `sysinfo` | Show uptime, heap (and PSRAM if present), WiFi mode/status/IP |
| `tasks` | Show FreeRTOS task count (more detail requires trace facility) |
| `reboot` | Soft reboot the MCU |

Behavior & notes:

- Prompt shown as `>` after boot and after each completed command.
- Commands are case-sensitive (lowercase).
- Either `\n` or `\r` (or both) terminate a line.
- Backspace (BS / DEL) editing supported locally.
- Lines longer than 127 characters are cleared with a warning.
- If a line accidentally starts with the Improv magic (`IMPROV`) and then diverges, the buffered characters are gracefully redirected into the CLI, but the initial `I`..`M` characters will echo only after mismatch resolution (rare edge case).

Example session (115200 baud):

```text
> help
Commands: help, sysinfo, tasks, reboot
> sysinfo
--- sysinfo ---
Uptime: 12345 ms
Heap free: 210000 / 390000
WiFi mode: 3 status: 3 IP: 192.168.1.50
> tasks
--- tasks ---
Task count: 18
> reboot
Rebooting...
```

Troubleshooting:

| Symptom | Explanation | Action |
|---------|-------------|--------|
| No `>` prompt after boot | Serial not open yet or baud mismatch | Open/adjust to 115200 and press Enter (will re-print prompt) |
| Characters echo but no response on Enter | Line not terminated (e.g. using Ctrl+J in some terminals) | Ensure CR/LF or LF is sent |
| Command returns "Unknown" | Typo or unsupported | Type `help` to list commands |

Extensibility ideas:

- Add `wifi` subcommands (scan, reconnect, show creds status) guarded by feature flag.
- Add `loglevel <n>` to adjust verbosity at runtime.
- Provide a `mem` command with fragmentation stats.

---

## 6. WiFi Scanning & Configuration

### 6.1 Via Serial Improv API

With board connected on COM10 and server running:

```pwsh
python ESP32_AP-Flasher/scripts/wifi_scan_api.py --port COM10
```

Or REST example (using `scripts/rest_client.http` with REST Client extension) hitting endpoint:

```http
POST http://localhost:PORT/api/serial/wifi/scan
```

Response includes access points list.

### 6.2 Manual STA Credential Reset (Hardware)

Hold **GPIO0 LOW** for >5 seconds while powered. Firmware logic (see `wifimanager.cpp`) then:

1. Overwrites `/current/staconfig.json` with empty creds.
2. Calls `esp_wifi_restore()`.
3. Restarts the MCU.

If you keep holding the pin low, it repeats (loop). Release GPIO0 after you see `GPIO0 LOW detected` to avoid continuous restarts.

---

## 7. Filesystem (LittleFS) JSON Artifacts

During first boot you may see errors:

```text
open(): /littlefs/current/startup_modules.json does not exist
open(): /littlefs/current/modules_config.json does not exist
```

These are benign on a pristine filesystem. Defaults are applied.

### 7.1 Creating `startup_modules.json`

Use REST POST (server passes through when implemented) or craft manually:

```json
{
  "modules": {
    "APTask": false,
    "BLEWriter": false,
    "IRRemote": false,
    "USBFlasher": false,
    "WebFlasher": false,
    "UDP": false,
    "ContentRunner": false
  }
}
```

Upload to `/current/startup_modules.json` via web UI or filesystem tool if required.

### 7.2 `staconfig.json`

Format produced by reset routine:

```json
{"ssid":"","password":"","ip":"","mask":"","gw":"","dns":""}
```

You can extend with multi-network support:

```json
{
  "ssid":"HomeWiFi",
  "password":"secret",
  "networks":[{"ssid":"HomeWiFi","password":"secret"},{"ssid":"Backup","password":"pw2"}]
}
```

Place at `/current/staconfig.json` then reboot (or trigger reconnect via API if present).

---

### 7.3 Gzipped Asset Generation (Updated)

Use `ESP32_AP-Flasher/gzip_wwwfiles.py` to produce deterministic `.gz` versions of all files for `data/www`:

```pwsh
python ESP32_AP-Flasher/gzip_wwwfiles.py --clean
```

Behavior:

- Defaults to source: `web-ui/public/device` if present; else falls back to legacy `wwwroot`.
- Override with `--source SOME_DIR` and change output with `--dest OTHER_DIR`.
- `--clean` wipes the destination before recreating structure.

The script aborts with a helpful message if no suitable source directory is found.

---

## 8. NTP / Time Sync

If you encounter a stall waiting for valid time:

Checklist:

1. Ensure STA mode actually connects (RSSI present & IP != 0.0.0.0).
2. Verify DNS reachable: try another network or add fallback IP for pool servers.
3. Configure multiple NTP servers (pool + a regional + numeric IP) in init code.
4. Add bounded retry loop (e.g. 15s total) instead of indefinite wait.
5. Log each SNTP sync status callback so stalls show root cause.
6. Provide manual override (e.g. API to set epoch) for air-gapped tests.

---

## 9. Common Boot Loop: GPIO0 WiFi Reset

Symptom in logs (repeating every ~10s):

```text
GPIO0 LOW detected
Resetting WiFi settings...
... ✅ WiFi configurations cleared!
ESP-ROM:...
```

Resolution:

- Stop holding the button/jumper pulling GPIO0 low.
- Add a pull-up resistor if line is noisy.
- If you need a one-time reset: press & hold, observe `GPIO0 LOW detected`, keep held until **after** `Resetting WiFi settings...` appears, then release before restart completes.

Enhancement Idea (not yet implemented): add cooldown logic (ignore subsequent low events for N seconds) or require a double-tap pattern for reset.

---

## 10. Improving Developer Ergonomics (Future Ideas)

- Add API endpoint to initialize default `startup_modules.json` & `staconfig.json`.
- Provide `/api/time/set` for manual epoch set.
- Debounce GPIO0 low reset logic (time guard).
- Add filesystem integrity check & optional format command.

---

## 11. Quick Reference Commands

```pwsh
# Activate venv
. .venv/Scripts/Activate.ps1

# Start server (debug)
code -g .vscode/launch.json   # then press F5 (Node Launch)

# Fast build & flash
cd ESP32_AP-Flasher
./fast_compile.ps1 -Environment OutdoorAP -ComPort COM10 -BaudRate 921600

# PlatformIO build + upload
pio run -e OutdoorAP
pio run -e OutdoorAP -t upload --upload-port COM10

# Serial monitor
pio device monitor --baud 115200 --port COM10

# WiFi scan helper
python ESP32_AP-Flasher/scripts/wifi_scan_api.py --port COM10

# Rebuild gzipped UI assets
python ESP32_AP-Flasher/gzip_wwwfiles.py --clean
```

---

## 12. Troubleshooting Matrix

| Symptom | Likely Cause | Action |
|---------|--------------|-------|
| Repeated WiFi reset loop | GPIO0 held low | Release pin, verify hardware pull-up |
| Missing `startup_modules.json` | First boot / not created | Ignore or create default file |
| `No connection info saved` | Empty `staconfig.json` | Add credentials & reboot |
| Stuck waiting for NTP | Network/DNS/NTP unreachable | Add fallback servers, bounded wait, log callbacks |
| Cannot open serial (manual mode) | Port mismatch | Use COM10 or disable manual COM restriction |
| Static assets 404 | Missing `web-ui/public/device` and `wwwroot` | Create one of the directories or run gzip script after adding files |

---

## 13. Branch & Change Tracking

Current working branch: `losdt` (default: `ss`). Ensure you rebase or merge frequently if upstream changes occur in `ss`.

---

End of Developer Workflow Guide

---

Supplement: Comprehensive REST Client Collections

- Minimal: `ESP32_AP-Flasher/scripts/rest_client.http`
- Full coverage: `ESP32_AP-Flasher/web-ui/API_TESTING.http` (includes serial, device WiFi, build, logging, AI, remote, source browsing). Open in VS Code with the REST Client extension to issue requests.
