#!/usr/bin/env python3
"""
Unified management script for OpenEPaperLink Web UI (single-port model).
Reduces the need to open multiple terminals by wrapping common PM2 + build
operations in one interface.

Usage (PowerShell examples):
  python manage_webui.py start        # start dev (pm2 webui-dev --watch)
  python manage_webui.py stop         # stop dev
  python manage_webui.py restart      # restart dev
  python manage_webui.py status       # show pm2 status row for webui-dev
  python manage_webui.py logs         # tail logs (Ctrl+C to exit)
  python manage_webui.py build        # production build (stops dev if running)
  python manage_webui.py prod         # start prod (next start) via pm2 webui-prod
  python manage_webui.py kill         # delete both dev + prod processes
  python manage_webui.py info         # print detected environment summary

Environment overrides:
  DEVICE_BASE_URL=http://x.x.x.x python manage_webui.py restart
  NEXT_PUBLIC_DEFAULT_TRANSPORT=serial python manage_webui.py start

Requires: Node, npm (or pnpm/yarn) dependencies installed. PM2 is invoked via npx.

Exit codes:
  0 success, 1 error.
"""
from __future__ import annotations
import subprocess, sys, json, shutil, os, time, socket
from typing import Optional

APP_DEV = 'webui-dev'
APP_PROD = 'webui-prod'
ECOSYSTEM = 'ecosystem.config.cjs'
ROOT = os.path.dirname(os.path.abspath(__file__))


def run(cmd:list[str], cwd:Optional[str]=None, capture=False, check=True, env=None):
    if env is not None:
        merged = os.environ.copy(); merged.update(env)
    else:
        merged = None
    if capture:
        res = subprocess.run(cmd, cwd=cwd, env=merged, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        if check and res.returncode != 0:
            print(res.stdout)
            print(res.stderr, file=sys.stderr)
            raise SystemExit(res.returncode)
        return res.stdout
    else:
        res = subprocess.run(cmd, cwd=cwd, env=merged)
        if check and res.returncode != 0:
            raise SystemExit(res.returncode)
        return ''


def ensure_pm2():
    """Return list of command tokens to invoke pm2 (prefer global, else npx)."""
    # Check direct pm2
    for name in ['pm2', 'pm2.cmd']:
        path = shutil.which(name)
        if path:
            return [path]
    # Local node_modules/.bin
    local_bin = os.path.join(ROOT, 'node_modules', '.bin')
    for name in ['pm2.cmd', 'pm2']:
        candidate = os.path.join(local_bin, name)
        if os.path.isfile(candidate):
            return [candidate]
    # npx fallback
    for name in ['npx', 'npx.cmd']:
        path = shutil.which(name)
        if path:
            return [path, 'pm2']
    print('PM2 (or npx) not found in PATH. Install with: npm i -g pm2', file=sys.stderr)
    raise SystemExit(1)


def pm2_cmd(*parts:str, capture=False):
    base = ensure_pm2()
    return run(base + list(parts), cwd=ROOT, capture=capture, check=True)


def is_running(name:str)->bool:
    try:
        out = pm2_cmd('jlist', capture=True)
        arr = json.loads(out)
        for proc in arr:
            if proc.get('name') == name and proc.get('pm2_env', {}).get('status') == 'online':
                return True
        return False
    except Exception:
        return False


def start_dev():
    if is_running(APP_DEV):
        print('Dev already running.')
        return
    pm2_cmd('start', ECOSYSTEM, '--only', APP_DEV, '--watch')
    print('Started dev (watch).')


def start_prod():
    if is_running(APP_PROD):
        print('Prod already running.')
        return
    pm2_cmd('start', ECOSYSTEM, '--only', APP_PROD)
    print('Started prod.')


def stop(name:str):
    if not is_running(name):
        print(f'{name} not running.')
        return
    try:
        pm2_cmd('stop', name)
        print(f'Stopped {name}.')
    except SystemExit:
        print(f'Failed stopping {name}', file=sys.stderr)


def delete(name:str):
    try:
        pm2_cmd('delete', name)
        print(f'Deleted {name}.')
    except SystemExit:
        pass


def restart(name:str):
    if not is_running(name):
        print(f'{name} not running, starting instead.')
        if name == APP_DEV:
            start_dev(); return
        if name == APP_PROD:
            start_prod(); return
    pm2_cmd('restart', name)
    print(f'Restarted {name}.')


def status():
    try:
        raw = pm2_cmd('jlist', capture=True)
        # Strip any leading banner lines (pm2 notices start with '>>>>')
        lines = [ln for ln in raw.splitlines() if not ln.strip().startswith('>>>>')]
        cleaned = '\n'.join(lines)
        start = cleaned.find('['); end = cleaned.rfind(']')
        if start == -1 or end == -1 or end <= start:
            raise ValueError('No JSON array detected in pm2 jlist output')
        arr = json.loads(cleaned[start:end+1])
        headers = ['name','status','restarts','cpu','mem']
        rows = []
        for p in arr:
            env = p.get('pm2_env', {})
            rows.append([
                p.get('name'),
                env.get('status'),
                env.get('restart_time'),
                f"{p.get('monit',{}).get('cpu','-')}%",
                f"{p.get('monit',{}).get('memory','-')}"
            ])
        colw = [max(len(str(r[i])) for r in ([headers]+rows)) for i in range(len(headers))]
        def fmt(r): return '  '.join(str(r[i]).ljust(colw[i]) for i in range(len(headers)))
        print(fmt(headers))
        for r in rows:
            print(fmt(r))
    except Exception as e:
        try:
            print('JSON status failed, falling back to plain list:', e, file=sys.stderr)
            pm2_cmd('list')  # will stream output
        except Exception as e2:
            print('Unable to get pm2 status at all:', e2, file=sys.stderr)


def logs(name:str):
    base = ensure_pm2()
    subprocess.call(base + ['logs', name], cwd=ROOT)


def build():
    if is_running(APP_DEV):
        print('Dev process active; stopping before build...')
        stop(APP_DEV)
    print('Running production build...')
    run([shutil.which('npm') or 'npm', 'run', 'build'], cwd=ROOT)
    print('Build complete.')

def rebuild():
    """Stop dev, build, optionally restart dev (if RESTART=1 env set)."""
    was_running = is_running(APP_DEV)
    if was_running:
        print('Stopping dev before rebuild...')
        stop(APP_DEV)
    build()
    if os.environ.get('RESTART','').lower() in ('1','true','yes'):
        print('Restart flag detected, starting dev...')
        start_dev()
    else:
        print('Skipping restart (set RESTART=1 to auto-restart).')


def info():
    print('Root:', ROOT)
    print('Dev running:', is_running(APP_DEV))
    print('Prod running:', is_running(APP_PROD))
    print('DEVICE_BASE_URL:', os.environ.get('DEVICE_BASE_URL') or '(not set)')
    print('NEXT_PUBLIC_DEFAULT_TRANSPORT:', os.environ.get('NEXT_PUBLIC_DEFAULT_TRANSPORT') or '(not set)')


def kill_all():
    delete(APP_DEV); delete(APP_PROD)
    print('All managed processes removed.')


def doctor():
    print('--- Doctor ---')
    print('Node version:')
    try:
        run(['node','-v'], cwd=ROOT, check=False)
    except Exception:
        print('Node not found')
    print('NPM version:')
    try:
        run(['npm','-v'], cwd=ROOT, check=False)
    except Exception:
        print('npm not found')
    print('PM2 present:', bool(ensure_pm2()))
    print('Processes:')
    status()
    print('Port 3000 check:')
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.settimeout(0.6)
    try:
        rc = s.connect_ex(('127.0.0.1', 3000))
        if rc == 0:
            print('  - LISTENING (in use, likely dev server).')
        else:
            print('  - FREE (no listener).')
    except Exception as e:
        print('  - Error checking port:', e)
    finally:
        s.close()
    print('Selected DEVICE_BASE_URL:', os.environ.get('DEVICE_BASE_URL','(none)'))
    print('Selected default transport:', os.environ.get('NEXT_PUBLIC_DEFAULT_TRANSPORT','(none)'))


COMMANDS = {
    'start': lambda: start_dev(),
    'update': lambda: pm2_cmd('update'),
    'prod': lambda: start_prod(),
    'stop': lambda: stop(APP_DEV),
    'stop-prod': lambda: stop(APP_PROD),
    'restart': lambda: restart(APP_DEV),
    'restart-prod': lambda: restart(APP_PROD),
    'status': status,
    'logs': lambda: logs(APP_DEV),
    'logs-prod': lambda: logs(APP_PROD),
    'build': build,
    'rebuild': rebuild,
    'info': info,
    'kill': kill_all,
    'doctor': doctor,
}


def main():
    if len(sys.argv) < 2 or sys.argv[1] in ('-h','--help','help'):  # show help
        print(__doc__)
        print('Commands:')
        for k in sorted(COMMANDS):
            print('  ', k)
        return
    cmd = sys.argv[1]
    fn = COMMANDS.get(cmd)
    if not fn:
        print(f'Unknown command: {cmd}', file=sys.stderr)
        return 1
    fn()
    return 0

if __name__ == '__main__':
    sys.exit(main())
