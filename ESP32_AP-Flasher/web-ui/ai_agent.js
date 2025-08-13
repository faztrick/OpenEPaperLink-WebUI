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

        // Context about the ESP32 project
        this.projectContext = {
            platform: 'ESP32-S3',
            framework: 'Arduino/ESP-IDF',
            buildSystem: 'PlatformIO',
            features: ['RGB LEDs', 'BLE', 'SubGHz Radio', 'WiFi'],  // TFT Display removed
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
                apiKey: process.env.OPENAI_API_KEY || '',
                model: 'gpt-4o',
                enabled: false
            },
            anthropic: {
                apiKey: process.env.ANTHROPIC_API_KEY || '',
                model: 'claude-3-5-sonnet-20241022',
                enabled: false
            },
            defaultProvider: 'openai',
            features: {
                codeAnalysis: true,
                errorDiagnosis: true,
                buildOptimization: true,
                autoSuggestions: true,
                documentation: true
            }
        };
    }

    saveConfig() {
        const configPath = path.join(__dirname, 'ai_config.json');
        fs.writeFileSync(configPath, JSON.stringify(this.config, null, 2));
    }

    initializeClients() {
        if (this.config.openai.apiKey && this.config.openai.enabled) {
            try {
                this.openai = new OpenAI({ apiKey: this.config.openai.apiKey });
                console.log('✓ OpenAI client initialized');
            } catch (error) {
                console.error('Failed to initialize OpenAI:', error.message);
            }
        }

        if (this.config.anthropic.apiKey && this.config.anthropic.enabled) {
            try {
                this.anthropic = new Anthropic({ apiKey: this.config.anthropic.apiKey });
                console.log('✓ Anthropic client initialized');
            } catch (error) {
                console.error('Failed to initialize Anthropic:', error.message);
            }
        }
    }

    isAvailable() {
        return (this.openai || this.anthropic) &&
            (this.config.openai.enabled || this.config.anthropic.enabled);
    }

    getActiveClient() {
        if (this.config.defaultProvider === 'anthropic' && this.anthropic) {
            return { client: this.anthropic, type: 'anthropic' };
        }
        if (this.openai) {
            return { client: this.openai, type: 'openai' };
        }
        if (this.anthropic) {
            return { client: this.anthropic, type: 'anthropic' };
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
- Debug hardware interface problems (BLE, WiFi, etc.)  // TFT removed
- Recommend best practices for embedded development

Always provide practical, actionable advice specific to ESP32 development.
Include code examples when helpful, and consider power consumption, memory usage, and real-time constraints.
Be concise but thorough in your explanations.`;
    }

    async sendMessage(activeClient, systemPrompt, message) {
        if (activeClient.type === 'openai') {
            const response = await activeClient.client.chat.completions.create({
                model: this.config.openai.model,
                messages: [
                    { role: 'system', content: systemPrompt },
                    ...this.conversationHistory.slice(-10).map(h => [
                        { role: 'user', content: h.message },
                        { role: 'assistant', content: h.response }
                    ]).flat(),
                    { role: 'user', content: message }
                ],
                max_tokens: 2048,
                temperature: 0.7
            });
            return response.choices[0].message.content;
        } else if (activeClient.type === 'anthropic') {
            const response = await activeClient.client.messages.create({
                model: this.config.anthropic.model,
                max_tokens: 2048,
                system: systemPrompt,
                messages: [
                    ...this.conversationHistory.slice(-10).map(h => [
                        { role: 'user', content: h.message },
                        { role: 'assistant', content: h.response }
                    ]).flat(),
                    { role: 'user', content: message }
                ]
            });
            return response.content[0].text;
        }
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
        this.config = { ...this.config, ...newConfig };
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
}

module.exports = ESP32AIAgent;
