// OpenAI GPT-4.1 Agent API Module for ESP32 AP-Flasher
// ====================================================
//
// OPTIMIZATION FEATURES:
// - Centralized HTTP request handling with makeApiRequest()
// - Standardized file operations with performFileOperation()
// - Reusable OpenAI API calls with makeOpenAIRequest()
// - Optimized conversation history management
// - Consistent error handling patterns
// - Reduced code duplication across functions
// - Enhanced logging with level-based console output
//
// GPT-4.1 NEW FEATURES:
// - Responses API endpoint support (/v1/responses)
// - Structured Outputs with JSON schema validation
// - Advanced reasoning capabilities
// - Enhanced tool calling with better error handling
// - Multi-step reasoning for complex tasks

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

        // Load configuration
        this.loadConfiguration();

        // Function definitions for AI agent
        this.availableFunctions = {
            createFile: this.createFile.bind(this),
            readFile: this.readFile.bind(this),
            updateFile: this.updateFile.bind(this),
            deleteFile: this.deleteFile.bind(this),
            listFiles: this.listFiles.bind(this),
            executeSystemCommand: this.executeSystemCommand.bind(this),
            getSystemInfo: this.getSystemInfo.bind(this),
            manageC6Module: this.manageC6Module.bind(this),
            flashFirmware: this.flashFirmware.bind(this),
            scanNetworks: this.scanNetworks.bind(this)
        };

        this.systemPrompt = `You are an advanced AI assistant powered by GPT-4.1 for an ESP32 AP-Flasher system managing OpenEPaperLink devices. You have enhanced reasoning capabilities and can use structured outputs.

**Your Advanced Capabilities:**

1. **Complex Reasoning**: Use multi-step reasoning to analyze problems, break them down systematically, and provide comprehensive solutions
2. **Structured Outputs**: Generate JSON-compliant responses when requested, with guaranteed schema adherence
3. **Tool Integration**: Execute system functions with enhanced error handling and intelligent retry logic
4. **System Analysis**: Perform comprehensive diagnostics, pattern recognition, and optimization recommendations

**Available Functions:**
- File Management: Create, read, update, delete files with smart validation
- System Control: Execute commands, monitor performance, get detailed diagnostics
- C6 Module Management: Advanced wireless module control and optimization
- Firmware Operations: Intelligent firmware flashing, verification, and rollback
- Network Operations: Smart network analysis, optimization, and troubleshooting
- BLE/ZBS Management: Advanced wireless protocol handling
- Power Management: Intelligent power optimization and monitoring

**Response Guidelines:**
- Always explain your reasoning process for complex tasks
- Use structured outputs when dealing with configuration data
- Provide actionable recommendations based on analysis
- Handle errors gracefully with fallback strategies
- Maintain conversation context for follow-up questions

Remember: You're not just executing commands, you're providing intelligent analysis and recommendations using GPT-4.1's advanced reasoning capabilities.`;

        this.initializeUI();
    }

    // =====================================================
    // OPTIMIZED UTILITY FUNCTIONS FOR REUSE
    // =====================================================

    /**
     * Generic API request handler with standardized error handling
     * @param {string} endpoint - API endpoint
     * @param {Object} options - Fetch options
     * @param {string} operation - Operation name for logging
     * @returns {Promise<Object>} Standardized response object
     */
    async makeApiRequest(endpoint, options = {}, operation = 'API request') {
        try {
            this.logToConsole('debug', `Making ${operation} to ${endpoint}`);

            const response = await fetch(endpoint, {
                headers: {
                    'Content-Type': 'application/json',
                    ...options.headers
                },
                ...options
            });

            if (!response.ok) {
                let errorMessage = `${operation} failed: ${response.status} ${response.statusText}`;

                // Handle specific error codes
                switch (response.status) {
                    case 400:
                        errorMessage = `Bad Request (400): Invalid data format or missing required fields for ${operation}`;
                        break;
                    case 401:
                        errorMessage = `Unauthorized (401): Authentication failed for ${operation}`;
                        break;
                    case 403:
                        errorMessage = `Forbidden (403): Access denied for ${operation}`;
                        break;
                    case 404:
                        errorMessage = `Not Found (404): Endpoint not available for ${operation}`;
                        break;
                    case 500:
                        errorMessage = `Server Error (500): Internal server error during ${operation}`;
                        break;
                }

                // Try to get detailed error message from response
                try {
                    const errorText = await response.text();
                    if (errorText) {
                        errorMessage += ` - Details: ${errorText}`;
                    }
                } catch (e) {
                    // Ignore if can't read error text
                }

                throw new Error(errorMessage);
            }

            // Handle different response types
            const contentType = response.headers.get('content-type');
            let data;

            if (contentType && contentType.includes('application/json')) {
                try {
                    data = await response.json();
                } catch (jsonError) {
                    this.logToConsole('error', `Failed to parse JSON response from ${endpoint}: ${jsonError.message}`);
                    // Fallback to text response
                    try {
                        data = await response.text();
                        this.logToConsole('warn', `Using text response instead: ${data.substring(0, 100)}...`);
                    } catch (textError) {
                        throw new Error(`Failed to read response as JSON or text: ${jsonError.message}, ${textError.message}`);
                    }
                }
            } else {
                data = await response.text();
            }

            this.logToConsole('debug', `${operation} completed successfully`);
            return { success: true, data, response };

        } catch (error) {
            this.logToConsole('error', `${operation} failed: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    /**
     * Standardized file operation with consistent response format
     * @param {string} endpoint - File operation endpoint
     * @param {Object} options - Request options
     * @param {string} operation - Operation description
     * @param {Object} extraData - Additional data to include in response
     * @returns {Promise<Object>} Standardized file operation response
     */
    async performFileOperation(endpoint, options, operation, extraData = {}) {
        const result = await this.makeApiRequest(endpoint, options, operation);

        if (result.success) {
            return {
                success: true,
                message: `${operation} completed successfully`,
                ...extraData,
                data: result.data
            };
        } else {
            return {
                success: false,
                error: result.error
            };
        }
    }

    /**
     * Create standardized OpenAI API request with GPT-4.1 features
     * @param {Array} messages - Chat messages
     * @param {Array} functions - Available functions (optional)
     * @param {Object} options - Additional options for GPT-4.1
     * @returns {Promise<Object>} API response
     */
    async makeOpenAIRequest(messages, functions = null, options = {}) {
        const config = this.config?.openai || {};
        const isResponsesAPI = this.apiUrl?.includes('/responses');

        const requestBody = {
            model: this.model,
            messages: messages,
            max_tokens: this.maxTokens,
            temperature: this.temperature,
            ...options
        };

        // Add GPT-4.1 specific features
        if (this.model.startsWith('gpt-4.1')) {
            // Enable structured outputs if configured
            if (config.parameters?.structured_outputs && options.response_format) {
                requestBody.response_format = {
                    type: "json_schema",
                    json_schema: options.response_format
                };
            }

            // Enable reasoning mode if configured
            if (config.parameters?.reasoning_mode) {
                requestBody.reasoning = true;
            }
        }

        if (functions) {
            if (isResponsesAPI) {
                // Use tools format for Responses API
                requestBody.tools = functions.map(func => ({
                    type: "function",
                    function: func
                }));
                requestBody.tool_choice = "auto";
            } else {
                // Use legacy format for Chat Completions
                requestBody.functions = functions;
                requestBody.function_call = 'auto';
            }
        }

        const endpoint = isResponsesAPI ? '/api/openai/responses' : '/api/openai/chat';

        return await this.makeApiRequest(endpoint, {
            method: 'POST',
            body: JSON.stringify(requestBody)
        }, 'OpenAI API request');
    }

    /**
     * Validate and encode URL parameters
     * @param {Object} params - Parameters to encode
     * @returns {string} Encoded query string
     */
    encodeUrlParams(params) {
        return Object.entries(params)
            .filter(([key, value]) => value !== null && value !== undefined)
            .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
            .join('&');
    }

    /**
     * Add conversation message with history management
     * @param {string} role - Message role (user, assistant, function)
     * @param {string} content - Message content
     * @param {Object} extra - Extra properties (like function_call)
     */
    addToConversationHistory(role, content, extra = {}) {
        const message = { role, content, ...extra };
        this.conversationHistory.push(message);

        // Keep conversation history within limits
        const maxHistory = this.config?.esp32?.ai_agent?.conversation_history_limit || 10;
        if (this.conversationHistory.length > maxHistory) {
            this.conversationHistory = this.conversationHistory.slice(-maxHistory);
        }
    }

    /**
     * Execute action-based operation with predefined endpoint mapping
     * @param {Object} actionMap - Map of actions to endpoint configurations
     * @param {string} action - Action to perform
     * @param {Object} params - Action parameters
     * @param {string} operationName - Name for logging purposes
     * @returns {Promise<Object>} Operation result
     */
    async executeActionBasedOperation(actionMap, action, params = {}, operationName) {
        const actionConfig = actionMap[action];
        if (!actionConfig) {
            return { success: false, error: `Unknown ${operationName} action: ${action}` };
        }

        const options = { method: actionConfig.method };
        if (actionConfig.body) {
            options.body = JSON.stringify(actionConfig.body);
        }

        const result = await this.performFileOperation(
            actionConfig.endpoint,
            options,
            `${operationName} ${action}`,
            { action }
        );

        if (result.success) {
            result.result = result.data;
            delete result.data; // Clean up for consistency
        }

        return result;
    }

    // =====================================================
    // END UTILITY FUNCTIONS
    // =====================================================

    async loadConfiguration() {
        try {
            // Try to load from server first
            const result = await this.makeApiRequest('/openai_config.json', { method: 'GET' }, 'Configuration loading');

            if (result.success && result.data) {
                this.config = result.data;
                this.logToConsole('info', 'Configuration loaded from server');
            } else {
                throw new Error('Server configuration not available');
            }
        } catch (error) {
            this.logToConsole('warn', 'Server config failed, trying localStorage: ' + error.message);

            // Try localStorage fallback
            try {
                const localConfig = localStorage.getItem('openai_agent_config');
                if (localConfig) {
                    try {
                        this.config = JSON.parse(localConfig);
                        this.logToConsole('info', 'Configuration loaded from localStorage');
                    } catch (parseError) {
                        this.logToConsole('error', `Failed to parse localStorage config: ${parseError.message}`);
                        throw new Error('Invalid JSON in localStorage configuration');
                    }
                } else {
                    throw new Error('No local configuration found');
                }
            } catch (localError) {
                this.logToConsole('warn', 'Using fallback configuration: ' + localError.message);
                this.config = this.getDefaultConfig();
            }
        }

        // Validate and apply configuration
        this.validateConfiguration();
        this.applyConfiguration();
    }

    validateConfiguration() {
        if (!this.config) {
            this.config = this.getDefaultConfig();
            return;
        }

        // Ensure required structure exists
        if (!this.config.openai) {
            this.config.openai = this.getDefaultConfig().openai;
        }

        if (!this.config.esp32) {
            this.config.esp32 = this.getDefaultConfig().esp32;
        }

        // Validate API key
        if (!this.config.openai.api_key || typeof this.config.openai.api_key !== 'string') {
            this.logToConsole('warn', 'Invalid or missing API key in configuration');
        }

        // Validate model
        if (!this.config.openai.models || !this.config.openai.models.default) {
            this.config.openai.models = this.getDefaultConfig().openai.models;
        }

        // Validate parameters
        if (!this.config.openai.parameters) {
            this.config.openai.parameters = this.getDefaultConfig().openai.parameters;
        }

        this.logToConsole('info', 'Configuration validation completed');
    }

    getDefaultConfig() {
        return {
            openai: {
                api_key: 'YOUR_OPENAI_API_KEY_HERE',
                api_url: 'https://api.openai.com/v1/chat/completions',
                models: {
                    default: 'gpt-4.1',
                    alternatives: ['gpt-4.1-mini', 'gpt-4.1-nano', 'gpt-4o', 'gpt-3.5-turbo']
                },
                parameters: {
                    max_tokens: 4096,
                    temperature: 0.7,
                    top_p: 1.0,
                    structured_outputs: true,
                    tool_calling: true,
                    reasoning_mode: false
                },
                endpoints: {
                    chat_completions: 'https://api.openai.com/v1/chat/completions',
                    responses: 'https://api.openai.com/v1/responses'
                }
            },
            esp32: {
                ai_agent: {
                    enabled: true,
                    conversation_history_limit: 10,
                    response_timeout: 30,
                    structured_output_schema: true
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
            // Validate configuration before saving
            if (!this.config || typeof this.config !== 'object') {
                throw new Error('Invalid configuration object');
            }

            let configString;
            try {
                configString = JSON.stringify(this.config, null, 2);
            } catch (stringifyError) {
                throw new Error(`Failed to serialize configuration: ${stringifyError.message}`);
            }

            // First try to save to server using proper endpoint
            const result = await this.makeApiRequest('/littlefs_put', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: new URLSearchParams({
                    path: '/openai_config.json',
                    file: new Blob([configString], { type: 'application/json' })
                })
            }, 'Configuration saving');

            if (result.success) {
                this.logToConsole('info', 'Configuration saved successfully to server');
                return { success: true };
            } else {
                throw new Error(result.error);
            }
        } catch (error) {
            this.logToConsole('warn', 'Server save failed, using fallback: ' + error.message);

            // Fallback: Save to localStorage for client-side persistence
            try {
                const configString = JSON.stringify(this.config);
                localStorage.setItem('openai_agent_config', configString);
                this.logToConsole('info', 'Configuration saved to local storage as fallback');
                return { success: true, fallback: true };
            } catch (localError) {
                this.logToConsole('error', 'Failed to save configuration: ' + localError.message);
                return { success: false, error: localError.message };
            }
        }
    }

    initializeUI() {
        this.createAgentInterface();
        this.setupEventListeners();
        this.logToConsole('info', 'OpenAI Agent initialized successfully');
    }

    createAgentInterface() {
        const agentHTML = `
            <div id="openai-agent-panel" class="agent-panel" style="display: none;">
                <div class="agent-header">
                    <h3>🤖 OpenAI Agent Assistant</h3>
                    <button class="btn btn-sm" onclick="openAIAgent.togglePanel()">✕</button>
                </div>

                <div class="agent-content">
                    <div class="agent-chat" id="agent-chat">
                        <div class="agent-message system">
                            <strong>GPT-4.1 AI Assistant:</strong> Hello! I'm your advanced AI assistant powered by GPT-4.1 for managing the ESP32 AP-Flasher system.
                            I can help you with intelligent system analysis, structured data processing, advanced reasoning tasks,
                            and comprehensive device management. What would you like me to help you with?
                        </div>
                    </div>

                    <div class="agent-input-area">
                        <div class="agent-suggestions">
                            <button class="suggestion-btn" onclick="openAIAgent.sendPredefinedMessage('List all files in the system')">
                                📁 List Files
                            </button>
                            <button class="suggestion-btn" onclick="openAIAgent.sendPredefinedMessage('Check C6 module status')">
                                🔧 C6 Status
                            </button>
                            <button class="suggestion-btn" onclick="openAIAgent.sendPredefinedMessage('Get system information')">
                                ℹ️ System Info
                            </button>
                            <button class="suggestion-btn" onclick="openAIAgent.sendPredefinedMessage('Scan available networks')">
                                📡 Scan Networks
                            </button>
                        </div>

                        <div class="agent-input-container">
                            <textarea id="agent-input" placeholder="Ask me anything about your ESP32 system..."
                                     rows="2" onkeydown="openAIAgent.handleKeyPress(event)"></textarea>
                            <button id="agent-send-btn" onclick="openAIAgent.sendMessage()" class="btn btn-primary">
                                Send
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <button id="agent-toggle-btn" onclick="openAIAgent.togglePanel()" class="floating-agent-btn">
                🤖 GPT-4.1 Assistant
            </button>
        `;

        // Add to page
        document.body.insertAdjacentHTML('beforeend', agentHTML);

        // Add CSS styles
        this.addAgentStyles();
    }

    addAgentStyles() {
        // Dynamically load the CSS file
        if (!document.getElementById('openai-agent-css')) {
            const link = document.createElement('link');
            link.id = 'openai-agent-css';
            link.rel = 'stylesheet';
            link.type = 'text/css';
            link.href = 'openai-agent.css';
            document.head.appendChild(link);
        }
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
        const message = input.value.trim();

        if (!message || this.isProcessing) return;

        // Clear input
        input.value = '';

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
            this.addMessageToChat('error', `Error: ${error.message}`);
        } finally {
            this.isProcessing = false;
        }
    }

    async processMessage(userMessage) {
        // Add to conversation history
        this.addToConversationHistory('user', userMessage);

        // Prepare messages for API
        const messages = [
            { role: 'system', content: this.systemPrompt },
            ...this.conversationHistory.slice(-10) // Keep last 10 messages for context
        ];

        // Define functions for the AI agent
        const functions = [
            // === BASIC SYSTEM FUNCTIONS ===
            {
                name: 'createFile',
                description: 'Create a new file in the system',
                parameters: {
                    type: 'object',
                    properties: {
                        path: { type: 'string', description: 'File path' },
                        content: { type: 'string', description: 'File content' }
                    },
                    required: ['path', 'content']
                }
            },
            {
                name: 'readFile',
                description: 'Read contents of a file',
                parameters: {
                    type: 'object',
                    properties: {
                        path: { type: 'string', description: 'File path to read' }
                    },
                    required: ['path']
                }
            },
            {
                name: 'updateFile',
                description: 'Update an existing file',
                parameters: {
                    type: 'object',
                    properties: {
                        path: { type: 'string', description: 'File path' },
                        content: { type: 'string', description: 'New file content' }
                    },
                    required: ['path', 'content']
                }
            },
            {
                name: 'deleteFile',
                description: 'Delete a file from the system',
                parameters: {
                    type: 'object',
                    properties: {
                        path: { type: 'string', description: 'File path to delete' }
                    },
                    required: ['path']
                }
            },
            {
                name: 'listFiles',
                description: 'List files in a directory',
                parameters: {
                    type: 'object',
                    properties: {
                        directory: { type: 'string', description: 'Directory path', default: '/' }
                    }
                }
            },
            {
                name: 'getSystemInfo',
                description: 'Get system information',
                parameters: { type: 'object', properties: {} }
            },
            {
                name: 'manageC6Module',
                description: 'Control ESP32-C6 module operations',
                parameters: {
                    type: 'object',
                    properties: {
                        action: {
                            type: 'string',
                            description: 'C6 module action',
                            enum: ['status', 'restart', 'update', 'settings']
                        },
                        params: { type: 'object', description: 'Action parameters' }
                    },
                    required: ['action']
                }
            },
            {
                name: 'flashFirmware',
                description: 'Flash firmware to devices',
                parameters: {
                    type: 'object',
                    properties: {
                        type: { type: 'string', description: 'Firmware type' },
                        file: { type: 'string', description: 'Firmware file path' }
                    },
                    required: ['type', 'file']
                }
            },
            {
                name: 'scanNetworks',
                description: 'Scan for available WiFi networks',
                parameters: { type: 'object', properties: {} }
            },

            // === SERIAL AP FUNCTIONS ===
            {
                name: 'getSerialAPStatus',
                description: 'Get status of Serial Access Point functionality',
                parameters: { type: 'object', properties: {} }
            },
            {
                name: 'controlSerialAP',
                description: 'Control Serial Access Point operations',
                parameters: {
                    type: 'object',
                    properties: {
                        action: {
                            type: 'string',
                            description: 'AP action',
                            enum: ['start', 'stop', 'reset', 'configure', 'setChannel', 'setPower']
                        },
                        channel: { type: 'number', description: 'Radio channel (1-11 for 2.4GHz)', minimum: 1, maximum: 11 },
                        power: { type: 'number', description: 'Transmission power (0-20 dBm)', minimum: 0, maximum: 20 },
                        config: { type: 'object', description: 'Configuration parameters for AP' }
                    },
                    required: ['action']
                }
            },

            // === UDP COMMUNICATION ===
            {
                name: 'getUDPStatus',
                description: 'Get UDP communication status and statistics',
                parameters: { type: 'object', properties: {} }
            },
            {
                name: 'sendUDPMessage',
                description: 'Send UDP message to network devices',
                parameters: {
                    type: 'object',
                    properties: {
                        target: { type: 'string', description: 'Target IP address or broadcast' },
                        message: { type: 'string', description: 'Message to send' },
                        port: { type: 'number', description: 'Target port', default: 1818 }
                    },
                    required: ['target', 'message']
                }
            },

            // === WIFI MANAGER FUNCTIONS ===
            {
                name: 'getWiFiStatus',
                description: 'Get detailed WiFi manager status and connection info',
                parameters: { type: 'object', properties: {} }
            },
            {
                name: 'manageWiFi',
                description: 'Manage WiFi connections and configuration',
                parameters: {
                    type: 'object',
                    properties: {
                        action: {
                            type: 'string',
                            description: 'WiFi action',
                            enum: ['connect', 'disconnect', 'scan', 'startAP', 'stopAP', 'reconnect', 'forget']
                        },
                        ssid: { type: 'string', description: 'WiFi network SSID' },
                        password: { type: 'string', description: 'WiFi network password' },
                        save: { type: 'boolean', description: 'Save credentials for auto-connect', default: true }
                    },
                    required: ['action']
                }
            },

            // === ZBS INTERFACE (ZigBee) ===
            {
                name: 'getZBSStatus',
                description: 'Get ZBS (ZigBee) interface status and connected devices',
                parameters: { type: 'object', properties: {} }
            },
            {
                name: 'controlZBSInterface',
                description: 'Control ZBS interface operations',
                parameters: {
                    type: 'object',
                    properties: {
                        action: {
                            type: 'string',
                            description: 'ZBS action',
                            enum: ['reset', 'scan', 'connect', 'disconnect', 'flash', 'read', 'write']
                        },
                        target: { type: 'string', description: 'Target device address' },
                        data: { type: 'string', description: 'Data for read/write operations' },
                        address: { type: 'string', description: 'Memory address for read/write' }
                    },
                    required: ['action']
                }
            },

            // === SWD PROGRAMMING ===
            {
                name: 'getSWDStatus',
                description: 'Get SWD (Serial Wire Debug) interface status',
                parameters: { type: 'object', properties: {} }
            },
            {
                name: 'controlSWDInterface',
                description: 'Control SWD programming interface for nRF52 devices',
                parameters: {
                    type: 'object',
                    properties: {
                        action: {
                            type: 'string',
                            description: 'SWD action',
                            enum: ['connect', 'disconnect', 'read', 'write', 'erase', 'program', 'verify', 'reset']
                        },
                        target: { type: 'string', description: 'Target device (nRF52832, nRF52840, etc.)' },
                        address: { type: 'string', description: 'Memory address for operations' },
                        data: { type: 'string', description: 'Data for write operations' },
                        file: { type: 'string', description: 'Firmware file for programming' }
                    },
                    required: ['action']
                }
            },

            // === BLE FUNCTIONS ===
            {
                name: 'getBLEStatus',
                description: 'Get Bluetooth Low Energy status and connected devices',
                parameters: { type: 'object', properties: {} }
            },
            {
                name: 'controlBLE',
                description: 'Control BLE operations and device management',
                parameters: {
                    type: 'object',
                    properties: {
                        action: {
                            type: 'string',
                            description: 'BLE action',
                            enum: ['scan', 'connect', 'disconnect', 'advertise', 'stopAdvertise', 'filter', 'write']
                        },
                        deviceAddress: { type: 'string', description: 'BLE device MAC address' },
                        serviceUUID: { type: 'string', description: 'BLE service UUID' },
                        characteristicUUID: { type: 'string', description: 'BLE characteristic UUID' },
                        data: { type: 'string', description: 'Data to write' },
                        filter: { type: 'object', description: 'BLE scan filter parameters' }
                    },
                    required: ['action']
                }
            },

            // === SPIFFS EDITOR ===
            {
                name: 'manageSPIFFS',
                description: 'Manage SPIFFS filesystem operations',
                parameters: {
                    type: 'object',
                    properties: {
                        action: {
                            type: 'string',
                            description: 'SPIFFS action',
                            enum: ['format', 'info', 'check', 'repair', 'backup', 'restore', 'analyze']
                        },
                        path: { type: 'string', description: 'File path for specific operations' }
                    },
                    required: ['action']
                }
            },

            // === ADVANCED SYSTEM FUNCTIONS ===
            {
                name: 'performSystemDiagnostic',
                description: 'Run comprehensive system diagnostic checks',
                parameters: {
                    type: 'object',
                    properties: {
                        level: {
                            type: 'string',
                            description: 'Diagnostic level',
                            enum: ['basic', 'detailed', 'full'],
                            default: 'detailed'
                        },
                        components: {
                            type: 'array',
                            items: { type: 'string' },
                            description: 'Specific components to test (empty = all)'
                        }
                    }
                }
            },
            {
                name: 'configureSystem',
                description: 'Configure system settings and parameters',
                parameters: {
                    type: 'object',
                    properties: {
                        component: {
                            type: 'string',
                            description: 'Component to configure',
                            enum: ['wifi', 'led', 'serial', 'tag', 'c6', 'ble', 'udp', 'system']
                        },
                        settings: { type: 'object', description: 'Configuration settings object' },
                        save: { type: 'boolean', description: 'Save configuration permanently', default: true }
                    },
                    required: ['component', 'settings']
                }
            }
        ];

        // Call OpenAI API via ESP32 proxy
        const result = await this.makeOpenAIRequest(messages, functions);

        if (!result.success) {
            throw new Error(result.error);
        }

        const assistantMessage = result.data.choices[0].message;

        // Check if AI wants to call a function/tool
        if (assistantMessage.function_call || assistantMessage.tool_calls) {
            let functionName, functionArgs;

            try {
                // Handle both legacy function_call and new tool_calls formats
                if (assistantMessage.tool_calls) {
                    // New Responses API format
                    const toolCall = assistantMessage.tool_calls[0];
                    functionName = toolCall.function.name;
                    try {
                        functionArgs = JSON.parse(toolCall.function.arguments);
                    } catch (parseError) {
                        this.logToConsole('error', `Failed to parse tool call arguments: ${toolCall.function.arguments}`);
                        throw new Error(`Invalid JSON in tool call arguments: ${parseError.message}`);
                    }
                } else {
                    // Legacy format
                    functionName = assistantMessage.function_call.name;
                    try {
                        functionArgs = JSON.parse(assistantMessage.function_call.arguments);
                    } catch (parseError) {
                        this.logToConsole('error', `Failed to parse function call arguments: ${assistantMessage.function_call.arguments}`);
                        throw new Error(`Invalid JSON in function call arguments: ${parseError.message}`);
                    }
                }
            } catch (error) {
                this.logToConsole('error', `Function call parsing error: ${error.message}`);
                return `Sorry, I encountered an error parsing the function call: ${error.message}. Please try rephrasing your request.`;
            }

            let argsDisplay;
            try {
                argsDisplay = JSON.stringify(functionArgs);
            } catch (displayError) {
                argsDisplay = '[Complex arguments - display error]';
                this.logToConsole('warn', `Failed to display function arguments: ${displayError.message}`);
            }

            this.addMessageToChat('function', `Executing: ${functionName}(${argsDisplay})`);

            // Execute the function
            const functionResult = await this.executeFunction(functionName, functionArgs);

            // Add function result to conversation with proper format
            let functionResultString;
            try {
                functionResultString = JSON.stringify(functionResult);
            } catch (stringifyError) {
                this.logToConsole('error', `Failed to stringify function result: ${stringifyError.message}`);
                functionResultString = JSON.stringify({
                    error: 'Failed to serialize function result',
                    originalError: stringifyError.message
                });
            }

            if (assistantMessage.tool_calls) {
                this.addToConversationHistory('assistant', null, { tool_calls: assistantMessage.tool_calls });
                this.addToConversationHistory('tool', functionResultString, {
                    tool_call_id: assistantMessage.tool_calls[0].id
                });
            } else {
                this.addToConversationHistory('assistant', null, { function_call: assistantMessage.function_call });
                this.addToConversationHistory('function', functionResultString, { name: functionName });
            }

            // Get AI's response to the function result
            const followUpResponse = await this.getFollowUpResponse();
            return followUpResponse;
        } else {
            // Regular text response
            this.addToConversationHistory('assistant', assistantMessage.content);
            return assistantMessage.content;
        }
    }

    async getFollowUpResponse() {
        const messages = [
            { role: 'system', content: this.systemPrompt },
            ...this.conversationHistory.slice(-10)
        ];

        const result = await this.makeOpenAIRequest(messages);

        if (!result.success) {
            throw new Error(result.error);
        }

        const content = result.data.choices[0].message.content;
        this.addToConversationHistory('assistant', content);

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

    // Function implementations
    async createFile(args) {
        const { path, content } = args;
        return await this.performFileOperation('/create_file', {
            method: 'POST',
            body: JSON.stringify({ path, content })
        }, `File creation: ${path}`, { path });
    }

    async readFile(args) {
        const { path } = args;
        const result = await this.performFileOperation(
            `/read_file?path=${encodeURIComponent(path)}`,
            { method: 'GET' },
            `File reading: ${path}`,
            { path }
        );

        if (result.success) {
            result.content = result.data;
            delete result.data; // Clean up for consistency
        }

        return result;
    }

    async updateFile(args) {
        const { path, content } = args;
        return await this.performFileOperation('/update_file', {
            method: 'POST',
            body: JSON.stringify({ path, content })
        }, `File update: ${path}`, { path });
    }

    async deleteFile(args) {
        const { path } = args;
        return await this.performFileOperation(
            `/delete_file?path=${encodeURIComponent(path)}`,
            { method: 'DELETE' },
            `File deletion: ${path}`,
            { path }
        );
    }

    async listFiles(args) {
        const { directory = '/' } = args;
        const result = await this.performFileOperation(
            `/list_files?dir=${encodeURIComponent(directory)}`,
            { method: 'GET' },
            `Directory listing: ${directory}`,
            { directory }
        );

        if (result.success) {
            result.files = result.data;
            delete result.data; // Clean up for consistency
        }

        return result;
    }

    async getSystemInfo() {
        const result = await this.performFileOperation('/sysinfo', { method: 'GET' }, 'System info retrieval');

        if (result.success) {
            result.systemInfo = result.data;
            delete result.data; // Clean up for consistency
        }

        return result;
    }

    async manageC6Module(args) {
        const { action, params = {} } = args;

        // Define endpoint mapping for C6 actions
        const actionMap = {
            'status': { endpoint: '/ap_list', method: 'GET' },
            'restart': { endpoint: '/restart_c6', method: 'POST' },
            'update': { endpoint: '/update_c6', method: 'POST', body: params },
            'settings': { endpoint: '/get_c6_settings', method: 'GET' }
        };

        return await this.executeActionBasedOperation(actionMap, action, params, 'C6');
    }

    async executeSystemCommand(args) {
        const { command } = args;
        return await this.performFileOperation('/execute_command', {
            method: 'POST',
            body: JSON.stringify({ command })
        }, `System command: ${command}`, { command });
    }

    async flashFirmware(args) {
        const { type, file } = args;
        const result = await this.performFileOperation('/flash_firmware', {
            method: 'POST',
            body: JSON.stringify({ type, file })
        }, `Firmware flash: ${type}`, { type, file });

        if (result.success) {
            result.result = result.data;
            delete result.data; // Clean up for consistency
        }

        return result;
    }

    async scanNetworks() {
        try {
            // Prefer global apiManager unified scan helper if available
            if (window.apiManager && typeof window.apiManager.unifiedScan === 'function') {
                const scanData = await window.apiManager.unifiedScan({ maxWaitMs: 15000, pollIntervalMs: 1200 });
                return { success: true, networks: scanData.networks || [], meta: {
                    networkCount: scanData.networkCount || (scanData.networks ? scanData.networks.length : 0),
                    source: 'unified'
                }};
            }

            // Fallback: manual unified endpoint sequence
            await fetch('/api/wifi/scan', { method: 'POST' });
            let attempts = 0;
            let data = null;
            while (attempts < 12) { // up to ~15s
                const resp = await fetch('/api/wifi/scan/results');
                data = await resp.json();
                if (!data.scanRunning) break;
                await new Promise(r => setTimeout(r, 1200));
                attempts++;
            }
            if (!data || data.scanRunning) {
                return { success: false, error: 'Scan timeout' };
            }
            return { success: true, networks: data.networks || [], meta: { networkCount: data.networkCount || (data.networks ? data.networks.length : 0), source: 'unified-fallback' } };
        } catch (e) {
            return { success: false, error: e.message };
        }
    }

    // UI Helper methods
    addMessageToChat(type, content) {
        const chat = document.getElementById('agent-chat');
        const messageDiv = document.createElement('div');
        messageDiv.className = `agent-message ${type}`;

        if (type === 'user') {
            messageDiv.innerHTML = `<strong>You:</strong> ${content}`;
        } else if (type === 'assistant') {
            messageDiv.innerHTML = `<strong>AI Assistant:</strong> ${this.formatContent(content)}`;
        } else if (type === 'function') {
            messageDiv.innerHTML = `<strong>Function:</strong> ${content}`;
        } else if (type === 'error') {
            messageDiv.innerHTML = `<strong>Error:</strong> ${content}`;
        }

        chat.appendChild(messageDiv);
        chat.scrollTop = chat.scrollHeight;
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
        typingDiv.className = 'agent-message typing-indicator';
        typingDiv.innerHTML = `
            <strong>AI Assistant:</strong>
            <span class="typing-dots">
                <span class="typing-dot"></span>
                <span class="typing-dot"></span>
                <span class="typing-dot"></span>
            </span>
        `;

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
        const logMessage = `[${timestamp}] [OpenAI Agent] [${level.toUpperCase()}] ${message}`;

        // Console logging based on level
        switch (level.toLowerCase()) {
            case 'error':
                console.error(logMessage);
                break;
            case 'warn':
                console.warn(logMessage);
                break;
            case 'debug':
                console.debug(logMessage);
                break;
            default:
                console.log(logMessage);
        }

        // Also log to diagnostics console if available
        if (typeof logToConsole === 'function') {
            logToConsole(level, `[AI Agent] ${message}`);
        }
    }
}

// Initialize the OpenAI Agent
let openAIAgent;

document.addEventListener('DOMContentLoaded', function () {
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
