#!/usr/bin/env python3
"""
Fast build wrapper: runs PlatformIO with -j and environment, accepting both
Pythonic flags and legacy PowerShell-style flags.
"""
import argparse
import subprocess
import sys


def main(argv=None) -> int:
    if argv is None:
        argv = sys.argv[1:]

    # Pythonic args
    ap = argparse.ArgumentParser(add_help=False)
    ap.add_argument('--env')
    ap.add_argument('--jobs')
    ap.add_argument('--verbose', action='store_true')
    ns, rest = ap.parse_known_args(argv)

    env = ns.env or 'OutdoorAP'
    jobs = int(ns.jobs) if ns.jobs else 8
    verbose = bool(ns.verbose)

    # Legacy flags
    i = 0
    while i < len(rest):
        t = rest[i]
        n = rest[i+1] if i+1 < len(rest) else None
        if t == '-Environment' and n:
            env = n; i += 2; continue
        if t == '-Jobs' and n:
            try: jobs = int(n)
            except: pass
            i += 2; continue
        if t == '-Verbose':
            verbose = True; i += 1; continue
        i += 1

    cmd = ['pio', 'run', '-e', env, '-j', str(jobs)]
    if verbose:
        cmd.append('-v')
    try:
        print('Running:', ' '.join(cmd))
        cp = subprocess.run(cmd)
        return cp.returncode
    except FileNotFoundError as e:
        print('pio not found:', e)
        return 127
    except Exception as e:
        print('Build failed:', e)
        return 1


if __name__ == '__main__':
    sys.exit(main())
