// Port resolution utility extracted from server.js
// Precedence: CLI args (--port / -p / --port=), WEBUI_PORT, PORT, default 3000
function resolvePort(argv = process.argv, env = process.env){
  const DEFAULT_PORT = 3000;
  let port = DEFAULT_PORT;
  if (env.WEBUI_PORT) { const p = parseInt(env.WEBUI_PORT, 10); if (!isNaN(p) && p>0) port = p; }
  else if (env.PORT) { const p = parseInt(env.PORT, 10); if (!isNaN(p) && p>0) port = p; }
  for (let i=2;i<argv.length;i++) {
    const a = argv[i];
    if (a === '--port' || a === '-p') { const v = argv[i+1]; if (v) { const p = parseInt(v,10); if(!isNaN(p)&&p>0) port=p; i++; continue; } }
    else if (a.startsWith('--port=')) { const v = a.split('=')[1]; const p = parseInt(v,10); if(!isNaN(p)&&p>0) port=p; }
  }
  return port;
}
module.exports = { resolvePort };
