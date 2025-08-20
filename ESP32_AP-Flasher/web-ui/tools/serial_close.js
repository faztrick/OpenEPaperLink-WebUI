#!/usr/bin/env node
// Close a serial port via the local web-ui server's /api/serial/close
const axios = require('axios');

async function main() {
  const base = process.env.WEBUI_BASE || 'http://localhost:3000';
  const portPath = process.argv[2] || process.env.PORT || 'COM10';
  if (!portPath) {
    console.error('Usage: node serial_close.js <PORT>');
    process.exit(2);
  }
  console.log(`POST ${base}/api/serial/close { path: '${portPath}' }`);
  try {
    const resp = await axios.post(`${base}/api/serial/close`, { path: portPath }, { timeout: 5000 });
    console.log(JSON.stringify(resp.data));
  } catch (e) {
    const err = e.response?.data || { success: false, error: e.message };
    console.log(JSON.stringify(err));
    process.exit(1);
  }
}

main();
