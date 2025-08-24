// AI Agent Integration for ESP32 Development
const OpenAI = require('openai');
const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs');
const path = require('path');

class ESP32AIAgent {
    constructor() {
        this.openai = null;
        this.anthropic = null;
        this.config = this.loadConfig();
        this.initializeClients();
        this._lastProviderError = null;

        // Context about the ESP32 project
        this.projectContext = {
            platform: 'ESP32-S3',
            framework: 'Arduino/ESP-IDF',
            buildSystem: 'PlatformIO',
            features: ['TFT Display', 'RGB LEDs', 'BLE', 'SubGHz Radio', 'WiFi'],
            purpose: 'OutdoorAP for OpenEPaperLink system'
        };

        this.conversationHistory = [];
    }

    loadConfig() {
        const configPath = path.join(__dirname, 'ai_config.json');
        try {
            if (fs.existsSync(configPath)) {
                return JSON.parse(fs.readFileSync(configPath, 'utf8'));
            }
        } catch (error) {
            console.log('AI config not found, using defaults');
        }

        return {
            openai: {
                // Accept multiple env var aliases for convenience / rotation
                apiKey: process.env.OPENAI_API_KEY || process.env.OPEL_OPENAI_KEY || '',
                model: 'gpt-4o', // User can switch to experimental (e.g. gpt-5, gpt-5-mini) via config
                enabled: false,
                // Ordered fallback list tried if primary model fails (rate limit / model error / timeout)
                fallbackModels: ['gpt-5-mini','gpt-4o-mini','gpt-4o']
            },
            anthropic: {
                apiKey: process.env.ANTHROPIC_API_KEY || process.env.OPEL_ANTHROPIC_KEY || '',
                model: 'claude-3-5-sonnet-20241022',
                enabled: false
            },
            ollama: {
                url: process.env.OLLAMA_URL || 'http://localhost:11434',
                model: process.env.OLLAMA_MODEL || 'llama3',
                enabled: false,
                timeoutMs: 45000
            },
            defaultProvider: 'openai', // 'openai' | 'anthropic' | 'ollama'
            // Optional agent level settings (separate from feature toggles)
            agent: {
                allowDynamicProviderSwitch: true,
                maxHistory: 25,
                allowExperimentalModels: true,
                // These models are not validated here – UI can surface placeholders
                experimentalModels: ['gpt-5', 'gpt-4.1-experimental', 'claude-3-opus-latest'],
                defaultVerbosity: 'medium' // low | medium | high
            },
            experimental: {
                // GPT-5 family early-access sometimes enforces extra verification when stream=true.
                // If enabled, we will auto-retry without streaming on verification related errors.
                gpt5StreamVerificationFallback: true
            },
            features: {
                codeAnalysis: true,
                errorDiagnosis: true,
                buildOptimization: true,
                autoSuggestions: true,
                documentation: true,
                codeEditing: false,
                tools: {
                    codeExec: {
                        enabled: false,
                        // Hard cap on python execution time & output length
                        timeoutMs: 3000,
                        maxOutput: 2048,
                        python: process.env.OPEL_PYTHON_BIN || 'python'
                    }
                }
            },
            editing: {
                enableFileEdits: false,
                maxFileSize: 200 * 1024,
                allowedExtensions: ['.h', '.hpp', '.c', '.cpp', '.ino', '.txt', '.md', '.js', '.json', '.py', '.ini'],
                blockList: ['ai_config.json', 'package-lock.json'],
                root: path.join(__dirname, '..')
            }
        };
    }

    saveConfig() {
        const configPath = path.join(__dirname, 'ai_config.json');
        fs.writeFileSync(configPath, JSON.stringify(this.config, null, 2));
    }

    initializeClients() {
        // Refresh keys from environment if placeholders present
        if (!this.config.openai.apiKey && process.env.OPENAI_API_KEY) this.config.openai.apiKey = process.env.OPENAI_API_KEY;
        if (!this.config.anthropic.apiKey && process.env.ANTHROPIC_API_KEY) this.config.anthropic.apiKey = process.env.ANTHROPIC_API_KEY;
        this.openai = null; this.anthropic = null;
        if (this.config.openai.apiKey && this.config.openai.enabled) {
            try {
                this.openai = new OpenAI({ apiKey: this.config.openai.apiKey });
                console.log('✓ OpenAI client initialized');
            } catch (error) {
                this._lastProviderError = { provider: 'openai', error: error.message };
                console.error('Failed to initialize OpenAI:', error.message);
            }
        }
        if (this.config.anthropic.apiKey && this.config.anthropic.enabled) {
            try {
                this.anthropic = new Anthropic({ apiKey: this.config.anthropic.apiKey });
                console.log('✓ Anthropic client initialized');
            } catch (error) {
                this._lastProviderError = { provider: 'anthropic', error: error.message };
                console.error('Failed to initialize Anthropic:', error.message);
            }
        }
    }

    isAvailable() {
        return (
            (this.openai && this.config.openai.enabled) ||
            (this.anthropic && this.config.anthropic.enabled) ||
            (this.config.ollama && this.config.ollama.enabled)
        );
    }

    getActiveClient() {
        if (this.config.defaultProvider === 'anthropic' && this.anthropic) {
            return { client: this.anthropic, type: 'anthropic' };
        }
        if (this.config.defaultProvider === 'ollama' && this.config.ollama?.enabled) {
            return { client: null, type: 'ollama' };
        }
        if (this.openai) {
            return { client: this.openai, type: 'openai' };
        }
        if (this.anthropic) {
            return { client: this.anthropic, type: 'anthropic' };
        }
        if (this.config.ollama?.enabled) {
            return { client: null, type: 'ollama' };
        }
        return null;
    }

    async chat(message, context = {}, opts = {}) {
        if (!this.isAvailable()) {
            throw new Error('No AI provider configured. Please set up OpenAI or Anthropic API key.');
        }

        const activeClient = this.getActiveClient();
        if (!activeClient) {
            throw new Error('No active AI client available');
        }

        try {
            const systemPrompt = this.buildSystemPrompt(context);
            const response = await this.sendMessage(activeClient, systemPrompt, message, opts);

            // Store conversation
            this.conversationHistory.push({
                timestamp: new Date().toISOString(),
                message,
                response,
                context
            });

            return response;
        } catch (error) {
            console.error('AI Chat error:', error);
            throw new Error(`AI service error: ${error.message}`);
        }
    }

    buildSystemPrompt(context) {
        return `You are an expert ESP32 development assistant specializing in the OpenEPaperLink OutdoorAP project.

PROJECT CONTEXT:
- Platform: ${this.projectContext.platform}
- Framework: ${this.projectContext.framework}
- Build System: ${this.projectContext.buildSystem}
- Features: ${this.projectContext.features.join(', ')}
- Purpose: ${this.projectContext.purpose}

CURRENT CONTEXT:
${JSON.stringify(context, null, 2)}

CAPABILITIES:
- Analyze ESP32 code and configurations
- Diagnose build errors and compilation issues
- Suggest optimizations for performance and memory
- Help with PlatformIO configuration
- Provide ESP-IDF and Arduino framework guidance
- Debug hardware interface problems (TFT, BLE, WiFi, etc.)
- Recommend best practices for embedded development

Always provide practical, actionable advice specific to ESP32 development.
Include code examples when helpful, and consider power consumption, memory usage, and real-time constraints.
Be concise but thorough in your explanations.`;
    }

    async sendMessage(activeClient, systemPrompt, message, opts = {}) {
        const maxHist = Math.max(0, Math.min(this.config.agent?.maxHistory || 10, 50));
        const history = this.conversationHistory.slice(-maxHist).map(h => [
            { role: 'user', content: h.message },
            { role: 'assistant', content: h.response }
        ]).flat();
        const timeoutMs = opts.timeoutMs || 45000;
        const verbosity = opts.verbosity || this.config.agent?.defaultVerbosity || 'medium';
        // Map verbosity to token + temperature adjustments
        let baseMaxTokens = 2048, temperature = 0.7;
        if (verbosity === 'low') { baseMaxTokens = 512; temperature = 0.4; }
        else if (verbosity === 'high') { baseMaxTokens = 4096; temperature = 0.85; }
        const userMaxTokens = opts.maxTokens && Number.isFinite(opts.maxTokens) ? Math.min(opts.maxTokens, 8192) : null;
        const finalMaxTokens = userMaxTokens || baseMaxTokens;
        if (opts.temperature !== undefined) temperature = opts.temperature;
        this.lastModelUsed = null;
        const withTimeout = (p) => Promise.race([
            p,
            new Promise((_,rej)=>setTimeout(()=>rej(new Error('AI request timeout')), timeoutMs))
        ]);
        try {
            if (activeClient.type === 'openai') {
                const primaryModel = this.config.openai.model || 'gpt-4o-mini';
                const fallbacks = Array.isArray(this.config.openai.fallbackModels) ? this.config.openai.fallbackModels : [];
                const tryModels = [primaryModel, ...fallbacks.filter(m => m !== primaryModel)];
                let lastErr;
                for (const model of tryModels) {
                    try {
                        const useResponsesAPI = /gpt-5/i.test(model) || !!opts.reasoningEffort; // Prefer Responses API for GPT-5 or when reasoning requested
                        if (useResponsesAPI && activeClient.client.responses?.create) {
                            try {
                                const input = [
                                    { role: 'system', content: systemPrompt },
                                    ...history,
                                    { role: 'user', content: message }
                                ];
                                const payload = {
                                    model,
                                    input,
                                    max_output_tokens: finalMaxTokens,
                                };
                                if (opts.reasoningEffort && ['low','medium','high'].includes(opts.reasoningEffort)) {
                                    payload.reasoning = { effort: opts.reasoningEffort };
                                }
                                const response = await withTimeout(activeClient.client.responses.create(payload));
                                this.lastModelUsed = model;
                                let text = response.output_text || '';
                                if (!text && Array.isArray(response.output)) {
                                    text = response.output.map(p => {
                                        if (typeof p === 'string') return p;
                                        if (p?.content && Array.isArray(p.content)) {
                                            return p.content.map(c => c.text || c.value || '').join('');
                                        }
                                        return p?.text || '';
                                    }).join('');
                                }
                                return text || '(no response)';
                            } catch (respErr) {
                                // Fall back to chat.completions if Responses API fails (e.g., unsupported model or SDK version)
                                lastErr = respErr;
                                // Intentionally continue to chat.completions path below
                            }
                        }
                        const baseMessages = [ { role: 'system', content: systemPrompt }, ...history, { role: 'user', content: message } ];
                        const response = await withTimeout(activeClient.client.chat.completions.create({
                            model,
                            messages: baseMessages,
                            max_tokens: finalMaxTokens,
                            temperature,
                            tools: this._openAIToolSchema(),
                            tool_choice: 'auto'
                        }));
                        this.lastModelUsed = model;
                        const choice = response.choices?.[0];
                        const msgObj = choice?.message;
                        if (msgObj?.tool_calls && Array.isArray(msgObj.tool_calls) && msgObj.tool_calls.length && this.config.features?.tools?.codeExec?.enabled) {
                            // Process first (or sequential) tool call(s) - restrict to a single execution cycle to avoid loops
                            const toolCall = msgObj.tool_calls[0];
                            if (toolCall.type === 'function' && toolCall.function?.name === 'code_exec') {
                                let codeArg = '';
                                try { codeArg = JSON.parse(toolCall.function.arguments || '{}').code || ''; } catch { /* ignore */ }
                                const toolResult = await this._executeCode(codeArg || '');
                                // Follow-up message to model with tool result to get final answer
                                const followUp = await withTimeout(activeClient.client.chat.completions.create({
                                    model,
                                    messages: [
                                        ...baseMessages,
                                        msgObj, // original tool call message
                                        { role: 'tool', tool_call_id: toolCall.id, content: toolResult }
                                    ],
                                    max_tokens: finalMaxTokens,
                                    temperature
                                }));
                                return followUp.choices?.[0]?.message?.content || '(no response)';
                            }
                        }
                        return msgObj?.content || '(no response)';
                    } catch (e) {
                        lastErr = e;
                        // Only attempt fallback on certain error signatures
                        const msg = (e && e.message || '').toLowerCase();
                        if (!/rate limit|timeout|model|overloaded|capacity/.test(msg)) throw e;
                    }
                }
                throw lastErr || new Error('All OpenAI models failed');
            } else if (activeClient.type === 'anthropic') {
                const model = this.config.anthropic.model || 'claude-3-5-haiku-20241022';
                const response = await withTimeout(activeClient.client.messages.create({
                    model,
                    max_tokens: finalMaxTokens,
                    system: systemPrompt,
                    messages: [ ...history, { role: 'user', content: message } ]
                }));
                this.lastModelUsed = model;
                return response.content?.[0]?.text || '(no response)';
            } else if (activeClient.type === 'ollama') {
                const answer = await this._callOllamaChat(systemPrompt, history, message, timeoutMs);
                this.lastModelUsed = this.config.ollama.model;
                return answer;
            }
        } catch (e) {
            this._lastProviderError = { provider: activeClient.type, error: e.message };
            throw e;
        }
    }

    async streamChat(message, context = {}, opts = {}, onToken) {
        // Only OpenAI streaming implemented for now
        const active = this.getActiveClient();
        if (!active || active.type !== 'openai') throw new Error('Streaming currently supported only for OpenAI');
        // NOTE: Tool (code_exec) execution cycle is NOT performed in streaming mode yet; model may emit tool_calls
        // but we ignore them to keep SSE simple. Future enhancement could intercept partial tool_call and pause stream.
        const systemPrompt = this.buildSystemPrompt(context);
        const maxHist = Math.max(0, Math.min(this.config.agent?.maxHistory || 10, 50));
        const history = this.conversationHistory.slice(-maxHist).map(h => [
            { role: 'user', content: h.message },
            { role: 'assistant', content: h.response }
        ]).flat();
        const model = this.config.openai.model || 'gpt-4o-mini';
        const temperature = opts.temperature !== undefined ? opts.temperature : 0.7;
        const max_tokens = opts.maxTokens || 2048;
        const messages = [ { role: 'system', content: systemPrompt }, ...history, { role: 'user', content: message } ];
        const isGpt5Family = /gpt-5/i.test(model);
        const useResponsesAPI = (isGpt5Family || !!opts.reasoningEffort) && active.client.responses?.create;
        const tryStream = async () => {
            if (useResponsesAPI) {
                // Attempt streaming via Responses API (may not yet be enabled for all GPT-5 models)
                try {
                    const input = messages; // Responses API accepts same shape for multi-turn (role/content)
                    const payload = { model, input, max_output_tokens: max_tokens, stream: true };
                    if (opts.reasoningEffort && ['low','medium','high'].includes(opts.reasoningEffort)) {
                        payload.reasoning = { effort: opts.reasoningEffort };
                    }
                    const stream = await active.client.responses.create(payload);
                    this.lastModelUsed = model;
                    let full = '';
                    for await (const evt of stream) {
                        // Heuristic extraction of delta text fragments
                        let delta = '';
                        if (evt?.type && /output_text/.test(evt.type)) {
                            delta = evt.delta || evt.text || '';
                        } else if (evt?.type === 'response.completed' && !full) {
                            // Some SDKs aggregate at end
                            delta = evt.response?.output_text || '';
                        }
                        if (delta) {
                            full += delta;
                            if (onToken) onToken(delta);
                        }
                    }
                    return full;
                } catch (e) {
                    // Fall back to legacy chat streaming below
                    console.warn('Responses API streaming failed, falling back to chat.completions streaming:', e.message);
                }
            }
            const stream = await active.client.chat.completions.create({ model, messages, temperature, max_tokens, stream: true });
            this.lastModelUsed = model;
            let full = '';
            for await (const chunk of stream) {
                const delta = chunk.choices?.[0]?.delta?.content;
                if (delta) {
                    full += delta;
                    if (onToken) onToken(delta);
                }
            }
            return full;
        };
        try {
            const full = await tryStream();
            this.conversationHistory.push({ timestamp: new Date().toISOString(), message, response: full, context });
            return full;
        } catch (e) {
            const msg = (e && e.message || '').toLowerCase();
            const verificationTrigger = /verification|not authorized for streaming|pending approval|requires verification/.test(msg);
            if (isGpt5Family && verificationTrigger && this.config.experimental?.gpt5StreamVerificationFallback) {
                // Retry NON streaming path as fallback
                try {
                    const nonStreamResp = await active.client.chat.completions.create({
                        model,
                        messages,
                        temperature,
                        max_tokens
                    });
                    this.lastModelUsed = model;
                    const text = nonStreamResp.choices?.[0]?.message?.content || '(no response)';
                    this.conversationHistory.push({ timestamp: new Date().toISOString(), message, response: text, context, note: 'non-stream fallback after verification error' });
                    // Provide synthetic token callback once with full text so UI still receives something
                    if (onToken) onToken(text);
                    return text;
                } catch (e2) {
                    throw new Error(e.message + ' | fallback failed: ' + e2.message);
                }
            }
            throw e;
        }
    }

    async _callOllamaChat(systemPrompt, history, message, timeoutMs) {
        if (!this.config.ollama?.enabled) throw new Error('Ollama provider disabled');
        const base = (this.config.ollama.url || 'http://localhost:11434').replace(/\/$/, '');
        const url = base + '/api/chat';
        const model = this.config.ollama.model || 'llama3';
        const msgs = [
            { role: 'system', content: systemPrompt },
            ...history,
            { role: 'user', content: message }
        ].map(m => ({ role: m.role, content: m.content }));
        const body = { model, messages: msgs, stream: false };
        const controller = new AbortController();
        const timer = setTimeout(()=>controller.abort(), Math.min(timeoutMs, this.config.ollama.timeoutMs || timeoutMs));
        let fetchImpl = (typeof fetch !== 'undefined') ? fetch : null;
        if (!fetchImpl) {
            try { fetchImpl = require('node-fetch'); } catch (_) { throw new Error('fetch not available and node-fetch not installed'); }
        }
        let resp;
        try {
            resp = await fetchImpl(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: controller.signal });
        } catch (err) {
            clearTimeout(timer);
            throw new Error('Ollama request failed: ' + err.message);
        }
        clearTimeout(timer);
        if (!resp.ok) {
            const txt = await resp.text().catch(()=>resp.statusText);
            throw new Error('Ollama HTTP ' + resp.status + ': ' + txt.slice(0,300));
        }
        let json; try { json = await resp.json(); } catch (e) { throw new Error('Invalid Ollama JSON: ' + e.message); }
        // Ollama chat returns { message: { role, content }, done: bool }
        let answer = '';
        if (json?.message?.content) answer = json.message.content;
        else if (Array.isArray(json?.message?.content)) answer = json.message.content.map(p=>p.text||p).join('\n');
        else if (json.response) answer = json.response;
        if (!answer) answer = '(no response)';
        return answer;
    }

    async analyzeError(errorOutput, buildContext = {}) {
        if (!this.config.features.errorDiagnosis) return null;

        const context = {
            type: 'error_analysis',
            errorOutput,
            buildContext,
            timestamp: new Date().toISOString()
        };

        const prompt = `ANALYZE BUILD ERROR:

Error Output:
${errorOutput}

Build Context:
${JSON.stringify(buildContext, null, 2)}

Please analyze this ESP32 build error and provide:
1. Root cause of the error
2. Specific solution steps
3. Code fixes if needed
4. Prevention tips

Focus on common ESP32/PlatformIO issues like:
- Library conflicts
- Memory overflow
- Pin configuration errors
- WiFi/BLE stack issues
- Compiler flags
- Partition table problems`;

        try {
            return await this.chat(prompt, context);
        } catch (error) {
            console.error('Error analysis failed:', error);
            return 'AI error analysis unavailable';
        }
    }

    async suggestOptimizations(buildStats, codeAnalysis = {}) {
        if (!this.config.features.buildOptimization) return null;

        const context = {
            type: 'optimization',
            buildStats,
            codeAnalysis,
            timestamp: new Date().toISOString()
        };

        const prompt = `OPTIMIZATION ANALYSIS:

Build Statistics:
${JSON.stringify(buildStats, null, 2)}

Code Analysis:
${JSON.stringify(codeAnalysis, null, 2)}

Please suggest optimizations for this ESP32 project focusing on:
1. Compilation speed improvements
2. Memory usage optimization
3. Performance enhancements
4. Power consumption reduction
5. Code quality improvements

Provide specific, actionable recommendations with code examples where applicable.`;

        try {
            return await this.chat(prompt, context);
        } catch (error) {
            console.error('Optimization analysis failed:', error);
            return 'AI optimization analysis unavailable';
        }
    }

    async analyzeCode(filePath, codeContent) {
        if (!this.config.features.codeAnalysis) return null;

        const context = {
            type: 'code_analysis',
            filePath,
            timestamp: new Date().toISOString()
        };

        const prompt = `ANALYZE ESP32 CODE:

File: ${filePath}
Code:
${codeContent}

Please analyze this ESP32 code and provide:
1. Code quality assessment
2. Potential bugs or issues
3. Performance improvements
4. Memory optimization suggestions
5. ESP32-specific best practices
6. Security considerations

Focus on ESP32/Arduino/ESP-IDF specific patterns and common pitfalls.`;

        try {
            return await this.chat(prompt, context);
        } catch (error) {
            console.error('Code analysis failed:', error);
            return 'AI code analysis unavailable';
        }
    }

    async generateDocumentation(codeContent, type = 'function') {
        if (!this.config.features.documentation) return null;

        const prompt = `Generate documentation for this ESP32 ${type}:

${codeContent}

Please provide:
1. Clear description of functionality
2. Parameter documentation
3. Return value explanation
4. Usage examples
5. Hardware dependencies (if any)
6. Performance notes

Format as markdown documentation suitable for ESP32 development.`;

        try {
            return await this.chat(prompt, { type: 'documentation', codeType: type });
        } catch (error) {
            console.error('Documentation generation failed:', error);
            return 'AI documentation generation unavailable';
        }
    }

    async getAutoSuggestions(userInput, projectState = {}) {
        if (!this.config.features.autoSuggestions) return [];

        const prompt = `Based on current project state and user input, suggest next actions:

User Input: ${userInput}
Project State: ${JSON.stringify(projectState, null, 2)}

Provide 3-5 specific, actionable suggestions for ESP32 development tasks.
Format as a JSON array of objects with 'action', 'description', and 'priority' fields.`;

        try {
            const response = await this.chat(prompt, { type: 'suggestions' });
            // Try to parse JSON response
            const jsonMatch = response.match(/\[[\s\S]*\]/);
            if (jsonMatch) {
                return JSON.parse(jsonMatch[0]);
            }
            return [];
        } catch (error) {
            console.error('Auto suggestions failed:', error);
            return [];
        }
    }

    clearHistory() {
        this.conversationHistory = [];
    }

    getHistory() {
        return this.conversationHistory;
    }

    updateConfig(newConfig) {
        // Deep merge selected sections to avoid wiping nested defaults unintentionally
        const mergeSection = (key) => {
            if (newConfig[key]) this.config[key] = { ...this.config[key], ...newConfig[key] };
        };
        mergeSection('openai');
        mergeSection('anthropic');
        mergeSection('features');
        mergeSection('editing');
        mergeSection('agent');
        mergeSection('ollama');
        if (newConfig.defaultProvider) this.config.defaultProvider = newConfig.defaultProvider;
        // Direct assignment for any other top-level primitive overrides
        Object.keys(newConfig).forEach(k => {
            if (!['openai','anthropic','features','editing','agent','defaultProvider'].includes(k)) {
                this.config[k] = newConfig[k];
            }
        });
        this.saveConfig();
        this.initializeClients();
    }

    getConfig() {
        // Return config without API keys for security
        const safeConfig = JSON.parse(JSON.stringify(this.config));
        if (safeConfig.openai.apiKey) {
            safeConfig.openai.apiKey = '***';
        }
        if (safeConfig.anthropic.apiKey) {
            safeConfig.anthropic.apiKey = '***';
        }
        return safeConfig;
    }

    async generateFileEdit(filePath, originalContent, instruction) {
        if (!this.config.features.codeEditing || !this.config.editing.enableFileEdits) {
            throw new Error('Code editing disabled');
        }
        if (!this.isAvailable()) throw new Error('AI provider not configured');
        const activeClient = this.getActiveClient();
        if (!activeClient) throw new Error('No active AI client');

        const systemPrompt = 'You are an AI pair programmer for an ESP32 firmware project. You will update a single source file given an instruction. Return ONLY JSON {"reasoning":"short rationale","content":"<full new file>"}. Preserve style, headers, includes. Make smallest necessary change.';
        const userPrompt = `PATH: ${filePath}\nINSTRUCTION: ${instruction}\nCURRENT FILE:\n<FILE>\n${originalContent}\n</FILE>`;
        let raw;
        const timeoutMs = 60000;
        const withTimeout = (p) => Promise.race([
            p,
            new Promise((_,rej)=>setTimeout(()=>rej(new Error('AI edit request timeout')), timeoutMs))
        ]);
        if (activeClient.type === 'openai') {
            const model = this.config.openai.model || 'gpt-4o-mini';
            const r = await withTimeout(activeClient.client.chat.completions.create({
                model,
                messages: [ { role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt } ],
                temperature: 0.25,
                max_tokens: 3000
            }));
            raw = r.choices?.[0]?.message?.content || '';
        } else {
            const model = this.config.anthropic.model || 'claude-3-5-haiku-20241022';
            const r = await withTimeout(activeClient.client.messages.create({
                model,
                max_tokens: 3000,
                system: systemPrompt,
                messages: [{ role: 'user', content: userPrompt }]
            }));
            raw = r.content?.[0]?.text || '';
        }
        const match = raw.match(/\{[\s\S]*\}/);
        if (!match) throw new Error('AI response missing JSON');
        let parsed; try { parsed = JSON.parse(match[0]); } catch (e) { throw new Error('Bad AI JSON: ' + e.message); }
        if (!parsed.content) throw new Error('AI JSON missing content field');
        return { reasoning: parsed.reasoning || '', content: parsed.content };
    }

    getHealth() {
        return {
            available: this.isAvailable(),
            providers: {
                openai: { enabled: this.config.openai.enabled, model: this.config.openai.model, ok: !!this.openai },
                anthropic: { enabled: this.config.anthropic.enabled, model: this.config.anthropic.model, ok: !!this.anthropic },
                ollama: { enabled: this.config.ollama.enabled, model: this.config.ollama.model, ok: !!this.config.ollama.enabled }
            },
            lastError: this._lastProviderError,
            features: this.config.features,
            editing: this.config.editing,
            agent: this.config.agent
        };
    }

    setProvider(provider) {
        if (!this.config.agent?.allowDynamicProviderSwitch) return false;
        if (!['openai','anthropic','ollama'].includes(provider)) return false;
        this.config.defaultProvider = provider;
        this.saveConfig();
        return true;
    }
}

// ---- Tool / Code Execution Helpers ----
ESP32AIAgent.prototype._openAIToolSchema = function() {
    if (!this.config.features?.tools?.codeExec?.enabled) return undefined;
    return [
        {
            type: 'function',
            function: {
                name: 'code_exec',
                description: 'Executes short, side-effect-free Python code and returns its stdout. Use for quick calculations only.',
                parameters: {
                    type: 'object',
                    properties: {
                        code: { type: 'string', description: 'Python code snippet to run' }
                    },
                    required: ['code']
                }
            }
        }
    ];
};

ESP32AIAgent.prototype._executeCode = async function(code) {
    const cfg = this.config.features?.tools?.codeExec;
    if (!cfg?.enabled) return 'code execution disabled';
    // Basic safety filters (non exhaustive)
    const dangerous = /(import\s+os|import\s+sys|subprocess|open\(|exec\(|eval\(|socket|requests|\/|\\|input\()/i;
    if (dangerous.test(code)) return 'Rejected: disallowed constructs in code';
    return await new Promise(resolve => {
        const { spawn } = require('child_process');
        const proc = spawn(cfg.python || 'python', ['-c', code], { stdio: ['ignore','pipe','pipe'], timeout: cfg.timeoutMs || 3000 });
        let out = '', err='';
        proc.stdout.on('data', d => { out += d.toString(); if (out.length > cfg.maxOutput) { out = out.slice(0,cfg.maxOutput) + '...[truncated]'; proc.kill('SIGKILL'); } });
        proc.stderr.on('data', d => { err += d.toString(); if (err.length > 400) err = err.slice(-400); });
        proc.on('error', e => resolve('Execution error: '+e.message));
        proc.on('close', codeStatus => {
            if (err && !out) out = 'stderr:\n' + err;
            resolve(out.trim() || `(exit ${codeStatus})`);
        });
        setTimeout(()=>{ try { proc.kill('SIGKILL'); resolve('Timed out'); } catch {} }, cfg.timeoutMs || 3000 + 200);
    });
};

module.exports = ESP32AIAgent;
