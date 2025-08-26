#!/usr/bin/env python3
"""Helper script to call the local Web UI server's serial WiFi scan endpoint.

Usage:
  python wifi_scan_api.py --port COM10 --timeout 8000

Requires the web-ui Node server running locally (default http://localhost:3000).
Respects OEPL_API_BASE env var if set.
"""
from __future__ import annotations
import os, sys, json, argparse, time
import requests

def main():
    apibase = os.environ.get("OEPL_API_BASE", "http://localhost:3000")
    p = argparse.ArgumentParser()
    p.add_argument('--port', '--path', dest='port', default='COM10', help='Serial port path (e.g. COM10)')
    p.add_argument('--baud', dest='baud', type=int, default=115200, help='Baud rate')
    p.add_argument('--timeout', dest='timeout', type=int, default=8000, help='Scan timeout ms')
    p.add_argument('--raw', action='store_true', help='Print raw JSON only')
    args = p.parse_args()

    url = f"{apibase.rstrip('/')}/api/serial/wifi/scan"
    payload = {"path": args.port, "baudRate": args.baud, "timeoutMs": args.timeout}
    t0 = time.time()
    try:
        r = requests.post(url, json=payload, timeout=(args.timeout/1000.0 + 2))
    except Exception as e:
        print(f"ERROR: request failed: {e}", file=sys.stderr)
        sys.exit(2)
    dt = (time.time() - t0) * 1000
    if r.status_code != 200:
        print(f"ERROR: HTTP {r.status_code}: {r.text}", file=sys.stderr)
        sys.exit(1)
    data = r.json()
    if args.raw:
        print(json.dumps(data, indent=2))
        return
    if not data.get('success'):
        print(f"Scan failed: {data.get('error')}", file=sys.stderr)
        sys.exit(1)
    nets = data.get('networks', [])
    print(f"Scan OK in {dt:.0f} ms: {len(nets)} networks")
    # Sort by RSSI descending if present
    def rssi(v):
        try: return int(v.get('rssi', 0))
        except: return 0
    nets.sort(key=rssi, reverse=True)
    for n in nets:
        print(f"  - {n.get('ssid','<empty>'):32} RSSI={n.get('rssi','?'):>4} auth={n.get('auth','?')}")

if __name__ == '__main__':
    main()
