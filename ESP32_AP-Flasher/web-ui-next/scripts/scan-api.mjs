#!/usr/bin/env node
/**
 * Quick API sweep to locate 5xx responses.
 * Discovers routes by reading the pages/api directory tree.
 */
import fs from 'fs';
import path from 'path';
// Using built-in global fetch (Node 18+)

const ROOT = path.resolve(process.cwd(), 'pages', 'api');
const BASE = process.env.BASE || 'http://localhost:3000';

function listApiFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir)) {
    const full = path.join(dir, entry);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) out.push(...listApiFiles(full));
    else if (/\.(t|j)sx?$/.test(entry)) out.push(full);
  }
  return out;
}

function toRoute(file) {
  let rel = path.relative(ROOT, file).replace(/\\/g, '/');
  rel = rel.replace(/\.(t|j)sx?$/, '');
  if (rel.endsWith('/index')) rel = rel.slice(0, -6);
  // Dynamic catchalls not enumerated; we skip those containing '['
  if (rel.includes('[')) return null;
  return '/api/' + rel;
}

async function main() {
  const files = listApiFiles(ROOT);
  const routes = files.map(toRoute).filter(Boolean).sort();
  const results = [];
  for (const r of routes) {
    const url = BASE + r.replace(/\/api\/api\//, '/api/');
    let status = 0, err = null;
    const started = Date.now();
    try {
      const res = await fetch(url, { method: 'GET', headers: { 'x-scan': '1' }, timeout: 4000 });
      status = res.status;
      if (res.headers.get('content-type')?.includes('json')) {
        await res.text();
      }
    } catch (e) { err = e.message; }
    const dur = Date.now() - started;
    results.push({ route: r, status, ms: dur, err });
  }
  const bad = results.filter(r => r.status >= 500 || r.status === 0);
  for (const r of results) {
    const flag = r.status >= 500 || r.status === 0 ? 'FAIL' : 'OK  ';
    console.log(`${flag} ${r.status.toString().padEnd(3)} ${r.ms.toString().padStart(4)}ms ${r.route}${r.err ? ' :: ' + r.err : ''}`);
  }
  console.log('\nSummary:');
  console.log(' Total routes:', results.length);
  console.log(' Failing (5xx/0):', bad.length);
  if (bad.length) {
    console.log('\nJSON (failing):');
    console.log(JSON.stringify(bad, null, 2));
    process.exitCode = 1;
  }
}
main();
