#!/usr/bin/env node
/*
Open multiple serial ports via the local web-ui server and run a quick health check.
Defaults: COM10, COM13, COM6, COM8 @ 115200 baud.
*/
const axios = require('axios');

async function main(){
  const base = process.env.WEBUI_BASE || 'http://localhost:3000';
  const baud = Number(process.env.BAUD || 115200);
  const ports = (process.env.PORTS || 'COM10,COM13,COM6,COM8')
    .split(',').map(s => s.trim()).filter(Boolean);

  console.log(`Target server: ${base}`);
  console.log(`Ports: ${ports.join(', ')} @ ${baud}`);

  for (const p of ports){
    try {
      const resp = await axios.post(`${base}/api/serial/open`, { path: p, baudRate: baud }, { timeout: 8000 });
      console.log(`${p} open =>`, resp.data);
    } catch (e){
      console.log(`${p} open ERROR =>`, e.response?.data || e.message);
    }
  }

  // quick health check
  for (const p of ports){
    try {
      const resp = await axios.post(`${base}/api/com/check`, { path: p, baudRate: baud, testCmd: '\n', timeout: 1000 }, { timeout: 8000 });
      console.log(`${p} check =>`, resp.data);
    } catch (e){
      console.log(`${p} check ERROR =>`, e.response?.data || e.message);
    }
  }
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
