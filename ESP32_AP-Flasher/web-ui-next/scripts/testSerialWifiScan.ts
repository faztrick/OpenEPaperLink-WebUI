/* Quick script to test the /api/serial/wifi/scan endpoint.
 * Requires the Next.js dev server running on localhost:3000 (adjust if needed).
 */

async function run() {
  const url = process.env.TEST_SCAN_URL || 'http://localhost:3000/api/serial/wifi/scan';
  const body = { minRssi: -85, top: 5 };
  try {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json();
    console.log('Status', r.status);
    console.log(JSON.stringify(j, null, 2));
    if (!j.success) process.exitCode = 1;
  } catch (e) {
    console.error('Request failed', e);
    process.exitCode = 2;
  }
}

run();
