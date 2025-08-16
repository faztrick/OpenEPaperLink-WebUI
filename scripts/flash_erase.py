"""flash_erase.py

Helper to erase flash using esptool with retries and helpful diagnostics.
Usage: python flash_erase.py --port COM13 [--baud 115200] [--retries 3]
"""
import sys
import subprocess
import argparse
import time

DEFAULT_BAUD = 115200
DEFAULT_RETRIES = 3


def run_cmd(cmd, capture=False):
    try:
        if capture:
            completed = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
            return completed.returncode, completed.stdout
        else:
            completed = subprocess.run(cmd)
            return completed.returncode, None
    except FileNotFoundError as e:
        return 127, str(e)


def try_erase(port, baud, retries):
    args = ['erase_flash']
    base_cmds = [
        ['python', '-m', 'esptool', '--port', port, '--baud', str(baud)] + args,
        ['esptool.py', '--port', port, '--baud', str(baud)] + args,
    ]

    for attempt in range(1, retries + 1):
        for cmd in base_cmds:
            print(f"Attempt {attempt}: running: {' '.join(cmd)}")
            code, out = run_cmd(cmd, capture=True)
            if out:
                print(out)
            if code == 0:
                print('Erase successful')
                return 0
            else:
                print(f'Command returned code {code}')
            time.sleep(0.6)
    return 1


if __name__ == '__main__':
    p = argparse.ArgumentParser()
    p.add_argument('--port', '-p', required=True)
    p.add_argument('--baud', '-b', type=int, default=DEFAULT_BAUD)
    p.add_argument('--retries', type=int, default=DEFAULT_RETRIES)
    args = p.parse_args()

    rc = try_erase(args.port, args.baud, args.retries)
    sys.exit(rc)
