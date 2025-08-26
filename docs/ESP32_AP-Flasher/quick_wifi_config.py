#!/usr/bin/env python3
"""
Quick WiFi configuration replacement for quick_wifi_config.ps1
Sends JSON config to the ESP32 save_wifi_config endpoint.
"""
import argparse
import json
import requests
from pathlib import Path


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--ip', default='192.168.4.1')
    p.add_argument('--ssid', default='Faztrick')
    p.add_argument('--pw', default='faztrick1234')
    p.add_argument('--ipaddr', default='192.168.26.201')
    args = p.parse_args()
    cfg = {
        'ssid': args.ssid,
        'pw': args.pw,
        'ip': args.ipaddr,
        'mask': '255.255.255.0',
        'gw': '192.168.26.1',
        'dns': '8.8.8.8'
    }
    url = f'http://{args.ip}/save_wifi_config'
    try:
        r = requests.post(url, json=cfg, timeout=10)
        print('Status', r.status_code)
    except Exception as e:
        print('Error:', e)

if __name__ == '__main__':
    main()
