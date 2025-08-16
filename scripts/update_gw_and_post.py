#!/usr/bin/env python3
"""
GET /get_wifi_config from ESP, update 'gw' value, POST to /save_wifi_config.
Usage: python update_gw_and_post.py --esp 192.168.4.1 --gw 192.168.29.231
"""
import argparse
import json
import sys
from urllib.request import Request, urlopen
from urllib.error import URLError, HTTPError


def http_get(url, timeout=10):
    req = Request(url, headers={"User-Agent": "update-gw-script/1.0"})
    with urlopen(req, timeout=timeout) as r:
        return r.read().decode('utf-8'), r.getcode(), r.getheaders()


def http_post_json(url, data, timeout=10):
    b = json.dumps(data).encode('utf-8')
    req = Request(url, data=b, headers={"Content-Type": "application/json", "User-Agent": "update-gw-script/1.0"})
    with urlopen(req, timeout=timeout) as r:
        return r.read().decode('utf-8'), r.getcode(), r.getheaders()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--esp', required=True, help='ESP IP, e.g. 192.168.4.1')
    ap.add_argument('--gw', required=True, help='New gateway IP to set')
    args = ap.parse_args()

    base = f'http://{args.esp}'
    get_url = base + '/get_wifi_config'
    save_url = base + '/save_wifi_config'

    print('GET', get_url)
    try:
        body, code, headers = http_get(get_url)
        print('GET status', code)
        print('Body:', body)
    except HTTPError as e:
        print('GET HTTPError', e.code, e.reason)
        sys.exit(2)
    except URLError as e:
        print('GET URLError', e)
        sys.exit(3)
    except Exception as e:
        print('GET Exception', type(e).__name__, e)
        sys.exit(4)

    try:
        cfg = json.loads(body) if body else {}
    except Exception as e:
        print('Failed parsing JSON from GET:', e)
        cfg = {}

    # Only update gw
    old_gw = cfg.get('gw')
    cfg['gw'] = args.gw
    print('Old gw:', old_gw, 'New gw:', cfg['gw'])

    print('POST', save_url)
    try:
        resp_body, resp_code, resp_headers = http_post_json(save_url, cfg)
        print('POST status', resp_code)
        print('Response body:', resp_body)
    except HTTPError as e:
        print('POST HTTPError', e.code, e.reason)
        try:
            print('Body:', e.read().decode())
        except Exception:
            pass
        sys.exit(5)
    except URLError as e:
        print('POST URLError', e)
        sys.exit(6)
    except Exception as e:
        print('POST Exception', type(e).__name__, e)
        sys.exit(7)

    print('Done')

if __name__ == '__main__':
    main()
