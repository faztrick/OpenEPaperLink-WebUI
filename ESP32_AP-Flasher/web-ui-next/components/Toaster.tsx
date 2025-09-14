import React, { useEffect } from 'react';
import { Toast, useToastStream } from '../hooks/useToast';

function ToastItem({ t, onClose }: { t: Toast; onClose: (id: string) => void }) {
  useEffect(() => {
    const id = setTimeout(() => onClose(t.id), 3000);
    return () => clearTimeout(id);
  }, [t.id, onClose]);
  const bg = t.level === 'error' ? '#fee2e2' : t.level === 'success' ? '#dcfce7' : '#e5e7eb';
  const color = t.level === 'error' ? '#991b1b' : t.level === 'success' ? '#14532d' : '#111827';
  return (
    <div style={{ padding: '8px 12px', borderRadius: 6, background: bg, color, boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontSize: 13 }}>{t.text}</span>
        <button onClick={() => onClose(t.id)} style={{ background: 'transparent', border: 'none', color, cursor: 'pointer' }}>×</button>
      </div>
    </div>
  );
}

export function Toaster() {
  const { queue, remove } = useToastStream();
  return (
    <div style={{ position: 'fixed', right: 16, bottom: 16, display: 'grid', gap: 8, zIndex: 1000 }}>
      {queue.map((t) => (
        <ToastItem key={t.id} t={t} onClose={remove} />
      ))}
    </div>
  );
}

