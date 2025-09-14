import { buildApiUrl } from './apiBase';
import { transport } from './transport';

// Unified wrappers after transport refactor.
// transport().get()/post() already implement preferred-channel + fallback logic for relative paths.
// We keep these helpers so existing hooks can continue calling tGet/tPost with unmodified semantics.

// Normalization: For serial we pass a leading-slash relative path (e.g. '/api/wifi/status').
// For HTTP we resolve via buildApiUrl() before calling fetch directly (bypassing transport HTTP
// inside to avoid double fetch logic). If HTTP fails and preferred==='auto', higher-level code
// wanting serial fallback should call transport().get() directly. These wrappers provide a thin
// compatibility layer and may be deprecated later.

export async function tGet<T = any>(path: string, init?: RequestInit): Promise<T> {
  const t = transport();
  const st = t.getStatus();
  const rel = path.startsWith('/') ? path : '/' + path;
  if (st.preferred === 'serial' || (st.effective === 'serial' && st.serialOpen)) {
    return t.get<T>(rel, init);
  }
  // HTTP path
  const res = await fetch(buildApiUrl(rel), init);
  if (!res.ok) throw new Error(`GET ${rel} -> ${res.status}`);
  return res.json();
}

export async function tPost<T = any>(path: string, body: any, init?: RequestInit): Promise<T> {
  const t = transport();
  const st = t.getStatus();
  const rel = path.startsWith('/') ? path : '/' + path;
  if (st.preferred === 'serial' || (st.effective === 'serial' && st.serialOpen)) {
    return t.post<T>(rel, body, init);
  }
  const res = await fetch(buildApiUrl(rel), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
    body: JSON.stringify(body),
    ...init,
  });
  if (!res.ok) throw new Error(`POST ${rel} -> ${res.status}`);
  return res.json();
}
