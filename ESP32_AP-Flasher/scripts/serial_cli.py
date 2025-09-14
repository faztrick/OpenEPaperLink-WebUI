#!/usr/bin/env python3
"""
serial_cli.py - Simple cross-platform COM port communication helper for OpenEPaperLink

Features:
    * List available serial ports
    * One-shot send & capture response
    * Interactive terminal with local echo, colorized status, optional logging
    * Hex send / hex dump modes
    * Interactive /hex <bytes> command to send raw bytes while in session
    * Robust line ending control (CR, LF, CRLF, raw)
    * RTS/DTR toggling (e.g. to reset ESP32) and convenience --reset-esp pulse
    * Graceful reconnect retry (--retry) if device temporarily disappears

Usage examples:
  List ports:
    python serial_cli.py --list

  Open specific port 115200 baud interactive:
    python serial_cli.py -p COM10 -b 115200 -i

  Send a command then exit after first line or timeout:
    python serial_cli.py -p COM10 -c "AT+GMR" -t 2.0

  Send raw hex bytes (no newline):
    python serial_cli.py -p COM10 --hex "41 42 43 0D"

  Log interactive session to file with timestamps:
    python serial_cli.py -p COM10 -i --log session.log --ts

  Reconnect for up to 60s waiting for the port:
    python serial_cli.py -p COM10 -i --retry 60

Interactive commands:
    /quit or /q      Exit
    /hex <bytes>     Send raw hex bytes without appended line ending
    /help            Show this help summary

Exit interactive with CTRL+C or CTRL+Q.

Dependencies: pyserial, colorama (already listed in requirements.txt)
"""
from __future__ import annotations
import sys, time, argparse, threading, queue, os, re, signal
from typing import Optional
import serial
import serial.tools.list_ports
from colorama import Fore, Style, init as colorama_init

STOP = object()

def list_ports():
    ports = serial.tools.list_ports.comports()
    for p in ports:
        print(f"{p.device}\t{p.description}\tVID:PID={p.vid:04X}:{p.pid:04X}" if p.vid and p.pid else f"{p.device}\t{p.description}")
    if not ports:
        print("No serial ports found")

LINE_ENDINGS = {
    'lf': b'\n',
    'cr': b'\r',
    'crlf': b'\r\n',
    'none': b''
}

HEX_RE = re.compile(r'^[0-9A-Fa-f][0-9A-Fa-f](?:[\s,;:-]?[0-9A-Fa-f][0-9A-Fa-f])*?$')

def parse_hex_string(s: str) -> bytes:
    cleaned = re.sub(r'[\s,;:-]', '', s)
    if len(cleaned) % 2:
        raise ValueError("Odd number of hex characters")
    if not HEX_RE.match(cleaned):
        raise ValueError("Invalid hex bytes string")
    return bytes(int(cleaned[i:i+2], 16) for i in range(0, len(cleaned), 2))

class SerialSession:
    def __init__(self, port: str, baud: int, timeout: float, rts: Optional[bool], dtr: Optional[bool], retry: int=0, reset_pulse: bool=False):
        self.port = port
        self.baud = baud
        self.timeout = timeout
        self.rts = rts
        self.dtr = dtr
        self.retry = retry
        self.reset_pulse = reset_pulse
        self.ser: Optional[serial.Serial] = None

    def open(self):
        deadline = time.time() + self.retry if self.retry else None
        while True:
            try:
                self.ser = serial.Serial(self.port, self.baud, timeout=0, write_timeout=2)
                if self.rts is not None:
                    self.ser.rts = self.rts
                if self.dtr is not None:
                    self.ser.dtr = self.dtr
                if self.reset_pulse:
                    # Typical ESP32 auto-reset uses toggling DTR/RTS, but a simple pulse on DTR often works
                    try:
                        self.ser.dtr = False
                        self.ser.rts = True
                        time.sleep(0.05)
                        self.ser.dtr = True
                        self.ser.rts = False
                        time.sleep(0.05)
                    except Exception:
                        pass
                return
            except serial.SerialException as e:
                if deadline and time.time() < deadline:
                    time.sleep(0.5)
                    continue
                raise SystemExit(f"Failed to open {self.port}: {e}")

    def close(self):
        if self.ser and self.ser.is_open:
            try:
                self.ser.close()
            except Exception:
                pass

    def write(self, data: bytes) -> int:
        if not self.ser:
            raise RuntimeError("Serial not open")
        written = self.ser.write(data)
        # pyserial type hint may allow None; coerce to 0 for safety
        return int(written) if written is not None else 0

    def read_available(self) -> bytes:
        if not self.ser:
            return b''
        try:
            n = self.ser.in_waiting
            if n:
                return self.ser.read(n)
        except Exception:
            return b''
        return b''

class InteractiveTerminal:
    def __init__(self, session: SerialSession, line_ending: str, hex_dump: bool, log_path: Optional[str], timestamps: bool, quiet: bool):
        self.s = session
        self.line_ending = LINE_ENDINGS[line_ending]
        self.hex_dump = hex_dump
        self.log_path = log_path
        self.timestamps = timestamps
        self.quiet = quiet
        self.log_fp = None
        self.running = True
        self.input_queue: queue.Queue = queue.Queue()

    def start(self):
        if self.log_path:
            self.log_fp = open(self.log_path, 'a', buffering=1)
        t_reader = threading.Thread(target=self.reader_loop, daemon=True)
        t_input = threading.Thread(target=self.input_loop, daemon=True)
        t_reader.start(); t_input.start()
        try:
            while self.running:
                time.sleep(0.05)
        except KeyboardInterrupt:
            self.running = False
        finally:
            if self.log_fp:
                self.log_fp.close()
            print("\nExiting interactive.")

    def log(self, prefix: str, data: bytes):
        if not self.log_fp:
            return
        ts = time.strftime('%H:%M:%S') if self.timestamps else ''
        if self.hex_dump:
            line = data.hex()
        else:
            try:
                line = data.decode(errors='replace')
            except Exception:
                line = repr(data)
        self.log_fp.write(f"{ts} {prefix} {line}\n")

    def reader_loop(self):
        color_rx = Fore.CYAN
        while self.running:
            chunk = self.s.read_available()
            if chunk:
                self.log('<', chunk)
                if self.hex_dump:
                    printable = chunk.hex()
                else:
                    printable = chunk.decode(errors='replace')
                if not self.quiet:
                    print(f"{color_rx}{printable}{Style.RESET_ALL}", end='', flush=True)
            time.sleep(0.02)

    def input_loop(self):
        color_tx = Fore.YELLOW
        try:
            while self.running:
                line = sys.stdin.readline()
                if line == '':
                    self.running = False
                    break
                stripped = line.strip()
                if stripped in ('/quit','/exit','/q','/Q','\x11'):  # Ctrl+Q equivalent
                    self.running = False
                    break
                if stripped.startswith('/hex '):
                    hex_part = stripped[5:].strip()
                    try:
                        payload = parse_hex_string(hex_part)
                    except Exception as e:
                        print(Fore.RED + f"Invalid hex: {e}" + Style.RESET_ALL)
                        continue
                    self.s.write(payload)
                    self.log('>', payload)
                    continue
                if stripped in ('/help','/h'):
                    print(Fore.GREEN + "/hex <bytes>  send raw hex; /quit exit" + Style.RESET_ALL)
                    continue
                send = line.rstrip('\n').encode()
                self.s.write(send + self.line_ending)
                self.log('>', send + self.line_ending)
                if not self.quiet:
                    print(f"{color_tx}", end='')
        except KeyboardInterrupt:
            self.running = False


def one_shot(session: SerialSession, send: Optional[str], hex_bytes: Optional[str], timeout: float, line_ending: str, expect: Optional[str]):
    if send and hex_bytes:
        raise SystemExit("Cannot use --command and --hex together")
    if hex_bytes:
        payload = parse_hex_string(hex_bytes)
        session.write(payload)
        return
    if send:
        payload = send.encode() + LINE_ENDINGS[line_ending]
        session.write(payload)
        # collect until newline or timeout
        deadline = time.time() + timeout
        buf = bytearray()
        while time.time() < deadline:
            chunk = session.read_available()
            if chunk:
                buf.extend(chunk)
                if b'\n' in chunk:
                    break
            time.sleep(0.02)
        text = buf.decode(errors='replace')
        if expect and expect not in text:
            print(text)
            raise SystemExit(2)
        print(text, end='')


def main():
    colorama_init()
    ap = argparse.ArgumentParser(description="Serial COM helper for OpenEPaperLink")
    ap.add_argument('--list', action='store_true', help='List available ports and exit')
    ap.add_argument('-p','--port', help='Serial port (e.g. COM10 or /dev/ttyUSB0)')
    ap.add_argument('-b','--baud', type=int, default=115200, help='Baud rate (default 115200)')
    ap.add_argument('-i','--interactive', action='store_true', help='Interactive terminal mode')
    ap.add_argument('-c','--command', help='Send a single command then read one line')
    ap.add_argument('--hex', dest='hexbytes', help='Send raw hex bytes (e.g. "41 42 43 0D")')
    ap.add_argument('-t','--timeout', type=float, default=2.0, help='Timeout for one-shot receive (seconds)')
    ap.add_argument('-e','--ending', choices=LINE_ENDINGS.keys(), default='lf', help='Line ending for command/interactive (default lf)')
    ap.add_argument('--expect', help='Fail (exit code 2) if substring not in first received line')
    ap.add_argument('--rts', choices=['0','1'], help='Force RTS line state')
    ap.add_argument('--dtr', choices=['0','1'], help='Force DTR line state')
    ap.add_argument('--retry', type=int, default=0, help='Seconds to keep retrying open if port missing')
    ap.add_argument('--log', help='Log interactive traffic to file (append)')
    ap.add_argument('--ts', action='store_true', help='Prepend timestamps in log file')
    ap.add_argument('--hex-dump', action='store_true', help='Display incoming data as hex')
    ap.add_argument('--reset-esp', action='store_true', help='Pulse DTR/RTS to reset ESP32 after open')
    ap.add_argument('--quiet', action='store_true', help='Suppress echo of incoming data (still logs)')

    args = ap.parse_args()

    if args.list:
        list_ports()
        return

    if not args.port:
        ap.error('Port required unless --list specified')

    session = SerialSession(
        port=args.port,
        baud=args.baud,
        timeout=args.timeout,
        rts=(args.rts == '1') if args.rts is not None else None,
        dtr=(args.dtr == '1') if args.dtr is not None else None,
        retry=args.retry,
        reset_pulse=args.reset_esp
    )
    session.open()

    if args.interactive:
        term = InteractiveTerminal(session, args.ending, args.hex_dump, args.log, args.ts, args.quiet)
        print(f"Opened {args.port} @ {args.baud} baud. Type /quit to exit.")
        try:
            term.start()
        finally:
            session.close()
        return

    one_shot(session, args.command, args.hexbytes, args.timeout, args.ending, args.expect)
    session.close()

if __name__ == '__main__':
    main()
