// Generic API client helpers for device proxy interactions
// Centralizes JSON fetch + error normalization

export interface ApiError extends Error {
  status?: number;
  responseBody?: any;
}

async function parseJsonSafe(resp: Response) {
  try { return await resp.json(); } catch { return null; }
}

export async function apiGet<T = any>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { ...init, method: 'GET' });
  const data = await parseJsonSafe(r);
  if (!r.ok) {
    const err: ApiError = new Error(data?.error || data?.message || `HTTP ${r.status}`);
    err.status = r.status; err.responseBody = data; throw err;
  }
  return data as T;
}

export async function apiPostForm<T = any>(url: string, form: URLSearchParams): Promise<T> {
  const r = await fetch(url, { method: 'POST', body: form });
  const data = await parseJsonSafe(r);
  if (!r.ok) {
    const err: ApiError = new Error(data?.error || data?.message || `HTTP ${r.status}`);
    err.status = r.status; err.responseBody = data; throw err;
  }
  return data as T;
}

export async function apiPostJson<T = any>(url: string, body: any): Promise<T> {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await parseJsonSafe(r);
  if (!r.ok) {
    const err: ApiError = new Error(data?.error || data?.message || `HTTP ${r.status}`);
    err.status = r.status; err.responseBody = data; throw err;
  }
  return data as T;
}

export async function apiPostNoBody<T = any>(url: string): Promise<T> {
  const r = await fetch(url, { method: 'POST' });
  const data = await parseJsonSafe(r);
  if (!r.ok) {
    const err: ApiError = new Error(data?.error || data?.message || `HTTP ${r.status}`);
    err.status = r.status; err.responseBody = data; throw err;
  }
  return data as T;
}
