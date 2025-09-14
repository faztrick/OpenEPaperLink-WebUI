#!/usr/bin/env node
// Auto-stop PM2 dev process before production build to avoid EPERM on Windows.
// Safe: if pm2 or process not present it silently continues.
import { spawnSync } from 'node:child_process';

function findCmd(candidates) {
  for (const c of candidates) {
    const res = spawnSync(process.platform === 'win32' ? 'where' : 'which', [c], { stdio: 'ignore' });
    if (res.status === 0) return c;
  }
  return null;
}

function pm2Base() {
  const direct = findCmd(['pm2', 'pm2.cmd']);
  if (direct) return [direct];
  const npx = findCmd(['npx', 'npx.cmd']);
  if (npx) return [npx, 'pm2'];
  return null;
}

function stopIfRunning(name) {
  const base = pm2Base();
  if (!base) return; // pm2 not installed, nothing to stop
  const j = spawnSync(base[0], base.slice(1).concat(['jlist']), { encoding: 'utf8' });
  if (j.status !== 0) return; // cannot query
  try {
    const arr = JSON.parse(j.stdout.trim().split(/\n/).filter(l => !l.startsWith('>>>>')).join('\n'));
    const proc = arr.find(p => p.name === name && p.pm2_env && p.pm2_env.status === 'online');
    if (!proc) return;
  } catch { return; }
  const res = spawnSync(base[0], base.slice(1).concat(['stop', name]), { stdio: 'inherit' });
  if (res.status === 0) console.log(`[auto-stop] Stopped ${name} before build.`);
}

stopIfRunning('webui-dev');

// Cleanup old .next build artifacts that may have locked trace files on Windows.
// This mitigates EPERM errors when Next.js attempts to write .next/trace.
import fs from 'node:fs';
import path from 'node:path';

function safeRm(target) {
  try {
    if (fs.existsSync(target)) {
      // attempt rename first to break locks
      const tmp = target + '.old_' + Date.now();
      try { fs.renameSync(target, tmp); } catch { /* ignore rename issues */ }
      // recursive delete (Node 14+ supports rmSync with recursive)
      try { fs.rmSync(target, { recursive: true, force: true }); } catch { /* ignore */ }
      try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* ignore */ }
      console.log('[auto-stop] Cleaned previous build dir:', path.basename(target));
    }
  } catch (e) {
    console.warn('[auto-stop] Cleanup skipped:', e?.message || e);
  }
}

const buildDir = path.join(process.cwd(), '.next');
safeRm(path.join(buildDir, 'trace'));
// If trace removal still causes issues, allow full build dir cleanup when env flag set
if (process.env.FORCE_FULL_NEXT_CLEAN === '1') {
  safeRm(buildDir);
}
