#!/usr/bin/env node
// Check a serial port via the local web-ui server's /api/com/check
const axios = require('axios');

async function main() {
  const base = process.env.WEBUI_BASE || 'http://localhost:3000';
  const portPath = process.argv[2] || process.env.PORT || 'COM10';
  const baud = Number(process.env.BAUD || 115200);
  const timeout = Number(process.env.TIMEOUT || 1000);

  if (!portPath) {
    console.error('Usage: node serial_check.js <PORT>');
    process.exit(2);
  }

  console.log(`POST ${base}/api/com/check { path: '${portPath}', baudRate: ${baud}, timeout: ${timeout} }`);
  try {
    const resp = await axios.post(`${base}/api/com/check`, { path: portPath, baudRate: baud, timeout }, { timeout: timeout + 3000 });
    console.log(JSON.stringify(resp.data));
  } catch (e) {
    const err = e.response?.data || { success: false, error: e.message };
    console.log(JSON.stringify(err));
    process.exit(1);
  }
}

main();
