#!/usr/bin/env python3
"""
Minimal replacement for simple_upload.ps1
Uploads first few files to the ESP32 using curl subprocess.
"""
import subprocess
from pathlib import Path


def main():
    base = 'http://192.168.4.1'
    data = Path(__file__).resolve().parent / 'data' / 'www'
    if not data.exists():
        print('Data folder not found. Please run gzip_wwwfiles.py first.')
        return
    files = list(data.iterdir())[:5]
    for f in files:
        print('Uploading', f.name)
        try:
            subprocess.run(['curl', '-X', 'POST', '-F', f'path=/www/{f.name}', '-F', f'file=@{f}', f'{base}/littlefs_put'], check=True)
            print('Success')
        except subprocess.CalledProcessError as e:
            print('Failed', e)

if __name__ == '__main__':
    main()
