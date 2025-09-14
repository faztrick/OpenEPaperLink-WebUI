#!/usr/bin/env node
/*
 * Serial Sidecar Service
 * Provides stable single-process access to the serial port to avoid multi-process
 * Next.js dev duplication issues. Endpoints:
 *  GET  /status
 *  POST /open { path, baudRate }
 *  POST /close
 *  POST /scan { minRssi?, top? }
 *  GET  /wifi/mode          (returns { success, mode, modeName })
 *  POST /wifi/mode { mode } (numeric 0-3 or string)
 *  GET  /log?tail=N | ?since=IDX
 */
import http from 'http';
import { ReadlineParser, SerialPort } from 'serialport';

const PORT = Number(process.env.SIDECAR_PORT || 4001);
const DEFAULT_PATH = process.env.SERIAL_PORT || process.env.DEFAULT_SERIAL_PORT || 'COM5';
const DEFAULT_BAUD = Number(process.env.SERIAL_BAUD || process.env.DEFAULT_SERIAL_BAUD || 115200);

let port = null; // SerialPort
let parser = null; // ReadlineParser
let nextIndex = 0;
let logBuffer = []; // { idx, ts, raw, type }
const maxLog = 1000;
let state = { isOpen: false, portPath: undefined, baudRate: DEFAULT_BAUD, lastOpenTime: undefined, lastActivity: undefined, nextIndex: 0 };

const ACK_PATTERNS = ['ACK>', 'NOK>', 'NOQ>'];
function classifyLine(line) {
  if (!line) return undefined;
  if (ACK_PATTERNS.some(p => line.startsWith(p))) return line.substring(0, 3) === 'ACK' ? 'ACK' : (line.startsWith('NOK') ? 'NOK' : 'NOQ');
  if (line.startsWith('>')) return 'PROMPT';
  if (/wifiscan/.test(line)) return 'CLI_WIFISCAN';
  return undefined;
}

async function openSerial(path = DEFAULT_PATH, baudRate = DEFAULT_BAUD) {
  if (port && port.isOpen) {
    if (state.portPath === path && state.baudRate === baudRate) return state;
    await closeSerial();
  }
  return new Promise((resolve, reject) => {
    try {
      port = new SerialPort({ path, baudRate }, err => { if (err) { port = null; return reject(err); } });
      parser = port.pipe(new ReadlineParser({ delimiter: '\n' }));
      state = { isOpen: true, portPath: path, baudRate, lastOpenTime: Date.now(), lastActivity: Date.now(), nextIndex: nextIndex };
      parser.on('data', line => {
        const ts = new Date().toISOString();
        const clean = line.replace(/\r$/, '');
        const entry = { idx: nextIndex++, ts, raw: clean, type: classifyLine(clean) };
        logBuffer.push(entry);
        if (logBuffer.length > maxLog) logBuffer.splice(0, logBuffer.length - maxLog);
        state.lastActivity = Date.now();
        state.nextIndex = nextIndex;
      });
      port.on('error', err => {
        const ts = new Date().toISOString();
        logBuffer.push({ idx: nextIndex++, ts, raw: `<error> ${err.message}`, type: 'ERROR' });
      });
      port.on('close', () => { state.isOpen = false; });
      setTimeout(() => resolve(state), 120);
    } catch (e) { reject(e); }
  });
}

async function closeSerial() {
  if (!port) return; await new Promise(r => port.close(() => r())); port = null; parser = null; state.isOpen = false; state.portPath = undefined;
}

function getLog(params = {}) {
  const { since, tail } = params;
  if (since !== undefined) return logBuffer.filter(l => l.idx >= Number(since));
  if (tail !== undefined) return logBuffer.slice(-Number(tail));
  return logBuffer.slice();
}

async function execCli(cmd, timeoutMs = 6000) {
  if (!port || !port.isOpen) throw new Error('Port not open');
  const startIdx = nextIndex;
  await writeLine(cmd);
  const startTime = Date.now();
  return await new Promise(resolve => {
    const check = () => {
      const now = Date.now();
      const newLines = getLog({ since: startIdx });
      const gotPrompt = newLines.some(l => l.type === 'PROMPT' && l.idx > startIdx);
      const timeout = now - startTime >= timeoutMs;
      if (gotPrompt || timeout) { resolve({ lines: newLines, elapsedMs: now - startTime, timedOut: timeout && !gotPrompt }); }
      else setTimeout(check, 80);
    }; setTimeout(check, 100);
  });
}

function parseWifiModeLine(lines) {
  for (const l of lines) {
    if (!l.raw.startsWith('{')) continue;
    try {
      const obj = JSON.parse(l.raw);
      if (obj.event === 'wifimode') return obj;
    } catch { }
  }
  return null;
}

async function handleWifiModeGet(req, res) {
  if (!state.isOpen) { try { await openSerial(); } catch (e) { return send(res, 500, { error: 'Cannot open port: ' + e.message }); } }
  try {
    const result = await execCli('wifimode', 4000);
    const obj = parseWifiModeLine(result.lines);
    if (!obj) return send(res, 500, { error: 'No wifimode JSON in output' });
    send(res, 200, { success: !!obj.success, mode: obj.mode, modeName: obj.modeName, changed: obj.changed, prior: obj.prior });
  } catch (e) { send(res, 500, { error: e.message }); }
}

async function handleWifiModePost(req, res, body) {
  if (!state.isOpen) { try { await openSerial(); } catch (e) { return send(res, 500, { error: 'Cannot open port: ' + e.message }); } }
  const { mode } = body || {};
  if (mode === undefined || mode === null || mode === '') return send(res, 400, { error: 'Missing mode' });
  let arg = '' + mode;
  try {
    const result = await execCli('wifimode ' + arg, 5000);
    const obj = parseWifiModeLine(result.lines);
    if (!obj) return send(res, 500, { error: 'No wifimode JSON in output' });
    send(res, 200, { success: !!obj.success, mode: obj.mode, modeName: obj.modeName, changed: obj.changed, prior: obj.prior });
  } catch (e) { send(res, 500, { error: e.message }); }
}

async function write(data) {
  if (!port || !port.isOpen) throw new Error('Port not open');
  return new Promise((resolve, reject) => { port.write(data, err => { if (err) return reject(err); port.drain(() => { state.lastActivity = Date.now(); resolve(); }); }); });
}
async function writeLine(line) { await write(line.endsWith('\n') ? line : line + '\n'); }

function send(res, code, obj) { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); }

async function handleScan(req, res, body) {
  const { minRssi, top } = body || {};
  if (!state.isOpen) { try { await openSerial(); } catch (e) { return send(res, 500, { error: 'Cannot open port: ' + e.message }); } }
  try {
    const result = await execCli('wifiscan', 8000);
    const networks = []; let summaryCount;
    for (const l of result.lines) {
      if (!l.raw.startsWith('{')) continue;
      try { const obj = JSON.parse(l.raw); if (obj.event === 'wifiscan_summary') summaryCount = obj.count; else if (obj.event === 'wifinet') networks.push({ ssid: obj.ssid, rssi: obj.rssi, channel: obj.channel, enc: obj.enc, bssid: obj.bssid }); } catch { }
    }
    let filtered = networks;
    if (typeof minRssi === 'number') filtered = filtered.filter(n => (n.rssi ?? -999) >= minRssi);
    if (typeof top === 'number' && top > 0) filtered = filtered.sort((a, b) => (b.rssi ?? -999) - (a.rssi ?? -999)).slice(0, top);
    send(res, 200, { success: true, count: filtered.length, summaryCount: summaryCount ?? networks.length, networks: filtered, rawLineCount: result.lines.length, timedOut: result.timedOut, elapsedMs: result.elapsedMs, appliedFilters: { minRssi, top }, port: state.portPath });
  } catch (e) { send(res, 500, { error: e.message }); }
}

function parseBody(req) {
  return new Promise(resolve => {
    let data = ''; req.on('data', c => data += c); req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch { resolve({}); } });
  });
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && req.url.startsWith('/status')) return send(res, 200, state);
    if (req.method === 'GET' && req.url.startsWith('/log')) {
      const url = new URL(req.url, 'http://x');
      const since = url.searchParams.get('since');
      const tail = url.searchParams.get('tail');
      return send(res, 200, { lines: getLog({ since, tail }), nextIndex });
    }
    if (req.method === 'POST' && req.url === '/open') {
      const body = await parseBody(req);
      try { await openSerial(body.path || DEFAULT_PATH, body.baudRate || DEFAULT_BAUD); return send(res, 200, state); } catch (e) { return send(res, 500, { error: e.message }); }
    }
    if (req.method === 'POST' && req.url === '/close') { await closeSerial(); return send(res, 200, { closed: true }); }
    if (req.method === 'POST' && req.url === '/scan') { const body = await parseBody(req); return handleScan(req, res, body); }
    if (req.method === 'GET' && req.url === '/wifi/mode') { return handleWifiModeGet(req, res); }
    if (req.method === 'POST' && req.url === '/wifi/mode') { const body = await parseBody(req); return handleWifiModePost(req, res, body); }
    send(res, 404, { error: 'Not found' });
  } catch (e) { send(res, 500, { error: e.message }); }
});

server.listen(PORT, () => {
  console.log('[serial-sidecar] listening on', PORT, 'default port', DEFAULT_PATH, DEFAULT_BAUD);
});
