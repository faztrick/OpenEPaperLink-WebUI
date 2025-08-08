# Wokwi Configuration Tool

A comprehensive web-based tool for configuring Wokwi simulation and circuit diagrams for ESP32 projects.

## 🚀 Features

### Wokwi Configuration (`wokwi.toml`)
- **Board Type Selection**: ESP32, ESP32-S2, ESP32-S3, ESP32-C3, ESP32-C6
- **Flash Configuration**: Size, mode, frequency settings
- **PSRAM Configuration**: Size and mode selection
- **USB CDC Configuration**: Enable/disable USB CDC with mode selection
- **Build Paths**: Firmware binary and ELF file paths
- **Debug Configuration**: GDB server port settings

### Circuit Diagram Configuration (`diagram.json`)
- **Visual Component Selection**: Choose from a library of common components
  - LEDs (Red, Green, Blue)
  - Resistors (220Ω, 1kΩ, 10kΩ)
  - Push Buttons
  - Potentiometers
  - Buzzers
  - Sensors (DHT22, HC-SR04, Photoresistor)
  - Displays (LCD 16x2, OLED SSD1306)
  - Motors (Servo)
  - NeoPixel Rings
- **Connection Builder**: Drag-and-drop style connection management
- **Board Configuration**: Automatic board attribute configuration
- **Real-time Preview**: Live JSON preview of the diagram

### Advanced Features
- **Template System**: Export and import project templates
- **Configuration Validation**: Pin validation for different board types
- **Live Preview**: Real-time configuration preview
- **File Download**: Direct download of generated configuration files
- **Responsive Design**: Works on desktop and mobile devices

## 📁 Files

- `wokwi_config_tool.html` - Main HTML interface
- `wokwi_config_tool.js` - JavaScript application logic
- `launch_wokwi_tool.ps1` - PowerShell launcher script
- `README_WOKWI_TOOL.md` - This documentation file

## 🖥️ Usage

### Quick Start

1. **Launch the tool**:
   ```powershell
   .\launch_wokwi_tool.ps1
   ```

2. **Configure your project**:
   - Switch between "Wokwi Config" and "Diagram Config" tabs
   - Adjust board settings, flash configuration, and PSRAM settings
   - Select components for your circuit diagram
   - Add connections between components

3. **Generate and download**:
   - Click "Generate Configurations" to update previews
   - Click "Download Files" to get `wokwi.toml` and `diagram.json`

### Advanced Usage

#### Custom Port
```powershell
.\launch_wokwi_tool.ps1 -Port 3000
```

#### Load Existing Configuration
- Click "Load Existing" to populate the form with current project settings
- The tool will attempt to parse existing `wokwi.toml` and `diagram.json` files

#### Template Management
- **Export Template**: Save current configuration as a reusable template
- **Import Template**: Load a previously saved template

#### Component Selection
1. Browse the "Available Components" grid
2. Click components to add them to your diagram
3. Selected components will be highlighted in green
4. Click again to remove components

#### Connection Management
1. Use the "Connections" section to wire components
2. Format: `component_id:pin` (e.g., `esp:GPIO2`, `led1:A`)
3. Add color names for visual clarity in the simulation
4. Remove connections with the ✕ button

## 🔧 Configuration Examples

### Basic LED Circuit
```
Wokwi Config:
- Board: ESP32-S3
- Flash: 32MB, QIO mode, 80MHz
- PSRAM: 8MB, OPI mode

Diagram:
- Components: Red LED, 220Ω Resistor
- Connections:
  - esp:GPIO2 → resistor:1
  - resistor:2 → led:A
  - led:C → esp:GND
```

### Sensor Project
```
Components: DHT22, OLED Display, Push Button
Connections:
- esp:GPIO4 → dht22:SDA
- esp:GPIO21 → oled:SDA
- esp:GPIO22 → oled:SCL
- esp:GPIO0 → button:1A
```

## 🛠️ Technical Details

### Supported Board Types
- `esp32s3` - ESP32-S3 (default)
- `esp32` - ESP32
- `esp32c3` - ESP32-C3
- `esp32c6` - ESP32-C6
- `esp32s2` - ESP32-S2

### Flash Sizes
- 4MB, 8MB, 16MB, 32MB

### Flash Modes
- QIO (Quad I/O) - Recommended
- QOUT (Quad Output)
- DIO (Dual I/O)
- DOUT (Dual Output)

### PSRAM Options
- Sizes: 2MB, 4MB, 8MB, 16MB
- Modes: OPI OPI, Quad Quad, Disabled

### Component Library
The tool includes a comprehensive library of Wokwi-compatible components:

#### Basic Components
- LEDs (multiple colors)
- Resistors (common values)
- Push buttons
- Potentiometers
- Buzzers

#### Sensors
- DHT22 (Temperature/Humidity)
- HC-SR04 (Ultrasonic Distance)
- Photoresistor (Light Sensor)

#### Displays
- LCD 16x2 Character Display
- SSD1306 OLED Display (128x64)

#### Advanced Components
- Servo Motors
- NeoPixel LED Rings

## 🚨 Requirements

### Server Requirements (for launcher)
One of the following:
- **Python 3.x** (recommended)
- **Node.js** (alternative)
- **PowerShell 5.1+** (Windows fallback)

### Browser Requirements
- Modern web browser with JavaScript enabled
- Chrome, Firefox, Safari, or Edge (latest versions)

## 📝 File Formats

### wokwi.toml
```toml
[wokwi]
version = 1
firmware = 'OutdoorAP/firmware.bin'
elf = 'OutdoorAP/firmware.elf'
gdbServerPort = 3333
type = "esp32s3"

[esp32s3]
psram = "opi_opi"
flashSize = "32MB"
psramSize = "8MB"
flashMode = "qio"
flashFreq = "80m"

[usb]
cdc = true
mode = 1
```

### diagram.json
```json
{
  "version": 1,
  "author": "Your Name",
  "editor": "wokwi",
  "parts": [
    {
      "type": "board-esp32-s3-devkitc-1",
      "id": "esp",
      "attrs": {
        "flashMode": "qio",
        "flashSize": "32MB",
        "psramMode": "opi_opi",
        "psramSize": "8MB"
      }
    }
  ],
  "connections": [
    ["esp:TX", "$serialMonitor:RX", ""],
    ["esp:RX", "$serialMonitor:TX", ""]
  ]
}
```

## 🐛 Troubleshooting

### Server Won't Start
1. **Check Python installation**:
   ```powershell
   python --version
   ```

2. **Check Node.js installation**:
   ```powershell
   node --version
   ```

3. **Use alternative port**:
   ```powershell
   .\launch_wokwi_tool.ps1 -Port 8081
   ```

### Browser Issues
- Clear browser cache
- Disable browser extensions
- Try incognito/private browsing mode

### Configuration Issues
- Verify pin names match your board type
- Check component IDs are unique
- Ensure connection format is correct (`component:pin`)

## 🔗 Integration

### PlatformIO Integration
The tool generates configurations compatible with PlatformIO projects. Place the generated files in your project root:

```
your-project/
├── src/
├── platformio.ini
├── wokwi.toml          # Generated by tool
└── diagram.json        # Generated by tool
```

### VS Code Integration
Works seamlessly with the Wokwi VS Code extension:
1. Install the Wokwi extension
2. Generate configurations with this tool
3. Use `Ctrl+Shift+P` → "Wokwi: Start Simulator"

## 📚 Resources

- [Wokwi Documentation](https://docs.wokwi.com/)
- [ESP32 Pin Reference](https://docs.espressif.com/projects/esp-idf/en/latest/esp32s3/hw-reference/index.html)
- [PlatformIO Documentation](https://docs.platformio.org/)

## 🤝 Contributing

To extend the tool:

1. **Add new components**: Modify the `availableComponents` array in `wokwi_config_tool.js`
2. **Add board types**: Update the board type options and pin mappings
3. **Enhance validation**: Extend the `WokwiUtils.validatePinConnections()` function

## 📄 License

This tool is part of the OpenEPaperLink project. Please refer to the main project license for terms of use.
