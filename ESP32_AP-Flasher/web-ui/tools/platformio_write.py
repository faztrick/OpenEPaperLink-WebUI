#!/usr/bin/env python3
import sys
import os
import shutil

def main():
    if len(sys.argv) < 2:
        print('Usage: platformio_write.py <dest_path>', file=sys.stderr)
        sys.exit(2)

    dest = sys.argv[1]
    data = sys.stdin.buffer.read()
    if not data:
        print('No input received', file=sys.stderr)
        sys.exit(3)

    # write backup
    if os.path.exists(dest):
        bak = f"{dest}.{int(__import__('time').time())}.bak"
        try:
            shutil.copy2(dest, bak)
        except Exception as e:
            print(f'Backup failed: {e}', file=sys.stderr)
            sys.exit(4)

    # atomic write
    tmp = dest + '.tmp'
    try:
        with open(tmp, 'wb') as f:
            f.write(data)
        os.replace(tmp, dest)
        print('ok')
        sys.exit(0)
    except Exception as e:
        print(f'Write failed: {e}', file=sys.stderr)
        try:
            if os.path.exists(tmp): os.remove(tmp)
        except:
            pass
        sys.exit(5)

if __name__ == '__main__':
    main()
