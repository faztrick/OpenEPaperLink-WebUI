// Simple node test for /api/serial/wifi/scan
async function main() {
  const res = await fetch('http://localhost:3000/api/serial/wifi/scan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ minRssi: -85, top: 5 })
  });
  const txt = await res.text();
  console.log('status', res.status);
  console.log(txt);
}
main().catch(e => { console.error(e); process.exit(1); });
