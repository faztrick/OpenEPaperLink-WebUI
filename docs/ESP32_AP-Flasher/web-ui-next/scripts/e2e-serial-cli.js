#!/usr/bin/env node
/*
 E2E Serial CLI test (focused on COM10)
 Steps:
 1. Ensure server health.
 2. Open COM10 at 115200.
 3. Execute 'help' via /api/serial/cli with capture.
 4. Fetch incremental log since 0.
 5. Close port.
 Fails (exit 1) if any required HTTP call fails or open/exec returns error.
*/
const base = process.env.TEST_BASE || 'http://localhost:3000';
const PORT = process.env.TEST_SERIAL_PORT || 'COM10';
async function req(method, path, body){
  const res = await fetch(base+path, {method, headers:{'Content-Type':'application/json'}, body: body?JSON.stringify(body):undefined});
  let data, text; try { data = await res.json(); } catch { text = await res.text(); }
  return {res, data, text};
}
function fail(msg){ console.error('FAIL:', msg); process.exit(1); }
async function main(){
  console.log('Health...');
  let {res,data,text} = await req('GET','/api/health');
  if(!res.ok) fail('health '+res.status+' '+(text||JSON.stringify(data)));
  console.log(data);

  console.log('Open '+PORT+'...');
  ({res,data,text} = await req('POST','/api/serial/open',{ path: PORT, baudRate:115200 }));
  if(!res.ok || !(data?.opened || data?.isOpen)) { console.error('Open response', res.status, data||text); fail('open failed'); }
  console.log('Opened');

  console.log('CLI help...');
  ({res,data,text} = await req('POST','/api/serial/cli',{ command:'help', capture:true, timeoutMs:1500 }));
  if(!res.ok) fail('cli exec failed '+res.status+' '+(text||JSON.stringify(data)));
  console.log('Exec result keys:', Object.keys(data||{}));
  if(Array.isArray(data?.lines)){
    console.log('Lines returned:', data.lines.length);
    const sample = data.lines.slice(0,5).map(l=>l.text).join('\n');
    console.log('Sample:\n'+sample);
  }

  console.log('Fetch log since 0...');
  ({res,data,text} = await req('GET','/api/serial/log?since=0'));
  if(!res.ok) fail('log fetch failed');
  console.log('Log lines:', data.lines?.length, 'nextIndex:', data.nextIndex);

  console.log('Close...');
  ({res,data,text} = await req('POST','/api/serial/close',{}));
  if(!res.ok) fail('close failed');
  console.log('Closed');

  console.log('E2E PASS');
}
main().catch(e=>{ console.error(e); process.exit(1); });
