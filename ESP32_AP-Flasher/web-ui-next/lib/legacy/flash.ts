// Flash module skeleton – full parity would require socket/process orchestration.
// This provides a minimal API placeholder to be expanded later.

export interface FlashFlags { fsOnly?: boolean; skipUpload?: boolean; skipBuild?: boolean; fast?: boolean }
export interface FlashRunOptions extends FlashFlags { env: string; port: string; baud: string }

export interface FlashProcessState { running: boolean; lines: FlashLogLine[]; startedAt?: number; finishedAt?: number; exitCode?: number | null }
export interface FlashLogLine { ts: number; text: string; level: 'info' | 'error' | 'success' }

// Simple in-memory singleton store (client-side only)
const store: FlashProcessState = { running: false, lines: [] };

function push(text: string, level: FlashLogLine['level'] = 'info') {
  store.lines.push({ ts: Date.now(), text, level });
  if (store.lines.length > 1500) store.lines.splice(0, 150);
}

export function getFlashState(): FlashProcessState { return { ...store, lines: [...store.lines] }; }

export async function simulateFlashRun(opts: FlashRunOptions) {
  if (store.running) throw new Error('Already running');
  store.running = true; store.startedAt = Date.now(); store.finishedAt = undefined; store.exitCode = undefined; store.lines = [];
  push(`Starting flash: env=${opts.env} port=${opts.port} baud=${opts.baud}`);
  await new Promise(r => setTimeout(r, 400)); push('Building...', 'info');
  if (!opts.skipBuild) { await new Promise(r => setTimeout(r, 800)); push('Build complete', 'success'); }
  if (!opts.skipUpload) { push('Uploading...'); await new Promise(r => setTimeout(r, 600)); push('Upload complete', 'success'); }
  push('Done.', 'success');
  store.running = false; store.finishedAt = Date.now(); store.exitCode = 0;
  return getFlashState();
}
