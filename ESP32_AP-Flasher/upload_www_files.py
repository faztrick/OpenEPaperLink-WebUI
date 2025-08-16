#!/usr/bin/env python3
"""
Python replacement stub for upload_www_files.ps1
Uploads files from data/www to device using requests.
"""
import argparse
from pathlib import Path
import requests


def main():
    p = argparse.ArgumentParser()
    p.add_argument('-i', '--ip', default='192.168.26.177')
    args = p.parse_args()
    base = f'http://{args.ip}'
    data = Path(__file__).resolve().parent / 'data' / 'www'
    if not data.exists():
        print('data/www not found:', data)
        return
    for f in data.iterdir():
        url = f'{base}/littlefs_put'
        print('Uploading', f.name)
        try:
            with open(f, 'rb') as fh:
                r = requests.post(url, files={'file': (f.name, fh)}, data={'path': f'/www/{f.name}'}, timeout=30)
            print(r.status_code)
        except Exception as e:
            print('Failed', e)

if __name__ == '__main__':
    main()
