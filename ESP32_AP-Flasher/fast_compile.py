#!/usr/bin/env python3
"""
Stub for fast_compile.ps1 — orchestrates platformio/python build steps.
This is a thin wrapper and intentionally minimal. Expanding to feature parity can be done on request.
"""
import subprocess
import argparse


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--env', default='OutdoorAP')
    p.add_argument('--jobs', default='8')
    args = p.parse_args()
    try:
        subprocess.run(['pio', 'run', '--environment', args.env, '--jobs', args.jobs], check=True)
    except Exception as e:
        print('Build failed or pio not found:', e)

if __name__ == '__main__':
    main()
