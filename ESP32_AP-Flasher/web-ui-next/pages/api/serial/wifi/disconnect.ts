import type { NextApiRequest, NextApiResponse } from 'next';
import { ensureSerialApiEnabled, serialManager } from '../../../../lib/server/serialManager';

// Mirrors connect.ts style: attempts serial-first (or sidecar if configured / requested)
// Sends CLI command to disconnect current Wi-Fi connection. Firmware CLI command assumed: 'wifidisconnect' (fallback alias 'wifioff').
// If firmware lacks command, returns unknown_command.
// Response 200 shape (success): { success:true, event?:object, backendUsed:'serial', openedTemporarily, port, elapsedMs, rawCount }
// Degraded / error shapes mirror connect.ts patterns.

async function proxyToSidecar(req: NextApiRequest, res: NextApiResponse) {
  const base = process.env.SERIAL_SIDECAR_URL;
  if (!base) return null;
  const url = base.replace(/\/$/, '') + '/wifi/disconnect';
  try {
    const r = await fetch(url, { method: 'POST' } as any);
    const data = await r.json();
    return { status: r.status, data };
  } catch (e: any) {
    return { status: 500, data: { error: 'Sidecar proxy error: ' + e.message } };
  }
}

function computeBackend(req: NextApiRequest) {
  const backendParam = (req.query.backend || req.body?.backend || 'auto') as string;
  const wantSidecar = backendParam === 'sidecar';
  const wantSerial = backendParam === 'serial';
  const haveSidecarEnv = !!process.env.SERIAL_SIDECAR_URL;
  const useSidecar = wantSidecar || (!wantSerial && haveSidecarEnv);
  return { backendParam, wantSidecar, wantSerial, haveSidecarEnv, useSidecar };
}

async function ensurePortOpen(desiredPort: string, baud: number) {
  const state = serialManager.getState();
  if (state.isOpen) return { openedTemporarily: false };
  const transientErr = (e: any) => /access denied|busy|cannot open/i.test(e?.message || '');
  for (let attempt = 1; attempt <= 5; attempt++) {
    try { await serialManager.open(desiredPort, baud); return { openedTemporarily: true }; }
    catch (e: any) {
      if (attempt === 5 || !transientErr(e)) {
        return { error: { status: 502, body: { error: 'port_open_failed', message: `Failed to open serial port ${desiredPort}: ${e.message}`, backendUsed: 'serial', attempts: attempt, transient: transientErr(e) } } };
      }
      await new Promise(r => setTimeout(r, 150));
    }
  }
  return { error: { status: 500, body: { error: 'unexpected_port_logic' } } };
}

function parseResult(result: any) {
  const rawLines: string[] = result.lines.map((l: any) => l.raw);
  const eventLine = rawLines.find(l => l.startsWith('{') && l.includes('"event":"wifidisconnect"'));
  let obj: any = null; if (eventLine) { try { obj = JSON.parse(eventLine); } catch { /* ignore */ } }
  return { rawLines, obj };
}

function unknownCommand(rawLines: string[]) {
  return rawLines.some(l => /Unknown command:.*wifi(disconnect|off)/i.test(l));
}

async function execDisconnect() {
  const commands = ['wifidisconnect', 'wifioff'];
  let lastError: any = null; let usedCommand: string | undefined; let result: any = null;
  for (const cmd of commands) {
    try { result = await serialManager.execCli(cmd, 6000); usedCommand = cmd; break; }
    catch (e: any) { lastError = e; }
  }
  return { result, lastError, usedCommand };
}

function buildPort(desired: string | undefined) {
  return desired || process.env.DEFAULT_SERIAL_PORT || process.env.SERIAL_PORT || 'COM5';
}

function resultToResponse(result: any, rawLines: string[], obj: any, usedCommand: string | undefined, openedTemporarily: boolean, desiredPort: string, res: NextApiResponse) {
  if (unknownCommand(rawLines)) {
    return res.status(400).json({ error: 'unknown_command', message: 'Firmware does not support Wi-Fi disconnect CLI', backendUsed: 'serial', openedTemporarily, port: desiredPort, rawCount: rawLines.length, commandTried: usedCommand });
  }
  if (!obj) {
    return res.status(result.timedOut ? 504 : 422).json({ error: 'disconnect_parse_failed', backendUsed: 'serial', timedOut: result.timedOut, openedTemporarily, port: desiredPort, rawCount: rawLines.length, elapsedMs: result.elapsedMs });
  }
  return res.status(200).json({ success: true, ...obj, backendUsed: 'serial', openedTemporarily, port: desiredPort, elapsedMs: result.elapsedMs, rawCount: rawLines.length, commandTried: usedCommand });
}

function methodGuard(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return false; }
  return true;
}

function sidecarAttemptNeeded(backend: ReturnType<typeof computeBackend>) { return backend.useSidecar; }

async function maybeSidecar(req: NextApiRequest, res: NextApiResponse, backend: ReturnType<typeof computeBackend>) {
  if (!sidecarAttemptNeeded(backend)) return false;
  const proxied = await proxyToSidecar(req, res);
  if (proxied) { res.status(proxied.status).json({ ...proxied.data, proxied: true, backendUsed: 'sidecar' }); return true; }
  return false;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!methodGuard(req, res)) return;
  const backend = computeBackend(req);
  if (await maybeSidecar(req, res, backend)) return;
  try { ensureSerialApiEnabled(); } catch (e: any) { res.status(400).json({ error: e.message }); return; }
  const state = serialManager.getState();
  const desiredPort = buildPort((req.body?.port || req.query.port) as string | undefined);
  const baud = Number(process.env.DEFAULT_SERIAL_BAUD || process.env.SERIAL_BAUD || state.baudRate || 115200);
  const portOpen = await ensurePortOpen(desiredPort, baud);
  if ((portOpen as any).error) { const err = (portOpen as any).error; res.status(err.status).json(err.body); return; }
  const openedTemporarily = (portOpen as any).openedTemporarily;
  try {
    const { result, lastError, usedCommand } = await execDisconnect();
    if (!result) { res.status(500).json({ error: 'exec_failed', message: lastError?.message || 'Failed executing disconnect command', backendUsed: 'serial' }); return; }
    const { rawLines, obj } = parseResult(result);
    resultToResponse(result, rawLines, obj, usedCommand, openedTemporarily, desiredPort, res);
  } catch (e: any) {
    const recent = serialManager.getLog({ tail: 25 }).map(l => l.raw);
    res.status(500).json({ error: 'unexpected', message: e.message, backendUsed: 'serial', recentLines: recent });
  } finally {
    if (openedTemporarily) { try { await serialManager.close(); } catch { /* ignore */ } }
  }
}
