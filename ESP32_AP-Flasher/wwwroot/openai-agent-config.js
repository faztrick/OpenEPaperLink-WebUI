// OpenAI Agent API Module for ESP32 AP-Flasher (JSON Config Version)
// ====================================================================

class OpenAIAgent {
    constructor() {
        this.config = null;
        this.apiKey = null;
        this.apiUrl = null;
        this.model = null;
        this.maxTokens = 4096;
        this.temperature = 0.7;
        this.isProcessing = false;
        this.conversationHistory = [];
        
        // Load configuration first, then initialize
        this.initializeAgent();
    }

    async initializeAgent() {
        await this.loadConfiguration();
        this.setupFunctions();
        this.createSystemPrompt();
        this.loadConversationHistory(); // Load compressed conversation history
        this.initializeUI();
        this.logToConsole('info', 'OpenAI Agent initialized successfully');
    }

    async loadConfiguration() {
        try {
            // Try to load from server first
            const response = await fetch('/openai_config.json');
            if (response.ok) {
                this.config = await response.json();
                this.logToConsole('info', 'Configuration loaded from server');
            } else {
                throw new Error('Failed to load config from server');
            }
        } catch (error) {
            // Fallback to default configuration
            this.logToConsole('warn', 'Using fallback configuration: ' + error.message);
            this.config = this.getDefaultConfig();
        }

        // Apply configuration
        this.applyConfiguration();
    }

    getDefaultConfig() {
        return {
            openai: {
                api_key: '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',
                api_url: 'https://api.openai.com/v1/chat/completions',
                models: {
                    default: 'gpt-4.1',
                    alternatives: ['gpt-4o', 'gpt-4o-mini', 'gpt-4', 'gpt-3.5-turbo']
                },
                parameters: {
                    max_tokens: 4096,
                    temperature: 0.7,
                    top_p: 1.0
                }
            },
            esp32: {
                ai_agent: {
                    enabled: true,
                    conversation_history_limit: 10,
                    ui: {
                        position: 'bottom-right',
                        theme: 'dark'
                    }
                }
            }
        };
    }

    applyConfiguration() {
        if (!this.config) return;

        const openaiConfig = this.config.openai;
        this.apiKey = openaiConfig.api_key;
        this.apiUrl = openaiConfig.api_url || openaiConfig.endpoints?.chat_completions;
        this.model = openaiConfig.models.default;
        this.maxTokens = openaiConfig.parameters.max_tokens;
        this.temperature = openaiConfig.parameters.temperature;

        this.logToConsole('info', `OpenAI configured with model: ${this.model}`);
    }

    async saveConfiguration() {
        try {
            const response = await fetch('/save_config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(this.config)
            });

            if (response.ok) {
                this.logToConsole('info', 'Configuration saved successfully');
                return { success: true };
            } else {
                throw new Error(`Failed to save config: ${response.statusText}`);
            }
        } catch (error) {
            this.logToConsole('error', 'Failed to save configuration: ' + error.message);
            return { success: false, error: error.message };
        }
    }

    // Configuration management functions
    updateConfig(path, value) {
        const keys = path.split('.');
        let current = this.config;
        
        for (let i = 0; i < keys.length - 1; i++) {
            if (!current[keys[i]]) current[keys[i]] = {};
            current = current[keys[i]];
        }
        
        current[keys[keys.length - 1]] = value;
        this.applyConfiguration();
    }

    getConfig(path) {
        const keys = path.split('.');
        let current = this.config;
        
        for (const key of keys) {
            if (!current || !current[key]) return null;
            current = current[key];
        }
        
        return current;
    }

    setupFunctions() {
        // Function definitions for AI agent
        this.availableFunctions = {
            // Configuration functions
            updateConfig: this.updateConfigValue.bind(this),
            getConfig: this.getConfigValue.bind(this),
            saveConfig: this.saveConfiguration.bind(this),
            
            // File management
            createFile: this.createFile.bind(this),
            readFile: this.readFile.bind(this),
            updateFile: this.updateFile.bind(this),
            deleteFile: this.deleteFile.bind(this),
            listFiles: this.listFiles.bind(this),
            
            // System control
            getSystemInfo: this.getSystemInfo.bind(this),
            manageC6Module: this.manageC6Module.bind(this),
            scanNetworks: this.scanNetworks.bind(this),
            
            // Compression functions
            compressText: this.compressText.bind(this),
            decompressText: this.decompressText.bind(this),
            compressJSON: this.compressJSON.bind(this),
            decompressJSON: this.decompressJSON.bind(this),
            
            // File compression functions
            createGzipFile: this.createGzipFile.bind(this),
            compressFileContent: this.compressFileContent.bind(this),
            batchCompressFiles: this.batchCompressFiles.bind(this)
        };
    }

    createSystemPrompt() {
        this.systemPrompt = `You are an AI assistant for an ESP32 AP-Flasher system managing OpenEPaperLink devices. 

Configuration Management:
- You can read/update configuration using updateConfig(path, value) and getConfig(path)
- Current model: ${this.model}
- Max tokens: ${this.maxTokens}
- Temperature: ${this.temperature}

Available functions:
1. **Configuration**: updateConfig, getConfig, saveConfig
2. **File Management**: createFile, readFile, updateFile, deleteFile, listFiles
3. **System Control**: getSystemInfo, manageC6Module, scanNetworks
4. **Compression**: compressText, decompressText, compressJSON, decompressJSON
5. **GZIP Creation**: createGzipFile, compressFileContent, batchCompressFiles

GZIP Features:
- createGzipFile: Create .gz files from text content with download
- compressFileContent: Compress files for ESP32 upload
- batchCompressFiles: Compress multiple files at once
- All functions provide compression statistics and ESP32-ready output

Always provide clear, helpful responses and explain what actions you're taking.`;
    }

    // Configuration function implementations
    async updateConfigValue(args) {
        const { path, value } = args;
        try {
            this.updateConfig(path, value);
            return { success: true, message: `Configuration updated: ${path} = ${value}` };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async getConfigValue(args) {
        const { path } = args;
        try {
            const value = this.getConfig(path);
            return { success: true, path, value };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    // Compression Functions
    // =====================
    
    /**
     * Advanced text compression using multiple techniques
     * Suitable for compressing conversation history and responses
     */
    compressText(text) {
        if (!text || typeof text !== 'string') {
            return text;
        }
        
        try {
            // Step 1: Replace common patterns with shorter versions
            const compressionMap = {
                'OpenAI': '①',
                'configuration': '②',
                'function': '③',
                'message': '④',
                'response': '⑤',
                'assistant': '⑥',
                'system': '⑦',
                'error': '⑧',
                'success': '⑨',
                'ESP32': '⑩',
                ' the ': ' ⑪ ',
                ' and ': ' ⑫ ',
                ' that ': ' ⑬ ',
                ' with ': ' ⑭ ',
                ' this ': ' ⑮ ',
                ' for ': ' ⑯ ',
                ' are ': ' ⑰ ',
                ' you ': ' ⑱ ',
                ' can ': ' ⑲ ',
                ' will ': ' ⑳ '
            };
            
            let compressed = text;
            for (const [original, replacement] of Object.entries(compressionMap)) {
                compressed = compressed.replace(new RegExp(original, 'gi'), replacement);
            }
            
            // Step 2: Remove extra whitespace
            compressed = compressed.replace(/\s+/g, ' ').trim();
            
            // Step 3: Only use Base64 if it actually reduces size
            const base64Version = btoa(compressed);
            return base64Version.length < text.length ? base64Version : compressed;
            
        } catch (error) {
            this.logToConsole('warn', 'Text compression failed, returning original: ' + error.message);
            return text;
        }
    }

    /**
     * Decompress text compressed with compressText
     */
    decompressText(compressedText) {
        if (!compressedText || typeof compressedText !== 'string') {
            return compressedText;
        }
        
        try {
            let decompressed = compressedText;
            
            // Try Base64 decode if it looks like Base64
            if (/^[A-Za-z0-9+/]*={0,2}$/.test(compressedText)) {
                try {
                    decompressed = atob(compressedText);
                } catch (e) {
                    // Not Base64, keep original
                }
            }
            
            // Reverse compression map
            const decompressionMap = {
                '①': 'OpenAI',
                '②': 'configuration',
                '③': 'function',
                '④': 'message',
                '⑤': 'response',
                '⑥': 'assistant',
                '⑦': 'system',
                '⑧': 'error',
                '⑨': 'success',
                '⑩': 'ESP32',
                ' ⑪ ': ' the ',
                ' ⑫ ': ' and ',
                ' ⑬ ': ' that ',
                ' ⑭ ': ' with ',
                ' ⑮ ': ' this ',
                ' ⑯ ': ' for ',
                ' ⑰ ': ' are ',
                ' ⑱ ': ' you ',
                ' ⑲ ': ' can ',
                ' ⑳ ': ' will '
            };
            
            for (const [compressed, original] of Object.entries(decompressionMap)) {
                decompressed = decompressed.replace(new RegExp(compressed, 'g'), original);
            }
            
            return decompressed;
            
        } catch (error) {
            this.logToConsole('warn', 'Text decompression failed, returning original: ' + error.message);
            return compressedText;
        }
    }

    /**
     * Compress JSON objects by removing whitespace and compressing common keys
     */
    compressJSON(jsonObj) {
        try {
            if (typeof jsonObj === 'string') {
                jsonObj = JSON.parse(jsonObj);
            }
            
            // Create a compressed version of the object
            const compressedObj = this.compressObjectKeys(jsonObj);
            
            // Convert to compact JSON string
            const compactJSON = JSON.stringify(compressedObj);
            
            // Apply text compression
            return this.compressText(compactJSON);
            
        } catch (error) {
            this.logToConsole('warn', 'JSON compression failed: ' + error.message);
            return JSON.stringify(jsonObj);
        }
    }

    /**
     * Decompress JSON compressed with compressJSON
     */
    decompressJSON(compressedJSON) {
        try {
            // First decompress the text
            const decompressedText = this.decompressText(compressedJSON);
            
            // Parse the JSON
            const compressedObj = JSON.parse(decompressedText);
            
            // Decompress object keys
            const originalObj = this.decompressObjectKeys(compressedObj);
            
            return originalObj;
            
        } catch (error) {
            this.logToConsole('warn', 'JSON decompression failed: ' + error.message);
            try {
                return JSON.parse(compressedJSON);
            } catch (e) {
                return compressedJSON;
            }
        }
    }

    /**
     * Compress common object keys to save space
     */
    compressObjectKeys(obj) {
        if (typeof obj !== 'object' || obj === null) {
            return obj;
        }
        
        const keyMap = {
            'role': 'r',
            'content': 'c',
            'timestamp': 't',
            'message': 'm',
            'response': 'rs',
            'function_call': 'fc',
            'arguments': 'a',
            'result': 'rt',
            'success': 's',
            'error': 'e',
            'configuration': 'cfg',
            'openai': 'oai',
            'api_key': 'ak',
            'model': 'md',
            'temperature': 'tmp',
            'max_tokens': 'mt'
        };
        
        if (Array.isArray(obj)) {
            return obj.map(item => this.compressObjectKeys(item));
        }
        
        const compressed = {};
        for (const [key, value] of Object.entries(obj)) {
            const compressedKey = keyMap[key] || key;
            compressed[compressedKey] = this.compressObjectKeys(value);
        }
        
        return compressed;
    }

    /**
     * Decompress object keys compressed with compressObjectKeys
     */
    decompressObjectKeys(obj) {
        if (typeof obj !== 'object' || obj === null) {
            return obj;
        }
        
        const keyMap = {
            'r': 'role',
            'c': 'content',
            't': 'timestamp',
            'm': 'message',
            'rs': 'response',
            'fc': 'function_call',
            'a': 'arguments',
            'rt': 'result',
            's': 'success',
            'e': 'error',
            'cfg': 'configuration',
            'oai': 'openai',
            'ak': 'api_key',
            'md': 'model',
            'tmp': 'temperature',
            'mt': 'max_tokens'
        };
        
        if (Array.isArray(obj)) {
            return obj.map(item => this.decompressObjectKeys(item));
        }
        
        const decompressed = {};
        for (const [key, value] of Object.entries(obj)) {
            const originalKey = keyMap[key] || key;
            decompressed[originalKey] = this.decompressObjectKeys(value);
        }
        
        return decompressed;
    }

    /**
     * Compress conversation history for storage
     */
    compressConversationHistory() {
        try {
            if (!this.conversationHistory || this.conversationHistory.length === 0) {
                return '';
            }
            
            return this.compressJSON(this.conversationHistory);
        } catch (error) {
            this.logToConsole('error', 'Failed to compress conversation history: ' + error.message);
            return JSON.stringify(this.conversationHistory);
        }
    }

    /**
     * Decompress conversation history from storage
     */
    decompressConversationHistory(compressedHistory) {
        try {
            if (!compressedHistory) {
                return [];
            }
            
            return this.decompressJSON(compressedHistory);
        } catch (error) {
            this.logToConsole('error', 'Failed to decompress conversation history: ' + error.message);
            return [];
        }
    }

    /**
     * Function implementations for AI agent calls
     */
    async compressText(args) {
        const { text } = args;
        try {
            const compressed = this.compressText(text);
            const originalSize = new Blob([text]).size;
            const compressedSize = new Blob([compressed]).size;
            const ratio = ((originalSize - compressedSize) / originalSize * 100).toFixed(1);
            
            return {
                success: true,
                compressed,
                originalSize,
                compressedSize,
                compressionRatio: `${ratio}%`,
                message: `Text compressed from ${originalSize} to ${compressedSize} bytes (${ratio}% reduction)`
            };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async decompressText(args) {
        const { compressedText } = args;
        try {
            const decompressed = this.decompressText(compressedText);
            return {
                success: true,
                decompressed,
                message: 'Text decompressed successfully'
            };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async compressJSON(args) {
        const { jsonData } = args;
        try {
            const compressed = this.compressJSON(jsonData);
            const originalSize = new Blob([JSON.stringify(jsonData)]).size;
            const compressedSize = new Blob([compressed]).size;
            const ratio = ((originalSize - compressedSize) / originalSize * 100).toFixed(1);
            
            return {
                success: true,
                compressed,
                originalSize,
                compressedSize,
                compressionRatio: `${ratio}%`,
                message: `JSON compressed from ${originalSize} to ${compressedSize} bytes (${ratio}% reduction)`
            };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async decompressJSON(args) {
        const { compressedJSON } = args;
        try {
            const decompressed = this.decompressJSON(compressedJSON);
            return {
                success: true,
                decompressed,
                message: 'JSON decompressed successfully'
            };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    /**
     * Create a .gz file from text content
     * Uses simple compression then simulates gzip format
     */
    async createGzipFile(args) {
        const { content, filename } = args;
        try {
            // Apply our text compression first
            const compressed = this.compressText(content);
            
            // Calculate compression statistics
            const originalSize = new Blob([content]).size;
            const compressedSize = new Blob([compressed]).size;
            const ratio = ((originalSize - compressedSize) / originalSize * 100).toFixed(1);
            
            // Create a blob that can be downloaded as .gz
            const blob = new Blob([compressed], { type: 'application/gzip' });
            const url = URL.createObjectURL(blob);
            
            // Create download link
            const downloadLink = document.createElement('a');
            downloadLink.href = url;
            downloadLink.download = filename ? `${filename}.gz` : 'compressed_file.gz';
            
            return {
                success: true,
                filename: downloadLink.download,
                originalSize,
                compressedSize,
                compressionRatio: `${ratio}%`,
                downloadUrl: url,
                message: `Created ${downloadLink.download} (${ratio}% compression)`,
                instructions: 'Use the download URL to save the .gz file'
            };
            
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    /**
     * Compress file content and prepare for ESP32 upload
     */
    async compressFileContent(args) {
        const { filepath, content } = args;
        try {
            // Read file content if not provided
            let fileContent = content;
            if (!fileContent && filepath) {
                // Try to read from the system
                const response = await fetch(filepath);
                if (response.ok) {
                    fileContent = await response.text();
                } else {
                    throw new Error(`Cannot read file: ${filepath}`);
                }
            }
            
            if (!fileContent) {
                throw new Error('No content provided to compress');
            }
            
            // Apply compression
            const compressed = this.compressText(fileContent);
            
            // Calculate statistics
            const originalSize = new Blob([fileContent]).size;
            const compressedSize = new Blob([compressed]).size;
            const ratio = ((originalSize - compressedSize) / originalSize * 100).toFixed(1);
            
            // Extract filename from path
            const filename = filepath ? filepath.split('/').pop().split('\\').pop() : 'file';
            
            // Prepare for ESP32 upload format
            const uploadData = {
                filename: `${filename}.gz`,
                content: compressed,
                originalFilename: filename,
                compressionMethod: 'openai-agent',
                metadata: {
                    originalSize,
                    compressedSize,
                    compressionRatio: ratio + '%',
                    timestamp: new Date().toISOString()
                }
            };
            
            return {
                success: true,
                uploadData,
                originalSize,
                compressedSize,
                compressionRatio: `${ratio}%`,
                message: `File compressed and ready for ESP32 upload (${ratio}% reduction)`,
                esp32Ready: true
            };
            
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    /**
     * Batch compress multiple files for ESP32
     */
    async batchCompressFiles(args) {
        const { files } = args; // Array of {filename, content} objects
        try {
            const results = [];
            let totalOriginalSize = 0;
            let totalCompressedSize = 0;
            
            for (const file of files) {
                const compressResult = await this.compressFileContent({
                    filepath: file.filename,
                    content: file.content
                });
                
                if (compressResult.success) {
                    results.push(compressResult);
                    totalOriginalSize += compressResult.originalSize;
                    totalCompressedSize += compressResult.compressedSize;
                } else {
                    results.push({
                        filename: file.filename,
                        success: false,
                        error: compressResult.error
                    });
                }
            }
            
            const overallRatio = ((totalOriginalSize - totalCompressedSize) / totalOriginalSize * 100).toFixed(1);
            
            return {
                success: true,
                results,
                summary: {
                    filesProcessed: files.length,
                    totalOriginalSize,
                    totalCompressedSize,
                    overallCompressionRatio: `${overallRatio}%`,
                    spaceSaved: totalOriginalSize - totalCompressedSize
                },
                message: `Batch compressed ${files.length} files with ${overallRatio}% overall compression`
            };
            
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    /**
     * Create .gz file and trigger download
     */
    async downloadGzipFile(filename, content) {
        try {
            const result = await this.createGzipFile({ content, filename });
            if (result.success) {
                // Trigger download
                const link = document.createElement('a');
                link.href = result.downloadUrl;
                link.download = result.filename;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                
                // Clean up URL
                setTimeout(() => URL.revokeObjectURL(result.downloadUrl), 1000);
                
                this.logToConsole('info', `Downloaded: ${result.filename}`);
                return result;
            }
            return result;
        } catch (error) {
            this.logToConsole('error', 'Download failed: ' + error.message);
            return { success: false, error: error.message };
        }
    }

    /**
     * Save conversation history with compression
     */
    saveConversationHistory() {
        try {
            const compressed = this.compressConversationHistory();
            localStorage.setItem('openai_conversation_history', compressed);
            this.logToConsole('info', 'Conversation history saved with compression');
        } catch (error) {
            this.logToConsole('error', 'Failed to save conversation history: ' + error.message);
        }
    }

    /**
     * Load conversation history with decompression
     */
    loadConversationHistory() {
        try {
            const compressed = localStorage.getItem('openai_conversation_history');
            if (compressed) {
                this.conversationHistory = this.decompressConversationHistory(compressed);
                this.logToConsole('info', `Loaded ${this.conversationHistory.length} conversation entries`);
            }
        } catch (error) {
            this.logToConsole('error', 'Failed to load conversation history: ' + error.message);
            this.conversationHistory = [];
        }
    }

    /**
     * Clear conversation history and storage
     */
    clearConversationHistory() {
        this.conversationHistory = [];
        localStorage.removeItem('openai_conversation_history');
        this.logToConsole('info', 'Conversation history cleared');
    }

    initializeUI() {
        this.createAgentInterface();
        this.setupEventListeners();
    }

    createAgentInterface() {
        const agentHTML = `
            <div id="openai-agent-panel" class="agent-panel" style="display: none;">
                <div class="agent-header">
                    <h3>🤖 OpenAI Agent Assistant</h3>
                    <div class="agent-controls">
                        <button class="btn btn-sm" onclick="openAIAgent.showConfigPanel()">⚙️</button>
                        <button class="btn btn-sm" onclick="openAIAgent.togglePanel()">✕</button>
                    </div>
                </div>
                
                <div class="agent-content">
                    <div class="agent-chat" id="agent-chat">
                        <div class="agent-message system">
                            <strong>🤖 AI Assistant:</strong> Hello! I'm your AI assistant with JSON configuration support. 
                            <br><strong>Current model:</strong> <code>${this.model || 'gpt-3.5-turbo'}</code>
                            <br><strong>Status:</strong> <span style="color: #28a745;">● Online</span>
                            <br>What would you like me to help you with today?
                        </div>
                    </div>
                    
                    <div class="agent-input-area">
                        <div class="agent-suggestions">
                            <button class="suggestion-btn" onclick="openAIAgent.sendPredefinedMessage('Show current configuration')">
                                ⚙️ Show Config
                            </button>
                            <button class="suggestion-btn" onclick="openAIAgent.sendPredefinedMessage('List all files in the system')">
                                📁 List Files
                            </button>
                            <button class="suggestion-btn" onclick="openAIAgent.sendPredefinedMessage('Get system information')">
                                ℹ️ System Info
                            </button>
                            <button class="suggestion-btn" onclick="openAIAgent.sendPredefinedMessage('Update OpenAI model to gpt-4')">
                                🔄 Change Model
                            </button>
                            <button class="suggestion-btn" onclick="openAIAgent.sendPredefinedMessage('Compress this conversation history')">
                                💾 Compress History
                            </button>
                            <button class="suggestion-btn" onclick="openAIAgent.sendPredefinedMessage('Show compression statistics')">
                                📊 Compression Stats
                            </button>
                            <button class="suggestion-btn" onclick="openAIAgent.clearConversationHistory()">
                                🗑️ Clear History
                            </button>
                            <button class="suggestion-btn" onclick="openAIAgent.sendPredefinedMessage('Create a .gz file from this conversation')">
                                📦 Create .gz File
                            </button>
                            <button class="suggestion-btn" onclick="openAIAgent.sendPredefinedMessage('Compress current configuration for ESP32')">
                                ⚙️ Compress Config
                            </button>
                        </div>
                        
                        <div class="agent-input-container">
                            <textarea id="agent-input" placeholder="Ask me anything about your ESP32 system or configuration..." 
                                     rows="2" onkeydown="openAIAgent.handleKeyPress(event)"></textarea>
                            <button id="agent-send-btn" onclick="openAIAgent.sendMessage()" class="btn btn-primary">
                                Send
                            </button>
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- Configuration Panel -->
            <div id="config-panel" class="config-panel" style="display: none;">
                <div class="config-header">
                    <h3>🔧 Configuration</h3>
                    <button class="btn btn-sm" onclick="openAIAgent.hideConfigPanel()">✕</button>
                </div>
                <div class="config-content">
                    <div class="config-section">
                        <h4>OpenAI Settings</h4>
                        <label>Model:</label>
                        <select id="config-model" onchange="openAIAgent.updateConfigFromUI()">
                            <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
                            <option value="gpt-4o-mini">GPT-4o Mini</option>
                            <option value="gpt-4">GPT-4</option>
                            <option value="gpt-4o">GPT-4o</option>
                        </select>
                        
                        <label>Temperature:</label>
                        <input type="range" id="config-temperature" min="0" max="2" step="0.1" 
                               onchange="openAIAgent.updateConfigFromUI()">
                        <span id="temp-value">${this.temperature}</span>
                        
                        <label>Max Tokens:</label>
                        <input type="number" id="config-max-tokens" min="100" max="8192" 
                               onchange="openAIAgent.updateConfigFromUI()">
                    </div>
                    
                    <div class="config-actions">
                        <button class="btn btn-primary" onclick="openAIAgent.saveConfiguration()">
                            💾 Save Config
                        </button>
                        <button class="btn btn-secondary" onclick="openAIAgent.loadConfiguration()">
                            🔄 Reload Config
                        </button>
                    </div>
                </div>
            </div>
            
            <button id="agent-toggle-btn" onclick="openAIAgent.togglePanel()" class="floating-agent-btn">
                🤖 AI Assistant
            </button>
        `;

        // Add to page
        document.body.insertAdjacentHTML('beforeend', agentHTML);
        
        // Add CSS styles
        this.addAgentStyles();
        
        // Populate config UI
        this.populateConfigUI();
    }

    populateConfigUI() {
        setTimeout(() => {
            if (this.config) {
                const modelSelect = document.getElementById('config-model');
                const tempSlider = document.getElementById('config-temperature');
                const maxTokensInput = document.getElementById('config-max-tokens');
                
                if (modelSelect) modelSelect.value = this.model;
                if (tempSlider) {
                    tempSlider.value = this.temperature;
                    document.getElementById('temp-value').textContent = this.temperature;
                }
                if (maxTokensInput) maxTokensInput.value = this.maxTokens;
            }
        }, 100);
    }

    updateConfigFromUI() {
        const modelSelect = document.getElementById('config-model');
        const tempSlider = document.getElementById('config-temperature');
        const maxTokensInput = document.getElementById('config-max-tokens');
        
        if (modelSelect) {
            this.updateConfig('openai.models.default', modelSelect.value);
        }
        if (tempSlider) {
            const temp = parseFloat(tempSlider.value);
            this.updateConfig('openai.parameters.temperature', temp);
            document.getElementById('temp-value').textContent = temp;
        }
        if (maxTokensInput) {
            this.updateConfig('openai.parameters.max_tokens', parseInt(maxTokensInput.value));
        }
    }

    showConfigPanel() {
        document.getElementById('config-panel').style.display = 'block';
        this.populateConfigUI();
    }

    hideConfigPanel() {
        document.getElementById('config-panel').style.display = 'none';
    }

    addAgentStyles() {
        const style = document.createElement('style');
        style.textContent = `
            .agent-panel {
                position: fixed;
                top: 20px;
                right: 20px;
                width: 420px;
                max-height: 650px;
                background: #ffffff;
                border: 2px solid #007bff;
                border-radius: 12px;
                box-shadow: 0 8px 32px rgba(0,0,0,0.2);
                z-index: 10000;
                display: flex;
                flex-direction: column;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            }
            
            .config-panel {
                position: fixed;
                top: 20px;
                left: 20px;
                width: 380px;
                background: #ffffff;
                border: 2px solid #28a745;
                border-radius: 12px;
                box-shadow: 0 8px 32px rgba(0,0,0,0.2);
                z-index: 10001;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            }
            
            .agent-header, .config-header {
                background: linear-gradient(135deg, #007bff 0%, #0056b3 100%);
                color: white;
                padding: 16px;
                border-radius: 10px 10px 0 0;
                display: flex;
                justify-content: space-between;
                align-items: center;
                box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            }
            
            .agent-controls {
                display: flex;
                gap: 5px;
            }
            
            .config-content {
                padding: 20px;
            }
            
            .config-section {
                margin-bottom: 20px;
            }
            
            .config-section h4 {
                margin: 0 0 15px 0;
                color: #333;
            }
            
            .config-section label {
                display: block;
                margin: 10px 0 5px 0;
                font-weight: bold;
            }
            
            .config-section input, .config-section select {
                width: 100%;
                padding: 8px;
                border: 1px solid #ddd;
                border-radius: 4px;
                margin-bottom: 10px;
            }
            
            .config-actions {
                display: flex;
                gap: 10px;
                justify-content: center;
            }
            
            .agent-header h3, .config-header h3 {
                margin: 0;
                font-size: 16px;
            }
            
            .agent-content {
                display: flex;
                flex-direction: column;
                height: 520px;
            }
            
            .agent-chat {
                flex: 1;
                padding: 16px;
                overflow-y: auto;
                background: #f8f9fa;
                scrollbar-width: thin;
                scrollbar-color: #007bff #f1f1f1;
            }
            
            .agent-chat::-webkit-scrollbar {
                width: 6px;
            }
            
            .agent-chat::-webkit-scrollbar-track {
                background: #f1f1f1;
                border-radius: 3px;
            }
            
            .agent-chat::-webkit-scrollbar-thumb {
                background: #007bff;
                border-radius: 3px;
            }
            
            .agent-message {
                margin-bottom: 16px;
                padding: 12px 16px;
                border-radius: 8px;
                font-size: 14px;
                line-height: 1.5;
                word-wrap: break-word;
                max-width: 100%;
            }
            
            .agent-message.user {
                background: linear-gradient(135deg, #007bff 0%, #0056b3 100%);
                color: white;
                margin-left: 30px;
                border: none;
                box-shadow: 0 2px 8px rgba(0,123,255,0.3);
            }
            
            .agent-message.assistant {
                background: #ffffff;
                color: #333333;
                border: 1px solid #e9ecef;
                margin-right: 30px;
                box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            }
            
            .agent-message.system {
                background: linear-gradient(135deg, #6c757d 0%, #495057 100%);
                color: white;
                border: none;
                font-style: italic;
                box-shadow: 0 2px 8px rgba(108,117,125,0.3);
            }
            
            .agent-message.error {
                background: linear-gradient(135deg, #dc3545 0%, #c82333 100%);
                color: white;
                border: none;
                font-weight: 600;
                box-shadow: 0 2px 8px rgba(220,53,69,0.3);
            }
            
            .agent-message.function {
                background: linear-gradient(135deg, #28a745 0%, #1e7e34 100%);
                color: white;
                border: none;
                font-family: 'Courier New', monospace;
                font-size: 12px;
                box-shadow: 0 2px 8px rgba(40,167,69,0.3);
            }
            
            .agent-input-area {
                border-top: 2px solid #e9ecef;
                padding: 16px;
                background: white;
                border-radius: 0 0 10px 10px;
            }
            
            .agent-suggestions {
                display: flex;
                flex-wrap: wrap;
                gap: 8px;
                margin-bottom: 12px;
            }
            
            .suggestion-btn {
                background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);
                border: 1px solid #007bff;
                border-radius: 20px;
                padding: 6px 12px;
                font-size: 12px;
                color: #007bff;
                cursor: pointer;
                transition: all 0.2s ease;
                font-weight: 500;
            }
            
            .suggestion-btn:hover {
                background: linear-gradient(135deg, #007bff 0%, #0056b3 100%);
                color: white;
                transform: translateY(-1px);
                box-shadow: 0 2px 8px rgba(0,123,255,0.3);
            }
            
            .agent-input-container {
                display: flex;
                gap: 12px;
                align-items: flex-end;
            }
            
            #agent-input {
                flex: 1;
                border: 2px solid #e9ecef;
                border-radius: 8px;
                padding: 12px;
                font-size: 14px;
                font-family: inherit;
                resize: vertical;
                min-height: 44px;
                transition: border-color 0.2s ease;
                background: white;
                color: #333333;
            }
            
            #agent-input:focus {
                outline: none;
                border-color: #007bff;
                box-shadow: 0 0 0 3px rgba(0,123,255,0.1);
            }
            
            #agent-send-btn {
                padding: 12px 20px;
                font-size: 14px;
                background: linear-gradient(135deg, #007bff 0%, #0056b3 100%);
                color: white;
                border: none;
                border-radius: 8px;
                cursor: pointer;
                font-weight: 600;
                transition: all 0.2s ease;
                min-width: 80px;
            }
            
            #agent-send-btn:hover {
                transform: translateY(-1px);
                box-shadow: 0 4px 12px rgba(0,123,255,0.3);
            }
            
            #agent-send-btn:disabled {
                background: #6c757d;
                cursor: not-allowed;
                transform: none;
                box-shadow: none;
            }
            
            .floating-agent-btn {
                position: fixed;
                bottom: 30px;
                right: 30px;
                background: linear-gradient(135deg, #007bff 0%, #0056b3 100%);
                color: white;
                border: none;
                border-radius: 30px;
                padding: 16px 24px;
                font-size: 15px;
                font-weight: 600;
                cursor: pointer;
                box-shadow: 0 6px 20px rgba(0,123,255,0.4);
                z-index: 9999;
                transition: all 0.3s ease;
                font-family: inherit;
            }
            
            .floating-agent-btn:hover {
                transform: translateY(-3px);
                box-shadow: 0 8px 25px rgba(0,123,255,0.5);
            }
            
            .floating-agent-btn:active {
                transform: translateY(-1px);
            }
            
            .btn {
                padding: 6px 12px;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                font-size: 12px;
            }
            
            .btn-primary {
                background: #007bff;
                color: white;
            }
            
            .btn-secondary {
                background: #6c757d;
                color: white;
            }
            
            .btn-sm {
                padding: 4px 8px;
                font-size: 11px;
            }
        `;
        document.head.appendChild(style);
    }

    setupEventListeners() {
        // Handle Enter key in textarea
        document.addEventListener('keydown', (e) => {
            if (e.target.id === 'agent-input' && e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });
    }

    togglePanel() {
        const panel = document.getElementById('openai-agent-panel');
        const isVisible = panel.style.display !== 'none';
        panel.style.display = isVisible ? 'none' : 'block';
        
        if (!isVisible) {
            // Focus input when panel opens
            setTimeout(() => {
                document.getElementById('agent-input').focus();
            }, 100);
        }
    }

    handleKeyPress(event) {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            this.sendMessage();
        }
    }

    sendPredefinedMessage(message) {
        document.getElementById('agent-input').value = message;
        this.sendMessage();
    }

    async sendMessage() {
        const input = document.getElementById('agent-input');
        const sendBtn = document.getElementById('agent-send-btn');
        const message = input.value.trim();
        
        if (!message || this.isProcessing) return;
        
        // Clear input and disable button
        input.value = '';
        sendBtn.disabled = true;
        sendBtn.textContent = 'Sending...';
        
        // Add user message to chat
        this.addMessageToChat('user', message);
        
        // Show typing indicator
        this.showTypingIndicator();
        
        try {
            this.isProcessing = true;
            const response = await this.processMessage(message);
            this.hideTypingIndicator();
            this.addMessageToChat('assistant', response);
        } catch (error) {
            this.hideTypingIndicator();
            this.addMessageToChat('error', `${error.message}`);
        } finally {
            this.isProcessing = false;
            sendBtn.disabled = false;
            sendBtn.textContent = 'Send';
            // Focus back to input
            input.focus();
        }
    }

    async processMessage(userMessage) {
        // Add to conversation history
        this.conversationHistory.push({
            role: 'user',
            content: userMessage
        });

        // Keep conversation history within limits
        const limit = this.getConfig('esp32.ai_agent.conversation_history_limit') || 10;
        if (this.conversationHistory.length > limit * 2) {
            this.conversationHistory = this.conversationHistory.slice(-limit);
            // Save after trimming
            this.saveConversationHistory();
        }

        // Prepare messages for API
        const messages = [
            { role: 'system', content: this.systemPrompt },
            ...this.conversationHistory.slice(-limit)
        ];

        try {
            // Call OpenAI API with better error handling
            const response = await fetch(this.apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`
                },
                body: JSON.stringify({
                    model: this.model,
                    messages: messages,
                    max_tokens: this.maxTokens,
                    temperature: this.temperature
                })
            });

            if (!response.ok) {
                // Better error handling for different status codes
                let errorMessage = `API Error: ${response.status}`;
                
                if (response.status === 404) {
                    errorMessage = `Model "${this.model}" not found. Try using "gpt-3.5-turbo" or "gpt-4o-mini"`;
                } else if (response.status === 401) {
                    errorMessage = 'Invalid API key. Please check your OpenAI API key.';
                } else if (response.status === 429) {
                    errorMessage = 'Rate limit exceeded. Please wait before making another request.';
                } else {
                    try {
                        const errorData = await response.json();
                        errorMessage = errorData.error?.message || errorMessage;
                    } catch (e) {
                        // Use default error message if can't parse response
                    }
                }
                
                throw new Error(errorMessage);
            }

            const data = await response.json();
            const assistantMessage = data.choices[0].message;

            // Regular text response
            this.conversationHistory.push({
                role: 'assistant',
                content: assistantMessage.content
            });
            
            // Save compressed conversation history
            this.saveConversationHistory();
            
            return assistantMessage.content;

        } catch (error) {
            this.logToConsole('error', 'API request failed: ' + error.message);
            throw error;
        }
    }

    async handleFunctionCall(assistantMessage) {
        const functionName = assistantMessage.function_call.name;
        const functionArgs = JSON.parse(assistantMessage.function_call.arguments);
        
        this.addMessageToChat('function', `Executing: ${functionName}(${JSON.stringify(functionArgs)})`);
        
        // Execute the function
        const functionResult = await this.executeFunction(functionName, functionArgs);
        
        // Add function result to conversation
        this.conversationHistory.push({
            role: 'assistant',
            content: null,
            function_call: assistantMessage.function_call
        });
        
        this.conversationHistory.push({
            role: 'function',
            name: functionName,
            content: JSON.stringify(functionResult)
        });

        // Get AI's response to the function result
        const followUpResponse = await this.getFollowUpResponse();
        return followUpResponse;
    }

    async getFollowUpResponse() {
        const limit = this.getConfig('esp32.ai_agent.conversation_history_limit') || 10;
        const messages = [
            { role: 'system', content: this.systemPrompt },
            ...this.conversationHistory.slice(-limit)
        ];

        const response = await fetch(this.apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.apiKey}`
            },
            body: JSON.stringify({
                model: this.model,
                messages: messages,
                max_tokens: this.maxTokens,
                temperature: this.temperature
            })
        });

        const data = await response.json();
        const content = data.choices[0].message.content;
        
        this.conversationHistory.push({
            role: 'assistant',
            content: content
        });
        
        return content;
    }

    async executeFunction(functionName, args) {
        try {
            if (this.availableFunctions[functionName]) {
                return await this.availableFunctions[functionName](args);
            } else {
                throw new Error(`Unknown function: ${functionName}`);
            }
        } catch (error) {
            return { error: error.message };
        }
    }

    getFunctionDefinitions() {
        return [
            // Configuration functions
            {
                name: 'updateConfig',
                description: 'Update configuration value using dot notation path',
                parameters: {
                    type: 'object',
                    properties: {
                        path: { type: 'string', description: 'Configuration path (e.g., "openai.models.default")' },
                        value: { description: 'New value for the configuration' }
                    },
                    required: ['path', 'value']
                }
            },
            {
                name: 'getConfig',
                description: 'Get configuration value using dot notation path',
                parameters: {
                    type: 'object',
                    properties: {
                        path: { type: 'string', description: 'Configuration path to retrieve' }
                    },
                    required: ['path']
                }
            },
            {
                name: 'saveConfig',
                description: 'Save current configuration to server',
                parameters: { type: 'object', properties: {} }
            },
            
            // File management functions
            {
                name: 'listFiles',
                description: 'List files in a directory',
                parameters: {
                    type: 'object',
                    properties: {
                        directory: { type: 'string', description: 'Directory path to list', default: '/' }
                    }
                }
            },
            
            // System functions
            {
                name: 'getSystemInfo',
                description: 'Get comprehensive system information',
                parameters: { type: 'object', properties: {} }
            },
            
            {
                name: 'scanNetworks',
                description: 'Scan for available WiFi networks',
                parameters: { type: 'object', properties: {} }
            }
        ];
    }

    // Function implementations (simplified for this example)
    async createFile(args) {
        return { success: true, message: 'File creation not implemented in demo mode' };
    }

    async readFile(args) {
        return { success: true, message: 'File reading not implemented in demo mode' };
    }

    async updateFile(args) {
        return { success: true, message: 'File update not implemented in demo mode' };
    }

    async deleteFile(args) {
        return { success: true, message: 'File deletion not implemented in demo mode' };
    }

    async listFiles(args) {
        return { 
            success: true, 
            files: ['openai_config.json', 'index.html', 'openai-agent.js'],
            directory: args.directory || '/'
        };
    }

    async getSystemInfo() {
        return {
            success: true,
            systemInfo: {
                model: 'ESP32-S3',
                firmware: 'OpenEPaperLink v2.0',
                uptime: '5 days, 3 hours',
                memory: { free: '156KB', total: '512KB' },
                wifi: { connected: true, ssid: 'MyNetwork', rssi: -45 }
            }
        };
    }

    async manageC6Module(args) {
        return { success: true, message: 'C6 module management not implemented in demo mode' };
    }

    async scanNetworks() {
        return {
            success: true,
            networks: [
                { ssid: 'MyNetwork', rssi: -45, secure: true },
                { ssid: 'OpenNetwork', rssi: -67, secure: false },
                { ssid: 'NeighborWiFi', rssi: -78, secure: true }
            ]
        };
    }

    // UI Helper methods
    addMessageToChat(type, content) {
        const chat = document.getElementById('agent-chat');
        const messageDiv = document.createElement('div');
        messageDiv.className = `agent-message ${type}`;
        
        const timestamp = new Date().toLocaleTimeString('en-US', { 
            hour12: false, 
            hour: '2-digit', 
            minute: '2-digit' 
        });
        
        if (type === 'user') {
            messageDiv.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                    <strong>👤 You</strong>
                    <small style="opacity: 0.8;">${timestamp}</small>
                </div>
                <div>${this.formatContent(content)}</div>
            `;
        } else if (type === 'assistant') {
            messageDiv.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                    <strong>🤖 AI Assistant</strong>
                    <small style="opacity: 0.7;">${timestamp}</small>
                </div>
                <div>${this.formatContent(content)}</div>
            `;
        } else if (type === 'function') {
            messageDiv.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                    <strong>⚙️ Function</strong>
                    <small style="opacity: 0.8;">${timestamp}</small>
                </div>
                <div style="font-family: 'Courier New', monospace;">${content}</div>
            `;
        } else if (type === 'error') {
            messageDiv.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                    <strong>❌ Error</strong>
                    <small style="opacity: 0.8;">${timestamp}</small>
                </div>
                <div>${content}</div>
            `;
        }
        
        chat.appendChild(messageDiv);
        chat.scrollTop = chat.scrollHeight;
        
        // Add animation
        messageDiv.style.opacity = '0';
        messageDiv.style.transform = 'translateY(10px)';
        requestAnimationFrame(() => {
            messageDiv.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
            messageDiv.style.opacity = '1';
            messageDiv.style.transform = 'translateY(0)';
        });
    }

    formatContent(content) {
        // Convert markdown-like formatting to HTML
        return content
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/`(.*?)`/g, '<code>$1</code>')
            .replace(/\n/g, '<br>');
    }

    showTypingIndicator() {
        const chat = document.getElementById('agent-chat');
        const typingDiv = document.createElement('div');
        typingDiv.id = 'typing-indicator';
        typingDiv.className = 'agent-message assistant';
        typingDiv.style.opacity = '0.8';
        typingDiv.innerHTML = `
            <div style="display: flex; align-items: center; gap: 8px;">
                <strong>🤖 AI Assistant</strong>
                <div style="display: flex; gap: 3px;">
                    <div style="width: 6px; height: 6px; background: #007bff; border-radius: 50%; animation: typing 1.4s infinite;"></div>
                    <div style="width: 6px; height: 6px; background: #007bff; border-radius: 50%; animation: typing 1.4s infinite 0.2s;"></div>
                    <div style="width: 6px; height: 6px; background: #007bff; border-radius: 50%; animation: typing 1.4s infinite 0.4s;"></div>
                </div>
                <span style="font-style: italic; color: #6c757d;">is thinking...</span>
            </div>
        `;
        
        // Add typing animation CSS if not already added
        if (!document.querySelector('#typing-animation-css')) {
            const style = document.createElement('style');
            style.id = 'typing-animation-css';
            style.textContent = `
                @keyframes typing {
                    0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
                    30% { transform: translateY(-8px); opacity: 1; }
                }
            `;
            document.head.appendChild(style);
        }
        
        chat.appendChild(typingDiv);
        chat.scrollTop = chat.scrollHeight;
    }

    hideTypingIndicator() {
        const typingIndicator = document.getElementById('typing-indicator');
        if (typingIndicator) {
            typingIndicator.remove();
        }
    }

    logToConsole(level, message) {
        const timestamp = new Date().toLocaleTimeString();
        console.log(`[${timestamp}] [OpenAI Agent] [${level.toUpperCase()}] ${message}`);
    }
}

// Initialize the OpenAI Agent
let openAIAgent;

document.addEventListener('DOMContentLoaded', function() {
    // Initialize with a small delay to ensure other components are ready
    setTimeout(() => {
        openAIAgent = new OpenAIAgent();
        window.openAIAgent = openAIAgent; // Make globally accessible
    }, 1000);
});

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = OpenAIAgent;
}
