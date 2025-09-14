# ESP32 S3 Toolkit Restructuring Plan

This document outlines the restructuring of the current OpenEPaperLink AP firmware into a generic, extensible ESP32-S3 based developer toolkit supporting modular features controllable via Web API, Web UI (Next.js client), and Serial CLI.

## Vision

Transform the existing monolithic AP firmware into a pluggable runtime where discrete capabilities (WiFi management, LED control, ePaper tag management, RFID, IR, peer networking, display functions, etc.) are encapsulated as modules with:

- Clear lifecycle (initialize → start → active → suspend → stop → cleanup)
- Self-described metadata & capabilities
- Consistent REST/WebSocket API surface (`/api/v1/<domain>/...`)
- Optional serial command namespace (`<DOMAIN>:` or CLI subcommands)
- Persisted per‑module configuration (LittleFS JSON)
- Health + metrics introspection for observability

## Phase 1 (Current Sprint Goals)

1. WiFi Management Module (already implemented as `WiFiModule`)
   - Normalize endpoints under versioned namespace (`/api/v1/wifi/*`) while keeping legacy `/api/wifi/*` with deprecation responses.
   - Provide status, scan, connect/disconnect, AP config, mode set, events.
2. LED Control Module (new `LEDModule`)
   - Basic brightness + mono/RGB color + pattern preview.
   - Endpoints: `/api/v1/led/status`, `/api/v1/led/set`, `/api/v1/led/pattern` (future), with idempotent JSON body.
   - Serial command support: `led status`, `led set r g b brightness`.
3. Tag / ePaper Management (existing logic) – leave as legacy for now; plan module extraction in Phase 2.

## Phase 2 (Planned)

- TagModule: CRUD on tag DB, push content jobs, batch operations.
- RFIDModule: RC522 abstraction (scan, read UID events, filter, WebSocket push).
- IRModule: Learn + transmit IR codes, library mapping.
- PeerModule: Discover/connect peer APs, sync tag states, remote command proxy.
- DisplayModule: TFT diagnostics, log mirror, performance gauges.
- OTA/UpdateModule: Consolidate C6 flashing + self OTA + module binary distribution.

## Module Naming & Conventions

- Class names: `<Name>Module` deriving from `ModuleInterface`.
- Source files: `name_module.h/.cpp` (e.g. `led_module.h`).
- Config file (if needed): `/current/<name>_config.json`.
- Metrics key prefix: `<name>.` (e.g. `wifi.rssi`, `led.brightness`).

## API Versioning Strategy

Introduce a stable versioned path `/api/v1/` for all *new* or refactored endpoints. Legacy unversioned paths continue temporarily and respond with either data (compatibility) or HTTP 410 + pointer to new path once replicated.

Example mapping:

| Legacy | New |
|--------|-----|
| `/api/wifi/status` | `/api/v1/wifi/status` |
| `/api/wifi/scan` | `/api/v1/wifi/scan` |
| (new) | `/api/v1/led/status` |

Deprecation header suggestion: `Deprecation: true` + `Link: </api/v1/wifi/status>; rel="successor-version"`.

## Serial Interface Strategy

Retain lightweight line‑based CLI (`serial_cli.cpp`) for developer interaction. Add modular command registry minimal layer (future). For Phase 1 LED integration we extend parser minimally (avoid large refactor now):

- Commands: `led status`, `led set <r> <g> <b> [brightness]` (RGB only if `HAS_RGB_LED`).
- Output in single‑line JSON to enable tooling consumption.

Later: Add `mod list`, `mod start <name>`, `mod stop <name>` wrapper to call ModuleManager.

## Configuration Persistence

Short term: LED has ephemeral runtime state (color/brightness) optionally saved to `/current/led_config.json` when set endpoint includes `persist=true`.

WiFi persistence already handled (`staconfig.json` + `apconfig.json`). When introducing versioned endpoints we *do not* immediately change storage schema.

## Error & Health Reporting

`ModuleInterface::getStatus()` returns compact JSON fragment. Toolkit aggregator endpoint `/api/modules` remains; add `/api/v1/system/health` (future) summarizing module states + key metrics subset.

## LEDModule Draft Contract

Inputs (REST JSON POST `/api/v1/led/set`):

```json
{ "r":0-255, "g":0-255, "b":0-255, "brightness":0-255, "persist":bool }
```

Outputs (status):

```json
{ "on": true, "r":0, "g":0, "b":0, "brightness":128, "hardware": "rgb", "uptimeMs": 123456 }
```

Error modes: 400 invalid range, 500 hardware not compiled.

## Migration Notes

1. Do not break existing UI immediately; keep `/api/wifi/*` operational until Web UI Next migrates.
2. Introduce new endpoints side‑by‑side; mark old with 410 once frontend switched.
3. Extract large legacy subsystems one at a time into modules to keep flash growth controlled.

## Future Enhancements

- Unified event bus + WebSocket multiplex channel (`/ws` with `{type:"event", module:"wifi", ...}`)
- Dynamic module loading (header-only plugin model) for user experiments.
- Build flag auto‑generation from `lib_config.json`.
- Structured logging (CBOR or compact JSON) for optional remote ingestion.

---
Document version: 0.1 (Phase 1 scaffold)
