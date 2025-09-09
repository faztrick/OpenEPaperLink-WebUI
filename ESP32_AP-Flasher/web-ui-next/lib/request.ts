// Shared lightweight HTTP helpers (client-side)
// Provides requestJson with timeout + basic error shaping

export interface RequestJsonOptions { timeoutMs?: number; init?: RequestInit }

export async function requestJson<T=any>(url: string, opts: RequestJsonOptions = {}): Promise<T> {
  const { timeoutMs = 4000, init } = opts;
  const ctrl = new AbortController();
  const to = setTimeout(()=> ctrl.abort(), timeoutMs);
  try {
    const resp = await fetch(url, { signal: ctrl.signal, ...init });
    if(!resp.ok) throw new Error('HTTP '+resp.status);
    return await resp.json();
  } finally { clearTimeout(to); }
}

export async function postJson<T=any>(url: string, body: any, opts: Omit<RequestJsonOptions,'init'> = {}){
  return requestJson<T>(url, { ...opts, init: { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify(body) } });
}