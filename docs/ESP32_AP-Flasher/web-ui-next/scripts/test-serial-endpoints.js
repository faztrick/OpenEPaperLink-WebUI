#!/usr/bin/env node
/*
 Automated smoke test for serial API endpoints.
 Steps:
 1. GET /api/health
 2. GET /api/serial/ports
 3. POST /api/serial/open (first port) if any
 4. POST /api/serial/cli with a harmless command (e.g., 'help' or 'ver') and capture output (timeout 1200ms)
 5. GET /api/serial/log?tail=20
 6. POST /api/serial/close
 Exits 0 if endpoints respond syntactically OK (even if open fails due to no hardware). Exits 1 on hard HTTP/logic failures.
*/
const base = process.env.TEST_BASE || 'http://localhost:3000';
// Ensure fetch available (Node 18+ global). If not, attempt dynamic import of undici.
if (typeof fetch === 'undefined') {
  import('node:undici').then(m=>{ global.fetch = m.fetch; }).catch(()=>{
    console.error('No fetch available'); process.exit(2);
  });
}
async function j(method, path, body){
  const res = await fetch(base+path, {method, headers:{'Content-Type':'application/json'}, body: body?JSON.stringify(body):undefined});
  let data, text;
  try { data = await res.json(); } catch { text = await res.text(); }
  return { status:res.status, ok:res.ok, data, text };
}
function logStep(title){ console.log(`\n=== ${title} ===`); }

(async ()=>{
  // tiny delay if we had to polyfill
  if(typeof fetch === 'undefined') await new Promise(r=>setTimeout(r,50));
  let failures = 0;
  logStep('Health');
  let r = await j('GET','/api/health');
  console.log(r.status, r.data||r.text);
  if(!r.ok) failures++;

  logStep('List Ports');
  r = await j('GET','/api/serial/ports');
  console.log(r.status, r.data||r.text);
  if(!r.ok) failures++;
  const ports = Array.isArray(r.data?.ports)? r.data.ports: [];
  let chosen = ports[0];

  let opened = false;
  if(chosen){
    logStep('Open First Port');
    r = await j('POST','/api/serial/open', { path: chosen.path || chosen.comName, baudRate: 115200 });
    console.log(r.status, r.data||r.text);
    if(r.ok && r.data?.opened) opened = true; else console.warn('Open failed (non-fatal for smoke test).');
  } else {
    console.warn('No serial ports detected; skipping open/cli.');
  }

  if(opened){
    logStep('CLI Exec (help)');
    r = await j('POST','/api/serial/cli', { command:'help', timeoutMs:1200, capture:true });
    console.log(r.status, r.data||r.text);
    if(!r.ok) failures++;
  }

  logStep('Tail Log');
  r = await j('GET','/api/serial/log?tail=20');
  console.log(r.status, r.data||r.text);
  if(!r.ok) failures++;

  if(opened){
    logStep('Close Port');
    r = await j('POST','/api/serial/close', {});
    console.log(r.status, r.data||r.text);
    if(!r.ok) failures++;
  }

  console.log(`\nResult: ${failures? 'FAIL':'PASS'}`);
  process.exit(failures?1:0);
})();
