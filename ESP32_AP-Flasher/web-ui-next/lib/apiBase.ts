// Centralized logic to resolve the firmware AP base URL.
// Priority (highest first):
// 1. User-selected device (device selection store) baseUrl
// 2. Explicit NEXT_PUBLIC_AP_BASE_URL env var
// 3. Browser window.location.origin (same host proxy / direct access)
// 4. Fallback to http://192.168.4.1 (common AP default) if clearly running in dev (localhost)
// 5. Empty string -> relative fetch (let browser decide)

import { getSelectedDevice, initDeviceSelection } from './deviceSelection';

export function getApiBase(): string {
  if (typeof window === 'undefined') {
    // On server: only trust env var; SSR shouldn't guess local network IPs.
    return process.env.NEXT_PUBLIC_AP_BASE_URL || '';
  }

  // Ensure selection restored once in browser context
  initDeviceSelection();

  const chosen = getSelectedDevice();
  if (chosen && chosen.baseUrl) return chosen.baseUrl.replace(/\/$/, '');

  const explicit = process.env.NEXT_PUBLIC_AP_BASE_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, '');

  // If same-origin hosting (e.g., you reverse proxy the ESP32 through a dev tool)
  const origin = window.location.origin;
  if (origin) return origin;

  // Dev heuristic: running on localhost => suggest typical AP IP as fallback
  if (/localhost|127\.0\.0\.1/.test(window.location.hostname)) {
    return 'http://192.168.4.1';
  }

  return '';
}

export function buildApiUrl(path: string): string {
  const base = getApiBase();
  if (!base) return path; // relative
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  return base + (path.startsWith('/') ? path : `/${path}`);
}

export async function apiGet<T = any>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(buildApiUrl(path), init);
  if (!res.ok) throw new Error(`GET ${path} -> ${res.status}`);
  return res.json() as Promise<T>;
}

export async function apiPost<T = any>(path: string, body: any, init?: RequestInit): Promise<T> {
  const res = await fetch(buildApiUrl(path), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
    body: JSON.stringify(body),
    ...init,
  });
  if (!res.ok) throw new Error(`POST ${path} -> ${res.status}`);
  return res.json() as Promise<T>;
}
