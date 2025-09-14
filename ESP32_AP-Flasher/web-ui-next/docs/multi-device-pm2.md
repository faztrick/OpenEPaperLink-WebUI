# Multi-Device Development with PM2

This guide shows how to run several Next.js dev instances of the Web UI simultaneously, each targeting a different device or default transport preference.

## Prerequisites

- Node.js / npm installed
- PM2 installed globally:

```bash
npm install -g pm2
```

- Each target device reachable via HTTP (if using DEVICE_BASE_URL) or a browser that supports Web Serial for serial testing.

## Ecosystem Config

Multiple apps were added to `ecosystem.config.cjs`:

| App Name         | Port | Purpose                     | Key Env                          |
|------------------|------|-----------------------------|----------------------------------|
| webui-dev-d1     | 3000 | Device 1 (auto transport)   | DEVICE_BASE_URL, transport auto  |
| webui-dev-d2     | 3001 | Device 2 (HTTP pref)        | DEVICE_BASE_URL, transport http  |
| webui-dev-serial | 3002 | Serial focused instance     | transport serial                 |

Adjust the `DEVICE_BASE_URL` values to match your device IPs.

## Start Instances

```bash
pm2 start ecosystem.config.cjs --only webui-dev-d1,webui-dev-d2,webui-dev-serial
```

Start all (including original dev & prod entries):

```bash
pm2 start ecosystem.config.cjs
```

View logs for one instance:

```bash
pm2 logs webui-dev-d1
```

Stop or delete:

```bash
pm2 stop webui-dev-d2
pm2 delete webui-dev-serial
```

## Default Transport Preference

The transport layer now restores preference in this order:

1. `localStorage.connPref` (user last choice in browser)
2. `NEXT_PUBLIC_DEFAULT_TRANSPORT` env (if no saved preference)
3. Fallback to `auto`

Valid values: `auto`, `http`, `serial`.

## Selecting a Device in the UI

When a `DEVICE_BASE_URL` is set via environment, requests under `/api/device/*` will proxy to that base unless the client provides the `x-device-base-url` header (e.g., when selecting a device in the UI). Each PM2 instance can target a separate device by default while still allowing manual selection overrides inside the browser.

## Serial Testing

Use the `webui-dev-serial` instance (port 3002) with `NEXT_PUBLIC_DEFAULT_TRANSPORT=serial` for a workflow that emphasizes serial fallback/open state. Switch preference in the Devices page if needed; your choice persists via `localStorage`.

## Common Maintenance

Restart all:

```bash
pm2 restart all
```

Update after code changes (Next.js dev auto-reloads; prod requires rebuild):

```bash
npm run build
pm2 restart webui-prod
```

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Port already in use | `pm2 delete <app>` or free the port with OS tools |
| Env change not reflected | Restart the specific app: `pm2 restart webui-dev-d1` |
| Serial not available | Ensure Chromium-based browser and site is served over HTTPS or `localhost` |

---
Last updated: (auto-generated)
