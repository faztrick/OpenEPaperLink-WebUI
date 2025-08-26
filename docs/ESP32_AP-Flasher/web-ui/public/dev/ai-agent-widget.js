// Lightweight AI agent widget for web-ui/public pages
(function(){
    // Added configuration + state + helper for real AI integration
    const API_ENDPOINT = '/api/ai/chat';
    const STREAM_ENDPOINT = '/api/ai/chat/stream';
    let useStreaming = true; // default; toggled via small UI control
    let sending = false;

    function $(sel, ctx=document) { return ctx.querySelector(sel); }
    function createNode(tag, cls, text) { const e=document.createElement(tag); if(cls) e.className=cls; if(text) e.textContent=text; return e; }

    function initWidget() {
        if (document.getElementById('ai-widget-root')) return; // already initialized

        // Load CSS dynamically if not already present
        if (!document.querySelector('link[href="/ai-agent-widget.css"]') && !document.querySelector('link[href="ai-agent-widget.css"]')) {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = 'ai-agent-widget.css';
            document.head.appendChild(link);
        }

        const btn = createNode('div','ai-widget-btn');
        btn.id = 'ai-widget-btn';
        btn.innerHTML = '<span style="font-size:20px">🤖</span>';

        const panel = createNode('div','ai-widget-panel');
        panel.id = 'ai-widget-panel';

        const header = createNode('div','ai-panel-header');
        header.innerHTML = '<strong>Assistant</strong><span id="ai-widget-model" style="margin-left:auto;opacity:0.7;font-size:11px"></span>';

        const body = createNode('div','ai-panel-body');
        body.id = 'ai-panel-body';
        body.appendChild(createNode('div','ai-msg bot','Hello — ask me about firmware tasks, device status, or code.'));

        const footer = createNode('div','ai-panel-footer');
        const input = createNode('input','ai-input'); input.type='text'; input.id='ai-input'; input.placeholder='Ask the assistant...';
        const send = createNode('button','ai-send-btn','Send'); send.id='ai-send-btn';
        const streamToggle = createNode('button','ai-stream-toggle', 'Stream');
        streamToggle.title = 'Toggle streaming responses';
        streamToggle.addEventListener('click', ()=>{ useStreaming = !useStreaming; streamToggle.classList.toggle('off', !useStreaming); streamToggle.textContent = useStreaming? 'Stream':'Batch'; });

        const verbositySel = document.createElement('select'); verbositySel.id='ai-verbosity'; verbositySel.className='ai-verbosity';
        ['low','medium','high'].forEach(v=>{ const o=document.createElement('option'); o.value=v; o.textContent=v; if(v==='low') o.selected=true; verbositySel.appendChild(o); });
        verbositySel.title='Verbosity';

        footer.appendChild(streamToggle);
        footer.appendChild(verbositySel);
        footer.appendChild(input); footer.appendChild(send);

        panel.appendChild(header); panel.appendChild(body); panel.appendChild(footer);

        const root = document.createElement('div'); root.id='ai-widget-root';
        root.appendChild(btn); root.appendChild(panel);
        document.body.appendChild(root);

        // Event handlers
        btn.addEventListener('click', () => togglePanel());
        send.addEventListener('click', () => sendMessage());
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendMessage(); });

        // Close on outside click
        document.addEventListener('click', (e) => {
            const inside = e.target.closest('#ai-widget-root');
            if (!inside) hidePanel();
        });
        panel.addEventListener('click', (e) => e.stopPropagation());

        // Expose basic API
        window.openAIAgentWidget = { togglePanel, showPanel, hidePanel, sendMessage };
    }

    function togglePanel() { const panel = $('#ai-widget-panel'); if (!panel) return; panel.style.display = (panel.style.display === 'flex') ? 'none':'flex'; if(panel.style.display==='flex'){ $('#ai-input')?.focus(); } }
    function showPanel() { const p=$('#ai-widget-panel'); if(p) p.style.display='flex'; }
    function hidePanel() { const p=$('#ai-widget-panel'); if(p) p.style.display='none'; }

    function appendMessage(role, text) {
        const body = $('#ai-panel-body'); if(!body) return; const div=document.createElement('div'); div.className='ai-msg '+role; div.textContent=text; body.appendChild(div); body.scrollTop = body.scrollHeight; return div;
    }

    async function sendMessage() {
        if (sending) return; // prevent concurrent
        const input = $('#ai-input'); const body = $('#ai-panel-body'); const modelEl = $('#ai-widget-model');
        if (!input || !body) return;
        const text = input.value.trim();
        if (!text) return;
        input.value='';
        appendMessage('user', text);
        const vbSel = $('#ai-verbosity'); const verbosity = vbSel ? vbSel.value : 'low';
        sending = true; updateSending(true);
        try {
            if (useStreaming) {
                await streamRequest(text, { verbosity });
            } else {
                await batchRequest(text, { verbosity });
            }
        } catch (e) {
            appendMessage('bot','Error: '+(e.message||e));
        } finally {
            sending = false; updateSending(false);
        }
    }

    function updateSending(on){ const input=$('#ai-input'); const send=$('#ai-send-btn'); if(input) input.disabled=on; if(send){ send.disabled=on; send.textContent= on? '...':'Send'; } }

    async function batchRequest(message, opts){
        const bodyEl = $('#ai-panel-body');
        const placeholder = appendMessage('bot','(thinking...)');
        const resp = await fetch(API_ENDPOINT, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ message, verbosity: opts.verbosity }) });
        if(!resp.ok){ placeholder.textContent = 'Error: '+resp.status; return; }
        const json = await resp.json();
        if(!json.success){ placeholder.textContent = 'Error: '+json.error; return; }
        placeholder.textContent = json.response || json.reply || '(no reply)';
        const modelEl = $('#ai-widget-model'); if(modelEl && json.modelUsed) modelEl.textContent = json.modelUsed;
    }

    async function streamRequest(message, opts){
        const bodyEl = $('#ai-panel-body');
        const container = appendMessage('bot','');
        const modelEl = $('#ai-widget-model');
        return new Promise((resolve, reject)=>{
            const params = new URLSearchParams({ message, verbosity: opts.verbosity });
            const url = STREAM_ENDPOINT + '?' + params.toString();
            const es = new EventSource(url);
            let closed=false;
            es.addEventListener('token', ev=>{ try { const data = JSON.parse(ev.data); if(data.delta){ container.textContent += data.delta; bodyEl.scrollTop = bodyEl.scrollHeight; } } catch(_){} });
            es.addEventListener('done', ev=>{ closed=true; try { const data = JSON.parse(ev.data); if(data.modelUsed && modelEl) modelEl.textContent=data.modelUsed; } catch(_){} es.close(); resolve(); });
            es.addEventListener('error', ev=>{ if(closed) return; container.textContent += '\n[stream error]'; es.close(); reject(new Error('stream error')); });
        });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initWidget); else initWidget();
})();
