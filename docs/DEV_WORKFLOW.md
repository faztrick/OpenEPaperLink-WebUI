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
