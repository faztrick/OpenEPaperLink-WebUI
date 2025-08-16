#!/usr/bin/env python3
"""
Simple port of curl_upload_all.ps1 that POSTs files under ESP32_AP-Flasher/data/www to the device.
This is a minimal implementation using requests; if requests isn't available, it will fallback to subprocess curl.
"""
import subprocess
import sys
from pathlib import Path


def post_with_curl(file_path, ip='192.168.4.1'):
    url = f'http://{ip}/littlefs_put'
    args = ['curl', '-sS', '-w', '\n%{http_code}\n', '-o', 'nul', '-X', 'POST', url, '-F', f'path=/www/{file_path.name}', '-F', f'file=@{file_path}']
    proc = subprocess.run(args, capture_output=True, text=True)
    return proc.stdout


def main():
    root = Path(__file__).resolve().parent.parent
    www = root / 'ESP32_AP-Flasher' / 'data' / 'www'
    if not www.exists():
        print('www folder not found:', www)
        return
    files = list(www.iterdir())
    out = root / 'logs' / 'curl_upload.log'
    out.parent.mkdir(exist_ok=True)
    with open(out, 'a', encoding='utf-8') as logf:
        for idx, f in enumerate(files, 1):
            print(f'Uploading {idx}/{len(files)}: {f.name}')
            try:
                outtxt = post_with_curl(f)
                entry = f'[{f.name}]\n{outtxt}\n'
                logf.write(entry)
            except Exception as e:
                logf.write(f'ERROR {f.name}: {e}\n')

if __name__ == '__main__':
    main()
