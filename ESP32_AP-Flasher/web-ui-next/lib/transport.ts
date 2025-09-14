// Unified transport layer with simplified channel preference.
// - Preferred channels: 'auto' | 'http' | 'serial'
// - HTTP primary; in 'auto' we attempt HTTP, fall back to serial only if already open.
// - In 'serial' preference we require an opened serial port (caller triggers openSerial()).
//
// SSR Strategy:
//   During server-side rendering (window === undefined) we return a lightweight HTTP-only stub
//   that implements the same API surface but marks itself with `_serverStub = true`.
//   On the first client-side invocation of `transport()` after hydration, we detect this marker
//   and transparently replace the stub with the full browser implementation (with Web Serial).
//   This keeps imports isomorphic and avoids conditional logic scattered across components.
//
//   If an environment variable sets NEXT_PUBLIC_DEFAULT_TRANSPORT=serial on the server, we coerce
//   it to 'http' for the stub (serial is never meaningful server-side) while preserving the
//   preferred value for client hydration which will upgrade automatically.
//
// Error / Telemetry Fields:
//   lastError, lastErrorAt, lastHttpTimeout reflect recent request failures for UI badges.
//   openingSerial is true while an openSerial() invocation is in flight to block duplicate opens.
//
// NOTE: If future requirements need real server-to-device calls (e.g. SSR data prefetch),
//       consider extending the stub to respect a device base URL header and proxy accordingly.

export type PreferredChannel = 'auto' | 'http' | 'serial';

export interface TransportStatus {
  preferred: PreferredChannel;             // user preference
  effective: 'http' | 'serial' | 'pending'; // last attempted or active channel (for UI display)
  serialSupported: boolean;
  serialOpen: boolean;
  openingSerial: boolean;                  // true while an openSerial request is in-flight
  portInfo?: string;
  error?: string;                          // last serial error
  lastError?: string;                      // last channel (http/serial) error message
  lastErrorAt?: number;                    // epoch ms of last error
  lastHttpTimeout?: boolean;               // true if last http attempt timed out
  serialPending?: boolean;                 // preferred serial but currently falling back to HTTP
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
  // Server-side (SSR / build time) stub: provide minimal HTTP-only implementation
  if (typeof window === 'undefined') {
    let preferred: PreferredChannel = 'http';
    if (process.env.NEXT_PUBLIC_DEFAULT_TRANSPORT) {
      const envPref = process.env.NEXT_PUBLIC_DEFAULT_TRANSPORT as PreferredChannel;
      if (envPref === 'auto' || envPref === 'http' || envPref === 'serial') preferred = envPref === 'serial' ? 'http' : envPref; // force http on server
    }
    const status: TransportStatus = {
      preferred,
      effective: 'http',
      serialSupported: false,
      serialOpen: false,
      openingSerial: false,
    } as TransportStatus;
    const listeners = new Set<(s: TransportStatus) => void>();
    function emit() { const st = { ...status }; listeners.forEach(l => l(st)); }
    function setPreferred(p: PreferredChannel) { if (preferred !== p) { preferred = p; status.preferred = p === 'serial' ? 'http' : p; emit(); } }
    const stub: any = {
      async get<T = any>(path: string, init?: RequestInit) {
        const res = await fetch(path, init);
        if (!res.ok) throw new Error(`GET ${path} -> ${res.status}`);
        return res.json();
      },
      async post<T = any>(path: string, body: any, init?: RequestInit) {
        const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) }, body: JSON.stringify(body), ...init });
        if (!res.ok) throw new Error(`POST ${path} -> ${res.status}`);
        return res.json();
      },
      async openSerial() { throw new Error('Serial not available server-side'); },
      async closeSerial() { /* noop */ },
      getStatus() { return { ...status }; },
      setPreferred,
      subscribe(cb: (s: TransportStatus) => void) { listeners.add(cb); cb({ ...status }); return () => { listeners.delete(cb); }; },
      get preferred() { return preferred; },
      // internal marker so hydration can upgrade to full client transport
      _serverStub: true,
    } as TransportAPI;
    return stub;
  }
  let preferred: PreferredChannel = 'auto';
  // Restore persisted preference (client side only) or env default
  if (typeof window !== 'undefined') {
    try {
      const saved = localStorage.getItem('connPref') as PreferredChannel | null;
      if (saved && (saved === 'auto' || saved === 'http' || saved === 'serial')) preferred = saved;
      else if (process.env.NEXT_PUBLIC_DEFAULT_TRANSPORT) {
        const envPref = process.env.NEXT_PUBLIC_DEFAULT_TRANSPORT as PreferredChannel;
        if (envPref === 'auto' || envPref === 'http' || envPref === 'serial') preferred = envPref;
      }
    } catch { /* ignore */ }
  } else if (process.env.NEXT_PUBLIC_DEFAULT_TRANSPORT) {
    const envPref = process.env.NEXT_PUBLIC_DEFAULT_TRANSPORT as PreferredChannel;
    if (envPref === 'auto' || envPref === 'http' || envPref === 'serial') preferred = envPref;
  }
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
      openingSerial: !!openSerialPromise,
      portInfo: serial.port ? ((serial.port as any).getInfo ? JSON.stringify((serial.port as any).getInfo()) : undefined) : undefined,
      error: serial.error,
      lastError: lastErrorMsg,
      lastErrorAt: lastErrorTime || undefined,
      lastHttpTimeout: lastHttpTimedOut,
      serialPending: preferred === 'serial' && !serial.opened,
    };
  }

  let openSerialPromise: Promise<void> | null = null;
  async function adoptGrantedPort() {
    if (typeof navigator === 'undefined' || !('serial' in navigator)) return false;
    try {
      const ports: any[] = await (navigator as any).serial.getPorts();
      if (ports && ports.length) {
        serial.port = ports[0];
        await serial.port.open({ baudRate: 115200 });
        serial.opened = true;
        serial.error = undefined;
        if (typeof window !== 'undefined') {
          try { localStorage.setItem('serialAutoOpen', '1'); } catch { /* ignore */ }
        }
        return true;
      }
    } catch (e: any) {
      serial.error = e.message;
    }
    return false;
  }
  async function openSerial() {
    if (serial.opened) return;
    if (openSerialPromise) return openSerialPromise; // prevent concurrent opens
    if (typeof navigator === 'undefined' || !('serial' in navigator)) throw new Error('Web Serial API not supported in this browser');
    openSerialPromise = (async () => {
      try {
        // First adopt previously granted port if any (avoids permission prompt)
        if (!(await adoptGrantedPort())) {
          serial.port = await (navigator as any).serial.requestPort();
          await serial.port.open({ baudRate: 115200 });
          if (typeof window !== 'undefined') {
            try { localStorage.setItem('serialAutoOpen', '1'); } catch { /* ignore */ }
          }
        }
        serial.opened = true;
        serial.error = undefined;
      } catch (e: any) {
        serial.error = e.message;
        throw e;
      } finally {
        openSerialPromise = null;
        emit();
      }
    })();
    emit(); // reflect openingSerial state
    return openSerialPromise;
  }

  async function closeSerial() {
    try {
      await serial.reader?.cancel();
      if (serial.port) await serial.port.close();
    } finally {
      serial.port = null;
      serial.reader = null;
      serial.opened = false;
      if (typeof window !== 'undefined') {
        try { localStorage.removeItem('serialAutoOpen'); } catch { /* ignore */ }
      }
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

  const HTTP_TIMEOUT_MS = (() => {
    if (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_TRANSPORT_HTTP_TIMEOUT) {
      const v = parseInt(process.env.NEXT_PUBLIC_TRANSPORT_HTTP_TIMEOUT, 10);
      if (!isNaN(v) && v > 0 && v < 60000) return v;
    }
    return 8000; // default 8s
  })();
  let lastErrorMsg: string | undefined;
  let lastErrorTime: number | null = null;
  let lastHttpTimedOut = false;

  async function fetchWithTimeout(path: string, init?: RequestInit) {
    const controller = new AbortController();
    const to = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);
    try {
      const res = await fetch(path, { ...init, signal: controller.signal });
      return res;
    } finally {
      clearTimeout(to);
    }
  }

  async function get<T = any>(path: string, init?: RequestInit): Promise<T> {
    if (preferred === 'serial') {
      if (serial.opened) {
        lastEffective = 'serial'; emit();
        return serialRequest('GET', path);
      } else {
        // Graceful fallback to HTTP while marking pending
        lastEffective = 'http'; emit();
        // opportunistically try to adopt previously granted port (non-blocking)
        adoptGrantedPort().then(adopted => { if (adopted) emit(); }).catch(() => { });
      }
    }
    lastEffective = 'pending'; emit();
    try {
      const res = await fetchWithTimeout(path, init);
      if (!res.ok) throw new Error(`GET ${path} -> ${res.status}`);
      lastEffective = 'http'; emit();
      lastHttpTimedOut = false;
      return res.json();
    } catch (e: any) {
      const aborted = e?.name === 'AbortError';
      lastHttpTimedOut = aborted;
      lastErrorMsg = e?.message || String(e);
      lastErrorTime = Date.now();
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
      if (serial.opened) {
        lastEffective = 'serial'; emit();
        return serialRequest('POST', path, body);
      } else {
        lastEffective = 'http'; emit();
        adoptGrantedPort().then(adopted => { if (adopted) emit(); }).catch(() => { });
      }
    }
    lastEffective = 'pending'; emit();
    try {
      const res = await fetchWithTimeout(path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) }, body: JSON.stringify(body), ...init });
      if (!res.ok) throw new Error(`POST ${path} -> ${res.status}`);
      lastEffective = 'http'; emit();
      lastHttpTimedOut = false;
      return res.json();
    } catch (e: any) {
      const aborted = e?.name === 'AbortError';
      lastHttpTimedOut = aborted;
      lastErrorMsg = e?.message || String(e);
      lastErrorTime = Date.now();
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
  // Auto-open previously granted port if user prefers serial or stored auto-open flag
  if (typeof navigator !== 'undefined') {
    try {
      if (typeof window !== 'undefined') {
        const autoFlag = (() => { try { return localStorage.getItem('serialAutoOpen'); } catch { return null; } })();
        if (autoFlag === '1' || preferred === 'serial') {
          adoptGrantedPort().finally(() => emit());
        }
      } else if (preferred === 'serial') {
        // On server, skip; client hydration will handle.
      }
    } catch { /* ignore */ }
  }
  // Listen for disconnect events to clear state and optionally attempt re-adopt
  if (typeof navigator !== 'undefined' && 'serial' in navigator) {
    try {
      (navigator as any).serial.addEventListener('disconnect', (event: any) => {
        if (event?.target === serial.port) {
          serial.opened = false;
          serial.port = null;
          serial.reader = null;
          if (typeof window !== 'undefined') {
            try { localStorage.removeItem('serialAutoOpen'); } catch { /* ignore */ }
          }
          emit();
          // attempt re-adopt if preferred is serial or auto-open flag set (port removal may mean unplugged)
        }
      });
    } catch {
      // ignore listener errors
    }
  }
  return { get, post, openSerial, closeSerial, getStatus, setPreferred, subscribe, get preferred() { return preferred; } } as unknown as TransportAPI;
}

// Singleton accessor
let singleton: TransportAPI | null = null;
export function transport(): TransportAPI {
  if (!singleton) singleton = createTransport();
  // On client after hydration: if we still have a server stub, replace with real transport
  if (typeof window !== 'undefined' && (singleton as any)._serverStub) {
    singleton = createTransport();
  }
  return singleton;
}
