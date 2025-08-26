// Lightweight AI agent widget: handles toggling panel, local demo messages, and simple send hook
(function(){
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
        header.innerHTML = '<strong>Assistant</strong><span style="margin-left:auto;opacity:0.7">GPT</span>';

        const body = createNode('div','ai-panel-body');
        body.id = 'ai-panel-body';
        body.appendChild(createNode('div','ai-msg bot','Hello — ask me to list files, check system status, or help with firmware tasks.'));

        const footer = createNode('div','ai-panel-footer');
        const input = createNode('input','ai-input'); input.type='text'; input.id='ai-input'; input.placeholder='Ask the assistant...';
        const send = createNode('button','ai-send-btn','Send'); send.id='ai-send-btn';

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
            if (!inside) {
                hidePanel();
            }
        });

        // Prevent immediate closing when interacting with the widget
        panel.addEventListener('click', (e) => e.stopPropagation());

        // Expose basic API
        window.openAIAgentWidget = {
            togglePanel, showPanel, hidePanel, sendMessage
        };
    }

    function togglePanel() {
        const panel = document.getElementById('ai-widget-panel');
        if (!panel) return;
        if (panel.style.display === 'flex') {
            panel.style.display = 'none';
        } else {
            panel.style.display = 'flex';
            const input = document.getElementById('ai-input'); if (input) input.focus();
        }
    }
    function showPanel() { const p=document.getElementById('ai-widget-panel'); if(p) p.style.display='flex'; }
    function hidePanel() { const p=document.getElementById('ai-widget-panel'); if(p) p.style.display='none'; }

    async function sendMessage() {
        const input = document.getElementById('ai-input');
        const body = document.getElementById('ai-panel-body');
        if (!input || !body) return;
        const text = input.value.trim();
        if (!text) return;

        // Append user message
        const userMsg = document.createElement('div'); userMsg.className='ai-msg user'; userMsg.textContent = text; body.appendChild(userMsg);
        input.value=''; body.scrollTop = body.scrollHeight;

        // Try to route to existing openAIAgent if available
        if (window.openAIAgent && typeof window.openAIAgent.ask === 'function') {
            const reply = await window.openAIAgent.ask(text).catch(err => ({error:err.message}));
            const botMsg = document.createElement('div'); botMsg.className='ai-msg bot';
            botMsg.textContent = reply?.text || (reply?.error ? 'Error: '+reply.error : 'No response');
            body.appendChild(botMsg);
            body.scrollTop = body.scrollHeight;
            return;
        }

        // Fallback: simple canned responses for common commands
        const lower = text.toLowerCase();
        let replyText = 'I am not connected to the full AI agent in this environment.';
        if (lower.includes('list files') || lower.includes('wwwroot')) {
            replyText = 'Try GET /wwwroot-list on the web-ui server (or use the site index).';
        } else if (lower.includes('status') || lower.includes('system')) {
            replyText = 'You can view system status on /sysinfo or the dashboard page.';
        } else if (lower.includes('demo')) {
            replyText = 'OpenAI Agent demo: try the dedicated AI page at /ai-agent.html.';
        }

        const botMsg = document.createElement('div'); botMsg.className='ai-msg bot'; botMsg.textContent = replyText;
        body.appendChild(botMsg);
        body.scrollTop = body.scrollHeight;
    }

    // Initialize on DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initWidget);
    } else {
        initWidget();
    }
})();
