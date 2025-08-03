/**
 * Enhanced OpenAI Agent for ESP32 AP-Flasher
 * Comprehensive AI assistant with full system integration
 * 
 * Features:
 * - GPT-4 Turbo integration with function calling
 * - Complete ESP32 system control
 * - Tag management and LED control
 * - C6 module operations
 * - OTA updates and firmware management
 * - BLE, WiFi, ZBS, and SWD interfaces
 * - File system management
 * - Advanced diagnostics and monitoring
 */

class OpenAIAgentEnhanced {
    constructor() {
        // OpenAI Configuration
        this.API_KEY = "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";
        this.API_URL = "https://api.openai.com/v1/chat/completions";
        this.MODEL = "gpt-4-turbo-preview";
        
        // State management
        this.isProcessing = false;
        this.conversationHistory = [];
        this.functionCallHistory = [];
        
        // Enhanced system prompt for comprehensive ESP32 control
        this.systemPrompt = `You are an advanced AI assistant specialized in ESP32 AP-Flasher system management. You have comprehensive control over:

🏗️ SYSTEM ARCHITECTURE:
- ESP32-S3 main controller with C6 wireless modules
- OpenEPaperLink e-paper tag management system
- Multi-interface communication (WiFi, BLE, ZigBee, SWD)
- Advanced firmware flashing and OTA capabilities

🎯 CORE CAPABILITIES:
- File System Management (SPIFFS/LittleFS)
- E-Paper Tag Control & Image Updates
- RGB LED Control & Status Indicators
- ESP32-C6 Module Management
- OTA Firmware Updates
- Serial Access Point Operations
- UDP Network Communication
- WiFi Management & Configuration
- ZBS Interface (ZigBee) Control
- SWD Programming (nRF52 devices)
- Bluetooth Low Energy Operations
- Advanced System Diagnostics

🔧 AVAILABLE FUNCTIONS:
File Management: createFile, readFile, updateFile, deleteFile, listFiles, manageSPIFFS
System Control: getSystemInfo, restartSystem, performSystemDiagnostic, configureSystem
Tag Operations: getTagStatus, controlTag, updateTagImage
LED Control: controlLEDs (brightness, colors, patterns, effects)
C6 Management: getC6Status, controlC6Module
OTA/Firmware: checkOTAUpdate, performOTAUpdate
Network: getNetworkInfo, scanWiFi, getWiFiStatus, manageWiFi, getUDPStatus, sendUDPMessage
Serial AP: getSerialAPStatus, controlSerialAP
ZBS Interface: getZBSStatus, controlZBSInterface
SWD Programming: getSWDStatus, controlSWDInterface
BLE Operations: getBLEStatus, controlBLE

Always provide detailed explanations of actions and offer proactive suggestions for system optimization.`;

        this.initializeUI();
    }

    initializeUI() {
        this.createAgentInterface();
        this.setupEventListeners();
        this.logToConsole('info', 'Enhanced OpenAI Agent initialized successfully');
    }

    createAgentInterface() {
        const agentHTML = `
            <div id="openai-agent-panel" class="agent-panel" style="display: none;">
                <div class="agent-header">
                    <h3>🤖 Enhanced AI Assistant</h3>
                    <div class="agent-status">
                        <span class="status-dot" id="ai-status-dot"></span>
                        <span id="ai-status-text">Ready</span>
                    </div>
                    <button class="btn btn-sm" onclick="openAIAgentEnhanced.togglePanel()">✕</button>
                </div>
                
                <div class="agent-content">
                    <div class="agent-chat" id="agent-chat">
                        <div class="agent-message system">
                            <div class="message-header">
                                <strong>🤖 Enhanced AI Assistant</strong>
                                <span class="timestamp">${new Date().toLocaleTimeString()}</span>
                            </div>
                            <div class="message-content">
                                Hello! I'm your enhanced AI assistant with comprehensive control over the ESP32 AP-Flasher system. 
                                I can help you with:
                                <br><br>
                                <strong>🏗️ System Management:</strong> Monitor hardware, configure settings, run diagnostics
                                <br><strong>📱 Tag Control:</strong> Manage e-paper tags, update images, control displays
                                <br><strong>💡 LED Control:</strong> Customize RGB lighting, set patterns, adjust brightness
                                <br><strong>📡 C6 Modules:</strong> Manage wireless modules, flash firmware, diagnostics
                                <br><strong>🔄 OTA Updates:</strong> Check for updates, manage firmware versions
                                <br><strong>🌐 Network Operations:</strong> WiFi management, UDP communication, BLE control
                                <br><strong>🔧 Advanced Features:</strong> SWD programming, ZBS interface, file management
                                <br><br>
                                Try asking: <em>"Show me the system status"</em> or <em>"Control the RGB LEDs"</em>
                            </div>
                        </div>
                    </div>
                    
                    <div class="agent-input-section">
                        <div class="input-group">
                            <input type="text" id="agent-input" placeholder="Ask me anything about your ESP32 system..." autocomplete="off">
                            <button id="send-btn" onclick="openAIAgentEnhanced.sendMessage()">
                                <span id="send-icon">🚀</span>
                            </button>
                        </div>
                        
                        <div class="quick-actions">
                            <button class="quick-btn" onclick="openAIAgentEnhanced.quickCommand('Show me the current system status and all connected devices')">
                                📊 System Status
                            </button>
                            <button class="quick-btn" onclick="openAIAgentEnhanced.quickCommand('Control the RGB LEDs - show me available patterns and colors')">
                                💡 LED Control
                            </button>
                            <button class="quick-btn" onclick="openAIAgentEnhanced.quickCommand('Check the status of all e-paper tags and C6 modules')">
                                📱 Tag & C6 Status
                            </button>
                            <button class="quick-btn" onclick="openAIAgentEnhanced.quickCommand('Scan for WiFi networks and show network diagnostics')">
                                📡 Network Scan
                            </button>
                        </div>
                    </div>
                </div>
                
                <div class="agent-footer">
                    <div class="footer-info">
                        <span>🧠 GPT-4 Turbo</span>
                        <span>⚡ <span id="function-count">25</span> Functions</span>
                        <span>🔒 Secure</span>
                    </div>
                </div>
            </div>
        `;

        // Inject into page
        if (!document.getElementById('openai-agent-panel')) {
            document.body.insertAdjacentHTML('beforeend', agentHTML);
            this.addAgentStyles();
        }
    }

    addAgentStyles() {
        const styles = `
            <style id="agent-enhanced-styles">
            .agent-panel {
                position: fixed;
                top: 10px;
                right: 10px;
                width: 450px;
                max-height: 80vh;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                border-radius: 15px;
                box-shadow: 0 20px 40px rgba(0,0,0,0.3);
                z-index: 10000;
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                overflow: hidden;
                backdrop-filter: blur(10px);
            }
            
            .agent-header {
                background: rgba(255,255,255,0.1);
                padding: 15px 20px;
                display: flex;
                justify-content: space-between;
                align-items: center;
                border-bottom: 1px solid rgba(255,255,255,0.2);
            }
            
            .agent-header h3 {
                color: white;
                margin: 0;
                font-size: 18px;
                font-weight: 600;
            }
            
            .agent-status {
                display: flex;
                align-items: center;
                gap: 8px;
                color: white;
                font-size: 12px;
            }
            
            .status-dot {
                width: 8px;
                height: 8px;
                border-radius: 50%;
                background: #4CAF50;
                animation: pulse 2s infinite;
            }
            
            @keyframes pulse {
                0% { opacity: 1; }
                50% { opacity: 0.5; }
                100% { opacity: 1; }
            }
            
            .agent-content {
                background: white;
                height: 500px;
                display: flex;
                flex-direction: column;
            }
            
            .agent-chat {
                flex: 1;
                padding: 20px;
                overflow-y: auto;
                background: #f8f9fa;
            }
            
            .agent-message {
                margin-bottom: 15px;
                padding: 12px 16px;
                border-radius: 12px;
                animation: slideIn 0.3s ease-out;
            }
            
            @keyframes slideIn {
                from { opacity: 0; transform: translateY(20px); }
                to { opacity: 1; transform: translateY(0); }
            }
            
            .agent-message.system {
                background: linear-gradient(135deg, #667eea, #764ba2);
                color: white;
                border: none;
            }
            
            .agent-message.user {
                background: #007bff;
                color: white;
                margin-left: 20px;
            }
            
            .agent-message.assistant {
                background: white;
                border: 2px solid #e9ecef;
                margin-right: 20px;
            }
            
            .agent-message.function {
                background: #d4edda;
                border: 1px solid #c3e6cb;
                color: #155724;
                font-family: monospace;
                font-size: 12px;
            }
            
            .message-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 8px;
            }
            
            .message-content {
                line-height: 1.5;
            }
            
            .timestamp {
                font-size: 11px;
                opacity: 0.8;
            }
            
            .agent-input-section {
                padding: 20px;
                background: white;
                border-top: 1px solid #e9ecef;
            }
            
            .input-group {
                display: flex;
                gap: 10px;
                margin-bottom: 15px;
            }
            
            .input-group input {
                flex: 1;
                padding: 12px 16px;
                border: 2px solid #e9ecef;
                border-radius: 25px;
                font-size: 14px;
                outline: none;
                transition: border-color 0.3s;
            }
            
            .input-group input:focus {
                border-color: #667eea;
            }
            
            .input-group button {
                width: 45px;
                height: 45px;
                border: none;
                border-radius: 50%;
                background: linear-gradient(135deg, #667eea, #764ba2);
                color: white;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: transform 0.2s;
            }
            
            .input-group button:hover {
                transform: scale(1.05);
            }
            
            .input-group button:disabled {
                opacity: 0.6;
                cursor: not-allowed;
                transform: none;
            }
            
            .quick-actions {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 8px;
            }
            
            .quick-btn {
                padding: 8px 12px;
                background: #f8f9fa;
                border: 1px solid #dee2e6;
                border-radius: 8px;
                font-size: 12px;
                cursor: pointer;
                transition: all 0.2s;
                text-align: left;
            }
            
            .quick-btn:hover {
                background: #e9ecef;
                transform: translateY(-1px);
            }
            
            .agent-footer {
                background: rgba(255,255,255,0.1);
                padding: 10px 20px;
                border-top: 1px solid rgba(255,255,255,0.2);
            }
            
            .footer-info {
                display: flex;
                justify-content: space-between;
                color: white;
                font-size: 11px;
                opacity: 0.9;
            }
            
            /* Responsive design */
            @media (max-width: 768px) {
                .agent-panel {
                    width: 95vw;
                    right: 2.5vw;
                    max-height: 70vh;
                }
            }
            </style>
        `;
        
        if (!document.getElementById('agent-enhanced-styles')) {
            document.head.insertAdjacentHTML('beforeend', styles);
        }
    }

    setupEventListeners() {
        // Enter key to send message
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && document.getElementById('agent-input') === document.activeElement) {
                e.preventDefault();
                this.sendMessage();
            }
        });
    }

    togglePanel() {
        const panel = document.getElementById('openai-agent-panel');
        if (panel) {
            panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
            
            if (panel.style.display === 'block') {
                document.getElementById('agent-input').focus();
                this.updateStatus('ready', 'Ready');
            }
        }
    }

    updateStatus(type, message) {
        const statusDot = document.getElementById('ai-status-dot');
        const statusText = document.getElementById('ai-status-text');
        
        if (statusDot && statusText) {
            statusText.textContent = message;
            
            switch (type) {
                case 'ready':
                    statusDot.style.background = '#4CAF50';
                    break;
                case 'processing':
                    statusDot.style.background = '#FF9800';
                    break;
                case 'error':
                    statusDot.style.background = '#F44336';
                    break;
            }
        }
    }

    quickCommand(command) {
        const input = document.getElementById('agent-input');
        if (input) {
            input.value = command;
            this.sendMessage();
        }
    }

    async sendMessage() {
        const input = document.getElementById('agent-input');
        const sendBtn = document.getElementById('send-btn');
        const sendIcon = document.getElementById('send-icon');
        
        if (!input || !input.value.trim() || this.isProcessing) return;

        const userMessage = input.value.trim();
        input.value = '';
        
        // Update UI
        this.isProcessing = true;
        sendBtn.disabled = true;
        sendIcon.textContent = '⏳';
        this.updateStatus('processing', 'Thinking...');

        // Add user message to chat
        this.addMessageToChat('user', userMessage);

        try {
            await this.processMessage(userMessage);
        } catch (error) {
            this.handleError(error);
        } finally {
            this.isProcessing = false;
            sendBtn.disabled = false;
            sendIcon.textContent = '🚀';
            this.updateStatus('ready', 'Ready');
        }
    }

    async processMessage(userMessage) {
        // Add to conversation history
        this.conversationHistory.push({
            role: 'user',
            content: userMessage
        });

        // Enhanced function definitions for comprehensive ESP32 control
        const functions = [
            // === FILE MANAGEMENT ===
            {
                name: 'createFile',
                description: 'Create a new file with specified content',
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
                        content: { type: 'string', description: 'New content' }
                    },
                    required: ['path', 'content']
                }
            },
            {
                name: 'deleteFile',
                description: 'Delete a file',
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
                description: 'List files in directory',
                parameters: {
                    type: 'object',
                    properties: {
                        directory: { type: 'string', description: 'Directory path', default: '/' }
                    }
                }
            },
            
            // === SYSTEM CONTROL ===
            {
                name: 'getSystemInfo',
                description: 'Get comprehensive system information',
                parameters: { type: 'object', properties: {} }
            },
            {
                name: 'restartSystem',
                description: 'Restart the ESP32 system',
                parameters: {
                    type: 'object',
                    properties: {
                        delay: { type: 'number', description: 'Delay in seconds', default: 3 }
                    }
                }
            },
            {
                name: 'performSystemDiagnostic',
                description: 'Run system diagnostics',
                parameters: {
                    type: 'object',
                    properties: {
                        level: { type: 'string', enum: ['basic', 'detailed', 'full'], default: 'detailed' }
                    }
                }
            },
            
            // === TAG CONTROL ===
            {
                name: 'getTagStatus',
                description: 'Get status of all e-paper tags',
                parameters: { type: 'object', properties: {} }
            },
            {
                name: 'controlTag',
                description: 'Control e-paper tag operations',
                parameters: {
                    type: 'object',
                    properties: {
                        tagId: { type: 'string', description: 'Tag ID' },
                        action: { type: 'string', enum: ['update', 'reset', 'sleep', 'wake', 'ping'] },
                        data: { type: 'string', description: 'Optional data' }
                    },
                    required: ['tagId', 'action']
                }
            },
            {
                name: 'updateTagImage',
                description: 'Update image on e-paper tag',
                parameters: {
                    type: 'object',
                    properties: {
                        tagId: { type: 'string', description: 'Tag ID' },
                        imageData: { type: 'string', description: 'Image data' },
                        imageType: { type: 'string', enum: ['bmp', 'png', 'jpg'] }
                    },
                    required: ['tagId', 'imageData']
                }
            },
            
            // === LED CONTROL ===
            {
                name: 'controlLEDs',
                description: 'Control RGB LEDs and lighting effects',
                parameters: {
                    type: 'object',
                    properties: {
                        action: { type: 'string', enum: ['setBrightness', 'setColor', 'blink', 'pattern', 'off', 'rainbow'] },
                        brightness: { type: 'number', minimum: 0, maximum: 255 },
                        color: { type: 'string', description: 'Color in hex (#FF0000) or name' },
                        pattern: { type: 'string', description: 'Pattern name' },
                        duration: { type: 'number', description: 'Duration in ms' }
                    },
                    required: ['action']
                }
            },
            
            // === C6 MODULE MANAGEMENT ===
            {
                name: 'getC6Status',
                description: 'Get ESP32-C6 module status',
                parameters: { type: 'object', properties: {} }
            },
            {
                name: 'controlC6Module',
                description: 'Control C6 module operations',
                parameters: {
                    type: 'object',
                    properties: {
                        action: { type: 'string', enum: ['reset', 'flash', 'configure', 'status', 'diagnostic'] },
                        moduleId: { type: 'string', default: 'primary' },
                        parameters: { type: 'object' }
                    },
                    required: ['action']
                }
            },
            
            // === NETWORK & WIFI ===
            {
                name: 'getNetworkInfo',
                description: 'Get network and WiFi information',
                parameters: { type: 'object', properties: {} }
            },
            {
                name: 'scanWiFi',
                description: 'Scan for WiFi networks',
                parameters: { type: 'object', properties: {} }
            },
            {
                name: 'manageWiFi',
                description: 'Manage WiFi connections',
                parameters: {
                    type: 'object',
                    properties: {
                        action: { type: 'string', enum: ['connect', 'disconnect', 'scan', 'startAP', 'stopAP'] },
                        ssid: { type: 'string' },
                        password: { type: 'string' }
                    },
                    required: ['action']
                }
            },
            
            // === OTA & FIRMWARE ===
            {
                name: 'checkOTAUpdate',
                description: 'Check for firmware updates',
                parameters: {
                    type: 'object',
                    properties: {
                        target: { type: 'string', enum: ['esp32', 'c6', 'all'], default: 'all' }
                    }
                }
            },
            {
                name: 'performOTAUpdate',
                description: 'Perform OTA firmware update',
                parameters: {
                    type: 'object',
                    properties: {
                        target: { type: 'string', enum: ['esp32', 'c6'] },
                        version: { type: 'string' }
                    },
                    required: ['target']
                }
            },
            
            // === BLE OPERATIONS ===
            {
                name: 'getBLEStatus',
                description: 'Get Bluetooth LE status',
                parameters: { type: 'object', properties: {} }
            },
            {
                name: 'controlBLE',
                description: 'Control BLE operations',
                parameters: {
                    type: 'object',
                    properties: {
                        action: { type: 'string', enum: ['scan', 'connect', 'disconnect', 'advertise'] },
                        deviceAddress: { type: 'string' }
                    },
                    required: ['action']
                }
            },
            
            // === SERIAL AP ===
            {
                name: 'getSerialAPStatus',
                description: 'Get Serial Access Point status',
                parameters: { type: 'object', properties: {} }
            },
            {
                name: 'controlSerialAP',
                description: 'Control Serial AP operations',
                parameters: {
                    type: 'object',
                    properties: {
                        action: { type: 'string', enum: ['start', 'stop', 'reset', 'setChannel', 'setPower'] },
                        channel: { type: 'number', minimum: 1, maximum: 11 },
                        power: { type: 'number', minimum: 0, maximum: 20 }
                    },
                    required: ['action']
                }
            },
            
            // === ZBS INTERFACE ===
            {
                name: 'controlZBSInterface',
                description: 'Control ZBS (ZigBee) interface',
                parameters: {
                    type: 'object',
                    properties: {
                        action: { type: 'string', enum: ['reset', 'scan', 'connect', 'flash', 'read', 'write'] },
                        target: { type: 'string' },
                        data: { type: 'string' }
                    },
                    required: ['action']
                }
            },
            
            // === SWD PROGRAMMING ===
            {
                name: 'controlSWDInterface',
                description: 'Control SWD programming interface',
                parameters: {
                    type: 'object',
                    properties: {
                        action: { type: 'string', enum: ['connect', 'program', 'erase', 'verify', 'reset'] },
                        target: { type: 'string' },
                        file: { type: 'string' }
                    },
                    required: ['action']
                }
            },
            
            // === SPIFFS MANAGEMENT ===
            {
                name: 'manageSPIFFS',
                description: 'Manage SPIFFS filesystem',
                parameters: {
                    type: 'object',
                    properties: {
                        action: { type: 'string', enum: ['format', 'info', 'check', 'repair'] }
                    },
                    required: ['action']
                }
            }
        ];

        // Prepare messages for API
        const messages = [
            { role: 'system', content: this.systemPrompt },
            ...this.conversationHistory.slice(-10)
        ];

        try {
            const response = await fetch(this.API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.API_KEY}`
                },
                body: JSON.stringify({
                    model: this.MODEL,
                    messages: messages,
                    functions: functions,
                    function_call: 'auto',
                    temperature: 0.7,
                    max_tokens: 2000
                })
            });

            if (!response.ok) {
                throw new Error(`API Error: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();
            
            if (data.choices && data.choices[0]) {
                const choice = data.choices[0];
                
                if (choice.message.function_call) {
                    // Handle function call
                    await this.handleFunctionCall(choice.message.function_call);
                } else if (choice.message.content) {
                    // Handle regular response
                    this.addMessageToChat('assistant', choice.message.content);
                    this.conversationHistory.push({
                        role: 'assistant',
                        content: choice.message.content
                    });
                }
            }
        } catch (error) {
            throw new Error(`OpenAI API Error: ${error.message}`);
        }
    }

    async handleFunctionCall(functionCall) {
        const { name, arguments: args } = functionCall;
        let parsedArgs;
        
        try {
            parsedArgs = JSON.parse(args);
        } catch (error) {
            this.addMessageToChat('function', `❌ Error parsing function arguments: ${error.message}`);
            return;
        }

        // Show function execution
        this.addMessageToChat('function', `🔧 Executing: ${name}(${JSON.stringify(parsedArgs, null, 2)})`);
        
        try {
            const result = await this.executeFunction(name, parsedArgs);
            
            // Add function result to conversation
            this.conversationHistory.push({
                role: 'function',
                name: name,
                content: JSON.stringify(result)
            });
            
            // Get AI response based on function result
            await this.processMessage(`Function ${name} executed successfully. Result: ${JSON.stringify(result)}`);
            
        } catch (error) {
            this.addMessageToChat('function', `❌ Function execution failed: ${error.message}`);
        }
    }

    async executeFunction(name, args) {
        this.logToConsole('info', `Executing function: ${name}`, args);
        
        // Route to appropriate function handler
        switch (name) {
            // File management
            case 'createFile':
                return await this.api_createFile(args.path, args.content);
            case 'readFile':
                return await this.api_readFile(args.path);
            case 'updateFile':
                return await this.api_updateFile(args.path, args.content);
            case 'deleteFile':
                return await this.api_deleteFile(args.path);
            case 'listFiles':
                return await this.api_listFiles(args.directory || '/');
                
            // System control
            case 'getSystemInfo':
                return await this.api_getSystemInfo();
            case 'restartSystem':
                return await this.api_restartSystem(args.delay || 3);
            case 'performSystemDiagnostic':
                return await this.api_performSystemDiagnostic(args.level || 'detailed');
                
            // Tag control
            case 'getTagStatus':
                return await this.api_getTagStatus();
            case 'controlTag':
                return await this.api_controlTag(args.tagId, args.action, args.data);
            case 'updateTagImage':
                return await this.api_updateTagImage(args.tagId, args.imageData, args.imageType);
                
            // LED control
            case 'controlLEDs':
                return await this.api_controlLEDs(args);
                
            // C6 module
            case 'getC6Status':
                return await this.api_getC6Status();
            case 'controlC6Module':
                return await this.api_controlC6Module(args.action, args.moduleId, args.parameters);
                
            // Network
            case 'getNetworkInfo':
                return await this.api_getNetworkInfo();
            case 'scanWiFi':
                return await this.api_scanWiFi();
            case 'manageWiFi':
                return await this.api_manageWiFi(args.action, args.ssid, args.password);
                
            // OTA
            case 'checkOTAUpdate':
                return await this.api_checkOTAUpdate(args.target);
            case 'performOTAUpdate':
                return await this.api_performOTAUpdate(args.target, args.version);
                
            // BLE
            case 'getBLEStatus':
                return await this.api_getBLEStatus();
            case 'controlBLE':
                return await this.api_controlBLE(args.action, args.deviceAddress);
                
            // Serial AP
            case 'getSerialAPStatus':
                return await this.api_getSerialAPStatus();
            case 'controlSerialAP':
                return await this.api_controlSerialAP(args.action, args.channel, args.power);
                
            // ZBS Interface
            case 'controlZBSInterface':
                return await this.api_controlZBSInterface(args.action, args.target, args.data);
                
            // SWD Programming
            case 'controlSWDInterface':
                return await this.api_controlSWDInterface(args.action, args.target, args.file);
                
            // SPIFFS
            case 'manageSPIFFS':
                return await this.api_manageSPIFFS(args.action);
                
            default:
                throw new Error(`Unknown function: ${name}`);
        }
    }

    // === API IMPLEMENTATIONS ===
    
    // File Management APIs
    async api_createFile(path, content) {
        const response = await fetch('/create_file', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path, content })
        });
        return await response.json();
    }

    async api_readFile(path) {
        const response = await fetch(`/read_file?path=${encodeURIComponent(path)}`);
        return await response.json();
    }

    async api_updateFile(path, content) {
        const response = await fetch('/update_file', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path, content })
        });
        return await response.json();
    }

    async api_deleteFile(path) {
        const response = await fetch('/delete_file', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path })
        });
        return await response.json();
    }

    async api_listFiles(directory) {
        const response = await fetch(`/list_files?directory=${encodeURIComponent(directory)}`);
        return await response.json();
    }

    // System Control APIs
    async api_getSystemInfo() {
        const response = await fetch('/system_info');
        return await response.json();
    }

    async api_restartSystem(delay) {
        const response = await fetch('/restart_system', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ delay })
        });
        return await response.json();
    }

    async api_performSystemDiagnostic(level) {
        const response = await fetch('/system_diagnostic', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ level })
        });
        return await response.json();
    }

    // Tag Control APIs
    async api_getTagStatus() {
        const response = await fetch('/tag_status');
        return await response.json();
    }

    async api_controlTag(tagId, action, data) {
        const response = await fetch('/tag_control', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tagId, action, data })
        });
        return await response.json();
    }

    async api_updateTagImage(tagId, imageData, imageType) {
        const response = await fetch('/tag_image_update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tagId, imageData, imageType })
        });
        return await response.json();
    }

    // LED Control API
    async api_controlLEDs(args) {
        const response = await fetch('/led_control', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(args)
        });
        return await response.json();
    }

    // C6 Module APIs
    async api_getC6Status() {
        const response = await fetch('/c6_status');
        return await response.json();
    }

    async api_controlC6Module(action, moduleId, parameters) {
        const response = await fetch('/c6_control', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action, moduleId, parameters })
        });
        return await response.json();
    }

    // Network APIs
    async api_getNetworkInfo() {
        const response = await fetch('/network_info');
        return await response.json();
    }

    async api_scanWiFi() {
        const response = await fetch('/wifi_scan');
        return await response.json();
    }

    async api_manageWiFi(action, ssid, password) {
        const response = await fetch('/wifi_manage', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action, ssid, password })
        });
        return await response.json();
    }

    // OTA APIs
    async api_checkOTAUpdate(target) {
        const response = await fetch(`/ota_check?target=${target}`);
        return await response.json();
    }

    async api_performOTAUpdate(target, version) {
        const response = await fetch('/ota_update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ target, version })
        });
        return await response.json();
    }

    // BLE APIs
    async api_getBLEStatus() {
        const response = await fetch('/ble_status');
        return await response.json();
    }

    async api_controlBLE(action, deviceAddress) {
        const response = await fetch('/ble_control', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action, deviceAddress })
        });
        return await response.json();
    }

    // Serial AP APIs
    async api_getSerialAPStatus() {
        const response = await fetch('/serial_ap_status');
        return await response.json();
    }

    async api_controlSerialAP(action, channel, power) {
        const response = await fetch('/serial_ap_control', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action, channel, power })
        });
        return await response.json();
    }

    // ZBS Interface API
    async api_controlZBSInterface(action, target, data) {
        const response = await fetch('/zbs_control', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action, target, data })
        });
        return await response.json();
    }

    // SWD Programming API
    async api_controlSWDInterface(action, target, file) {
        const response = await fetch('/swd_control', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action, target, file })
        });
        return await response.json();
    }

    // SPIFFS Management API
    async api_manageSPIFFS(action) {
        const response = await fetch('/spiffs_manage', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action })
        });
        return await response.json();
    }

    // === UTILITY METHODS ===
    
    addMessageToChat(type, content) {
        const chat = document.getElementById('agent-chat');
        if (!chat) return;

        const messageDiv = document.createElement('div');
        messageDiv.className = `agent-message ${type}`;
        
        const timestamp = new Date().toLocaleTimeString();
        
        let messageHTML;
        if (type === 'system' || type === 'assistant') {
            messageHTML = `
                <div class="message-header">
                    <strong>${type === 'system' ? '🤖 System' : '🤖 AI Assistant'}</strong>
                    <span class="timestamp">${timestamp}</span>
                </div>
                <div class="message-content">${this.formatMessage(content)}</div>
            `;
        } else if (type === 'user') {
            messageHTML = `
                <div class="message-header">
                    <strong>👤 You</strong>
                    <span class="timestamp">${timestamp}</span>
                </div>
                <div class="message-content">${content}</div>
            `;
        } else if (type === 'function') {
            messageHTML = `
                <div class="message-header">
                    <strong>⚙️ Function</strong>
                    <span class="timestamp">${timestamp}</span>
                </div>
                <div class="message-content">${content}</div>
            `;
        }
        
        messageDiv.innerHTML = messageHTML;
        chat.appendChild(messageDiv);
        chat.scrollTop = chat.scrollHeight;
    }

    formatMessage(content) {
        // Format markdown-like content
        return content
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/`(.*?)`/g, '<code>$1</code>')
            .replace(/\n/g, '<br>');
    }

    handleError(error) {
        this.logToConsole('error', 'Error occurred:', error);
        this.addMessageToChat('assistant', `❌ Error: ${error.message}`);
        this.updateStatus('error', 'Error occurred');
    }

    logToConsole(level, message, ...args) {
        const timestamp = new Date().toISOString();
        console[level](`[${timestamp}] OpenAI Agent Enhanced:`, message, ...args);
    }
}

// Initialize the enhanced agent
let openAIAgentEnhanced;
document.addEventListener('DOMContentLoaded', function() {
    openAIAgentEnhanced = new OpenAIAgentEnhanced();
    
    // Make globally available
    window.openAIAgentEnhanced = openAIAgentEnhanced;
    
    console.log('🤖 Enhanced OpenAI Agent loaded successfully');
});
