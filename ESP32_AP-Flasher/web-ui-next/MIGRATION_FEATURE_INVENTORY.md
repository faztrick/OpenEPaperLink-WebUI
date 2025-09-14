# Legacy Web-UI Feature Inventory (Source of Truth for Migration)

This document enumerates the functional surface of the legacy `web-ui` (Express + socket.io) application. It is the authoritative inventory used to drive migration and deprecation.

Status legend (to be applied in mapping phase):

- PRESENT: Fully implemented already in `web-ui-next`.
- PARTIAL: Some aspects exist; more work required.
- NEEDED: Not present; required for parity.
- DEFER: Useful but intentionally postponed (not blocking deprecation).
- DEPRECATED: Will not be carried forward (justify rationale).

| # | Category | Legacy Endpoint / Feature | Description / Notes | Current Status | Target (Page/Module) | Comments |
|---|----------|---------------------------|---------------------|----------------|----------------------|----------|
| 1 | Devices | GET /api/devices | List persisted devices | PRESENT | devices context / devices page | Fully implemented in Next device context |
| 2 | Devices | POST /api/devices | Replace full device list | PRESENT | devices context | Bulk replace supported via context update |
| 3 | Devices | POST /api/devices/add | Add single device | PRESENT | devices context | Normalize logic exists |
| 4 | Devices | GET /api/devices/selected | Get selected device | PRESENT | device context | Active device selection implemented |
| 5 | Devices | POST /api/devices/select | Select active device | PRESENT | device context |  |
| 6 | Devices | Persistence (devices.json) | Stored on disk | DEFER | storage abstraction | Use localStorage or minimal backend later |
| 7 | Wi-Fi | GET /api/device/wifi/status | Aggregate wifi status (multi-endpoint probing) | PRESENT | wifi hook | Implemented with stale caching (/api/v1) |
| 8 | Wi-Fi | GET /api/device/:id/wifi/status | Status by device id | PRESENT | wifi hook | Wrapper logic covered |
| 9 | Wi-Fi | GET /api/device/wifi/scan | Unified + legacy fallback scan | NEEDED | wifi page | Pending UI + hook |
|10 | Wi-Fi | POST /api/device/wifi/connect | Wi-Fi connect attempts (json/form) | NEEDED | wifi page | Provide form & feedback |
|11 | Wi-Fi | POST /api/device/wifi/disconnect | Attempt disconnect via multiple paths | NEEDED | wifi page | Button + confirmation |
|12 | Wi-Fi | AP summary GET /api/ap-summary | Summarizes AP+STA state across devices | NEEDED | ap list page | Drives AP overview |
|13 | Wi-Fi | AP enable/disable (implicit via device commands) | Control AP mode | NEEDED | ap list / device actions | Toggle per device |
|14 | Tags | Tag listing UI (legacy) | Table with alias, rssi, battery | PRESENT | tags page | Enhanced already |
|15 | Tags | Tag image upload | Upload endpoint bridging | PRESENT | tags upload component | TagImageUploader done |
|16 | Tags | Pending updates tracking | Indicates pending pushes | PRESENT | tags page | Status columns active |
|17 | Build/Process | POST /api/build (executeAction compile) | Launch build scripts | DEPRECATED | separate dev tool | Use CLI/VSCode tasks instead |
|18 | Build/Process | POST /api/fast-build | Fast compile path | DEPRECATED | separate dev tool |  |
|19 | Build/Process | POST /api/clean | Clean build | DEPRECATED | separate dev tool |  |
|20 | Build/Process | POST /api/upload | Build + upload to device | DEPRECATED | separate dev tool | Use PlatformIO tasks |
|21 | Build/Process | POST /api/monitor/start | Start serial monitor | DEFER | separate dev tool | Maybe lightweight viewer later |
|22 | Build/Process | Logs streaming (build output) | Socket.io events | DEFER | separate dev tool | Only if monitor added |
|23 | Serial | GET /api/serial/ports | List serial ports | DEFER | separate dev tool | Dev-centric feature |
|24 | Serial | POST /api/serial/open | Open port | DEFER | separate dev tool |  |
|25 | Serial | POST /api/serial/write | Write data | DEFER | separate dev tool |  |
|26 | Serial | Serial data events | Socket broadcast | DEFER | separate dev tool |  |
|27 | Remote | POST /api/remote/connect | Connect remote server | DEPRECATED | n/a | Remove; outside scope |
|28 | Remote | POST /api/remote/execute | Execute remote command | DEPRECATED | n/a |  |
|29 | Remote | POST /api/remote/sync | Sync files to remote | DEPRECATED | n/a |  |
|30 | Remote | Artifact listing /api/remote/artifacts | List built artifacts | DEPRECATED | n/a | Redundant with local build |
|31 | FS (Device) | GET /api/device-files/list | List files from device | DEFER | future file manager | Nice-to-have LittleFS UI |
|32 | FS (Device) | GET /api/device-files/read | Read file contents | DEFER | future file manager |  |
|33 | FS (Device) | POST /api/device-files/write | Write/overwrite file | DEFER | future file manager |  |
|34 | FS (Device) | POST /api/device-files/delete | Delete file | DEFER | future file manager |  |
|35 | FS (Local) | GET /api/artifacts | Local dist/firmware listing | DEPRECATED | n/a | Build artifacts via CLI |
|36 | PlatformIO Config | GET /api/platformio.ini | Read config (fallback python) | DEPRECATED | n/a | Avoid risky remote edits |
|37 | PlatformIO Config | POST /api/platformio.ini | Write changes | DEPRECATED | n/a |  |
|38 | Logging | GET /api/logs/list | List stored logs | DEFER | future observability | Low priority |
|39 | Logging | GET /api/logs/read | Read log file | DEFER | future observability |  |
|40 | Logging | SSE /api/stream/log | Stream server log | DEFER | future observability | Consider SSE unify |
|41 | Health | GET /api/health | Basic health summary | NEEDED | status badge component | Simple aggregated ping |
|42 | Health | GET /healthz | Liveness probe | NEEDED | backend infra | Minimal endpoint required |
|43 | Diagnostics | GET /api/tests/api | Run API tests | DEPRECATED | n/a | Use automated test suites instead |
|44 | Diagnostics | GET /api/tests/serial | Serial test | DEPRECATED | n/a |  |
|45 | AI Assist | /api/ai/config | Retrieve AI settings | DEPRECATED | n/a | Out of project scope |
|46 | AI Assist | /api/ai/chat (stream) | Chat & patch proposal | DEPRECATED | n/a |  |
|47 | AI Assist | /api/ai/analyze | Analyze code | DEPRECATED | n/a |  |
|48 | AI Assist | /api/ai/apply | Apply patch | DEPRECATED | n/a |  |
|49 | Device Commands | /api/device/:id/command | Send command passthrough | DEFER | device actions menu | Possibly restrict to safe commands |
|50 | AP Control | /api/device/:id/ap/enable | Enable AP mode | NEEDED | ap list / device actions | UI toggle planned |
|51 | AP Control | /api/device/:id/ap/disable | Disable AP mode | NEEDED | ap list / device actions |  |
|52 | Aggregation | Emitted wifi status via socket (device-wifi-status) | Push model | DEPRECATED | replaced by hooks | Poll/stale cache strategy |
|53 | Upgrade | Firmware upload endpoints | Upload via web | DEFER | upgrade page | Evaluate security implications |
|54 | Metrics | /api/wifi/summary multi-endpoint attempt | Data normalization | PARTIAL | wifi hook internals | Already leveraged partly |
|55 | Security | Rate limiting (wifi_scan) | Prevent abuse | NEEDED | middleware / client throttle | Add simple client-side debounce |
|56 | UX Infra | Static-only mode flag | Serve static assets only | DEFER | build config | Could become NEXT_PUBLIC flag |
|57 | UX Infra | Socket.io heartbeat & status dots | Real-time connectivity indicators | PARTIAL | status indicators | Replace sockets with periodic pings/SSE |
|58 | System | Graceful shutdown signals | Cleanup processes | DEPRECATED | n/a | Not relevant in static hosting |
|59 | System | Port auto-selection | Select open port | DEPRECATED | n/a | Managed by Next dev server |
|60 | Provisioning | Improv Wi-Fi integration | Over-the-air provisioning | DEFER | provisioning modal | Add if demand surfaces |

Next step: Populate Current Status + decisions (Todo #2).
