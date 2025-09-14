#!/usr/bin/env python3
"""Simple REST API smoke tests for OpenEPaperLink AP firmware.

Usage:
  python test_api_endpoints.py --host 192.168.4.1 --port 80

Environment variables:
  OPEL_HOST, OPEL_PORT override defaults.

Tests performed:
  1. /api/v1/wifi/status returns 200 + mandatory keys.
  2. /api/v1/led/status returns 200 + mandatory keys.
  3. Legacy /api/wifi/status returns X-Deprecated header.
  4. /api/v1/led/set without brightness (BR) is rejected (400 or success:false JSON).
	5. /api/v1/health returns aggregated keys (uptime, freeHeap, apiVersion, modules).

Exit code non-zero on failure. Prints a concise summary.
"""
from __future__ import annotations
import os
import sys
import json
import time
import argparse
from dataclasses import dataclass
from typing import Any, Dict, Optional, Tuple

try:
	import requests  # type: ignore
except ImportError:  # pragma: no cover
	print("[ERROR] 'requests' library not installed. Install via: pip install requests")
	sys.exit(2)


@dataclass
class TestResult:
	name: str
	passed: bool
	detail: str = ""


def build_base_url(host: str, port: int) -> str:
	if port in (80, 443):
		return f"http://{host}" if port == 80 else f"https://{host}"
	return f"http://{host}:{port}"


def http_get(base: str, path: str) -> Tuple[int, Dict[str, Any], Dict[str, str]]:
	url = base + path
	r = requests.get(url, timeout=5)
	body: Dict[str, Any] = {}
	try:
		if r.text:
			body = r.json()
	except Exception:
		# leave body empty for non-JSON
		pass
	return r.status_code, body, {k.lower(): v for k, v in r.headers.items()}


def http_post(base: str, path: str, data: Dict[str, Any]) -> Tuple[int, Dict[str, Any], Dict[str, str]]:
	url = base + path
	r = requests.post(url, json=data, timeout=5)
	body: Dict[str, Any] = {}
	try:
		if r.text:
			body = r.json()
	except Exception:
		pass
	return r.status_code, body, {k.lower(): v for k, v in r.headers.items()}


def test_wifi_status_v1(base: str) -> TestResult:
	code, body, _ = http_get(base, "/api/v1/wifi/status")
	required = {"connected", "mode", "apMode"}
	if code != 200:
		return TestResult("wifi_status_v1", False, f"HTTP {code}")
	missing = required - body.keys()
	if missing:
		return TestResult("wifi_status_v1", False, f"Missing keys: {sorted(missing)} body={body}")
	return TestResult("wifi_status_v1", True)


def test_led_status_v1(base: str) -> TestResult:
	code, body, _ = http_get(base, "/api/v1/led/status")
	required = {"module", "brightness"}
	if code != 200:
		return TestResult("led_status_v1", False, f"HTTP {code}")
	missing = required - body.keys()
	if missing:
		return TestResult("led_status_v1", False, f"Missing keys: {sorted(missing)} body={body}")
	return TestResult("led_status_v1", True)


def test_wifi_status_legacy_deprecated(base: str) -> TestResult:
	code, body, headers = http_get(base, "/api/wifi/status")
	if code != 200:
		return TestResult("wifi_status_legacy", False, f"HTTP {code}")
	dep = headers.get("x-deprecated") or headers.get("deprecation")
	if not dep:
		return TestResult("wifi_status_legacy", False, f"Missing X-Deprecated header. Headers={headers}")
	return TestResult("wifi_status_legacy", True)


def test_led_set_missing_brightness(base: str) -> TestResult:
	code, body, _ = http_post(base, "/api/v1/led/set", {"r": 10, "g": 10, "b": 10})
	# Accept either 400 or JSON success:false
	if code == 400:
		return TestResult("led_set_missing_br", True)
	if body.get("success") is False:
		return TestResult("led_set_missing_br", True, f"HTTP {code} body indicates failure as expected")
	return TestResult("led_set_missing_br", False, f"Expected 400 or success:false, got code={code} body={body}")


def test_health_endpoint(base: str) -> TestResult:
	code, body, _ = http_get(base, "/api/v1/health")
	if code != 200:
		return TestResult("health_v1", False, f"HTTP {code}")
	# Minimal required keys
	required = {"uptime", "freeHeap", "apiVersion"}
	missing = required - body.keys()
	if missing:
		return TestResult("health_v1", False, f"Missing keys: {sorted(missing)} body={body}")
	# Structural sanity checks (non-fatal warnings could be added later)
	if not isinstance(body.get("uptime"), (int, float)):
		return TestResult("health_v1", False, f"uptime not numeric: {body.get('uptime')}")
	if not isinstance(body.get("freeHeap"), int):
		return TestResult("health_v1", False, f"freeHeap not int: {body.get('freeHeap')}")
	return TestResult("health_v1", True)


def main(argv: Optional[list[str]] = None) -> int:
	ap = argparse.ArgumentParser()
	ap.add_argument("--host", default=os.getenv("OPEL_HOST", "192.168.4.1"))
	ap.add_argument("--port", type=int, default=int(os.getenv("OPEL_PORT", "80")))
	args = ap.parse_args(argv)
	base = build_base_url(args.host, args.port)
	tests = [
		test_wifi_status_v1,
		test_led_status_v1,
		test_wifi_status_legacy_deprecated,
		test_led_set_missing_brightness,
		test_health_endpoint,
	]
	results: list[TestResult] = []
	start = time.time()
	for t in tests:
		try:
			results.append(t(base))
		except Exception as e:  # pragma: no cover
			results.append(TestResult(t.__name__, False, f"Exception: {e}"))
	dur = (time.time() - start) * 1000.0
	passed = sum(1 for r in results if r.passed)
	failed = [r for r in results if not r.passed]
	for r in results:
		status = "PASS" if r.passed else "FAIL"
		line = f"[{status}] {r.name}"
		if r.detail:
			line += f" - {r.detail}"
		print(line)
	print(f"Summary: {passed}/{len(results)} passed in {dur:.1f} ms")
	if failed:
		print("Failures:")
		for f in failed:
			print(f"  - {f.name}: {f.detail}")
		return 1
	return 0


if __name__ == "__main__":  # pragma: no cover
	sys.exit(main())
