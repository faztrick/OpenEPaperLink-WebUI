import requests
import json

# Update base_url to your device IP
base_url = "http://192.168.4.1"  # default AP IP for device when in AP mode

try:
    r = requests.get(base_url + "/api/all", timeout=5)
    r.raise_for_status()
    print(json.dumps(r.json(), indent=2))
except Exception as e:
    print("Failed to call /api/all:", e)
    if 'r' in locals():
        print("Status:", r.status_code)
        print(r.text)
