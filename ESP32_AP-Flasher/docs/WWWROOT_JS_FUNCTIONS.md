# WWWROOT JavaScript Files and Functions

## Overview
This document lists all JavaScript files in the `wwwroot` directory and their functions. These are the essential firmware UI files served directly by the ESP32.

---

## 📁 **api-manager.js** - API Management System
*Handles all API interactions with caching, retry logic, and performance optimization*

### Class: APIManager
- `constructor()` - Initialize API manager with endpoints and configurations
- `initializeWebSocket()` - Initialize WebSocket connection with auto-reconnection
- `handleWebSocketMessage(data)` - Handle incoming WebSocket messages
- `async fetch(endpointName, options)` - Generic fetch method with caching and retry
- `async makeRequest(url, options)` - Make HTTP request with timeout
- `async batch(requests)` - Batch multiple API requests
- `async getConfig()` - Get system configuration with caching
- `async getTagDB(pos, limit)` - Get tag database with pagination
- `async sendTagCommand(mac, command, data)` - Send tag command
- `async saveConfig(config)` - Save system configuration
- `async uploadFile(filename, content)` - Upload file to LittleFS
- `invalidateCache(endpointName)` - Invalidate cache for specific endpoint
- `clearCache()` - Clear all cache
- `getCacheKey(endpoint, options)` - Generate cache key
- `delay(ms)` - Delay utility
- `emit(event, data)` - Simple event emitter
- `on(event, callback)` - Add event listener
- `off(event, callback)` - Remove event listener
- `getCacheStats()` - Get cache statistics
- `getConnectionStatus()` - Get connection status

---

## 📁 **setup.js** - WiFi Setup and Configuration
*Handles initial ESP32 setup, WiFi configuration, and network scanning*

### Functions:
- `showStatus(elementId, message, type)` - Display status messages with styling
- `pad(text, count)` - Pad text with spaces for formatting
- `getSsidList()` - Get list of available WiFi networks
- `tryFallbackScan()` - Fallback WiFi scan method when primary fails
- `formatSignalStrength(rssi)` - Format RSSI signal strength
- `formatSecurity(encType)` - Format security type display
- `getSecurityType(encType)` - Get security type from encryption type
- `resetScanButton()` - Reset scan button to default state

### Event Handlers:
- WiFi configuration save
- Network scanning
- SSID selection
- Status updates

---

## 📁 **ota.js** - Over-The-Air Updates
*Manages firmware updates, file system updates, and C6 module updates*

### Export Functions:
- `async initUpdate()` - Initialize update system and check versions
- `updateAll(binUrl, fileUrl, tagname)` - Update both firmware and filesystem
- `async updateWebpage(fileUrl, tagname, showReload)` - Update web filesystem
- `async updateESP(fileUrl, showConfirm)` - Update ESP32 firmware
- `async updateC6H2(Url)` - Update C6/H2 module firmware
- `print(line, color)` - Print colored output to console
- `reboot()` - Reboot the system

### Internal Functions:
- `formatEpoch(epochTime)` - Format epoch time to readable date
- `formatDateTime(utcDateString)` - Format UTC date string
- `disableButtons(active)` - Disable/enable buttons during operations
- `async fetchAndCheckTagtypes(cleanup)` - Fetch and verify tag types
- `normalizeVersion(version)` - Normalize version strings for comparison
- `addRepositorySuggestions()` - Add repository suggestions to UI
- `highlightSelectedSuggestion(selectedDiv)` - Highlight selected repository

### Event Handlers:
- Rollback button click
- Update tag type button click
- Repository selection
- Confirmation dialogs

---

## 📁 **app.js** - Main Application UI
*Core ESP32 development UI with AI integration and project management*

### Class: ESP32DevUI
- Comprehensive development interface
- AI chat integration
- Project status monitoring
- Build system integration

### Global Functions:
- `closeAIChat()` - Close AI chat interface
- `closeAIConfig()` - Close AI configuration
- `closeWokwiConfig()` - Close Wokwi configuration
- `openBuildFolder()` - Open build folder in file explorer

---

## 📁 **flash.js** - Tag Flashing System
*Handles tag firmware flashing via USB and wireless methods*

### Export Functions:
- `cleanup()` - Clean up flash interface
- `async init()` - Initialize flash system
- `wsCmd(command)` - Send WebSocket command
- `print(line, color)` - Print colored output to flash console

### Internal Functions:
- `async uploadFlashFile(file)` - Upload firmware file for flashing
- `disableButtons(active)` - Disable/enable flash buttons
- `async checkTagFW()` - Check tag firmware status

### Event Handlers:
- Auto flash button
- USB flash button
- Power on/off buttons
- File upload handling
- Simple file flash

---

## 📁 **g5decoder.js** - G5 Image Decoder
*Decodes G5 compressed images for e-paper displays*

### Functions:
- `TIFFMOTOLONG(p, ix)` - Utility function for TIFF motor long conversion
- `g5_decode_init(pImage, iWidth, iHeight, pData, iDataSize)` - Initialize G5 decoder
- `G5DrawLine(pPage, pCurFlips, pOut)` - Draw a line in G5 format
- `Decode_Begin(pPage)` - Begin decoding process
- `DecodeLine(pPage)` - Decode a single line
- `processG5(data, width, height)` - Process G5 image data

### Purpose:
- Decode compressed G5 images
- Convert to bitmap format for e-paper displays
- Handle TIFF-based compression

---

## 📁 **c6_module.js** - C6 Module Management
*Comprehensive C6/H2 module firmware management and configuration*

### Functions:
- `async loadCurrentFirmware()` - Load current firmware information
- `showTab(tabName, targetElement)` - Show specific tab in module interface
- `async loadModuleInfo()` - Load module information and status
- `findC6Module(apList)` - Find C6 module in AP list
- `updateModuleStatus(status, text)` - Update module status display
- `updateModuleInfo(moduleData)` - Update module information display
- `async refreshModuleInfo()` - Refresh module information
- `async loadAvailableVersions()` - Load available firmware versions
- `updateSourceChanged()` - Handle update source change
- `validateFirmwareFile()` - Validate selected firmware file
- `clearFileSelection()` - Clear file selection
- `async startFirmwareUpdate()` - Start firmware update process
- `async updateFromOnline(source)` - Update from online source
- `async updateFromLocalFile()` - Update from local file
- `async createFirmwareBackup()` - Create firmware backup
- `async updateToVersion(version, downloadUrl)` - Update to specific version
- `async monitorUpdateProgress()` - Monitor update progress
- `async verifyFirmware()` - Verify firmware after update
- `async loadSettings()` - Load C6 module settings

### Features:
- Firmware version management
- Online and local file updates
- Backup and restore
- Progress monitoring
- Settings configuration

---

## 🔗 **Dependencies and Integration**

### Global Dependencies:
- **WebSocket** - Real-time communication with ESP32
- **Fetch API** - HTTP requests to backend
- **FormData** - File uploads and form submissions
- **JSON** - Data serialization/deserialization

### Cross-File Integration:
- **api-manager.js** → Used by all other files for API calls
- **setup.js** → Initial configuration, used once during setup
- **ota.js** → System updates, integrated with app.js
- **flash.js** → Tag flashing, standalone module
- **g5decoder.js** → Image processing, used by display functions
- **c6_module.js** → Module management, integrated with main app

### Backend API Endpoints Used:
- `/get_ap_config` - System configuration
- `/get_wifi_config` - WiFi settings
- `/save_wifi_config` - Save WiFi settings
- `/wifi_scan` - WiFi network scanning
- `/sysinfo` - System information
- `/tag_cmd` - Tag commands
- `/update_actions` - Update operations
- `/rollback` - Firmware rollback
- `/backup_db` - Database backup
- `/littlefs_put` - File uploads

---

## 📊 **Statistics**

| File | Functions | Classes | Lines | Purpose |
|------|-----------|---------|-------|---------|
| api-manager.js | 20+ | 1 | 387 | API Management |
| setup.js | 8 | 0 | 415 | WiFi Setup |
| ota.js | 15+ | 0 | 900+ | Updates |
| app.js | 5+ | 1 | 1100+ | Main UI |
| flash.js | 10+ | 0 | 350+ | Tag Flashing |
| g5decoder.js | 7 | 0 | 400+ | Image Decoding |
| c6_module.js | 25+ | 0 | 1000+ | Module Management |

**Total**: ~75+ functions across 7 JavaScript files for essential ESP32 firmware operations.

---
*Generated: August 9, 2025*
*All functions verified and documented*
