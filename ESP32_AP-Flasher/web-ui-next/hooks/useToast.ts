import { useEffect, useState } from 'react';

export type ToastLevel = 'info' | 'success' | 'error';
export interface Toast { id: string; text: string; level: ToastLevel; ts: number }

type Listener = (t: Toast) => void;

const listeners = new Set<Listener>();

export function showToast(text: string, level: ToastLevel = 'info') {
  const toast: Toast = { id: Math.random().toString(36).slice(2), text, level, ts: Date.now() };
  listeners.forEach((fn) => fn(toast));
}

export function useToastStream() {
  const [queue, setQueue] = useState<Toast[]>([]);
  useEffect(() => {
    const onToast = (t: Toast) => setQueue((q) => [...q, t].slice(-5));
    listeners.add(onToast);
    return () => void listeners.delete(onToast);
  }, []);
  const remove = (id: string) => setQueue((q) => q.filter((t) => t.id !== id));
  return { queue, remove };
}

