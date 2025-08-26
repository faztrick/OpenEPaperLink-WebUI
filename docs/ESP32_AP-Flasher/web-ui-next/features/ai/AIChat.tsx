import { useState } from 'react';

export function AIChat(){
  const [messages, setMessages] = useState<{role:'user'|'assistant'; content:string}[]>([]);
  const [input, setInput] = useState('');

  function send(){
    if(!input.trim()) return;
    const userMsg = { role:'user' as const, content: input.trim() };
    setMessages(m=> [...m, userMsg, { role:'assistant', content: 'AI reply placeholder.' }]);
    setInput('');
  }

  return (
    <div>
      <div style={{maxHeight:300, overflowY:'auto', border:'1px solid #30363d', padding:8, borderRadius:6, background:'#0d1117'}}>
        {messages.length === 0 && <div style={{opacity:.6}}>Ask something about builds, flashing, or device status...</div>}
        {messages.map((m,i)=> (
          <div key={i} style={{marginBottom:6}}>
            <strong style={{color: m.role==='user'? 'var(--accent)':'#58a6ff'}}>{m.role==='user'? 'You':'AI'}:</strong> {m.content}
          </div>
        ))}
      </div>
      <div style={{display:'flex', gap:8, marginTop:8}}>
        <input value={input} onChange={e=> setInput(e.target.value)} onKeyDown={e=>{ if(e.key==='Enter') send(); }} style={{flex:1}} placeholder="Ask a question..." />
        <button onClick={send} className="btn btn-primary">Send</button>
      </div>
    </div>
  );
}
