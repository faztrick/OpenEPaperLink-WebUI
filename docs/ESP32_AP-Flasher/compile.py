#!/usr/bin/env python3
"""
Cross-platform replacement for compile.ps1 — robust build/upload orchestrator using PlatformIO.

Accepts BOTH legacy PowerShell-style flags and Pythonic flags so existing UIs keep working:

PowerShell style (legacy, from web UI and server):
  -Environment <name>
  -ComPort <COMx>
  -BaudRate <num>
  -Jobs <n>
  -FastBuild
  -Clean
  -Verbose
  -FilesystemOnly
  -SkipUpload
  -SkipBuild
  -Monitor
  -Flash          # upload only (legacy alias)
  -Port <COMx>    # legacy alias for -ComPort

Pythonic style:
  --env <name>
  --comport <port>
  --baud <num>
  --jobs <n>
  --fast
  --clean
  --verbose
  --fs-only
  --skip-upload
  --skip-build
  --monitor

Behavior:
  - Default is build + upload firmware (unless overridden by skip flags)
  - Filesystem mode: buildfs (+ uploadfs when not skipped)
  - Clean: runs pio target clean and exits
  - Monitor: runs pio device monitor (baud if provided) and exits
"""
from __future__ import annotations

import argparse
import shlex
import subprocess
import sys
from typing import List


def parse_args(argv: List[str]):
    # First, support the Pythonic flags
    ap = argparse.ArgumentParser(add_help=False)
    ap.add_argument('--env', dest='env')
    ap.add_argument('--comport', dest='comport')
    ap.add_argument('--baud', dest='baud')
    ap.add_argument('--jobs', dest='jobs')
    ap.add_argument('--fast', action='store_true')
    ap.add_argument('--clean', action='store_true')
    ap.add_argument('--verbose', action='store_true')
    ap.add_argument('--fs-only', action='store_true', dest='filesystem_only')
    ap.add_argument('--skip-upload', action='store_true')
    ap.add_argument('--skip-build', action='store_true')
    ap.add_argument('--monitor', action='store_true')
    py_args, unknown = ap.parse_known_args(argv)

    # Defaults
    env = py_args.env or 'OutdoorAP'
    comport = py_args.comport or 'COM10'
    baud = int(py_args.baud) if py_args.baud else 115200
    jobs = int(py_args.jobs) if py_args.jobs else 0
    fast = bool(py_args.fast)
    clean = bool(py_args.clean)
    verbose = bool(py_args.verbose)
    filesystem_only = bool(py_args.filesystem_only)
    skip_upload = bool(py_args.skip_upload)
    skip_build = bool(py_args.skip_build)
    monitor = bool(py_args.monitor)
    flash_only = False

    # Now parse legacy PS-style flags embedded in unknown
    # Simple manual scan to keep tolerant of ordering
    it = iter(range(len(unknown)))
    i = 0
    while i < len(unknown):
        tok = unknown[i]
        nxt = unknown[i + 1] if i + 1 < len(unknown) else None
        def consume_val():
            nonlocal i
            i += 2
        def consume_flag():
            nonlocal i
            i += 1

        if tok in ('-Environment',):
            if nxt: env = nxt; consume_val(); continue
        if tok in ('-ComPort',):
            if nxt: comport = nxt; consume_val(); continue
        if tok in ('-Port',):
            if nxt: comport = nxt; consume_val(); continue
        if tok in ('-BaudRate',):
            if nxt:
                try: baud = int(nxt)
                except: pass
            consume_val(); continue
        if tok in ('-Jobs',):
            if nxt:
                try: jobs = int(nxt)
                except: pass
            consume_val(); continue
        if tok in ('-FastBuild',):
            fast = True; consume_flag(); continue
        if tok in ('-Clean',):
            clean = True; consume_flag(); continue
        if tok in ('-Verbose',):
            verbose = True; consume_flag(); continue
        if tok in ('-FilesystemOnly',):
            filesystem_only = True; consume_flag(); continue
        if tok in ('-SkipUpload',):
            skip_upload = True; consume_flag(); continue
        if tok in ('-SkipBuild',):
            skip_build = True; consume_flag(); continue
        if tok in ('-Monitor',):
            monitor = True; consume_flag(); continue
        if tok in ('-Flash',):
            flash_only = True; consume_flag(); continue

        # Unrecognized token: skip it
        i += 1

    return {
        'env': env,
        'comport': comport,
        'baud': baud,
        'jobs': jobs,
        'fast': fast,
        'clean': clean,
        'verbose': verbose,
        'filesystem_only': filesystem_only,
        'skip_upload': skip_upload,
        'skip_build': skip_build,
        'monitor': monitor,
        'flash_only': flash_only,
    }


def run(cmd: List[str]) -> int:
    print('Running:', ' '.join(shlex.quote(c) for c in cmd))
    try:
        cp = subprocess.run(cmd)
        return cp.returncode
    except FileNotFoundError as e:
        print('Command not found:', cmd[0], e)
        return 127
    except Exception as e:
        print('Command failed:', e)
        return 1


def main(argv: List[str] | None = None) -> int:
    if argv is None:
        argv = sys.argv[1:]

    cfg = parse_args(argv)
    env = cfg['env']
    comport = cfg['comport']
    baud = cfg['baud']
    jobs = cfg['jobs']
    fast = cfg['fast']
    clean = cfg['clean']
    verbose = cfg['verbose']
    filesystem_only = cfg['filesystem_only']
    skip_upload = cfg['skip_upload']
    skip_build = cfg['skip_build']
    monitor = cfg['monitor']
    flash_only = cfg['flash_only']

    print(f'Environment: {env}')
    print(f'COM Port: {comport}')

    if monitor:
        # Serial monitor only
        cmd = ['pio', 'device', 'monitor', '--port', comport, '--baud', str(baud)]
        return run(cmd)

    if clean:
        # Clean build artifacts
        cmd = ['pio', 'run', '-e', env, '--target', 'clean']
        return run(cmd)

    # Filesystem-only path
    if filesystem_only:
        # build fs
        buildfs = ['pio', 'run', '-e', env, '--target', 'buildfs']
        if jobs > 0:
            buildfs += ['-j', str(jobs)]
        if verbose:
            buildfs += ['-v']
        rc = run(buildfs)
        if rc != 0:
            print('buildfs failed, aborting')
            return rc
        if not skip_upload:
            uploadfs = ['pio', 'run', '-e', env, '--target', 'uploadfs', '--upload-port', comport]
            return run(uploadfs)
        print('Filesystem build complete (no upload)')
        return 0

    # Firmware path
    if not skip_build and not flash_only:
        build = ['pio', 'run', '-e', env]
        if jobs > 0 or fast:
            build += ['-j', str(jobs or 8)]
        if verbose:
            build += ['-v']
        rc = run(build)
        if rc != 0:
            print('Build failed, aborting upload.')
            return rc

    # Upload unless explicitly skipped
    if flash_only or not skip_upload:
        upload = ['pio', 'run', '-e', env, '--target', 'upload', '--upload-port', comport]
        if verbose:
            upload += ['-v']
        return run(upload)

    print('Build completed (upload skipped).')
    return 0


if __name__ == '__main__':
    sys.exit(main())
