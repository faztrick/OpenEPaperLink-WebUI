#!/usr/bin/env node
/**
 * Build a production Next.js bundle, perform a static export (where possible),
 * then copy/minify/gzip the resulting assets into the firmware data/www directory
 * so they can be served from LittleFS / SD.
 *
 * Usage:
 *   node scripts/export-static-and-copy.mjs [--skip-build] [--clean]
 *
 * Notes:
 * - We rely on `next build` + `next export` (static HTML) for pages that do not
 *   require server-side logic. Dynamic features that depend on API routes will
 *   still call the device firmware directly via NEXT_PUBLIC_AP_BASE_URL.
 * - If a page cannot be exported (uses dynamic server logic), Next will warn; we continue.
 * - After export, we copy the `out/` folder contents into ../../data/www-next
 *   (separate from legacy www). A separate gzip step can be applied via existing
 *   python script if needed.
 */

import { execSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');
const repoRoot = join(projectRoot, '..', '..');
const firmwareDataDir = join(repoRoot, 'data');
const targetDir = join(firmwareDataDir, 'www-next');

function run(cmd) {
  console.log('[exec]', cmd);
  execSync(cmd, { stdio: 'inherit', cwd: projectRoot });
}

function parseArgs() {
  const args = process.argv.slice(2);
  return {
    skipBuild: args.includes('--skip-build'),
    clean: args.includes('--clean'),
  };
}

function ensureDirs() {
  if (!existsSync(firmwareDataDir)) mkdirSync(firmwareDataDir, { recursive: true });
  if (!existsSync(targetDir)) mkdirSync(targetDir, { recursive: true });
}

function copyRecursive(src, dst) {
  const entries = readdirSync(src, { withFileTypes: true });
  for (const e of entries) {
    const s = join(src, e.name);
    const d = join(dst, e.name);
    if (e.isDirectory()) {
      if (!existsSync(d)) mkdirSync(d);
      copyRecursive(s, d);
    } else if (e.isFile()) {
      cpSync(s, d);
    }
  }
}

function maybeMinifyInPlace(file) {
  if (!/\.(js|css)$/.test(file)) return;
  try {
    let txt = readFileSync(file, 'utf8');
    // naive whitespace trim; rely on Next's build-time minification primarily
    txt = txt.replace(/\n+/g, '\n');
    writeFileSync(file, txt);
  } catch (e) {
    console.warn('Warn: cannot minify', file, e.message);
  }
}

function walkAndMinify(dir) {
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walkAndMinify(p);
    else maybeMinifyInPlace(p);
  }
}

(function main() {
  const { skipBuild, clean } = parseArgs();
  ensureDirs();

  if (clean && existsSync(targetDir)) {
    console.log('Cleaning target directory', targetDir);
    rmSync(targetDir, { recursive: true, force: true });
    mkdirSync(targetDir, { recursive: true });
  }

  if (!skipBuild) {
    run('npm run build');
    try {
      run('npx next export');
    } catch (e) {
      console.warn('next export reported errors (some pages may not be fully static). Continuing.');
    }
  }

  const outDir = join(projectRoot, 'out');
  if (!existsSync(outDir)) {
    console.error('No out/ directory present. Did the export fail?');
    process.exit(2);
  }

  console.log('Copying exported assets to firmware data folder: ', targetDir);
  if (!existsSync(targetDir)) mkdirSync(targetDir, { recursive: true });
  copyRecursive(outDir, targetDir);

  console.log('Optional light minification pass...');
  walkAndMinify(targetDir);

  console.log('Done. You can now gzip & embed with:');
  console.log('  python ../../gzip_wwwfiles.py --source ../../data/www-next --dest ../../data/www-next-gz --clean');
})();
