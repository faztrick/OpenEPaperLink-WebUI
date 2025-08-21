# Startup Modules Gating API

Controls which non-core subsystems automatically start at boot. Core subsystems (Web server, WiFi init sequence, Serial logging) are always enabled. All other modules default to disabled (false) until explicitly enabled via this API and then a reboot.

Config file: `/current/startup_modules.json`

Two supported on-disk schemas (the loader in `main.cpp` accepts both):
1. Object form (preferred):
```json
{
  "modules": {
    "APTask": false,
    "BLEWriter": true,
    "IRRemote": false,
    "USBFlasher": false,
    "WebFlasher": false,
    "UDP": true,
    "ContentRunner": false
  }
}
```
2. Legacy array form:
```json
{
  "modules": [
    { "name": "APTask", "autoStart": false },
    { "name": "BLEWriter", "autoStart": true }
  ]
}
```

If the file is missing or unparsable, safe defaults (all false) are applied.

## Endpoints

### GET `/api/startup_modules`
Returns the currently persisted module flags (object form). If the file does not exist, a synthesized default object is returned (all false).

Response example:
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

### POST `/api/startup_modules`
Update one or more flags. Body must be JSON with a `modules` object containing boolean values. Unknown keys are preserved (merge behavior) and only provided keys are updated.

Request body example (enable BLE writer and UDP):
```json
{
  "modules": {
    "BLEWriter": true,
    "UDP": true
  }
}
```

Success response:
```json
{ "success": true }
```

Notes:
- Change takes effect after reboot. Use `POST /reboot` or power-cycle.
- Object is merged with existing file: omitted keys retain their previous states.
- Legacy array format will continue to load but POST always writes the object form.

## Runtime Mapping

| JSON Key       | Global Flag            | Description |
|----------------|------------------------|-------------|
| APTask         | `gStart_APTask`        | Access Point processing/background AP radios task gating |
| BLEWriter      | `gStart_BLEWriter`     | BLE writer task (requires `HAS_BLE_WRITER`) |
| IRRemote       | `gStart_IRRemote`      | IR remote interface (requires `HAS_IR_REMOTE`) |
| USBFlasher     | `gStart_USBFlasher`    | USB flasher helper task (on boards with secondary USB) |
| WebFlasher     | `gStart_WebFlasher`    | External web flasher task (`HAS_EXT_FLASHER`) |
| UDP            | `gStart_UDP`           | UDP discovery + log receiver (`ENABLE_UDP_LOG_RECEIVER` / related) |
| ContentRunner  | `gStart_ContentRunner` | Periodic content generation cycle |

Located in `src/main.cpp` (search for `gStart_`).

## Example Flow

1. Query current flags:
```bash
curl http://<device>/api/startup_modules
```
2. Enable BLE + UDP gating flags:
```bash
curl -X POST http://<device>/api/startup_modules \
  -H "Content-Type: application/json" \
  -d '{"modules":{"BLEWriter":true,"UDP":true}}'
```
3. Reboot to apply:
```bash
curl -X POST http://<device>/reboot
```
4. After reboot, BLE writer and UDP subsystems will auto-start (if hardware features compiled).

## Error Handling
- Empty body -> HTTP 400 with `{ "success": false, "error": "Empty body" }`.
- Malformed JSON -> HTTP 400 `{ "success": false }`.
- Storage unavailable (rare) -> HTTP 400 `{ "success": false }`.

## Security Considerations
Currently unauthenticated; on exposed networks consider adding auth or restricting access (reverse proxy / firewall) before enabling remote module activation.

## Future Extensions (Ideas)
- Add `applied` vs `pending` state to reflect need for reboot.
- Timestamp and origin metadata (`updatedBy`, `updatedAt`).
- Optional soft-start (activate immediately without reboot if safe).
- Group presets (e.g., "minimal", "full", "diagnostic").
