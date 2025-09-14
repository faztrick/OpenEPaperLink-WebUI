// Shared connection test helper used by device panels.
// Attempts a GET to /api/info via the proxy header path '/api/device/api/info'
// with optional HTTPS fallback and timeout.

export interface ConnectionTestResult {
  ok: boolean;
  elapsedMs: number;
  message: string;
  tried: string[];
}

export async function testDeviceConnection(baseUrl: string, opts?: { timeoutMs?: number }): Promise<ConnectionTestResult> {
  const start = performance.now();
  const tried: string[] = [];
  const timeoutMs = opts?.timeoutMs ?? 5000;
  const controller = new AbortController();
  const to = setTimeout(() => controller.abort(), timeoutMs);
  const testUrl = '/api/device/api/info';

  async function attempt(url: string) {
    tried.push(url);
    const resp = await fetch(testUrl, { headers: { 'x-device-base-url': url }, signal: controller.signal });
    if (!resp.ok) throw new Error(`${resp.status}`);
    await resp.text();
  }

  let msg = '';
  try {
    await attempt(baseUrl);
    const elapsed = Math.round(performance.now() - start);
    clearTimeout(to);
    return { ok: true, elapsedMs: elapsed, message: `Reachable (${elapsed} ms)`, tried };
  } catch (e1: any) {
    // HTTPS fallback if initial was http://
    if (/^http:\/\//i.test(baseUrl)) {
      try {
        await attempt(baseUrl.replace(/^http:\/\//i, 'https://'));
        const elapsed = Math.round(performance.now() - start);
        clearTimeout(to);
        return { ok: true, elapsedMs: elapsed, message: `Reachable via HTTPS fallback (${elapsed} ms)`, tried };
      } catch (e2: any) {
        msg = e2?.message || e1?.message || 'Failed';
      }
    } else {
      msg = e1?.message || 'Failed';
    }
  }
  clearTimeout(to);
  const elapsed = Math.round(performance.now() - start);
  if (controller.signal.aborted && msg === 'Failed') msg = 'Timeout';
  return { ok: false, elapsedMs: elapsed, message: msg, tried };
}
