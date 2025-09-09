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
| tags.html      | pages/tags.tsx                 | Placeholder |
| wifi.html      | pages/wifi.tsx                 | Placeholder |
| flash.html     | pages/flash.tsx                | Placeholder |
| build.html     | pages/build.tsx                | Placeholder |
| logs.html      | pages/logs.tsx                 | Placeholder |
| settings.html  | pages/settings.tsx             | Placeholder |
| ap-list.html   | pages/ap-list.tsx              | Placeholder |
| peers.html     | pages/peers.tsx                | Placeholder |
| ai.html        | Integrated via modal + AIChat  | In progress |

## Features Implemented

- Shared layout & navigation system with accessible skip link
- Dynamic imports for Sidebar & Modals (reduces initial JS bundle)
- AI Assistant modal dynamically imports its internal UI (`features/ai/AIChat.tsx`)
- Global modal/UI state via React context (`UIContext`)
- Status hooks: API reachability, WebSocket connectivity, serial ports placeholder
- SWR data layer example (`/api/devices` placeholder) with fallback example row
- SEO component (`<Seo />`) producing Open Graph & Twitter tags
- Active nav link detection supports nested routes

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

- Implement real API proxy endpoints
- Port tag & Wi-Fi management logic
- Integrate flashing workflow (progress modal events)
- Introduce toast/notification system
- Add accessibility lint rules & full a11y pass
- Add automated tests (Jest + Playwright)

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

```ts
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
