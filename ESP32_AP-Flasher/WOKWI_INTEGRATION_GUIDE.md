# Wokwi Integration with ESP32 Development UI

## 🎉 **Integration Complete!**

The Wokwi Configuration Tool has been successfully integrated into your ESP32 Development UI. Here's how to use it:

## 🚀 **Quick Start**

### **Access the Tool**
1. Open your ESP32 Development UI at: `http://localhost:3000`
2. Look for the **"Wokwi Configuration"** button in the Project Tools section
3. Click it to open the integrated Wokwi tool

### **Features Added**

#### **🔧 Main Web UI Integration**
- ✅ **New Wokwi Configuration Button** - Access tool directly from main UI
- ✅ **Modal Integration** - Tool opens in a popup modal within the main interface
- ✅ **Backend Connectivity** - Configurations are automatically saved to your project
- ✅ **Real-time Updates** - Changes are synchronized across all connected clients

#### **📡 Backend API Endpoints**
- `GET /api/wokwi/config` - Load existing configurations
- `POST /api/wokwi/config` - Save new configurations
- `GET /api/wokwi/validate` - Validate existing files
- `GET /wokwi_config_tool.html` - Access standalone tool

#### **⚡ Socket.io Real-time Features**
- Live configuration updates
- Multi-client synchronization
- Connection status monitoring

## 🎯 **How to Use**

### **1. Open the Tool**
```
ESP32 Dev UI → Project Tools → Wokwi Configuration
```

### **2. Configure Your Simulation**
- **Board Settings**: Select ESP32 variant, flash size, PSRAM settings
- **Firmware Paths**: Set paths to your compiled binaries
- **USB/Debug**: Configure CDC and GDB debug ports

### **3. Design Your Circuit**
- **Select Components**: Click components from the library to add them
- **Add Connections**: Use the connection builder to wire components
- **Real-time Preview**: See JSON output as you build

### **4. Save & Use**
- **Auto-save**: Configurations automatically save to your project
- **Download**: Get `wokwi.toml` and `diagram.json` files
- **Validate**: Check files are properly formatted

## 📁 **Generated Files**

The tool creates these files in your project root:
```
ESP32_AP-Flasher/
├── wokwi.toml          # Simulation configuration
├── diagram.json        # Circuit diagram
└── web-ui/
    └── public/
        ├── wokwi_config_tool.html
        ├── wokwi_config_tool.js
        └── wokwi_backend_integration.js
```

## 🔌 **Integration Points**

### **Server.js Enhancements**
```javascript
// New endpoints added:
app.get('/api/wokwi/config', ...)      // Load config
app.post('/api/wokwi/config', ...)     // Save config
app.get('/api/wokwi/validate', ...)    // Validate files

// Socket events:
socket.on('wokwi-save-config', ...)
socket.on('wokwi-load-config', ...)
```

### **Frontend Integration**
```javascript
// New methods in ESP32DevUI class:
showWokwiConfig()           // Open modal
loadWokwiTool()            // Load iframe
saveWokwiConfig()          // Save to backend
validateWokwiConfig()      // Validate files
```

## 🎨 **UI Enhancements**

### **New Button in Project Tools**
- Prominent "Wokwi Configuration" button
- "NEW" badge to highlight the feature
- Microchip icon for easy identification

### **Modal Interface**
- Large, responsive modal (95% viewport width)
- Embedded iframe for seamless integration
- Loading spinner with error handling
- Close button for easy navigation

### **Status Integration**
- Console messages for save/load operations
- Real-time validation feedback
- Error handling and user notifications

## 🚀 **Advanced Features**

### **Template System**
- Export project configurations as templates
- Import existing templates
- Share configurations between projects

### **Validation Engine**
- Real-time file validation
- Pin compatibility checking
- Component connection validation

### **Multi-Client Support**
- Real-time synchronization
- Collaborative editing
- Conflict resolution

## 🔧 **Configuration Examples**

### **Basic ESP32-S3 Setup**
```toml
[wokwi]
version = 1
firmware = 'OutdoorAP/firmware.bin'
elf = 'OutdoorAP/firmware.elf'
type = "esp32s3"

[esp32s3]
flashSize = "32MB"
psramSize = "8MB"
flashMode = "qio"
```

### **Simple LED Circuit**
```json
{
  "parts": [
    {
      "type": "board-esp32-s3-devkitc-1",
      "id": "esp"
    },
    {
      "type": "wokwi-led",
      "id": "led1",
      "attrs": { "color": "red" }
    },
    {
      "type": "wokwi-resistor",
      "id": "r1",
      "attrs": { "value": "220" }
    }
  ],
  "connections": [
    ["esp:GPIO2", "r1:1", ""],
    ["r1:2", "led1:A", ""],
    ["led1:C", "esp:GND", ""]
  ]
}
```

## 🛠️ **Troubleshooting**

### **Tool Won't Load**
- Check server is running on port 3000
- Verify files are in web-ui/public directory
- Check browser console for errors

### **Configuration Won't Save**
- Ensure backend server is running
- Check network connectivity
- Verify API endpoints are responding

### **Validation Errors**
- Check file format (TOML/JSON syntax)
- Verify required fields are present
- Ensure pin connections are valid for board type

## 📚 **Next Steps**

1. **Try the Tool**: Open the development UI and test the integration
2. **Create a Circuit**: Design a simple LED blink circuit
3. **Run Simulation**: Use the generated files with Wokwi VS Code extension
4. **Share Templates**: Export your configurations for reuse

## 🎯 **Quick Test**

To verify everything works:

1. **Start the server**: `cd web-ui && npm start`
2. **Open browser**: Navigate to `http://localhost:3000`
3. **Click Wokwi button**: Should open the configuration tool
4. **Configure a simple circuit**: Add LED + resistor
5. **Save configuration**: Should see success message in console
6. **Check files**: Verify `wokwi.toml` and `diagram.json` are created

---

**🎉 Congratulations!** Your ESP32 Development UI now includes a fully integrated Wokwi Configuration Tool. This powerful combination gives you everything needed to develop, simulate, and deploy ESP32 projects efficiently.

For questions or issues, check the console output or server logs for detailed error information.
