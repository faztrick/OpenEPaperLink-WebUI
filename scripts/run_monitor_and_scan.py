#!/usr/bin/env python3
"""
Minimal replacement for run_monitor_and_scan.ps1
"""
import subprocess
import sys
import time
from pathlib import Path


def main():
    root = Path(__file__).resolve().parent
    outdir = root.parent / 'logs'
    outdir.mkdir(exist_ok=True)

    monitor_script = root / 'monitor_com13.py'
    monitor_proc = None
    if monitor_script.exists():
        monitor_log = outdir / 'com13_monitor.log'
        monitor_err = outdir / 'com13_monitor_err.log'
        monitor_proc = subprocess.Popen([sys.executable, str(monitor_script)],
                                        stdout=open(monitor_log, 'w', encoding='utf-8'),
                                        stderr=open(monitor_err, 'w', encoding='utf-8'))
        time.sleep(0.5)

    improv = root.parent / 'improv_scan.py'
    if improv.exists():
        scan_log = outdir / 'improv_scan_one_run.log'
        with open(scan_log, 'w', encoding='utf-8') as f:
            rc = subprocess.call([sys.executable, str(improv), '--port', 'COM10', '--raw'], stdout=f, stderr=subprocess.STDOUT)
        print(f'improv_scan exit: {rc}. Log: {scan_log}')
    else:
        print('improv_scan.py not found. Nothing to run.')

    if monitor_proc:
        time.sleep(0.2)
        monitor_proc.terminate()
        try:
            monitor_proc.wait(timeout=2)
        except Exception:
            monitor_proc.kill()

    print('Done.')


if __name__ == '__main__':
    main()
