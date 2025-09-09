// Simple smoke test for health & serial endpoints.
// Assumes dev server with ENABLE_SERIAL_API=1 is running (e.g. pm2 webui-dev) on localhost:3000.

const base = process.env.SMOKE_BASE || 'http://localhost:3000';

async function check(path){
  const url = base + path;
  const t0 = Date.now();
  const r = await fetch(url);
  const ms = Date.now()-t0;
  let body = null;
  try { body = await r.json(); } catch { body = await r.text(); }
  return { url, status: r.status, ms, body };
}

(async () => {
  const results = [];
  try {
    results.push(await check('/api/health'));
    results.push(await check('/api/serial/ports'));
    // status endpoint may fail if no port open; treat network ok as success
    results.push(await check('/api/serial/status'));
  } catch (e){
    console.error('Smoke test error', e);
    process.exitCode = 1;
  }
  const summary = results.map(r=> `${r.url} -> ${r.status} (${r.ms}ms)`).join('\n');
  console.log('--- Smoke Results ---');
  console.log(summary);
  const failures = results.filter(r=> r.status >= 500 || r.status === 404);
  if (failures.length){
    console.error('Failures detected:', failures.map(f=>f.url).join(', '));
    process.exitCode = 2;
  } else {
    console.log('Smoke OK');
  }
})();
