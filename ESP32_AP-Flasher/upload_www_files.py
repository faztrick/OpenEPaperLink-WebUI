#!/usr/bin/env python3
"""Enhanced uploader for ESP32 LittleFS web assets.

Features:
 - Recursive upload (retains directory tree)
 - Custom source directory (default: data/www or data/www-next if present)
 - Custom remote base path (default: /www)
 - Skips hidden files and optionally skip non-gz when a .gz variant exists
 - Progress + basic retry

Usage examples:
  python upload_www_files.py -i 192.168.4.1
  python upload_www_files.py -i 192.168.4.1 --source data/www-next --remote /www
  python upload_www_files.py -i 192.168.4.1 --source data/www-next-gz --remote /www --prefer-gz
"""
import argparse
from pathlib import Path
import requests
import sys
import time

def choose_default_source(root: Path) -> Path:
    cand_next = root / 'data' / 'www-next'
    cand_www = root / 'data' / 'www'
    if cand_next.exists():
        return cand_next
    return cand_www

def iter_files(base: Path):
    for p in base.rglob('*'):
        if p.is_file():
            # Skip hidden
            if any(part.startswith('.') for part in p.relative_to(base).parts):
                continue
            yield p

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('-i', '--ip', default='192.168.26.177', help='Device IP (AP mode often 192.168.4.1)')
    parser.add_argument('--source', '-s', help='Source directory (defaults to data/www-next if exists else data/www)')
    parser.add_argument('--remote', '-r', default='/www', help='Remote base path (default /www)')
    parser.add_argument('--prefer-gz', action='store_true', help='If a .gz version of a file exists beside it, skip the raw one')
    parser.add_argument('--retry', type=int, default=2, help='Retry attempts on failure')
    args = parser.parse_args()

    repo_root = Path(__file__).resolve().parent
    source = Path(args.source) if args.source else choose_default_source(repo_root)
    if not source.exists():
        print('Source directory does not exist:', source)
        sys.exit(2)

    base_url = f'http://{args.ip}'
    upload_url = f'{base_url}/littlefs_put'

    files = list(iter_files(source))
    if not files:
        print('No files found under', source)
        return
    print(f'Uploading {len(files)} files from {source} to {upload_url} (remote base {args.remote})')

    sent = 0
    for f in files:
        rel = f.relative_to(source)
        if args.prefer_gz and not f.name.endswith('.gz') and (f.with_suffix(f.suffix + '.gz').exists()):
            # Skip uncompressed if gz counterpart exists
            continue
        remote_path = f'{args.remote}/{rel.as_posix()}'
        # Normalize double slashes
        remote_path = remote_path.replace('//', '/').replace('//', '/')
        attempt = 0
        while True:
            attempt += 1
            try:
                with open(f, 'rb') as fh:
                    r = requests.post(upload_url,
                                      files={'file': (f.name, fh)},
                                      data={'path': remote_path},
                                      timeout=60)
                if r.status_code == 200:
                    print(f'[{sent+1}/{len(files)}] OK  {rel} -> {remote_path}')
                else:
                    print(f'[{sent+1}/{len(files)}] ERR {rel} status={r.status_code} body={r.text[:80]}')
                break
            except Exception as e:
                if attempt <= args.retry:
                    print(f'[{sent+1}/{len(files)}] RETRY {rel} ({e})')
                    time.sleep(0.5)
                    continue
                print(f'[{sent+1}/{len(files)}] FAIL  {rel}: {e}')
                break
        sent += 1

    print('Done.')

if __name__ == '__main__':
    main()
