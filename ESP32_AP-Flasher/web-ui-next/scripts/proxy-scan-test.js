// Test Next.js API proxy (should forward to sidecar)
async function main() {
  const res = await fetch('http://localhost:3000/api/serial/wifi/scan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ minRssi: -85, top: 3 }) });
  const txt = await res.text();
  console.log('status', res.status); console.log(txt);
}
main().catch(e => { console.error(e); process.exit(1); });
