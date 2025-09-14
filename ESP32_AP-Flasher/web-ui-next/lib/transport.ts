// Unified transport layer with simplified channel preference.
// Backward compatibility removed: a single API with automatic fallback.
// HTTP is primary; if preferredChannel = 'serial' we force serial; if 'auto' we try HTTP then serial when open.

export type PreferredChannel = 'auto' | 'http' | 'serial';

export interface TransportStatus {
  preferred: PreferredChannel;           // user preference
  effective: 'http' | 'serial' | 'pending'; // last attempted or active channel (for UI display)
  serialSupported: boolean;
  serialOpen: boolean;
  portInfo?: string;
  error?: string;
}

export interface TransportAPI {
  get<T = any>(path: string, init?: RequestInit): Promise<T>;
  post<T = any>(path: string, body: any, init?: RequestInit): Promise<T>;
  openSerial(): Promise<void>;
  closeSerial(): Promise<void>;
  getStatus(): TransportStatus;
  setPreferred(channel: PreferredChannel): void;
  subscribe(cb: (s: TransportStatus) => void): () => void;
  get preferred(): PreferredChannel;
}

// Lazy serial port reference
interface SerialContext {
  port: any | null; // Using any to avoid DOM lib dependency if Serial not present
  reader: ReadableStreamDefaultReader<Uint8Array> | null;
  opened: boolean;
  error?: string;
}

// Simple line-oriented command protocol placeholder.
// Commands sent as: GET /endpoint\n or POST /endpoint\n{json}\n
function encodeLine(s: string) {
  return new TextEncoder().encode(s + '\n');
}

async function readAllAvailable(port: any): Promise<string> {
  const decoder = new TextDecoder();
  const reader = port.readable!.getReader();
  let text = '';
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (value) text += decoder.decode(value, { stream: true });
      if (text.endsWith('\nEND\n')) break; // crude termination token possibility
    }
  } catch (e) {
    // ignore
  } finally {
    reader.releaseLock();
  }
  return text;
}

function parseResponse(raw: string): any {
  // Expect JSON in body; allow noise before first '{'
  const idx = raw.indexOf('{');
  if (idx >= 0) {
    try { return JSON.parse(raw.slice(idx)); } catch { }
  }
  throw new Error('Invalid serial response');
}

export function createTransport(): TransportAPI {
  let preferred: PreferredChannel = 'auto';
  let lastEffective: 'http' | 'serial' | 'pending' = 'http';
  const listeners = new Set<(s: TransportStatus) => void>();
  const serial: SerialContext = { port: null, reader: null, opened: false };

  function emit() {
    const st = getStatus();
    listeners.forEach(l => l(st));
  }

  function getStatus(): TransportStatus {
    return {
      preferred,
      effective: lastEffective,
      serialSupported: typeof navigator !== 'undefined' && !!(navigator as any).serial,
      serialOpen: serial.opened,
      portInfo: serial.port ? ((serial.port as any).getInfo ? JSON.stringify((serial.port as any).getInfo()) : undefined) : undefined,
      error: serial.error,
    };
  }

  async function openSerial() {
    if (serial.opened) return;
    if (!('serial' in navigator)) throw new Error('Web Serial API not supported in this browser');
    try {
      serial.port = await (navigator as any).serial.requestPort();
      await serial.port.open({ baudRate: 115200 });
      serial.opened = true;
      serial.error = undefined;
    } catch (e: any) {
      serial.error = e.message;
      throw e;
    } finally {
      emit();
    }
  }

  async function closeSerial() {
    try {
      await serial.reader?.cancel();
      if (serial.port) await serial.port.close();
    } finally {
      serial.port = null;
      serial.reader = null;
      serial.opened = false;
      emit();
    }
  }

  async function serialRequest<T>(method: 'GET' | 'POST', path: string, body?: any): Promise<T> {
    if (!serial.opened || !serial.port || !serial.port.writable) throw new Error('Serial not open');
    const writer = serial.port.writable.getWriter();
    try {
      await writer.write(encodeLine(method + ' ' + path));
      if (method === 'POST') {
        await writer.write(encodeLine(JSON.stringify(body || {})));
      }
      // optional terminator
      await writer.write(encodeLine('END')); // signal end of request
    } finally {
      writer.releaseLock();
    }
    const raw = await readAllAvailable(serial.port);
    return parseResponse(raw) as T;
  }

  async function get<T = any>(path: string, init?: RequestInit): Promise<T> {
    // Decide channel
    if (preferred === 'serial') {
      if (!serial.opened) throw new Error('Serial not open');
      lastEffective = 'serial'; emit();
      return serialRequest('GET', path);
    }
    // auto/http path
    lastEffective = 'pending'; emit();
    try {
      const res = await fetch(path, init);
      if (!res.ok) throw new Error(`GET ${path} -> ${res.status}`);
      lastEffective = 'http'; emit();
      return res.json();
    } catch (e: any) {
      if (preferred === 'auto' && serial.opened) {
        try {
          lastEffective = 'serial'; emit();
          return await serialRequest('GET', path);
        } catch {
          lastEffective = 'http'; emit();
        }
      }
      lastEffective = 'http'; emit();
      throw e;
    }
  }

  async function post<T = any>(path: string, body: any, init?: RequestInit): Promise<T> {
    if (preferred === 'serial') {
      if (!serial.opened) throw new Error('Serial not open');
      lastEffective = 'serial'; emit();
      return serialRequest('POST', path, body);
    }
    lastEffective = 'pending'; emit();
    try {
      const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) }, body: JSON.stringify(body), ...init });
      if (!res.ok) throw new Error(`POST ${path} -> ${res.status}`);
      lastEffective = 'http'; emit();
      return res.json();
    } catch (e: any) {
      if (preferred === 'auto' && serial.opened) {
        try {
          lastEffective = 'serial'; emit();
          return await serialRequest('POST', path, body);
        } catch {
          lastEffective = 'http'; emit();
        }
      }
      lastEffective = 'http'; emit();
      throw e;
    }
  }

  function setPreferred(p: PreferredChannel) {
    if (preferred === p) return;
    preferred = p;
    emit();
  }

  function subscribe(cb: (s: TransportStatus) => void) {
    listeners.add(cb);
    cb(getStatus());
    return () => { listeners.delete(cb); };
  }
  return { get, post, openSerial, closeSerial, getStatus, setPreferred, subscribe, get preferred() { return preferred; } } as unknown as TransportAPI;
}

// Singleton accessor
let singleton: TransportAPI | null = null;
export function transport(): TransportAPI {
  if (!singleton) singleton = createTransport();
  return singleton;
}
