#!/usr/bin/env python3
"""
Replacement stub for compile.ps1 — minimal build+upload orchestrator.
"""
import argparse
import subprocess


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--env', default='OutdoorAP')
    p.add_argument('--comport', default='COM10')
    args = p.parse_args()
    print('This is a minimal compile stub. To build, run: pio run -e', args.env)

if __name__ == '__main__':
    main()
