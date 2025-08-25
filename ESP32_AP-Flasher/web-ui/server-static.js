#!/usr/bin/env node
// Ultra-minimal static web server for OpenEPaperLink Web UI
// Purpose: serve the built/static UI assets so the browser can talk directly
// to the ESP32 device's HTTP APIs implemented in firmware (main.cpp). This
// file intentionally omits all legacy development/host APIs.
//
// Usage:
//   node server-static.js            # uses PORT env or 3000
//   PORT=8080 node server-static.js  # specify port (PowerShell: $Env:PORT=8080)
//   node server-static.js --port 9000
//
// Endpoints:
//   /           -> index.html (from detected static root)
//   /api/ping   -> { ok:true, staticOnly:true, ts }
// Any other /api/* path returns 404 so the frontend knows to use device API.
//
// Static roots detection order:
//   1. web-ui/public/device (new layout)
//   2. ../wwwroot (legacy)
//
// If neither exists, the server starts and reports a warning; / will 404.

const express = require('express');
const path = require('path');
const fs = require('fs');

function resolvePort(argv){
  let port = parseInt(process.env.PORT||process.env.WEBUI_PORT||'3000',10);
  if (isNaN(port) || port<=0) port = 3000;
  for (let i=2;i<argv.length;i++){
    const a = argv[i];
    if (a==='--port' || a==='-p') { const v=argv[++i]; const p=parseInt(v,10); if(!isNaN(p)&&p>0) port=p; }
    else if (a.startsWith('--port=')) { const v=a.split('=')[1]; const p=parseInt(v,10); if(!isNaN(p)&&p>0) port=p; }
  }
  return port;
}

const app = express();

// Basic security headers (lightweight)
app.use((req,res,next)=>{
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('X-Frame-Options','SAMEORIGIN');
  res.setHeader('Referrer-Policy','no-referrer');
  next();
});

const newRoot = path.join(__dirname, 'web-ui','public','device');
const legacyRoot = path.join(__dirname, '..','wwwroot');
let root = null;
if (fs.existsSync(newRoot)) { root = newRoot; console.log('[static] Serving UI from', newRoot); }
else if (fs.existsSync(legacyRoot)) { root = legacyRoot; console.log('[static] Serving legacy UI from', legacyRoot); }
else { console.warn('[static] No static root found (expected web-ui/public/device or ../wwwroot)'); }

if (root) {
  app.use(express.static(root));
}

app.get('/api/ping', (req,res)=>{
  res.json({ ok:true, staticOnly:true, ts: Date.now() });
});

app.use('/api', (req,res)=>{
  res.status(404).json({ success:false, error:'No local API. Talk directly to device.', staticOnly:true });
});

// Fallback: always return index.html for non-API routes (SPA style)
if (root) {
  app.get('*', (req,res)=>{
    if (req.path.startsWith('/api/')) return res.status(404).end();
    res.sendFile(path.join(root,'index.html'));
  });
}

const port = resolvePort(process.argv);
app.listen(port, ()=>{
  console.log(`[static] OpenEPaperLink UI available at http://localhost:${port}`);
});
