import serial
import time
import sys

port = 'COM6'
baud = 115200
outfile = 'boot_log_COM6.txt'

def main():
    try:
        ser = serial.Serial(port, baud, timeout=0.5)
    except Exception as e:
        print('Failed to open serial port:', e)
        sys.exit(1)

    print(f'Opened {port} @ {baud}, capturing 15s...')
    end = time.time() + 15
    lines = []
    try:
        while time.time() < end:
            try:
                line = ser.readline()
                if line:
                    try:
                        decoded = line.decode('utf-8', errors='replace').rstrip('\r\n')
                    except:
                        decoded = repr(line)
                    print(decoded)
                    lines.append(decoded)
            except Exception as e:
                pass
    finally:
        ser.close()

    with open(outfile, 'w', encoding='utf-8') as f:
        for l in lines:
            f.write(l + '\n')

    print(f'Captured {len(lines)} lines to {outfile}')

if __name__ == '__main__':
    main()
