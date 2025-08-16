"""Simple robust serial monitor for COM13 with retries and helpful errors.

Usage: python monitor_com13.py [PORT] [BAUD]
Defaults: PORT=COM13 BAUD=115200
"""

import sys
import time
import serial
from serial.tools import list_ports

DEFAULT_PORT = 'COM13'
DEFAULT_BAUD = 115200
OPEN_RETRIES = 5
OPEN_DELAY = 0.6

def list_com_ports():
    return [p.device for p in list_ports.comports()]

def open_serial(port, baud):
    last_exc = None
    for attempt in range(1, OPEN_RETRIES + 1):
        try:
            s = serial.Serial(port, baud, timeout=0.5)
            return s
        except Exception as e:
            last_exc = e
            time.sleep(OPEN_DELAY)
    raise last_exc

def main(argv):
    port = argv[1] if len(argv) > 1 else DEFAULT_PORT
    baud = int(argv[2]) if len(argv) > 2 else DEFAULT_BAUD

    try:
        s = open_serial(port, baud)
    except Exception as e:
        print(f'Failed opening {port}: {e}')
        available = list_com_ports()
        if available:
            print('Available ports:', ', '.join(available))
        else:
            print('No serial ports detected. Is the device connected?')
        sys.exit(2)

    print(f'=== Serial monitor started on {port} @ {baud} ===')
    try:
        while True:
            b = s.read(1024)
            if b:
                try:
                    sys.stdout.buffer.write(b)
                except Exception:
                    sys.stdout.write(b.decode(errors='replace'))
                sys.stdout.flush()
            else:
                time.sleep(0.05)
    except KeyboardInterrupt:
        print('\n=== Serial monitor stopped ===')
        s.close()
    except Exception as e:
        print('\n=== Serial monitor error ===', e)
        s.close()

if __name__ == '__main__':
    main(sys.argv)
