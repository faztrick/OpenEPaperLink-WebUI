#!/usr/bin/env python3
"""
Stub for configure_wifi.ps1
Sends a minimal WiFi configuration to the ESP32 save_wifi_config endpoint.
"""
import argparse
import requests


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--ip', default='192.168.4.1')
    p.add_argument('--ssid', default='Faztrick')
    p.add_argument('--pw', default='faztrick1234')
    args = p.parse_args()

    cfg = {'ssid': args.ssid, 'pw': args.pw}
    try:
        r = requests.post(f'http://{args.ip}/save_wifi_config', json=cfg, timeout=10)
        print('Status', r.status_code)
    except Exception as e:
        print('Error:', e)


if __name__ == '__main__':
    main()
