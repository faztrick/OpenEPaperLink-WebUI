// Centralized Serial Manager for Web UI / API
// Encapsulates all serialport interactions so the rest of the server only
// talks to this abstraction. Provides:
//  - listPorts()
//  - open(path, baudRate)
//  - close()
//  - write(data)
//  - getStatus()
// Emits events: 'open', 'close', 'data', 'error', 'status'
// Safe when serialport dependency is missing (graceful no-op behavior).

const { EventEmitter } = require('events');
const os = require('os');
const { spawn } = require('child_process');

let SerialPortLib = null;
let serialAvailable = false;
try {
    const sp = require('serialport');
    SerialPortLib = sp.SerialPort || sp; // v10+ exposes { SerialPort }
    serialAvailable = typeof SerialPortLib === 'function';
} catch (e) {
    serialAvailable = false;
}

class SerialManager extends EventEmitter {
    constructor(options = {}) {
        super();
        this._port = null;           // SerialPort instance
        this._path = null;           // Open path
        this._baud = null;           // Open baud rate
        this._manualComOnly = !!options.manualComOnly;
        this._allowedComPort = options.allowedComPort || null;
        this._autoCloseOnError = options.autoCloseOnError !== false; // default true
        // Maximum time (ms) to wait for underlying serialport 'open' event before rejecting
        this._openTimeoutMs = typeof options.openTimeout === 'number' ? options.openTimeout : 4000;
        this._serialAvailable = serialAvailable;
        this._lastError = null;
        this._dataBytes = 0;
    }

    updateConfig(cfg = {}) {
        if (typeof cfg.manualComOnly === 'boolean') this._manualComOnly = cfg.manualComOnly;
        if (cfg.allowedComPort) this._allowedComPort = cfg.allowedComPort;
        // If manual mode narrows the allowed port and a different port is open, close it
        if (this._manualComOnly && this._allowedComPort && this._path && this._path.toUpperCase() !== String(this._allowedComPort).toUpperCase()) {
            this.close();
        }
        this._emitStatus();
    }

    isAvailable() { return this._serialAvailable; }

    async listPorts() {
        if (!this._serialAvailable) return [];
        try {
            const ports = await SerialPortLib.list();
            let out = ports.map(p => ({ path: p.path || p.comName || p.vendorId || '', manufacturer: p.manufacturer || p.friendlyName || '' }));
            if (this._manualComOnly && this._allowedComPort) {
                const allowed = String(this._allowedComPort).toUpperCase();
                const filtered = out.filter(p => (p.path || '').toUpperCase() === allowed);
                out = filtered.length ? filtered : [{ path: allowed, manufacturer: 'Manual' }];
            }
            return out;
        } catch (e) {
            return this._fallbackPorts();
        }
    }

    _fallbackPorts() {
        let ports;
        if (os.platform() === 'win32') {
            ports = ['COM1', 'COM3', 'COM10', 'COM13'];
        } else {
            ports = ['/dev/ttyUSB0', '/dev/ttyUSB1', '/dev/ttyACM0'];
        }
        if (this._manualComOnly && this._allowedComPort) {
            const allowed = String(this._allowedComPort).toUpperCase();
            return [{ path: allowed, manufacturer: 'Manual' }];
        }
        return ports.map(p => ({ path: p, manufacturer: 'Fallback' }));
    }

    async open(path, baudRate = 115200) {
        if (!this._serialAvailable) throw new Error('serialport module not available');
        if (!path) throw new Error('path required');
        if (this._manualComOnly && this._allowedComPort && String(path).toUpperCase() !== String(this._allowedComPort).toUpperCase()) {
            throw new Error(`Manual COM mode active. Only ${this._allowedComPort} allowed.`);
        }
        if (this._port && this._path === path) {
            return { alreadyOpen: true, path: this._path, baudRate: this._baud };
        }
        // Close any existing port first
        if (this._port) await this.close();

        return new Promise((resolve, reject) => {
            try {
                const port = new SerialPortLib({ path, baudRate: parseInt(baudRate, 10) });
                this._port = port;
                this._path = path;
                this._baud = parseInt(baudRate, 10);
                this._dataBytes = 0;
                this._lastError = null;

                let opened = false;
                let settled = false; // track whether promise resolved/rejected
                const timeoutMs = this._openTimeoutMs > 0 ? this._openTimeoutMs : 4000;
                const timer = setTimeout(() => {
                    if (settled || opened) return;
                    settled = true;
                    // Proactively destroy port to free fd
                    try { port.close(() => {}); } catch (_) {}
                    this._port = null; this._path = null; this._baud = null;
                    reject(new Error(`serial open timeout after ${timeoutMs}ms for ${path}`));
                }, timeoutMs);

                port.on('open', () => {
                    opened = true;
                    if (settled) return; // already rejected (race)
                    settled = true;
                    clearTimeout(timer);
                    this.emit('open', { path: this._path, baudRate: this._baud });
                    this._emitStatus();
                    resolve({ success: true, path: this._path, baudRate: this._baud });
                });

                port.on('data', (buf) => {
                    if (!buf) return;
                    this._dataBytes += buf.length;
                    const text = buf.toString();
                    this.emit('data', { path: this._path, data: buf, text, bytes: buf.length, totalBytes: this._dataBytes });
                });

                port.on('error', (err) => {
                    this._lastError = err;
                    // If error occurs before 'open', reject so API caller gets immediate feedback
                    if (!opened && !settled) {
                        settled = true;
                        clearTimeout(timer);
                        // ensure internal state cleaned
                        try { port.close(() => {}); } catch (_) {}
                        this._port = null; this._path = null; this._baud = null;
                        return reject(err);
                    }
                    this.emit('error', { path: this._path, error: err.message || String(err) });
                    if (this._autoCloseOnError) {
                        try { this.close(); } catch (_) { /* ignore */ }
                    } else {
                        this._emitStatus();
                    }
                });

                port.on('close', () => {
                    const prevPath = this._path;
                    this._port = null;
                    this._path = null;
                    this._baud = null;
                    this.emit('close', { path: prevPath });
                    this._emitStatus();
                });
            } catch (err) {
                this._port = null;
                this._path = null;
                this._baud = null;
                reject(err);
            }
        });
    }

    async close() {
        if (!this._port) return { success: true, alreadyClosed: true };
        return new Promise((resolve) => {
            try {
                this._port.close(() => {
                    // 'close' event handler will clean state
                    resolve({ success: true });
                });
            } catch (e) {
                resolve({ success: false, error: e.message || String(e) });
            }
        });
    }

    async write(data) {
        if (!this._port) throw new Error('no port open');
        if (data === undefined || data === null) throw new Error('data required');
        return new Promise((resolve, reject) => {
            try {
                this._port.write(data, (err) => err ? reject(err) : resolve({ success: true }));
            } catch (e) {
                reject(e);
            }
        });
    }

    getStatus() {
        return {
            available: this._serialAvailable,
            open: !!this._port,
            path: this._path,
            baudRate: this._baud,
            manualComOnly: this._manualComOnly,
            allowedComPort: this._allowedComPort,
            lastError: this._lastError ? (this._lastError.message || String(this._lastError)) : null,
            totalBytes: this._dataBytes
        };
    }

    _emitStatus() { this.emit('status', this.getStatus()); }
}

module.exports = SerialManager;
