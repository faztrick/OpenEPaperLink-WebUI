# API Versioning & Deprecation Policy

This document defines how legacy REST endpoints are maintained and deprecated in favor of versioned `/api/v1/*` endpoints for the OpenEPaperLink ESP32 AP firmware.

## Goals

- Provide a predictable migration path for clients.
- Allow the firmware to evolve schemas without sudden breakage.
- Communicate deprecation clearly via HTTP headers and aggregated health metadata.

## Current Versions

| Area | Legacy Prefix | Versioned Prefix | Notes |
|------|---------------|------------------|-------|
| WiFi | `/api/wifi/*` | `/api/v1/wifi/*` | Legacy still served with deprecation headers. |
| LED  | `/api/led/*` (if any) | `/api/v1/led/*` | Only versioned endpoints are canonical. Legacy may be added temporarily for UI fallback. |
| Health | N/A | `/api/v1/health` | New consolidated system status endpoint. |

## Deprecation Signaling

Legacy endpoints send at least one of the following headers:

```http
X-Deprecated: true
Deprecation: version=1; sunset="2025-06-30"
Link: </api/v1/wifi/status>; rel="successor-version"
```

Header usage details:

- `X-Deprecated`: Simple boolean style (for lightweight clients).
- `Deprecation`: Conforms to draft deprecation header conventions. The `sunset` date is the earliest removal target (subject to change; removal will NOT occur earlier than listed).
- `Link`: Points to the canonical replacement endpoint with relation `successor-version`.

## Client Migration Guidance

1. Prefer `/api/v1/*` endpoints for all new development.
2. Treat presence of any `X-Deprecated` header as a trigger to migrate.
3. Use `/api/v1/health` for multi-signal polling instead of multiple discrete status endpoints (reduces network and power consumption).

## Removal Timeline

| Stage | Signal | Action |
|-------|--------|--------|
| Introduce v1 | Add `/api/v1/...` + keep legacy | Deprecation headers enabled. |
| Warning Window | 3–6 months | Tooling (UI / CLI) warns if still calling legacy. |
| Sunset | Date arrives | Firmware may log warning each legacy call. |
| Removal | +1 release after Sunset | Legacy handler removed; 404 returned. |

Concrete target (subject to feedback):

- WiFi legacy endpoints sunset: 2025-06-30
- Removal no earlier than: first minor release after 2025-06-30

## Testing Strategy

Automated smoke tests (`test_api_endpoints.py`) validate:

- `/api/v1/wifi/status` returns mandatory keys.
- Legacy `/api/wifi/status` returns a deprecation header.
- `/api/v1/led/status` and validation behaviors for LED set.
- `/api/v1/health` returns required keys (`uptime`, `freeHeap`, `apiVersion`).

Additional future enhancements:

- Schema contract tests using JSON Schema (optional, low priority initially).
- Integration of health schema validation into CI.

## Health Endpoint Contract (Minimal v1)

```jsonc
{
  "apiVersion": 1,
  "uptime": <number>,           // seconds
  "freeHeap": <number>,         // bytes
  "wifi": {                     // optional subkeys may expand
    "connected": <bool>,
    "mode": "AP|STA|AP+STA"
  },
  "led": {                      // present if LED module registered
    "module": "LED",
    "brightness": <number>
  },
  "modules": {
    "count": <number>,
    "list": [ "LED", "WiFi", ... ]
  }
}
```

Clients MUST ignore unknown keys for forward compatibility.

## Versioning Rules

- Minor additive changes (new keys) do not bump `apiVersion`.
- Removal or semantic change of an existing key bumps to `/api/v2/*` (future).
- `/api/v1/health` may grow optional nested objects (e.g., `tags`, `storage`, `radio`).

## Error Handling

- Legacy endpoints removed will return HTTP 404.
- Prior to removal, if an endpoint’s semantics degrade, HTTP 410 (Gone) MAY be used for one release cycle to accelerate migration.

## Roadmap (Draft)

| Milestone | Focus |
|-----------|-------|
| M1 | Establish v1 (done) |
| M2 | Tag/ePaper module status in health |
| M3 | Introduce `/api/v1/modules` enumeration (if size of health grows excessively) |
| M4 | Evaluate sunset of WiFi legacy endpoints |

## Communication

- Changelog entries will annotate any deprecation introduction or removal.
- Web UI will surface a banner if it detects deprecation headers in responses.

---
Maintainer Notes: Keep this document updated whenever new versioned endpoints are added or deprecation dates shift.
