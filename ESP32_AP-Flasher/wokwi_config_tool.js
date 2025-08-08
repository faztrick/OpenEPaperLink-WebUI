// Wokwi Configuration Tool JavaScript
class WokwiConfigTool {
    constructor() {
        this.currentConfig = {
            wokwi: {},
            diagram: {
                version: 1,
                author: "Uri Shaked",
                editor: "wokwi",
                parts: [],
                connections: []
            }
        };

        this.selectedComponents = [];
        this.connectionCounter = 0;

        this.initializeComponents();
        this.initializeEventListeners();
        this.generateConfigs();
    }

    initializeComponents() {
        this.availableComponents = [
            {
                id: 'led-red',
                type: 'wokwi-led',
                name: 'Red LED',
                description: 'Standard red LED',
                attrs: { color: 'red' }
            },
            {
                id: 'led-green',
                type: 'wokwi-led',
                name: 'Green LED',
                description: 'Standard green LED',
                attrs: { color: 'green' }
            },
            {
                id: 'led-blue',
                type: 'wokwi-led',
                name: 'Blue LED',
                description: 'Standard blue LED',
                attrs: { color: 'blue' }
            },
            {
                id: 'resistor-220',
                type: 'wokwi-resistor',
                name: '220Ω Resistor',
                description: 'Current limiting resistor',
                attrs: { value: '220' }
            },
            {
                id: 'resistor-1k',
                type: 'wokwi-resistor',
                name: '1kΩ Resistor',
                description: 'Pull-up/pull-down resistor',
                attrs: { value: '1000' }
            },
            {
                id: 'resistor-10k',
                type: 'wokwi-resistor',
                name: '10kΩ Resistor',
                description: 'High value resistor',
                attrs: { value: '10000' }
            },
            {
                id: 'button',
                type: 'wokwi-pushbutton',
                name: 'Push Button',
                description: 'Momentary push button',
                attrs: {}
            },
            {
                id: 'potentiometer',
                type: 'wokwi-potentiometer',
                name: 'Potentiometer',
                description: 'Variable resistor',
                attrs: { value: '50000' }
            },
            {
                id: 'buzzer',
                type: 'wokwi-buzzer',
                name: 'Buzzer',
                description: 'Piezo buzzer',
                attrs: {}
            },
            {
                id: 'dht22',
                type: 'wokwi-dht22',
                name: 'DHT22',
                description: 'Temperature & humidity sensor',
                attrs: {}
            },
            {
                id: 'servo',
                type: 'wokwi-servo',
                name: 'Servo Motor',
                description: 'Standard servo motor',
                attrs: {}
            },
            {
                id: 'ultrasonic',
                type: 'wokwi-hc-sr04',
                name: 'HC-SR04',
                description: 'Ultrasonic distance sensor',
                attrs: {}
            },
            {
                id: 'lcd1602',
                type: 'wokwi-lcd1602',
                name: 'LCD 16x2',
                description: '16x2 character LCD',
                attrs: {}
            },
            {
                id: 'oled',
                type: 'wokwi-ssd1306',
                name: 'OLED Display',
                description: '128x64 OLED display',
                attrs: {}
            },
            {
                id: 'neopixel',
                type: 'wokwi-neopixel-ring',
                name: 'NeoPixel Ring',
                description: 'RGB LED ring',
                attrs: { neopixels: '12' }
            },
            {
                id: 'photoresistor',
                type: 'wokwi-photoresistor-sensor',
                name: 'Photoresistor',
                description: 'Light dependent resistor',
                attrs: {}
            }
        ];

        this.renderComponents();
    }

    renderComponents() {
        const grid = document.getElementById('components-grid');
        grid.innerHTML = '';

        this.availableComponents.forEach(component => {
            const card = document.createElement('div');
            card.className = 'component-card';
            card.dataset.componentId = component.id;

            card.innerHTML = `
                <div class="component-name">${component.name}</div>
                <div class="component-description">${component.description}</div>
            `;

            card.addEventListener('click', () => this.toggleComponent(component));
            grid.appendChild(card);
        });
    }

    toggleComponent(component) {
        const card = document.querySelector(`[data-component-id="${component.id}"]`);
        const index = this.selectedComponents.findIndex(c => c.id === component.id);

        if (index === -1) {
            // Add component
            this.selectedComponents.push({
                ...component,
                id: `${component.id}-${Date.now()}`
            });
            card.classList.add('selected');
        } else {
            // Remove component
            this.selectedComponents.splice(index, 1);
            card.classList.remove('selected');
        }

        this.generateConfigs();
    }

    initializeEventListeners() {
        // Tab switching for main tabs
        document.querySelectorAll('.tab[data-tab]').forEach(tab => {
            tab.addEventListener('click', () => {
                const tabName = tab.dataset.tab;
                this.switchTab(tabName);
            });
        });

        // Tab switching for preview tabs
        document.querySelectorAll('.tab[data-preview]').forEach(tab => {
            tab.addEventListener('click', () => {
                const previewName = tab.dataset.preview;
                this.switchPreview(previewName);
            });
        });

        // Form input listeners
        const inputs = document.querySelectorAll('input, select');
        inputs.forEach(input => {
            input.addEventListener('change', () => this.generateConfigs());
            input.addEventListener('input', () => this.generateConfigs());
        });

        // Add initial connection
        this.addConnection();
    }

    switchTab(tabName) {
        // Switch main tabs
        document.querySelectorAll('.tab[data-tab]').forEach(tab => {
            tab.classList.remove('active');
        });
        document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');

        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
        });
        document.getElementById(`${tabName}-tab`).classList.add('active');
    }

    switchPreview(previewName) {
        // Switch preview tabs
        document.querySelectorAll('.tab[data-preview]').forEach(tab => {
            tab.classList.remove('active');
        });
        document.querySelector(`[data-preview="${previewName}"]`).classList.add('active');

        document.querySelectorAll('#wokwi-preview, #diagram-preview').forEach(content => {
            content.classList.remove('active');
        });
        document.getElementById(`${previewName}-preview`).classList.add('active');
    }

    addConnection() {
        const container = document.getElementById('connections-container');
        const connectionId = `connection-${this.connectionCounter++}`;

        const connectionRow = document.createElement('div');
        connectionRow.className = 'connection-row';
        connectionRow.dataset.connectionId = connectionId;

        connectionRow.innerHTML = `
            <input type="text" class="connection-input" placeholder="From (e.g., esp:GPIO2)" data-type="from">
            <span>→</span>
            <input type="text" class="connection-input" placeholder="To (e.g., led1:A)" data-type="to">
            <input type="text" class="connection-input" placeholder="Wire color (optional)" data-type="color">
            <button type="button" class="remove-connection" onclick="removeConnection('${connectionId}')">✕</button>
        `;

        // Add event listeners for real-time updates
        const inputs = connectionRow.querySelectorAll('input');
        inputs.forEach(input => {
            input.addEventListener('input', () => this.generateConfigs());
        });

        container.appendChild(connectionRow);
        this.generateConfigs();
    }

    removeConnection(connectionId) {
        const connectionRow = document.querySelector(`[data-connection-id="${connectionId}"]`);
        if (connectionRow) {
            connectionRow.remove();
            this.generateConfigs();
        }
    }

    generateConfigs() {
        this.generateWokwiConfig();
        this.generateDiagramConfig();
        this.updatePreviews();
    }

    generateWokwiConfig() {
        const boardType = document.getElementById('board-type').value;
        const firmwarePath = document.getElementById('firmware-path').value;
        const elfPath = document.getElementById('elf-path').value;
        const gdbPort = document.getElementById('gdb-port').value;
        const flashSize = document.getElementById('flash-size').value;
        const psramSize = document.getElementById('psram-size').value;
        const psramMode = document.getElementById('psram-mode').value;
        const flashMode = document.getElementById('flash-mode').value;
        const flashFreq = document.getElementById('flash-freq').value;
        const usbCdc = document.getElementById('usb-cdc').checked;
        const usbMode = document.getElementById('usb-mode').value;

        let config = `# Wokwi Configuration File
# Reference: https://docs.wokwi.com/vscode/project-config
[wokwi]
version = 1
firmware = '${firmwarePath}'
elf = '${elfPath}'
gdbServerPort = ${gdbPort}

type = "${boardType}"

# Match the build configuration
[${boardType}]`;

        if (psramMode !== 'disabled') {
            config += `
psram = "${psramMode}"`;
        }

        config += `
flashSize = "${flashSize}"`;

        if (psramMode !== 'disabled') {
            config += `
psramSize = "${psramSize}"`;
        }

        config += `
flashMode = "${flashMode}"
flashFreq = "${flashFreq}"`;

        if (usbCdc) {
            config += `

# USB configuration to match ARDUINO_USB_CDC_ON_BOOT=1
[usb]
cdc = true
mode = ${usbMode}`;
        }

        this.currentConfig.wokwi = config;
    }

    generateDiagramConfig() {
        const author = document.getElementById('diagram-author').value;
        const mainBoard = document.getElementById('main-board').value;
        const boardType = document.getElementById('board-type').value;
        const flashSize = document.getElementById('flash-size').value;
        const psramSize = document.getElementById('psram-size').value;
        const psramMode = document.getElementById('psram-mode').value;
        const flashMode = document.getElementById('flash-mode').value;

        // Build main board part
        const mainBoardPart = {
            type: mainBoard,
            id: "esp",
            attrs: {
                flashMode: flashMode,
                flashSize: flashSize
            }
        };

        if (psramMode !== 'disabled') {
            mainBoardPart.attrs.psramMode = psramMode;
            mainBoardPart.attrs.psramSize = psramSize;
        }

        // Build parts array
        const parts = [mainBoardPart];

        // Add selected components
        this.selectedComponents.forEach(component => {
            parts.push({
                type: component.type,
                id: component.id,
                attrs: component.attrs
            });
        });

        // Build connections array
        const connections = [];

        // Add default serial monitor connections
        connections.push(
            ["esp:TX", "$serialMonitor:RX", ""],
            ["esp:RX", "$serialMonitor:TX", ""]
        );

        // Add user-defined connections
        const connectionRows = document.querySelectorAll('.connection-row');
        connectionRows.forEach(row => {
            const fromInput = row.querySelector('[data-type="from"]');
            const toInput = row.querySelector('[data-type="to"]');
            const colorInput = row.querySelector('[data-type="color"]');

            if (fromInput.value.trim() && toInput.value.trim()) {
                connections.push([
                    fromInput.value.trim(),
                    toInput.value.trim(),
                    colorInput.value.trim() || ""
                ]);
            }
        });

        this.currentConfig.diagram = {
            version: 1,
            author: author,
            editor: "wokwi",
            parts: parts,
            connections: connections
        };
    }

    updatePreviews() {
        // Update wokwi.toml preview
        document.getElementById('wokwi-content').textContent = this.currentConfig.wokwi;

        // Update diagram.json preview
        document.getElementById('diagram-content').textContent =
            JSON.stringify(this.currentConfig.diagram, null, 2);
    }

    async loadExisting() {
        try {
            // In a real implementation, you would load from the file system
            // For now, we'll show a placeholder
            this.showStatus('Loading existing configuration files would require backend integration.', 'error');

            // Example of loading default configuration
            this.loadDefaultConfig();
        } catch (error) {
            this.showStatus('Error loading existing configuration: ' + error.message, 'error');
        }
    }

    loadDefaultConfig() {
        // Load the existing configuration from the workspace
        document.getElementById('board-type').value = 'esp32s3';
        document.getElementById('firmware-path').value = 'OutdoorAP/firmware.bin';
        document.getElementById('elf-path').value = 'OutdoorAP/firmware.elf';
        document.getElementById('gdb-port').value = '3333';
        document.getElementById('flash-size').value = '32MB';
        document.getElementById('psram-size').value = '8MB';
        document.getElementById('psram-mode').value = 'opi_opi';
        document.getElementById('flash-mode').value = 'qio';
        document.getElementById('flash-freq').value = '80m';
        document.getElementById('usb-cdc').checked = true;
        document.getElementById('usb-mode').value = '1';
        document.getElementById('diagram-author').value = 'Uri Shaked';
        document.getElementById('main-board').value = 'board-esp32-s3-devkitc-1';

        this.generateConfigs();
        this.showStatus('Default configuration loaded successfully!', 'success');
    }

    downloadConfigs() {
        try {
            // Download wokwi.toml
            this.downloadFile('wokwi.toml', this.currentConfig.wokwi);

            // Download diagram.json
            this.downloadFile('diagram.json', JSON.stringify(this.currentConfig.diagram, null, 2));

            this.showStatus('Configuration files downloaded successfully!', 'success');
        } catch (error) {
            this.showStatus('Error downloading files: ' + error.message, 'error');
        }
    }

    downloadFile(filename, content) {
        const element = document.createElement('a');
        element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(content));
        element.setAttribute('download', filename);
        element.style.display = 'none';
        document.body.appendChild(element);
        element.click();
        document.body.removeChild(element);
    }

    showStatus(message, type) {
        const statusDiv = document.getElementById('status-message');
        statusDiv.textContent = message;
        statusDiv.className = `status-message status-${type}`;
        statusDiv.style.display = 'block';

        // Auto-hide after 5 seconds
        setTimeout(() => {
            statusDiv.style.display = 'none';
        }, 5000);
    }

    // Export configuration as a project template
    exportTemplate() {
        const template = {
            name: 'ESP32 Wokwi Project',
            description: 'Generated ESP32 Wokwi simulation project',
            wokwiConfig: this.currentConfig.wokwi,
            diagramConfig: this.currentConfig.diagram,
            timestamp: new Date().toISOString()
        };

        this.downloadFile('wokwi-project-template.json', JSON.stringify(template, null, 2));
        this.showStatus('Project template exported successfully!', 'success');
    }

    // Import configuration from template
    importTemplate(templateData) {
        try {
            const template = JSON.parse(templateData);

            if (template.wokwiConfig) {
                // Parse and load wokwi config
                this.loadWokwiConfigFromString(template.wokwiConfig);
            }

            if (template.diagramConfig) {
                // Load diagram config
                this.loadDiagramConfig(template.diagramConfig);
            }

            this.generateConfigs();
            this.showStatus('Template imported successfully!', 'success');
        } catch (error) {
            this.showStatus('Error importing template: ' + error.message, 'error');
        }
    }

    loadWokwiConfigFromString(configString) {
        // Parse basic wokwi config from string (simplified parser)
        const lines = configString.split('\n');
        lines.forEach(line => {
            if (line.includes('firmware =')) {
                const value = line.split('=')[1].trim().replace(/'/g, '');
                document.getElementById('firmware-path').value = value;
            }
            if (line.includes('elf =')) {
                const value = line.split('=')[1].trim().replace(/'/g, '');
                document.getElementById('elf-path').value = value;
            }
            if (line.includes('gdbServerPort =')) {
                const value = line.split('=')[1].trim();
                document.getElementById('gdb-port').value = value;
            }
            if (line.includes('type =')) {
                const value = line.split('=')[1].trim().replace(/"/g, '');
                document.getElementById('board-type').value = value;
            }
        });
    }

    loadDiagramConfig(diagramConfig) {
        document.getElementById('diagram-author').value = diagramConfig.author || 'Uri Shaked';

        if (diagramConfig.parts && diagramConfig.parts.length > 0) {
            const mainBoard = diagramConfig.parts[0];
            if (mainBoard.type) {
                document.getElementById('main-board').value = mainBoard.type;
            }
        }
    }
}

// Global functions for button handlers
function addConnection() {
    window.wokwiTool.addConnection();
}

function removeConnection(connectionId) {
    window.wokwiTool.removeConnection(connectionId);
}

function generateConfigs() {
    window.wokwiTool.generateConfigs();
}

function loadExisting() {
    window.wokwiTool.loadExisting();
}

function downloadConfigs() {
    window.wokwiTool.downloadConfigs();
}

function exportTemplate() {
    window.wokwiTool.exportTemplate();
}

// Initialize the tool when DOM is loaded
document.addEventListener('DOMContentLoaded', function () {
    window.wokwiTool = new WokwiConfigTool();

    // Add file import handler
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.json';
    fileInput.style.display = 'none';
    fileInput.addEventListener('change', function (e) {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = function (e) {
                window.wokwiTool.importTemplate(e.target.result);
            };
            reader.readAsText(file);
        }
    });
    document.body.appendChild(fileInput);

    // Add import button to button group
    const buttonGroup = document.querySelector('.button-group');
    const importBtn = document.createElement('button');
    importBtn.className = 'btn btn-secondary';
    importBtn.textContent = 'Import Template';
    importBtn.onclick = () => fileInput.click();

    const exportBtn = document.createElement('button');
    exportBtn.className = 'btn btn-secondary';
    exportBtn.textContent = 'Export Template';
    exportBtn.onclick = exportTemplate;

    buttonGroup.appendChild(importBtn);
    buttonGroup.appendChild(exportBtn);
});

// Utility functions for advanced features
class WokwiUtils {
    static validatePinConnections(connections, boardType) {
        // Validate that pin connections are valid for the board type
        const validPins = this.getValidPins(boardType);
        const errors = [];

        connections.forEach((conn, index) => {
            const [from, to] = conn;
            if (from.startsWith('esp:') && !validPins.includes(from.split(':')[1])) {
                errors.push(`Invalid pin ${from} at connection ${index + 1}`);
            }
        });

        return errors;
    }

    static getValidPins(boardType) {
        const pinMaps = {
            'esp32s3': ['GPIO0', 'GPIO1', 'GPIO2', 'GPIO3', 'GPIO4', 'GPIO5', 'GPIO6', 'GPIO7', 'GPIO8', 'GPIO9', 'GPIO10', 'GPIO11', 'GPIO12', 'GPIO13', 'GPIO14', 'GPIO15', 'GPIO16', 'GPIO17', 'GPIO18', 'GPIO19', 'GPIO20', 'GPIO21', 'GPIO26', 'GPIO35', 'GPIO36', 'GPIO37', 'GPIO38', 'GPIO39', 'GPIO40', 'GPIO41', 'GPIO42', 'GPIO43', 'GPIO44', 'GPIO45', 'GPIO46', 'GPIO47', 'GPIO48', 'TX', 'RX', '3V3', 'GND', '5V'],
            'esp32': ['GPIO0', 'GPIO1', 'GPIO2', 'GPIO3', 'GPIO4', 'GPIO5', 'GPIO12', 'GPIO13', 'GPIO14', 'GPIO15', 'GPIO16', 'GPIO17', 'GPIO18', 'GPIO19', 'GPIO21', 'GPIO22', 'GPIO23', 'GPIO25', 'GPIO26', 'GPIO27', 'GPIO32', 'GPIO33', 'GPIO34', 'GPIO35', 'GPIO36', 'GPIO39', 'TX', 'RX', '3V3', 'GND', '5V'],
            'esp32c3': ['GPIO0', 'GPIO1', 'GPIO2', 'GPIO3', 'GPIO4', 'GPIO5', 'GPIO6', 'GPIO7', 'GPIO8', 'GPIO9', 'GPIO10', 'GPIO18', 'GPIO19', 'GPIO20', 'GPIO21', 'TX', 'RX', '3V3', 'GND', '5V']
        };

        return pinMaps[boardType] || [];
    }

    static generatePlatformIOConfig(wokwiConfig) {
        // Generate corresponding PlatformIO configuration
        return `
[env:wokwi]
platform = espressif32
board = esp32-s3-devkitc-1
framework = arduino
monitor_speed = 115200
board_build.arduino.memory_type = ${wokwiConfig.psramMode !== 'disabled' ? 'opi_opi' : 'qio_qspi'}
board_build.flash_size = ${wokwiConfig.flashSize}
board_build.flash_mode = ${wokwiConfig.flashMode}
board_build.flash_freq = ${wokwiConfig.flashFreq}
`;
    }
}

// Export for potential Node.js usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { WokwiConfigTool, WokwiUtils };
}
