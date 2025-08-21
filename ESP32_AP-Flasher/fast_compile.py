#!/usr/bin/env python3
"""
Fast build wrapper: runs PlatformIO with -j and environment, accepting both
Pythonic flags and legacy PowerShell-style flags.
Enhanced: prefers local .venv if present for invoking PlatformIO (python -m platformio) to
ensure consistent dependency isolation when user enabled venv.
"""
import argparse
import subprocess
import sys
import os
from pathlib import Path
from typing import List

LEGACY_FLAG_MAP = {
    '-Environment': 'env',
    '-Jobs': 'jobs',
    '-Verbose': 'verbose'
}


def parse_args(argv: List[str]):
    """Parse mixed style arguments returning (env, jobs, verbose)."""
    ap = argparse.ArgumentParser(add_help=False)
    ap.add_argument('--env')
    ap.add_argument('--jobs')
    ap.add_argument('--verbose', action='store_true')
    ns, rest = ap.parse_known_args(argv)

    env = ns.env or 'OutdoorAP'
    jobs = int(ns.jobs) if ns.jobs else 8
    verbose = bool(ns.verbose)

    # Process legacy flags (single pass)
    i = 0
    while i < len(rest):
        token = rest[i]
        if token == '-Environment' and i + 1 < len(rest):
            env = rest[i+1]; i += 2; continue
        if token == '-Jobs' and i + 1 < len(rest):
            try:
                jobs = int(rest[i+1])
            except ValueError:
                pass
            i += 2; continue
        if token == '-Verbose':
            verbose = True; i += 1; continue
        i += 1

    return env, jobs, verbose


def build_command(env: str, jobs: int, verbose: bool) -> List[str]:
    script_dir = Path(__file__).resolve().parent
    venv_python = script_dir / '.venv' / 'Scripts' / ('python.exe' if os.name == 'nt' else 'python')
    if venv_python.exists():
        cmd = [str(venv_python), '-m', 'platformio', 'run', '-e', env, '-j', str(jobs)]
    else:
        cmd = ['pio', 'run', '-e', env, '-j', str(jobs)]
    if verbose:
        cmd.append('-v')
    return cmd


def main(argv=None) -> int:
    if argv is None:
        argv = sys.argv[1:]

    env, jobs, verbose = parse_args(argv)
    cmd = build_command(env, jobs, verbose)

    try:
        print('Running:', ' '.join(cmd))
        cp = subprocess.run(cmd)
        return cp.returncode
    except FileNotFoundError as e:
        print('PlatformIO not found:', e)
        return 127
    except Exception as e:  # Broad catch to surface unexpected errors cleanly
        print('Build failed:', e)
        return 1


if __name__ == '__main__':
    sys.exit(main())
