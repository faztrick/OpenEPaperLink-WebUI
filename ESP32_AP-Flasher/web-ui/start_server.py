#!/usr/bin/env python3
"""
Start the web-ui server silently (background). Prefer pm2 if requested or available.

Usage:
  python start_server.py [--use-pm2]

Behavior:
 - If --use-pm2 or pm2 is on PATH, runs `pm2 start ecosystem.config.js`.
 - Otherwise starts `node server.js` in background, writes PID to server.pid,
   and redirects stdout/err to logs/node-out.log and logs/node-err.log.

This is intended to be a cross-platform replacement for start-silent.ps1.
"""
import argparse
import os
import shutil
import subprocess
import sys
from pathlib import Path


def which(cmd):
    return shutil.which(cmd)


def ensure_logs_dir(cwd: Path):
    logs = cwd / 'logs'
    logs.mkdir(exist_ok=True)
    return logs


def start_with_pm2(cwd: Path):
    pm2 = which('pm2')
    if not pm2:
        return False
    print('Starting via pm2...')
    subprocess.Popen([pm2, 'start', 'ecosystem.config.js'], cwd=str(cwd))
    print("pm2 start requested (check with 'pm2 ls')")
    return True


def start_node_background(cwd: Path):
    node = which('node')
    if not node:
        print('node not found on PATH. Install Node.js or use pm2.', file=sys.stderr)
        return 2

    logs = ensure_logs_dir(cwd)
    out_log = logs / 'node-out.log'
    err_log = logs / 'node-err.log'

    # Open log files and spawn the server detached
    out_f = out_log.open('ab')
    err_f = err_log.open('ab')

    # Cross-platform detached process
    if os.name == 'nt':
        # CREATE_NO_WINDOW = 0x08000000
        creationflags = 0x08000000
        proc = subprocess.Popen([node, 'server.js'], cwd=str(cwd), stdout=out_f, stderr=err_f, creationflags=creationflags)
    else:
        # POSIX: start new session
        proc = subprocess.Popen([node, 'server.js'], cwd=str(cwd), stdout=out_f, stderr=err_f, start_new_session=True)

    pid_file = cwd / 'server.pid'
    pid_file.write_text(str(proc.pid))
    print(f'Started node (PID={proc.pid}). Logs: {out_log} , {err_log}')
    return 0


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--use-pm2', action='store_true', dest='use_pm2')
    args = parser.parse_args()

    cwd = Path(__file__).resolve().parent

    if args.use_pm2 or which('pm2'):
        ok = start_with_pm2(cwd)
        if ok:
            return 0

    return start_node_background(cwd)


if __name__ == '__main__':
    sys.exit(main())
