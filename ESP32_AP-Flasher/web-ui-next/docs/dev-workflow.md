# Web UI Development Workflow (Single Port)

This document describes the streamlined workflow for running and managing the OpenEPaperLink Web UI without spawning many separate terminals.

## Core Concepts

- **Single Port**: Only one dev instance (`webui-dev`) runs on the default Next.js port (3000).
- **Process Manager**: PM2 keeps the dev server alive and restarts it on crashes.
- **Unified Script**: `manage_webui.py` wraps start/stop/restart/build/log commands.
- **Overrides**: Device selection & transport happen inside the UI. Environment variables are optional for defaults.

## Management Script

Run all commands from the `web-ui-next` directory:

```bash
python manage_webui.py start         # start dev in watch mode
python manage_webui.py status        # show status (falls back to pm2 list)
python manage_webui.py logs          # follow dev logs (Ctrl+C to exit)
python manage_webui.py restart       # restart dev
python manage_webui.py build         # production build (stops dev first)
python manage_webui.py rebuild       # stop dev, build, (optional RESTART=1) restart
python manage_webui.py prod          # start prod instance (after build)
python manage_webui.py kill          # delete both dev & prod PM2 processes
python manage_webui.py update        # pm2 update (when banner suggests it)
python manage_webui.py doctor        # diagnostic summary
```

### Environment Overrides

```bash
DEVICE_BASE_URL=http://192.168.4.101 python manage_webui.py restart
NEXT_PUBLIC_DEFAULT_TRANSPORT=serial python manage_webui.py start
```

These only set a default — you can still change selection and transport in the UI.

## Device Editing UI

Use the **Devices** page → Edit to:

- Set Alias
- Set Custom Base URL (validated for http/https, no trailing slash)
- Test connectivity (`/api/info` via proxy) with latency timing and automatic HTTPS fallback if HTTP fails
- Clear overrides (Blank both fields → Save)

Accessibility & UX features:

- Escape key and outside click close the panel
- Initial focus placed on Alias field
- Focus is trapped within the panel while open (Tab / Shift+Tab cycle)

## Common Scenarios

| Goal | Command / Action |
|------|------------------|
| Start dev once and leave it | `python manage_webui.py start` |
| See if it’s still alive | `python manage_webui.py status` |
| Tail logs for an error | `python manage_webui.py logs` |
| Change default base URL | Set env + `restart` |
| Production build & serve | `build` then `prod` |
| One-shot rebuild then continue dev | `rebuild` (optionally `RESTART=1 rebuild`) |
| Reset everything | `kill` then `start` |
| PM2 version mismatch banner | `python manage_webui.py update` |

## Troubleshooting

| Issue | Resolution |
|-------|------------|
| Build fails with EPERM on `.next/trace` | Auto-stop now runs prebuild; if persists run `kill` then retry |
| Status JSON parse fallback triggers | Harmless; plain table output used |
| Not picking up new env var | Run `restart` with env exported in same command |
| Connection test fails | Verify device reachable and CORS not blocking, confirm correct protocol |

## Next Ideas (Not Yet Implemented)

- Expose device firmware / version info in test result
- Optional device health auto-refresh / periodic ping
- More detailed latency breakdown (DNS vs connect) if needed
- Persist last test result indicator in device list

---
*Keep this concise. Update when new management commands or UI features are added.*
