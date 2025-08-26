#!/usr/bin/env node
// Simple incremental poller for /api/serial/log
// Prints new lines as they arrive with classification tags.
// Usage: node scripts/tail-serial-log.js [intervalMs]
const interval = Number(process.argv[2]||"1000");
let since = 0;
async function tick(){
  try {
    const res = await fetch(`http://localhost:3000/api/serial/log?since=${since}`);
    if(!res.ok){
      const text = await res.text();
      console.error('HTTP', res.status, text);
      return;
    }
    const data = await res.json();
    if(Array.isArray(data.lines)){
      for(const line of data.lines){
        const tag = line.class || line.tag || '';
        process.stdout.write(`[${line.index}${tag?(' '+tag):''}] ${line.text}\n`);
        since = Math.max(since, line.index+1);
      }
    }
  } catch(err){
    console.error('poll error', err.message);
  }
}
console.log(`Starting serial log tail (interval ${interval}ms)`);
setInterval(tick, interval);
tick();