# Unified WiFi / AP API

This document describes the consolidated WiFi API that supersedes a number of legacy endpoints. All runtime WiFi, scanning, AP control, and diagnostics functions are now provided directly by the `WiFiModule` under the `/api/wifi/*` namespace.

## Canonical Endpoints

| Purpose | Method / Path | Notes |
|---------|---------------|-------|
| Station/AP status + health | GET /api/wifi/status | Enriched: hostname, apIp, mode, gw, dns, txPowerDbm, lastEvent, scanRunning |
| Start a WiFi scan | GET /api/wifi/scan | Optional `?verbose=1` for synchronous scan; returns initiated & (if sync) immediate results meta |
| Retrieve last scan results | GET /api/wifi/scan/results | Returns `running` flag and list of networks (ssid,rssi,channel,enc,bssid) |
| Connect (multi-network) | POST /api/wifi/connect | Form fields: ssid/password, or ssid1/password1..ssid5/password5 |
| Disconnect | POST /api/wifi/disconnect | Force STA disconnect; may continue AP if active |
| Clear credentials & reboot | POST /api/wifi/clear | Wipes `/current/staconfig.json` and restarts |
| Recent WiFi / system events | GET /api/wifi/events | Ring buffer of recent broadcast events |
| AP state/config | GET /api/wifi/ap | Current AP runtime state and stored configuration |
| AP control | POST /api/wifi/ap | Form fields: action=start\|stop\|restart + optional ssid,channel,hidden,max_clients |
| Summary (status + AP in one) | GET /api/wifi/summary | Lightweight combination for dashboards |

## Legacy Endpoint Mapping

| Legacy | Replacement |
|--------|-------------|
| /wifi_scan | GET /api/wifi/scan (init) + GET /api/wifi/scan/results (data) |
| /get_ssid_list | GET /api/wifi/scan/results |
| /network_info | GET /api/wifi/status (+ GET /api/wifi/ap if AP fields needed) |
| /wifi_manage | POST /api/wifi/connect /disconnect /api/wifi/scan /api/wifi/ap |
| /serial_ap_status | GET /api/wifi/ap |
| /serial_ap_control | POST /api/wifi/ap |

All deprecated endpoints now return HTTP 410 JSON: `{ "deprecated": true, "use": "<new>" }`.

## Scan Workflow (Recommended)

1. Initiate: `GET /api/wifi/scan` (optionally `?verbose=1` for synchronous).
2. Poll: `GET /api/wifi/scan/results` until `running == false`.
3. Use `timestamp` and `count` to detect new data vs cached.

## Example Responses

### GET /api/wifi/status

```json
{
  "connected": true,
  "ssid": "MyNet",
  "ip": "192.168.1.58",
  "hostname": "OEPL-12AB34",
  "rssi": -51,
  "channel": 6,
  "mac": "AC:DE:48:00:11:22",
  "mode": 3,
  "apMode": true,
  "apClients": 1,
  "apIp": "192.168.4.1",
  "reconnectAttempts": 0,
  "useWiFiMulti": true,
  "savedNetworkCount": 3,
  "lastScan": 12345678,
  "scanRunning": false,
  "gw": "192.168.1.1",
  "dns": "192.168.1.1",
  "txPowerDbm": 78,
  "healthy": true,
  "lastEvent": { "ts": 12345555, "name": "wifi_scan_complete", "data": "18" }
}
```

### GET /api/wifi/scan/results

```json
{
  "timestamp": 12345678,
  "count": 2,
  "running": false,
  "networks": [
    { "ssid": "MyNet", "rssi": -51, "channel": 6, "enc": "wpa2", "bssid": "AA:BB:CC:DD:EE:FF" },
    { "ssid": "Guest", "rssi": -70, "channel": 1, "enc": "open", "bssid": "11:22:33:44:55:66" }
  ]
}
```

### POST /api/wifi/ap (start)

Form fields: `action=start&ssid=OEPL_AP&channel=6&hidden=0&max_clients=6`

```json
{ "success": true, "result": "AP started" }
```

## Events

The module emits (and records) these event names for observability:

- wifi_scan_start (data: sync|async)
- wifi_scan_complete (data: count)
- wifi_ap_started (data: manual|restart)
- wifi_ap_stopped (data: manual)
- (Plus other system/wifi events already broadcast by ModuleManager)

Use `GET /api/wifi/events` to view recent events (ring size 16).

## Migration Tips

- Replace direct calls to `/wifi_scan` with the two-step scan + results pattern.
- Where UI expected combined wifi{} & ap{} from `/network_info`, fetch `/api/wifi/summary` or perform two parallel requests and merge.
- Treat HTTP 410 as a redirect signal: read JSON `use` field and re-issue request.
- Remove retry fallbacks referencing any deprecated endpoints once all devices are updated.

## Versioning / Stability

The new endpoints aim for stability; additive fields may appear without breaking existing clients. Rely on presence tests rather than rigid schema assumptions for forward compatibility.

## Future Enhancements (Potential)

- Optional pagination for very large scan result sets.
- Websocket push for scan complete & AP client changes.
- Configurable event history depth if RAM allows.

---
Generated automatically as part of API unification refactor.

## Frontend / Server Migration Status (Updated)

All known frontend and local server consumers have been migrated to the unified endpoints:

- main.js, setup.js, openai-agent.js, c6_module.js now initiate scans via `GET /api/wifi/scan` (or helper) and poll `/api/wifi/scan/results`.
- dev/app.js network status aggregation replaced with `/api/wifi/summary` (fallback `/api/wifi/status`).
- server.js proxy & aggregation logic updated to prefer `/api/wifi/scan` + `/api/wifi/scan/results`, `/api/wifi/summary`, and `/api/wifi/status`; legacy `/wifi_scan`, `/get_ssid_list`, and `/network_info` retained only as last‑ditch fallbacks with deprecation comments and will be removed after device fleet update.
- A legacy shim in `api-manager.js` logs a warning if `get_ssid_list` style usage is attempted, forwarding to unified results.

Next removal window: After confirming no inbound HTTP 410 responses are observed for one release cycle, the legacy fallbacks will be deleted from server.js and the shim removed.

Deprecation telemetry suggestion: Count 410 responses for deprecated paths to verify complete client migration before physical removal.

Status: Migration COMPLETE; safe to rely exclusively on `/api/wifi/*` for new development.
