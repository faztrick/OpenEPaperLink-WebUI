import { buildApiUrl } from './apiBase';

export interface TailLogsResponse { lines: string[]; count: number; file?: string }
export interface LogConfig { ip: string; port: number; enabled: boolean }

export async function tailLogs(lines = 200): Promise<TailLogsResponse> {
  const url = buildApiUrl(`/api/logs/tail?lines=${encodeURIComponent(String(lines))}`);
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error('log tail failed: ' + r.status);
  return r.json();
}

export async function getLogConfig(): Promise<LogConfig> {
  const r = await fetch(buildApiUrl('/api/log/config'));
  if (!r.ok) throw new Error('get log config failed');
  return r.json();
}

export async function setLogConfig(cfg: LogConfig): Promise<LogConfig> {
  const body = new URLSearchParams();
  body.set('ip', cfg.ip || '');
  body.set('port', String(cfg.port || 0));
  body.set('enabled', cfg.enabled ? '1' : '0');
  const r = await fetch(buildApiUrl('/api/log/config'), { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body.toString() });
  if (!r.ok) throw new Error('set log config failed');
  return r.json();
}

export async function sendTestLog(msg = 'Hello from Next UI'): Promise<boolean> {
  const body = new URLSearchParams();
  body.set('msg', msg);
  const r = await fetch(buildApiUrl('/api/log/test'), { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body.toString() });
  return r.ok;
}

