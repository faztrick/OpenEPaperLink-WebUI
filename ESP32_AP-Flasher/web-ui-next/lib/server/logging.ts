import { EventEmitter } from 'events';

export interface LogLine { ts: string; message: string; raw: string; }

interface ConsoleMirrorState { enabled: boolean; channels: string[] | null; }

class LoggingManager {
  private logs = new Map<string, LogLine[]>();
  private maxLines = 5000;
  private emitter = new EventEmitter();
  private mirrorState: ConsoleMirrorState = { enabled: false, channels: null };

  list() { return Array.from(this.logs.keys()).sort(); }
  tail(name: string, lines = 500): string {
    const arr = this.logs.get(name) || [];
    return arr.slice(-lines).map(l => l.raw).join('\n');
  }
  append(name: string, message: string) {
    if (!name) name = 'default';
    const ts = new Date().toISOString();
    const raw = `[${ts}] ${message}`;
    const line: LogLine = { ts, message, raw };
    let arr = this.logs.get(name);
    if (!arr) { arr = []; this.logs.set(name, arr); }
    arr.push(line);
    if (arr.length > this.maxLines) arr.splice(0, arr.length - this.maxLines);
    this.emitter.emit(name, line.raw);
    if (this.mirrorState.enabled) {
      const ch = this.mirrorState.channels;
      if (!ch || ch.includes(name)) {
        // basic console mirror
        // eslint-disable-next-line no-console
        console.log(`[mirror:${name}] ${message}`);
      }
    }
  }
  stream(name: string, listener: (raw: string) => void) {
    this.emitter.on(name, listener);
    return () => this.emitter.removeListener(name, listener);
  }
  getConsoleMirrorState() { return { ...this.mirrorState }; }
  setConsoleMirror(enabled: boolean, channels?: string[] | null) {
    if (channels === undefined) channels = this.mirrorState.channels;
    this.mirrorState = { enabled, channels: channels || null };
    return this.getConsoleMirrorState();
  }
}

export const loggingManager = new LoggingManager();

// Convenience helpers matching legacy names
export const appendLog = (name: string, message: string) => loggingManager.append(name, message);
export const tailLines = (name: string, lines?: number) => loggingManager.tail(name, lines);
export const getConsoleMirrorState = () => loggingManager.getConsoleMirrorState();
export const setConsoleMirror = (enabled: boolean, channels?: string[] | null) => loggingManager.setConsoleMirror(enabled, channels);
