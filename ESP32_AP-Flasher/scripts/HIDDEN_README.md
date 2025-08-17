Hidden-run helpers

This folder contains two small utilities to start commands without opening an extra PowerShell/console window.

run_hidden.ps1
- PowerShell wrapper that starts a command via System.Diagnostics.Process with CreateNoWindow = $true.
- Usage (PowerShell):
  .\run_hidden.ps1 -Command "python -m http.server 8001 --directory C:\path\to\repo\web-ui\public" -Out logs/hidden.out -Err logs/hidden.err

run_hidden.vbs
- Lightweight VBScript you can call with `cscript //nologo run_hidden.vbs "<command>"` to start a command hidden (window style 0).
- Useful for contexts where PowerShell isn't desired or available.

Notes
- These helpers write stdout/stderr to log files. They do not attempt to daemonize permanently; use the provided `start_no_open.ps1`/`stop_no_open.ps1` for that workflow which already captures PIDs and logs.
- On Windows, launching Python with pythonw.exe is another option (no console). For short one-off commands use the VBS launcher.
