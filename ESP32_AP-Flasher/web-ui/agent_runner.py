"""Lightweight Python Agent Runner

This module is an optional extension point for more complex automation sequences
that may require Python libraries (e.g., parsing ELF symbols, advanced log
analytics, memory map inspection). The Node server can spawn this script with
JSON instructions via stdin and receive structured JSON responses on stdout.

Protocol:
  Input  (single line JSON): {"action": "analyze-elf", "path": "/abs/path"}
  Output (single line JSON): {"success": true, "result": {...}}

Unknown actions return {success:false, error:"unknown-action"}.

Security Notes:
 - This script intentionally restricts operations to allow-listed actions.
 - No arbitrary shell execution. Extend ALLOWED_ACTIONS list to add features.
"""
from __future__ import annotations
import sys, json, os, hashlib

ALLOWED_ACTIONS = {"hash-file", "echo"}

def hash_file(path: str):
    try:
        if not os.path.isfile(path):
            return {"success": False, "error": "not-a-file"}
        h = hashlib.sha256()
        with open(path, 'rb') as f:
            for chunk in iter(lambda: f.read(65536), b''):
                h.update(chunk)
        return {"success": True, "sha256": h.hexdigest(), "bytes": os.path.getsize(path)}
    except Exception as e:
        return {"success": False, "error": str(e)}

def echo(payload):
    return {"success": True, "echo": payload}

HANDLERS = {
    'hash-file': lambda req: hash_file(req.get('path','')),
    'echo': lambda req: echo(req.get('payload'))
}

def main():
    raw = sys.stdin.read()
    try:
        req = json.loads(raw)
    except Exception as e:
        print(json.dumps({"success": False, "error": f"invalid-json: {e}"}))
        return
    action = req.get('action')
    if action not in ALLOWED_ACTIONS:
        print(json.dumps({"success": False, "error": "unknown-action"}))
        return
    try:
        result = HANDLERS[action](req)
        print(json.dumps(result))
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}))

if __name__ == '__main__':
    main()
