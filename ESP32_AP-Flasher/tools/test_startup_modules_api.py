#!/usr/bin/env python3
"""Simple smoke test for /api/startup_modules API.
Run while device is up (adjust HOST). It:
 1. GETs current flags
 2. Toggles one flag (UDP) -> POST
 3. Reads back to confirm merge
Does not reboot device. Safe to run repeatedly.
"""
import sys
import json
import time
from typing import Any, Dict

try:
    import requests
except ImportError:
    print("Missing requests. Install with: pip install requests")
    sys.exit(1)

HOST = sys.argv[1] if len(sys.argv) > 1 else 'http://192.168.4.1'
URL = HOST.rstrip('/') + '/api/startup_modules'

def pretty(d: Any) -> str:
    return json.dumps(d, indent=2, sort_keys=True)

def get_flags() -> Dict[str, Any]:
    r = requests.get(URL, timeout=5)
    r.raise_for_status()
    return r.json()

def post_flags(mods: Dict[str, bool]):
    payload = {"modules": mods}
    r = requests.post(URL, json=payload, timeout=5)
    r.raise_for_status()
    return r.json()

def main():
    print(f"[INFO] Querying existing flags at {URL}")
    before = get_flags()
    print("[INFO] Current flags:\n" + pretty(before))

    mods = before.get('modules', {})
    if not isinstance(mods, dict):
        print("[ERROR] Unexpected response format (no modules object)")
        return 2

    # Toggle UDP flag (default false) for demonstration
    new_udp = not mods.get('UDP', False)
    print(f"[INFO] Setting UDP => {new_udp}")
    post_resp = post_flags({'UDP': new_udp})
    print("[INFO] POST response:", post_resp)

    # Small delay to allow FS write
    time.sleep(0.5)
    after = get_flags()
    print("[INFO] Updated flags:\n" + pretty(after))

    updated_udp = after.get('modules', {}).get('UDP')
    if updated_udp != new_udp:
        print(f"[ERROR] UDP flag not updated (expected {new_udp}, got {updated_udp})")
        return 1

    print("[SUCCESS] UDP flag updated successfully (persist until reboot).")
    print("NOTE: Reboot device to apply newly enabled modules.")
    return 0

if __name__ == '__main__':
    sys.exit(main())
