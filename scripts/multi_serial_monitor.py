"""
Multi-port serial monitor for Windows (PowerShell friendly).

Default ports: COM10 (ESP32-S3), COM13 (ESP32-S3 alt), COM6 (ESP32-C6)
Default baud: 115200

Usage examples:
  python scripts/multi_serial_monitor.py
  python scripts/multi_serial_monitor.py --ports COM10 COM13 COM6 --baud 115200
  python scripts/multi_serial_monitor.py --list   # show available COM ports

Notes:
- Requires pyserial: pip install pyserial
- Colors use ANSI; on modern Windows/PowerShell this works out of the box.
  If you prefer, install colorama (optional) to ensure ANSI works everywhere.
"""

import argparse
import sys
import threading
import time
from datetime import datetime

try:
    import serial
    from serial.tools import list_ports
except Exception as e:
    print("pyserial is required. Install with: pip install pyserial", file=sys.stderr)
    raise

# Optional color support
try:
    from colorama import init as colorama_init
    colorama_init()
except Exception:
    pass

# Basic ANSI colors
COLORS = [
    "\x1b[38;5;39m",   # blue
    "\x1b[38;5;197m",  # pink/red
    "\x1b[38;5;40m",   # green
    "\x1b[38;5;214m",  # orange
    "\x1b[38;5;220m",  # yellow
    "\x1b[38;5;81m",   # cyan
]
RESET = "\x1b[0m"


def list_com_ports():
    ports = [p.device for p in list_ports.comports()]
    if ports:
        print("Available COM ports:")
        for p in ports:
            print("  ", p)
    else:
        print("No COM ports detected.")


def open_serial(port: str, baud: int, retries: int = 5, delay: float = 0.6):
    last_exc = None
    for _ in range(retries):
        try:
            s = serial.Serial(port, baud, timeout=0.05)
            return s
        except Exception as e:
            last_exc = e
            time.sleep(delay)
    raise last_exc


def reader_thread(port: str, baud: int, color: str, show_ts: bool):
    prefix = f"[{port}]"
    try:
        ser = open_serial(port, baud)
    except Exception as e:
        ts = datetime.now().strftime("%H:%M:%S") if show_ts else ""
        ts_part = f"[{ts}] " if ts else ""
        sys.stderr.write(f"{color}{ts_part}{prefix} ERROR opening: {e}{RESET}\n")
        sys.stderr.flush()
        return

    ts = datetime.now().strftime("%H:%M:%S") if show_ts else ""
    ts_part = f"[{ts}] " if ts else ""
    sys.stdout.write(f"{color}{ts_part}{prefix} opened @ {baud}{RESET}\n")
    sys.stdout.flush()

    try:
        buf = bytearray()
        while True:
            chunk = ser.read(256)
            if chunk:
                buf.extend(chunk)
                # Print complete lines promptly
                while b"\n" in buf:
                    line, _, buf = buf.partition(b"\n")
                    try:
                        text = line.decode(errors="replace")
                    except Exception:
                        text = str(line)
                    ts = datetime.now().strftime("%H:%M:%S") if show_ts else ""
                    ts_part = f"[{ts}] " if ts else ""
                    sys.stdout.write(f"{color}{ts_part}{prefix} {text}{RESET}\n")
                    sys.stdout.flush()
            else:
                time.sleep(0.02)
    except KeyboardInterrupt:
        pass
    except Exception as e:
        ts = datetime.now().strftime("%H:%M:%S") if show_ts else ""
        ts_part = f"[{ts}] " if ts else ""
        sys.stderr.write(f"{color}{ts_part}{prefix} ERROR: {e}{RESET}\n")
        sys.stderr.flush()
    finally:
        try:
            ser.close()
        except Exception:
            pass


def main():
    parser = argparse.ArgumentParser(description="Multi-port serial monitor")
    parser.add_argument("--ports", nargs="*", default=["COM10", "COM13", "COM6"], help="List of COM ports to open")
    parser.add_argument("--baud", type=int, default=115200, help="Baud rate for all ports")
    parser.add_argument("--no-ts", action="store_true", help="Hide timestamps")
    parser.add_argument("--list", action="store_true", help="List available COM ports and exit")
    args = parser.parse_args()

    if args.list:
        list_com_ports()
        return

    ports = args.ports
    baud = args.baud
    show_ts = not args.no_ts

    threads = []
    for idx, port in enumerate(ports):
        color = COLORS[idx % len(COLORS)]
        t = threading.Thread(target=reader_thread, args=(port, baud, color, show_ts), daemon=True)
        threads.append(t)
        t.start()

    try:
        while any(t.is_alive() for t in threads):
            time.sleep(0.2)
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
