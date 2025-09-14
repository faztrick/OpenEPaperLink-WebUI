#!/usr/bin/env python3
"""Validate firmware HTTP endpoint registrations against endpoints.json manifest.

Scans C++ sources for server.on("/path", HTTP_METHOD, ...) style registrations and
AsyncCallbackJsonWebHandler (if used later) then compares to endpoints.json.

Exit codes:
 0 - success
 1 - drift detected (missing or extra endpoints)
 2 - manifest parse error / source scan error

Usage:
  python tools/validate_endpoints_manifest.py [--update]
If --update is provided, missing endpoints from source are appended to the manifest with
placeholder metadata (category=unknown, deprecated=false). This is a convenience helper;
review the diff afterwards.
"""
from __future__ import annotations
import json, re, sys, pathlib, argparse

ROOT = pathlib.Path(__file__).resolve().parents[1]
SRC_DIR = ROOT / 'src'
MANIFEST = ROOT / 'endpoints.json'

# Regex to capture server.on("/api/wifi/status", HTTP_GET, ...)
ON_PATTERN = re.compile(r'server\.on\(\s*"([^"]+)"\s*,\s*(HTTP_[A-Z]+)')
# Potential alternative registration macro wrappers could be added here.

METHOD_MAP = {
    'HTTP_GET': 'GET',
    'HTTP_POST': 'POST',
    'HTTP_PUT': 'PUT',
    'HTTP_DELETE': 'DELETE',
    'HTTP_PATCH': 'PATCH',
    'HTTP_ANY': 'ANY'
}

def scan_sources():
    endpoints = set()
    for cpp in SRC_DIR.rglob('*.cpp'):
        try:
            text = cpp.read_text(encoding='utf-8', errors='ignore')
        except Exception as e:
            print(f"ERROR: failed reading {cpp}: {e}", file=sys.stderr)
            continue
        for m in ON_PATTERN.finditer(text):
            path, method_token = m.groups()
            method = METHOD_MAP.get(method_token, method_token)
            endpoints.add((method, path))
    return endpoints


def load_manifest():
    try:
        data = json.loads(MANIFEST.read_text(encoding='utf-8'))
    except Exception as e:
        print(f"ERROR: parsing manifest {MANIFEST}: {e}", file=sys.stderr)
        sys.exit(2)
    manifest_entries = {(item['method'], item['path']) for item in data}
    return data, manifest_entries


def categorize(path: str) -> str:
    # Heuristic category inference for --update convenience.
    if path.startswith('/api/wifi/') or path.startswith('/wifi') or path.startswith('/network'):
        return 'wifi'
    if path.startswith('/api/log'):
        return 'logging'
    if 'ota' in path:
        return 'ota'
    if 'ble' in path:
        return 'ble'
    if 'config' in path or 'staconfig' in path:
        return 'config'
    if 'openai' in path:
        return 'ai'
    if 'spiffs' in path or 'littlefs' in path:
        return 'filesystem'
    return 'system'


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--update', action='store_true', help='Append missing endpoints into manifest')
    args = ap.parse_args()

    src_eps = scan_sources()
    data, manifest_eps = load_manifest()

    missing_in_manifest = sorted(src_eps - manifest_eps)
    extra_in_manifest = sorted(manifest_eps - src_eps)

    if missing_in_manifest:
        print('Missing in manifest:')
        for m in missing_in_manifest:
            print(f'  {m[0]} {m[1]}')
    if extra_in_manifest:
        print('Extra in manifest (not found in sources):')
        for m in extra_in_manifest:
            print(f'  {m[0]} {m[1]}')

    if args.update and missing_in_manifest:
        for method, path in missing_in_manifest:
            data.append({
                'method': method,
                'path': path,
                'category': categorize(path),
                'source': 'firmware',
                'deprecated': False,
                'module': 'unknown'
            })
        # Keep file stable: sort by path then method
        data.sort(key=lambda x: (x['path'], x['method']))
        MANIFEST.write_text(json.dumps(data, indent=2) + '\n', encoding='utf-8')
        print(f'Updated manifest with {len(missing_in_manifest)} endpoints.')

    if missing_in_manifest or extra_in_manifest:
        if not args.update:
            print('\nDRIFT DETECTED. (Run with --update to append missing entries)')
        sys.exit(1)

    print('Manifest validation OK (no drift).')
    sys.exit(0)

if __name__ == '__main__':
    main()
