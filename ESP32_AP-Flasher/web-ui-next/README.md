# OpenEPaperLink Web UI (Next.js Migration)

This directory contains an in-progress migration of the legacy `public/dev` development interface to a modern Next.js optimized application.

## Goals

- Componentize repeated HTML fragments (header, nav, sidebar, modals)
- Support faster iteration with React + Next.js (routing, code splitting)
- Prepare for future API typing & real-time updates
- Enable build-time optimization, bundling, and potential static export of mostly static views
- Provide progressive enhancement: dynamic AI assistant & modal system loaded on demand

## Structure

```text
web-ui-next/
  pages/          Next.js route pages (index, devices, device/[id], ...)
  components/     Reusable React components (Layout, Header, Sidebar, Modals, Seo)
  hooks/          Reusable hooks (API status, WebSocket, polling, serial ports)
  context/        Global UI context (modal visibility, etc.)
  features/ai/    AI chat feature (dynamically imported)
  lib/            Utility modules (fetcher, api, etc.)
  public/         Static assets (images, fonts, etc.)
  styles/         Global and modular CSS
```

## Migration Mapping

| Legacy HTML    | Next.js Page                   | Status |
|----------------|--------------------------------|--------|
| index.html     | pages/index.tsx                | Done   |
| device.html    | pages/device/[id].tsx          | Done (placeholder) |
| tags.html      | pages/tags.tsx                 | Implemented |
| wifi.html      | pages/wifi.tsx                 | Implemented (HTTP + serial modes) |
| flash.html     | pages/flash.tsx                | Implemented (local sim + OTA controls) |
| build.html     | pages/build.tsx                | Implemented (sysinfo + telemetry) |
| logs.html      | pages/logs.tsx                 | Implemented (tail + polling) |
| settings.html  | pages/settings.tsx             | Implemented (modules, FS, AP, mode, reboot) |
| ap-list.html   | pages/ap-list.tsx              | Basic (legacy placeholder) |
| peers.html     | pages/peers.tsx                | Implemented (peer test + wifi events) |
| ai.html        | Integrated via modal + AIChat  | In progress |

## Features Implemented

- Shared layout & navigation system with accessible skip link
- Connection mode switcher (HTTP vs Web Serial) with unified transport abstraction
- Dynamic imports for Sidebar & Modals (reduces initial JS bundle)
- AI Assistant modal dynamically imports its internal UI (`features/ai/AIChat.tsx`)
- Global modal/UI state via React context (`UIContext`)
- Status hooks: API reachability, WebSocket connectivity, serial ports placeholder
- SWR data layer example (`/api/devices` placeholder) with fallback example row
- SEO component (`<Seo />`) producing Open Graph & Twitter tags
- Active nav link detection supports nested routes

### New (wired to firmware)

Implemented cross-cutting features using the device HTTP proxy:

| Area | Endpoints | Notes |
|------|-----------|-------|
| Tags | `/get_db`, `/tag_alias`, `/imgupload` | List, detail, alias rename, image push |
| Wi‑Fi Core | `/api/wifi/status`, `/api/wifi/scan`, `/api/wifi/scan/results`, `/api/wifi/connect`, `/api/wifi/disconnect`, `/api/wifi/setmode` | Unified Wi‑Fi management page + mode policy buttons |
| Wi‑Fi AP Control | `/api/wifi/ap` (GET/POST) | Start/stop/restart AP, override SSID/channel/hidden/max_clients |
| Wi‑Fi Events | `/api/wifi/events`, `/api/wifi/summary` | Recent system & Wi‑Fi events surfaced on Peers page |
| Startup Modules | `/api/startup_modules` (GET/POST) | Persist optional module enable flags in `startup_modules.json` |
| Filesystem | `/api/fs/info`, `/api/fs/remount` | Diagnostics + manual remount in Settings page |
| Telemetry / Build | `/api/telemetry`, `/sysinfo` | Build metadata, memory stats, uptime, tag count (Build page) |
| OTA / Maintenance | `/update_c6`, `/update_actions`, `/rollback`, `/check_file` | OTA URL trigger, cleanup actions, rollback, file integrity check (Flash page) |
| System | `/reboot` | Reboot from Settings page |
| Peer / Diagnostics | `/api/peer/test` | Connection test (Peers page) |

### Device HTTP Proxy & Unified Wi‑Fi Page (NEW)

The `/wifi` page now communicates directly with the firmware's HTTP endpoints (served by the ESP32 AP firmware) through a generic proxy route: `pages/api/device/[...path].ts`.

Set `DEVICE_BASE_URL` in `.env.local` to point to the root of the firmware host (e.g. `http://192.168.4.1`). All requests to `/api/device/<path>` are forwarded to `<DEVICE_BASE_URL>/<path>` with method, headers (minus hop-by-hop), and body preserved. Response status & JSON/body stream back transparently.

Endpoints consumed by the React hooks in `hooks/useDeviceWifi.ts`:

| Hook / Action | Proxied Request | Firmware Endpoint | Purpose |
|---------------|-----------------|-------------------|---------|
| `useDeviceWifiStatus` | `GET /api/device/api/wifi/status` | `/api/wifi/status` | Poll current Wi‑Fi state, RSSI, mode, AP clients, last event |
| `startScan()` | `GET /api/device/api/wifi/scan` | `/api/wifi/scan` | Trigger async scan (may respond before completion) |
| `fetchResults()` | `GET /api/device/api/wifi/scan/results` | `/api/wifi/scan/results` | Retrieve accumulated scan results & running flag |
| `connectWifi(ssid,pass)` | `POST /api/device/api/wifi/connect` | `/api/wifi/connect` | Submit STA credentials (persisted by firmware) |
| `disconnectWifi()` | `POST /api/device/api/wifi/disconnect` | `/api/wifi/disconnect` | Force disconnect / forget session |
| `setWifiMode(mode)` | `POST /api/device/api/wifi/setmode` | `/api/wifi/setmode` | Change Wi‑Fi operating policy (AUTO/AP/STA/AP+STA) |

Quick setup:

```bash
cp .env.example .env.local
echo "DEVICE_BASE_URL=http://192.168.4.1" >> .env.local
npm run dev
```

Navigate to `/wifi` to:

1. View live status chips (connected, SSID, IP, RSSI, channel, mode, AP clients, health, Tx power)
2. Connect / disconnect with credentials form
3. Change Wi‑Fi mode policy (buttons for AUTO/AP/STA/AP+STA)
4. Run a scan (start → periodic polling of results)
5. Click "Use" on a scanned network to prefill SSID

Notes:

- The page is currently a lightweight standalone (inline styles) for fast iteration. It can be migrated into the shared `Layout` later.
- If `DEVICE_BASE_URL` is unset, proxy calls will 502. Set it explicitly for production builds.
- Serial-based Wi‑Fi tools remain available via `/serial-wifi` or by enabling the serial panel (legacy version) but are now separate from the new device HTTP workflow.

Security considerations:

- The proxy whitelists only the path forwarded by the request; no additional path rewriting is applied—avoid user-controlled arbitrary full URLs.
- Consider restricting origins or adding a shared secret header if you serve the Next.js UI from a different network than the device AP.

Future enhancements:

- Merge serial + HTTP views with a backend selection toggle.
- Show real-time events via Server-Sent Events or WebSocket (if firmware exposes them).
- Display scan progress metrics (elapsed, remaining channels) if the firmware supplies them.
- Persist last successful connection credential (hashed) client-side for UX hints (optional).

### Settings Page Overview

`/settings` consolidates multiple maintenance & configuration concerns:

| Section | Hook / Module | Endpoints | Purpose |
|---------|---------------|-----------|---------|
| Log Streaming | `lib/apiLogs.ts` | (custom) | Configure UDP log mirror target (future firmware binding) |
| Startup Modules | `useStartupModules` | `/api/startup_modules` | Toggle optional modules for next boot |
| Filesystem | `useFsInfo` | `/api/fs/info`, `/api/fs/remount` | Inspect mount type, presence of key files, attempt remount |
| Wi‑Fi AP & Mode | `useWifiAp`, `setWifiMode` | `/api/wifi/ap`, `/api/wifi/setmode` | Control management/fallback AP & policy mode (0-3) |
| System | `apiPostNoBody` | `/reboot` | Request device reboot |

### Build Page Overview

Aggregates immutable build metadata (`/sysinfo`) and dynamic runtime telemetry (`/api/telemetry`). Refreshes every 10s; could be extended with charts or WebSocket streaming for richer dashboards.

### Flash / OTA Page

Adds basic OTA maintenance controls alongside local simulated flashing panel:

| Action | Endpoint | Notes |
|--------|----------|-------|
| C6 OTA Flash | `/update_c6` (POST url=...) | Triggers asynchronous OTA task (if firmware compiled with C6 support) |
| Apply Update Actions | `/update_actions` | Processes `update_actions.json` file deletion directives |
| Rollback | `/rollback` | Attempt ESP32 rollback if available (`Update.canRollBack()`) |
| Check File | `/check_file?path=...` | Returns `{ filesize, md5 }` for integrity verification |

These actions intentionally remain simple (alert-based confirmations) to minimize UI overhead while enabling essential recovery flows.

### Serial WiFi Scan (Developer Tool)

The Next.js UI now supports invoking the firmware `wifiscan` CLI directly over an open serial connection:

| Element | File | Notes |
|---------|------|-------|
| API Route | `pages/api/serial/wifi/scan.ts` | Runs `wifiscan`, parses JSON event lines. Supports `minRssi`, `top` filters. |
| Hook | `hooks/useSerialWifiScan.ts` | Provides `scan(opts)`, returns networks, timing & timeout state. |
| Panel | `components/SerialWifiScannerPanel.tsx` | UI with filter inputs + results table. |
| WiFi Page Integration | `pages/wifi.tsx` | Toggle with `?serial=1` or Show/Hide Serial Panel button. |
| Mode Selector | `components/SerialWifiModeSelector.tsx` | New UI for getting/setting Wi‑Fi operating policy (Auto / AP / STA / AP+STA). |

Enable serial API (dev only):

```bash
ENABLE_SERIAL_API=1 npm run dev
```

Perform a filtered scan from the UI or via curl:

```bash
curl -X POST http://localhost:3000/api/serial/wifi/scan \
  -H 'Content-Type: application/json' \
  -d '{"minRssi":-80,"top":5}'
```

Sample response:

```json
{
  "success": true,
  "count": 5,
  "summaryCount": 12,
  "networks": [ { "ssid": "ExampleAP", "rssi": -63, "channel": 6, "enc": 4, "bssid": "AA:BB:CC:DD:EE:FF" } ],
  "rawLineCount": 25,
  "timedOut": false,
  "elapsedMs": 1472,
  "appliedFilters": { "minRssi": -80, "top": 5 }
}
```

If no filters are supplied, all parsed networks are returned. Timeout (~6s) is reported with `timedOut:true`.

Developer test harness: `scripts/testSerialWifiScan.ts` (expects dev server on port 3000 and Node 18+ for global `fetch`).

## Dev Scripts

```bash
npm install
npm run dev
```

Optional (analyze bundle after initial build):

```bash
# add analyzer (example)
npm install --save-dev @next/bundle-analyzer
```

Then extend `next.config.js` accordingly.

## Data Layer & API Notes

Currently `/api/devices` is assumed; if backend differs, create API proxy routes under `pages/api/` or configure `next.config.js` `rewrites()` to target the firmware host.

### Selecting the Firmware AP Base URL

Set `NEXT_PUBLIC_AP_BASE_URL` (see `.env.example`) to point directly at your ESP32 AP (e.g. `http://192.168.4.1`). If unset, the UI will:

1. Use `window.location.origin` when running in a browser (handy if you reverse proxy the AP).
2. If on `localhost` and no origin override, it heuristically falls back to `http://192.168.4.1`.
3. During server-side rendering it only trusts the environment variable (no guessing).

Utility helper: `lib/apiBase.ts` exports `getApiBase()`, `buildApiUrl()`, `apiGet()`, `apiPost()` used by future data hooks.

Example:

```bash
cp .env.example .env.local
echo "NEXT_PUBLIC_AP_BASE_URL=http://192.168.4.1" >> .env.local
npm run dev
```

Now requests built via `buildApiUrl('/taglist')` resolve to `http://192.168.4.1/taglist`.

## Adding Real Device Data

1. Implement an API route: `pages/api/devices.ts` that proxies existing backend.
2. Replace placeholder fallback in `pages/devices.tsx` with real data mapping.
3. Add types to `lib/api.ts` to centralize interfaces.

## Testing Roadmap

- Unit: Jest + React Testing Library for hooks & components
- Integration: Playwright for device detail navigation and AI chat open/close flows

## Performance Checklist (Future)

- Evaluate hydration cost (dynamic imports already reduce initial payload)
- Consider React Server Components for read-only lists
- Cache device list with SWR mutation on updates (WebSocket push or manual refresh)

## Run & Debug

Development server:

```bash
npm install
npm run dev
```

The app defaults to <http://localhost:3000>. Hot reload is enabled. If you change TypeScript config or add new env variables, restart the dev server.

Troubleshooting:

- Error: Cannot find module 'critters' – remove any `experimental.optimizeCss` flag (already removed here) or install `critters`.
- 404 for /api/health or /api/serial/ports – ensure stub routes exist (they are included) or replace with real backend endpoints.
- Type issues after package updates – run `rm -rf .next && npm run dev` to clear build artifacts.

Production build preview:

```bash
npm run build
npm start
```

## PM2 Process Manager (Optional)

You can run the Next.js dev or prod server under PM2 for auto-restart and centralized logs.

Install dependencies (pm2 is already listed as a dev dependency):

```bash
npm install
```

Start development (watches source, enables serial API):

```bash
npm run pm2:dev
```

View logs:

```bash
pm2 logs webui-dev
```

Stop:

```bash
pm2 delete webui-dev
```

Production (after building):

```bash
npm run build
npm run pm2:prod
pm2 logs webui-prod
```

The file `ecosystem.config.cjs` defines two apps:

- `webui-dev`: `next dev` with `ENABLE_SERIAL_API=1` and watch mode.
- `webui-prod`: `next start` with serial API disabled by default (`ENABLE_SERIAL_API=false`).

Adjust environment variables inside the ecosystem file or override at runtime:

```bash
ENABLE_SERIAL_API=1 pm2 start ecosystem.config.cjs --only webui-prod
```

## Next Suggested Work

- Implement optional API proxy endpoints (if you prefer server rewrites)
- Flesh out Logs, Peers, Settings pages
- Integrate real flashing workflow (replace simulation)
- Introduce toast/notification system
- Add accessibility lint rules & full a11y pass
- Add automated tests (Jest + Playwright)

### Update (Wi‑Fi Page Enhancements)

The `/wifi` page now:

- Uses the shared `Layout` for consistent navigation and connection switcher context.
- Displays both numeric `wifiMode` and a human‑readable label (AUTO / AP / STA / AP+STA).
- Shows current transport preference and effective channel badges (`Transport Pref` / `Transport Eff`).
- Provides a legend clarifying Wi‑Fi policy numeric values.
- Adopts shared utility classes (`sec`, `badge`, `small`, etc.) for reduced bespoke styling.

These changes are purely presentational; existing hooks (`useDeviceWifiStatus`, `useDeviceWifiScan`) are untouched.

### Device Selection & Transport Targeting

The UI now supports choosing a specific device as the active target for all API calls.

Key pieces:

- `lib/deviceSelection.ts` – Lightweight pub/sub store with `setSelectedDevice`, `getSelectedDevice`, `subscribeSelectedDevice`.
- `lib/apiBase.ts` – `getApiBase()` now prioritizes the selected device `baseUrl` over env / origin heuristics.
- `pages/devices.tsx` – Each row has a Select button; the chosen device persists in `localStorage` (`selectedDevice`).
- `components/SelectedDeviceBar.tsx` – Displays the active device (id/name + baseUrl) beneath the connection switcher, with a Clear button.

Resolution precedence (highest first):

1. Selected device baseUrl
2. `NEXT_PUBLIC_AP_BASE_URL`
3. `window.location.origin`
4. Dev fallback `http://192.168.4.1` (localhost heuristic)
5. Relative (empty base)

Implications:

- All helpers using `buildApiUrl()` automatically target the selected device once chosen.
- To pin a different device for a single action without changing global selection, bypass by calling `fetch('http://other-ip/...')` directly.
- Serial transport remains unaffected; selection only affects HTTP base resolution.

Future ideas:

- Multi-device dashboard with per-device transport status.
- Conflict warning if selected device becomes unreachable.
- Background health pings to auto-clear stale selections.

## Serial API Bridge

The development server exposes (optional) serial control endpoints that proxy a local USB/serial connection to an AP or device. These are disabled by default unless you set `ENABLE_SERIAL_API` (any value other than `false`).

Enable:

```bash
ENABLE_SERIAL_API=1 npm run dev
```

### Endpoints

All routes live under `/api/serial/*`:

| Method | Path              | Body / Query                               | Description |
|--------|-------------------|--------------------------------------------|-------------|
| GET    | /api/serial/ports |                                          | Enumerate available serial ports (filtered by OS detection) |
| POST   | /api/serial/open  | `{ path: string, baudRate?: number }`      | Open (or reopen) the indicated port |
| POST   | /api/serial/close |                                          | Close currently open port |
| POST   | /api/serial/write | `{ data?: string, line?: string }`         | Write raw data (no newline) or a single line (auto `\n`) |
| POST   | /api/serial/cli   | `{ command: string }`                      | Convenience alias for sending a CLI command (adds `\n`) |
| GET    | /api/serial/status|                                          | Connection & state metadata |
| GET    | /api/serial/log   | `?tail=N` or `?since=IDX`                  | Retrieve classified log lines and `nextIndex` cursor |
| POST   | /api/serial/cli/exec | `{ command: string, timeoutMs?: number }` | Execute CLI command and return collected output lines until prompt |
| POST   | /api/serial/wifi/scan |                                          | Run the firmware `wifiscan` CLI command and return parsed WiFi networks. |
| GET    | /api/serial/wifi/mode |                                          | Read current Wi‑Fi operating policy (requires sidecar). |
| POST   | /api/serial/wifi/mode | mode: 0-3 or name (auto/ap/sta/apsta)   | Set Wi‑Fi operating policy (persists via firmware CLI `wifimode`). |

### Log Retrieval Strategy

`/api/serial/log` returns:

```json
{
  "lines": [
    { "idx": 0, "ts": "2025-08-25T12:34:56.000Z", "raw": "> ", "type": "PROMPT" }
  ],
  "nextIndex": 1
}
```

- First call: `GET /api/serial/log?tail=100` (show last 100 lines).
- Subsequent polling: `GET /api/serial/log?since=<nextIndex_from_previous_response>`.

### Classification

Each line may have a `type` hint (e.g. `ACK`, `NOK`, `PROMPT`, `AP_BLOCK_DONE`, `CLI_SYSINFO`). This is a lightweight heuristic based on firmware output patterns (`serial_cli.cpp`, `serialap.cpp`). You can use the `type` to colorize or trigger UI events.

### Suggested Client Hook

Pseudo-code for a React polling hook:

```tsx
function useSerialLog(pollMs=1000){
  const [lines,setLines] = useState<ClassifiedLine[]>([]);
  const nextIndexRef = useRef(0);
  useEffect(()=>{
    let active = true;
    async function tick(){
      try {
        const param = lines.length ? `since=${nextIndexRef.current}` : 'tail=200';
        const r = await fetch(`/api/serial/log?${param}`);
        if(!r.ok) return;
        const json = await r.json();
        if(!active) return;
        if(json.lines?.length){
          setLines(prev=> [...prev, ...json.lines]);
        }
        nextIndexRef.current = json.nextIndex;
      } finally {
        if(active) setTimeout(tick, pollMs);
      }
    }

      ### Serial WiFi Scan Page

      Visit `/serial-wifi` after opening a serial connection to run an on-demand scan. The firmware CLI command `wifiscan` prints:

      1. Summary: `{"event":"wifiscan_summary","count":N}`
      2. One line per network: `{ "event":"wifinet", "ssid":"...", "rssi":-65, "channel":6, "enc":4, "bssid":"AA:BB:CC:DD:EE:FF" }`

      The API endpoint parses these lines and returns `{ success:true, count, networks:[...] }` to the React hook `useSerialWifiScan`.

1. Summary: `{"event":"wifiscan_summary","count":N}`
2. One line per network: `{ "event":"wifinet", "ssid":"...", "rssi":-65, "channel":6, "enc":4, "bssid":"AA:BB:CC:DD:EE:FF" }`

The API endpoint parses these lines and returns `{ success:true, count, networks:[...] }` to the React hook `useSerialWifiScan`.

### Wi‑Fi Mode Selection (Serial CLI `wifimode`)

The firmware serial CLI now exposes `wifimode` for inspecting or changing the persisted Wi‑Fi operating policy used on next Wi‑Fi stack restart:

```bash
wifimode            # prints JSON line: {"event":"wifimode","success":true,"mode":0,"modeName":"AUTO",...}
wifimode 1          # set AP only
wifimode sta        # set STA only (equivalent to 2)
wifimode apsta      # set simultaneous AP+STA (3)
```

Policy values stored in `config.wifiMode`:

| Value | Name     | Behavior |
|-------|----------|----------|
| 0     | AUTO     | Attempt STA; fallback to AP if no credentials / failure |
| 1     | AP       | Access Point only (management / captive style) |
| 2     | STA      | Station only (no AP fallback) |
| 3     | AP_STA   | Force simultaneous AP + STA attempt |

Changing the mode persists to `apconfig.json`; apply by restarting Wi‑Fi (or reboot). A convenience UI is integrated:

- Component: `SerialWifiModeSelector.tsx`
- Integrated into `pages/wifi.tsx` when the Serial panel is shown (`?serial=1`).

API route (sidecar-backed):

```http
GET  /api/serial/wifi/mode   -> { success, mode, modeName }
POST /api/serial/wifi/mode { "mode": 3 } -> { success, mode, modeName, changed, prior }
```

Sidecar service endpoints (if running `npm run serial:service`):

```http
GET  /wifi/mode
POST /wifi/mode { "mode": "apsta" | 3 }
```

UI badge "sidecar" indicates the request was proxied via `SERIAL_SIDECAR_URL`.

### Security / Safety

Opening host serial ports from the dev server can expose hardware. For now the guard is a simple environment flag. In production hosting environments you should:

- Ensure `ENABLE_SERIAL_API=false` (or unset) to disable endpoints.
- Optionally add origin or token checks in each handler.
- Consider moving serial bridging to a privileged local companion service.

### Roadmap Enhancements

- WebSocket / EventSource streaming for lower-latency log updates.
- Higher-level endpoints (e.g., `/api/serial/ping`, `/api/serial/sysinfo`) that wrap CLI commands and parse structured results. `cli/exec` is a first step.
- Persist recent session log beyond in-memory ring buffer (currently 500 lines) when needed.

## Notes

Legacy UI remains untouched in `public/dev` and can serve as reference during progressive migration.

## HTTP vs Serial Connection (Unified Transport v2)

The transport layer was refactored to remove the old explicit "mode" toggle. Instead the user sets a **preferred channel**:

- `auto` (default) – Try HTTP first; if a request fails (network error / fetch rejection) and an open serial connection exists, transparently retry over serial.
- `http` – Force HTTP only (no serial fallback, even if open).
- `serial` – Force serial only (HTTP not attempted; request fails immediately if the port is not open).

### Key Concepts

`lib/transport.ts` now exposes a singleton with status fields:

| Field | Meaning |
|-------|---------|
| `preferred` | Current user preference (`auto \| http \| serial`). |
| `effective` | Most recent channel actually used (`http \| serial \| pending`). |
| `serialOpen` | Whether the Web Serial port is currently open. |
| `serialSupported` | Browser capability check. |

The previous `mode` property and functions `setMode()` / `getSmart()` were removed. Calls should use:

```ts
transport().setPreferred('auto');
await transport().get('/api/wifi/status'); // path form; transport decides
```

### Request Semantics

`transport().get(path)` / `post(path, body)` expect a **relative path** beginning with `/`. For HTTP they internally call `fetch(path)` (allowing the browser or a proxy layer to resolve), for Serial they emit a minimal line protocol:

```text
GET /api/wifi/status\nEND\n
POST /api/foo\n{"key":"value"}\nEND\n
```

Responses are read until an `END` marker heuristic or stream close; the first JSON object encountered is parsed.

### Helper Wrappers (Deprecated Removed)

The previous transitional file `lib/transportApi.ts` (with `tGet()` / `tPost()`) has been removed. All code should now call `transport().get()` / `transport().post()` directly with a leading-slash relative path.

SSR Note: On the server a lightweight HTTP-only stub of the transport is returned; on first client-side invocation it is transparently upgraded to the full Web Serial capable implementation.

### UI Component

`components/ConnectionSwitcher.tsx` now offers buttons for: Auto, Force HTTP, Force Serial. State persists in `localStorage` under the key `connPref` (superseding the earlier `connMode`). If serial isn't supported, the serial-related controls are disabled with a contextual note.

### Migration Notes (from legacy mode)

| Removed | Replacement | Rationale |
|---------|-------------|-----------|
| `status.mode` | `status.preferred` / `status.effective` | Distinguish intention vs actual channel used. |
| `setMode('http'\|'serial')` | `setPreferred('http'\|'serial'\|'auto')` | Adds automatic fallback capability. |
| `getSmart()` helper | Built‑in fallback inside `get()` / `post()` | Consolidates retry logic; less duplicate branching. |
| `localStorage.connMode` | `localStorage.connPref` | Name reflects preference not forced global mode. |

No code path should rely on the removed symbols; search the tree for `mode` to confirm before adding new features.

### Error Handling

- In `serial` preference, a missing or closed port throws immediately (`Serial not open`).
- In `auto` preference, an HTTP fetch rejection triggers a one‑shot serial retry (if open). Exceptions from both paths propagate as usual.
- `effective='pending'` is emitted briefly between dispatch and resolution to allow optimistic UI spinners.

### Future Enhancements

- Structured binary framing (length‑prefixed JSON) to replace the heuristic `END` sentinel.
- Streaming multiplex (logs + requests) through a single serial session.
- Retry / backoff policy configuration hooks.
- Optional per‑request override: `{ channel: 'http' }` without changing global preference.

### Security Note

Web Serial still requires an explicit user gesture and secure context (HTTPS or localhost). The UI doesn't persist raw serial data beyond memory; review `transport.ts` prior to expanding protocol scope.

---

### Refactored Styling (utilities.css)

A lightweight utility stylesheet (`styles/utilities.css`) was introduced to replace a large number of ad-hoc inline styles. This keeps JSX lean, improves consistency, and reduces repeated CSS literals (borders, spacing, flex/grid patterns, console/log boxes, badges).

Key class groups:

- Layout: `flex`, `flex-col`, `flex-wrap`, `flex-1`, `grid-gap`, `grid-gap-sm`, `gap`, `gap-lg`, `gap-24`
- Sizing: `w-full`, `w-70`, `w-80`, `w-90`, `w-100`, `minw-260`, `minw-320`, `maxw-500`
- Spacing: `mt`, `mt-sm`, `mt-8`, `mt-12`, `mt-16`, `mt-0`, `mt-4`, `mt-6`, `mb-4`, `m-8y`
- Typography & color: `small`, `xsmall`, `muted`, `center-muted`, `font-mono`
- Boxes: `sec`, `console-box`, `log-box`
- Badges / Pills: `badge`, `badge-ok`, `badge-bad`, `module-pill`
- Misc: `ws-pre`, `items-center`, `label-block`, `hr-line`, `log-error`, `log-success`, `log-default`

Adoption status:

- Fully migrated: `settings.tsx`, `build.tsx`, `flash.tsx`, `logs.tsx`
- Pending (still inline styles for rapid iteration): `wifi.tsx`, `tags.tsx`, `tag/[mac].tsx`, `peers.tsx`, `ap-list.tsx`, device detail pages

Next steps (optional):

1. Gradually migrate remaining pages using existing utilities—add only narrowly-scoped new classes when patterns repeat 3+ times.
2. Consider layered approach (utilities + small semantic component classes) if design language evolves.
3. Introduce dark/light theme tokens later; current palette is embedded in utility rules for speed.

Rationale: Avoided pulling a full utility framework (e.g. Tailwind) to keep dependency surface minimal while still gaining reuse and consistency.

## Multi-Terminal Workflow (VS Code Tasks)

A `.vscode/tasks.json` is included to launch multiple development terminals in parallel:

- `Next: Dev` – Starts Next.js with `ENABLE_SERIAL_API=1`.
- `PIO: Monitor (COM10)` – Opens a PlatformIO serial monitor at 115200 baud (adjust COM port in task if needed).
- `Serial Log Tail` – Runs `scripts/tail-serial-log.js`, polling `/api/serial/log` for new classified lines.

Launch all three:

1. Open the VS Code Command Palette → Run Task → `Dev Multi-Terminals`.
2. Inspect each dedicated terminal panel (they are run in parallel).

To change the monitored port, edit the `PIO: Monitor (COM10)` task or duplicate it with a different label/port.

## Automated Serial Endpoint Smoke Test

Script: `scripts/test-serial-endpoints.js`

Purpose: Quickly verify that the dev server is responding and the serial API contract is intact. It tolerates missing hardware (will skip open/cli steps if no ports or if open fails) and exits with code 0 on a syntactic success path.

Run (server must already be running on localhost:3000):

```bash
node scripts/test-serial-endpoints.js
```

Optional against a different base URL or forwarded port:

```bash
TEST_BASE=http://127.0.0.1:4000 node scripts/test-serial-endpoints.js
```

What it does:

1. GET `/api/health`
2. GET `/api/serial/ports`
3. (If a port is present) POST `/api/serial/open`
4. (If opened) POST `/api/serial/cli` with `{ command:"help", capture:true, timeoutMs:1200 }`
5. GET `/api/serial/log?tail=20`
6. (If opened) POST `/api/serial/close`

Output ends with `Result: PASS` or `Result: FAIL`.

Integrating into CI (optional):

```bash
ENABLE_SERIAL_API=1 npm run dev &
DEV_PID=$!
sleep 4
node scripts/test-serial-endpoints.js || (echo "Smoke test failed"; kill $DEV_PID; exit 1)
kill $DEV_PID
```

On Windows PowerShell you can adapt with `Start-Process` / `Stop-Process` or use PM2 to orchestrate.

## Feature Flags & Environment Variables (New Logging / Agent / AI APIs)

To keep the default development surface minimal, new APIs are gated behind explicit environment variables. Add these to `.env.local` (or PM2 ecosystem env) as needed.

| Variable | Default | Purpose |
|----------|---------|---------|
| `ENABLE_LOG_API` | (unset → enabled) | Set to `false` to disable `/api/log/*` endpoints (list/read/stream/post). |
| `ENABLE_AGENT_API` | disabled (requires token) | When set (any value except `false`), enables `/api/agent/*` & `/api/logging/console`. Requires `AGENT_TOKEN`. |
| `AGENT_TOKEN` | (unset) | Shared secret for agent & console mirror endpoints; supplied via `x-agent-token` header or `?token=` query. |
| `ENABLE_AI_TOOL_API` | disabled | When set (any value except `false`), enables `/api/ai/tool-model` and `/api/ai/chat-tool`. |
| `OPENAI_API_KEY` | (unset) | If present and AI API enabled, real OpenAI Responses (or Chat) API calls are made; otherwise a mock echo response is returned. |
| `OPEL_AI_TOOL_MODEL` | (unset) | Preferred single model id (e.g. `gpt-4o-mini`). Overrides list. |
| `OPEL_AI_TOOL_MODELS` | (unset) | Comma‑separated fallback model list if `OPEL_AI_TOOL_MODEL` not set. First entry is used. |

Examples:

```bash
# Minimal logging only (default if you want logs)
ENABLE_LOG_API=1

# Enable agent & logging console mirror
ENABLE_AGENT_API=1
AGENT_TOKEN=dev-secret-token

# Enable AI tool API with mock (no key)
ENABLE_AI_TOOL_API=1

# Real OpenAI integration
ENABLE_AI_TOOL_API=1
OPENAI_API_KEY=sk-xxxx
OPEL_AI_TOOL_MODEL=gpt-4o-mini
```

### Endpoints Added

| Group | Method | Path | Notes |
|-------|--------|------|-------|
| Logging | GET | `/api/log/list` | List available in-memory log buffers |
| Logging | GET | `/api/log/read?name=NAME&lines=200` | Tail last N lines |
| Logging | GET (SSE) | `/api/log/stream?name=NAME` | Server-Sent Events stream of appended lines |
| Logging | POST | `/api/log` `{ name, message }` | Append a line |
| Agent | GET | `/api/agent/actions` | List registered actions (built-in: ping, echo) |
| Agent | POST | `/api/agent/run` `{ action, config }` | Execute an action |
| Agent | POST | `/api/agent/kill` `{ processId }` | Placeholder kill (no-op) |
| Agent | POST | `/api/agent/provider` `{ provider }` | Set provider label (logged) |
| Agent | GET | `/api/agent/health` | Agent health & action count |
| Agent Logging | GET/POST | `/api/logging/console` | Get / toggle Node console mirror into log buffers |
| AI Tool | GET | `/api/ai/tool-model` | Selected model + metadata; 503 if disabled |
| AI Tool | POST | `/api/ai/chat-tool` `{ message }` | Chat/tool placeholder (mock if no key) |

All agent and console mirror routes require header `x-agent-token: <AGENT_TOKEN>` (or `?token=`) and return 401 on mismatch.

### SSE Log Streaming Sample (Browser Console)

```js
const es = new EventSource('/api/log/stream?name=node');
es.onmessage = (e) => console.log('log:', JSON.parse(e.data));
```

### Curl Examples

```bash
# Append a log line
curl -X POST http://localhost:3000/api/log -H 'Content-Type: application/json' \
  -d '{"name":"node","message":"hello from curl"}'

# List log buffers
curl http://localhost:3000/api/log/list

# Run agent ping
curl http://localhost:3000/api/agent/actions -H 'x-agent-token: dev-secret-token'
curl -X POST http://localhost:3000/api/agent/run -H 'x-agent-token: dev-secret-token' -H 'Content-Type: application/json' \
  -d '{"action":"ping"}'

# AI mock chat
curl -X POST http://localhost:3000/api/ai/chat-tool -H 'Content-Type: application/json' \
  -d '{"message":"test"}'
```

### Implementation Notes

- Logs are memory-resident only (per server process) with a ring buffer cap of 5000 lines per named stream.
- Console mirror allows piping server console output into a chosen log channel subset for unified UI viewing.
- AI chat uses OpenAI Responses API when available; falls back to legacy Chat Completions if `responses` client missing.
- Without an API key a deterministic mock echo response is returned (flagged with `mock:true`).
- Agent actions are synchronous placeholder functions; extend by calling `agentActionRunner.register(name, fn)` in a custom server bootstrap file.

### Optional OpenAI Dependency Strategy

The `openai` package is intentionally **not** a hard dependency. When `ENABLE_AI_TOOL_API=1` and `OPENAI_API_KEY` is set, the server attempts a **late dynamic import** inside `lib/server/aiTools.ts` using an opaque `new Function('m', 'return import(m)')` construct. This prevents Next.js from resolving `openai` at build time, avoiding build failures in environments where the library is absent.

Resolution path:

1. AI API disabled → returns `{ success:false, responseText:"AI tool API disabled" }`.
2. Enabled but no key → mock echo (`[mock] You said: ...`).
3. Import failure (module missing) → mock with `[mock-no-openai]` tag.
4. Successful import + key → real API call (Responses API preferred, falls back to Chat Completions if `responses` client missing).

To enable real responses:

```bash
npm install openai
ENABLE_AI_TOOL_API=1 OPENAI_API_KEY=sk-... npm run dev
```

If you prefer to make `openai` always available (e.g. production hosting), add it to `dependencies` and the dynamic import path still works (no code change needed). When disabled the runtime cost is a single guard check.

Rationale: Keeps default developer setup lean (no extra transitive deps, faster install) and avoids Windows build flakiness reported previously when an optional module was missing.
