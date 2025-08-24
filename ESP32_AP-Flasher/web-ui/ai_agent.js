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
                model: 'gpt-4o', // Allow user to change to experimental like 'gpt-5' when available
                enabled: false
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
                experimentalModels: ['gpt-5', 'gpt-4.1-experimental', 'claude-3-opus-latest']
            },
            features: {
                codeAnalysis: true,
                errorDiagnosis: true,
                buildOptimization: true,
                autoSuggestions: true,
                documentation: true,
                codeEditing: false
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

    async chat(message, context = {}) {
        if (!this.isAvailable()) {
            throw new Error('No AI provider configured. Please set up OpenAI or Anthropic API key.');
        }

        const activeClient = this.getActiveClient();
        if (!activeClient) {
            throw new Error('No active AI client available');
        }

        try {
            const systemPrompt = this.buildSystemPrompt(context);
            const response = await this.sendMessage(activeClient, systemPrompt, message);

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

    async sendMessage(activeClient, systemPrompt, message) {
        const maxHist = Math.max(0, Math.min(this.config.agent?.maxHistory || 10, 50));
        const history = this.conversationHistory.slice(-maxHist).map(h => [
            { role: 'user', content: h.message },
            { role: 'assistant', content: h.response }
        ]).flat();
        const timeoutMs = 45000;
        const withTimeout = (p) => Promise.race([
            p,
            new Promise((_,rej)=>setTimeout(()=>rej(new Error('AI request timeout')), timeoutMs))
        ]);
        try {
            if (activeClient.type === 'openai') {
                const model = this.config.openai.model || 'gpt-4o-mini';
                const response = await withTimeout(activeClient.client.chat.completions.create({
                    model,
                    messages: [ { role: 'system', content: systemPrompt }, ...history, { role: 'user', content: message } ],
                    max_tokens: 2048,
                    temperature: 0.7
                }));
                return response.choices?.[0]?.message?.content || '(no response)';
            } else if (activeClient.type === 'anthropic') {
                const model = this.config.anthropic.model || 'claude-3-5-haiku-20241022';
                const response = await withTimeout(activeClient.client.messages.create({
                    model,
                    max_tokens: 2048,
                    system: systemPrompt,
                    messages: [ ...history, { role: 'user', content: message } ]
                }));
                return response.content?.[0]?.text || '(no response)';
            } else if (activeClient.type === 'ollama') {
                return await this._callOllamaChat(systemPrompt, history, message, timeoutMs);
            }
        } catch (e) {
            this._lastProviderError = { provider: activeClient.type, error: e.message };
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

module.exports = ESP32AIAgent;
