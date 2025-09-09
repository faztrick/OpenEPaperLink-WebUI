import { useEffect, useRef, useState } from 'react';

export function useWebSocketStatus(url?: string){
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket|null>(null);
  useEffect(()=>{
    if(!url) return;
    const ws = new WebSocket(url);
    wsRef.current = ws;
    ws.onopen = ()=> setConnected(true);
    ws.onclose = ()=> setConnected(false);
    ws.onerror = ()=> setConnected(false);
    return ()=> { ws.close(); };
  }, [url]);
  return { connected };
}
