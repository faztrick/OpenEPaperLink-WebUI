# Device Proxy Adaptive Timeouts

This document describes the adaptive timeout and stale cache behavior introduced for the multi-device proxy endpoint at `pages/api/device/[...path].ts`.

## Rationale

Previously the proxy used a fixed 15s timeout. When a device became slow or unreachable, UI requests (e.g. Wi‑Fi status polling every 5s) would block the browser thread of interaction until the full 15s elapsed, producing repeated 504 gateway errors and a degraded experience.

## Key Changes

* Default timeout reduced to 7s for generic device requests.
* Tighter 3.5s timeout for high-frequency Wi‑Fi status endpoints:
  * `api/wifi/status` (legacy)
  * `api/v1/wifi/status` (versioned)
* Optional per-request override via header: `X-Device-Timeout: <ms>` (clamped to 500–15000 ms) for diagnostic or long-running operations.
* Single retry path switch: if legacy status path times out, the proxy will attempt the versioned path (and vice versa) once before failing.
* In-memory stale cache of the last successful Wi‑Fi status (legacy and v1 tracked separately). On upstream timeout a stale response (if present) is included in the JSON response and consumed by the frontend to avoid UI blanks.

## Response Shapes

Successful JSON responses now include:

```json
{
  "proxied": true,
  "target": "http://device/api/v1/wifi/status",
  "status": 200,
  "elapsedMs": 42,
  ...deviceProvidedFields
}
```

Timeout / error JSON response example:

```json
{
  "error": "upstream_timeout",
  "message": "Upstream device timeout",
  "target": "http://device/api/wifi/status",
  "attempted": ["api/wifi/status", "api/v1/wifi/status"],
  "timeoutMs": 3500,
  "stale": {
    "ageMs": 12890,
    "data": { "proxied": true, "status": 200, ... }
  }
}
```

Where `stale` is omitted if no cache is available. The frontend `useDeviceWifiStatus` hook will surface stale data with an informational message instead of clearing the panel.

## Error Codes

| Code | Meaning | Notes |
|------|---------|-------|
| `device_base_url_not_set` | No base URL supplied | User must select device or set env var. |
| `upstream_timeout` | Request aborted due to timeout policy | May include `stale` payload. |
| `device_proxy_error` | Network or fetch error other than timeout | Check `message`. |
| `json_parse_failed` | Upstream returned invalid JSON while content-type said JSON | `rawError` embedded in body. |

## Cache Scope & Limitations

* Cache is in-memory only (cleared on server restart / redeploy).
* Only Wi‑Fi status endpoints are cached (legacy + v1). Other endpoints return errors immediately on timeout.
* Stale data age is provided to allow the UI to label it (e.g. "Stale (12.8s)" or similar).
* No size-based eviction needed presently (only two entries). If expanded, consider LRU.

## Frontend Behavior

`useDeviceWifiStatus` now:

1. Requests `/api/device/api/wifi/status` (legacy path) first for broad compatibility.
2. On timeout / 404 / 504 retries `/api/device/api/v1/wifi/status` once.
3. If both fail with `upstream_timeout` and stale data is present, displays stale status and an advisory message.

## Future Improvements

* Persist last-known status to disk for resilience across restarts.
* Distinguish between connection refused vs. slow responses for more granular error messaging.
* Include server timing headers (`Server-Timing`) for profiling in dev tools.

---

Change introduced as part of Wi‑Fi API versioning & reliability hardening effort.
