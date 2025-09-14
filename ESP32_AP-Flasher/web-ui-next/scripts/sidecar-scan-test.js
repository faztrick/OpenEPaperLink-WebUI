// Test sidecar service directly
async function main() {
  const res = await fetch('http://localhost:4001/scan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ minRssi: -85, top: 5 }) });
  const text = await res.text();
  console.log('status', res.status);
  console.log(text);
}
main().catch(e => { console.error(e); process.exit(1); });
