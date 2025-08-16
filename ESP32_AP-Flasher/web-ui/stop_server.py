#!/usr/bin/env python3
"""
Stop the web-ui server that was started with start_server.py

Usage:
  python stop_server.py [--use-pm2]

Behavior:
 - If --use-pm2 or pm2 is on PATH, runs `pm2 stop esp32-dev-ui` and `pm2 delete esp32-dev-ui`.
 - Otherwise reads server.pid, kills the process, and removes server.pid.
"""
import argparse
import os
import shutil
import signal
import subprocess
import sys
from pathlib import Path


def which(cmd):
    return shutil.which(cmd)


def stop_with_pm2(cwd: Path):
    pm2 = which('pm2')
    if not pm2:
        return False
    print('Stopping via pm2...')
    subprocess.run([pm2, 'stop', 'esp32-dev-ui'], cwd=str(cwd))
    subprocess.run([pm2, 'delete', 'esp32-dev-ui'], cwd=str(cwd))
    print("pm2 process stopped/deleted. Check 'pm2 ls'")
    return True


def stop_node_by_pid(cwd: Path):
    pid_file = cwd / 'server.pid'
    if not pid_file.exists():
        print('No server.pid found. Nothing to stop.')
        return 0

    pid_text = pid_file.read_text().strip()
    if not pid_text:
        print('server.pid is empty; nothing to stop.')
        pid_file.unlink(missing_ok=True)
        return 0

    try:
        pid = int(pid_text.splitlines()[0])
    except Exception:
        print('Invalid PID in server.pid; removing file.')
        pid_file.unlink(missing_ok=True)
        return 1

    try:
        if os.name == 'nt':
            # Use taskkill for Windows to ensure child processes are killed
            subprocess.run(['taskkill', '/PID', str(pid), '/F'], check=True)
        else:
            os.kill(pid, signal.SIGTERM)
        print(f'Killed process PID={pid}')
        pid_file.unlink(missing_ok=True)
        return 0
    except Exception as e:
        print(f'No running process found for PID={pid} or error killing: {e}')
        pid_file.unlink(missing_ok=True)
        return 1


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--use-pm2', action='store_true', dest='use_pm2')
    args = parser.parse_args()

    cwd = Path(__file__).resolve().parent

    if args.use_pm2 or which('pm2'):
        ok = stop_with_pm2(cwd)
        if ok:
            return 0

    return stop_node_by_pid(cwd)


if __name__ == '__main__':
    sys.exit(main())
