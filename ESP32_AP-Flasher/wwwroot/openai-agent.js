// OpenAI Agent API Module for ESP32 AP-Flasher
// ================================================

class OpenAIAgent {
    constructor() {
        this.apiKey = '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';
        this.apiUrl = 'https://api.openai.com/v1/chat/completions';
        this.model = 'gpt-4-turbo-preview';
        this.maxTokens = 4096;
        this.temperature = 0.7;
        this.isProcessing = false;
        this.conversationHistory = [];
        
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
        
        this.systemPrompt = `You are an AI assistant for an ESP32 AP-Flasher system managing OpenEPaperLink devices. You can:

1. **File Management**: Create, read, update, delete files in the system
2. **System Control**: Execute commands, get system information
3. **C6 Module Management**: Control ESP32-C6 wireless modules
4. **Firmware Operations**: Flash firmware, manage updates
5. **Network Operations**: Scan networks, manage connections

Available functions:
- createFile(path, content) - Create new files
- readFile(path) - Read file contents
- updateFile(path, content) - Update existing files
- deleteFile(path) - Delete files
- listFiles(directory) - List directory contents
- executeSystemCommand(command) - Execute system commands
- getSystemInfo() - Get system information
- manageC6Module(action, params) - Control C6 modules
- flashFirmware(type, file) - Flash firmware
- scanNetworks() - Scan available networks

Always provide clear, helpful responses and explain what actions you're taking.`;

        this.initializeUI();
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
                            <strong>AI Assistant:</strong> Hello! I'm your AI assistant for managing the ESP32 AP-Flasher system. 
                            I can help you with file management, system control, C6 modules, and firmware operations. 
                            What would you like me to help you with?
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
                🤖 AI Assistant
            </button>
        `;

        // Add to page
        document.body.insertAdjacentHTML('beforeend', agentHTML);
        
        // Add CSS styles
        this.addAgentStyles();
    }

    addAgentStyles() {
        const style = document.createElement('style');
        style.textContent = `
            .agent-panel {
                position: fixed;
                top: 20px;
                right: 20px;
                width: 400px;
                max-height: 600px;
                background: white;
                border: 1px solid #ddd;
                border-radius: 8px;
                box-shadow: 0 4px 20px rgba(0,0,0,0.15);
                z-index: 10000;
                display: flex;
                flex-direction: column;
            }
            
            .agent-header {
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                padding: 15px;
                border-radius: 8px 8px 0 0;
                display: flex;
                justify-content: space-between;
                align-items: center;
            }
            
            .agent-header h3 {
                margin: 0;
                font-size: 16px;
            }
            
            .agent-content {
                display: flex;
                flex-direction: column;
                height: 500px;
            }
            
            .agent-chat {
                flex: 1;
                padding: 15px;
                overflow-y: auto;
                background: #f8f9fa;
            }
            
            .agent-message {
                margin-bottom: 15px;
                padding: 10px;
                border-radius: 6px;
                font-size: 14px;
                line-height: 1.4;
            }
            
            .agent-message.user {
                background: #007bff;
                color: white;
                margin-left: 20px;
            }
            
            .agent-message.assistant {
                background: white;
                border: 1px solid #ddd;
                margin-right: 20px;
            }
            
            .agent-message.system {
                background: #e9ecef;
                border: 1px solid #ced4da;
                font-style: italic;
            }
            
            .agent-message.error {
                background: #f8d7da;
                border: 1px solid #f5c6cb;
                color: #721c24;
            }
            
            .agent-message.function {
                background: #d4edda;
                border: 1px solid #c3e6cb;
                color: #155724;
                font-family: monospace;
                font-size: 12px;
            }
            
            .agent-input-area {
                border-top: 1px solid #ddd;
                padding: 15px;
                background: white;
            }
            
            .agent-suggestions {
                display: flex;
                flex-wrap: wrap;
                gap: 5px;
                margin-bottom: 10px;
            }
            
            .suggestion-btn {
                background: #f8f9fa;
                border: 1px solid #ddd;
                border-radius: 4px;
                padding: 5px 10px;
                font-size: 12px;
                cursor: pointer;
                transition: background-color 0.2s;
            }
            
            .suggestion-btn:hover {
                background: #e9ecef;
            }
            
            .agent-input-container {
                display: flex;
                gap: 10px;
                align-items: flex-end;
            }
            
            #agent-input {
                flex: 1;
                border: 1px solid #ddd;
                border-radius: 4px;
                padding: 8px;
                font-size: 14px;
                resize: vertical;
                min-height: 40px;
            }
            
            #agent-send-btn {
                padding: 8px 16px;
                font-size: 14px;
            }
            
            .floating-agent-btn {
                position: fixed;
                bottom: 20px;
                right: 20px;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                border: none;
                border-radius: 25px;
                padding: 12px 20px;
                font-size: 14px;
                cursor: pointer;
                box-shadow: 0 4px 15px rgba(0,0,0,0.2);
                z-index: 9999;
                transition: transform 0.2s;
            }
            
            .floating-agent-btn:hover {
                transform: translateY(-2px);
                box-shadow: 0 6px 20px rgba(0,0,0,0.3);
            }
            
            .typing-indicator {
                display: flex;
                align-items: center;
                gap: 5px;
                color: #666;
                font-style: italic;
            }
            
            .typing-dots {
                display: flex;
                gap: 2px;
            }
            
            .typing-dot {
                width: 4px;
                height: 4px;
                background: #666;
                border-radius: 50%;
                animation: typing 1.4s infinite;
            }
            
            .typing-dot:nth-child(2) {
                animation-delay: 0.2s;
            }
            
            .typing-dot:nth-child(3) {
                animation-delay: 0.4s;
            }
            
            @keyframes typing {
                0%, 60%, 100% {
                    transform: translateY(0);
                }
                30% {
                    transform: translateY(-10px);
                }
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
        this.conversationHistory.push({
            role: 'user',
            content: userMessage
        });

        // Prepare messages for API
        const messages = [
            { role: 'system', content: this.systemPrompt },
            ...this.conversationHistory.slice(-10) // Keep last 10 messages for context
        ];

        // Add function definitions
        const functions = [
            // === FILE MANAGEMENT FUNCTIONS ===
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
                        directory: { type: 'string', description: 'Directory path to list (default: /)', default: '/' }
                    }
                }
            },
            
            // === SYSTEM CONTROL FUNCTIONS ===
            {
                name: 'getSystemInfo',
                description: 'Get comprehensive system information including hardware, software, and status',
                parameters: { type: 'object', properties: {} }
            },
            {
                name: 'getNetworkInfo',
                description: 'Get detailed network information including WiFi status and connections',
                parameters: { type: 'object', properties: {} }
            },
            {
                name: 'restartSystem',
                description: 'Safely restart the ESP32 system',
                parameters: { 
                    type: 'object', 
                    properties: {
                        delay: { type: 'number', description: 'Delay in seconds before restart (default: 3)', default: 3 }
                    }
                }
            },
            {
                name: 'scanWiFi',
                description: 'Scan for available WiFi networks and return signal strengths',
                parameters: { type: 'object', properties: {} }
            },
            
            // === TAG CONTROL & E-PAPER FUNCTIONS ===
            {
                name: 'getTagStatus',
                description: 'Get status of all connected e-paper tags',
                parameters: { type: 'object', properties: {} }
            },
            {
                name: 'controlTag',
                description: 'Control specific e-paper tag operations',
                parameters: {
                    type: 'object',
                    properties: {
                        tagId: { type: 'string', description: 'Tag MAC address or ID' },
                        action: { 
                            type: 'string', 
                            description: 'Action to perform', 
                            enum: ['update', 'reset', 'sleep', 'wake', 'ping', 'config'] 
                        },
                        data: { type: 'string', description: 'Optional data for the action' }
                    },
                    required: ['tagId', 'action']
                }
            },
            {
                name: 'updateTagImage',
                description: 'Update image on specific e-paper tag',
                parameters: {
                    type: 'object',
                    properties: {
                        tagId: { type: 'string', description: 'Tag MAC address or ID' },
                        imageData: { type: 'string', description: 'Base64 encoded image data or image path' },
                        imageType: { type: 'string', description: 'Image type', enum: ['bmp', 'png', 'jpg'] }
                    },
                    required: ['tagId', 'imageData']
                }
            },
            
            // === LED CONTROL FUNCTIONS ===
            {
                name: 'controlLEDs',
                description: 'Control RGB LEDs and status indicators',
                parameters: {
                    type: 'object',
                    properties: {
                        action: { 
                            type: 'string', 
                            description: 'LED action', 
                            enum: ['setBrightness', 'setColor', 'blink', 'pattern', 'off', 'rainbow'] 
                        },
                        brightness: { type: 'number', description: 'Brightness level (0-255)', minimum: 0, maximum: 255 },
                        color: { type: 'string', description: 'Color in hex format (#FF0000) or name (red, blue, etc.)' },
                        pattern: { type: 'string', description: 'Pattern name for LED sequences' },
                        duration: { type: 'number', description: 'Duration in milliseconds for temporary effects' }
                    },
                    required: ['action']
                }
            },
            
            // === C6 MODULE MANAGEMENT ===
            {
                name: 'getC6Status',
                description: 'Get detailed status of ESP32-C6 modules',
                parameters: { type: 'object', properties: {} }
            },
            {
                name: 'controlC6Module',
                description: 'Control ESP32-C6 module operations',
                parameters: {
                    type: 'object',
                    properties: {
                        moduleId: { type: 'string', description: 'C6 module identifier (default: primary)', default: 'primary' },
                        action: { 
                            type: 'string', 
                            description: 'Action to perform', 
                            enum: ['reset', 'flash', 'configure', 'status', 'update', 'diagnostic'] 
                        },
                        parameters: { type: 'object', description: 'Action-specific parameters' }
                    },
                    required: ['action']
                }
            },
            
            // === OTA & FIRMWARE FUNCTIONS ===
            {
                name: 'checkOTAUpdate',
                description: 'Check for available OTA firmware updates',
                parameters: {
                    type: 'object',
                    properties: {
                        target: { 
                            type: 'string', 
                            description: 'Update target', 
                            enum: ['esp32', 'c6', 'all'],
                            default: 'all'
                        }
                    }
                }
            },
            {
                name: 'performOTAUpdate',
                description: 'Perform OTA firmware update',
                parameters: {
                    type: 'object',
                    properties: {
                        target: { type: 'string', description: 'Update target', enum: ['esp32', 'c6'] },
                        firmwareUrl: { type: 'string', description: 'Firmware download URL' },
                        version: { type: 'string', description: 'Firmware version' },
                        force: { type: 'boolean', description: 'Force update even if same version', default: false }
                    },
                    required: ['target']
                }
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

        // Call OpenAI API
        const response = await fetch(this.apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.apiKey}`
            },
            body: JSON.stringify({
                model: this.model,
                messages: messages,
                functions: functions,
                function_call: 'auto',
                max_tokens: this.maxTokens,
                temperature: this.temperature
            })
        });

        if (!response.ok) {
            throw new Error(`API request failed: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        const assistantMessage = data.choices[0].message;

        // Check if AI wants to call a function
        if (assistantMessage.function_call) {
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
        } else {
            // Regular text response
            this.conversationHistory.push({
                role: 'assistant',
                content: assistantMessage.content
            });
            return assistantMessage.content;
        }
    }

    async getFollowUpResponse() {
        const messages = [
            { role: 'system', content: this.systemPrompt },
            ...this.conversationHistory.slice(-10)
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

    // Function implementations
    async createFile(args) {
        const { path, content } = args;
        
        try {
            const response = await fetch('/create_file', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path, content })
            });
            
            if (response.ok) {
                return { success: true, message: `File created: ${path}` };
            } else {
                throw new Error(`Failed to create file: ${response.statusText}`);
            }
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async readFile(args) {
        const { path } = args;
        
        try {
            const response = await fetch(`/read_file?path=${encodeURIComponent(path)}`);
            
            if (response.ok) {
                const content = await response.text();
                return { success: true, content, path };
            } else {
                throw new Error(`Failed to read file: ${response.statusText}`);
            }
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async updateFile(args) {
        const { path, content } = args;
        
        try {
            const response = await fetch('/update_file', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path, content })
            });
            
            if (response.ok) {
                return { success: true, message: `File updated: ${path}` };
            } else {
                throw new Error(`Failed to update file: ${response.statusText}`);
            }
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async deleteFile(args) {
        const { path } = args;
        
        try {
            const response = await fetch(`/delete_file?path=${encodeURIComponent(path)}`, {
                method: 'DELETE'
            });
            
            if (response.ok) {
                return { success: true, message: `File deleted: ${path}` };
            } else {
                throw new Error(`Failed to delete file: ${response.statusText}`);
            }
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async listFiles(args) {
        const { directory = '/' } = args;
        
        try {
            const response = await fetch(`/list_files?dir=${encodeURIComponent(directory)}`);
            
            if (response.ok) {
                const files = await response.json();
                return { success: true, files, directory };
            } else {
                throw new Error(`Failed to list files: ${response.statusText}`);
            }
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async getSystemInfo() {
        try {
            const response = await fetch('/sysinfo');
            
            if (response.ok) {
                const info = await response.json();
                return { success: true, systemInfo: info };
            } else {
                throw new Error(`Failed to get system info: ${response.statusText}`);
            }
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async manageC6Module(args) {
        const { action, params = {} } = args;
        
        try {
            let endpoint = '';
            let method = 'GET';
            let body = null;
            
            switch (action) {
                case 'status':
                    endpoint = '/ap_list';
                    break;
                case 'restart':
                    endpoint = '/restart_c6';
                    method = 'POST';
                    break;
                case 'update':
                    endpoint = '/update_c6';
                    method = 'POST';
                    body = JSON.stringify(params);
                    break;
                case 'settings':
                    endpoint = '/get_c6_settings';
                    break;
                default:
                    throw new Error(`Unknown C6 action: ${action}`);
            }
            
            const response = await fetch(endpoint, {
                method,
                headers: body ? { 'Content-Type': 'application/json' } : {},
                body
            });
            
            if (response.ok) {
                const result = await response.json();
                return { success: true, action, result };
            } else {
                throw new Error(`C6 ${action} failed: ${response.statusText}`);
            }
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async scanNetworks() {
        try {
            const response = await fetch('/get_ssid_list');
            
            if (response.ok) {
                const networks = await response.json();
                return { success: true, networks };
            } else {
                throw new Error(`Failed to scan networks: ${response.statusText}`);
            }
        } catch (error) {
            return { success: false, error: error.message };
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
        console.log(`[${timestamp}] [OpenAI Agent] [${level.toUpperCase()}] ${message}`);
        
        // Also log to diagnostics console if available
        if (typeof logToConsole === 'function') {
            logToConsole(level, `[AI Agent] ${message}`);
        }
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
