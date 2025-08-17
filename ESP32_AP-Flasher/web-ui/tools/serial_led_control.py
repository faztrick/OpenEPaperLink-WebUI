#!/usr/bin/env python3
"""
Simple serial helper to send a line-based command to an ESP32 (or other) device.

Usage examples:
  python serial_led_control.py --port COM5 --baud 115200 --cmd "LED OFF"
  python serial_led_control.py --list

It defaults to sending the line 'LED OFF' (with newline) if --cmd is not given.
"""
import argparse
import sys

DEFAULT_CMD = "LED OFF"
DEFAULT_CMD_UNIX = "led off"


def list_ports():
    try:
        import serial.tools.list_ports
    except Exception:
        print('pyserial not installed. Install with: pip install pyserial', file=sys.stderr)
        return 1

    ports = serial.tools.list_ports.comports()
    if not ports:
        print('No serial ports found')
        return 0
    for p in ports:
        print(f"{p.device}\t{p.description}")
    return 0


def send_command(port, baud, cmd, timeout):
    try:
        import serial
    except Exception:
        print('pyserial not installed. Install with: pip install pyserial', file=sys.stderr)
        return 2

    try:
        ser = serial.Serial(port, baudrate=baud, timeout=timeout)
    except Exception as e:
        print(f'Failed to open port {port}: {e}', file=sys.stderr)
        return 3

    try:
        line = cmd
        if not line.endswith('\n'):
            line = line + '\n'
        ser.write(line.encode('utf-8'))
        # optional: read a short response
        try:
            resp = ser.readline()
            if resp:
                try:
                    print('Response:', resp.decode('utf-8', errors='replace').rstrip('\r\n'))
                except Exception:
                    print('Response (raw):', resp)
        except Exception:
            pass
        ser.close()
        return 0
    except Exception as e:
        print(f'Failed to write to port {port}: {e}', file=sys.stderr)
        try:
            ser.close()
        except Exception:
            pass
        return 4


def main(argv=None):
    p = argparse.ArgumentParser(description='Send a simple command over serial to control a device')
    p.add_argument('--port', '-p', help='Serial port (COMx on Windows or /dev/tty... on Unix)')
    p.add_argument('--baud', '-b', type=int, default=115200, help='Baud rate')
    p.add_argument('--cmd', '-c', default=DEFAULT_CMD, help='Command to send (default: "LED OFF")')
    p.add_argument('--timeout', '-t', type=float, default=1.0, help='Read timeout in seconds')
    p.add_argument('--list', action='store_true', help='List available serial ports')

    args = p.parse_args(argv)

    if args.list or not args.port:
        return list_ports()

    return send_command(args.port, args.baud, args.cmd, args.timeout)


if __name__ == '__main__':
    sys.exit(main())
