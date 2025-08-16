import serial, traceback

try:
    s = serial.Serial('COM13', 115200, timeout=1)
    print('OK: opened COM13')
    s.close()
except Exception as e:
    print('ERR:', type(e).__name__, e)
    traceback.print_exc()
