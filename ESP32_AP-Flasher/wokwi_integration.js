// Integration script for adding Wokwi Configuration Tool to existing web UI
// Add this to your existing web application to integrate the Wokwi tool

class WokwiToolIntegration {
    constructor(containerId = 'wokwi-tool-container') {
        this.containerId = containerId;
        this.isLoaded = false;
    }

    // Load the Wokwi tool into an existing web page
    async loadTool() {
        try {
            // Fetch the HTML content
            const htmlResponse = await fetch('/wokwi_config_tool.html');
            const htmlContent = await htmlResponse.text();

            // Fetch the JavaScript content
            const jsResponse = await fetch('/wokwi_config_tool.js');
            const jsContent = await jsResponse.text();

            // Extract just the body content from the HTML
            const parser = new DOMParser();
            const doc = parser.parseFromString(htmlContent, 'text/html');
            const toolContent = doc.querySelector('.container');

            // Create container if it doesn't exist
            let container = document.getElementById(this.containerId);
            if (!container) {
                container = document.createElement('div');
                container.id = this.containerId;
                container.style.cssText = `
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background: rgba(0,0,0,0.8);
                    z-index: 10000;
                    display: none;
                `;
                document.body.appendChild(container);
            }

            // Add close button
            const closeButton = document.createElement('button');
            closeButton.innerHTML = '✕';
            closeButton.style.cssText = `
                position: absolute;
                top: 20px;
                right: 20px;
                background: #e74c3c;
                color: white;
                border: none;
                border-radius: 50%;
                width: 40px;
                height: 40px;
                font-size: 20px;
                cursor: pointer;
                z-index: 10001;
            `;
            closeButton.onclick = () => this.hideTool();

            // Clear container and add content
            container.innerHTML = '';
            container.appendChild(closeButton);
            container.appendChild(toolContent);

            // Execute the JavaScript
            const script = document.createElement('script');
            script.textContent = jsContent;
            document.head.appendChild(script);

            this.isLoaded = true;
            console.log('Wokwi Configuration Tool loaded successfully');

        } catch (error) {
            console.error('Error loading Wokwi tool:', error);
            throw error;
        }
    }

    // Show the tool
    showTool() {
        if (!this.isLoaded) {
            this.loadTool().then(() => {
                this.showTool();
            });
            return;
        }

        const container = document.getElementById(this.containerId);
        if (container) {
            container.style.display = 'block';
            document.body.style.overflow = 'hidden';
        }
    }

    // Hide the tool
    hideTool() {
        const container = document.getElementById(this.containerId);
        if (container) {
            container.style.display = 'none';
            document.body.style.overflow = 'auto';
        }
    }

    // Toggle the tool visibility
    toggleTool() {
        const container = document.getElementById(this.containerId);
        if (container && container.style.display === 'block') {
            this.hideTool();
        } else {
            this.showTool();
        }
    }

    // Add a button to launch the tool
    addLaunchButton(parentSelector = 'body', buttonText = '🔧 Configure Wokwi') {
        const parent = document.querySelector(parentSelector);
        if (!parent) {
            console.error('Parent element not found:', parentSelector);
            return;
        }

        const button = document.createElement('button');
        button.innerHTML = buttonText;
        button.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: linear-gradient(45deg, #3498db, #2980b9);
            color: white;
            border: none;
            border-radius: 25px;
            padding: 12px 20px;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            box-shadow: 0 4px 15px rgba(0,0,0,0.2);
            transition: all 0.3s ease;
            z-index: 9999;
        `;

        button.onmouseover = () => {
            button.style.transform = 'translateY(-2px)';
            button.style.boxShadow = '0 6px 20px rgba(0,0,0,0.3)';
        };

        button.onmouseout = () => {
            button.style.transform = 'translateY(0)';
            button.style.boxShadow = '0 4px 15px rgba(0,0,0,0.2)';
        };

        button.onclick = () => this.showTool();
        parent.appendChild(button);

        return button;
    }
}

// Express.js middleware for serving the tool
class WokwiToolServer {
    static middleware(options = {}) {
        const { basePath = '/wokwi-tool' } = options;

        return (req, res, next) => {
            if (req.path.startsWith(basePath)) {
                // Serve the tool files
                const filePath = req.path.replace(basePath, '');

                if (filePath === '' || filePath === '/') {
                    // Serve the HTML file
                    res.sendFile(path.join(__dirname, 'wokwi_config_tool.html'));
                } else if (filePath === '/wokwi_config_tool.js') {
                    // Serve the JavaScript file
                    res.sendFile(path.join(__dirname, 'wokwi_config_tool.js'));
                } else {
                    next();
                }
            } else {
                next();
            }
        };
    }

    // Socket.io integration for real-time configuration updates
    static setupSocketIO(io) {
        io.on('connection', (socket) => {
            console.log('Wokwi tool client connected');

            socket.on('save-wokwi-config', (data) => {
                // Save wokwi.toml file
                const fs = require('fs');
                const path = require('path');

                try {
                    fs.writeFileSync('wokwi.toml', data.wokwiConfig);
                    fs.writeFileSync('diagram.json', JSON.stringify(data.diagramConfig, null, 2));

                    socket.emit('config-saved', { success: true });
                    console.log('Wokwi configuration saved successfully');
                } catch (error) {
                    socket.emit('config-saved', { success: false, error: error.message });
                    console.error('Error saving Wokwi configuration:', error);
                }
            });

            socket.on('load-wokwi-config', () => {
                // Load existing configuration
                const fs = require('fs');

                try {
                    const wokwiConfig = fs.existsSync('wokwi.toml')
                        ? fs.readFileSync('wokwi.toml', 'utf8')
                        : '';

                    const diagramConfig = fs.existsSync('diagram.json')
                        ? JSON.parse(fs.readFileSync('diagram.json', 'utf8'))
                        : null;

                    socket.emit('config-loaded', {
                        success: true,
                        wokwiConfig,
                        diagramConfig
                    });
                } catch (error) {
                    socket.emit('config-loaded', {
                        success: false,
                        error: error.message
                    });
                }
            });
        });
    }
}

// Usage examples:

// 1. Simple integration
/*
const wokwiTool = new WokwiToolIntegration();
wokwiTool.addLaunchButton();
*/

// 2. Integration with existing UI
/*
const wokwiTool = new WokwiToolIntegration('my-wokwi-container');
document.getElementById('configure-btn').onclick = () => wokwiTool.showTool();
*/

// 3. Express.js integration
/*
const express = require('express');
const app = express();

app.use('/tools', WokwiToolServer.middleware({ basePath: '/tools/wokwi' }));
*/

// 4. Socket.io integration
/*
const io = require('socket.io')(server);
WokwiToolServer.setupSocketIO(io);
*/

// Export for use in Node.js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { WokwiToolIntegration, WokwiToolServer };
}

// Auto-initialize if loaded in browser
if (typeof window !== 'undefined') {
    window.WokwiToolIntegration = WokwiToolIntegration;

    // Auto-add launch button if data attribute is present
    document.addEventListener('DOMContentLoaded', () => {
        if (document.querySelector('[data-wokwi-tool="auto"]')) {
            const tool = new WokwiToolIntegration();
            tool.addLaunchButton();
        }
    });
}
