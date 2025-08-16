#!/usr/bin/env python3
"""
quick_wifi_config.py

Usage: python scripts/quick_wifi_config.py [--esp-ip ESP_IP] [--ssid SSID] [--pw PASSWORD]
                                          [--static-ip IP] [--gw GW] [--mask MASK] [--dns DNS]

This script posts a WiFi configuration JSON to the ESP32 device's /save_wifi_config endpoint,
waits for a reboot, then attempts to ping and fetch /sysinfo from the configured static IP.

Defaults mirror the repo's PowerShell helper:
  ESP IP:    192.168.4.1
  SSID:      Faztrick
  Password:  faztrick123
  Static IP: 192.168.26.201

Notes:
- Run this while your PC is connected to the ESP32 AP (or otherwise able to reach the ESP32 IP).
- On Windows the script uses the system `ping` command (adjust for other platforms if needed).

"""
from __future__ import print_function
import argparse
import json
import time
import sys
import urllib.request
import urllib.error
import subprocess


def post_wifi_config(esp_ip, payload, timeout=10):
    url = f"http://{esp_ip}/save_wifi_config"
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data, method="POST")
    req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            body = resp.read().decode("utf-8", errors="replace")
            return resp.getcode(), body
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace") if e.fp else ""
        return e.code, f"HTTPError: {e.reason}\n{body}"
    except Exception as e:
        return None, str(e)


def ping_host(host, count=2):
    # Windows `ping -n`, Unix `ping -c`
    plat = sys.platform
    if plat.startswith("win"):
        cmd = ["ping", "-n", str(count), host]
    else:
        cmd = ["ping", "-c", str(count), host]
    try:
        out = subprocess.check_output(cmd, stderr=subprocess.STDOUT, timeout=8, universal_newlines=True)
        return True, out
    except subprocess.CalledProcessError as e:
        return False, e.output
    except Exception as e:
        return False, str(e)


def fetch_sysinfo(host, timeout=5):
    url = f"http://{host}/sysinfo"
    try:
        with urllib.request.urlopen(url, timeout=timeout) as resp:
            body = resp.read().decode("utf-8", errors="replace")
            return resp.getcode(), body
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace") if e.fp else ""
        return e.code, f"HTTPError: {e.reason}\n{body}"
    except Exception as e:
        return None, str(e)


def main():
    p = argparse.ArgumentParser(description="Configure ESP32 WiFi quickly and verify reachability")
    p.add_argument("--esp-ip", default="192.168.26.201", help="ESP32 AP IP to POST the config to (default 192.168.26.201)")
    p.add_argument("--ssid", default="Faztrick", help="WiFi SSID to configure (default from repo)")
    p.add_argument("--pw", default="faztrick1234", help="WiFi password (default from repo)")
    p.add_argument("--static-ip", dest="static_ip", default="192.168.26.201", help="Static IP to set on device")
    p.add_argument("--gw", default="192.168.26.231", help="Gateway for static IP")
    p.add_argument("--mask", default="255.255.255.0", help="Subnet mask")
    p.add_argument("--dns", default="8.8.8.8", help="DNS server")
    p.add_argument("--wait", type=int, default=12, help="Seconds to wait after POST for device to restart")
    args = p.parse_args()

    payload = {
        "ssid": args.ssid,
        "pw": args.pw,
        "ip": args.static_ip,
        "mask": args.mask,
        "gw": args.gw,
        "dns": args.dns,
    }

    print(f"Posting WiFi config to http://{args.esp_ip}/save_wifi_config -> setting static IP {args.static_ip}")
    code, body = post_wifi_config(args.esp_ip, payload)
    print("POST result:", code)
    print(body)

    if code != 200:
        print("POST did not return 200. Aborting verification.")
        sys.exit(1)

    print(f"Waiting {args.wait} seconds for device to restart...")
    time.sleep(args.wait)

    print(f"Pinging {args.static_ip}...")
    ok, out = ping_host(args.static_ip)
    if ok:
        print("Ping succeeded")
        print(out)
    else:
        print("Ping failed:")
        print(out)

    print(f"Fetching sysinfo from http://{args.static_ip}/sysinfo ...")
    code, body = fetch_sysinfo(args.static_ip)
    print("sysinfo result:", code)
    print(body)

    if code == 200:
        try:
            j = json.loads(body)
            print("Parsed sysinfo keys:", list(j.keys()))
        except Exception:
            pass


if __name__ == '__main__':
    main()
