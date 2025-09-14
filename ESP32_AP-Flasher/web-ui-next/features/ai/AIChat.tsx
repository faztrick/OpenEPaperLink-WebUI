import { useCallback, useEffect, useRef, useState } from 'react';
import styles from './AIChat.module.css';

export function AIChat() {
  const [messages, setMessages] = useState<{ role: 'user' | 'assistant'; content: string }[]>([]);
  const [input, setInput] = useState('');
  const [health, setHealth] = useState<any>(null);
  const [healthError, setHealthError] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [lastFetch, setLastFetch] = useState<number>(0);
  const [now, setNow] = useState<number>(0); // start at 0 to match SSR output
  const tickingRef = useRef<number | null>(null);

  const fetchHealth = useCallback(async () => {
    setLoading(true);
    setHealthError('');
    try {
      const resp = await fetch('/api/v1/health');
      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status}`);
      }
      const data = await resp.json();
      setHealth(data);
      setLastFetch(Date.now());
    } catch (e: any) {
      setHealthError(e.message || 'Failed to fetch health');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHealth();
    const poll = setInterval(() => { fetchHealth(); }, 15000); // refresh every 15s
    // start a lightweight seconds ticker AFTER mount to avoid hydration mismatch
    tickingRef.current = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => {
      clearInterval(poll);
      if (tickingRef.current) clearInterval(tickingRef.current);
    };
  }, [fetchHealth]);

  function send() {
    if (!input.trim()) return;
    const question = input.trim();
    const userMsg = { role: 'user' as const, content: question };
    // Very naive placeholder "AI" logic: respond with health-derived hints
    let reply = 'AI reply placeholder.';
    if (/heap|memory/i.test(question) && health) {
      reply = `Free heap: ${health.freeHeap} bytes. Uptime: ${Math.round(health.uptime)}s.`;
    } else if (/wifi|network/i.test(question) && health?.wifi) {
      reply = `WiFi mode: ${health.wifi.mode}, connected=${health.wifi.connected}.`;
    } else if (/led/i.test(question) && health?.led) {
      reply = `LED brightness currently ${health.led.brightness}.`;
    } else if (/modules?/i.test(question) && health?.modules) {
      reply = `Modules loaded (${health.modules.count}): ${(health.modules.list || []).join(', ')}`;
    }
    setMessages(m => [...m, userMsg, { role: 'assistant', content: reply }]);
    setInput('');
  }

  return (
    <div className={styles.aiChatRoot}>
      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <strong>Device Health</strong>
          <div className={styles.panelHeaderMeta}>
            {loading && <span className={styles.loading}>Loading...</span>}
            <button className="btn btn-secondary btn-sm" onClick={() => fetchHealth()}>Refresh</button>
          </div>
        </div>
        {healthError && <div className={styles.error}>{healthError}</div>}
        {health && !healthError && (
          <div className={styles.healthBody}>
            <div><span className={styles.dim}>Uptime:</span> {Math.round(health.uptime)}s</div>
            <div><span className={styles.dim}>Free Heap:</span> {health.freeHeap} B</div>
            {health.wifi && <div><span className={styles.dim}>WiFi:</span> {health.wifi.mode} ({health.wifi.connected ? 'connected' : 'disconnected'})</div>}
            {health.led && <div><span className={styles.dim}>LED Brightness:</span> {health.led.brightness}</div>}
            {health.modules && <div><span className={styles.dim}>Modules:</span> {health.modules.count} [{(health.modules.list || []).join(', ')}]</div>}
            <div className={styles.healthFoot}>
              apiVersion {health.apiVersion} • Updated {lastFetch && now ? ((now - lastFetch) / 1000).toFixed(0) : '0'}s ago
            </div>
          </div>
        )}
      </section>
      <section>
        <div className={styles.messages}>
          {messages.length === 0 && <div className={styles.dim}>Ask something about builds, flashing, or device status...</div>}
          {messages.map((m, i) => (
            <div key={i} className={styles.msg}>
              <strong className={m.role === 'user' ? styles.userLabel : styles.aiLabel}>{m.role === 'user' ? 'You' : 'AI'}:</strong> {m.content}
            </div>
          ))}
        </div>
        <div className={styles.inputRow}>
          <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') send(); }} className={styles.grow} placeholder="Ask a question (e.g. 'wifi status', 'heap')" />
          <button onClick={send} className="btn btn-primary">Send</button>
        </div>
      </section>
    </div>
  );
}
