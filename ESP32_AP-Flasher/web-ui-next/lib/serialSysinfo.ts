// Utility to obtain sysinfo from a device via serial CLI or HTTP fallback.
// Strategy:
// 1. Attempt serial CLI command 'sysinfo' using /api/serial/cli/exec (requires serial API enabled & open port).
// 2. Parse lines for JSON object or key=value pairs.
// 3. If serial not available or fails, optional HTTP fetch (if baseUrl provided) from `${baseUrl}/sysinfo` then `${baseUrl}/sysinfo.json`.
// 4. Return a normalized subset used for auto-adding a device (id, name, baseUrl).

interface RawSysinfo {
  id?: string;
  deviceId?: string;
  name?: string;
  hostname?: string;
  chipModel?: string;
  buildversion?: string;
  filesystemversion?: string;
  mac?: string;
  macAddress?: string;
  ip?: string;
  apIp?: string;
  wifiIp?: string;
}

// Classified error codes for auto-add flow so UI can present actionable guidance.
// Keep order stable; append new codes rather than renaming to maintain backward compatibility with cached results.
export type AutoAddErrorCode =
  | 'no-port'        // serial backend reports no open port
  | 'timeout'        // command timeout
  | 'parse'          // unable to parse sysinfo output
  | 'unreachable'    // HTTP sysinfo endpoints unreachable
  | 'network'        // generic network/fetch issue
  | 'cli-failed'     // non-200 from CLI exec endpoint
  | 'unknown';       // fallback when classification not possible

export interface AutoAddResult {
  success: boolean;
  sysinfo?: RawSysinfo;
  source: 'serial' | 'http' | 'none';
  error?: string;
  errorCode?: AutoAddErrorCode; // classified machine-friendly error (present only when success=false)
}

// Heuristic parse for key=value lines or JSON blob in CLI output.
function parseCliLines(lines: string[]): RawSysinfo | undefined {
  if (!lines || !lines.length) return undefined;
  // Try JSON first (merge any lines that look like '{' ... '}')
  const joined = lines.join('\n');
  const jsonMatch = joined.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const obj = JSON.parse(jsonMatch[0]);
      return obj;
    } catch { /* ignore */ }
  }
  const acc: Record<string, string> = {};
  for (const l of lines) {
    const m = l.match(/^(\w[\w_-]*)\s*[:=]\s*(.+)$/);
    if (m) acc[m[1]] = m[2];
  }
  if (Object.keys(acc).length) return acc as any;
  return undefined;
}

export async function fetchSerialSysinfo(timeoutMs = 1800): Promise<AutoAddResult> {
  try {
    const r = await fetch('/api/serial/cli/exec', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ command: 'sysinfo', timeoutMs }) });
    if (!r.ok) return { success: false, source: 'serial', error: 'CLI exec failed ' + r.status, errorCode: 'cli-failed' };
    const json = await r.json();
    if (json && json.error) {
      const lowered = String(json.error).toLowerCase();
      if (lowered.includes('no open port')) {
        return { success: false, source: 'serial', error: json.error, errorCode: 'no-port' };
      }
      if (lowered.includes('timeout')) {
        return { success: false, source: 'serial', error: json.error, errorCode: 'timeout' };
      }
    }
    const lines: string[] = (json.lines || []).map((l: any) => l.raw || '').filter(Boolean);
    const parsed = parseCliLines(lines);
    if (!parsed) return { success: false, source: 'serial', error: 'Unable to parse sysinfo output', errorCode: 'parse' };
    return { success: true, source: 'serial', sysinfo: parsed };
  } catch (e: any) {
    const msg = e.message || String(e);
    const lowered = msg.toLowerCase();
    let errorCode: AutoAddErrorCode = 'unknown';
    if (lowered.includes('timeout')) errorCode = 'timeout';
    else if (lowered.includes('network') || lowered.includes('fetch')) errorCode = 'network';
    return { success: false, source: 'serial', error: msg, errorCode };
  }
}

export async function fetchHttpSysinfo(baseUrl: string): Promise<AutoAddResult> {
  const tryPaths = ['/sysinfo', '/sysinfo.json'];
  for (const p of tryPaths) {
    try {
      const r = await fetch(baseUrl.replace(/\/$/, '') + p);
      if (!r.ok) continue;
      const j = await r.json();
      return { success: true, source: 'http', sysinfo: j };
    } catch { /* try next */ }
  }
  return { success: false, source: 'http', error: 'HTTP sysinfo not reachable', errorCode: 'unreachable' };
}

export function deriveDeviceIdentity(info?: RawSysinfo, fallbackBaseUrl?: string) {
  if (!info) return null;
  const id = info.id || info.deviceId || info.hostname || (info.macAddress || info.mac || '').replace(/[:\-]/g, '').toLowerCase() || undefined;
  const baseCandidate = fallbackBaseUrl || (info.ip ? `http://${info.ip}` : (info.apIp ? `http://${info.apIp}` : (info.wifiIp ? `http://${info.wifiIp}` : undefined)));
  if (!id || !baseCandidate) return null;
  return { id, name: info.hostname || info.name || id, baseUrl: baseCandidate.replace(/\/$/, '') };
}
