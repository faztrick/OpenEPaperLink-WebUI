# Wi-Fi API Migration Traceability

This document maps user-requested high-level tasks to the internal TODO items implemented in the repository for the Wi‑Fi API modernization effort.

| User Reference | Description (Paraphrased) | Internal TODO | Status |
|----------------|---------------------------|---------------|--------|
| #1 | Frontend migration to namespaced/versioned Wi‑Fi endpoints with fallback | Todo #4 | In Progress (client & hooks added; rollout pending) |
| #2 | Endpoint manifest & drift tooling | Todo #1 | Completed |
| #4 | Compile-time flag to disable legacy paths | Todo #2 | Completed |
| #7 | Unified events (SSE) stream | Todo #3 | Completed |

## Frontend Migration Steps

1. Add version-aware Wi‑Fi client (`lib/wifi.ts`) – prefers `/api/v1/wifi/*`, falls back to `/api/wifi/*`.
2. Update hooks (`useWifi.ts`) to consume new client (done).
3. Provide SSE events hook (`useWifiEvents.ts`) targeting `/api/v1/events` with automatic fallback to `/api/wifi/events` (done).
4. (Pending) Refactor any remaining direct uses of legacy paths elsewhere (e.g., device proxy pages) to adopt the same fallback utility.
5. After telemetry confirms no legacy usage, enable `OEPL_DISABLE_WIFI_LEGACY_PATHS` for production builds.

## Removal Plan (High-Level)

| Phase        | Trigger                    | Action                                                                                 |
| ------------ | -------------------------- | -------------------------------------------------------------------------------------- |
| Observation  | 1–2 releases               | Collect metrics / manual logs for legacy vs v1 usage                                   |
| Soft Disable | Legacy usage negligible    | Enable compile flag in a staging build                                                 |
| Hard Remove  | No regressions & clients updated | Delete legacy handlers & `lib/legacy/wifi.ts`                                   |

## Notes

The legacy client (`lib/legacy/wifi.ts`) remains temporarily for rollback and comparative testing. New code should import from `lib/wifi.ts` only.
