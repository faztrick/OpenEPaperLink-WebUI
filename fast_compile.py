#!/usr/bin/env python3
"""Root convenience wrapper for ESP32_AP-Flasher/fast_compile.py
Allows running:
  python fast_compile.py --env OutdoorAP --jobs 16
from the repository root instead of cd'ing into ESP32_AP-Flasher.
Pass-through of all args.
"""
from pathlib import Path
import runpy
import sys
import os

HERE = Path(__file__).parent
inner_dir = HERE / 'ESP32_AP-Flasher'
inner = inner_dir / 'fast_compile.py'
if not inner.exists():
  print('ERROR: Expected inner fast_compile at', inner, file=sys.stderr)
  sys.exit(1)

prev_cwd = Path.cwd()
try:
  os.chdir(inner_dir)
  # Adjust argv so the inner script sees its own name followed by remaining args
  sys.argv = [str(inner)] + sys.argv[1:]
  runpy.run_path(str(inner), run_name='__main__')
finally:
  os.chdir(prev_cwd)
