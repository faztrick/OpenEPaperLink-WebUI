# improv_scan.py
import serial, time, argparse

IMPROV_HDR = b'IMPROV'
IMPROV_VER = 0x01
TYPE_RPC = 0x03
TYPE_RPC_RESPONSE = 0x04

CMD_WIFI_SETTINGS = 0x01
CMD_GET_CURRENT_STATE = 0x02
CMD_GET_DEVICE_INFO = 0x03
CMD_GET_WIFI_NETWORKS = 0x04

def checksum(b):
    return bytes([sum(b) & 0xFF])

def build_improv_rpc(command, payload_bytes=b''):
    payload = bytes([command]) + payload_bytes
    header = IMPROV_HDR + bytes([IMPROV_VER, TYPE_RPC, len(payload)])
    frame = header + payload
    frame += checksum(frame)
    return frame

def build_wifi_settings_payload(ssid, password):
    ss = ssid.encode('utf-8')
    pw = password.encode('utf-8')
    if len(ss) > 255 or len(pw) > 255:
        raise ValueError("SSID/password too long")
    return bytes([len(ss)]) + ss + bytes([len(pw)]) + pw

def parse_improv_frames_from_stream(ser, timeout=5.0):
    ser.timeout = 0.2
    end_time = time.time() + timeout
    buf = bytearray()
    while time.time() < end_time:
        data = ser.read(256)
        if data:
            buf.extend(data)
            while True:
                idx = buf.find(IMPROV_HDR)
                if idx == -1:
                    if len(buf) > len(IMPROV_HDR):
                        buf = buf[-len(IMPROV_HDR):]
                    break
                if idx > 0:
                    buf = buf[idx:]
                if len(buf) < 9:
                    break
                ver = buf[6]
                typ = buf[7]
                payload_len = buf[8]
                full_len = 9 + payload_len + 1
                if len(buf) < full_len:
                    break
                frame = bytes(buf[:full_len])
                calc = sum(frame[:-1]) & 0xFF
                if calc != frame[-1]:
                    buf = buf[1:]
                    continue
                payload = frame[9:-1]
                yield typ, payload
                buf = buf[full_len:]
        else:
            pass

def decode_rpc_payload(payload_bytes):
    if not payload_bytes:
        return None, []
    cmd = payload_bytes[0]
    results = []
    i = 1
    while i < len(payload_bytes):
        slen = payload_bytes[i]
        i += 1
        if i + slen > len(payload_bytes):
            break
        s = payload_bytes[i:i+slen].decode('utf-8', errors='replace')
        results.append(s)
        i += slen
    return cmd, results

def run_scan(port, raw=False):
    ser = serial.Serial(port, 115200, timeout=0.2)
    try:
        frame = build_improv_rpc(CMD_GET_WIFI_NETWORKS, b'')
        ser.write(frame); ser.flush()
        print("Sent scan frame:", frame.hex())
        print("Reading responses (up to 8s)...")
        start = time.time()
        networks = []
        while time.time() - start < 8:
            # Read raw bytes and optionally show them
            ser.timeout = 0.2
            rawdata = ser.read(512)
            if raw and rawdata:
                print("RAW:", rawdata.hex())
            # feed parser using its stream reader
            for typ, payload in parse_improv_frames_from_stream(ser, timeout=1.0):
                if typ != TYPE_RPC_RESPONSE:
                    continue
                cmd, items = decode_rpc_payload(payload)
                if cmd == CMD_GET_WIFI_NETWORKS and len(items) == 0:
                    print("Received final empty response (scan complete).")
                    return networks
                if cmd == CMD_GET_WIFI_NETWORKS:
                    if len(items) >= 1:
                        ssid = items[0]
                        rssi = items[1] if len(items) > 1 else ""
                        auth = items[2] if len(items) > 2 else ""
                        print(f"Network: SSID='{ssid}', RSSI={rssi}, Auth={auth}")
                        networks.append((ssid, rssi, auth))
        return networks
    finally:
        ser.close()

def send_wifi_settings(port, ssid, password):
    ser = serial.Serial(port, 115200, timeout=0.2)
    try:
        payload = build_wifi_settings_payload(ssid, password)
        frame = build_improv_rpc(CMD_WIFI_SETTINGS, payload)
        ser.write(frame); ser.flush()
        print("Sent WIFI_SETTINGS frame")
        for typ, payload in parse_improv_frames_from_stream(ser, timeout=3):
            if typ == TYPE_RPC_RESPONSE:
                cmd, items = decode_rpc_payload(payload)
                print("Response:", cmd, items)
    finally:
        ser.close()

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", required=True)
    ap.add_argument("--connect", action="store_true")
    ap.add_argument("--ssid")
    ap.add_argument("--pass", dest="password")
    ap.add_argument("--raw", action="store_true", help="Print raw incoming bytes as hex for debugging")
    args = ap.parse_args()
    nets = run_scan(args.port, raw=args.raw)
    if nets:
        for s,r,a in nets:
            if s.lower() == "faztrick":
                print("Found faztrick ->", s, r, a)
    else:
        print("No networks parsed.")
    if args.connect:
        if not args.ssid:
            print("Missing --ssid for connect")
        else:
            pwd = args.password if args.password else ""
            send_wifi_settings(args.port, args.ssid, pwd)
