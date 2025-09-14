<!-- Concise AI guidance for OpenEPaperLink ESP32 AP + Next.js Web UI -->

# OpenEPaperLink – Firmware + Modern Web UI (AI Guide)

## 1. Architecture Overview
Firmware (PlatformIO / Arduino ESP32) exposes HTTP + WebSocket APIs (see `src/web.cpp`, `src/wifimanager.cpp`, `src/tag_db.cpp`). Web UI has two generations:
- Legacy static SPA in `wwwroot/` served by device.
- Next.js migration in `web-ui-next/` (React components, hooks, API proxy). Consolidated dashboard pattern; device selection influences request routing.

Key cross‑cutting concept: a selected device base URL (localStorage) + transport abstraction (serial / sidecar / http) drives where API calls go. Wi‑Fi + tag features rely on resilient polling with stale fallback.

## 2. Firmware Core Files
- `src/main.cpp`: boot + module init.
- `src/web.cpp`: REST endpoints (`/api/wifi/*`, `/get_db`, `/ws`), WebSockets (logs/events).
- `src/wifimanager.cpp`: STA/AP connect logic, scan orchestration.
- `src/tag_db.cpp`: tag state persistence (`tagDB.json`).
- `src/module_manager.cpp`: feature flag driven module registration (`platformio.ini` defines like `-D HAS_TFT=1`).

Storage: LittleFS (config + tag DB), NVS (Wi‑Fi creds). Follow safe C string patterns (`snprintf`, bounds checks, zero init).

## 3. Next.js Web UI (migration)
Location: `web-ui-next/`
- `pages/index.tsx`: Unified Dashboard (device list + tabbed Wi‑Fi/Tags/AP placeholders).
- `components/`: Layout, Sidebar (dynamic import), SelectedDeviceBar, Modals.
- `hooks/useDeviceWifi.ts`: Status + scan hooks (legacy + v1 path fallback, stale handling, cooldown logic, partial/legacy flags).
- `lib/deviceSelection.ts`: Pub/sub store; sets `selectedDevice` (id, baseUrl) in localStorage.
- `lib/transport.*`: Determines preferred/effective channel; status subscribed by UI.
- `pages/api/device/...`: Proxy (header `x-device-base-url` overrides) to firmware endpoints.
- `pages/api/serial/...`: Optional dev serial bridge (ENABLE_SERIAL_API) for local CLI & Wi‑Fi scan.

Resilience patterns: retry legacy vs v1 path, detect upstream timeout, serve stale snapshot (`json.stale.data`), mark `stale` in UI, provide explicit reload.

## 4. Build & Run
Firmware (primary env `OutdoorAP`):
```bash
pio run -e OutdoorAP                # build
pio run -e OutdoorAP -t upload      # flash (set upload port)
pio device monitor                  # serial log
```
Next.js UI dev (if separate): `npm install && npm run dev` inside `web-ui-next/` (or integrated root task). Set `NEXT_PUBLIC_AP_BASE_URL` or rely on selection.

## 5. Key Conventions
- Feature flags: add in `platformio.ini` (both `build_flags` + conditional `#ifdef`).
- Never block async handlers in firmware: prefer state machines / non‑blocking loops.
- Wi‑Fi scan workflow: trigger → poll `/scan/results` until `running=false` or timeout; stale fallback supported.
- All device HTTP fetches should include `x-device-base-url` if a selection exists; do not hardcode global IPs.
- Serial vs HTTP backend auto‑selection for scanning: determined from serial config (backend `serial|sidecar|auto`).

## 6. Adding / Modifying Web Endpoints
1. Implement firmware handler in `src/web.cpp` (maintain tight JSON: avoid large dynamic `String` concatenations; prefer streamed writes).
2. Expose via existing async server (ESPAsyncWebServer). Keep allocations minimal; reuse static buffers.
3. Mirror on Web UI via proxy route or direct fetch using `x-device-base-url`.
4. Update hook (e.g., extend `useDeviceWifiStatus`) with fallback + stale semantics.

## 7. Tag / Database Ops
- Tag DB lives in LittleFS (`tagDB.json`). Reads must guard against partial/empty file. Writes atomic: write temp + rename if implementing changes.
- UI endpoints (legacy) `/get_db` consumed by legacy pages; new React layer will wrap with typed interfaces (see `lib/api-types.ts`).

## 8. Reliability Patterns to Preserve
- Timeout classification: upstream timeout == show stale data & badge (do not clear previous state abruptly).
- Cooldown enforcement before next Wi‑Fi scan (`cooldownMs` in hook) to avoid firmware busy loops.
- Transparent legacy path fallback (`/api/wifi/status` → `/api/v1/wifi/status`).
- Transport status subscription for badges (preferred vs effective).

## 9. Security / Safety
- Always use `snprintf` / length‑bounded copying in firmware.
- Validate all indices / counts from client JSON before buffer usage.
- Avoid large dynamic `StaticJsonDocument` sizes; tailor capacity (fail early if overflow risk).
- Never trust `x-device-base-url` server side unless sanitized (current proxy trusts local usage).

## 10. When Extending
- Add new firmware feature: define flag in `platformio.ini`, guard code with `#ifdef`. Update docs comment at top of modified source.
- Add UI panel: create hook (SWR if polling), surface stale & error states as chips, avoid inline blocking logic.
- Provide minimal test (script or curl snippet) in PR description to reproduce.

## 11. Fast Reference
| Area | Firmware | Web UI |
|------|----------|--------|
| Wi‑Fi Status | `/api/wifi/status` | `hooks/useDeviceWifiStatus` |
| Wi‑Fi Scan | `/api/wifi/scan` + `/scan/results` | `useDeviceWifiScan.startScan()` / poll |
| Tags DB | `/get_db` | (future typed wrapper) |
| Transport | — (client concern) | `lib/transport` + sidebar badges |
| Serial Scan | CLI `wifiscan` | `/api/serial/wifi/scan` + `useSerialWifiScan` |

Keep new code aligned with these patterns; avoid inventing parallel selection or transport stores.

---
Feedback welcome: clarify anything missing (e.g., OTA details, module init flow) before large feature work.
