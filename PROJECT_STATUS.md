# Project Status — OpenEPaperLink-WebUI

Last updated: 2025-08-16T00:00:00Z

Summary
-------
A compact, always-up-to-date tracker for the active development state. Keep this file short; update only the fields below when state changes.

Quick status
------------
- Web UI server: web-ui/server.js — status: not-running / needs deps (use PM2 to run)
- Python monitor: debug_monitor.py — status: not-running
- Devices connected: COM10 (ESP32-S3), COM13 (ESP32-S3), COM6 (ESP32-C6)
- Primary dev machine: Windows (PowerShell)

Blockers
--------
- Native Node module `node-pty` fails to build on Windows without additional Visual Studio components (Spectre-mitigated libs). Install via Visual Studio installer or skip terminal PTY features.
- PM2 started processes before `npm ci` completed; `web-ui` errored due to missing `express` and other packages.

Recent actions
--------------
- Added C6 management controls to `web-ui/public/index.html` and `web-ui/public/app.js`.
- Created and configured `web-ui/ecosystem.config.js` for PM2 to manage `web-ui` and `debug_monitor.py`.
- Added timestamp instruction to `.github/copilot-instructions.md`.
 - Reminder: read `.github/copilot-instructions.md` and check `PROJECT_STATUS.md` before running web UI actions or automated scripts.

Next steps
----------
- Install Node dependencies in `ESP32_AP-Flasher/web-ui` (run `npm ci` or `npm install`); if building on Windows you may need Visual Studio components for `node-pty` or remove `node-pty` dependency.
- Implement server-side `/device/*` proxy in `web-ui/server.js` (so UI can call device endpoints without entering IPs).
- Start PM2 (via `npx pm2 start ecosystem.config.js`) after dependencies are installed.

How to update this file
-----------------------
1. Edit this file with a short one-line change for any status update.
2. Update the `Last updated` timestamp using ISO 8601. Example (PowerShell):
   Get-Date -Format o | Out-String -Width 200; (Add-Content -Path PROJECT_STATUS.md -Value "Last updated: $(Get-Date -Format o)")

Minimal update template
-----------------------
- Last updated: <ISO timestamp>
- Web UI server: <status>
- Python monitor: <status>
- Devices connected: <list>
- Blockers: <one-line list>
- Next steps: <one-line list>

Maintain this file small and authoritative: change only the fields that actually changed, keep prose to a minimum.
